import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent, RefObject } from 'react'
import type { JarConfig, Project } from '../data'

type Stroke = { x: number; y: number }
type JarProps = { jar: JarConfig; project: Project; effect: 'shake' | 'shatter' | 'shattered' | 'reassemble' | null; onOpen: (project: Project, berry: DOMRect) => void; onEraser: (active: boolean) => void }
type Point = { x: number; y: number }
type BodyRow = { y: number; left: number; right: number }
type BodyContour = { width: number; height: number; rows: BodyRow[]; path: string }

// The cloth covers the neck, so only the visible glass body belongs to the light layer.
const bodyLimits: Record<string, [number, number]> = {
  'jar-01': [.215, .89], 'jar-02': [.385, .885],
  'jar-03': [.285, .875], 'jar-04': [.335, .89],
  'jar-05': [.405, .865], 'jar-06': [.315, .90],
  'jar-07': [.325, .90], 'jar-08': [.35, .875],
}

function traceBody(image: HTMLImageElement, id: string): BodyContour | null {
  const width = image.naturalWidth
  const height = image.naturalHeight
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, width, height).data
  const [top, bottom] = bodyLimits[id] ?? [.3, .88]
  const firstY = Math.round(top * height)
  const lastY = Math.round(bottom * height)
  const rows: BodyRow[] = []
  const inset = width * .018

  for (let index = 0; index <= Math.ceil((lastY - firstY) / 5); index++) {
    const y = Math.min(firstY + index * 5, lastY)
    let left = width
    let right = -1
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > 100) {
        left = Math.min(left, x)
        right = x
      }
    }
    if (right > left + inset * 2) rows.push({ y, left: left + inset, right: right - inset })
  }
  if (rows.length < 2) return null
  const points = [...rows.map(row => `${row.left.toFixed(1)} ${row.y}`),
    ...rows.slice().reverse().map(row => `${row.right.toFixed(1)} ${row.y}`)]
  return { width, height, rows, path: `M ${points.join(' L ')} Z` }
}

function bodyAt(contour: BodyContour, y: number): BodyRow {
  const rows = contour.rows
  const index = Math.max(0, Math.min(rows.length - 1, Math.floor((y - rows[0].y) / 5)))
  const from = rows[index]
  const to = rows[Math.min(index + 1, rows.length - 1)]
  const fraction = Math.max(0, Math.min(1, (y - from.y) / (to.y - from.y || 1)))
  return { y, left: from.left + (to.left - from.left) * fraction, right: from.right + (to.right - from.right) * fraction }
}

function particleRandom(seed: number, index: number) {
  const value = Math.sin(index * 127.1 + seed * 311.7) * 43758.5453
  return value - Math.floor(value)
}

function GlowGradient({ id }: { id: string }) {
  return <radialGradient id={id}><stop stopColor="#fffbb0"/><stop offset=".19" stopColor="#ffe13e" stopOpacity=".85"/><stop offset=".46" stopColor="#ff8b10" stopOpacity=".5"/><stop offset="1" stopColor="#ff8b10" stopOpacity="0"/></radialGradient>
}

function makeShards(seed: number) {
  const columns = 5
  const rows = 7
  const random = (index: number) => {
    const value = Math.sin((index + 1) * 127.1 + seed * 311.7) * 43758.5453
    return value - Math.floor(value)
  }
  const centers = Array.from({ length: columns * rows }, (_, index) => ({
    x: (index % columns + .5 + (random(index * 2) - .5) * .8) * 100 / columns,
    y: (Math.floor(index / columns) + .5 + (random(index * 2 + 1) - .5) * .8) * 100 / rows,
  }))

  return centers.map((center, index) => {
    let polygon: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
    for (const neighbor of centers) {
      if (neighbor === center) continue
      const nx = neighbor.x - center.x
      const ny = neighbor.y - center.y
      const limit = (neighbor.x ** 2 + neighbor.y ** 2 - center.x ** 2 - center.y ** 2) / 2
      const clipped: Point[] = []
      for (let vertex = 0; vertex < polygon.length; vertex++) {
        const from = polygon[vertex]
        const to = polygon[(vertex + 1) % polygon.length]
        const fromDistance = from.x * nx + from.y * ny - limit
        const toDistance = to.x * nx + to.y * ny - limit
        if (fromDistance <= 0) clipped.push(from)
        if ((fromDistance <= 0) !== (toDistance <= 0)) {
          const fraction = fromDistance / (fromDistance - toDistance)
          clipped.push({ x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction })
        }
      }
      polygon = clipped
      if (!polygon.length) break
    }
    return { center, polygon, index }
  })
}

function JarFragments({ jar, effect }: { jar: JarConfig; effect: NonNullable<JarProps['effect']> }) {
  const fragmentsRef = useRef<HTMLSpanElement>(null)
  const shards = useMemo(() => makeShards(jar.seed), [jar.seed])
  const [bounds, setBounds] = useState<DOMRect | null>(null)
  useLayoutEffect(() => {
    const measure = () => { if (fragmentsRef.current) setBounds(fragmentsRef.current.getBoundingClientRect()) }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  const src = import.meta.env.BASE_URL + 'jars/' + jar.id + '.webp'
  return <span ref={fragmentsRef} className={'jar-fragments fragments-' + effect} aria-hidden="true">
    {shards.map(({ center, polygon, index }) => {
      const angle = Math.atan2(center.y - 50, center.x - 50) + Math.sin(index * 5.3 + jar.seed) * .8
      const distance = 105 + (index * 37 + jar.seed * 11) % 115
      const desiredX = Math.cos(angle) * distance
      const desiredY = Math.sin(angle) * distance
      const originX = (bounds?.left ?? 0) + center.x / 100 * (bounds?.width ?? 0)
      const originY = (bounds?.top ?? 0) + center.y / 100 * (bounds?.height ?? 0)
      const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
      const offsetX = bounds ? clamp(desiredX, 24 - originX, window.innerWidth - 24 - originX) : desiredX
      const offsetY = bounds ? clamp(desiredY, 24 - originY, window.innerHeight - 24 - originY) : desiredY
      const style = {
        clipPath: `polygon(${polygon.map(point => `${point.x.toFixed(2)}% ${point.y.toFixed(2)}%`).join(',')})`,
        '--fragment-x': `${Math.round(offsetX)}px`,
        '--fragment-y': `${Math.round(offsetY)}px`,
        '--fragment-rotate': `${(index % 2 ? 1 : -1) * (18 + (index * 17 % 103))}deg`,
        '--fragment-delay': `${(index % 7) * 11}ms`,
      } as CSSProperties
      return <img key={index} src={src} alt="" draggable="false" style={style} />
    })}
  </span>
}

function GlowParticles({ id, count, seed, contour }: { id: string; count: number; seed: number; contour: BodyContour }) {
  const first = contour.rows[0].y
  const last = contour.rows[contour.rows.length - 1].y
  const random = (index: number) => particleRandom(seed, index)
  return <g className="glow-particles">
    <defs><GlowGradient id={id + '-glow'} /></defs>
    {Array.from({ length: count }, (_, i) => {
      const y = first + (i + .25 + random(i * 3) * .5) / count * (last - first)
      const row = bodyAt(contour, y)
      const radius = contour.width * (.021 + random(i * 3 + 1) * .017)
      const x = row.left + (.08 + random(i * 3 + 2) * .84) * (row.right - row.left)
      const targetY = Math.max(first, Math.min(last, y + (i % 2 ? -1 : 1) * contour.height * (.025 + random(i + 31) * .025)))
      const targetRow = bodyAt(contour, targetY)
      const targetX = Math.max(targetRow.left + radius * .5, Math.min(targetRow.right - radius * .5,
        x + (i % 2 ? 1 : -1) * contour.width * (.025 + random(i + 51) * .035)))
      const duration = (2.4 + (i % 5) * .33 + (seed % 3) * .18) + 's'
      const begin = (-i * .47) + 's'
      return <circle key={i} className="glow-particle" cx={x} cy={y} r={radius} fill={'url(#' + id + '-glow)'} style={{ '--duration': duration, '--delay': begin } as CSSProperties}>
        <animate attributeName="cx" values={`${x};${targetX};${x}`} dur={duration} begin={begin} repeatCount="indefinite" />
        <animate attributeName="cy" values={`${y};${targetY};${y}`} dur={duration} begin={begin} repeatCount="indefinite" />
      </circle>
    })}
  </g>
}

function MagicDust({ id, seed, contour, svgRef }: { id: string; seed: number; contour: BodyContour; svgRef: RefObject<SVGSVGElement | null> }) {
  const count = 36
  const gradientId = id + '-dust-glow'
  return <svg ref={svgRef} className="magic-dust" viewBox={`0 0 ${contour.width} ${contour.height}`} aria-hidden="true">
    <defs><GlowGradient id={gradientId} /></defs>
    {Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + seed * .13
    const x = contour.width * (.5 + (.51 + (i % 4) * .03) * Math.cos(angle))
    const y = contour.height * (.5 + (.46 + (i % 3) * .03) * Math.sin(angle))
    const radius = contour.width * (.021 + particleRandom(seed, i * 3 + 1) * .017)
    const targetX = x + (i % 2 ? 1 : -1) * contour.width * (.025 + particleRandom(seed, i + 51) * .035)
    const targetY = y + (i % 2 ? -1 : 1) * contour.height * (.025 + particleRandom(seed, i + 31) * .025)
    const duration = (2.4 + (i % 5) * .33 + (seed % 3) * .18) + 's'
    const begin = (-i * .47) + 's'
    return <g key={i} className="dust-particle" style={{ '--appear-delay': ((i * 13 % count) * 14) + 'ms' } as CSSProperties}>
      <circle className="glow-particle" cx={x} cy={y} r={radius} fill={`url(#${gradientId})`} style={{ '--duration': duration, '--delay': begin } as CSSProperties}>
        <animate attributeName="cx" values={`${x};${targetX};${x}`} dur={duration} begin={begin} repeatCount="indefinite" />
        <animate attributeName="cy" values={`${y};${targetY};${y}`} dur={duration} begin={begin} repeatCount="indefinite" />
      </circle>
    </g>
  })}</svg>
}

export default function Jar({ jar, project, effect, onOpen, onEraser }: JarProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dustSvgRef = useRef<SVGSVGElement>(null)
  const berryRef = useRef<HTMLSpanElement>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const press = useRef({ x: 0, y: 0, active: false, held: false, moved: false })
  const mode = useRef<'idle' | 'erasing' | 'restoring'>('idle')
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [contour, setContour] = useState<BodyContour | null>(null)
  const [tick, setTick] = useState(0)
  const releaseAt = useRef(0)
  const maskId = jar.id + '-erase'

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

  useEffect(() => {
    if (!contour || !svgRef.current) return
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotion = () => {
      if (motionPreference.matches) {
        svgRef.current?.pauseAnimations()
        dustSvgRef.current?.pauseAnimations()
      } else {
        svgRef.current?.unpauseAnimations()
        dustSvgRef.current?.unpauseAnimations()
      }
    }
    updateMotion()
    motionPreference.addEventListener('change', updateMotion)
    return () => motionPreference.removeEventListener('change', updateMotion)
  }, [contour])

  const addStroke = (event: PointerEvent<HTMLButtonElement>) => {
    if (mode.current !== 'erasing' || !svgRef.current || !contour) return
    const matrix = svgRef.current.getScreenCTM()
    if (!matrix) return
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    if (point.y < contour.rows[0].y || point.y > contour.rows[contour.rows.length - 1].y) return
    const row = bodyAt(contour, point.y)
    if (point.x < row.left || point.x > row.right) return
    setStrokes(current => [...current.slice(-74), { x: point.x, y: point.y }])
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
    if (shouldOpen && berryRef.current) onOpen(project, berryRef.current.getBoundingClientRect())
  }

  const restoreProgress = mode.current === 'restoring' ? Math.max(0, 1 - tick / 1800) : 1
  const style = { '--x': jar.x + '%', '--y': jar.y + '%', '--mx': jar.mobileX + '%', '--my': jar.mobileY + '%', '--rotation': jar.rotation + 'deg', '--scale': jar.scale, '--ambient-delay': (-jar.seed / 7) + 's' } as CSSProperties

  return <button className={'jar-button jar-' + jar.shape + (effect && effect !== 'shake' ? ' jar-effect-active' : '') + (effect === 'shake' ? ' jar-shaking' : '') + (effect === 'reassemble' ? ' jar-reassembling' : '')} style={style} type="button" aria-label={'Open ' + project.title + ', ' + project.type + '. Press and hold to erase the light inside.'} data-interactive="true" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { press.current.active = false; if (holdTimer.current) clearTimeout(holdTimer.current); beginRestore() }} onClick={event => { if (event.detail === 0 && berryRef.current) onOpen(project, berryRef.current.getBoundingClientRect()) }}>
    <span className="jar-float">
      <span className="jar-body">
        <img className="jar-photo" src={import.meta.env.BASE_URL + 'jars/' + jar.id + '.webp'} alt="" draggable="false" onLoad={event => setContour(traceBody(event.currentTarget, jar.id))} />
        {effect && effect !== 'shake' && <JarFragments jar={jar} effect={effect} />}
        {contour && <svg ref={svgRef} className="jar-light-layer" viewBox={`0 0 ${contour.width} ${contour.height}`} aria-hidden="true">
          <defs>
            <clipPath id={jar.id + '-body'} clipPathUnits="userSpaceOnUse"><path d={contour.path} /></clipPath>
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={contour.width} height={contour.height}>
              <rect width={contour.width} height={contour.height} fill="white" />
              {strokes.map((stroke, i) => <circle key={i} cx={stroke.x} cy={stroke.y} r={contour.width * 25 / 180 * restoreProgress} fill="black" />)}
            </mask>
          </defs>
          <g clipPath={'url(#' + jar.id + '-body)'}><g mask={'url(#' + maskId + ')'}><GlowParticles id={jar.id} count={jar.particleCount} seed={jar.seed} contour={contour} /></g></g>
        </svg>}
        <span className="jar-berry-anchor" ref={berryRef} aria-hidden="true" />
      </span>
      {contour && <MagicDust id={jar.id} seed={jar.seed} contour={contour} svgRef={dustSvgRef} />}
    </span>
    <span className="jar-index" aria-hidden="true">{project.number}</span>
  </button>
}
