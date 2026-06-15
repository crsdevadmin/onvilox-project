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

  // Load all data from server into memory cache.
  // Call this once on page load before reading any data.
  async function initStore() {
    try {
      const [pRes, plRes] = await Promise.all([
        fetch(_apiBase() + '/api/patients', { headers: _headers() }),
        fetch(_apiBase() + '/api/nutrition-plans', { headers: _headers() })
      ]);
      if (pRes.ok) {
        const apiPatients = await pRes.json();
        // Merge: include any locally-saved patients not yet confirmed by the API
        // (race condition: redirect can happen before the POST completes)
        const localPatients = db.getTable('patients', []);
        const apiIds = new Set(apiPatients.map(p => p.id));
        const pendingLocals = localPatients.filter(p => !apiIds.has(p.id));
        // Anything the server already has is confirmed -- clear any stale unsynced flag.
        const apiConfirmed = apiPatients.map(p => Object.assign(p, { _synced: true }));
        // Local-only records keep whatever flag they had. Only records explicitly
        // flagged _synced===false by a failed save get retried by syncPending();
        // legacy records (flag undefined) are left untouched so we never resurrect
        // something that was deleted on another device.
        _cache.patients = apiConfirmed.concat(pendingLocals);
      } else {
        _cache.patients = db.getTable('patients', []);
      }
      if (plRes.ok) {
        const apiPlans = await plRes.json();
        const localPlans = db.getTable('nutrition_plans', []);
        const apiPlanIds = new Set(apiPlans.map(p => p.id));
        const pendingLocalPlans = localPlans.filter(p => !apiPlanIds.has(p.id));
        _cache.plans = apiPlans.concat(pendingLocalPlans);
      } else {
        _cache.plans = db.getTable('nutrition_plans', []);
      }
    } catch (e) {
      console.warn('initStore: server unreachable, falling back to localStorage:', e.message);
      _cache.patients = db.getTable('patients', []);
      _cache.plans = db.getTable('nutrition_plans', []);
    }
    // Also init users, stores, jobs, mappings
    const inits = [];
    if (typeof userService !== 'undefined' && userService.initUsers) inits.push(userService.initUsers());
    if (typeof storeService !== 'undefined' && storeService.initStores) inits.push(storeService.initStores());
    if (typeof manufacturingService !== 'undefined' && manufacturingService.initJobs) inits.push(manufacturingService.initJobs());
    if (typeof mappingService !== 'undefined' && mappingService.initMappings) inits.push(mappingService.initMappings());
    await Promise.all(inits);

    // Retry any record that a previous save failed to push to the server.
    try { await syncPending(); } catch (e) { console.warn('syncPending failed:', e.message); }
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
    return fetch(_apiBase() + path, { method: 'POST', headers: _headers(), body: JSON.stringify(body), keepalive: true })
      .catch(e => console.warn('API POST failed (' + path + '):', e.message));
  }

  function _put(path, body) {
    return fetch(_apiBase() + path, { method: 'PUT', headers: _headers(), body: JSON.stringify(body), keepalive: true })
      .catch(e => console.warn('API PUT failed (' + path + '):', e.message));
  }

  function _del(path) {
    return fetch(_apiBase() + path, { method: 'DELETE', headers: _headers() })
      .catch(e => console.warn('API DELETE failed (' + path + '):', e.message));
  }

  // -- Reliable sync (prevents "saved locally but not in DB") ---------
  // A record is tagged _synced=false until the server confirms it. _syncRecord
  // POSTs the record and flips the flag on success; syncPending() retries any
  // record still flagged false. It only ever re-sends records that were never
  // confirmed -- it never deletes or overwrites server data, so it cannot
  // resurrect something that was deleted on the server.
  function _persist(tableKey) {
    if (tableKey === 'patients') db.setTable('patients', getPatients());
    else if (tableKey === 'nutrition_plans') db.setTable('nutrition_plans', getPlans());
  }

  function _syncRecord(path, record, tableKey) {
    // Exclude the internal _syncPromise handle from the request body.
    return fetch(_apiBase() + path, { method: 'POST', headers: _headers(), body: JSON.stringify(record, (k, v) => k === '_syncPromise' ? undefined : v), keepalive: true })
      .then(res => {
        if (res && res.ok) {
          record._synced = true;
          _persist(tableKey);
          return true;
        }
        console.warn('sync rejected (' + path + '), status ' + (res && res.status) + ' -- kept as pending');
        return false;
      })
      .catch(e => { console.warn('sync error (' + path + '): ' + e.message + ' -- kept as pending'); return false; });
  }

  // Retry every record that was never confirmed by the server. Safe to call
  // on every page load. Returns the number of records successfully synced.
  async function syncPending() {
    let count = 0;
    for (const p of getPatients()) {
      if (p && p._synced === false) { if (await _syncRecord('/api/patients', p, 'patients')) count++; }
    }
    for (const pl of getPlans()) {
      if (pl && pl._synced === false) { if (await _syncRecord('/api/nutrition-plans', pl, 'nutrition_plans')) count++; }
    }
    if (count) console.log('syncPending: re-synced ' + count + ' previously-unsaved record(s) to the server.');
    return count;
  }

  // Patients present on THIS device but not confirmed in the database.
  // initStore() marks server-confirmed patients _synced=true, so anything
  // whose flag is not true is local-only (never reached the server).
  function getUnsyncedPatients() {
    return getPatients().filter(p => p && p._synced !== true);
  }

  // Push every local-only patient (and its plans) to the server. Safe and
  // idempotent — the server upserts by id, so it can't create duplicates.
  // Returns counts for showing the doctor a result.
  async function pushUnsyncedToServer() {
    const unsynced = getUnsyncedPatients();
    const plans = getPlans();
    let patientsOk = 0, plansOk = 0;
    for (const p of unsynced) {
      const ok = await _syncRecord('/api/patients', p, 'patients');
      if (ok) {
        patientsOk++;
        const its = plans.filter(x => (x.patientId || x.patient_id) === p.id && x._synced !== true);
        for (const pl of its) {
          if (await _syncRecord('/api/nutrition-plans', pl, 'nutrition_plans')) plansOk++;
        }
      }
    }
    return { attempted: unsynced.length, patientsOk, plansOk };
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

    // Mark unsynced until the server confirms it (cleared by _syncRecord on success).
    patient._synced = false;

    // Update cache and localStorage immediately (even if cache was not yet initialised)
    const _existingPatients = _cache.patients || db.getTable('patients', []);
    _existingPatients.push(patient);
    _cache.patients = _existingPatients;
    db.setTable('patients', _existingPatients);

    // Sync to server; if it fails (or the page redirects before it finishes),
    // the record stays flagged and syncPending() will retry it on next load.
    // The promise is exposed so callers can await server confirmation before navigating.
    patient._syncPromise = _syncRecord('/api/patients', patient, 'patients');

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
    const _existingPlans = _cache.plans || db.getTable('nutrition_plans', []);
    // Replace if already in cache (e.g. called again after claudeInsights added), else push
    const idx = _existingPlans.findIndex(p => p.id === plan.id);
    if (idx >= 0) _existingPlans[idx] = plan; else _existingPlans.push(plan);
    plan._synced = false;
    _cache.plans = _existingPlans;
    db.setTable('nutrition_plans', _existingPlans);
    plan._syncPromise = _syncRecord('/api/nutrition-plans', plan, 'nutrition_plans');
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
  global.syncPending = syncPending;
  global.getUnsyncedPatients = getUnsyncedPatients;
  global.pushUnsyncedToServer = pushUnsyncedToServer;

})(window);
