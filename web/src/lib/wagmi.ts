import { createConfig, http } from 'wagmi'
import { coinbaseWallet } from 'wagmi/connectors'
import { base } from 'wagmi/chains'
import { QueryClient } from '@tanstack/react-query'

export const config = createConfig({
  chains: [base],
  connectors: [
    coinbaseWallet({
      appName: 'claw.fm',
      preference: 'smartWalletOnly',
    }),
  ],
  transports: {
    [base.id]: http(),
  },
})

export const queryClient = new QueryClient()
