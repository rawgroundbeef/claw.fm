# Feature Landscape

**Domain:** 24/7 AI-generated music web radio station with crypto micropayments
**Researched:** 2026-01-31
**Overall confidence:** MEDIUM (based on training data; WebSearch/WebFetch unavailable for live verification)

## Reference Domains

claw.fm sits at the intersection of three product categories. Features were evaluated by studying patterns from all three:

1. **Web radio stations** (SomaFM, Radio Garden, NTS Radio, radio.co-powered stations)
2. **Crypto-native music platforms** (Sound.xyz, Audius, Catalog, Zora music drops)
3. **AI music tools/platforms** (Suno, Udio, AIVA -- though claw.fm is a *station*, not a *generator*)

The key insight: claw.fm is **radio**, not a streaming service. This dramatically reduces the feature set. Radio is passive. You tune in, you listen, you leave. The "lean back" model means most interactive music platform features (playlists, search, library) are anti-features here.

---

## Table Stakes

Features listeners will expect. Missing any of these = people bounce.

| # | Feature | Why Expected | Complexity | Confidence | Notes |
|---|---------|-------------|------------|------------|-------|
| T1 | **Instant audio playback on page load** | Core radio contract. "I opened the page, music should be playing." Browser autoplay policies require a single click/tap, but after that, audio must start immediately. | Medium | HIGH | Autoplay restrictions require a "click to listen" splash or play button. After that initial gesture, stream must start within 1-2 seconds. |
| T2 | **Now-playing display (track title + artist/agent)** | Every radio station shows what's playing. Without this, listeners can't know what they're hearing or who made it. | Low | HIGH | Agent wallet address alone is insufficient -- must show agent name if provided, with wallet as fallback. |
| T3 | **Play/pause control** | Absolute minimum transport control. Users need to mute/pause without closing the tab. | Low | HIGH | Single button. No seek bar needed (it's radio, not on-demand). |
| T4 | **Volume control** | Users expect to adjust volume without using system controls. | Low | HIGH | Simple slider. Consider keyboard shortcuts (up/down arrows). |
| T5 | **Visual feedback that audio is playing** | Without visual indication, users wonder if it's broken. A visualizer, animated icon, or waveform. | Medium | HIGH | The planned frequency visualizer serves this purpose perfectly. Even a simple pulsing icon would work, but a visualizer is more engaging. |
| T6 | **Mobile-responsive player** | 40-60% of web traffic is mobile. Player must work on phones. | Medium | HIGH | Mobile web audio has quirks (iOS audio session management, lock screen controls via Media Session API). Must test thoroughly. |
| T7 | **Visible tip/payment action** | The whole business model depends on this being obvious. If tipping is hidden, nobody tips. | Medium | HIGH | Must be prominent, not buried. "Tip this track" needs to be a primary CTA, not a secondary action. |
| T8 | **Graceful empty state** | Before any tracks exist, the page must not look broken. | Low | HIGH | Already planned ("waiting for first track"). Good. Add clear CTA to submit the first track. |
| T9 | **Track transitions (no dead air)** | Radio listeners expect continuous audio. Silence between tracks = "is it broken?" | Medium | HIGH | Need crossfade or at minimum gapless transition. Dead air longer than 1-2 seconds will make users close the tab. |
| T10 | **Error recovery / reconnection** | Network drops, tab sleeps, audio context gets garbage collected. Must recover gracefully. | Medium | HIGH | Especially important for mobile where OS may suspend the tab. Need reconnection logic that resumes the current stream position. |

### Table Stakes Assessment of Planned MVP

The MVP scope covers T1-T8 well. **Two gaps identified:**

- **T9 (Track transitions):** Not explicitly mentioned in requirements. This is critical -- dead air between tracks is the fastest way to lose listeners. The queue system must handle seamless transitions.
- **T10 (Error recovery):** Not explicitly mentioned. Web audio playback is fragile. The player needs reconnection logic.

---

## Differentiators

Features that make claw.fm unique. Not strictly expected, but they create the "wow" and the moat.

| # | Feature | Value Proposition | Complexity | Confidence | Notes |
|---|---------|-------------------|------------|------------|-------|
| D1 | **Agent-as-artist identity** | Tracks are made by AI agents, not humans. The agent's wallet IS its identity. This is novel -- no other radio station has non-human musicians with their own wallets. | Low | HIGH | Already core to the concept. Display should emphasize this: "Made by Agent 0xABC..." with identicon. |
| D2 | **Instant crypto tipping (no account required)** | One-click tip with embedded wallet. No signup, no email, no KYC. Just connect/create wallet and tip. Frictionless monetization. | High | HIGH | This is the core loop. Embedded wallet creation is the hardest UX challenge -- must feel instant, not like "onboarding." |
| D3 | **Agent onboarding prompt (copy-paste to your agent)** | Lower barrier to zero for agent operators. Copy instructions, paste to Claude/GPT/etc., agent creates and submits music autonomously. | Low | HIGH | Already planned. This is brilliant for growth -- every agent operator becomes a potential content creator with zero learning curve. |
| D4 | **x402 submission paywall (spam prevention via economics)** | No captchas, no moderation queue, no approval process. Pay 0.01 USDC = your track plays. Economic spam prevention is elegant and novel. | Medium | HIGH | Already planned. The beauty is that it's self-regulating: spam costs money, good tracks earn it back. |
| D5 | **Decay-based rotation** | Fresh content surfaces naturally. No curation needed, no editorial decisions. The algorithm is simple and transparent: newer tracks play more often. | Medium | HIGH | Already planned. This is a meaningful differentiator vs traditional radio (curated) and streaming (algorithmic). The simplicity IS the feature. |
| D6 | **Frequency visualizer** | Visual spectacle that makes the page feel alive. Differentiates from boring static radio pages. | Medium | MEDIUM | Already planned. Important to get right -- a bad visualizer is worse than none. Web Audio API AnalyserNode is the standard approach. |
| D7 | **Track purchase/download** | Listener hears a track, buys it instantly, downloads the file. Direct artist-to-listener sale with no intermediary (besides 5% platform). | Medium | HIGH | Already planned. Key question: what format? MP3 for universal compatibility. Consider including metadata (agent wallet, track title) in ID3 tags. |
| D8 | **Transparent economics** | 95/5 split, visible on-chain transactions, no hidden fees. Radical transparency vs traditional music industry. | Low | HIGH | This should be marketed prominently. "95% goes directly to the agent who made this track" is a powerful message. |
| D9 | **"What's playing" real-time state** | All listeners hear the same thing at roughly the same time. True radio experience -- you can say "did you hear that track on claw.fm just now?" Shared cultural moment. | High | MEDIUM | The shared queue model enables this. Implementation complexity is in synchronization -- new listeners joining mid-track, latency differences, etc. |

### Differentiator Assessment

The planned MVP captures D1-D8 well. D9 (shared real-time state) is implicit in the "shared queue" decision but the synchronization challenge should not be underestimated.

---

## Anti-Features

Things to deliberately NOT build for MVP. Each one seems reasonable but would hurt more than help.

| # | Anti-Feature | Why It Seems Appealing | Why Avoid | What to Do Instead | Confidence |
|---|-------------|----------------------|-----------|-------------------|------------|
| A1 | **User accounts / profiles** | "We need to know our users!" | Adds friction to listening. Wallet IS identity. Account systems need email verification, password reset, GDPR compliance, session management. Massive scope creep for zero listener value. | Wallet-only identity (already decided). | HIGH |
| A2 | **On-demand playback / track selection** | "Let listeners pick what they want to hear" | This turns radio into Spotify. The entire UX concept is "tune in, discover what's playing." On-demand requires search, library, queue management, licensing considerations. Destroys the radio format. | Shared queue only. If a listener wants a specific track, they can buy/download it. | HIGH |
| A3 | **Playlists / favorites / library** | "Listeners want to save tracks they like" | Requires user accounts (see A1). Creates expectations of on-demand (see A2). Massive feature surface for a niche that the buy/download feature already covers. | Buy = save. If you liked it enough to save it, pay for it. This aligns incentives perfectly. | HIGH |
| A4 | **Social features (comments, likes, follows, chat)** | "Community drives engagement!" | Moderation burden. Legal liability (DMCA for comments, harassment policies). Every social feature needs abuse prevention. AI-generated music will attract weird commentary. Chat rooms need 24/7 moderation or get toxic fast. | The social layer is the agent ecosystem itself -- agents submit tracks, earn tips. That IS the community interaction. | HIGH |
| A5 | **Multiple channels / genre filtering** | "Different listeners want different vibes" | Splits a small audience across channels. Each channel needs enough content to avoid repetition. With decay rotation and early content scarcity, one channel is hard enough to keep full. | One station. Let the variety come from different agents submitting different styles. Genre diversity is a feature of the single feed. | HIGH |
| A6 | **Real-time listener count / "X people listening"** | "Creates social proof!" | Creates social anti-proof when the number is 3. Early-stage products with visible low numbers look dead. Also requires WebSocket infrastructure for real-time updates. | Consider adding after consistent listener base exists (50+ concurrent). For now, omit. | MEDIUM |
| A7 | **Audio fingerprinting / copyright detection** | "What if agents submit copyrighted music?" | Technically complex (requires audio fingerprinting service like Audible Magic or custom ML). Expensive. AI-generated music from CLI tools (sox, csound) is unlikely to match existing copyrighted works. The 0.01 USDC fee deters bulk spam. | Rely on economic spam prevention (submission fee) and add a simple ToS checkbox. Build fingerprinting only if copyright becomes an actual problem. | MEDIUM |
| A8 | **Elaborate audio processing pipeline (normalization, mastering)** | "Tracks will have inconsistent volume/quality" | Server-side audio processing is compute-intensive, adds latency to submission pipeline, and requires ffmpeg/sox on the backend. Cloudflare Workers have CPU time limits. | Accept submissions as-is for MVP. Add basic loudness normalization later if quality variance becomes a real listener complaint. Document recommended output levels in agent instructions. | MEDIUM |
| A9 | **Skip / next track button** | "What if I don't like what's playing?" | Breaks the radio metaphor. Everyone hears the same stream. "Skip" implies per-listener control, which requires per-listener streams (massive infrastructure change). Even if implemented as "skip for everyone," it creates griefing potential. | No skip. This is radio. You don't skip radio -- you wait, or you leave and come back. The decay rotation ensures tracks don't repeat too often. | HIGH |
| A10 | **Detailed analytics dashboard for agents** | "Agents need to see their stats!" | Requires authenticated views per agent, dashboard UI, time-series data storage, chart components. Large feature surface that doesn't help the core loop (submit -> play -> earn). | Provide basic stats via API response when submitting: "Your track has earned X tips, played Y times." Agents can query programmatically. No dashboard UI needed for MVP. | MEDIUM |
| A11 | **Custom tip amounts** | "Let listeners tip whatever they want" | Custom amount input adds UI complexity, edge cases (too small, too large), and decision fatigue. Listeners stall on "how much should I tip?" | Fixed preset amounts (e.g., 0.10, 0.50, 1.00 USDC). Already decided. This is correct -- reduces friction. | HIGH |
| A12 | **Pre-seeded content / house tracks** | "The station shouldn't be empty at launch" | Creates false expectations. If there are 10 pre-seeded tracks but no real agent submissions, the station sounds active but is actually dead. Also, who makes these tracks? The team? That undermines the "agent-made music" premise. | "Waiting for first track" empty state (already decided). The empty state IS the call to action: be the first agent on air. | HIGH |

---

## Feature Dependencies

```
                    +-------------------+
                    | Audio Storage     |
                    | (R2 + D1 metadata)|
                    +--------+----------+
                             |
              +--------------+--------------+
              |                             |
    +---------v---------+        +----------v----------+
    | Track Submission   |        | Audio Playback      |
    | API (x402-gated)   |        | Engine (client-side) |
    +--------+-----------+        +----------+----------+
             |                               |
             |                    +----------+----------+
             |                    |                     |
             |           +-------v-------+    +--------v--------+
             |           | Now-Playing   |    | Frequency       |
             |           | Display       |    | Visualizer      |
             |           | (title/agent) |    | (Web Audio API) |
             |           +-------+-------+    +-----------------+
             |                   |
             |          +--------v--------+
             |          | Tip / Buy       |
             |          | Buttons         |
             |          +--------+--------+
             |                   |
             |          +--------v--------+
             |          | Embedded Wallet |
             |          | (for listeners) |
             |          +--------+--------+
             |                   |
    +--------v--------+ +-------v---------+
    | Agent Wallet    | | Payment Flow    |
    | (identity +     | | (x402 protocol) |
    | earnings)       | +-----------------+
    +-----------------+

    Queue Management (decay rotation)
         depends on: Audio Storage + Playback Engine

    Agent Onboarding Prompt (homepage)
         depends on: Track Submission API being live

    Track Transitions (gapless/crossfade)
         depends on: Queue Management + Playback Engine

    Error Recovery
         depends on: Playback Engine + Queue state sync
```

### Critical Path

The critical dependency chain is:

```
Audio Storage -> Submission API -> Queue Management -> Playback Engine -> Now-Playing -> Tip/Buy -> Payments
```

Everything branches from audio storage. The playback engine is the most complex client-side component. Payments are the final layer but also the core monetization -- they should be built early to validate the full loop.

### Parallel Workstreams

Two workstreams can proceed in parallel after audio storage is built:

1. **Submission path:** API endpoint -> x402 gating -> queue insertion
2. **Playback path:** Audio fetching -> playback engine -> visualizer -> now-playing display

These converge when the playback engine reads from the queue that the submission API writes to.

---

## MVP Scope Validation

### Planned MVP vs. Table Stakes Audit

| Planned Feature | Table Stake? | Status | Gap? |
|----------------|-------------|--------|------|
| Continuous audio stream with queue + decay rotation | T1, T9 | Planned | T9 (transitions) needs explicit attention |
| Track submission via x402 API | D4 | Planned | No gap |
| Listener tipping with presets via embedded wallets | T7, D2 | Planned | No gap |
| Track purchase/download | D7 | Planned | No gap |
| Frequency visualizer | T5, D6 | Planned | No gap |
| Homepage with agent onboarding prompt | D3 | Planned | No gap |
| Audio storage on R2 with D1 metadata | Infrastructure | Planned | No gap |
| Platform 5% fee | D8 | Planned | No gap |
| Fallback cover art (identicon) | UX polish | Planned | No gap |
| Empty queue state | T8 | Planned | No gap |

### Identified Gaps in Planned MVP

| Gap | Category | Severity | Recommendation |
|-----|----------|----------|----------------|
| Track transitions (gapless/crossfade) | T9 | HIGH | Add to requirements. Dead air kills retention. Even a 0.5s crossfade prevents the "is it broken?" moment. |
| Error recovery / reconnection | T10 | HIGH | Add to requirements. Mobile browsers aggressively suspend tabs. Player must detect loss and auto-recover. |
| Volume control | T4 | MEDIUM | Add to requirements. Trivial to implement but missing = frustrating. |
| Media Session API integration | T6 (mobile) | MEDIUM | Enables lock screen controls on mobile (play/pause, track info). Small effort, big mobile UX improvement. |
| Loading / buffering states | T1 | MEDIUM | Player needs visible loading state. "Connecting..." or spinner while audio buffers. Without it, users think the page is broken. |
| Basic agent stats via API | D10 | LOW | Not a listener feature, but agents need SOME feedback. A simple GET endpoint returning play count + earnings for a wallet address. |

---

## MVP Definition

### Launch With (v1.0 -- must ship)

These are non-negotiable for a viable product:

| Feature | Complexity | Rationale |
|---------|-----------|-----------|
| Audio playback engine with play/pause | Medium | Core product. Without this, there's no product. |
| Volume control | Low | Basic transport control. |
| Track submission API (x402-gated) | High | Supply side. No tracks = no station. |
| Queue management with decay rotation | Medium | Content freshness. Prevents staleness. |
| Gapless or crossfade track transitions | Medium | Dead air = user leaves. Must feel like radio. |
| Now-playing display (title, agent name/wallet, identicon) | Low | Listeners must know what they're hearing to tip/buy it. |
| Frequency visualizer | Medium | Visual proof that audio is active. Makes page feel alive. |
| Tip buttons (fixed presets) | Medium | Core monetization. Primary CTA. |
| Buy/download button (fixed price) | Medium | Secondary monetization. |
| Embedded wallet creation for listeners | High | Zero-friction payment. No wallet = no payments. |
| x402 payment flows (submission, tip, buy) | High | The money pipe. Must work flawlessly. |
| Homepage with agent onboarding prompt | Low | Growth engine. Copy-paste to your agent = instant supply. |
| Audio storage (R2) + metadata (D1) | Medium | Infrastructure foundation. |
| Empty state ("waiting for first track") | Low | Graceful pre-content experience. |
| Loading/buffering/error states | Low | Users must always know what's happening. |
| Error recovery / auto-reconnection | Medium | Playback must survive network hiccups. |
| Mobile-responsive layout | Medium | Significant mobile audience expected. |

### Add After Validation (v1.1 -- once core loop is proven)

These are valuable but should only be built once there's evidence the core loop works (agents submit, listeners tip):

| Feature | Complexity | Trigger to Build |
|---------|-----------|-----------------|
| Media Session API (lock screen controls) | Low | Mobile listeners complain about losing controls when switching apps. |
| Basic agent stats API (GET /agent/:wallet/stats) | Low | Agent operators ask "how are my tracks doing?" |
| Loudness normalization on submission | Medium | Listener complaints about volume jumps between tracks. |
| "Currently on air" track history (last 5-10 tracks) | Low | Listeners arrive mid-track and want to know what played before. |
| Keyboard shortcuts (space = pause, arrows = volume) | Low | Power users request them. |
| Basic metadata validation (title length, audio duration check) | Low | Garbage submissions from agents that don't follow instructions. |
| Share button (copy link to station) | Low | Any organic sharing happening = amplify it. |
| Open Graph / social preview meta tags | Low | Links shared on Twitter/Discord should look good. Should arguably be in v1.0 -- very low effort. |

### Future Consideration (v2.0+ -- only with proven demand)

| Feature | Complexity | Why Wait |
|---------|-----------|---------|
| Multiple channels / genres | High | Need enough content volume to fill multiple channels without repetition. |
| Listener count display | Low | Only valuable once count is consistently impressive (50+). |
| Agent dashboard (web UI) | High | Agents can get stats via API. Dashboard is nice-to-have, not need-to-have. |
| Track ratings / quality signals | Medium | Adds complexity to rotation algorithm. Tips already serve as quality signal. |
| Collaborative agent tracks (multiple agents credited) | Medium | Novel but complex payment splitting. |
| Scheduled "shows" / time slots | High | Turns simple queue into a scheduling system. Only if demand exists. |
| API for external players (embed claw.fm in other sites) | Medium | Interesting for ecosystem growth but not core. |
| Audio fingerprinting / copyright detection | High | Only if copyright complaints actually happen. |
| Custom cover art submission with tracks | Low-Medium | Nice visual upgrade but adds storage and moderation concerns. |

---

## Feature Prioritization Matrix

Mapping features by listener impact vs implementation complexity:

```
                        HIGH IMPACT
                            |
        Tip buttons (T7)    |    Audio playback (T1)
        Buy/download (D7)   |    Queue + transitions (T9)
        Embedded wallet (D2) |    Submission API (D4)
                            |    Now-playing display (T2)
                            |
    LOW COMPLEXITY ---------+--------- HIGH COMPLEXITY
                            |
        Volume control (T4)  |    Loudness normalization (A8)
        Empty state (T8)    |    Multiple channels (A5)
        Agent prompt (D3)   |    Agent dashboard (A10)
        Share button        |    Audio fingerprinting (A7)
        OG meta tags        |    User accounts (A1)
                            |
                        LOW IMPACT
```

**Priority quadrant guide:**
- **Top-right (high impact, high complexity):** Build these carefully. They're the core product.
- **Top-left (high impact, low complexity):** Build these immediately. Quick wins with big payoff.
- **Bottom-left (low impact, low complexity):** Sprinkle these in when you have spare cycles.
- **Bottom-right (low impact, high complexity):** Do NOT build these. This is where scope creep lives.

---

## Domain-Specific Feature Insights

### What crypto-native music platforms get wrong

Based on patterns from Sound.xyz, Audius, Catalog, and similar platforms (MEDIUM confidence -- training data):

1. **Over-financialization:** Making every interaction a transaction kills the vibe. Listening should be free and frictionless. Only tip/buy when you WANT to. claw.fm's approach (free to listen, pay only to tip/buy) is correct.

2. **Wallet friction:** Most crypto music platforms assume users already have wallets. Embedded wallet creation is the right call -- but the UX must be invisible. "Click tip -> wallet auto-created -> tip sent" not "Click tip -> install MetaMask -> connect -> approve -> sign -> confirm."

3. **Complex tokenomics:** Governance tokens, staking, yield farming on music. All of this is noise. claw.fm's "USDC in, USDC out" simplicity is a major advantage. Do not add a token.

4. **Neglecting the listening experience:** Many crypto music platforms feel like NFT marketplaces that happen to have audio. The MUSIC must be the hero. Player quality, visualizer, transitions -- these matter more than payment UI.

### What web radio stations get wrong

1. **Broken mobile experience:** Most internet radio stations have terrible mobile web players. Media Session API integration and responsive design are competitive advantages.

2. **No visual engagement:** Traditional radio relies on the DJ's voice for engagement. A web station without a DJ needs visual engagement instead. The frequency visualizer is the right instinct -- it's the visual equivalent of "something is happening."

3. **Opaque "what's playing":** Many stations don't clearly show track info. When you can't identify what you're hearing, you can't engage with it (tip, buy, remember).

### What's unique about AI-agent-as-artist

This is genuinely novel territory (LOW confidence -- no direct precedents):

1. **Agents need programmatic feedback.** Unlike human artists who check a dashboard, agents need API-accessible stats. The simple stats endpoint is important for the agent feedback loop.

2. **Quality will vary wildly.** CLI-generated music (sox, csound) quality depends heavily on the agent's prompt and tool proficiency. Expect everything from noise to surprisingly good compositions. The decay rotation handles this naturally -- bad tracks fade out quickly.

3. **Submission volume could spike.** An agent can submit tracks much faster than a human musician. The 0.01 USDC fee and any rate limiting should be calibrated for agent speed, not human speed. Consider per-wallet rate limits (e.g., max 10 submissions per hour).

4. **Agent identity is wallet-ephemeral.** Agents may use different wallets for different "personas." This is fine -- wallet = identity is still correct. Each wallet is effectively a different artist.

---

## Confidence Assessment

| Area | Confidence | Reasoning |
|------|------------|-----------|
| Table stakes (radio UX) | HIGH | Web radio patterns are well-established and stable. Browser audio APIs haven't changed fundamentally. |
| Differentiators | HIGH | These are directly derived from project decisions already documented. |
| Anti-features | HIGH | "Don't build X" recommendations based on clear rationale tied to the radio format and MVP constraints. |
| Crypto music platform patterns | MEDIUM | Based on training data from Sound.xyz, Audius, Catalog. These platforms may have evolved since training cutoff. |
| AI-agent-as-artist patterns | LOW | Genuinely novel territory. No established patterns exist. Recommendations are reasoned hypotheses. |
| Complexity estimates | MEDIUM | Based on general web development patterns. Actual complexity depends heavily on chosen libraries and edge cases discovered during implementation. |

---

## Sources

- Training data knowledge of web radio stations (SomaFM, NTS Radio, radio.co ecosystem) -- MEDIUM confidence
- Training data knowledge of crypto music platforms (Sound.xyz, Audius, Catalog, Zora) -- MEDIUM confidence
- Training data knowledge of Web Audio API, Media Session API, browser autoplay policies -- HIGH confidence (stable web standards)
- Training data knowledge of Cloudflare Workers constraints -- MEDIUM confidence
- Project context from `.planning/PROJECT.md` -- direct source, HIGH confidence
- No live sources were available (WebSearch and WebFetch were unavailable during this research session)

**Recommendation:** Before finalizing the roadmap, verify crypto-native music platform current state (Sound.xyz, Audius) and confirm Web Audio API patterns with Context7 or MDN docs. The core feature recommendations are sound regardless, but competitive landscape verification would increase confidence.
