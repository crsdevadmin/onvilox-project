function generateNutritionPlan(patient, engineConfig) {
  // Use passed config, or fall back to globally loaded window.engineConfig, or empty defaults
  engineConfig = engineConfig || window.engineConfig || { formulas: {}, rules: [] };
  // fv(name, default) — reads a formula constant from DB config, falls back to hardcoded default
  const fv = (name, def) => {
    const v = engineConfig.formulas && engineConfig.formulas[name];
    return (v !== undefined && v !== null && v !== '') ? parseFloat(v) : def;
  };

  const weight = parseFloat(patient.weight || 0);
  // Auto-correct height: if entered in metres (e.g. 1.62) convert to cm (162)
  const heightRaw = parseFloat(patient.height || 0);
  const height = (heightRaw > 0 && heightRaw < 3) ? Math.round(heightRaw * 100) : heightRaw;
  const albumin = parseFloat(patient.albumin || 0);
  const weightLossPercent = parseFloat(patient.weightLossPercent || 0);
  const reducedFoodIntake = parseFloat(patient.reducedFoodIntake || 0);
  const crp = parseFloat(patient.crp || 0);
  const creatinine = parseFloat(patient.creatinine || 0);
  const alt = parseFloat(patient.alt || 0);
  const ast = parseFloat(patient.ast || 0);
  const bilirubin = parseFloat(patient.bilirubin || 0);
  const bloodSugar = parseFloat(patient.bloodSugar || 0);
  const urea = parseFloat(patient.urea || 0);
  const tsh = parseFloat(patient.tsh || 0);
  const hemoglobin = parseFloat(patient.hemoglobin || 0);
  const vitD = parseFloat(patient.vitD || 0);
  const zinc = parseFloat(patient.zinc || 0);
  const prealbumin = parseFloat(patient.prealbumin || 0);
  const wbc = parseFloat(patient.wbc || 0);
  const wbcAbsolute = wbc * 1000; // WBC stored in ×10³/µL, thresholds are in /µL
  const anc = parseFloat(patient.anc || 0);
  const platelet = parseFloat(patient.platelet || 0);
  const age = parseInt(patient.age || 0);
  const ecog = parseInt(patient.ecogStatus || 0);
  const gender = (patient.sex || '').toLowerCase();
  const regimen = (patient.regimen || '').toLowerCase();
  const cancer = (patient.cancer || '').toLowerCase();
  
  const bmi = height ? (weight / Math.pow(height / 100, 2)) : 0;

  // IBW (Hamwi formula) and AdjBW for obese patients — ESPEN/ASPEN calorie basis
  let ibw = 0;
  if (height > 0) {
    const heightInches = height / 2.54;
    ibw = gender === 'male'
      ? Math.max(0, fv('ibw_base_male', 48.0) + fv('ibw_per_inch_male', 2.7) * (heightInches - 60))
      : Math.max(0, fv('ibw_base_female', 45.5) + fv('ibw_per_inch_female', 2.2) * (heightInches - 60));
    ibw = Math.round(ibw * 10) / 10;
  }
  let calcWeight = weight;
  let weightBasis = `Actual Body Weight (${weight} kg)`;
  if (patient.weightBasisOverride === 'actual') {
    calcWeight = weight;
    weightBasis = `Current Body Weight (${weight} kg)`;
  } else {
    // Default: IBW
    calcWeight = ibw > 0 ? ibw : weight;
    weightBasis = ibw > 0 ? `IBW / Hamwi Formula (${ibw} kg)` : `Current Body Weight (${weight} kg) — height not available for IBW`;
  }

  const isVegetarian = !!patient.vegetarian;
  
  const smi = parseFloat(patient.smi || 0);
  const handGrip = parseFloat(patient.handGrip || 0);
  let sarcopenia = patient.sarcopeniaStatus === 'Yes' || patient.sarcopeniaStatus === 'Sarcopenic';
  
  // SMI Unit detection (ASMI kg/m2 vs L3-SMI cm2/m2)
  const isL3SMI = smi > 15; 

  if (smi > 0) {
    let smiLow = false;
    if (isL3SMI) {
      // Janssen et al. / Martin et al. thresholds for L3-SMI (cm2/m2)
      smiLow = (gender === 'male' ? smi < fv('smi_l3_male', 55) : smi < fv('smi_l3_female', 38.5));
    } else {
      // EWGSOP2 thresholds for ASMI (kg/m2)
      smiLow = (gender === 'male' ? smi < fv('asmi_male', 7.0) : smi < fv('asmi_female', 5.7));
    }
    if (smiLow) sarcopenia = true;
  }
  if (handGrip > 0) {
    const gripLow = (gender === 'male' ? handGrip < fv('grip_male', 26) : handGrip < fv('grip_female', 18));
    if (gripLow) sarcopenia = true;
  }

  const comorbidities = Array.isArray(patient.comorbidities) ? patient.comorbidities : [];
  const lowerComorbidities = comorbidities.map(c => c.toLowerCase());
  const sideEffects = (Array.isArray(patient.sideEffects) ? patient.sideEffects : []).map(s => s.toLowerCase());
  
  var isDiabetic = (lowerComorbidities.some(c => c.includes('diabetes') || c.includes('t2dm')) || bloodSugar > fv('blood_sugar_danger', 180) || parseFloat(patient.hba1c || 0) >= 6.5);
  var hasIBD = lowerComorbidities.some(c => c.includes('ibd') || c.includes('crohn') || c.includes('colitis'));
  // Only match specific renal DISEASE terms — not generic mentions like "normal renal function"
  var hasRenalDisease = lowerComorbidities.some(c =>
    c.includes('ckd') || c.includes('chronic kidney') || c.includes('renal failure') ||
    c.includes('renal disease') || c.includes('renal impairment') || c.includes('renal insufficiency') ||
    c.includes('nephropathy') || c.includes('dialysis') || c.includes('aki') || c.includes('acute kidney')
  );
  var hasRenalIssue = hasRenalDisease || creatinine > fv('creatinine_renal_danger', 1.3) || urea >= fv('urea_high', 50);
  
  var hasNausea = sideEffects.some(s => s.includes('nausea') || s.includes('vomit'));
  var hasAppetiteLoss = sideEffects.some(s => s.includes('appetite') || s.includes('satiety'));
  var hasMucositis = sideEffects.some(s => s.includes('mucositis') || s.includes('mouth sore') || regimen.includes('5-fu') || regimen.includes('folfirinox'));
  
  // Normalise common platinum abbreviations/typos so all downstream checks work
  const hasCisplatin = regimen.includes('cisplatin') || regimen.includes('cepatin') || regimen.includes('gem-cis') || regimen.includes('gemcis');
  const hasPlatinum = regimen.includes('platin') || regimen.includes('cepatin') || regimen.includes('folfox') || regimen.includes('folfirinox');

  var chemFlags = {
    platin: hasPlatinum,
    oxaliplatin: regimen.includes('oxaliplatin') || regimen.includes('folfox') || regimen.includes('folfirinox'),
    bortezomib: (regimen.includes('bortezomib') || regimen.includes('velcade') || regimen.includes('vrd') || regimen.includes('vcd')) || cancer.includes('myeloma'),
    pembrolizumab: regimen.includes('pembrolizumab') || regimen.includes('keytruda'),
    // ac: includes R-CHOP/CHOP (Doxorubicin present) — antioxidant contraindication applies to all
    ac: regimen.includes('ac ') || regimen.includes('adriamycin') || regimen.includes('doxorubicin') || (cancer.includes('breast') && regimen.includes('ac')) || regimen.includes('r-chop') || regimen.includes('rchop') || regimen.includes('chop'),
    taxane: regimen.includes('taxane') || regimen.includes('paclitaxel') || regimen.includes('docetaxel'),
    rchop: regimen.includes('r-chop') || regimen.includes('rchop') || regimen.includes('chop'),
    vincristine: regimen.includes('vincristine') || regimen.includes('r-chop') || regimen.includes('rchop') || regimen.includes('chop'),
    steroid: regimen.includes('prednisolone') || regimen.includes('prednisone') || regimen.includes('r-chop') || regimen.includes('rchop') || regimen.includes('chop') || regimen.includes('dexamethasone') || regimen.includes('dexa'),
    olaparib: regimen.includes('olaparib') || regimen.includes('lynparza'),
    gemcitabine: regimen.includes('gemcitabine') || regimen.includes('gem-cis') || regimen.includes('gemcis') || regimen.includes('abc-02'),
    nivolumab: regimen.includes('nivolumab') || regimen.includes('opdivo'),
    durvalumab: regimen.includes('durvalumab') || regimen.includes('imfinzi'),
    atezolizumab: regimen.includes('atezolizumab') || regimen.includes('tecentriq'),
    bevacizumab: regimen.includes('bevacizumab') || regimen.includes('avastin')
  };

  var drugs = [];
  if (hasCisplatin) drugs.push("Cisplatin");
  if (chemFlags.bortezomib) drugs.push("Bortezomib");
  if (regimen.includes('lenalidomide') || regimen.includes('revlimid')) drugs.push("Lenalidomide");
  if (chemFlags.pembrolizumab) drugs.push("Pembrolizumab");
  if (chemFlags.nivolumab) drugs.push("Nivolumab");
  if (chemFlags.durvalumab) drugs.push("Durvalumab");
  if (chemFlags.atezolizumab) drugs.push("Atezolizumab");
  if (chemFlags.bevacizumab) drugs.push("Bevacizumab");
  if (chemFlags.olaparib) drugs.push("Olaparib (Lynparza)");
  if (chemFlags.gemcitabine) drugs.push("Gemcitabine");
  if (chemFlags.rchop) drugs.push("R-CHOP (Rituximab + Cyclophosphamide + Doxorubicin + Vincristine + Prednisolone)");
  else if (chemFlags.ac) drugs.push("AC (Adriamycin + Cyclophosphamide)");
  if (chemFlags.vincristine && !chemFlags.rchop) drugs.push("Vincristine");

  // Detect pelvic/abdominal radiation — drives mucosal-adapted formula requirement
  // Declared here (before use at nutritionRisk block) to avoid temporal dead zone
  var treatmentTypes = (Array.isArray(patient.treatmentTypes) ? patient.treatmentTypes : []).map(t => (t || '').toLowerCase());
  var hasPelvicRadiation = treatmentTypes.some(t => t.includes('pelvic') || t.includes('abdominal') || t.includes('radiation') || t.includes('radiotherapy') || t.includes('ebrt') || t.includes('brachytherapy'))
    || lowerComorbidities.some(c => c.includes('radiation enteritis') || c.includes('enteritis'))
    || sideEffects.some(s => s.includes('radiation') || s.includes('enteritis'));

  const nutritionRiskReasons = [];
  let riskScore = 0;
  // V3 Safety Engine (Step 6) - Initialized later in function
  let safetyAlerts = [];

  // Neutropenia detection — ANC is definitive; WBC used as fallback
  const hasNeutropenia = (anc > 0 ? anc < 1500 : (wbc > 0 && wbcAbsolute < fv('wbc_neutropenia', 3500)));
  const hasSevereNeutropenia = (anc > 0 ? anc < 500 : (wbc > 0 && wbcAbsolute < fv('wbc_severe_neutropenia', 2000)));
  const hasThrombocytopenia = platelet > 0 && platelet < 100;
  // Steroid-induced hyperglycaemia triple trigger
  const hasTripleTrigger = chemFlags.steroid && isDiabetic && bloodSugar >= 180;

  // --- STEP 4 & 6: LAB INTERPRETATION & SAFETY ---
  if (hemoglobin > 0 && hemoglobin < fv('hemoglobin_anemia', 10)) {
    safetyAlerts.push({ condition: 'ANEMIA (Hb < 10)', severity: 'Moderate', action: 'Iron + B12 protocol indicated — HOLD iron initiation until iron panel confirmed (Ferritin, Serum Iron, TIBC, Transferrin Saturation).' });
  }
  if (hasSevereNeutropenia) {
    safetyAlerts.push({ condition: `SEVERE NEUTROPENIA (ANC ${anc > 0 ? anc : '<2000 WBC'})`, severity: 'High', action: 'Neutropenic diet protocol: no raw fruits/vegetables, no fresh juices, no fermented foods, no probiotics. All food must be well-cooked. Infection risk is critical.' });
  } else if (hasNeutropenia) {
    safetyAlerts.push({ condition: `NEUTROPENIA (ANC ${anc > 0 ? anc : 'WBC <3500'})`, severity: 'Moderate', action: 'Modified neutropenic diet: avoid raw sprouts, unpasteurized products, undercooked proteins. Probiotics CONTRAINDICATED.' });
  }
  if (hasThrombocytopenia) {
    safetyAlerts.push({ condition: `THROMBOCYTOPENIA (Platelets ${platelet} ×10³/μL)`, severity: platelet < 50 ? 'High' : 'Moderate', action: platelet < 50 ? 'Avoid fish oil / Omega-3 supplementation (antiplatelet effect). Avoid vitamin E >400 IU. Soft diet to prevent mucosal bleeding.' : 'Monitor Omega-3 dosing — limit to ≤1g/day. Avoid high-dose vitamin E. Soft foods preferred.' });
  }
  if (patient.potassium > fv('potassium_high', 5.0)) {
    safetyAlerts.push({ condition: 'HYPERKALEMIA (>5.0)', severity: 'High', action: 'Restrict potassium sources; adjust formula to K-free matrix.' });
  }
  if (patient.sodium > 0 && patient.sodium < fv('sodium_danger', 130)) {
    safetyAlerts.push({ condition: 'HYPONATREMIA (<130)', severity: 'High', action: 'Fluid balance correction protocol; target 1-2g NaCl.' });
  } else if (patient.sodium > 0 && patient.sodium < fv('sodium_warning', 135)) {
    safetyAlerts.push({ condition: 'MILD HYPONATREMIA (<135)', severity: 'Moderate', action: 'Monitor volume status; standard sodium target.' });
  }
  if (vitD > 0 && vitD < fv('vitd_deficiency', 20)) {
    safetyAlerts.push({ condition: 'VITAMIN D DEFICIENCY (<20)', severity: 'Moderate', action: 'Vit D correction: 4000 IU/day standardised. Recheck 25-OH-VitD at 8 weeks.' });
  }
  if (patient.magnesium > 0 && patient.magnesium < fv('magnesium_low', 1.7)) {
    safetyAlerts.push({ condition: 'HYPOMAGNESEMIA (<1.7)', severity: 'Moderate', action: 'Magnesium correction protocol (200-400mg Mg Oxide/Citrate).' });
  }
  if (tsh > fv('tsh_high', 5.0)) {
    safetyAlerts.push({ condition: 'METABOLIC RATE FLAG', severity: 'Low', action: 'Elevated TSH detected; monitor metabolic rate.' });
  }

  // Comorbidities / Organ Function
  const hasCardiac = lowerComorbidities.some(c => c.includes('cardiac'));

  if (hasRenalIssue) {
    riskScore += 2;
    nutritionRiskReasons.push('Renal Function Impairment (Creatinine: ' + creatinine + ')');
    safetyAlerts.push({ condition: 'RENAL SAFETY PROTOCOL', severity: 'High', action: 'Protein capped to prevent nitrogen overload.' });
  }
  if (hasPelvicRadiation) {
    riskScore += 2;
    nutritionRiskReasons.push('Pelvic/Abdominal Radiation — Enteritis Risk');
    safetyAlerts.push({ condition: 'RADIATION ENTERITIS PROTOCOL', severity: 'High', action: 'Pelvic/abdominal radiation detected. Formula switched to peptide-based (pre-digested). Low-residue carbohydrate source required. Avoid intact disaccharides (e.g. Palatinose). Reassess formula at each radiation milestone (10 Gy, 20 Gy, completion). If brachytherapy planned: consider elemental formula peri-procedure.' });
  }
  if (hasIBD) {
    riskScore += 1;
    nutritionRiskReasons.push('IBD / Malabsorption Risk');
  }

  if (albumin > 0 && albumin < fv('albumin_low_threshold', 3.5)) {
    riskScore += 2;
    nutritionRiskReasons.push('Low albumin');
  }
  if (weightLossPercent >= fv('weight_loss_high', 10)) {
    riskScore += 2;
    nutritionRiskReasons.push('Weight loss ≥ 10%');
  } else if (weightLossPercent >= fv('weight_loss_moderate', 5)) {
    riskScore += 1;
    nutritionRiskReasons.push('Weight loss 5–9.9%');
  }
  if (bmi > 0 && bmi < fv('bmi_low_threshold', 18.5)) {
    riskScore += 2;
    nutritionRiskReasons.push('Low BMI');
  }
  if (patient.giIssues) {
    riskScore += 1;
    nutritionRiskReasons.push('GI issues');
  }
  if (alt > fv('alt_liver_threshold', 50) || ast > fv('ast_liver_threshold', 50) || bilirubin > fv('bilirubin_liver_threshold', 1.2)) {
    riskScore += 2;
    nutritionRiskReasons.push('Liver function compromised');
  }
  if (ecog >= fv('ecog_moderate_threshold', 2)) {
    riskScore += 1;
    nutritionRiskReasons.push('Reduced physical performance (ECOG ≥ 2)');
  }
  if (isDiabetic) {
    riskScore += 1;
    nutritionRiskReasons.push('Diabetes / Hyperglycemia');
  }
  if (hemoglobin > 0 && hemoglobin < fv('hemoglobin_low', 12)) {
    riskScore += 1;
    nutritionRiskReasons.push('Anemia (Low Hemoglobin)');
  }
  if (sarcopenia) {
    riskScore += 2;
    nutritionRiskReasons.push('Confirmed Sarcopenia');
  }

  let nutritionRisk = 'Low';
  if (riskScore >= fv('risk_score_high', 4)) nutritionRisk = 'High';
  else if (riskScore >= fv('risk_score_moderate', 2)) nutritionRisk = 'Moderate';

  const tumorBurden = patient.tumorBurden === 'High (Bulky)';
  // Advanced/metastatic cancer is a cachexia-equivalent regardless of tumorBurden string
  const isAdvancedMetastatic = cancer.includes('metastatic') || cancer.includes('advanced') ||
    (patient.cancerStage || '').toLowerCase().includes('iv') ||
    (patient.cancerStage || '').toLowerCase().includes('stage 4') ||
    (patient.palliativeStage || '').toLowerCase().includes('palliative');

  const cachexia = albumin < fv('albumin_low_threshold', 3.5) || weightLossPercent >= fv('weight_loss_high', 10) || bmi < fv('bmi_low_threshold', 18.5) || crp > 10 || sarcopenia || tumorBurden || isAdvancedMetastatic;
  const moderateRisk = weightLossPercent >= fv('weight_loss_moderate', 5) || ecog >= fv('ecog_moderate_threshold', 2) || age >= fv('age_elderly_threshold', 70);

  let kcalPerKg = fv('kcal_stable', 25); // Tier 1: Baseline Stable
  if (cachexia) {
    kcalPerKg = fv('kcal_cachexia', 35); // Tier 3: Severe / Cachectic
  } else if (moderateRisk) {
    kcalPerKg = fv('kcal_moderate_risk', 30); // Tier 2: Moderate Risk
  }

  if (hasAppetiteLoss) kcalPerKg = Math.max(kcalPerKg, fv('kcal_appetite_loss_floor', 32));

  // ESPEN Oncology 2021 — minimum 28 kcal/kg for active chemo, stable (not cachexia/moderateRisk)
  const activeChemo = regimen && regimen.trim().length > 0;
  if (activeChemo && !cachexia && !moderateRisk) {
    kcalPerKg = Math.max(kcalPerKg, fv('kcal_active_chemo_min', 28));
  }

  const actualIntake = 100 - (reducedFoodIntake || 0);

  // --- MUST SCORE (Malnutrition Universal Screening Tool) ---
  let mustBMIScore = 0;
  if (bmi > 0 && bmi < 18.5) mustBMIScore = 2;
  else if (bmi > 0 && bmi <= 20) mustBMIScore = 1;
  let mustWLScore = 0;
  if (weightLossPercent > 10) mustWLScore = 2;
  else if (weightLossPercent >= 5) mustWLScore = 1;
  const mustAcuteScore = (reducedFoodIntake >= 70 || (activeChemo && cachexia)) ? 2 : 0;
  const mustTotal = mustBMIScore + mustWLScore + mustAcuteScore;
  const mustRisk = mustTotal === 0 ? 'Low Risk' : mustTotal === 1 ? 'Medium Risk' : 'High Risk';

  var proteinPerKg = (cachexia || moderateRisk) ? fv('protein_cachexia', 1.8) : fv('protein_baseline', 1.4);

  // --- STEP 6: SAFETY LAYER (PROTEIN CAP) ---
  if (hasRenalIssue) {
    // KDIGO: strict limit is the highest priority safety rule.
    proteinPerKg = fv('protein_renal', 0.8);
  } else {
    if (age >= fv('age_elderly_threshold', 70) && proteinPerKg < fv('protein_elderly_min', 1.5)) {
      proteinPerKg = fv('protein_elderly_min', 1.5);
    }
    // High catabolism: platinum or FOLFIRINOX or immunotherapy + cachexia/sarcopenia
    if ((regimen.includes('folfirinox') || regimen.includes('platin') || chemFlags.pembrolizumab || regimen.includes('nivolumab') || regimen.includes('atezolizumab') || regimen.includes('durvalumab')) && (cachexia || sarcopenia) && proteinPerKg < fv('protein_high_catabolism', 2.0)) {
      proteinPerKg = fv('protein_high_catabolism', 2.0);
    }
  }

  const baseDailyCalories = Math.round(calcWeight * kcalPerKg);
  const baseDailyProtein = Math.round(calcWeight * proteinPerKg);

  // --- DEFICIT LOGIC ---
  // Full replacement for pure enteral or pure parenteral (no oral component).
  // Combination (Oral+Enteral or Enteral+Parenteral) still uses deficit logic based on intake.
  const feedingMethodLC = (patient.feedingMethod || '').toLowerCase();
  const isPureEnteral = feedingMethodLC.includes('enteral') && !feedingMethodLC.includes('combination') && !feedingMethodLC.includes('oral');
  const isPureTPN = feedingMethodLC.includes('parenteral') && !feedingMethodLC.includes('combination') && !feedingMethodLC.includes('enteral');
  const isFullReplacement = isPureEnteral || isPureTPN;
  
  // No ONS floor — prescribe only when there is an actual deficit.
  // 100% oral intake = no product prescribed.
  const onsFloorKcal = 0;
  const onsFloorProtein = 0;

  const rawDailyCalories = isFullReplacement ? baseDailyCalories : Math.round(baseDailyCalories * (reducedFoodIntake / 100));
  const rawDailyProtein = isFullReplacement ? baseDailyProtein : Math.round(baseDailyProtein * (reducedFoodIntake / 100));

  const dailyCalories = Math.max(rawDailyCalories, onsFloorKcal);
  const dailyProtein = Math.max(rawDailyProtein, onsFloorProtein);

  // Estimate dietary protein from partial oral intake — proportional to the target rate (not a fixed 0.8 g/kg assumption)
  const estimatedDietaryProtein = isFullReplacement ? 0 : Math.round(baseDailyProtein * (actualIntake / 100));

  // Formula bridges the remaining gap to reach 100% protein target
  const prescribedProtein = isFullReplacement ? baseDailyProtein : Math.max(0, baseDailyProtein - estimatedDietaryProtein);

  const totalProteinDelivery = prescribedProtein + estimatedDietaryProtein;

  // totalDailyCalories = the true 24h calorie TARGET (base prescription).
  // dailyCalories = the formula/ONS contribution only (the deficit to be filled).
  const totalDailyCalories = baseDailyCalories;
  const totalDailyProtein = totalProteinDelivery;
  // onsCalories = calorie contribution from formula/ONS (may equal totalDailyCalories for full replacement)
  const onsCalories = dailyCalories;

  const proteinGap = Math.max(0, baseDailyProtein - totalDailyProtein);
  const isGapCritical = (proteinGap / baseDailyProtein) > 0.2;
  
  // --- STEP 5: MICRONUTRIENTS & DRUG INTERACTIONS ---
  const interactions = [];
  if (hasCisplatin) {
    interactions.push({ drug: "Cisplatin", effect: "Renal Magnesium Wasting + Nephrotoxicity", advice: "Mandatory Magnesium protocol; weekly creatinine monitoring. Escalation trigger: Creatinine >1.5 mg/dL = hold Cisplatin." });
    if (isDiabetic) {
      interactions.push({ drug: "Cisplatin + ALA (Diabetic Patient)", effect: "ALA Excluded — Antioxidant Interference", advice: "ALA is contraindicated during Cisplatin cycles. Platinum cytotoxicity relies partly on oxidative stress; ALA antioxidant activity may attenuate efficacy. For peripheral neuropathy management on Cisplatin: use High-potency B-Complex only. Resume ALA consideration after Cisplatin completion with oncology sign-off." });
    }
  }
  if (regimen.includes('taxane') || regimen.includes('paclitaxel') || regimen.includes('docetaxel')) {
    interactions.push({ drug: "Taxanes", effect: "Peripheral Neuropathy focus", advice: "ALA and B-Complex optimized." });
  }
  if (regimen.includes('5-fu') || regimen.includes('capecitabine') || regimen.includes('folfirinox')) {
    interactions.push({ drug: "Fluoropyrimidines", effect: "Mucositis / GI Toxicity risk", advice: "Glutamine and peptide protein prioritized." });
  }
  if (regimen.includes('irinotecan')) {
    interactions.push({ drug: "Irinotecan", effect: "Severe Diarrhea", advice: "Early mucosal support focus." });
  }
  if (chemFlags.bortezomib) {
    interactions.push({ drug: "Bortezomib (Velcade)", effect: "Antioxidant & B6 Interference", advice: "Avoid high-dose Vit C, ALA, and high-dose B6. If ALA is required for neuropathy, restrict to non-Bortezomib days ONLY with oncologist approval." });
  }
  if (regimen.includes('lenalidomide') || regimen.includes('revlimid') || regimen.includes('vrd')) {
    interactions.push({ drug: "Lenalidomide (Revlimid)", effect: "VTE/Antiplatelet Risk", advice: "Monitor Omega-3 dosing due to mild antiplatelet effects." });
  }
  if (regimen.includes('pemetrexed') || regimen.includes('methotrexate')) {
    interactions.push({ drug: "Antifolates (e.g. Pemetrexed)", effect: "Folate Antagonism", advice: "Strict adherence to explicit folate supplementation protocol required." });
  }
  if (chemFlags.pembrolizumab) {
    interactions.push({ drug: "Pembrolizumab (Keytruda)", effect: "Immune-Related Enterocolitis/Thyroiditis", advice: "Monitor for diarrhea >3/day or severe fatigue. Measure TSH every cycle." });
  }
  if (hasPelvicRadiation) {
    interactions.push({ drug: "Pelvic / Abdominal Radiation", effect: "Radiation Enteritis — Mucosal Barrier Disruption", advice: "Small bowel mucosa compromised. Formula MUST be peptide-based or hydrolysed whey (pre-digested) to bypass impaired enzymatic digestion. Low-residue carbohydrate source required — avoid Palatinose / intact disaccharides. If brachytherapy planned: elemental formula may be required peri-procedure. Reassess formula type at each radiation fraction milestone (10 Gy, 20 Gy, completion)." });
  }
  if (chemFlags.rchop) {
    interactions.push({ drug: "Doxorubicin — R-CHOP Anthracycline", effect: "Antioxidant Contraindication (All Cycles)", advice: "Doxorubicin cytotoxicity depends on reactive oxygen species generation. ALA and Vitamin C >500 mg/day are CONTRAINDICATED for the entire R-CHOP course. Unlike AC→Taxane sequential regimens, R-CHOP is a single combined infusion — no agent can be phase-separated. This prohibition applies from Cycle 1 through completion." });
    interactions.push({ drug: "Vincristine — R-CHOP", effect: "Peripheral Neuropathy + B6 Toxicity Risk", advice: "B6 STRICTLY CAPPED at <100 mg/day in any B-Complex prescribed — high-dose B6 paradoxically worsens Vincristine-induced peripheral neuropathy. ALA (alpha-lipoic acid) CANNOT be prescribed for neuropathy prevention as Doxorubicin co-administration in R-CHOP (combined single infusion) makes phase-separation impossible throughout the entire treatment course." });
    interactions.push({ drug: "Prednisolone — R-CHOP Corticosteroid", effect: "Steroid-Induced Hyperglycaemia", advice: "Prednisolone drives post-prandial insulin resistance — most severe 4–8 hours after dose. Blood glucose monitoring MANDATORY before and 2h after each Prednisolone dose. Fat restricted to <30% of total calories when T2DM + BS ≥180 mg/dL co-present. Endocrinology referral MANDATORY in confirmed T2DM or HbA1c ≥6.5%." });
  }
  if (chemFlags.olaparib) {
    interactions.push({ drug: "Olaparib (Lynparza) — PARP Inhibitor", effect: "Anaemia + GI Toxicity + Fat-Soluble Vitamin Absorption Risk", advice: "Olaparib commonly causes Grade 1–2 anaemia (CBC every 4 weeks mandatory), nausea/vomiting (small frequent meals, anti-emetic timing with meals), and fatigue. Fat-soluble vitamins (A, D, E, K) may be affected by GI side effects. Vitamin D monitoring every 8 weeks. High-antioxidant supplements (high-dose Vit C, NAC) should be used cautiously — discuss with oncologist as PARP inhibitor efficacy relies partly on DNA damage accumulation. Avoid grapefruit (CYP3A4 interaction with Olaparib)." });
  }
  if (chemFlags.gemcitabine) {
    interactions.push({ drug: "Gemcitabine", effect: "Myelosuppression + Hepatotoxicity + Fluid Retention", advice: "Gemcitabine causes significant myelosuppression (CBC weekly) — neutropenia protocol active if WBC <3500. Liver enzymes (ALT/AST) must be monitored every cycle; bilirubin elevation is common in biliary/pancreatic cancers. Fluid retention may occur — monitor weight and sodium. Protein adequacy (≥1.4 g/kg) is critical to counteract catabolism during Gemcitabine cycles." });
  }
  if (chemFlags.nivolumab || chemFlags.durvalumab || chemFlags.atezolizumab) {
    const ioAgent = chemFlags.nivolumab ? 'Nivolumab' : chemFlags.durvalumab ? 'Durvalumab' : 'Atezolizumab';
    interactions.push({ drug: `${ioAgent} — Checkpoint Inhibitor`, effect: "Immune-Related Adverse Events (irAEs) + TSH Mandatory", advice: `TSH monitoring every treatment cycle is MANDATORY. Immune enterocolitis risk — diarrhoea >3/day requires immediate escalation. Fatigue assessment must rule out immune thyroiditis before attributing to chemotherapy. If fatigue present and TSH not available: clinical hold on attribution pending thyroid panel.` });
  }
  if (chemFlags.bevacizumab) {
    interactions.push({ drug: "Bevacizumab (Avastin) — Anti-VEGF", effect: "Wound Healing Impairment + Protein Demand + Thrombosis Risk", advice: "Protein adequacy is clinically critical — bevacizumab impairs wound healing and demands higher protein for tissue integrity (minimum 1.4 g/kg, target 1.8 g/kg if cachexia present). Omega-3 >3 g/day should be reviewed — mild antiplatelet effect may compound bevacizumab thrombosis/bleeding risk. Blood pressure monitoring with each nutrition assessment." });
  }

  const micronutrients = {
    vitD: `${fv(gender === 'female' ? 'micro_vitd_rda_female' : 'micro_vitd_rda_male', 600)} IU/day (FSSAI/ICMR-NIN 2020 RDA)`,
    vitC: `${fv(gender === 'female' ? 'micro_vitc_rda_female' : 'micro_vitc_rda_male', gender === 'female' ? 65 : 80)} mg/day (ICMR-NIN RDA)`,
    zinc: `${fv(gender === 'female' ? 'micro_zinc_maintenance_female' : 'micro_zinc_maintenance_male', gender === 'female' ? 10 : 12)} mg/day (FSSAI/ICMR-NIN 2020 RDA)`,
    omega3: (crp > 5 || cachexia || cancer.includes('pancreatic') || cancer.includes('biliary') || cancer.includes('cholangiocarcinoma'))
      ? `${fv('micro_omega3_high', 3)} g/day`
      : `${fv('micro_omega3_standard', 2)} g/day`,
    epa: (() => {
      if (isAdvancedMetastatic || cancer.includes('pancreatic') || cancer.includes('biliary') || cancer.includes('cholangiocarcinoma'))
        return `${fv('micro_epa_high', 3.0)} g EPA/day`;
      if (cachexia || tumorBurden)
        return `${fv('micro_epa_low', 2.2)} g EPA/day`;
      return 'None';
    })(),
    leucine: (sarcopenia || tumorBurden || ecog >= 2)
      ? `${fv('micro_leucine_high', 5)} g/day`
      : `${fv('micro_leucine_standard', 3)} g/day`,
    glutamine: (patient.giIssues || hasMucositis || hasNausea || regimen.includes('folfirinox') || hasIBD || hasPelvicRadiation)
      ? (tumorBurden ? `${fv('micro_glutamine_daily', 16)} g/day — MDT REVIEW REQUIRED (High Tumor Burden)` : `${fv('micro_glutamine_daily', 16)} g/day`)
      : 'Consider if GI toxicity persists',
    bcaa: (alt > 50 || ast > 50 || bilirubin > 1.2)
      ? `${fv('micro_bcaa_hepatic', 20)} g/day for Hepatic Protection`
      : (sarcopenia ? `${fv('micro_bcaa_sarcopenia', 10)} g/day` : null),
    magnesium: `${fv(gender === 'female' ? 'micro_magnesium_maintenance_female' : 'micro_magnesium_maintenance_male', gender === 'female' ? 310 : 340)} mg/day (FSSAI/ICMR-NIN 2020 RDA)`,
    bComplex: (() => {
      if (chemFlags.vincristine) return 'B-Complex — B6 STRICTLY CAPPED at <100 mg/day (Vincristine neuropathy protocol: high-dose B6 paradoxically worsens peripheral neuropathy)';
      if (regimen.includes('pemetrexed') || regimen.includes('methotrexate')) return `B12 ${fv('micro_vitb12_protocol', 1000)} mcg/day MANDATORY (Pemetrexed/Antifolate protocol — reduces haematological and GI toxicity per oncology guideline). B6 standard dose.`;
      if (regimen.includes('taxane') || regimen.includes('folfirinox')) return 'High-potency B-Complex';
      return 'Standard dose';
    })(),
    folate: (() => {
      const markers = (patient.genomicMarkers || []);
      const hasMthfr = markers.some(m => m.includes('MTHFR'));
      if (hasMthfr) return `${fv('micro_folate_protocol', 5)} mg/day (Methylfolate — MTHFR variant)`;
      // Pemetrexed/Methotrexate: mandatory prophylactic dose regardless of baseline folate
      if (regimen.includes('pemetrexed') || regimen.includes('methotrexate')) return `${fv('micro_folate_protocol', 5)} mg/day MANDATORY — Antifolate Protocol (prophylactic cytotoxicity protection; must begin 7 days before first dose; applies regardless of baseline serum folate level)`;
      // Lab-confirmed deficiency or anaemia → correction dose
      if ((patient.folate > 0 && patient.folate < fv('micro_folate_lab_threshold', 3)) || hemoglobin < fv('hemoglobin_anemia', 10)) return `${fv('micro_folate_correction', 5)} mg/day (Deficiency correction)`;
      // Adequate baseline → FSSAI RDA maintenance
      return `${fv(gender === 'female' ? 'micro_folate_maintenance_female' : 'micro_folate_maintenance_male', 400)} mcg/day (Maintenance — FSSAI RDA)`;
    })(),
    chromium: `${fv(gender === 'female' ? 'micro_chromium_rda_female' : 'micro_chromium_rda_male', gender === 'female' ? 25 : 33)} mcg/day (ICMR-NIN 2020 RDA)`,
    ala: (() => {
      if (chemFlags.bortezomib || chemFlags.ac || chemFlags.rchop || hasPlatinum) return null;
      if (hasPelvicRadiation) return null;
      const hasNeuropathy = sideEffects.some(s => (s || '').toLowerCase().includes('neuropathy'));
      const isTaxane = chemFlags.taxane || regimen.includes('paclitaxel') || regimen.includes('docetaxel');
      if (!isDiabetic && isTaxane && hasNeuropathy) return `${fv('micro_ala_low', 300)} mg/day — peripheral neuropathy prevention (taxane phase only; suspend if regimen changes to anthracycline)`;
      if (isDiabetic && isTaxane) return `${fv('micro_ala_high', 600)} mg/day — glycaemic neuropathy support (taxane phase; suspend if regimen changes)`;
      return null;
    })(),
    microbiome: hasNeutropenia ? 'Soluble Fiber ONLY — PROBIOTICS STRICTLY CONTRAINDICATED (active neutropenia/WBC <3500)' : ((regimen.includes('folfirinox') || hasIBD) ? 'Soluble Fiber + Probiotic' : null),
    iron: (hemoglobin > 0 && hemoglobin < fv('hemoglobin_anemia', 10)) ? `${fv('micro_iron_correction', 100)} mg elemental iron + B12 support — HOLD pending iron panel (Ferritin, Serum Iron, TIBC, Transferrin Saturation)` : null,

    // ── Group 1: High-Risk Antioxidants ──────────────────────────────────────
    // Context-based restriction — never a blanket ban; differentiate deficiency correction vs pharmacological dosing

    glutathione: (() => {
      if (chemFlags.ac || chemFlags.rchop) return 'CONTRAINDICATED during anthracycline cycles — high-dose glutathione reduces Doxorubicin ROS-dependent cytotoxicity. Dietary sources (cruciferous vegetables) permitted. Reassess after treatment completion.';
      if (hasPlatinum) return 'RESTRICTED during platinum-based chemotherapy — antioxidant activity may attenuate cisplatin efficacy. Pharmacological dosing contraindicated. Resume consideration post-treatment with oncologist sign-off.';
      if (hasPelvicRadiation) return 'RESTRICTED during active radiation — antioxidant supplementation may reduce radiation cytotoxicity. Dietary glutathione sources acceptable. Review after radiation completion.';
      if (activeChemo) return 'CAUTION during active chemotherapy — high-dose glutathione supplementation not recommended without oncologist approval. Physiological dietary sources acceptable.';
      return 'May be considered post-treatment for recovery support with oncologist review.';
    })(),

    vitE: (() => {
      const viteRda = fv(gender === 'female' ? 'micro_vite_dose_female' : 'micro_vite_dose_male', gender === 'female' ? 12 : 15);
      if (chemFlags.ac || chemFlags.rchop || hasPlatinum) return `${viteRda} mg/day (ICMR-NIN RDA) — High-dose (>400 IU/day) RESTRICTED during platinum/anthracycline chemotherapy.`;
      if (hasPelvicRadiation) return `${viteRda} mg/day (ICMR-NIN RDA) — High-dose (>400 IU/day) restricted during active radiation.`;
      if (activeChemo) return `${viteRda} mg/day (ICMR-NIN RDA) — High-dose (>400 IU/day) requires oncologist approval during active chemotherapy.`;
      return `${viteRda} mg/day (ICMR-NIN RDA)`;
    })(),

    nac: (() => {
      if (chemFlags.ac || chemFlags.rchop || hasPlatinum) return 'CONTRAINDICATED during platinum/anthracycline chemotherapy — NAC is a potent glutathione precursor; antioxidant activity may reduce ROS-dependent cytotoxicity. Resume consideration only after chemotherapy completion with oncologist sign-off.';
      if (hasPelvicRadiation) return 'RESTRICTED during active radiation — NAC antioxidant activity may reduce radiation efficacy. Review at radiation completion.';
      if (activeChemo) return 'RESTRICTED during active chemotherapy — NAC antioxidant mechanism not recommended without oncologist approval. Not for concurrent use with most cytotoxic regimens.';
      return 'May be considered post-treatment with oncologist approval.';
    })(),

    coenzymeQ10: (() => {
      if (chemFlags.ac || chemFlags.rchop) return 'RESTRICTED during active anthracycline cycles — CoQ10 antioxidant activity may reduce Doxorubicin efficacy. NOTE: CoQ10 is sometimes used POST-anthracycline for cardioprotection — discuss timing with cardiologist/oncologist after treatment completion.';
      if (activeChemo) return 'Use with caution during active chemotherapy — antioxidant activity. Discuss with oncologist before prescribing. Not recommended concurrently with most cytotoxic regimens without explicit oncology approval.';
      return 'May be considered for cardioprotection post-anthracycline or during non-antioxidant-sensitive regimens with oncologist review.';
    })(),

    // ── Group 2: Conditional Use ──────────────────────────────────────────────

    selenium: (() => {
      const rdaDose = fv(gender === 'female' ? 'micro_selenium_rda_female' : 'micro_selenium_rda_male', 40);
      const pharmaMax = fv('micro_selenium_pharma_max', 200);
      if (chemFlags.ac || chemFlags.rchop || hasPlatinum) return `${rdaDose} mcg/day (ICMR-NIN 2020 RDA) — Pharmacological doses (>${pharmaMax} mcg/day) RESTRICTED during platinum/anthracycline chemotherapy.`;
      if (activeChemo) return `${rdaDose} mcg/day (ICMR-NIN 2020 RDA) — Pharmacological doses (>${pharmaMax} mcg/day) require oncologist approval during active treatment.`;
      return `${rdaDose} mcg/day (ICMR-NIN 2020 RDA)`;
    })(),

    curcumin: (() => {
      if (regimen.includes('taxane') || regimen.includes('paclitaxel') || regimen.includes('docetaxel') || regimen.includes('imatinib') || regimen.includes('erlotinib') || regimen.includes('gefitinib')) return 'RESTRICTED — Curcumin inhibits CYP3A4 and may increase toxicity or alter plasma levels of taxanes and targeted agents (imatinib, erlotinib, gefitinib). Contraindicated during active taxane-based or targeted therapy regimens. Food-form turmeric in cooking is acceptable.';
      if (hasPelvicRadiation) return 'RESTRICTED during active radiation — curcumin antioxidant activity may reduce radiation cytotoxicity. Food-form turmeric in cooking is acceptable. Resume pharmacological supplementation after radiation completion with oncologist review.';
      if (activeChemo) return 'Use with caution — potential CYP3A4 interaction may affect drug metabolism. Food-form turmeric (cooking) acceptable. Pharmacological curcumin supplementation: discuss with oncologist before use during active treatment.';
      return 'Food-form turmeric acceptable. Pharmacological curcumin supplementation: discuss with oncologist. Monitor for CYP3A4 interactions if on concurrent medications.';
    })(),

    greenTea: (() => {
      if (chemFlags.bortezomib) return 'STRICTLY CONTRAINDICATED — Green tea catechins (EGCG) directly inhibit Bortezomib proteasome inhibition, reducing drug efficacy. Avoid ALL green tea supplements and high-concentration green tea beverages during entire Bortezomib course.';
      if (hasPelvicRadiation) return 'RESTRICTED during active radiation — EGCG antioxidant activity may reduce radiation cytotoxicity. Brewed tea (1 cup/day max) may be acceptable; concentrated extract strictly avoided. Resume after radiation completion.';
      if (activeChemo) return 'RESTRICTED — Green tea extract (high EGCG) has significant antioxidant activity. Avoid concentrated green tea extract supplements during active chemotherapy. Brewed green tea (1–2 cups/day) is generally acceptable — discuss with oncologist.';
      return 'Brewed green tea (1–2 cups/day) acceptable. Avoid concentrated green tea extract supplements. Monitor for interactions with anticoagulants (mild antiplatelet effect).';
    })(),

    // ── Vitamin B12 (standalone — Group 3 Essential) ─────────────────────────
    vitB12: (() => {
      if (regimen.includes('pemetrexed') || regimen.includes('methotrexate')) return `${fv('micro_vitb12_protocol', 1000)} mcg/day MANDATORY — Pemetrexed/antifolate protocol. Must begin at least 7 days before first dose and continue throughout treatment to prevent haematological and GI toxicity.`;
      return `${fv(gender === 'female' ? 'micro_vitb12_maintenance_female' : 'micro_vitb12_maintenance_male', 500)} mcg/day (Maintenance — FSSAI/ICMR-NIN 2020 RDA)`;
    })(),

    // ── B Vitamins — Individual RDA Maintenance ───────────────────────────────
    thiamine: `${fv(gender === 'female' ? 'micro_thiamine_rda_female' : 'micro_thiamine_rda_male', gender === 'female' ? 1.1 : 1.4)} mg/day (Maintenance — FSSAI RDA)`,
    riboflavin: `${fv(gender === 'female' ? 'micro_riboflavin_rda_female' : 'micro_riboflavin_rda_male', gender === 'female' ? 1.5 : 1.9)} mg/day (Maintenance — FSSAI RDA)`,
    niacin: `${fv(gender === 'female' ? 'micro_niacin_rda_female' : 'micro_niacin_rda_male', gender === 'female' ? 12 : 16)} mg NE/day (Maintenance — FSSAI RDA)`,
    vitB6: `${fv(gender === 'female' ? 'micro_vitb6_rda_female' : 'micro_vitb6_rda_male', 1.6)} mg/day (Maintenance — FSSAI RDA)${chemFlags.vincristine ? ' — STRICT CAP: do not exceed this dose on Vincristine protocol (high-dose B6 worsens peripheral neuropathy)' : ''}`,
    iodine: `${fv(gender === 'female' ? 'micro_iodine_rda_female' : 'micro_iodine_rda_male', 150)} mcg/day (Maintenance — FSSAI RDA; covered by iodised salt in most diets)`,

    // ── Vitamin K ─────────────────────────────────────────────────────────────
    vitA: `${fv(gender === 'female' ? 'micro_vita_rda_female' : 'micro_vita_rda_male', gender === 'female' ? 700 : 900)} mcg RAE/day (ICMR-NIN 2020 RDA)`,
    vitK: `${fv(gender === 'female' ? 'micro_vitk_rda_female' : 'micro_vitk_rda_male', 55)} mcg/day (Maintenance — FSSAI RDA; maintain CONSISTENT daily intake if on anticoagulant therapy — fluctuations alter INR)`,

    // ── Electrolytes & Fiber ──────────────────────────────────────────────────
    sodium: hasRenalIssue
      ? `Restrict to ≤1500 mg/day (Renal impairment — sodium restriction required per KDIGO/ESPEN)`
      : `≤${fv(gender === 'female' ? 'micro_sodium_ai_female' : 'micro_sodium_ai_male', 2000)} mg/day (AI upper limit — FSSAI/WHO; restrict further if hypertension, cardiac disease, or ascites present)`,
    potassium: hasCisplatin
      ? `Target ${fv(gender === 'female' ? 'micro_potassium_ai_female' : 'micro_potassium_ai_male', 3500)} mg/day dietary intake — MONITOR serum potassium closely (cisplatin-induced hypokalemia risk; IV supplementation may be required if loop diuretics co-prescribed)`
      : `${fv(gender === 'female' ? 'micro_potassium_ai_female' : 'micro_potassium_ai_male', 3500)} mg/day (AI — FSSAI/ICMR-NIN; dietary sources preferred: banana, coconut water, legumes, leafy greens)`,
    fiber: hasNeutropenia
      ? `${fv(gender === 'female' ? 'micro_fiber_rda_female' : 'micro_fiber_rda_male', gender === 'female' ? 25 : 30)} g/day — SOLUBLE FIBER ONLY (active neutropenia; avoid raw fruit, vegetables, and insoluble fiber; see Microbiome guidance)`
      : `${fv(gender === 'female' ? 'micro_fiber_rda_female' : 'micro_fiber_rda_male', gender === 'female' ? 25 : 30)} g/day (AI — FSSAI/ICMR-NIN; favour soluble sources if GI toxicity; whole grains, legumes, fruits, vegetables)`
  };

  micronutrients.calcium = `${fv(gender === 'female' ? 'micro_calcium_rda_female' : 'micro_calcium_rda_male', 600)} mg/day (FSSAI/ICMR-NIN 2020 RDA)`;

  // Iron: standalone correction only on confirmed/suspected anaemia (Hb < 12); monitoring flag for all active chemo
  if (hemoglobin > 0 && hemoglobin < 10) {
    micronutrients.iron = '100 mg elemental iron + B12 support — HOLD pending iron panel (Ferritin, Serum Iron, TIBC, Transferrin Saturation)';
  } else if (hemoglobin > 0 && hemoglobin < 12 && activeChemo) {
    micronutrients.iron = 'Borderline anaemia detected (Hb ' + hemoglobin + ' g/dL). Iron panel (Ferritin, Serum Iron, TIBC) recommended before supplementing — functional/inflammatory anaemia must be excluded. Hold empirical iron pending results.';
  }

  // --- STEP 6: VERSIONED SAFETY ENGINE ---
  const safetyStatus = {
    renal: { level: 'info', message: 'Renal Safety: Normal (CR < 1.3)' },
    metabolic: { level: 'info', message: 'Metabolic Safety: Stable BS (< 180)' },
    electrolyte: { level: 'info', message: 'Electrolyte Safety: Standard formula (Na/K normal)' },
    drug: { level: 'info', message: 'Drug Interference: No major antioxidants flagged' },
    escalation: { level: 'info', message: 'Escalation Status: Standard oral intake' },
    deficit: { level: 'info', message: 'Deficit Monitoring: Gap fully covered by prescription' },
    composition: { level: 'info', message: 'Body Composition: No immediate imaging flags.' },
    neutropenia: { level: 'info', message: 'Neutropenia: WBC within acceptable range' },
    steroidGlycemic: { level: 'info', message: 'Steroid Glycaemia: Not applicable' }
  };

  // --- SMI / Composition Safety Order ---
  if (smi > 0 && isL3SMI) {
     const isAtSarcopeniaBoundary = (gender === 'female' ? (smi >= 38 && smi <= 41) : (smi >= 52 && smi <= 55));
     if (isAtSarcopeniaBoundary || sarcopenia) {
         safetyStatus.composition = { 
             level: 'warning', 
             message: `SARCOPENIA RISK: SMI ${smi} cm²/m² detected. [MANDATORY] CT L3 imaging order required to confirm algorithmic estimate and baseline muscle mass.` 
         };
     }
  }

  // Neutropenia safety
  if (hasSevereNeutropenia) {
    safetyStatus.neutropenia = { level: 'danger', message: `SEVERE NEUTROPENIA (WBC ${wbc} ×10³/µL): Raw foods, unpasteurised products, and live cultures CONTRAINDICATED. Formula must be commercially sterile. PROBIOTICS STRICTLY CONTRAINDICATED. Immediate G-CSF eligibility assessment by oncology. Fever ≥38°C = emergency protocol — do not defer.` };
  } else if (hasNeutropenia) {
    safetyStatus.neutropenia = { level: 'warning', message: `NEUTROPENIA RISK (WBC ${wbc} ×10³/µL): Strict food safety protocol — no raw foods or live cultures. Formula must be commercially sterile. PROBIOTICS CONTRAINDICATED. G-CSF eligibility review recommended. Monitor temperature daily.` };
  }

  // Steroid-induced hyperglycaemia
  if (hasTripleTrigger) {
    safetyStatus.steroidGlycemic = { level: 'danger', message: `STEROID-INDUCED HYPERGLYCAEMIA — TRIPLE TRIGGER: Prednisolone + T2DM + Blood Sugar ${bloodSugar} mg/dL + HbA1c ${patient.hba1c || '?'}%. Fat CAPPED at 30% of total calories. Blood glucose monitoring MANDATORY before and 2h after every Prednisolone dose. ENDOCRINOLOGY REFERRAL MANDATORY.` };
  } else if (chemFlags.steroid && isDiabetic) {
    safetyStatus.steroidGlycemic = { level: 'warning', message: `STEROID GLYCAEMIA WATCH: Prednisolone + confirmed T2DM. Monitor blood glucose before each Prednisolone dose. Endocrinology review recommended.` };
  }

  if (creatinine > 1.3) {
    safetyStatus.renal = { level: 'danger', message: `CRITICAL RENAL ALERT: Creatinine ${creatinine} is elevated. Protein strictly restricted to 0.8g/kg.` };
  } else if (creatinine >= 1.2 && hasCisplatin) {
    safetyStatus.renal = { level: 'warning', message: `RENAL BORDERLINE (Cisplatin): Creatinine ${creatinine} mg/dL — at/near upper safety threshold on a nephrotoxic platinum agent. Weekly creatinine monitoring mandatory each cycle. Escalation trigger: Creatinine >1.5 mg/dL = hold Cisplatin and escalate to nephrology. Do not dose-reduce protein without confirmed GFR decline.` };
  } else if (creatinine < 0.6) {
    safetyStatus.renal = { level: 'warning', message: 'LOW CREATININE ALERT: Potential muscle wasting; verify SMI/Grip.' };
  }

  if (bloodSugar > 180 || (isDiabetic && bloodSugar > 140)) {
    safetyStatus.metabolic = { level: 'danger', message: `HYPERGLYCEMIA ALERT: Blood Sugar ${bloodSugar}. Diabetic protocol active.` };
    if (!patient.hba1c || patient.hba1c === 0) {
      safetyStatus.metabolic.level = 'danger';
      safetyStatus.metabolic.message += " [CRITICAL] HbA1c missing; glycemic control depth unknown. Immediate Hba1c screening required.";
    }
  }

  // ECOG vs Activity Contradiction
  if (ecog === 0 && (patient.activityLevel || '').toLowerCase().includes('sedentary')) {
    safetyStatus.metabolic = { level: 'warning', message: "CLINICAL CONTRADICTION: ECOG 0 (Fully Active) vs Sedentary activity. [SAFETY] Verify patient performance status." };
  }

  if (patient.sodium > 0 && patient.sodium < 135) {
    const naLevel = patient.sodium < 130 ? 'danger' : 'warning';
    safetyStatus.electrolyte = { level: naLevel, message: `HYPONATREMIA ALERT: Sodium ${patient.sodium}. Target 1-2g NaCl; [SAFETY] Cap correction at +8–10 mEq/L per 24 hours to avoid ODS.` };
  } else if (patient.potassium > 5.0) {
    const kLevel = patient.potassium > 5.5 ? 'danger' : 'warning';
    safetyStatus.electrolyte = { level: kLevel, message: `HYPERKALEMIA ALERT: Potassium ${patient.potassium}. Low-K formulation required.` };
  }

  // --- Enhanced Drug Detection (Step 6 Safety) ---
  if (chemFlags.platin || chemFlags.bortezomib || chemFlags.pembrolizumab || chemFlags.ac) {
    let msg = `DRUG INTERACTION: ${drugs.join(', ') || 'High-risk regimen'} protocol monitored.`;
    
    // Check for existing supplements AND system prescriptions
    const existingSupplements = (Array.isArray(patient.existingSupplements) ? patient.existingSupplements : []).map(s => s.toLowerCase());
    const hasExistingVitC = existingSupplements.some(s => s.includes('vitamin c') || s.includes('ascorbic'));
    const hasExistingALA = existingSupplements.some(s => s.includes('alpha lipoic acid') || s.includes('ala'));
    
    const isPrescribingHighVitC = (micronutrients.vitC && parseInt(micronutrients.vitC) > 500);
    const isPrescribingALA = (micronutrients.ala && micronutrients.ala !== 'None' && micronutrients.ala !== null);

    if (chemFlags.pembrolizumab) {
      safetyStatus.drug = { level: 'warning', message: "IMMUNOTHERAPY ALERT: Pembrolizumab detected. [REQUIRED] Monitor for Immune-Related Adverse Events (irAEs) including Thyroiditis and Enterocolitis." };
      if (tsh === 0 || isNaN(tsh)) {
         safetyStatus.drug.level = 'danger';
         safetyStatus.drug.message += " [CRITICAL] TSH missing; mandatory investigation for immunotherapy patients.";
      }
    }

    if (chemFlags.rchop) {
      // R-CHOP: single combined infusion — no phase-separation possible between Doxorubicin and other agents
      let rcMsg = "R-CHOP ANTIOXIDANT CONTRAINDICATION: Doxorubicin (anthracycline) is co-administered with all R-CHOP agents in a single combined infusion — phase-separation is NOT possible. ALA EXCLUDED for ALL R-CHOP cycles (Doxorubicin oxidative mechanism). VitC CAPPED at 500 mg/day, HOLD on every infusion day. Vincristine neuropathy must be managed with B6-capped B-Complex only — ALA cannot be substituted due to Doxorubicin co-administration.";
      if (hasExistingVitC || hasExistingALA) {
        rcMsg += " [ACTION REQUIRED] Existing antioxidant supplements detected — must be fully suspended before and during all R-CHOP cycles.";
        safetyStatus.drug = { level: 'danger', message: rcMsg };
      } else {
        safetyStatus.drug = { level: 'warning', message: rcMsg };
      }
    } else if (chemFlags.ac) {
      let acMsg = "AC SAFETY ALERT: Adriamycin (Doxorubicin) detected. Antioxidants attenuate oxidative cytotoxicity. ALA suspended for AC cycle. VitC capped at 500mg — HOLD on infusion days; resume inter-cycle only with oncologist sign-off.";
      if (hasExistingVitC || hasExistingALA) {
        acMsg += " [ACTION REQUIRED] Patient carries existing antioxidant supplements — instruct suspension on infusion days.";
        safetyStatus.drug = { level: 'danger', message: acMsg };
      } else {
        safetyStatus.drug = { level: 'warning', message: acMsg };
      }
    }

    if (chemFlags.bortezomib) {
      if (hasExistingVitC || hasExistingALA || isPrescribingHighVitC || isPrescribingALA) {
        safetyStatus.drug = { level: 'danger', message: "CRITICAL DRUG CLASH: High-dose antioxidants (Vit C/ALA) found. Neutralizes Bortezomib efficacy. Discontinue immediately." };
      } else {
        safetyStatus.drug = { level: 'warning', message: msg + " Antioxidant cap (Vit C < 500mg, No ALA) enforced." };
      }
    } 
  } else {
    safetyStatus.drug = { level: 'info', message: 'Drug Interference: Screened for major antioxidant-chemo clashes (Bortezomib/Cisplatin/Immunotherapy). No flags.' };
  }

  // EN escalation is reflected in prescribedRoute and rationale — no separate alert banner needed

  // Compound malnutrition: upgrade warning escalation to danger when ≥3 severe risk factors co-present
  if (safetyStatus.escalation && safetyStatus.escalation.level === 'warning') {
    const compoundFactors = [
      cachexia,
      sarcopenia,
      albumin > 0 && albumin < 3.0,
      prealbumin > 0 && prealbumin < 18,
      hasMucositis,
      hasNausea,
      ecog >= 2,
      sideEffects.some(s => s.includes('swallow') || s.includes('dysphagia') || s.includes('fatigue'))
    ].filter(Boolean).length;
    if (compoundFactors >= 3) {
      safetyStatus.escalation.level = 'danger';
      safetyStatus.escalation.message = `EN_ESCALATION_MANDATORY [HIGH]: Intake ${actualIntake}% with ${compoundFactors} concurrent high-risk factors (cachexia/sarcopenia/hypoalbuminaemia/GI toxicity/ECOG≥2/dysphagia). Immediate nasogastric (NG) or nasoduodenal (ND) tube feeding required. 3-day reassessment window is a bridge only — not a deferral of enteral initiation.`;
    }
  }

  if (reducedFoodIntake > 50) {
    safetyStatus.deficit = { level: 'warning', message: `HIGH DEFICIT ALERT: ${reducedFoodIntake}% intake gap. Prescription covers full deficit.` };
  }
  
  // New Safety Check: Missing HbA1c in high-risk glycemic cases
  if ((isDiabetic || bloodSugar > 180) && (!patient.hba1c || patient.hba1c === 0)) {
     safetyStatus.hba1c = { level: 'warning', message: `SCREENING REQ: Glucose ${bloodSugar}mg/dL detected without HbA1c record. Glycemic control depth unknown.` };
  }

  // --- NEW: CLINICAL PROTOCOLS (TRANSITION & FOLLOW-UP) ---
  const enteralProtocol = (actualIntake < 50) ? {
    type: "Isocaloric / High-Protein Enteral Formula",
    dosage: `Initial: 20-25 ml/hr continuously; Target: ${Math.round(dailyCalories/24)} ml/hr`,
    transition: "Day 1-2: Trophic feeding. Day 3: Achieve 100% target volume. If tolerated, transition ONS to meal-replacement only.",
    rationale: `Intake ${actualIntake}% — below 50% threshold. Escalation to enteral nutrition initiated.`
  } : null;

  const electrolyteStrategy = {
    potassium: (patient.potassium > 5.0) ? "STRICT LIMIT: < 40 mEq/day" : "Maintenance: 60-80 mEq/day",
    sodium: (patient.sodium > 0 && patient.sodium < 135) ? "CORRECTION: NaCl 1-2g target; Target Na 135-140" : "Maintenance: 100-150 mEq/day",
    fluids: `Daily target: ${Math.round(weight * fv('fluid_min_per_kg', 30))} - ${Math.round(weight * fv('fluid_max_per_kg', 35))} ml/day (inclusive of formula)`
  };

  const reassessmentProtocol = {
    frequency: (nutritionRisk === 'High' || ecog >= 3) ? "Weekly" : "Bi-weekly",
    markers: (sarcopenia || isL3SMI) ? "Weight, Serum Albumin, CRP, Hand Grip Strength, CT L3 Imaging confirmation" : "Weight, Serum Albumin, CRP, Hand Grip Strength",
    rationale: `High metabolic risk (${nutritionRisk}) requires rapid monitoring window.`
  };

  // Convert to array for the report renderer
  safetyAlerts = Object.values(safetyStatus);
  
  // Adaptive Servings: Increase frequency for high calorie/low appetite to decrease per-serving volume
  let servingsPerDay = Math.round(fv('servings_base', 3));
  if (dailyCalories >= fv('servings_high_threshold', 1800) || hasAppetiteLoss || hasNausea) servingsPerDay = Math.round(fv('servings_high_count', 4));
  if (dailyCalories >= fv('servings_very_high_threshold', 2400)) servingsPerDay = Math.round(fv('servings_very_high_count', 5));

  // Integer division so perServingCalories * servingsPerDay === onsCalories exactly (no rounding drift)
  const perServingCalories = Math.round(dailyCalories / servingsPerDay);
  const perServingProtein = Math.round(dailyProtein / servingsPerDay);

  const proteinCalories = dailyProtein * 4;
  const remainingCalories = Math.max(0, dailyCalories - proteinCalories);
  
  const carbRatio = (crp > 5 || isDiabetic) ? fv('carb_ratio_diabetic', 0.35) : fv('carb_ratio_standard', 0.45);
  let dailyCarbs = Math.floor((remainingCalories * carbRatio) / 4);
  const carbCalories = dailyCarbs * 4;

  const fatCalories = remainingCalories - carbCalories;
  let dailyFat = Math.round((fatCalories / 9) * 10) / 10;

  // NAFLD/Fatty Liver Disease: enforce fat ceiling at 30% of total daily calories
  const hasNAFLD = lowerComorbidities.some(c => c.includes('fatty liver') || c.includes('nafld') || c.includes('nash'));
  if (hasNAFLD) {
    const maxFatKcal = dailyCalories * 0.30;
    if (dailyFat * 9 > maxFatKcal) {
      const excessFatKcal = (dailyFat * 9) - maxFatKcal;
      dailyFat = Math.round((maxFatKcal / 9) * 10) / 10;
      dailyCarbs = Math.round(dailyCarbs + excessFatKcal / 4);
    }
  }

  // Steroid-induced hyperglycaemia (triple trigger): fat capped at 30% of total calories
  // Prednisolone + T2DM + BS ≥180 → mandatory macro redistribution per ESPEN/endocrine protocol
  if (hasTripleTrigger) {
    const maxFatKcalSteroid = dailyCalories * 0.30;
    if (dailyFat * 9 > maxFatKcalSteroid) {
      const excessKcal = (dailyFat * 9) - maxFatKcalSteroid;
      dailyFat = Math.round((maxFatKcalSteroid / 9) * 10) / 10;
      dailyCarbs = Math.round(dailyCarbs + excessKcal / 4);
    }
  }

  // T2DM fat ceiling: 30% of total calories (ADA/ESPEN — regardless of steroid status)
  // Dexamethasone premedication elevates insulin resistance; high fat worsens glycaemic control
  if (isDiabetic && !hasTripleTrigger) {
    const maxFatKcalDM = dailyCalories * 0.30;
    if (dailyFat * 9 > maxFatKcalDM) {
      const excessKcal = (dailyFat * 9) - maxFatKcalDM;
      dailyFat = Math.round((maxFatKcalDM / 9) * 10) / 10;
      dailyCarbs = Math.round(dailyCarbs + excessKcal / 4);
    }
  }

  // COPD fat ceiling: 30% of total calories — high fat diet raises respiratory quotient (RQ),
  // increases CO2 production and ventilatory load, directly harmful in COPD + NSCLC
  const hasCOPD = lowerComorbidities.some(c => c.includes('copd') || c.includes('chronic obstructive'));
  if (hasCOPD) {
    const maxFatKcalCOPD = dailyCalories * 0.30;
    if (dailyFat * 9 > maxFatKcalCOPD) {
      const excessKcal = (dailyFat * 9) - maxFatKcalCOPD;
      dailyFat = Math.round((maxFatKcalCOPD / 9) * 10) / 10;
      dailyCarbs = Math.round(dailyCarbs + excessKcal / 4);
    }
  }

  const macroProtein = Math.round((dailyProtein / servingsPerDay) * 10) / 10;
  const macroCarbs = Math.round((dailyCarbs / servingsPerDay) * 10) / 10;
  const macroFat = Math.round((dailyFat / servingsPerDay) * 10) / 10;

  let proteinType = 'Whey isolate';
  const tolerance = (patient.proteinTolerance || '').toLowerCase();

  if (hasPelvicRadiation) proteinType = 'Peptide formulas';
  else if (tolerance === 'gi' || cancer.includes('pancreatic') || hasIBD || hasNausea) proteinType = 'Hydrolyzed whey';
  else if (tolerance === 'mucositis' || hasMucositis || (patient.feedingMethod || '').toLowerCase().includes('enteral')) proteinType = 'Peptide formulas';
  else if (tolerance === 'lactose') proteinType = 'Plant proteins (pea / rice)';


  const flavorProfile = (() => {
    if (hasNausea || sideEffects.some(s => s.includes('taste'))) {
      return { recommendation: "Tart / Citrus / Neutral", logic: "Citrus masks metallic taste from chemo." };
    }
    return { recommendation: "Customizable", logic: "Patient-led preference." };
  })();

  const rationale = [];
  if (hasRenalIssue) {
    rationale.push(`<b>Renal Safety (Strict):</b> Protein capped at ${proteinPerKg} g/kg to protect kidney function (KDIGO), prioritizing safety over aggressive muscle loading.`);
  } else if (cachexia) {
    rationale.push(`<b>Clinical (Hypermetabolic):</b> Target at 35 kcal/kg/day prescribed for established Cachexia.`);
  } else if (moderateRisk) {
    rationale.push(`<b>Clinical (Moderate Risk):</b> Target at 30 kcal/kg/day prescribed for 5-10% weight loss or ECOG 2.`);
  } else {
    rationale.push(`<b>Clinical (Maintenance):</b> Target at 25 kcal/kg/day for stable oncology maintenance.`);
  }

  // Deficit Rationale
  if (!isFullReplacement && reducedFoodIntake > 0) {
    rationale.push(`<b>Supplement Strategy:</b> Patient is maintaining ${actualIntake}% oral intake (Est. ${estimatedDietaryProtein}g dietary protein). Prescription bridges the shortfall with <b>${prescribedProtein}g protein/day</b>. <b>Total Delivery: ${totalProteinDelivery}g/day</b> (Target: ${baseDailyProtein}g).`);
    // EN transition suggestion: intake below full_replacement threshold but above mandatory_en
    if (actualIntake <= fv('intake_full_replacement', 60) && actualIntake > fv('intake_mandatory_en', 50) && !currentIsEnteral) {
      rationale.push(`<b>⚠️ EN Transition Recommended:</b> Oral intake at ${actualIntake}% is below the ${fv('intake_full_replacement', 60)}% threshold. Escalation to Enteral Nutrition (EN) is recommended — consider nasogastric tube feeding to ensure full caloric and protein delivery. Document clinical decision with oncologist and reassess within 48 hours.`);
    }
  } else {
    const intakeNote = isFullReplacement ? `(Intake: ${actualIntake}% ≤ 50%)` : "";
    rationale.push(`<b>Full Replacement ${intakeNote}:</b> Therapeutic logic requires 100% target coverage (${baseDailyCalories} kcal) via formulation to ensure stabilization.`);
  }
  
  if (patient.potassium > 5.0) {
    rationale.push(`<b>Electrolyte Safety:</b> Potassium-free formula matrix selected due to active Hyperkalemia.`);
  }
  if (patient.sodium > 0 && patient.sodium < 135) {
    rationale.push(`<b>Electrolyte Safety:</b> Added 1-2g target Sodium Chloride for Hyponatremia. <b>[CRITICAL]</b> Cap correction at <b>+8-10 mEq/L per 24h</b> to prevent Osmotic Demyelination (ODS).`);
  }
  if (isDiabetic || (patient.bloodSugar > 180)) {
    const reason = patient.bloodSugar > 180 ? 'Hyperglycemia detected' : 'T2DM history';
    rationale.push(`<b>Glycemic Control:</b> ${reason}. Low-GI <b>Palatinose</b> matrix used to minimize glycemic spikes. <b>[REQUIRED]</b> HbA1c screening within 48h to assess chronic control depth.`);
  }

  if (!hasRenalIssue && proteinPerKg >= 1.8) {
    rationale.push(`<b>Intensive Protein:</b> ${proteinPerKg} g/kg/day prescribed for active catabolism.`);
  }
  if (hasIBD) rationale.push(`<b>GI Strategy (IBD):</b> Low-residue focus and hydrolyzed protein used.`);
  if (cancer.includes('pancreatic')) rationale.push(`<b>PERT Focus:</b> Enzymes strongly recommended to address EPI.`);
  const currentIsEnteral = feedingMethodLC.includes('enteral') || feedingMethodLC.includes('parenteral');
  if (actualIntake <= 50 && !currentIsEnteral) {
    rationale.push(`<b>Escalation Strategy:</b> Critical intake deficit (${actualIntake}%) detected; clinical transition to Enteral Feeding (Liquid format) strongly recommended to meet targets.`);
  }

  function buildFormulationOptions(targets) {
    if (typeof IngredientLibrary === 'undefined') return null;
    const { macroProtein, macroCarbs, macroFat, proteinType, bloodSugar, cachexia, crp } = targets;
    
    // Null safety for Library lookups
    const getIng = (id) => IngredientLibrary.find(i => i.id === id) || { name: id, pPerGram: 1, cPerGram: 1, fPerGram: 1, healingRationale: '' };

    let selectedProtein = getIng('whey_isolate');
    if (proteinType && (proteinType.toLowerCase().includes('hydrolyzed') || proteinType.toLowerCase().includes('peptide'))) {
      const hydroIng = getIng('whey_hydrolyzed');
      if (hydroIng) {
        selectedProtein = hydroIng;
      } else {
        console.error("CRITICAL: whey_hydrolyzed missing from IngredientLibrary!");
      }
    } else if (proteinType && proteinType.toLowerCase().includes('plant')) {
      selectedProtein = getIng('pea_protein');
    }

    const isDiabeticCarb = isDiabetic || bloodSugar > 100;
    let selectedCarb = getIng('palatinose');
    if (!isDiabeticCarb && !cachexia) selectedCarb = getIng('maltodextrin');

    const selectedFat = getIng('mct_powder');
    const selectedOmega = getIng('omega3_powder');

    // Daily omega-3 — scales with servings so each serving gets consistent dose
    const oGramsPerServing = (crp > 5 || cachexia || (cancer && cancer.includes('pancreatic'))) ? 1.3 : 0.7;
    const oGrams = Math.round(oGramsPerServing * servingsPerDay * 10) / 10;

    // Therapeutic add-ons — daily batch totals (compounding unit makes one daily box)
    const glutamineGrams = (patient.giIssues || (sideEffects && sideEffects.includes('Mucositis')) || (regimen && regimen.includes('folfirinox')) || hasIBD) ? 16 : 0; // 16g/day fixed
    const glutamineProtein = glutamineGrams;
    const bcaaDailyGrams = (patient.alt > 50 || patient.ast > 50 || patient.bilirubin > 1.2) ? 20 : 0; // 20g/day fixed
    const bcaaProtein = bcaaDailyGrams;

    // All ingredient grams calculated from DAILY totals — round once, no per-serving compounding error
    // Step 1: whey protein — sized to deliver daily formula protein target
    const pGrams = Math.round(dailyProtein / (selectedProtein.pPerGram || 1));
    const carbsFromProtein = pGrams * (selectedProtein.cPerGram || 0);
    const fatFromProtein = pGrams * (selectedProtein.fPerGram || 0);

    // Step 2: fat grams (MCT daily)
    const neededFat = Math.max(0, dailyFat - fatFromProtein);
    const fGrams = Math.round(neededFat / (selectedFat.fPerGram || 1));
    const carbsFromFat = fGrams * (selectedFat.cPerGram || 0);
    const carbsFromOmega = oGrams * (selectedOmega.cPerGram || 0);

    // Step 3: carb grams (daily)
    const neededCarbs = Math.max(0, dailyCarbs - carbsFromProtein - carbsFromFat - carbsFromOmega);
    const cGrams = Math.round(neededCarbs / (selectedCarb.cPerGram || 1));

    // Step 4: daily batch kcal — ground truth, rounded once from daily grams
    const recipeKcal = Math.round(
      pGrams * selectedProtein.kcalPerGram +
      cGrams * selectedCarb.kcalPerGram +
      fGrams * selectedFat.kcalPerGram +
      oGrams * selectedOmega.kcalPerGram
    );
    const wheyProtein = Math.round(pGrams * selectedProtein.pPerGram);
    const recipeProtein = wheyProtein + glutamineProtein + bcaaProtein;

    return {
      protein: { id: selectedProtein.id, name: selectedProtein.name, grams: pGrams, deliveredProtein: wheyProtein, rationale: selectedProtein.healingRationale },
      carb: { id: selectedCarb.id, name: selectedCarb.name, grams: cGrams, rationale: selectedCarb.healingRationale },
      fat: { id: selectedFat.id, name: selectedFat.name, grams: fGrams, rationale: "Metabolic energy without glycemic load" },
      omega: (oGrams > 0) ? { id: 'omega3_powder', name: 'Omega-3 Powder', grams: oGrams, rationale: "Anti-inflammatory / EPA support." } : null,
      recipeKcal, recipeProtein, wheyProtein, servingsPerDay, isDailyBatch: true,
      bcaa: (bcaaDailyGrams > 0) ? { id: 'bcaa_powder', name: 'BCAA (2:1:1 Mix)', grams: bcaaDailyGrams, rationale: "Hepatic Protection dose." } : null,
      glutamine: (pGrams > 0 && glutamineGrams > 0) ? { id: 'glutamine', name: 'L-Glutamine powder', grams: glutamineGrams, rationale: "Mucosal protection." } : null
    };
  }

  // Patient Instructions Enrichment
  const patientInstructions = [
    `Consume EXACTLY ${servingsPerDay} servings per day to meet your therapeutic target.`,
    `Divide intake into ${servingsPerDay} separate doses between meals for maximum absorption.`,
    `Mix with 200ml cold water; consume slowly over 20 minutes to prevent GI distress.`
  ];

  if (patient.sodium > 0 && patient.sodium < 135) {
    patientInstructions.push("Sodium Support: Add 1-2g salt via bouillon, pickles, or salted snacks to your daily diet.");
  }
  if (chemFlags.oxaliplatin) {
    patientInstructions.push("<b>Chemo Safety:</b> STOP high-dose Vitamin C (>1000mg) or ALA while on Oxaliplatin unless oncology clears it.");
  }
  if ((patient.regimen || '').includes('5-FU') || (patient.regimen || '').includes('FOLFOX')) {
    patientInstructions.push("Folate Timing: Ensure supplemental Folate is taken AWAY from chemotherapy infusion days.");
  }
  if (sarcopenia) {
    patientInstructions.push("Anabolic Support: Formulation is enriched with Leucine/BCAAs. Maintain light walking daily to stimulate muscle synthesis.");
  }
  if (patient.giIssues) {
    patientInstructions.push("GI Management: Sip slowly, use probiotics, and avoid lactose if diarrhea persists.");
  }
  if (actualIntake <= 50) {
    patientInstructions.push("CLINICAL NOTE: Oral intake is insufficient (<50%). Consider escalation to Oral Nutrition Supplements or enteral support — discuss with medical team.");
    patientInstructions.push("Do not attempt to 'sip' large volumes if nausea or early satiety is present.");
    patientInstructions.push("Consult medical team for immediate nutrition escalation protocol.");
  } else {
    patientInstructions.push("Small frequent sips improve tolerance.");
  }

  // V3 Outcome Prediction Engine - Therapeutic-Aware Logic
  function calculateOutcomePrediction(riskScore, ecoG, intake, tumorBurden, plan) {
    let baseProb = 95; 
    
    // 1. Patient Complexity Penalties (Base)
    baseProb -= (riskScore * 5);
    const ecogNum = parseInt(ecoG || 0);
    baseProb -= (ecogNum * 12); // ECOG 2+ is a major drag
    if (tumorBurden === 'High' || tumorBurden === 'Bulky') baseProb -= 15;
    
    // 2. Intake & Lab Deficit Logic
    const intakeDeficit = 100 - (parseInt(intake) || 100);
    const isAggressive = (plan.dailyProtein / (plan.proteinPerKg * patient.weight) > 0.95) || 
                         (plan.prescribedRoute && plan.prescribedRoute.includes('Enteral')) ||
                         (actualIntake <= 50); // Mandatory EN threshold

    if (intakeDeficit > 20) {
        if (isAggressive) {
            // REWARD: Successful bridge of a large gap
            baseProb += 35; 
            baseProb -= (intakeDeficit * 0.1); // Smaller penalty because we're fixing it
        } else {
            // PENALTY: Large gap with no escalation
            baseProb -= (intakeDeficit * 0.7);
        }
    }
    
    // Lab Integrity Penalties
    if (chemFlags.pembrolizumab && (tsh === 0 || isNaN(tsh))) baseProb -= 20;
    if (isDiabetic && (!patient.hba1c || patient.hba1c === 0)) baseProb -= 15;
    if (proteinGap > 20) baseProb -= 20;

    // 3. Therapeutic Boosts (Final Polish)
    if (plan && plan.proteinPerKg >= 1.8) baseProb += 15;
    if (plan && plan.micronutrients && plan.micronutrients.epa && plan.micronutrients.epa !== 'None') baseProb += 10;
    
    const finalProb = Math.min(95, Math.max(15, baseProb));
    let finalDesc = "Therapeutic coverage is optimized for weight stabilization.";
    if (finalProb < 40) finalDesc = "High clinical complexity requires immediate nutrition escalation.";
    if (isAggressive && finalProb > 60) finalDesc = "<b>Aggressive Escalation Active:</b> High-protein bridge in place to counteract catabolism.";

    return {
      percentage: Math.round(finalProb),
      timeframe: "4 weeks (Target Stabilization Cycle)",
      description: finalDesc
    };
  }

  const outcomePredictionData = calculateOutcomePrediction(riskScore, patient.ecogStatus, reducedFoodIntake, patient.tumorBurden, {
    dailyProtein, proteinPerKg, prescribedRoute: (actualIntake < 50) ? "Enteral" : "Oral", micronutrients
  });

  const outcomes = {
    weightStabilization: `${outcomePredictionData.percentage}% Probability`,
    musclePreservation: (sarcopenia || proteinPerKg >= 1.8) ? "Clinically improved" : "Likely Maintained",
    organProtection: (hasRenalIssue || alt > 50) ? "Safety Protocols Active" : "Standard"
  };

  // --- Enhanced Dietary Guidance (V3.1) ---
  const dietaryPlan = {
    texture: "Standard (Normal solids)",
    strategies: [],
    mealExamples: []
  };

  if (hasMucositis) {
    dietaryPlan.texture = "Soft / Moist (Grade 1-2 Mucositis Protocol)";
    dietaryPlan.strategies.push("Avoid acidic (citrus/tomato), spicy, and crunchy foods.", "Use gravy, sauces, or yogurt to moisten foods.", "Cool or room temperature foods are better tolerated.");
  }

  if (hasNausea) {
    if (dietaryPlan.texture === "Standard (Normal solids)") {
        dietaryPlan.texture = "Neutral / Low-Odor (Nausea Management)";
    }
    dietaryPlan.strategies.push("Small, frequent snacks instead of large meals.", "Focus on cold or neutral-temperature foods to minimize odors.", "Dry ginger or ginger tea may help alleviate symptoms.");
  }

  // Culturally Adapted Indian Meal Examples
  if (hasSevereNeutropenia) {
    // Neutropenic diet — all food must be well-cooked, no raw items
    dietaryPlan.mealExamples = isVegetarian ? [
        "Well-cooked moong dal khichdi with ghee (pressure-cooked, no raw garnish)",
        "Soft idli with well-cooked sambar (no raw coconut chutney)",
        "Boiled and mashed sweet potato with a pinch of jeera and ghee",
        "Pasteurised dahi (curd) mixed with soft cooked rice — no fresh fruits",
        "Soft upma made with semolina and well-cooked vegetables",
        "Boiled banana or chiku (sapodilla) — no raw fruits with skin"
    ] : [
        "Well-cooked chicken stew with soft white rice (pressure-cooked, no raw garnish)",
        "Boiled egg bhurji (scrambled) with toasted plain bread — fully cooked through",
        "Clear chicken shorba (broth) with soft-cooked rice noodles",
        "Soft fish curry (rohu or katla) with well-cooked rice — no raw coriander",
        "Egg rice (well-cooked) with mild masala and ghee",
        "Minced chicken with soft roti — no raw onion or salad"
    ];
  } else if (hasNeutropenia) {
    dietaryPlan.mealExamples = isVegetarian ? [
        "Moong dal khichdi with ghee — avoid raw garnishes",
        "Soft idli with cooked sambar — avoid raw chutneys",
        "Mashed sweet potato with ghee and jeera",
        "Cooked rice with well-heated pasteurised dahi",
        "Soft poha (flattened rice) with cooked vegetables"
    ] : [
        "Chicken shorba with soft rice — avoid raw garnish",
        "Well-cooked egg curry with plain rice",
        "Soft fish fry (fully cooked) with dal and rice",
        "Boiled egg with toasted bread — no raw vegetables",
        "Chicken khichdi — pressure-cooked, mild spices"
    ];
  } else if (isVegetarian) {
    dietaryPlan.mealExamples = hasMucositis ? [
        "Soft moong dal khichdi with ghee — cool to room temperature before eating",
        "Mashed paneer in mild cream gravy — no chilli or acidic ingredients",
        "Curd rice with soft cooked vegetables — no pickles or tamarind",
        "Soft idli with coconut chutney (no tomato-based sambar)",
        "Mashed banana with a teaspoon of honey and warm milk"
    ] : [
        "Moong dal khichdi with ghee and soft-cooked vegetables",
        "Paneer tikka (lightly spiced, grilled) with mint chutney and roti",
        "Rajma or chana curry with brown rice",
        "Vegetable upma with a glass of buttermilk",
        "Curd rice with grated carrot and mild seasoning",
        "Ragi porridge or dalia (broken wheat) with jaggery and ghee"
    ];
  } else {
    dietaryPlan.mealExamples = hasMucositis ? [
        "Soft chicken stew with plain rice — no spice, no lemon",
        "Clear chicken or mutton shorba — lukewarm, no pepper",
        "Boiled egg mashed with ghee and soft rice",
        "Soft fish in mild cream curry with plain rice",
        "Warm daliya (broken wheat) porridge with ghee"
    ] : [
        "Chicken curry (mild) with steamed basmati rice and raita",
        "Egg bhurji with whole wheat roti and sliced cucumber",
        "Grilled pomfret or rohu fish with dal tadka and rice",
        "Mutton keema with soft roti and onion-tomato salad",
        "Chicken shorba with soft idli — light and protein-rich",
        "Boiled eggs with poha and green chutney"
    ];
  }

  // --- FEASIBILITY SCORE: Data Completeness Index ---
  let feasibilityScore = 100;
  const missingItems = [];
  if (chemFlags.pembrolizumab && (tsh === 0 || isNaN(tsh))) {
    feasibilityScore -= 20;
    missingItems.push('TSH (CRITICAL for Immunotherapy — Pembrolizumab Thyroiditis risk)');
  }
  if (isDiabetic && (!patient.hba1c || patient.hba1c === 0)) {
    feasibilityScore -= 10;
    missingItems.push('HbA1c (Required: Diabetic patient / Hyperglycemia detected)');
  }
  if (smi > 0 && sarcopenia && isL3SMI) {
    feasibilityScore -= 15;
    missingItems.push('CT L3 Imaging (Required: SMI at sarcopenic threshold — algorithmic estimate must be confirmed)');
  }
  if (albumin === 0 && cachexia) {
    feasibilityScore -= 10;
    missingItems.push('Serum Albumin (Required: Cachexia protocol active)');
  }
  if (hemoglobin === 0 && riskScore >= 4) {
    feasibilityScore -= 5;
    missingItems.push('Hemoglobin (Recommended: High-risk nutrition patient)');
  }
  feasibilityScore = Math.max(0, Math.min(100, feasibilityScore));

  // --- MANDATORY INVESTIGATIONS ---
  const mandatoryInvestigations = [];
  if (missingItems.length > 0) {
    missingItems.forEach(item => mandatoryInvestigations.push({ item, urgency: item.startsWith('CT') ? 'MODERATE' : 'CRITICAL' }));
  }
  if (sarcopenia && isL3SMI) {
    const alreadyHasCT = mandatoryInvestigations.some(i => i.item.includes('CT L3'));
    if (!alreadyHasCT) {
      mandatoryInvestigations.push({ item: 'CT L3 Imaging — Confirm Skeletal Muscle Index', urgency: 'MODERATE' });
    }
  }
  // Anaemia: iron panel always required before empirical iron supplementation
  if (hemoglobin > 0 && hemoglobin < 12) {
    mandatoryInvestigations.push({ item: 'Iron Panel (Ferritin, Serum Iron, TIBC, Transferrin Saturation) — Required before iron supplementation', urgency: 'CRITICAL' });
  }
  // Biliary tract / hepatic / pancreatic: LFTs + tumour markers always required
  if (cancer.includes('biliary') || cancer.includes('cholangiocarcinoma') || cancer.includes('hepatocellular') || cancer.includes('hcc') || cancer.includes('pancreatic')) {
    mandatoryInvestigations.push({ item: 'LFT Full Panel (ALT, AST, ALP, GGT, Bilirubin) — Biliary/Hepatic cancer: baseline + every cycle', urgency: 'CRITICAL' });
    if (cancer.includes('biliary') || cancer.includes('cholangiocarcinoma')) {
      mandatoryInvestigations.push({ item: 'CA19-9 Tumour Marker — Biliary tract cancer: baseline + every 2 cycles', urgency: 'MODERATE' });
    }
  }
  // Advanced/metastatic: albumin + prealbumin mandatory to confirm cachexia
  if (isAdvancedMetastatic && albumin === 0) {
    mandatoryInvestigations.push({ item: 'Serum Albumin — Advanced/Metastatic disease: cachexia assessment mandatory', urgency: 'CRITICAL' });
  }
  if (isAdvancedMetastatic && prealbumin === 0) {
    mandatoryInvestigations.push({ item: 'Prealbumin — Advanced disease: acute nutritional status marker (shorter half-life than albumin)', urgency: 'MODERATE' });
  }
  // Olaparib: CBC every 4 weeks mandated
  if (chemFlags.olaparib) {
    mandatoryInvestigations.push({ item: 'CBC (Full Blood Count) every 4 weeks — Olaparib haematological toxicity monitoring', urgency: 'CRITICAL' });
  }
  // Gemcitabine: weekly CBC + per-cycle LFT
  if (chemFlags.gemcitabine) {
    mandatoryInvestigations.push({ item: 'CBC weekly during Gemcitabine — myelosuppression monitoring', urgency: 'CRITICAL' });
    mandatoryInvestigations.push({ item: 'LFT per Gemcitabine cycle — hepatotoxicity monitoring', urgency: 'CRITICAL' });
  }
  // Immunotherapy: TSH every cycle
  if (chemFlags.nivolumab || chemFlags.durvalumab || chemFlags.atezolizumab) {
    if (tsh === 0 || isNaN(tsh)) {
      mandatoryInvestigations.push({ item: 'TSH (Thyroid Function) — Checkpoint inhibitor: mandatory every cycle; current result missing', urgency: 'CRITICAL' });
    } else {
      mandatoryInvestigations.push({ item: 'TSH (Thyroid Function) — Checkpoint inhibitor: repeat every cycle', urgency: 'CRITICAL' });
    }
  }

  const plan = {
    cachexia, sarcopenia, bmi: Math.round(bmi * 10) / 10, kcalPerKg, proteinPerKg,
    feasibilityScore, mandatoryInvestigations,
    servingsPerDay, totalDailyCalories, totalDailyProtein,
    estimatedDietaryProtein, totalProteinDelivery,
    onsCalories, onsFloorKcal, prescribedProtein,
    dailyCalories, dailyProtein, perServingCalories, perServingProtein,
    proteinType, dailyCarbs, dailyFat, macroProtein, macroCarbs, macroFat,
    micronutrients, rationale, nutritionRisk, nutritionRiskScore: riskScore,
    nutritionRiskReasons, safetyAlerts,
    patientInstructions,
    outcomes, interactions,
    dietaryPlan,
    enteralProtocol, electrolyteStrategy, reassessmentProtocol,
    hasRenalIssue,
    hasHighRiskRegimen: (chemFlags.bortezomib || hasCisplatin || hasPlatinum || regimen.includes('lenalidomide')),
    weightBasis, ibw, calcWeight,
    mustTotal, mustRisk, mustBMIScore, mustWLScore, mustAcuteScore,
    prescribedRoute: (() => {
      const selected = (patient.feedingMethod || '').toLowerCase();
      if (selected.includes('enteral') && selected.includes('parenteral')) return "Combination Feeding (Enteral + Parenteral)";
      if (selected.includes('oral') && selected.includes('enteral')) return "Combination Feeding (Oral + Enteral)";
      if (selected.includes('parenteral')) return "Parenteral Nutrition (TPN)";
      if (selected.includes('enteral')) return "Enteral Tube Feeding";
      if (selected.includes('ons') || selected.includes('oral nutrition')) return "Oral Nutrition Supplements";
      if (selected.includes('oral')) return "Oral Feeding";
      // No selection — engine decides based on intake. Never auto-select Enteral (clinical decision).
      if (actualIntake <= 75) return "Oral Nutrition Supplements";
      return "Oral Feeding";
    })(),
    baseEnergy: baseDailyCalories,
    baseProtein: baseDailyProtein,
    outcomePrediction: outcomePredictionData,
    recipe: buildFormulationOptions({ macroProtein, macroCarbs, macroFat, proteinType, bloodSugar, cachexia, crp }),
    auditContext: {
      calorieGap: baseDailyCalories - totalDailyCalories,
      proteinGap: baseDailyProtein - totalDailyProtein,
      isEspenEscalationCandidate: actualIntake < fv('intake_mandatory_en', 50) && !currentIsEnteral,
      actualIntakePercent: actualIntake,
      weightLossStatus: weightLossPercent >= fv('weight_loss_high', 10) ? 'Severe' : (weightLossPercent >= fv('weight_loss_moderate', 5) ? 'Moderate' : 'Stable'),
      sarcopeniaStatus: sarcopenia ? 'Confirmed' : (patient.smi || patient.handGrip ? 'Suspected' : 'Unknown')
    }
  };

  // --- Apply admin-promoted engine rules from DB (active rules) ---
  // Operators: max (cap), min (floor), set (override), exclude (remove field)
  if (engineConfig && Array.isArray(engineConfig.rules)) {
    const appliedRules = [];
    for (const rule of engineConfig.rules) {
      const tf = rule.target_field;
      const rv = parseFloat(rule.value);
      if (tf in plan && !isNaN(rv)) {
        if (rule.operator === 'max' && plan[tf] > rv)  { plan[tf] = rv; appliedRules.push(`${tf} capped to ${rv} [${rule.rule_name}]`); }
        else if (rule.operator === 'min' && plan[tf] < rv) { plan[tf] = rv; appliedRules.push(`${tf} floored to ${rv} [${rule.rule_name}]`); }
        else if (rule.operator === 'set') { plan[tf] = rv; appliedRules.push(`${tf} set to ${rv} [${rule.rule_name}]`); }
        else if (rule.operator === 'exclude') { delete plan[tf]; appliedRules.push(`${tf} excluded [${rule.rule_name}]`); }
      }
    }
    if (appliedRules.length > 0) {
      console.log('[EngineConfig] Applied rules:', appliedRules);
      plan.appliedRules = appliedRules;
    }
  }

  return plan;
}
