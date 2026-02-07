interface Tab {
  id: string
  label: string
}

interface DialogTabsProps {
  tabs: Tab[]
  activeTab: string
  onTabChange: (id: string) => void
}

export function DialogTabs({ tabs, activeTab, onTabChange }: DialogTabsProps) {
  return (
    <div
      role="tablist"
      style={{
        display: 'flex',
        gap: '24px',
        borderBottom: '1px solid var(--dialog-border)',
        marginBottom: '24px',
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab
        return (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            onClick={() => onTabChange(tab.id)}
            className="transition-colors"
            style={{
              fontSize: '14px',
              fontWeight: 500,
              fontFamily: "'DM Sans', sans-serif",
              color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
              background: 'transparent',
              padding: '0 0 12px 0',
              border: 'none',
              borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-1px',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = 'var(--text-secondary)'
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = 'var(--text-muted)'
              }
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

interface DialogTabPanelProps {
  id: string
  activeTab: string
  children: React.ReactNode
}

export function DialogTabPanel({ id, activeTab, children }: DialogTabPanelProps) {
  if (id !== activeTab) return null

  return (
    <div
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      style={{ animation: 'modalContentFade 150ms ease-out' }}
    >
      {children}
    </div>
  )
}
