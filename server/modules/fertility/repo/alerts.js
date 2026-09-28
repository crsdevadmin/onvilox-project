// SQL for red-flag alerts and the case care team.
function alertsRepo(pool) {
  const open = async caseId => (await pool.query(
    `SELECT a.*, p.name AS partner_name, p.sex FROM fx_alerts a JOIN fx_partners p ON p.id = a.partner_id
      WHERE a.case_id=$1 AND a.ack_at IS NULL ORDER BY a.created_at DESC`, [caseId])).rows;

  const recent = async caseId => (await pool.query(
    `SELECT a.*, p.name AS partner_name, p.sex, u.name AS ack_by_name FROM fx_alerts a
       JOIN fx_partners p ON p.id = a.partner_id LEFT JOIN users u ON u.id = a.ack_by
      WHERE a.case_id=$1 ORDER BY a.created_at DESC LIMIT 50`, [caseId])).rows;

  const insert = (caseId, partnerId, ruleId, message, runId) => pool.query(
    'INSERT INTO fx_alerts (case_id, partner_id, rule_id, message, run_id) VALUES ($1,$2,$3,$4,$5)',
    [caseId, partnerId, ruleId, message, runId]);

  const ack = async (caseId, alertId, userId, note) => (await pool.query(
    `UPDATE fx_alerts SET ack_by=$3, ack_at=NOW(), ack_note=$4 WHERE id=$2 AND case_id=$1 AND ack_at IS NULL RETURNING id`,
    [caseId, alertId, userId, note || null])).rowCount > 0;

  // Treating doctor, the doctor's assistants, and the assigned dietitian.
  async function careTeam(caseId) {
    const r = await pool.query(
      `SELECT c.doctor_id AS id FROM fx_cases c WHERE c.id=$1
       UNION SELECT c.dietitian_id FROM fx_cases c WHERE c.id=$1 AND c.dietitian_id IS NOT NULL
       UNION SELECT m.assistant_id FROM fx_cases c JOIN doctor_assistant_map m ON m.doctor_id = c.doctor_id WHERE c.id=$1`, [caseId]);
    return r.rows.map(x => x.id).filter(Boolean);
  }

  return { open, recent, insert, ack, careTeam };
}

module.exports = { alertsRepo };
