// Fertility assessment data dictionary — the single definition of every field
// the female and male assessments collect. The web forms are rendered from
// this (GET /api/fertility/schema), validation uses it, and the completeness
// check uses its `required` flags. Mirrors the "Inputs" sheet of the clinical
// rule catalogue; change both together.
//
// Field: { key, label, type, unit?, min?, max?, options?, required?, help? }
// type: number | select | yesno | text | textarea | date

const opt = (...pairs) => pairs.map(([value, label]) => ({ value, label }));

const DIET = opt(['VEG', 'Vegetarian'], ['EGG', 'Vegetarian + egg'], ['NONVEG', 'Non-vegetarian'],
                 ['VEGAN', 'Vegan'], ['JAIN', 'Jain']);
const FREQ = opt(['RARE', 'Rarely'], ['WEEKLY', '1–3 times a week'], ['MOST_DAYS', 'Most days'], ['DAILY', 'Daily or more']);

const lifestyle = [
  { key: 'diet_pattern', label: 'Diet pattern', type: 'select', options: DIET, required: true },
  { key: 'allergies', label: 'Food allergies / intolerances', type: 'text', required: true, help: 'Write "None" if none' },
  { key: 'energy_kcal', label: 'Estimated energy intake', type: 'number', unit: 'kcal/day', min: 300, max: 6000, required: true },
  { key: 'protein_g', label: 'Estimated protein intake', type: 'number', unit: 'g/day', min: 0, max: 400, required: true },
  { key: 'diet_quality', label: 'Diet quality', type: 'select', options: opt(['GOOD', 'Good'], ['FAIR', 'Fair'], ['POOR', 'Poor']) },
  { key: 'upf_freq', label: 'Packaged / ultra-processed food', type: 'select', options: FREQ },
  { key: 'activity_min_week', label: 'Physical activity', type: 'number', unit: 'min/week', min: 0, max: 3000, required: true },
  { key: 'sleep_h', label: 'Sleep', type: 'number', unit: 'hours/night', min: 0, max: 16 },
  { key: 'smoking', label: 'Smokes / uses tobacco', type: 'yesno', required: true },
  { key: 'alcohol_units_week', label: 'Alcohol', type: 'number', unit: 'units/week', min: 0, max: 200, required: true },
  { key: 'caffeine_mg_day', label: 'Caffeine', type: 'number', unit: 'mg/day', min: 0, max: 2000 },
];

const meds = [
  { key: 'medicines', label: 'Current medicines (name, dose)', type: 'textarea', required: true, help: 'Write "None" if none' },
  { key: 'supplements', label: 'Current supplements (name, dose)', type: 'textarea', required: true, help: 'Write "None" if none' },
];

const body = [
  { key: 'height_cm', label: 'Height', type: 'number', unit: 'cm', min: 120, max: 220, required: true },
  { key: 'weight_kg', label: 'Weight', type: 'number', unit: 'kg', min: 25, max: 250, required: true },
  { key: 'weight_3m_kg', label: 'Weight 3 months ago', type: 'number', unit: 'kg', min: 25, max: 250 },
];

const FEMALE = [
  { title: 'Body', fields: body },
  { title: 'Fertility history', fields: [
    { key: 'months_trying', label: 'Months trying to conceive', type: 'number', unit: 'months', min: 0, max: 360, required: true },
    { key: 'cycle_length_days', label: 'Usual cycle length', type: 'number', unit: 'days', min: 10, max: 365 },
    { key: 'cycle_regularity', label: 'Cycles', type: 'select', required: true,
      options: opt(['REGULAR', 'Regular'], ['IRREGULAR', 'Irregular'], ['ABSENT', 'Absent'])},
    { key: 'ovulation', label: 'Ovulation', type: 'select', options: opt(['CONFIRMED', 'Confirmed'], ['ANOVULATORY', 'Anovulatory'], ['UNKNOWN', 'Unknown']) },
    { key: 'prev_pregnancies', label: 'Previous pregnancies', type: 'number', min: 0, max: 20, required: true },
    { key: 'prev_miscarriages', label: 'Previous miscarriages', type: 'number', min: 0, max: 20, required: true },
    { key: 'prev_ivf_cycles', label: 'Previous IVF/ICSI cycles', type: 'number', min: 0, max: 30 },
    { key: 'prev_iui_cycles', label: 'Previous IUI cycles', type: 'number', min: 0, max: 30 },
  ]},
  { title: 'Diagnoses (clinician-entered)', fields: [
    { key: 'dx_pcos', label: 'PCOS (Rotterdam)', type: 'yesno', required: true },
    { key: 'dx_endometriosis', label: 'Endometriosis', type: 'yesno', required: true },
    { key: 'dx_dor_poi', label: 'Diminished ovarian reserve / POI', type: 'yesno', required: true },
    { key: 'dx_thyroid', label: 'Thyroid disease', type: 'yesno', required: true },
    { key: 'dx_diabetes', label: 'Diabetes', type: 'yesno', required: true },
    { key: 'amh_ng_ml', label: 'AMH', type: 'number', unit: 'ng/mL', min: 0, max: 50 },
    { key: 'afc', label: 'Antral follicle count', type: 'number', min: 0, max: 100 },
    { key: 'ed_screen', label: 'Eating-disorder screen', type: 'select',
      options: opt(['NOT_DONE', 'Not done'], ['NEGATIVE', 'Negative'], ['POSITIVE', 'Positive']) },
  ]},
  { title: 'Diet & lifestyle', fields: lifestyle },
  { title: 'Medicines & supplements', fields: [...meds,
    { key: 'folic_acid', label: 'Taking folic acid now', type: 'yesno', required: true },
    { key: 'folic_acid_ug', label: 'Folic acid dose', type: 'number', unit: 'µg/day', min: 0, max: 10000 },
  ]},
];

const MALE = [
  { title: 'Body', fields: body },
  { title: 'Semen analysis (WHO 2021 units)', fields: [
    { key: 'sa_date', label: 'Analysis date', type: 'date', required: true },
    { key: 'sa_volume_ml', label: 'Volume', type: 'number', unit: 'mL', min: 0, max: 20, required: true },
    { key: 'sa_conc', label: 'Concentration', type: 'number', unit: 'million/mL', min: 0, max: 500, required: true },
    { key: 'sa_total', label: 'Total sperm number', type: 'number', unit: 'million', min: 0, max: 2000 },
    { key: 'sa_total_motility', label: 'Total motility', type: 'number', unit: '%', min: 0, max: 100, required: true },
    { key: 'sa_prog_motility', label: 'Progressive motility', type: 'number', unit: '%', min: 0, max: 100, required: true },
    { key: 'sa_morphology', label: 'Normal forms', type: 'number', unit: '%', min: 0, max: 100, required: true },
    { key: 'sa_vitality', label: 'Vitality', type: 'number', unit: '%', min: 0, max: 100 },
    { key: 'sa_repeat', label: 'Repeat analysis done', type: 'yesno' },
  ]},
  { title: 'Reproductive & medical history', fields: [
    { key: 'varicocele', label: 'Varicocele', type: 'yesno', required: true },
    { key: 'testosterone_use', label: 'Testosterone / anabolic-steroid use (ever)', type: 'yesno', required: true },
    { key: 'heat_exposure', label: 'Regular testicular heat exposure', type: 'yesno' },
    { key: 'prev_children', label: 'Has fathered a pregnancy before', type: 'yesno' },
    { key: 'dx_diabetes', label: 'Diabetes', type: 'yesno', required: true },
  ]},
  { title: 'Diet & lifestyle', fields: lifestyle },
  { title: 'Medicines & supplements', fields: meds },
];

const PHASES = opt(
  ['F0', 'Preconception / trying naturally'], ['F1', 'Infertility evaluation'], ['F6', 'IVF / ICSI preparation'],
  ['F7', 'Ovarian stimulation'], ['F8', 'Post-retrieval'], ['F9', 'Embryo transfer / pregnancy-pending'], ['CLOSED', 'Closed']);

// Common labs with their usual unit. Reference ranges come from the patient's
// own lab report (rule G-09) — never assumed here.
const LABS = [
  { code: 'HB', label: 'Haemoglobin', unit: 'g/dL' }, { code: 'FERRITIN', label: 'Ferritin', unit: 'ng/mL' },
  { code: 'HBA1C', label: 'HbA1c', unit: '%' }, { code: 'FPG', label: 'Fasting glucose', unit: 'mg/dL' },
  { code: 'TSH', label: 'TSH', unit: 'mIU/L' }, { code: 'PRL', label: 'Prolactin', unit: 'ng/mL' },
  { code: 'VITD', label: 'Vitamin D (25-OH)', unit: 'ng/mL' }, { code: 'B12', label: 'Vitamin B12', unit: 'pg/mL' },
  { code: 'FOLATE', label: 'Folate', unit: 'ng/mL' },
];

const sectionsFor = sex => (sex === 'M' ? MALE : FEMALE);
const fieldsFor = sex => sectionsFor(sex).flatMap(s => s.fields);

module.exports = { FEMALE, MALE, PHASES, LABS, sectionsFor, fieldsFor };
