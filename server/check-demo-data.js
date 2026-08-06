#!/usr/bin/env node
/**
 * Read-only demo readiness check.
 *
 * Answers one question: will the doctor dashboard's early-warning risk panel
 * actually light up, or will it show the empty "no patients flagged" card?
 *
 * The panel needs WEEKLY monitoring entries containing weight / albumin / CRP.
 * Patients with no monitoring logs are invisible to it by design.
 *
 * Run from the server folder:   node check-demo-data.js
 * This script only SELECTs. It never writes.
 */
require('dotenv').config();
const { Pool } = require('pg');

// Newer pg versions treat "?sslmode=require" as verify-full, which rejects the
// self-signed cert in Amazon RDS's chain. Strip the param so our explicit
// ssl option below (encrypted, but not verifying the CA) is what applies.
const connStr = (process.env.DATABASE_URL || '')
  .replace(/([?&])sslmode=[^&]*(&|$)/, (m, p1, p2) => (p1 === '?' && p2 === '&') ? '?' : (p2 === '&' ? p1 : ''));

const pool = new Pool({
  connectionString: connStr,
  ssl: { rejectUnauthorized: false }
});

const pad = (s, n) => String(s == null ? '' : s).padEnd(n).slice(0, n);
const num = v => (v === null || v === undefined || v === '' || isNaN(parseFloat(v))) ? null : parseFloat(v);

(async () => {
  try {
    const counts = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM patients)                                   AS patients,
        (SELECT COUNT(*) FROM monitoring_logs WHERE type='weekly')        AS weekly_logs,
        (SELECT COUNT(*) FROM monitoring_logs WHERE type='daily')         AS daily_logs,
        (SELECT COUNT(DISTINCT patient_id) FROM monitoring_logs WHERE type='weekly') AS pats_with_weekly,
        (SELECT COUNT(*) FROM manufacturing_jobs)                         AS jobs
    `);
    const c = counts.rows[0];

    console.log('\n═══ DATABASE SNAPSHOT ═══');
    console.log('Patients:                    ' + c.patients);
    console.log('Patients w/ weekly logs:     ' + c.pats_with_weekly);
    console.log('Weekly monitoring entries:   ' + c.weekly_logs);
    console.log('Daily monitoring entries:    ' + c.daily_logs);
    console.log('Manufacturing jobs:          ' + c.jobs);

    if (Number(c.pats_with_weekly) === 0) {
      console.log('\n⚠  NO weekly monitoring data exists.');
      console.log('   The risk panel will show the green "no patients flagged" card.');
      console.log('   To demo it, add weekly monitoring entries (weight/albumin/CRP)');
      console.log('   for at least one patient via Patient Profile → Monitoring.\n');
      await pool.end();
      return;
    }

    // Which patients could actually trigger a flag?
    const rows = await pool.query(`
      SELECT p.id, p.name, p.weight AS base_weight, p.albumin AS base_alb, p.crp AS base_crp,
             p.created_date,
             COUNT(m.id) AS n_weeks,
             MAX(m.recorded_at) AS last_entry
        FROM patients p
        JOIN monitoring_logs m ON m.patient_id = p.id AND m.type = 'weekly'
       GROUP BY p.id, p.name, p.weight, p.albumin, p.crp, p.created_date
       ORDER BY COUNT(m.id) DESC
       LIMIT 25
    `);

    console.log('\n═══ PATIENTS WITH WEEKLY DATA ═══');
    console.log(pad('Patient', 22) + pad('Weeks', 7) + pad('Baseline wt', 13) + pad('Last entry', 14) + 'Risk data?');
    console.log('─'.repeat(76));

    let demoReady = 0;
    for (const r of rows.rows) {
      const logs = await pool.query(
        `SELECT data, recorded_at FROM monitoring_logs
          WHERE patient_id=$1 AND type='weekly' ORDER BY recorded_at ASC`, [r.id]);
      const last = logs.rows.length ? (logs.rows[logs.rows.length - 1].data || {}) : {};
      const hasW = num(last.weight) != null;
      const hasA = num(last.albumin) != null;
      const hasC = num(last.crp) != null;

      // Would this patient trip a weight flag?
      let note = [];
      if (hasW && num(r.base_weight)) {
        const lossPct = (num(r.base_weight) - num(last.weight)) / num(r.base_weight) * 100;
        if (lossPct >= 2) note.push('weight -' + lossPct.toFixed(1) + '%');
      }
      if (hasA && num(last.albumin) < 3.0) note.push('alb ' + last.albumin);
      if (num(last.oralIntake) != null && num(last.oralIntake) < 50) note.push('intake ' + last.oralIntake + '%');
      if (num(last.compliance) != null && num(last.compliance) < 60) note.push('compl ' + last.compliance + '%');

      const daysSince = r.last_entry
        ? Math.floor((Date.now() - new Date(r.last_entry)) / 86400000) : null;
      if (daysSince != null && daysSince > 14) note.push(daysSince + 'd silent');

      const fields = [hasW ? 'wt' : null, hasA ? 'alb' : null, hasC ? 'crp' : null].filter(Boolean).join('/') || 'none';
      if (note.length) demoReady++;

      console.log(
        pad(r.name, 22) + pad(r.n_weeks, 7) +
        pad(r.base_weight != null ? r.base_weight + ' kg' : '—', 13) +
        pad(daysSince != null ? daysSince + 'd ago' : '—', 14) +
        fields + (note.length ? '  → WOULD FLAG: ' + note.join(', ') : '')
      );
    }

    console.log('\n═══ VERDICT ═══');
    if (demoReady > 0) {
      console.log('✓ ' + demoReady + ' patient(s) would appear in the risk panel. Demo will show live alerts.\n');
    } else {
      console.log('⚠  Weekly data exists, but no patient currently crosses a risk threshold.');
      console.log('   The panel will show the green "all clear" card — which is correct,');
      console.log('   but not a dramatic demo. Consider adding a monitoring entry showing');
      console.log('   weight loss (>2% below baseline) for one patient.\n');
    }

    await pool.end();
  } catch (e) {
    console.error('\nCould not read the database:', e.message);
    console.error('Check that server/.env has the right DATABASE_URL and your IP is');
    console.error('allowed in the RDS security group.\n');
    process.exit(1);
  }
})();
