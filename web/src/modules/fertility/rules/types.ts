import type { FieldOption } from '../../../ui';

export type CondNode = { all: CondNode[] } | { any: CondNode[] } | Leaf;
export interface Leaf { fact: string; op: string; value?: number | string | string[] }

export interface Fact {
  key: string; label: string; type: 'number' | 'boolean' | 'choice' | 'text';
  unit?: string; options?: FieldOption[]; sex: 'F' | 'M' | 'B';
}

export interface Rule {
  id: string; area: string; pathway: string | null; applies_to: 'F' | 'M' | 'B'; rule_type: string; kind: string;
  trigger_text: string; action_text: string; behaviour: string; evidence_level: string | null; sources: string | null;
  notes: string | null; status: 'DRAFT' | 'APPROVED' | 'RETIRED'; engine_mode: 'CONDITION' | 'SYSTEM' | 'MANUAL';
  condition: CondNode | null; phases: string[];
  ivf_decision: string | null; diet_decision: string | null; reviewer_comments: string | null;
  reviewed_by: string | null; reviewed_on: string | null;
  version: number; updated_at: string; updated_by_name: string | null;
}

export interface RuleHistoryRow {
  id: number; version: number; change_note: string | null; changed_at: string; changed_by_name: string | null; snapshot: Rule;
}

export const KINDS = ['RED_FLAG', 'SAFETY_MODE', 'REFERRAL', 'PHENOTYPE', 'RECOMMENDATION', 'INGREDIENT', 'MONITORING', 'INFO'];
export const BEHAVIOURS = ['AUTO', 'FLAG', 'REVIEW', 'BLOCK'];
export const LEVELS = ['A', 'B', 'C', 'D', '—'];
export const DECISIONS = ['Approve', 'Change', 'Reject'];
export const MODES: Record<Rule['engine_mode'], string> = {
  CONDITION: 'Engine runs it (condition below)',
  SYSTEM: 'Enforced by the system (built in)',
  MANUAL: 'Manual — clinician applies it (data not captured yet)',
};
export const pretty = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
