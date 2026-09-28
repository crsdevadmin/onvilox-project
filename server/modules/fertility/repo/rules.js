// SQL for clinical rules, their history, and engine runs.
const COLS = ['area', 'pathway', 'applies_to', 'rule_type', 'kind', 'trigger_text', 'action_text', 'behaviour',
  'evidence_level', 'sources', 'notes', 'status', 'engine_mode', 'condition', 'phases',
  'ivf_decision', 'diet_decision', 'reviewer_comments', 'reviewed_by', 'reviewed_on'];
const JSON_COLS = ['condition', 'phases'];
const SELECT = `SELECT r.*, to_char(r.reviewed_on,'YYYY-MM-DD') AS reviewed_on, u.name AS updated_by_name
                  FROM fx_rules r LEFT JOIN users u ON u.id = r.updated_by`;
const val = (c, v) => (JSON_COLS.includes(c) ? (v === null || v === undefined ? (c === 'phases' ? '[]' : null) : JSON.stringify(v)) : v ?? null);

function rulesRepo(pool) {
  const all = async () => (await pool.query(`${SELECT} ORDER BY r.id`)).rows;
  const get = async id => (await pool.query(`${SELECT} WHERE r.id=$1`, [id])).rows[0] || null;

  async function snapshot(client, id, note, userId) {
    const r = (await client.query('SELECT * FROM fx_rules WHERE id=$1', [id])).rows[0];
    await client.query('INSERT INTO fx_rule_history (rule_id, version, snapshot, change_note, changed_by) VALUES ($1,$2,$3,$4,$5)',
      [id, r.version, JSON.stringify(r), note || null, userId]);
  }

  async function insert(rule, userId, note) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cols = ['id', ...COLS];
      const r = await client.query(
        `INSERT INTO fx_rules (${cols.join(',')}, updated_by) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')}, $${cols.length + 1})
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [rule.id, ...COLS.map(c => val(c, rule[c])), userId]);
      if (r.rowCount) await snapshot(client, rule.id, note, userId);
      await client.query('COMMIT');
      return r.rowCount > 0;
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  }

  // Optimistic concurrency: the caller sends the version it edited.
  async function update(id, patch, expectedVersion, userId, note) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sets = COLS.filter(c => c in patch);
      const args = sets.map(c => val(c, patch[c]));
      const r = await client.query(
        `UPDATE fx_rules SET ${sets.map((c, i) => `${c}=$${i + 1}`).join(', ')}${sets.length ? ',' : ''}
                version = version + 1, updated_by = $${sets.length + 1}, updated_at = NOW()
          WHERE id = $${sets.length + 2} AND version = $${sets.length + 3} RETURNING id`,
        [...args, userId, id, expectedVersion]);
      if (!r.rowCount) { await client.query('ROLLBACK'); return false; }
      await snapshot(client, id, note, userId);
      await client.query('COMMIT');
      return true;
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  }

  const history = async id => (await pool.query(
    `SELECT h.id, h.version, h.snapshot, h.change_note, h.changed_at, u.name AS changed_by_name
       FROM fx_rule_history h LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.rule_id=$1 ORDER BY h.version DESC`, [id])).rows;

  const saveRun = async (caseId, engine, output, userId) => (await pool.query(
    'INSERT INTO fx_engine_runs (case_id, engine, output, run_by) VALUES ($1,$2,$3,$4) RETURNING id, created_at',
    [caseId, engine, JSON.stringify(output), userId])).rows[0];

  const latestRun = async caseId => (await pool.query(
    `SELECT e.id, e.engine, e.output, e.created_at, u.name AS run_by_name FROM fx_engine_runs e
       LEFT JOIN users u ON u.id = e.run_by WHERE e.case_id=$1 ORDER BY e.created_at DESC LIMIT 1`, [caseId])).rows[0] || null;

  return { all, get, insert, update, history, saveRun, latestRun, COLS };
}

module.exports = { rulesRepo };
