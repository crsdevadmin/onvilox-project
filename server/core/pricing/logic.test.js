const test = require('node:test');
const assert = require('node:assert');
const { priceAfterMarkup, finalPrice, priceView } = require('./logic');

test('worked example from the pricing model: 1000 → 40% → 1400 → doctor enters 1900', () => {
  const base = priceAfterMarkup(1000, 40);
  assert.strictEqual(base, 1400);
  assert.deepStrictEqual(finalPrice(base, 1900), { final: 1900, doctorAmount: 500 });
});

test('markup can be any value ≥ 0; final cannot go below the marked-up price', () => {
  assert.strictEqual(priceAfterMarkup(999, 105), 2047.95);
  assert.throws(() => finalPrice(2047.95, 2047), /cannot be below ₹2048/);
  assert.strictEqual(finalPrice(2047.95, 2048).final, 2048);
  assert.throws(() => priceAfterMarkup(1000, -1));
});

test('visibility: store never sees markup/base; doctor never sees store price/markup', () => {
  const o = { price_status: 'APPROVED', store_price: '1000', markup_pct: '40', base_price: '1400', doctor_amount: '500', final_price: '1900' };
  assert.deepStrictEqual(Object.keys(priceView(o, 'store')).sort(), ['final_price', 'price_note', 'price_status', 'store_price']);
  assert.deepStrictEqual(Object.keys(priceView(o, 'doctor')).sort(), ['base_price', 'final_price', 'price_note', 'price_status']);
  assert.strictEqual(priceView(o, 'admin').markup_pct, 40);
});
