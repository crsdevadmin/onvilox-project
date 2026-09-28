// Ingredient master fields. `required` = must be filled before the ingredient
// can be ACTIVE and used in a formula (rule IS-01). Doses are per day, in `unit`.
const opt = (...v) => v.map(([value, label]) => ({ value, label }));
const UNITS = opt(['µg', 'µg'], ['mg', 'mg'], ['g', 'g'], ['IU', 'IU']);

const INGREDIENT_SECTIONS = [
  { title: 'Ingredient', fields: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'form', label: 'Form / source', type: 'text', help: 'e.g. methylcobalamin, algal DHA, pea protein' },
    { key: 'category', label: 'Category', type: 'select', required: true,
      options: opt(['VITAMIN', 'Vitamin'], ['MINERAL', 'Mineral'], ['PROTEIN', 'Protein'], ['FATTY_ACID', 'Fatty acid'], ['HERBAL', 'Herbal / botanical'], ['OTHER', 'Other']) },
    { key: 'unit', label: 'Dose unit', type: 'select', options: UNITS, required: true },
    { key: 'purpose', label: 'Intended purpose', type: 'text', required: true },
    { key: 'evidence_level', label: 'Evidence level', type: 'select', required: true,
      options: opt(['A', 'A — strong'], ['B', 'B — reasonable'], ['C', 'C — limited (reason required)'], ['D', 'D — insufficient (reason required)']) },
    { key: 'sources', label: 'Source IDs', type: 'text', required: true },
  ]},
  { title: 'Diet & allergens', fields: [
    { key: 'veg_ok', label: 'Suitable for vegetarians', type: 'yesno', required: true },
    { key: 'vegan_ok', label: 'Suitable for vegans', type: 'yesno', required: true },
    { key: 'jain_ok', label: 'Suitable for Jain diet', type: 'yesno', required: true },
    { key: 'allergens', label: 'Allergens (comma-separated, or "None")', type: 'text', required: true },
    { key: 'is_herbal', label: 'Herbal / botanical', type: 'yesno', required: true },
  ]},
  { title: 'Dose limits (per day, in the dose unit; 0 = not permitted in that phase)', fields: [
    { key: 'max_preconception', label: 'Max — preconception / IVF prep', type: 'number', min: 0, max: 1000000, required: true },
    { key: 'max_stimulation', label: 'Max — stimulation / post-retrieval', type: 'number', min: 0, max: 1000000, required: true },
    { key: 'max_pregnancy', label: 'Max — pregnancy-pending', type: 'number', min: 0, max: 1000000, required: true },
    { key: 'upper_limit', label: 'Tolerable upper limit (total intake)', type: 'number', min: 0, max: 1000000,
      help: 'Leave empty only if no upper limit is established' },
  ]},
  { title: 'Safety', fields: [
    { key: 'pregnancy_safety', label: 'Pregnancy safety', type: 'select', required: true,
      options: opt(['SAFE', 'Safe at listed dose'], ['CAUTION', 'Caution — clinician to confirm'], ['AVOID', 'Avoid in pregnancy'], ['UNKNOWN', 'Unknown']) },
    { key: 'interactions', label: 'Medicine interactions (medicine names, comma-separated, or "None")', type: 'text', required: true },
    { key: 'contraindications', label: 'Contraindications', type: 'textarea' },
    { key: 'renal_hepatic', label: 'Renal / hepatic notes', type: 'textarea' },
    { key: 'approval_required', label: 'Needs explicit clinician approval each time', type: 'yesno', required: true },
  ]},
  { title: 'Evidence review', fields: [
    { key: 'last_review', label: 'Last evidence review', type: 'date', required: true },
    { key: 'reviewed_by', label: 'Reviewed by', type: 'text', required: true },
  ]},
];

const INGREDIENT_FIELDS = INGREDIENT_SECTIONS.flatMap(s => s.fields);
const REVIEW_MAX_DAYS = 365;   // rule IS-05

module.exports = { INGREDIENT_SECTIONS, INGREDIENT_FIELDS, REVIEW_MAX_DAYS };
