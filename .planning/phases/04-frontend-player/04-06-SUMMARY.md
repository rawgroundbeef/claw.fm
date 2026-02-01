---
phase: 04-frontend-player
plan: 06
subsystem: frontend-player
tags: [react, error-recovery, resilience, network, tab-visibility, web-audio-api]
requires: [04-05]
provides:
  - useRecovery hook for network and tab visibility recovery
  - ReconnectingIndicator for connection status UI
  - Audio element error/stall/waiting event handling
  - Automatic retry logic with health polling
  - Buffering state propagation throughout player
tech-stack:
  added: []
  patterns:
    - Page Visibility API for tab backgrounding detection
    - Window online/offline events for network drop detection
    - Health endpoint polling with exponential backoff
    - Audio element error event recovery
key-files:
  created:
    - web/src/hooks/useRecovery.ts
    - web/src/components/ReconnectingIndicator.tsx
  modified:
    - web/src/hooks/useAudioPlayer.ts
    - web/src/hooks/useCrossfade.ts
    - web/src/hooks/useNowPlaying.ts
    - web/src/App.tsx
decisions:
  - id: recovery-health-polling
    decision: Poll /health endpoint for reconnection (max 5 retries, 2s delay)
    rationale: Simple, reliable way to verify server is reachable after network restore
    alternatives: [Ping /api/now-playing directly, exponential backoff]
    impact: Consistent reconnection UX, avoids hammering server
  - id: stall-recovery-timeout
    decision: 3 second timeout for stalled audio recovery
    rationale: Balance between giving stream time to recover and user perception of responsiveness
    alternatives: [Immediate retry, longer timeout]
    impact: Audio stalls trigger load() + play() after 3s
  - id: buffering-state-propagation
    decision: Expose isBuffering from useAudioPlayer through useCrossfade to App.tsx
    rationale: Single source of truth for buffering state, ensures UI consistency
    alternatives: [Duplicate buffering detection in each layer]
    impact: Spinner appears consistently on play button and large landing button
metrics:
  duration: 2.6m
  commits: 2
  files-changed: 6
  tests-added: 0
  completed: 2026-02-01
---

# Phase 4 Plan 6: Error Recovery and Resilience Summary

**One-liner:** Network drop handling with reconnection polling, tab backgrounding recovery via Visibility API, audio stall/error auto-retry, and pill-shaped connection indicator overlay.

## What Was Built

Added comprehensive error recovery and resilience layer to the radio player:

1. **useRecovery Hook**: Handles three recovery scenarios:
   - **Network drops** (PLAY-06): Listens for window `online`/`offline` events, polls `/health` endpoint with 5 retries at 2s intervals when connection restored
   - **Tab backgrounding** (PLAY-07): Uses Page Visibility API to detect tab hidden/restored, re-syncs audio position when user returns
   - **Visual feedback**: Returns `isOffline`, `isReconnecting`, `wasBackgrounded` state for UI

2. **ReconnectingIndicator Component**: Top-center pill-shaped overlay showing connection status:
   - "Connection lost" when offline
   - "Reconnecting..." with animated dots during health polling
   - Fixed positioning with `z-50`, smooth transitions

3. **Audio Element Error Recovery**: Enhanced useAudioPlayer with:
   - `error` event handler: Sets `hasError` state, logs error
   - `stalled` event handler: Sets `isBuffering` true, attempts `load()` + `play()` after 3s timeout
   - `waiting` event handler: Sets `isBuffering` true
   - `playing` event handler: Clears `isBuffering` state
   - `retry()` method: Manual recovery trigger for external use

4. **App.tsx Integration**: Wired recovery throughout application:
   - `onReconnect`: Re-fetches now-playing state, calculates correct playback position from server time, seeks audio element
   - `onVisibilityRestore`: Similar to reconnect but skips health check (tab restore is instant)
   - Buffering state shown on both large landing play button (spinner) and player bar play button
   - ReconnectingIndicator rendered at top of app

## Requirements Addressed

- **PLAY-06**: Network error handling with auto-retry ✅
- **PLAY-07**: Tab backgrounding recovery with position re-sync ✅
- **UI-04**: Loading and buffering states visible to user ✅

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added refetch() method to useNowPlaying**

- **Found during:** Task 2, when wiring onReconnect callback
- **Issue:** Plan assumed useNowPlaying exposed refetch() method, but it was missing from the interface. Recovery logic requires ability to manually trigger fetch after reconnection.
- **Fix:** Added `refetch: () => Promise<void>` to UseNowPlayingReturn interface, exposed internal `fetchNowPlaying` callback in return statement
- **Files modified:** `web/src/hooks/useNowPlaying.ts`
- **Commit:** 4f4483c
- **Rationale:** Critical for recovery scenarios - after network restore or tab visibility change, must re-fetch latest now-playing state to sync with server

## Technical Deep-Dive

### Network Recovery Flow

1. User loses network → `window 'offline'` event fires
2. `isOffline` set to true, ReconnectingIndicator shows "Connection lost"
3. Network restored → `window 'online'` event fires
4. `isReconnecting` set to true, indicator shows "Reconnecting..."
5. Health polling loop begins:
   - Fetch `/api/health` endpoint
   - If 200 OK: call `onReconnect()` callback, clear reconnecting state
   - If fails: wait 2s, retry (max 5 attempts)
6. `onReconnect()` in App.tsx:
   - Calls `nowPlaying.refetch()` to get latest track
   - Calculates correct playback position via `getCorrectPlaybackPosition()`
   - Seeks audio element to synced position
   - Audio resumes seamlessly

### Tab Backgrounding Flow

1. User switches tabs → `document.visibilitychange` event fires with `document.hidden === true`
2. Record `wasPlayingBeforeHidden` in ref (for restoration check)
3. User returns to tab → `document.visibilitychange` with `document.hidden === false`
4. If was playing: call `onVisibilityRestore()`, set `wasBackgrounded` briefly (2s)
5. `onVisibilityRestore()` in App.tsx:
   - Calculates correct playback position (server time may have drifted)
   - Seeks audio element to current position
   - Audio continues without interruption

### Audio Stall Recovery

1. Audio element fires `stalled` event (network buffer depleted)
2. Set `isBuffering` true (UI shows spinner)
3. Start 3s timeout
4. After timeout: call `audio.load()` to reload stream, then `audio.play()`
5. If successful: `playing` event fires, `isBuffering` cleared
6. If fails: error logged, user can manually retry or wait for next track

### State Propagation

```
useAudioPlayer.isBuffering
  ↓
useCrossfade.isBuffering (from active player)
  ↓
App.tsx → PlayButton.isLoading (shows spinner)
        → Large play button (disabled + spinner)
```

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | de33188 | Add useRecovery hook and ReconnectingIndicator |
| 2 | 4f4483c | Wire recovery into useAudioPlayer and App.tsx |

## Next Phase Readiness

**Phase 4 complete.** All player functionality delivered:
- Audio foundation with crossfade ✅
- Audio engine hooks (useAudioPlayer, useNowPlaying, useCrossfade) ✅
- Waveform visualizer ✅
- Player UI components ✅
- App.tsx integration with state machine ✅
- Error recovery and resilience ✅

**Ready for Phase 5: Deployment** (Workers deployment, DNS, SSL, production config)

**Testing recommendations for Phase 5:**
- Test network drop recovery in real network conditions (airplane mode on/off)
- Test tab backgrounding on mobile Safari (iOS background policies)
- Test audio stall recovery with throttled network (Chrome DevTools)
- Verify reconnection indicator appears/disappears cleanly
- Confirm buffering spinner shows during all loading states

## Files Changed

**Created:**
- `web/src/hooks/useRecovery.ts` - Network and tab visibility recovery hook
- `web/src/components/ReconnectingIndicator.tsx` - Connection status overlay

**Modified:**
- `web/src/hooks/useAudioPlayer.ts` - Added error/stall/waiting event handlers, isBuffering/hasError state, retry() method
- `web/src/hooks/useCrossfade.ts` - Exposed isBuffering from active player
- `web/src/hooks/useNowPlaying.ts` - Added refetch() method for recovery scenarios
- `web/src/App.tsx` - Wired useRecovery, ReconnectingIndicator, buffering state to UI

## Impact on Future Work

**Phase 5 (Deployment):**
- Health endpoint must be deployed for reconnection polling to work
- CORS configuration must allow crossOrigin audio requests
- R2 CORS must be configured for Web Audio API access

**Phase 6 (Polish):**
- Consider adding retry count display in ReconnectingIndicator
- Consider exponential backoff for health polling (2s → 4s → 8s)
- Consider showing "Connection restored" success message briefly
