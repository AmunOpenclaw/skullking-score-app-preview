# Migration Blueprint v2 (Framework + Automated Testing + Managed Hosting)

Status: Draft
Owner: Mathéo + Amun
Last update: 2026-04-02

Detailed Next.js architecture: `docs/nextjs-architecture-v2.md`

## 1) Why this migration

Current app is fast to iterate, but v1 is still a single-page vanilla app with limited testability and deployment ergonomics.

v2 goals:
- move to a modern **frontend framework**
- add a proper **backend framework** layer (API/BFF)
- enforce **automated tests in CI** (no manual QA requirement)
- host on managed platforms (no GitHub Pages, no self-managed VPS)

---

## 2) Target architecture (recommended)

### Recommended stack (low-maintenance, reliable)
- **Frontend:** Next.js (React + TypeScript)
- **Backend/BFF:** Next.js Route Handlers (or Hono mounted in Next) with Zod validation
- **Database/Auth:** Supabase (Postgres + Auth + RLS)
- **Hosting:** Vercel (web + API routes) + Supabase managed cloud
- **CI/CD:** GitHub Actions (test/lint/typecheck/build gates)

Why this recommendation:
- minimal ops surface (no VPS)
- PR previews out of the box
- easy typed frontend/backend sharing in one repo
- keeps Supabase investment (schema + auth + RLS)

> Alternative if we want strict FE/BE separation later:
> React (Next.js) + NestJS/Fastify API on Railway/Render.

---

## 3) Repository structure (target)

```text
skullking/
  apps/
    web/                 # Next.js app (UI + route handlers)
  packages/
    domain/              # scoring rules, pure logic, shared types
    ui/                  # shared UI primitives (optional)
    config/              # eslint/tsconfig/test presets
  supabase/
    migrations/
  .github/workflows/
```

Key rule:
- scoring logic must live in `packages/domain` (pure/testable, no DOM)

---

## 4) Testing strategy (automated-only)

## 4.1 Test pyramid
1. **Unit tests** (fast, many)
   - scoring engine, round operations, player status transitions
   - tools: Vitest + coverage

2. **Component tests**
   - critical UI components + form behavior
   - tools: Testing Library + Vitest

3. **API integration tests**
   - route handlers validation + Supabase integration boundaries
   - tools: Vitest + mocked Supabase / test project

4. **E2E tests**
   - auth flow, create/edit/delete round, leave/return player, sync persistence
   - tools: Playwright (desktop + mobile viewport)

## 4.2 CI gates (required to merge)
- `lint` passes
- `typecheck` passes
- `unit + component` tests pass
- `e2e smoke` passes on preview deployment
- coverage thresholds (start pragmatic):
  - lines >= 80%
  - branches >= 70%

No manual QA gate in the default release process.

---

## 5) Environments and release flow

- **Preview**: every PR deploys automatically (Vercel preview URL)
- **Staging**: optional branch environment for release candidates
- **Production**: merge to `main` triggers production deploy

Supabase strategy:
- keep one production project
- use migration files as source of truth
- apply schema changes via CI workflow (manual approval step for prod)

---

## 6) Migration phases

## Phase 0 — Foundation
- [x] create Next.js app in `apps/web`
- [x] configure TypeScript strict mode + ESLint (Prettier deferred)
- [x] setup Vitest + Testing Library + Playwright
- [x] add CI workflow with required checks
- [x] start `packages/domain` with first extracted scoring module + unit tests

Exit criteria:
- CI green on a hello-world page + sample tests

## Phase 1 — Domain extraction
- move current scoring logic into `packages/domain`
- write unit tests for all scoring cases (0-bid, rascal, bonuses)

Exit criteria:
- domain fully tested and framework-agnostic

## Phase 2 — Feature parity UI
- [x] bootstrap setup/game/history route shells in `apps/web` and wire initial state samples to `packages/domain`
- [x] add first interactive parity slice (local setup + round entry + history mutations) backed by domain functions in `apps/web`
- [x] add initial Supabase wiring in `apps/web` (magic-link auth hooks + cloud snapshot sync for active game state)
- [x] add parity feature pack in `apps/web` (round edit in history, add/leave/return player controls, turn/grid entry mode, won-total warning)
- [x] add parity utility pack in `apps/web` (CSV/JSON export, share summary, setup player library local+cloud sync)
- rebuild current flows in Next.js UI
- wire Supabase auth/session + persistence
- keep behavior parity with v1 app

Exit criteria:
- e2e parity suite green

## Phase 3 — API/BFF hardening
- add route handlers for operations we don’t want directly from client later
- input validation with Zod
- rate-limiting + structured error responses

Exit criteria:
- integration tests + e2e green

## Phase 4 — Cutover
- switch production URL to framework app
- keep old static app accessible briefly as rollback fallback
- monitor errors and auth success rate for 1 week

Exit criteria:
- stable production metrics, rollback no longer needed

---

## 7) Risks and mitigations

- **Risk:** migration drift (behavior changes)
  - mitigation: lock parity tests before cutover

- **Risk:** auth redirect issues on previews
  - mitigation: preconfigure preview redirect URL patterns in Supabase

- **Risk:** over-engineering backend too early
  - mitigation: start with thin BFF, only move logic server-side when needed

---

## 8) First implementation slice (recommended next step)

Start with a small v2 bootstrap PR containing:
- `apps/web` Next.js scaffold
- `packages/domain` with one extracted scoring module + tests
- CI pipeline with lint/typecheck/unit

This gives immediate structure and test automation without rewriting the whole app at once.
