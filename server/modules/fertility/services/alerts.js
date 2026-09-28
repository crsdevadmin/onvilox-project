// Red-flag alerts. After each engine run, every urgent finding (red flag or
// safety mode with behaviour REVIEW/BLOCK) that has no open alert yet becomes a
// new alert, and the care team gets a phone/desktop notification. An alert
// stays open until the doctor acknowledges it; while open it is not re-sent.
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const URGENT = f => ['RED_FLAG', 'SAFETY_MODE'].includes(f.kind) && ['REVIEW', 'BLOCK'].includes(f.behaviour);

function alertsService(repo, cases, notify) {
  return {
    async afterRun(c, output, runId, actorId) {
      const open = await repo.open(c.id);
      const created = [];
      for (const p of output.partners) {
        for (const f of p.findings.filter(URGENT)) {
          if (open.some(a => a.partner_id === p.partnerId && a.rule_id === f.ruleId)) continue;
          await repo.insert(c.id, p.partnerId, f.ruleId, f.message, runId);
          created.push({ partner: p.name, ruleId: f.ruleId, message: f.message });
        }
      }
      if (created.length && notify) {
        const to = (await repo.careTeam(c.id)).filter(id => id !== actorId);
        const first = created[0];
        const title = `⚠ Fertility alert — ${first.partner}`;
        const body = `${first.ruleId}: ${first.message}`.slice(0, 180) + (created.length > 1 ? ` (+${created.length - 1} more)` : '');
        try { await notify(to, title, body, `/app/fertility/${c.id}`); } catch (e) { console.warn('fertility alert push:', e.message); }
      }
      return created;
    },

    async list(user, mod, caseId) {
      await cases.get(user, mod, caseId);
      return repo.recent(caseId);
    },

    async ack(user, mod, caseId, alertId, note) {
      if (!['DOCTOR', 'ADMIN', 'SUPER_ADMIN'].includes(mod.role)) throw new HttpError(403, 'Only the treating doctor can acknowledge an alert');
      await cases.get(user, mod, caseId);
      if (!String(note || '').trim()) throw new HttpError(400, 'Write what was done (e.g. "Patient seen, scan booked")');
      if (!(await repo.ack(caseId, alertId, user.id, String(note).slice(0, 500)))) throw new HttpError(404, 'Alert not found or already acknowledged');
    },
  };
}

module.exports = { alertsService };
