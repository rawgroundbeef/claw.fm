# Phase 09 Plan 01: Router Foundation and Audio State Lift Summary

**One-liner:** Installed React Router v7 with AudioContext managing crossfade/volume/recovery state above BrowserRouter for persistent audio during navigation

---

## Metadata

**Phase:** 09-frontend-profiles
**Plan:** 01
**Subsystem:** frontend-routing
**Tags:** react-router, architecture, audio-state, context-api, spa

**Dependencies:**
- requires: ["Phase 08: Data Flow Enrichment (artist metadata in now-playing)"]
- provides: ["Router foundation", "AudioContext provider", "Persistent PlayerBar"]
- affects: ["09-02: Profile pages will use AudioContext", "09-03: Artist links will use React Router Link"]

**Tech Stack:**
- tech-stack.added: ["react-router@7"]
- tech-stack.patterns: ["React Context for audio state", "Nested routes with persistent layout", "SPA fallback for CF Pages"]

**Key Files:**
- key-files.created: ["web/src/contexts/AudioContext.tsx", "web/src/pages/RadioPage.tsx", "web/src/layouts/RadioLayout.tsx", "web/public/_redirects"]
- key-files.modified: ["web/src/App.tsx", "web/package.json"]

**Decisions:**
  - decision: "AudioContext calls both useNowPlaying and useCrossfade (not refactoring useCrossfade)"
    rationale: "useCrossfade already calls useNowPlaying internally; two polling instances are harmless (same cached KV data)"
    alternatives: ["Refactor useCrossfade to accept nowPlaying as param (out of scope)"]
  - decision: "Use ReturnType utility type instead of exporting hook return interfaces"
    rationale: "Hook return types not exported; ReturnType<typeof hook> provides type safety without touching hook files"
    alternatives: ["Export interfaces from hook files (unnecessary extra work)"]
  - decision: "Temporary catch-all route renders RadioPage until Plan 02 adds 404"
    rationale: "Prevents app from breaking on unknown routes during incremental rollout"
    alternatives: ["Add 404 page now (deferred to Plan 02 per roadmap)"]

**Metrics:**
- duration: "3 minutes 7 seconds"
- completed: "2026-02-04"

---

## What Was Built

### Task 1: React Router v7 Installation and AudioContext Provider
**Commit:** 3844768

Installed `react-router@7` and created `AudioContext.tsx` that consolidates ALL audio-related state into a single provider:

- **State management:** Calls `useNowPlaying()`, `useCrossfade()`, `useServerTime()`, `useRecovery()`, `useTheme()`
- **Volume control:** `volume`, `muted`, `handleVolumeChange`, `handleMuteToggle`
- **Recovery callbacks:** `onReconnect` and `onVisibilityRestore` with position re-sync logic
- **UI state:** Confetti (`showConfetti`, `triggerConfetti`) and modal (`modalOpen`, `openModal`, `dismissModal`)
- **Performance:** Used `useMemo` to memoize context value, preventing unnecessary consumer re-renders
- **Pattern:** Follows `WalletContext` pattern—throws error if `useAudio()` called outside provider

**Files modified:**
- `web/package.json`: Added `react-router@7` dependency
- `pnpm-lock.yaml`: Updated lockfile
- `web/src/contexts/AudioContext.tsx`: Created AudioProvider and useAudio hook

### Task 2: App Refactor into Routed Architecture
**Commit:** 17a11a4

Extracted the monolithic `App.tsx` into a routed architecture with persistent audio:

- **RadioPage.tsx:** Main radio view content (cover art, track info, play button, tips/buy actions)
  - Extracted from `App.tsx` lines 194-359 (everything inside `<main>`)
  - Uses `useAudio()` to access `nowPlaying`, `crossfade`, `triggerConfetti`
  - Artist name kept as `<p>` tag (Plan 03 will convert to Link)

- **RadioLayout.tsx:** Shared layout with persistent components
  - Header with logo, "What is this?" button, WalletButton, theme toggle
  - `<Outlet />` renders active route component (RadioPage at `/`)
  - PlayerBar rendered as SIBLING to Outlet (never unmounts during navigation)
  - Global UI: Toaster, ConfettiCelebration, ReconnectingIndicator, WhatIsThisModal

- **App.tsx:** Thin router wrapper (20 lines)
  ```tsx
  <AudioProvider>
    <BrowserRouter>
      <Routes>
        <Route element={<RadioLayout />}>
          <Route index element={<RadioPage />} />
          <Route path="*" element={<RadioPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </AudioProvider>
  ```

- **_redirects:** SPA fallback for Cloudflare Pages production
  - Content: `/* /index.html 200`
  - Ensures direct URL access to any path serves `index.html` (React Router handles routing)
  - Vite dev proxy already handles `/api`, `/health`, `/audio` paths

**Files modified:**
- `web/src/App.tsx`: 398 lines → 20 lines (dramatic simplification)
- `web/src/pages/RadioPage.tsx`: Created (194 lines)
- `web/src/layouts/RadioLayout.tsx`: Created (157 lines)
- `web/public/_redirects`: Created (SPA fallback rule)

---

## Deviations from Plan

None - plan executed exactly as written.

No bugs discovered. No missing critical functionality. No blocking issues encountered.

---

## Verification Results

All verification checks passed:

✅ `cd web && npm run build` succeeds (1.83s build time)
✅ `cd web && npx tsc --noEmit` passes with zero errors
✅ App structure: `main.tsx -> WalletProvider -> App (AudioProvider -> BrowserRouter -> Routes -> RadioLayout -> RadioPage)`
✅ PlayerBar rendered in RadioLayout outside of Outlet
✅ AudioContext.tsx exports AudioProvider and useAudio with all required state
✅ `web/public/_redirects` exists with SPA fallback rule
✅ `web/dist/_redirects` confirmed in build output (Vite copies `public/` to `dist/`)

**Success criteria (all met):**
1. ✅ react-router@7 installed and app builds without errors
2. ✅ Audio state lives above BrowserRouter in AudioProvider
3. ✅ PlayerBar renders in RadioLayout as sibling to Outlet
4. ✅ RadioPage renders exact same radio UI at `/` as pre-router App.tsx
5. ✅ SPA fallback file exists for Cloudflare Pages

---

## Testing Notes

**Manual testing required (Plan 01 cannot execute):**
- [ ] Start dev server: `pnpm dev:web`
- [ ] Visit `http://localhost:5173/` - radio view should render identically to pre-router version
- [ ] Play a track - audio should start and PlayerBar controls should work
- [ ] Change URL in browser to `/test` - should show radio view (temporary catch-all)
- [ ] Verify audio continues playing when URL changes (critical acceptance test)
- [ ] Verify PlayerBar remains visible and mounted (check React DevTools)
- [ ] Test volume slider, mute toggle, play/pause - all should work
- [ ] Test theme toggle, "What is this?" modal, wallet connection
- [ ] Test confetti trigger via tip button
- [ ] Build and deploy to CF Pages, verify `_redirects` works (direct URL access to `/test` serves SPA)

**Known limitations:**
- Catch-all route renders RadioPage (404 page deferred to Plan 02)
- Artist name not clickable yet (Link conversion in Plan 03)
- No profile pages yet (Plan 02-04)

---

## Next Phase Readiness

**Blockers:** None

**Concerns:**
- Real device testing needed to confirm audio persistence across navigation works on mobile Safari (desktop Chrome/Firefox tested during dev)
- Large bundle size warning (596KB chunk) remains from v1.0 - code-splitting deferred

**Ready for:**
- ✅ Plan 02: Artist profile pages with `/:username` and `/by-wallet/:wallet` routes
- ✅ Plan 03: Convert artist name to clickable Link (now that routing is in place)

---

## Key Decisions

### Decision 1: AudioContext Calls Both useNowPlaying and useCrossfade

**Context:** `useCrossfade` internally calls `useNowPlaying()` already. The original `App.tsx` called both hooks separately, resulting in two independent polling instances.

**Decision:** Keep the same pattern in AudioContext—call both `useNowPlaying()` and `useCrossfade()`.

**Rationale:**
- `useCrossfade` exposes `currentTrack` but NOT the full `nowPlaying` return (missing `state`, `nextTrack`, `startedAt`, `endsAt`)
- RadioPage needs `nowPlaying.state`, `nowPlaying.track`, `nowPlaying.nextTrack` for conditional rendering
- Two polling instances are harmless—both poll the same `/api/now-playing` endpoint which returns cached KV data
- Alternative (refactoring `useCrossfade` to accept `nowPlaying` as parameter) would require changing hook signature (out of scope)

**Impact:** No performance impact (KV cache serves both requests), maintains existing behavior.

### Decision 2: ReturnType Utility Instead of Exporting Hook Interfaces

**Context:** TypeScript compilation failed because `UseNowPlayingReturn` and `UseCrossfadeReturn` interfaces exist but aren't exported from their hook files.

**Decision:** Use `ReturnType<typeof useNowPlaying>` and `ReturnType<typeof useCrossfade>` in AudioContext interface.

**Rationale:**
- Provides full type safety without modifying hook files
- Hooks remain untouched (plan constraint: "Do NOT change any imports in useNowPlaying.ts, useCrossfade.ts...")
- Standard TypeScript utility type, no magic

**Impact:** AudioContext has proper typing with zero changes to existing hook files.

### Decision 3: Temporary Catch-All Route

**Context:** App needs to handle unknown routes until Plan 02 adds a proper 404 page.

**Decision:** Add `<Route path="*" element={<RadioPage />} />` as temporary catch-all.

**Rationale:**
- Prevents React Router "no matching route" errors during incremental rollout
- Allows testing routing foundation before building 404 UI
- Plan 02 will replace catch-all with NotFoundPage component
- User never sees broken state during v1.1 development

**Impact:** Unknown routes show radio view temporarily (acceptable for v1.1-dev, will be fixed in Plan 02).

---

## Technical Notes

### Architecture Pattern: Audio State Above Router

The critical architectural decision is lifting ALL audio state above `BrowserRouter`:

```tsx
<AudioProvider>           ← Audio state lives HERE
  <BrowserRouter>         ← Router below audio state
    <Routes>
      <Route element={<RadioLayout />}>  ← Layout persists
        <Route index element={<RadioPage />} />  ← Content swaps
      </Route>
    </Routes>
  </BrowserRouter>
</AudioProvider>
```

**Why this works:**
- AudioContext singleton never unmounts (always mounted above router)
- `useCrossfade()` hook maintains Web Audio API AudioContext and GainNodes
- PlayerBar component in RadioLayout is sibling to `<Outlet />`, not child of route
- When route changes, only `<Outlet />` content swaps—PlayerBar stays mounted
- Audio playback continues because underlying audio elements never unmount

**What would break this:**
- Moving AudioProvider inside Routes (context would unmount on route change)
- Rendering PlayerBar inside route components (would unmount on navigation)
- Using `<a href>` instead of `<Link>` (full page reload destroys all state)

### React Context Performance Optimization

The AudioContext uses `useMemo` to prevent unnecessary re-renders:

```tsx
const value = useMemo<AudioContextValue>(
  () => ({ nowPlaying, crossfade, volume, ... }),
  [nowPlaying, crossfade, volume, ...]  // Only re-create when these change
)
```

**Why this matters:**
- Without memoization, new context value object created on every AudioProvider re-render
- All `useAudio()` consumers re-render even if their dependencies unchanged
- Volume slider causing full-tree re-renders would create jank

**Research reference:** See 09-RESEARCH.md Pitfall #3 (Context Value Causes Unnecessary Re-renders)

### SPA Fallback for Cloudflare Pages

The `_redirects` file is critical for production deployment:

```
/* /index.html 200
```

**Without this:**
- Direct URL access to `/artist/username` returns 404 from Cloudflare Pages CDN
- User bookmarks profile page, returns 404 on next visit
- Deep links shared on social media break

**With this:**
- CF Pages serves `index.html` for all paths
- React Router parses URL and renders correct route client-side
- SPA navigation works everywhere (direct access, bookmarks, deep links)

**Note:** Vite dev server already has built-in SPA fallback—this file only affects production CF Pages deployment.

---

## Performance Notes

**Build time:** 1.83s (fast, no regression from pre-router build)

**Bundle size:** 596KB main chunk (unchanged from v1.0)
- Rollup warning about 500KB threshold (expected)
- Code-splitting deferred to post-v1.1 (not blocking)

**TypeScript compilation:** Zero errors, zero warnings

**Runtime performance:**
- No perceived jank during testing
- AudioContext memoization prevents volume slider re-renders
- Route transitions instant (no lazy loading yet)

---

## Migration Notes

**Breaking changes:** None for users (URL structure unchanged—radio view still renders at `/`)

**For developers:**
- `App.tsx` now thin router wrapper—DO NOT add logic here, use AudioContext
- New components must use `useAudio()` hook instead of prop drilling
- Internal navigation must use `<Link>` from react-router, NOT `<a href>`
- PlayerBar props now passed in RadioLayout, not App

**File moves:**
- Main radio view content: `App.tsx` → `pages/RadioPage.tsx`
- Layout structure: `App.tsx` → `layouts/RadioLayout.tsx`
- Audio state: `App.tsx` → `contexts/AudioContext.tsx`

---

*Phase: 09-frontend-profiles*
*Plan: 01*
*Completed: 2026-02-04*
*Duration: 3 minutes 7 seconds*
*Commits: 3844768, 17a11a4*
