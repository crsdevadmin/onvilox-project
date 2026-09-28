import { api } from '../../../core/api';
import { getSession } from '../../../core/session';
import type { Fact, Rule, RuleHistoryRow } from './types';

const base = '/api/fertility/rules';

export const rulesApi = {
  list: () => api.get<Rule[]>(base),
  facts: () => api.get<Fact[]>(`${base}/facts`),
  get: (id: string) => api.get<Rule & { history: RuleHistoryRow[] }>(`${base}/${encodeURIComponent(id)}`),
  create: (body: Partial<Rule> & { change_note?: string }) => api.post<{ id: string }>(base, body),
  update: (id: string, body: Partial<Rule> & { change_note: string }) => api.put<{ ok: true }>(`${base}/${encodeURIComponent(id)}`, body),
  async exportCsv() {
    const res = await fetch(`${base}/export.csv`, { headers: { Authorization: 'Bearer ' + (getSession()?.token || '') } });
    if (!res.ok) throw new Error('Export failed');
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: `fertility-rules-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
