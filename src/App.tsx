import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { jars, projects } from './data'
import type { Project } from './data'
import Jar from './components/Jar'
import CustomCursor from './components/CustomCursor'
import CVPanel from './components/CVPanel'
import ProjectView from './components/ProjectView'
import NikaTitle from './components/NikaTitle'
import SixSevenEffect from './components/SixSevenEffect'

type Flight = { project: Project; rect: DOMRect; phase: 'ready' | 'out' | 'return-ready' | 'return' }
type JarEffect = { id: string; phase: 'shake' | 'shatter' | 'shattered' | 'reassemble' }

const SHAKE_DURATION = 820
const SHATTER_LEAD = 760
const FLIGHT_OUT = 1450
const PROJECT_CLOSE = 600
const FLIGHT_RETURN = 1150
const JAR_REASSEMBLE = 1050

export default function App() {
  const [cvOpen, setCvOpen] = useState(false)
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [closing, setClosing] = useState(false)
  const [flight, setFlight] = useState<Flight | null>(null)
  const [jarEffect, setJarEffect] = useState<JarEffect | null>(null)
  const [erasing, setErasing] = useState(false)
  const [inverted, setInverted] = useState(false)
  const [pairHovered, setPairHovered] = useState(false)
  const [pairDigitsAway, setPairDigitsAway] = useState(false)
  const pairLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [revealOrigin, setRevealOrigin] = useState({ x: '50%', y: '50%', radius: '150vmax' })
  const [numberPositions, setNumberPositions] = useState<{ number: string; x: number; y: number }[]>([])
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const shellRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLButtonElement>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const closingRef = useRef(false)
  const lastRect = useRef<DOMRect | null>(null)
  const onEraser = useCallback((active: boolean) => setErasing(active), [])
  const onPairHover = useCallback((active: boolean) => {
    if (pairLeaveTimer.current) clearTimeout(pairLeaveTimer.current)
    if (active) setPairHovered(true)
    else pairLeaveTimer.current = setTimeout(() => setPairHovered(false), 160)
  }, [])
  const pairActive = pairHovered && !cvOpen && !activeProject && !flight && !jarEffect
  useEffect(() => {
    if (pairActive) { setPairDigitsAway(true); return }
    const timer = setTimeout(() => setPairDigitsAway(false), reducedMotion ? 0 : 920)
    return () => clearTimeout(timer)
  }, [pairActive, reducedMotion])

  const startReveal = () => {
    const shell = shellRef.current?.getBoundingClientRect()
    const title = titleRef.current?.getBoundingClientRect()
    if (shell && title) {
      const x = title.left + title.width / 2 - shell.left
      const y = title.top + title.height / 2 - shell.top
      setRevealOrigin({
        x: `${x}px`,
        y: `${y}px`,
        radius: `${Math.ceil(Math.max(
          Math.hypot(x, y),
          Math.hypot(shell.width - x, y),
          Math.hypot(x, shell.height - y),
          Math.hypot(shell.width - x, shell.height - y),
        )) + 2}px`,
      })
    }
    setInverted(true)
  }

  useLayoutEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const measure = () => {
      const shellRect = shell.getBoundingClientRect()
      // Only the invisible placement anchors inherit the jars' transforms.
      // The independent number layer uses these centers in shell coordinates.
      setNumberPositions(Array.from(shell.querySelectorAll<HTMLElement>('.jar-index-anchor'), label => {
        const rect = label.getBoundingClientRect()
        return {
          number: label.textContent ?? '',
          x: rect.left + rect.width / 2 - shellRect.left,
          y: rect.top + rect.height / 2 - shellRect.top,
        }
      }))
    }
    const observer = new ResizeObserver(measure)
    observer.observe(shell)
    shell.querySelectorAll('.jar-button').forEach(button => observer.observe(button))
    window.addEventListener('resize', measure)
    measure()
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [])

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setReducedMotion(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  useEffect(() => () => { if (pairLeaveTimer.current) clearTimeout(pairLeaveTimer.current) }, [])
  useEffect(() => { document.body.style.overflow = activeProject || cvOpen ? 'hidden' : ''; return () => { document.body.style.overflow = '' } }, [activeProject, cvOpen])

  const later = (fn: () => void, delay: number) => { timers.current.push(setTimeout(fn, delay)) }
  const openProject = (project: Project, rect: DOMRect) => {
    if (activeProject || flight || jarEffect) return
    setCvOpen(false)
    lastRect.current = rect
    if (reducedMotion) { setActiveProject(project); return }
    setJarEffect({ id: project.id, phase: 'shake' })
    later(() => setJarEffect({ id: project.id, phase: 'shatter' }), SHAKE_DURATION)
    later(() => {
      setJarEffect({ id: project.id, phase: 'shattered' })
      setFlight({ project, rect, phase: 'ready' })
      requestAnimationFrame(() => requestAnimationFrame(() => setFlight(current => current && { ...current, phase: 'out' })))
    }, SHAKE_DURATION + SHATTER_LEAD)
    later(() => setActiveProject(project), SHAKE_DURATION + SHATTER_LEAD + FLIGHT_OUT)
    later(() => setFlight(null), SHAKE_DURATION + SHATTER_LEAD + FLIGHT_OUT + 720)
  }
  const closeProject = useCallback(() => {
    if (!activeProject || closingRef.current) return
    if (reducedMotion || !lastRect.current) {
      setActiveProject(null)
      setFlight(null)
      setJarEffect(null)
      return
    }
    closingRef.current = true
    setClosing(true)
    setFlight({ project: activeProject, rect: lastRect.current, phase: 'return-ready' })
    later(() => {
      setActiveProject(null)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setFlight(current => current && { ...current, phase: 'return' })
      }))
    }, PROJECT_CLOSE)
    later(() => {
      setFlight(null)
      setJarEffect({ id: activeProject.id, phase: 'reassemble' })
    }, PROJECT_CLOSE + FLIGHT_RETURN + 50)
    later(() => { closingRef.current = false; setClosing(false); setJarEffect(null) }, PROJECT_CLOSE + FLIGHT_RETURN + 50 + JAR_REASSEMBLE)
  }, [activeProject, reducedMotion])

  const flightStyle = flight ? {
    left: flight.rect.left + flight.rect.width / 2,
    top: flight.rect.top + flight.rect.height / 2,
    '--fly-x': `${window.innerWidth / 2 - (flight.rect.left + flight.rect.width / 2)}px`,
    '--fly-y': `${window.innerHeight / 2 - (flight.rect.top + flight.rect.height / 2)}px`,
    '--fly-scale': Math.hypot(window.innerWidth, window.innerHeight) / 60 * 1.35,
  } as CSSProperties : undefined

  return <>
    <div ref={shellRef} className={`site-shell${inverted ? ' is-inverted' : ''}${pairActive || pairDigitsAway ? ' six-seven-active' : ''}`} style={{ '--reveal-x': revealOrigin.x, '--reveal-y': revealOrigin.y, '--reveal-radius': revealOrigin.radius } as CSSProperties}>
      <div className="color-reveal" aria-hidden="true" />
      <div className="jar-indices" aria-hidden="true">{numberPositions.map(({ number, x, y }) => <span className="jar-index" key={number} data-jar-number={number} style={{ left: x, top: y }}><span>{number[0]}</span><span className="jar-index-last"><i className="jar-index-baseline" />{number[1]}</span></span>)}</div>
      <header className="site-header"><button type="button" onClick={() => setCvOpen(true)} data-interactive="true">ABOUT / CV <span aria-hidden="true">↗</span></button></header>
      <section className="home" aria-label="Selected portfolio projects">
        <div className="home-stage">
          <NikaTitle titleRef={titleRef} onReveal={startReveal} onConceal={() => setInverted(false)} onOpen={() => setCvOpen(true)} />
          <div className="jar-scene">{jars.map(jar => <Jar key={jar.id} jar={jar} project={projects.find(p => p.id === jar.projectId)!} effect={jarEffect?.id === jar.projectId ? jarEffect.phase : null} onOpen={openProject} onEraser={onEraser} onPairHover={onPairHover} />)}</div>
        </div>
      </section>
      <footer className="site-footer"><span>© VERONICA CHEREPKO / 2026</span></footer>
    </div>
    <SixSevenEffect active={pairActive} returning={pairDigitsAway && !pairActive} shellRef={shellRef} />
    <CVPanel open={cvOpen} onClose={() => setCvOpen(false)} />
    {activeProject && <ProjectView project={activeProject} closing={closing} onClose={closeProject} />}
    {flight && <div className={`flight-berry flight-${flight.phase}`} style={flightStyle} aria-hidden="true"><i /></div>}
    <CustomCursor erasing={erasing} />
  </>
}
