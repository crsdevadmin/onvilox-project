// SQL for fertility store orders: listing, status, pricing, batch.
const SELECT = `SELECT o.*, to_char(o.mfg_date,'YYYY-MM-DD') AS mfg_date, to_char(o.exp_date,'YYYY-MM-DD') AS exp_date,
                  s.name AS store_name, s.fssai_number, s.address AS store_address, u.name AS updated_by_name, c.doctor_id
                  FROM fx_orders o JOIN fx_cases c ON c.id = o.case_id
                  LEFT JOIN stores s ON s.id = o.store_id LEFT JOIN users u ON u.id = o.updated_by`;

function ordersRepo(pool) {
  // storeId: undefined = all (admin), string = that store
  const list = async storeId => (await pool.query(
    `${SELECT} WHERE ${storeId === undefined ? 'TRUE' : 'o.store_id=$1'}
      ORDER BY (o.status IN ('DELIVERED','CANCELLED')), o.created_at DESC LIMIT 300`, storeId === undefined ? [] : [storeId])).rows;
  const forCase = async caseId => (await pool.query(`${SELECT} WHERE o.case_id=$1 ORDER BY o.created_at DESC`, [caseId])).rows;
  const get = async id => (await pool.query(`${SELECT} WHERE o.id=$1`, [id])).rows[0] || null;

  const setStatus = async (id, from, to, userId) => (await pool.query(
    `UPDATE fx_orders SET status=$3, updated_by=$4, updated_at=NOW() WHERE id=$1 AND status=$2 RETURNING id`, [id, from, to, userId])).rowCount > 0;

  // Guarded update of price fields: only when the price is still in `fromStatuses`.
  async function price(id, fromStatuses, fields, historyEntry, userId) {
    const keys = Object.keys(fields);
    const r = await pool.query(
      `UPDATE fx_orders SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(', ')},
              price_history = price_history || $${keys.length + 1}::jsonb, updated_by=$${keys.length + 2}, updated_at=NOW()
        WHERE id=$${keys.length + 3} AND price_status = ANY($${keys.length + 4}) AND status='NEW' RETURNING id`,
      [...keys.map(k => fields[k]), JSON.stringify([{ ...historyEntry, by: userId, at: new Date().toISOString() }]), userId, id, fromStatuses]);
    return r.rowCount > 0;
  }

  // Batch number per store, prefixed FB so it can never collide with Oncology's B-numbers.
  async function setBatch(id, storeId, mfgDate, expDate, userId) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['fx_batch_' + (storeId || '')]);
      const cur = (await c.query('SELECT batch_no FROM fx_orders WHERE id=$1 FOR UPDATE', [id])).rows[0];
      let batch = cur && cur.batch_no;
      if (!batch) {
        const n = (await c.query('SELECT COUNT(*)::int AS n FROM fx_orders WHERE store_id IS NOT DISTINCT FROM $1 AND batch_no IS NOT NULL', [storeId])).rows[0].n;
        batch = 'FB' + String(n + 1).padStart(5, '0');
      }
      await c.query('UPDATE fx_orders SET batch_no=$2, mfg_date=$3, exp_date=$4, updated_by=$5, updated_at=NOW() WHERE id=$1', [id, batch, mfgDate, expDate, userId]);
      await c.query('COMMIT');
      return batch;
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }

  async function defaultMarkup() {
    try {
      const r = await pool.query("SELECT value FROM engine_formulas WHERE id='platform_markup_pct'");
      const v = r.rows[0] && parseFloat(r.rows[0].value);
      return v >= 0 ? v : 40;
    } catch (e) { return 40; }
  }

  const adminIds = async () => (await pool.query("SELECT id FROM users WHERE role IN ('ADMIN','SUPER_ADMIN')")).rows.map(x => x.id);

  const storeStaff = async storeId => (storeId ? (await pool.query(
    `SELECT u.id FROM users u JOIN user_module_access a ON a.user_id = u.id
      WHERE u.store_id=$1 AND a.module_code='fertility' AND a.revoked_at IS NULL AND a.role IN ('STORE','STORE_APPROVER')`, [storeId])).rows.map(x => x.id) : []);

  return { list, forCase, get, setStatus, price, setBatch, defaultMarkup, adminIds, storeStaff };
}

module.exports = { ordersRepo };
