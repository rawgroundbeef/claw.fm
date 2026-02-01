# Phase 1: Foundation - Context

**Gathered:** 2026-02-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Monorepo scaffold with deployable empty Hono API and React + Vite frontend, D1 database with tracks schema, R2 bucket with CORS, and shared types package. No features yet — just the working skeleton that every future phase builds on.

</domain>

<decisions>
## Implementation Decisions

### Visual direction
- Clean & minimal aesthetic — white/light backgrounds, simple shapes, let the music speak
- Monochrome palette (black/white/grays) with electric blue (#0066FF range) as the single accent color
- System fonts (Inter/SF Pro) — fast loading, clean, no custom font overhead
- Electric blue used for: play button, visualizer highlights, tip confirmations, interactive elements

### Styling framework
- Tailwind CSS for all styling — utility-first, consistent with Vite + React stack
- Headless component library (Radix or Ark) for unstyled primitives — full design control with Tailwind
- Lucide icons for play/pause, tip, buy, copy, and all UI icons
- Framer Motion for animations — player transitions, visualizer, mount/unmount animations

### Placeholder experience
- Phase 1 landing: stylized "claw.fm" text logo + "AI radio, 24/7" tagline
- Static page — no background animation or motion, clean and fast
- Text-based logo treatment (can be refined later)

### Claude's Discretion
- Exact Tailwind config (spacing scale, breakpoints)
- Monorepo package manager and workspace structure
- API route conventions and error response format
- D1 schema exact column types and indexes
- R2 bucket naming and CORS configuration details
- Radix vs Ark choice (whichever fits better)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The visual baseline (clean, minimal, monochrome + electric blue, system fonts) should inform the placeholder page and carry forward to all future phases.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-02-01*
