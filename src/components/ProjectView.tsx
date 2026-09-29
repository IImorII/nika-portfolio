import { useEffect, useRef } from 'react'
import type { Project } from '../data'

export default function ProjectView({ project, closing, onClose }: { project: Project; closing: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { closeRef.current?.focus() }, [])
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return <main className={`project-view ${closing ? 'project-closing' : ''}`} style={{ '--project-accent': project.accent } as React.CSSProperties}>
    <div className="project-shell">
      <header className="project-header"><span>NIKA / ARCHIVE</span><span>{project.number} / 08</span><button ref={closeRef} type="button" onPointerDown={event => { if (event.button === 0) onClose() }} onClick={onClose} data-interactive="true">CLOSE PROJECT <span aria-hidden="true">×</span></button></header>
      <div className="project-heading"><h1>{project.title}</h1><div className="project-meta"><span>{project.type.toUpperCase()}</span><span>{project.year}</span></div></div>
      <div className="project-lead"><p>{project.description}</p><span>SCROLL TO EXPLORE ↓</span></div>
      <div className="project-images">{project.images.map((src, i) => <figure key={src} className={`project-image image-${i + 1}`}><img src={src} alt={`Abstract placeholder artwork for ${project.title}, image ${i + 1}`} loading="lazy" /><figcaption>{project.number} — STUDY {String(i + 1).padStart(2, '0')}</figcaption></figure>)}</div>
      <footer className="project-footer"><span>END OF PROJECT {project.number}</span><button type="button" onPointerDown={event => { if (event.button === 0) onClose() }} onClick={onClose} data-interactive="true">BACK TO THE JARS ↗</button></footer>
    </div>
  </main>
}
