const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// --- ROUTES ---

// Health Check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Auth: Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(400).json({ error: 'User not found' });

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
    res.json({ token, user: { id: user.id, name: user.name, role: user.role, hospital_name: user.hospital_name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Patients: Get All
app.get('/api/patients', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM patients ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Patients: Create
app.post('/api/patients', authenticateToken, async (req, res) => {
  const p = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO patients (id, uhic, name, age, sex, height, weight, usual_weight, albumin, crp, muac, feeding_method, gi_issues, assigned_doctor_id, created_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [p.id, p.uhic, p.name, p.age, p.sex, p.height, p.weight, p.usual_weight, p.albumin, p.crp, p.muac, p.feeding_method, p.gi_issues, p.assigned_doctor_id, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI configuration is handled by Anthropic SDK below

// --- ANTHROPIC (CLAUDE) INTEGRATION ---
const Anthropic = require('@anthropic-ai/sdk');
const rawKey = process.env.ANTHROPIC_API_KEY || '';
const anthropic = new Anthropic({ apiKey: rawKey });

// Prompt for mapping Clinical Data
const extractionSystemPrompt = `You are an expert Oncology Assistant. 
Extract clinical parameters from the provided text/PDF and return a precise JSON object.
Return ONLY valid JSON. START with '{' and END with '}'. NO preamble, NO markdown code blocks, NO headers.
If unknown, return null.
Schema: {
  "name": "String", "age": "Number", "sex": "Male/Female", "weight": "Number (kg)", "height": "Number (cm)", 
  "usualWeight": "Number (kg)", "uhic": "String", "cancer": "String", "regimen": "String", "feedingMethod": "String",
  "tumorBurden": "String", "sarcopeniaStatus": "String", "cancerStage": "String", "ecogStatus": "Number", "activityLevel": "String",
  "reducedFoodIntake": "Number (%)", "albumin": "Number", "crp": "Number", "muac": "Number", "creatinine": "Number",
  "alt": "Number", "ast": "Number", "bilirubin": "Number", "bloodSugar": "Number", "sodium": "Number", "potassium": "Number",
  "urea": "Number", "tsh": "Number", "prealbumin": "Number", "hemoglobin": "Number", "vitD": "Number", "vitB12": "Number", 
  "folate": "Number", "zinc": "Number", "magnesium": "Number", "hba1c": "Number", "giIssues": "Boolean",
  "allergies": [], "existingSupplements": [], "comorbidities": [], "sideEffects": [], "genomicMarkers": [], "treatmentTypes": []
}`;

app.post('/api/extract', async (req, res) => {
  const { pdfText } = req.body;
  if (!pdfText) return res.status(400).json({ error: 'No text provided.' });

  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1600,
      system: extractionSystemPrompt,
      messages: [{ role: "user", content: `Extract from:\n\n${pdfText}` }],
    });

    const rawText = msg.content[0].text;
    let extracted;
    try {
      const jsonStr = rawText.match(/{[\s\S]*}/)?.[0] || rawText;
      extracted = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("JSON Parse Error in Extraction:", rawText);
      return res.status(422).json({ error: 'AI returned malformed data. Please try again.' });
    }
    res.json({ success: true, data: extracted });
  } catch (error) {
    if (error.status === 429) {
      return res.status(429).json({ error: 'AI Rate Limit exceeded. Please wait a moment.' });
    }
    console.error("Claude Extraction Error:", error);
    res.status(500).json({ error: 'Internal AI failure.' });
  }
});

app.post('/api/chat', async (req, res) => {
  const { message, contextObj } = req.body;
  if (!message) return res.status(400).json({ error: 'No message provided.' });

  try {
    const systemPrompt = `Onvilox AI Copilot (PhD/RD). Goal: Extract clinical data.
    RULE: Use ONLY the keys in the schema. NO emojis in keys. NO custom keys like "RED_FLAGS".
    RULE: Map all "Red Flags" or "Additional Clinical Data" to the "notes" key.
    RULE: "cancer" MUST include the specific subtype in format "Cancer Type - Subtype". Examples: "Breast Cancer - Triple Negative", "Breast Cancer - HER2+", "Breast Cancer - HR+/HER2-", "Breast Cancer - Metastatic HR+", "Lung Cancer - NSCLC Adenocarcinoma", "Lung Cancer - NSCLC Squamous", "Lung Cancer - EGFR Mutant", "Lung Cancer - ALK+", "Lung Cancer - SCLC Extensive", "Colorectal Cancer - Stage III", "Colorectal Cancer - Metastatic", "Lymphoma - DLBCL", "Lymphoma - Hodgkin", "Multiple Myeloma - Standard", "Ovarian Cancer - Epithelial". NEVER return just "Breast Cancer" or "Lung Cancer" without the subtype.
    RULE: "feedingMethod" MUST be EXACTLY one of: "Oral Feeding (Normal Diet)" | "Oral Nutrition Supplements (ONS)" | "Enteral Feeding – Nasogastric Tube (NG)" | "Enteral Feeding – PEG Tube" | "Enteral Feeding – Jejunostomy (J-Tube)" | "Parenteral Nutrition (TPN)" | "Combination Feeding (Oral + Enteral)" | "Combination Feeding (Enteral + Parenteral)". Never return "Oral" or "Enteral" alone.
    RULE: "regimen" must use protocol notation matching clinical usage — e.g., "AC -> Taxane ± Pembrolizumab", "FOLFOX", "R-CHOP", "Carboplatin + Paclitaxel ± Pembrolizumab", "TCH (Docetaxel + Carboplatin + Trastuzumab)". Do NOT use shorthand like "AC-T Protocol".
    RULE: "sex" must be "Male" or "Female" (not M/F).
    Schema: { "name":str, "age":num, "sex":"Male"/"Female", "weight":num, "height":num, "usualWeight":num, "reducedFoodIntake":num, "albumin":num, "crp":num, "cancer":str, "regimen":str, "creatinine":num, "alt":num, "ast":num, "bilirubin":num, "bloodSugar":num, "sodium":num, "potassium":num, "urea":num, "muac":num, "prealbumin":num, "vitD":num, "vitB12":num, "folate":num, "zinc":num, "magnesium":num, "tsh":num, "hba1c":num, "hemoglobin":num, "sarcopeniaStatus":str, "activityLevel":str, "ecogStatus":num, "leanBodyMass":num, "smi":num, "handGrip":num, "fatPercent":num, "feedingMethod":str, "giIssues":bool, "comorbidities":[], "sideEffects":[], "existingSupplements":[], "allergies":[], "metastasisSites":[], "genomicMarkers":[], "notes":str }
    Format: { "reply": "Short answer (<3 sentences)", "extractedData": { ...found values... } }`;

    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: message }],
    });

    const rawText = msg.content[0].text;
    let data;
    try {
      // Robust Parser V5.1: Find the OUTERMOST curly braces
      let start = rawText.indexOf('{');
      let end = rawText.lastIndexOf('}');
      
      if (start !== -1) {
          let jsonCandidate = (end !== -1 && end > start) ? 
                              rawText.substring(start, end + 1) : 
                              rawText.substring(start);
          
          // Truncation Recovery: If JSON is cut off, try to close it
          let openBraces = (jsonCandidate.match(/\{/g) || []).length;
          let closeBraces = (jsonCandidate.match(/\}/g) || []).length;
          while (closeBraces < openBraces) {
              jsonCandidate += "}";
              closeBraces++;
          }

          try {
              data = JSON.parse(jsonCandidate);
          } catch (e) {
              // Last ditch: try to fix common truncation at end of string
              const fixed = jsonCandidate.replace(/,\s*$/, "").replace(/\"$/, "").trim();
              data = JSON.parse(fixed + "}".repeat(openBraces - (fixed.match(/\}/g) || []).length));
          }
      } else {
          throw new Error("No JSON braces found");
      }
      
      // Structural Normalization: Ensure { reply, extractedData } exists
      const commonKeys = ['name', 'age', 'weight', 'height', 'cancer', 'regimen', 'albumin', 'crp', 'notes'];
      
      if (data.extractedData && typeof data.extractedData === 'object') {
          // Already have extractedData, but make sure it's not JUST a reply
          data.reply = data.reply || data.extractedData.reply || "Clinical extraction complete.";
      } else {
          // Flattened response or mixed response
          const reply = data.reply || "Clinical extraction complete.";
          const extracted = { ...data };
          delete extracted.reply;
          
          // Check if it actually contains ANY data keys beyond the reply
          const hasKeys = Object.keys(extracted).length > 0;
          
          data = {
              reply: reply,
              extractedData: hasKeys ? extracted : null
          };
      }
    } catch (e) {
      console.warn("AI Parser Error:", e.message);
      // Fallback: Greedy match outermost braces
      try {
          const match = rawText.match(/\{[\s\S]*\}/)?.[0];
          if (match) {
              const parsed = JSON.parse(match);
              const { reply, ...rest } = (parsed.extractedData || parsed);
              data = { 
                  reply: parsed.reply || reply || "Extraction fallback successful.", 
                  extractedData: Object.keys(rest).length > 0 ? rest : null
              };
          } else {
              throw new Error("No braces in fallback");
          }
      } catch (e2) {
          data = { reply: rawText, extractedData: null };
      }
    }
    
    // Final check for empty objects
    if (data.extractedData && Object.keys(data.extractedData).length === 0) {
        data.extractedData = null;
    }

    res.json(data);
  } catch (error) {
    console.error("Claude Chat Error:", error);
    res.status(500).json({ error: 'Failed' });
  }
});

app.get('/api/list-models', async (req, res) => {
  try {
    const models = await anthropic.models.list();
    res.json({ models: models.data.map(m => m.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/claude-report', async (req, res) => {
  const { patient, plan } = req.body;
  if (!patient || !plan) return res.status(400).json({ error: 'Context required.' });

  try {
    const system = `You are the Onvilox Clinical AI Auditor — Oncology RD/PhD level. You receive a patient profile and a rules-engine-generated nutrition plan. Your job is to:
1. Validate every clinical parameter against the rules below
2. Generate a full safety alert list — do NOT omit any that apply
3. Correct the prescription if it is clinically wrong
4. Produce a complete drug-nutrient interaction table for every drug in the regimen
5. Produce a complete micronutrient orders table for every relevant nutrient
6. Produce a full monitoring schedule
7. Produce patient-facing dietary instructions
8. Score the plan honestly

CLINICAL VALIDATION RULES — apply every rule to every patient:

ENTERAL ESCALATION:
- If reducedFoodIntake > 40 (meaning actual oral intake < 60% of requirements), generate a HIGH clinicalAlert with type "EN_ESCALATION_MANDATORY".
- State that nasogastric or nasoduodenal tube feeding must be initiated immediately per ESPEN guidelines.
- If intake is 40–60% (borderline), generate MODERATE alert for intensive ONS escalation.

PROTEIN SAFETY:
- The renal protein cap of 0.8 g/kg applies ONLY when creatinine > 1.3 mg/dL (KDIGO guideline). If creatinine ≤ 1.3, this cap must NOT be applied.
- For cachexia OR sarcopenia patients with creatinine ≤ 1.3: minimum protein is 1.8 g/kg.
- For patients with BOTH (cachexia OR sarcopenia) AND (immunotherapy checkpoint inhibitor — pembrolizumab, nivolumab, atezolizumab, durvalumab — OR platinum agents): minimum protein is 2.0 g/kg due to combined immunometabolic and anti-catabolic demand.
- If totalDailyProtein is below weight × 1.6 g/kg AND creatinine ≤ 1.3 AND cachexia or sarcopenia present: generate HIGH alert "PROTEIN_CRITICAL_UNDERDOSE", set isOverpowered:true, correctedPrescription.dailyProtein = weight × 1.8 (or × 2.0 if immunotherapy or platinum also present).
- If totalDailyProtein is below weight × 1.9 g/kg AND patient has BOTH (cachexia or sarcopenia) AND (immunotherapy or platinum): generate HIGH alert "PROTEIN_UNDERDOSE_IMMUNOTHERAPY", set isOverpowered:true, correctedPrescription.dailyProtein = weight × 2.0. State that 2.0 g/kg is the minimum for this immunometabolic profile and that underdosing accelerates muscle catabolism, worsens sarcopenia, and increases chemotherapy toxicity risk.

ANTIFOLATE TOXICITY:
- If the regimen contains Pemetrexed, Methotrexate, or FOLFIRINOX AND patient folate < 5 ng/mL: generate HIGH alert type "FOLATE_DEFICIENCY_ANTIFOLATE".
- State that folate deficiency on antifolate therapy significantly increases risk of severe mucositis, myelosuppression, and treatment-limiting neutropenia.
- Folate repletion must be initiated before the next chemotherapy cycle. Specify the repletion dose (5 mg/day folic acid), the timing of the follow-up serum folate test (Day 7 after commencing supplementation), and the cycle-day checkpoint (serum folate must be confirmed ≥ 5 ng/mL before Cycle N+1 Day 1).
- Include folate supplementation in micronutrientOrders with status DEFICIENT and dose "5 mg/day folic acid — recheck serum folate Day 7; confirm ≥5 ng/mL before next cycle."

VITAMIN D:
- vitD < 20 ng/mL = deficient. Prescribe 4000 IU/day repletion — NOT 2000 IU/day which is a maintenance dose only.
- vitD < 12 ng/mL = severe deficiency. Prescribe 50,000 IU/week for 8 weeks then recheck.
- vitD 20–30 ng/mL = insufficient. Prescribe 2000 IU/day maintenance.
- Always note the distinction between repletion and maintenance in micronutrientOrders.

ANAEMIA & IRON:
- Hemoglobin < 12 g/dL: generate MODERATE alert for anaemia.
- If iron studies (ferritin, serum iron, TIBC) are absent from the lab panel: generate HIGH alert type "IRON_PANEL_MANDATORY" and flag iron panel as a mandatory investigation.
- If oral intake < 60%: recommend IV iron over oral supplementation due to impaired GI absorption.
- In micronutrientOrders, set iron status to "HOLD" and dose to "ON CLINICAL HOLD — Pending iron panel (ferritin, serum iron, TIBC, transferrin saturation) before empirical dosing."
- Include iron assessment in monitoringSchedule.

LIVER FUNCTION:
- ALT > 40 U/L or AST > 40 U/L: generate MODERATE alert requiring fortnightly LFT monitoring.
- If patient has liver metastases or is on a hepatotoxic regimen (platinum agents, taxanes, anthracyclines): add hepatology escalation threshold of 3× ULN.
- Include LFTs in monitoringSchedule with escalation trigger.

GLUTAMINE CAUTION:
- If glutamine is prescribed AND tumor burden is High or Bulky: generate MODERATE alert type "GLUTAMINE_TUMOR_CAUTION".
- State that glutamine supplementation may fuel tumor metabolism in high-burden settings. Oncologist approval is required before initiation.
- In micronutrientOrders, set glutamine status to "HOLD" and dose to "ON CLINICAL HOLD — Pending written oncologist authorisation before initiation."

STEROID-INDUCED HYPERGLYCAEMIA & MACRO REDISTRIBUTION:
- If HbA1c is 5.7–6.4% OR fasting blood sugar is 100–125 mg/dL (pre-diabetic range) AND the regimen includes dexamethasone or steroid-containing chemotherapy: generate MODERATE alert.
- Recommend blood glucose monitoring before and 2 hours after each dexamethasone dose.
- If HbA1c ≥ 6.5% (diabetic range) OR blood sugar > 140 mg/dL OR patient comorbidities include Fatty Liver Disease (NAFLD/MAFLD/NASH/steatohepatitis): the macro distribution MUST be corrected. Set isOverpowered: true. Fat must not exceed 30% of totalDailyCalories: set dailyFat = totalDailyCalories × 0.30 / 9, then set dailyCarbs = (totalDailyCalories − dailyProtein×4 − dailyFat×9) / 4. Distribute carbs across 5–6 small meals for glycaemic control. Provide the corrected gram values for dailyCarbs and dailyFat in correctedPrescription.
- Include glycaemic monitoring in monitoringSchedule.

IMMUNOTHERAPY MONITORING:
- If regimen includes Pembrolizumab, Nivolumab, Atezolizumab, or Durvalumab: TSH monitoring every treatment cycle is MANDATORY.
- If TSH is absent from the lab panel: generate HIGH alert type "IMMUNOTHERAPY_TSH_MISSING" — this is a patient safety requirement.
- If TSH is absent AND patient sideEffects include fatigue, tiredness, or weakness: add an additional note in the alert that current fatigue symptoms must be assessed as a possible immune-related adverse event (irAE — immune thyroiditis) while TSH is pending. Do not attribute fatigue solely to chemotherapy until thyroid function is confirmed.
- Include thyroid function in monitoringSchedule with per-cycle frequency and TSH thresholds (<0.5 or >4.5 mIU/L → endocrinology referral).

ANTIOXIDANT SAFETY:
- If regimen includes Bortezomib, AC (Doxorubicin + Cyclophosphamide), Oxaliplatin, or Cisplatin: Vitamin C > 500 mg/day and Alpha-Lipoic Acid are CONTRAINDICATED during those specific cycles as they may reduce chemotherapy efficacy via ROS-dependent cytotoxic mechanisms.
- If any such supplement is present in the plan without phase-specific suspension guidance: generate HIGH clinicalAlert.
- Mark these as EXCLUDED in micronutrientOrders.
- PHASE-SPECIFIC ALA RULE (sequential regimens): If the regimen is AC → Taxane (or any anthracycline-first sequential protocol), ALA may be prescribed therapeutically during the Taxane phase for peripheral neuropathy prevention, BUT must be explicitly SUSPENDED during all AC/anthracycline cycles. If the plan prescribes ALA without this phase-specific suspension instruction documented, generate a MODERATE alert type "ALA_PHASE_SUSPENSION_MISSING" stating: "ALA must be held during AC cycles and resumed only at Taxane phase commencement. Continuous ALA administration through AC cycles risks attenuating doxorubicin cytotoxicity."

BCAA & LEUCINE OVERLAP:
- If BCAA ≥ 15g/day AND Leucine is also prescribed separately: flag MODERATE alert for potential leucine excess (>13–15g/day total may exceed anabolic threshold and cause metabolic stress).

DRUG INTERACTIONS:
- For EVERY drug or drug class named in the regimen, you MUST generate a drugInteractions entry.
- Never return an empty drugInteractions array for a patient on active chemotherapy.
- Include: Cisplatin (renal Mg wasting), Carboplatin (myelosuppression + nutrition timing), Paclitaxel/Docetaxel (peripheral neuropathy — B12/B6 relevance), Doxorubicin (cardiotoxicity — antioxidant caution), Cyclophosphamide (nausea/hydration), Pembrolizumab/nivolumab (immune enterocolitis, TSH), Pemetrexed (folate protocol), 5-FU/Capecitabine (mucositis, folate timing), Bevacizumab (wound healing, protein adequacy), Bortezomib (neuropathy, antioxidant exclusion).

ARITHMETIC VERIFICATION:
- Verify: onsCalories ÷ servingsPerDay ≈ perServingCalories (±5 kcal tolerance). Flag discrepancy in logicRefinements.
- Verify: (totalDailyProtein × 4) + (dailyCarbs × 4) + (dailyFat × 9) ≤ totalDailyCalories × 1.05. Flag if macros significantly exceed total calories.
- Verify: prescribedProtein ÷ weight = proteinPerKg matches stated proteinPerKg (±0.1 tolerance).

SCORING (max 9.8):
- Start at 9.8. This ceiling represents a clinically complete, arithmetically correct plan with all mandatory labs present and no safety violations.
- Deduct 1.5 for each HIGH/unresolved CRITICAL alert.
- Deduct 0.5 for each MODERATE gap.
- Deduct 0.3 for each missing mandatory investigation.
- Deduct 0.5 for each arithmetic error.
- Do NOT round up to 10.0. A plan with 3+ HIGH issues should score ≤ 5.3.

OVERPOWER CORRECTION:
- Set isOverpowered: true and provide correctedPrescription values if:
  (a) protein is underdosed per PROTEIN SAFETY rules above, OR
  (b) totalDailyCalories deviates > 15% from weight × appropriate kcal/kg (25–35 kcal/kg based on cachexia/sarcopenia).
- Always provide a clinical reasoning string explaining the correction.

CRITICAL — CLINICAL ALERTS COMPLETENESS:
Every safety violation you identify — whether mentioned in rationale, logicRefinements, or instructions — MUST also appear as a structured entry in the clinicalAlerts array with the correct type and level. An empty or incomplete clinicalAlerts array while safety issues exist is a critical reporting failure. Do NOT summarise issues only in rationale and leave clinicalAlerts empty or partial.

OUTPUT FORMAT — return ONLY valid JSON, no markdown, no text outside the JSON object:
{
  "validationScore": number,
  "rationale": ["string 1", "string 2", "string 3", "string 4", "string 5"],
  "instructions": ["patient instruction 1", "patient instruction 2", "patient instruction 3", "patient instruction 4", "patient instruction 5", "patient instruction 6"],
  "clinicalAlerts": [{"type": "string", "level": "HIGH|MODERATE|LOW", "message": "string"}],
  "correctedPrescription": {"isOverpowered": false, "dailyCalories": number, "dailyProtein": number, "dailyCarbs": number, "dailyFat": number, "reasoning": "string"},
  "logicRefinements": ["string 1", "string 2"],
  "drugInteractions": [{"drug": "string", "interaction": "string", "advice": "string", "risk": "HIGH|MODERATE|LOW"}],
  "micronutrientOrders": [{"nutrient": "string", "labValue": "string", "dose": "string", "rationale": "string", "status": "SUPPLEMENT|DEFICIENT|MONITOR|CAPPED|EXCLUDED|HOLD|STANDARD"}],
  "monitoringSchedule": [{"frequency": "string", "parameters": "string", "threshold": "string", "responsible": "string"}]
}`;

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system: system,
      messages: [{
        role: "user",
        content: `AUDIT: Patient: ${JSON.stringify(patient)} Plan: ${JSON.stringify(plan)}`
      }]
    });

    const rawText = msg.content[0].text;
    let data;
    try {
      const jsonMatch = rawText.match(/{[\s\S]*/);
      if (!jsonMatch) throw new Error("No JSON");
      let jsonStr = jsonMatch[0];

      // Pass 1: close unclosed braces/brackets
      const opens = (jsonStr.match(/{/g) || []).length;
      const closes = (jsonStr.match(/}/g) || []).length;
      if (opens > closes) jsonStr += '}' .repeat(opens - closes);

      // Pass 2: if still invalid, truncate at last cleanly-closed top-level value
      try {
        data = JSON.parse(jsonStr);
      } catch {
        // Find last position where JSON is likely clean: after a ] or } followed by ,
        const lastClean = Math.max(jsonStr.lastIndexOf('],'), jsonStr.lastIndexOf('},'));
        if (lastClean > 10) {
          let trimmed = jsonStr.substring(0, lastClean + 1);
          const o2 = (trimmed.match(/{/g) || []).length;
          const c2 = (trimmed.match(/}/g) || []).length;
          trimmed += '}'.repeat(Math.max(0, o2 - c2));
          data = JSON.parse(trimmed);
        } else {
          throw new Error('Unrecoverable truncation');
        }
      }
    } catch (e) {
      console.error("Claude report parse failed, raw length:", rawText?.length, e.message);
      // Salvage whatever fields are present via regex rather than returning nothing
      const grabArr = (key) => { try { const m = rawText.match(new RegExp(`"${key}"\\s*:\\s*(\\[[\\s\\S]*?\\])`)); return m ? JSON.parse(m[1]) : []; } catch { return []; } };
      const grabNum = (key) => { const m = rawText.match(new RegExp(`"${key}"\\s*:\\s*([\\d.]+)`)); return m ? parseFloat(m[1]) : null; };
      data = {
        validationScore: grabNum('validationScore'),
        rationale: grabArr('rationale'),
        instructions: grabArr('instructions'),
        clinicalAlerts: grabArr('clinicalAlerts'),
        correctedPrescription: { isOverpowered: false, dailyCalories: null, dailyProtein: null, reasoning: 'Response truncated — re-run audit.' },
        logicRefinements: grabArr('logicRefinements'),
        drugInteractions: grabArr('drugInteractions'),
        micronutrientOrders: grabArr('micronutrientOrders'),
        monitoringSchedule: grabArr('monitoringSchedule')
      };
    }
    res.json(data);
  } catch (error) {
    console.error("Claude Report Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
