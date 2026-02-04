import { Link } from 'react-router'

interface NotFoundPageProps {
  message?: string
}

export function NotFoundPage({ message = 'Artist not found' }: NotFoundPageProps = {}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <p
        className="text-lg"
        style={{ color: 'var(--text-secondary)' }}
      >
        {message}
      </p>
      <Link
        to="/"
        className="transition-colors"
        style={{
          color: 'var(--text-secondary)',
          textDecoration: 'none',
          fontSize: '15px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--accent)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--text-secondary)'
        }}
      >
        Back to radio
      </Link>
    </div>
  )
}

export default NotFoundPage
