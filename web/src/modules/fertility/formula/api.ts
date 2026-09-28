import { api } from '../../../core/api';

export interface Check { level: 'BLOCK' | 'WARN'; code: string; message: string; ingredientId?: string }
export interface FormulaLine { ingredientId: string; dose: number | null; reason?: string; name?: string; form?: string; unit?: string }
export interface Formula {
  id: number; case_id: string; partner_id: string; partner_name: string; sex: 'F' | 'M'; week_start: string; phase: string;
  status: 'DRAFT' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED'; items: FormulaLine[]; notes: string | null; checks: Check[];
  created_by_name: string | null; created_at: string; approved_by_name: string | null; approved_at: string | null;
  decision_note: string | null; order_id: number | null; order_status: string | null;
}
export interface Order {
  id: number; formula_id: number; case_id: string; status: string; store_id: string | null; store_name: string | null;
  created_at: string; updated_at: string; updated_by_name: string | null;
  label: { partnerName: string; sex: 'F' | 'M'; age: number | null; mrn: string | null; weekStart: string; phase: string; phaseLabel: string;
    doctor: string | null; pregnancyPending: boolean; items: { name: string; form: string | null; dose: number; unit: string }[]; warnings: string[] };
}

const base = '/api/fertility';
export const formulaApi = {
  list: (caseId: string) => api.get<Formula[]>(`${base}/cases/${caseId}/formulas`),
  save: (caseId: string, body: { formulaId?: number; partnerId: string; weekStart: string; items: FormulaLine[]; notes: string }) =>
    api.post<{ id: number; checks: Check[] }>(`${base}/cases/${caseId}/formulas`, body),
  approve: (caseId: string, id: number, acknowledgeWarnings: boolean, note: string) =>
    api.post<{ orderId: number; storeAssigned: boolean }>(`${base}/cases/${caseId}/formulas/${id}/approve`, { acknowledgeWarnings, note }),
  reject: (caseId: string, id: number, note: string) => api.post(`${base}/cases/${caseId}/formulas/${id}/reject`, { note }),
  orders: () => api.get<Order[]>(`${base}/orders`),
  setOrderStatus: (id: number, status: string) => api.post(`${base}/orders/${id}/status`, { status }),
};
