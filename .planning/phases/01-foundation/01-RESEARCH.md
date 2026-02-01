# Phase 1: Foundation - Research

**Researched:** 2026-02-01
**Domain:** Cloudflare Workers + Hono API, React + Vite frontend, TypeScript monorepo
**Confidence:** HIGH

## Summary

Phase 1 establishes a deployable monorepo skeleton with Cloudflare Workers + Hono API, React 19 + Vite frontend, D1 database with tracks schema, R2 bucket with CORS configured for Web Audio API, and shared TypeScript types package. The Cloudflare ecosystem has mature, well-documented tooling for this exact stack.

**Standard approach:** Use `create-hono` for Workers scaffolding, Vite's React template for frontend, pnpm workspaces for monorepo, D1 migrations for schema versioning, and R2 CORS policies for cross-origin audio access. All components have official Cloudflare documentation and proven integration patterns.

**Key risk identified:** R2 CORS configuration for Web Audio API requires specific `ExposeHeaders` configuration (Content-Length, Content-Range). This should be tested in Phase 1 to avoid blocking audio playback implementation in Phase 4.

**Primary recommendation:** Use pnpm workspaces over npm workspaces for 2x faster installs, strict dependency isolation, and content-addressable storage. Follow Cloudflare's official scaffolding tools (create-hono, wrangler commands) rather than manual setup.

## Standard Stack

The established libraries/tools for Cloudflare Workers + React monorepo:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| hono | ^4.11.7 | Workers API framework | Official Cloudflare recommendation, built on Web Standards, native Workers bindings support |
| react | ^19.2.3 | Frontend UI library | Required for OnchainKit (peer dependency), latest stable version |
| react-dom | ^19.2.3 | React DOM renderer | Must match react version exactly |
| vite | ^6.0.x | Frontend build tool | Official Cloudflare Pages integration, fastest dev server, native ESM |
| wrangler | latest | Cloudflare dev/deploy CLI | Official Cloudflare Workers deployment tool |
| pnpm | ^9.x | Package manager | 2x faster than npm, strict dependency isolation, recommended for monorepos |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | ^3.24.2 | Runtime validation | Validate all external inputs (API requests, env vars, D1 query results) |
| zustand | ^5.0.10 | Client state management | Lightweight state (player state, UI state), simpler than Redux |
| tailwindcss | ^3.4.x | Utility-first CSS | Locked decision from CONTEXT.md, pairs with Vite |
| @tailwindcss/vite | latest | Tailwind Vite plugin | Simplifies Tailwind integration with Vite |
| lucide-react | latest | Icon library | Locked decision, tree-shakable, minimal bundle size |
| motion | latest | Animation library | Locked decision (formerly framer-motion), React 19 compatible |
| @cloudflare/workers-types | latest | TypeScript types | Workers runtime types, required for proper TypeScript support |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pnpm workspaces | npm workspaces | npm has phantom dependency issues, slower installs, worse CI/CD performance |
| Hono | itty-router | Hono has better TypeScript support, middleware ecosystem, official CF docs |
| D1 | Durable Objects SQL | D1 is serverless SQLite, simpler for relational data, better for this use case |
| Radix UI | Ark UI | Radix has 32 components vs Ark's 25, more popular (1.3M vs 29k weekly downloads), React-only focus |
| motion | framer-motion | motion is the rebranded package with official React 19 support |

**Installation:**
```bash
# Create monorepo root
mkdir claw-fm && cd claw-fm
pnpm init

# Create workspaces structure
mkdir -p api web packages/shared

# Install Hono API (via create-hono)
cd api
npm create hono@latest . -- --template cloudflare-workers
pnpm install

# Install React frontend (via Vite)
cd ../web
npm create vite@latest . -- --template react-ts
pnpm install react@^19 react-dom@^19
pnpm install -D tailwindcss@3 @tailwindcss/vite autoprefixer
pnpm install lucide-react motion zustand

# Shared types package
cd ../packages/shared
pnpm init
```

## Architecture Patterns

### Recommended Project Structure
```
claw-fm/
├── api/                     # Cloudflare Workers + Hono
│   ├── src/
│   │   ├── index.ts        # Hono app entry point
│   │   ├── routes/         # API route handlers
│   │   └── lib/            # DB queries, utilities
│   ├── migrations/         # D1 SQL migrations
│   ├── wrangler.toml       # Cloudflare configuration
│   └── package.json
├── web/                     # React + Vite frontend
│   ├── src/
│   │   ├── main.tsx        # React entry point
│   │   ├── App.tsx         # Root component
│   │   ├── components/     # UI components
│   │   └── lib/            # API client, utils
│   ├── vite.config.ts      # Vite configuration
│   ├── tailwind.config.js  # Tailwind configuration
│   └── package.json
├── packages/
│   └── shared/             # Shared TypeScript types
│       ├── src/
│       │   └── index.ts    # Exported types
│       ├── tsconfig.json   # TypeScript config
│       └── package.json
├── pnpm-workspace.yaml     # Workspace definition
├── package.json            # Root package.json
└── tsconfig.json           # Root TypeScript config
```

### Pattern 1: Cloudflare Workers + Hono Setup
**What:** Hono app with typed environment bindings for D1 and R2
**When to use:** All Workers endpoints
**Example:**
```typescript
// Source: https://hono.dev/docs/getting-started/cloudflare-workers
import { Hono } from 'hono'

type Bindings = {
  DB: D1Database
  AUDIO_BUCKET: R2Bucket
  SECRET_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/health', (c) => c.json({ status: 'ok' }))

app.get('/tracks', async (c) => {
  const result = await c.env.DB.prepare('SELECT * FROM tracks').all()
  return c.json(result.results)
})

export default app
```

### Pattern 2: D1 Migrations Workflow
**What:** SQL migration files tracked in migrations/ folder
**When to use:** All database schema changes
**Example:**
```bash
# Source: https://developers.cloudflare.com/d1/reference/migrations/
# Create migration
wrangler d1 migrations create DB tracks-schema

# Edit migrations/0001_tracks-schema.sql
# CREATE TABLE tracks (
#   id INTEGER PRIMARY KEY AUTOINCREMENT,
#   title TEXT NOT NULL,
#   wallet TEXT NOT NULL,
#   duration INTEGER NOT NULL,
#   file_url TEXT NOT NULL,
#   created_at INTEGER NOT NULL,
#   play_count INTEGER DEFAULT 0,
#   tip_weight REAL DEFAULT 0.0
# );
# CREATE INDEX idx_tracks_wallet ON tracks(wallet);
# CREATE INDEX idx_tracks_created_at ON tracks(created_at);

# Apply migration locally
wrangler d1 migrations apply DB --local

# Apply migration to production
wrangler d1 migrations apply DB --remote
```

### Pattern 3: R2 CORS Configuration
**What:** CORS policy allowing Web Audio API access from frontend origin
**When to use:** R2 bucket serving audio files to browser
**Example:**
```json
// Source: https://developers.cloudflare.com/r2/buckets/cors/
// Set via Cloudflare dashboard or API
[
  {
    "AllowedOrigins": ["https://claw.fm", "http://localhost:5173"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Length", "Content-Range", "Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```
**Critical:** `ExposeHeaders` must include `Content-Length` and `Content-Range` for Web Audio API to access byte-range requests needed for audio seeking.

### Pattern 4: pnpm Workspaces Configuration
**What:** Workspace protocol for internal package dependencies
**When to use:** Linking shared types from api and web packages
**Example:**
```yaml
# Source: https://pnpm.io/workspaces
# pnpm-workspace.yaml
packages:
  - 'api'
  - 'web'
  - 'packages/*'
```
```json
// api/package.json
{
  "dependencies": {
    "@claw/shared": "workspace:*"
  }
}
```
**Important:** Use `workspace:*` protocol to ensure pnpm refuses to resolve to anything other than local workspace package, preventing version mismatches.

### Pattern 5: Shared Types Package
**What:** Centralized TypeScript types exported from packages/shared
**When to use:** Types shared between API and frontend (Track, SubmissionRequest, etc.)
**Example:**
```typescript
// Source: https://monorepo.tools/typescript
// packages/shared/src/index.ts
export interface Track {
  id: number
  title: string
  wallet: string
  duration: number
  fileUrl: string
  createdAt: number
  playCount: number
  tipWeight: number
}

export interface SubmissionRequest {
  title: string
  wallet: string
  audioFile: File
}
```
```typescript
// api/src/routes/tracks.ts
import type { Track } from '@claw/shared'

app.get('/tracks', async (c) => {
  const tracks: Track[] = await getTracksFromDB(c.env.DB)
  return c.json(tracks)
})
```

### Pattern 6: Tailwind CSS + Vite Setup
**What:** Tailwind v3 with Vite plugin integration
**When to use:** All frontend styling
**Example:**
```javascript
// Source: https://v3.tailwindcss.com/docs/guides/vite
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```
```javascript
// tailwind.config.js
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'electric-blue': '#0066FF',
      },
    },
  },
  plugins: [],
}
```

### Pattern 7: Wrangler Environment Variables
**What:** `.dev.vars` for local secrets, not committed to git
**When to use:** Local development with sensitive values
**Example:**
```bash
# Source: https://developers.cloudflare.com/workers/configuration/environment-variables/
# .dev.vars (add to .gitignore)
SECRET_KEY=dev-secret-key-not-for-production
R2_ACCESS_KEY=local-dev-key
```
**Important:** Choose either `.dev.vars` OR `.env`, not both. If `.dev.vars` exists, `.env` values are ignored. Use `.dev.vars.<environment-name>` for environment-specific values.

### Anti-Patterns to Avoid
- **Using npm workspaces:** Leads to phantom dependencies (transitive deps become direct), slower installs, worse CI/CD performance. Use pnpm workspaces.
- **TypeScript path aliases in monorepo:** Creates conflicts when multiple packages use same alias (e.g., `@/`). TypeScript doesn't resolve aliases at runtime, requiring extra build tools. Use workspace protocol instead: `"@claw/shared": "workspace:*"`.
- **Creating generic icon component:** Importing all Lucide icons kills tree-shaking. Import individually: `import { Play, Pause } from 'lucide-react'`.
- **Using COUNT(*) without indexes:** D1 scans all rows even with indexed columns. Cache counts or use approximate counts for large tables.
- **Forgetting to commit D1 migrations:** Migrations in `migrations/` folder should be committed to git, tracked like code. Migration state is stored in D1's `d1_migrations` table.
- **Using relative imports across packages:** Creates brittle paths. Use workspace protocol and package names: `import { Track } from '@claw/shared'`.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Animation library | Custom CSS animations | motion (framer-motion) | React 19 compatibility, declarative API, gesture support, spring physics, SVG path animations |
| Icons | SVG files in codebase | lucide-react | Tree-shakable, consistent sizing, accessible labels, 1000+ icons, actively maintained |
| Runtime validation | Manual type checks | zod | Type inference, composable schemas, error messages, prevents runtime errors from DB/API |
| State management | Context + useReducer | zustand | Less boilerplate, devtools, persistence, no provider hell, 14.4M weekly downloads |
| CSS framework | Custom CSS | Tailwind CSS | Design system consistency, purges unused styles, JIT compilation, team velocity |
| R2 CORS | Custom headers middleware | R2 CORS policy | Applied at edge before request hits Worker, no CPU cost, cache-aware, standard format |

**Key insight:** Cloudflare provides infrastructure-level solutions (R2 CORS, D1 migrations, Wrangler environments) that are more efficient than application-level implementations. Use platform features over custom code.

## Common Pitfalls

### Pitfall 1: R2 CORS Headers Not Exposing Content-Length
**What goes wrong:** Web Audio API fails silently or can't seek through audio files when `Content-Length` header isn't exposed via CORS.
**Why it happens:** Default CORS policies only expose safe-listed headers (Cache-Control, Content-Language, Content-Type, Expires, Last-Modified, Pragma). Web Audio API needs `Content-Length` and `Content-Range` for byte-range requests.
**How to avoid:** Include `"ExposeHeaders": ["Content-Length", "Content-Range", "Content-Type"]` in R2 CORS policy. Test audio playback in Phase 1 with actual R2-hosted file.
**Warning signs:** Audio plays but seeking doesn't work, or `audio.duration` is `Infinity`.

### Pitfall 2: React/React-DOM Version Mismatch
**What goes wrong:** Runtime errors: "Invalid hook call" or "Cannot read properties of null (reading 'useRef')".
**Why it happens:** React 19 requires exact version match between `react` and `react-dom`. Installing packages separately can result in different versions.
**How to avoid:** Install together: `pnpm install react@^19 react-dom@^19`. Verify with `pnpm list react react-dom`.
**Warning signs:** Build succeeds but runtime crashes with hook-related errors.

### Pitfall 3: Vite Still Defaults to React 18
**What goes wrong:** Project scaffolded with React 18, but OnchainKit (Phase 5) requires React 19 peer dependency.
**Why it happens:** Vite templates haven't updated to React 19 as default yet (as of Feb 2026).
**How to avoid:** After `npm create vite`, immediately upgrade: `pnpm install react@^19 react-dom@^19 @types/react@^19 @types/react-dom@^19`.
**Warning signs:** Peer dependency warnings when installing OnchainKit later.

### Pitfall 4: D1 Migrations Applied Out of Order
**What goes wrong:** Migration 0002 fails because it depends on schema from 0001 that wasn't applied.
**Why it happens:** Migrations are applied sequentially by filename. If migration files are created out of order or team members have different migration states locally.
**How to avoid:** Always pull latest migrations before creating new ones. Use `wrangler d1 migrations list DB --local` to check state. Commit migrations to git immediately.
**Warning signs:** Migration succeeds locally but fails in production, or vice versa.

### Pitfall 5: Forgetting PRAGMA optimize After Index Creation
**What goes wrong:** New indexes don't improve query performance as expected.
**Why it happens:** D1 needs to analyze table statistics after schema changes to use indexes efficiently.
**How to avoid:** Run `PRAGMA optimize` after creating indexes or major schema changes. Add to migration file or run via wrangler.
**Warning signs:** Indexes exist but query performance unchanged, `EXPLAIN QUERY PLAN` shows table scan instead of index scan.

### Pitfall 6: Using .env When .dev.vars Exists
**What goes wrong:** Environment variables from `.env` silently ignored during local development.
**Why it happens:** Wrangler prioritizes `.dev.vars` over `.env`. If `.dev.vars` exists, `.env` is completely ignored.
**How to avoid:** Choose one approach and document it in README. Add both `.dev.vars*` and `.env*` to `.gitignore`.
**Warning signs:** Variables work on one developer's machine but not another.

### Pitfall 7: npm Workspaces Phantom Dependencies
**What goes wrong:** Frontend imports `zod` without declaring it in `package.json`, works locally because API has it as dependency, breaks in production build.
**Why it happens:** npm's flat dependency tree allows accessing transitive dependencies directly (phantom dependencies).
**How to avoid:** Use pnpm workspaces with strict mode. pnpm prevents importing undeclared dependencies.
**Warning signs:** Build works with `npm install` but fails in CI/CD or fresh clone.

### Pitfall 8: TypeScript Path Aliases Conflict Across Packages
**What goes wrong:** Both `api` and `web` define `"@/*": ["./src/*"]` in tsconfig, causing ambiguous module resolution.
**Why it happens:** Multiple packages defining same alias creates namespace collision. TypeScript doesn't resolve path aliases at runtime.
**How to avoid:** Don't use path aliases in monorepo. Use workspace protocol: `"@claw/shared": "workspace:*"` and import via package name.
**Warning signs:** TypeScript errors about unable to resolve module, or wrong module imported.

### Pitfall 9: Importing All Lucide Icons
**What goes wrong:** Frontend bundle size increases by several hundred KB despite using only 5 icons.
**Why it happens:** Creating generic `<Icon name="play" />` component requires importing all icons at build time, breaking tree-shaking.
**How to avoid:** Import icons individually: `import { Play, Pause } from 'lucide-react'`. Use direct imports, not dynamic icon loading.
**Warning signs:** Bundle analysis shows lucide-react package much larger than expected.

### Pitfall 10: R2 CORS Cache Propagation Delay
**What goes wrong:** Updated CORS policy doesn't take effect immediately, causing continued CORS errors for up to 30 seconds.
**Why it happens:** CORS policy changes propagate across Cloudflare edge network, not instant.
**How to avoid:** Wait 30-60 seconds after updating CORS policy before testing. Use `Cache-Control: no-cache` header during testing. Purge cache via Cloudflare dashboard if using custom domain.
**Warning signs:** CORS policy looks correct but browser still shows CORS errors.

## Code Examples

Verified patterns from official sources:

### Health Check Endpoint
```typescript
// Source: https://hono.dev/docs/getting-started/cloudflare-workers
import { Hono } from 'hono'

type Bindings = {
  DB: D1Database
  AUDIO_BUCKET: R2Bucket
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: Date.now()
  })
})

export default app
```

### D1 Query with Zod Validation
```typescript
// Source: https://developers.cloudflare.com/d1/examples/d1-and-hono/
import { z } from 'zod'
import type { Track } from '@claw/shared'

const TrackSchema = z.object({
  id: z.number(),
  title: z.string(),
  wallet: z.string(),
  duration: z.number(),
  file_url: z.string(),
  created_at: z.number(),
  play_count: z.number(),
  tip_weight: z.number(),
})

app.get('/tracks', async (c) => {
  const result = await c.env.DB
    .prepare('SELECT * FROM tracks ORDER BY created_at DESC LIMIT 100')
    .all()

  // Validate DB results at runtime
  const tracks = z.array(TrackSchema).parse(result.results)

  return c.json(tracks)
})
```

### React Placeholder Page with Tailwind
```tsx
// Source: https://v3.tailwindcss.com/docs/guides/vite
// web/src/App.tsx
export default function App() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-black mb-4">
          claw.fm
        </h1>
        <p className="text-xl text-gray-600">
          AI radio, 24/7
        </p>
        <div className="mt-8 w-16 h-1 bg-[#0066FF] mx-auto"></div>
      </div>
    </div>
  )
}
```

### Lucide Icons Usage
```tsx
// Source: https://lucide.dev/guide/packages/lucide-react
import { Play, Pause, Volume2 } from 'lucide-react'

export function PlayerControls() {
  return (
    <div className="flex gap-4">
      <button className="p-3 bg-[#0066FF] rounded-full text-white">
        <Play size={24} />
      </button>
      <button className="p-3 bg-gray-200 rounded-full">
        <Volume2 size={24} />
      </button>
    </div>
  )
}
```

### Zustand Store Example
```typescript
// Source: https://zustand.docs.pmnd.rs/
import { create } from 'zustand'

interface PlayerState {
  isPlaying: boolean
  currentTrackId: number | null
  play: (trackId: number) => void
  pause: () => void
}

export const usePlayerStore = create<PlayerState>((set) => ({
  isPlaying: false,
  currentTrackId: null,
  play: (trackId) => set({ isPlaying: true, currentTrackId: trackId }),
  pause: () => set({ isPlaying: false }),
}))
```

### Wrangler Configuration
```toml
# Source: https://developers.cloudflare.com/workers/wrangler/configuration/
# api/wrangler.toml
name = "claw-fm-api"
main = "src/index.ts"
compatibility_date = "2026-01-01"

[env.production]
name = "claw-fm-api-prod"

[[d1_databases]]
binding = "DB"
database_name = "claw-fm"
database_id = "xxxx-xxxx-xxxx-xxxx"

[[r2_buckets]]
binding = "AUDIO_BUCKET"
bucket_name = "claw-fm-audio"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| framer-motion package | motion package | Jan 2026 | Official React 19 support, motion.dev docs, SSR-safe |
| npm workspaces | pnpm workspaces | 2025+ | 2x faster installs, strict deps, content-addressable storage |
| Tailwind v3 directives | @tailwindcss/vite plugin | Tailwind v4 (2025) | Vite-native integration, simpler config, but v3 still recommended (stable) |
| .env files in Workers | .dev.vars files | Wrangler 3.x | Workers-specific convention, clearer separation from .env |
| TypeScript Project References | Workspace protocol | 2025+ | Simpler config, better IDE support, no extra caching layer |
| create-react-app | Vite | Feb 2025 | CRA officially deprecated, Vite is now recommended by React team |

**Deprecated/outdated:**
- **framer-motion:** Use `motion` package instead. framer-motion@11 and earlier don't support React 19, causing peer dependency warnings.
- **create-react-app:** Officially deprecated Feb 2025. Use Vite for new React projects.
- **@cloudflare/kv-asset-handler:** Replaced by Cloudflare Pages for static asset serving. Don't use for SPA hosting.
- **TypeScript Project References in monorepo:** Still works but workspace protocol is simpler and recommended by Turborepo/Nx teams.

## Open Questions

Things that couldn't be fully resolved:

1. **R2 CORS for Web Audio API crossOrigin attribute**
   - What we know: R2 CORS must expose `Content-Length` and `Content-Range` headers for Web Audio API
   - What's unclear: Whether `AllowedHeaders: ["*"]` is sufficient or if specific headers need listing for audio playback. Official docs don't show Web Audio API example.
   - Recommendation: Test R2 CORS with actual audio file in Phase 1. Create test page that loads audio via `<audio crossOrigin="anonymous">` and verifies seeking works. Flag any CORS errors for immediate fixing before Phase 4 (player implementation).

2. **Headless component library choice: Radix vs Ark**
   - What we know: Radix has 32 components (vs Ark's 25), 1.3M weekly downloads (vs 29k), React-only. Ark supports React/Vue/Solid, uses state machines.
   - What's unclear: User chose "Radix or Ark" in CONTEXT.md but didn't make final decision.
   - Recommendation: Default to Radix UI for Phase 1 (more components, proven React integration, larger ecosystem). Ark's multi-framework support isn't needed since we're React-only. Can revisit if specific Ark features needed later.

3. **D1 database location/region**
   - What we know: D1 supports global read replication, single-region writes
   - What's unclear: Whether database region should be chosen in Phase 1 or left to default
   - Recommendation: Use default region for Phase 1. D1 automatically replicates reads globally. Region mainly affects write latency, not critical for initial setup.

4. **Vite base path for Cloudflare Pages**
   - What we know: Cloudflare Pages serves from `*.pages.dev` subdomain
   - What's unclear: Whether Vite config needs `base` option set for Pages deployment
   - Recommendation: Leave `base: '/'` as default. Cloudflare Pages handles routing at root by default. Only needed if deploying to subdirectory.

5. **React 19 breaking changes impact**
   - What we know: React 19 introduced ref cleanup functions, deprecated some APIs, TypeScript type changes
   - What's unclear: Whether any breaking changes affect Phase 1 implementation (placeholder page is simple)
   - Recommendation: Phase 1 uses minimal React (no refs, no deprecated APIs), so breaking changes unlikely to impact. React 19.2.3 is stable version, safe to use.

## Sources

### Primary (HIGH confidence)
- [Hono - Cloudflare Workers Getting Started](https://hono.dev/docs/getting-started/cloudflare-workers) - Official Hono setup guide
- [Cloudflare D1 Migrations](https://developers.cloudflare.com/d1/reference/migrations/) - Official D1 migration workflow
- [Cloudflare R2 CORS Configuration](https://developers.cloudflare.com/r2/buckets/cors/) - Official R2 CORS policy format
- [Tailwind CSS with Vite](https://v3.tailwindcss.com/docs/guides/vite) - Official Tailwind + Vite setup
- [Lucide React Package](https://lucide.dev/guide/packages/lucide-react) - Official Lucide React documentation
- [Cloudflare Workers Environment Variables](https://developers.cloudflare.com/workers/configuration/environment-variables/) - Official .dev.vars documentation
- [pnpm Workspaces](https://pnpm.io/workspaces) - Official workspace protocol documentation
- [Zustand Documentation](https://zustand.docs.pmnd.rs/) - Official Zustand API docs

### Secondary (MEDIUM confidence)
- [React v19 Release Notes](https://react.dev/blog/2024/12/05/react-19) - Official React 19 announcement
- [Motion for React](https://motion.dev/docs/react) - Official Motion (framer-motion successor) docs
- [D1 Use Indexes Best Practices](https://developers.cloudflare.com/d1/best-practices/use-indexes/) - Official D1 indexing guide
- [Cloudflare Workers Hono Framework Guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/) - Official Cloudflare Hono integration
- [LogRocket: Headless UI Alternatives](https://blog.logrocket.com/headless-ui-alternatives-radix-primitives-react-aria-ark-ui/) - Verified comparison of Radix vs Ark
- [TypeScript Monorepo Management (Nx Blog)](https://nx.dev/blog/managing-ts-packages-in-monorepos) - Verified monorepo patterns
- [Live Types in TypeScript Monorepo](https://colinhacks.com/essays/live-types-typescript-monorepo) - Colin McDonnell (Zod creator) on monorepo types

### Tertiary (LOW confidence - marked for validation)
- [Medium: Build Scalable Cloudflare Workers with Hono, D1, and KV](https://medium.com/@jleonro/build-scalable-cloudflare-workers-with-hono-d1-and-kv-a-complete-guide-to-serverless-apis-and-2c217a4a4afe) - Community guide, unverified patterns
- [Medium: Complete Monorepo Guide – pnpm Workspaces](https://peerlist.io/saxenashikhil/articles/complete-monorepo-guide--pnpm--workspaces--changesets-2025) - Community guide, needs official source verification

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** - All libraries have official Cloudflare documentation or >1M weekly npm downloads, current versions verified
- Architecture patterns: **HIGH** - Patterns sourced from official Cloudflare docs (Hono, D1, R2, Wrangler) and official library docs (pnpm, Tailwind)
- R2 CORS for Web Audio API: **MEDIUM** - Official R2 CORS docs exist, but no Web Audio API specific example. Needs Phase 1 testing.
- Pitfalls: **HIGH** - Sourced from official docs (D1 PRAGMA optimize, .dev.vars behavior, CORS propagation) and verified community issues (React version mismatch, Vite React 18 default)
- Monorepo tooling (pnpm vs npm): **HIGH** - Multiple verified sources (pnpm docs, Nx blog, community benchmarks) confirm pnpm advantages

**Research date:** 2026-02-01
**Valid until:** 2026-03-01 (30 days - stable ecosystem, Cloudflare platform changes infrequently)
