// Run: node --test server/
const test = require('node:test');
const assert = require('node:assert');
const { effectiveModules, landingRoute, validateGrant } = require('./logic');

const codes = mods => mods.map(m => m.code).sort();

test('existing user with no rows keeps Oncology (default-on) and no Fertility', () => {
  const m = effectiveModules({ id: 'd1', role: 'DOCTOR' }, [], []);
  assert.deepStrictEqual(codes(m), ['onco']);
  assert.strictEqual(landingRoute({ role: 'DOCTOR' }, m), '/dashboard');
});

test('revoked Oncology is not re-granted by the default', () => {
  const m = effectiveModules({ id: 'd1', role: 'DOCTOR' },
    [{ module_code: 'onco', role: 'DOCTOR', revoked_at: new Date() }], []);
  assert.deepStrictEqual(m, []);
  assert.strictEqual(landingRoute({ role: 'DOCTOR' }, m), '/app/no-access');
});

test('fertility-only doctor lands in the fertility shell', () => {
  const m = effectiveModules({ id: 'd2', role: 'DOCTOR' }, [
    { module_code: 'onco', role: 'DOCTOR', revoked_at: new Date() },
    { module_code: 'fertility', role: 'DOCTOR', revoked_at: null }], []);
  assert.deepStrictEqual(codes(m), ['fertility']);
  assert.strictEqual(landingRoute({ role: 'DOCTOR' }, m), '/app/fertility');
});

test('user with both modules gets the chooser', () => {
  const m = effectiveModules({ id: 'd3', role: 'DOCTOR' },
    [{ module_code: 'fertility', role: 'DIETITIAN', revoked_at: null }], []);
  assert.deepStrictEqual(codes(m), ['fertility', 'onco']);
  assert.strictEqual(m.find(x => x.code === 'fertility').role, 'DIETITIAN');
  assert.strictEqual(m.find(x => x.code === 'onco').role, 'DOCTOR');
  assert.strictEqual(landingRoute({ role: 'DOCTOR' }, m), '/app/choose');
});

test('store staff only see modules their store serves', () => {
  const user = { id: 's1', role: 'STORE', storeId: 'st1' };
  const grants = [{ module_code: 'fertility', role: 'STORE', revoked_at: null }];
  assert.deepStrictEqual(codes(effectiveModules(user, grants, [])), ['onco']);            // store has no fertility
  const both = effectiveModules(user, grants, [{ module_code: 'fertility', enabled: true }]);
  assert.deepStrictEqual(codes(both), ['fertility', 'onco']);
  const fxOnly = effectiveModules(user, grants, [
    { module_code: 'fertility', enabled: true }, { module_code: 'onco', enabled: false }]);
  assert.deepStrictEqual(codes(fxOnly), ['fertility']);
  assert.strictEqual(landingRoute(user, fxOnly), '/app/fertility/store');
});

test('store staff without a store get nothing', () => {
  assert.deepStrictEqual(effectiveModules({ id: 's2', role: 'STORE', storeId: null }, [], []), []);
});

test('admins get every module and land on /admin', () => {
  const m = effectiveModules({ id: 'a', role: 'ADMIN' }, [], []);
  assert.deepStrictEqual(codes(m), ['fertility', 'onco']);
  assert.strictEqual(landingRoute({ role: 'ADMIN' }, m), '/admin');
});

test('grant validation', () => {
  const doc = { id: 'd', role: 'DOCTOR', store_id: null };
  assert.strictEqual(validateGrant('fertility', 'DOCTOR', doc, true), null);
  assert.match(validateGrant('fertility', 'WIZARD', doc, true), /not valid/);
  assert.match(validateGrant('fertility', 'STORE', doc, true), /store first/);
  assert.match(validateGrant('dental', 'DOCTOR', doc, true), /Unknown module/);
  assert.match(validateGrant('onco', null, { role: 'ADMIN' }, true), /Admins/);
  assert.strictEqual(validateGrant('fertility', null, doc, false), null); // revoke needs no role
});
