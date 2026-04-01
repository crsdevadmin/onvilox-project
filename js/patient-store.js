// patient-store.js — API-backed store with in-memory cache.
// All reads are synchronous (from cache). Writes fire to the server async
// while updating the cache immediately, so callers work without change.

(function(global) {

  const _cache = { patients: null, plans: null };

  function _apiBase() {
    return (typeof CONFIG !== 'undefined' && CONFIG.API_BASE_URL) ? CONFIG.API_BASE_URL : '';
  }

  function _headers() {
    const u = (typeof auth !== 'undefined') ? auth.getCurrentUser() : null;
    const h = { 'Content-Type': 'application/json' };
    if (u && u.token) h['Authorization'] = 'Bearer ' + u.token;
    return h;
  }

  // Load all patients + plans from server into memory cache.
  // Call this once on page load before reading any data.
  async function initStore() {
    try {
      const [pRes, plRes] = await Promise.all([
        fetch(_apiBase() + '/api/patients', { headers: _headers() }),
        fetch(_apiBase() + '/api/nutrition-plans', { headers: _headers() })
      ]);
      if (pRes.ok) _cache.patients = await pRes.json();
      if (plRes.ok) _cache.plans = await plRes.json();
    } catch (e) {
      console.warn('initStore: server unreachable, falling back to localStorage:', e.message);
      _cache.patients = db.getTable('patients', []);
      _cache.plans = db.getTable('nutrition_plans', []);
    }
  }

  // ── Synchronous getters (use cache) ──────────────────────────────

  function getPatients() {
    return _cache.patients || db.getTable('patients', []);
  }

  function savePatients(patients) {
    _cache.patients = patients;
    db.setTable('patients', patients); // keep localStorage in sync as fallback
  }

  function getPatientById(id) {
    return getPatients().find(p => p.id == id) || null;
  }

  function getPlans() {
    return _cache.plans || db.getTable('nutrition_plans', []);
  }

  function getLatestPlanForPatient(patientId) {
    const plans = getPlans().filter(p => (p.patientId || p.patient_id) === patientId);
    plans.sort((a, b) => (b.version || 0) - (a.version || 0));
    return plans[0] || null;
  }

  // ── Write helpers ─────────────────────────────────────────────────

  function _post(path, body) {
    return fetch(_apiBase() + path, { method: 'POST', headers: _headers(), body: JSON.stringify(body) })
      .catch(e => console.warn('API POST failed (' + path + '):', e.message));
  }

  function _put(path, body) {
    return fetch(_apiBase() + path, { method: 'PUT', headers: _headers(), body: JSON.stringify(body) })
      .catch(e => console.warn('API PUT failed (' + path + '):', e.message));
  }

  function _del(path) {
    return fetch(_apiBase() + path, { method: 'DELETE', headers: _headers() })
      .catch(e => console.warn('API DELETE failed (' + path + '):', e.message));
  }

  // ── Patient CRUD ──────────────────────────────────────────────────

  function savePatient(patient) {
    const me = (typeof auth !== 'undefined') ? auth.getCurrentUser() : null;

    patient.id = db.uid('pat');
    patient.createdDate = new Date().toLocaleDateString();
    patient.createdAt = new Date().toISOString();
    patient.status = 'CREATED';
    patient.createdByUserId = me ? me.id : null;
    patient.assessments = patient.assessments || [];

    // Ownership rules
    if (me && me.role === 'DOCTOR') {
      patient.assignedDoctorId = me.id;
    } else if (me && me.role === 'ASSISTANT') {
      const docId = (typeof mappingService !== 'undefined') ? mappingService.getDoctorForAssistant(me.id) : null;
      patient.assignedDoctorId = docId;
    } else {
      patient.assignedDoctorId = patient.assignedDoctorId || null;
    }
    patient.storeId = null;

    // Update cache immediately
    if (_cache.patients) _cache.patients.push(patient);
    db.setTable('patients', getPatients());

    // Sync to server in background
    _post('/api/patients', patient);

    return patient;
  }

  function updatePatient(updated) {
    // Update cache
    if (_cache.patients) {
      _cache.patients = _cache.patients.map(p => p.id === updated.id ? updated : p);
    }
    db.setTable('patients', getPatients());

    // Sync to server
    _put('/api/patients/' + updated.id, updated);
  }

  function deletePatient(id) {
    // Remove from cache
    if (_cache.patients) _cache.patients = _cache.patients.filter(p => p.id !== id);
    if (_cache.plans) _cache.plans = _cache.plans.filter(p => (p.patientId || p.patient_id) !== id);
    db.setTable('patients', getPatients());
    db.setTable('nutrition_plans', getPlans());

    // Cascade delete on server
    _del('/api/patients/' + id);

    // Also remove manufacturing jobs if available
    if (typeof manufacturingService !== 'undefined' && manufacturingService.getJobs) {
      let jobs = manufacturingService.getJobs();
      jobs = jobs.filter(j => j.patientId !== id);
      db.setTable('manufacturing_jobs', jobs);
    }

    return true;
  }

  function addAssessment(patientId, formData) {
    const patient = getPatientById(patientId);
    if (!patient) return null;

    if (!patient.assessments) patient.assessments = [];

    const assessment = {
      id: db.uid('assess'),
      date: new Date().toLocaleDateString(),
      timestamp: new Date().toISOString(),
      weight: formData.weight, albumin: formData.albumin, crp: formData.crp,
      muac: formData.muac, giIssues: formData.giIssues || false,
      reducedFoodIntake: formData.reducedFoodIntake,
      sodium: formData.sodium, potassium: formData.potassium, urea: formData.urea,
      tsh: formData.tsh, prealbumin: formData.prealbumin, hemoglobin: formData.hemoglobin,
      vitD: formData.vitD, vitB12: formData.vitB12, folate: formData.folate,
      zinc: formData.zinc, magnesium: formData.magnesium, hba1c: formData.hba1c,
      notes: formData.notes || ''
    };

    // Update patient vitals with latest assessment values
    const vitalsKeys = ['weight','albumin','crp','muac','sodium','potassium','urea',
      'tsh','prealbumin','hemoglobin','vitD','vitB12','folate','zinc','magnesium','hba1c'];
    vitalsKeys.forEach(k => { if (formData[k] !== undefined && formData[k] !== '') patient[k] = formData[k]; });

    patient.assessments.push(assessment);
    updatePatient(patient);

    // Also save assessment separately to server
    _post('/api/patients/' + patientId + '/assessments', assessment);

    return patient;
  }

  // ── Nutrition Plan versioning ──────────────────────────────────────

  function savePlan(plan) {
    if (_cache.plans) _cache.plans.push(plan);
    db.setTable('nutrition_plans', getPlans());
    _post('/api/nutrition-plans', plan);
  }

  function updatePlan(updated) {
    if (_cache.plans) {
      _cache.plans = _cache.plans.map(p => p.id === updated.id ? updated : p);
    }
    db.setTable('nutrition_plans', getPlans());
    _put('/api/nutrition-plans/' + updated.id, updated);
  }

  function createOrUpdatePlan(patient, engineOutput, overrides, overrideNotes) {
    const existing = getLatestPlanForPatient(patient.id);
    const version = existing ? (existing.version + 1) : 1;

    const inputsSnapshot = {
      weight: patient.weight, height: patient.height, albumin: patient.albumin,
      usualWeight: patient.usualWeight, crp: patient.crp, muac: patient.muac,
      weightLossPercent: patient.weightLossPercent, feedingMethod: patient.feedingMethod,
      giIssues: !!patient.giIssues, cancer: patient.cancer, regimen: patient.regimen,
      sodium: patient.sodium, potassium: patient.potassium, urea: patient.urea,
      tsh: patient.tsh, prealbumin: patient.prealbumin, hemoglobin: patient.hemoglobin,
      vitD: patient.vitD, vitB12: patient.vitB12, folate: patient.folate,
      zinc: patient.zinc, magnesium: patient.magnesium, hba1c: patient.hba1c,
      cancerStage: patient.cancerStage, tumorBurden: patient.tumorBurden,
      metastasisSites: patient.metastasisSites, genomicMarkers: patient.genomicMarkers,
      ecogStatus: patient.ecogStatus, activityLevel: patient.activityLevel,
      sarcopeniaStatus: patient.sarcopeniaStatus, leanBodyMass: patient.leanBodyMass,
      fatPercent: patient.fatPercent, smi: patient.smi, handGrip: patient.handGrip,
      bsa: patient.bsa, vegetarian: patient.vegetarian,
      culturalPreferences: patient.culturalPreferences, allergies: patient.allergies,
      sideEffects: patient.sideEffects, existingSupplements: patient.existingSupplements,
      treatmentTypes: patient.treatmentTypes
    };

    const finalPlan = Object.assign({}, engineOutput, overrides || {});

    // If inputs identical and no significant change, update existing plan in place
    if (existing && JSON.stringify(existing.inputsSnapshot) === JSON.stringify(inputsSnapshot)) {
      existing.finalPlan = finalPlan;
      existing.engineOutput = engineOutput;
      existing.overrides = Object.assign(existing.overrides || {}, overrides || {});
      existing.overrideNotes = (existing.overrideNotes || '') + (overrideNotes ? '; ' + overrideNotes : '');
      updatePlan(existing);
      return existing;
    }

    const plan = {
      id: db.uid('plan'),
      patientId: patient.id,
      version,
      generatedAt: new Date().toISOString(),
      generatedBy: (overrides && Object.keys(overrides).length) ? 'DOCTOR_OVERRIDE' : 'ENGINE',
      inputsSnapshot,
      engineOutput,
      overrides: overrides || {},
      finalPlan,
      rationale: engineOutput.rationale || [],
      overrideNotes: overrideNotes || ''
    };
    savePlan(plan);
    return plan;
  }

  // Expose as globals (matches existing call sites in HTML files)
  global.initStore = initStore;
  global.getPatients = getPatients;
  global.savePatients = savePatients;
  global.getPatientById = getPatientById;
  global.savePatient = savePatient;
  global.updatePatient = updatePatient;
  global.deletePatient = deletePatient;
  global.addAssessment = addAssessment;
  global.getPlans = getPlans;
  global.savePlan = savePlan;
  global.updatePlan = updatePlan;
  global.getLatestPlanForPatient = getLatestPlanForPatient;
  global.createOrUpdatePlan = createOrUpdatePlan;

})(window);
