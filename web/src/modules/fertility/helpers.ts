import type { FieldOption } from '../../ui';
import type { Lab } from './types';

export const today = () => new Date().toISOString().slice(0, 10);
export const sexLabel = (s: 'F' | 'M') => (s === 'F' ? 'Female partner' : 'Male partner');
export const phaseLabel = (phases: FieldOption[] | undefined, code: string) =>
  phases?.find(p => p.value === code)?.label || code;

export function bmi(heightCm: unknown, weightKg: unknown): number | null {
  const h = Number(heightCm), w = Number(weightKg);
  if (!h || !w) return null;
  return Math.round((w / Math.pow(h / 100, 2)) * 10) / 10;
}

/** Rule G-09 data handling: classify against the report's own range; flag results older than 90 days. */
export function labStatus(l: Lab): { label: string; tone: 'ok' | 'warn' | 'bad'; stale: boolean } {
  const stale = (Date.now() - Date.parse(l.collected_on)) / 86400000 > 90;
  if (l.ref_low !== null && l.value < l.ref_low) return { label: 'Below range', tone: 'bad', stale };
  if (l.ref_high !== null && l.value > l.ref_high) return { label: 'Above range', tone: 'warn', stale };
  return { label: 'In range', tone: 'ok', stale };
}

export const CAN_OPEN_CASE = ['DOCTOR', 'ASSISTANT', 'ADMIN', 'SUPER_ADMIN'];
export const CAN_EDIT = ['DOCTOR', 'ASSISTANT', 'DIETITIAN', 'ADMIN', 'SUPER_ADMIN'];
export const CAN_MANAGE = ['DOCTOR', 'ADMIN', 'SUPER_ADMIN'];
