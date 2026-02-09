import { BrowserRouter, Routes, Route } from 'react-router'
import { AudioProvider } from './contexts/AudioContext'
import { RadioLayout } from './layouts/RadioLayout'
import { RadioPage } from './pages/RadioPage'
import { ArtistProfilePage } from './pages/ArtistProfilePage'
import { WalletProfilePage } from './pages/WalletProfilePage'
import { TrackPage, WalletTrackPage, LegacyTrackRedirect } from './pages/TrackPage'
import { RoyaltiesPage } from './pages/RoyaltiesPage'
import { NotFoundPage } from './pages/NotFoundPage'

export default function App() {
  return (
    <AudioProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<RadioLayout />}>
            <Route index element={<RadioPage />} />
            {/* Legacy route - redirects to new URL format */}
            <Route path="track/:slug" element={<LegacyTrackRedirect />} />
            {/* Royalties page */}
            <Route path="royalties" element={<RoyaltiesPage />} />
            {/* Wallet-based track page (must be before wallet profile) */}
            <Route path="w/:wallet/:trackSlug" element={<WalletTrackPage />} />
            {/* Wallet lookup (no username) */}
            <Route path="w/:wallet" element={<WalletProfilePage />} />
            {/* Track page: /:username/:trackSlug (must be before /:username) */}
            <Route path=":username/:trackSlug" element={<TrackPage />} />
            {/* Artist profile: /:username */}
            <Route path=":username" element={<ArtistProfilePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AudioProvider>
  )
}
