#!/usr/bin/env node
/**
 * Read-only diagnostic for the doctor dashboard's "Awaiting your approval" tab.
 *
 * Answers: why does that tab show N entries, and what are they?
 *
 * The tab is NOT "weekly entries made this week". It lists every patient who has
 * at least one weekly_prescriptions row still sitting at status='PENDING_REVIEW',
 * with no age limit. This script shows exactly what is in that state and how old.
 *
 * Run from the server folder:   node check-approval-queue.js
 * This script only SELECTs. It never writes.
 */
require('dotenv').config();
const { Pool } = require('pg');

const connStr = (process.env.DATABASE_URL || '')
  .replace(/([?&])sslmode=[^&]*(&|$)/, (m, p1, p2) => (p1 === '?' && p2 === '&') ? '?' : (p2 === '&' ? p1 : ''));

const pool = new Pool({
  connectionString: connStr,
  ssl: { rejectUnauthorized: false }
});

const pad = (s, n) => String(s == null ? '' : s).padEnd(n).slice(0, n);
const padL = (s, n) => String(s == null ? '' : s).padStart(n).slice(0, n);

(async () => {
  try {
    // ── 1. Headline counts ────────────────────────────────────────────────
    const counts = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM patients)                                                AS patients,
        (SELECT COUNT(*) FROM monitoring_logs WHERE type='weekly')                     AS weekly_logs,
        (SELECT COUNT(*) FROM weekly_prescriptions)                                    AS rx_total,
        (SELECT COUNT(*) FROM weekly_prescriptions WHERE status='PENDING_REVIEW')      AS rx_pending,
        (SELECT COUNT(*) FROM weekly_prescriptions WHERE status='APPROVED')            AS rx_approved,
        (SELECT COUNT(DISTINCT patient_id) FROM weekly_prescriptions
           WHERE status='PENDING_REVIEW')                                              AS pats_pending
    `);
    const c = counts.rows[0];

    console.log('\n═══ APPROVAL QUEUE SNAPSHOT ═══');
    console.log('Patients in system:                  ' + c.patients);
    console.log('Weekly monitoring entries ever made:  ' + c.weekly_logs);
    console.log('');
    console.log('Weekly prescriptions (all):           ' + c.rx_total);
    console.log('  → status APPROVED:                  ' + c.rx_approved);
    console.log('  → status PENDING_REVIEW:            ' + c.rx_pending);
    console.log('');
    console.log('>> Patients shown in "Awaiting your approval": ' + c.pats_pending);
    console.log('   (the tab shows one row per PATIENT — the highest');
    console.log('    pending week — not one row per prescription)');

    // ── 2. Age of the pending backlog ─────────────────────────────────────
    const age = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')   AS last_7d,
        COUNT(*) FILTER (WHERE created_at <= NOW() - INTERVAL '7 days'
                           AND created_at > NOW() - INTERVAL '30 days')  AS d7_30,
        COUNT(*) FILTER (WHERE created_at <= NOW() - INTERVAL '30 days') AS older_30d,
        MIN(created_at)                                                  AS oldest
      FROM weekly_prescriptions WHERE status='PENDING_REVIEW'
    `);
    const a = age.rows[0];
    console.log('\n═══ HOW OLD IS THE PENDING BACKLOG? ═══');
    console.log('Created in last 7 days:               ' + a.last_7d);
    console.log('Created 7–30 days ago:                ' + a.d7_30);
    console.log('Created more than 30 days ago:        ' + a.older_30d);
    console.log('Oldest pending item:                  ' + (a.oldest ? new Date(a.oldest).toDateString() : '—'));
    if (Number(a.older_30d) > 0) {
      console.log('\n  ^ Anything here is stale backlog. These never expire on their own;');
      console.log('    they sit in the tab until someone explicitly approves them.');
    }

    // ── 3. Multiple pending weeks for the same patient ────────────────────
    const multi = await pool.query(`
      SELECT p.name, p.uhic, COUNT(*) AS pending_weeks,
             MIN(wp.week_number) AS from_wk, MAX(wp.week_number) AS to_wk
        FROM weekly_prescriptions wp
        JOIN patients p ON p.id = wp.patient_id
       WHERE wp.status='PENDING_REVIEW'
       GROUP BY p.name, p.uhic
      HAVING COUNT(*) > 1
       ORDER BY COUNT(*) DESC
       LIMIT 15
    `);
    console.log('\n═══ PATIENTS WITH MORE THAN ONE UNAPPROVED WEEK ═══');
    if (!multi.rowCount) {
      console.log('None — every pending patient has just one open week.');
    } else {
      console.log(pad('PATIENT', 26) + pad('UHIC', 14) + padL('WEEKS', 6) + '   RANGE');
      console.log('-'.repeat(66));
      multi.rows.forEach(r => {
        console.log(pad(r.name, 26) + pad(r.uhic, 14) + padL(r.pending_weeks, 6)
          + '   wk ' + r.from_wk + '–' + r.to_wk);
      });
      console.log('\n  ^ Each of these shows as ONE row in the tab (highest week only),');
      console.log('    but the earlier weeks are still unapproved underneath.');
    }

    // ── 4. Who created the pending items ──────────────────────────────────
    const byRole = await pool.query(`
      SELECT COALESCE(u.role,'(unknown)') AS role, COUNT(*) AS n
        FROM weekly_prescriptions wp
        LEFT JOIN users u ON u.id = wp.created_by
       WHERE wp.status='PENDING_REVIEW'
       GROUP BY u.role ORDER BY COUNT(*) DESC
    `);
    console.log('\n═══ WHO GENERATED THE PENDING ITEMS ═══');
    byRole.rows.forEach(r => console.log(pad(r.role, 20) + padL(r.n, 5)));
    console.log('\n  ^ Any role can save a weekly entry, and every weekly entry');
    console.log('    auto-generates a prescription that needs doctor approval.');

    // ── 5. Thin entries: weekly logs with almost nothing filled in ────────
    const thin = await pool.query(`
      SELECT p.name, p.uhic, wp.week_number, wp.created_at,
             (wp.clinical_params->>'weight')     AS weight,
             (wp.clinical_params->>'albumin')    AS albumin,
             (wp.clinical_params->>'crp')        AS crp,
             (wp.clinical_params->>'compliance') AS adherence,
             (wp.clinical_params->>'oralIntake') AS oral
        FROM weekly_prescriptions wp
        JOIN patients p ON p.id = wp.patient_id
       WHERE wp.status='PENDING_REVIEW'
         AND COALESCE(NULLIF(wp.clinical_params->>'weight',''), NULL) IS NULL
       ORDER BY wp.created_at DESC
       LIMIT 15
    `);
    console.log('\n═══ PENDING ITEMS WHERE NO WEIGHT WAS ENTERED ═══');
    if (!thin.rowCount) {
      console.log('None — every pending item had a weight recorded.');
    } else {
      console.log(pad('PATIENT', 24) + padL('WK', 4) + '  ' + pad('CREATED', 13)
        + pad('ALB', 7) + pad('CRP', 7) + pad('ADH', 7) + 'ORAL');
      console.log('-'.repeat(74));
      thin.rows.forEach(r => {
        console.log(pad(r.name, 24) + padL(r.week_number, 4) + '  '
          + pad(new Date(r.created_at).toISOString().slice(0, 10), 13)
          + pad(r.albumin || '—', 7) + pad(r.crp || '—', 7)
          + pad(r.adherence || '—', 7) + (r.oral || '—'));
      });
      console.log('\n  ^ These generated a full prescription using the patient\'s BASELINE');
      console.log('    weight, because the engine only refuses when no weight exists');
      console.log('    anywhere. A near-empty weekly entry still produces an approval item.');
    }

    // ── 6. The actual tab contents, per doctor ────────────────────────────
    const perDoc = await pool.query(`
      SELECT COALESCE(u.name, '(unassigned)') AS doctor, COUNT(DISTINCT wp.patient_id) AS pats
        FROM weekly_prescriptions wp
        JOIN patients p ON p.id = wp.patient_id
        LEFT JOIN users u ON u.id = p.assigned_doctor_id
       WHERE wp.status='PENDING_REVIEW'
       GROUP BY u.name ORDER BY COUNT(DISTINCT wp.patient_id) DESC
    `);
    console.log('\n═══ PENDING PATIENTS PER ASSIGNED DOCTOR ═══');
    console.log('(the tab only shows patients assigned to the logged-in doctor)');
    perDoc.rows.forEach(r => console.log(pad(r.doctor, 30) + padL(r.pats, 5)));

    console.log('\nDone. No data was modified.\n');
    await pool.end();
  } catch (e) {
    console.error('\nERROR:', e.message);
    console.error('\nIf this is a connection error, check that your IP is allowed in the');
    console.error('RDS security group, and that server/.env has the right DATABASE_URL.\n');
    process.exit(1);
  }
})();
