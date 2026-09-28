// SQL for the ingredient master and its history.
const { INGREDIENT_FIELDS } = require('../ingredients/fields');
const COLS = [...INGREDIENT_FIELDS.map(f => f.key), 'status'];
const SELECT = `SELECT i.*, to_char(i.last_review,'YYYY-MM-DD') AS last_review,
                  i.max_preconception::float8 AS max_preconception, i.max_stimulation::float8 AS max_stimulation,
                  i.max_pregnancy::float8 AS max_pregnancy, i.upper_limit::float8 AS upper_limit, u.name AS updated_by_name
                  FROM fx_ingredients i LEFT JOIN users u ON u.id = i.updated_by`;

function ingredientsRepo(pool) {
  const all = async () => (await pool.query(`${SELECT} ORDER BY i.id`)).rows;
  const get = async id => (await pool.query(`${SELECT} WHERE i.id=$1`, [id])).rows[0] || null;
  const many = async ids => (await pool.query(`${SELECT} WHERE i.id = ANY($1)`, [ids])).rows;

  async function snap(client, id, note, userId) {
    const r = (await client.query('SELECT * FROM fx_ingredients WHERE id=$1', [id])).rows[0];
    await client.query('INSERT INTO fx_ingredient_history (ingredient_id, version, snapshot, change_note, changed_by) VALUES ($1,$2,$3,$4,$5)',
      [id, r.version, JSON.stringify(r), note || null, userId]);
  }

  async function tx(fn) {
    const c = await pool.connect();
    try { await c.query('BEGIN'); const out = await fn(c); await c.query('COMMIT'); return out; }
    catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }

  const insert = (ing, userId, note) => tx(async c => {
    const cols = ['id', ...COLS.filter(k => ing[k] !== undefined)];
    const r = await c.query(`INSERT INTO fx_ingredients (${cols.join(',')}, updated_by) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')}, $${cols.length + 1})
                             ON CONFLICT (id) DO NOTHING RETURNING id`, [...cols.map(k => ing[k] ?? null), userId]);
    if (r.rowCount) await snap(c, ing.id, note, userId);
    return r.rowCount > 0;
  });

  const update = (id, patch, version, userId, note) => tx(async c => {
    const sets = COLS.filter(k => k in patch);
    const r = await c.query(
      `UPDATE fx_ingredients SET ${sets.map((k, i) => `${k}=$${i + 1}`).join(', ')}${sets.length ? ',' : ''}
         version=version+1, updated_by=$${sets.length + 1}, updated_at=NOW() WHERE id=$${sets.length + 2} AND version=$${sets.length + 3} RETURNING id`,
      [...sets.map(k => patch[k] ?? null), userId, id, version]);
    if (r.rowCount) await snap(c, id, note, userId);
    return r.rowCount > 0;
  });

  const history = async id => (await pool.query(
    `SELECT h.id, h.version, h.change_note, h.changed_at, u.name AS changed_by_name FROM fx_ingredient_history h
       LEFT JOIN users u ON u.id = h.changed_by WHERE h.ingredient_id=$1 ORDER BY h.version DESC`, [id])).rows;

  return { all, get, many, insert, update, history };
}

module.exports = { ingredientsRepo };
