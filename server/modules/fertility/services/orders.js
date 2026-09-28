// Fertility store orders: status flow, pricing (shared model in core/pricing),
// batch details and the printable label. What each role sees of the price is
// decided by priceView() — never by the screen.
const { priceAfterMarkup, finalPrice, priceView } = require('../../../core/pricing/logic');

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const ADMIN = ['ADMIN', 'SUPER_ADMIN'];
const STORE = ['STORE', 'STORE_APPROVER'];
const RAW = ['store_price', 'markup_pct', 'base_price', 'doctor_amount', 'final_price', 'price_note', 'price_history', 'doctor_id'];
const TRANSITIONS = { NEW: ['IN_PRODUCTION', 'CANCELLED'], IN_PRODUCTION: ['READY', 'CANCELLED'], READY: ['DISPATCHED', 'CANCELLED'], DISPATCHED: ['DELIVERED'] };
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(Date.parse(s));
const rupees = n => '₹' + Number(n).toLocaleString('en-IN');

function perspective(role) { return ADMIN.includes(role) ? 'admin' : STORE.includes(role) ? 'store' : 'doctor'; }

function ordersService(repo, cases, notify) {
  const view = (o, role) => {
    const out = { ...o, price: priceView(o, perspective(role)) };
    for (const k of RAW) delete out[k];
    if (perspective(role) === 'admin') out.price_history = o.price_history;
    return out;
  };
  const push = (ids, title, body, url) => { if (notify && ids.length) notify(ids, title, body, url).catch(() => {}); };

  async function loadForStore(mod, access, id) {
    const o = await repo.get(id);
    if (!o || (!ADMIN.includes(mod.role) && o.store_id !== access.user.storeId)) throw new HttpError(404, 'Order not found');
    return o;
  }
  const need = (mod, roles, what) => { if (!ADMIN.includes(mod.role) && !roles.includes(mod.role)) throw new HttpError(403, `Your role cannot ${what}`); };
  const who = o => `${o.label.partnerName} · week of ${o.label.weekStart}`;

  return {
    async list(user, mod, access) {
      if (ADMIN.includes(mod.role)) {
        const d = await repo.defaultMarkup();
        return (await repo.list(undefined)).map(o => ({ ...view(o, mod.role), default_markup_pct: d }));
      }
      need(mod, STORE, 'view store orders');
      if (!access.user.storeId) throw new HttpError(403, 'You are not linked to a store');
      return (await repo.list(access.user.storeId)).map(o => view(o, mod.role));
    },

    async forCase(user, mod, caseId) {
      await cases.get(user, mod, caseId);
      const rows = (await repo.forCase(caseId)).map(o => view(o, mod.role));
      if (ADMIN.includes(mod.role)) { const d = await repo.defaultMarkup(); rows.forEach(o => { o.default_markup_pct = d; }); }
      return rows;
    },

    defaultMarkup: () => repo.defaultMarkup(),

    async setStatus(user, mod, access, id, to) {
      need(mod, STORE, 'update orders');
      const o = await loadForStore(mod, access, id);
      if (!(TRANSITIONS[o.status] || []).includes(to)) throw new HttpError(400, `Cannot move an order from ${o.status} to ${to}`);
      if (to === 'IN_PRODUCTION' && o.price_status !== 'APPROVED') throw new HttpError(409, 'Production is blocked until the doctor approves the price');
      if (to === 'READY' && !o.batch_no) throw new HttpError(409, 'Enter the manufacturing date to generate the batch number first');
      if (to === 'CANCELLED' && !['STORE_APPROVER', ...ADMIN].includes(mod.role)) throw new HttpError(403, 'Only a store approver can cancel');
      if (!(await repo.setStatus(id, o.status, to, user.id))) throw new HttpError(409, 'The order changed — reload');
    },

    // 1. Store enters its price (again allowed until the doctor approves).
    async storePrice(user, mod, access, id, price) {
      need(mod, STORE, 'enter the store price');
      const o = await loadForStore(mod, access, id);
      if (!(Number(price) > 0) || Number(price) > 10000000) throw new HttpError(400, 'Enter a valid store price.');
      const ok = await repo.price(id, ['AWAITING_STORE', 'AWAITING_ADMIN', 'AWAITING_DOCTOR'],
        { price_status: 'AWAITING_ADMIN', store_price: Number(price), markup_pct: null, base_price: null, doctor_amount: null, final_price: null, price_note: null },
        { action: 'store_price', price: Number(price) }, user.id);
      if (!ok) throw new HttpError(409, 'The price can no longer be changed (already approved or production started)');
      push(await repo.adminIds(), '💰 Fertility store price — set your markup', `${who(o)}: store price ${rupees(price)}`, '/app/fertility/store');
    },

    // 2. Admin sets the markup % and sends the price to the doctor.
    async markup(user, mod, id, pct) {
      if (!ADMIN.includes(mod.role)) throw new HttpError(403, 'Only an admin can set the markup');
      const o = await repo.get(id);
      if (!o) throw new HttpError(404, 'Order not found');
      if (o.store_price == null) throw new HttpError(409, 'There is no store price yet');
      let base;
      try { base = priceAfterMarkup(o.store_price, pct); } catch (e) { throw new HttpError(400, e.message); }
      const ok = await repo.price(id, ['AWAITING_ADMIN', 'AWAITING_DOCTOR'],
        { price_status: 'AWAITING_DOCTOR', markup_pct: Number(pct), base_price: base, price_note: null }, { action: 'markup', pct: Number(pct) }, user.id);
      if (!ok) throw new HttpError(409, 'There is no store price waiting for your markup');
      push([o.doctor_id], '💰 Price approval needed', `${who(o)}: price ${rupees(base)} is waiting for your approval`, `/app/fertility/${o.case_id}`);
    },

    // 3. Doctor enters the final price (MRP) and approves — or sends it back.
    async doctorPrice(user, mod, id, entered) {
      need(mod, ['DOCTOR'], 'approve the price');
      const o = await repo.get(id);
      if (!o) throw new HttpError(404, 'Order not found');
      if (!ADMIN.includes(mod.role) && o.doctor_id !== user.id) throw new HttpError(403, "This order belongs to another doctor's patient");
      if (o.price_status !== 'AWAITING_DOCTOR') throw new HttpError(409, 'There is no price waiting for your approval');
      let r;
      try { r = finalPrice(o.base_price, entered); } catch (e) { throw new HttpError(400, e.message); }
      const ok = await repo.price(id, ['AWAITING_DOCTOR'], { price_status: 'APPROVED', final_price: r.final, doctor_amount: r.doctorAmount, price_note: null },
        { action: 'approved', final: r.final }, user.id);
      if (!ok) throw new HttpError(409, 'The price changed — reload');
      push(await repo.storeStaff(o.store_id), '✅ Price approved', `${who(o)}: MRP ${rupees(r.final)}. You can start production.`, '/app/fertility/store');
    },

    async sendBack(user, mod, id, note) {
      need(mod, ['DOCTOR'], 'send the price back');
      const o = await repo.get(id);
      if (!o) throw new HttpError(404, 'Order not found');
      if (!ADMIN.includes(mod.role) && o.doctor_id !== user.id) throw new HttpError(403, "This order belongs to another doctor's patient");
      if (!String(note || '').trim()) throw new HttpError(400, 'Write why the price is being sent back');
      const ok = await repo.price(id, ['AWAITING_DOCTOR'], { price_status: 'AWAITING_STORE', price_note: String(note).slice(0, 300) },
        { action: 'sent_back', note: String(note).slice(0, 300) }, user.id);
      if (!ok) throw new HttpError(409, 'There is no price waiting for your approval');
      push(await repo.storeStaff(o.store_id), '↩ Price sent back', `${who(o)}: ${note}`, '/app/fertility/store');
    },

    // Batch: manufacturing date → batch number and expiry (18 months, as Oncology).
    async batch(user, mod, access, id, mfgDate) {
      need(mod, STORE, 'record the batch');
      const o = await loadForStore(mod, access, id);
      if (!['IN_PRODUCTION', 'READY'].includes(o.status)) throw new HttpError(409, 'Start production first');
      if (!isDate(mfgDate)) throw new HttpError(400, 'Enter the manufacturing date');
      const exp = new Date(mfgDate + 'T00:00:00Z'); exp.setUTCMonth(exp.getUTCMonth() + 18);
      return { batchNo: await repo.setBatch(id, o.store_id, mfgDate, exp.toISOString().slice(0, 10), user.id) };
    },

    // Everything printed on the label. Needs an approved price (MRP) and a batch.
    async label(user, mod, access, id) {
      need(mod, STORE, 'print labels');
      const o = await loadForStore(mod, access, id);
      if (o.price_status !== 'APPROVED') throw new HttpError(409, 'The label needs the approved price (MRP)');
      if (!o.batch_no) throw new HttpError(409, 'Generate the batch number first');
      return { ...o.label, orderId: o.id, mrp: Number(o.final_price), batchNo: o.batch_no, mfgDate: o.mfg_date, expDate: o.exp_date,
        store: { name: o.store_name, fssai: o.fssai_number, address: o.store_address } };
    },
  };
}

module.exports = { ordersService };
