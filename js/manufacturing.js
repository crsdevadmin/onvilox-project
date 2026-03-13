(function(global){
  function getJobs(){ return db.getTable('manufacturing_jobs', []); }
  function saveJobs(jobs){ db.setTable('manufacturing_jobs', jobs); }

  function createJob({patientId, storeId, doctorId}){
    const jobs = getJobs();
    const job = {
      id: db.uid('job'),
      patientId,
      storeId,
      doctorId,
      status: 'APPROVED',
      history: [{ status:'APPROVED', at:new Date().toISOString() }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    jobs.push(job);
    saveJobs(jobs);
    return job;
  }

  function updateJobStatus(jobId, status){
    const jobs = getJobs();
    const job = jobs.find(j => j.id === jobId);
    if(!job) return null;
    job.status = status;
    job.updatedAt = new Date().toISOString();
    job.history = job.history || [];
    job.history.push({ status, at: job.updatedAt });
    saveJobs(jobs);
    return job;
  }

  function getJobsForStore(storeId){
    return getJobs().filter(j => j.storeId === storeId);
  }

  function getJobByPatient(patientId){
    return getJobs().find(j => j.patientId === patientId) || null;
  }

  global.manufacturingService = { getJobs, createJob, updateJobStatus, getJobsForStore, getJobByPatient };
})(window);
