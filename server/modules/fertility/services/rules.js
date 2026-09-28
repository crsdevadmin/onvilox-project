// Clinical rules: admin editing (any time, versioned) and the engine run.
const path = require('path');
const { validateCondition } = require('../engine/conditions');
const { factCatalogue } = require('../engine/facts');
const { runEngine, ENGINE_VERSION } = require('../engine/run');
const { PHASES } = require('../assessment/fields');

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const isAdmin = role => ['ADMIN', 'SUPER_ADMIN'].includes(role);

const ENUMS = {
  applies_to: ['F', 'M', 'B'],
  kind: ['RED_FLAG', 'SAFETY_MODE', 'REFERRAL', 'PHENOTYPE', 'RECOMMENDATION', 'INGREDIENT', 'MONITORING', 'INFO'],
  behaviour: ['AUTO', 'FLAG', 'REVIEW', 'BLOCK'],
  evidence_level: ['A', 'B', 'C', 'D', '—'],
  status: ['DRAFT', 'APPROVED', 'RETIRED'],
  engine_mode: ['CONDITION', 'SYSTEM', 'MANUAL'],
  ivf_decision: ['Approve', 'Change', 'Reject', null],
  diet_decision: ['Approve', 'Change', 'Reject', null],
};
const TEXT = ['area', 'pathway', 'rule_type', 'trigger_text', 'action_text', 'sources', 'notes', 'reviewer_comments', 'reviewed_by'];

const SEED = require(path.join(__dirname, '..', 'rules', 'seed.json'));
const UPGRADE = ['engine_mode', 'condition', 'phases', 'notes', 'kind', 'trigger_text', 'action_text'];
// Key-order-independent JSON (Postgres jsonb does not keep key order).
const canon = v => (Array.isArray(v) ? `[${v.map(canon).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',')}}`
  : JSON.stringify(v ?? null));
const differsFromSeed = (cur, r, keys = UPGRADE) => keys.some(k => canon(cur[k] ?? null) !== canon(r[k] ?? null));

function rulesService(repo, cases) {
  const catalogue = factCatalogue();
  // A catalogue update that could not be applied because an admin had edited the rule.
  const suggestion = cur => {
    const r = SEED.rules.find(x => x.id === cur.id);
    // notes are not compared: an admin's own note should not keep the suggestion alive
    if (!r || !r.upgrade_note || !cur.updated_by || !differsFromSeed(cur, r, UPGRADE.filter(k => k !== 'notes'))) return null;
    return { catalogue_version: SEED.catalogue_version, note: r.upgrade_note, ...Object.fromEntries(UPGRADE.map(k => [k, r[k] ?? null])) };
  };
  const phaseCodes = PHASES.map(p => p.value);

  function clean(body, existing) {
    const out = {};
    for (const k of TEXT) if (k in body) out[k] = body[k] === null ? null : String(body[k]).trim().slice(0, 4000);
    for (const [k, allowed] of Object.entries(ENUMS)) {
      if (!(k in body)) continue;
      const v = body[k] === '' ? null : body[k];
      if (!allowed.includes(v)) throw new HttpError(400, `Invalid ${k.replace('_', ' ')}: ${v}`);
      out[k] = v;
    }
    if ('reviewed_on' in body) {
      const d = body.reviewed_on || null;
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new HttpError(400, 'Review date must be YYYY-MM-DD');
      out.reviewed_on = d;
    }
    if ('phases' in body) {
      if (!Array.isArray(body.phases) || body.phases.some(p => !phaseCodes.includes(p))) throw new HttpError(400, 'Invalid phases');
      out.phases = body.phases;
    }
    if ('condition' in body) out.condition = body.condition || null;

    const m = { ...(existing || {}), ...out };
    for (const k of ['area', 'rule_type', 'trigger_text', 'action_text']) if (!m[k]) throw new HttpError(400, `${k.replace('_', ' ')} is required`);
    if (m.engine_mode === 'CONDITION') {
      if (!m.condition) throw new HttpError(400, 'A rule the engine runs needs a condition');
      const errs = validateCondition(m.condition, catalogue);
      if (errs.length) throw new HttpError(400, 'Condition: ' + errs.join('; '));
    }
    // A rule is clinically approved only when BOTH reviewers approved it (catalogue sign-off rule).
    if (m.status === 'APPROVED' && (m.ivf_decision !== 'Approve' || m.diet_decision !== 'Approve' || !m.reviewed_by))
      throw new HttpError(400, 'To approve: both the IVF specialist and the dietitian must choose "Approve", and the reviewer name must be filled in');
    return out;
  }

  const needAdmin = mod => { if (!isAdmin(mod.role)) throw new HttpError(403, 'Only admins can change clinical rules'); };

  return {
    // Load the rule catalogue shipped with the code.
    //  - New rules are inserted as drafts.
    //  - A catalogue update (rule carries upgrade_note) is applied ONLY to rules
    //    no person has ever edited (last change made by the system). A rule an admin
    //    has changed is never overwritten — the skipped update is logged.
    async seed() {
      const { rules, catalogue_version } = SEED;
      let added = 0, upgraded = 0; const kept = [];
      for (const r of rules) {
        if (await repo.insert(r, null, `Seeded from rule catalogue ${catalogue_version}`)) { added++; continue; }
        if (!r.upgrade_note) continue;
        const cur = await repo.get(r.id);
        if (!differsFromSeed(cur, r)) continue;
        if (cur.updated_by) { kept.push(r.id); continue; }
        const patch = Object.fromEntries(UPGRADE.map(k => [k, r[k] ?? null]));
        if (await repo.update(r.id, patch, cur.version, null, r.upgrade_note)) upgraded++;
      }
      if (added || upgraded) console.log(`fertility rules: catalogue ${catalogue_version} — ${added} added, ${upgraded} updated`);
      if (kept.length) console.warn(`fertility rules: catalogue ${catalogue_version} has updates for admin-edited rules (left unchanged): ${kept.join(', ')}`);
    },

    facts: () => catalogue,
    list: async () => (await repo.all()).map(r => ({ ...r, has_catalogue_update: !!suggestion(r) })),

    async get(id) {
      const r = await repo.get(id);
      if (!r) throw new HttpError(404, 'Rule not found');
      return { ...r, catalogue_update: suggestion(r), history: await repo.history(id) };
    },

    async create(user, mod, body) {
      needAdmin(mod);
      const id = String(body.id || '').trim().toUpperCase();
      if (!/^[A-Z][A-Z0-9]{0,5}-[A-Z0-9]{1,6}$/.test(id)) throw new HttpError(400, 'Rule ID must look like F0-12 or RF-13');
      const rule = { status: 'DRAFT', engine_mode: 'MANUAL', applies_to: 'B', kind: 'INFO', behaviour: 'FLAG', phases: [], ...clean(body, null) };
      rule.id = id;
      if (!(await repo.insert(rule, user.id, body.change_note || 'Rule created'))) throw new HttpError(409, 'A rule with this ID already exists');
      return id;
    },

    async update(user, mod, id, body) {
      needAdmin(mod);
      const existing = await repo.get(id);
      if (!existing) throw new HttpError(404, 'Rule not found');
      const patch = clean(body, existing);
      if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to change');
      const ok = await repo.update(id, patch, Number(body.version), user.id, String(body.change_note || '').slice(0, 500));
      if (!ok) throw new HttpError(409, 'Someone else changed this rule while you were editing — reload to see their version');
    },

    async csv() {
      const rows = await repo.all();
      const cols = ['id', 'area', 'pathway', 'applies_to', 'rule_type', 'trigger_text', 'action_text', 'behaviour', 'evidence_level',
        'sources', 'notes', 'status', 'engine_mode', 'ivf_decision', 'diet_decision', 'reviewer_comments', 'reviewed_by', 'reviewed_on', 'version'];
      const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      return '﻿' + [cols.join(','), ...rows.map(r => cols.map(c => q(r[c])).join(','))].join('\r\n');
    },

    async run(user, mod, caseId) {
      const c = await cases.get(user, mod, caseId);            // enforces who may see the case
      const output = runEngine(await repo.all(), c);
      const saved = await repo.saveRun(caseId, ENGINE_VERSION, output, user.id);
      return { id: saved.id, created_at: saved.created_at, engine: ENGINE_VERSION, output };
    },

    // Saving a check-in re-runs the rules at once, so a red-flag symptom
    // (e.g. OHSS signs, rule RF-05) is surfaced the moment it is entered.
    async checkin(user, mod, caseId, partnerId, body) {
      await cases.addCheckin(user, mod, caseId, partnerId, body);
      return this.run(user, mod, caseId);
    },

    async latest(user, mod, caseId) {
      await cases.get(user, mod, caseId);
      return repo.latestRun(caseId);
    },
  };
}

module.exports = { rulesService };
