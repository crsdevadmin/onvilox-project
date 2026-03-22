
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

const userList = `
Lung Cancer,NSCLC Adenocarcinoma,Carboplatin + Pemetrexed ± Pembrolizumab
Lung Cancer,NSCLC Squamous,Carboplatin + Paclitaxel ± Pembrolizumab
Lung Cancer,EGFR Mutant,Osimertinib
Lung Cancer,ALK+,Alectinib
Lung Cancer,SCLC Limited,Cisplatin + Etoposide + Radiation
Lung Cancer,SCLC Extensive,Carboplatin + Etoposide + Atezolizumab
Breast Cancer,HR+/HER2-,AC → Paclitaxel
Breast Cancer,HER2+,TCH (Docetaxel + Carboplatin + Trastuzumab)
Breast Cancer,Triple Negative,AC → Taxane ± Pembrolizumab
Breast Cancer,Metastatic HR+,CDK4/6 inhibitor + AI
Breast Cancer,Metastatic HER2+,Trastuzumab + Pertuzumab + Docetaxel
Colorectal Cancer,Stage III,FOLFOX
Colorectal Cancer,Metastatic,FOLFOX / FOLFIRI ± Bevacizumab
Colorectal Cancer,Rectal Locally Advanced,Capecitabine + Radiation
Colorectal Cancer,MSI-H,Pembrolizumab
Gastric Cancer,HER2-,FOLFOX / CAPOX
Gastric Cancer,HER2+,Trastuzumab + Chemo
Gastric Cancer,Advanced,FLOT
Pancreatic Cancer,Resectable,FOLFIRINOX
Pancreatic Cancer,Metastatic,Gemcitabine + Nab-paclitaxel
Pancreatic Cancer,BRCA Mutated,Olaparib
Prostate Cancer,Hormone Sensitive,ADT ± Docetaxel
Prostate Cancer,CRPC,Abiraterone / Enzalutamide
Prostate Cancer,Advanced,Docetaxel / Cabazitaxel
Ovarian Cancer,Epithelial,Carboplatin + Paclitaxel
Ovarian Cancer,BRCA Mutated,Olaparib
Ovarian Cancer,Recurrent Platinum Sensitive,Carboplatin + Gemcitabine
Cervical Cancer,Locally Advanced,Cisplatin + Radiation
Cervical Cancer,Metastatic,Carboplatin + Paclitaxel + Bevacizumab
Head & Neck Cancer,Locally Advanced,Cisplatin + Radiation
Head & Neck Cancer,Recurrent,EXTREME (Cisplatin + 5FU + Cetuximab)
Head & Neck Cancer,PD-L1+,Pembrolizumab
Liver Cancer,Advanced HCC,Atezolizumab + Bevacizumab
Liver Cancer,Second Line,Sorafenib / Lenvatinib
Kidney Cancer,Clear Cell RCC,Nivolumab + Ipilimumab
Kidney Cancer,Advanced RCC,Pembrolizumab + Axitinib
Bladder Cancer,Muscle Invasive,MVAC / Gemcitabine + Cisplatin
Bladder Cancer,Metastatic,Pembrolizumab
Lymphoma,DLBCL,R-CHOP
Lymphoma,Hodgkin,ABVD
Leukemia,AML,7+3 (Cytarabine + Daunorubicin)
Leukemia,ALL,Hyper-CVAD
Leukemia,CML,Imatinib
Multiple Myeloma,Standard,VRd (Bortezomib + Lenalidomide + Dexamethasone)
Multiple Myeloma,Relapsed,Daratumumab-based
Melanoma,Advanced / Metastatic,Nivolumab + Ipilimumab OR Pembrolizumab
Endometrial Cancer,Advanced / Recurrent,Carboplatin + Paclitaxel
Esophageal Cancer,Neoadjuvant (Pre-op),CROSS Regimen (Carboplatin + Paclitaxel + Radiation)
Biliary Tract Cancer,Advanced / Metastatic,Gemcitabine + Cisplatin + Durvalumab
Soft Tissue Sarcoma,Advanced / Metastatic,Doxorubicin ± Ifosfamide
GIST,Kit (CD117) Positive,Imatinib
Thyroid Cancer,RAI-Refractory,Lenvatinib OR Sorafenib
Testicular Cancer,Germ Cell Tumor,BEP (Bleomycin + Etoposide + Cisplatin)
Mesothelioma,Pleural,Pemetrexed + Cisplatin + Nivolumab + Ipilimumab
Neuroendocrine (NETs),Well-differentiated,CAPTEM (Capecitabine + Temozolomide)
Myelodysplastic (MDS),High-risk,Hypomethylating agents (Azacitidine OR Decitabine)
Follicular Lymphoma,First-line,Obinutuzumab + CHOP OR Bendamustine + Rituximab
Mantle Cell Lymphoma,Fit / Younger Patients,R-DHAP / R-ICE followed by ASCT
CNS Lymphoma,Primary,High-dose Methotrexate-based regimens
`.trim();

const lines = userList.split('\\n');
const missing = [];

lines.forEach(line => {
    const [type, subtype, regimen] = line.split(',');
    const fullKey = \`\${type} – \${subtype}\`;
    if (!cancerRegimenMap[fullKey]) {
        // Try without subtype if subtype is empty or matches type
        if (!subtype || subtype.trim() === "") {
             if (!cancerRegimenMap[type]) {
                missing.push(line);
             }
        } else {
            missing.push(line);
        }
    } else {
        // Check regimen
        const regimens = cancerRegimenMap[fullKey];
        const userRegimen = regimen.trim();
        // Since app might split regimens, check if it's included or if it's a combined string
        const match = regimens.some(r => userRegimen.includes(r) || r.includes(userRegimen));
        if (!match) {
            console.log(\`Regimen mismatch for \${fullKey}: \${regimen} vs [\${regimens}]\`);
        }
    }
});

console.log("Missing lines:");
console.log(missing.join('\\n'));
