# Skull King Web (v2 bootstrap)

This is the Next.js app that will replace the current static app in a future migration.

## Scripts

```bash
npm run dev
npm run lint
npm run typecheck
npm run test:run
npm run test:e2e
npm run build
```

## Goal of this phase

- establish Next.js App Router foundation
- connect CI lint/typecheck/test/build gates
- prepare for progressive feature parity migration from the static app
- wire initial Supabase auth + cloud snapshot sync in setup flow

## Supabase environment (for local/dev)

Create `apps/web/.env.local` with:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-publishable-key>
```

If these variables are missing, cloud auth/sync controls stay disabled and the app continues in local-only mode.

## Playwright note

Before first local E2E run:

```bash
npx playwright install chromium
```
