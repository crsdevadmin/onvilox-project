// ================================
// ONVILOX MASTER MEDICAL DATA
// ================================

// Cancer → Regimen Mapping
const cancerRegimenMap = {

  "Breast Cancer – Invasive Ductal Carcinoma (IDC)": [
    "AC-T (Doxorubicin + Cyclophosphamide → Paclitaxel)",
    "TC (Docetaxel + Cyclophosphamide)",
    "FEC (5-FU + Epirubicin + Cyclophosphamide)",
    "TCH (Docetaxel + Carboplatin + Trastuzumab)"
  ],

  "Breast Cancer – Triple Negative": [
    "AC-T",
    "Carboplatin + Paclitaxel",
    "Neoadjuvant Chemotherapy"
  ],

  "Lung Cancer – NSCLC": [
    "Cisplatin + Pemetrexed",
    "Carboplatin + Paclitaxel",
    "Pembrolizumab",
    "Nivolumab"
  ],

  "Lung Cancer – SCLC": [
    "Cisplatin + Etoposide",
    "Carboplatin + Etoposide"
  ],

  "Colorectal Cancer": [
    "FOLFOX",
    "FOLFIRI",
    "CAPOX",
    "Bevacizumab Combination"
  ],

  "Pancreatic Cancer": [
    "FOLFIRINOX",
    "Gemcitabine + Nab-Paclitaxel"
  ],

  "Testicular Cancer – Germ Cell Tumor": [
    "BEP (Bleomycin + Etoposide + Cisplatin)",
    "EP (Etoposide + Cisplatin)"
  ],

  "Head & Neck Cancer": [
    "Cisplatin-based Chemoradiation",
    "Cetuximab-based Regimen"
  ],

  "Ovarian Cancer": [
    "Carboplatin + Paclitaxel",
    "PARP Inhibitor Therapy"
  ],

  "Prostate Cancer": [
    "ADT (Hormonal Therapy)",
    "Docetaxel",
    "Abiraterone"
  ],

  "Hematological Malignancy": [
    "CHOP",
    "R-CHOP",
    "ABVD",
    "Stem Cell Transplant"
  ]
};


// Feeding Methods
const feedingMethods = [
  "Oral Feeding (Normal Diet)",
  "Oral Nutrition Supplements (ONS)",
  "Enteral Feeding – Nasogastric Tube (NG)",
  "Enteral Feeding – PEG Tube",
  "Enteral Feeding – Jejunostomy (J-Tube)",
  "Parenteral Nutrition (TPN)",
  "Combination Feeding (Oral + Enteral)",
  "Combination Feeding (Enteral + Parenteral)"
];


// Comorbidities
const comorbiditiesList = [
  "Diabetes Mellitus",
  "Hypertension",
  "Coronary Artery Disease",
  "Chronic Kidney Disease",
  "Chronic Liver Disease",
  "COPD / Asthma",
  "Hypothyroidism",
  "Heart Failure",
  "Chronic Anemia",
  "Obesity",
  "Malnutrition",
  "Depression / Anxiety",
  "Osteoporosis",
  "IBD (Crohn’s / Ulcerative Colitis)",
  "Chronic Pancreatitis"
];


// Side Effects
const sideEffectsList = [
  "Nausea",
  "Vomiting",
  "Diarrhea",
  "Mucositis",
  "Taste Alteration",
  "Loss of Appetite",
  "Early Satiety",
  "Bloating",
  "Fatigue",
  "Neuropathy",
  "Radiation Enteritis",
  "Dry Mouth",
  "Dysphagia",
  "Weight Loss",
  "Muscle Loss",
  "Cachexia"
];
