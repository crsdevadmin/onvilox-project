# GQUENCE Doctor — iOS & Android app

React Native (Expo SDK 58, Expo Router, TypeScript). Doctors only — assistants,
stores, coordinators and admins keep using the web dashboard. Talks to the same
server as the web app (`https://gquence.in`, set in `app.json → expo.extra.apiBaseUrl`).

## Run it on your phone
```bash
cd mobile
npm install
npx expo start
```
Install **Expo Go** on your phone and scan the QR code. Sign in with a DOCTOR account.

Checks: `npm run typecheck`. Note: `npx expo install` needs network access to
api.expo.dev; if it is blocked, take the version from
`node_modules/expo/bundledNativeModules.json` and use `npm install pkg@version`.

## Layout
- `src/app/login.tsx` — sign-in; non-doctor roles are refused
- `src/app/(app)/index.tsx` — Needs You This Week: Approve / Assessment due / Closures
- `src/app/(app)/patients.tsx` — My Patients with search
- `src/app/(app)/patient/[id].tsx` — patient summary
- `src/lib/api.ts` — API client (JWT in the phone's secure keychain)

## Build plan (one developer)
| Phase | Scope | Est. |
|---|---|---|
| 1 ✅ | Project, login, queue with approve, patient list, patient summary | done |
| 2 | Weekly + daily entry forms, completeness gate, edit half-finished week | 2–3 wks |
| 3 | Voice dictation (record → /api/dictate-weekly → confirm step) | 1–2 wks |
| 4 | New patient + full assessment + nutrition plan (port engine-config / nutrition-engine-v4) | 4–5 wks |
| 5 | Patient PDF (expo-print + share), QR share, closure/discharge/reopen, drafts | 2 wks |
| 6 | Native push notifications (Expo push → FCM/APNs) replacing web-push for doctors | 1–2 wks |
| 7 | QA on real devices, icons/splash, privacy policy, store listings, review | 2–3 wks |

Total from today: roughly **3–4 months** to both stores.

## Before store submission
- Apple Developer account in Fortel's name (needs D-U-N-S) and Google Play organisation account.
- Server: login tokens are issued without an expiry (`jwt.sign` in `server/index.js`) — add one for phones.
- Server: `GET /api/patients/:id` does not apply the doctor caseload scope that `GET /api/patients` does.
