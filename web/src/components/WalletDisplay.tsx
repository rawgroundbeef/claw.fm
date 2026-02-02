import { useState } from 'react'
import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi'
import { coinbaseWallet } from 'wagmi/connectors'
import { USDC_ADDRESS } from '../lib/constants'

export function WalletDisplay() {
  const { address, isConnected } = useAccount()
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()
  const { data: balance } = useBalance({
    address,
    token: USDC_ADDRESS,
  })

  const [showDisconnect, setShowDisconnect] = useState(false)

  const handleConnect = () => {
    connect({
      connector: coinbaseWallet({
        appName: 'claw.fm',
        preference: 'smartWalletOnly',
      }),
    })
  }

  if (!isConnected) {
    return (
      <button
        onClick={handleConnect}
        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
      >
        Connect Wallet
      </button>
    )
  }

  const truncatedAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : ''

  const usdcBalance = balance
    ? (Number(balance.value) / 1e6).toFixed(2)
    : '0.00'

  return (
    <div className="relative">
      <button
        onClick={() => setShowDisconnect(!showDisconnect)}
        className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors flex items-center space-x-2"
      >
        <span>{truncatedAddress}</span>
        <span className="text-gray-400">•</span>
        <span>{usdcBalance} USDC</span>
      </button>

      {showDisconnect && (
        <button
          onClick={() => {
            disconnect()
            setShowDisconnect(false)
          }}
          className="absolute top-full right-0 mt-2 px-4 py-2 text-sm font-medium text-red-600 bg-white hover:bg-red-50 rounded-lg shadow-lg border border-gray-200 whitespace-nowrap transition-colors"
        >
          Disconnect
        </button>
      )}
    </div>
  )
}
