# GQUENCE — Clinical Trials Module
### Build Specification (v1.0)

**Purpose:** Turn GQUENCE from a production tool into a traceable clinical pilot platform, so that every patient, date, formula, and outcome is captured from day one and exportable for publication. This document is the build spec for the developer. **No code has been written yet** — this is for review and sign-off.

**Guiding principle from the clinical lead:** *"Every field entered in GQUENCE must be exportable to Excel."* The module is designed around that goal.

---

## 1. Summary

A new **Clinical Trials** section is added to the Admin tool. It does **not** duplicate data — it surfaces information already captured by GQUENCE (patients, manufacturing jobs, nutrition plans, monitoring logs) and adds a thin layer of trial-specific fields (Study ID, enrollment date, cohort target). Trial status is **fully automatic**, derived from existing workflow events.

**What's reused (already in the system):** UHID, name, diagnosis, enrolment date, report/approval/manufacturing/dispatch dates, weekly outcomes (weight, albumin, CRP, intake %, compliance %), formula version, batch number.

**What's new (small additions):** a `Study ID`, a per-patient trial record, a cohort target setting, and an Excel export.

---

## 2. How it fits the existing architecture

GQUENCE already follows a consistent pattern: static HTML admin pages + clean server routes + REST endpoints on the Node/Express server backed by PostgreSQL. The Clinical Trials module follows the same pattern exactly.

**New admin navigation** (added to `admin.html` and the other admin page headers, beside Stores / Users / Mapping / Tracking / Reports / Rule Engine):

```
Clinical Trials ▾
  ├─ Enrollment Log
  ├─ Patient Journey
  ├─ Cohort Dashboard
  ├─ Weekly Outcomes
  ├─ Formula Tracking
  └─ Export Dataset
```

**New pages** (same structure as existing admin pages, e.g. `admin-tracking.html`):

| Page | Clean route | File |
|---|---|---|
| Enrollment Log | `/admin/trials` | `admin-trials.html` |
| Patient Journey | `/admin/trials/journey` | `admin-trial-journey.html` |
| Cohort Dashboard | `/admin/trials/cohort` | `admin-trial-cohort.html` |
| Weekly Outcomes | `/admin/trials/outcomes` | `admin-trial-outcomes.html` |
| Formula Tracking | `/admin/trials/formula` | `admin-trial-formula.html` |
| Export Dataset | `/admin/trials/export` | `admin-trial-export.html` |

(These can also be implemented as a single page with tabs if preferred — the data model is identical either way.)

**Access control:** restrict to `ADMIN` / `SUPER_ADMIN` roles via the existing `auth.requireRole([...])` mechanism, consistent with other admin pages.

---

## 3. Data model

### 3.1 New table: `trial_enrollments`

One row per enrolled patient (1:1 with `patients`), following the same conventions as the existing `monitoring_logs` table (string `patient_id`, JSONB where useful). Only the values that **cannot** be derived from existing data are stored here.

```sql
CREATE TABLE IF NOT EXISTS trial_enrollments (
  patient_id        TEXT PRIMARY KEY,           -- 1:1 with patients.id
  study_id          TEXT UNIQUE NOT NULL,       -- e.g. GQ-001
  enrollment_date   DATE NOT NULL,              -- locked at enrolment (defaults to patient created date)
  cohort            TEXT DEFAULT 'PILOT-1',     -- supports multiple cohorts later
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trial_enrollments_study ON trial_enrollments(study_id);
```

> Note: `supplement_start_date`, `final_assessment_date`, and trial `status` are **derived** (Section 4–5), not stored, so they always reflect the true workflow state. If later you want to lock these as point-in-time values, they can be added to this table.

### 3.2 New table: `pilot_settings`

A single-row settings table for cohort configuration (target size, pilot duration).

```sql
CREATE TABLE IF NOT EXISTS pilot_settings (
  id              INT PRIMARY KEY DEFAULT 1,
  target_patients INT DEFAULT 30,
  pilot_weeks     INT DEFAULT 6,                -- number of weekly reviews that defines "completed"
  lost_threshold_days INT DEFAULT 14,           -- gap that flags Lost to Follow-up
  CHECK (id = 1)
);
```

### 3.3 Reused tables (no schema change)

| Data needed | Source table / field |
|---|---|
| UHID | `patients.uhic` |
| Patient name | `patients.name` |
| Diagnosis | `patients.cancer` |
| Doctor / Store | `patients.assigned_doctor_id`, `patients.store_id` |
| Report generation date | `nutrition_plans.generated_at` (latest version) |
| Formula version | `nutrition_plans.version` + `recipe` |
| HOD/Doctor approval date | manufacturing job `history[]` entry where `status = APPROVED` → `at` |
| Manufacturing date | manufacturing job `mfgDate` |
| Dispatch date | job `history[]` entry where `status = DISPATCH` (or equivalent) → `at` |
| Batch number | job `batchNo` |
| Weekly outcomes | `monitoring_logs` where `type = 'weekly'` → `data` (weight, albumin, crp, intake, compliance), `recorded_at` |
| Baseline assessment | earliest `monitoring_logs`/assessment, or patient `created_date` |

---

## 4. Study ID & key dates

**Study ID:** assigned automatically and permanently when a patient is first enrolled, in the format `GQ-001`, `GQ-002`, … (zero-padded, sequential per cohort). Generated server-side to avoid collisions. Once assigned it never changes.

**Enrollment Date:** set once, at enrolment, defaulting to the patient's `created_date`. Stored in `trial_enrollments.enrollment_date` so it is stable even if other records change.

**Derived dates (computed at read time from existing data):**

| Date | Derivation |
|---|---|
| Baseline Assessment Date | earliest assessment/monitoring record, else `created_date` |
| Report Generation Date | latest `nutrition_plans.generated_at` |
| HOD Approval Date | job history `APPROVED.at` |
| Manufacturing Date | job `mfgDate` |
| Supplement Dispatch Date | job history `DISPATCH.at` |
| Supplement Start Date | dispatch date (+ configurable offset), or the first weekly review date if earlier data is absent |
| Weekly Review Dates | all `monitoring_logs (type=weekly).recorded_at` |
| Final Assessment Date | the latest weekly review once `pilot_weeks` is reached |

---

## 5. Trial status — fully automatic (per your decision)

Status is **derived on every read** from workflow events; admins do not set it manually. Definitions:

| Status | Automatic rule |
|---|---|
| **Enrolled** | Patient has a trial record but the supplement has **not** been dispatched yet (job has not reached the dispatch stage and no weekly review exists). |
| **Active** | Supplement has been dispatched **or** at least one weekly review has been recorded, **and** the patient has not yet completed the pilot. |
| **Completed** | The number of weekly reviews recorded ≥ `pilot_weeks` (default 6). |
| **Lost to Follow-up** | Patient is otherwise Active but has **no** weekly review for more than `lost_threshold_days` (default 14) since the last expected review. |

### ⚠️ Important limitation to sign off on

**"Withdrawn" cannot be reliably derived automatically** — withdrawal is a human decision with no workflow signal, so a fully automatic system has no way to detect it. Three options:

1. **Recommended:** keep status automatic for the four states above, and add a **single manual flag** ("Mark as Withdrawn" with a reason) as the one exception. This keeps everything else automatic while still capturing withdrawals, which matter a lot for an intention-to-treat analysis.
2. Treat any patient marked inactive/deleted in the existing system as Withdrawn (requires a clear existing signal — currently there isn't a clean one).
3. Omit "Withdrawn" entirely (not advised — you will need it for publication accounting).

**Decision needed:** which option for "Withdrawn"? The spec assumes Option 1 unless you say otherwise.

---

## 6. Module specifications

### 6.1 Enrollment Log Dashboard
A sortable, filterable table — the master list of the pilot.

| Column | Source |
|---|---|
| Study ID | `trial_enrollments.study_id` |
| UHID | `patients.uhic` |
| Patient Name | `patients.name` |
| Diagnosis | `patients.cancer` |
| Enrolled Date | `trial_enrollments.enrollment_date` |
| Supplement Start Date | derived (Section 4) |
| Status | derived (Section 5), colour-coded badge |

Features: filter by status, search by name/UHID/Study ID, sort by date, row click → Patient Journey for that patient.

### 6.2 Patient Journey Tracking
A per-patient timeline showing all dates in Section 4 in order, with a visual progress strip (Enrolled → Baseline → Report → Approval → Manufacturing → Dispatch → Start → Weekly reviews → Final). Missing steps show as "pending." This is read-only and assembled entirely from existing data + the trial record.

### 6.3 Cohort Dashboard
Top-line pilot metrics and enrolment trend.

- **Pilot Status cards:** Target (`pilot_settings.target_patients`), Enrolled (count), Active (count), Completed (count), plus Lost to Follow-up and Withdrawn.
- **Enrollment Trend:** patients grouped by `enrollment_date` (by day and by week), shown as a small table and a bar chart (Chart.js, already permitted in the artifact stack). Running total included.

### 6.4 Weekly Outcome Dashboard
Per patient, week-by-week table pulled from `monitoring_logs (type=weekly)`:

| Week | Weight | Albumin | CRP | Intake % | Compliance % |
|---|---|---|---|---|---|

Plus a cohort view: average weight change, average compliance, etc., across all Active/Completed patients. Charts optional in phase 4.

### 6.5 Formula Tracking
Traceability of which formula/version each patient received:

| Study ID | Formula Version | Batch No | Start Date |
|---|---|---|---|

Source: `nutrition_plans.version` + `recipe` summary, job `batchNo`, derived start date. Supports future reformulations (Version 1 / Version 2) because version is already tracked per plan.

### 6.6 Publication Dataset Export
One button — **"Export Pilot Dataset"** — produces a multi-sheet Excel workbook (built client-side with SheetJS, already available, or via a server endpoint):

- **Sheet 1 — Enrollment:** Study ID, UHID, name, diagnosis, dates, status, formula version, batch.
- **Sheet 2 — Baseline:** baseline anthropometry/labs per patient.
- **Sheet 3 — Weekly:** one row per patient per week (long format, ideal for stats software).
- **Sheet 4 — Final outcomes:** last recorded values + change-from-baseline.

Long (tidy) format is used for the weekly sheet so the data drops straight into R/SPSS/Excel pivot tables.

---

## 7. Server endpoints to add

Following the existing `/api/...` + `authenticateToken` pattern:

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/trials/enroll/:patientId` | Create trial record, assign next Study ID (idempotent) |
| `GET` | `/api/trials` | Enrollment log: all trial records joined with derived status/dates |
| `GET` | `/api/trials/:patientId/journey` | All journey dates for one patient |
| `GET` | `/api/trials/cohort` | Cohort metrics + enrolment trend |
| `GET` | `/api/trials/outcomes` | Weekly outcomes (all or by patient) |
| `GET` | `/api/trials/export` | Aggregated dataset for the Excel export |
| `GET`/`PUT` | `/api/pilot-settings` | Read/update target size, pilot weeks, thresholds |
| `POST` | `/api/trials/:patientId/withdraw` | (Only if "Withdrawn" Option 1 is chosen) |

Auto-enrolment: when a patient is approved into production, automatically create their `trial_enrollments` row so nothing is missed. A one-time backfill script enrols your **existing 9 patients** using their `created_date` as enrollment date.

---

## 8. Phased delivery plan

| Phase | Deliverable | Why this order |
|---|---|---|
| **1** | `trial_enrollments` + `pilot_settings` tables, Study ID assignment, backfill of the 9 existing patients, **Enrollment Log** page + endpoints | Start capturing/displaying immediately; foundation for everything else |
| **2** | Patient Journey page (auto-pulls existing dates) | High value, mostly read-only over existing data |
| **3** | Cohort Dashboard + Enrollment Trend | Management visibility |
| **4** | Weekly Outcomes | Builds on monitoring data |
| **5** | Formula Tracking | Builds on plan versioning |
| **6** | Export Pilot Dataset (Excel) | Ties it all together for publication |

---

## 9. Decisions needed before build

1. **"Withdrawn" handling** — confirm Option 1 (automatic for the other four states + a single manual "Mark as Withdrawn" flag). *Recommended.*
2. **Pilot definition of "Completed"** — confirm `pilot_weeks = 6` (i.e., completing 6 weekly reviews = Completed), or specify the correct duration.
3. **Lost-to-follow-up threshold** — confirm 14 days without a weekly review.
4. **Study ID format** — confirm `GQ-001` (or specify, e.g., a site prefix like `GQ-CHN-001`).
5. **Pages vs tabs** — six separate admin pages, or one "Clinical Trials" page with internal tabs.
6. **Supplement Start Date** — define precisely (dispatch date, or dispatch + N days, or first weekly review).

---

## 10. Effort & risk notes

- ~70% of the required data already exists; the build is mostly UI + a thin data layer + export.
- No change to existing clinical logic, so low risk to current production workflows.
- The only genuinely new clinical concept is the trial status state-machine (Section 5), which is small and fully specified above.
- Doing Phase 1 now (before patient numbers grow) avoids the much harder job of reconstructing dates retrospectively — exactly as the clinical lead advised.

*End of specification v1.0 — awaiting sign-off on Section 9 before any code is written.*
