import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import type { JarConfig, Project } from '../data'

type Stroke = { x: number; y: number; at: number }
type JarProps = { jar: JarConfig; project: Project; onOpen: (project: Project, berry: DOMRect) => void; onEraser: (active: boolean) => void; reducedMotion: boolean }

const bodies: Record<JarConfig['shape'], string> = {
  mason: 'M43 65 Q37 69 37 78 L39 218 Q39 233 54 236 L127 236 Q142 233 142 218 L144 78 Q144 69 137 65 Z',
  tall: 'M55 64 Q48 69 48 81 L49 221 Q49 238 64 241 L118 241 Q132 237 132 221 L133 81 Q133 69 126 64 Z',
  squat: 'M32 70 Q24 75 24 90 L27 202 Q27 225 47 229 L133 229 Q153 225 153 202 L156 90 Q156 75 148 70 Z',
  wide: 'M27 73 Q18 80 19 96 L21 204 Q21 226 42 230 L139 230 Q160 226 160 204 L162 96 Q162 80 153 73 Z',
  hex: 'M49 67 L132 67 Q141 70 145 82 L153 206 L134 233 L47 233 L28 206 L36 82 Q40 70 49 67 Z',
  bottle: 'M65 57 L115 57 L116 82 Q129 87 135 103 L141 216 Q142 235 123 239 L57 239 Q38 235 39 216 L45 103 Q51 87 64 82 Z',
  ribbed: 'M40 70 Q31 77 32 89 L34 217 Q35 232 50 237 L130 237 Q145 232 146 217 L148 89 Q149 77 140 70 Z',
  round: 'M48 68 Q35 71 31 88 Q21 126 27 184 Q30 225 49 236 L130 236 Q149 225 153 184 Q159 126 149 88 Q145 71 132 68 Z',
}

function JarFabric({ id, fabric }: { id: string; fabric: JarConfig['fabric'] }) {
  const base: Record<JarConfig['fabric'], string> = {
    'gingham-red': '#c64439', 'gingham-blue': '#305a8c', floral: '#efe0ca', paisley: '#b97a4b', stripe: '#ecd7ba', embroidered: '#d4d1b3', vintage: '#a5b0a0', patchwork: '#d6a092',
  }
  const pattern = `${id}-fabric`
  return <>
    <defs>
      <pattern id={pattern} patternUnits="userSpaceOnUse" width="30" height="30" patternTransform="rotate(-8)">
        <rect width="30" height="30" fill={base[fabric]} />
        {fabric.startsWith('gingham') && <><path d="M0 0H30V10H0ZM0 20H30V30H0Z" fill="#fff" opacity=".57" /><path d="M0 0H10V30H0ZM20 0H30V30H20Z" fill="#fff" opacity=".5" /></>}
        {fabric === 'floral' && <><path d="M9 8C2 0 0 11 8 13C0 18 8 24 13 16C18 24 25 18 18 13C26 9 22 1 15 8C14 2 10 2 9 8Z" fill="#8e655f" /><circle cx="13" cy="13" r="2.5" fill="#e7a977" /><path d="M25 23q-10-2-10 7" stroke="#6f7c5b" strokeWidth="2" fill="none" /></>}
        {fabric === 'paisley' && <><path d="M8 24C-2 12 11 0 24 3C14 3 8 10 12 15C17 20 25 10 23 5C30 18 19 30 8 24Z" fill="#e8c58a" stroke="#704f5b" strokeWidth="1" /><circle cx="15" cy="12" r="3" fill="#654e63" /></>}
        {fabric === 'stripe' && <><path d="M4 0V30M14 0V30M24 0V30" stroke="#426b6d" strokeWidth="3" /><path d="M9 0V30M19 0V30M29 0V30" stroke="#bb6a55" strokeWidth="1.5" /></>}
        {fabric === 'embroidered' && <><path d="M0 15H30M15 0V30" stroke="#f5f0db" strokeWidth="3" /><path d="M3 3l6 6m12 12 6 6m0-24-6 6M9 21l-6 6" stroke="#8a4842" strokeWidth="2" /><circle cx="15" cy="15" r="3" fill="#ba6d54" /></>}
        {fabric === 'vintage' && <><path d="M0 15Q8 5 16 15T32 15" fill="none" stroke="#526d5d" strokeWidth="2" /><circle cx="9" cy="14" r="4" fill="#d7b998" /><circle cx="9" cy="14" r="1.5" fill="#8c655b" /><path d="M24 21q-6-8-10-5" fill="none" stroke="#f1e5c8" strokeWidth="3" /></>}
        {fabric === 'patchwork' && <><path d="M0 0H15V15H0ZM15 15H30V30H15Z" fill="#e9d4a9" /><path d="M15 0H30V15H15ZM0 15H15V30H0Z" fill="#8c827f" /><path d="M0 0L30 30M30 0L0 30" stroke="#fff6de" strokeWidth="1" strokeDasharray="3 3" /></>}
      </pattern>
      <linearGradient id={`${id}-clothshade`} x1="0" x2="1"><stop stopColor="#000" stopOpacity=".2"/><stop offset=".25" stopColor="#fff" stopOpacity=".15"/><stop offset=".75" stopColor="#fff" stopOpacity=".08"/><stop offset="1" stopColor="#000" stopOpacity=".22"/></linearGradient>
    </defs>
    <path d="M47 23 Q58 16 80 18 Q102 13 127 24 L139 38 L147 61 Q144 69 137 67 L132 79 Q127 83 121 74 L113 79 Q107 82 102 73 L91 78 Q86 82 81 74 L70 79 Q64 82 59 72 L49 76 Q43 76 43 66 L34 68 Q28 67 32 57 L38 37Z" fill={`url(#${pattern})`} stroke="#50463a" strokeOpacity=".18" strokeWidth="1.5" />
    <path d="M47 23 Q58 16 80 18 Q102 13 127 24 L139 38 L147 61 Q144 69 137 67 L132 79 Q127 83 121 74 L113 79 Q107 82 102 73 L91 78 Q86 82 81 74 L70 79 Q64 82 59 72 L49 76 Q43 76 43 66 L34 68 Q28 67 32 57 L38 37Z" fill={`url(#${id}-clothshade)`} />
    <path d="M39 57 Q91 69 143 56" fill="none" stroke="#5b4632" strokeOpacity=".55" strokeWidth="2.2" />
    <path d="M39 61 Q91 74 143 60" fill="none" stroke="#eee0bd" strokeWidth="2" />
    <path d="M140 61 Q157 70 151 82 M139 62 Q144 77 137 85" fill="none" stroke="#9b856a" strokeWidth="1.8" strokeLinecap="round" />
  </>
}

export function Blueberry({ id, x = 90, y = 157, size = 29 }: { id: string; x?: number; y?: number; size?: number }) {
  return <g className="blueberry" data-blueberry="true" transform={`translate(${x} ${y})`}>
    <defs>
      <radialGradient id={`${id}-berry`} cx=".3" cy=".24" r=".78"><stop stopColor="#8a93ba" /><stop offset=".35" stopColor="#3a4779" /><stop offset=".72" stopColor="#25284c" /><stop offset="1" stopColor="#10162f" /></radialGradient>
      <radialGradient id={`${id}-bloom`}><stop stopColor="#b0b4d0" stopOpacity=".47"/><stop offset="1" stopColor="#a6afd0" stopOpacity="0"/></radialGradient>
    </defs>
    <circle r={size + 5} fill={`url(#${id}-bloom)`}/>
    <circle r={size} fill={`url(#${id}-berry)`} stroke="#161936" strokeWidth="1.2" />
    <path d={`M${-size*.33} ${-size*.69}Q0 ${-size*.82} ${size*.38} ${-size*.5}`} fill="none" stroke="#c9c6d5" strokeOpacity=".4" strokeWidth="2" strokeLinecap="round" />
    <path d="M-11-22L-5-15L0-22L5-15L12-19L8-10L0-12L-8-9Z" fill="#252947" stroke="#6d7296" strokeWidth="1.2" />
    <circle cx="-9" cy="-9" r="5" fill="#cad2de" opacity=".2" />
  </g>
}

function GlowParticles({ id, count, seed }: { id: string; count: number; seed: number }) {
  return <g className="glow-particles">
    <defs><radialGradient id={`${id}-glow`}><stop stopColor="#fffbb0"/><stop offset=".19" stopColor="#ffe13e" stopOpacity=".95"/><stop offset=".46" stopColor="#ff8b10" stopOpacity=".68"/><stop offset="1" stopColor="#ff8b10" stopOpacity="0"/></radialGradient></defs>
    {Array.from({ length: count }, (_, i) => {
      const x = 57 + ((seed * (i + 3) * 17) % 70)
      const y = 104 + ((seed * (i + 5) * 11) % 92)
      const radius = 9 + ((seed + i * 7) % 8)
      return <circle key={i} className="glow-particle" cx={x} cy={y} r={radius} fill={`url(#${id}-glow)`} style={{ '--duration': `${5.8 + i * .7 + (seed % 3)}s`, '--delay': `${-i * 1.4}s`, '--drift': `${i % 2 ? -8 : 8}px` } as CSSProperties} />
    })}
  </g>
}

function MagicDust({ seed }: { seed: number }) {
  return <span className="magic-dust" aria-hidden="true">{Array.from({ length: 11 }, (_, i) => <i key={i} style={{ '--x': `${10 + ((seed * (i + 2) * 7) % 78)}%`, '--y': `${8 + ((seed * (i + 4) * 13) % 83)}%`, '--d': `${i * .09}s` } as CSSProperties} />)}</span>
}

export default function Jar({ jar, project, onOpen, onEraser, reducedMotion }: JarProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const berryRef = useRef<SVGGElement | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const press = useRef({ x: 0, y: 0, active: false, held: false, moved: false })
  const mode = useRef<'idle' | 'erasing' | 'restoring'>('idle')
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [tick, setTick] = useState(0)
  const releaseAt = useRef(0)
  const maskId = `${jar.id}-erase`
  const clipId = `${jar.id}-bodyclip`

  const beginRestore = () => {
    if (mode.current !== 'erasing') return
    mode.current = 'restoring'
    releaseAt.current = performance.now()
    setTick(1)
    onEraser(false)
    if (maxTimer.current) clearTimeout(maxTimer.current)
  }

  useEffect(() => {
    if (mode.current !== 'restoring') return
    let frame = 0
    const animate = () => {
      const elapsed = performance.now() - releaseAt.current
      setTick(elapsed)
      if (elapsed < 1800) frame = requestAnimationFrame(animate)
      else { mode.current = 'idle'; setStrokes([]) }
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [strokes.length, tick === 0])

  useEffect(() => () => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    if (maxTimer.current) clearTimeout(maxTimer.current)
    onEraser(false)
  }, [onEraser])

  const addStroke = (event: PointerEvent<HTMLButtonElement>) => {
    if (mode.current !== 'erasing' || !svgRef.current) return
    const matrix = svgRef.current.getScreenCTM()
    if (!matrix) return
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    if (point.x < 22 || point.x > 160 || point.y < 65 || point.y > 240) return
    setStrokes(current => [...current.slice(-74), { x: point.x, y: point.y, at: performance.now() }])
  }

  const pointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || mode.current === 'restoring') return
    event.currentTarget.setPointerCapture(event.pointerId)
    press.current = { x: event.clientX, y: event.clientY, active: true, held: false, moved: false }
    holdTimer.current = setTimeout(() => {
      if (!press.current.active) return
      press.current.held = true
      mode.current = 'erasing'
      onEraser(true)
      addStroke(event)
      maxTimer.current = setTimeout(beginRestore, 5000)
    }, 390)
  }

  const pointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!press.current.active) return
    if (Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > 12) press.current.moved = true
    addStroke(event)
  }

  const pointerUp = () => {
    if (!press.current.active) return
    if (holdTimer.current) clearTimeout(holdTimer.current)
    const shouldOpen = !press.current.held && !press.current.moved && mode.current === 'idle'
    press.current.active = false
    beginRestore()
    if (shouldOpen) {
      const berry = svgRef.current?.querySelector('[data-blueberry]')?.getBoundingClientRect()
      if (berry) onOpen(project, berry)
    }
  }

  const restoreProgress = mode.current === 'restoring' ? Math.max(0, 1 - tick / 1800) : 1
  const style = { '--x': `${jar.x}%`, '--y': `${jar.y}%`, '--mx': `${jar.mobileX}%`, '--my': `${jar.mobileY}%`, '--rotation': `${jar.rotation}deg`, '--scale': jar.scale, '--ambient-delay': `${-jar.seed / 7}s` } as CSSProperties

  return <button className={`jar-button jar-${jar.shape}`} style={style} type="button" aria-label={`Open ${project.title}, ${project.type}. Press and hold to erase the light inside.`} data-interactive="true" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { press.current.active = false; if (holdTimer.current) clearTimeout(holdTimer.current); beginRestore() }} onClick={event => { if (event.detail === 0) { const berry = svgRef.current?.querySelector('[data-blueberry]')?.getBoundingClientRect(); if (berry) onOpen(project, berry) } }}>
    <span className="jar-float">
      <MagicDust seed={jar.seed} />
      <svg ref={svgRef} className="jar-svg" viewBox="0 0 180 260" role="img" aria-hidden="true">
        <defs>
          <linearGradient id={`${jar.id}-glass`} x1="0" x2="1"><stop stopColor="#fff" stopOpacity=".82"/><stop offset=".15" stopColor="#cbd4d2" stopOpacity=".17"/><stop offset=".5" stopColor="#f8f5e9" stopOpacity=".1"/><stop offset=".82" stopColor="#b0c0c0" stopOpacity=".17"/><stop offset="1" stopColor="#fff" stopOpacity=".76"/></linearGradient>
          <linearGradient id={`${jar.id}-tint`} x1="0" x2="0" y2="1"><stop stopColor="#fff9df" stopOpacity=".05"/><stop offset="1" stopColor="#afc5bc" stopOpacity=".3"/></linearGradient>
          <clipPath id={clipId}><path d={bodies[jar.shape]} /></clipPath>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="180" height="260"><rect width="180" height="260" fill="white" />{strokes.map((stroke, i) => <circle key={i} cx={stroke.x} cy={stroke.y} r={25 * restoreProgress} fill="black" />)}</mask>
        </defs>
        <ellipse cx="91" cy="244" rx="56" ry="6" fill="#3d3427" opacity=".11" />
        <path d={bodies[jar.shape]} fill={`url(#${jar.id}-tint)`} stroke="#84918e" strokeOpacity=".48" strokeWidth="2" />
        <g clipPath={`url(#${clipId})`}>
          <g mask={`url(#${maskId})`}><GlowParticles id={jar.id} count={jar.particleCount} seed={jar.seed} /><path d="M49 193Q92 199 138 188" stroke="#b9bd9b" strokeOpacity=".32" strokeWidth="4" fill="none" /></g>
          <g ref={berryRef}><Blueberry id={jar.id} x={90 + (jar.seed % 13) - 6} y={154 + (jar.seed % 17) - 8} size={jar.shape === 'squat' ? 27 : 30} /></g>
          <path d="M46 94Q43 152 48 211" fill="none" stroke="#fff" strokeOpacity=".8" strokeWidth="7" strokeLinecap="round" />
          <path d="M133 96Q137 154 132 204" fill="none" stroke="#fff" strokeOpacity=".48" strokeWidth="4" strokeLinecap="round" />
          {jar.shape === 'ribbed' && [0, 1, 2, 3].map(i => <path key={i} d={`M${53 + i * 19} 83Q${46 + i * 22} 160 ${54 + i * 19} 225`} fill="none" stroke="#fff" strokeOpacity=".27" strokeWidth="3" />)}
        </g>
        <path d={bodies[jar.shape]} fill={`url(#${jar.id}-glass)`} stroke="#d5dfd9" strokeOpacity=".7" strokeWidth="2" />
        <path d="M43 219Q91 233 137 219" fill="none" stroke="#a4b4ad" strokeOpacity=".5" strokeWidth="3" />
        <JarFabric id={jar.id} fabric={jar.fabric} />
        <g transform="rotate(-4 90 199)"><path d="M58 187L126 184L126 217L58 221Z" fill="#f4f0e6" stroke="#d3c9b7" strokeWidth="1"/><text x="66" y="200" fontFamily="Arial, sans-serif" fontSize="8" fontWeight="700" fill="#262321">{project.number} / {project.type.toUpperCase()}</text><path d="M66 206H116" stroke="#9b9386" strokeWidth=".7"/><text x="66" y="215" fontFamily="Georgia, serif" fontSize="8" fontStyle="italic" fill="#6c6157">nika archive</text></g>
      </svg>
      <span className="jar-index" aria-hidden="true">{project.number}</span>
    </span>
    {!reducedMotion && <span className="jar-hint">HOLD TO REVEAL</span>}
  </button>
}
