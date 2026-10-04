export type GlassPolygon = [number, number][]
export type ParticleZone = { x: number; y: number; width: number; height: number; polygon?: GlassPolygon }
export type BodyRow = { y: number; left: number; right: number }
export type BodyContour = { width: number; height: number; rows: BodyRow[]; path: string; polygon?: GlassPolygon }
export type ParticlePlacement = { x: number; y: number; radius: number }
export type BerryMotion = { x: number; y: number; radius: number; dx: number; dy: number }

// Position and size are percentages of the full jar image. The optional
// polygon preserves its glass shape while allowing that shape to be resized.
export function particleZonePolygon(zone: ParticleZone): GlassPolygon {
  return (zone.polygon ?? [[0, 0], [1, 0], [1, 1], [0, 1]]).map(([x, y]) => [
    Math.round((zone.x + x * zone.width) * 1e8) / 1e10,
    Math.round((zone.y + y * zone.height) * 1e8) / 1e10,
  ])
}

export function particleContourForZone({ width, height }: { width: number; height: number }, zone: ParticleZone): BodyContour | null {
  // An explicitly edited zone is authoritative: do not intersect it with
  // the old glass polygon, source alpha or the old contour's inset.
  const polygon = particleZonePolygon(zone).map(([x, y]) => ({ x: x * width, y: y * height }))
  const top = Math.min(...polygon.map(point => point.y))
  const bottom = Math.max(...polygon.map(point => point.y))
  if (bottom <= top) return null
  const sampleYs = new Set(polygon.map(point => point.y))
  for (let y = Math.ceil(top); y < bottom; y++) sampleYs.add(y)
  const rows: BodyRow[] = []
  for (const y of [...sampleYs].sort((a, b) => a - b)) {
    // At horizontal boundary edges, sample infinitesimally inside the zone.
    const scanY = Math.max(top + 1e-8, Math.min(bottom - 1e-8, y))
    const crossings: number[] = []
    for (let i = 0; i < polygon.length; i++) {
      const from = polygon[i]
      const to = polygon[(i + 1) % polygon.length]
      if ((from.y <= scanY && to.y > scanY) || (to.y <= scanY && from.y > scanY)) {
        crossings.push(from.x + (scanY - from.y) / (to.y - from.y) * (to.x - from.x))
      }
    }
    crossings.sort((a, b) => a - b)
    let best: BodyRow | null = null
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const left = crossings[i]
      const right = crossings[i + 1]
      if (right > left && (!best || right - left > best.right - best.left)) best = { y, left, right }
    }
    if (best) rows.push(best)
  }
  if (rows.length < 2) return null
  // Keep the actual authored polygon as the SVG mask, not a sampled hull.
  const points = polygon.map(point => `${point.x} ${point.y}`)
  return { width, height, rows, path: `M ${points.join(' L ')} Z`, polygon: polygon.map(point => [point.x, point.y]) }
}

export function particleRandom(seed: number, index: number) {
  const value = Math.sin(index * 127.1 + seed * 311.7) * 43758.5453
  return value - Math.floor(value)
}

// Alpha describes the whole object, including fabric. The authored polygon
// identifies the glass, independently of the cloth's color or transparency.
export function traceGlassPixels(pixels: Uint8ClampedArray, width: number, height: number, glass?: GlassPolygon): BodyContour | null {
  const polygon = (glass ?? [[0, .58], [1, .58], [1, .86], [0, .86]])
    .map(([x, y]) => ({ x: x * width, y: y * height }))
  const firstY = Math.ceil(Math.min(...polygon.map(point => point.y)))
  const lastY = Math.floor(Math.max(...polygon.map(point => point.y)))
  const rows: BodyRow[] = []
  const inset = width * .012
  for (let y = firstY; y <= lastY; y += 5) {
    const crossings: number[] = []
    for (let i = 0; i < polygon.length; i++) {
      const from = polygon[i]
      const to = polygon[(i + 1) % polygon.length]
      if ((from.y <= y && to.y > y) || (to.y <= y && from.y > y)) {
        crossings.push(from.x + (y - from.y) / (to.y - from.y) * (to.x - from.x))
      }
    }
    crossings.sort((a, b) => a - b)
    let best: BodyRow | null = null
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      let left = width
      let right = -1
      for (let x = Math.max(0, Math.ceil(crossings[i])); x <= Math.min(width - 1, Math.floor(crossings[i + 1])); x++) {
        if (pixels[(y * width + x) * 4 + 3] > 100) { left = Math.min(left, x); right = x }
      }
      if (right > left + inset * 2 && (!best || right - left > best.right - best.left)) best = { y, left: left + inset, right: right - inset }
    }
    if (best) rows.push(best)
  }
  if (rows.length < 2) return null
  const points = [...rows.map(row => `${row.left.toFixed(1)} ${row.y}`),
    ...rows.slice().reverse().map(row => `${row.right.toFixed(1)} ${row.y}`)]
  return { width, height, rows, path: `M ${points.join(' L ')} Z` }
}

export function bodyAt(contour: BodyContour, y: number): BodyRow {
  const rows = contour.rows
  let low = 0
  let high = rows.length - 1
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2)
    if (rows[middle].y <= y) low = middle
    else high = middle
  }
  const from = rows[low]
  const to = rows[high]
  const fraction = Math.max(0, Math.min(1, (y - from.y) / (to.y - from.y || 1)))
  return { y, left: from.left + (to.left - from.left) * fraction, right: from.right + (to.right - from.right) * fraction }
}

// Leave room for the full sprite/glow, its pulse and the whole movement path.
export function safeSpan(contour: BodyContour, fromY: number, toY: number, padding: number) {
  const top = Math.min(fromY, toY) - padding
  const bottom = Math.max(fromY, toY) + padding
  if (top < contour.rows[0].y || bottom > contour.rows[contour.rows.length - 1].y) return null
  const rows = [bodyAt(contour, top), ...contour.rows.filter(row => row.y > top && row.y < bottom), bodyAt(contour, bottom)]
  const left = Math.max(...rows.map(row => row.left)) + padding
  const right = Math.min(...rows.map(row => row.right)) - padding
  return left <= right ? { left, right } : null
}

// A concave polygon can have several separate spans at the same height.
// Keep all of them so particles also fill the side lobes of edited contours.
export function particleSafeSpans(contour: BodyContour, fromY: number, toY: number, padding: number): { left: number; right: number }[] {
  if (!contour.polygon) {
    const span = safeSpan(contour, fromY, toY, padding)
    return span ? [span] : []
  }
  const top = Math.min(fromY, toY) - padding, bottom = Math.max(fromY, toY) + padding
  if (top < contour.rows[0].y || bottom > contour.rows.at(-1)!.y) return []
  const polygon = contour.polygon
  const ys = [top, bottom]
  for (const [, y] of polygon) if (y >= top && y <= bottom) {
    ys.push(Math.max(top, y - 1e-7), Math.min(bottom, y + 1e-7))
  }
  let available = [{ left: 0, right: contour.width }]
  for (const y of ys) {
    const scanY = Math.max(contour.rows[0].y + 1e-8, Math.min(contour.rows.at(-1)!.y - 1e-8, y))
    const crossings: number[] = []
    for (let i = 0; i < polygon.length; i++) {
      const [x1, y1] = polygon[i], [x2, y2] = polygon[(i + 1) % polygon.length]
      if ((y1 <= scanY && y2 > scanY) || (y2 <= scanY && y1 > scanY)) crossings.push(x1 + (scanY - y1) / (y2 - y1) * (x2 - x1))
    }
    crossings.sort((a, b) => a - b)
    const next: typeof available = []
    for (const span of available) for (let i = 0; i + 1 < crossings.length; i += 2) {
      const left = Math.max(span.left, crossings[i]), right = Math.min(span.right, crossings[i + 1])
      if (right >= left) next.push({ left, right })
    }
    available = next
    if (!available.length) return []
  }
  return available.map(span => ({ left: span.left + padding, right: span.right - padding })).filter(span => span.right >= span.left)
}

const particleCache = new WeakMap<BodyContour, Map<string, (ParticlePlacement | null)[]>>()

export function particlePlacements(contour: BodyContour, seed: number, count: number, size = 1): (ParticlePlacement | null)[] {
  if (count <= 0) return []
  const key = `${seed}/${count}/${size}`
  let cache = particleCache.get(contour)
  if (!cache) { cache = new Map(); particleCache.set(contour, cache) }
  const cached = cache.get(key)
  if (cached) return cached
  const radii = Array.from({ length: count }, (_, i) => contour.width * (.021 + particleRandom(seed, i * 3 + 1) * .017) * size)
  const minimumPadding = Math.min(...radii) * 1.16
  const top = contour.rows[0].y, bottom = contour.rows.at(-1)!.y
  const left = Math.min(...(contour.polygon?.map(([x]) => x) ?? contour.rows.map(row => row.left)))
  const right = Math.max(...(contour.polygon?.map(([x]) => x) ?? contour.rows.map(row => row.right)))
  const step = Math.max(contour.width / 1000, Math.sqrt((right - left) * (bottom - top) / Math.min(4096, Math.max(800, count * 80))))
  type Candidate = { x: number; y: number; weight: number }
  const candidates: Candidate[] = []
  const eligible = radii.map(() => [] as number[])
  for (let y = top + minimumPadding + step / 2; y <= bottom - minimumPadding; y += step) {
    const rowIndices: number[] = []
    for (const span of particleSafeSpans(contour, y, y, minimumPadding)) {
      const cells = Math.max(1, Math.ceil((span.right - span.left) / step))
      const cellWidth = (span.right - span.left) / cells
      for (let cell = 0; cell < cells; cell++) {
        rowIndices.push(candidates.length)
        candidates.push({ x: span.left + (cell + .5) * cellWidth, y, weight: cellWidth * step })
      }
    }
    radii.forEach((radius, i) => {
      const spans = particleSafeSpans(contour, y, y, radius * 1.16)
      for (const index of rowIndices) if (spans.some(span => candidates[index].x >= span.left && candidates[index].x <= span.right)) eligible[i].push(index)
    })
  }
  const anchors: (Candidate | null)[] = radii.map(() => null)
  const order = radii.map((radius, i) => ({ radius, i })).sort((a, b) => b.radius - a.radius)
  for (const { i } of order) {
    const placed = anchors.filter((anchor): anchor is Candidate => anchor !== null)
    let best = -Infinity
    for (const index of eligible[i]) {
      const candidate = candidates[index]
      const score = placed.length ? Math.min(...placed.map(anchor => (candidate.x - anchor.x) ** 2 + (candidate.y - anchor.y) ** 2)) : particleRandom(seed, index + 700)
      if (score > best) { best = score; anchors[i] = candidate }
    }
  }
  // Weighted Lloyd relaxation balances area per particle instead of assigning
  // one particle to each horizontal strip. Project centroids back into the
  // safe region so concave notches and configured glow sizes remain respected.
  for (let iteration = 0; iteration < 6; iteration++) {
    const sums = anchors.map(() => ({ x: 0, y: 0, weight: 0 }))
    for (const candidate of candidates) {
      let nearest = -1, distance = Infinity
      anchors.forEach((anchor, i) => {
        if (!anchor) return
        const value = (candidate.x - anchor.x) ** 2 + (candidate.y - anchor.y) ** 2
        if (value < distance) { nearest = i; distance = value }
      })
      if (nearest >= 0) { const sum = sums[nearest]; sum.x += candidate.x * candidate.weight; sum.y += candidate.y * candidate.weight; sum.weight += candidate.weight }
    }
    anchors.forEach((anchor, i) => {
      const sum = sums[i]
      if (!anchor || !sum.weight) return
      const x = sum.x / sum.weight, y = sum.y / sum.weight
      let best = Infinity
      for (const index of eligible[i]) {
        const candidate = candidates[index], distance = (candidate.x - x) ** 2 + (candidate.y - y) ** 2
        if (distance < best) { best = distance; anchors[i] = candidate }
      }
    })
  }
  const placements = anchors.map((anchor, i) => anchor ? { x: anchor.x, y: anchor.y, radius: radii[i] } : null)
  cache.set(key, placements)
  return placements
}

export function particlePlacement(contour: BodyContour, seed: number, index: number, count: number, size = 1) {
  return particlePlacements(contour, seed, count, size)[index] ?? null
}

export function findBerryMotion(contour: BodyContour, foreground: Uint8ClampedArray): BerryMotion | null {
  const centerY = (contour.rows[0].y + contour.rows[contour.rows.length - 1].y) / 2
  const centerRow = bodyAt(contour, centerY)
  const centerX = (centerRow.left + centerRow.right) / 2
  const dx = contour.width * .008
  const dy = contour.height * .009
  let best: (BerryMotion & { score: number }) | null = null
  for (const size of [.060, .055, .050]) {
    const radius = contour.width * size
    const padding = radius + Math.max(dx, dy)
    for (let y = contour.rows[0].y + padding; y <= contour.rows[contour.rows.length - 1].y - padding; y += contour.height * .012) {
      const span = safeSpan(contour, y, y, padding)
      if (!span) continue
      for (let x = span.left; x <= span.right; x += contour.width * .012) {
        let coverage = 0
        let samples = 0
        for (let sy = -4; sy <= 4; sy++) for (let sx = -4; sx <= 4; sx++) {
          if (sx * sx + sy * sy > 16) continue
          const px = Math.round(x + sx / 4 * padding)
          const py = Math.round(y + sy / 4 * padding)
          coverage += foreground[(py * contour.width + px) * 4 + 3] / 255
          samples++
        }
        const obscured = coverage / samples
        const distance = ((x - centerX) / contour.width) ** 2 + ((y - centerY) / contour.height) ** 2
        const score = obscured * 20 + distance + (.06 - size) * 2
        if (!best || score < best.score) best = { x, y, radius, dx, dy, score }
      }
    }
  }
  return best
}
