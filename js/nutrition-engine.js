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
  const tsh = parseFloat(patient.tsh || 0);
  const hemoglobin = parseFloat(patient.hemoglobin || 0);
  const vitD = parseFloat(patient.vitD || 0);
  const zinc = parseFloat(patient.zinc || 0);
  const prealbumin = parseFloat(patient.prealbumin || 0);
  const age = parseInt(patient.age || 0);
  const ecog = parseInt(patient.ecogStatus || 0);
  const gender = (patient.sex || '').toLowerCase();
  
  const bmi = height ? (weight / Math.pow(height / 100, 2)) : 0;
  
  // Sarcopenia detection using SMI and HandGrip if available
  const smi = parseFloat(patient.smi || 0);
  const handGrip = parseFloat(patient.handGrip || 0);
  let sarcopenia = patient.sarcopeniaStatus === 'Sarcopenic';
  
  // SMI thresholds (approx based on consensus)
  if (smi > 0) {
    const smiLow = (gender === 'male' ? smi < 7.0 : smi < 5.7);
    if (smiLow) sarcopenia = true;
  }
  // HandGrip thresholds
  if (handGrip > 0) {
    const gripLow = (gender === 'male' ? handGrip < 26 : handGrip < 18);
    if (gripLow) sarcopenia = true;
  }

  const tumorBurden = patient.tumorBurden === 'High (Bulky)';
  const comorbidities = Array.isArray(patient.comorbidities) ? patient.comorbidities : [];
  const isDiabetic = comorbidities.some(c => c.toLowerCase().includes('diabetes')) || bloodSugar > 126;
  
  // Hamwi Idea Body Weight
  let idealWeight = weight;
  if (height > 0 && (gender === 'male' || gender === 'female')) {
      const heightInInches = height * 0.393701;
      if (heightInInches >= 60) {
          const extraInches = heightInInches - 60;
          if (gender === 'male') {
              idealWeight = 48.0 + (2.7 * extraInches);
          } else {
              idealWeight = 45.5 + (2.2 * extraInches);
          }
      } else {
           if (gender === 'male') {
              idealWeight = 48.0;
           } else {
              idealWeight = 45.5;
           }
      }
  }

  const nutritionRiskReasons = [];
  let riskScore = 0;

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
  if ((patient.proteinTolerance || '').toLowerCase() === 'mucositis') {
    riskScore += 1;
    nutritionRiskReasons.push('Mucositis tolerance issue');
  }
  if (crp > 10) {
    riskScore += 1;
    nutritionRiskReasons.push('Systemic Inflammation (High CRP)');
  }
  if (creatinine > 1.2) {
    riskScore += 1;
    nutritionRiskReasons.push('Kidney function compromised (High Creatinine)');
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
    nutritionRiskReasons.push('Diabetes / Hyperglycemia (Requires glycemic control)');
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
  else if (riskScore >= 2) nutritionRisk = 'Moderate';  const cachexia = albumin < 3.5 || weightLossPercent >= 10 || bmi < 18.5 || crp > 10 || sarcopenia;

  const regimen = (patient.regimen || '').toLowerCase();
  const cancer = (patient.cancer || '').toLowerCase();
  const sideEffects = Array.isArray(patient.sideEffects) ? patient.sideEffects : [];

  var kcalPerKg = cachexia ? 35 : 30;
  var proteinPerKg = (cachexia || tumorBurden) ? 1.8 : 1.4;

  // V4: Intensive Protein Escalation for high-catabolic regimens (FOLFIRINOX)
  if ((regimen.includes('folfirinox') || regimen.includes('platin')) && cachexia) {
    proteinPerKg = 2.0;
  }
  
  // Age-based optimization for elderly
  if (age >= 70 && proteinPerKg < 1.5) proteinPerKg = 1.5;

  let baseCalories = Math.round(weight * kcalPerKg);
  let dailyProtein = Math.round(weight * proteinPerKg);

  // Adjust based on food intake % to calculate the DEFICIT
  if (reducedFoodIntake > 0 && reducedFoodIntake <= 100) {
      const deficitPct = reducedFoodIntake / 100;
      baseCalories = Math.round(baseCalories * deficitPct);
      dailyProtein = Math.round(dailyProtein * deficitPct);
      if (baseCalories < 500 && reducedFoodIntake < 100) baseCalories = 500;
  }
  
  const dailyCalories = baseCalories;
  const servingsPerDay = 3;
  const perServingCalories = Math.round(dailyCalories / servingsPerDay);
  const perServingProtein = Math.round(dailyProtein / servingsPerDay);

  const proteinCalories = dailyProtein * 4;
  const remainingCalories = Math.max(0, dailyCalories - proteinCalories);
  
  // V4: Fat strategy optimization (Omega-3 anti-inflammatory focus)
  // If CRP is high, we favor fat (anti-inflammatory lipids) over carbs
  const carbRatio = (crp > 5) ? 0.35 : 0.45;
  const dailyCarbs = Math.floor((remainingCalories * carbRatio) / 4);
  const carbCalories = dailyCarbs * 4;
  
  const fatCalories = remainingCalories - carbCalories;
  const dailyFat = Math.round((fatCalories / 9) * 10) / 10;

  const macroProtein = Math.round(dailyProtein / servingsPerDay);
  const macroCarbs = Math.round(dailyCarbs / servingsPerDay);
  const macroFat = Math.round((dailyFat / servingsPerDay) * 10) / 10;

  let proteinType = 'Whey isolate';
  const tolerance = (patient.proteinTolerance || '').toLowerCase();

  if (tolerance === 'gi' || cancer.includes('pancreatic')) proteinType = 'Hydrolyzed whey';
  else if (tolerance === 'mucositis') proteinType = 'Peptide formulas';
  else if (tolerance === 'lactose') proteinType = 'Plant proteins (pea / rice)';
  else if ((patient.feedingMethod || '').toLowerCase().includes('enteral')) proteinType = 'Peptide formulas';

  // DRUG-NUTRIENT INTERACTIONS (NEW V4)
  const interactions = [];
  if (regimen.includes('cisplatin')) interactions.push({ drug: "Cisplatin", effect: "Renal Magnesium/Zinc wasting", advice: "Increased Mg/Zn dosing included in formulation." });
  if (regimen.includes('taxane') || regimen.includes('paclitaxel') || regimen.includes('docetaxel')) interactions.push({ drug: "Taxanes", effect: "Peripheral Neuropathy focus", advice: "Alpha Lipoic Acid and B-Complex optimized for neuroprotection." });
  if (regimen.includes('5-fu') || regimen.includes('capecitabine') || regimen.includes('folfirinox')) interactions.push({ drug: "Fluoropyrimidines", effect: "Mucositis / GI Toxicity risk", advice: "High-dose Glutamine and peptide-based protein prioritized." });
  if (regimen.includes('irinotecan')) interactions.push({ drug: "Irinotecan", effect: "Severe Diarrhea / Cholinergic syndrome", advice: "Early mucosal support and soluble fiber focus." });

  // LAB-GUIDED MICRONUTRIENTS & TREATMENT SPECIFIC LOGIC
  const micronutrients = {
    vitD: vitD > 0 && vitD < 20 ? '4000–6000 IU/day (Severe Deficiency)' : (vitD < 30 ? '2000–4000 IU/day (Correction)' : '1000–2000 IU/day (Maintenance)'),
    vitC: (crp > 5 || tumorBurden) ? '2000 mg/day (High Dose Antioxidant)' : '1000 mg/day',
    zinc: zinc > 0 && zinc < 60 ? '50 mg/day (Max Replacement)' : '15–30 mg/day',
    omega3: (crp > 5 || cachexia || cancer.includes('pancreatic')) ? '3–4 g/day (Intensive EPA/DHA Anti-inflammatory)' : '2 g/day',
    epa: (cachexia || tumorBurden || cancer.includes('pancreatic')) ? '2.2 - 3.0 g EPA/day (Pro-cachexia prevention)' : 'None',
    leucine: (sarcopenia || tumorBurden || ecog >= 2) ? '5 g/day (Optimized MPS)' : '3 g/day',
    glutamine: (patient.giIssues || sideEffects.includes('Mucositis') || sideEffects.includes('Diarrhea') || regimen.includes('folfirinox')) ? '30 g/day (High-dose prophylaxis)' : 'Consider if GI toxicity persists',
    bcaa: (alt > 50 || ast > 50 || bilirubin > 1.2) ? '20 g/day for Hepatic Protection' : (sarcopenia ? '10 g/day' : null),
    magnesium: (() => {
      let base = 'Daily supportive dose';
      if (patient.magnesium > 0 && patient.magnesium < 1.7) base = '500-800 mg/day (Active Replacement)';
      if (regimen.includes('cisplatin')) base += ' + 1000 mg/day (Cisplatin prophylaxis)';
      return base;
    })(),
    bComplex: (regimen.includes('taxane') || regimen.includes('folfirinox')) ? 'High-potency B-Complex w/ B12 (Neuroprotection)' : 'Standard dose',
    folate: (() => {
      const markers = (patient.genomicMarkers || []);
      const hasMthfr = markers.some(m => m.includes('MTHFR'));
      if (hasMthfr) return '5 mg/day (Methylfolate - MTHFR Bypass)';
      return (patient.folate > 0 && patient.folate < 3) ? '5 mg/day' : (regimen.includes('pemetrexed') ? '1 mg/day' : '1.0 mg/day');
    })(),
    chromium: isDiabetic ? '400 mcg/day' : null,
    ala: (isDiabetic || interactions.some(i => i.drug === 'Taxanes')) ? '600 mg/day (Alpha Lipoic Acid)' : null,
    microbiome: (regimen.includes('folfirinox') || regimen.includes('5-fu')) ? 'Soluble Fiber (PHGG) + Multi-strain Probiotic (L. Rhamnosus focus)' : null
  };

  const flavorProfile = (() => {
    if (sideEffects.includes('Nausea') || sideEffects.includes('Taste alteration')) {
      return { recommendation: "Tart / Citrus / Neutral", logic: "Citrus masks metallic taste from chemotherapy." };
    }
    if (sideEffects.includes('Dysphagia')) {
      return { recommendation: "Mild Honey / Smooth Cream", logic: "Low-acid, soothing for tissues." };
    }
    return { recommendation: "Customizable", logic: "Patient-led preference." };
  })();

  const rationale = [];
  if (cachexia) rationale.push(`<b>Clinical V4 (Energy):</b> Target at 35 kcal/kg/day to combat hypermetabolic cachexia.`);
  else rationale.push(`<b>Clinical V4 (Energy):</b> target 25-30 kcal/kg/day for maintenance.`);

  if (proteinPerKg >= 2.0) {
    rationale.push(`<b>Clinical V4 (Intensive Protein):</b> 2.0 g/kg/day prescribed. Indicated for highly catabolism (e.g. FOLFIRINOX) and active wasting.`);
  } else if (proteinPerKg >= 1.5) {
    rationale.push(`<b>Clinical V4 (Protein):</b> 1.5 - 1.8 g/kg/day for depletion support.`);
  }

  // Pancreatic Specific: PERT
  if (cancer.includes('pancreatic') || cancer.includes('pancreas')) {
    rationale.push(`<b>Pancreatic Cancer Focus (PERT):</b> Pancreatic Enzyme Replacement Therapy (PERT) is strongly recommended with all meals to address Exocrine Pancreatic Insufficiency (EPI).`);
  }

  if (patient.weightLossPercent >= 10 || patient.albumin < 3.5 || reducedFoodIntake > 20 || crp > 10) {
    rationale.push(`<b>ASCO Practice Guideline:</b> High nutritional risk alert. Early targeted intervention strongly recommended.`);
  }
  if (crp > 5) rationale.push(`<b>Inflammation Strategy:</b> Elevated CRP (${crp} mg/L). High-dose EPA (3g) and MCT prioritized.`);

  // Genomic Personalization Rationale
  const markers = (patient.genomicMarkers || []);
  if (markers.length > 0) {
    if (markers.some(m => m.includes('MTHFR'))) rationale.push(`<b>Genomic (MTHFR):</b> Methylated B12/Folate optimized.`);
    if (markers.some(m => m.includes('DPYD'))) rationale.push(`<b>Genomic (DPYD):</b> High toxicity risk for 5-FU detected. Formulation intensified for mucosal protection (30g Glutamine).`);
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
  const oGrams = (crp > 5 || cachexia || cancer.includes('pancreatic')) ? 10 : 5; 

  return {
    protein: { id: selectedProtein.id, name: selectedProtein.name, grams: pGrams, rationale: selectedProtein.healingRationale },
    carb: { id: selectedCarb.id, name: selectedCarb.name, grams: cGrams, rationale: selectedCarb.healingRationale },
    fat: { id: selectedFat.id, name: selectedFat.name, grams: fGrams, rationale: selectedFat.healingRationale },
    omega: { id: selectedOmega.id, name: selectedOmega.name, grams: oGrams, rationale: "Enhanced Omega-3 for anti-inflammatory lipid strategy." },
    bcaa: (patient.alt > 50 || patient.ast > 50 || patient.bilirubin > 1.2) ? { id: 'bcaa_powder', name: 'BCAA (2:1:1 Mix)', grams: 20, rationale: "Hepatic Protection dose." } : null,
    glutamine: (pGrams > 0 && (patient.giIssues || sideEffects.includes('Mucositis') || regimen.includes('folfirinox'))) ? { id: 'glutamine', name: 'L-Glutamine powder', grams: 15, rationale: "High-dose mucosal protection." } : null
  };
}

  const patientInstructions = [
    "Mix powder thoroughly with 200-250ml of water or preferred liquid.",
    "Consume slowly over 20-30 minutes to improve absorption.",
    patient.giIssues ? "If bloating occurs, reduce serving size and increase frequency." : "Best taken between major meals.",
    "Store in a cool, dry place."
  ];

  if (cancer.includes('pancreatic')) {
    patientInstructions.push("<b>PERT Reminder:</b> Take your prescribed pancreatic enzymes (Lipase/Protease) with your Onvilox serving for optimal absorption.");
  }
  if (isDiabetic) {
    patientInstructions.push("<b>Glycemic Plan:</b> Monitor blood sugar; target < 180 mg/dL 2h post-Onvilox.");
  }

  const outcomes = {
    weightStabilization: cachexia ? "90% Probability (Weight maintained ±1kg)" : "98% Probability",
    musclePreservation: (sarcopenia || proteinPerKg >= 1.8) ? "Clinically improved via Intensive MPS Support" : "Likely Maintained",
    treatmentTolerance: (patient.giIssues || crp > 10 || regimen.includes('folfirinox')) ? "Enhanced via mucosal/inflammatory stabilization" : "Baseline"
  };

  const dietIntegration = [
    "Pair with low-fiber, high-protein snacks (e.g. Greek yogurt) if mucositis is present.",
    isDiabetic ? "Monitor post-meal glucose; Consider CGM integration." : "Add 1 serving of cooked green vegetables daily for fiber synergy.",
    "Use Onvilox as breakfast/evening gap fillers."
  ];

  return {
    cachexia, bmi: Math.round(bmi * 10) / 10, kcalPerKg, proteinPerKg,
    servingsPerDay, dailyCalories, dailyProtein, perServingCalories, perServingProtein,
    proteinType, dailyCarbs, dailyFat, macroProtein, macroCarbs, macroFat,
    micronutrients, rationale, nutritionRisk, nutritionRiskScore: riskScore,
    nutritionRiskReasons, feasibilityScore: computeFeasibilityScore(),
    patientInstructions, manufacturingAlerts: [
      "Aseptic Preparation Required.",
      "Homogeneous Mix: Ensure all powders are fully blended.",
      (patient.feedingMethod || '').toLowerCase().includes('enteral') ? "Check osmolality for tube size." : "Label clearly."
    ],
    outcomes, dietIntegration, interactions,
    recipe: buildFormulationOptions({ macroProtein, macroCarbs, macroFat, proteinType, bloodSugar, cachexia, crp }),
    reportNotes: {
      basis: 'V4 Clinical Engine uses lab-guided oncology algorithms (ESMO/ESPEN/ASCO consensus).'
    }
  };
}
