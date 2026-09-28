const test = require('node:test');
const assert = require('node:assert');
const { cleanAssessment, missingRequired } = require('./validate');

test('types values and drops unknown keys', () => {
  const { data, errors } = cleanAssessment('F', { height_cm: '160', dx_pcos: 'yes', diet_pattern: 'JAIN', foo: 1 });
  assert.deepStrictEqual(errors, []);
  assert.deepStrictEqual(data, { height_cm: 160, dx_pcos: true, diet_pattern: 'JAIN' });
});

test('rejects out-of-range numbers, bad choices and bad dates', () => {
  const { errors } = cleanAssessment('M', { weight_kg: 900, diet_pattern: 'KETO', sa_date: '2026-13-45' });
  assert.strictEqual(errors.length, 3);
});

test('zero and false are real answers, not missing', () => {
  const miss = missingRequired('F', { prev_pregnancies: 0, smoking: false });
  assert.ok(!miss.includes('Previous pregnancies'));
  assert.ok(!miss.includes('Smokes / uses tobacco'));
  assert.ok(miss.includes('Height'));
});

test('male and female have separate required sets', () => {
  assert.ok(missingRequired('M', {}).includes('Concentration'));
  assert.ok(!missingRequired('F', {}).includes('Concentration'));
});
