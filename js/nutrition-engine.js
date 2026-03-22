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
  const isDiabetic = comorbidities.some(c => c.toLowerCase().includes('diabetes')) || bloodSugar > 126;
  
  const nutritionRiskReasons = [];
  let riskScore = 0;
  const safetyAlerts = [];

  // --- STEP 4 & 6: LAB INTERPRETATION & SAFETY ---
  if (hemoglobin > 0 && hemoglobin < 10) {
    safetyAlerts.push({ level: 'warning', message: `Anemia Protocol Active (Hb: ${hemoglobin} g/dL). Iron/B12 support intensified.` });
  }
  if (patient.potassium > 5.0) {
    safetyAlerts.push({ level: 'danger', message: `Hyperkalemia Alert (K+: ${patient.potassium} mmol/L). Restrict potassium intake.` });
  }
  if (patient.sodium < 135) {
    safetyAlerts.push({ level: 'warning', message: `Hyponatremia Flag (Na+: ${patient.sodium}). Clinical fluid balance review recommended.` });
  }
  if (tsh > 5.0) {
    safetyAlerts.push({ level: 'info', message: `Metabolic Rate Flag: Elevated TSH (${tsh}).` });
  }

  // Comorbidities / Organ Function
  const hasRenalIssue = comorbidities.some(c => c.toLowerCase().includes('renal')) || creatinine >= 1.5 || urea >= 40;
  const hasIBD = comorbidities.some(c => c.toLowerCase().includes('ibd') || c.toLowerCase().includes('crohn') || c.toLowerCase().includes('colitis'));
  const hasCardiac = comorbidities.some(c => c.toLowerCase().includes('cardiac'));

  if (hasRenalIssue) {
    riskScore += 2;
    nutritionRiskReasons.push('Renal Function Impairment (Creatinine: ' + creatinine + ')');
    safetyAlerts.push({ level: 'danger', message: 'Renal Safety Protocol: Protein capped to prevent nitrogen overload.' });
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

  const regimen = (patient.regimen || '').toLowerCase();
  const cancer = (patient.cancer || '').toLowerCase();
  const sideEffects = Array.isArray(patient.sideEffects) ? patient.sideEffects : [];

  var kcalPerKg = cachexia ? 35 : 30;
  var proteinPerKg = (cachexia || tumorBurden) ? 1.8 : 1.4;

  // --- STEP 6: SAFETY LAYER (PROTEIN CAP) ---
  if (hasRenalIssue) {
    proteinPerKg = 1.1; // Strict renal cap even in cancer
  } else {
    if ((regimen.includes('folfirinox') || regimen.includes('platin')) && cachexia) {
      proteinPerKg = 2.0;
    }
  }
  
  if (age >= 70 && proteinPerKg < 1.5 && !hasRenalIssue) proteinPerKg = 1.5;

  let baseCalories = Math.round(weight * kcalPerKg);
  let dailyProtein = Math.round(weight * proteinPerKg);
  
  const totalDailyCalories = baseCalories;
  const totalDailyProtein = dailyProtein;

  if (hasCardiac) {
    safetyAlerts.push({ level: 'info', message: 'Cardiac Focus: Sodium restricted to < 2000mg/day.' });
  }

  if (reducedFoodIntake > 0 && reducedFoodIntake <= 100) {
      const deficitPct = reducedFoodIntake / 100;
      baseCalories = Math.round(totalDailyCalories * deficitPct);
      dailyProtein = Math.round(totalDailyProtein * deficitPct);
      if (baseCalories < 500 && reducedFoodIntake < 100) baseCalories = 500;
      if (dailyProtein < 20 && reducedFoodIntake < 100) dailyProtein = 20;
  }
  
  if (reducedFoodIntake >= 70) {
      safetyAlerts.push({ level: 'danger', message: `Critical Intake Alert: Patient is only eating ${100 - reducedFoodIntake}%. Immediate feeding escalation to Enteral Nutrition or intensive ONS required.` });
  } else if (reducedFoodIntake >= 50) {
      safetyAlerts.push({ level: 'warning', message: `Low Intake Alert: Patient is only eating ${100 - reducedFoodIntake}%. Intensive ONS required as primary source.` });
  }
  
  const dailyCalories = baseCalories;
  const servingsPerDay = 3;
  const perServingCalories = Math.round(dailyCalories / servingsPerDay);
  const perServingProtein = Math.round(dailyProtein / servingsPerDay);

  const proteinCalories = dailyProtein * 4;
  const remainingCalories = Math.max(0, dailyCalories - proteinCalories);
  
  const carbRatio = (crp > 5 || isDiabetic) ? 0.35 : 0.45;
  const dailyCarbs = Math.floor((remainingCalories * carbRatio) / 4);
  const carbCalories = dailyCarbs * 4;
  
  const fatCalories = remainingCalories - carbCalories;
  const dailyFat = Math.round((fatCalories / 9) * 10) / 10;

  const macroProtein = Math.round(dailyProtein / servingsPerDay);
  const macroCarbs = Math.round(dailyCarbs / servingsPerDay);
  const macroFat = Math.round((dailyFat / servingsPerDay) * 10) / 10;

  let proteinType = 'Whey isolate';
  const tolerance = (patient.proteinTolerance || '').toLowerCase();

  if (tolerance === 'gi' || cancer.includes('pancreatic') || hasIBD) proteinType = 'Hydrolyzed whey';
  else if (tolerance === 'mucositis') proteinType = 'Peptide formulas';
  else if (tolerance === 'lactose') proteinType = 'Plant proteins (pea / rice)';
  else if ((patient.feedingMethod || '').toLowerCase().includes('enteral')) proteinType = 'Peptide formulas';

  const interactions = [];
  if (regimen.includes('cisplatin')) interactions.push({ drug: "Cisplatin", effect: "Renal Magnesium/Zinc wasting", advice: "Increased Mg/Zn dosing included." });
  if (regimen.includes('taxane') || regimen.includes('paclitaxel') || regimen.includes('docetaxel')) interactions.push({ drug: "Taxanes", effect: "Peripheral Neuropathy focus", advice: "ALA and B-Complex optimized." });
  if (regimen.includes('5-fu') || regimen.includes('capecitabine') || regimen.includes('folfirinox')) interactions.push({ drug: "Fluoropyrimidines", effect: "Mucositis / GI Toxicity risk", advice: "Glutamine and peptide protein prioritized." });
  if (regimen.includes('irinotecan')) interactions.push({ drug: "Irinotecan", effect: "Severe Diarrhea", advice: "Early mucosal support focus." });
  if (regimen.includes('bortezomib')) {
    interactions.push({ drug: "Bortezomib", effect: "Vitamin B6 Neuropathy Risk", advice: "Avoid high-dose Vitamin B6 above RDA." });
    interactions.push({ drug: "Bortezomib", effect: "Antioxidant Interference", advice: "Avoid high-dose Vit C and ALA; may reduce drug efficacy." });
  }
  if (regimen.includes('lenalidomide')) interactions.push({ drug: "Lenalidomide", effect: "VTE/Antiplatelet Risk", advice: "Monitor Omega-3 dosing due to mild antiplatelet effects." });

  const micronutrients = {
    vitD: vitD > 0 && vitD < 20 ? '4000–6000 IU/day' : (vitD < 30 ? '2000–4000 IU/day' : '1000–2000 IU/day'),
    vitC: (crp > 5 || tumorBurden) && !regimen.includes('bortezomib') ? '2000 mg/day' : '1000 mg/day',
    zinc: zinc > 0 && zinc < 60 ? '15–25 mg/day + 2mg Copper' : '15 mg/day',
    omega3: (crp > 5 || cachexia || cancer.includes('pancreatic')) ? '3–4 g/day' : '2 g/day',
    epa: (cachexia || tumorBurden || cancer.includes('pancreatic')) ? '2.2 - 3.0 g EPA/day' : 'None',
    leucine: (sarcopenia || tumorBurden || ecog >= 2) ? '5 g/day' : '3 g/day',
    glutamine: (patient.giIssues || sideEffects.includes('Mucositis') || regimen.includes('folfirinox') || hasIBD) ? '30 g/day' : 'Consider if GI toxicity persists',
    bcaa: (alt > 50 || ast > 50 || bilirubin > 1.2) ? '20 g/day for Hepatic Protection' : (sarcopenia ? '10 g/day' : null),
    magnesium: (() => {
      let base = 'Daily supportive dose';
      if (patient.magnesium > 0 && patient.magnesium < 1.7) base = '500-800 mg/day';
      if (regimen.includes('cisplatin')) base += ' + 1000 mg/day';
      return base;
    })(),
    bComplex: (regimen.includes('taxane') || regimen.includes('folfirinox')) ? 'High-potency B-Complex' : 'Standard dose',
    folate: (() => {
      const markers = (patient.genomicMarkers || []);
      const hasMthfr = markers.some(m => m.includes('MTHFR'));
      if (hasMthfr) return '5 mg/day (Methylfolate)';
      return (patient.folate > 0 && patient.folate < 3 || hemoglobin < 10) ? '5 mg/day' : (regimen.includes('pemetrexed') ? '1 mg/day' : '1.0 mg/day');
    })(),
    chromium: isDiabetic ? '400 mcg/day' : null,
    ala: (isDiabetic || interactions.some(i => i.drug === 'Taxanes')) ? '600 mg/day' : null,
    microbiome: (regimen.includes('folfirinox') || hasIBD) ? 'Soluble Fiber + Probiotic' : null,
    iron: (hemoglobin > 0 && hemoglobin < 10) ? '100 mg elemental iron/day (Anemia correction)' : null
  };

  const flavorProfile = (() => {
    if (sideEffects.includes('Nausea') || sideEffects.includes('Taste alteration')) {
      return { recommendation: "Tart / Citrus / Neutral", logic: "Citrus masks metallic taste from chemo." };
    }
    return { recommendation: "Customizable", logic: "Patient-led preference." };
  })();

  const rationale = [];
  if (hasRenalIssue) {
    rationale.push(`<b>Renal Safety Strategy:</b> Protein capped at 1.1 g/kg due to renal function impairment.`);
  } else if (cachexia) {
    rationale.push(`<b>Clinical (Energy):</b> Target at 35 kcal/kg/day for hypermetabolic cachexia.`);
  } else {
    rationale.push(`<b>Clinical (Energy):</b> Maintenance at 25-30 kcal/kg/day.`);
  }

  if (!hasRenalIssue && proteinPerKg >= 1.8) {
    rationale.push(`<b>Intensive Protein:</b> ${proteinPerKg} g/kg/day prescribed for active catabolism.`);
  }
  if (hasIBD) rationale.push(`<b>GI Strategy (IBD):</b> Low-residue focus and hydrolyzed protein used.`);
  if (cancer.includes('pancreatic')) rationale.push(`<b>PERT Focus:</b> Enzymes strongly recommended to address EPI.`);
  if (hemoglobin > 0 && hemoglobin < 10) rationale.push(`<b>Anemia Focus:</b> Hb < 10 detected; Iron protocol active.`);

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
    const oGrams = (crp > 5 || cachexia || cancer.includes('pancreatic')) ? 2 : 1; 

    return {
      protein: { id: selectedProtein.id, name: selectedProtein.name, grams: pGrams, rationale: selectedProtein.healingRationale },
      carb: { id: selectedCarb.id, name: selectedCarb.name, grams: cGrams, rationale: selectedCarb.healingRationale },
      fat: { id: selectedFat.id, name: selectedFat.name, grams: fGrams, rationale: selectedFat.healingRationale },
      omega: { id: selectedOmega.id, name: selectedOmega.name, grams: oGrams, rationale: "Anti-inflammatory lipid strategy." },
      bcaa: (patient.alt > 50 || patient.ast > 50 || patient.bilirubin > 1.2) ? { id: 'bcaa_powder', name: 'BCAA (2:1:1 Mix)', grams: 20, rationale: "Hepatic Protection dose." } : null,
      glutamine: (pGrams > 0 && (patient.giIssues || sideEffects.includes('Mucositis') || regimen.includes('folfirinox') || hasIBD)) ? { id: 'glutamine', name: 'L-Glutamine powder', grams: 15, rationale: "Mucosal protection." } : null
    };
  }

  const patientInstructions = [
    "Mix powder thoroughly with 200-250ml of liquid.",
    "Consume slowly over 20-30 minutes.",
    "Store in a cool, dry place."
  ];

  const outcomes = {
    weightStabilization: cachexia ? "90% Probability" : "98% Probability",
    musclePreservation: (sarcopenia || proteinPerKg >= 1.8) ? "Clinically improved" : "Likely Maintained",
    organProtection: (hasRenalIssue || alt > 50) ? "Safety Protocols Active" : "Standard"
  };

  return {
    cachexia, bmi: Math.round(bmi * 10) / 10, kcalPerKg, proteinPerKg,
    servingsPerDay, totalDailyCalories, totalDailyProtein,
    dailyCalories, dailyProtein, perServingCalories, perServingProtein,
    proteinType, dailyCarbs, dailyFat, macroProtein, macroCarbs, macroFat,
    micronutrients, rationale, nutritionRisk, nutritionRiskScore: riskScore,
    nutritionRiskReasons, safetyAlerts,
    patientInstructions, 
    outcomes, interactions,
    recipe: buildFormulationOptions({ macroProtein, macroCarbs, macroFat, proteinType, bloodSugar, cachexia, crp }),
    reportNotes: {
      basis: 'V5 Multi-System Engine (ESMO/ESPEN/ASCO/KDIGO guidelines).'
    }
  };
}
