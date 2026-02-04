# Technology Stack: v1.1 Artist Profiles

**Project:** claw.fm
**Milestone:** v1.1 Artist Profiles
**Researched:** 2026-02-03
**Scope:** Stack additions/changes for artist profiles only (existing stack not re-evaluated)
**Overall confidence:** HIGH

---

## Executive Summary

Artist profiles require three new capabilities the existing stack lacks: (1) server-side image resizing for avatar uploads, (2) client-side routing for profile pages, and (3) username validation. The good news: all three can be solved with minimal additions. The Cloudflare Images binding handles avatar resizing natively without WASM complexity. React Router v7 in declarative mode adds client-side routing with a single dependency. Username validation needs no library -- a regex plus a hand-curated blocklist in `@claw/shared` is the right weight for this project.

**Total new dependencies: 1** (`react-router`)
**Total new CF bindings: 1** (Images)
**Total new CF services: 0** (Images free tier covers this volume)

---

## New Stack Additions

### 1. Image Processing: Cloudflare Images Binding

| Attribute | Detail |
|-----------|--------|
| Technology | Cloudflare Images Binding (native Workers API) |
| Version | Current (GA since Feb 2025) |
| Purpose | Resize and re-encode avatar uploads before storing in R2 |
| Confidence | HIGH |

**Why this over alternatives:**

| Option | Verdict | Reasoning |
|--------|---------|-----------|
| **CF Images Binding** | **RECOMMENDED** | Native to Workers runtime. No WASM bundle overhead. Handles resize + format conversion in one call. Free tier of 5,000 unique transformations/month is more than sufficient for profile avatars. Works directly with R2 bytes -- no URL needed. Supported in local dev via Wrangler. |
| `@cf-wasm/photon` (v0.3.4) | Not recommended | Third-party WASM library. 128MB Worker memory limit is a concern. Known production issues with images >3MB. Adds WASM binary to Worker bundle size. More moving parts for a simple resize operation. |
| Client-side only resize (Canvas API) | Not sufficient alone | Cannot trust client-side validation for security. Malicious clients can bypass canvas resize and send arbitrary data. Server must validate and re-process regardless. |
| Sharp | Not possible | Requires Node.js native bindings. Does not work in Workers `workerd` runtime. |

**Configuration -- add to `api/wrangler.toml`:**

```toml
[images]
binding = "IMAGES"
```

**TypeScript binding type addition in `api/src/index.ts`:**

```typescript
type Bindings = {
  DB: D1Database
  AUDIO_BUCKET: R2Bucket
  PLATFORM_WALLET: string
  QUEUE_BRAIN: DurableObjectNamespace
  KV: KVNamespace
  DOWNLOAD_SECRET: string
  IMAGES: ImagesBinding  // NEW for v1.1
}
```

**Usage pattern for avatar processing:**

```typescript
// Receive avatar as File from multipart upload
// Validate MIME type with file-type (already a dependency)
// Then resize + re-encode via Images binding:

const resized = await env.IMAGES
  .input(avatarBytes)
  .transform({ width: 256, height: 256, fit: "cover" })
  .output({ format: "webp", quality: 80 })

// Upload resized result to existing R2 bucket
await env.AUDIO_BUCKET.put(`avatars/${wallet}.webp`, resized.image(), {
  httpMetadata: { contentType: "image/webp" }
})
```

**Avatar sizing strategy:**
- Store one size: 256x256 WebP (good balance of quality and file size at ~10-30KB)
- `fit: "cover"` crops to square, matching avatar display aspect ratio
- WebP output for smallest file size with good quality
- No need for multiple sizes -- avatars display at 32-64px in the player and ~128px on profile pages; the browser handles downscaling from 256px efficiently
- Previous avatar is overwritten on update (same R2 key path keyed by wallet address)

**Cost:** Free. All Cloudflare accounts include 5,000 unique transformations/month at no charge. Each avatar upload counts as 1 unique transformation. Even aggressive profile creation will not approach this limit. Exceeding the limit returns a 9422 error (not an auto-charge), so there is zero surprise billing risk. If the project scales past 5,000 avatar uploads/month, the paid tier is $0.50 per 1,000 transformations.

**Local development:** The Images binding works in Wrangler local dev at no charge. The local offline version supports `width`, `height`, `rotate`, and `format` operations -- which covers everything needed for avatar resizing.

**Sources:**
- [CF Images Binding Docs](https://developers.cloudflare.com/images/transform-images/bindings/) -- HIGH confidence
- [CF Images Tutorial: Transform user-uploaded images to R2](https://developers.cloudflare.com/images/tutorials/optimize-user-uploaded-image/) -- HIGH confidence
- [CF Images Pricing](https://developers.cloudflare.com/images/pricing/) -- HIGH confidence
- [CF Blog: Images Binding for Workers (Apr 2025)](https://blog.cloudflare.com/improve-your-media-pipelines-with-the-images-binding-for-cloudflare-workers/) -- MEDIUM confidence

---

### 2. Client-Side Routing: React Router v7

| Attribute | Detail |
|-----------|--------|
| Technology | `react-router` |
| Version | `^7.12.0` (latest stable as of 2026-02-03) |
| Purpose | Client-side routing for `/artist/:username` profile pages |
| Confidence | HIGH |

**Why this:**

The frontend currently has zero routing -- `App.tsx` renders a single full-page view with no URL-based navigation. Artist profile pages at `/artist/:username` require client-side routing. React Router v7 in **declarative mode** is the standard, smallest-footprint solution.

**Key v7 change:** In React Router v7, `react-router-dom` is no longer needed. All exports come from the unified `react-router` package. `react-router-dom` still exists as a re-export for migration convenience, but new installs should use `react-router` only.

| Option | Verdict | Reasoning |
|--------|---------|-----------|
| **React Router v7 (declarative mode)** | **RECOMMENDED** | Industry standard for React SPAs. Declarative mode is the lightest weight (tree-shakes well). Non-breaking from v6 patterns. Single `react-router` package. Direct `useParams()` hook for extracting `:username`. Supports `<Link>` for in-app navigation without full page reload. |
| TanStack Router | Not recommended | More powerful but heavier for this use case. Project needs only 2-3 routes total. Type-safe file-based routing is overkill here. Good choice if the app had 10+ routes with complex data loading. |
| Wouter | Not recommended | Lighter than React Router but smaller ecosystem. Missing features that may be needed later (nested routes, `<Outlet>`). Premature optimization to save ~4KB. |
| No router (manual `window.location` parsing) | Not recommended | Fragile. No back/forward button support without reimplementing browser history. Not worth the DX cost for any app with more than one route. |

**Installation:**

```bash
cd /Users/rawgroundbeef/Projects/claw.fm/web && pnpm add react-router
```

**Integration in `main.tsx` -- wrap with BrowserRouter:**

```typescript
import { BrowserRouter } from "react-router"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WalletProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </WalletProvider>
  </StrictMode>
)
```

**Route structure in `App.tsx`:**

```typescript
import { Routes, Route } from "react-router"

// The current App content becomes the "/" route component (RadioView)
// New ArtistProfile component handles "/artist/:username"
<Routes>
  <Route path="/" element={<RadioView />} />
  <Route path="/artist/:username" element={<ArtistProfile />} />
</Routes>
```

**Why declarative mode, not framework mode:** Framework mode (file-based routing, SSR, loaders/actions) requires a different project structure and build tooling. Declarative mode keeps the existing Vite build pipeline completely untouched. This is a pure client-rendered SPA with 2-3 routes, not a full-stack framework app.

**Cloudflare Pages SPA fallback -- no changes needed:** The current deployment on CF Pages has no `404.html` file in the build output. CF Pages behavior: when no `404.html` exists, it serves `index.html` for all unmatched paths. This means `/artist/someuser` will correctly load the SPA bundle, and React Router will handle the route client-side. No `_redirects` file, no wrangler config changes, no Pages Functions changes needed. This was confirmed by examining the `web/public/` directory (contains only `favicon.svg` and `skill.md`, no `404.html`).

**Vite dev server proxy -- add artist routes:** The existing `vite.config.ts` proxies `/api` and `/audio` to the local Worker. Profile API calls (`/api/artists/*`) will be caught by the existing `/api` proxy rule. No vite config changes needed.

**Sources:**
- [React Router v7 Declarative Installation](https://reactrouter.com/start/declarative/installation) -- HIGH confidence
- [React Router v7 Modes](https://reactrouter.com/start/modes) -- HIGH confidence
- [React Router npm](https://www.npmjs.com/package/react-router) -- HIGH confidence
- [CF Pages: Deploy a React site](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/) -- HIGH confidence

---

### 3. Username Validation: No Library Needed

| Attribute | Detail |
|-----------|--------|
| Technology | Custom regex + blocklist in `@claw/shared` |
| Version | N/A (custom code) |
| Purpose | Validate usernames on both client and server |
| Confidence | HIGH |

**Why no library:**

| Option | Verdict | Reasoning |
|--------|---------|-----------|
| **Custom regex + blocklist** | **RECOMMENDED** | Zero dependencies. Runs identically in both Workers and browser via the shared package. Full control over rules. Blocklist is domain-specific to claw.fm URL routes. Tiny code footprint (~50 lines). Easy to extend. |
| `the-big-username-blacklist` (v1.5.2) | Not recommended | Last published 7+ years ago. Generic list not tailored to claw.fm URL structure. Adds a dependency for something trivially implementable. Missing claw.fm-specific reserved words (`api`, `audio`, `health`, `queue`, etc.). |
| Zod schema | Overkill | Adds a dependency for one validation rule. The project does not use Zod elsewhere. Regex is simpler for this specific case. |

**Validation rules (implement in `packages/shared/src/index.ts`):**

```typescript
export const USERNAME_RULES = {
  MIN_LENGTH: 3,
  MAX_LENGTH: 20,
  // Lowercase alphanumeric + hyphens + underscores
  // Must start and end with a letter or digit
  PATTERN: /^[a-z0-9][a-z0-9_-]*[a-z0-9]$/,
} as const

// Reserved words that conflict with claw.fm routes or system terms
export const RESERVED_USERNAMES = new Set([
  // claw.fm routes (CRITICAL - these would conflict with URL paths)
  'artist', 'artists', 'api', 'audio', 'health', 'queue',
  'submit', 'tip', 'download', 'downloads', 'genres',
  'now-playing', 'dev',
  // Common web routes
  'admin', 'login', 'logout', 'signup', 'register',
  'settings', 'profile', 'account', 'help', 'support',
  'about', 'contact', 'privacy', 'terms', 'tos',
  'faq', 'blog', 'news', 'feed', 'search',
  'home', 'index', 'static', 'assets', 'public',
  // System/privilege terms
  'root', 'system', 'null', 'undefined', 'mod',
  'moderator', 'staff', 'team', 'official',
  'claw', 'clawfm', 'claw-fm',
  // Financial/platform terms
  'payment', 'billing', 'wallet', 'usdc', 'base',
  'x402', 'platform',
])

export function validateUsername(
  username: string
): { valid: boolean; error?: string } {
  const normalized = username.toLowerCase().trim()

  if (normalized.length < USERNAME_RULES.MIN_LENGTH) {
    return { valid: false, error: `Username must be at least ${USERNAME_RULES.MIN_LENGTH} characters` }
  }
  if (normalized.length > USERNAME_RULES.MAX_LENGTH) {
    return { valid: false, error: `Username must be at most ${USERNAME_RULES.MAX_LENGTH} characters` }
  }
  if (!USERNAME_RULES.PATTERN.test(normalized)) {
    return { valid: false, error: 'Username must start and end with a letter or number, and contain only lowercase letters, numbers, hyphens, and underscores' }
  }
  if (RESERVED_USERNAMES.has(normalized)) {
    return { valid: false, error: 'This username is reserved' }
  }
  return { valid: true }
}
```

**Why this lives in `@claw/shared`:** Validation runs on both client (instant feedback while typing) and server (authoritative check before DB insert). The shared package already holds types and constants consumed by both `web` and `api`. This is the established pattern for cross-boundary code in this project (see `GENRES`, `Track`, `SubmissionError`, etc.).

**Why lowercase-only:** Prevents confusion between `DJClaw` and `djclaw`. Usernames are normalized to lowercase on input. Display names (separate field) can have any casing.

---

## What NOT to Add

| Technology | Why Not |
|------------|---------|
| **Cropper.js / react-easy-crop** | Over-engineered for this use case. Agents (primary profile creators) are API clients -- they upload an image file, not drag a crop handle. The server-side `fit: "cover"` on the Images binding handles cropping to square automatically. If a human-facing interactive crop UI is wanted later, it can be added as a separate enhancement. |
| **Sharp** | Cannot run in CF Workers. Not an option regardless of how much one might want it. |
| **`@cf-wasm/photon` (v0.3.4)** | The CF Images binding is a better fit for this use case. Native, managed, no WASM bundle size increase, no 128MB Worker memory ceiling concern, free tier is sufficient. Photon is the right choice only for pixel-level manipulation (filters, effects, watermarks) that the Images binding does not support. Simple avatar resize does not need this. |
| **`react-router-dom`** | Deprecated package name in v7. Everything is in the unified `react-router` package now. `react-router-dom` still exists as a re-export but new installs should use `react-router`. |
| **Zod / Yup / Joi** | Validation schema libraries are disproportionate for one simple rule (username format). The project does not use schema validation elsewhere. Adding one adds bundle weight with no proportional benefit. |
| **Image CDN (Cloudinary, ImageKit)** | External paid dependency for something CF handles natively and for free at this scale. Avatars are small, infrequent, and already stored on R2. |
| **New R2 bucket** | Avatars go in the existing `AUDIO_BUCKET` (`claw-fm-audio`) under an `avatars/` key prefix. Same bucket, different key prefix. No new binding needed. R2 does not have directory semantics -- the key prefix is purely organizational. |
| **New KV namespace** | Username-to-wallet lookups belong in D1, not KV. KV is eventually consistent and cannot enforce UNIQUE constraints needed for username reservation. D1 (SQLite) provides UNIQUE indexes natively. The existing KV namespace can optionally cache popular profile lookups later. |
| **Authentication library (JWT, Passport, etc.)** | x402 payment IS the auth mechanism. The existing `verifyPayment` middleware extracts the wallet address from the payment receipt. This is the proven pattern from track submission. No new auth dependency needed. |
| **Form library (react-hook-form, Formik)** | The profile form has 4 fields (username, display name, bio, avatar file). A form library adds more code than it saves at this scale. Controlled React state with `useState` is sufficient and is the established pattern in this codebase (see `SubmitModal.tsx`). |
| **zustand / state management** | The existing codebase does not use a state management library. Profile data is fetched per-page with simple `fetch` + `useState` + `useEffect`. Adding zustand for one new feature would be inconsistent with the codebase conventions. |

---

## Existing Stack Reuse

These existing capabilities directly support artist profiles with zero changes:

| Existing Component | How It's Reused for Profiles |
|----------|----------------|
| **`file-type` (v21.3.0)** in api | Already validates image MIME types via magic bytes for cover art. Reuse identically for avatar upload validation. Already imported in `api/src/lib/image.ts` and `api/src/middleware/validation.ts`. |
| **`@claw/shared` package** | Add username validation rules, profile types (`ArtistProfile`, `ProfileResponse`), and API interfaces. Both `web` and `api` already consume this package via `workspace:*`. |
| **`verifyPayment` middleware** (`api/src/middleware/x402.ts`) | x402 payment verification for profile creation/update. Identical pattern to track submission -- change only `maxAmountRequired`, `resource`, and `description` fields. |
| **R2 `AUDIO_BUCKET` binding** | Store avatars under `avatars/{wallet}.webp` prefix. Same bucket, same binding. Presigned URL infrastructure from `api/src/lib/presigned.ts` can serve avatar images if needed. |
| **D1 database** | New `artists` table via migration (0003). D1 already handles tracks; profiles are a simpler schema. |
| **KV namespace** | Optional: cache resolved artist profiles for the now-playing response hot path. Existing `KV` binding works. Pattern: cache profile data with TTL, invalidate on profile update. |
| **Hono framework** (`^4.7.4`) | Add new route file `api/src/routes/artists.ts` following the exact pattern of `submit.ts`, `tip.ts`, etc. Hono's `c.req.parseBody()` handles multipart avatar uploads identically to how it handles track submission. |
| **Tailwind CSS** (`^3.4.17`) | Style profile pages, forms, and avatar display. No config changes needed. |
| **Wagmi v2 + OnchainKit** | Wallet connection for the profile creation payment flow. The connected wallet address identifies who is creating/updating the profile. Already integrated in the frontend. |
| **`sonner` (`^2.0.7`)** | Show success/error toasts for profile creation, avatar upload, username changes. Already in the frontend. |
| **`blockies-ts` (`^1.0.0`)** | Continue generating identicon fallback when no avatar is uploaded. Already works in `api/src/lib/identicon.ts`. Also useful as client-side fallback avatar display. |
| **CF Pages Functions proxy** (`web/functions/api/[[path]].ts`) | The existing catch-all proxy function forwards `/api/*` requests to the Worker. New `/api/artists/*` endpoints will be proxied automatically. No changes needed. |

---

## Database Changes

New migration file: `api/migrations/0003_artists-table.sql`

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

**Design decisions:**

- **`wallet` as PRIMARY KEY:** One wallet = one profile. The wallet address is already the identity system (proven in v1.0). No auto-increment ID needed.
- **Separate table, not columns on `tracks`:** Artist data (username, bio, avatar) is per-wallet, not per-track. A separate table avoids denormalization. Profile updates are atomic -- change display name once and all tracks reflect it via JOIN (`tracks.wallet = artists.wallet`).
- **`username` with UNIQUE constraint:** Enforced at the database level. D1 (SQLite) handles this natively. The application layer validates format; the database enforces uniqueness.
- **`avatar_url` is an R2 key path:** Stores the R2 object key (e.g., `avatars/0xabc123.webp`), not a full URL. The serving layer constructs the full URL, same pattern as `tracks.file_url` and `tracks.cover_url`.

**Linking profiles to tracks for display:**

```sql
-- Now-playing query becomes a LEFT JOIN:
SELECT t.*, a.username, a.display_name, a.avatar_url
FROM tracks t
LEFT JOIN artists a ON t.wallet = a.wallet
WHERE t.id = ?
```

The `LEFT JOIN` ensures tracks without profiles still return (with NULL artist fields), maintaining backward compatibility with the existing `NowPlayingTrack` response shape.

---

## API Endpoint Design

New route file: `api/src/routes/artists.ts`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `PUT` | `/api/artists` | x402 (0.01 USDC) | Create or update profile (upsert) |
| `GET` | `/api/artists/:username` | None | Get public profile by username |
| `GET` | `/api/artists/wallet/:address` | None | Get profile by wallet address |

**Why PUT (upsert) instead of POST + PATCH:**
- Idempotent. Client sends full desired profile state.
- If profile exists for this wallet, update it. If not, create it.
- Simplifies the API surface -- one endpoint instead of two.
- The x402 payment applies equally to creation and updates (including username changes).

**Payment configuration:**

```typescript
await verifyPayment(c, {
  scheme: 'exact',
  network: 'base',
  maxAmountRequired: '10000', // 0.01 USDC (6 decimals)
  asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  resource: '/api/artists',
  description: 'Profile creation/update fee',
  payTo: c.env.PLATFORM_WALLET,
})
```

This is identical to the track submission payment pattern in `api/src/routes/submit.ts`, with only `resource` and `description` changed.

---

## Shared Package Type Additions

New types to add to `packages/shared/src/index.ts`:

```typescript
// Artist profile types
export interface ArtistProfile {
  wallet: string
  username: string
  displayName: string
  bio?: string
  avatarUrl?: string
  createdAt: number
  updatedAt: number
}

export interface ProfileResponse {
  profile: ArtistProfile
  tracks: Track[]  // Artist's track catalog
}

export interface ProfileUpdateRequest {
  username: string
  displayName: string
  bio?: string
  // avatar is sent as File in multipart, not in JSON body
}

// Update NowPlayingTrack to include profile fields
export interface NowPlayingTrack {
  id: number
  title: string
  artistWallet: string
  artistName?: string
  artistUsername?: string   // NEW: for linking to /artist/:username
  artistAvatarUrl?: string  // NEW: for showing avatar in player
  duration: number
  coverUrl?: string
  fileUrl: string
  genre: string
}
```

---

## Full Dependency Delta

| Package | Where | Action | Version | Purpose |
|---------|-------|--------|---------|---------|
| `react-router` | web | ADD | ^7.12.0 | Client-side routing for `/artist/:username` pages |
| CF Images binding | api (wrangler.toml) | CONFIGURE | N/A (native) | Server-side avatar resizing |

**That is the complete list.** One npm package and one Cloudflare binding configuration. Everything else is custom code using existing dependencies.

---

## Installation Summary

### API (Worker)

No new npm packages. Add to `api/wrangler.toml`:

```toml
[images]
binding = "IMAGES"
```

Add migration file `api/migrations/0003_artists-table.sql` (contents above).

### Frontend (Web)

```bash
cd /Users/rawgroundbeef/Projects/claw.fm/web && pnpm add react-router
```

### Shared Package

No new dependencies. Add validation code and types to `packages/shared/src/index.ts`.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| CF Images binding not available on account | LOW | HIGH | Free tier is available on all CF accounts by default. Verify availability in the dashboard before starting. Fallback: skip server-side resize and store original uploads with a 1MB size cap (accept slightly larger files). |
| Images binding local dev limitations | LOW | LOW | Local offline mode supports width, height, format -- exactly what avatars need. Full-fidelity online mode available if needed. |
| React Router v7 breaking existing SPA | VERY LOW | MEDIUM | Declarative mode is purely additive. Wrapping in `<BrowserRouter>` and adding `<Routes>` does not break the existing single-view app. The `/` route renders the current `App` content. Upgrade from zero-routes to two-routes is the simplest possible React Router integration. |
| CF Pages not serving `/artist/:username` correctly | VERY LOW | HIGH | Confirmed: no `404.html` exists in `web/public/`, so CF Pages already serves `index.html` for all unmatched paths (default SPA behavior). React Router handles routing client-side. |
| Username squatting | MEDIUM | LOW | x402 payment cost (0.01 USDC per create/update) deters bulk squatting. Reserved word blocklist prevents system route conflicts. Mutable usernames mean no permanent lock-out -- squatted names can be released. |
| Avatar upload abuse (large/malicious files) | LOW | MEDIUM | Existing `file-type` magic-byte validation + size cap (e.g., 2MB for avatars, smaller than the 5MB cover art limit). Images binding will reject files it cannot process. R2 key is deterministic per wallet, so repeated uploads overwrite rather than accumulate. |

---

## Sources

### HIGH Confidence (Official Documentation)
- [Cloudflare Images Binding Docs](https://developers.cloudflare.com/images/transform-images/bindings/)
- [CF Images: Transform user-uploaded images tutorial](https://developers.cloudflare.com/images/tutorials/optimize-user-uploaded-image/)
- [CF Images Pricing](https://developers.cloudflare.com/images/pricing/)
- [CF Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [React Router v7 Declarative Installation](https://reactrouter.com/start/declarative/installation)
- [React Router v7 Modes](https://reactrouter.com/start/modes)
- [CF Pages: Deploy a React site](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/)
- [CF Pages/Workers SPA Routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)

### MEDIUM Confidence (Verified Blog/Announcement)
- [CF Blog: Images Binding for Workers (Apr 2025)](https://blog.cloudflare.com/improve-your-media-pipelines-with-the-images-binding-for-cloudflare-workers/)
- [CF Changelog: Images bindings in Workers (Feb 2025)](https://developers.cloudflare.com/changelog/2025-02-21-images-bindings-in-workers/)
- [React Router npm page (v7.12.0)](https://www.npmjs.com/package/react-router)
- [@cf-wasm/photon npm](https://www.npmjs.com/package/@cf-wasm/photon) -- evaluated, not recommended

### LOW Confidence (Community/Third-party, evaluated but not adopted)
- [The-Big-Username-Blocklist GitHub](https://github.com/marteinn/The-Big-Username-Blocklist) -- evaluated, not recommended
- [Fineshop: Image processing in CF Workers](https://www.fineshopdesign.com/2025/12/image-processing-in-workers.html)
