# GQUENCE — Admin & Clinical Trials UX Audit and Roadmap
### Expert UI/UX review with prioritized recommendations

This document reviews the current admin experience against the real-world hierarchy you described — **many hospitals → many doctors → many patients**, and **stores with multiple doctors** — and lays out, in priority order, what to build to make it searchable, scalable, and friendly, including the right charts.

---

## 1. What the data model is today (the constraint)

| Entity | How it's stored | Issue |
|---|---|---|
| Hospital | A free-text `hospital_name` on each user; a `hospital` text field on stores | **Not a real entity.** "Apollo", "apollo", "Apollo Hospital" become three different hospitals. You can't reliably group, filter, or report by hospital. |
| Doctor | `users` row, role `DOCTOR` | Belongs to a hospital only by the typed name |
| Store | `stores` row (has its own `hospital` text) | Hospital link is also a typed string |
| Doctor ↔ Store | Mapping concept exists, patients carry `store_id` | Many-to-many isn't cleanly modeled/visible |
| Patient | `assigned_doctor_id`, `created_by_id`, `store_id` | Solid — linked by IDs |

**Implication:** every "filter by hospital / group by hospital / compare hospitals" feature depends on hospitals being a normalized entity. **Fixing this is the foundation** — almost every recommendation below gets easier and more reliable once it's done.

---

## 2. Top priorities (in order)

### Priority 1 — Make Hospital a real entity (foundation)
- Add a `hospitals` table (id, name, city, code). Give doctors and stores a `hospital_id` instead of (or alongside) the text name.
- In the "Create User" / "Create Store" forms, replace the free-text hospital field with a **searchable dropdown of existing hospitals + "Add new hospital."** This alone kills duplicate/typo hospitals.
- Backfill: map existing typed names to hospital records (a one-time cleanup with a review step).
- **Payoff:** reliable filtering, grouping, and per-site reporting everywhere.

### Priority 2 — A consistent, cascading filter bar on every list
Adopt one reusable filter pattern across Users, Tracking, Clinical Trials, and Stores:

`Hospital ▾   Doctor ▾   Store ▾   Status ▾   Date range   [Search box]`

- Filters **cascade**: choosing a hospital narrows the doctor and store dropdowns to that hospital.
- Show **result counts** ("Doctors (12)"), and a "Clear all" chip.
- Persist the user's last filter (you already use localStorage) so it survives navigation.

### Priority 3 — Global search
- One search box (top bar) that finds **patients (name / UHID / Study ID), doctors, and stores** and jumps straight to them.
- Keyboard-first (press `/` to focus). This is the single biggest day-to-day friction reducer as you scale past ~30 patients.

### Priority 4 — Hierarchy drill-down view
- A **master-detail / tree**: Hospitals → (expand) Doctors → (expand) Patients, with counts at each level ("Apollo · 4 doctors · 38 patients").
- Clicking any node filters the rest of the screen to it. Add **breadcrumbs** (Apollo › Dr. Suresh › Sekar).
- This is how a multi-site coordinator actually wants to navigate.

### Priority 5 — Tables that scale
Every list should have: **sortable columns, per-column filtering, pagination (or virtual scroll), sticky headers, CSV export, and clear empty/loading/error states.** At 9 patients a plain table is fine; at 300 it isn't. Build the pattern once, reuse it.

### Priority 6 — Charts & dashboards (see Section 4)

---

## 3. Information architecture & navigation

Your top nav is now 8 items and growing — it will overflow. Recommendation:

- Move to a **left sidebar** with grouped sections:
  - **Overview** (KPIs)
  - **People** → Hospitals, Doctors, Stores, Mappings, Users
  - **Patients** → Tracking, Search
  - **Clinical Trials** → Enrollment, Cohort, Outcomes, Formula, Export
  - **Engine** → Rules, Reports
- Keep the current top bar for global search + profile + theme toggle.
- Add a **landing dashboard** (cards: total hospitals / doctors / stores / patients / active trial patients) with quick links — an at-a-glance home.

---

## 4. Charts & graphs (what's genuinely useful)

Use a real charting library (Chart.js — same CDN you already use) for these. Keep them clickable (click a bar → filter the list).

**Cohort / enrolment**
- Enrollment trend over time (have it) — keep, add cumulative line overlay.
- **Enrollment by hospital** and **by doctor** (horizontal bar) — shows who's recruiting.
- **Status distribution** (donut: Enrolled / Active / Completed / Lost / Withdrawn) — instant pilot health.
- **Funnel**: Enrolled → Active → Completed → with drop-off — the CONSORT-style flow.

**Outcomes (the clinically interesting ones)**
- **Weight / Albumin / CRP over weeks** as line charts, with **cohort mean ± SD** band, and the ability to overlay one patient vs the cohort average.
- **Mean weight change from baseline** per hospital/doctor (compare sites).
- **Compliance / intake** trend (once daily-log aggregation is added).

**Operations**
- **Patients per doctor** and **per store** (bar) — workload balance.
- **Store throughput**: jobs by status over time (manufacturing pipeline health).
- **Turnaround time**: enrollment → dispatch (median days) — process efficiency.

Design rules for the charts: consistent palette tied to status colors, always a title + units, empty-state text, theme-aware (use your `--text` variables, not hardcoded colors), and a "download PNG/CSV" affordance.

---

## 5. Specific friendliness fixes (quick wins)

- **Status as colored badges** everywhere (you have this in Clinical Trials — extend to Tracking/Users).
- **Confirmation + reason capture** on destructive actions (delete doctor, withdraw patient) — and show impact ("This doctor has 12 patients; they'll be unassigned").
- **Inline validation** on forms (duplicate UHID, missing required fields) with helpful messages, not silent failures.
- **Loading skeletons** instead of blank tables; friendly empty states ("No patients yet — they appear here once approved").
- **Consistent date format** (dd/mm/yyyy) and timezone handling across the app.
- **Responsive**: tables should scroll horizontally on small screens (some already do); forms stack.
- **Accessibility**: sufficient contrast (the dark-mode issues we just fixed show why), focus states, keyboard navigation, ARIA labels on icon buttons.
- **Bulk actions**: select multiple patients → assign doctor / export subset.

---

## 6. Clinical-Trials-specific enhancements

- Add the **Hospital / Doctor / Store filter bar** to every trial dashboard, so a multi-site study can be sliced by site.
- **Per-site cohort comparison**: small-multiples or a grouped bar comparing enrollment, completion, and mean outcomes across hospitals — this is what makes a multi-hospital pilot publishable.
- **Single patient page** that combines Journey + Weekly Outcomes + Formula in one scroll (instead of separate tabs) — clinicians think per-patient.
- **Saved cohorts / segments** (e.g., "Apollo head-and-neck patients") for repeat analysis.
- Export already exists; add **"export current filtered view"** so what you see is what you get.

---

## 7. Suggested delivery order

1. **Hospitals as an entity** + dropdowns + backfill (unlocks everything)
2. **Reusable filter bar** (hospital/doctor/store/status/search) on Clinical Trials + Tracking + Users
3. **Global search** + **landing dashboard with KPIs**
4. **Charts**: status donut, enrollment-by-hospital/doctor, outcomes line charts with cohort mean
5. **Hierarchy drill-down** view
6. **Table upgrades** (sort/paginate/column filters) + **single patient page**
7. Polish pass (badges, validation, empty/loading states, accessibility, responsive)

Most of these reuse data you already have; only Priority 1 (hospitals) and the daily-log aggregation need new data work.

---

## 8. The one thing to do first

If you do nothing else this week: **normalize Hospital into a real entity with a searchable dropdown.** It's a small change that removes typo-duplicates and unlocks every "by hospital / by doctor / by store" filter, chart, and comparison in this document. Everything else is far easier afterward.

*End of audit — happy to turn any section into a build spec and implement it.*
