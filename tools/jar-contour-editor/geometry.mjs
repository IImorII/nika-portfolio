const rounded = value => Math.round(value * 1e12) / 1e12

export function zonePoints(zone, fallback) {
  if (!zone) return structuredClone(fallback ?? [[0, .58], [1, .58], [1, .86], [0, .86]])
  return (zone.polygon ?? [[0, 0], [1, 0], [1, 1], [0, 1]]).map(([x, y]) => [
    rounded((zone.x + x * zone.width) / 100), rounded((zone.y + y * zone.height) / 100),
  ])
}

const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
const onSegment = (a, b, c) => Math.abs(cross(a, b, c)) < 1e-12 && c.every((value, axis) => value >= Math.min(a[axis], b[axis]) - 1e-12 && value <= Math.max(a[axis], b[axis]) + 1e-12)
function intersects(a, b, c, d) {
  return (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0)
    || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b)
}

export function validatePoints(points) {
  if (!Array.isArray(points) || points.length < 3 || points.length > 200) throw new Error('Контур должен содержать от 3 до 200 вершин.')
  if (!points.every(point => Array.isArray(point) && point.length === 2 && point.every(value => Number.isFinite(value) && value >= 0 && value <= 1))) throw new Error('Вершины должны находиться внутри изображения.')
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-7) throw new Error('Две соседние вершины совпадают.')
    area += a[0] * b[1] - b[0] * a[1]
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue
      if (intersects(a, b, points[j], points[(j + 1) % points.length])) throw new Error('Линии контура пересекаются. Переместите вершину.')
    }
  }
  if (Math.abs(area) < 1e-7) throw new Error('Контур слишком узкий: увеличьте его площадь.')
}

export function pointsZone(points) {
  validatePoints(points)
  const x = Math.min(...points.map(point => point[0])), y = Math.min(...points.map(point => point[1]))
  const width = Math.max(...points.map(point => point[0])) - x, height = Math.max(...points.map(point => point[1])) - y
  return { x: rounded(x * 100), y: rounded(y * 100), width: rounded(width * 100), height: rounded(height * 100),
    polygon: points.map(point => [rounded((point[0] - x) / width), rounded((point[1] - y) / height)]) }
}

export function nearestEdge(points, point) {
  let best
  points.forEach((from, index) => {
    const to = points[(index + 1) % points.length], dx = to[0] - from[0], dy = to[1] - from[1]
    const t = Math.max(0, Math.min(1, ((point[0] - from[0]) * dx + (point[1] - from[1]) * dy) / (dx * dx + dy * dy || 1)))
    const projected = [from[0] + dx * t, from[1] + dy * t]
    const distance = Math.hypot(point[0] - projected[0], point[1] - projected[1])
    if (!best || distance < best.distance) best = { index, point: projected, distance }
  })
  return best
}
