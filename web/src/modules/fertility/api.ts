import { api } from '../../core/api';
import type { FormValues } from '../../ui';
import type { ModuleAccess } from '../../core/types';
import type { Alert, CaseDetail, CaseSummary, EngineRun, FxSchema, PartnerInput, Sex } from './types';

const base = '/api/fertility';
let schemaCache: Promise<FxSchema> | null = null;

export const fertilityApi = {
  home: () => api.get<{ module: ModuleAccess; orders: unknown[] }>(`${base}/home`),
  schema: () => (schemaCache ??= api.get<FxSchema>(`${base}/schema`).catch(e => { schemaCache = null; throw e; })),
  cases: () => api.get<CaseSummary[]>(`${base}/cases`),
  get: (id: string) => api.get<CaseDetail>(`${base}/cases/${id}`),
  create: (body: { female?: PartnerInput; male?: PartnerInput; phase: string; phaseDate: string }) =>
    api.post<{ id: string }>(`${base}/cases`, body),
  addPartner: (id: string, sex: Sex, p: PartnerInput) => api.post(`${base}/cases/${id}/partners`, { sex, ...p }),
  saveAssessment: (id: string, pid: string, data: FormValues) =>
    api.put<{ version: number; missing: string[] }>(`${base}/cases/${id}/partners/${pid}/assessment`, { data }),
  addLab: (id: string, pid: string, lab: Record<string, string>) => api.post(`${base}/cases/${id}/partners/${pid}/labs`, lab),
  setPhase: (id: string, phase: string, date: string, note: string) => api.post(`${base}/cases/${id}/phase`, { phase, date, note }),
  addCheckin: (id: string, pid: string, date: string, data: FormValues) =>
    api.post<EngineRun>(`${base}/cases/${id}/partners/${pid}/checkins`, { date, data }),
  alerts: (id: string) => api.get<Alert[]>(`${base}/cases/${id}/alerts`),
  ackAlert: (id: string, aid: number, note: string) => api.post(`${base}/cases/${id}/alerts/${aid}/ack`, { note }),
  runEngine: (id: string) => api.post<EngineRun>(`${base}/cases/${id}/engine`, {}),
  latestRun: (id: string) => api.get<EngineRun | null>(`${base}/cases/${id}/engine`),
  dietitians: () => api.get<{ id: string; name: string }[]>(`${base}/dietitians`),
  setDietitian: (id: string, dietitianId: string | null) => api.put(`${base}/cases/${id}/dietitian`, { dietitianId }),
};
