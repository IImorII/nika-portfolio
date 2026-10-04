import { particleRandom, safeSpan } from './jar-geometry.ts'
import type { BodyContour } from './jar-geometry.ts'

export type Berry = { x: number; y: number; radius: number; vx: number; vy: number; rotation: number }
type Band = { y: number; left: number; right: number }
export type BerryWorld = { berries: Berry[]; bands: Band[] }
export type BerryOptions = { count?: number; size?: number }

export function berryCount(contour: BodyContour) {
  let area = 0
  for (let i = 1; i < contour.rows.length; i++) {
    const a = contour.rows[i - 1]
    const b = contour.rows[i]
    area += ((a.right - a.left) + (b.right - b.left)) / 2 * (b.y - a.y)
  }
  // Relative area keeps the same density when the entire jar is resized.
  return Math.max(1, Math.round(area / (contour.width ** 2 * .0165)))
}

export function berryCoverage(contour: BodyContour, foreground: Uint8ClampedArray, berry: Pick<Berry, 'x' | 'y' | 'radius'>) {
  let coverage = 0
  let samples = 0
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
    if (x * x + y * y > 9) continue
    const px = Math.round(berry.x + x / 3 * berry.radius)
    const py = Math.round(berry.y + y / 3 * berry.radius)
    coverage += (foreground[(py * contour.width + px) * 4 + 3] ?? 0) / 255
    samples++
  }
  return coverage / samples
}

export function createBerryWorld(contour: BodyContour, foreground: Uint8ClampedArray, seed: number, options: BerryOptions = {}): BerryWorld {
  const count = options.count ?? berryCount(contour)
  if (count === 0) return { berries: [], bands: [] }
  // Automatic sizes may shrink to fit; explicit sizes stay exactly as configured.
  const sizes: number[] = []
  if (options.size !== undefined) sizes.push(.05 * options.size)
  else for (let size = .05; size >= .015; size -= .005) sizes.push(size)
  let bestWorld: BerryWorld = { berries: [], bands: [] }
  for (const size of sizes) {
    const radius = contour.width * size
    const bands: Band[] = []
    const step = Math.max(1, contour.width / 1000)
    const padding = radius + step
    for (let y = contour.rows[0].y + padding; y <= contour.rows.at(-1)!.y - padding; y += step) {
      const span = safeSpan(contour, y, y, padding)
      if (span) bands.push({ y, ...span })
    }
    if (bands.length < 2) continue
    const candidates: (Berry & { coverage: number; tie: number })[] = []
    const spacing = Math.max(step, radius * .45)
    for (let y = bands[0].y; y <= bands.at(-1)!.y; y += spacing) {
      const span = boundsAt(bands, y)
      for (let x = span.left; x <= span.right; x += spacing) {
        const point = { x, y, radius, vx: 0, vy: 0, rotation: 0 }
        candidates.push({ ...point, coverage: berryCoverage(contour, foreground, point), tie: particleRandom(seed, candidates.length) })
      }
    }
    const berries: Berry[] = []
    while (berries.length < count) {
      let best: typeof candidates[number] | undefined
      let bestScore = -Infinity
      for (const candidate of candidates) {
        const distance = berries.length ? Math.min(...berries.map(berry => Math.hypot(candidate.x - berry.x, candidate.y - berry.y))) : Math.max(contour.width * .3, radius * 2 + step * 2)
        if (distance < radius * 2 + step * 2) continue
        // Spread across the glass while favoring places clear of the label.
        const score = distance - candidate.coverage * contour.width * .12 + candidate.tie * spacing * .15
        if (score > bestScore) { best = candidate; bestScore = score }
      }
      if (!best) break
      const angle = particleRandom(seed, berries.length + 300) * Math.PI * 2
      const speed = contour.width * (.065 + particleRandom(seed, berries.length + 400) * .025)
      const rotation = particleRandom(seed, berries.length + 500) * 360
      berries.push({ x: best.x, y: best.y, radius, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, rotation })
    }
    if (berries.length === count) return { berries, bands }
    if (berries.length > bestWorld.berries.length) bestWorld = { berries, bands }
  }
  return bestWorld
}

function boundsAt(bands: Band[], y: number) {
  let low = 0
  let high = bands.length - 1
  while (low + 1 < high) {
    const middle = (low + high) >> 1
    if (bands[middle].y <= y) low = middle
    else high = middle
  }
  const a = bands[low]
  const b = bands[high]
  const t = Math.max(0, Math.min(1, (y - a.y) / (b.y - a.y)))
  return {
    left: a.left + (b.left - a.left) * t,
    right: a.right + (b.right - a.right) * t,
    leftSlope: (b.left - a.left) / (b.y - a.y),
    rightSlope: (b.right - a.right) / (b.y - a.y),
  }
}

function reflect(berry: Berry, nx: number, ny: number) {
  const length = Math.hypot(nx, ny)
  nx /= length
  ny /= length
  const incoming = berry.vx * nx + berry.vy * ny
  if (incoming >= 0) return
  berry.vx -= 2 * incoming * nx
  berry.vy -= 2 * incoming * ny
}

function contain(berry: Berry, bands: Band[]) {
  for (let iteration = 0; iteration < 8; iteration++) {
    if (berry.y < bands[0].y) { berry.y = bands[0].y; reflect(berry, 0, 1) }
    if (berry.y > bands.at(-1)!.y) { berry.y = bands.at(-1)!.y; reflect(berry, 0, -1) }
    const span = boundsAt(bands, berry.y)
    if (berry.x >= span.left && berry.x <= span.right) return
    const left = berry.x < span.left
    const slope = left ? span.leftSlope : span.rightSlope
    const penetration = ((left ? span.left : span.right) - berry.x) / (1 + slope ** 2)
    // Correct along the wall's normal, leaving room for a group of touching
    // berries to slide along sloping glass instead of jamming against it.
    berry.x += penetration
    berry.y -= penetration * slope
    reflect(berry, left ? 1 : -1, left ? -slope : slope)
  }
  berry.y = Math.max(bands[0].y, Math.min(bands.at(-1)!.y, berry.y))
  const span = boundsAt(bands, berry.y)
  berry.x = Math.max(span.left, Math.min(span.right, berry.x))
}

// Fixed small steps prevent tunneling; equal-mass elastic impulses send berries
// apart. Position correction also resolves contacts against sloping glass walls.
export function stepBerryWorld(world: BerryWorld, seconds: number) {
  if (!world.berries.length || seconds <= 0) return
  const steps = Math.ceil(Math.min(seconds, .05) * 120)
  const dt = Math.min(seconds, .05) / steps
  for (let step = 0; step < steps; step++) {
    for (const berry of world.berries) {
      berry.x += berry.vx * dt
      berry.y += berry.vy * dt
      contain(berry, world.bands)
    }
    for (let iteration = 0; iteration < 256; iteration++) {
      let corrected = false
      for (let i = 0; i < world.berries.length; i++) for (let j = i + 1; j < world.berries.length; j++) {
        const a = world.berries[i]
        const b = world.berries[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const distance = Math.hypot(dx, dy)
        const contact = a.radius + b.radius
        if (distance >= contact) continue
        const nx = distance > 1e-9 ? dx / distance : 1
        const ny = distance > 1e-9 ? dy / distance : 0
        const correction = (contact - distance + 1e-5) / 2
        a.x -= nx * correction
        a.y -= ny * correction
        b.x += nx * correction
        b.y += ny * correction
        const incoming = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
        if (incoming < 0) {
          a.vx += incoming * nx
          a.vy += incoming * ny
          b.vx -= incoming * nx
          b.vy -= incoming * ny
        }
        contain(a, world.bands)
        contain(b, world.bands)
        corrected = true
      }
      if (!corrected) break
    }
  }
}
