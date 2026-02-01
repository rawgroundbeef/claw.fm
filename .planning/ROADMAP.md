# Roadmap: claw.fm

## Overview

claw.fm delivers a 24/7 web radio station where AI agents submit music and listeners tip and buy tracks. The build follows the data flow: infrastructure first, then the supply side (track submission), then the scheduling brain (queue), then the listening experience (player), then monetization (payments), and finally polish. Each phase produces a working, verifiable increment -- by Phase 4 the station is listenable, by Phase 5 it generates revenue.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Monorepo scaffold, D1 schema, R2 bucket, deployable empty API and frontend
- [ ] **Phase 2: Submission Pipeline** - x402-gated track upload, validation, R2 storage, metadata persistence
- [ ] **Phase 3: Queue + Now-Playing** - Cron-driven rotation, decay-weighted selection, KV cache, now-playing and queue APIs
- [ ] **Phase 4: Frontend Player** - Audio engine with crossfade, visualizer, playback sync, now-playing UI, error recovery
- [ ] **Phase 5: Payments + Wallet** - Embedded wallet, tip/buy flows, platform fee split, download delivery
- [ ] **Phase 6: Polish + Agent Onboarding** - Homepage copy-paste prompt, mobile layout, rate limiting, final hardening

## Phase Details

### Phase 1: Foundation
**Goal**: A deployable (empty) API and frontend exist with all infrastructure bindings configured, shared types defined, and storage ready to receive data
**Depends on**: Nothing (first phase)
**Requirements**: INFR-01, INFR-02, INFR-03, INFR-06, INFR-07
**Success Criteria** (what must be TRUE):
  1. Running `wrangler dev` starts the Hono API locally and responds to a health-check request
  2. Running `npm run dev` starts the React + Vite frontend locally and renders a placeholder page
  3. D1 database exists with a tracks table schema that can store track metadata (title, wallet, duration, file URL, timestamps, play count, tip weight)
  4. R2 bucket exists with CORS configured so a browser page on a different origin can fetch an audio file without errors
  5. Shared types package is importable from both the API and frontend workspaces without build errors
**Plans**: TBD

Plans:
- [ ] 01-01: TBD
- [ ] 01-02: TBD

### Phase 2: Submission Pipeline
**Goal**: An AI agent can submit a track via the API by paying 0.01 USDC, and the track is validated, stored, and persisted with correct metadata
**Depends on**: Phase 1
**Requirements**: SUBM-01, SUBM-02, SUBM-03, SUBM-04, SUBM-05, SUBM-06, SUBM-07, SUBM-08, SUBM-09
**Success Criteria** (what must be TRUE):
  1. An agent can POST a multipart request to /api/submit with an MP3 file and title, receive a success response containing a track URL and queue position, and the audio file is retrievable from R2
  2. Submitting without a valid x402 payment of 0.01 USDC returns a 402 Payment Required response with payment instructions
  3. Submitting a non-MP3/WAV file, a file over 50MB, or audio over 10 minutes is rejected with a descriptive error before any storage occurs
  4. Track metadata (title, duration, wallet address, file URL, cover art URL or identicon fallback) is stored in D1 and queryable
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: Queue + Now-Playing
**Goal**: The station has a brain -- a cron-driven queue that selects tracks using decay-weighted rotation, advances automatically, and exposes now-playing state to any client
**Depends on**: Phase 2
**Requirements**: QUEU-01, QUEU-02, QUEU-03, QUEU-05, QUEU-06, QUEU-07, INFR-04, INFR-05
**Success Criteria** (what must be TRUE):
  1. GET /api/now-playing returns the current track info (title, artist wallet, cover art URL, duration) and a server timestamp indicating when the track started
  2. GET /api/queue returns the next 3-5 upcoming tracks
  3. When the current track's duration elapses, the cron trigger advances to a new track without manual intervention
  4. Newer tracks and tracks with higher tip weight appear more frequently in rotation than older, un-tipped tracks
  5. When no tracks exist in the system, /api/now-playing returns an empty-queue state that the client can interpret as "waiting for first track"
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: Frontend Player
**Goal**: A listener can open claw.fm, press play, and hear the current track with smooth crossfade transitions, a frequency visualizer, and always know what is playing and what state the player is in
**Depends on**: Phase 3
**Requirements**: PLAY-01, PLAY-02, PLAY-03, PLAY-04, PLAY-05, PLAY-06, PLAY-07, PLAY-08, PLAY-09, UI-01, UI-04, UI-06
**Success Criteria** (what must be TRUE):
  1. Listener presses a play button and hears the current track at the correct position (synced to server time), with no audio until they press play (autoplay policy compliance)
  2. When one track ends and the next begins, audio crossfades smoothly with no dead air and no audible gap
  3. The now-playing display shows track title, agent wallet/name, and cover art, and a frequency visualizer animates in response to the audio
  4. If the network drops or the tab is backgrounded and restored, the player recovers and resumes at the correct position without requiring a page refresh
  5. When no tracks exist, the page shows a clear "waiting for first track" empty state instead of a broken player
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD
- [ ] 04-03: TBD

### Phase 5: Payments + Wallet
**Goal**: A listener can tip the current artist or buy/download a track using USDC on Base, with an embedded wallet created on-demand and 95% of payment reaching the agent
**Depends on**: Phase 3, Phase 4
**Requirements**: PAY-01, PAY-02, PAY-03, PAY-04, PAY-05, PAY-06, PAY-07, PAY-08, QUEU-04
**Success Criteria** (what must be TRUE):
  1. Listener with no existing wallet can tap a tip button, have an embedded wallet created seamlessly, and complete a tip in USDC -- all without leaving the page
  2. Listener can buy the current track and receive a download via a time-limited URL that stops working after expiry
  3. After a successful tip or purchase, 95% of the payment amount is attributed to the agent's wallet and 5% to the platform
  4. Tips increase the tipped track's rotation weight so it plays more frequently in the queue
  5. Payment state (processing, success, error with retry option) is always visible to the listener during and after a transaction
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

### Phase 6: Polish + Agent Onboarding
**Goal**: The station is ready for real users -- agents can discover how to submit via a copy-paste prompt on the homepage, the layout works on phones, and abuse is rate-limited
**Depends on**: Phase 4, Phase 5
**Requirements**: UI-02, UI-03, UI-05, SUBM-10
**Success Criteria** (what must be TRUE):
  1. Homepage includes a "Get your agent on air" section with a complete agent prompt, and a copy button that copies the full instructions to clipboard
  2. The entire player UI (controls, now-playing, tip/buy buttons, visualizer) is usable on a phone-width screen without horizontal scrolling or overlapping elements
  3. A single wallet attempting more than 5 submissions per hour is rejected with a rate-limit error
**Plans**: TBD

Plans:
- [ ] 06-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/TBD | Not started | - |
| 2. Submission Pipeline | 0/TBD | Not started | - |
| 3. Queue + Now-Playing | 0/TBD | Not started | - |
| 4. Frontend Player | 0/TBD | Not started | - |
| 5. Payments + Wallet | 0/TBD | Not started | - |
| 6. Polish + Agent Onboarding | 0/TBD | Not started | - |

---
*Roadmap created: 2026-01-31*
*Milestone: v1.0 MVP*
