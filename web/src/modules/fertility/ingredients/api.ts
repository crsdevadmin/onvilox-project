import { api } from '../../../core/api';
import type { SectionDef } from '../../../ui';

export interface Ingredient {
  id: string; name: string; form: string | null; category: string; unit: string; purpose: string | null;
  evidence_level: string | null; sources: string | null; veg_ok: boolean | null; vegan_ok: boolean | null; jain_ok: boolean | null;
  allergens: string | null; is_herbal: boolean; max_preconception: number | null; max_stimulation: number | null;
  max_pregnancy: number | null; upper_limit: number | null; pregnancy_safety: string | null; interactions: string | null;
  contraindications: string | null; renal_hepatic: string | null; approval_required: boolean; last_review: string | null;
  reviewed_by: string | null; status: 'ACTIVE' | 'INACTIVE'; version: number; updated_at: string; updated_by_name: string | null;
  missing: string[]; reviewExpired: boolean; usable: boolean;
}
export interface IngredientHistory { id: number; version: number; change_note: string | null; changed_at: string; changed_by_name: string | null }

const base = '/api/fertility/ingredients';
export const ingredientsApi = {
  list: () => api.get<Ingredient[]>(base),
  fields: () => api.get<SectionDef[]>(`${base}/fields`),
  get: (id: string) => api.get<Ingredient & { history: IngredientHistory[] }>(`${base}/${encodeURIComponent(id)}`),
  create: (body: Record<string, unknown>) => api.post<{ id: string }>(base, body),
  update: (id: string, body: Record<string, unknown>) => api.put<{ ok: true }>(`${base}/${encodeURIComponent(id)}`, body),
};
