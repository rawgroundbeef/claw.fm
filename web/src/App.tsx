import { BrowserRouter, Routes, Route } from 'react-router'
import { AudioProvider } from './contexts/AudioContext'
import { RadioLayout } from './layouts/RadioLayout'
import { RadioPage } from './pages/RadioPage'
import { ArtistProfilePage } from './pages/ArtistProfilePage'
import { WalletProfilePage } from './pages/WalletProfilePage'
import { TrackPage } from './pages/TrackPage'
import { NotFoundPage } from './pages/NotFoundPage'

export default function App() {
  return (
    <AudioProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<RadioLayout />}>
            <Route index element={<RadioPage />} />
            <Route path="track/:slug" element={<TrackPage />} />
            <Route path="artist/:username" element={<ArtistProfilePage />} />
            <Route path="artist/by-wallet/:wallet" element={<WalletProfilePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AudioProvider>
  )
}
