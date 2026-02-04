# Project Research Summary

**Project:** claw.fm v1.1 Artist Profiles
**Domain:** Artist identity system for AI-agent 24/7 music radio
**Researched:** 2026-02-03
**Confidence:** HIGH

## Executive Summary

Artist profiles are a clean addition to the existing claw.fm architecture. The wallet address already serves as the identity anchor (`tracks.wallet`), R2 already stores user-uploaded media with prefix-based organization, and the x402 payment middleware already provides authentication-via-payment -- the same mechanism that gates track submission will gate profile creation. The total new dependency footprint is minimal: one npm package for client-side routing and one Cloudflare binding configuration for avatar image processing. No new services, no new auth systems, no new databases.

The recommended approach is a three-phase build: (1) database schema + API endpoints + shared types, (2) data flow enrichment connecting profiles to the now-playing/queue pipeline, and (3) frontend routing + profile page UI. This ordering respects dependencies -- everything downstream needs the API first -- and allows agents to start creating profiles via API before the profile pages even exist in the frontend. The architecture is additive: every existing endpoint and UI component continues to work unchanged for artists without profiles, with profile data appearing as progressive enrichment via LEFT JOINs.

The three critical risks are: the router integration killing audio playback during navigation (mitigate by lifting audio state above the router), the dual-write problem where x402 payment settles but the D1 write fails (mitigate by validating everything before settling), and avatar upload security (mitigate by strict JPEG/PNG/WebP-only validation with the existing `file-type` magic-byte checking). All three have clear, well-documented prevention strategies that align with patterns already proven in the v1.0 codebase.

## Key Findings

### Recommended Stack Additions

The existing stack (CF Workers + Hono, D1, R2, KV, Durable Objects, React 19 + Vite, Wagmi v2, OnchainKit, Tailwind) is fully reused. Two additions are needed:

**Core technologies:**
- **`react-router` (^7.12.0):** Client-side routing for `/artist/:username` profile pages. The app currently has zero routes; this adds the minimal infrastructure for two routes (`/` and `/artist/:username`). Declarative mode keeps the Vite build pipeline untouched.
- **Cloudflare Images Binding:** Server-side avatar resizing to 256x256 WebP before R2 storage. Native to Workers, no WASM bundle, free tier of 5,000 transformations/month (sufficient at this scale). Strips EXIF metadata automatically.

**Researcher disagreement resolved -- Client-side router:** STACK.md recommends React Router v7; ARCHITECTURE.md recommends wouter (2KB vs 19KB). **Decision: Use React Router v7.** While wouter is lighter, React Router is the ecosystem standard, has broader community knowledge, and provides a safer upgrade path if the app grows beyond 2-3 routes. The 17KB difference is negligible against the existing 1MB+ bundle. The declarative mode (not framework mode) keeps it lightweight.

**Researcher disagreement resolved -- Image resizing:** STACK.md recommends CF Images Binding for upload-time resize; ARCHITECTURE.md recommends no resizing (CSS-only). **Decision: Use CF Images Binding.** The cost is zero (free tier), it strips EXIF automatically (addressing PITFALLS CP-4b), it normalizes all avatars to a consistent 256x256 WebP (addressing PITFALLS MP-6 avatar sizing inconsistency), and it avoids serving oversized uploads to mobile clients. The binding is GA, works in local dev, and requires only a 2-line wrangler.toml addition. There is no downside.

**What NOT to add:** No form libraries, no state management (zustand), no image cropping UI, no separate R2 bucket, no JWT/session auth, no schema validation libraries (Zod), no new KV namespace. See STACK.md "What NOT to Add" for full rationale.

### Expected Features

**Must have (table stakes):**
- T1: Display name shown in player UI instead of truncated wallet address
- T2: Artist name in player links to `/artist/:username` profile page
- T3: Profile page displays artist's track catalog (newest first)
- T4: Username system with uniqueness, validation, and URL-safe format
- T5: Display name separate from username (username is URL-safe; display name is expressive)
- T6: Avatar image upload to R2 with identicon fallback
- T7: Bio/description field (~280 chars)
- T8: Profile creation via API with x402 payment (agent-friendly, programmatic)
- T9: Profile update via API with x402 payment
- T10: Graceful fallback for tracks without profiles (show truncated wallet)

**Should have (differentiators):**
- D1: x402-gated profile creation as anti-squatting mechanism (payment = auth = rate limiter)
- D2: Mutable usernames with paid change (more forgiving than permanent handles)
- D3: Agent-as-artist transparency (wallet address visible on profile, AI-native positioning)
- D4: Programmatic-only profile management (no web forms, no OAuth)
- D5: Wallet as permanent identifier (usernames change, wallet is immutable anchor)
- D6: Retroactive attribution (creating a profile updates display for ALL previous tracks)

**Anti-features (do NOT build):**
- Follower/following system, verification badges, profile analytics dashboard, social links, cover photo/banner, profile comments, multiple wallets per profile, profile deletion, image cropping tool, browse/search all artists page

**Defer to v1.2+:**
- Tip/Buy buttons on profile page track list
- Old username redirect (301 from renamed usernames)
- Open Graph / SEO meta tags for profile sharing
- Artist stats API endpoint
- Browse/search all artists page

### Architecture Approach

Profiles integrate into the existing architecture through eight well-defined integration points: D1 schema (new `artists` table with wallet as PK), R2 storage (same bucket, `avatars/` prefix), API routes (two new Hono route files following existing patterns), frontend routing (React Router wrapping existing App with persistent player bar), now-playing/queue API enrichment (LEFT JOIN artists table), cache invalidation (reuse existing `invalidateNowPlaying` helper), migration strategy (additive-only, zero downtime), and x402 gating (identical pattern to track submission).

**Major components:**
1. **`artists` D1 table** (migration 0003) -- wallet as PK, username with UNIQUE COLLATE NOCASE, no foreign keys to tracks table
2. **`PUT /api/profile` route** (x402-gated) -- upsert profile + avatar upload + KV invalidation
3. **`GET /api/artist/:username` route** (public) -- profile data + track catalog
4. **Now-playing/queue LEFT JOIN** -- enriches existing responses with `artistUsername` and `artistAvatarUrl`
5. **Frontend router + ArtistProfile page** -- React Router with audio state lifted above routes

**Researcher disagreement resolved -- Denormalization strategy:** ARCHITECTURE.md recommends write-through denormalization (UPDATE all `tracks.artist_name` on profile change). PITFALLS.md (MP-2) warns against this and recommends JOIN-only. **Decision: Hybrid approach.** Use LEFT JOIN with COALESCE for all display queries (`COALESCE(a.display_name, t.artist_name, t.wallet)`). Continue writing `artist_name` to tracks at submission time as a snapshot. Do NOT batch-update tracks on profile rename. This eliminates the partial-update risk while keeping the snapshot for historical reference. The JOIN is on a PK lookup and runs only on cache misses (~10-20 times/hour), so performance is not a concern.

**Researcher disagreement resolved -- SPA fallback:** STACK.md and ARCHITECTURE.md both confirm that CF Pages already serves `index.html` for unmatched paths when no `404.html` exists (which is the case). PITFALLS.md recommends adding a `_redirects` file. **Decision: No `_redirects` file needed.** The default behavior is correct and verified. Add a catch-all `<Route path="*">` in React Router for a friendly 404 component instead.

### Critical Pitfalls (Top 5, Ranked by Impact)

1. **CP-5: Router kills audio playback** -- Adding routing unmounts audio components, stopping the radio (the core product). **Prevention:** Lift AudioContext and crossfade state ABOVE the router. Player bar renders in a Layout component outside `<Routes>`. Test explicitly: navigate to profile, music continues. Navigate back, music still playing. This is the #1 acceptance test for the milestone.

2. **CP-1: Payment succeeds but profile write fails** -- x402 `settle()` is irreversible; if D1 write fails after, the agent paid for nothing. **Prevention:** Validate everything (username availability, format, avatar) BEFORE calling `settle()`. Use D1 `batch()` for atomic multi-statement writes. Log payment hash immediately for reconciliation.

3. **CP-3: SVG XSS via avatar uploads** -- SVG files contain executable JavaScript. **Prevention:** Strict JPEG/PNG/WebP-only allowlist (already enforced in existing `image.ts`). Validate magic bytes, not file extensions. Set `X-Content-Type-Options: nosniff` on R2-served content.

4. **CP-2: Username race condition** -- Two agents claim the same username simultaneously. **Prevention:** Never check-then-insert. Use `INSERT ... ON CONFLICT(username) DO NOTHING` and check `meta.changes === 0`. Handle UNIQUE constraint errors defensively as 409 Conflict.

5. **CP-4: Image bombs exhaust Worker memory** -- A small file can decompress to enormous pixel dimensions. **Prevention:** CF Images Binding handles this natively (it processes images in Cloudflare's infrastructure, not in Worker memory). Additionally, enforce a 2MB file size limit on upload.

### Additional Pitfall Notes

- **Username validation:** Use ASCII-only (`/^[a-z0-9][a-z0-9_-]*[a-z0-9]$/`), 3-20 chars, with a comprehensive reserved word blocklist covering existing routes and system terms. Apply NFKC normalization before validation to prevent Unicode bypass.
- **Username squatting:** PITFALLS.md suggests requiring at least one track before profile creation. This is a good anti-squatting measure but adds friction for legitimate agents. **Recommendation:** Defer to v1.2 if squatting becomes a real problem. The 0.01 USDC cost provides baseline deterrence for v1.1.
- **Profile update partial fields:** Use COALESCE-based UPDATE to avoid clearing optional fields (bio, avatar) when they are absent from the request body.
- **Identicon vs avatar:** Track cover art (`cover_url`) and artist avatar (`avatar_url`) are separate concepts. UI must distinguish them -- avatar appears in player attribution, cover art appears as album art.

## Implications for Roadmap

Based on combined research, the milestone divides naturally into three phases with clear dependency ordering.

### Phase 1: Schema + Shared Types + API Endpoints
**Rationale:** Everything downstream depends on the database and API existing first. Agents can start creating profiles via API before any frontend work begins.
**Delivers:** Working `artists` table, profile CRUD API (x402-gated), avatar upload to R2 with CF Images Binding resize, username validation, shared types for `ArtistProfile` and updated `NowPlayingTrack`.
**Features addressed:** T4 (username system), T5 (display name), T6 (avatar upload), T7 (bio), T8 (profile creation API), T9 (profile update API), D1 (x402 anti-squatting), D2 (mutable usernames), D4 (programmatic management)
**Pitfalls to avoid:** CP-1 (validate before settle), CP-2 (INSERT ON CONFLICT), CP-3 (SVG rejection), CP-4 (image bomb protection via Images Binding), CP-6 (reserved word blocklist), MP-1 (ASCII-only usernames), MP-4 (no foreign keys)
**Complexity:** Medium. Most patterns are direct reuse from v1.0 (x402 middleware, R2 upload, D1 migrations, Hono routes).

### Phase 2: Data Flow Enrichment
**Rationale:** Connects profiles to the existing now-playing/queue pipeline. The highest-visibility change -- every listener sees artist display names instead of wallet addresses, even before profile pages exist.
**Delivers:** LEFT JOIN enrichment on now-playing and queue endpoints, KV cache invalidation on profile updates, `artist_name` snapshot on track submission, retroactive attribution via COALESCE.
**Features addressed:** T1 (display name in player), T10 (graceful fallback), D5 (wallet as permanent ID), D6 (retroactive attribution)
**Pitfalls to avoid:** MP-2 (JOIN instead of denormalization for display), MP-3 (JOIN is on PK, cached by KV -- negligible performance impact)
**Complexity:** Low. Four SQL queries need LEFT JOIN additions. One KV.delete call added to profile route.

### Phase 3: Frontend Routing + Profile Pages
**Rationale:** Consumes everything built in Phases 1-2. The profile page is the destination for artist name clicks. Audio continuity across navigation is the critical architectural challenge.
**Delivers:** React Router integration with persistent player bar, `ArtistProfile` page component (`/artist/:username`), clickable artist names in player UI, avatar display with identicon fallback, 404 handling for non-existent profiles.
**Features addressed:** T2 (artist name links to profile), T3 (profile page with track catalog), D3 (agent transparency -- wallet visible on profile)
**Pitfalls to avoid:** CP-5 (audio above router -- the #1 regression risk), MP-5 (SPA deep link routing -- verified to work by default)
**Complexity:** Medium. Refactoring App.tsx into Layout + RadioView + ArtistProfile requires careful state lifting.

### Phase Ordering Rationale

- **Phase 1 before Phase 2:** The API must exist before queries can JOIN against the artists table. Shared types must be defined before either API or frontend can consume them.
- **Phase 2 before Phase 3:** Enriched API responses (with `artistUsername` and `artistAvatarUrl`) must exist before the frontend can render profile links and avatars. The frontend should consume finished API contracts, not build against placeholders.
- **Avatar upload in Phase 1, not Phase 3:** FEATURES.md suggests deferring avatar resize. But since CF Images Binding is free, zero-config, and solves EXIF stripping + image bombs in one shot, it belongs in Phase 1 alongside the upload endpoint. No reason to ship a degraded version first.
- **Phases 1 and 3 could partially overlap:** The ArtistProfile page component (Phase 3) can start development once the shared types (Phase 1) are defined, even before the API is fully tested. But the router refactor (extracting RadioView from App.tsx) should wait until Phase 2 is verified working.

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 1 (avatar upload):** Verify CF Images Binding availability on the project's Cloudflare account. Test the binding in local Wrangler dev to confirm width/height/format operations work offline. Confirm the `ImagesBinding` TypeScript type is available in `@cloudflare/workers-types`.
- **Phase 3 (router integration):** The App.tsx refactor into Layout + Routes is the riskiest frontend change. Consider a spike/prototype to validate audio continuity before committing to the full implementation.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (D1 migration + Hono routes):** Directly reuses established patterns from v1.0 migrations and route files. No novel architecture.
- **Phase 2 (LEFT JOIN enrichment):** Textbook SQL JOIN on primary keys with KV cache invalidation. Existing helpers (`invalidateNowPlaying`) cover the cache layer.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Only 1 new npm dependency + 1 CF binding. All evaluated against official docs. React Router v7 and CF Images Binding are both GA and well-documented. |
| Features | HIGH | Profile page patterns are mature across Spotify, SoundCloud, Audius, Bandcamp. Agent-specific adaptations (API-only, x402 auth) are logically sound though novel. |
| Architecture | HIGH | All 8 integration points verified against the actual codebase (59 source files). Every pattern reuses existing v1.0 conventions. |
| Pitfalls | HIGH | Critical pitfalls (dual-write, race conditions, XSS, audio disruption) are well-documented vulnerability classes with clear prevention. Verified against actual code paths. |

**Overall confidence:** HIGH

### Gaps to Address

- **CF Images Binding account availability:** Verify the binding is enabled on the project's Cloudflare account before Phase 1 begins. If unavailable, fall back to storing originals with 2MB size cap (CSS-only sizing).
- **x402 squatting economics:** 0.01 USDC may be too low to deter a determined squatter with 100 wallets ($1 total). Monitor registration patterns post-launch. Have the "require one track before profile" rule ready to deploy if squatting occurs, but do not ship it in v1.1.
- **Username max length:** Researchers disagree (STACK.md says 20, FEATURES.md says 30, ARCHITECTURE.md says 30). **Decision: 20.** Shorter max keeps URLs clean and prevents edge cases in tight UI layouts (player bar, mobile). 20 characters is generous for agent handles.
- **Profile update semantics:** The endpoint is PUT (full replacement) but should support partial updates to avoid clearing optional fields. Implement with COALESCE in SQL or explicit field-presence checks. Define this clearly in the API contract.
- **`COLLATE NOCASE` on username:** ARCHITECTURE.md uses it; STACK.md does not. **Decision: Use it.** SQLite's COLLATE NOCASE on the UNIQUE index prevents "CoolBot" and "coolbot" from coexisting at the database level, even though the application normalizes to lowercase. Defense in depth.

## Sources

### Primary (HIGH confidence)
- [Cloudflare Images Binding Docs](https://developers.cloudflare.com/images/transform-images/bindings/) -- avatar resizing API, pricing, local dev support
- [CF Images Pricing](https://developers.cloudflare.com/images/pricing/) -- free tier confirmation (5,000/month)
- [CF Images: Transform user-uploaded images tutorial](https://developers.cloudflare.com/images/tutorials/optimize-user-uploaded-image/) -- R2 integration pattern
- [React Router v7 Declarative Installation](https://reactrouter.com/start/declarative/installation) -- setup, BrowserRouter, Routes
- [React Router v7 Modes](https://reactrouter.com/start/modes) -- declarative vs framework mode distinction
- [Cloudflare D1 Migrations](https://developers.cloudflare.com/d1/reference/migrations/) -- migration file conventions
- [Cloudflare D1 Foreign Keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/) -- always-enforced FK behavior
- [Cloudflare Pages SPA Routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/) -- fallback behavior
- [Cloudflare KV: How KV Works](https://developers.cloudflare.com/kv/concepts/how-kv-works/) -- TTL, eventual consistency
- claw.fm codebase (all 59 source files) -- verified all integration points, existing patterns, and current behavior

### Secondary (MEDIUM confidence)
- [Audius AI Music Attribution](https://blog.audius.co/article/introducing-ai-music-attribution-on-audius) -- the only existing AI-as-artist precedent
- [Audius API: AI Attributed Tracks](https://docs.audius.org/developers/api/get-ai-attributed-tracks-by-user-handle/) -- agent identity API patterns
- [CF Blog: Images Binding for Workers](https://blog.cloudflare.com/improve-your-media-pipelines-with-the-images-binding-for-cloudflare-workers/) -- binding capabilities and use cases
- [Redesigning Workers KV](https://blog.cloudflare.com/rearchitecting-workers-kv-for-redundancy/) -- RYOW consistency improvements
- [Securitum: SVG XSS Research](https://research.securitum.com/do-you-allow-to-load-svg-files-you-have-xss/) -- avatar security validation
- [Unicode NFKC Normalization (UAX #15)](https://unicode.org/reports/tr15/) -- username normalization

### Tertiary (LOW confidence)
- [The-Big-Username-Blocklist](https://github.com/marteinn/The-Big-Username-Blocklist) -- evaluated but not adopted (7+ years stale, not tailored to claw.fm routes)

---
*Research completed: 2026-02-03*
*Ready for roadmap: yes*
