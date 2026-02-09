import { Hono } from 'hono'

type Env = {
  Bindings: {
    BAGS_API_KEY?: string
  }
}

type JupiterPriceResponse = {
  data?: {
    [key: string]: {
      id?: string
      mintSymbol?: string
      vsToken?: string
      vsTokenSymbol?: string
      price?: number
    }
  }
}

const bagsTokenRoute = new Hono<{ Bindings: Env['Bindings'] }>()

// Token mint address from the bags.fm URL
const CLAW_FM_TOKEN_MINT = '3W6H1ZUPArP4qhfVp8gGvZtay7ucE8swqNPeAGhiBAGS'

// GET /api/bags-token/earnings - Get lifetime fees for claw.fm token
bagsTokenRoute.get('/earnings', async (c) => {
  try {
    const apiKey = c.env.BAGS_API_KEY
    const url = new URL('https://public-api-v2.bags.fm/api/v1/token-launch/lifetime-fees')
    url.searchParams.set('tokenMint', CLAW_FM_TOKEN_MINT)

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    // Add API key if available (some endpoints might work without it)
    if (apiKey) {
      headers['x-api-key'] = apiKey
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
    })

    if (!response.ok) {
      // If we get 401/403 and don't have an API key, return a helpful error
      if ((response.status === 401 || response.status === 403) && !apiKey) {
        return c.json({
          error: 'BAGS_API_KEY not configured',
          message: 'API key required for bags.fm API. Set BAGS_API_KEY environment variable.',
        }, 503)
      }

      const errorText = await response.text()
      console.error('Bags API error:', response.status, errorText)
      return c.json({
        error: 'BAGS_API_ERROR',
        message: `Failed to fetch token earnings: ${response.status}`,
      }, response.status >= 500 ? 503 : 400)
    }

    const data = await response.json() as { success: boolean; response?: string; error?: string }

    if (!data.success) {
      return c.json({
        error: 'BAGS_API_ERROR',
        message: data.error || 'Failed to fetch token earnings',
      }, 400)
    }

    // Response is in lamports (1 SOL = 1,000,000,000 lamports)
    const lamports = BigInt(data.response || '0')
    const sol = Number(lamports) / 1_000_000_000

    // Fetch SOL price in USD - try multiple sources for reliability
    let solPriceUsd = 0
    
    // Try CoinGecko first (more reliable for Cloudflare Workers)
    try {
      const priceResponse = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
        {
          headers: {
            'Accept': 'application/json',
          },
        }
      )
      if (priceResponse.ok) {
        const priceData = await priceResponse.json() as { solana?: { usd?: number } }
        solPriceUsd = priceData.solana?.usd || 0
        if (solPriceUsd > 0) {
          console.log('SOL price from CoinGecko:', solPriceUsd)
        } else {
          console.error('CoinGecko returned invalid price data:', priceData)
        }
      } else {
        const errorText = await priceResponse.text()
        console.error('CoinGecko API error:', priceResponse.status, errorText)
      }
    } catch (error) {
      console.error('Failed to fetch SOL price from CoinGecko:', error)
    }
    
    // Fallback to Binance API if CoinGecko fails
    if (solPriceUsd === 0) {
      try {
        const binanceResponse = await fetch(
          'https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT',
          {
            headers: {
              'Accept': 'application/json',
            },
          }
        )
        if (binanceResponse.ok) {
          const binanceData = await binanceResponse.json() as { price?: string }
          if (binanceData.price) {
            solPriceUsd = parseFloat(binanceData.price)
            console.log('SOL price from Binance:', solPriceUsd)
          }
        } else {
          console.error('Binance API error:', binanceResponse.status)
        }
      } catch (error) {
        console.error('Binance price API error:', error)
      }
    }
    
    // Final fallback to Jupiter if both fail
    if (solPriceUsd === 0) {
      try {
        const jupiterResponse = await fetch(
          'https://price.jup.ag/v4/price?ids=SOL',
          {
            headers: {
              'Accept': 'application/json',
            },
          }
        )
        if (jupiterResponse.ok) {
          const jupiterData = await jupiterResponse.json() as JupiterPriceResponse
          console.log('Jupiter API response:', JSON.stringify(jupiterData))
          // Jupiter API structure: { data: { "So11111111111111111111111111111111111111112": { id: "SOL", mintSymbol: "SOL", vsToken: "USDC", vsTokenSymbol: "USDC", price: 123.45 } } }
          const solMint = 'So11111111111111111111111111111111111111112'
          if (jupiterData.data?.[solMint]?.price) {
            solPriceUsd = jupiterData.data[solMint].price!
            console.log('SOL price from Jupiter:', solPriceUsd)
          } else if (jupiterData.data?.['SOL']?.price) {
            solPriceUsd = jupiterData.data['SOL'].price!
            console.log('SOL price from Jupiter (alt format):', solPriceUsd)
          } else {
            console.error('Jupiter API unexpected format:', jupiterData)
          }
        } else {
          const errorText = await jupiterResponse.text()
          console.error('Jupiter API error:', jupiterResponse.status, errorText)
        }
      } catch (error) {
        console.error('Jupiter price API error:', error)
      }
    }

    const usd = sol * solPriceUsd
    
    return c.json({
      success: true,
      earnings: {
        lamports: data.response, // Return as string to preserve precision
        sol,
        usd,
        solPriceUsd,
        formatted: solPriceUsd > 0 ? `$${Math.round(usd).toLocaleString()}` : `${sol.toFixed(4)} SOL`,
      },
      tokenMint: CLAW_FM_TOKEN_MINT,
    })
  } catch (error) {
    console.error('Bags token earnings fetch error:', error)
    return c.json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to fetch token earnings',
    }, 500)
  }
})

export default bagsTokenRoute
