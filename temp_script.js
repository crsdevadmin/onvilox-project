
auth.requireRole(['DOCTOR', 'ASSISTANT']);

function tagsToArray(containerId) {
  const c = document.getElementById(containerId);
  if (!c) return [];
  return [...c.children].map(el => el.dataset.value);
}

function updateCompletenessScore() {
  const mandatoryIds = [
    'patientName', 'uhic', 'age', 'sex', 'usualWeight', 'weight', 'height',
    'reducedFoodIntake', 'cancerInput', 'regimenInput', 'albumin', 'crp',
    'creatinine', 'bloodSugar', 'hemoglobin', 'feedingMethod'
  ];
  const total = mandatoryIds.length;
  let filled = 0;

  mandatoryIds.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value && el.value.trim() !== "") filled++;
  });

  const pct = Math.round((filled / total) * 100);
  const bar = document.getElementById('completenessFill');
  const score = document.getElementById('completenessScore');
  if (bar) bar.style.width = pct + '%';
  if (score) score.innerText = pct + '%';
}

async function submitPatient() {
  const fields = [
    { id: "patientName", name: "Patient Name" },
    { id: "uhic", name: "UHIC Code" },
    { id: "age", name: "Age" },
    { id: "sex", name: "Sex" },
    { id: "usualWeight", name: "Usual Weight" },
    { id: "weight", name: "Current Weight" },
    { id: "height", name: "Height" },
    { id: "reducedFoodIntake", name: "Reduced Food Intake %" },
    { id: "cancerInput", name: "Cancer Type" },
    { id: "regimenInput", name: "Chemo Regimen" },
    { id: "albumin", name: "Serum Albumin" },
    { id: "crp", name: "CRP" },
    { id: "creatinine", name: "Creatinine" },
    { id: "bloodSugar", name: "Blood Sugar" },
    { id: "hemoglobin", name: "Hemoglobin" },
    { id: "feedingMethod", name: "Feeding Method" }
  ];

  let isValid = true;
  for (let f of fields) {
    const el = document.getElementById(f.id);
    if (!validateField(el, f.name)) {
      if (isValid) el.scrollIntoView({ behavior: "smooth", block: "center" });
      isValid = false;
    }
  }

  if (!isValid) {
    const eb = document.getElementById('errorBox');
    if (eb) {
      eb.innerText = 'CRITICAL: Mandatory clinical fields are missing. Please complete the form to 100% (Green Bar) to generate a report.';
      eb.style.display = 'block';
      eb.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    return;
  }

  const me = auth.getCurrentUser();
  if (me.role === 'ASSISTANT') {
    const docId = mappingService.getDoctorForAssistant(me.id);
    if (!docId) {
      document.getElementById('errorBox').innerText = 'Assistant is not mapped to a Doctor. Admin must map Assistant → Doctor.';
      return;
    }
  }

  const patient = {
    name: document.getElementById('patientName').value,
    uhic: document.getElementById('uhic').value,
    age: parseInt(document.getElementById('age').value),
    sex: document.getElementById('sex').value,
    usualWeight: parseFloat(document.getElementById('usualWeight').value),
    weight: parseFloat(document.getElementById('weight').value),
    height: parseFloat(document.getElementById('height').value),
    bsa: parseFloat(document.getElementById('bsa').value || 0),
    leanBodyMass: parseFloat(document.getElementById('leanBodyMass').value || 0),
    fatPercent: parseFloat(document.getElementById('fatPercent').value || 0),
    smi: parseFloat(document.getElementById('smi').value || 0),
    handGrip: parseFloat(document.getElementById('handGrip').value || 0),
    sarcopeniaStatus: document.getElementById('sarcopeniaStatus').value,
    activityLevel: document.getElementById('activityLevel').value,
    weightLossPercent: (() => {
      const uw = parseFloat(document.getElementById('usualWeight').value);
      const cw = parseFloat(document.getElementById('weight').value);
      if (uw > 0 && cw > 0 && cw < uw) return Math.round(((uw - cw) / uw) * 1000) / 10;
      return 0;
    })(),
    reducedFoodIntake: parseFloat(document.getElementById('reducedFoodIntake').value) || 0,
    giIssues: (document.getElementById('giIssues').value === 'true'),
    cancer: document.getElementById('cancerInput').value,
    regimen: document.getElementById('regimenInput').value,
    albumin: parseFloat(document.getElementById('albumin').value),
    crp: parseFloat(document.getElementById('crp').value || 0),
    muac: parseFloat(document.getElementById('muac').value || 0),
    creatinine: parseFloat(document.getElementById('creatinine').value || 0),
    alt: parseFloat(document.getElementById('alt').value || 0),
    ast: parseFloat(document.getElementById('ast').value || 0),
    bilirubin: parseFloat(document.getElementById('bilirubin').value || 0),
    bloodSugar: parseFloat(document.getElementById('bloodSugar').value || 0),
    tsh: parseFloat(document.getElementById('tsh').value || 0),
    hemoglobin: parseFloat(document.getElementById('hemoglobin').value || 0),
    prealbumin: parseFloat(document.getElementById('prealbumin').value || 0),
    vitD: parseFloat(document.getElementById('vitD').value || 0),
    vitB12: parseFloat(document.getElementById('vitB12').value || 0),
    folate: parseFloat(document.getElementById('folate').value || 0),
    zinc: parseFloat(document.getElementById('zinc').value || 0),
    magnesium: parseFloat(document.getElementById('magnesium').value || 0),
    sodium: parseFloat(document.getElementById('sodium').value || 0),
    potassium: parseFloat(document.getElementById('potassium').value || 0),
    urea: parseFloat(document.getElementById('urea').value || 0),
    feedingMethod: document.getElementById('feedingMethod').value,
    treatmentTypes: tagsToArray('treatmentTags'),
    comorbidities: tagsToArray('comorbidityTags'),
    sideEffects: tagsToArray('sideEffectTags'),
    genomicMarkers: tagsToArray('genomicMarkersTags'),
    allergies: tagsToArray('allergyTags'),
    culturalPreferences: document.getElementById('culturalPreferences').value,
    existingSupplements: tagsToArray('supplementTags'),
    notes: document.getElementById('notes').value,
    cancerStage: document.getElementById('cancerStage').value,
    ecogStatus: parseInt(document.getElementById('ecogStatus').value || 0),
    tumorBurden: document.getElementById('tumorBurden').value,
    metastasisSites: tagsToArray('metastasisTags'),
    isVegetarian: document.getElementById('isVegetarian') ? (document.getElementById('isVegetarian').value === 'true') : false
  };

  savePatient(patient);

  // Trigger AI Report Generation immediately
  const overlay = document.getElementById('aiLoadingOverlay');
  if (overlay) overlay.style.display = 'flex';

  try {
    const engineOutput = generateNutritionPlan(patient);
    const plan = createOrUpdatePlan(patient, engineOutput, {}, 'Initial formulation');

    // Wait for AI Insights
    const insights = await aiReportService.generateInsights(patient, engineOutput);

    // Attach insights to the plan and save
    plan.claudeInsights = insights;
    updatePlan(plan);

    window.location.href = 'patient-profile.html?id=' + patient.id;
  } catch (err) {
    console.error("AI Generation Error:", err);
    // Fallback: Just go to the profile, it will retry there
    window.location.href = 'patient-profile.html?id=' + patient.id;
  }
}

function updateLabStatus(id, val) {
  const badge = document.getElementById(id + '_status');
  if (!badge) return;
  const num = parseFloat(val);
  if (isNaN(num)) { badge.style.display = 'none'; return; }

  let status = '', cls = '';
  if (id === 'albumin') {
    if (num < 3.5) { status = 'Low'; cls = 'status-danger'; }
    else if (num > 5.5) { status = 'High'; cls = 'status-warn'; }
    else { status = 'Normal'; cls = 'status-normal'; }
  } else if (id === 'crp') {
    if (num >= 10) { status = 'High'; cls = 'status-danger'; }
    else if (num > 3) { status = 'Elevated'; cls = 'status-warn'; }
    else { status = 'Normal'; cls = 'status-normal'; }
  } else if (id === 'creatinine') {
    if (num > 1.3) { status = 'High'; cls = 'status-danger'; }
    else if (num < 0.6) { status = 'Low'; cls = 'status-warn'; }
    else { status = 'Normal'; cls = 'status-normal'; }
  } else if (id === 'alt' || id === 'ast') {
    const limit = (id === 'alt') ? 56 : 40;
    if (num > limit) { status = 'High'; cls = 'status-danger'; }
    else { status = 'Normal'; cls = 'status-normal'; }
  } else if (id === 'bilirubin') {
    if (num > 1.2) { status = 'High'; cls = 'status-danger'; }
    else if (num < 0.1) { status = 'Low'; cls = 'status-warn'; }
    else { status = 'Normal'; cls = 'status-normal'; }
  } else if (id === 'bloodSugar') {
    if (num > 126) { status = 'High'; cls = 'status-danger'; }
    else if (num < 70) { status = 'Low'; cls = 'status-danger'; }
    else if (num > 100) { status = 'Elevated'; cls = 'status-warn'; }
    else { status = 'Normal'; cls = 'status-normal'; }
  } else if (id === 'hemoglobin') {
    if (num < 12) { status = 'Low'; cls = 'status-danger'; }
    else if (num > 18) { status = 'High'; cls = 'status-warn'; }
    else { status = 'Normal'; cls = 'status-normal'; }
  } else if (id === 'vitD') {
    if (num < 20) { status = 'Deficiency'; cls = 'status-danger'; }
    else if (num < 30) { status = 'Insuff.'; cls = 'status-warn'; }
    else { status = 'Normal'; cls = 'status-normal'; }
  } else if (id === 'muac') {
    if (num < 23) { status = 'Low'; cls = 'status-danger'; }
    else { status = 'Normal'; cls = 'status-normal'; }
  } else if (id === 'sodium') {
    if (num < 135) { status = 'Low'; cls = 'status-danger'; }
    else if (num > 145) { status = 'High'; cls = 'status-danger'; }
    else { status = 'Normal'; cls = 'status-normal'; }
  } else if (id === 'potassium') {
    if (num < 3.5) { status = 'Low'; cls = 'status-danger'; }
    else if (num > 5.1) { status = 'High'; cls = 'status-danger'; }
    else { status = 'Normal'; cls = 'status-normal'; }
  }

  if (status) {
    badge.innerText = status;
    badge.className = 'status-badge ' + cls;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function addIntakeRow() {
  const container = document.getElementById('intakeRows');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'intake-row';
  row.style.display = 'grid';
  row.style.gridTemplateColumns = '2fr 1fr';
  row.style.gap = '10px';
  row.style.marginBottom = '10px';
  row.style.alignItems = 'center';

  const options = FoodLibrary.map(f => `<option value="${f.id}">${f.name} (${f.avgKcal} kcal)</option>`).join('');
  row.innerHTML = `
    <select class="intake-food" onchange="updateIntakeCalc()" style="padding:8px; font-size:13px;">
      <option value="">Select Food Item...</option>
      ${options}
    </select>
    <input type="number" class="intake-qty" placeholder="Qty" min="0" step="0.5" value="1" oninput="updateIntakeCalc()" style="padding:8px; font-size:13px; text-align:center;">
  `;
  container.appendChild(row);
}

function updateIntakeCalc() {
  const rows = document.querySelectorAll('.intake-row');
  const meals = [];
  rows.forEach(r => {
    const foodId = r.querySelector('.intake-food').value;
    const qty = parseFloat(r.querySelector('.intake-qty').value) || 0;
    if (foodId) meals.push({ foodId, portions: qty });
  });

  const h = parseFloat(document.getElementById('height').value || 0);
  const w = parseFloat(document.getElementById('weight').value || 0);
  const sexVal = (document.getElementById('sex').value || '').toLowerCase();

  let ibw = w;
  if (h > 60) {
    const extra = (h * 0.393701) - 60;
    ibw = (sexVal === 'male' ? 48.0 + (2.7 * extra) : 45.5 + (2.2 * extra));
  }

  const alb = parseFloat(document.getElementById('albumin').value || 4);
  const targetKcal = Math.round(ibw * (alb < 3.5 ? 35 : 30));
  const res = calculateIntakeGap(targetKcal, meals);

  document.getElementById('calcActualKcal').innerText = `${res.actualIntake} kcal`;
  document.getElementById('calcGapKcal').innerText = `${res.deficitKcal} kcal`;
  document.getElementById('calcIntakePct').innerText = `${res.intakePercent}%`;
  window.lastCalculatedIntakeRes = res;
}

function applyIntakeToForm() {
  if (!window.lastCalculatedIntakeRes) updateIntakeCalc();
  const res = window.lastCalculatedIntakeRes;
  const epFI = document.getElementById('reducedFoodIntake');
  if (epFI) {
    epFI.value = res.deficitPercent;
    epFI.classList.add('ai-filled');
    setTimeout(() => epFI.classList.remove('ai-filled'), 2000);
    updateCompletenessScore();
  }
}

function initIntakeCalc() {
  const selects = document.querySelectorAll('.intake-food');
  const options = FoodLibrary.map(f => `<option value="${f.id}">${f.name} (${f.avgKcal} kcal)</option>`).join('');
  selects.forEach(s => {
    s.innerHTML = `<option value="">Select Food Item...</option>${options}`;
  });
}

function toggleIntakeUI() {
  const method = document.getElementById('feedingMethod')?.value || '';
  const panel = document.getElementById('intakeAssessmentPanel');
  if (!panel) return;
  if (method.includes('Oral')) {
    panel.style.display = 'block';
  } else {
    panel.style.display = 'none';
  }
}

function updateBSAAuto() {
  const h = parseFloat(document.getElementById('height').value);
  const w = parseFloat(document.getElementById('weight').value);
  const bsaEl = document.getElementById('bsa');
  if (h > 0 && w > 0) {
    bsaEl.value = Math.sqrt((h * w) / 3600).toFixed(2);
  } else {
    bsaEl.value = '';
  }
  updateCompletenessScore();
}

// --- CHATBOT & AI LOGIC ---
function toggleChat() {
  const win = document.getElementById('aiChatWindow');
  const isOpening = win.style.display !== 'flex';
  win.style.display = isOpening ? 'flex' : 'none';
  if (isOpening) document.getElementById('chatInput').focus();
}

function addMessage(text, type) {
  const container = document.getElementById('chatMsgs');
  const msg = document.createElement('div');
  msg.className = `msg msg-${type}`;
  msg.innerText = text;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
  return msg;
}

function addTyping() {
  const container = document.getElementById('chatMsgs');
  const typing = document.createElement('div');
  typing.className = 'msg msg-ai ai-typing';
  typing.innerHTML = '<span></span><span></span><span></span>';
  container.appendChild(typing);
  container.scrollTop = container.scrollHeight;
  return typing;
}

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  addMessage(text, 'user');
  input.value = '';

  if (isOncologyQuestion(text)) {
    const typing = addTyping();
    askClaudeOncology(text).then(reply => {
      typing.remove();
      addMessageHtml(reply, 'ai');
    }).catch(() => {
      typing.remove();
      addMessage('Sorry, I couldn\'t reach the AI. Please check server connection.', 'ai');
    });
  } else {
    const typing = addTyping();
    extractClinicalData(text).then(data => {
      typing.remove();
      if (data) {
        applyExtractionData(data);
        addMessage('✅ Clinical data extracted and filled! Review and submit.', 'ai');
      } else {
        addMessage('I read the text but found no clinical markers.', 'ai');
      }
    }).catch(err => {
      typing.remove();
      addMessage('Extraction failed. Please fill fields manually.', 'ai');
    });
  }
}

function isOncologyQuestion(text) {
  const lower = text.toLowerCase().trim();
  if (lower.endsWith('?')) return true;
  if (/^(what|how|why|when|which|is|can|should|does|do|explain|tell me|give me|list|compare|difference|meaning|define|recommend|best|safe|help)\b/.test(lower)) return true;
  const numCount = (text.match(/\d+/g) || []).length;
  const wordCount = text.split(/\s+/).length;
  return (wordCount < 20 && numCount < 3);
}

async function askClaudeOncology(question) {
  const apiBase = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE_URL) ? CONFIG.API_BASE_URL : '';
  const ctx = {
    cancer: document.getElementById('cancerInput')?.value || null,
    regimen: document.getElementById('regimenInput')?.value || null,
    age: document.getElementById('age')?.value || null
  };
  const response = await fetch(`${apiBase}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: question, contextObj: ctx })
  });
  const data = await response.json();
  return data.reply || 'No response from AI.';
}

function addMessageHtml(htmlText, type) {
  const container = document.getElementById('chatMsgs');
  const msg = document.createElement('div');
  msg.className = `msg msg-${type}`;
  msg.innerHTML = htmlText.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
  return msg;
}

function triggerFileUpload() { document.getElementById('pdfUpload').click(); }

async function handlePdfUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  addMessage(`Uploading ${file.name}...`, 'user');
  const typing = addTyping();
  try {
    const text = await extractTextFromPdf(file);
    typing.remove();
    addMessage(`Reading report...`, 'ai');
    extractClinicalData(text).then(data => {
      if (data) applyExtractionData(data);
      addMessage('✅ Lab report extraction complete!', 'ai');
    });
  } catch (e) {
    typing.remove();
    addMessage("Couldn't read PDF.", 'ai');
  }
}

async function extractTextFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map(item => item.str).join(" ") + "\n";
  }
  return fullText;
}

async function extractClinicalData(text) {
  const apiBase = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE_URL) ? CONFIG.API_BASE_URL : 'http://:3000';
  const response = await fetch(`${apiBase}/api/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pdfText: text })
  });
  const res = await response.json();
  return res.data;
}

function applyExtractionData(data) {
  if (!data) return;
  const highlight = (id) => {
    const el = document.getElementById(id);
    if (el) { el.classList.add('ai-filled'); setTimeout(() => el.classList.remove('ai-filled'), 3000); }
  };
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val !== null && val !== undefined) {
      el.value = val;
      highlight(id);
      if (typeof updateLabStatus === 'function') updateLabStatus(id, val);
    }
  };

  setVal('patientName', data.name);
  setVal('uhic', data.uhic);
  setVal('age', data.age);
  setVal('sex', data.sex);
  setVal('height', data.height);
  setVal('weight', data.weight);
  setVal('usualWeight', data.usualWeight);
  setVal('reducedFoodIntake', data.reducedFoodIntake);
  setVal('albumin', data.albumin);
  setVal('crp', data.crp);
  setVal('creatinine', data.creatinine);
  setVal('bloodSugar', data.bloodSugar);
  setVal('hemoglobin', data.hemoglobin);
  setVal('alt', data.alt);
  setVal('ast', data.ast);
  setVal('bilirubin', data.bilirubin);
  setVal('vitD', data.vitD);
  setVal('vitB12', data.vitB12);
  setVal('folate', data.folate);
  setVal('zinc', data.zinc);
  setVal('magnesium', data.magnesium);
  setVal('hba1c', data.hba1c);
  setVal('muac', data.muac);
  setVal('prealbumin', data.prealbumin);
  setVal('tsh', data.tsh);
  setVal('sodium', data.sodium);
  setVal('potassium', data.potassium);
  setVal('urea', data.urea);

  if (data.cancer) {
    const input = document.getElementById('cancerInput');
    if (input) {
      input.value = data.cancer;
      highlight('cancerInput');
      if (typeof filterCancerList === 'function') {
        const match = Object.keys(cancerRegimenMap).find(k => k.toLowerCase().includes(data.cancer.toLowerCase()));
        if (match) {
          input.value = match;
          if (typeof selectCancer === 'function') selectCancer(match);
        }
      }
    }
  }
  if (data.regimen) {
    const rInput = document.getElementById('regimenInput');
    if (rInput) {
      rInput.value = data.regimen;
      highlight('regimenInput');
      if (typeof selectRegimen === 'function') {
        const rList = cancerRegimenMap[document.getElementById('cancerInput').value] || [];
        const match = rList.find(r => r.toLowerCase().includes(data.regimen.toLowerCase()));
        if (match) selectRegimen(match);
      }
    }
  }

  setVal('cancerStage', data.cancerStage);
  setVal('ecogStatus', data.ecogStatus);
  setVal('tumorBurden', data.tumorBurden);
  setVal('sarcopeniaStatus', data.sarcopeniaStatus);
  setVal('activityLevel', data.activityLevel);
  setVal('feedingMethod', data.feedingMethod);

  const addArrayTags = (arr, containerId) => {
    if (Array.isArray(arr)) arr.forEach(item => { if (typeof addTag === 'function') addTag(item, containerId); });
  };
  addArrayTags(data.comorbidities, 'comorbidityTags');
  addArrayTags(data.sideEffects, 'sideEffectTags');
  addArrayTags(data.genomicMarkers, 'genomicMarkersTags');
  addArrayTags(data.allergies, 'allergyTags');
  addArrayTags(data.treatmentTypes, 'treatmentTags');
  addArrayTags(data.existingSupplements, 'supplementTags');
  addArrayTags(data.metastasisSites, 'metastasisTags');

  if (data.giIssues !== undefined) setVal('giIssues', String(data.giIssues));
  if (data.height || data.weight) updateBSAAuto();
  updateCompletenessScore();
}

function runAiExtraction(text) { /* Retired */ }

window.onload = function () {
  initIntakeCalc();
  toggleIntakeUI();
  updateCompletenessScore();
};
