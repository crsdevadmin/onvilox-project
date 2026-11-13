import * as SecureStore from 'expo-secure-store';
import { API_BASE } from './config';
import type { LoginResponse, Patient, WeeklyQueue } from './types';

const TOKEN_KEY = 'gq_token';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export async function loadToken() {
  token = await SecureStore.getItemAsync(TOKEN_KEY);
  return token;
}
export async function saveToken(t: string | null) {
  token = t;
  if (t) await SecureStore.setItemAsync(TOKEN_KEY, t);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(API_BASE + path, { ...init, headers: { ...headers, ...(init.headers as object) } });
  } catch {
    throw new ApiError('No connection. Check your internet and try again.', 0);
  }

  let body: any = null;
  const text = await res.text();
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }

  // authenticateToken answers 401 (no token) or a bare "Forbidden" 403 (bad or
  // expired token). Other 403s carry a JSON reason and must not sign the doctor out.
  const sessionDead = res.status === 401 || (res.status === 403 && (body === 'Forbidden' || body === null));
  if (sessionDead && path !== '/api/auth/login') onUnauthorized?.();
  if (!res.ok) {
    const msg = (body && (body.message || body.error)) || `Request failed (${res.status})`;
    throw new ApiError(String(msg), res.status, body?.error);
  }
  return body as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  patients: () => request<Patient[]>('/api/patients'),
  patient: (id: string) => request<Patient>(`/api/patients/${encodeURIComponent(id)}`),
  weeklyQueue: () => request<WeeklyQueue>('/api/doctor/weekly-queue'),
  approveRx: (rxId: number) =>
    request<{ batchCode?: string }>(`/api/weekly-prescriptions/${rxId}/approve`, { method: 'POST' }),
};
