// ================================
// ONVILOX MASTER MEDICAL DATA
// ================================

// Cancer → Regimen Mapping
const cancerRegimenMap = {
  // --- NCCN Image Data ---
  "Lung Cancer – NSCLC Adenocarcinoma": ["Carboplatin + Pemetrexed ± Pembrolizumab"],
  "Lung Cancer – NSCLC Squamous": ["Carboplatin + Paclitaxel ± Pembrolizumab"],
  "Lung Cancer – EGFR Mutant": ["Osimertinib"],
  "Lung Cancer – ALK+": ["Alectinib"],
  "Lung Cancer – SCLC Limited": ["Cisplatin + Etoposide + Radiation"],
  "Lung Cancer – SCLC Extensive": ["Carboplatin + Etoposide + Atezolizumab"],
  "Breast Cancer – HR+/HER2-": ["AC → Paclitaxel"],
  "Breast Cancer – HER2+": ["TCH (Docetaxel + Carboplatin + Trastuzumab)"],
  "Breast Cancer – Triple Negative": ["AC → Taxane ± Pembrolizumab"],
  "Breast Cancer – Metastatic HR+": ["CDK4/6 inhibitor + AI"],
  "Breast Cancer – Metastatic HER2+": ["Trastuzumab + Pertuzumab + Docetaxel"],
  "Colorectal Cancer – Stage III": ["FOLFOX"],
  "Colorectal Cancer – Metastatic": ["FOLFOX", "FOLFIRI ± Bevacizumab"],
  "Colorectal Cancer – Rectal Locally Advanced": ["Capecitabine + Radiation"],
  "Colorectal Cancer – MSI-H": ["Pembrolizumab"],
  "Gastric Cancer – HER2-": ["FOLFOX", "CAPOX"],
  "Gastric Cancer – HER2+": ["Trastuzumab + Chemo"],
  "Gastric Cancer – Advanced": ["FLOT"],
  "Pancreatic Cancer – Resectable": ["FOLFIRINOX"],
  "Pancreatic Cancer – Metastatic": ["Gemcitabine + Nab-paclitaxel"],
  "Pancreatic Cancer – BRCA Mutated": ["Olaparib"],
  "Prostate Cancer – Hormone Sensitive": ["ADT ± Docetaxel"],
  "Prostate Cancer – CRPC": ["Abiraterone", "Enzalutamide"],
  "Prostate Cancer – Advanced": ["Docetaxel", "Cabazitaxel"],
  "Ovarian Cancer – Epithelial": ["Carboplatin + Paclitaxel"],
  "Ovarian Cancer – BRCA Mutated": ["Olaparib"],
  "Ovarian Cancer – Recurrent Platinum Sensitive": ["Carboplatin + Gemcitabine"],
  "Cervical Cancer – Locally Advanced": ["Cisplatin + Radiation"],
  "Cervical Cancer – Metastatic": ["Carboplatin + Paclitaxel + Bevacizumab"],
  "Head & Neck Cancer – Locally Advanced": ["Cisplatin + Radiation"],
  "Head & Neck Cancer – Recurrent": ["EXTREME (Cisplatin + 5FU + Cetuximab)"],
  "Head & Neck Cancer – PD-L1+": ["Pembrolizumab"],
  "Liver Cancer – Advanced HCC": ["Atezolizumab + Bevacizumab"],
  "Liver Cancer – Second Line": ["Sorafenib", "Lenvatinib"],
  "Kidney Cancer – Clear Cell RCC": ["Nivolumab + Ipilimumab"],
  "Kidney Cancer – Advanced RCC": ["Pembrolizumab + Axitinib"],
  "Bladder Cancer – Muscle Invasive": ["MVAC", "Gemcitabine + Cisplatin"],
  "Bladder Cancer – Metastatic": ["Pembrolizumab"],
  "Lymphoma – DLBCL": ["R-CHOP"],
  "Lymphoma – Hodgkin": ["ABVD"],
  "Leukemia – AML": ["7+3 (Cytarabine + Daunorubicin)"],
  "Leukemia – ALL": ["Hyper-CVAD"],
  "Leukemia – CML": ["Imatinib"],
  "Multiple Myeloma – Standard": ["VRd (Bortezomib + Lenalidomide + Dexamethasone)"],
  "Multiple Myeloma – Relapsed": ["Daratumumab-based"],

  "Melanoma – Advanced / Metastatic": ["Nivolumab + Ipilimumab OR Pembrolizumab"],
  "Endometrial Cancer – Advanced / Recurrent": ["Carboplatin + Paclitaxel"],
  "Esophageal Cancer – Neoadjuvant (Pre-op)": ["CROSS Regimen (Carboplatin + Paclitaxel + Radiation)"],
  "Biliary Tract Cancer – Advanced / Metastatic": ["Gemcitabine + Cisplatin + Durvalumab"],
  "Soft Tissue Sarcoma – Advanced / Metastatic": ["Doxorubicin ± Ifosfamide"],
  "GIST – Kit (CD117) Positive": ["Imatinib"],
  "Thyroid Cancer – RAI-Refractory": ["Lenvatinib OR Sorafenib"],
  "Testicular Cancer – Germ Cell Tumor": ["BEP (Bleomycin + Etoposide + Cisplatin)"],
  "Mesothelioma – Pleural": ["Pemetrexed + Cisplatin + Nivolumab + Ipilimumab"],
  "Neuroendocrine (NETs) – Well-differentiated": ["CAPTEM (Capecitabine + Temozolomide)"],
  "Myelodysplastic (MDS) – High-risk": ["Hypomethylating agents (Azacitidine OR Decitabine)"],
  "Follicular Lymphoma – First-line": ["Obinutuzumab + CHOP OR Bendamustine + Rituximab"],
  "Mantle Cell Lymphoma – Fit / Younger Patients": ["R-DHAP / R-ICE followed by ASCT"],
  "CNS Lymphoma – Primary": ["High-dose Methotrexate-based regimens"],

  // --- Preserved (not in either image) ---
  "Basal / Squamous Cell Carcinoma (Skin)": ["Cemiplimab", "Pembrolizumab"],
  "Glioblastoma (Brain Cancer)": ["Temozolomide + Radiation", "Bevacizumab"],
  "Hematological Malignancy": ["CHOP", "R-CHOP", "ABVD", "Stem Cell Transplant"],
  "Cholangiocarcinoma (Bile Duct Cancer)": ["Gemcitabine + Cisplatin", "FOLFOX", "Durvalumab Combination", "Pembrolizumab"],
  "Gallbladder Cancer": ["Gemcitabine + Cisplatin", "5-FU Combination"]
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

// Genomic Markers
const genomicMarkersList = [
  "MTHFR Mutation",
  "BRCA1 Mutation",
  "BRCA2 Mutation",
  "EGFR Mutation",
  "ALK Rearrangement",
  "KRAS Mutation",
  "HER2 Positive",
  "PD-L1 Expression",
  "MSI-High (Microsatellite Instability)",
  "PIK3CA Mutation",
  "BRAF V600E Mutation",
  "NRAS Mutation",
  "DPYD Deficiency",
  "UGT1A1 Polymorphism"
];

// Treatment Modalities
const treatmentsList = [
  "Chemotherapy",
  "Radiotherapy",
  "Immunotherapy",
  "Targeted Therapy",
  "Hormonal Therapy",
  "Surgery",
  "Palliative Care"
];

// Allergies
const allergiesList = [
  "Lactose",
  "Soy",
  "Nuts",
  "Peanuts",
  "Gluten",
  "Eggs",
  "Shellfish",
  "Latex",
  "Sulfa Drugs",
  "Penicillin"
];

// Supplements
const supplementsList = [
  "Multivitamin",
  "Vitamin C",
  "Vitamin D",
  "Calcium",
  "Iron",
  "Omega-3 / Fish Oil",
  "Probiotics",
  "B-Complex",
  "Zinc",
  "Magnesium",
  "Whey Protein",
  "Plant Protein"
];

// Metastatic Sites
const metastaticSitesList = [
  "Bone",
  "Liver",
  "Lung",
  "Brain",
  "Lymph Nodes",
  "Peritoneum",
  "Pleura",
  "Adrenal Glands"
];
