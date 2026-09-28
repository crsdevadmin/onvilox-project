// Validate an assessment against the data dictionary, and report which
// required fields are still missing (the completeness gate, rule F6-04).
const { fieldsFor } = require('./fields');

const blank = v => v === null || v === undefined || v === '';

// Returns { data, errors } — data keeps only known keys, typed.
function cleanAssessment(sex, input) { return cleanFields(fieldsFor(sex), input); }

function cleanFields(fields, input) {
  const out = {};
  const errors = [];
  for (const f of fields) {
    const v = (input || {})[f.key];
    if (blank(v)) continue;
    if (f.type === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n)) { errors.push(`${f.label}: not a number`); continue; }
      if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) {
        errors.push(`${f.label}: ${n} is outside ${f.min}–${f.max}${f.unit ? ' ' + f.unit : ''}`); continue;
      }
      out[f.key] = n;
    } else if (f.type === 'yesno') {
      if (v !== true && v !== false && v !== 'yes' && v !== 'no') { errors.push(`${f.label}: answer yes or no`); continue; }
      out[f.key] = v === true || v === 'yes';
    } else if (f.type === 'select') {
      if (!f.options.some(o => o.value === v)) { errors.push(`${f.label}: invalid choice`); continue; }
      out[f.key] = v;
    } else if (f.type === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || isNaN(Date.parse(v))) { errors.push(`${f.label}: invalid date`); continue; }
      out[f.key] = String(v);
    } else {
      out[f.key] = String(v).slice(0, 2000);
    }
  }
  return { data: out, errors };
}

function missingRequired(sex, data) {
  return fieldsFor(sex).filter(f => f.required && blank((data || {})[f.key])).map(f => f.label);
}

function missingIn(fields, data) {
  return fields.filter(f => f.required && blank((data || {})[f.key])).map(f => f.label);
}

module.exports = { cleanAssessment, missingRequired, cleanFields, missingIn };
