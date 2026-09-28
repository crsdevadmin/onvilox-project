import type { FieldOption, SectionDef } from '../../ui';

export type Sex = 'F' | 'M';

export interface FxSchema {
  female: SectionDef[]; male: SectionDef[]; phases: FieldOption[];
  labs: { code: string; label: string; unit: string }[];
}

export interface Lab {
  id: number; analyte: string; value: number; unit: string;
  ref_low: number | null; ref_high: number | null; collected_on: string; source: string | null;
}

export interface Partner {
  id: string; sex: Sex; name: string; age: number | null; phone: string | null; mrn: string | null;
  assessment: { version: number; data: Record<string, unknown>; missing: string[]; created_at: string; created_by_name: string | null } | null;
  labs: Lab[];
}

export interface PhaseEvent { id: number; phase: string; event_date: string; note: string | null; created_by_name: string | null }

export interface CaseSummary {
  id: string; phase: string; phase_date: string | null; status: string; updated_at: string;
  doctor_name: string | null; dietitian_name: string | null;
  partners: { id: string; sex: Sex; name: string; age: number | null; missing: string[] | null }[];
}

export interface CaseDetail extends Omit<CaseSummary, 'partners'> {
  doctor_id: string; dietitian_id: string | null; partners: Partner[]; events: PhaseEvent[];
}

export interface PartnerInput { name: string; age: string; phone: string; mrn: string }

export interface Finding {
  ruleId: string; kind: string; behaviour: string; message: string; trigger: string;
  evidence: string | null; sources: string | null; notes: string | null; status: string; version: number;
}
export interface EnginePartner {
  partnerId: string; sex: Sex; name: string; assessed: boolean; missingRequired: string[] | null;
  redFlags: number; findings: Finding[]; dataGaps: string[]; staleLabs: string[];
}
export interface EngineRun {
  id: number; created_at: string; engine: string; run_by_name?: string | null;
  output: { engineVersion: string; phase: string; pregnancyPending: boolean; formulaChangesStopped: boolean;
    draftRulesUsed: number; partners: EnginePartner[] };
}
