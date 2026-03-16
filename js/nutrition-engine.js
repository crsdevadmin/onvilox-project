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
  const ecog = parseInt(patient.ecogStatus || 0);
  
  const bmi = height ? (weight / Math.pow(height / 100, 2)) : 0;
  
  // Hamwi Idea Body Weight
  let idealWeight = weight;
  const gender = (patient.sex || '').toLowerCase();
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

  let nutritionRisk = 'Low';
  if (riskScore >= 4) nutritionRisk = 'High';
  else if (riskScore >= 2) nutritionRisk = 'Moderate';

  const cachexia = albumin < 3.5 || weightLossPercent >= 10 || bmi < 18.5 || crp > 10;

  const kcalPerKg = cachexia ? 35 : 30;
  const proteinPerKg = cachexia ? 1.8 : 1.4;

  let baseCalories = Math.round(weight * kcalPerKg);
  let dailyProtein = Math.round(weight * proteinPerKg);

  // Adjust based on food intake % to calculate the DEFICIT
  // If input is "40%" reduced, the product should cover that 40% deficit.
  if (reducedFoodIntake > 0 && reducedFoodIntake <= 100) {
      const deficitPct = reducedFoodIntake / 100;
      baseCalories = Math.round(baseCalories * deficitPct);
      dailyProtein = Math.round(dailyProtein * deficitPct);
      
      // Ensure it doesn't drop below a critical amount maliciously
      if (baseCalories < 500 && reducedFoodIntake < 100) baseCalories = 500;
  }
  
  const dailyCalories = baseCalories;

  const servingsPerDay = 3;
  const perServingCalories = Math.round(dailyCalories / servingsPerDay);
  const perServingProtein = Math.round(dailyProtein / servingsPerDay);

  // Exact math to make macros = calories
  const proteinCalories = dailyProtein * 4;
  const remainingCalories = Math.max(0, dailyCalories - proteinCalories);
  
  // Split remaining into approx 45% carbs / 55% fat
  // We use Math.floor for carbs and force fat to make up the exact difference
  const dailyCarbs = Math.floor((remainingCalories * 0.45) / 4);
  const carbCalories = dailyCarbs * 4;
  
  const fatCalories = remainingCalories - carbCalories;
  const dailyFat = Math.round((fatCalories / 9) * 10) / 10;

  const macroProtein = Math.round(dailyProtein / servingsPerDay);
  const macroCarbs = Math.round(dailyCarbs / servingsPerDay);
  const macroFat = Math.round((dailyFat / servingsPerDay) * 10) / 10;

  let proteinType = 'Whey isolate';
  const tolerance = (patient.proteinTolerance || '').toLowerCase();

  if (tolerance === 'gi') proteinType = 'Hydrolyzed whey';
  else if (tolerance === 'mucositis') proteinType = 'Peptide formulas';
  else if (tolerance === 'lactose') proteinType = 'Plant proteins (pea / rice)';
  else if ((patient.feedingMethod || '').toLowerCase().includes('enteral')) proteinType = 'Peptide formulas';

  const micronutrients = {
    vitD: '1000–2000 IU/day',
    vitC: '500–1000 mg/day',
    zinc: '8–15 mg/day',
    omega3: '1.5–2 g/day',
    epa: 'Around 2 g EPA/day for cachexia support',
    leucine: '2–3 g/day or as clinically indicated',
    hmb: 'Around 3 g/day when muscle preservation is needed',
    glutamine: patient.giIssues ? '5–10 g/day as tolerated' : 'Consider if mucositis / GI toxicity',
    selenium: 'Add as clinically indicated',
    magnesium: 'Add as clinically indicated',
    bComplex: 'Daily supportive supplementation',
    iron: 'When anemia is present',
    bcaa: (alt > 50 || ast > 50 || bilirubin > 1.2) ? '10–20 g/day Branched-Chain Amino Acids (BCAA) recommended for liver support' : null
  };

  const rationale = [];
  
  // Energy Guideline
  if (cachexia) {
    rationale.push(`<b>ESPEN Guideline (Energy):</b> Target increased to 30-35 kcal/kg/day due to hypermetabolic state, severe weight loss, or cachexia to prevent further nutritional deterioration.`);
  } else {
    rationale.push(`<b>ESPEN Guideline (Energy):</b> Target set to 25-30 kcal/kg/day for ambulating oncology patients for weight maintenance.`);
  }

  // Protein Guideline
  if (proteinPerKg >= 1.5) {
    rationale.push(`<b>ESPEN Guideline (Protein):</b> Elevated target of 1.5 - 2.0 g/kg/day prescribed. Indicated for cancer patients in advanced cachexia or severe depletion to actively support lean body mass.`);
  } else {
    rationale.push(`<b>ESPEN Guideline (Protein):</b> Target of >1.0 to 1.5 g/kg/day prescribed to maintain muscle mass during active oncology treatment.`);
  }

  // ASCO screening/assessment
  if (patient.weightLossPercent >= 10 || patient.albumin < 3.5 || patient.reducedFoodIntake > 20 || crp > 10) {
    let reasons = [];
    if (patient.weightLossPercent >= 10) reasons.push('Severe weight loss');
    if (patient.albumin < 3.5) reasons.push('Hypoalbuminemia');
    if (patient.reducedFoodIntake > 20) reasons.push('Reduced Intake');
    if (crp > 10) reasons.push('Systemic Inflammation');
    
    rationale.push(`<b>ASCO Practice Guideline:</b> Patient triggered high nutritional risk alert (${reasons.join(', ')}). Early targeted nutritional intervention is strongly recommended to improve tolerance to oncology therapy.`);
  }

  // Systemic Inflammation (CRP)
  if (crp > 10) {
    rationale.push(`<b>ESPEN Guideline (Systemic Inflammation):</b> Elevated CRP (>10 mg/L) indicates a state of systemic inflammation which is a key component of cancer cachexia. Metabolism is altered, prioritizing nutrient repartitioning towards inflammatory processes rather than muscle maintenance.`);
  }

  // Immunonutrition / EPA
  if (cachexia || patient.weightLossPercent >= 5) {
    rationale.push(`<b>ESPEN Guideline (Omega-3/EPA):</b> Supplementation with 1.5-2g/day of EPA/DHA is recommended in advanced cancer patients undergoing chemotherapy at risk of weight loss, to help stabilize weight, preserve lean body mass, and improve appetite.`);
  }

  // Protein source / GI
  if (patient.giIssues || (patient.proteinTolerance || '').toLowerCase() === 'gi') {
    rationale.push(`<b>Clinical Formulation:</b> Hydrolyzed protein / peptide-based formula prescribed due to reported GI issues or mucositis, to improve absorption and reduce osmotic diarrhea compared to intact proteins.`);
  } else {
    rationale.push(`<b>Clinical Formulation:</b> Standard high-biological-value protein (e.g. Whey isolate) utilized for optimal leucine content to stimulate muscle protein synthesis.`);
  }

function buildFormulationOptions(targets) {
  if (typeof IngredientLibrary === 'undefined') return null;

  const { macroProtein, macroCarbs, macroFat, proteinType } = targets;

  // 1. Find the best protein match
  let selectedProtein = IngredientLibrary.find(i => i.id === 'whey_isolate');
  if (proteinType.toLowerCase().includes('hydrolyzed') || proteinType.toLowerCase().includes('peptide')) {
    selectedProtein = IngredientLibrary.find(i => i.id === 'whey_hydrolyzed');
  } else if (proteinType.toLowerCase().includes('plant')) {
    selectedProtein = IngredientLibrary.find(i => i.id === 'pea_protein');
  }

  // 2. Find carbs and fat
  const selectedCarb = IngredientLibrary.find(i => i.id === 'maltodextrin');
  const selectedFat = IngredientLibrary.find(i => i.id === 'mct_powder');

  // Grams per serving calculation
  const pGrams = Math.round(macroProtein / (selectedProtein.pPerGram || 1));
  const carbsFromProtein = pGrams * (selectedProtein.cPerGram || 0);
  const fatFromProtein = pGrams * (selectedProtein.fPerGram || 0);

  const neededCarbs = Math.max(0, macroCarbs - carbsFromProtein);
  const neededFat = Math.max(0, macroFat - fatFromProtein);

  const cGrams = Math.round(neededCarbs / (selectedCarb.cPerGram || 1));
  const fGrams = Math.round(neededFat / (selectedFat.fPerGram || 1));

  return {
    protein: { 
      id: selectedProtein.id, 
      name: selectedProtein.name, 
      grams: pGrams, 
      rationale: selectedProtein.healingRationale 
    },
    carb: { 
      id: selectedCarb.id, 
      name: selectedCarb.name, 
      grams: cGrams, 
      rationale: selectedCarb.healingRationale 
    },
    fat: { 
      id: selectedFat.id, 
      name: selectedFat.name, 
      grams: fGrams, 
      rationale: selectedFat.healingRationale 
    },
    bcaa: (patient.alt > 50 || patient.ast > 50 || patient.bilirubin > 1.2) ? {
      id: 'bcaa_powder',
      name: 'BCAA (2:1:1 Mix)',
      grams: 15,
      rationale: "Included for liver support and to help maintain nitrogen balance in patients with elevated liver enzymes."
    } : null
  };
}

  function computeFeasibilityScore() {
    let score = 100;
    if (albumin < 3.0) score -= 10;
    if (weightLossPercent > 10) score -= 10;
    if (reducedFoodIntake > 50) score -= 10;
    if (patient.giIssues) score -= 5;
    if (crp > 30) score -= 5;
    if (bmi < 17) score -= 5;
    return Math.max(0, score);
  }

  const patientInstructions = [
    "Mix powder thoroughly with 200-250ml of water or preferred liquid.",
    "Consume slowly over 20-30 minutes to improve absorption.",
    patient.giIssues ? "If bloating occurs, reduce serving size and increase frequency." : "Best taken between major meals as a nutritional supplement.",
    "Store in a cool, dry place."
  ];

  const manufacturingAlerts = [
    "Aseptic Preparation: Mandatory for immunocompromised oncology patients.",
    "Homogeneous Mix: Ensure all powders are fully blended before packaging.",
    (patient.feedingMethod || '').toLowerCase().includes('enteral') ? "Tube Compatibility: Ensure osmolality and viscosity are suitable for the prescribed tube size." : "Labeling: Clearly mark expiry and storage instructions."
  ];

  const feasibilityScore = computeFeasibilityScore();

  return {
    cachexia,
    bmi: Math.round(bmi * 10) / 10,
    kcalPerKg,
    proteinPerKg,
    servingsPerDay,
    dailyCalories,
    dailyProtein,
    perServingCalories,
    perServingProtein,
    proteinType,
    dailyCarbs,
    dailyFat,
    macroProtein,
    macroCarbs,
    macroFat,
    micronutrients,
    rationale,
    nutritionRisk,
    nutritionRiskScore: riskScore,
    nutritionRiskReasons,
    feasibilityScore,
    patientInstructions,
    manufacturingAlerts,
    recipe: buildFormulationOptions({ macroProtein, macroCarbs, macroFat, proteinType }),
    reportNotes: {
      nutritionRiskBasis: 'Nutrition risk is estimated from serum albumin, recent weight loss, BMI, CRP, and GI issues.',
      proteinValueBasis: 'Protein value varies based on body weight, inflammation (CRP), cachexia tendency, and tolerance status.'
    }
  };
}
