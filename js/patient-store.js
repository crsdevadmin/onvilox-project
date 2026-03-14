function getPatients() {
  return db.getTable('patients', []);
}

function savePatients(patients){
  db.setTable('patients', patients);
}

function savePatient(patient) {
  const me = auth.getCurrentUser();
  let patients = getPatients();

  patient.id = db.uid('pat');
  patient.createdDate = new Date().toLocaleDateString();
  patient.createdAt = new Date().toISOString();
  patient.status = 'CREATED';
  patient.createdByUserId = me ? me.id : null;
  patient.assessments = []; // Initialize empty assessments history

  // ownership rules
  if(me && me.role === 'DOCTOR'){
    patient.assignedDoctorId = me.id;
  } else if(me && me.role === 'ASSISTANT'){
    const docId = mappingService.getDoctorForAssistant(me.id);
    patient.assignedDoctorId = docId;
  } else {
    patient.assignedDoctorId = patient.assignedDoctorId || null;
  }

  patient.storeId = null; // set on approval
  patients.push(patient);
  savePatients(patients);
  return patient;
}

function updatePatient(updated) {
  let patients = getPatients();
  patients = patients.map(p => p.id === updated.id ? updated : p);
  savePatients(patients);
}

function getPatientById(id) {
  const patients = getPatients();
  return patients.find(p => p.id == id);
}

function addAssessment(patientId, formData) {
  const patient = getPatientById(patientId);
  if (!patient) return null;
  
  if (!patient.assessments) patient.assessments = [];
  
  const assessment = {
    id: db.uid('assess'),
    date: new Date().toLocaleDateString(),
    timestamp: new Date().toISOString(),
    weight: formData.weight,
    albumin: formData.albumin,
    crp: formData.crp,
    giIssues: formData.giIssues || false,
    reducedFoodIntake: formData.reducedFoodIntake,
    notes: formData.notes || ""
  };
  
  if (formData.weight) patient.weight = formData.weight;
  if (formData.albumin) patient.albumin = formData.albumin;
  if (formData.crp) patient.crp = formData.crp;
  
  patient.assessments.push(assessment);
  updatePatient(patient);
  return patient;
}

// Nutrition plan versioning
function getPlans(){
  return db.getTable('nutrition_plans', []);
}

function savePlan(plan){
  const plans = getPlans();
  plans.push(plan);
  db.setTable('nutrition_plans', plans);
}

function getLatestPlanForPatient(patientId){
  const plans = getPlans().filter(p => p.patientId === patientId);
  plans.sort((a,b)=> (b.version||0) - (a.version||0));
  return plans[0] || null;
}

function createOrUpdatePlan(patient, engineOutput, overrides, overrideNotes){
  const existing = getLatestPlanForPatient(patient.id);
  const version = existing ? (existing.version + 1) : 1;
  const inputsSnapshot = {
    weight: patient.weight,
    height: patient.height,
    albumin: patient.albumin,
    weightLossPercent: patient.weightLossPercent,
    feedingMethod: patient.feedingMethod,
    giIssues: !!patient.giIssues
  };
  const finalPlan = Object.assign({}, engineOutput, overrides || {});
  const plan = {
    id: db.uid('plan'),
    patientId: patient.id,
    version,
    generatedAt: new Date().toISOString(),
    generatedBy: overrides && Object.keys(overrides).length ? 'DOCTOR_OVERRIDE' : 'ENGINE',
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
