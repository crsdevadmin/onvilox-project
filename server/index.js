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
    const rules = [
      // ── ENTERAL ESCALATION ──
      "ENTERAL ESCALATION: If reducedFoodIntake > 40 (i.e. actual oral intake < 60% of requirements), you MUST generate a HIGH clinicalAlert with type='EN_ESCALATION_MANDATORY' stating that nasogastric/nasoduodenal tube feeding must be initiated immediately. Do not omit this alert.",
      // ── PROTEIN SAFETY ──
      "RENAL CAP BOUNDARY: The 0.8 g/kg renal protein cap applies ONLY when creatinine > 1.3 mg/dL. If creatinine ≤ 1.3, the cap must NOT be applied. If the engine-prescribed protein is < 1.5 g/kg and creatinine ≤ 1.3, flag type='PROTEIN_CRITICAL_UNDERDOSE' as HIGH and set isOverpowered:true with corrected protein = weight × 1.8 (or × 2.0 if cachexia + platinum regimen).",
      "PROTEIN MINIMUM: If patient has cachexia or sarcopenia AND prescribed totalDailyProtein < weight × 1.6 g/kg AND creatinine ≤ 1.3, flag PROTEIN_CRITICAL_UNDERDOSE as HIGH. State that underdosing accelerates catabolism, worsens sarcopenia, and increases treatment toxicity.",
      // ── ANTIFOLATE TOXICITY ──
      "ANTIFOLATE TOXICITY: If the regimen contains Pemetrexed, Methotrexate, or FOLFIRINOX AND patient folate < 5 ng/mL, generate a HIGH clinicalAlert type='FOLATE_DEFICIENCY_ANTIFOLATE'. State that folate deficiency on antifolate therapy significantly increases risk of severe mucositis, myelosuppression, and treatment-limiting neutropenia. Folate repletion must precede next cycle.",
      // ── VITAMIN D ──
      "VITAMIN D REPLETION: If vitD < 20 ng/mL flag as DEFICIENT. Prescribe 4000 IU/day repletion (NOT 2000 IU maintenance dose). If vitD < 12 ng/mL, prescribe 50,000 IU/week for 8 weeks then recheck. Always note that 2000 IU is a maintenance dose insufficient for repletion. Include in micronutrientOrders with status=DEFICIENT.",
      // ── ANAEMIA ──
      "ANAEMIA + IRON: If hemoglobin < 12 g/dL, generate a MODERATE clinicalAlert. If ferritin or iron studies are absent from the lab panel, flag iron panel as a mandatory investigation. If oral intake < 60%, recommend IV iron consideration over oral supplementation due to impaired absorption.",
      // ── LIVER MONITORING ──
      "LFT MONITORING: If ALT > 40 U/L or AST > 40 U/L, generate a MODERATE clinicalAlert requiring fortnightly LFT monitoring. If the patient has liver metastases or a hepatotoxic regimen (platinum, taxane, anthracycline), add hepatology escalation criteria if LFTs exceed 3× ULN.",
      // ── GLUTAMINE CAUTION ──
      "GLUTAMINE CAUTION: If glutamine is prescribed AND tumor burden is High or unknown, generate a MODERATE clinicalAlert type='GLUTAMINE_TUMOR_CAUTION'. State that glutamine may fuel tumour metabolism in high-burden settings and that oncologist sign-off is required before initiation.",
      // ── STEROID HYPERGLYCAEMIA ──
      "STEROID HYPERGLYCAEMIA: If HbA1c is 5.7–6.4% or fasting blood sugar is 100–125 mg/dL (pre-diabetic range), AND the regimen includes corticosteroids (Dexamethasone) or steroid-containing chemo, generate a MODERATE clinicalAlert for anticipated steroid-induced hyperglycaemia. Recommend glucose monitoring before and 2h after each dexamethasone dose.",
      // ── IMMUNOTHERAPY ──
      "IMMUNOTHERAPY: If regimen includes Pembrolizumab, Nivolumab, Atezolizumab, or Durvalumab, TSH monitoring every cycle is MANDATORY. Flag as CRITICAL if TSH is absent from the lab panel.",
      // ── ANTIOXIDANT SAFETY ──
      "ANTIOXIDANT SAFETY: If regimen includes Bortezomib, AC (Doxorubicin + Cyclophosphamide), Oxaliplatin, or Cisplatin, flag HIGH-dose Vitamin C (>500 mg) and Alpha-Lipoic Acid as EXCLUDED. Any such supplement in the plan must trigger a HIGH clinicalAlert.",
      // ── ARITHMETIC ──
      "ARITHMETIC: Verify onsCalories ÷ servingsPerDay ≈ perServingCalories (±5 kcal). Verify totalDailyProtein×4 + dailyCarbs×4 + dailyFat×9 ≤ totalDailyCalories×1.05.",
      // ── SCORING ──
      "SCORE: The maximum achievable score is 9.8 — reserve this for plans that are clinically complete, arithmetically correct, have all mandatory labs present, and require no corrections. Deduct 1.5 for each HIGH/unresolved CRITICAL issue. Deduct 0.5 for each MODERATE gap. Deduct 0.3 for each missing mandatory investigation. Deduct 0.5 for each arithmetic error. A plan with 1 MODERATE gap scores ~9.3; with 1 HIGH issue ~8.3; with 3+ HIGH issues ≤ 5.3. Do NOT round to 10 — 9.8 is the ceiling.",
      // ── OVERPOWER ──
      "OVERPOWER: Set isOverpowered:true and supply correctedPrescription if totalDailyProtein is clinically wrong per the protein rules above, or if totalDailyCalories deviates > 15% from weight × appropriate kcal/kg.",
      // ── DRUG TABLE ──
      "DRUG TABLE: For EVERY named drug or drug class in the regimen, add a row to drugInteractions. Never return an empty drugInteractions array for a patient on active chemotherapy.",
      // ── DIETARY ──
      "DIETARY: If sideEffects include nausea, vomiting, mucositis, or dysgeusia, or if intake < 60%, add specific food-texture modifications and anti-nausea strategies to instructions.",
      // ── MONITORING ──
      "MONITORING: Minimum schedule: weekly weight; fortnightly albumin, CRP, LFTs; cycle-specific labs per regimen (TSH for immunotherapy, creatinine + Mg for platinum, LFTs for anthracyclines)."
    ].join("\n");
    const system = `You are the Onvilox Clinical AI Auditor (PhD/RD + Clinical Oncology level). Your role is to audit a nutrition plan and generate a complete, untruncated safety report. ALL arrays must be populated — do not omit clinicalAlerts, micronutrientOrders, or monitoringSchedule even if the plan appears adequate.

RULES (apply every rule to every patient):
${rules}

OUTPUT FORMAT (JSON ONLY — no markdown, no preamble). ALL fields are required:
{
  "validationScore": number (0–10, honest scoring per deduction rules above),
  "rationale": [3–5 strings — key clinical reasoning points],
  "instructions": [patient-facing dietary instructions, 4–6 items],
  "clinicalAlerts": [{"type": string, "level": "HIGH"|"MODERATE"|"LOW", "message": string}],
  "correctedPrescription": {"isOverpowered": bool, "dailyCalories": number, "dailyProtein": number, "reasoning": string},
  "logicRefinements": [strings — arithmetic errors or plan logic gaps],
  "drugInteractions": [{"drug": string, "interaction": string, "advice": string, "risk": "HIGH"|"MODERATE"|"LOW"}],
  "micronutrientOrders": [{"nutrient": string, "labValue": string, "dose": string, "rationale": string, "status": "SUPPLEMENT"|"DEFICIENT"|"MONITOR"|"CAPPED"|"EXCLUDED"|"STANDARD"}],
  "monitoringSchedule": [{"frequency": string, "parameters": string, "threshold": string, "responsible": string}]
}`;

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: system,
      messages: [{
        role: "user",
        content: `AUDIT: Patient: ${JSON.stringify(patient)} Plan: ${JSON.stringify(plan)}`
      }]
    });

    const rawText = msg.content[0].text;
    let data;
    try {
      const jsonMatch = rawText.match(/{[\s\S]*}/);
      if (!jsonMatch) throw new Error("No JSON");
      let jsonStr = jsonMatch[0];
      const open = (jsonStr.match(/{/g) || []).length;
      const close = (jsonStr.match(/}/g) || []).length;
      if (open > close) jsonStr += "}".repeat(open - close);
      data = JSON.parse(jsonStr);
    } catch (e) {
      data = { rationale: ["Analysis too complex/long for current token limit."], instructions: ["Check logs."], clinicalAlerts: [] };
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
