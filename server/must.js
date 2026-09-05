// ── Shared MUST (Malnutrition Universal Screening Tool) calculation ─────────
//
// MUST used to be computed in exactly one place — js/nutrition-engine-v4.js,
// against the baseline patient record — and rendered as one line in the
// Calculation Trace. Reporting a score at discharge means computing it a
// second time, and if the two ends came from two different implementations
// the change between them would be meaningless. So the arithmetic lives here
// and both ends call it with whichever set of values they have.
//
// Thresholds mirror the engine, rule-engine overrides included: pass the
// engine_formulas map (loadFormulaConstants) as `formulas` and a configured
// value wins over the default, exactly as fv() does in the engine.
//
// A missing input is NOT scored as zero. A patient with no height on file
// would otherwise score 0 on the BMI component and be reported as low risk,
// which is the one failure mode that matters clinically here — so an
// incomplete screen returns total: null and names what was missing.

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

// v accepts both the baseline shape and a discharge shape:
//   weight, height, usualWeight, weightLossPercent, reducedFoodIntake,
//   albumin, crp, smi, handGrip, sex, regimen, sarcopeniaStatus,
//   tumorBurden, cancer, cancerStage, palliativeStage
// weightLossPercent is used when given; otherwise it is derived from
// usualWeight, which the intake form captures as weight 6 months ago — the
// reference period MUST actually asks for, which is why a discharge-week
// recomputation against the same usual weight is a valid rescreen and not an
// approximation over the pilot window.
function computeMust(v, formulas) {
  const F = formulas || {};
  const fv = (k, d) => { const x = parseFloat(F[k]); return isNaN(x) ? d : x; };
  const o = v || {};

  const weight = num(o.weight);
  const height = num(o.height);
  const usual  = num(o.usualWeight);
  const missing = [];

  const bmi = (weight && height) ? weight / Math.pow(height / 100, 2) : null;
  if (bmi === null) missing.push(weight ? 'height' : 'weight');

  let wl = num(o.weightLossPercent);
  if (wl === null && usual && weight && usual > 0) wl = (usual - weight) / usual * 100;
  if (wl === null) missing.push('weight loss % (needs usual weight)');

  const bmiScore = bmi === null ? null : (bmi < fv('bmi_low_threshold', 18.5) ? 2 : (bmi <= fv('bmi_must_moderate', 20) ? 1 : 0));
  const wlScore  = wl  === null ? null : (wl > fv('weight_loss_high', 10) ? 2 : (wl >= fv('weight_loss_moderate', 5) ? 1 : 0));

  // Sarcopenia — status field, or SMI, or grip. SMI units are ambiguous in the
  // source data, so the engine's >15 heuristic separating L3-SMI (cm²/m²) from
  // ASMI (kg/m²) is reproduced rather than guessed at again.
  const gender = String(o.sex || '').toLowerCase().startsWith('m') ? 'male' : 'female';
  const smi  = num(o.smi) || 0;
  const grip = num(o.handGrip) || 0;
  let sarcopenia = o.sarcopeniaStatus === 'Yes' || o.sarcopeniaStatus === 'Sarcopenic';
  if (smi > 0) {
    const isL3 = smi > 15;
    const low = isL3
      ? (gender === 'male' ? smi < fv('smi_l3_male', 55) : smi < fv('smi_l3_female', 38.5))
      : (gender === 'male' ? smi < fv('asmi_male', 7.0)  : smi < fv('asmi_female', 5.7));
    if (low) sarcopenia = true;
  }
  if (grip > 0 && (gender === 'male' ? grip < fv('grip_male', 26) : grip < fv('grip_female', 18))) {
    sarcopenia = true;
  }

  const cancer = String(o.cancer || '').toLowerCase();
  const stage  = String(o.cancerStage || '').toLowerCase();
  const advancedMetastatic = cancer.includes('metastatic') || cancer.includes('advanced')
    || stage.includes('iv') || stage.includes('stage 4')
    || String(o.palliativeStage || '').toLowerCase().includes('palliative');

  const albumin = num(o.albumin);
  const crp     = num(o.crp);
  const cachexia = (albumin !== null && albumin < fv('albumin_low_threshold', 3.5))
    || (wl !== null && wl >= fv('weight_loss_high', 10))
    || (bmi !== null && bmi < fv('bmi_low_threshold', 18.5))
    || (crp !== null && crp > 10)
    || sarcopenia
    || o.tumorBurden === 'High (Bulky)'
    || advancedMetastatic;

  const activeChemo = !!(o.regimen && String(o.regimen).trim().length > 0);
  const reduced = num(o.reducedFoodIntake);
  const acuteScore = ((reduced !== null && reduced >= 70) || (activeChemo && cachexia)) ? 2 : 0;

  const complete = bmiScore !== null && wlScore !== null;
  const total = complete ? bmiScore + wlScore + acuteScore : null;
  const risk = total === null ? null
    : total === 0 ? 'Low Risk' : total === 1 ? 'Medium Risk' : 'High Risk';

  return {
    bmi: bmi === null ? null : Math.round(bmi * 10) / 10,
    weightLossPercent: wl === null ? null : Math.round(wl * 10) / 10,
    bmiScore, wlScore, acuteScore,
    total, risk, complete, missing,
    sarcopenia, cachexia, activeChemo
  };
}

// Maps a `patients` row — plus, optionally, one weekly monitoring log — onto
// the shape computeMust expects. Every caller goes through this, so a column
// rename cannot leave the baseline end and the discharge end disagreeing.
//
// Static characteristics come from the patient record either way. What a
// weekly log overrides is the measured state; anything the log did not capture
// falls back to baseline rather than reading as absent. weightLossPercent is
// deliberately cleared for a weekly screen so computeMust re-derives it
// against usual weight, which is the whole point of a rescreen.
function mustInputs(p, weeklyLog) {
  const fd = (p && p.full_data) || {};
  const n = (v) => (v === null || v === undefined || v === '' || isNaN(parseFloat(v))) ? null : parseFloat(v);
  const base = {
    height: p.height,
    usualWeight: p.usual_weight != null ? p.usual_weight : fd.usualWeight,
    sex: p.sex, regimen: p.regimen, cancer: p.cancer, cancerStage: p.cancer_stage,
    palliativeStage: p.palliative_stage, tumorBurden: p.tumor_burden,
    sarcopeniaStatus: p.sarcopenia_status,
    // SMI is imaging-derived and captured once at baseline. It is carried
    // forward rather than dropped, which would silently remove the sarcopenia
    // input from every rescreen — callers should say so where it is shown.
    smi: p.smi != null ? p.smi : fd.smi
  };
  if (!weeklyLog) {
    return Object.assign(base, {
      weight: p.weight, weightLossPercent: p.weight_loss_percent,
      reducedFoodIntake: p.reduced_food_intake,
      albumin: p.albumin, crp: p.crp, handGrip: p.hand_grip
    });
  }
  const w = weeklyLog;
  return Object.assign(base, {
    weight: n(w.weight) !== null ? n(w.weight) : p.weight,
    weightLossPercent: null,
    reducedFoodIntake: n(w.oralIntake) !== null ? 100 - n(w.oralIntake) : p.reduced_food_intake,
    albumin: n(w.albumin) !== null ? n(w.albumin) : p.albumin,
    crp: n(w.crp) !== null ? n(w.crp) : p.crp,
    handGrip: n(w.handGrip) !== null ? n(w.handGrip) : p.hand_grip
  });
}

// Columns mustInputs reads — so a query feeding it cannot quietly omit one.
const MUST_PATIENT_COLUMNS = 'id, height, weight, usual_weight, sex, regimen, cancer, '
  + 'cancer_stage, palliative_stage, tumor_burden, sarcopenia_status, smi, '
  + 'weight_loss_percent, reduced_food_intake, albumin, crp, hand_grip, full_data';

module.exports = { computeMust, mustInputs, MUST_PATIENT_COLUMNS };
