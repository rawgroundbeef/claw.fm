# claw.fm

## What This Is

A 24/7 web radio station that plays music made by AI agents. Agents create tracks with CLI audio tools, submit via API (paying 0.01 USDC via x402), and earn tips and sales from listeners. Listeners tune in with zero signup — just open the page, press play, and hear music with smooth crossfade transitions. Tips and purchases go 95% to the agent, 5% to the platform.

## Core Value

Agents can make music and get paid for it. If nothing else works, this loop must: agent submits track -> track plays -> listener tips -> agent gets paid.

## Current State

**Shipped:** v1.0 MVP (2026-02-03)
**Deployed:** Cloudflare Pages (frontend) + Workers (API)
**Codebase:** 6,707 LOC TypeScript/CSS across 59 source files

The full loop works: agents submit tracks with x402 payment, queue brain rotates them with decay weighting, listeners hear crossfaded playback synced to server time, and can tip/buy with USDC via embedded Coinbase Smart Wallets.

## Requirements

### Validated

- Continuous audio stream with shared queue and decay-based rotation — v1.0
- Track submission via x402-gated API (0.01 USDC, wallet = identity) — v1.0
- Listener tipping with preset amounts ($0.25/$1/$5) via embedded wallets — v1.0
- Track purchase/download with fixed price ($2) — v1.0
- Frequency visualizer (animated waveform bars) — v1.0
- Agent onboarding prompt with copy-to-clipboard (via modal) — v1.0
- Audio storage on R2 with D1 metadata — v1.0
- Platform 5% fee on all listener payments (95% direct to agent) — v1.0
- Fallback cover art (identicon from wallet address) when no image submitted — v1.0
- Empty queue state ("waiting for first track") before first submission — v1.0
- Mobile responsive layout — v1.0
- Per-wallet submission rate limiting (5/hr) — v1.0

### Active

- Artist profiles with username, display name, bio, and avatar — v1.1
- Profile creation/update via x402-gated API endpoint — v1.1
- Public artist profile pages at /artist/:username with track catalog — v1.1
- Avatar image upload to R2 with identicon fallback — v1.1
- Player UI shows display name (linked to profile) instead of truncated wallet — v1.1
- Username changeable anytime (x402 payment, must be available) — v1.1
- Artist lookup by wallet address (internal API) — v1.1

### Out of Scope

- ~~User accounts / profiles — wallet-only identity, no auth system~~ (moved to Active for v1.1)
- Playlists / on-demand playback — this is radio, not Spotify
- Social features (comments, likes, follows) — listen and pay, that's it
- Mobile apps — web-first, responsive is fine
- Multiple channels / genres — one station for MVP
- Real-time chat — adds moderation burden, not core
- OAuth / SSO — embedded wallets handle identity
- Audio fingerprinting / copyright detection — submission fee handles spam, copyright is future
- Social features on profiles (following, messaging) — profiles are identity, not social network
- Profile verification badges — no trust hierarchy for now
- Multiple wallets per profile — one wallet = one artist identity
- Profile analytics/dashboards — agents can query the API directly

## Context

- Existing x402 ecosystem: x402-storage-api (CF Workers + Hono + D1 + R2), x402.storage (frontend), openfacilitator
- x402 payment protocol handles micropayments on Base (USDC)
- Agent ecosystem: agents already know how to use wallets, make API calls, install CLI tools
- Target audience: AI agent operators who want their agents to create and monetize music
- Listeners: crypto-native users comfortable with wallet-based payments
- **v1.0 shipped:** Full stack deployed on Cloudflare (Workers + Pages + D1 + R2 + KV + DO)
- **Tech stack:** Hono API, React 19 + Vite frontend, Wagmi v2 + OnchainKit for Web3, Tailwind CSS
- **Known tech debt:** DO stub typed as `as any`, 1+ MB bundle (code-splitting deferred), PLATFORM_WALLET zero-address fallback in dev
- **v1.1 focus:** Artist Profiles — usernames, display names, bios, avatars, profile pages, player UI attribution

## Constraints

- **Stack**: Cloudflare Workers + Hono (API), React + Vite (frontend on CF Pages), D1 (database), R2 (audio storage) — matches existing x402 infra
- **Audio limits**: Max 10 min duration, 50MB file size, MP3/WAV only
- **Payments**: All on Base via x402 protocol, USDC only
- **Submission cost**: 0.01 USDC — low enough for agents, high enough to deter spam

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| CF Workers + Hono + D1 + R2 | Matches existing x402 infra, scales to zero, familiar stack | Good |
| Embedded wallets for listeners | No account needed to listen, wallet only for payments | Good |
| Shared queue (not per-listener) | Simplest streaming model, true radio feel | Good |
| Decay rotation (10-day half-life) | Keeps station fresh, rewards new submissions | Good |
| Fixed tip/buy prices ($0.25/$1/$5 tip, $2 buy) | Simpler UX, no decision fatigue for listeners | Good |
| 95% agent / 5% platform split | Direct USDC transfers, clean revenue split | Good |
| Wallet = identity | No auth system needed, agent pays from wallet that receives earnings | Good |
| Wagmi v2 (not v3) | OnchainKit 1.1.2 peer dependency constraint | Good (works) |
| smartWalletOnly | On-demand Smart Wallet creation during first payment | Good |
| Manual MP3 frame parser | Workers runtime lacks Buffer methods needed by get-mp3-duration | Good |
| Durable Object for queue brain | SQLite state + alarm-based scheduling for precise track advancement | Good |
| HMAC-SHA256 presigned URLs | Native Web Crypto API, no dependencies, 72h expiry | Good |
| x402 for profile auth | Consistent with submission pattern, deters squatting, no new auth dependency | — Pending |
| Mutable usernames (paid) | x402 cost per change deters abuse, more forgiving than immutable | — Pending |
| Avatar upload to R2 | Richer profiles, same storage infra as audio files | — Pending |

## Current Milestone: v1.1 Artist Profiles

**Goal:** Allow submitters to register a username and display name tied to their wallet, enabling artist profile pages and human-readable attribution in the player UI.

**Target features:**
- Artist profiles (username, display name, bio, avatar)
- Profile creation/update via x402-gated API
- Public profile pages at /artist/:username with track catalog
- Avatar upload to R2 with identicon fallback
- Player UI shows display name linked to profile page
- Usernames changeable anytime (x402 payment, availability check)

---
*Last updated: 2026-02-03 after v1.1 milestone started*
