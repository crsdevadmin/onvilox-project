/**
 * Onvilox Ingredient Master Library
 * Used by the Formulation Optimizer to generate recipes based on clinical targets.
 */

const IngredientLibrary = [
  // PROTEINS
  {
    id: 'whey_isolate',
    name: 'Whey Protein Isolate (90%)',
    category: 'PROTEIN',
    kcalPerGram: 3.6,
    pPerGram: 0.9,
    fPerGram: 0.01,
    cPerGram: 0.02,
    costPerGram: 0.05,
    inStock: true,
    tags: ['HighLeucine', 'Animal-based'],
    healingRationale: "High Leucine content to stimulate muscle protein synthesis during treatment."
  },
  {
    id: 'whey_hydrolyzed',
    name: 'Hydrolyzed Whey Protein',
    category: 'PROTEIN',
    kcalPerGram: 3.6,
    pPerGram: 0.85,
    fPerGram: 0.01,
    cPerGram: 0.02,
    costPerGram: 0.08, 
    inStock: true,
    tags: ['Peptide', 'LowOsmolality', 'GI-Friendly'],
    healingRationale: "Hydrolyzed peptides for rapid absorption and reduced osmotic load in patients with GI toxicity."
  },
  {
    id: 'pea_protein',
    name: 'Pea Protein Isolate',
    category: 'PROTEIN',
    kcalPerGram: 3.8,
    pPerGram: 0.8,
    fPerGram: 0.05,
    cPerGram: 0.02,
    costPerGram: 0.04,
    inStock: true,
    tags: ['LactoseFree', 'Plant-based', 'Vegan'],
    healingRationale: "Plant-based isolate for patients with lactose intolerance or specific dietary preferences."
  },

  // FATS
  {
    id: 'mct_oil',
    name: 'MCT Oil (Pure)',
    category: 'FAT',
    kcalPerGram: 8.3,
    pPerGram: 0,
    fPerGram: 1.0,
    cPerGram: 0,
    costPerGram: 0.03,
    inStock: true,
    tags: ['QuickEnergy', 'Liquid'],
    healingRationale: "Medium-chain triglycerides for rapid energy bypass and absorption in cases of malabsorption."
  },
  {
    id: 'mct_powder',
    name: 'MCT Powder (70%)',
    category: 'FAT',
    kcalPerGram: 6.5,
    pPerGram: 0,
    fPerGram: 0.7,
    cPerGram: 0.3,
    costPerGram: 0.04,
    inStock: true,
    tags: ['Powder', 'EasyMix'],
    healingRationale: "Easily mixable fat source to maintain caloric density without increasing intake volume."
  },
  {
    id: 'omega3_powder',
    name: 'Omega-3 (EPA/DHA) Powder',
    category: 'FAT',
    kcalPerGram: 5.0,
    pPerGram: 0,
    fPerGram: 0.5,
    cPerGram: 0.5,
    costPerGram: 0.12,
    inStock: true,
    tags: ['AntiInflammatory', 'EPA'],
    healingRationale: "High EPA content to downregulate pro-inflammatory cytokines and help stabilize lean body mass."
  },

  // CARBOHYDRATES
  {
    id: 'maltodextrin',
    name: 'Maltodextrin (DE 19)',
    category: 'CARB',
    kcalPerGram: 3.8,
    pPerGram: 0,
    fPerGram: 0,
    cPerGram: 0.95,
    costPerGram: 0.01,
    inStock: true,
    tags: ['ComplexCarb', 'EasyAbsorption'],
    healingRationale: "Complex carbohydrate with low osmolality for sustained energy release and GI comfort."
  },
  {
    id: 'palatinose',
    name: 'Palatinose (Slow Release)',
    category: 'CARB',
    kcalPerGram: 4.0,
    pPerGram: 0,
    fPerGram: 0,
    cPerGram: 1.0,
    costPerGram: 0.03,
    inStock: true,
    tags: ['LowGlycemic', 'SlowEnergy'],
    healingRationale: "Slow-release carbohydrate to maintain stable blood glucose levels in diabetic oncology patients."
  },

  // ADDITIVES / FUNCTIONAL
  {
    id: 'glutamine',
    name: 'L-Glutamine (USP)',
    category: 'AMINO',
    kcalPerGram: 4.0,
    pPerGram: 1.0,
    fPerGram: 0,
    cPerGram: 0,
    costPerGram: 0.05,
    inStock: true,
    tags: ['Immunonutrition', 'MucositisSupport'],
    healingRationale: "Amino acid support for intestinal mucosal integrity and reduction of mucositis symptoms."
  },
  {
    id: 'bcaa_powder',
    name: 'BCAA (2:1:1 Mix)',
    category: 'AMINO',
    kcalPerGram: 4.0,
    pPerGram: 1.0,
    fPerGram: 0,
    cPerGram: 0,
    costPerGram: 0.10,
    inStock: true,
    tags: ['LiverSupport', 'MusclePreservation'],
    healingRationale: "Branched-Chain Amino Acids to support protein synthesis and nitrogen balance, specifically indicated in liver dysfunction."
  }
];

// Helper to get ingredients by tag
function getIngredientsByTag(tag) {
  return IngredientLibrary.filter(i => i.tags.includes(tag) && i.inStock);
}

// Helper to get ingredients by category
function getIngredientsByCategory(cat) {
  return IngredientLibrary.filter(i => i.category === cat && i.inStock);
}
