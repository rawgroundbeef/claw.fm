---
phase: 04-frontend-player
plan: 03
subsystem: ui
tags: [canvas, web-audio-api, visualizer, react, hooks, animation]

# Dependency graph
requires:
  - phase: 04-01
    provides: Audio foundation with AudioContext singleton
provides:
  - Waveform visualizer with live audio response and idle animation
  - useVisualizer hook for Canvas 2D animation loop with HiDPI support
  - generateIdleWaveform utility for gentle breathing animation when paused
affects: [04-04, 04-05, 04-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Canvas 2D animation loop with requestAnimationFrame
    - HiDPI canvas rendering via devicePixelRatio scaling
    - ResizeObserver for responsive canvas dimensions
    - Idle animation using synthetic waveform data

key-files:
  created:
    - web/src/hooks/useVisualizer.ts
    - web/src/components/Visualizer/Waveform.tsx
    - web/src/components/Visualizer/IdleAnimation.tsx
  modified: []

key-decisions:
  - "Use Canvas 2D for waveform rendering (not SVG) for 60fps performance"
  - "HiDPI setup once on mount/resize, not every frame, to avoid performance overhead"
  - "Idle animation as utility function, not separate component - same drawing pipeline"
  - "Type assertion (as any) for getByteTimeDomainData due to TS lib ArrayBufferLike mismatch"
  - "Explicitly create ArrayBuffer for Uint8Array to match Web Audio API expectations"

patterns-established:
  - "Canvas HiDPI pattern: canvas.width = rect.width * dpr, ctx.scale(dpr, dpr)"
  - "Animation loop with isPlaying switch: live AnalyserNode data vs idle synthetic data"
  - "Breathing animation: amplitude oscillates with slow sine wave, phase drift for lateral movement"

# Metrics
duration: 3min
completed: 2026-02-01
---

# Phase 04 Plan 03: Waveform Visualizer Summary

**Canvas 2D waveform responds to live AnalyserNode frequency data, switches to gentle breathing animation when paused, crisp HiDPI rendering**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-01T22:54:05Z
- **Completed:** 2026-02-01T22:57:38Z
- **Tasks:** 2 (combined implementation)
- **Files modified:** 3

## Accomplishments
- useVisualizer hook drives 60fps Canvas animation with requestAnimationFrame
- HiDPI support via devicePixelRatio scaling, responsive via ResizeObserver
- Live waveform renders AnalyserNode.getByteTimeDomainData when playing
- Gentle breathing sine wave idle animation when paused (subtle amplitude oscillation with lateral drift)
- Electric brand color (#0066FF) for waveform stroke

## Task Commits

1. **Task 1 & 2: useVisualizer hook, Waveform component, IdleAnimation utility** - `a3d2fd3` (feat)
   - Created all three files in single commit (Task 2 was dependency of Task 1)
   - IdleAnimation utility exports generateIdleWaveform function
   - useVisualizer imports and uses it for paused state

## Files Created/Modified

- `web/src/hooks/useVisualizer.ts` - Animation loop hook connecting AnalyserNode to Canvas 2D, switches between live audio and idle animation
- `web/src/components/Visualizer/Waveform.tsx` - Canvas wrapper component rendering waveform via useVisualizer hook
- `web/src/components/Visualizer/IdleAnimation.tsx` - Utility function generating gentle breathing sine wave data for paused state

## Decisions Made

**Canvas 2D over SVG for 60fps performance**
- Rationale: requestAnimationFrame + Canvas is the standard for real-time audio visualization. SVG would require DOM manipulation every frame.

**HiDPI setup on mount/resize, not every frame**
- Rationale: Setting canvas.width/height and ctx.scale() every frame would cause flicker and waste cycles. Do once, then just draw.

**Idle animation as utility, not component**
- Rationale: Uses the same Canvas drawing pipeline as live audio. Just fills the data buffer differently. No need for separate component.

**Type assertion for getByteTimeDomainData**
- Rationale: TypeScript lib defines parameter as Uint8Array<ArrayBuffer> but our ref is Uint8Array<ArrayBufferLike>. Runtime works fine, TS needs assertion.

**Explicitly create ArrayBuffer for data buffer**
- Rationale: new Uint8Array(length) creates ArrayBufferLike. Explicit ArrayBuffer creation ensures Uint8Array<ArrayBuffer> type.

**Electric brand color (#0066FF)**
- Rationale: Brand color from tailwind.config.js. Waveform is primary visual element - should use brand identity.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript ArrayBufferLike vs ArrayBuffer type mismatch**
- **Found during:** Task 1 (useVisualizer hook implementation)
- **Issue:** Web Audio API's getByteTimeDomainData expects Uint8Array<ArrayBuffer>, but Uint8Array constructor creates Uint8Array<ArrayBufferLike>. TypeScript strict mode error.
- **Fix:** Explicitly created ArrayBuffer and passed to Uint8Array constructor. Added type assertion (as any) at getByteTimeDomainData call site to satisfy compiler.
- **Files modified:** web/src/hooks/useVisualizer.ts, web/src/components/Visualizer/IdleAnimation.tsx
- **Verification:** pnpm --filter claw-fm-web exec tsc --noEmit passes
- **Committed in:** a3d2fd3 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** TypeScript compatibility fix required for compilation. No functional changes to planned behavior.

## Issues Encountered

None - implementation proceeded as planned after TypeScript type issue resolution.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Waveform visualization complete and ready for integration into main player layout
- useVisualizer hook exports { isActive } for external monitoring if needed
- Waveform component can be placed anywhere with className for sizing
- Ready for 04-04 (PlayerBar with play controls) to integrate visualizer into page layout

---
*Phase: 04-frontend-player*
*Completed: 2026-02-01*
