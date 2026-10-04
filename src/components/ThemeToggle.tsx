type Props = { dark: boolean; onToggle: () => void }

export default function ThemeToggle({ dark, onToggle }: Props) {
  return <button type="button" className="theme-toggle" role="switch" aria-checked={dark}
    aria-label="Dark theme" title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
    onClick={onToggle} data-interactive="true">
    <span className="theme-toggle-thumb" aria-hidden="true" />
    <svg className="theme-toggle-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.7" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
    </svg>
    <svg className="theme-toggle-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" />
    </svg>
  </button>
}
