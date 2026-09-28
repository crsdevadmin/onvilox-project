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
