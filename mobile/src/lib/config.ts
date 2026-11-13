import Constants from 'expo-constants';

/** Same server the web app talks to (js/config.js → API_BASE_URL). */
export const API_BASE: string =
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ??
  'https://gquence.in';

/** Roles allowed into the doctor app. */
export const ALLOWED_ROLES = ['DOCTOR'] as const;
