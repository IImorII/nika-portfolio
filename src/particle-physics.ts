import { particlePlacements, particleRandom } from './jar-geometry.ts'
import type { BodyContour, GlassPolygon } from './jar-geometry.ts'

export type FloatingParticle = { x: number; y: number; radius: number; vx: number; vy: number }
type Edge = { x: number; y: number; dx: number; dy: number; length: number; nx: number; ny: number }
export type ParticleWorld = { particles: FloatingParticle[]; edges: Edge[] }

export function createParticleWorld(contour: BodyContour, seed: number, count: number, size = 1): ParticleWorld {
  const polygon: GlassPolygon = contour.polygon ?? [
    ...contour.rows.map(row => [row.left, row.y] as [number, number]),
    ...contour.rows.slice().reverse().map(row => [row.right, row.y] as [number, number]),
  ]
  const area = polygon.reduce((sum, [x, y], i) => {
    const next = polygon[(i + 1) % polygon.length]
    return sum + x * next[1] - next[0] * y
  }, 0)
  const direction = area >= 0 ? 1 : -1
  const edges = polygon.flatMap(([x, y], i): Edge[] => {
    const [nextX, nextY] = polygon[(i + 1) % polygon.length]
    const dx = nextX - x, dy = nextY - y, length = Math.hypot(dx, dy)
    return length ? [{ x, y, dx, dy, length, nx: -dy / length * direction, ny: dx / length * direction }] : []
  })
  const particles = particlePlacements(contour, seed, count, size).flatMap((placement, i): FloatingParticle[] => {
    if (!placement) return []
    const angle = particleRandom(seed, i + 301) * Math.PI * 2
    const speed = contour.width * (.023 + particleRandom(seed, i + 401) * .012)
    return [{ ...placement, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed }]
  })
  return { particles, edges }
}

// Sweep the full pulsing glow against polygon segments and their endpoints.
// Reflect at the actual point of contact, including sloped sides and concave
// corners, then use the remaining frame time to continue the same trajectory.
export function stepParticleWorld(world: ParticleWorld, seconds: number) {
  const elapsed = Math.max(0, Math.min(.05, seconds))
  for (const particle of world.particles) {
    let remaining = elapsed
    const padding = particle.radius * 1.16
    for (let bounce = 0; remaining > 1e-9 && bounce < 12; bounce++) {
      let contactTime = remaining + 1
      let normals: { x: number; y: number }[] = []
      const contact = (time: number, nx: number, ny: number) => {
        if (time < -1e-9 || time > remaining + 1e-9 || particle.vx * nx + particle.vy * ny >= -1e-9) return
        if (time < contactTime - 1e-9) { contactTime = Math.max(0, time); normals = [{ x: nx, y: ny }] }
        else if (Math.abs(time - contactTime) <= 1e-9) normals.push({ x: nx, y: ny })
      }
      for (const edge of world.edges) {
        const px = particle.x - edge.x, py = particle.y - edge.y
        const toward = particle.vx * edge.nx + particle.vy * edge.ny
        if (toward < -1e-9) {
          const distance = px * edge.nx + py * edge.ny
          const time = (padding - distance) / toward
          const projection = ((px + particle.vx * time) * edge.dx + (py + particle.vy * time) * edge.dy) / edge.length ** 2
          if (projection >= 0 && projection <= 1) contact(time, edge.nx, edge.ny)
        }
        const a = particle.vx ** 2 + particle.vy ** 2
        const b = px * particle.vx + py * particle.vy
        const c = px ** 2 + py ** 2 - padding ** 2
        const discriminant = b ** 2 - a * c
        if (a > 0 && b < 0 && discriminant >= 0) {
          const time = (-b - Math.sqrt(discriminant)) / a
          const nx = (px + particle.vx * time) / padding, ny = (py + particle.vy * time) / padding
          contact(time, nx, ny)
        }
      }
      if (!normals.length) {
        particle.x += particle.vx * remaining
        particle.y += particle.vy * remaining
        break
      }
      particle.x += particle.vx * contactTime
      particle.y += particle.vy * contactTime
      remaining = Math.max(0, remaining - contactTime)
      for (const normal of normals) {
        const incoming = particle.vx * normal.x + particle.vy * normal.y
        if (incoming < 0) {
          particle.vx -= 2 * incoming * normal.x
          particle.vy -= 2 * incoming * normal.y
        }
        particle.x += normal.x * 1e-7
        particle.y += normal.y * 1e-7
      }
    }
  }
}
