function generateNutritionPlan(patient) {

  const weight = parseFloat(patient.weight || 0);
  const height = parseFloat(patient.height || 0);
  const albumin = parseFloat(patient.albumin || 0);
  const weightLossPercent = parseFloat(patient.weightLossPercent || 0);
  const bmi = height ? (weight / Math.pow(height / 100, 2)) : 0;

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

  let nutritionRisk = 'Low';
  if (riskScore >= 4) nutritionRisk = 'High';
  else if (riskScore >= 2) nutritionRisk = 'Moderate';

  const cachexia = albumin < 3.5 || weightLossPercent >= 10 || bmi < 18.5;

  const kcalPerKg = cachexia ? 35 : 30;
  const proteinPerKg = cachexia ? 1.8 : 1.4;

  const dailyCalories = Math.round(weight * kcalPerKg);
  const dailyProtein = Math.round(weight * proteinPerKg);

  const servingsPerDay = 3;
  const perServingCalories = Math.round(dailyCalories / servingsPerDay);
  const perServingProtein = Math.round(dailyProtein / servingsPerDay);

  const proteinCaloriesFromSplit = dailyCalories * 0.30;
  const carbCalories = dailyCalories * 0.30;
  const fatCalories = dailyCalories * 0.40;

  const dailyCarbs = Math.round(carbCalories / 4);
  const dailyFat = Math.round((fatCalories / 9) * 10) / 10;

  const macroProtein = Math.round((proteinCaloriesFromSplit / 4) / servingsPerDay);
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
    iron: 'When anemia is present'
  };

  const rationale = [
    `Energy: ${kcalPerKg} kcal/kg/day based on oncology nutrition support`,
    `Protein: ${proteinPerKg} g/kg/day to support lean body mass`,
    cachexia ? 'Higher nutritional risk / cachexia tendency detected' : 'No major cachexia trigger detected',
    '3 servings/day selected for better tolerance and intake feasibility',
    'Macro split set to Protein 30% / Carbohydrate 30% / Fat 40%',
    'Use supplementation when normal oral intake is inadequate'
  ];

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
    reportNotes: {
      nutritionRiskBasis: 'Nutrition risk is estimated from serum albumin, recent weight loss, BMI, and GI/tolerance issues.',
      proteinValueBasis: 'Protein value varies based on body weight, nutrition risk, cachexia tendency, recent weight loss, and tolerance status.'
    }
  };
}
