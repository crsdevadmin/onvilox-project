# GQUENCE — Continuation brief (paste into a new chat)

You are continuing work on the GQUENCE clinical-nutrition web app in this connected folder. It's a static HTML frontend + Node/Express server (`server/index.js`) + PostgreSQL, deployed on AWS Elastic Beanstalk (`eb deploy`). Admin pages are `admin-*.html`; the Clinical Trials module is `admin-trial*.html`.

## Conventions to follow (match existing code)
- Admin pages: static HTML + `/js/config.js`, `/js/auth.js` etc.; gate with `auth.requireRole(['SUPER_ADMIN','ADMIN'])`; call APIs with `CONFIG.API_BASE_URL` + `Authorization: Bearer <me.token>`.
- Server: add routes in `server/index.js` with `authenticateToken`; add a clean URL in the `cleanRoutes` map.
- **Theme-aware colors only** (dark mode exists): use `var(--text)`, `var(--text-2)`, `var(--surface)`, `var(--surface-2)`, `var(--border)`. Never hardcode dark text like `#0f172a` on cards (it's invisible in dark mode).
- Charts are **dependency-free SVG/CSS** (no external chart lib). Export uses SheetJS from cdnjs.
- After changes, syntax-check JS with `node --check` (note: the build sandbox mount can show a STALE/truncated copy of files — verify edits via the editor's Read, and check logic in isolated snippets).
- Everything goes live only after `eb deploy`.

## Data model notes
- **Hospital is now a real entity**: `hospitals` table; `users.hospital_id` and `stores.hospital_id`; a backfill runs on startup; user/store create forms use a hospital combobox (`/api/hospitals` GET/POST, find-or-create by name).
- Clinical Trials tables: `trial_enrollments` (study_id, enrollment_date, withdrawn_at/reason), `pilot_settings` (target_patients=30, pilot_weeks=6, lost_threshold_days=14).
- Trial status is fully auto-derived (Enrolled/Active/Completed/Lost to Follow-up) + manual Withdrawn.
- Patient↔doctor via `assigned_doctor_id`, patient↔store via `store_id`; doctor carries `hospital_name`/`hospital_id`.

## DONE (deployed)
- Clinical Trials module: Enrollment Log, Patient Journey, Cohort Dashboard, Weekly Outcomes, Formula Tracking, Excel Export (`/api/trials`, `/api/trials/:id/journey`, `/api/trials/outcomes`, `/api/trials/formula`, `/api/trials/export`, `/api/pilot-settings`).
- Hospitals as a real entity + searchable dropdowns + backfill.
- Cascading filter bar (Hospital/Doctor/Store/Status/Search) on the Enrollment Log; Hospital+Doctor columns.
- Cohort charts: status donut, enrollment by hospital, by doctor.
- Outcome line charts (weight/albumin/CRP vs cohort mean) on Weekly Outcomes.
- Admin Overview KPIs: Total Hospitals + Clinical Trial Pilot (Enrolled/Active/Completed/Withdrawn).
- Global search (`/api/admin/search`) on the admin home.
- Clinical Trials link added to all admin page navs.
- Earlier fixes (already deployed): label per-serving values match the report, "Daily Batch Totals" protein breakdown (Formula+Glutamine), monitoring works for `pat_` patients, doctor-dashboard no longer re-runs/wipes AI insights, store table Date column, delete-doctor works (clears patient FKs), auto-update service worker + no-cache headers.

## TO DO (pick up here, roughly in priority order)
1. **Filter bar on the Tracking page** (`admin-tracking.html`) — same cascading Hospital/Doctor/Store/Status pattern as the Enrollment Log.
2. **Single combined patient page** — one view combining the patient's Journey + Weekly Outcomes + Formula (clinicians think per-patient). Could be a new `admin-trial-patient.html?patient=ID` reusing the existing endpoints.
3. **Filters on the other trial dashboards** (Cohort, Weekly Outcomes, Formula) so charts/tables can be sliced by hospital/doctor.
4. **Per-site cohort comparison** — compare enrollment, completion, and mean outcomes across hospitals (grouped bars / small multiples).
5. **Table upgrades** — sortable column headers, pagination, per-column filtering (build once, reuse on all list tables).
6. **Left-sidebar navigation** — replace the increasingly long top nav; group as People / Patients / Clinical Trials / Engine.
7. **Intake % / Compliance %** in Weekly Outcomes — aggregate the DAILY monitoring logs (oralIntake, suppConsumed/suppPrescribed) into weekly figures (these aren't in the weekly form).
8. Polish: status badges everywhere, inline form validation, loading skeletons/empty states, bulk actions, accessibility (contrast/focus/ARIA), responsiveness.
9. Optional: lock the `/api/trials*` and `/api/admin/*` endpoints to admin role at the server level (currently any authenticated token can call them).

Full rationale is in `GQUENCE_Admin_UX_Audit_and_Roadmap.md` and the Clinical Trials spec in `GQUENCE_Clinical_Trials_Module_Spec.md` (same folder).

Start by confirming which item to build, then implement + `node --check` + tell me to `eb deploy`.
