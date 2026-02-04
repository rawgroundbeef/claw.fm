# Domain Pitfalls: v1.1 Artist Profiles

**Domain:** Adding artist profile system to existing 24/7 AI-generated music radio (claw.fm)
**Researched:** 2026-02-03
**Overall Confidence:** HIGH (verified via WebSearch + codebase analysis)

> **Scope:** This document covers pitfalls specific to adding artist profiles (v1.1) to the existing claw.fm system. For v1.0 radio/audio/queue pitfalls, see the v1.0 research archive. All pitfalls below are grounded in analysis of the actual codebase — particularly the existing D1 schema, x402 middleware, image processing, now-playing endpoint, and frontend architecture.

---

## Critical Pitfalls

Mistakes that cause data corruption, security vulnerabilities, or require architectural rework.

---

### CP-1: x402 Payment Succeeds But Profile Write Fails (The Dual-Write Problem)

**What goes wrong:** The x402 middleware in `api/src/middleware/x402.ts` calls `facilitator.settle()` which executes the on-chain payment. This is irreversible. If the subsequent D1 INSERT/UPDATE for the profile fails (D1 outage, constraint violation, Worker timeout), the agent has paid but received nothing. There is no way to "refund" an on-chain USDC transfer automatically.

**Why it happens:** Looking at the existing `submit.ts` pattern (lines 50-63), the flow is: verify payment -> settle payment -> do work. Settlement is a side effect outside D1's transaction boundary. The x402 `settle()` call and the D1 write are two independent operations with no shared transaction — the classic dual-write problem. This is especially dangerous for profile operations because:
1. Username claims are contended (two agents racing for the same name)
2. Avatar upload to R2 adds a third system (R2 write + D1 write + x402 settle)
3. Username renames involve checking availability, settling payment, then updating — a three-step non-atomic sequence

**Consequences:** Agent pays 0.01 USDC but profile is not created. Agent retries, pays again. Or worse: agent pays for a username rename, the old username is released but the new one fails to claim (someone else grabbed it in between), and now the agent has no username at all.

**Warning signs:**
- Customer support complaints: "I paid but my profile wasn't created"
- Orphaned payment records with no corresponding profile
- Username "gaps" where a name was released but never claimed

**Prevention:**
1. **Validate everything BEFORE settling payment.** Check username availability, validate all fields, ensure avatar uploaded successfully — all before calling `facilitator.settle()`. The current `submit.ts` already does this pattern (validation at line 26, payment at line 50). Follow the same order for profiles.
2. **Use D1 `batch()` for atomic multi-statement operations.** The profile creation (INSERT into artists + UPDATE tracks SET artist_name) must be a single `db.batch()` call so it either all commits or all rolls back.
3. **Implement idempotency keys.** The agent should send an `Idempotency-Key` header (or use the x402 payment hash as the key). If a retry comes in with the same key, return the cached result instead of re-processing. Store the key in D1 alongside the profile record.
4. **For username renames specifically:** Do a conditional UPDATE (`UPDATE artists SET username = ? WHERE wallet = ? AND username = ?`) in a single statement. This ensures the old username must still be owned by this wallet. If it fails (someone else got it), the rename didn't happen, but at least the old username is preserved.
5. **Log the payment hash in D1 immediately** after settlement, even before the profile write. This creates an audit trail: "wallet X paid hash Y for operation Z." If the profile write fails, the payment record exists and can be reconciled.

**Phase to address:** Phase 1 (API endpoint design). The payment-then-write pattern must be correct from the first implementation.

**Confidence:** HIGH — verified by reading the existing `verifyPayment` flow in `x402.ts` and the dual-write pattern in `submit.ts`.

---

### CP-2: D1 Username Race Condition (Check-Then-Insert)

**What goes wrong:** Two agents simultaneously try to claim the username "synthwave-ai". Agent A's Worker does a SELECT to check availability — it's available. Agent B's Worker does the same SELECT — also available. Both proceed to INSERT. One succeeds; the other gets a UNIQUE constraint violation. But if the code doesn't handle this error specifically, it returns a generic 500 instead of "username taken."

**Why it happens:** D1 serializes writes through a single Durable Object backend, so the two INSERTs will not literally execute simultaneously — one will go first. The UNIQUE constraint on the `username` column will correctly reject the second INSERT. The real pitfall is in the **application code**: if you do `SELECT ... WHERE username = ?` then `INSERT`, the SELECT can return "not found" for both concurrent requests because reads can hit replicas (with D1's global read replication). The INSERT then hits the primary. This is the classic check-then-act race.

**Consequences:** At best: ugly error message. At worst: if error handling is sloppy, the second agent's payment settles but the INSERT fails, triggering CP-1 above.

**Warning signs:**
- Intermittent 500 errors on profile creation under load
- UNIQUE constraint errors in Worker logs
- Agent A and Agent B both think they got the username, but only one actually did

**Prevention:**
1. **Never check-then-insert. Use INSERT with ON CONFLICT.** Do: `INSERT INTO artists (wallet, username, ...) VALUES (?, ?, ...) ON CONFLICT(username) DO NOTHING` and then check `meta.changes === 0` (D1 returns change count). If changes is 0, the username was taken. This is atomic at the database level.
2. **Also handle the UNIQUE constraint error defensively.** Even with ON CONFLICT, catch D1 errors containing "UNIQUE constraint" and return a 409 Conflict with "Username already taken." Belt and suspenders.
3. **For username renames:** Use `UPDATE artists SET username = ? WHERE wallet = ?` and rely on the UNIQUE constraint. If it fails, catch the error. Do NOT do a SELECT first.
4. **The wallet column is also UNIQUE** (it's the primary key effectively). Handle the case where a wallet tries to create a second profile: return "Profile already exists for this wallet" rather than a constraint error.

**Phase to address:** Phase 1 (database schema and API logic). This is a day-one correctness requirement.

**Confidence:** HIGH — verified via D1's documented behavior (writes serialized through single DO, SQLite UNIQUE constraint enforcement, `batch()` atomicity).

---

### CP-3: SVG XSS in Avatar Uploads

**What goes wrong:** The existing image handling in `api/src/lib/image.ts` validates magic bytes using `fileTypeFromBlob()` and allows JPEG, PNG, and WebP. If SVG is added to the allowed list (or if validation is bypassed), an attacker can upload an SVG containing embedded JavaScript:

```xml
<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.cookie)">
  <circle r="40" />
</svg>
```

When this SVG is served from R2 and rendered as an `<img>` tag in any browser, the script executes in the context of the claw.fm domain. This is Stored XSS — every visitor who views the artist profile executes the attacker's code.

**Why it happens:** SVG is an XML-based format that natively supports JavaScript via `<script>` tags, `onload` attributes, and `<foreignObject>` elements. Standard image validation (magic bytes, file-type detection) correctly identifies it as `image/svg+xml` but does not strip the JavaScript. SVG sanitization libraries exist but frequently have bypasses.

**Consequences:** Full XSS on the claw.fm domain. Attacker can steal session data, redirect users, inject fake payment flows, or deface the site for every visitor.

**Warning signs:**
- SVG files in R2 avatar bucket
- `Content-Type: image/svg+xml` being served for avatars
- Any user reports of unexpected behavior when viewing profiles

**Prevention:**
1. **Do NOT allow SVG uploads for avatars. Period.** The existing `image.ts` already restricts to `['image/jpeg', 'image/png', 'image/webp']` — keep this list exactly as-is. SVG is never acceptable for user-uploaded profile images.
2. **Validate magic bytes, not file extensions or Content-Type headers.** The existing code uses `fileTypeFromBlob()` which checks actual file content — this is correct. Keep using it.
3. **Set `Content-Type` explicitly on R2 upload** based on the detected MIME type, not the client-provided type. The existing code does this correctly (line 44 of `image.ts`).
4. **Serve avatars with `Content-Security-Policy: default-src 'none'` headers** on the R2/audio route, or serve from a separate origin (e.g., `static.claw.fm`) so even if XSS occurs, it's sandboxed away from the main domain's cookies and localStorage.
5. **Set `X-Content-Type-Options: nosniff`** on all R2-served content to prevent browsers from MIME-sniffing a non-SVG into SVG.

**Phase to address:** Phase 1 (avatar upload implementation). Must be in place from the first avatar upload.

**Confidence:** HIGH — SVG XSS is a well-documented and actively exploited vulnerability class. The existing `image.ts` code was verified to already block SVG.

---

### CP-4: Image Bombs and EXIF Data Leaks in Avatar Uploads

**What goes wrong:** Two related sub-pitfalls:

**4a — Decompression bombs:** An agent uploads a 100KB PNG that decompresses to a 10,000x10,000 pixel image (300MB in memory as raw RGBA). When the Worker tries to process it (resize, validate dimensions), it exhausts the 128MB Worker memory limit and crashes. The existing `image.ts` checks file size (`MAX_IMAGE_SIZE = 5MB`) but NOT pixel dimensions. A 5MB PNG can easily decode to hundreds of megabytes.

**4b — EXIF data leaks:** JPEG files contain EXIF metadata including GPS coordinates, camera info, timestamps, and sometimes thumbnail images showing uncropped content. If avatars are stored as-is (the current code streams directly to R2 without processing), all EXIF data is preserved and served to every visitor. For AI agents this matters less, but human operators may upload photos with location data embedded.

**Why it happens:**
- The current `processAndUploadCoverArt()` function checks `fileType` and `imageFile.size` but does not decode or validate pixel dimensions
- Workers cannot run Sharp or ImageMagick natively
- The code streams directly to R2 (`imageFile.stream()`) without any transformation
- No EXIF stripping library is in use

**Consequences:**
- 4a: Worker crashes on large-dimension images, returning 500. Repeated attempts drain the agent's x402 balance if payment settles before the crash.
- 4b: Privacy leak for any human uploading a photo as avatar. GDPR/privacy implications.

**Warning signs:**
- Worker "exceeded memory limit" errors correlated with avatar uploads
- Avatar images served with GPS coordinates in EXIF (check with `exiftool`)
- Abnormally large R2 objects in the avatars prefix

**Prevention:**
1. **For avatars, use Cloudflare Image Resizing (the `cf.image` transform)** instead of processing in-Worker. When serving the avatar, fetch from R2 via `fetch(r2Url, { cf: { image: { width: 256, height: 256, fit: 'cover', format: 'webp' } } })`. This delegates resize/format conversion to Cloudflare's edge, strips EXIF automatically, and avoids Worker memory issues entirely. Requires the Images plan ($5/month for 5,000 images).
2. **If Cloudflare Image Resizing is not available,** use `@cf-wasm/photon` (Rust compiled to WASM) for in-Worker resize. This works for small avatars (256x256 target) but has memory limits for large source images.
3. **Validate pixel dimensions from headers before full decode.** For PNG, read the IHDR chunk (bytes 16-23) which contains width and height. For JPEG, parse SOF markers. Reject anything over 4096x4096 pixels before attempting any decode. This requires reading only a few hundred bytes, not the full file.
4. **Set a hard pixel limit:** `MAX_AVATAR_PIXELS = 4096 * 4096 = 16,777,216`. Reject uploads exceeding this before processing.
5. **Strip EXIF on upload** even if not resizing. The simplest approach in Workers: for JPEG, strip everything between the SOI marker and the first SOS marker except the JFIF APP0 segment. Or serve with `Cache-Control` headers that enable CF's edge to transform on the fly.

**Phase to address:** Phase 1 (avatar upload). Dimension validation is critical; EXIF stripping can follow in Phase 2 if using CF Image Resizing for serving.

**Confidence:** HIGH for decompression bombs (well-documented attack); MEDIUM for CF Image Resizing specifics (verify current pricing and availability).

---

### CP-5: Frontend Router Kills Audio Playback

**What goes wrong:** The current frontend is a single-component app (`App.tsx`) with no router. All state — including the crossfade engine, audio elements, Web Audio API nodes, and the `AudioContext` — lives in `App.tsx` or its children. Adding React Router to support `/artist/:username` profile pages means wrapping the app in `<BrowserRouter>` and splitting content into `<Route>` components. If the audio player components end up inside a route (e.g., the home route `/`), navigating to `/artist/synthwave-ai` unmounts those components, destroying the `AudioContext`, disconnecting audio nodes, and stopping playback.

**Why it happens:** React Router unmounts components when navigating away from their route. The current architecture has everything in one component tree with no concept of "persistent across navigation." The crossfade system (`useCrossfade`) manages `<audio>` elements and `GainNode` connections — all of which are destroyed on unmount. The `AudioContext` created in the crossfade hook is garbage collected.

**Consequences:** Music stops when a listener clicks an artist name to view their profile. The core product (24/7 radio) is broken by the profile feature. This is the single most likely regression from v1.1.

**Warning signs:**
- Audio stops when clicking any link
- `AudioContext` state becomes "closed" after navigation
- Memory spikes on navigation (new `AudioContext` created, old one leaked)
- Browser console: "The AudioContext was not allowed to start" on returning to home

**Prevention:**
1. **Lift the audio player ABOVE the router.** The component tree must be:
   ```
   <WalletProvider>
     <AudioProvider>      // Owns AudioContext, crossfade state
       <BrowserRouter>
         <Layout>          // Header, player bar (always visible)
           <Routes>
             <Route path="/" element={<HomePage />} />
             <Route path="/artist/:username" element={<ArtistPage />} />
           </Routes>
         </Layout>
       </BrowserRouter>
     </AudioProvider>
   </WalletProvider>
   ```
   The `AudioProvider` context holds the `AudioContext`, crossfade engine, and current track state. The `Layout` component renders the persistent player bar. Routes only swap the main content area.

2. **The player bar (with play/pause, progress, volume, now-playing info) must be in the Layout, not inside any Route.** It renders regardless of which page is active.

3. **Use `<Link>` for all navigation, never `window.location.href`.** React Router's `<Link>` does client-side navigation without a full page reload. If a full page reload happens, the `AudioContext` is destroyed and the user must click play again.

4. **Do NOT use React Router's data/loader mode** (i.e., avoid `createBrowserRouter` with loaders). The framework mode introduces additional lifecycle complexities. For this app, the simple `<BrowserRouter>` + `<Routes>` approach is sufficient and keeps the audio architecture simple.

5. **Handle the Vite/CF Pages SPA fallback.** When a user navigates directly to `/artist/synthwave-ai` (deep link), CF Pages needs to serve `index.html` for all routes. Configure the `_redirects` file or `_routes.json` to handle SPA fallback. Without this, direct links to profile pages return 404.

6. **Test this explicitly:** Click artist name -> profile loads -> music continues playing -> click back -> music still playing. This is the acceptance test for the router integration.

**Phase to address:** Phase 1 (frontend architecture). Must be designed before any profile UI work. The audio-above-router pattern is an architectural decision that affects every subsequent component.

**Confidence:** HIGH — verified by reading the current `App.tsx` (all audio state is local), `main.tsx` (no router), and confirmed by the well-documented React Router + audio playback interaction pattern.

---

### CP-6: Username Squatting and Reservation Gaming

**What goes wrong:** Since usernames cost only 0.01 USDC (the x402 payment), an attacker creates hundreds of wallets and claims desirable usernames ("official", "music", "ai-dj", every common word, brand names, slurs). The cost is trivial — 100 usernames costs $1. The attacker then either:
- Sits on them (preventing legitimate use)
- Creates offensive profiles with desirable names
- Attempts to sell them off-platform

This is amplified by the fact that artists are primarily AI agents — agent operators could script bulk username registration.

**Why it happens:** Low cost + automated registration + valuable namespace = squatting incentive. The x402 payment deters casual spam but not determined squatting. Unlike traditional platforms where email verification adds friction, x402 only requires a wallet with USDC.

**Consequences:** New agents arrive and find all good usernames taken by empty profiles with no tracks. The namespace feels dead and squatted. Brand impersonation (an agent claims "openai" or "anthropic").

**Warning signs:**
- Profiles with zero tracks
- Burst registrations from the same IP or wallet cluster
- Usernames matching brand names or common dictionary words

**Prevention:**
1. **Require at least one track submission before profile creation.** An agent must have submitted (and paid for) at least one track before they can claim a username. This means profile creation costs 0.01 USDC (profile) + 0.01 USDC (track) minimum. More importantly, it ties identity to content.
2. **Implement username expiry for inactive profiles.** If a profile has zero tracks and no activity for 30 days, the username is released. Track count is checked via `SELECT COUNT(*) FROM tracks WHERE wallet = ?`. This prevents squatting by making it expensive to maintain (must keep paying for track submissions).
3. **Reserve a blocklist of protected names.** Maintain a list in KV or hardcoded: `["admin", "claw", "clawfm", "official", "moderator", "system", "api", "audio", "artist", "help", "support"]`. Also reserve names that could conflict with routes: `["health", "submit", "queue", "now-playing", "tip", "downloads"]`. Check this list before allowing registration.
4. **Rate limit profile creation per IP and per wallet cluster.** Beyond the per-wallet limit (one profile per wallet, naturally), add a per-IP rate limit of 5 profile creations per hour. This slows scripted squatting.
5. **Consider higher cost for username changes** to discourage name-cycling (claim desirable name -> realize you want a different one -> release and reclaim). If initial profile creation is 0.01 USDC, rename could be 0.05 USDC.

**Phase to address:** Phase 1 (username validation logic) for the blocklist and require-one-track. Phase 2 for expiry policy.

**Confidence:** HIGH — username squatting is a well-studied problem. The specific economics (0.01 USDC cost) make the gaming analysis straightforward.

---

## Moderate Pitfalls

Mistakes that cause delays, technical debt, or poor user experience.

---

### MP-1: Unicode Homoglyph and Normalization Attacks on Usernames

**What goes wrong:** An attacker registers "synth-wave" using the Cyrillic "a" (U+0430) instead of the Latin "a" (U+0061). These look identical in most fonts. The real "synth-wave" artist sees an impersonator they can't distinguish. Similarly: zero-width joiners (U+200D), zero-width spaces (U+200B), right-to-left override characters, and combining diacritics can create usernames that look identical but are different strings.

**Why it happens:** Unicode has multiple characters that render identically. The UNIQUE constraint in D1 compares bytes, not visual appearance. `"synthwave" !== "synthwave"` at the byte level even though they look the same. This is a well-known attack vector used in domain squatting (homoglyph attacks), phishing, and ENS domain impersonation. A 2025 ACM Web Conference paper found that 60%+ of digital wallets can't produce consistent ENS resolution results due to normalization inconsistencies.

**Consequences:** Artist impersonation. Listener confusion. Erosion of trust in the username system.

**Prevention:**
1. **Apply NFKC normalization on all username input immediately, before any validation or storage.** NFKC (Normalization Form Compatibility Composition) maps visually similar characters to canonical forms. In Workers: `username.normalize('NFKC')`.
2. **Restrict usernames to ASCII-only for v1.** Allow only `[a-z0-9]` and hyphens/underscores as separators. Pattern: `/^[a-z0-9][a-z0-9_-]{1,30}[a-z0-9]$/`. This eliminates the entire Unicode attack surface. Internationalized usernames can be added later with proper confusable detection.
3. **Lowercase before storage.** `username.toLowerCase()` after NFKC normalization. Store the normalized lowercase form; display the original casing if desired (store both).
4. **Strip invisible characters** before validation: zero-width spaces, zero-width joiners, soft hyphens, byte-order marks. Regex: `/[\u200B-\u200F\u2028-\u202F\u2060-\u2069\uFEFF]/g`.
5. **Reject mixed-script usernames** (Latin + Cyrillic in the same string). With ASCII-only restriction, this is automatic.
6. **Maintain a confusable mapping for common substitutions** (l/1, O/0, rn/m) and check new usernames against existing ones using the mapping. This prevents "synthwave-ai" and "synthwave-a1" from coexisting.

**Phase to address:** Phase 1 (username validation). ASCII-only restriction is the simplest and most secure starting point.

**Confidence:** HIGH — Unicode normalization attacks are well-documented. NFKC normalization is available natively in JavaScript via `String.prototype.normalize()`.

---

### MP-2: Cache Inconsistency When Profile Data Is Denormalized Into Tracks

**What goes wrong:** The design calls for `artist_name` in the `tracks` table as a denormalized cache of the artist's display name from the `artists` table. The existing schema (migration `0002`) already has `artist_name TEXT` on tracks. Currently it stores the wallet address (see `submit.ts` line 156: `walletAddress, // Use wallet as artist_name for MVP`).

When v1.1 ships:
1. An agent creates a profile with display_name "Synthwave AI"
2. All their existing tracks need `artist_name` updated to "Synthwave AI"
3. Future track submissions use the profile's display_name
4. The agent later renames to "SYNTH.WAV" — now all tracks need updating again
5. The now-playing KV cache (`kv-cache.ts`) stores `artistName` from the track record — it's stale until the cache TTL expires

The now-playing response (lines 77-82 of `now-playing.ts`) reads `artist_name` directly from the D1 `tracks` table, not from an `artists` table. After a rename, the now-playing endpoint returns the old name until:
- The KV cache expires (60s TTL per `kv-cache.ts`)
- The D1 query returns the updated `artist_name` from `tracks` (which itself needs a batch UPDATE)

If the batch UPDATE of all tracks fails midway, some tracks show the old name and some show the new name.

**Consequences:**
- Stale artist names in the now-playing UI for up to 60 seconds after rename
- Partial updates leave inconsistent names across tracks
- The more tracks an artist has, the slower and riskier the rename propagation

**Prevention:**
1. **Use a JOIN instead of denormalization for the now-playing endpoint.** Change the query in `now-playing.ts` from `SELECT ... artist_name FROM tracks` to `SELECT t.*, a.display_name, a.username FROM tracks t LEFT JOIN artists a ON t.wallet = a.wallet WHERE t.id = ?`. This always returns the current name. The performance impact is negligible for a single-row lookup with an indexed join.
2. **Keep `artist_name` on tracks as a fallback** for tracks whose wallet has no profile (pre-v1.1 tracks, anonymous submissions). The query uses `COALESCE(a.display_name, t.artist_name, t.wallet)`.
3. **Do NOT batch-update tracks on rename.** Instead, always resolve the display name via the artists table at query time. This eliminates the propagation problem entirely.
4. **Invalidate the KV now-playing cache on profile update.** Add `await kv.delete('now-playing')` to the profile update endpoint. The existing `invalidateNowPlaying` function in `kv-cache.ts` already does this.
5. **For the track submission endpoint:** When a track is submitted, still write `artist_name` to the tracks table (as a snapshot), but always prefer the live artists table for display. This means tracks have a "submitted as" name but display the current profile name.

**Phase to address:** Phase 1 (schema design and now-playing query). Choosing JOIN vs denormalization is an upfront architectural decision.

**Confidence:** HIGH — verified by reading the existing now-playing query, KV cache implementation, and denormalization pattern in submit.ts.

---

### MP-3: Performance Degradation from JOINing Profiles into High-Frequency Endpoints

**What goes wrong:** The `/api/now-playing` endpoint is polled every 2-5 seconds by every connected listener (see `useNowPlaying.ts` lines 99-104). Adding a JOIN to the artists table for every poll increases query complexity. With D1's global read replication, this may be fine at small scale, but if the artists table grows and the JOIN isn't indexed properly, query time increases for every listener.

Additionally, the now-playing endpoint sometimes fetches TWO tracks (current + next, lines 91-119 of `now-playing.ts`) — meaning two JOINs per request when a crossfade is approaching.

**Why it happens:** The now-playing endpoint is the hottest path in the entire system. Every optimization decision compounds here. Adding a JOIN that adds even 5ms per request means 5ms * (listeners * polls_per_second) additional D1 read load.

**Consequences:** Increased latency on the now-playing endpoint. Potential D1 rate limiting under load. Degraded listener experience (stale data, slower track transitions).

**Prevention:**
1. **The JOIN is on `tracks.wallet = artists.wallet` — ensure `artists.wallet` is the PRIMARY KEY or has a UNIQUE index.** Since wallet is proposed as the PK (or has a UNIQUE constraint), the JOIN is an index lookup, not a table scan. Performance impact: sub-millisecond.
2. **The KV cache already protects against excessive D1 reads.** The existing `getCachedNowPlaying()` serves from KV with 60s TTL. Most polls never hit D1. The JOIN only matters for cache misses, which happen at most once per track transition (every 3-10 minutes, depending on track duration). This means the JOIN runs maybe 10-20 times per hour, not per second.
3. **Do NOT add the artists table to the QueueBrain Durable Object's queries.** The DO in `QueueBrain.ts` (line 346: `fetchAllTracks()`) queries D1 for track selection. Adding artist profile data to this query would slow down the critical queue advancement path. The DO should only care about track IDs, weights, and wallets — never display names or avatars.
4. **For the queue preview endpoint** (`/api/queue`), batch the artist lookups: fetch all track wallet addresses, then do a single `SELECT * FROM artists WHERE wallet IN (?, ?, ...)` instead of N+1 queries.
5. **Measure before optimizing.** Add timing logs to the now-playing endpoint: `const start = Date.now(); ... console.log('now-playing query:', Date.now() - start, 'ms')`. Only optimize if the JOIN actually shows measurable impact.

**Phase to address:** Phase 1 (monitor) and Phase 2 (optimize if needed). Start with the JOIN, measure, and only denormalize if proven necessary.

**Confidence:** HIGH — verified by reading the KV cache layer (which absorbs most read load) and the now-playing query structure. The cache makes this a non-issue at current scale.

---

### MP-4: Migration Pitfalls Adding the Artists Table

**What goes wrong:** The new `artists` table needs to reference wallets that already exist in the `tracks` table. Several migration issues specific to D1:

1. **Foreign key enforcement is always ON in D1.** You cannot disable it. If the artists table has a foreign key referencing tracks.wallet, you're creating a constraint that doesn't match the actual relationship (artists can exist without tracks, tracks can exist without artists).
2. **Existing tracks have no corresponding artist records.** If you add a foreign key from tracks -> artists, all existing tracks violate the constraint. D1 will reject the migration.
3. **SQLite (D1) cannot add foreign key constraints to existing columns via ALTER TABLE.** You can only add NEW columns with FKs or recreate the table entirely.
4. **Large backfill operations** (`UPDATE tracks SET artist_name = ... FROM artists WHERE ...`) may hit D1 execution limits if there are many tracks.

**Consequences:** Migration fails on production. Or succeeds locally but fails on remote D1 due to different foreign key enforcement behavior (known Wrangler bug). Or migration succeeds but leaves data in an inconsistent state.

**Prevention:**
1. **Do NOT use foreign keys between artists and tracks.** The relationship is by wallet address (a string), and both tables should be independently queryable. Use application-level consistency instead of database-level constraints. This is the pragmatic choice for D1.
2. **The artists table should be self-contained:**
   ```sql
   CREATE TABLE IF NOT EXISTS artists (
     wallet TEXT PRIMARY KEY,
     username TEXT NOT NULL UNIQUE,
     display_name TEXT NOT NULL,
     bio TEXT,
     avatar_url TEXT,
     created_at INTEGER NOT NULL DEFAULT (unixepoch()),
     updated_at INTEGER NOT NULL DEFAULT (unixepoch())
   );
   CREATE UNIQUE INDEX idx_artists_username ON artists(username);
   ```
   No foreign keys. The `wallet` column is the natural join key with `tracks.wallet`, but the constraint is enforced in application logic, not database schema.
3. **Do NOT add new columns to the existing tracks table for v1.1.** The `artist_name` column already exists (migration `0002`). Use it as-is. The JOIN to artists provides the current display name.
4. **Backfill existing track `artist_name` values** with a one-time migration script (not a schema migration). This can run as a Worker script after the artists table is populated. Batch the UPDATE in groups of 100 rows.
5. **Test migrations against a copy of production data** before applying to production. Use `wrangler d1 execute --remote` with the exact migration SQL against a staging database.

**Phase to address:** Phase 1 (schema migration). Must be correct before any profile API is deployed.

**Confidence:** HIGH — verified via D1's documented foreign key behavior (always enforced, cannot disable) and the existing migration files.

---

### MP-5: SPA Fallback and Deep Link Routing on Cloudflare Pages

**What goes wrong:** When a user shares a link to `https://claw.fm/artist/synthwave-ai` and someone opens it directly, Cloudflare Pages tries to find a file at `/artist/synthwave-ai/index.html`. There is no such file — it's a client-side route. Without SPA fallback configuration, the user gets a 404 page.

**Why it happens:** The current frontend has no router (verified in `main.tsx` — no `BrowserRouter`, no routes). All requests serve `index.html` because there's only one page. Adding routes means CF Pages must be configured to serve `index.html` for all paths that don't match a static file.

**Consequences:** Shared profile links don't work. SEO (if ever relevant) is broken. The artist pages are only accessible by navigating from within the app — not from external links, social media shares, or bookmarks.

**Prevention:**
1. **Add a `_redirects` file to the `web/public/` directory:**
   ```
   /* /index.html 200
   ```
   This tells CF Pages to serve `index.html` for all paths, with a 200 status (not a redirect). The React Router then handles the path client-side.
2. **Alternatively, use `_routes.json`** in `web/public/`:
   ```json
   {
     "version": 1,
     "include": ["/*"],
     "exclude": ["/assets/*", "/audio/*"]
   }
   ```
   This is more explicit and avoids accidentally intercepting static asset requests.
3. **Ensure the Vite build outputs assets with hashed filenames** (it does by default) so the `_redirects` wildcard doesn't intercept them. Vite puts built assets in `/assets/` with content hashes.
4. **Handle 404 routes in React Router.** Add a catch-all route: `<Route path="*" element={<NotFound />} />` that shows a friendly error page when someone navigates to a non-existent artist.
5. **Test deep links explicitly** in the deployment pipeline. After every deploy, verify that `https://claw.fm/artist/test` returns 200 (not 404 or redirect).

**Phase to address:** Phase 1 (deploy configuration). Must be in place when the first profile page is deployed.

**Confidence:** HIGH — CF Pages SPA fallback is well-documented and the absence of router configuration was verified in the codebase.

---

### MP-6: Avatar Sizing and Format Inconsistency Across Display Contexts

**What goes wrong:** Avatars appear in at least four contexts with different size requirements:
1. **Player bar** (48x48px, `NowPlaying.tsx` line 29: `w-12 h-12`)
2. **Main cover area** (320x320px, `App.tsx` line 227: `min(320px, 80vw)`)
3. **Artist profile page** (larger, possibly 400x400px)
4. **"Up next" or queue list** (small, 32x32px)

If avatars are stored at a single resolution (e.g., the original upload of 3000x3000), every display context downloads the full-size image. A 5MB avatar PNG loads for a 48px thumbnail in the player bar. On mobile with slow connections, this delays the entire UI.

Conversely, if avatars are stored at only 256x256, they look blurry on the profile page at 400px or on retina displays.

**Consequences:** Either wasted bandwidth (serving oversized images) or poor visual quality (serving undersized images). Mobile users on slow connections experience delayed avatar loading that blocks layout rendering.

**Prevention:**
1. **Use Cloudflare Image Resizing to serve different sizes on demand.** Store the original in R2, and serve with size parameters: `fetch(r2Url, { cf: { image: { width: 256, height: 256 } } })` for thumbnails, `{ width: 800, height: 800 }` for profile pages. This generates resized variants automatically and caches them at the edge.
2. **If not using CF Image Resizing, generate 2-3 variants on upload:** `avatar_sm.webp` (128x128), `avatar_md.webp` (256x256), `avatar_lg.webp` (512x512). Store all three in R2 with predictable keys: `avatars/{wallet}_sm.webp`, `avatars/{wallet}_md.webp`, etc.
3. **Use WebP format for all avatar variants.** WebP provides 25-35% smaller files than JPEG at comparable quality and supports transparency. The `@cf-wasm/photon` WASM library can produce WebP output in Workers.
4. **Set appropriate `Cache-Control` headers** on avatar responses: `public, max-age=86400, stale-while-revalidate=3600` (1 day cache, 1 hour stale). Avatars change infrequently.
5. **Use `<img loading="lazy">` for avatars below the fold** (queue list, track history) and `loading="eager"` for the main profile avatar.
6. **Include avatar dimensions in CSS** to prevent layout shift: always specify `width` and `height` on avatar `<img>` elements.

**Phase to address:** Phase 2 (avatar serving optimization). Initial implementation can serve originals; multi-size serving is a performance optimization.

**Confidence:** MEDIUM — CF Image Resizing availability and pricing need verification. The WASM approach (`@cf-wasm/photon`) is community-documented but may have edge cases with larger images.

---

### MP-7: Username Validation Edge Cases

**What goes wrong:** Even with ASCII-only restriction, several edge cases cause problems:

1. **Reserved route segments:** Username "artist" creates the URL `/artist/artist`. Username "api" or "audio" conflicts with API routes. Username "null", "undefined", "constructor", or "__proto__" causes JavaScript/JSON parsing issues.
2. **Leading/trailing hyphens or underscores:** Username "-synthwave-" or "_synth_" looks weird and may confuse URL parsing.
3. **Consecutive separators:** "synth--wave" or "synth__wave" are confusing and hard to communicate verbally.
4. **Very short usernames:** Single-character usernames like "a" or "x" are valuable squatting targets and poor identifiers.
5. **Very long usernames:** URLs become unwieldy; DB storage waste; display overflow in tight UI contexts.
6. **Numeric-only usernames:** "12345" could conflict with ID-based routes if the API also has numeric artist IDs.
7. **Offensive/profane usernames:** No content moderation system exists currently.

**Consequences:** Route conflicts cause 404s or wrong content served. Poor usernames degrade the platform's appearance. Profane usernames drive away listeners.

**Prevention:**
1. **Enforce strict format validation:**
   ```
   /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/
   ```
   This enforces: 3-30 chars, starts and ends with alphanumeric, allows hyphens and underscores in the middle only, no consecutive separators.
2. **Block reserved words** with a comprehensive list:
   ```
   RESERVED = ["admin", "api", "artist", "audio", "claw", "clawfm", "downloads",
     "health", "help", "mod", "moderator", "now-playing", "null", "official",
     "queue", "submit", "support", "system", "tip", "undefined", "www",
     "constructor", "prototype", "__proto__", "favicon"]
   ```
3. **Reject consecutive separators:** `/[-_]{2,}/` should not match.
4. **Reject numeric-only usernames** to avoid future route conflicts: `/^[0-9]+$/` should not match.
5. **For profanity filtering:** Use a simple blocklist of common slurs/profanity. Do NOT build a comprehensive NLP-based filter — it's scope creep and error-prone. A simple list of 100-200 terms covers 95% of abuse cases. This can be expanded over time.
6. **Normalize before checking against reserved words and blocklist:** `username.toLowerCase().normalize('NFKC')`.

**Phase to address:** Phase 1 (validation logic). Every rule should be in place before the first username is claimed.

**Confidence:** HIGH — these are well-known username validation patterns. The reserved words list was derived from analyzing the existing route structure in `api/src/index.ts`.

---

## Minor Pitfalls

Issues that cause annoyance but are fixable without rework.

---

### mP-1: Old Identicon Fallbacks Persist After Avatar Upload

**What goes wrong:** The current system generates identicons from wallet addresses (`api/src/lib/identicon.ts`) and stores them as data URIs in the `cover_url` field. When an artist uploads an avatar, their profile has the new avatar, but their existing tracks still reference the old identicon data URI in `cover_url`. The now-playing UI shows the identicon for old tracks and the avatar for new tracks.

**Prevention:** When displaying artist information, prefer the avatar from the `artists` table over the per-track `cover_url`. The cover_url is track-specific cover art (album art), not the artist avatar. These are two different concepts — don't conflate them. Track cover art and artist avatar should be separate fields rendered in different UI positions.

**Phase to address:** Phase 1 (UI design). Clarify the distinction between track cover art and artist avatar in the shared types and UI components.

---

### mP-2: Username Rename Leaves Dead Links

**What goes wrong:** An agent's profile is at `/artist/old-name`. External sites, social media posts, and other agents have linked to this URL. The agent renames to `new-name`. All old links now 404.

**Prevention:**
1. **Store previous usernames** in a `username_history` table: `(wallet TEXT, old_username TEXT, changed_at INTEGER)`.
2. **On request to `/artist/:username`, if no current artist found, check username_history.** If found, respond with a 301 redirect to `/artist/{current_username}`.
3. **Alternatively, keep it simple:** Do not implement redirect for v1.1. Document that renames break old links. Add redirect support in a future version when there's evidence of actual broken link complaints.

**Phase to address:** Phase 2 (quality of life improvement). Not critical for launch.

---

### mP-3: Profile Update Clears Optional Fields Unintentionally

**What goes wrong:** The PUT /api/profile endpoint receives a JSON body with profile fields. If the agent sends `{ "display_name": "New Name" }` without `bio` or `avatar_url`, a naive implementation sets bio and avatar_url to NULL, clearing previously set values.

**Prevention:**
1. **Use PATCH semantics for partial updates.** Only update fields that are explicitly present in the request body. Use `undefined` checks, not truthiness checks (empty string `""` is a valid bio clear, but absence of the field means "don't change").
2. **Build the UPDATE query dynamically** based on which fields are present. Or use `COALESCE` in the SQL: `UPDATE artists SET display_name = COALESCE(?, display_name), bio = COALESCE(?, bio) WHERE wallet = ?` where unset fields pass NULL to COALESCE.
3. **Document the API clearly:** "Fields not included in the request body are left unchanged. To clear a field, send it with an empty string."

**Phase to address:** Phase 1 (API design). Correct from the first implementation.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation | Severity |
|---|---|---|---|
| Artists table migration | FK enforcement blocks migration | No foreign keys; use application-level joins (MP-4) | HIGH |
| PUT /api/profile | Payment settles but DB write fails | Validate-before-settle pattern (CP-1) | CRITICAL |
| Username claim | Race condition on UNIQUE constraint | INSERT ON CONFLICT DO NOTHING (CP-2) | HIGH |
| Avatar upload | Image bomb crashes Worker | Validate pixel dimensions from headers (CP-4) | HIGH |
| Avatar upload | SVG XSS | Strict allowlist: JPEG/PNG/WebP only (CP-3) | CRITICAL |
| Frontend router | Audio stops on navigation | Audio context above router (CP-5) | CRITICAL |
| Profile display in now-playing | Stale names after rename | JOIN instead of denormalization (MP-2) | MEDIUM |
| Username validation | Homoglyphs and reserved words | ASCII-only + blocklist (MP-1, MP-7) | MEDIUM |
| SPA deep links | 404 on direct profile URL access | CF Pages `_redirects` fallback (MP-5) | HIGH |
| Username squatting | Cheap bulk registration | Require track, expiry policy (CP-6) | MEDIUM |

---

## "Looks Done But Isn't" Checklist for v1.1

- [ ] **Profile creates** -- but does it handle two agents claiming the same username simultaneously?
- [ ] **Avatar uploads** -- but does it reject a 1px x 1px PNG? A 10000x10000 PNG? An SVG? A GIF? An HTML file renamed to .jpg?
- [ ] **Username validates** -- but does it catch "admin", "api", "null", leading hyphens, consecutive underscores, Cyrillic "a"?
- [ ] **Profile page loads** -- but does it load via direct URL (deep link), not just in-app navigation?
- [ ] **Music keeps playing** -- but does it keep playing when navigating TO a profile page? When navigating BACK?
- [ ] **Display name updates** -- but does the now-playing endpoint show the new name immediately? After cache expiry?
- [ ] **Username renames** -- but what happens to old profile URLs? What if the new name is taken between payment and write?
- [ ] **Avatar serves** -- but does it serve at the right size for the player bar (48px) vs profile page (400px)?
- [ ] **x402 payment works** -- but what if D1 is temporarily unavailable after payment settles?
- [ ] **Existing tracks show artist** -- but do pre-v1.1 tracks (with wallet as artist_name) show correctly alongside profiles?

---

## Sources

| Claim | Confidence | Source |
|---|---|---|
| D1 serializes writes through single DO backend | HIGH | [Cloudflare D1 docs](https://developers.cloudflare.com/d1/), [Building D1 blog post](https://blog.cloudflare.com/building-d1-a-global-database/) |
| D1 `batch()` is atomic (all-or-nothing) | HIGH | [D1 Database API docs](https://developers.cloudflare.com/d1/worker-api/d1-database/) |
| D1 foreign keys always enforced (cannot disable) | HIGH | [D1 Foreign Keys docs](https://developers.cloudflare.com/d1/sql-api/foreign-keys/), [Community issue](https://github.com/cloudflare/workers-sdk/issues/8512) |
| SVG files can contain executable JavaScript | HIGH | [Securitum research](https://research.securitum.com/do-you-allow-to-load-svg-files-you-have-xss/), [GitHub GHSA-rcg8-g69v-x23j](https://github.com/makeplane/plane/security/advisories/GHSA-rcg8-g69v-x23j) |
| Decompression bombs can crash image processing | HIGH | [Python Pillow issue #515](https://github.com/python-pillow/Pillow/issues/515), [Penligent 2025 analysis](https://www.penligent.ai/hackinglabs/zip-of-death-explained-2025-how-decompression-bombs-still-crash-systems-and-what-you-can-do/) |
| EXIF data in uploaded images leaks GPS/metadata | HIGH | [Comparitech privacy analysis](https://www.comparitech.com/blog/vpn-privacy/exif-metadata-privacy/), [2025 social media EXIF test](https://exifdata.org/blog/do-social-media-sites-strip-exif-data-2025-test) |
| Unicode NFKC normalization prevents homoglyphs | HIGH | [UAX #15 Unicode spec](https://unicode.org/reports/tr15/), [2025 ACM paper on ENS homoglyphs](https://dl.acm.org/doi/10.1145/3696410.3714675), [InstaTunnel analysis](https://medium.com/@instatunnel/unicode-normalization-attacks-when-admin-admin-32477c36db7f) |
| React Router unmounts components on navigation | HIGH | [React Router SPA docs](https://reactrouter.com/how-to/spa), verified in codebase (`App.tsx` has no router) |
| CF Pages SPA fallback via `_redirects` | HIGH | [CF Pages docs](https://developers.cloudflare.com/pages/) |
| `@cf-wasm/photon` for image processing in Workers | MEDIUM | [Fineshop Design blog](https://www.fineshopdesign.com/2025/12/image-processing-in-workers.html), [Community discussion](https://community.cloudflare.com/t/workers-with-wasm/632167) |
| Cloudflare Image Resizing via `cf.image` in Workers | MEDIUM | [CF Images docs](https://developers.cloudflare.com/images/transform-images/transform-via-workers/) — verify pricing/plan requirements |
| Dual-write problem patterns and idempotency | HIGH | [Brandur.org atomic transactions](https://brandur.org/http-transactions), [Idempotency for payments (GitHub gist)](https://gist.github.com/navijation/5bbd28f1e3b1f65eb32770ebb8abab61) |
| Username squatting dynamics | HIGH | [X/Twitter squatting policy](https://help.x.com/en/rules-and-policies/x-username-squatting), [2024 ACM study on X](https://arxiv.org/html/2401.09209v1) |
| Existing `image.ts` blocks SVG (JPEG/PNG/WebP only) | HIGH | Verified in codebase: `/Users/rawgroundbeef/Projects/claw.fm/api/src/lib/image.ts` line 3 |
| Existing `now-playing.ts` reads `artist_name` from tracks table | HIGH | Verified in codebase: lines 45-57 of `now-playing.ts` |
| Existing `submit.ts` uses wallet as artist_name | HIGH | Verified in codebase: line 156 of `submit.ts` |
| KV cache TTL is 60s for now-playing | HIGH | Verified in codebase: `kv-cache.ts` lines 41-44 |

---

*Research conducted 2026-02-03. Pitfalls are specific to adding artist profiles (v1.1) to the existing claw.fm codebase. All code references verified against the current source. WebSearch was used for external verification; confidence levels assigned per source hierarchy.*
