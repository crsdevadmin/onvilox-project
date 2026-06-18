// manufacturing.js — API-backed manufacturing job service with localStorage fallback

(function(global){

  const _cache = { jobs: null };

  function _apiBase() {
    return (typeof CONFIG !== 'undefined' && CONFIG.API_BASE_URL) ? CONFIG.API_BASE_URL : '';
  }

  function _headers() {
    const u = (typeof auth !== 'undefined') ? auth.getCurrentUser() : null;
    const h = { 'Content-Type': 'application/json' };
    if (u && u.token) h['Authorization'] = 'Bearer ' + u.token;
    return h;
  }

  async function initJobs() {
    try {
      const res = await fetch(_apiBase() + '/api/manufacturing-jobs', { headers: _headers() });
      if (res.ok) {
        const rows = await res.json();
        applyServerJobs(rows);
      }
    } catch(e) {
      console.warn('initJobs: server unreachable, using localStorage');
      _cache.jobs = db.getTable('manufacturing_jobs', []);
    }
  }

  // Replace the in-memory job cache with freshly-fetched server rows.
  // Used by initJobs and by the dashboard's live poll so render() always
  // reflects server truth (e.g. an approval made on another device).
  function applyServerJobs(rows) {
    _cache.jobs = (rows || []).map(r => ({
      id: r.id,
      patientId: r.patient_id || r.patientId,
      storeId: r.store_id || r.storeId,
      doctorId: r.doctor_id || r.doctorId,
      status: r.status,
      history: r.history || [],
      batchNo: r.batch_no || r.batchNo || null,
      mfgDate: r.mfg_date || r.mfgDate || null,
      expDate: r.exp_date || r.expDate || null,
      createdAt: r.created_at || r.createdAt,
      updatedAt: r.updated_at || r.updatedAt
    }));
    db.setTable('manufacturing_jobs', _cache.jobs);
    return _cache.jobs;
  }

  // Assign/refresh batch number + manufacturing & expiry dates for a job.
  // Returns { ok, batchNo, mfgDate, expDate } or { ok:false, error }.
  async function assignBatch(jobId, mfgDate) {
    try {
      const res = await fetch(_apiBase() + '/api/manufacturing-jobs/' + jobId + '/batch', {
        method: 'POST', headers: _headers(), body: JSON.stringify({ mfgDate })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error || 'Server error assigning batch' };
      // update local cache
      const jobs = getJobs();
      const job = jobs.find(j => j.id === jobId);
      if (job) { job.batchNo = data.batch_no; job.mfgDate = data.mfg_date; job.expDate = data.exp_date; }
      return { ok: true, batchNo: data.batch_no, mfgDate: data.mfg_date, expDate: data.exp_date };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  function getJobs() {
    return _cache.jobs || db.getTable('manufacturing_jobs', []);
  }

  async function createJob({patientId, storeId, doctorId}) {
    const job = {
      id: db.uid('job'),
      patientId, storeId, doctorId,
      status: 'APPROVED',
      history: [{ status: 'APPROVED', at: new Date().toISOString() }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (_cache.jobs) _cache.jobs.push(job);
    else { const jobs = db.getTable('manufacturing_jobs', []); jobs.push(job); db.setTable('manufacturing_jobs', jobs); }
    db.setTable('manufacturing_jobs', getJobs());

    try {
      const res = await fetch(_apiBase() + '/api/manufacturing-jobs', {
        method: 'POST', headers: _headers(), body: JSON.stringify(job)
      });
      if (!res.ok) {
        const err = await res.text().catch(() => '');
        console.error('createJob: server rejected job (status ' + res.status + '). It will not reach the store. ', err);
      }
    } catch(e) { console.warn('createJob: server unreachable'); }

    return job;
  }

  async function updateJobStatus(jobId, status, actor) {
    const jobs = getJobs();
    const job = jobs.find(j => j.id === jobId);
    if (!job) return null;
    job.status = status;
    job.updatedAt = new Date().toISOString();
    job.history = job.history || [];
    const entry = { status, at: job.updatedAt };
    if (actor) {
      if (actor.by) entry.by = actor.by;
      if (actor.role) entry.role = actor.role;
      if (actor.action) entry.action = actor.action;
    }
    job.history.push(entry);

    if (_cache.jobs) _cache.jobs = jobs;
    db.setTable('manufacturing_jobs', jobs);

    try {
      await fetch(_apiBase() + '/api/manufacturing-jobs/' + jobId, {
        method: 'PUT', headers: _headers(),
        body: JSON.stringify({ status, history: job.history })
      });
    } catch(e) { console.warn('updateJobStatus: server unreachable'); }

    return job;
  }

  function getJobsForStore(storeId) {
    if (!storeId) return [];
    const sid = String(storeId);
    return getJobs().filter(j => {
      const jid = j.storeId || j.store_id;
      return jid != null && String(jid) === sid;
    });
  }

  function getJobByPatient(patientId) {
    return getJobs().find(j => (j.patientId || j.patient_id) === patientId) || null;
  }

  // ── Store approval workflow ────────────────────────────────────────────────
  // Two-step sign-off: the Store Manager REQUESTS a transition (job enters a
  // PENDING_* state); the Store Approver then APPROVES (advances) or REJECTS
  // (reverts to the prior state).
  const WORKFLOW = {
    // When a manager requests the next step, the job moves to this pending state.
    requestNext: {
      APPROVED:   'PENDING_PROCESSING',
      PROCESSING: 'PENDING_DISPATCH'
    },
    // What each pending state resolves to on approve / reject.
    pending: {
      PENDING_PROCESSING: { approve: 'PROCESSING',  reject: 'APPROVED',   label: 'Processing' },
      PENDING_DISPATCH:   { approve: 'DISPATCHED',  reject: 'PROCESSING', label: 'Dispatch' }
    },
    isPending: function(status){
      return !!WORKFLOW.pending[(status || '').toUpperCase()];
    },
    // The transition a manager can request from the current status (or null).
    requestFor: function(status){
      const s = (status || 'APPROVED').toUpperCase();
      const next = WORKFLOW.requestNext[s];
      if (!next) return null;
      return { next: next, label: WORKFLOW.pending[next].label };
    },
    // Human-friendly label for any status.
    statusLabel: function(status){
      const s = (status || 'APPROVED').toUpperCase();
      if (s === 'PENDING_PROCESSING') return 'Pending Processing Approval';
      if (s === 'PENDING_DISPATCH')   return 'Pending Dispatch Approval';
      return s.charAt(0) + s.slice(1).toLowerCase();
    },
    // CSS badge class (reuses existing .pending / .processing / etc.).
    badgeClass: function(status){
      const s = (status || 'APPROVED').toUpperCase();
      if (WORKFLOW.isPending(s)) return 'pending';
      return s.toLowerCase();
    }
  };

  global.manufacturingService = { initJobs, applyServerJobs, getJobs, createJob, updateJobStatus, assignBatch, getJobsForStore, getJobByPatient, WORKFLOW };
})(window);
