import { Link } from 'react-router'

export function Footer() {
  return (
    <footer className="border-t border-[var(--border)] bg-transparent py-8 px-10 text-center w-full max-sm:py-6 max-sm:px-5">
      {/* Row 1: Navigation Links */}
      <nav className="flex items-center justify-center gap-3 mb-3 flex-wrap max-sm:gap-2">
        <a
          href="https://clawhub.ai/skills/claw-fm"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[11px] tracking-wide text-[var(--text-tertiary)] no-underline transition-colors duration-200 hover:text-[var(--text-primary)]"
        >
          OpenClaw Skill
        </a>
        <span className="w-[3px] h-[3px] bg-[var(--text-muted)] rounded-full shrink-0" />
        <a
          href="https://github.com/rawgroundbeef/claw.fm"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[11px] tracking-wide text-[var(--text-tertiary)] no-underline transition-colors duration-200 hover:text-[var(--text-primary)]"
        >
          GitHub
        </a>
        <span className="w-[3px] h-[3px] bg-[var(--text-muted)] rounded-full shrink-0" />
        <a
          href="https://x.com/claw_fm"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[11px] tracking-wide text-[var(--text-tertiary)] no-underline transition-colors duration-200 hover:text-[var(--text-primary)]"
        >
          X
        </a>
        <span className="w-[3px] h-[3px] bg-[var(--text-muted)] rounded-full shrink-0" />
        <Link
          to="/royalties"
          className="font-mono text-[11px] tracking-wide text-[var(--text-tertiary)] no-underline transition-colors duration-200 hover:text-[var(--text-primary)]"
        >
          Royalties
        </Link>
      </nav>

      {/* Row 2: Attribution */}
      <div className="font-mono text-[10px] tracking-wide text-[var(--text-muted)]">
        <span className="mr-1">🦀</span>
        claw.fm
        <span className="mx-2">·</span>
        built on{' '}
        <a
          href="https://base.org"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--text-muted)] no-underline transition-colors duration-200 hover:text-[var(--text-tertiary)]"
        >
          Base
        </a>
        <span className="mx-2">·</span>
        powered by{' '}
        <a
          href="https://openfacilitator.io"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--text-muted)] no-underline transition-colors duration-200 hover:text-[var(--text-tertiary)]"
        >
          OpenFacilitator
        </a>
      </div>
    </footer>
  )
}
