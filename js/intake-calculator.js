/**
 * Dietary Intake Reference Library
 * Average calories for standard portions typically consumed by oncology patients.
 */
const FoodLibrary = [
  { id: 'full_meal', name: 'Full Balanced Meal', avgKcal: 600, description: 'Rice/Pasta, Protein (Chicken/Fish), Veggies' },
  { id: 'half_meal', name: 'Half-Portion Meal', avgKcal: 300, description: 'Smaller plate or half-finished balanced meal' },
  { id: 'snack_heavy', name: 'High-Calrie Snack', avgKcal: 250, description: 'Nuts, Nut Butter Toast, Avocado' },
  { id: 'snack_light', name: 'Light Snack', avgKcal: 120, description: 'Fruit, plain yogurt, biscuits' },
  { id: 'liquid_supp', name: 'Oral Supplement Drink', avgKcal: 300, description: 'Standard 200ml medical nutrition drink' },
  { id: 'porridge', name: 'Rice Porridge / Congee', avgKcal: 200, description: 'Standard bowl, minimal protein' },
  { id: 'beverage_sweet', name: 'Sweetened Beverage', avgKcal: 150, description: 'Juice, sweetened tea/coffee' }
];

function calculateIntakeGap(patientTotalKcalNeeded, meals) {
  // meals = [{ foodId: 'xx', portions: 1 }, ...]
  let actualIntake = 0;
  meals.forEach(m => {
    const food = FoodLibrary.find(f => f.id === m.foodId);
    if(food) actualIntake += (food.avgKcal * (m.portions || 0));
  });

  const deficitKcal = Math.max(0, patientTotalKcalNeeded - actualIntake);
  const intakePercent = patientTotalKcalNeeded > 0 ? Math.round((actualIntake / patientTotalKcalNeeded) * 100) : 100;
  const deficitPercent = 100 - intakePercent;

  return {
    actualIntake,
    deficitKcal,
    intakePercent,
    deficitPercent: Math.max(0, deficitPercent)
  };
}
