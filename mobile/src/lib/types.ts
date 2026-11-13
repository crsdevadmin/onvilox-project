export type Role = 'DOCTOR' | 'ASSISTANT' | 'ADMIN' | 'SUPER_ADMIN' | 'STORE' | 'COORDINATOR' | string;

export interface User {
  id: string;
  name: string;
  role: Role;
  hospital_name?: string | null;
  storeId?: string | null;
}

export interface LoginResponse {
  token: string;
  user: User;
  modules?: unknown;
  landing?: string | null;
}

export interface Patient {
  id: string;
  name: string;
  uhic?: string;
  age?: number | string;
  sex?: string;
  cancer?: string;
  cancerStage?: string;
  weight?: number | string;
  height?: number | string;
  status?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface QueueWarning {
  level: 'high' | 'watch';
  label: string;
  detail: string;
}

export interface PendingRx {
  id: number;
  weekNumber: number;
  status: string;
  batchCode?: string | null;
  createdAt?: string;
  reopenedAt?: string | null;
  missingFields: string[];
}

export interface QueuePatient {
  id: string;
  name: string;
  uhic: string | null;
  cancer: string | null;
  currentWeek: number;
  daysSinceWeekly: number | null;
  weeklyOverdue: boolean;
  neverMonitored: boolean;
  week1Due: boolean;
  dailyGap: number | null;
  pendingRx: PendingRx | null;
  supplyDaysLeft: number | null;
  warnings: QueueWarning[];
  askIfStillActive: boolean;
  closure: null | {
    reason: string;
    label: string;
    note?: string;
    closedBy?: string;
    closedByRole?: string;
    closedAt?: string;
    needsConfirmation: boolean;
  };
}

export interface WeeklyQueue {
  patients: QueuePatient[];
  closed: QueuePatient[];
  lostThresholdDays: number;
  generatedAt: string;
}
