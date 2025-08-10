This app is a Next.js (App Router) + SQLite + JWT framework with admin console, authentication, profile management, and email verification.

## Quickstart

1) Copy `.env.example` to `.env` (create if missing) and set:
- `JWT_SECRET` (required)
- Optional overrides: `DATABASE_PATH`, `UPLOAD_DIR`, `ACCESS_TOKEN_MINUTES`, `REFRESH_TOKEN_DAYS`
 - Optional SMTP timeouts: `SMTP_CONNECTION_TIMEOUT_MS`, `SMTP_GREETING_TIMEOUT_MS`, `SMTP_SOCKET_TIMEOUT_MS`

2) Install and run dev
```bash
npm install
npm run dev
```

On first run, the SQLite DB migrates automatically. In non‑production, demo users are created with password `Password123!`: `admin`, `power`, `user`.

## Scripts

- `npm run dev` – start Next.js in development
- `npm run build` – production build
- `npm start` – start production server
- `npm run lint` – run ESLint
- `npm test` – run unit tests (Vitest)
- `npm run test:watch` – watch tests (Windows-friendly)
- `npm run test-watch` – same as above, alternate alias
  
Coverage (optional):
```bash
npx vitest run --coverage
```

## Architecture

- API routes under `src/app/api/*`
- Core libs under `src/lib/*` (auth, db, http helpers, email, image processing, fs)
- UI under `src/components/*`

## Testing

We use Vitest for unit tests. Tests cover key flows:
- Auth token creation/verification (`src/lib/__tests__/auth.spec.ts`)
- Guarded access (`src/lib/__tests__/guard.spec.ts`)
- Auth login route (`src/app/api/__tests__/login.spec.ts`)
- Email verification (resend + GET) (`src/app/api/__tests__/verify.spec.ts`)
- Profile password change validation (`src/app/api/__tests__/profile.spec.ts`)

Run once:
```bash
npm test
```

Watch mode:
```bash
npm run test:watch
```

Notes:
- Tests use a separate SQLite file (`./data/test.db`).
- Environment defaults for tests are set in `vitest.setup.ts`.
- Path alias `@/*` is configured for tests in `vitest.config.ts`.
- Rate limiting tests: the verification resend test tolerates `RATE_LIMIT` during repeat runs in watch mode.

## Email (SMTP)

Configure email in the Admin Console (SMTP host, port, TLS/STARTTLS, auth, from). Use “Test Connection” and “Send Test Email”. When email verification is enabled, users must verify before login; unverified login offers a “Resend verification email” action.

Server-side timeouts can be tuned via env:
- `SMTP_CONNECTION_TIMEOUT_MS` (default 10000)
- `SMTP_GREETING_TIMEOUT_MS` (default 10000)
- `SMTP_SOCKET_TIMEOUT_MS` (default 15000)

## Admin Console

- User list with sortable headers
- Toggle registration and email verification
- Manage SMTP settings and send test email

## Deployment

Build and start:
```bash
npm run build
npm start
```

Ensure `DATABASE_PATH`, `UPLOAD_DIR`, and SMTP settings are writable and configured in production. Set a strong `JWT_SECRET`.

## Troubleshooting

- Windows: if Next.js build fails with a locked `.next\\trace`, stop Node processes then rebuild:
  ```powershell
  Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
  npm run build
  ```

- If login shows “Please verify your email to continue” for a demo/admin account after you’ve changed the email, make sure you clicked the verification link. Email-change verification now sets `email_verified_at` correctly.
