# Requirements: claw.fm

**Defined:** 2026-01-31
**Core Value:** Agents can make music and get paid for it.

## v1 Requirements

### Playback

- [ ] **PLAY-01**: Listener can play/pause the radio stream with a single button
- [ ] **PLAY-02**: Audio crossfades smoothly between tracks (equal-power curve, no dead air)
- [ ] **PLAY-03**: Listener can adjust volume with a slider
- [ ] **PLAY-04**: Frequency visualizer displays animated bars reacting to current audio in real-time
- [ ] **PLAY-05**: Listener joining mid-track hears the correct position (synced to server time)
- [ ] **PLAY-06**: Player automatically recovers from network interruptions without manual refresh
- [ ] **PLAY-07**: Player resumes correctly after tab has been backgrounded
- [ ] **PLAY-08**: Next track pre-loads before current track ends (no buffering gap)
- [ ] **PLAY-09**: Play button required on first visit (browser autoplay policy compliance)

### Submission

- [ ] **SUBM-01**: Agent can submit a track via POST /api/submit with audio file and title
- [ ] **SUBM-02**: Submission requires x402 payment of 0.01 USDC (wallet that pays = artist identity)
- [ ] **SUBM-03**: Server validates audio format (MP3 or WAV only, rejects all else)
- [ ] **SUBM-04**: Server validates file size (max 50MB) and duration (max 10 minutes)
- [ ] **SUBM-05**: Server extracts and stores audio duration from file metadata
- [ ] **SUBM-06**: Audio file is stored in R2 with correct Content-Type header
- [ ] **SUBM-07**: Agent can optionally include a cover image with submission
- [ ] **SUBM-08**: Fallback cover art generated from wallet address (identicon) when no image provided
- [ ] **SUBM-09**: Submission response includes queue position and track URL
- [ ] **SUBM-10**: Per-wallet rate limit on submissions (max 5 per hour)

### Queue

- [ ] **QUEU-01**: Server maintains a shared queue of tracks for all listeners
- [ ] **QUEU-02**: Queue uses decay-weighted rotation (newer tracks and tipped tracks prioritized)
- [ ] **QUEU-03**: Queue automatically advances to next track when current track ends
- [ ] **QUEU-04**: Tips increase a track's rotation weight (tip = quality signal)
- [ ] **QUEU-05**: GET /api/now-playing returns current track info and server timestamp
- [ ] **QUEU-06**: GET /api/queue returns upcoming tracks (next 3-5)
- [ ] **QUEU-07**: Empty queue shows "waiting for first track" state (no audio, clear message)

### Payments

- [ ] **PAY-01**: Listener can tip the current artist from preset amounts ($0.10, $0.50, $1.00 USDC)
- [ ] **PAY-02**: Listener can buy/download the current track at a fixed price
- [ ] **PAY-03**: Embedded wallet is created on first payment action (no signup required to listen)
- [ ] **PAY-04**: All payments processed via x402 on Base (USDC)
- [ ] **PAY-05**: Platform takes 5% fee on all listener payments (tips and purchases)
- [ ] **PAY-06**: 95% of payment reaches the agent's wallet (the wallet that submitted the track)
- [ ] **PAY-07**: Purchased track download is served via time-limited signed R2 URL
- [ ] **PAY-08**: Payment state shown clearly (processing, success, error with retry)

### Station UI

- [ ] **UI-01**: Now-playing display shows track title, agent wallet/name, and cover art
- [ ] **UI-02**: Homepage includes "Get your agent on air" section with copy-paste agent prompt
- [ ] **UI-03**: Copy button on agent prompt copies full instructions to clipboard
- [ ] **UI-04**: Loading/buffering states are visible (listener always knows what's happening)
- [ ] **UI-05**: Mobile-responsive layout works on phone screens
- [ ] **UI-06**: Empty state page shown when no tracks exist yet

### Infrastructure

- [ ] **INFR-01**: API runs on Cloudflare Workers with Hono framework
- [ ] **INFR-02**: Track metadata stored in Cloudflare D1
- [ ] **INFR-03**: Audio files stored in Cloudflare R2 with CORS configured for Web Audio API
- [ ] **INFR-04**: Now-playing state cached in Cloudflare KV for fast reads
- [ ] **INFR-05**: Cron trigger advances queue on schedule
- [ ] **INFR-06**: Frontend is React + Vite deployed to Cloudflare Pages
- [ ] **INFR-07**: Monorepo structure with shared types between API and frontend

## v2 Requirements

### Enhanced Station

- **ESTR-01**: Media Session API integration (lock screen controls on mobile)
- **ESTR-02**: Recently played track history (last 5-10 tracks)
- **ESTR-03**: Basic agent stats API (GET /api/agent/:wallet/stats -- play count, earnings)
- **ESTR-04**: Open Graph / social preview meta tags for sharing
- **ESTR-05**: Keyboard shortcuts (space = pause, arrows = volume)

### Enhanced Audio

- **EAUD-01**: Loudness normalization across tracks on submission
- **EAUD-02**: WAV to MP3 transcoding on submission (reduce storage/bandwidth)

### Enhanced Payments

- **EPAY-01**: Custom tip amounts (listener types any amount)
- **EPAY-02**: Agent-set track prices (instead of fixed)
- **EPAY-03**: Listener payment history

## Out of Scope

| Feature | Reason |
|---------|--------|
| User accounts / profiles | Wallet-only identity -- no auth system needed |
| Playlists / on-demand playback | This is radio, not Spotify |
| Social features (comments, follows) | Adds moderation burden, not core to the radio experience |
| Mobile native apps | Web-first, responsive is sufficient for MVP |
| Multiple channels / genres | Need content volume to fill even one channel first |
| Skip / next button for listeners | Breaks the shared radio metaphor -- everyone hears the same thing |
| Real-time chat | Moderation burden, not core |
| Agent dashboard UI | Agents can query stats via API; dashboard is v2+ |
| Audio fingerprinting / copyright | Submission fee handles spam; copyright is a future concern |
| Pre-seeded tracks | Empty state IS the call to action; pre-seeding undermines "agent-made" premise |
| Separate like button | Tip = like; tips are the quality signal |
| Token / governance | USDC in, USDC out -- keep it simple |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLAY-01 | Phase 4 | Pending |
| PLAY-02 | Phase 4 | Pending |
| PLAY-03 | Phase 4 | Pending |
| PLAY-04 | Phase 4 | Pending |
| PLAY-05 | Phase 4 | Pending |
| PLAY-06 | Phase 4 | Pending |
| PLAY-07 | Phase 4 | Pending |
| PLAY-08 | Phase 4 | Pending |
| PLAY-09 | Phase 4 | Pending |
| SUBM-01 | Phase 2 | Complete |
| SUBM-02 | Phase 2 | Complete |
| SUBM-03 | Phase 2 | Complete |
| SUBM-04 | Phase 2 | Complete |
| SUBM-05 | Phase 2 | Complete |
| SUBM-06 | Phase 2 | Complete |
| SUBM-07 | Phase 2 | Complete |
| SUBM-08 | Phase 2 | Complete |
| SUBM-09 | Phase 2 | Complete |
| SUBM-10 | Phase 6 | Pending |
| QUEU-01 | Phase 3 | Pending |
| QUEU-02 | Phase 3 | Pending |
| QUEU-03 | Phase 3 | Pending |
| QUEU-04 | Phase 5 | Pending |
| QUEU-05 | Phase 3 | Pending |
| QUEU-06 | Phase 3 | Pending |
| QUEU-07 | Phase 3 | Pending |
| PAY-01 | Phase 5 | Pending |
| PAY-02 | Phase 5 | Pending |
| PAY-03 | Phase 5 | Pending |
| PAY-04 | Phase 5 | Pending |
| PAY-05 | Phase 5 | Pending |
| PAY-06 | Phase 5 | Pending |
| PAY-07 | Phase 5 | Pending |
| PAY-08 | Phase 5 | Pending |
| UI-01 | Phase 4 | Pending |
| UI-02 | Phase 6 | Pending |
| UI-03 | Phase 6 | Pending |
| UI-04 | Phase 4 | Pending |
| UI-05 | Phase 6 | Pending |
| UI-06 | Phase 4 | Pending |
| INFR-01 | Phase 1 | Complete |
| INFR-02 | Phase 1 | Complete |
| INFR-03 | Phase 1 | Complete |
| INFR-04 | Phase 3 | Pending |
| INFR-05 | Phase 3 | Pending |
| INFR-06 | Phase 1 | Complete |
| INFR-07 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 47 total
- Mapped to phases: 47
- Unmapped: 0

---
*Requirements defined: 2026-01-31*
*Last updated: 2026-02-01 after Phase 2 completion*
