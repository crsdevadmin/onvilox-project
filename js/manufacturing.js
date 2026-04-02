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
        // Normalize DB row format to client format
        _cache.jobs = rows.map(r => ({
          id: r.id,
          patientId: r.patient_id || r.patientId,
          storeId: r.store_id || r.storeId,
          doctorId: r.doctor_id || r.doctorId,
          status: r.status,
          history: r.history || [],
          createdAt: r.created_at || r.createdAt,
          updatedAt: r.updated_at || r.updatedAt
        }));
        db.setTable('manufacturing_jobs', _cache.jobs);
      }
    } catch(e) {
      console.warn('initJobs: server unreachable, using localStorage');
      _cache.jobs = db.getTable('manufacturing_jobs', []);
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
      await fetch(_apiBase() + '/api/manufacturing-jobs', {
        method: 'POST', headers: _headers(), body: JSON.stringify(job)
      });
    } catch(e) { console.warn('createJob: server unreachable'); }

    return job;
  }

  async function updateJobStatus(jobId, status) {
    const jobs = getJobs();
    const job = jobs.find(j => j.id === jobId);
    if (!job) return null;
    job.status = status;
    job.updatedAt = new Date().toISOString();
    job.history = job.history || [];
    job.history.push({ status, at: job.updatedAt });

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
    return getJobs().filter(j => (j.storeId || j.store_id) === storeId);
  }

  function getJobByPatient(patientId) {
    return getJobs().find(j => (j.patientId || j.patient_id) === patientId) || null;
  }

  global.manufacturingService = { initJobs, getJobs, createJob, updateJobStatus, getJobsForStore, getJobByPatient };
})(window);
