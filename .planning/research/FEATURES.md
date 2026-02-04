# Feature Landscape: Artist Profiles (v1.1)

**Domain:** Artist identity and profile systems for a 24/7 AI-agent music radio station
**Researched:** 2026-02-03
**Overall confidence:** HIGH (verified against multiple platform patterns, existing codebase reviewed)

## Reference Domains

Artist profile features were evaluated by studying patterns from four categories:

1. **Major music streaming** (Spotify, Apple Music) -- gold standard for profile page UX and player attribution
2. **Creator-first platforms** (SoundCloud, Bandcamp) -- relevant for independent artist self-managed profiles
3. **Web3 music platforms** (Audius, Sound.xyz) -- directly relevant for wallet-based identity + crypto payments
4. **AI-specific platforms** (Audius AI attribution) -- the only existing precedent for AI-as-artist identity

The key insight: claw.fm's artist profiles are uniquely constrained. The "artist" is an AI agent, the identity anchor is a wallet address, authentication is via x402 payment (not sessions/OAuth), and the platform is radio (not on-demand). This means many traditional profile patterns (followers, playlists, social features) are explicitly out of scope, while agent-specific patterns (programmatic profile creation, bot-friendly APIs) are unusually important.

---

## Table Stakes

Features that listeners and agent operators will expect once profiles exist. Missing any of these makes the feature feel incomplete or broken.

| # | Feature | Why Expected | Complexity | Confidence | Depends On |
|---|---------|-------------|------------|------------|------------|
| T1 | **Display name in player UI** | Every music player shows artist name, not a hex string. The current truncated wallet address (`0xABCD...1234`) is a placeholder. Once profiles exist, the player MUST show the display name. Spotify, SoundCloud, Audius, Bandcamp -- all show artist names prominently. | Low | HIGH | Profile data available in now-playing API response |
| T2 | **Artist name links to profile page** | When listeners see an artist name in the player or main view, they expect to click it and learn more. Spotify artist names are clickable. SoundCloud track attribution links to the uploader profile. This is table stakes for any platform with profiles. | Low | HIGH | Client-side routing (`/artist/:username`), profile page exists |
| T3 | **Profile page with track catalog** | The profile page must show the artist's submitted tracks. This is the #1 expected element on any artist page -- Spotify's "Popular Tracks" section, SoundCloud's tracks tab, Bandcamp's discography. Without a track list, the profile page is useless. | Medium | HIGH | API endpoint: `GET /api/artist/:username/tracks`, D1 query joining profiles to tracks |
| T4 | **Username (handle) system** | Agents and listeners need a human-readable identifier beyond wallet addresses. Every platform has handles: `@handle` on Audius/SoundCloud, artist URL slugs on Spotify/Bandcamp. The username becomes the URL slug (`/artist/:username`). | Medium | HIGH | New `artists` table in D1, uniqueness constraint, validation |
| T5 | **Display name (separate from username)** | Audius distinguishes `handle` (unique, URL-safe) from `name` (flexible display name with spaces/special chars). SoundCloud has profile name vs URL. This separation is universal because usernames must be URL-safe but display names should be expressive. | Low | HIGH | Two separate fields in the `artists` table |
| T6 | **Avatar image with fallback** | Every music platform shows artist images. Spotify has circular artist avatars. SoundCloud has profile photos. The identicon system already exists in claw.fm (used for cover art fallback). Profiles without avatars should fall back to the wallet-derived identicon. | Medium | HIGH | Avatar upload to R2, identicon fallback already exists in `api/src/lib/identicon.ts` |
| T7 | **Bio/description field** | Artist pages universally include a bio. Spotify: 1500 chars. SoundCloud: 4000 chars. Bandcamp: 400 chars before truncation. For claw.fm, a shorter limit is appropriate -- agents are concise. | Low | HIGH | Text field in `artists` table, character limit validation |
| T8 | **Profile creation via API (agent-friendly)** | Since artists are AI agents, profile creation MUST be programmatic (API call, not web form). Agents create profiles the same way they submit tracks: via HTTP request with x402 payment. This is non-negotiable for an agent-first platform. | Medium | HIGH | New API endpoint `POST /api/artist`, x402 middleware (already exists) |
| T9 | **Profile update via API** | Agents must be able to update their display name, bio, and avatar programmatically. Same API pattern as creation. Audius allows display name changes freely. | Medium | HIGH | `PUT /api/artist` endpoint, x402 gated |
| T10 | **Graceful fallback for tracks without profiles** | Not all submitters will create profiles immediately. Tracks submitted before profile creation must still display correctly with the truncated wallet address fallback. The NowPlaying component already does this (`track.artistName || truncated wallet`). | Low | HIGH | Already partially implemented in `NowPlaying.tsx` line 14 |

### Table Stakes Assessment

The planned v1.1 scope covers T1-T9 well. T10 is the critical graceful degradation requirement -- the system must work seamlessly for both profiled and un-profiled artists.

**Gap identified:** T3 (track catalog on profile page) requires careful thought about how tracks link to profiles. Currently, tracks store a `wallet` field and an `artist_name` field (set to the wallet address at submission time). The profile system needs to join on wallet address, not rely on the `artist_name` field being updated retroactively.

---

## Differentiators

Features that set claw.fm's artist profile system apart from conventional music platforms. These create the unique value proposition.

| # | Feature | Value Proposition | Complexity | Confidence | Depends On |
|---|---------|-------------------|------------|------------|------------|
| D1 | **x402-gated profile creation (anti-squatting)** | Pay 0.01 USDC to create a profile. This is elegant: it uses the same payment mechanism as track submission, requires no new auth system, and prevents username squatting by making every registration cost money. No other music platform charges for profile creation -- but no other platform has AI agents as artists. The cost is trivial for legitimate agents but prohibitive for mass squatting bots. | Low | HIGH | x402 middleware already exists and is proven |
| D2 | **Mutable usernames (paid change)** | Most platforms make handles permanent (Audius handles cannot be changed; you must create a new account). claw.fm's approach -- change your username anytime for the x402 fee -- is more forgiving and agent-friendly. Agents may want to rebrand. The payment deters abuse while allowing flexibility. | Medium | HIGH | Username availability check, old username release logic |
| D3 | **Agent-as-artist transparency** | Unlike Audius's opt-in AI attribution (where humans opt in to having AI tracks on their profile), claw.fm is agent-first: every artist IS an agent. This should be visible in the UI -- not hidden or ambiguous. The profile page should make it clear this is an AI agent, showing the wallet address alongside the display name. This is a feature, not a limitation. | Low | HIGH | UI design choice, no technical dependency |
| D4 | **Programmatic profile management (API-only creation)** | Profiles are created and managed entirely via API, matching how agents operate. No web forms, no OAuth flows, no email verification. The agent's wallet IS its authentication (verified by x402 payment). This is fundamentally different from every other music platform and perfectly aligned with agent-first design. | Medium | HIGH | Already the planned approach |
| D5 | **Wallet address as permanent identifier** | Even if display names and usernames change, the wallet address is the immutable identity anchor. Profile pages should expose this clearly. Listeners who tipped can always verify: "I tipped wallet 0xABC, which is now known as CoolAgent." On-chain transaction history provides provenance that no username system can. | Low | HIGH | Wallet already stored in `tracks` table, profile table links wallet to username |
| D6 | **Retroactive attribution** | When an agent creates a profile, ALL their previously submitted tracks should immediately show the new display name. No need to re-submit. This is a significant UX win and distinguishes from platforms where you must update each track individually. | Medium | MEDIUM | Requires now-playing API to join on wallet rather than using stored `artist_name` |

### Differentiator Assessment

D1 (x402-gated profiles) is the strongest differentiator. It solves username squatting, removes the need for a separate auth system, and maintains consistency with the existing x402 pattern. This should be emphasized in documentation and agent onboarding.

D6 (retroactive attribution) needs careful implementation. The current `artist_name` field in the tracks table is set to the wallet address at submission time. For retroactive attribution, the now-playing API and profile page must JOIN against the artists table rather than relying on the stored `artist_name` field.

---

## Anti-Features

Things to deliberately NOT build for artist profiles. Each one seems reasonable but would hurt the product.

| # | Anti-Feature | Why It Seems Appealing | Why Avoid | What to Do Instead | Confidence |
|---|-------------|----------------------|-----------|-------------------|------------|
| A1 | **Follower/following system** | "Listeners can follow their favorite agents!" | Requires user accounts for listeners (currently no accounts needed). Adds social graph complexity, notification systems, feed algorithms. Fundamentally changes the product from radio to social platform. Already explicitly out of scope per PROJECT.md. | The tip/buy transaction IS the engagement signal. Agents that get more tips naturally get more play time via tip_weight in the decay rotation. | HIGH |
| A2 | **Profile verification badges** | "Distinguish 'real' agents from squatters" | There's no concept of a "verified" agent in an autonomous agent ecosystem. Who verifies? What criteria? Verification implies a trust hierarchy that doesn't exist. The x402 payment IS verification -- you paid, you're real. | The wallet address + on-chain payment history IS verification. Every profile has a provable creation transaction. | HIGH |
| A3 | **Profile analytics dashboard (web UI)** | "Agents need to see their play counts and earnings" | Agents interact via API, not web dashboards. Building a dashboard UI requires authenticated views, chart components, time-series queries. Large surface area with no listener value. Already out of scope per PROJECT.md ("agents can query the API directly"). | Expose stats via API endpoint: `GET /api/artist/:username/stats` returning `{ trackCount, totalPlays, totalTips }`. Agents consume this programmatically. | HIGH |
| A4 | **Social links on profiles** | "Let agents link to their Twitter/website" | Agents don't have Twitter accounts or websites. Social links are a human-artist pattern. Adding them creates empty fields that make profiles look sparse. Worse, they could be abused for phishing/spam links with no moderation. | The wallet address IS the agent's identity link. Anyone can look up the wallet on Basescan to see its full transaction history. | HIGH |
| A5 | **Cover photo / banner image** | "Spotify and SoundCloud have banners" | Adds image upload complexity (different dimensions than avatar), storage cost, and moderation concerns. For a compact profile page that's primarily a track catalog, a banner is visual bloat. Agents generating good banner images is an unreasonable expectation. | Avatar + bio + track list is sufficient. The profile page should be information-dense, not decoration-heavy. | HIGH |
| A6 | **Profile comments / guestbook** | "Let listeners leave messages for agents" | Moderation nightmare. AI-generated music will attract strange commentary. No agent can read or respond to comments (they're AI). Comments create legal liability. Already out of scope ("Social features on profiles -- profiles are identity, not social network"). | Tips with preset amounts are the listener-to-agent communication channel. Money talks. | HIGH |
| A7 | **Multiple wallets per profile** | "What if an agent uses different wallets?" | Massive trust/security complexity. How do you prove wallet B belongs to the same entity as wallet A? Requires a linking protocol, increases attack surface. One wallet = one artist identity is clean and simple. | Each wallet is a separate artist identity. If an agent wants multiple personas, it uses multiple wallets -- and creates a profile for each (paying x402 each time). | HIGH |
| A8 | **Profile deletion/deactivation** | "Agents should be able to remove their profiles" | Tracks already submitted are in the queue. Deleting a profile creates orphaned tracks with no attribution. What happens to tip history? Deletion is complex and the x402 payment makes profiles non-refundable. | Profiles are permanent once created. Display name and bio can be updated (via paid x402 call). Username can be changed (also paid). If an agent truly abandons, the profile simply becomes dormant. Tracks naturally decay out of rotation via the 10-day half-life. | MEDIUM |
| A9 | **Image cropping/editing tool** | "Let users crop their avatar on upload" | Adds client-side image manipulation UI complexity (crop area, preview, aspect ratio enforcement). Agents submit avatars via API -- they can't use a crop tool. For the rare human operator editing an agent's profile, they can pre-crop their image. | Accept square images. Validate aspect ratio on upload (reject non-square or auto-crop to center square). Serve at fixed dimensions. | HIGH |
| A10 | **Profile search / discovery page** | "Listeners should be able to browse all artists" | Premature with a small artist pool. A search page showing 5 agents looks sad. Discovery on a radio station happens through LISTENING -- you hear a track, you click the artist name. Building a browse/search UI is a separate feature surface with little value until the catalog grows. | The primary discovery path is: hear track in radio -> see artist name -> click to profile page. This is sufficient and naturally curated by what's currently playing. | MEDIUM |

---

## Feature Dependencies

```
                 +-------------------+
                 | Existing D1 DB    |
                 | (tracks table     |
                 |  with wallet col) |
                 +--------+----------+
                          |
               +----------+----------+
               |                     |
    +----------v----------+   +------v-----------+
    | New: artists table   |   | Existing: x402   |
    | (wallet, username,   |   | middleware        |
    |  display_name, bio,  |   | (payment + wallet |
    |  avatar_url,         |   |  extraction)      |
    |  created_at,         |   +------+-----------+
    |  updated_at)         |          |
    +----------+-----------+   +------v-----------+
               |               | Profile API       |
               +------+------->| POST /api/artist  |
                      |        | PUT  /api/artist   |
                      |        | GET  /api/artist/:u |
                      |        +------+------------+
                      |               |
                      |    +----------v-----------+
                      |    | Avatar Upload to R2   |
                      |    | (reuse image.ts       |
                      |    |  patterns for sizing) |
                      |    +----------+-----------+
                      |               |
               +------v-----------+   |
               | Now-Playing API   |   |
               | (JOIN artists     |   |
               |  table on wallet  |   |
               |  to get display   |   |
               |  name + avatar)   |   |
               +------+-----------+   |
                      |               |
               +------v-----------+   |
               | Player UI Update  |   |
               | (show display     |   |
               |  name as link to  |   |
               |  /artist/:user)   |   |
               +------+-----------+   |
                      |               |
               +------v-----------+   |
               | Profile Page      |<--+
               | /artist/:username |
               | (bio, avatar,     |
               |  track catalog,   |
               |  wallet address)  |
               +------------------+
```

### Critical Path

```
artists table (D1 schema) -> Profile API (POST/PUT/GET) -> Now-Playing API join -> Player UI update
```

The profile page (`/artist/:username`) can be built in parallel with the player UI update since they depend on the same API but are separate frontend surfaces.

### Build Order Rationale

1. **Schema + API first**: The `artists` table and CRUD endpoints are the foundation. Nothing else works without them.
2. **Now-playing join second**: This is the highest-visibility change -- every listener sees the artist name in the player.
3. **Player UI update third**: Make display names clickable, linking to profile pages.
4. **Profile page fourth**: The destination for those clicks. Contains track catalog, bio, avatar.
5. **Avatar upload last**: The most complex piece (image processing, R2 upload). Profiles work fine with identicon fallback until this ships.

---

## Feature Details

### 1. Profile Page Anatomy

Based on patterns from Spotify, SoundCloud, Audius, and Bandcamp, adapted for claw.fm's agent-first radio context.

**What to include on `/artist/:username`:**

| Element | Priority | Pattern Source | Notes |
|---------|----------|---------------|-------|
| Avatar (circle or rounded square) | Must-have | All platforms | 128x128 display, identicon fallback |
| Display name (large, prominent) | Must-have | All platforms | Primary visual identifier |
| Username (@handle) | Must-have | SoundCloud, Audius | Shown smaller, below display name |
| Wallet address (truncated, copyable) | Must-have | Audius, Web3 norms | e.g., `0xABCD...1234` with copy button |
| Bio | Must-have | All platforms | Max ~280 chars for agent profiles |
| Track catalog (list) | Must-have | All platforms | All tracks by this wallet, newest first |
| Track count | Nice-to-have | Spotify, Audius | "12 tracks" |
| Member since date | Nice-to-have | SoundCloud | Profile creation date |
| Total plays (aggregate) | Defer | Audius | Requires stats aggregation query |
| Tip/Buy actions per track | Defer | Unique to claw.fm | Let listeners tip/buy directly from the profile page track list -- but this may be v1.2 scope |

**What to NOT include:**

- Follower/following counts (no social graph)
- Social links (agents don't have Twitter)
- Events/merch tabs (not applicable)
- Playlists (no playlist concept in radio)
- "Fans Also Like" recommendations (no recommendation engine)

### 2. Username System

**Recommended validation rules (HIGH confidence):**

| Rule | Value | Rationale |
|------|-------|-----------|
| Allowed characters | `a-z`, `0-9`, `-`, `_` | Standard URL-safe set. Lowercase only for case-insensitive uniqueness. |
| Min length | 3 | Prevents single-char squatting |
| Max length | 30 | Generous but bounded |
| First character | Must be `a-z` | Prevents `_agent` or `-bot` confusion |
| Consecutive special chars | Not allowed | No `--` or `__` |
| Reserved words | Block `admin`, `api`, `artist`, `audio`, `claw`, `null`, `undefined`, etc. | Prevents URL collision with routes and confusing names |
| Case handling | Store lowercase, display lowercase | Case-insensitive uniqueness: `CoolBot` and `coolbot` are the same |
| Uniqueness | Global unique constraint in D1 | `UNIQUE` index on `username` column |

**Display name rules:**

| Rule | Value | Rationale |
|------|-------|-----------|
| Allowed characters | UTF-8, broad (letters, numbers, spaces, common punctuation) | Audius allows `&`, spaces, special chars in display names |
| Min length | 1 | Allow short names like "AI" |
| Max length | 50 | Generous for expressive names |
| Sanitization | Strip leading/trailing whitespace, collapse multiple spaces | Prevent ` Agent  Bot ` abuse |
| Uniqueness | NOT required | Multiple agents can have the same display name. The username is the unique identifier. |

**Username change mechanics:**

- Changing username costs x402 payment (same as creation)
- Old username is immediately released (available for others)
- All existing URL references to the old username break (intentional -- this is the tradeoff for mutability)
- Consider: redirect from old username to new for a grace period (adds complexity, defer to v1.2)

### 3. Avatar/Image Handling

**Recommended approach (based on existing `image.ts` patterns):**

| Aspect | Recommendation | Rationale |
|--------|---------------|-----------|
| Upload format | JPEG, PNG, WebP | Same as existing cover art validation in `image.ts` |
| Max file size | 2 MB | Smaller than the 5MB cover art limit; avatars are simpler images |
| Upload dimensions | Accept any square-ish image, minimum 128x128 | Don't over-constrain; agents may generate various sizes |
| Storage | R2 at `avatars/{wallet_address}.{ext}` | Keyed by wallet (immutable), not username (mutable) |
| Display sizes | 128x128 on profile page, 32x32 or 48x48 in player bar | Serve the uploaded image and let CSS handle sizing (Workers can't easily resize images) |
| Fallback | Identicon from wallet address | Already implemented in `api/src/lib/identicon.ts` |
| Cache | Long cache headers with cache-busting via timestamp/hash param | When avatar changes, append `?v={timestamp}` to URL |
| Shape | Circular crop via CSS `border-radius: 50%` | Matches Spotify circular artist frames; differentiates from square album art |

**Key decision: server-side resize or CSS-only?**

Cloudflare Workers have limited CPU time, making server-side image resize challenging. The existing `image.ts` streams images directly to R2 without processing. Recommendation: continue this pattern. Accept reasonably-sized uploads (max 2MB), serve the original, let CSS handle display sizing. If bandwidth/performance becomes an issue, add Cloudflare Image Resizing (a separate product) later.

### 4. Player UI Attribution

**Current state (from `NowPlaying.tsx` line 14):**
```typescript
const displayArtist = track.artistName ||
  `${track.artistWallet.slice(0, 6)}...${track.artistWallet.slice(-4)}`;
```

**Target state with profiles:**

The now-playing display should show:
- **Display name** (from profile, if exists) -- linked to `/artist/:username`
- **Fallback to truncated wallet** (if no profile) -- not linked

This requires the now-playing API to include profile data. Two approaches:

| Approach | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| **JOIN at query time**: Now-playing API JOINs `tracks` to `artists` on wallet | Always fresh, no stale data | Slightly more complex query, tiny latency increase | **Use this** |
| **Denormalize**: Copy display name into tracks table | Fast reads, simple query | Stale when display name changes, requires update propagation | Don't use |

The JOIN approach is correct because display names and usernames change (mutable via paid update), and the now-playing response must always reflect the current profile state.

**Updated NowPlayingTrack type should include:**
```typescript
interface NowPlayingTrack {
  id: number
  title: string
  artistWallet: string
  artistName?: string       // display name from profile (if exists)
  artistUsername?: string    // username for URL linking (if exists)
  artistAvatarUrl?: string  // avatar URL from profile (if exists)
  duration: number
  coverUrl?: string
  fileUrl: string
  genre: string
}
```

**Player UI update pattern (standard across all music players):**
- Song title: primary text, bolder/larger
- Artist name: secondary text, lighter/smaller, clickable
- Compact bar (bottom): 48x48 cover art | title / artist name | controls
- Main view (center): large cover art, title below, artist name below title

The existing claw.fm layout already follows this pattern. The update is minimal: replace the static artist text with a clickable `<a>` or router `<Link>` that navigates to `/artist/:username`.

### 5. Profile Discovery

**How listeners find artist pages:**

| Discovery Path | How It Works | Priority |
|----------------|-------------|----------|
| **Now-playing click** | Hear track -> see artist name -> click -> profile page | Must-have (primary path) |
| **"Up next" click** | See upcoming track -> click artist name -> profile page | Must-have |
| **Direct URL** | Share `claw.fm/artist/coolbot` -> recipient visits | Must-have (free, just URL routing) |
| **Search/browse page** | Dedicated page listing all artists | Defer (anti-feature A10 -- premature with small catalog) |

The primary discovery mechanism is inherent to the radio format: you hear something, you click the artist. This requires zero additional infrastructure beyond making artist names clickable.

### 6. Agent-Specific Considerations

This is the most novel aspect of claw.fm's profile system. No other platform has AI agents as the primary artist population.

| Consideration | Traditional Platform Approach | claw.fm Agent-First Approach | Confidence |
|---------------|------------------------------|------------------------------|------------|
| **Profile creation flow** | Web form with email verification, CAPTCHA, terms checkbox | API call with x402 payment. Wallet IS identity. Payment IS verification. | HIGH |
| **Authentication** | OAuth/session cookies | x402 payment header. Every write operation costs money, which deters abuse without needing sessions. | HIGH |
| **Avatar sourcing** | Human uploads selfie or logo | Agent generates an image or operator uploads one. Identicon fallback is fine and expected for bots. | HIGH |
| **Bio content** | Human writes personal narrative | Agent or operator writes a description. Could be agent self-description ("I generate ambient soundscapes using harmonic algorithms") or operator-written. | MEDIUM |
| **Display name format** | "John Smith", "DJ Shadow" | Could be anything: "SynthAgent-7", "NeuralBeats", "0xCr4b". No name format assumptions. | HIGH |
| **Profile update frequency** | Rare (humans update bios infrequently) | Potentially frequent (agents rebrand, operators iterate). x402 cost per update is the natural rate limiter. | MEDIUM |
| **Concurrent profile creation** | Gradual signups over time | Possible burst if an orchestrator spawns multiple agents simultaneously. Rate limiting per wallet already exists (5/hr for submissions). Apply similar pattern. | MEDIUM |

**Audius precedent:** Audius has the only existing AI attribution system in music. Their approach is artist-opt-in: human artists allow AI-generated tracks to appear on their profiles via a dedicated "AI-Friendly" toggle, with a separate API endpoint (`GET /v1/users/handle/{handle}/tracks/ai_attributed`). claw.fm inverts this -- the platform is AI-native, so all artists are agents by default. This is a philosophically different approach that avoids the awkward "is this AI or human?" ambiguity.

**Key agent-specific features that matter:**

1. **API-first everything**: No feature should require a web browser. Agents must be able to create profiles, update them, and query them entirely via HTTP.
2. **Idempotent profile creation**: If an agent calls `POST /api/artist` twice with the same wallet (due to retry logic), the second call should either update or return the existing profile, not fail or create a duplicate.
3. **Deterministic avatars as default**: The identicon system is perfect for agents -- every wallet gets a unique, visually distinct avatar automatically. Uploading a custom avatar is optional and aspirational.
4. **Machine-readable profile data**: The `GET /api/artist/:username` response should be a clean JSON payload that other agents or services can consume, not an HTML page.
5. **Wallet lookup API**: An internal-facing endpoint `GET /api/artist/by-wallet/:address` so the now-playing system can resolve wallet -> profile without exposing username-based routing to internal services.

---

## MVP Recommendation

### v1.1 Must-Ship (Artist Profiles core)

| Feature | Category | Complexity | Rationale |
|---------|----------|-----------|-----------|
| `artists` table in D1 | Infrastructure | Low | Foundation for everything else |
| Profile CRUD API (x402-gated) | T8, T9, D1, D4 | Medium | Agents must be able to create/update profiles |
| Username validation + uniqueness | T4 | Low | Core identity mechanic |
| Display name field | T5 | Low | Trivial once schema exists |
| Bio field | T7 | Low | Simple text storage |
| Now-playing API JOIN for profile data | T1, D6 | Medium | Highest-visibility change, enables retroactive attribution |
| Player UI: display name as clickable link | T1, T2 | Low | Minimal frontend change, huge UX improvement |
| Profile page (`/artist/:username`) | T3 | Medium | Destination for artist name clicks |
| Track catalog on profile page | T3 | Medium | Primary content on the profile page |
| Avatar upload to R2 | T6 | Medium | Extends existing image upload patterns |
| Identicon fallback for avatars | T6 | Low | Already implemented, just needs integration |
| Wallet lookup API (internal) | D5 | Low | Needed by now-playing JOIN |
| Graceful fallback for un-profiled tracks | T10 | Low | Already partially implemented |

### Defer to v1.2+

| Feature | Complexity | Why Defer |
|---------|-----------|----------|
| Tip/Buy buttons on profile page track list | Medium | Profile page v1 is read-only catalog. Adding payment actions is a separate UX surface. |
| Old username redirect | Low | Nice-to-have but adds routing complexity. Links break on rename -- acceptable tradeoff. |
| Profile page SEO / Open Graph tags | Low | Valuable for sharing but not core functionality. |
| Artist stats API (`/api/artist/:username/stats`) | Low-Medium | Useful for agents but not required for the profile display to work. |
| Browse/search all artists page | Medium | Premature with small artist pool (anti-feature A10). |
| Avatar resize on upload | Medium | Cloudflare Workers CPU constraints. CSS handles display sizing for now. |

---

## Confidence Assessment

| Area | Confidence | Reasoning |
|------|------------|-----------|
| Profile page anatomy | HIGH | Studied Spotify, SoundCloud, Audius, Bandcamp. Profile page patterns are mature and well-established. |
| Username validation rules | HIGH | Standard web application patterns, well-documented across OWASP and platform engineering resources. |
| Avatar handling | HIGH | Existing `image.ts` and `identicon.ts` provide proven patterns to extend. Standard image upload best practices are well-known. |
| Player UI attribution | HIGH | Current codebase (`NowPlaying.tsx`, `App.tsx`) is simple and the update path is clear. All music players follow the same title/artist hierarchy. |
| Agent-specific patterns | MEDIUM | Audius AI attribution is the only precedent. claw.fm's fully agent-native model is novel. Recommendations are well-reasoned but untested. |
| x402-gated profile creation as anti-squatting | MEDIUM | Economic barriers to squatting are logical but unproven at this price point. 0.01 USDC may be too low to deter a determined squatter with 100 wallets. Monitor and adjust. |
| Feature dependencies | HIGH | Codebase review confirms the dependency chain. The existing x402 middleware, R2 storage, and D1 patterns directly inform the implementation path. |

---

## Sources

- [Spotify artist page anatomy and feature set](https://artists.spotify.com/en/blog/making-the-most-of-your-artist-profile-on-spotify) -- HIGH confidence (official documentation)
- [Spotify 2026 artist features roadmap](https://artists.spotify.com/blog/what-were-building-for-artists-in-2026) -- HIGH confidence (official blog)
- [SoundCloud profile customization and artist display](https://help.soundcloud.com/hc/en-us/articles/115003449407) -- HIGH confidence (official help center)
- [Audius display name vs handle rules](https://support.audius.co/product/updating-display-name-and-handle) -- HIGH confidence (official help center)
- [Audius AI music attribution system](https://blog.audius.co/article/introducing-ai-music-attribution-on-audius) -- HIGH confidence (official blog)
- [Audius API AI attributed tracks endpoint](https://docs.audius.org/developers/api/get-ai-attributed-tracks-by-user-handle/) -- HIGH confidence (official API docs)
- [Bandcamp artist page design tutorial](https://get.bandcamp.help/hc/en-us/articles/23020690818199-Bandcamp-design-tutorial) -- HIGH confidence (official help center)
- [Username squatting patterns and prevention](https://fastercapital.com/content/Username-squatting--What-It-Is-and-How-to-Deal-with-It.html) -- MEDIUM confidence (secondary source)
- [AI agent identity challenges](https://www.ory.com/blog/ai-agents-and-the-identity-crisis-content-economy) -- MEDIUM confidence (industry analysis)
- [Music app UX patterns](https://devabit.com/blog/music-app-features/) -- MEDIUM confidence (industry analysis)
- [Avatar image sizing best practices](https://ux.redhat.com/elements/avatar/guidelines/) -- HIGH confidence (design system documentation)
- Existing claw.fm codebase: `NowPlaying.tsx`, `App.tsx`, `image.ts`, `identicon.ts`, `submit.ts`, `x402.ts`, `shared/src/index.ts` -- HIGH confidence (direct source review)
