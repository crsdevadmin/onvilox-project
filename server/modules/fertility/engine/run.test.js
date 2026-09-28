const test = require('node:test');
const assert = require('node:assert');
const { runEngine } = require('./run');
const { validateCondition } = require('./conditions');
const { factCatalogue } = require('./facts');
const { rules: seed } = require('../rules/seed.json');

const rules = seed.map(r => ({ ...r, version: 1 }));
const ids = p => p.findings.map(f => f.ruleId);
const lab = (analyte, value, lo, hi, d = new Date().toISOString().slice(0, 10)) =>
  ({ analyte, value, ref_low: lo, ref_high: hi, collected_on: d });

// The worked example from the design discussion: 32 y, PCOS, BMI ~31, HbA1c 6.1,
// irregular cycles, IVF planned, low vitamin D, vegetarian, low protein.
const couple = {
  phase: 'F6',
  partners: [
    { id: 'f', sex: 'F', name: 'A', age: 32, labs: [lab('HBA1C', 6.1, 4, 5.6), lab('VITD', 14, 30, 100)],
      assessment: { missing: [], data: { height_cm: 158, weight_kg: 77, cycle_regularity: 'IRREGULAR', dx_pcos: true,
        diet_pattern: 'VEG', protein_g: 40, months_trying: 14, smoking: false, alcohol_units_week: 0, activity_min_week: 60 } } },
    { id: 'm', sex: 'M', name: 'B', age: 36, labs: [],
      assessment: { missing: [], data: { height_cm: 175, weight_kg: 70, sa_conc: 10, sa_prog_motility: 25, sa_morphology: 5,
        sa_volume_ml: 2, sa_total_motility: 50, testosterone_use: false } } },
  ],
};

test('every seeded CONDITION rule has a valid condition', () => {
  const cat = factCatalogue();
  for (const r of seed.filter(x => x.engine_mode === 'CONDITION')) {
    assert.deepStrictEqual(validateCondition(r.condition, cat), [], r.id);
  }
});

test('worked PCOS/IVF example produces the expected findings', () => {
  const out = runEngine(rules, couple);
  const f = out.partners.find(p => p.sex === 'F');
  for (const id of ['NP-01', 'NP-03', 'NP-05', 'NP-06', 'NP-07', 'NP-08', 'NP-11', 'F0-01', 'F0-08', 'F2-02', 'F2-03', 'F2-09', 'F6-01', 'F6-02', 'F0-02'])
    assert.ok(ids(f).includes(id), 'expected ' + id);
  assert.ok(!ids(f).includes('F2-04'), 'no "normal BMI" rule for BMI 31');
  assert.ok(!ids(f).includes('F0-10'), 'F0-only weight rule does not fire in IVF prep');
  assert.ok(!ids(f).includes('G-12'), 'referral-timing rule only runs in F0/F1');
  assert.strictEqual(f.redFlags, 2);  // F0-02 (BMI ≥30 → high-dose folic acid decision) + F2-09 (eating-disorder screen not done)
  assert.strictEqual(f.findings[0].kind, 'RED_FLAG');
  assert.ok(out.draftRulesUsed > 0);
});

test('male: two parameters below WHO limits → M-05 and repeat-analysis prompt', () => {
  const m = runEngine(rules, couple).partners.find(p => p.sex === 'M');
  assert.strictEqual(m.facts.sa_abnormal_count, 2);
  assert.ok(ids(m).includes('M-05') && ids(m).includes('M-02') && !ids(m).includes('M-04'));
});

test('red flag stops formula changes and sorts first', () => {
  const c = structuredClone(couple);
  c.partners[0].labs.push(lab('HBA1C', 7.2, 4, 5.6, '2099-01-01'));
  const out = runEngine(rules, c);
  assert.strictEqual(out.formulaChangesStopped, true);
  const f = out.partners[0].findings;
  assert.ok(f.findIndex(x => x.ruleId === 'RF-02') < f.findIndex(x => x.kind !== 'RED_FLAG'));
});

test('retired rules never run; pregnancy-pending phase switches rule set', () => {
  const r2 = rules.map(r => (r.id === 'F2-02' ? { ...r, status: 'RETIRED' } : r));
  const c = { ...couple, phase: 'F9' };
  const f = runEngine(r2, c).partners[0];
  assert.ok(!ids(f).includes('F2-02'));
  assert.ok(ids(f).includes('F9-02') && ids(f).includes('F9-03'));
  assert.ok(!ids(f).includes('F2-03'), 'no weight-loss rule when pregnancy-pending');
});

test('missing data is reported as a gap, not a finding', () => {
  const c = { phase: 'F0', partners: [{ id: 'x', sex: 'F', name: 'C', age: 30, labs: [], assessment: { missing: [], data: {} } }] };
  const p = runEngine(rules, c).partners[0];
  assert.ok(p.dataGaps.includes('bmi'));
  assert.ok(!ids(p).includes('NP-03'));
});
