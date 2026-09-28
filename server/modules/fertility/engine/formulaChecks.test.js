const test = require('node:test');
const assert = require('node:assert');
const { checkFormula } = require('./formulaChecks');

const ok = { status: 'ACTIVE', missing: [], reviewExpired: false, approval_required: false, is_herbal: false, pregnancy_safety: 'SAFE',
  evidence_level: 'A', veg_ok: true, vegan_ok: true, jain_ok: true, allergens: 'None', interactions: 'None' };
const ING = {
  FA: { ...ok, id: 'FA', name: 'Folic acid', unit: 'µg', max_preconception: 400, max_stimulation: 400, max_pregnancy: 400, upper_limit: 1000 },
  WHEY: { ...ok, id: 'WHEY', name: 'Whey', unit: 'g', max_preconception: 30, max_stimulation: 30, max_pregnancy: 30, upper_limit: null, vegan_ok: false, allergens: 'Milk' },
  INO: { ...ok, id: 'INO', name: 'Myo-inositol', unit: 'mg', max_preconception: 4000, max_stimulation: 0, max_pregnancy: 0, upper_limit: null, evidence_level: 'C', pregnancy_safety: 'UNKNOWN' },
  HERB: { ...ok, id: 'HERB', name: 'Herb X', unit: 'mg', max_preconception: 100, max_stimulation: 100, max_pregnancy: 100, upper_limit: null, is_herbal: true, interactions: 'warfarin' },
};
const codes = c => c.map(x => `${x.level}:${x.code}`);

test('clean formula has no blocks', () => {
  const c = checkFormula({ items: [{ ingredientId: 'FA', dose: 400 }], sex: 'F', phase: 'F6', ingredients: ING, facts: { diet_pattern: 'VEG' } });
  assert.deepStrictEqual(c.filter(x => x.level === 'BLOCK'), []);
});

test('dose above phase max and upper limit are blocked', () => {
  const c = checkFormula({ items: [{ ingredientId: 'FA', dose: 1200 }], sex: 'F', phase: 'F6', ingredients: ING });
  assert.ok(codes(c).includes('BLOCK:IS-02') && codes(c).includes('BLOCK:IS-03'));
});

test('vegan patient cannot get whey; milk allergy blocks', () => {
  assert.ok(codes(checkFormula({ items: [{ ingredientId: 'WHEY', dose: 20 }], sex: 'F', phase: 'F0', ingredients: ING, facts: { diet_pattern: 'VEGAN' } })).includes('BLOCK:IS-04'));
  const c = checkFormula({ items: [{ ingredientId: 'WHEY', dose: 20 }], sex: 'M', phase: 'F0', ingredients: ING, facts: { diet_pattern: 'NONVEG', allergies: 'milk, peanuts' } });
  assert.ok(c.some(x => x.level === 'BLOCK' && /Milk/i.test(x.message)));
});

test('level C needs a reason; 0 = not permitted in stimulation; pregnancy-pending blocks unknown safety', () => {
  assert.ok(codes(checkFormula({ items: [{ ingredientId: 'INO', dose: 2000 }], sex: 'F', phase: 'F2', ingredients: ING })).includes('BLOCK:G-04'));
  assert.ok(codes(checkFormula({ items: [{ ingredientId: 'INO', dose: 2000, reason: 'PCOS, patient request' }], sex: 'F', phase: 'F0', ingredients: ING })).includes('WARN:G-04'));
  assert.ok(codes(checkFormula({ items: [{ ingredientId: 'INO', dose: 2000, reason: 'x' }], sex: 'F', phase: 'F7', ingredients: ING })).includes('BLOCK:IS-02'));
  assert.ok(codes(checkFormula({ items: [{ ingredientId: 'INO', dose: 2000, reason: 'x' }], sex: 'F', phase: 'F9', ingredients: ING })).includes('BLOCK:F9-02'));
});

test('herbal: warning normally, blocked when pregnancy-pending; interaction warning', () => {
  const c = checkFormula({ items: [{ ingredientId: 'HERB', dose: 50 }], sex: 'F', phase: 'F0', ingredients: ING, facts: { medicines: 'Warfarin 5 mg' } });
  assert.ok(codes(c).includes('WARN:G-07') && codes(c).includes('WARN:G-10'));
  assert.ok(codes(checkFormula({ items: [{ ingredientId: 'HERB', dose: 50 }], sex: 'F', phase: 'F9', ingredients: ING })).includes('BLOCK:G-07'));
});

test('open red-flag alerts block approval; male uses preconception limits', () => {
  assert.ok(codes(checkFormula({ items: [{ ingredientId: 'FA', dose: 400 }], sex: 'F', phase: 'F6', ingredients: ING, openAlerts: 1 })).includes('BLOCK:G-05'));
  assert.deepStrictEqual(checkFormula({ items: [{ ingredientId: 'INO', dose: 1000, reason: 'x' }], sex: 'M', phase: 'F7', ingredients: ING }).filter(x => x.level === 'BLOCK'), []);
});
