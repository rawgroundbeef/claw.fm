import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import { WalletProvider } from './contexts/WalletContext'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WalletProvider>
      <App />
      <Toaster position="bottom-right" richColors />
    </WalletProvider>
  </StrictMode>
)
