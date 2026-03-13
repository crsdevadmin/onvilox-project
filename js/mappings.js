(function(global){
  function getDoctorForAssistant(assistantId){
    const map = db.getTable('doctor_assistant_map', []);
    const m = map.find(x => x.assistantId === assistantId);
    return m ? m.doctorId : null;
  }

  function getStoreForDoctor(doctorId){
    const users = db.getTable('users', []);
    const d = users.find(u => u.id === doctorId);
    return d ? (d.storeId || null) : null;
  }

  global.mappingService = { getDoctorForAssistant, getStoreForDoctor };
})(window);
