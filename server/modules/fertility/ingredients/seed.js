// Starter ingredients — INACTIVE and incomplete on purpose: the clinical team
// must set every dose limit and review before any can be used (rule IS-01).
// Upper limits are adult values from the IOM Dietary Reference Intakes, to be
// checked against ICMR-NIN 2020 by the reviewer.
const base = { status: 'INACTIVE', approval_required: true, is_herbal: false };
module.exports = [
  { ...base, id: 'ING-001', name: 'Folic acid', form: 'Folic acid', category: 'VITAMIN', unit: 'µg', purpose: 'Preconception neural-tube-defect risk reduction', evidence_level: 'A', sources: 'S1', veg_ok: true, vegan_ok: true, jain_ok: true, allergens: 'None', upper_limit: 1000, pregnancy_safety: 'SAFE' },
  { ...base, id: 'ING-002', name: 'Vitamin D3', form: 'Cholecalciferol', category: 'VITAMIN', unit: 'IU', purpose: 'Correct measured vitamin D deficiency', evidence_level: 'B', sources: 'S9', upper_limit: 4000, pregnancy_safety: 'SAFE' },
  { ...base, id: 'ING-003', name: 'Vitamin B12', form: 'Methylcobalamin', category: 'VITAMIN', unit: 'µg', purpose: 'B12 adequacy (vegetarian risk, metformin use)', evidence_level: 'B', sources: 'S9', veg_ok: true, vegan_ok: true, jain_ok: true, pregnancy_safety: 'SAFE' },
  { ...base, id: 'ING-004', name: 'Iron', form: 'Ferrous bisglycinate', category: 'MINERAL', unit: 'mg', purpose: 'Correct measured iron deficiency', evidence_level: 'A', sources: 'S19', upper_limit: 45, pregnancy_safety: 'SAFE' },
  { ...base, id: 'ING-005', name: 'Iodine', form: 'Potassium iodide', category: 'MINERAL', unit: 'µg', purpose: 'Iodine adequacy', evidence_level: 'B', sources: 'S9', veg_ok: true, vegan_ok: true, jain_ok: true, allergens: 'None', upper_limit: 1100, pregnancy_safety: 'SAFE' },
  { ...base, id: 'ING-006', name: 'Omega-3 DHA', form: 'Algal oil', category: 'FATTY_ACID', unit: 'mg', purpose: 'Dietary DHA adequacy', evidence_level: 'B', sources: 'S9', pregnancy_safety: 'SAFE' },
  { ...base, id: 'ING-007', name: 'Whey protein isolate', form: 'Whey (milk)', category: 'PROTEIN', unit: 'g', purpose: 'Protein adequacy (N2)', evidence_level: 'A', sources: 'S9', vegan_ok: false, allergens: 'Milk', pregnancy_safety: 'SAFE' },
  { ...base, id: 'ING-008', name: 'Pea protein isolate', form: 'Pea', category: 'PROTEIN', unit: 'g', purpose: 'Protein adequacy (N2), plant-based', evidence_level: 'A', sources: 'S9', veg_ok: true, vegan_ok: true, allergens: 'Legume', pregnancy_safety: 'SAFE' },
  { ...base, id: 'ING-009', name: 'Myo-inositol', form: 'Myo-inositol', category: 'OTHER', unit: 'mg', purpose: 'PCOS — experimental (rule F2-07)', evidence_level: 'C', sources: 'S3', pregnancy_safety: 'UNKNOWN' },
  { ...base, id: 'ING-010', name: 'Coenzyme Q10', form: 'Ubiquinone', category: 'OTHER', unit: 'mg', purpose: 'IVF add-on — not recommended (rule F6-03)', evidence_level: 'D', sources: 'S4', pregnancy_safety: 'UNKNOWN' },
];
