// Weekly check-in data dictionary (rule MO-01). Symptom answers feed the
// safety rules that need them (RF-05 OHSS signs, RF-06, RF-11, F7-03, F8-03,
// F9-05/06). The date is stored as its own column, not in this data.
const opt = (...pairs) => pairs.map(([value, label]) => ({ value, label }));
const yes = (key, label, help) => ({ key, label, type: 'yesno', help });

const COMMON = [
  { key: 'weight_kg', label: 'Weight today', type: 'number', unit: 'kg', min: 25, max: 250, required: true },
  { key: 'adherence_pct', label: 'Took formula / supplements as advised', type: 'number', unit: '% of days', min: 0, max: 100 },
  { key: 'gi_tolerance', label: 'Digestion / tolerance', type: 'select',
    options: opt(['GOOD', 'No problems'], ['MILD', 'Mild discomfort'], ['POOR', 'Poor — struggling to eat']) },
];

const FEMALE = [
  { title: 'Check-in', fields: COMMON },
  { title: 'Symptoms since the last check-in', fields: [
    yes('bloating_mild', 'Mild bloating'),
    yes('early_satiety', 'Feels full quickly'),
    yes('nausea', 'Nausea (still eating and drinking)'),
    yes('constipation', 'Constipation'),
    yes('abdominal_distension', 'Marked abdominal swelling / distension'),
    yes('abdominal_pain', 'Abdominal pain'),
    yes('vomiting', 'Vomiting / cannot keep food down'),
    yes('unable_oral_24h', 'Unable to keep fluids down for more than 24 hours'),
    yes('breathlessness', 'Breathlessness'),
    yes('reduced_urine', 'Passing much less urine than usual'),
    yes('bleeding', 'Vaginal bleeding'),
  ]},
  { title: 'Clinic', fields: [
    yes('clinician_ohss_concern', 'Clinician concern for OHSS (incl. freeze-all for OHSS risk)'),
    { key: 'pregnancy_test', label: 'Pregnancy test', type: 'select',
      options: opt(['NOT_DONE', 'Not done'], ['PENDING', 'Awaiting result'], ['POSITIVE', 'Positive'], ['NEGATIVE', 'Negative']) },
  ]},
  { title: 'Notes', fields: [{ key: 'note', label: 'Notes', type: 'textarea' }] },
];

const MALE = [
  { title: 'Check-in', fields: COMMON },
  { title: 'Notes', fields: [{ key: 'note', label: 'Notes', type: 'textarea' }] },
];

// Symptoms and clinic answers are only trusted for this long (weekly check-ins).
const CHECKIN_FRESH_DAYS = 7;

const checkinSections = sex => (sex === 'M' ? MALE : FEMALE);
const checkinFields = sex => checkinSections(sex).flatMap(s => s.fields);

module.exports = { CHECKIN: { female: FEMALE, male: MALE }, checkinSections, checkinFields, CHECKIN_FRESH_DAYS };
