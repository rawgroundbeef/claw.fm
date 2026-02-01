---
phase: 01-foundation
plan: 01
subsystem: infrastructure
tags: [monorepo, pnpm, hono, cloudflare-workers, d1, r2, typescript]

requires:
  - planning: .planning/PROJECT.md
  - planning: .planning/ROADMAP.md

provides:
  - monorepo: pnpm workspace root with api, web, packages/* structure
  - shared-types: @claw/shared package with Track, ApiResponse, HealthResponse interfaces
  - api-health: Hono API with /health endpoint
  - database: D1 tracks schema with indexes
  - storage: R2 bucket binding for audio files

affects:
  - phase: 02-submission
    reason: Depends on api workspace, D1 schema, R2 binding, and Track interface
  - phase: 03-queue
    reason: Depends on D1 tracks table and Track interface
  - phase: 04-player
    reason: Depends on api workspace and HealthResponse type

tech-stack:
  added:
    - pnpm@9.15.4: Workspace package manager
    - hono@4.7.4: Cloudflare Workers HTTP framework
    - wrangler@3.100.0: Cloudflare Workers CLI
    - typescript@5.7.2: Type checking
    - "@cloudflare/workers-types@4.20250117.0": Cloudflare Workers type definitions
  patterns:
    - monorepo: pnpm workspaces with workspace protocol for cross-package imports
    - type-safety: TypeScript strict mode with project references
    - cloudflare-stack: Workers + D1 + R2

key-files:
  created:
    - package.json: Monorepo root
    - pnpm-workspace.yaml: Workspace configuration
    - tsconfig.json: TypeScript root config with project references
    - .gitignore: Standard ignores for node_modules, dist, .wrangler, environment files
    - .npmrc: Enforce strict dependencies with shamefully-hoist=false
    - packages/shared/package.json: Shared types package
    - packages/shared/tsconfig.json: Shared types TypeScript config
    - packages/shared/src/index.ts: Track, ApiResponse, HealthResponse interfaces
    - api/package.json: API workspace dependencies and scripts
    - api/tsconfig.json: API TypeScript config with Cloudflare Workers types
    - api/wrangler.toml: Cloudflare Workers config with D1 and R2 bindings
    - api/src/index.ts: Hono app with /health endpoint
    - api/migrations/0001_tracks-schema.sql: D1 tracks table schema with indexes
    - pnpm-lock.yaml: Dependency lockfile
  modified:
    - .gitignore: Added *.tsbuildinfo to ignore TypeScript build info files

decisions: []

metrics:
  duration: 212s
  tasks-completed: 3/3
  commits: 3
  files-created: 14
  files-modified: 1
  lines-added: 1168
  completed: 2026-02-01
---

# Phase 1 Plan 1: Monorepo Scaffold & API Foundation Summary

**One-liner:** pnpm monorepo with Hono API on Cloudflare Workers, D1 tracks schema, R2 audio storage, and shared TypeScript types

## What Was Built

This plan established the foundational infrastructure for Claw FM:

1. **Monorepo Structure:**
   - pnpm workspace root linking api, web, and packages/* workspaces
   - TypeScript project references for IDE integration
   - Strict dependency management with shamefully-hoist=false

2. **Shared Types Package (@claw/shared):**
   - Track interface matching D1 schema (id, title, wallet, duration, fileUrl, createdAt, playCount, tipWeight)
   - ApiResponse generic wrapper for API responses
   - HealthResponse type for health endpoint

3. **Hono API Workspace:**
   - Cloudflare Workers API with Hono framework
   - /health endpoint returning status and timestamp
   - D1 database binding (DB) for tracks table
   - R2 bucket binding (AUDIO_BUCKET) for audio file storage
   - CORS middleware enabled for cross-origin requests

4. **D1 Database Schema:**
   - tracks table with 9 columns (id, title, wallet, duration, file_url, cover_url, created_at, play_count, tip_weight)
   - Three indexes for efficient queries:
     - idx_tracks_wallet: Query tracks by submitter wallet
     - idx_tracks_created_at: Age decay calculations for rotation
     - idx_tracks_tip_weight: Weighted random selection

## How It Was Built

### Task 1: Scaffold monorepo root and shared types package
**Commit:** dc8734f

Created the pnpm workspace root with:
- package.json defining the monorepo root
- pnpm-workspace.yaml declaring api, web, packages/* workspaces
- .npmrc enforcing strict dependency hoisting
- tsconfig.json with ES2022 target and project references
- .gitignore for node_modules, build artifacts, Cloudflare state, environment files

Created @claw/shared package with:
- Track interface (9 fields matching D1 schema)
- ApiResponse<T> generic wrapper
- HealthResponse type for /health endpoint
- TypeScript source consumed directly via workspace protocol (no build step)

### Task 2: Create Hono API workspace with health endpoint and D1/R2 bindings
**Commit:** 8d93a33

Created Cloudflare Workers API with:
- Hono framework for HTTP routing
- /health endpoint returning {status: 'ok', timestamp: number}
- Type-safe Bindings interface (DB: D1Database, AUDIO_BUCKET: R2Bucket)
- CORS middleware for cross-origin requests
- wrangler.toml config with D1 and R2 bindings
- workspace:* dependency on @claw/shared for type imports

Verified:
- wrangler dev starts successfully on port 8787
- curl /health returns JSON with status and timestamp
- TypeScript compilation passes (workspace imports work)

**Deviation:** Added TypeScript as devDependency (Rule 3 - Blocking). TypeScript was missing from api/package.json, causing `tsc --noEmit` to fail. Added typescript@5.7.2 to enable type checking verification.

### Task 3: Create D1 tracks schema migration and apply locally
**Commit:** b7a8394

Created D1 migration with:
- tracks table schema (9 columns with NOT NULL constraints and defaults)
- Three indexes for wallet queries, age decay, and weighted selection
- Applied migration locally with `wrangler d1 migrations apply DB --local`

Verified:
- PRAGMA table_info(tracks) shows all 9 columns with correct types
- sqlite_master shows idx_tracks_wallet, idx_tracks_created_at, idx_tracks_tip_weight

**Deviation:** Added *.tsbuildinfo to .gitignore (Rule 3 - Blocking). TypeScript composite mode generates .tsbuildinfo files that should not be committed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added TypeScript dev dependency**
- **Found during:** Task 2 verification
- **Issue:** api/package.json was missing TypeScript as a devDependency, causing `pnpm exec tsc --noEmit` to fail with "Command 'tsc' not found"
- **Fix:** Added "typescript": "^5.7.2" to api/package.json devDependencies
- **Files modified:** api/package.json, pnpm-lock.yaml
- **Commit:** 8d93a33 (included in Task 2 commit)
- **Justification:** Blocking - cannot verify TypeScript compilation without tsc command

**2. [Rule 3 - Blocking] Added *.tsbuildinfo to .gitignore**
- **Found during:** Task 3 commit staging
- **Issue:** TypeScript composite mode generates .tsbuildinfo files (api/tsconfig.tsbuildinfo) that pollute git status
- **Fix:** Added *.tsbuildinfo pattern to .gitignore under "Build output" section
- **Files modified:** .gitignore
- **Commit:** b7a8394 (included in Task 3 commit)
- **Justification:** Blocking - standard practice to ignore TypeScript build artifacts

## Verification Results

All verification criteria passed:

✅ `pnpm install` at root succeeds with no errors (106 packages installed in 6.8s)
✅ `cd api && pnpm exec wrangler dev --local` starts Hono API on port 8787
✅ `curl http://localhost:8787/health` returns `{"status":"ok","timestamp":1769960603166}`
✅ `cd api && pnpm exec tsc --noEmit` passes (confirms @claw/shared import works)
✅ D1 migration applied locally with correct tracks table schema
✅ D1 tracks table has 9 columns (id, title, wallet, duration, file_url, cover_url, created_at, play_count, tip_weight)
✅ D1 tracks table has 3 indexes (idx_tracks_wallet, idx_tracks_created_at, idx_tracks_tip_weight)

All success criteria met:

✅ Monorepo root configured with pnpm workspaces (api, web, packages/*)
✅ @claw/shared package exports Track, ApiResponse, HealthResponse types
✅ Hono API serves /health endpoint via wrangler dev
✅ D1 tracks table schema matches Track interface fields
✅ R2 bucket binding declared in wrangler.toml
✅ All TypeScript compiles without errors

## Key Files Reference

### Core Infrastructure
- **package.json** - Monorepo root (claw-fm, private, pnpm@9.15.4)
- **pnpm-workspace.yaml** - Workspace configuration (api, web, packages/*)
- **tsconfig.json** - TypeScript root config (ES2022, strict, project references)
- **.gitignore** - Standard ignores (node_modules, dist, .wrangler, .env, *.tsbuildinfo)
- **.npmrc** - Strict dependency hoisting (shamefully-hoist=false)

### Shared Types Package
- **packages/shared/package.json** - @claw/shared (main: src/index.ts)
- **packages/shared/tsconfig.json** - TypeScript config (extends root)
- **packages/shared/src/index.ts** - Exports Track, ApiResponse, HealthResponse

### API Workspace
- **api/package.json** - Dependencies (hono@4.7.4, @claw/shared@workspace:*, wrangler@3.100.0, typescript@5.7.2)
- **api/tsconfig.json** - TypeScript config (Cloudflare Workers types)
- **api/wrangler.toml** - Cloudflare config (DB binding, AUDIO_BUCKET binding)
- **api/src/index.ts** - Hono app (/health endpoint, CORS, type-safe Bindings)
- **api/migrations/0001_tracks-schema.sql** - D1 tracks schema (9 columns, 3 indexes)

## Next Phase Readiness

**Phase 02-submission can begin immediately.**

All prerequisites delivered:
- ✅ Monorepo workspace structure established
- ✅ Track interface defined in @claw/shared
- ✅ API workspace ready for new endpoints
- ✅ D1 tracks table schema created with required columns and indexes
- ✅ R2 AUDIO_BUCKET binding declared in wrangler.toml
- ✅ TypeScript compilation working for cross-package imports
- ✅ Health endpoint confirms API is running

**No blockers for Phase 2.**

**Concerns carried forward:**
- [Research] R2 CORS for Web Audio API crossOrigin needs testing in Phase 4 (player implementation)
- [Research] music-metadata CF Workers compatibility is MEDIUM confidence - need fallback MP3/WAV header parser ready for Phase 2

**Notes for Phase 2:**
- wrangler version 3.100.0 is outdated (warns about 4.61.1 available) - consider upgrading if compatibility issues arise
- database_id = "local" in wrangler.toml is a placeholder - real database will need `wrangler d1 create claw-fm` during deployment setup
- D1 migrations are applied locally with --local flag; production deployment will need --remote flag with real database_id
