import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Category, PortfolioProject } from '../data'
import { categories } from '../data'
import useWorkLayout from '../useWorkLayout'
import { advanceProjectSection, advanceFullscreenMedia } from '../project-navigation'
import type { ViewerPosition } from '../project-navigation'
import useSwipeNavigation from '../useSwipeNavigation'
import { createWheelNavigation } from '../wheel-navigation'
import ScrollableNavigation from './ScrollableNavigation'
import ProgressiveImage from './ProgressiveImage'
import ProgressiveVideo from './ProgressiveVideo'

function ProjectCopyright({ copyright }: { copyright: PortfolioProject['copyright'] }) {
  if (!copyright?.text.trim()) return null
  return <p className="project-copyright" style={{ fontFamily: copyright.font ?? 'Helvetica, Arial, sans-serif', fontSize: copyright.size ?? 12, color: copyright.color ?? '#75736e' }}>{copyright.text}</p>
}

export default function ProjectView({ project: initialCategory, closing, instant, onClose }: { project: Category; closing: boolean; instant: boolean; onClose: () => void }) {
  const [category, setCategory] = useState(initialCategory)
  const closeRef = useRef<HTMLButtonElement>(null)
  const viewerCloseRef = useRef<HTMLButtonElement>(null)
  const rootRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const viewerStageRef = useRef<HTMLDivElement>(null)
  const mediaTrigger = useRef<HTMLButtonElement | null>(null)
  const [position, setPosition] = useState<ViewerPosition>({ projectIndex: 0, sectionIndex: 0, selected: null })
  const { projectIndex, sectionIndex, selected } = position
  const [size, setSize] = useState({ width: 0, height: 0 })
  const project = category.projects[projectIndex]
  const sections = project?.sections ?? []
  const section = sections[sectionIndex]
  const media = section?.media
  const allMedia = project?.media ?? []
  const current = selected === null ? null : allMedia[selected]
  const viewerOpen = selected !== null
  const sectionCounts = useMemo(() => category.projects.map(item => item.sections.length), [category.projects])
  const canNavigate = sectionCounts.reduce((total, count) => total + count, 0) > 1
  const canNavigateMedia = category.projects.reduce((total, item) => total + item.media.length, 0) > 1
  const closeViewer = useCallback(() => setPosition(current => ({ ...current, selected: null })), [])
  const switchProject = (index: number) => setPosition({ projectIndex: index, sectionIndex: 0, selected: null })
  const switchCategory = (next: Category) => {
    if (next.id === category.id) return
    setCategory(next)
    setPosition({ projectIndex: 0, sectionIndex: 0, selected: null })
  }
  const changeSection = useCallback((direction: number) => {
    if (!closing) setPosition(current => ({ ...advanceProjectSection(sectionCounts, current, direction), selected: null }))
  }, [sectionCounts, closing])
  const changeMedia = useCallback((direction: number) => {
    if (!closing) setPosition(current => advanceFullscreenMedia(category.projects, current, direction))
  }, [category.projects, closing])
  const sectionSwipe = useSwipeNavigation(changeSection)
  const mediaSwipe = useSwipeNavigation(changeMedia)
  const layout = useWorkLayout(media, size.width, size.height)

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
    const stage = viewerOpen ? viewerStageRef.current : stageRef.current
    if (!stage || closing || !(viewerOpen ? canNavigateMedia : canNavigate)) return
    const wheel = createWheelNavigation(viewerOpen ? changeMedia : changeSection)
    stage.addEventListener('wheel', wheel, { passive: false })
    return () => stage.removeEventListener('wheel', wheel)
  }, [changeSection, changeMedia, closing, viewerOpen, category.id, canNavigate, canNavigateMedia])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus({ preventScroll: true })
    return () => previous?.focus({ preventScroll: true })
  }, [])
  useEffect(() => {
    if (viewerOpen) viewerCloseRef.current?.focus({ preventScroll: true })
    else if (mediaTrigger.current) {
      const trigger = mediaTrigger.current.isConnected ? mediaTrigger.current : rootRef.current?.querySelector<HTMLButtonElement>('.work-image-button')
      ;(trigger ?? closeRef.current)?.focus({ preventScroll: true })
    }
  }, [viewerOpen])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') { event.preventDefault(); if (viewerOpen) closeViewer(); else onClose() }
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
  }, [onClose, closeViewer, viewerOpen, changeMedia, changeSection])

  return <main ref={rootRef} role="dialog" aria-modal="true" aria-labelledby="category-title" className={`project-view${closing ? ' project-closing' : ''}${instant ? ' project-instant' : ''}`}>
    <div className="project-shell" inert={viewerOpen}>
      <header className="project-header">
        <div className="category-navigation">
          <h1 id="category-title" className="category-title">{category.title}</h1>
          <ScrollableNavigation className="category-links" label="Categories" activeKey={category.id} revealActive={false}>
            {categories.map(item =>
              <button key={item.id} type="button" aria-current={item.id === category.id ? 'true' : undefined} disabled={closing} data-label={item.title} data-interactive="true" onClick={() => switchCategory(item)}><span>{item.title}</span></button>
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
      <div ref={stageRef} className={`work-stage${canNavigate ? ' has-sections' : ''}`} role="region" aria-roledescription="carousel" aria-label={project?.title ?? category.title}
        {...sectionSwipe}>
        <div key={`${project?.id}/${section?.id}`} className="work-slide" role="group" aria-roledescription="slide" aria-label={`${sectionIndex + 1} / ${sections.length}`}>
          {media?.length ? media.map((item, index) => {
            const rect = layout[index]
            if (!rect) return null
            const label = `${project.title} — ${index + 1}`
            return <button key={item.path} className="work-image-button" type="button" data-interactive="true" aria-label={`View ${label} fullscreen`}
              style={rect ? { left: rect.x, top: rect.y, width: rect.width, height: rect.height } : { visibility: 'hidden' }}
              onClick={event => {
                mediaTrigger.current = event.currentTarget
                const selected = allMedia.findIndex(media => media.path === item.path)
                if (selected >= 0) setPosition(current => ({ ...current, selected }))
              }}>
              {item.kind === 'video'
                ? <ProgressiveVideo media={item} label={label} playing={!viewerOpen} />
                : <ProgressiveImage media={item} label={label} active={!viewerOpen} />}
            </button>
          }) : <p className="work-empty">Works coming soon.</p>}
        </div>
        {canNavigate && <>
          <button className="section-arrow section-arrow-prev" type="button" disabled={closing} onClick={() => changeSection(-1)} data-interactive="true" aria-label="Previous section"><span aria-hidden="true">←</span></button>
          <button className="section-arrow section-arrow-next" type="button" disabled={closing} onClick={() => changeSection(1)} data-interactive="true" aria-label="Next section"><span aria-hidden="true">→</span></button>
        </>}
      </div>
      <footer className="section-controls">
        {sections.length > 1 && <>
          <nav className="section-dots" aria-label="Sections">{sections.map((item, index) => <button key={item.id} type="button" className="section-dot" aria-label={`Section ${index + 1}`} aria-current={index === sectionIndex ? 'true' : undefined} onClick={() => setPosition(current => ({ ...current, sectionIndex: index }))} data-interactive="true"><span /></button>)}</nav>
        </>}
        <ProjectCopyright copyright={project?.copyright} />
      </footer>
    </div>
    {current && <div className="media-viewer" role="dialog" aria-modal="true" aria-label={project.title}>
      <header><span>{project.title}</span><button ref={viewerCloseRef} className="icon-button" type="button" onClick={closeViewer} data-interactive="true" aria-label="Close fullscreen">×</button></header>
      <div ref={viewerStageRef} className="media-viewer-stage" {...mediaSwipe}>
        {current.kind === 'video' ? <ProgressiveVideo key={current.path} media={current} label={project.title} /> : <ProgressiveImage key={current.path} media={current} label={project.title} priority="high" />}
        {canNavigateMedia && <>
          <button className="section-arrow section-arrow-prev" type="button" disabled={closing} onClick={() => changeMedia(-1)} data-interactive="true" aria-label="Previous work"><span aria-hidden="true">←</span></button>
          <button className="section-arrow section-arrow-next" type="button" disabled={closing} onClick={() => changeMedia(1)} data-interactive="true" aria-label="Next work"><span aria-hidden="true">→</span></button>
        </>}
      </div>
      <footer><div className="media-viewer-navigation" aria-live="polite" aria-atomic="true"><span className="media-position">{selected! + 1} / {allMedia.length}</span><span className="media-position">Section {sectionIndex + 1} / {sections.length}</span></div><ProjectCopyright copyright={project.copyright} /></footer>
    </div>}
  </main>
}
