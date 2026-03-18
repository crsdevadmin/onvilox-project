function getPatients() {
  return db.getTable('patients', []);
}

function savePatient(patient) {
  const me = auth.getCurrentUser();
  patient.id = patient.id || db.uid('pat');
  patient.status = 'CREATED';
  patient.createdById = me ? me.id : null;

  // ownership rules
  if(me && me.role === 'DOCTOR'){
    patient.assignedDoctorId = me.id;
  } else if(me && me.role === 'ASSISTANT'){
    const docId = mappingService.getDoctorForAssistant(me.id);
    patient.assignedDoctorId = docId;
  }

  const list = getPatients();
  list.push(patient);
  db.setTable('patients', list);
  return patient;
}

function updatePatient(updated) {
  const list = getPatients();
  const idx = list.findIndex(p => p.id === updated.id);
  if(idx !== -1) {
    list[idx] = updated;
    db.setTable('patients', list);
  }
  return updated;
}

function getPatientById(id) {
  const list = getPatients();
  return list.find(p => p.id === id) || null;
}

function addAssessment(patientId, formData) {
  const list = db.getTable('assessments', []);
  const assessment = {
    id: db.uid('assess'),
    patient_id: patientId,
    assessment_date: new Date().toISOString().split('T')[0],
    ...formData
  };
  list.push(assessment);
  db.setTable('assessments', list);
  return assessment;
}

function getPlansByPatient(patientId){
  const list = db.getTable('plans', []);
  return list.filter(p => (p.patientId === patientId || p.patient_id === patientId)).sort((a,b) => b.version - a.version);
}

function getLatestPlanForPatient(patientId){
  const plans = getPlansByPatient(patientId);
  return plans[0] || null;
}

function createOrUpdatePlan(patient, engineOutput, overrides, overrideNotes){
  const existing = getLatestPlanForPatient(patient.id);
  const version = existing ? (existing.version + 1) : 1;
  const inputsSnapshot = {
    weight: patient.weight,
    height: patient.height,
    albumin: patient.albumin,
    crp: patient.crp,
    muac: patient.muac,
    weightLossPercent: patient.weightLossPercent,
    feedingMethod: patient.feedingMethod,
    giIssues: !!patient.giIssues,
    sodium: patient.sodium,
    potassium: patient.potassium,
    urea: patient.urea,
    age: patient.age,
    smi: patient.smi,
    handGrip: patient.handGrip
  };
  const finalPlan = Object.assign({}, engineOutput, overrides || {});
  const plan = {
    id: db.uid('plan'),
    patientId: patient.id,
    version,
    generatedBy: (overrides && Object.keys(overrides).length) ? 'DOCTOR_OVERRIDE' : 'ENGINE',
    inputsSnapshot: inputsSnapshot,
    engineOutput: engineOutput,
    overrides: overrides || {},
    finalPlan: finalPlan,
    rationale: engineOutput.rationale || [],
    overrideNotes: overrideNotes || ''
  };
  
  const list = db.getTable('plans', []);
  list.push(plan);
  db.setTable('plans', list);
  return plan;
}
