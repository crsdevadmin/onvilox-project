// Rule conditions are data (JSON), edited by admins:
//   { all: [node, …] } | { any: [node, …] } | { fact, op, value }
// evaluate() never throws on bad data: an unknown/missing fact makes that
// leaf false and is reported, so the UI can say what data was lacking.

const OPS = {
  '<': { types: ['number'] }, '<=': { types: ['number'] }, '>': { types: ['number'] }, '>=': { types: ['number'] },
  '=': { types: ['number', 'choice', 'text'] }, '!=': { types: ['number', 'choice', 'text'] },
  in: { types: ['choice'], list: true }, not_in: { types: ['choice'], list: true },
  contains_any: { types: ['text'], list: true },
  is_true: { types: ['boolean'], noValue: true }, is_false: { types: ['boolean'], noValue: true },
  exists: { types: ['number', 'choice', 'text', 'boolean'], noValue: true },
  missing: { types: ['number', 'choice', 'text', 'boolean'], noValue: true },
};

function leaf(n, facts, missing) {
  const v = facts[n.fact];
  if (n.op === 'exists') return v !== undefined && v !== null && v !== '';
  if (n.op === 'missing') return v === undefined || v === null || v === '';
  if (v === undefined || v === null || v === '' || (typeof v === 'string' && v === 'MISSING' && !['=', '!=', 'in', 'not_in'].includes(n.op))) {
    missing.add(n.fact); return false;
  }
  switch (n.op) {
    case '<': return Number(v) < Number(n.value);
    case '<=': return Number(v) <= Number(n.value);
    case '>': return Number(v) > Number(n.value);
    case '>=': return Number(v) >= Number(n.value);
    case '=': return String(v) === String(n.value);
    case '!=': return String(v) !== String(n.value);
    case 'in': return (n.value || []).map(String).includes(String(v));
    case 'not_in': return !(n.value || []).map(String).includes(String(v));
    case 'contains_any': { const t = String(v).toLowerCase(); return (n.value || []).some(w => t.includes(String(w).toLowerCase())); }
    case 'is_true': return v === true;
    case 'is_false': return v === false;
    default: return false;
  }
}

function evaluate(node, facts) {
  const missing = new Set();
  const walk = n => {
    if (!n) return false;
    if (Array.isArray(n.all)) return n.all.every(walk);      // empty all = always true
    if (Array.isArray(n.any)) return n.any.some(walk);
    return leaf(n, facts, missing);
  };
  // evaluate every branch so all missing facts are reported (every/some short-circuit)
  const collect = n => { if (!n) return; if (n.all) n.all.forEach(collect); else if (n.any) n.any.forEach(collect); else leaf(n, facts, missing); };
  const result = walk(node);
  if (!result) collect(node);
  return { result, missing: [...missing] };
}

// Returns a list of problems (empty = valid). catalogue: from factCatalogue().
function validateCondition(node, catalogue, depth = 0) {
  const errs = [];
  if (!node || typeof node !== 'object') return ['Condition is empty'];
  if (depth > 3) return ['Conditions can be nested at most 3 levels'];
  const group = node.all || node.any;
  if (group) {
    if (!Array.isArray(group)) return ['Group must be a list'];
    group.forEach(c => errs.push(...validateCondition(c, catalogue, depth + 1)));
    return errs;
  }
  const fact = catalogue.find(f => f.key === node.fact);
  if (!fact) return [`Unknown data field "${node.fact}"`];
  const op = OPS[node.op];
  if (!op) return [`Unknown comparison "${node.op}"`];
  if (!op.types.includes(fact.type)) return [`"${node.op}" cannot be used with ${fact.label}`];
  if (op.noValue) return errs;
  if (op.list) {
    if (!Array.isArray(node.value) || !node.value.length) errs.push(`${fact.label}: give at least one value`);
  } else if (fact.type === 'number' && !Number.isFinite(Number(node.value))) errs.push(`${fact.label}: value must be a number`);
  else if (node.value === undefined || node.value === '') errs.push(`${fact.label}: value is required`);
  return errs;
}

module.exports = { evaluate, validateCondition, OPS };
