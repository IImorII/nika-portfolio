import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent, RefObject } from 'react'
import type { JarConfig, Category } from '../data'
import { blueberryUrl, blueberrySplashUrl } from '../data'
import { bodyAt, particleContourForZone, particleRandom, traceGlassPixels } from '../jar-geometry'
import type { BodyContour, GlassPolygon } from '../jar-geometry'
import { berryCount, createBerryWorld, stepBerryWorld } from '../berry-physics'
import type { BerryWorld } from '../berry-physics'
import { createParticleWorld, stepParticleWorld } from '../particle-physics'

type Stroke = { x: number; y: number }
type JarProps = { jar: JarConfig; project: Category; effect: 'shake' | 'shatter' | 'shattered' | 'reassemble' | null; onOpen: (project: Category, berry: DOMRect) => void; onEraser: (active: boolean) => void; onPairHover: (active: boolean) => void; onCategoryHover: (category: Category, active: boolean) => void }
type Point = { x: number; y: number }

// The cloth covers the neck, so only the visible glass body belongs to the light layer.
function traceBody(image: HTMLImageElement, glass?: GlassPolygon): BodyContour | null {
  const width = image.naturalWidth
  const height = image.naturalHeight
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, width, height).data
  return traceGlassPixels(pixels, width, height, glass)
}

async function foregroundPixels(jar: JarConfig, contour: BodyContour) {
  const images = await Promise.all(jar.layers.filter(layer => layer.placement !== 'interior').map(layer => new Promise<HTMLImageElement | null>(resolve => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = layer.image
  })))
  const canvas = document.createElement('canvas')
  canvas.width = contour.width
  canvas.height = contour.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return new Uint8ClampedArray(contour.width * contour.height * 4)
  for (const image of images) if (image) context.drawImage(image, 0, 0)
  return context.getImageData(0, 0, contour.width, contour.height).data
}

function GlowGradient({ id, color = '#ff8b10' }: { id: string; color?: string }) {
  const amber = color.toLowerCase() === '#ff8b10'
  return <radialGradient id={id}><stop stopColor={amber ? '#fffbb0' : '#ffffff'}/><stop offset=".19" stopColor={amber ? '#ffe13e' : color} stopOpacity=".85"/><stop offset=".46" stopColor={color} stopOpacity=".5"/><stop offset="1" stopColor={color} stopOpacity="0"/></radialGradient>
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
      return <span key={index} className="jar-fragment" style={style}>
        <img src={jar.image} alt="" draggable="false" />
        {jar.layers.map(layer => <img key={layer.image} src={layer.image} alt="" draggable="false" style={{ mixBlendMode: layer.blendMode }} />)}
      </span>
    })}
  </span>
}

function JarBurst({ jar, effect }: { jar: JarConfig; effect: NonNullable<JarProps['effect']> }) {
  const burstRef = useRef<HTMLSpanElement>(null)
  const [bounds, setBounds] = useState<DOMRect | null>(null)
  useLayoutEffect(() => {
    const measure = () => { if (burstRef.current) setBounds(burstRef.current.getBoundingClientRect()) }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  const berries = useMemo(() => {
    const random = (index: number) => particleRandom(jar.seed + 91, index)
    const count = 4 + Math.floor(random(0) * 2)
    const startAngle = random(1) * Math.PI * 2
    return Array.from({ length: count }, (_, index) => {
      // Jitter directions around a full circle so every burst spreads out.
      const sample = index * 10 + 2
      const angle = startAngle + (index + (random(sample) - .5) * .8) * Math.PI * 2 / count
      const distance = (140 + random(sample + 1) * 105) * (bounds && window.innerWidth <= 650 ? .6 : 1)
      const left = 43 + random(sample + 2) * 14
      const top = 49 + random(sample + 3) * 15
      const rotation = random(sample + 4) * 360
      const spin = (random(sample + 5) > .5 ? -1 : 1) * (220 + random(sample + 6) * 300)
      let x = Math.cos(angle) * distance
      let y = Math.sin(angle) * distance
      if (bounds) {
        // Keep scattered berries in view, accounting for the jar's rotation.
        const turn = jar.rotation * Math.PI / 180
        const cos = Math.cos(turn), sin = Math.sin(turn)
        const width = burstRef.current?.offsetWidth ?? 0
        const height = burstRef.current?.offsetHeight ?? 0
        const localX = (left / 100 - .5) * width * jar.scale
        const localY = (top / 100 - .5) * height * jar.scale
        const originX = bounds.left + bounds.width / 2 + localX * cos - localY * sin
        const originY = bounds.top + bounds.height / 2 + localX * sin + localY * cos
        const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
        const screenX = clamp((x * cos - y * sin) * jar.scale, 24 - originX, window.innerWidth - 24 - originX)
        const screenY = clamp((x * sin + y * cos) * jar.scale, 24 - originY, window.innerHeight - 24 - originY)
        x = (screenX * cos + screenY * sin) / jar.scale
        y = (-screenX * sin + screenY * cos) / jar.scale
      }
      return {
        left: `${left}%`,
        top: `${top}%`,
        width: `${9 + random(sample + 7) * 3}%`,
        '--burst-x': `${x.toFixed(1)}px`,
        '--burst-y': `${y.toFixed(1)}px`,
        '--burst-rotation': `${rotation.toFixed(1)}deg`,
        '--burst-spin': `${spin.toFixed(1)}deg`,
        '--burst-delay': `${index * 12}ms`,
      } as CSSProperties
    })
  }, [jar.seed, jar.rotation, jar.scale, bounds])

  return <span ref={burstRef} className={'jar-burst burst-' + effect} aria-hidden="true">
    <span className="jar-burst-splash"><img src={blueberrySplashUrl} alt="" draggable="false" /></span>
    <span className="jar-burst-mist"><i /><i /><i /></span>
    {berries.map((style, index) => <span key={index} className="jar-burst-berry" style={style}><img src={blueberryUrl} alt="" draggable="false" /></span>)}
  </span>
}

function GlowParticles({ id, count, seed, size, color, contour, paused }: { id: string; count: number; seed: number; size: number; color: string; contour: BodyContour; paused: boolean }) {
  const world = useMemo(() => createParticleWorld(contour, seed, count, size), [contour, seed, count, size])
  const circles = useRef<(SVGCircleElement | null)[]>([])
  useEffect(() => {
    if (paused || !world.particles.length) return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0, previous = 0
    const animate = (time: number) => {
      if (previous) stepParticleWorld(world, (time - previous) / 1000)
      previous = time
      world.particles.forEach((particle, i) => {
        circles.current[i]?.setAttribute('cx', String(particle.x))
        circles.current[i]?.setAttribute('cy', String(particle.y))
      })
      frame = requestAnimationFrame(animate)
    }
    const update = () => {
      cancelAnimationFrame(frame)
      previous = 0
      if (!preference.matches && !document.hidden) frame = requestAnimationFrame(animate)
    }
    update()
    preference.addEventListener('change', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      cancelAnimationFrame(frame)
      preference.removeEventListener('change', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [world, paused])
  return <g className="glow-particles">
    <defs><GlowGradient id={id + '-glow'} color={color} /></defs>
    {world.particles.map(({ x, y, radius }, i) => {
      const duration = (2.4 + (i % 5) * .33 + (seed % 3) * .18) + 's'
      const begin = (-i * .47) + 's'
      return <circle key={i} ref={circle => { circles.current[i] = circle }} className="glow-particle" cx={x} cy={y} r={radius} fill={'url(#' + id + '-glow)'} style={{ '--duration': duration, '--delay': begin } as CSSProperties} />
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

export default function Jar({ jar, project, effect, onOpen, onEraser, onPairHover, onCategoryHover }: JarProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dustSvgRef = useRef<SVGSVGElement>(null)
  const berryRef = useRef<SVGImageElement>(null)
  const berryRefs = useRef<(SVGImageElement | null)[]>([])
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const press = useRef({ x: 0, y: 0, active: false, held: false, moved: false })
  const mode = useRef<'idle' | 'erasing' | 'restoring'>('idle')
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [contour, setContour] = useState<BodyContour | null>(null)
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)
  const particleContour = useMemo(() => jar.particleZone ? (imageSize ? particleContourForZone(imageSize, jar.particleZone) : null) : contour, [contour, imageSize, jar.particleZone])
  const [berryWorld, setBerryWorld] = useState<BerryWorld | null>(null)
  const [tick, setTick] = useState(0)
  const releaseAt = useRef(0)
  const maskId = jar.id + '-erase'

  useEffect(() => {
    let active = true
    setBerryWorld(null)
    if (contour) void foregroundPixels(jar, contour).then(pixels => {
      if (!active) return
      const world = createBerryWorld(contour, pixels, jar.seed, { count: jar.blueberryCount, size: jar.blueberrySize })
      const requestedCount = jar.blueberryCount ?? berryCount(contour)
      if (world.berries.length < requestedCount) console.warn(`${jar.categoryId}/jar/settings.json: only ${world.berries.length} of ${requestedCount} blueberries fit at the configured size. Reduce blueberrySize or blueberryCount.`)
      setBerryWorld(world)
    })
    return () => { active = false }
  }, [jar, contour])

  useEffect(() => {
    if (!berryWorld || effect) return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let previous = 0
    const animate = (time: number) => {
      if (previous) stepBerryWorld(berryWorld, (time - previous) / 1000)
      previous = time
      berryWorld.berries.forEach((berry, index) => {
        const image = berryRefs.current[index]
        image?.setAttribute('x', String(berry.x - berry.radius))
        image?.setAttribute('y', String(berry.y - berry.radius))
        image?.setAttribute('transform', `rotate(${berry.rotation} ${berry.x} ${berry.y})`)
      })
      frame = requestAnimationFrame(animate)
    }
    const update = () => {
      cancelAnimationFrame(frame)
      previous = 0
      if (!preference.matches && !document.hidden) frame = requestAnimationFrame(animate)
    }
    update()
    preference.addEventListener('change', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      cancelAnimationFrame(frame)
      preference.removeEventListener('change', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [berryWorld, effect])

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
    if (!particleContour || !svgRef.current) return
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
  }, [particleContour, berryWorld])

  const addStroke = (event: PointerEvent<HTMLButtonElement>) => {
    if (mode.current !== 'erasing' || !svgRef.current || !particleContour) return
    const matrix = svgRef.current.getScreenCTM()
    if (!matrix) return
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    if (point.y < particleContour.rows[0].y || point.y > particleContour.rows[particleContour.rows.length - 1].y) return
    const row = bodyAt(particleContour, point.y)
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
    if (Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > 12) {
      press.current.moved = true
      if (!press.current.held && holdTimer.current) clearTimeout(holdTimer.current)
    }
    addStroke(event)
  }

  const openFromBerry = () => {
    const berry = berryWorld?.berries[0]
    const matrix = berryRef.current?.getScreenCTM()
    if (!berry || !matrix) {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (rect) {
        const size = Math.min(rect.width, rect.height) * .1 * (jar.blueberrySize ?? 1)
        onOpen(project, new DOMRect(rect.left + (rect.width - size) / 2, rect.top + (rect.height - size) / 2, size, size))
      }
      return
    }
    // A diagonal sprite has a larger bounding box; its actual diameter keeps
    // the outgoing flight at the same visible size.
    const center = new DOMPoint(berry.x, berry.y).matrixTransform(matrix)
    const size = berry.radius * 2 * Math.hypot(matrix.a, matrix.b)
    onOpen(project, new DOMRect(center.x - size / 2, center.y - size / 2, size, size))
  }

  const pointerUp = () => {
    if (!press.current.active) return
    if (holdTimer.current) clearTimeout(holdTimer.current)
    const shouldOpen = !press.current.held && !press.current.moved && mode.current === 'idle'
    press.current.active = false
    beginRestore()
    if (shouldOpen) openFromBerry()
  }

  const restoreProgress = mode.current === 'restoring' ? Math.max(0, 1 - tick / 1800) : 1
  const style = { '--x': jar.x + '%', '--y': jar.y + '%', '--mx': jar.mobileX + '%', '--my': jar.mobileY + '%', '--rotation': jar.rotation + 'deg', '--scale': jar.scale, '--ambient-delay': (-jar.seed / 7) + 's' } as CSSProperties

  return <button ref={buttonRef} className={'jar-button' + (effect && effect !== 'shake' ? ' jar-effect-active' : '') + (effect === 'shake' ? ' jar-shaking' : '') + (effect === 'reassemble' ? ' jar-reassembling' : '')} style={style} type="button" aria-label={'Open ' + project.title + '. Press and hold to erase the light inside.'} data-interactive="true" data-jar-number={project.number} onPointerEnter={event => { if (event.pointerType === 'touch') return; onCategoryHover(project, true); if (project.number === '06' || project.number === '07') onPairHover(true) }} onPointerLeave={event => { if (!event.currentTarget.matches(':focus-visible')) onCategoryHover(project, false); if (project.number === '06' || project.number === '07') onPairHover(false) }} onFocus={event => { if (!event.currentTarget.matches(':focus-visible')) return; onCategoryHover(project, true); if (project.number === '06' || project.number === '07') onPairHover(true) }} onBlur={event => { if (!event.currentTarget.matches(':hover')) onCategoryHover(project, false); if (project.number === '06' || project.number === '07') onPairHover(false) }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { press.current.active = false; if (holdTimer.current) clearTimeout(holdTimer.current); beginRestore() }} onClick={event => { if (event.detail === 0) openFromBerry() }}>
    <span className="jar-float">
      <span className="jar-body">
        <img className="jar-photo" src={jar.image} alt="" draggable="false" onLoad={event => { const image = event.currentTarget; image.closest('button')?.style.setProperty('--jar-aspect', String(image.naturalWidth / image.naturalHeight)); setImageSize({ width: image.naturalWidth, height: image.naturalHeight }); setContour(traceBody(image, jar.glassPolygon)) }} />
        {jar.layers.filter(layer => layer.placement === 'interior').map(layer => <img key={layer.image} className="jar-overlay jar-interior" src={layer.image} alt="" draggable="false" style={{ mixBlendMode: layer.blendMode }} />)}
        {particleContour && <svg ref={svgRef} className="jar-light-layer" viewBox={`0 0 ${particleContour.width} ${particleContour.height}`} aria-hidden="true">
          <defs>
            <clipPath id={jar.id + '-body'} clipPathUnits="userSpaceOnUse"><path d={particleContour.path} /></clipPath>
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={particleContour.width} height={particleContour.height}>
              <rect width={particleContour.width} height={particleContour.height} fill="white" />
              {strokes.map((stroke, i) => <circle key={i} cx={stroke.x} cy={stroke.y} r={particleContour.width * 25 / 180 * restoreProgress} fill="black" />)}
            </mask>
          </defs>
          <g clipPath={'url(#' + jar.id + '-body)'}>
            <g className="jar-glow-content" mask={'url(#' + maskId + ')'}><GlowParticles id={jar.id} count={jar.particleCount} seed={jar.seed} size={jar.particleSize} color={jar.particleColor} contour={particleContour} paused={!!effect} /></g>
          </g>
        </svg>}
        {contour && <svg className="jar-berry-layer" viewBox={`0 0 ${contour.width} ${contour.height}`} aria-hidden="true">
          <defs><clipPath id={jar.id + '-berry-body'} clipPathUnits="userSpaceOnUse"><path d={contour.path} /></clipPath></defs>
          <g clipPath={'url(#' + jar.id + '-berry-body)'}>
            {berryWorld?.berries.map((berry, index) => <image key={index} ref={image => { berryRefs.current[index] = image; if (index === 0) berryRef.current = image }} className="jar-blueberry" href={blueberryUrl} x={berry.x - berry.radius} y={berry.y - berry.radius} width={berry.radius * 2} height={berry.radius * 2} transform={`rotate(${berry.rotation} ${berry.x} ${berry.y})`} />)}
          </g>
        </svg>}
        {jar.layers.filter(layer => layer.placement !== 'interior').map(layer => <img key={layer.image} className="jar-overlay" src={layer.image} alt="" draggable="false" style={{ mixBlendMode: layer.blendMode }} />)}
        {effect && effect !== 'shake' && <JarFragments jar={jar} effect={effect} />}
        {effect && effect !== 'shake' && <JarBurst jar={jar} effect={effect} />}
      </span>
      {contour && <MagicDust id={jar.id} seed={jar.seed} contour={contour} svgRef={dustSvgRef} />}
    </span>
    <span className={'jar-index-anchor' + (jar.indexAnchor ? ' jar-index-anchor-custom' : '')} style={jar.indexAnchor ? { left: `${jar.indexAnchor.x}%`, top: `${jar.indexAnchor.y}%` } : undefined} aria-hidden="true">{project.number}</span>
  </button>
}
