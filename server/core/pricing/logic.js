// Shared commercial logic — the GQUENCE product-pricing model, kept separate
// from every clinical engine. Oncology implements the same model inside
// server/index.js; new modules use this file.
//
//   store enters its price → ADMIN sets markup % (default engine_formulas
//   platform_markup_pct, 40; any value ≥ 0) → DOCTOR enters the FINAL price,
//   which is the MRP on the label (never below the marked-up price) → store.
//   Production is blocked until the price is approved.
//
// Visibility: the store sees its own price and the final MRP; the doctor sees
// the marked-up price and the final MRP (never the store price or markup %);
// admins see everything.

const STATUSES = ['AWAITING_STORE', 'AWAITING_ADMIN', 'AWAITING_DOCTOR', 'APPROVED'];
const money = n => Math.round(Number(n) * 100) / 100;

function priceAfterMarkup(storePrice, pct) {
  if (!(Number(storePrice) > 0)) throw new Error('Enter a valid store price.');
  if (!(Number(pct) >= 0) || Number(pct) > 10000) throw new Error('Enter a markup percentage (0 or more).');
  return money(Number(storePrice) * (1 + Number(pct) / 100));
}

/** Final (MRP) in whole rupees; not below the marked-up price. Returns { final, doctorAmount }. */
function finalPrice(basePrice, entered) {
  const f = Number(entered);
  if (!(f > 0) || f > 10000000) throw new Error('Enter a valid final price (₹).');
  const final = Math.round(f);
  if (final < Math.ceil(Number(basePrice))) throw new Error(`The final price cannot be below ₹${Math.ceil(Number(basePrice))}.`);
  return { final, doctorAmount: money(final - Number(basePrice)) };
}

/** Strip price fields a role may not see. perspective: 'store' | 'doctor' | 'admin'. */
function priceView(o, perspective) {
  const base = { price_status: o.price_status || 'AWAITING_STORE', final_price: o.final_price == null ? null : Number(o.final_price), price_note: o.price_note || null };
  if (perspective === 'admin') {
    return { ...base, store_price: num(o.store_price), markup_pct: num(o.markup_pct), base_price: num(o.base_price), doctor_amount: num(o.doctor_amount) };
  }
  if (perspective === 'store') return { ...base, store_price: num(o.store_price) };
  return { ...base, base_price: num(o.base_price) };                     // doctor
}
const num = v => (v == null ? null : Number(v));

module.exports = { STATUSES, money, priceAfterMarkup, finalPrice, priceView };
