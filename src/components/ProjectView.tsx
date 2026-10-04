import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Category, PortfolioProject } from '../data'
import { categories } from '../data'
import { packWorks } from '../work-layout'
import useSwipeNavigation from '../useSwipeNavigation'
import ScrollableNavigation from './ScrollableNavigation'
import ProgressiveImage from './ProgressiveImage'
import ProgressiveVideo from './ProgressiveVideo'

function ProjectCopyright({ copyright }: { copyright: PortfolioProject['copyright'] }) {
  if (!copyright?.text.trim()) return null
  return <p className="project-copyright" style={{ fontFamily: copyright.font ?? 'Helvetica, Arial, sans-serif', fontSize: copyright.size ?? 12, color: copyright.color ?? '#75736e' }}>{copyright.text}</p>
}

export default function ProjectView({ project: initialCategory, closing, instant, onClose }: { project: Category; closing: boolean; instant: boolean; onClose: () => void }) {
  const [category, setCategory] = useState(initialCategory)
  const categoryTitleRef = useRef<HTMLHeadingElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const viewerCloseRef = useRef<HTMLButtonElement>(null)
  const rootRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const mediaTrigger = useRef<HTMLButtonElement | null>(null)
  const [projectIndex, setProjectIndex] = useState(0)
  const [sectionIndex, setSectionIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const project = category.projects[projectIndex]
  const sections = project?.sections ?? []
  const section = sections[sectionIndex]
  const media = section?.media
  const allMedia = project?.media ?? []
  const current = selected === null ? null : allMedia[selected]
  const viewerOpen = selected !== null
  const switchProject = (index: number) => { setProjectIndex(index); setSectionIndex(0); setSelected(null) }
  const switchCategory = (next: Category) => {
    if (next.id === category.id) return
    setCategory(next)
    setProjectIndex(0)
    setSectionIndex(0)
    setSelected(null)
    categoryTitleRef.current?.focus({ preventScroll: true })
  }
  const changeSection = useCallback((direction: number) => {
    if (!closing && sections.length > 1) setSectionIndex(index => (index + direction + sections.length) % sections.length)
  }, [sections.length, closing])
  const changeMedia = useCallback((direction: number) => {
    if (allMedia.length > 1) setSelected(index => index === null ? null : (index + direction + allMedia.length) % allMedia.length)
  }, [allMedia.length])
  const sectionSwipe = useSwipeNavigation(changeSection)
  const mediaSwipe = useSwipeNavigation(changeMedia)
  const layout = useMemo(() => packWorks((media ?? []).map(item => item.width / item.height), size.width, size.height, size.width < 600 ? 6 : 10, (media ?? []).map(item => item.priority)), [media, size])

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize(previous => previous.width === width && previous.height === height ? previous : { width, height })
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus({ preventScroll: true })
    return () => previous?.focus({ preventScroll: true })
  }, [])
  useEffect(() => {
    if (viewerOpen) viewerCloseRef.current?.focus({ preventScroll: true })
    else if (mediaTrigger.current?.isConnected) mediaTrigger.current.focus({ preventScroll: true })
  }, [viewerOpen])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') { event.preventDefault(); if (viewerOpen) setSelected(null); else onClose() }
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault()
        const direction = event.key === 'ArrowRight' ? 1 : -1
        if (viewerOpen) changeMedia(direction)
        else changeSection(direction)
      }
      if (event.key === 'Tab') {
        const scope = viewerOpen ? rootRef.current?.querySelector('.media-viewer') : rootRef.current
        const controls = Array.from(scope?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') ?? []).filter(node => !node.closest('[inert]') && node.getClientRects().length > 0)
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose, viewerOpen, changeMedia, changeSection])

  return <main ref={rootRef} role="dialog" aria-modal="true" aria-labelledby="category-title" className={`project-view${closing ? ' project-closing' : ''}${instant ? ' project-instant' : ''}`}>
    <div className="project-shell" inert={viewerOpen}>
      <header className="project-header">
        <div className="category-navigation">
          <h1 ref={categoryTitleRef} id="category-title" tabIndex={-1}>{category.title}</h1>
          <ScrollableNavigation className="category-links" label="Categories" activeKey={category.id}>
            {categories.map(item =>
              <button key={item.id} type="button" aria-current={item.id === category.id ? 'true' : undefined} disabled={closing} data-interactive="true" onClick={() => switchCategory(item)}>{item.title}</button>
            )}
          </ScrollableNavigation>
        </div>
        <button ref={closeRef} className="icon-button" type="button" onClick={onClose} data-interactive="true" aria-label="Close portfolio">×</button>
      </header>
      {category.projects.length > 0 && <ScrollableNavigation className="project-tabs" label="Projects" activeKey={project?.id ?? ''}>{category.projects.map((item, index) =>
        <button key={item.id} type="button" aria-current={index === projectIndex ? 'true' : undefined} data-interactive="true" onClick={() => switchProject(index)}
          onKeyDown={event => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
            event.preventDefault()
            const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + category.projects.length) % category.projects.length
            switchProject(next)
            event.currentTarget.parentElement?.querySelectorAll('button')[next]?.focus({ preventScroll: true })
          }}><span>{item.title}</span></button>
      )}</ScrollableNavigation>}
      <div ref={stageRef} className={`work-stage${sections.length > 1 ? ' has-sections' : ''}`} role="region" aria-roledescription="carousel" aria-label={project?.title ?? category.title}
        {...sectionSwipe}>
        <div key={`${project?.id}/${section?.id}`} className="work-slide" role="group" aria-roledescription="slide" aria-label={`${sectionIndex + 1} / ${sections.length}`}>
          {media?.length ? media.map((item, index) => {
            const rect = layout[index]
            const label = `${project.title} — ${index + 1}`
            return <button key={item.path} className="work-image-button" type="button" data-interactive="true" aria-label={`View ${label} fullscreen`}
              style={rect ? { left: rect.x, top: rect.y, width: rect.width, height: rect.height } : { visibility: 'hidden' }}
              onClick={event => {
                mediaTrigger.current = event.currentTarget
                setSelected(allMedia.findIndex(media => media.path === item.path))
              }}>
              {item.kind === 'video'
                ? <ProgressiveVideo media={item} label={label} playing={!viewerOpen} />
                : <ProgressiveImage media={item} label={label} />}
            </button>
          }) : <p className="work-empty">Works coming soon.</p>}
        </div>
        {sections.length > 1 && <>
          <button className="section-arrow section-arrow-prev" type="button" onClick={() => changeSection(-1)} data-interactive="true" aria-label="Previous section">←</button>
          <button className="section-arrow section-arrow-next" type="button" onClick={() => changeSection(1)} data-interactive="true" aria-label="Next section">→</button>
        </>}
      </div>
      <footer className="section-controls">
        {sections.length > 1 && <>
          <button className="section-arrow section-arrow-mobile section-arrow-prev" type="button" disabled={closing} onClick={() => changeSection(-1)} data-interactive="true" aria-label="Previous section">←</button>
          <nav className="section-dots" aria-label="Sections">{sections.map((item, index) => <button key={item.id} type="button" className="section-dot" aria-label={`Section ${index + 1}`} aria-current={index === sectionIndex ? 'true' : undefined} onClick={() => setSectionIndex(index)} data-interactive="true"><span /></button>)}</nav>
          <button className="section-arrow section-arrow-mobile section-arrow-next" type="button" disabled={closing} onClick={() => changeSection(1)} data-interactive="true" aria-label="Next section">→</button>
        </>}
        <ProjectCopyright copyright={project?.copyright} />
      </footer>
    </div>
    {current && <div className="media-viewer" role="dialog" aria-modal="true" aria-label={project.title}>
      <header><span>{project.title}</span><button ref={viewerCloseRef} className="icon-button" type="button" onClick={() => setSelected(null)} data-interactive="true" aria-label="Close fullscreen">×</button></header>
      <div className="media-viewer-stage" {...mediaSwipe}>{current.kind === 'video' ? <ProgressiveVideo key={current.path} media={current} label={project.title} /> : <ProgressiveImage key={current.path} media={current} label={project.title} />}</div>
      <footer><nav className="media-viewer-navigation" aria-label="Works">{allMedia.length > 1 && <><button className="icon-button" type="button" onClick={() => changeMedia(-1)} data-interactive="true" aria-label="Previous work">←</button><span className="media-position" aria-live="polite" aria-atomic="true">{selected! + 1} / {allMedia.length}</span><button className="icon-button" type="button" onClick={() => changeMedia(1)} data-interactive="true" aria-label="Next work">→</button></>}</nav><ProjectCopyright copyright={project.copyright} /></footer>
    </div>}
  </main>
}
