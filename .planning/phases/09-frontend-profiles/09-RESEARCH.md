# Phase 9: Frontend Routing and Profile Pages - Research

**Researched:** 2026-02-04
**Domain:** React Router v7 declarative mode, audio state preservation, profile page UI
**Confidence:** HIGH

## Summary

This phase requires integrating React Router v7 in declarative mode with the existing audio player architecture while ensuring zero audio interruption during navigation. The critical challenge is architectural: the AudioContext singleton and crossfade engine must live ABOVE the React Router component tree, not within it.

React Router v7 declarative mode uses BrowserRouter with Routes/Route components for URL-to-component matching. Persistent layouts are achieved through component hierarchy—components outside the Outlet remain mounted during navigation. The audio player bar must be rendered in the same parent component as BrowserRouter, ensuring it never unmounts when routes change.

Profile pages follow standard artist catalog patterns: hero header with large avatar, artist metadata, and vertical track list with playback controls. The existing /api/artist/:username and /api/artist/by-wallet/:wallet endpoints provide all necessary data.

**Primary recommendation:** Wrap BrowserRouter with the audio state (useCrossfade, useNowPlaying, volume state) in a parent component. PlayerBar renders as a sibling to Routes, not inside them. All route components receive audio controls via React Context.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-router | v7.x | Declarative routing | Official React Router v7 package (replaces react-router-dom) |
| React Context API | React 19 | Audio state sharing | Lightweight, built-in, perfect for stable audio state |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-loading-skeleton | 3.x | Loading placeholders | Industry standard for skeleton screens |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| React Context | Zustand/Jotai | Context sufficient for audio state (rarely changes), no external deps needed |
| react-loading-skeleton | MUI Skeleton | Already using custom CSS, no need for MUI dependency |
| React Router v7 | wouter | v7 is stable (Jan 2026), provides better TypeScript support |

**Installation:**
```bash
npm install react-router@7
# react-loading-skeleton optional if custom skeleton preferred
npm install react-loading-skeleton
```

## Architecture Patterns

### Recommended Project Structure
```
web/src/
├── App.tsx                    # Router wrapper, audio state lifted here
├── contexts/
│   └── AudioContext.tsx       # Audio state provider (crossfade, volume)
├── layouts/
│   └── RadioLayout.tsx        # Shared layout with PlayerBar
├── pages/
│   ├── RadioPage.tsx          # Current radio view (refactored from App.tsx)
│   ├── ArtistProfilePage.tsx  # /artist/:username route
│   └── NotFoundPage.tsx       # 404 catch-all
├── components/
│   └── Player/
│       └── PlayerBar.tsx      # Already exists, stays fixed
└── utils/
    └── audioContext.ts        # Singleton AudioContext (already exists)
```

### Pattern 1: Audio State Above Router

**What:** Audio engine and state management lifted to parent component wrapping BrowserRouter

**When to use:** When audio/video must persist across navigation (music players, video platforms)

**Example:**
```typescript
// App.tsx - Audio state lives HERE, above router
export default function App() {
  const crossfade = useCrossfade()
  const [volume, setVolume] = useState(0.8)
  const [muted, setMuted] = useState(false)

  return (
    <AudioProvider value={{ crossfade, volume, muted, setVolume, setMuted }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RadioLayout />}>
            <Route index element={<RadioPage />} />
            <Route path="artist/:username" element={<ArtistProfilePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AudioProvider>
  )
}

// RadioLayout.tsx - PlayerBar renders here, OUTSIDE Routes
function RadioLayout() {
  const audio = useAudioContext()

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Outlet /> {/* Route content swaps here */}
      </main>
      <PlayerBar {...audio} /> {/* Never unmounts */}
    </div>
  )
}
```

### Pattern 2: Dynamic Route Params

**What:** Extract username from URL path using useParams hook

**When to use:** Profile pages, detail views, any route with variable segments

**Example:**
```typescript
// Source: React Router v7 API Reference
import { useParams } from 'react-router'

function ArtistProfilePage() {
  const { username } = useParams() // /artist/:username

  // Fetch profile data
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/artist/${username}`)
      .then(res => res.json())
      .then(data => {
        setProfile(data)
        setLoading(false)
      })
  }, [username])

  if (loading) return <ProfileSkeleton />
  if (!profile) return <NotFoundPage />

  return <ProfileContent profile={profile} />
}
```

### Pattern 3: Skeleton Loading States

**What:** Placeholder UI matching actual layout while data loads

**When to use:** Any async data fetch with perceived wait time

**Example:**
```typescript
// Source: Material UI Skeleton documentation 2026
function ProfileSkeleton() {
  return (
    <div className="profile-hero">
      <div className="skeleton-avatar" style={{
        width: '200px',
        height: '200px',
        borderRadius: '16px',
        background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
        backgroundSize: '200% 100%',
        animation: 'loading 1.5s ease-in-out infinite'
      }} />
      <div className="skeleton-text" style={{ width: '40%', height: '32px' }} />
      <div className="skeleton-text" style={{ width: '60%', height: '20px' }} />
    </div>
  )
}
```

### Pattern 4: Link Navigation with Audio Preservation

**What:** Use Link component instead of anchor tags to prevent full page reload

**When to use:** All internal navigation (artist names, logo, back links)

**Example:**
```typescript
// Source: React Router v7 documentation
import { Link } from 'react-router'

// In NowPlaying.tsx - make artist name clickable
function NowPlaying({ track }) {
  const artistName = track.artistDisplayName ||
    `${track.artistWallet.slice(0, 6)}...${track.artistWallet.slice(-4)}`

  const artistPath = track.artistUsername
    ? `/artist/${track.artistUsername}`
    : `/artist/by-wallet/${track.artistWallet}`

  return (
    <div>
      <h2>{track.title}</h2>
      <Link
        to={artistPath}
        className="artist-link"
        style={{ color: 'var(--text-secondary)' }}
      >
        {artistName}
      </Link>
    </div>
  )
}
```

### Pattern 5: Catch-All 404 Route

**What:** Wildcard route path="*" catches unmatched URLs

**When to use:** Always—final route in Routes block

**Example:**
```typescript
// Source: React Router v7 best practices
<Routes>
  <Route path="/" element={<RadioLayout />}>
    <Route index element={<RadioPage />} />
    <Route path="artist/:username" element={<ArtistProfilePage />} />
    {/* Catch-all MUST be last */}
    <Route path="*" element={<NotFoundPage />} />
  </Route>
</Routes>

// NotFoundPage.tsx
function NotFoundPage() {
  return (
    <div className="not-found">
      <h1>Artist not found</h1>
      <p>This profile doesn't exist or has been removed.</p>
      <Link to="/">Back to radio</Link>
    </div>
  )
}
```

### Anti-Patterns to Avoid

- **Audio state inside route component:** Causes audio to stop when navigating away. Audio engine must be above Routes.
- **Creating components during render:** Every re-render creates new component, causing unmount/remount and state loss. Define components at module level.
- **Anchor tags for internal links:** Triggers full page reload, destroying audio state. Always use Link component.
- **Multiple AudioContext instances:** Web Audio API requires singleton. Use existing audioContext.ts pattern.
- **Prop drilling audio controls:** Deep component trees lead to maintenance burden. Use React Context for audio state sharing.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Loading placeholders | CSS-only shimmer divs | react-loading-skeleton or CSS animation patterns | Handles responsive sizing, accessible labels, animation performance |
| Route-based code splitting | Manual lazy loading | React.lazy + Suspense | Built-in, optimized chunk loading |
| 404 detection | Manual route matching | React Router catch-all route (path="*") | Guaranteed to catch unmatched routes |
| URL param parsing | window.location parsing | useParams hook | Type-safe, reactive to URL changes |
| Navigation state | Manual history API | useNavigate hook | Handles navigation blocking, scroll restoration |

**Key insight:** React Router v7 provides hooks for every routing concern. Avoid direct DOM or window.location manipulation.

## Common Pitfalls

### Pitfall 1: Audio Stops During Navigation

**What goes wrong:** Audio cuts out when clicking artist name or navigating to profile page

**Why it happens:** Audio player components (useCrossfade, useAudioPlayer) are rendered inside route components. When route changes, React unmounts old route and mounts new one, destroying audio engine.

**How to avoid:**
- Lift audio state to parent component wrapping BrowserRouter
- PlayerBar renders as sibling to Routes, not child of route component
- Audio hooks (useCrossfade, useNowPlaying) called in App.tsx or RadioLayout.tsx
- Pass audio controls via React Context to route components

**Warning signs:**
- Audio restarts from beginning when navigating
- Console errors about AudioContext being closed
- Audio UI flickers or resets during navigation

### Pitfall 2: Component Remount on Every Navigation

**What goes wrong:** Profile page fetches data twice, skeleton shows on every visit

**Why it happens:** Creating component functions inside render (e.g., `element={<Component />}` where Component is defined in same file after return). React sees new function reference on each render, unmounts previous instance.

**How to avoid:**
- Define all route components at module level (outside parent component)
- Import route components from separate files
- Pass element={<ArtistProfilePage />} where ArtistProfilePage is defined above or imported

**Warning signs:**
- useEffect runs on every parent re-render, not just mount
- Network tab shows duplicate API requests
- Component state resets unexpectedly

### Pitfall 3: Context Value Causes Unnecessary Re-renders

**What goes wrong:** Every route component re-renders when volume slider moves, causing jank

**Why it happens:** Context provider value is recreated on every render, triggering all consumers even if their dependencies haven't changed

**How to avoid:**
```typescript
// Bad - creates new object every render
<AudioContext.Provider value={{ crossfade, volume, setVolume }}>

// Good - memoize the value
const audioValue = useMemo(
  () => ({ crossfade, volume, setVolume }),
  [crossfade, volume, setVolume]
)
<AudioContext.Provider value={audioValue}>
```

**Warning signs:**
- React DevTools Profiler shows route components re-rendering on volume change
- UI feels sluggish during audio interactions
- Unrelated components flash during state updates

### Pitfall 4: Race Condition on Profile API

**What goes wrong:** Profile page shows "Artist not found" briefly before showing profile

**Why it happens:** Component renders before fetch completes, returns NotFoundPage, then re-renders with data

**How to avoid:**
```typescript
// Bad - shows 404 during loading
if (!profile) return <NotFoundPage />

// Good - separate loading and not-found states
const [profile, setProfile] = useState(null)
const [loading, setLoading] = useState(true)
const [notFound, setNotFound] = useState(false)

if (loading) return <ProfileSkeleton />
if (notFound) return <NotFoundPage />
return <ProfileContent profile={profile} />
```

**Warning signs:**
- 404 page flashes before profile appears
- User sees "not found" message during network delays

### Pitfall 5: Username Param Not Matching API Endpoint

**What goes wrong:** 404 errors when clicking artist names in player

**Why it happens:** Frontend route path doesn't match API endpoint structure, or params extracted incorrectly

**How to avoid:**
- Frontend route: `/artist/:username` matches API: `/api/artist/:username`
- Wallet-based route: `/artist/by-wallet/:wallet` matches API: `/api/artist/by-wallet/:wallet`
- Use exact param names from useParams: `const { username } = useParams()`
- Handle both registered and wallet-only artists:
  ```typescript
  const artistPath = track.artistUsername
    ? `/artist/${track.artistUsername}`
    : `/artist/by-wallet/${track.artistWallet}`
  ```

**Warning signs:**
- Network tab shows 404 responses
- API requests have incorrect URLs (e.g., /api/artist/undefined)

## Code Examples

Verified patterns from official sources:

### React Router v7 Setup
```typescript
// Source: React Router v7 declarative mode docs
import { BrowserRouter, Routes, Route } from 'react-router'
import ReactDOM from 'react-dom/client'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<RadioLayout />}>
        <Route index element={<RadioPage />} />
        <Route path="artist/:username" element={<ArtistProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  </BrowserRouter>
)
```

### Layout with Persistent PlayerBar
```typescript
// Source: React Router v7 nested routes pattern
import { Outlet } from 'react-router'

function RadioLayout() {
  const audio = useAudioContext()

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Outlet /> {/* Routes render here */}
      </main>
      <PlayerBar {...audio} /> {/* Fixed, never unmounts */}
    </div>
  )
}
```

### Profile Page with Loading States
```typescript
// Source: React best practices 2026
function ArtistProfilePage() {
  const { username } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch(`/api/artist/${username}`)
      .then(res => {
        if (!res.ok) throw new Error('Not found')
        return res.json()
      })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [username])

  if (loading) return <ProfileSkeleton />
  if (error) return <NotFoundPage />

  return (
    <div className="profile-page">
      <ProfileHero profile={data.profile} />
      <TrackCatalog tracks={data.tracks} />
    </div>
  )
}
```

### Clickable Artist Name with Navigation
```typescript
// Source: React Router v7 Link component
import { Link } from 'react-router'

function NowPlaying({ track }) {
  const artistName = track.artistDisplayName ||
    `${track.artistWallet.slice(0, 6)}...${track.artistWallet.slice(-4)}`

  const artistPath = track.artistUsername
    ? `/artist/${track.artistUsername}`
    : `/artist/by-wallet/${track.artistWallet}`

  return (
    <div>
      <h2 className="track-title">{track.title}</h2>
      <Link
        to={artistPath}
        className="artist-name hover:text-accent transition-colors"
      >
        {artistName}
      </Link>
    </div>
  )
}
```

### Audio Context Provider
```typescript
// Source: React Context API best practices 2026
import { createContext, useContext, useMemo } from 'react'

const AudioContext = createContext(null)

export function AudioProvider({ children }) {
  const crossfade = useCrossfade()
  const [volume, setVolume] = useState(0.8)
  const [muted, setMuted] = useState(false)

  // Memoize to prevent unnecessary re-renders
  const value = useMemo(
    () => ({
      crossfade,
      volume,
      muted,
      setVolume,
      setMuted,
      handleVolumeChange: (v) => {
        setVolume(v)
        if (muted) setMuted(false)
        crossfade.setVolume(v)
      },
      handleMuteToggle: () => {
        const newMuted = !muted
        setMuted(newMuted)
        crossfade.setVolume(newMuted ? 0 : volume)
      }
    }),
    [crossfade, volume, muted]
  )

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>
}

export function useAudioContext() {
  const context = useContext(AudioContext)
  if (!context) throw new Error('useAudioContext must be used within AudioProvider')
  return context
}
```

### Profile Hero Component
```typescript
// Source: Artist profile UI patterns 2026
function ProfileHero({ profile }) {
  const avatarUrl = profile.avatarUrl || generateIdenticonUrl(profile.wallet)

  return (
    <div className="profile-hero">
      <img
        src={avatarUrl}
        alt={`${profile.displayName} avatar`}
        className="avatar"
        style={{
          width: '200px',
          height: '200px',
          borderRadius: '16px',
          objectFit: 'cover'
        }}
      />
      <h1 className="display-name">{profile.displayName}</h1>
      <p className="username">@{profile.username}</p>
      {profile.bio && <p className="bio">{profile.bio}</p>}
    </div>
  )
}
```

### Track Catalog List
```typescript
// Source: Artist catalog UI pattern
function TrackCatalog({ tracks }) {
  const audio = useAudioContext()

  const handleTrackClick = (track) => {
    // Playing track from catalog replaces current queue
    // This may require new API endpoint or queue manipulation
    console.log('Play track from catalog:', track.id)
  }

  return (
    <div className="track-catalog">
      <h2>Tracks</h2>
      {tracks.length === 0 ? (
        <p className="empty-message">This artist hasn't submitted any tracks yet.</p>
      ) : (
        <div className="track-list">
          {tracks.map(track => (
            <div
              key={track.id}
              className="track-row"
              onClick={() => handleTrackClick(track)}
            >
              <img
                src={track.coverUrl}
                alt={`${track.title} cover`}
                className="track-cover"
                style={{ width: '48px', height: '48px', borderRadius: '4px' }}
              />
              <div className="track-info">
                <div className="track-title">{track.title}</div>
                <div className="track-meta">
                  {track.genre} • {Math.floor(track.duration / 60000)}:{String(Math.floor((track.duration % 60000) / 1000)).padStart(2, '0')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-router-dom | react-router v7 package | Jan 2026 | Single package for all modes (declarative, data, framework) |
| useState for network data | React Router loaders/actions | v6.4+ (2022) | Not applicable in declarative mode—use traditional fetch |
| Redux for routing state | URL search params | 2023+ | Shareable, persistent, no sync bugs |
| Class components for routes | Function components + hooks | React 16.8+ (2019) | Modern standard, better TypeScript support |
| localStorage for UI prefs | Cookies (SSR-aware) | 2025+ | Not applicable (client-only app), localStorage fine |

**Deprecated/outdated:**
- BrowserRouter from react-router-dom v6: Now use react-router v7 package
- useHistory hook: Renamed to useNavigate in v6+
- Prompt component for blocking navigation: Replaced by useBlocker hook in v6.4+
- Route component={Component}: Now use element={<Component />} prop

## Open Questions

Things that couldn't be fully resolved:

1. **Track Playback from Profile Catalog**
   - What we know: Clicking a track in the artist catalog should play it immediately
   - What's unclear: Does this require new API endpoint to queue single track, or client-side queue manipulation?
   - Recommendation: Start with simple approach—fetch track details and call existing play logic. If queue needs replacing, discuss with backend team.

2. **Wallet-Based Profile Route Structure**
   - What we know: API has `/api/artist/by-wallet/:wallet` endpoint for wallet-only artists
   - What's unclear: Should frontend route be `/artist/by-wallet/:wallet` or `/wallet/:wallet` for cleaner URLs?
   - Recommendation: Use `/artist/by-wallet/:wallet` to match API structure, avoids route conflicts with username pattern.

3. **Profile Page for Currently Playing Artist**
   - What we know: Artist name in player is clickable, navigates to profile
   - What's unclear: Should current track context be preserved in profile page (e.g., "Currently playing: Track Name")?
   - Recommendation: No special treatment—profile page is standalone. Audio continues playing via persistent PlayerBar.

4. **Skeleton Placeholder Granularity**
   - What we know: Loading state should show skeleton placeholders
   - What's unclear: Should track list show N skeleton rows (how many?) or generic loading message?
   - Recommendation: Show 5 skeleton track rows (reasonable catalog preview size). Matches typical viewport content.

## Sources

### Primary (HIGH confidence)
- React Router v7 Official Documentation - https://reactrouter.com
- React Router v7 Modes Documentation - https://reactrouter.com/start/modes
- React Router v7 State Management Guide - https://reactrouter.com/explanation/state-management
- React Router v7 useParams API Reference - https://api.reactrouter.com/v7/functions/react_router.useParams.html
- React Official Documentation - Context - https://react.dev/learn/passing-data-deeply-with-context
- React Official Documentation - Scaling with Reducer and Context - https://react.dev/learn/scaling-up-with-reducer-and-context
- MDN Web Audio API Best Practices - https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
- MDN AudioContext Documentation - https://developer.mozilla.org/en-US/docs/Web/API/AudioContext

### Secondary (MEDIUM confidence)
- LogRocket: How to use React Router v7 in React apps (Jan 2026) - https://blog.logrocket.com/react-router-v7-guide/
- LogRocket: Choosing the right React Router v7 mode - https://blog.logrocket.com/react-router-v7-modes/
- Material UI: React Skeleton Component - https://mui.com/material-ui/react-skeleton/
- LogRocket: Handling React loading states with React Loading Skeleton - https://blog.logrocket.com/handling-react-loading-states-react-loading-skeleton/
- State Management in React (2026): Hooks, Context API, and Redux in Practice - https://thelinuxcode.com/state-management-in-react-2026-hooks-context-api-and-redux-in-practice/
- State Management in 2026: Redux, Context API, and Modern Patterns - https://www.nucamp.co/blog/state-management-in-2026-redux-context-api-and-modern-patterns
- React Design Patterns for 2026 Projects - https://www.sayonetech.com/blog/react-design-patterns/

### Tertiary (LOW confidence - community patterns)
- DEV Community: React Router v7 declarative mode guide - https://dev.to/tishonator/react-router-v7-declarative-custom-and-framework-routing-a-developers-quick-guide-21bc
- Complete Guide to Profile UI Design - https://www.andacademy.com/resources/blog/ui-ux-design/profile-ui-design/
- React Router 404 handling best practices - https://coreui.io/answers/how-to-handle-404-pages-in-react-router/
- How to setup 404 page in React Routing - https://www.geeksforgeeks.org/how-to-setup-404-page-in-react-routing/

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - React Router v7 is stable (Jan 2026), Context API is built-in React
- Architecture: HIGH - Patterns verified in official documentation and existing codebase
- Pitfalls: HIGH - Based on React Router v7 docs, known React patterns, and project's existing audio architecture
- Profile UI: MEDIUM - Based on industry patterns and design guides, not project-specific mockups
- Track catalog playback: MEDIUM - Endpoint exists, implementation pattern clear, queue behavior needs discussion

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days - React Router v7 is stable, patterns unlikely to change)
