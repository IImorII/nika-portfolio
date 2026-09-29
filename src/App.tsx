import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { jars, projects } from './data'
import type { Project } from './data'
import Jar from './components/Jar'
import CustomCursor from './components/CustomCursor'
import CVPanel from './components/CVPanel'
import ProjectView from './components/ProjectView'

type Flight = { project: Project; rect: DOMRect; phase: 'ready' | 'out' | 'return-ready' | 'return' }

export default function App() {
  const [cvOpen, setCvOpen] = useState(false)
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [closing, setClosing] = useState(false)
  const [flight, setFlight] = useState<Flight | null>(null)
  const [erasing, setErasing] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const lastRect = useRef<DOMRect | null>(null)
  const onEraser = useCallback((active: boolean) => setErasing(active), [])

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setReducedMotion(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  useEffect(() => { document.body.style.overflow = activeProject || cvOpen ? 'hidden' : ''; return () => { document.body.style.overflow = '' } }, [activeProject, cvOpen])

  const later = (fn: () => void, delay: number) => { timers.current.push(setTimeout(fn, delay)) }
  const openProject = (project: Project, rect: DOMRect) => {
    if (activeProject || flight) return
    setCvOpen(false)
    lastRect.current = rect
    if (reducedMotion) { setActiveProject(project); return }
    setFlight({ project, rect, phase: 'ready' })
    requestAnimationFrame(() => requestAnimationFrame(() => setFlight(current => current && { ...current, phase: 'out' })))
    later(() => setActiveProject(project), 760)
    later(() => setFlight(null), 1330)
  }
  const closeProject = useCallback(() => {
    if (!activeProject || closing) return
    if (reducedMotion || !lastRect.current) { setActiveProject(null); return }
    setClosing(true)
    setFlight({ project: activeProject, rect: lastRect.current, phase: 'return-ready' })
    requestAnimationFrame(() => requestAnimationFrame(() => setFlight(current => current && { ...current, phase: 'return' })))
    later(() => { setActiveProject(null); setClosing(false); setFlight(null) }, 850)
  }, [activeProject, closing, reducedMotion])

  const flightStyle = flight ? {
    left: flight.rect.left + flight.rect.width / 2,
    top: flight.rect.top + flight.rect.height / 2,
    '--fly-x': `${window.innerWidth / 2 - (flight.rect.left + flight.rect.width / 2)}px`,
    '--fly-y': `${window.innerHeight / 2 - (flight.rect.top + flight.rect.height / 2)}px`,
    '--fly-scale': Math.max(window.innerWidth, window.innerHeight) / Math.max(26, flight.rect.width) * 2.3,
  } as CSSProperties : undefined

  return <>
    <div className="site-shell">
      <header className="site-header"><span>NIKA®</span><span className="header-center">AN ARCHIVE OF IDEAS, OBJECTS & IN-BETWEENS</span><button type="button" onClick={() => setCvOpen(true)} data-interactive="true">ABOUT / CV <span aria-hidden="true">↗</span></button></header>
      <section className="home" aria-label="Selected portfolio projects">
        <div className="home-stage">
          <div className="stage-overline"><span>SELECTED WORK</span><span>20— / 20—</span></div>
          <button type="button" className="nika-title" onClick={() => setCvOpen(true)} data-interactive="true" aria-label="Open Nika's CV"><span>NIKA</span><small>CLICK THE NAME TO MEET THE MAKER ↗</small></button>
          <div className="jar-scene">{jars.map(jar => <Jar key={jar.id} jar={jar} project={projects.find(p => p.id === jar.projectId)!} onOpen={openProject} onEraser={onEraser} reducedMotion={reducedMotion} />)}</div>
          <div className="stage-side-note">EIGHT OBJECTS<br />EIGHT STORIES</div>
        </div>
      </section>
      <footer className="site-footer"><span>DRAG YOUR EYES AROUND. PICK A JAR.</span><span>CLICK TO OPEN &nbsp;·&nbsp; HOLD TO ERASE</span><span>© NIKA / 20—</span></footer>
    </div>
    <CVPanel open={cvOpen} onClose={() => setCvOpen(false)} />
    {activeProject && <ProjectView project={activeProject} closing={closing} onClose={closeProject} />}
    {flight && <div className={`flight-berry flight-${flight.phase}`} style={flightStyle} aria-hidden="true"><i /></div>}
    <CustomCursor erasing={erasing} />
  </>
}
