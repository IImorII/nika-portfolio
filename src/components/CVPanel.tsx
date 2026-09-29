import { useEffect, useRef } from 'react'

export default function CVPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (open) closeRef.current?.focus()
  }, [open])
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && open) onClose() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open, onClose])
  return <>
    <div className={`panel-scrim ${open ? 'visible' : ''}`} onClick={onClose} aria-hidden="true" />
    <aside className={`cv-panel ${open ? 'open' : ''}`} aria-hidden={!open} aria-label="About Nika" inert={!open}>
      <div className="panel-top"><span>PORTFOLIO / CV</span><button ref={closeRef} type="button" onClick={onClose} data-interactive="true" aria-label="Close CV">CLOSE <span aria-hidden="true">×</span></button></div>
      <div className="panel-content">
        <h2>NIKA<span className="panel-dot">.</span></h2>
        <p className="panel-intro">An introduction to the person behind the work belongs here. A few clear sentences can tell visitors what Nika does and how she thinks.</p>
        <div className="panel-rule" />
        <section><h3>CV / EXPERIENCE</h3><div className="cv-row"><span>20— / NOW</span><p>Role or studio name<br /><small>Location / discipline</small></p></div><div className="cv-row"><span>20— / 20—</span><p>Previous role<br /><small>Location / discipline</small></p></div><div className="cv-row"><span>20— / 20—</span><p>Education or collaboration<br /><small>Location / discipline</small></p></div></section>
        <div className="panel-rule" />
        <div className="panel-columns"><section><h3>CONTACT</h3><p>email@example.com</p></section><section><h3>SOCIAL</h3>{['Instagram', 'Behance', 'LinkedIn', 'Are.na'].map(label => <span className="social-placeholder" key={label}>{label} ↗</span>)}</section></div>
      </div>
      <div className="panel-footer"><span>© NIKA / 20—</span><span>SELECTED WORK</span></div>
    </aside>
  </>
}
