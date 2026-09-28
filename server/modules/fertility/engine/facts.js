// Facts: the named values a rule condition can test. buildFacts() turns a
// case partner (assessment + labs + phase) into facts; FACTS describes them
// for the admin condition builder. Adding a fact here makes it available to
// every rule — no rule code changes.
const { fieldsFor, LABS } = require('../assessment/fields');

// WHO 2021 lower reference limits (rule M-01) — data, not code.
const SEMEN_LIMITS = [
  { key: 'sa_volume_ml', min: 1.4 }, { key: 'sa_conc', min: 16 }, { key: 'sa_total', min: 39 },
  { key: 'sa_total_motility', min: 42 }, { key: 'sa_prog_motility', min: 30 },
  { key: 'sa_morphology', min: 4 }, { key: 'sa_vitality', min: 54 },
];
const STALE_DAYS = 90;
const LAB_STATUS = ['LOW', 'NORMAL', 'HIGH', 'MISSING'];

function typeOf(f) {
  if (f.type === 'number') return 'number';
  if (f.type === 'yesno') return 'boolean';
  if (f.type === 'select') return 'choice';
  return 'text';
}

// Catalogue for the admin builder: { key, label, type, unit?, options?, sex }
function factCatalogue() {
  const seen = new Map();
  for (const sex of ['F', 'M']) {
    for (const f of fieldsFor(sex)) {
      if (f.type === 'date') continue;
      const prev = seen.get(f.key);
      if (prev) { prev.sex = 'B'; continue; }
      seen.set(f.key, { key: f.key, label: f.label, type: typeOf(f), unit: f.unit, options: f.options, sex });
    }
  }
  const derived = [
    { key: 'age', label: 'Age', type: 'number', unit: 'years', sex: 'B' },
    { key: 'phase', label: 'Treatment phase', type: 'choice', sex: 'B',
      options: ['F0', 'F1', 'F6', 'F7', 'F8', 'F9', 'CLOSED'].map(v => ({ value: v, label: v })) },
    { key: 'bmi', label: 'BMI (calculated)', type: 'number', unit: 'kg/m²', sex: 'B' },
    { key: 'weight_loss_pct_3m', label: 'Weight loss over 3 months (calculated)', type: 'number', unit: '%', sex: 'B' },
    { key: 'protein_g_per_kg', label: 'Protein intake per kg (calculated)', type: 'number', unit: 'g/kg/day', sex: 'B' },
    { key: 'has_supplements', label: 'Takes any supplement', type: 'boolean', sex: 'B' },
    { key: 'labs_low_count', label: 'Number of in-date labs below range', type: 'number', sex: 'B' },
    { key: 'sa_abnormal_count', label: 'Semen parameters below WHO 2021 limit', type: 'number', sex: 'M' },
  ];
  const labs = LABS.flatMap(l => [
    { key: `lab_${l.code}_value`, label: `${l.label} — value`, type: 'number', unit: l.unit, sex: 'B' },
    { key: `lab_${l.code}_status`, label: `${l.label} — status vs report range`, type: 'choice', sex: 'B',
      options: LAB_STATUS.map(v => ({ value: v, label: v })) },
  ]);
  return [...derived, ...seen.values(), ...labs];
}

const num = v => (v === null || v === undefined || v === '' ? undefined : Number(v));

function buildFacts(c, partner) {
  const d = (partner.assessment && partner.assessment.data) || {};
  const f = { ...d, age: num(partner.age), phase: c.phase, sex: partner.sex };
  const h = num(d.height_cm), w = num(d.weight_kg), w3 = num(d.weight_3m_kg);
  if (h && w) f.bmi = Math.round((w / Math.pow(h / 100, 2)) * 10) / 10;
  if (w && w3) f.weight_loss_pct_3m = Math.round(((w3 - w) / w3) * 1000) / 10;
  if (w && num(d.protein_g) !== undefined) f.protein_g_per_kg = Math.round((num(d.protein_g) / w) * 100) / 100;
  if (d.supplements !== undefined) f.has_supplements = !!String(d.supplements).trim() && !/^(none|nil|no|-)$/i.test(String(d.supplements).trim());

  // Latest result per test; missing tests are "MISSING" (a risk, never a deficiency — rule G-09).
  let low = 0;
  const stale = [];
  for (const l of LABS) {
    const r = (partner.labs || []).filter(x => x.analyte === l.code)
      .sort((a, b) => String(b.collected_on).localeCompare(String(a.collected_on)))[0];
    if (!r) { f[`lab_${l.code}_status`] = 'MISSING'; continue; }
    const v = Number(r.value);
    const status = r.ref_low !== null && v < Number(r.ref_low) ? 'LOW' : r.ref_high !== null && v > Number(r.ref_high) ? 'HIGH' : 'NORMAL';
    const isStale = (Date.now() - Date.parse(r.collected_on)) / 86400000 > STALE_DAYS;
    f[`lab_${l.code}_value`] = v;
    f[`lab_${l.code}_status`] = status;
    if (isStale) stale.push(l.label);
    if (status === 'LOW' && !isStale) low++;
  }
  f.labs_low_count = low;

  if (partner.sex === 'M' && d.sa_conc !== undefined) {
    f.sa_abnormal_count = SEMEN_LIMITS.filter(s => d[s.key] !== undefined && Number(d[s.key]) < s.min).length;
  }
  return { facts: f, staleLabs: stale };
}

module.exports = { buildFacts, factCatalogue, SEMEN_LIMITS };
