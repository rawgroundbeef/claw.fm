---
phase: 07-schema-api
plan: 01
subsystem: database, api, types
tags: [d1, sqlite, zod, hono, typescript, schema-validation]

# Dependency graph
requires:
  - phase: v1.0 baseline
    provides: tracks table, API infrastructure, shared types package
provides:
  - D1 migration for artist_profiles table with case-insensitive username uniqueness
  - Zod validation schemas for username and profile updates
  - TypeScript types for ArtistProfile and API responses
  - Reserved username blocklist for system routes
  - Route stubs for profile, artist, username, and avatar endpoints
affects: [07-02, 07-03, 08, 09]

# Tech tracking
tech-stack:
  added: [zod@^3.24.0]
  patterns: [Zod schemas in shared package, COLLATE NOCASE for case-insensitive uniqueness, 501 stub pattern for incomplete routes]

key-files:
  created:
    - api/migrations/0003_artist-profiles.sql
    - api/src/routes/profile.ts
    - api/src/routes/artist.ts
    - api/src/routes/username.ts
    - api/src/routes/avatar.ts
  modified:
    - packages/shared/src/index.ts
    - packages/shared/package.json
    - api/src/index.ts

key-decisions:
  - "COLLATE NOCASE on both column definition and index for case-insensitive username uniqueness"
  - "Zod schemas in shared package for validation reuse across API and frontend"
  - "Reserved username blocklist includes all system route names"
  - "Username regex requires alphanumeric start/end, allows underscores in middle"

patterns-established:
  - "Zod schemas exported from @claw/shared for API contract validation"
  - "Route stubs return 501 Not Implemented before implementation"
  - "Profile types separate full record (ArtistProfile) from public view (ArtistPublicProfile)"

# Metrics
duration: 2min
completed: 2026-02-04
---

# Phase 7 Plan 01: Schema, Types, and Wiring Summary

**D1 artist_profiles table with case-insensitive usernames, Zod validation schemas, and 4 wired API route stubs**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-04T14:51:18Z
- **Completed:** 2026-02-04T14:53:28Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Created D1 migration 0003_artist-profiles.sql with COLLATE NOCASE for username uniqueness
- Added Zod to shared package with UsernameSchema and ProfileUpdateSchema
- Exported 8 profile-related TypeScript types and interfaces
- Created and wired 4 API route stubs (profile, artist, username, avatar)

## Task Commits

Each task was committed atomically:

1. **Task 1: D1 migration and shared types with Zod validation** - `cae5c32` (feat)
2. **Task 2: Wire new route stubs into API entry point** - `1eb4631` (feat)

**Plan metadata:** (pending - will be added after SUMMARY.md creation)

## Files Created/Modified

**Created:**
- `api/migrations/0003_artist-profiles.sql` - D1 migration for artist_profiles table with COLLATE NOCASE username
- `api/src/routes/profile.ts` - Stub for PUT /api/profile (profile creation)
- `api/src/routes/artist.ts` - Stub for GET /api/artist/:username and /api/artist/by-wallet/:wallet
- `api/src/routes/username.ts` - Stub for GET /api/username/:username/available
- `api/src/routes/avatar.ts` - Stub for POST /api/avatar (avatar upload)

**Modified:**
- `packages/shared/src/index.ts` - Added Zod schemas (UsernameSchema, ProfileUpdateSchema) and 8 profile types
- `packages/shared/package.json` - Added zod@^3.24.0 dependency
- `api/src/index.ts` - Wired 4 new route stubs

## Decisions Made

**1. COLLATE NOCASE on column definition**
- Applied COLLATE NOCASE to `username` column in CREATE TABLE, not just the index
- Ensures all queries against username use case-insensitive comparison by default
- Follows STATE.md decision from research phase

**2. Zod schemas in shared package**
- Placed validation schemas in @claw/shared for reuse by both API and frontend
- Enables consistent validation rules across client and server
- Frontend can validate before submission, API validates on receipt

**3. Reserved username blocklist**
- Comprehensive list includes all system routes (admin, api, artist, audio, etc.)
- Prevents username squatting on route names
- Enforced via Zod schema refinement

**4. Username validation regex**
- Pattern: `^[a-z0-9][a-z0-9_]*[a-z0-9]$`
- Must start and end with alphanumeric, allows underscores in middle
- Combined with min(3)/max(20) constraints
- Prevents usernames like `_test` or `test_` while allowing `test_user`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TypeScript compilation succeeded, all routes wired correctly.

## User Setup Required

**Database migration must be applied before deployment.**

Run migration to create artist_profiles table:
```bash
cd api
pnpm wrangler d1 migrations apply claw-fm --remote
```

Verification:
```bash
pnpm wrangler d1 execute claw-fm --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name='artist_profiles'"
```

Expected output: Table `artist_profiles` exists.

## Next Phase Readiness

**Ready for Plans 02 and 03:**
- Database schema exists (after migration applied)
- Shared types available for import
- Route stubs wired in index.ts (no file conflicts)
- Zod schemas ready for validation logic

**No blockers.**

Plans 02 and 03 can now implement:
- Profile creation/update logic (replaces stub in profile.ts)
- Artist lookup by username/wallet (replaces stubs in artist.ts)
- Username availability check (replaces stub in username.ts)
- Avatar upload with CF Images (replaces stub in avatar.ts)

---
*Phase: 07-schema-api*
*Completed: 2026-02-04*
