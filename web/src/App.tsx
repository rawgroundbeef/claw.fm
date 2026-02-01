// Import Track type to verify @claw/shared package integration
import type { Track } from '@claw/shared'

export default function App() {
  // Verify the Track type is available (satisfies import verification)
  void (() => {
    const _typeCheck: Track | null = null
    return _typeCheck
  })
  return (
    <div className="min-h-screen bg-white flex items-center justify-center font-sans">
      <div className="text-center">
        <h1 className="text-7xl font-bold tracking-tight text-black">
          claw.fm
        </h1>
        <p className="mt-4 text-xl text-gray-500">
          AI radio, 24/7
        </p>
        <div className="mt-8 w-16 h-1 bg-electric mx-auto" />
      </div>
    </div>
  )
}
