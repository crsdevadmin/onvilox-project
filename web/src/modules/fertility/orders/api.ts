import { api } from '../../../core/api';

/** Price fields depend on who is asking (server-side priceView). */
export interface Price {
  price_status: 'AWAITING_STORE' | 'AWAITING_ADMIN' | 'AWAITING_DOCTOR' | 'APPROVED';
  final_price: number | null; price_note: string | null;
  store_price?: number | null; markup_pct?: number | null; base_price?: number | null; doctor_amount?: number | null;
}
export interface OrderLabel {
  partnerName: string; sex: 'F' | 'M'; age: number | null; mrn: string | null; weekStart: string; phase: string; phaseLabel: string;
  doctor: string | null; pregnancyPending: boolean; items: { name: string; form: string | null; dose: number; unit: string }[]; warnings: string[];
}
export interface Order {
  id: number; formula_id: number; case_id: string; status: string; store_id: string | null; store_name: string | null;
  created_at: string; updated_at: string; updated_by_name: string | null; batch_no: string | null; mfg_date: string | null; exp_date: string | null;
  label: OrderLabel; price: Price; default_markup_pct?: number;
}
export interface PrintLabel extends OrderLabel {
  orderId: number; mrp: number; batchNo: string; mfgDate: string; expDate: string;
  store: { name: string | null; fssai: string | null; address: string | null };
}

const base = '/api/fertility';
export const ordersApi = {
  list: () => api.get<Order[]>(`${base}/orders`),
  forCase: (caseId: string) => api.get<Order[]>(`${base}/cases/${caseId}/orders`),
  setStatus: (id: number, status: string) => api.post(`${base}/orders/${id}/status`, { status }),
  storePrice: (id: number, price: number) => api.post(`${base}/orders/${id}/store-price`, { price }),
  markup: (id: number, markupPct: number) => api.post(`${base}/orders/${id}/markup`, { markupPct }),
  doctorPrice: (id: number, finalPrice: number) => api.post(`${base}/orders/${id}/doctor-price`, { finalPrice }),
  sendBack: (id: number, note: string) => api.post(`${base}/orders/${id}/send-back`, { note }),
  batch: (id: number, mfgDate: string) => api.post<{ batchNo: string }>(`${base}/orders/${id}/batch`, { mfgDate }),
  label: (id: number) => api.get<PrintLabel>(`${base}/orders/${id}/label`),
};

export const rupees = (n: number | null | undefined) => (n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN'));
export const PRICE_STEP: Record<Price['price_status'], string> = {
  AWAITING_STORE: 'Waiting for store price', AWAITING_ADMIN: 'Waiting for admin markup',
  AWAITING_DOCTOR: 'Waiting for doctor approval', APPROVED: 'Price approved',
};
