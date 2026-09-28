// Safety checks for a clinician-built weekly formula (pure function, unit-tested).
// BLOCK = cannot be approved. WARN = the approving doctor must confirm they reviewed it.
// Rule references: IS-01…IS-05 ingredient safety, G-03/G-04 evidence levels,
// G-05 red flags, G-07 herbal, G-10 interactions, F9-0x pregnancy-pending.

const words = t => String(t || '').split(/[,;\n]/).map(w => w.trim().toLowerCase()).filter(w => w && !/^(none|nil|no|-)$/.test(w));
const hasText = t => words(t).length > 0;

function phaseLimit(ing, sex, phase) {
  if (sex === 'M') return { max: ing.max_preconception, label: 'preconception' };
  if (phase === 'F9') return { max: ing.max_pregnancy, label: 'pregnancy-pending' };
  if (phase === 'F7' || phase === 'F8') return { max: ing.max_stimulation, label: 'stimulation / post-retrieval' };
  return { max: ing.max_preconception, label: 'preconception / IVF preparation' };
}

/**
 * @param f { items:[{ingredientId, dose, reason?}], sex, phase, facts, ingredients:Map|Object, openAlerts }
 */
function checkFormula({ items, sex, phase, facts = {}, ingredients, openAlerts = 0 }) {
  const out = [];
  const block = (code, message, ingredientId) => out.push({ level: 'BLOCK', code, message, ingredientId });
  const warn = (code, message, ingredientId) => out.push({ level: 'WARN', code, message, ingredientId });
  const get = id => (ingredients instanceof Map ? ingredients.get(id) : ingredients[id]);
  const pregnancyPending = sex === 'F' && phase === 'F9';

  if (!items || !items.length) block('EMPTY', 'Add at least one ingredient');
  if (openAlerts > 0) block('G-05', `${openAlerts} open red-flag alert(s) on this case — the treating doctor must acknowledge them first`);
  if (phase === 'CLOSED') block('CLOSED', 'The case is closed');
  const seen = new Set();

  for (const it of items || []) {
    const ing = get(it.ingredientId);
    if (!ing) { block('IS-01', `Unknown ingredient ${it.ingredientId}`, it.ingredientId); continue; }
    const n = ing.name;
    if (seen.has(ing.id)) block('DUP', `${n} is listed twice`, ing.id);
    seen.add(ing.id);
    if (ing.status !== 'ACTIVE') block('IS-01', `${n} is not active in the ingredient master`, ing.id);
    if (ing.missing && ing.missing.length) block('IS-01', `${n}: safety record incomplete (${ing.missing.join(', ')})`, ing.id);
    if (ing.reviewExpired) block('IS-05', `${n}: evidence review is more than 12 months old`, ing.id);

    const dose = Number(it.dose);
    if (!(dose > 0)) { block('DOSE', `${n}: enter a dose above 0`, ing.id); continue; }
    const { max, label } = phaseLimit(ing, sex, phase);
    if (max === null || max === undefined) block('IS-02', `${n}: no maximum set for ${label}`, ing.id);
    else if (Number(max) === 0) block('IS-02', `${n} is not permitted in ${label}`, ing.id);
    else if (dose > Number(max)) block('IS-02', `${n}: ${dose} ${ing.unit} is above the ${label} maximum of ${max} ${ing.unit}`, ing.id);
    if (ing.upper_limit !== null && ing.upper_limit !== undefined) {
      if (dose > Number(ing.upper_limit)) block('IS-03', `${n}: ${dose} ${ing.unit} is above the upper limit of ${ing.upper_limit} ${ing.unit}`, ing.id);
      else if (facts.has_supplements) warn('IS-03', `${n}: patient also takes "${facts.supplements}" — confirm the total stays at or below ${ing.upper_limit} ${ing.unit}/day`, ing.id);
    }

    const diet = facts.diet_pattern;
    if ((diet === 'VEGAN' && ing.vegan_ok === false) || (['VEG', 'EGG', 'JAIN'].includes(diet) && ing.veg_ok === false) || (diet === 'JAIN' && ing.jain_ok === false))
      block('IS-04', `${n} is not suitable for the patient's diet (${diet})`, ing.id);
    const allergy = words(facts.allergies);
    const hit = words(ing.allergens).filter(a => allergy.some(p => p.includes(a) || a.includes(p)));
    if (hit.length) block('IS-04', `${n} contains ${hit.join(', ')} — patient allergy/intolerance`, ing.id);
    else if (allergy.length && hasText(ing.allergens)) warn('IS-04', `${n} contains ${ing.allergens}; patient reports "${facts.allergies}" — confirm it is safe`, ing.id);

    if (ing.is_herbal) {
      if (pregnancyPending) block('G-07', `${n} is herbal — not allowed while pregnancy-pending`, ing.id);
      else warn('G-07', `${n} is herbal — needs evidence, interaction check and explicit approval`, ing.id);
    }
    if (pregnancyPending && ['AVOID', 'UNKNOWN'].includes(ing.pregnancy_safety)) block('F9-02', `${n}: pregnancy safety is ${ing.pregnancy_safety.toLowerCase()} — not allowed while pregnancy-pending`, ing.id);
    if (pregnancyPending && ing.pregnancy_safety === 'CAUTION') warn('F9-02', `${n}: pregnancy safety "caution" — confirm`, ing.id);

    if (['C', 'D'].includes(ing.evidence_level)) {
      if (!String(it.reason || '').trim()) block(ing.evidence_level === 'D' ? 'G-03' : 'G-04', `${n} has level ${ing.evidence_level} evidence — write the clinical reason on the line`, ing.id);
      else warn(ing.evidence_level === 'D' ? 'G-03' : 'G-04', `${n} (level ${ing.evidence_level}) included for: ${it.reason}`, ing.id);
    }

    const meds = String(facts.medicines || '').toLowerCase();
    const inter = words(ing.interactions).filter(m => meds.includes(m));
    if (inter.length) warn('G-10', `${n} may interact with ${inter.join(', ')} (patient medicine)`, ing.id);
    if (ing.approval_required) warn('APPROVAL', `${n} needs explicit clinician approval`, ing.id);
  }
  return out;
}

module.exports = { checkFormula, phaseLimit };
