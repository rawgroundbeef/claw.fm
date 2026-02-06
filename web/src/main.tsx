import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WalletProvider } from './contexts/WalletContext'
import { LikeProvider } from './contexts/LikeContext'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WalletProvider>
      <LikeProvider>
        <App />
      </LikeProvider>
    </WalletProvider>
  </StrictMode>
)
