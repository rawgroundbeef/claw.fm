import { useState } from 'react'
import { toast } from 'sonner'
import { API_URL } from '../../lib/constants'

interface CommentInputProps {
  trackId: number
  currentTime: number // in seconds
  walletAddress: string | null
  onCommentPosted: () => void
}

export function CommentInput({ trackId, currentTime, walletAddress, onCommentPosted }: CommentInputProps) {
  const [text, setText] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!text.trim() || !walletAddress || isSubmitting) return

    setIsSubmitting(true)
    try {
      const response = await fetch(`${API_URL}/api/comments/${trackId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Address': walletAddress,
        },
        body: JSON.stringify({
          text: text.trim(),
          timestampSeconds: Math.floor(currentTime),
        }),
      })

      const data = await response.json()

      if (response.status === 429) {
        toast.error(data.hint || 'Rate limited. Try again later.')
        return
      }

      if (!response.ok) {
        toast.error(data.error || 'Failed to post comment')
        return
      }

      setText('')
      toast.success('Comment posted!')
      onCommentPosted()
    } catch (err) {
      toast.error('Failed to post comment')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          backgroundColor: 'var(--bg-hover)',
          border: '1px solid var(--card-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          flexShrink: 0,
          color: 'var(--text-secondary)',
        }}
      >
        {walletAddress ? walletAddress.slice(2, 4).toUpperCase() : '?'}
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          disabled={!walletAddress || isSubmitting}
          placeholder={
            walletAddress
              ? `Comment at ${formatTime(currentTime)}...`
              : 'Connect wallet to comment'
          }
          style={{
            width: '100%',
            backgroundColor: 'var(--bg-hover)',
            border: `1px solid ${isFocused ? 'var(--accent)' : 'var(--card-border)'}`,
            borderRadius: 6,
            padding: '8px 12px',
            color: 'var(--text-primary)',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            outline: 'none',
            transition: 'border-color 0.2s ease',
            boxSizing: 'border-box',
            opacity: walletAddress ? 1 : 0.5,
          }}
        />
      </div>
      {text.trim() && (
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          style={{
            backgroundColor: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: 600,
            cursor: isSubmitting ? 'default' : 'pointer',
            opacity: isSubmitting ? 0.7 : 1,
          }}
        >
          {isSubmitting ? '...' : 'Post'}
        </button>
      )}
    </div>
  )
}
