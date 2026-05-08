# Rules

## Codebase
- TypeScript strict — no `any`, no `@ts-ignore` without justification.
- No runtime validators on the hot path (zod/yup at the edge only).
- Every function ships with unit tests on the first commit, not "later".

## UX
- Any screen of the app should be useful within ≤ 30 seconds.
- Don't use modals for primary actions — bottom sheets only.
- No harsh penalties for missed days — calm tone, encouragement.

## Privacy
- User data does not leave device-local storage until explicit opt-in.
- No third-party tracking (Sentry, Mixpanel, Hotjar, etc.) in the MVP.
