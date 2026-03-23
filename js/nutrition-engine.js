function generateNutritionPlan(patient) {

  const weight = parseFloat(patient.weight || 0);
  const height = parseFloat(patient.height || 0);
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
  const age = parseInt(patient.age || 0);
  const ecog = parseInt(patient.ecogStatus || 0);
  const gender = (patient.sex || '').toLowerCase();
  const regimen = (patient.regimen || '').toLowerCase();
  const cancer = (patient.cancer || '').toLowerCase();
  
  const bmi = height ? (weight / Math.pow(height / 100, 2)) : 0;
  
  const smi = parseFloat(patient.smi || 0);
  const handGrip = parseFloat(patient.handGrip || 0);
  let sarcopenia = patient.sarcopeniaStatus === 'Sarcopenic';
  
  if (smi > 0) {
    const smiLow = (gender === 'male' ? smi < 7.0 : smi < 5.7);
    if (smiLow) sarcopenia = true;
  }
  if (handGrip > 0) {
    const gripLow = (gender === 'male' ? handGrip < 26 : handGrip < 18);
    if (gripLow) sarcopenia = true;
  }

  const tumorBurden = patient.tumorBurden === 'High (Bulky)';
  const comorbidities = Array.isArray(patient.comorbidities) ? patient.comorbidities : [];
  const isDiabetic = (comorbidities.some(c => c.toLowerCase().includes('diabetes')) || bloodSugar > 180);
  
  const nutritionRiskReasons = [];
  let riskScore = 0;
  // V3 Safety Engine (Step 6) - Initialized later in function
  let safetyAlerts = [];

  // --- STEP 4 & 6: LAB INTERPRETATION & SAFETY ---
  if (hemoglobin > 0 && hemoglobin < 10) {
    safetyAlerts.push({ condition: 'ANEMIA (Hb < 10)', severity: 'Moderate', action: 'Initiate Iron + B12 intensification protocol.' });
  }
  if (patient.potassium > 5.0) {
    safetyAlerts.push({ condition: 'HYPERKALEMIA (>5.0)', severity: 'High', action: 'Restrict potassium sources; adjust formula to K-free matrix.' });
  }
  if (patient.sodium > 0 && patient.sodium < 130) {
    safetyAlerts.push({ condition: 'HYPONATREMIA (<130)', severity: 'High', action: 'Fluid balance correction protocol; target 1-2g NaCl.' });
  } else if (patient.sodium > 0 && patient.sodium < 135) {
    safetyAlerts.push({ condition: 'MILD HYPONATREMIA (<135)', severity: 'Moderate', action: 'Monitor volume status; standard sodium target.' });
  }
  if (vitD > 0 && vitD < 20) {
    safetyAlerts.push({ condition: 'VITAMIN D DEFICIENCY (<20)', severity: 'Moderate', action: 'High-dose Vit D protocol (4000-6000 IU/day).' });
  }
  if (patient.magnesium > 0 && patient.magnesium < 1.7) {
    safetyAlerts.push({ condition: 'HYPOMAGNESEMIA (<1.7)', severity: 'Moderate', action: 'Magnesium correction protocol (200-400mg Mg Oxide/Citrate).' });
  }
  if (tsh > 5.0) {
    safetyAlerts.push({ condition: 'METABOLIC RATE FLAG', severity: 'Low', action: 'Elevated TSH detected; monitor metabolic rate.' });
  }

  // Comorbidities / Organ Function
  const lowerComorbidities = comorbidities.map(c => c.toLowerCase());
  const hasRenalIssue = lowerComorbidities.some(c => c.includes('renal') || c.includes('kidney') || c.includes('ckd') || c.includes('nephro')) || creatinine > 1.3 || urea >= 40;
  const hasIBD = lowerComorbidities.some(c => c.includes('ibd') || c.includes('crohn') || c.includes('colitis'));
  const hasCardiac = lowerComorbidities.some(c => c.includes('cardiac'));

  if (hasRenalIssue) {
    riskScore += 2;
    nutritionRiskReasons.push('Renal Function Impairment (Creatinine: ' + creatinine + ')');
    safetyAlerts.push({ condition: 'RENAL SAFETY PROTOCOL', severity: 'High', action: 'Protein capped to prevent nitrogen overload.' });
  }
  if (hasIBD) {
    riskScore += 1;
    nutritionRiskReasons.push('IBD / Malabsorption Risk');
  }

  if (albumin > 0 && albumin < 3.5) {
    riskScore += 2;
    nutritionRiskReasons.push('Low albumin');
  }
  if (weightLossPercent >= 10) {
    riskScore += 2;
    nutritionRiskReasons.push('Weight loss ≥ 10%');
  } else if (weightLossPercent >= 5) {
    riskScore += 1;
    nutritionRiskReasons.push('Weight loss 5–9.9%');
  }
  if (bmi > 0 && bmi < 18.5) {
    riskScore += 2;
    nutritionRiskReasons.push('Low BMI');
  }
  if (patient.giIssues) {
    riskScore += 1;
    nutritionRiskReasons.push('GI issues');
  }
  if (alt > 50 || ast > 50 || bilirubin > 1.2) {
    riskScore += 2;
    nutritionRiskReasons.push('Liver function compromised');
  }
  if (ecog >= 2) {
    riskScore += 1;
    nutritionRiskReasons.push('Reduced physical performance (ECOG ≥ 2)');
  }
  if (isDiabetic) {
    riskScore += 1;
    nutritionRiskReasons.push('Diabetes / Hyperglycemia');
  }
  if (hemoglobin > 0 && hemoglobin < 12) {
    riskScore += 1;
    nutritionRiskReasons.push('Anemia (Low Hemoglobin)');
  }
  if (sarcopenia) {
    riskScore += 2;
    nutritionRiskReasons.push('Confirmed Sarcopenia');
  }

  let nutritionRisk = 'Low';
  if (riskScore >= 4) nutritionRisk = 'High';
  else if (riskScore >= 2) nutritionRisk = 'Moderate';

  const cachexia = albumin < 3.5 || weightLossPercent >= 10 || bmi < 18.5 || crp > 10 || sarcopenia;

  const sideEffects = (Array.isArray(patient.sideEffects) ? patient.sideEffects : []).map(s => s.toLowerCase());
  const hasNausea = sideEffects.some(s => s.includes('nausea') || s.includes('vomit'));
  const hasAppetiteLoss = sideEffects.some(s => s.includes('appetite') || s.includes('satiety'));
  const hasMucositis = sideEffects.some(s => s.includes('mucositis') || s.includes('mouth sore'));

  var kcalPerKg = cachexia ? 35 : 30;
  if (hasAppetiteLoss) kcalPerKg = Math.max(kcalPerKg, 32); // Ensure high density for low volume
  var proteinPerKg = (cachexia || tumorBurden) ? 1.8 : 1.4;

  // --- STEP 6: SAFETY LAYER (PROTEIN CAP) ---
  if (hasRenalIssue) {
    // KDIGO: 0.8g/kg strict limit. Any increase (e.g. to 1.0g/kg) requires documented medical override.
    proteinPerKg = 0.8;
  } else {
    if ((regimen.includes('folfirinox') || regimen.includes('platin')) && cachexia) {
      proteinPerKg = 2.0;
    }
  }
  
  if (age >= 70 && proteinPerKg < 1.5 && !hasRenalIssue) proteinPerKg = 1.5;

  const baseDailyCalories = Math.round(weight * kcalPerKg);
  const baseDailyProtein = Math.round(weight * proteinPerKg);

  // --- DEFICIT LOGIC (Pure arithmetic without force-total override) ---
  // --- DEFICIT LOGIC (Optimized for Escalation) ---
  const actualIntake = 100 - (reducedFoodIntake || 0);
  
  // CRITICAL FIX: If the patient is Renal, Enteral, or Escalated, we always target 100% 
  // to ensure they receive the full therapeutic dose (e.g. 0.8g/kg) without it being 
  // further restricted by an estimated oral intake gap.
  const isFullReplacement = (patient.feedingMethod || '').toLowerCase().includes('enteral') || (actualIntake <= 50) || hasRenalIssue;
  
  const dailyCalories = isFullReplacement ? baseDailyCalories : Math.round(baseDailyCalories * (reducedFoodIntake / 100));
  const dailyProtein = isFullReplacement ? baseDailyProtein : Math.round(baseDailyProtein * (reducedFoodIntake / 100));

  const totalDailyCalories = dailyCalories;
  const totalDailyProtein = dailyProtein;
  
  // V3 Safety Engine (Step 6) - Exactly 6 Categories
  const safetyStatus = {
    renal: { level: 'info', message: 'Renal Safety: Normal (CR < 1.3)' },
    metabolic: { level: 'info', message: 'Metabolic Safety: Stable BS (< 180)' },
    electrolyte: { level: 'info', message: 'Electrolyte Safety: Standard formula (Na/K normal)' },
    drug: { level: 'info', message: 'Drug Interference: No major antioxidants flagged' },
    escalation: { level: 'info', message: 'Escalation Status: Standard oral intake' },
    deficit: { level: 'info', message: 'Deficit Monitoring: Gap fully covered by prescription' }
  };

  if (creatinine > 1.3) {
    safetyStatus.renal = { level: 'danger', message: `CRITICAL RENAL ALERT: Creatinine ${creatinine} is elevated. Protein strictly restricted to 0.8g/kg.` };
  } else if (creatinine < 0.6) {
    safetyStatus.renal = { level: 'warning', message: 'LOW CREATININE ALERT: Potential muscle wasting; verify SMI/Grip.' };
  }

  if (bloodSugar > 180) {
    safetyStatus.metabolic = { level: 'danger', message: `HYPERGLYCEMIA ALERT: Blood Sugar ${bloodSugar}. Diabetic (Low-Carb) protocol active.` };
    if (!patient.hba1c) safetyStatus.metabolic.message += " (Note: HbA1c missing)";
  }

  // ECOG vs Activity Contradiction
  if (ecog === 0 && (patient.activityLevel || '').toLowerCase().includes('sedentary')) {
    safetyStatus.metabolic = { level: 'warning', message: "CLINICAL CONTRADICTION: ECOG 0 (Active) while Activity is Sedentary. Verify performance status." };
  }

  if (patient.sodium > 0 && patient.sodium < 135) {
    const naLevel = patient.sodium < 130 ? 'danger' : 'warning';
    safetyStatus.electrolyte = { level: naLevel, message: `HYPONATREMIA ALERT: Sodium ${patient.sodium}. NaCl 1-2g target in formulation.` };
  } else if (patient.potassium > 5.0) {
    const kLevel = patient.potassium > 5.5 ? 'danger' : 'warning';
    safetyStatus.electrolyte = { level: kLevel, message: `HYPERKALEMIA ALERT: Potassium ${patient.potassium}. Low-K formulation required.` };
  }

  // --- Enhanced Drug Detection (Step 6 Safety) ---
  const lowerRegimen = regimen.toLowerCase();
  const lowerCancer = cancer.toLowerCase();
  
  const drugs = [];
  if (lowerRegimen.includes('cisplatin')) drugs.push("Cisplatin");
  if (lowerRegimen.includes('bortezomib') || lowerRegimen.includes('velcade') || lowerRegimen.includes('vrd') || lowerRegimen.includes('vcd')) drugs.push("Bortezomib");
  if (lowerRegimen.includes('lenalidomide') || lowerRegimen.includes('revlimid')) drugs.push("Lenalidomide");
  
  const hasBortezomib = drugs.includes("Bortezomib") || lowerCancer.includes('myeloma');
  
  if (drugs.length > 0 || lowerCancer.includes('myeloma')) {
    let msg = `DRUG INTERACTION: ${drugs.join(', ') || 'Bortezomib/Myeloma'} protocol active.`;
    
    // Check for existing supplements that might interfere
    const existingSupplements = (Array.isArray(patient.existingSupplements) ? patient.existingSupplements : []).map(s => s.toLowerCase());
    const hasExistingAntioxidants = existingSupplements.some(s => s.includes('vitamin c') || s.includes('alpha lipoic acid') || s.includes('ala'));

    if (hasBortezomib) {
      msg += " Antioxidant cap (Vit C < 500mg, No ALA) enforced.";
      if (hasExistingAntioxidants) {
        safetyStatus.drug = { level: 'danger', message: `CRITICAL DRUG CLASH: High-dose antioxidants (Vit C/ALA) found in current patient list. This interferes with Bortezomib. Discontinue immediately.` };
      } else {
        safetyStatus.drug = { level: 'warning', message: msg };
      }
    } else {
      msg += " Nutrients adjusted for safety.";
      safetyStatus.drug = { level: 'warning', message: msg };
    }
  } else {
    safetyStatus.drug = { level: 'info', message: 'Drug Interference: Screened for major antioxidant-chemo clashes (Bortezomib/Cisplatin). No flags.' };
  }

  if (actualIntake <= 30) {
    safetyStatus.escalation = { level: 'danger', message: `CRITICAL INTAKE REQ: Intaking only ${actualIntake}%. Immediate Enteral Tube Escalation required.` };
  } else if (actualIntake <= 50) {
    safetyStatus.escalation = { level: 'warning', message: `LOW INTAKE ALERT: Intaking ${actualIntake}%. Intensive ONS required.` };
  }

  if (reducedFoodIntake > 50) {
    safetyStatus.deficit = { level: 'warning', message: `HIGH DEFICIT ALERT: ${reducedFoodIntake}% intake gap. Prescription covers full deficit.` };
  }
  
  // New Safety Check: Missing HbA1c in high-risk glycemic cases
  if ((isDiabetic || bloodSugar > 180) && (!patient.hba1c || patient.hba1c === 0)) {
     safetyStatus.hba1c = { level: 'warning', message: `SCREENING REQ: Glucose ${bloodSugar}mg/dL detected without HbA1c record. Glycemic control depth unknown.` };
  }

  // --- NEW: CLINICAL PROTOCOLS (TRANSITION & FOLLOW-UP) ---
  const enteralProtocol = (actualIntake <= 50) ? {
    type: "Isocaloric / High-Protein Enteral Formula",
    dosage: `Initial: 20-25 ml/hr continuously; Target: ${Math.round(dailyCalories/24)} ml/hr`,
    transition: "Day 1-2: Trophic feeding. Day 3: Achieve 100% target volume. If tolerated, transition ONS to meal-replacement only.",
    rationale: "Intake < 50% mandates clinical escalation to prevent further catabolism."
  } : null;

  const electrolyteStrategy = {
    potassium: (patient.potassium > 5.0) ? "STRICT LIMIT: < 40 mEq/day" : "Maintenance: 60-80 mEq/day",
    sodium: (patient.sodium > 0 && patient.sodium < 135) ? "CORRECTION: NaCl 1-2g target; Target Na 135-140" : "Maintenance: 100-150 mEq/day",
    fluids: `Daily target: ${Math.round(weight * 30)} - ${Math.round(weight * 35)} ml/day (inclusive of formula)`
  };

  const reassessmentProtocol = {
    frequency: (nutritionRisk === 'High' || ecog >= 3) ? "Weekly" : "Bi-weekly",
    markers: "Weight, Serum Albumin, CRP, Hand Grip Strength",
    rationale: `High metabolic risk (${nutritionRisk}) requires rapid monitoring window.`
  };

  // Convert to array for the report renderer
  safetyAlerts = Object.values(safetyStatus);
  
  // Adaptive Servings: Increase frequency for high calorie/low appetite to decrease per-serving volume
  let servingsPerDay = 3;
  if (dailyCalories >= 1800 || hasAppetiteLoss || hasNausea) servingsPerDay = 4;
  if (dailyCalories >= 2400) servingsPerDay = 5;

  const perServingCalories = Math.round((dailyCalories / servingsPerDay) * 10) / 10;
  const perServingProtein = Math.round((dailyProtein / servingsPerDay) * 10) / 10;

  const proteinCalories = dailyProtein * 4;
  const remainingCalories = Math.max(0, dailyCalories - proteinCalories);
  
  const carbRatio = (crp > 5 || isDiabetic) ? 0.35 : 0.45;
  const dailyCarbs = Math.floor((remainingCalories * carbRatio) / 4);
  const carbCalories = dailyCarbs * 4;
  
  const fatCalories = remainingCalories - carbCalories;
  const dailyFat = Math.round((fatCalories / 9) * 10) / 10;

  const macroProtein = Math.round((dailyProtein / servingsPerDay) * 10) / 10;
  const macroCarbs = Math.round((dailyCarbs / servingsPerDay) * 10) / 10;
  const macroFat = Math.round((dailyFat / servingsPerDay) * 10) / 10;

  let proteinType = 'Whey isolate';
  const tolerance = (patient.proteinTolerance || '').toLowerCase();

  if (tolerance === 'gi' || cancer.includes('pancreatic') || hasIBD || hasNausea) proteinType = 'Hydrolyzed whey';
  else if (tolerance === 'mucositis' || hasMucositis) proteinType = 'Peptide formulas';
  else if (tolerance === 'lactose') proteinType = 'Plant proteins (pea / rice)';
  else if ((patient.feedingMethod || '').toLowerCase().includes('enteral')) proteinType = 'Peptide formulas';

  const interactions = [];
  if (lowerRegimen.includes('cisplatin')) {
    interactions.push({ drug: "Cisplatin", effect: "Renal Magnesium Wasting", advice: "Mandatory Magnesium protocol; monitor creatinine closely." });
  }
  if (lowerRegimen.includes('taxane') || lowerRegimen.includes('paclitaxel') || lowerRegimen.includes('docetaxel')) {
    interactions.push({ drug: "Taxanes", effect: "Peripheral Neuropathy focus", advice: "ALA and B-Complex optimized." });
  }
  if (lowerRegimen.includes('5-fu') || lowerRegimen.includes('capecitabine') || lowerRegimen.includes('folfirinox')) {
    interactions.push({ drug: "Fluoropyrimidines", effect: "Mucositis / GI Toxicity risk", advice: "Glutamine and peptide protein prioritized." });
  }
  if (lowerRegimen.includes('irinotecan')) {
    interactions.push({ drug: "Irinotecan", effect: "Severe Diarrhea", advice: "Early mucosal support focus." });
  }
  if (hasBortezomib) {
    interactions.push({ drug: "Bortezomib (Velcade)", effect: "Antioxidant & B6 Interference", advice: "Avoid high-dose Vit C, ALA, and high-dose B6. If ALA is required for neuropathy, restrict to non-Bortezomib days ONLY with oncologist approval." });
  }
  if (lowerRegimen.includes('lenalidomide') || lowerRegimen.includes('revlimid') || lowerRegimen.includes('vrd')) {
    interactions.push({ drug: "Lenalidomide (Revlimid)", effect: "VTE/Antiplatelet Risk", advice: "Monitor Omega-3 dosing due to mild antiplatelet effects." });
  }
  if (lowerRegimen.includes('pemetrexed') || lowerRegimen.includes('methotrexate')) {
    interactions.push({ drug: "Antifolates (e.g. Pemetrexed)", effect: "Folate Antagonism", advice: "Strict adherence to explicit folate supplementation protocol required." });
  }

  const micronutrients = {
    vitD: hasRenalIssue ? '2000 IU/day (Renal Cap)' : (vitD > 0 && vitD < 20 ? '4000–6000 IU/day' : (vitD < 30 ? '2000–4000 IU/day' : '1000–2000 IU/day')),
    vitC: hasBortezomib ? '500 mg/day (Antioxidant Cap for Bortezomib)' : (hasRenalIssue ? '500 mg/day (Renal Cap)' : ((crp > 5 || tumorBurden) && !hasBortezomib ? '2000 mg/day' : '1000 mg/day')),
    zinc: zinc > 0 && zinc < 60 ? '15–25 mg/day (Correction Protocol) + 2mg Copper' : '15 mg/day',
    omega3: (crp > 5 || cachexia || cancer.includes('pancreatic')) ? '3–4 g/day' : '2 g/day',
    epa: (cachexia || tumorBurden || cancer.includes('pancreatic')) ? '2.2 - 3.0 g EPA/day' : 'None',
    leucine: (sarcopenia || tumorBurden || ecog >= 2) ? '5 g/day' : '3 g/day',
    glutamine: (patient.giIssues || hasMucositis || hasNausea || regimen.includes('folfirinox') || hasIBD) ? '30 g/day' : 'Consider if GI toxicity persists',
    bcaa: (alt > 50 || ast > 50 || bilirubin > 1.2) ? '20 g/day for Hepatic Protection' : (sarcopenia ? '10 g/day' : null),
    magnesium: (patient.magnesium < 1.7 || regimen.includes('cisplatin')) ? '400 mg (Correction Protocol)' : 'Standard',
    bComplex: (regimen.includes('taxane') || regimen.includes('folfirinox')) ? 'High-potency B-Complex' : 'Standard dose',
    folate: (() => {
      const markers = (patient.genomicMarkers || []);
      const hasMthfr = markers.some(m => m.includes('MTHFR'));
      if (hasMthfr) return '5 mg/day (Methylfolate)';
      return (patient.folate > 0 && patient.folate < 3 || hemoglobin < 10) ? '5 mg/day' : (regimen.includes('pemetrexed') || regimen.includes('methotrexate') ? '1 mg/day (per oncology protocol)' : '1.0 mg/day');
    })(),
    chromium: isDiabetic ? '400 mcg/day (Glycemic monitoring protocol active)' : null,
    ala: (isDiabetic && !hasBortezomib) ? '600 mg/day' : null,
    microbiome: (regimen.includes('folfirinox') || hasIBD) ? 'Soluble Fiber + Probiotic' : null,
    iron: (hemoglobin > 0 && hemoglobin < 10) ? '100 mg elemental iron + B12 support' : null
  };

  if (cancer.includes('myeloma')) {
    micronutrients.calcium = '1000-1200 mg/day (Note: Requires Ionized Ca monitoring for hypercalcemia risk)';
    if (vitD > 0 && vitD < 30) {
      // Myeloma Bone Protocol overrides renal cap for severe deficiency (correction phase)
      micronutrients.vitD = (vitD < 20) ? '5000 IU/day (Correction Phase; Myeloma Bone Protocol)' : (hasRenalIssue ? '2000 IU/day' : '4000 IU/day');
    }
  }

  const flavorProfile = (() => {
    if (hasNausea || sideEffects.some(s => s.includes('taste'))) {
      return { recommendation: "Tart / Citrus / Neutral", logic: "Citrus masks metallic taste from chemo." };
    }
    return { recommendation: "Customizable", logic: "Patient-led preference." };
  })();

  const rationale = [];
  if (hasRenalIssue) {
    rationale.push(`<b>Renal Safety (Strict):</b> Protein capped at ${proteinPerKg} g/kg to protect kidney function (KDIGO guidelines), prioritizing renal safety over aggressive muscle loading.`);
  } else if (cachexia) {
    rationale.push(`<b>Clinical (Energy):</b> Target at 35 kcal/kg/day for hypermetabolic cachexia.`);
  } else {
    rationale.push(`<b>Clinical (Energy):</b> Maintenance at 25-30 kcal/kg/day.`);
  }
  
  if (patient.potassium > 5.0) {
    rationale.push(`<b>Electrolyte Safety:</b> Potassium-free formula matrix selected due to active Hyperkalemia.`);
  }
  if (patient.sodium > 0 && patient.sodium < 135) {
    rationale.push(`<b>Electrolyte Safety:</b> Added 1-2g target Sodium Chloride to daily regimen for Hyponatremia correction.`);
  }
  if (isDiabetic) {
    rationale.push(`<b>Glycemic Control:</b> Modified carbohydrate load and transitioned to low-glycemic index Palatinose source.`);
  }

  if (!hasRenalIssue && proteinPerKg >= 1.8) {
    rationale.push(`<b>Intensive Protein:</b> ${proteinPerKg} g/kg/day prescribed for active catabolism.`);
  }
  if (hasIBD) rationale.push(`<b>GI Strategy (IBD):</b> Low-residue focus and hydrolyzed protein used.`);
  if (cancer.includes('pancreatic')) rationale.push(`<b>PERT Focus:</b> Enzymes strongly recommended to address EPI.`);
  const currentIsEnteral = (patient.feedingMethod || '').toLowerCase().includes('enteral');
  if (actualIntake <= 50 && !currentIsEnteral) {
    rationale.push(`<b>Escalation Strategy:</b> Critical intake deficit (${actualIntake}%) detected; clinical transition to Enteral Feeding (Liquid format) strongly recommended to meet targets.`);
  }

  function buildFormulationOptions(targets) {
    if (typeof IngredientLibrary === 'undefined') return null;
    const { macroProtein, macroCarbs, macroFat, proteinType, bloodSugar, cachexia, crp } = targets;
    let selectedProtein = IngredientLibrary.find(i => i.id === 'whey_isolate');
    if (proteinType.toLowerCase().includes('hydrolyzed') || proteinType.toLowerCase().includes('peptide')) {
      selectedProtein = IngredientLibrary.find(i => i.id === 'whey_hydrolyzed');
    } else if (proteinType.toLowerCase().includes('plant')) {
      selectedProtein = IngredientLibrary.find(i => i.id === 'pea_protein');
    }

    const isDiabeticCarb = isDiabetic || bloodSugar > 100;
    let selectedCarb = IngredientLibrary.find(i => i.id === 'palatinose');
    if (!isDiabeticCarb && !cachexia) selectedCarb = IngredientLibrary.find(i => i.id === 'maltodextrin');

    const selectedFat = IngredientLibrary.find(i => i.id === 'mct_powder');
    const selectedOmega = IngredientLibrary.find(i => i.id === 'omega3_powder');

    const pGrams = Math.round(macroProtein / (selectedProtein.pPerGram || 1));
    const carbsFromProtein = pGrams * (selectedProtein.cPerGram || 0);
    const fatFromProtein = pGrams * (selectedProtein.fPerGram || 0);
    const neededCarbs = Math.max(0, macroCarbs - carbsFromProtein);
    const neededFat = Math.max(0, macroFat - fatFromProtein);
    const cGrams = Math.round(neededCarbs / (selectedCarb.cPerGram || 1));
    const fGrams = Math.round(neededFat / (selectedFat.fPerGram || 1));
    const oGrams = (crp > 5 || cachexia || cancer.includes('pancreatic')) ? 1.3 : 0.7; 

    return {
      protein: { id: selectedProtein.id, name: selectedProtein.name, grams: pGrams, rationale: selectedProtein.healingRationale },
      carb: { id: selectedCarb.id, name: selectedCarb.name, grams: cGrams, rationale: selectedCarb.healingRationale },
      fat: { id: selectedFat.id, name: selectedFat.name, grams: fGrams, rationale: "Metabolic energy without glycemic load" },
      omega: (oGrams > 0) ? { id: 'omega3_powder', name: 'Omega-3 Powder', grams: oGrams, rationale: "Anti-inflammatory / EPA support." } : null,
      bcaa: (patient.alt > 50 || patient.ast > 50 || patient.bilirubin > 1.2) ? { id: 'bcaa_powder', name: 'BCAA (2:1:1 Mix)', grams: 20, rationale: "Hepatic Protection dose." } : null,
      glutamine: (pGrams > 0 && (patient.giIssues || sideEffects.includes('Mucositis') || regimen.includes('folfirinox') || hasIBD)) ? { id: 'glutamine', name: 'L-Glutamine powder', grams: 10, rationale: "Mucosal protection." } : null
    };
  }

  const patientInstructions = (actualIntake <= 50) ? [
    "URGENT: Oral intake is insufficient (<50%). Transition to Enteral Tube Feeding recommended.",
    "Do not attempt to 'sip' large volumes if nausea or early satiety is present.",
    "Consult medical team for immediate nutrition escalation protocol."
  ] : [
    "Mix powder thoroughly with 200-250ml of liquid.",
    "Consume slowly over 20-30 minutes.",
    "Small frequent sips improve tolerance."
  ];

  // V3 Outcome Prediction Engine - Unified Logic
  function calculateOutcomePrediction(riskScore, ecoG, intake, tumorBurden) {
    let baseProb = 98; // Default "ideal" probability
    
    // Risk Score Impact
    baseProb -= (riskScore * 6);
    
    // Performance Status Impact (ECOG)
    const ecogNum = parseInt(ecoG) || 0;
    baseProb -= (ecogNum * 12);
    
    // Intake Deficit Impact
    const intakeDeficit = 100 - (parseInt(intake) || 100);
    if (intakeDeficit > 50) baseProb -= 25;
    else if (intakeDeficit > 25) baseProb -= 15;
    
    // Tumor Burden Impact
    if (tumorBurden === 'High (Bulky)') baseProb -= 20;
    else if (tumorBurden === 'Moderate') baseProb -= 8;
    
    // Floor the probability
    const finalProb = Math.max(10, baseProb);
    
    let description = "";
    if (finalProb >= 85) description = "Excellent prognosis for weight stabilization.";
    else if (finalProb >= 70) description = "Good probability; requires strict target adherence.";
    else if (finalProb >= 50) description = "Guarded; high risk of continued cachexia without enteral intervention.";
    else if (finalProb >= 30) description = "Severe risk; guarded prognosis requiring aggressive CDSS intervention.";
    else description = "Critical risk; metabolic stabilization is primary goal.";
    
    return {
      percentage: finalProb,
      description: description,
      timeframe: "4 weeks (standard protocol window)"
    };
  }

  const outcomePrediction = calculateOutcomePrediction(riskScore, patient.ecogStatus, patient.reducedFoodIntake, patient.tumorBurden);

  const outcomes = {
    weightStabilization: `${outcomePrediction.percentage}% Probability`,
    musclePreservation: (sarcopenia || proteinPerKg >= 1.8) ? "Clinically improved" : "Likely Maintained",
    organProtection: (hasRenalIssue || alt > 50) ? "Safety Protocols Active" : "Standard"
  };

  return {
    cachexia, sarcopenia, bmi: Math.round(bmi * 10) / 10, kcalPerKg, proteinPerKg,
    servingsPerDay, totalDailyCalories, totalDailyProtein,
    dailyCalories, dailyProtein, perServingCalories, perServingProtein,
    proteinType, dailyCarbs, dailyFat, macroProtein, macroCarbs, macroFat,
    micronutrients, rationale, nutritionRisk, nutritionRiskScore: riskScore,
    nutritionRiskReasons, safetyAlerts,
    patientInstructions, 
    outcomes, interactions,
    enteralProtocol, electrolyteStrategy, reassessmentProtocol,
    hasRenalIssue,
    hasHighRiskRegimen: (hasBortezomib || lowerRegimen.includes('cisplatin') || lowerRegimen.includes('platin') || lowerRegimen.includes('lenalidomide')),
    prescribedRoute: (actualIntake <= 50) ? "Enteral Tube Feeding (Escalation)" : (actualIntake <= 75 ? "Oral Nutrition Supplements (ONS)" : "Oral Feeding (Maintenance)"),
    baseEnergy: baseDailyCalories,
    baseProtein: baseDailyProtein,
    outcomePrediction,
    recipe: buildFormulationOptions({ macroProtein, macroCarbs, macroFat, proteinType, bloodSugar, cachexia, crp }),
    reportNotes: {
      basis: 'V5 Multi-System Engine (ESMO/ESPEN/ASCO/KDIGO guidelines).'
    }
  };
}
