import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { jars, categories, desktopStageHeight, mobileStageHeight, blueberryUrl } from './data'
import type { Category } from './data'
import Jar from './components/Jar'
import MobileJar from './components/MobileJar'
import CustomCursor from './components/CustomCursor'
import CVPanel from './components/CVPanel'
import ProjectView from './components/ProjectView'
import VeronicaTitle from './components/VeronicaTitle'
import CategoryLabel from './components/CategoryLabel'
import ThemeToggle from './components/ThemeToggle'
import SixSevenEffect from './components/SixSevenEffect'
import type { ReservedArea } from './components/SixSevenEffect'
import { trackPortfolioEvent } from './analytics'

type Flight = { project: Category; rect: DOMRect; phase: 'ready' | 'out' | 'return-ready' | 'return' }
type JarEffect = { id: string; phase: 'shake' | 'shatter' | 'shattered' | 'reassemble' }

const SHAKE_DURATION = 820
const SHATTER_LEAD = 760
const FLIGHT_OUT = 1450
const PROJECT_CLOSE = 600
const FLIGHT_RETURN = 1150
const JAR_REASSEMBLE = 1050
const MOBILE_VIEW = '(max-width: 650px), (pointer: coarse), (max-height: 500px) and (max-width: 980px)'

export default function App() {
  const [darkTheme, setDarkTheme] = useState(() => document.documentElement.dataset.theme === 'dark')
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = darkTheme ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', darkTheme ? '#000000' : '#ffffff')
    try { localStorage.setItem('veronica-theme', darkTheme ? 'dark' : 'light') } catch { /* Theme still works when storage is unavailable. */ }
  }, [darkTheme])
  const [cvOpen, setCvOpen] = useState(false)
  const aboutWasOpen = useRef(false)
  useEffect(() => {
    if (cvOpen && !aboutWasOpen.current) trackPortfolioEvent('about_view')
    aboutWasOpen.current = cvOpen
  }, [cvOpen])
  const [hoveredCategory, setHoveredCategory] = useState<Category | null>(null)
  const [sixSevenReservedAreas, setSixSevenReservedAreas] = useState<ReservedArea[]>([])
  const onCategoryHover = useCallback((category: Category, active: boolean) => {
    setHoveredCategory(current => active ? category : current?.id === category.id ? null : current)
  }, [])
  const [activeProject, setActiveProject] = useState<Category | null>(null)
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
  const [mobileView, setMobileView] = useState(() => matchMedia(MOBILE_VIEW).matches)
  const instantProjects = mobileView || reducedMotion
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
      // Use layout offsets before transforms: jar rotation must never change
      // the number's position, even when the viewport or image size changes.
      setNumberPositions(Array.from(shell.querySelectorAll<HTMLElement>('.jar-index-anchor'), label => {
        const button = label.closest<HTMLElement>('.jar-button')!
        const origin = (button.offsetParent as HTMLElement).getBoundingClientRect()
        const scale = Number(button.style.getPropertyValue('--scale')) || 1
        return {
          number: label.textContent ?? '',
          x: origin.left + button.offsetLeft + (label.offsetLeft + label.offsetWidth / 2 - button.offsetWidth / 2) * scale - shellRect.left,
          y: origin.top + button.offsetTop + (label.offsetTop + label.offsetHeight / 2 - button.offsetHeight / 2) * scale - shellRect.top,
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
  useEffect(() => {
    const media = matchMedia(MOBILE_VIEW)
    const change = () => setMobileView(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  useEffect(() => () => { if (pairLeaveTimer.current) clearTimeout(pairLeaveTimer.current) }, [])
  const modalOpen = Boolean(activeProject) || cvOpen
  useLayoutEffect(() => {
    if (!modalOpen) return
    const body = document.body
    const root = document.documentElement
    const scrollX = window.scrollX
    const scrollY = window.scrollY
    const previous = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, overflow: body.style.overflow, rootOverflow: root.style.overflow }
    // Fixed positioning also locks the background on mobile Safari, retaining
    // the home page's scroll position when the full-screen view closes.
    Object.assign(body.style, { position: 'fixed', top: `-${scrollY}px`, left: '0', right: '0', overflow: 'hidden' })
    root.style.overflow = 'hidden'
    return () => {
      Object.assign(body.style, { position: previous.position, top: previous.top, left: previous.left, right: previous.right, overflow: previous.overflow })
      root.style.overflow = previous.rootOverflow
      const scrollBehavior = root.style.scrollBehavior
      root.style.scrollBehavior = 'auto'
      window.scrollTo(scrollX, scrollY)
      root.style.scrollBehavior = scrollBehavior
    }
  }, [modalOpen])

  const later = (fn: () => void, delay: number) => { timers.current.push(setTimeout(fn, delay)) }
  const openProject = (project: Category, rect: DOMRect) => {
    if (activeProject || flight || jarEffect) return
    setHoveredCategory(null)
    setCvOpen(false)
    lastRect.current = rect
    if (instantProjects) { setActiveProject(project); return }
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
    if (instantProjects || !lastRect.current) {
      timers.current.forEach(clearTimeout)
      timers.current = []
      closingRef.current = false
      setClosing(false)
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
  }, [activeProject, instantProjects])

  const flightStyle = flight ? {
    '--fly-start-x': `${flight.rect.left + flight.rect.width / 2}px`,
    '--fly-start-y': `${flight.rect.top + flight.rect.height / 2}px`,
    '--fly-start-size': `${Math.max(flight.rect.width, flight.rect.height)}px`,
    '--fly-end-size': `${Math.hypot(window.innerWidth, window.innerHeight) * 1.35}px`,
  } as CSSProperties : undefined

  return <>
    <div ref={shellRef} inert={cvOpen || Boolean(activeProject)} className={`site-shell${activeProject ? ' project-open' : ''}${mobileView ? ' mobile-static' : ''}${inverted ? ' is-inverted' : ''}${pairActive || pairDigitsAway ? ' six-seven-active' : ''}`} style={{ '--stage-height': desktopStageHeight + 'px', '--mobile-stage-height': mobileStageHeight + 'px', '--reveal-x': revealOrigin.x, '--reveal-y': revealOrigin.y, '--reveal-radius': revealOrigin.radius } as CSSProperties}>
      <div className="color-reveal" aria-hidden="true" />
      <div className="jar-indices" aria-hidden="true">{numberPositions.map(({ number, x, y }) => <span className="jar-index" key={number} data-jar-number={number} style={{ left: x, top: y }}><span>{number.slice(0, -1)}</span><span className="jar-index-last"><i className="jar-index-baseline" />{number.slice(-1)}</span></span>)}</div>
      <header className="site-header">
        <button className="about-button" type="button" onClick={() => setCvOpen(true)} data-interactive="true">ABOUT <span aria-hidden="true">↗</span></button>
        <ThemeToggle dark={darkTheme} onToggle={() => setDarkTheme(current => !current)} />
      </header>
      <section className="home" aria-label="Selected portfolio projects">
        <div className="home-stage">
          <VeronicaTitle titleRef={titleRef} onReveal={startReveal} onConceal={() => setInverted(false)} onOpen={() => setCvOpen(true)} />
          <div className="jar-scene">{jars.map(jar => mobileView && jar.mobileImage
            ? <MobileJar key={jar.id} jar={jar} project={categories.find(category => category.id === jar.categoryId)!} onOpen={openProject} />
            : <Jar key={jar.id} jar={jar} project={categories.find(category => category.id === jar.categoryId)!} paused={mobileView || modalOpen} effect={jarEffect?.id === jar.categoryId ? jarEffect.phase : null} onOpen={openProject} onEraser={onEraser} onPairHover={onPairHover} onCategoryHover={onCategoryHover} />)}</div>
          {categories.length === 0 && <p className="archive-empty">The archive is being prepared.</p>}
        </div>
      </section>
      {hoveredCategory && !cvOpen && !activeProject && !flight && !jarEffect && <CategoryLabel key={hoveredCategory.id} category={hoveredCategory} shellRef={shellRef} reservedAreas={sixSevenReservedAreas} />}
      <footer className="site-footer"><span>© Veronica Cherepko / 2026</span></footer>
    </div>
    {!activeProject && <SixSevenEffect active={pairActive} returning={pairDigitsAway && !pairActive} dark={darkTheme !== inverted} shellRef={shellRef} onReservedAreasChange={setSixSevenReservedAreas} />}
    <CVPanel open={cvOpen} onClose={() => setCvOpen(false)} />
    {activeProject && <ProjectView project={activeProject} closing={closing} instant={instantProjects} mobileView={mobileView} onClose={closeProject} />}
    {flight && <img src={blueberryUrl} alt="" draggable="false" className={`flight-berry flight-${flight.phase}`} style={flightStyle} aria-hidden="true" />}
    <CustomCursor erasing={erasing} />
  </>
}
