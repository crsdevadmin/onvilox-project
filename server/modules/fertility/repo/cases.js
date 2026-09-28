// SQL for fertility cases. No business rules here — see services/cases.js.
const crypto = require('crypto');
const newId = p => `${p}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

function casesRepo(pool) {
  // scope: { all } | { doctorId } | { dietitianId }
  async function list(scope) {
    const where = scope.all ? 'TRUE' : scope.doctorId ? 'c.doctor_id = $1' : 'c.dietitian_id = $1';
    const args = scope.all ? [] : [scope.doctorId || scope.dietitianId];
    const r = await pool.query(`
      SELECT c.*, to_char(c.phase_date,'YYYY-MM-DD') AS phase_date, d.name AS doctor_name, dt.name AS dietitian_name,
             COALESCE(json_agg(json_build_object(
               'id', p.id, 'sex', p.sex, 'name', p.name, 'age', p.age,
               'missing', (SELECT a.missing FROM fx_assessments a WHERE a.partner_id = p.id ORDER BY a.version DESC LIMIT 1)
             ) ORDER BY p.sex) FILTER (WHERE p.id IS NOT NULL), '[]') AS partners
        FROM fx_cases c
        LEFT JOIN fx_partners p ON p.case_id = c.id
        LEFT JOIN users d  ON d.id  = c.doctor_id
        LEFT JOIN users dt ON dt.id = c.dietitian_id
       WHERE ${where}
       GROUP BY c.id, d.name, dt.name
       ORDER BY c.updated_at DESC LIMIT 500`, args);
    return r.rows;
  }

  async function get(id) {
    const c = (await pool.query(`
      SELECT c.*, to_char(c.phase_date,'YYYY-MM-DD') AS phase_date, d.name AS doctor_name, dt.name AS dietitian_name FROM fx_cases c
        LEFT JOIN users d ON d.id = c.doctor_id LEFT JOIN users dt ON dt.id = c.dietitian_id
       WHERE c.id = $1`, [id])).rows[0];
    if (!c) return null;
    const partners = (await pool.query('SELECT * FROM fx_partners WHERE case_id=$1 ORDER BY sex', [id])).rows;
    for (const p of partners) {
      p.assessment = (await pool.query(
        `SELECT a.version, a.data, a.missing, a.created_at, u.name AS created_by_name
           FROM fx_assessments a LEFT JOIN users u ON u.id = a.created_by
          WHERE a.partner_id=$1 ORDER BY a.version DESC LIMIT 1`, [p.id])).rows[0] || null;
      p.labs = (await pool.query(
        `SELECT *, to_char(collected_on,'YYYY-MM-DD') AS collected_on, value::float8 AS value,
                ref_low::float8 AS ref_low, ref_high::float8 AS ref_high
           FROM fx_labs WHERE partner_id=$1 ORDER BY fx_labs.collected_on DESC, id DESC`, [p.id])).rows;
    }
    const events = (await pool.query(
      `SELECT e.*, to_char(e.event_date,'YYYY-MM-DD') AS event_date, u.name AS created_by_name FROM fx_phase_events e LEFT JOIN users u ON u.id = e.created_by
        WHERE e.case_id=$1 ORDER BY e.event_date DESC, e.id DESC`, [id])).rows;
    return { ...c, partners, events };
  }

  async function create({ doctorId, createdBy, partners, phase, phaseDate }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const id = newId('fxc');
      await client.query(
        'INSERT INTO fx_cases (id, doctor_id, phase, phase_date, created_by) VALUES ($1,$2,$3,$4,$5)',
        [id, doctorId, phase, phaseDate, createdBy]);
      for (const p of partners) {
        await client.query('INSERT INTO fx_partners (id, case_id, sex, name, age, phone, mrn) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [newId('fxp'), id, p.sex, p.name, p.age ?? null, p.phone || null, p.mrn || null]);
      }
      await client.query('INSERT INTO fx_phase_events (case_id, phase, event_date, note, created_by) VALUES ($1,$2,$3,$4,$5)',
        [id, phase, phaseDate, 'Case opened', createdBy]);
      await client.query('COMMIT');
      return id;
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  }

  async function addPartner(caseId, p) {
    await pool.query('INSERT INTO fx_partners (id, case_id, sex, name, age, phone, mrn) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [newId('fxp'), caseId, p.sex, p.name, p.age ?? null, p.phone || null, p.mrn || null]);
    await touch(caseId);
  }

  const partner = async (caseId, partnerId) =>
    (await pool.query('SELECT * FROM fx_partners WHERE id=$1 AND case_id=$2', [partnerId, caseId])).rows[0] || null;

  async function saveAssessment(partnerId, data, missing, userId) {
    const r = await pool.query(
      `INSERT INTO fx_assessments (partner_id, version, data, missing, created_by)
       SELECT $1, COALESCE(MAX(version),0)+1, $2, $3, $4 FROM fx_assessments WHERE partner_id=$1
       RETURNING version`, [partnerId, JSON.stringify(data), JSON.stringify(missing), userId]);
    return r.rows[0].version;
  }

  async function addLab(partnerId, l, userId) {
    await pool.query(`INSERT INTO fx_labs (partner_id, analyte, value, unit, ref_low, ref_high, collected_on, source, entered_by)
                      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [partnerId, l.analyte, l.value, l.unit, l.refLow, l.refHigh, l.collectedOn, l.source || null, userId]);
  }

  async function setPhase(caseId, phase, date, note, userId) {
    await pool.query(`UPDATE fx_cases SET phase=$2, phase_date=$3, status=$4, updated_at=NOW() WHERE id=$1`,
      [caseId, phase, date, phase === 'CLOSED' ? 'CLOSED' : 'ACTIVE']);
    await pool.query('INSERT INTO fx_phase_events (case_id, phase, event_date, note, created_by) VALUES ($1,$2,$3,$4,$5)',
      [caseId, phase, date, note || null, userId]);
  }

  async function setDietitian(caseId, dietitianId) {
    await pool.query('UPDATE fx_cases SET dietitian_id=$2, updated_at=NOW() WHERE id=$1', [caseId, dietitianId || null]);
  }

  const touch = caseId => pool.query('UPDATE fx_cases SET updated_at=NOW() WHERE id=$1', [caseId]);

  async function mappedDoctor(assistantId) {
    const r = await pool.query('SELECT doctor_id FROM doctor_assistant_map WHERE assistant_id=$1 AND doctor_id IS NOT NULL', [assistantId]);
    return r.rows[0] ? r.rows[0].doctor_id : null;
  }

  // Users holding a given role in the fertility module (for pickers).
  async function moduleUsers(role) {
    return (await pool.query(
      `SELECT u.id, u.name FROM user_module_access a JOIN users u ON u.id = a.user_id
        WHERE a.module_code='fertility' AND a.role=$1 AND a.revoked_at IS NULL ORDER BY u.name`, [role])).rows;
  }

  return { list, get, create, addPartner, partner, saveAssessment, addLab, setPhase, setDietitian, touch, mappedDoctor, moduleUsers };
}

module.exports = { casesRepo };
