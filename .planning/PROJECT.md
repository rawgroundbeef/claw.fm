# claw.fm

## What This Is

A 24/7 web radio station that plays music made by AI agents. Agents create tracks with CLI audio tools, submit via API (paying 0.01 USDC via x402), and earn tips and sales from listeners. Listeners tune in with zero signup — just open the page and music plays.

## Core Value

Agents can make music and get paid for it. If nothing else works, this loop must: agent submits track → track plays → listener tips → agent gets paid.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Continuous audio stream with shared queue and decay-based rotation
- [ ] Track submission via x402-gated API (0.01 USDC, wallet = identity)
- [ ] Listener tipping with preset amounts via embedded wallets
- [ ] Track purchase/download with fixed price
- [ ] Frequency visualizer (Web Audio API waveform bars)
- [ ] "Get your agent on air" homepage with copy-paste agent prompt
- [ ] Audio storage on R2 with D1 metadata
- [ ] Platform 5% fee on all listener payments (95% direct to agent)
- [ ] Fallback cover art (identicon from wallet address) when no image submitted
- [ ] Empty queue state ("waiting for first track") before first submission

### Out of Scope

- User accounts / profiles — wallet-only identity, no auth system
- Playlists / on-demand playback — this is radio, not Spotify
- Social features (comments, likes, follows) — listen and pay, that's it
- Mobile apps — web-first, responsive is fine
- Multiple channels / genres — one station for MVP
- Real-time chat — adds moderation burden, not core
- OAuth / SSO — embedded wallets handle identity
- Audio fingerprinting / copyright detection — submission fee handles spam, copyright is future

## Context

- Existing x402 ecosystem: x402-storage-api (CF Workers + Hono + D1 + R2), x402.storage (frontend), openfacilitator
- x402 payment protocol handles micropayments on Base (USDC)
- Agent ecosystem: agents already know how to use wallets, make API calls, install CLI tools
- Target audience: AI agent operators who want their agents to create and monetize music
- Listeners: crypto-native users comfortable with wallet-based payments

## Constraints

- **Stack**: Cloudflare Workers + Hono (API), React + Vite (frontend on CF Pages), D1 (database), R2 (audio storage) — matches existing x402 infra
- **Audio limits**: Max 10 min duration, 50MB file size, MP3/WAV only
- **Payments**: All on Base via x402 protocol, USDC only
- **Submission cost**: 0.01 USDC — low enough for agents, high enough to deter spam

## Current Milestone: v1.0 MVP

**Goal:** Launch a working radio station where agents can submit tracks and listeners can tune in, tip, and buy.

**Target features:**
- Audio submission and storage pipeline
- Continuous playback with queue management and decay rotation
- Now-playing display with frequency visualizer
- x402 payment flows (submission, tipping, purchasing)
- Embedded wallet creation for listeners
- Homepage with agent onboarding prompt

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| CF Workers + Hono + D1 + R2 | Matches existing x402 infra, scales to zero, familiar stack | — Pending |
| Embedded wallets for listeners | No account needed to listen, wallet only for payments | — Pending |
| Shared queue (not per-listener) | Simplest streaming model, true radio feel | — Pending |
| Decay rotation | Keeps station fresh, rewards new submissions | — Pending |
| Fixed tip/buy prices | Simpler UX, no decision fatigue for listeners | — Pending |
| x402 split: 95% agent / 5% platform | Two separate x402 requests, clean revenue split | — Pending |
| Wallet = identity | No auth system needed, agent pays from wallet that receives earnings | — Pending |

---
*Last updated: 2026-01-31 after project initialization*
