// SQL for weekly formulas and store orders.
const F_SELECT = `SELECT f.*, to_char(f.week_start,'YYYY-MM-DD') AS week_start, p.name AS partner_name, p.sex,
                   cu.name AS created_by_name, au.name AS approved_by_name,
                   o.id AS order_id, o.status AS order_status
                   FROM fx_formulas f JOIN fx_partners p ON p.id = f.partner_id
                   LEFT JOIN users cu ON cu.id = f.created_by LEFT JOIN users au ON au.id = f.approved_by
                   LEFT JOIN fx_orders o ON o.formula_id = f.id`;

function formulasRepo(pool) {
  const forCase = async caseId => (await pool.query(`${F_SELECT} WHERE f.case_id=$1 ORDER BY f.week_start DESC, f.id DESC`, [caseId])).rows;
  const get = async (caseId, id) => (await pool.query(`${F_SELECT} WHERE f.case_id=$1 AND f.id=$2`, [caseId, id])).rows[0] || null;

  const insert = async (caseId, partnerId, weekStart, phase, items, notes, checks, userId) => (await pool.query(
    `INSERT INTO fx_formulas (case_id, partner_id, week_start, phase, items, notes, checks, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [caseId, partnerId, weekStart, phase, JSON.stringify(items), notes, JSON.stringify(checks), userId])).rows[0].id;

  const updateDraft = async (id, weekStart, phase, items, notes, checks) => (await pool.query(
    `UPDATE fx_formulas SET week_start=$2, phase=$3, items=$4, notes=$5, checks=$6, updated_at=NOW()
      WHERE id=$1 AND status='DRAFT' RETURNING id`,
    [id, weekStart, phase, JSON.stringify(items), notes, JSON.stringify(checks)])).rowCount > 0;

  const reject = async (id, userId, note) => (await pool.query(
    `UPDATE fx_formulas SET status='REJECTED', approved_by=$2, approved_at=NOW(), decision_note=$3, updated_at=NOW()
      WHERE id=$1 AND status='DRAFT' RETURNING id`, [id, userId, note])).rowCount > 0;

  // Approve + supersede the previous approved formula for the same partner and week + create the order, atomically.
  async function approve(f, userId, note, checks, storeId, label) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const r = await c.query(`UPDATE fx_formulas SET status='APPROVED', approved_by=$2, approved_at=NOW(), decision_note=$3, checks=$4, updated_at=NOW()
                                WHERE id=$1 AND status='DRAFT' RETURNING id`, [f.id, userId, note, JSON.stringify(checks)]);
      if (!r.rowCount) { await c.query('ROLLBACK'); return null; }
      const old = await c.query(`UPDATE fx_formulas SET status='SUPERSEDED', updated_at=NOW()
                                  WHERE partner_id=$1 AND week_start=$2 AND status='APPROVED' AND id<>$3 RETURNING id`, [f.partner_id, f.week_start, f.id]);
      if (old.rowCount) await c.query(`UPDATE fx_orders SET status='CANCELLED', updated_at=NOW() WHERE formula_id = ANY($1) AND status IN ('NEW','IN_PRODUCTION')`, [old.rows.map(x => x.id)]);
      const o = await c.query(`INSERT INTO fx_orders (formula_id, case_id, partner_id, store_id, label, updated_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [f.id, f.case_id, f.partner_id, storeId, JSON.stringify(label), userId]);
      await c.query('COMMIT');
      return { orderId: o.rows[0].id, superseded: old.rowCount };
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }

  // The doctor's store, if that store serves the fertility module.
  async function storeForDoctor(doctorId) {
    const r = await pool.query(`SELECT u.store_id FROM users u JOIN store_modules sm ON sm.store_id = u.store_id
                                 WHERE u.id=$1 AND sm.module_code='fertility' AND sm.enabled`, [doctorId]);
    return r.rows[0] ? r.rows[0].store_id : null;
  }

  // ── orders ──
  const O_SELECT = `SELECT o.*, s.name AS store_name, u.name AS updated_by_name FROM fx_orders o
                      LEFT JOIN stores s ON s.id = o.store_id LEFT JOIN users u ON u.id = o.updated_by`;
  const orders = async storeId => (await pool.query(
    `${O_SELECT} WHERE ${storeId === undefined ? 'TRUE' : storeId === null ? 'o.store_id IS NULL' : 'o.store_id=$1'}
      ORDER BY (o.status IN ('DELIVERED','CANCELLED')), o.created_at DESC LIMIT 300`, storeId ? [storeId] : [])).rows;
  const order = async id => (await pool.query(`${O_SELECT} WHERE o.id=$1`, [id])).rows[0] || null;
  const setOrderStatus = async (id, from, to, userId) => (await pool.query(
    `UPDATE fx_orders SET status=$3, updated_by=$4, updated_at=NOW() WHERE id=$1 AND status=$2 RETURNING id`, [id, from, to, userId])).rowCount > 0;

  // Store staff of a store who hold a fertility store role (push on new orders).
  const storeStaff = async storeId => (await pool.query(
    `SELECT u.id FROM users u JOIN user_module_access a ON a.user_id = u.id
      WHERE u.store_id=$1 AND a.module_code='fertility' AND a.revoked_at IS NULL AND a.role IN ('STORE','STORE_APPROVER')`, [storeId])).rows.map(x => x.id);

  return { forCase, get, insert, updateDraft, reject, approve, storeForDoctor, orders, order, setOrderStatus, storeStaff };
}

module.exports = { formulasRepo };
