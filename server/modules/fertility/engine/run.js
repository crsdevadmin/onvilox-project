// The Fertility decision-support engine (V1).
// Runs every non-retired rule whose engine_mode is CONDITION against each
// partner's facts. It produces findings only — red flags, referrals,
// nutrition phenotypes, recommendations. It does NOT create formulas.
// Draft (not yet clinically approved) rules are included and labelled.
const { buildFacts } = require('./facts');
const { evaluate } = require('./conditions');

const ENGINE_VERSION = 'fx-engine-1.0';
const SEVERITY = ['BLOCK', 'REVIEW', 'FLAG', 'AUTO'];
const ORDER = ['RED_FLAG', 'SAFETY_MODE', 'REFERRAL', 'PHENOTYPE', 'RECOMMENDATION', 'INGREDIENT', 'MONITORING', 'INFO'];

function applies(rule, partner, phase) {
  if (rule.status === 'RETIRED' || rule.engine_mode !== 'CONDITION' || !rule.condition) return false;
  if (rule.applies_to !== 'B' && rule.applies_to !== partner.sex) return false;
  const phases = rule.phases || [];
  return !phases.length || phases.includes(phase);
}

const finding = r => ({
  ruleId: r.id, kind: r.kind, behaviour: r.behaviour, message: r.action_text, trigger: r.trigger_text,
  evidence: r.evidence_level, sources: r.sources, notes: r.notes, status: r.status, version: r.version,
});

function runEngine(rules, c) {
  const partners = c.partners.map(p => {
    const { facts, staleLabs } = buildFacts(c, p);
    const findings = [];
    const gaps = new Set();
    for (const r of rules) {
      if (!applies(r, p, c.phase)) continue;
      const { result, missing } = evaluate(r.condition, facts);
      if (result) findings.push(finding(r));
      else missing.forEach(m => gaps.add(m));
    }
    // NP-11: two or more nutrition phenotypes → "multiple risks" priority order.
    const np11 = rules.find(r => r.id === 'NP-11' && r.status !== 'RETIRED');
    if (np11 && findings.filter(f => f.kind === 'PHENOTYPE').length >= 2) findings.push(finding(np11));
    // Most urgent first: finding type, then behaviour (hard stop / review before suggestions), then ID.
    findings.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)
      || SEVERITY.indexOf(a.behaviour) - SEVERITY.indexOf(b.behaviour) || a.ruleId.localeCompare(b.ruleId));
    return {
      partnerId: p.id, sex: p.sex, name: p.name,
      assessed: !!p.assessment, missingRequired: p.assessment ? p.assessment.missing : null,
      redFlags: findings.filter(f => f.kind === 'RED_FLAG').length,
      findings, dataGaps: [...gaps].sort(), staleLabs, facts,
    };
  });
  const used = new Set(partners.flatMap(p => p.findings.filter(f => f.status !== 'APPROVED').map(f => f.ruleId)));
  return {
    engineVersion: ENGINE_VERSION, phase: c.phase, pregnancyPending: c.phase === 'F9',
    // Rule G-05: a red flag whose behaviour is REVIEW or BLOCK stops automated formula changes.
    formulaChangesStopped: partners.some(p => p.findings.some(f => f.kind === 'RED_FLAG' && ['REVIEW', 'BLOCK'].includes(f.behaviour))),
    draftRulesUsed: used.size, partners,
  };
}

module.exports = { runEngine, ENGINE_VERSION };
