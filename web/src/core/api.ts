// Tiny API client: adds the bearer token, turns errors into exceptions with
// the server's message, and sends an expired/missing session back to login.
import { getSession, logout } from './session';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const s = getSession();
  if (!s || !s.token) { logout(); throw new ApiError('Not signed in', 401); }
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) { logout(); throw new ApiError('Session expired', 401); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data.code);
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  post: <T>(url: string, body: unknown) => request<T>('POST', url, body),
};
