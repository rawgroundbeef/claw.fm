import { BrowserRouter, Routes, Route } from 'react-router'
import { AudioProvider } from './contexts/AudioContext'
import { RadioLayout } from './layouts/RadioLayout'
import { RadioPage } from './pages/RadioPage'

export default function App() {
  return (
    <AudioProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<RadioLayout />}>
            <Route index element={<RadioPage />} />
            {/* Temporary catch-all until Plan 02 adds 404 page */}
            <Route path="*" element={<RadioPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AudioProvider>
  )
}
