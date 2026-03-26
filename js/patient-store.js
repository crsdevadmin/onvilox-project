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
    muac: formData.muac,
    giIssues: formData.giIssues || false,
    reducedFoodIntake: formData.reducedFoodIntake,
    sodium: formData.sodium,
    potassium: formData.potassium,
    urea: formData.urea,
    tsh: formData.tsh,
    prealbumin: formData.prealbumin,
    hemoglobin: formData.hemoglobin,
    vitD: formData.vitD,
    vitB12: formData.vitB12,
    folate: formData.folate,
    zinc: formData.zinc,
    magnesium: formData.magnesium,
    hba1c: formData.hba1c,
    notes: formData.notes || ""
  };
  
  if (formData.weight) patient.weight = formData.weight;
  if (formData.albumin) patient.albumin = formData.albumin;
  if (formData.crp) patient.crp = formData.crp;
  if (formData.muac) patient.muac = formData.muac;
  if (formData.sodium) patient.sodium = formData.sodium;
  if (formData.potassium) patient.potassium = formData.potassium;
  if (formData.urea) patient.urea = formData.urea;
  if (formData.tsh) patient.tsh = formData.tsh;
  if (formData.prealbumin) patient.prealbumin = formData.prealbumin;
  if (formData.hemoglobin) patient.hemoglobin = formData.hemoglobin;
  if (formData.vitD) patient.vitD = formData.vitD;
  if (formData.vitB12) patient.vitB12 = formData.vitB12;
  if (formData.folate) patient.folate = formData.folate;
  if (formData.zinc) patient.zinc = formData.zinc;
  if (formData.magnesium) patient.magnesium = formData.magnesium;
  if (formData.hba1c) patient.hba1c = formData.hba1c;
  
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
    usualWeight: patient.usualWeight,
    crp: patient.crp,
    muac: patient.muac,
    weightLossPercent: patient.weightLossPercent,
    feedingMethod: patient.feedingMethod,
    giIssues: !!patient.giIssues,
    cancer: patient.cancer,
    regimen: patient.regimen,
    sodium: patient.sodium,
    potassium: patient.potassium,
    urea: patient.urea,
    tsh: patient.tsh,
    prealbumin: patient.prealbumin,
    hemoglobin: patient.hemoglobin,
    vitD: patient.vitD,
    vitB12: patient.vitB12,
    folate: patient.folate,
    zinc: patient.zinc,
    magnesium: patient.magnesium,
    hba1c: patient.hba1c,
    cancerStage: patient.cancerStage,
    tumorBurden: patient.tumorBurden,
    metastasisSites: patient.metastasisSites,
    genomicMarkers: patient.genomicMarkers,
    ecogStatus: patient.ecogStatus,
    activityLevel: patient.activityLevel,
    sarcopeniaStatus: patient.sarcopeniaStatus,
    leanBodyMass: patient.leanBodyMass,
    fatPercent: patient.fatPercent,
    smi: patient.smi,
    handGrip: patient.handGrip,
    bsa: patient.bsa,
    vegetarian: patient.vegetarian,
    culturalPreferences: patient.culturalPreferences,
    allergies: patient.allergies,
    sideEffects: patient.sideEffects,
    existingSupplements: patient.existingSupplements,
    treatmentTypes: patient.treatmentTypes
  };
  const finalPlan = Object.assign({}, engineOutput, overrides || {});
  
  // If inputs are identical and no significant overrides change, update the existing plan instead of new version
  if (existing && JSON.stringify(existing.inputsSnapshot) === JSON.stringify(inputsSnapshot)) {
    existing.finalPlan = finalPlan;
    existing.engineOutput = engineOutput;
    existing.overrides = Object.assign(existing.overrides || {}, overrides || {});
    existing.overrideNotes = (existing.overrideNotes || '') + (overrideNotes ? "; " + overrideNotes : "");
    updatePlan(existing);
    return existing;
  }

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

function updatePlan(updated) {
  let plans = getPlans();
  plans = plans.map(p => p.id === updated.id ? updated : p);
  db.setTable('nutrition_plans', plans);
}
