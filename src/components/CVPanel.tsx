import { useEffect, useRef } from 'react'

export default function CVPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus({ preventScroll: true })
    return () => previous?.focus({ preventScroll: true })
  }, [open])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!open) return
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab') {
        const controls = panelRef.current?.querySelectorAll<HTMLElement>('button, a[href]')
        const first = controls?.[0]
        const last = controls?.[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open, onClose])
  return <>
    <div className={`panel-scrim ${open ? 'visible' : ''}`} onClick={onClose} aria-hidden="true" />
    <aside ref={panelRef} role="dialog" aria-modal={open ? true : undefined} className={`cv-panel ${open ? 'open' : ''}`} aria-hidden={!open} aria-label="About Veronica" inert={!open}>
      <div className="panel-top"><span>PORTFOLIO / ABOUT</span><button ref={closeRef} type="button" onClick={onClose} data-interactive="true" aria-label="Close About">CLOSE <span aria-hidden="true">×</span></button></div>
      <div className="panel-content">
        <div className="panel-heading">
          <h2>Veronica</h2>
          <img className="panel-photo" src={open ? `${import.meta.env.BASE_URL}cv/photo-preview.webp` : undefined} alt="Veronica Cherepko" width="400" height="400" decoding="async" />
        </div>
        <section className="panel-about">
          <h3>About</h3>
          <p className="panel-intro"><strong>Hi, I’m Veronica, a multidisciplinary graphic designer and illustrator originally from Belarus, and currently based in Warsaw.</strong></p>
          <p className="panel-intro"><strong>I work across visual identities, packaging, campaigns and illustration, with a particular interest in concept-driven projects and art direction. I like turning ideas into visual worlds, whether they exist on a screen, on a package or in a physical space.</strong></p>
        </section>
        <div className="panel-rule" />
        <div className="panel-contacts">
          <section><h3>EMAIL</h3><a className="email-link" href="mailto:veronicacherepko@gmail.com" data-interactive="true">veronicacherepko@gmail.com</a></section>
          <div className="social-links">
            <a href="https://www.instagram.com/veronicacherepko" target="_blank" rel="noopener noreferrer" aria-label="Veronica on Instagram" title="Instagram" data-interactive="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>
            </a>
            <a href="https://www.linkedin.com/in/veronicacherepko" target="_blank" rel="noopener noreferrer" aria-label="Veronica on LinkedIn" title="LinkedIn" data-interactive="true">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1ZM8.3 18H5.6V9.6h2.7V18ZM7 8.4a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2ZM18.4 18h-2.7v-4.1c0-1-.1-2.2-1.4-2.2s-1.6 1-1.6 2.1V18H10V9.6h2.6v1.2c.4-.7 1.2-1.4 2.5-1.4 2.7 0 3.3 1.8 3.3 4.1V18Z" /></svg>
            </a>
          </div>
        </div>
      </div>
      <div className="panel-footer"><span>© Veronica Cherepko / 2026</span></div>
    </aside>
  </>
}
