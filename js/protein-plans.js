/**
 * GQUENCE Protein Formulation Plans (P1–P5)
 * ------------------------------------------------------------------
 * Single source of truth for the protein blend used in every formula
 * (initial plan, weekly prescription, store sheet, labels). Loaded in the
 * browser as window.ProteinPlans and on the server via require().
 *
 * Clinical decisions (clinical review, Sep 2026):
 *   - Former P2 "Anabolic" merged into P1 Standard. P1 keeps its own blend;
 *     the higher protein need of muscle-loss patients comes from the g/kg target.
 *   - Plans renumbered P1–P5 after the merge.
 *   - Dairy-Free (P4) = Pea protein 80% + Brown rice protein 20% for men and
 *     women alike (no soya, so the female SPI exclusion no longer blocks it).
 *   - SPI is excluded for female patients (and for anyone with a soy allergy);
 *     the "soy-free" variant of each plan is used instead.
 *
 * Blend percentages are shares of the protein-powder WEIGHT the store weighs
 * out. Grams are sized so the blend delivers the formula protein target.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ProteinPlans = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Per-gram composition of each base ingredient (typical commercial grades).
  // Keep in sync with js/ingredients.js (same ids).
  var INGREDIENTS = {
    mpc70:        { id: 'mpc70',        short: 'MPC',   name: 'Milk Protein Concentrate (MPC 70)',           p: 0.70, c: 0.18, f: 0.015, kcal: 3.6 },
    mpc85:        { id: 'mpc85',        short: 'MPC-C', name: 'Milk Protein Concentrate — concentrated (MPC 85)', p: 0.85, c: 0.05, f: 0.015, kcal: 3.6 },
    wpc80:        { id: 'wpc80',        short: 'WPC',   name: 'Whey Protein Concentrate (WPC 80)',           p: 0.80, c: 0.07, f: 0.06,  kcal: 4.0 },
    soy_isolate:  { id: 'soy_isolate',  short: 'SPI',   name: 'Soya Protein Isolate (SPI)',                  p: 0.90, c: 0.01, f: 0.01,  kcal: 3.7 },
    pea_protein:  { id: 'pea_protein',  short: 'Pea',   name: 'Pea Protein Isolate',                         p: 0.80, c: 0.02, f: 0.05,  kcal: 3.8 },
    rice_protein: { id: 'rice_protein', short: 'Rice',  name: 'Brown Rice Protein',                          p: 0.80, c: 0.08, f: 0.03,  kcal: 3.9 }
  };

  var PLANS = {
    P1: { code: 'P1', name: 'Standard',
          use: 'Default plan — stable condition, eating reasonably well, no specific tolerance issues. Also covers muscle loss / wasting (sarcopenia, cachexia); the higher protein target comes from the g/kg prescription.',
          blend: { mpc70: 60, wpc80: 25, soy_isolate: 15 }, soyFree: { mpc70: 75, wpc80: 25 } },
    P2: { code: 'P2', name: 'Low-Volume',
          use: 'Can only manage small amounts (poor appetite, nausea, early fullness) — more protein per serving.',
          blend: { mpc85: 75, wpc80: 25 }, soyFree: null },
    P3: { code: 'P3', name: 'GI-Sensitive',
          use: 'Diarrhoea, bowel inflammation or pelvic radiotherapy — lower-lactose blend, gentler on digestion.',
          blend: { mpc85: 60, soy_isolate: 40 }, soyFree: { mpc85: 100 } },
    P4: { code: 'P4', name: 'Dairy-Free',
          use: 'Milk / dairy allergy or lactose exclusion, or vegan — plant blend, soya-free, for men and women.',
          blend: { pea_protein: 80, rice_protein: 20 }, soyFree: null },
    P5: { code: 'P5', name: 'Renal Support',
          use: 'Reduced kidney function — protein dose capped (KDIGO) and blend chosen to lower phosphorus / acid load.',
          blend: { mpc70: 50, soy_isolate: 50 }, soyFree: { mpc70: 100 } }
  };
  var CODES = ['P1', 'P2', 'P3', 'P4', 'P5'];

  // ── helpers ──────────────────────────────────────────────────────────
  function toList(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v.map(String);
    if (typeof v === 'string') {
      var s = v.trim();
      if (s.charAt(0) === '[') { try { var a = JSON.parse(s); if (Array.isArray(a)) return a.map(String); } catch (e) {} }
      return s.split(/[,;]/).map(function (x) { return x.trim(); }).filter(Boolean);
    }
    return [];
  }
  function lc(list) { return toList(list).map(function (x) { return x.toLowerCase(); }); }
  function any(list, re) { return lc(list).some(function (x) { return re.test(x); }); }

  function isFemale(sex) { var s = String(sex || '').trim().toLowerCase(); return s === 'female' || s === 'f'; }
  function hasSoyAllergy(p) { return any(p && p.allergies, /\bso(y|ya)\b|soybean/); }
  function dairyFreeReason(p) {
    if (!p) return null;
    if (any(p.allergies, /milk|dairy|casein|whey|lactose/)) return 'Milk / dairy / lactose allergy recorded';
    var diet = String(p.dietPreference || p.diet || '').toLowerCase();
    if (p.vegan === true || diet.indexOf('vegan') >= 0 || /vegan/i.test(String(p.culturalPreferences || ''))) return 'Vegan diet';
    return null;
  }

  function normCode(code) {
    var c = String(code || '').trim().toUpperCase();
    return PLANS[c] ? c : null;
  }

  /**
   * Pick the plan for a patient.
   *   patient: profile object (sex, allergies, vegan/dietPreference, giIssues,
   *            sideEffects, comorbidities, treatmentTypes)
   *   flags:   { renal, gi, lowVolume } — engine-computed signals (optional;
   *            OR-ed with what can be read from the profile)
   * Priority: Dairy-Free (allergy is absolute) > Renal > GI > Low-Volume > Standard.
   */
  function select(patient, flags) {
    var p = patient || {}, f = flags || {};
    var reasons = [];
    var se = p.sideEffects, cm = p.comorbidities, tx = p.treatmentTypes;

    var df = dairyFreeReason(p);
    var renal = !!f.renal || any(cm, /ckd|chronic kidney|renal (failure|disease|impairment|insufficiency)|nephropathy|dialysis/);
    var gi = !!f.gi || p.giIssues === true || p.giIssues === 'true'
          || any(se, /diarrh|enteritis|colitis/) || any(cm, /\bibd\b|crohn|colitis|enteritis/)
          || any(tx, /pelvic|abdominal/) || /pelv|abdom|rectum|cervix|bowel/i.test(String(p.subSite || p.rtSubSite || ''));
    var lowVol = !!f.lowVolume || any(se, /appetite|satiety|fullness|nausea|vomit/);

    var code;
    if (df) { code = 'P4'; reasons.push(df); if (renal) reasons.push('Renal flag also present — protein dose stays capped by the renal g/kg rule'); }
    else if (renal) { code = 'P5'; reasons.push('Reduced kidney function'); }
    else if (gi) { code = 'P3'; reasons.push('GI sensitivity (diarrhoea / bowel inflammation / pelvic RT)'); }
    else if (lowVol) { code = 'P2'; reasons.push('Low tolerated volume (appetite loss / nausea / early fullness)'); }
    else { code = 'P1'; reasons.push('No specific tolerance issue'); }

    return {
      code: code,
      reasons: reasons,
      soyFree: isFemale(p.sex) || hasSoyAllergy(p),
      soyFreeReason: hasSoyAllergy(p) ? 'Soy allergy' : (isFemale(p.sex) ? 'Female patient — SPI excluded' : null),
      dairyFree: !!df
    };
  }

  /** Blend {ingredientId: pct} for a plan, honouring the soy-free rule. */
  function blendFor(code, soyFree) {
    var pl = PLANS[normCode(code) || 'P1'];
    return (soyFree && pl.soyFree) ? pl.soyFree : pl.blend;
  }

  function blendText(code, soyFree) {
    var b = blendFor(code, soyFree);
    return Object.keys(b).map(function (k) { return INGREDIENTS[k].short + ' ' + b[k] + '%'; }).join(' · ');
  }

  function label(code, soyFree) {
    var c = normCode(code) || 'P1', pl = PLANS[c];
    var variant = (soyFree && pl.soyFree) ? ' (SPI removed)' : '';
    return c + ' · ' + pl.name + ' — ' + blendText(c, soyFree) + variant;
  }

  /**
   * Size the blend so it delivers `targetProtein` grams of protein.
   * Returns { rows[], grams, protein, carbs, fat, kcal, code, soyFree, label }.
   */
  function build(code, targetProtein, soyFree) {
    var c = normCode(code) || 'P1';
    var b = blendFor(c, soyFree);
    var keys = Object.keys(b);
    var pPerGramBlend = keys.reduce(function (s, k) { return s + (b[k] / 100) * INGREDIENTS[k].p; }, 0);
    var totalG = targetProtein > 0 ? targetProtein / pPerGramBlend : 0;
    var r1 = function (x) { return Math.round(x * 10) / 10; };
    var rows = keys.map(function (k) {
      var ing = INGREDIENTS[k];
      var g = Math.round(totalG * b[k] / 100);
      var prot = r1(g * ing.p);
      return {
        id: ing.id, name: ing.name, short: ing.short, pct: b[k], grams: g,
        deliveredProtein: prot,
        rationale: 'Protein plan ' + c + ' (' + PLANS[c].name + ') — ' + b[k] + '% of protein blend.',
        contrib: { protein: prot, carbs: r1(g * ing.c), fat: r1(g * ing.f) },
        kcal: g * ing.kcal
      };
    }).filter(function (r) { return r.grams > 0; });
    var sum = function (fn) { return rows.reduce(function (s, r) { return s + fn(r); }, 0); };
    return {
      code: c, name: PLANS[c].name, soyFree: !!(soyFree && PLANS[c].soyFree),
      label: label(c, soyFree), blendText: blendText(c, soyFree),
      rows: rows,
      grams: sum(function (r) { return r.grams; }),
      protein: r1(sum(function (r) { return r.deliveredProtein; })),
      carbs: r1(sum(function (r) { return r.contrib.carbs; })),
      fat: r1(sum(function (r) { return r.contrib.fat; })),
      kcal: Math.round(sum(function (r) { return r.kcal; }))
    };
  }

  /**
   * Flatten a named initial-plan recipe ({protein, carb, fat, …}) into rows,
   * expanding a protein blend into its component ingredients.
   * Weekly recipes (recipe.ingredients[]) are returned unchanged.
   */
  function recipeRows(r) {
    if (!r) return [];
    if (Array.isArray(r.ingredients) && r.ingredients.length) return r.ingredients;
    var prot = r.protein && Array.isArray(r.protein.components) && r.protein.components.length
      ? r.protein.components : [r.protein];
    return prot.concat([r.carb, r.fat, r.omega, r.bcaa, r.glutamine]).filter(Boolean);
  }

  return {
    INGREDIENTS: INGREDIENTS, PLANS: PLANS, CODES: CODES,
    select: select, build: build, blendFor: blendFor, blendText: blendText, label: label,
    recipeRows: recipeRows, isFemale: isFemale, hasSoyAllergy: hasSoyAllergy, normCode: normCode
  };
});
