import { api } from '../../../core/api';

export interface Check { level: 'BLOCK' | 'WARN'; code: string; message: string; ingredientId?: string }
export interface FormulaLine { ingredientId: string; dose: number | null; reason?: string; name?: string; form?: string; unit?: string }
export interface Formula {
  id: number; case_id: string; partner_id: string; partner_name: string; sex: 'F' | 'M'; week_start: string; phase: string;
  status: 'DRAFT' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED'; items: FormulaLine[]; notes: string | null; checks: Check[];
  created_by_name: string | null; created_at: string; approved_by_name: string | null; approved_at: string | null;
  decision_note: string | null; order_id: number | null; order_status: string | null;
}
const base = '/api/fertility';
export const formulaApi = {
  list: (caseId: string) => api.get<Formula[]>(`${base}/cases/${caseId}/formulas`),
  save: (caseId: string, body: { formulaId?: number; partnerId: string; weekStart: string; items: FormulaLine[]; notes: string }) =>
    api.post<{ id: number; checks: Check[] }>(`${base}/cases/${caseId}/formulas`, body),
  approve: (caseId: string, id: number, acknowledgeWarnings: boolean, note: string) =>
    api.post<{ orderId: number; storeAssigned: boolean }>(`${base}/cases/${caseId}/formulas/${id}/approve`, { acknowledgeWarnings, note }),
  reject: (caseId: string, id: number, note: string) => api.post(`${base}/cases/${caseId}/formulas/${id}/reject`, { note }),
};
