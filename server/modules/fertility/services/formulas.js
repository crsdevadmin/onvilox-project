// Weekly formulas: built by the clinician from the ingredient master, checked
// against every ingredient-safety rule, approved by the treating doctor, then
// sent to the store as an order. The engine never builds a formula by itself.
const { checkFormula } = require('../engine/formulaChecks');
const { buildFacts } = require('../engine/facts');
const { PHASES } = require('../assessment/fields');

class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; Object.assign(this, extra); } }
const ADMIN = ['ADMIN', 'SUPER_ADMIN'];
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(Date.parse(s));
const TRANSITIONS = { NEW: ['IN_PRODUCTION', 'CANCELLED'], IN_PRODUCTION: ['READY', 'CANCELLED'], READY: ['DISPATCHED', 'CANCELLED'], DISPATCHED: ['DELIVERED'] };

function formulasService(repo, cases, ingredients, alertsRepo, notify) {
  const need = (mod, roles, what) => { if (!ADMIN.includes(mod.role) && !roles.includes(mod.role)) throw new HttpError(403, `Your role cannot ${what}`); };

  function cleanItems(items) {
    if (!Array.isArray(items)) throw new HttpError(400, 'items must be a list');
    return items.slice(0, 40).map(i => ({
      ingredientId: String(i.ingredientId || '').trim().toUpperCase(),
      dose: i.dose === '' || i.dose == null ? null : Number(i.dose),
      reason: String(i.reason || '').trim().slice(0, 300) || undefined,
    }));
  }

  async function evaluate(c, partner, items) {
    const ids = [...new Set(items.map(i => i.ingredientId))];
    const ings = new Map((await ingredients.usableByIds(ids)).map(i => [i.id, i]));
    const { facts } = buildFacts(c, partner);
    const openAlerts = (await alertsRepo.open(c.id)).length;
    const checks = checkFormula({ items, sex: partner.sex, phase: c.phase, facts, ingredients: ings, openAlerts });
    // store name/unit/form on each line so the formula reads the same even if the master changes later
    const lines = items.map(i => { const g = ings.get(i.ingredientId); return g ? { ...i, name: g.name, form: g.form, unit: g.unit } : i; });
    return { checks, lines, ings };
  }

  return {
    async list(user, mod, caseId) { await cases.get(user, mod, caseId); return repo.forCase(caseId); },

    async save(user, mod, caseId, body) {
      need(mod, ['DOCTOR', 'ASSISTANT', 'DIETITIAN'], 'prepare formulas');
      const c = await cases.get(user, mod, caseId);
      const partner = c.partners.find(p => p.id === body.partnerId);
      if (!partner) throw new HttpError(400, 'Choose the partner');
      if (!isDate(body.weekStart)) throw new HttpError(400, 'Enter the week start date');
      if (c.phase === 'CLOSED') throw new HttpError(400, 'The case is closed');
      const { checks, lines } = await evaluate(c, partner, cleanItems(body.items));
      const notes = String(body.notes || '').slice(0, 1000) || null;
      if (body.formulaId) {
        const f = await repo.get(caseId, body.formulaId);
        if (!f || f.status !== 'DRAFT') throw new HttpError(409, 'Only a draft can be edited — start a new version');
        await repo.updateDraft(f.id, body.weekStart, c.phase, lines, notes, checks);
        return { id: f.id, checks };
      }
      return { id: await repo.insert(caseId, partner.id, body.weekStart, c.phase, lines, notes, checks, user.id), checks };
    },

    async approve(user, mod, caseId, formulaId, body) {
      need(mod, ['DOCTOR'], 'approve formulas');
      const c = await cases.get(user, mod, caseId);
      const f = await repo.get(caseId, formulaId);
      if (!f || f.status !== 'DRAFT') throw new HttpError(409, 'Only a draft can be approved');
      if (f.phase !== c.phase) throw new HttpError(409, `The case moved from ${f.phase} to ${c.phase} — save the draft again so it is checked for the new phase`);
      const partner = c.partners.find(p => p.id === f.partner_id);
      const { checks, lines } = await evaluate(c, partner, f.items);          // re-check with today's data
      const blocks = checks.filter(x => x.level === 'BLOCK');
      if (blocks.length) throw new HttpError(400, 'Cannot approve: ' + blocks.map(b => b.message).join('; '), { checks });
      if (checks.some(x => x.level === 'WARN') && !body.acknowledgeWarnings) throw new HttpError(400, 'Confirm you have reviewed every warning', { checks });
      const storeId = await repo.storeForDoctor(c.doctor_id);
      const pregnancyPending = partner.sex === 'F' && c.phase === 'F9';
      const label = {
        caseId: c.id, partnerName: partner.name, sex: partner.sex, age: partner.age, mrn: partner.mrn,
        weekStart: f.week_start, phase: c.phase, phaseLabel: (PHASES.find(p => p.value === c.phase) || {}).label,
        doctor: c.doctor_name, approvedAt: new Date().toISOString(), pregnancyPending,
        items: lines.map(l => ({ name: l.name, form: l.form, dose: l.dose, unit: l.unit })),
        warnings: pregnancyPending ? ['Pregnancy-pending — prepared within pregnancy-safe limits'] : [],
      };
      const done = await repo.approve(f, user.id, String(body.note || '').slice(0, 500) || null, checks, storeId, label);
      if (!done) throw new HttpError(409, 'This formula was changed at the same time — reload');
      if (storeId && notify) {
        const staff = await repo.storeStaff(storeId);
        notify(staff, 'New fertility order', `${partner.name} · week of ${f.week_start} · ${c.phase}`, '/app/fertility/store').catch(() => {});
      }
      return { ...done, storeAssigned: !!storeId };
    },

    async reject(user, mod, caseId, formulaId, body) {
      need(mod, ['DOCTOR'], 'reject formulas');
      await cases.get(user, mod, caseId);
      if (!String(body.note || '').trim()) throw new HttpError(400, 'Give a reason');
      if (!(await repo.reject(formulaId, user.id, String(body.note).slice(0, 500)))) throw new HttpError(409, 'Only a draft can be rejected');
    },

    // ── store ──
    async orders(user, mod, access) {
      if (ADMIN.includes(mod.role)) return repo.orders(undefined);
      need(mod, ['STORE', 'STORE_APPROVER'], 'view store orders');
      if (!access.user.storeId) throw new HttpError(403, 'You are not linked to a store');
      return repo.orders(access.user.storeId);
    },

    async setOrderStatus(user, mod, access, orderId, to) {
      need(mod, ['STORE', 'STORE_APPROVER'], 'update orders');
      const o = await repo.order(orderId);
      if (!o || (!ADMIN.includes(mod.role) && o.store_id !== access.user.storeId)) throw new HttpError(404, 'Order not found');
      if (!(TRANSITIONS[o.status] || []).includes(to)) throw new HttpError(400, `Cannot move an order from ${o.status} to ${to}`);
      if (to === 'CANCELLED' && !['STORE_APPROVER', ...ADMIN].includes(mod.role)) throw new HttpError(403, 'Only a store approver can cancel');
      if (!(await repo.setOrderStatus(orderId, o.status, to, user.id))) throw new HttpError(409, 'The order changed — reload');
    },
  };
}

module.exports = { formulasService };
