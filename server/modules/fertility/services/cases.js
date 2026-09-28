// Fertility cases: who may see / change what, and input validation.
// Routes call these; SQL lives in repo/cases.js.
const { cleanAssessment, missingRequired, cleanFields, missingIn } = require('../assessment/validate');
const { checkinFields } = require('../assessment/checkin');
const { PHASES, LABS } = require('../assessment/fields');

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const ADMIN = ['ADMIN', 'SUPER_ADMIN'];
const isAdmin = role => ADMIN.includes(role);
const today = () => new Date().toISOString().slice(0, 10);
// Latest acceptable date for "not in the future": UTC tomorrow, so a user in
// India (UTC+5:30) entering today's date just after midnight is not refused.
const latestDate = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(Date.parse(s));

function casesService(repo) {
  // Which cases the caller may see. `mod` is req.module ({ role }), `user` is req.user.
  async function scopeFor(user, mod) {
    if (isAdmin(mod.role)) return { all: true };
    if (mod.role === 'DOCTOR') return { doctorId: user.id };
    if (mod.role === 'ASSISTANT') {
      const doc = await repo.mappedDoctor(user.id);
      if (!doc) throw new HttpError(403, 'You are not linked to a doctor yet — ask the admin to map you.');
      return { doctorId: doc };
    }
    if (mod.role === 'DIETITIAN') return { dietitianId: user.id };
    throw new HttpError(403, 'Your role cannot view fertility cases');
  }

  function inScope(scope, c) {
    return scope.all || (scope.doctorId && c.doctor_id === scope.doctorId)
      || (scope.dietitianId && c.dietitian_id === scope.dietitianId);
  }

  async function load(user, mod, caseId) {
    const scope = await scopeFor(user, mod);
    const c = await repo.get(caseId);
    if (!c || !inScope(scope, c)) throw new HttpError(404, 'Case not found');
    return c;
  }

  function need(mod, roles, what) {
    if (!isAdmin(mod.role) && !roles.includes(mod.role)) throw new HttpError(403, `Your role cannot ${what}`);
  }

  function cleanPartner(p, sex) {
    const name = String((p && p.name) || '').trim();
    if (!name) throw new HttpError(400, `${sex === 'F' ? 'Female' : 'Male'} partner name is required`);
    let age = p.age === '' || p.age == null ? null : Number(p.age);
    if (age !== null && (!Number.isInteger(age) || age < 15 || age > 70)) throw new HttpError(400, 'Age must be 15–70');
    return { sex, name: name.slice(0, 200), age, phone: String(p.phone || '').slice(0, 30), mrn: String(p.mrn || '').slice(0, 60) };
  }

  return {
    HttpError,

    list: async (user, mod) => repo.list(await scopeFor(user, mod)),
    get: load,

    async create(user, mod, body) {
      need(mod, ['DOCTOR', 'ASSISTANT'], 'open a case');
      const partners = [];
      if (body.female) partners.push(cleanPartner(body.female, 'F'));
      if (body.male) partners.push(cleanPartner(body.male, 'M'));
      if (!partners.length) throw new HttpError(400, 'Add at least one partner');
      let doctorId;
      if (mod.role === 'DOCTOR') doctorId = user.id;
      else if (mod.role === 'ASSISTANT') doctorId = (await scopeFor(user, mod)).doctorId;
      else doctorId = body.doctorId;
      if (!doctorId) throw new HttpError(400, 'Choose the treating doctor');
      const phase = body.phase || 'F0';
      if (!PHASES.some(p => p.value === phase) || phase === 'CLOSED') throw new HttpError(400, 'Invalid starting phase');
      return repo.create({ doctorId, createdBy: user.id, partners, phase, phaseDate: isDate(body.phaseDate) ? body.phaseDate : today() });
    },

    async addPartner(user, mod, caseId, body) {
      need(mod, ['DOCTOR', 'ASSISTANT'], 'add a partner');
      const c = await load(user, mod, caseId);
      const sex = body.sex === 'M' ? 'M' : body.sex === 'F' ? 'F' : null;
      if (!sex) throw new HttpError(400, 'sex must be F or M');
      if (c.partners.some(p => p.sex === sex)) throw new HttpError(409, 'This case already has that partner');
      await repo.addPartner(caseId, cleanPartner(body, sex));
    },

    async saveAssessment(user, mod, caseId, partnerId, body) {
      need(mod, ['DOCTOR', 'ASSISTANT', 'DIETITIAN'], 'edit assessments');
      await load(user, mod, caseId);
      const p = await repo.partner(caseId, partnerId);
      if (!p) throw new HttpError(404, 'Partner not found');
      const { data, errors } = cleanAssessment(p.sex, body.data);
      if (errors.length) throw new HttpError(400, errors.join('; '));
      const missing = missingRequired(p.sex, data);
      const version = await repo.saveAssessment(partnerId, data, missing, user.id);
      await repo.touch(caseId);
      return { version, missing };
    },

    async addLab(user, mod, caseId, partnerId, b) {
      need(mod, ['DOCTOR', 'ASSISTANT', 'DIETITIAN'], 'add lab results');
      await load(user, mod, caseId);
      if (!(await repo.partner(caseId, partnerId))) throw new HttpError(404, 'Partner not found');
      const known = LABS.find(l => l.code === b.analyte);
      const analyte = known ? known.code : String(b.analyte || '').trim().toUpperCase().slice(0, 40);
      const num = v => (v === '' || v == null ? null : Number(v));
      const value = num(b.value), refLow = num(b.refLow), refHigh = num(b.refHigh);
      const unit = String(b.unit || '').trim();
      // Rule G-09: a lab result is only usable with value, unit, reference range and date.
      if (!analyte) throw new HttpError(400, 'Choose the test');
      if (value === null || !Number.isFinite(value)) throw new HttpError(400, 'Enter the result value');
      if (!unit) throw new HttpError(400, 'Enter the unit from the lab report');
      if ((refLow === null && refHigh === null) || [refLow, refHigh].some(v => v !== null && !Number.isFinite(v)))
        throw new HttpError(400, 'Enter the reference range from the lab report');
      if (refLow !== null && refHigh !== null && refLow > refHigh) throw new HttpError(400, 'Reference low is above high');
      if (!isDate(b.collectedOn) || b.collectedOn > latestDate()) throw new HttpError(400, 'Enter a valid collection date (not in the future)');
      await repo.addLab(partnerId, { analyte, value, unit: unit.slice(0, 20), refLow, refHigh, collectedOn: b.collectedOn, source: b.source }, user.id);
      await repo.touch(caseId);
    },

    async addCheckin(user, mod, caseId, partnerId, b) {
      need(mod, ['DOCTOR', 'ASSISTANT', 'DIETITIAN'], 'record check-ins');
      const c = await load(user, mod, caseId);
      const p = await repo.partner(caseId, partnerId);
      if (!p) throw new HttpError(404, 'Partner not found');
      if (!isDate(b.date) || b.date > latestDate()) throw new HttpError(400, 'Enter the check-in date (not in the future)');
      const fields = checkinFields(p.sex);
      const { data, errors } = cleanFields(fields, b.data);
      if (errors.length) throw new HttpError(400, errors.join('; '));
      const missing = missingIn(fields, data);
      if (missing.length) throw new HttpError(400, 'Required: ' + missing.join(', '));
      await repo.addCheckin(partnerId, b.date, c.phase, data, user.id);
      await repo.touch(caseId);
    },

    async setPhase(user, mod, caseId, b) {
      need(mod, ['DOCTOR'], 'change the treatment phase');
      const c = await load(user, mod, caseId);
      if (!PHASES.some(p => p.value === b.phase)) throw new HttpError(400, 'Invalid phase');
      if (b.phase === c.phase) throw new HttpError(400, 'The case is already in this phase');
      if (!isDate(b.date) || b.date > latestDate()) throw new HttpError(400, 'Enter the date this phase started (not in the future)');
      await repo.setPhase(caseId, b.phase, b.date, String(b.note || '').slice(0, 500), user.id);
    },

    async setDietitian(user, mod, caseId, b) {
      need(mod, ['DOCTOR'], 'assign a dietitian');
      await load(user, mod, caseId);
      if (b.dietitianId) {
        const ok = (await repo.moduleUsers('DIETITIAN')).some(u => u.id === b.dietitianId);
        if (!ok) throw new HttpError(400, 'That user is not a fertility dietitian');
      }
      await repo.setDietitian(caseId, b.dietitianId || null);
    },

    dietitians: () => repo.moduleUsers('DIETITIAN'),
  };
}

module.exports = { casesService };
