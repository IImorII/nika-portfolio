import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import sharp from 'sharp'
import { bodyAt, findBerryMotion, particlePlacement, particlePlacements, particleSafeSpans, particleZonePolygon, particleContourForZone, safeSpan, traceGlassPixels } from '../src/jar-geometry.ts'
import { berryCount, createBerryWorld, stepBerryWorld } from '../src/berry-physics.ts'
import { createParticleWorld, stepParticleWorld } from '../src/particle-physics.ts'

function assertParticleInside(particle, polygon, message = '') {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [x, y] = polygon[i], [nextX, nextY] = polygon[j]
    if ((y > particle.y) !== (nextY > particle.y) && particle.x < (nextX - x) * (particle.y - y) / (nextY - y) + x) inside = !inside
    const dx = nextX - x, dy = nextY - y
    const t = Math.max(0, Math.min(1, ((particle.x - x) * dx + (particle.y - y) * dy) / (dx * dx + dy * dy)))
    assert.ok(Math.hypot(particle.x - x - dx * t, particle.y - y - dy * t) >= particle.radius * 1.16 - 1e-5, `${message}: pulse crosses edge ${i}`)
  }
  assert.ok(inside, `${message}: center outside polygon`)
}

test('initial particles fill equal areas evenly and include both lobes of a concave polygon', () => {
  const rectangle = particleContourForZone({ width: 400, height: 400 }, { x: 0, y: 0, width: 100, height: 100 })
  for (let seed = 1; seed <= 12; seed++) {
    const particles = particlePlacements(rectangle, seed, 16, .5)
    const quadrants = [0, 0, 0, 0]
    for (const particle of particles) {
      assert.ok(particle)
      quadrants[(particle.x >= 200 ? 1 : 0) + (particle.y >= 200 ? 2 : 0)]++
    }
    assert.ok(quadrants.every(count => count >= 3 && count <= 5), `seed ${seed}: ${quadrants}`)
  }
  const triangle = particleContourForZone({ width: 400, height: 400 }, { x: 0, y: 0, width: 100, height: 100, polygon: [[.5, 0], [1, 1], [0, 1]] })
  const points = particlePlacements(triangle, 24, 64, .25)
  const topHalf = points.filter(point => point && point.y < 200).length
  assert.ok(topHalf >= 12 && topHalf <= 20, `top half has one quarter of the area: ${topHalf}/64`)
  const concave = particleContourForZone({ width: 400, height: 400 }, { x: 0, y: 0, width: 100, height: 100, polygon: [[0, 0], [1, 0], [1, 1], [.65, 1], [.65, .3], [.35, .3], [.35, 1], [0, 1]] })
  const lobes = particlePlacements(concave, 24, 24, .5)
  assert.equal(lobes.filter(Boolean).length, 24)
  assert.ok(lobes.filter(point => point.y > 160 && point.x < 140).length >= 6)
  assert.ok(lobes.filter(point => point.y > 160 && point.x > 260).length >= 6)
  for (const point of lobes) assertParticleInside(point, concave.polygon)
})

test('particle edges reflect velocity continuously and preserve speed on sloped boundaries', () => {
  const rectangle = particleContourForZone({ width: 100, height: 100 }, { x: 0, y: 0, width: 100, height: 100 })
  const world = createParticleWorld(rectangle, 24, 1)
  const particle = { x: 89, y: 50, radius: 10 / 1.16, vx: 40, vy: 0 }
  world.particles = [particle]
  stepParticleWorld(world, .05)
  assert.ok(Math.abs(particle.x - 89) < 1e-5)
  assert.equal(particle.vx, -40)
  assert.equal(particle.vy, 0)
  const triangle = particleContourForZone({ width: 100, height: 100 }, { x: 0, y: 0, width: 100, height: 100, polygon: [[0, 0], [1, 0], [0, 1]] })
  const sloped = createParticleWorld(triangle, 24, 1)
  const diagonal = { x: 47, y: 47, radius: 2 / 1.16, vx: 40, vy: 10 }
  sloped.particles = [diagonal]
  const speed = Math.hypot(diagonal.vx, diagonal.vy)
  for (let frame = 0; frame < 5; frame++) stepParticleWorld(sloped, .05)
  assert.ok(Math.abs(diagonal.vx + 10) < 1e-8)
  assert.ok(Math.abs(diagonal.vy + 40) < 1e-8)
  assert.ok(Math.abs(Math.hypot(diagonal.vx, diagonal.vy) - speed) < 1e-8)
  assertParticleInside(diagonal, triangle.polygon)
})

test('particles traverse the full contour and bounce safely at concave corners with either winding', () => {
  const polygon = [[0, 0], [1, 0], [1, 1], [.65, 1], [.65, .3], [.35, .3], [.35, 1], [0, 1]]
  for (const vertices of [polygon, polygon.slice().reverse()]) {
    const contour = particleContourForZone({ width: 400, height: 400 }, { x: 0, y: 0, width: 100, height: 100, polygon: vertices })
    const world = createParticleWorld(contour, 24, 24, .5)
    const initial = world.particles.map(p => ({ ...p }))
    const travel = initial.map(() => 0)
    for (let frame = 0; frame < 7200; frame++) {
      stepParticleWorld(world, 1 / 60)
      for (const [i, particle] of world.particles.entries()) {
        assertParticleInside(particle, contour.polygon, `frame ${frame} particle ${i}`)
        assert.ok(Math.abs(Math.hypot(particle.vx, particle.vy) - Math.hypot(initial[i].vx, initial[i].vy)) < 1e-6)
        travel[i] = Math.max(travel[i], Math.hypot(particle.x - initial[i].x, particle.y - initial[i].y))
      }
    }
    assert.ok(travel.every(distance => distance > 80), `particles must leave their original small oscillation: ${travel}`)
    assert.ok(travel.reduce((sum, distance) => sum + distance, 0) / travel.length > 250, 'the population should traverse the whole zone')
  }
})

test('berry count follows glass area and is invariant under uniform resizing', () => {
  const makeContour = (height, scale = 1) => ({ width: 1000 * scale, height: 1000 * scale, rows: [{ y: 0, left: 0, right: 600 * scale }, { y: height * scale, left: 0, right: 600 * scale }], path: '' })
  assert.equal(berryCount(makeContour(240)), 9)
  assert.equal(berryCount(makeContour(110)), 4)
  assert.equal(berryCount(makeContour(330)), 12)
  assert.equal(berryCount(makeContour(390)), 14)
  assert.equal(berryCount(makeContour(550)), 20)
  assert.equal(berryCount(makeContour(1100)), 40)
  assert.equal(berryCount(makeContour(330, .3)), 12)
})

test('manual blueberry count and size stay exact, including disabled berries and crowded jars', () => {
  const contour = { width: 400, height: 400, rows: [{ y: 50, left: 60, right: 340 }, { y: 350, left: 60, right: 340 }], path: '' }
  const foreground = new Uint8ClampedArray(400 * 400 * 4)
  assert.deepEqual(createBerryWorld(contour, foreground, 11, { count: 0, size: 1 }), { berries: [], bands: [] })
  const world = createBerryWorld(contour, foreground, 11, { count: 5, size: 1.5 })
  assert.equal(world.berries.length, 5)
  assert.ok(world.berries.every(berry => Math.abs(berry.radius - 30) < 1e-9))
  for (let frame = 0; frame < 240; frame++) {
    stepBerryWorld(world, 1 / 60)
    for (const [i, berry] of world.berries.entries()) {
      const span = safeSpan(contour, berry.y, berry.y, berry.radius)
      assert.ok(span && berry.x >= span.left && berry.x <= span.right)
      for (const other of world.berries.slice(i + 1)) assert.ok(Math.hypot(berry.x - other.x, berry.y - other.y) >= berry.radius + other.radius - .01)
    }
  }
  const crowded = createBerryWorld(contour, foreground, 11, { count: 100, size: 3 })
  assert.ok(crowded.berries.length > 0 && crowded.berries.length < 100)
  assert.ok(crowded.berries.every(berry => Math.abs(berry.radius - 60) < 1e-9), 'explicit size must never silently shrink')
})

test('particle size scales the glow and keeps its complete pulse inside glass', () => {
  const contour = { width: 400, height: 400, rows: Array.from({ length: 341 }, (_, i) => ({ y: 30 + i, left: 30, right: 370 })), path: '' }
  for (let i = 0; i < 9; i++) {
    const original = particlePlacement(contour, 24, i, 9)
    const bigger = particlePlacement(contour, 24, i, 9, 2)
    assert.ok(original && bigger)
    assert.equal(bigger.radius, original.radius * 2)
    const spans = particleSafeSpans(contour, bigger.y, bigger.y, bigger.radius * 1.16)
    assert.ok(spans.some(span => bigger.x >= span.left && bigger.x <= span.right))
  }
  assert.equal(particlePlacement(contour, 24, 0, 1, 100), null)
})

test('head-on contacts exchange velocity and separate without adding energy', () => {
  const a = { x: 45, y: 50, radius: 5, vx: 10, vy: 0, rotation: 0 }
  const b = { x: 55, y: 50, radius: 5, vx: -10, vy: 0, rotation: 90 }
  const world = { berries: [a, b], bands: [{ y: 5, left: 5, right: 95 }, { y: 95, left: 5, right: 95 }] }
  stepBerryWorld(world, 1 / 60)
  assert.equal(a.vx, -10)
  assert.equal(b.vx, 10)
  assert.ok(b.x - a.x >= 10)
  for (let i = 0; i < 1200; i++) stepBerryWorld(world, 1 / 60)
  assert.equal(a.vx ** 2 + b.vx ** 2, 200)
})

test('edited particle zone is authoritative, including areas outside the old glass contour', () => {
  const contour = { width: 400, height: 400, rows: Array.from({ length: 341 }, (_, i) => ({ y: 30 + i, left: 30, right: 370 })), path: '' }
  const original = particleContourForZone(contour, { x: 20, y: 25, width: 40, height: 40 })
  const shifted = particleContourForZone(contour, { x: 35, y: 35, width: 40, height: 40 })
  const smaller = particleContourForZone(contour, { x: 20, y: 25, width: 20, height: 40 })
  assert.equal(shifted.rows[0].left - original.rows[0].left, 60)
  assert.equal(shifted.rows[0].y - original.rows[0].y, 40)
  assert.equal(smaller.rows[0].right - smaller.rows[0].left, 80)
  const expanded = particleContourForZone(contour, { x: 0, y: 0, width: 100, height: 100 })
  assert.deepEqual(expanded.rows[0], { y: 0, left: 0, right: 400 })
  assert.deepEqual(expanded.rows.at(-1), { y: 400, left: 0, right: 400 })
  assert.equal(expanded.path, 'M 0 0 L 400 0 L 400 400 L 0 400 Z')
  assert.ok(expanded.rows[0].y < contour.rows[0].y)
  const movedOutside = particleContourForZone(contour, { x: 0, y: 0, width: 5, height: 5 })
  assert.equal(movedOutside.rows.at(-1).y, 20)
  for (const zone of [original, shifted, smaller]) {
    for (let i = 0; i < 5; i++) {
      const motion = particlePlacement(zone, 24, i, 5)
      assert.ok(motion)
      const spans = particleSafeSpans(zone, motion.y, motion.y, motion.radius * 1.16)
      assert.ok(spans.some(span => motion.x >= span.left && motion.x <= span.right))
    }
  }
  const tiny = particleContourForZone(contour, { x: 20, y: 25, width: .1, height: 40 })
  assert.equal(particlePlacement(tiny, 24, 0, 1), null)
})

test('particle SVG mask keeps authored vertices and samples subpixel polygon corners', () => {
  const zone = { x: 10, y: 10, width: 80, height: 80, polygon: [[0, 0], [1, 0], [1, 1], [.5, .5003125], [0, 1]] }
  const contour = particleContourForZone({ width: 400, height: 400 }, zone)
  assert.equal(contour.path, 'M 40 40 L 360 40 L 360 360 L 200 200.1 L 40 360 Z')
  assert.ok(contour.rows.some(row => row.y === 200.1), 'the notch must not be lost between sampled rows')
  assert.equal(particleContourForZone({ width: 400, height: 400 }, { x: 10, y: 10, width: 80, height: 80, polygon: [[0, 0], [.5, 0], [1, 0]] }), null)
})

test('glass region excludes opaque beige fabric and does not depend on RGB color', () => {
  const pixels = new Uint8ClampedArray(200 * 300 * 4)
  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set([225, 216, 194, 255], offset)
  const polygon = [[.2, .55], [.8, .55], [.8, .9], [.2, .9]]
  const beige = traceGlassPixels(pixels, 200, 300, polygon)
  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set([255, 255, 255, 255], offset)
  const white = traceGlassPixels(pixels, 200, 300, polygon)
  assert.deepEqual(beige, white)
  assert.ok(beige.rows.every(row => row.y >= 165 && row.y < 270))
  assert.equal(traceGlassPixels(new Uint8ClampedArray(pixels.length), 200, 300, polygon), null)
})

test('body interpolation handles gaps between sampled rows', () => {
  const contour = { rows: [{ y: 100, left: 20, right: 100 }, { y: 115, left: 30, right: 90 }, { y: 120, left: 40, right: 80 }] }
  assert.deepEqual(bodyAt(contour, 107.5), { y: 107.5, left: 25, right: 95 })
  assert.equal(bodyAt(contour, 118).left, 36)
})

test('real jars use saved particle polygons and keep a larger, visible berry inside the glass', async () => {
  const regions = JSON.parse(readFileSync(new URL('./jar-glass-regions.json', import.meta.url)))
  for (const [category, polygon] of Object.entries(regions)) {
    const directory = new URL(`../public/assets/${category}/jar/`, import.meta.url)
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory)))
    assert.deepEqual(manifest.glassPolygon, polygon, category)
    const { data, info } = await sharp(readFileSync(new URL('base.webp', directory))).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const contour = traceGlassPixels(new Uint8ClampedArray(data), info.width, info.height, polygon)
    assert.ok(contour, category)
    const settings = JSON.parse(readFileSync(new URL('settings.json', directory)))
    assert.ok(settings.particleZone, `${category}: settings must contain the current particle zone`)
    const particleContour = particleContourForZone({ width: info.width, height: info.height }, settings.particleZone)
    assert.ok(particleContour, `${category}: missing saved particle contour`)
    const expectedPath = 'M ' + particleZonePolygon(settings.particleZone).map(([x, y]) => `${x * info.width} ${y * info.height}`).join(' L ') + ' Z'
    assert.equal(particleContour.path, expectedPath, `${category}: mask must match the edited settings, without the old glass polygon`)
    const particleWorld = createParticleWorld(particleContour, settings.seed, settings.particleCount, settings.particleSize)
    assert.equal(particleWorld.particles.length, settings.particleCount, category)
    for (let frame = 0; frame < 3600; frame++) {
      stepParticleWorld(particleWorld, 1 / 60)
      for (const particle of particleWorld.particles) assertParticleInside(particle, particleContour.polygon, `${category} frame ${frame}`)
    }
    for (let seed = 1; seed <= 25; seed++) for (let index = 0; index < 11; index++) {
      const motion = particlePlacement(particleContour, seed, index, 11)
      assert.ok(motion, `${category}: missing particle ${index}`)
      const spans = particleSafeSpans(particleContour, motion.y, motion.y, motion.radius * 1.16)
      assert.ok(spans.some(span => motion.x >= span.left && motion.x <= span.right), `${category}: glow/pulse reaches outside saved polygon`)
    }
    const foreground = new Uint8ClampedArray(await sharp({ create: { width: info.width, height: info.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(manifest.layers.filter(layer => layer.placement !== 'interior').map(layer => ({ input: readFileSync(new URL(layer.file, directory)) }))).raw().toBuffer())
    const berry = findBerryMotion(contour, foreground)
    assert.ok(berry, `${category}: missing berry`)
    assert.ok(berry.radius > contour.width * .038 * 1.16, `${category}: berry should be larger than pulsing glows`)
    const span = safeSpan(contour, berry.y - berry.dy, berry.y + berry.dy, berry.radius)
    assert.ok(span, `${category}: berry reaches outside glass`)
    assert.ok(berry.x - berry.dx >= span.left && berry.x + berry.dx <= span.right)
    let covered = 0
    let samples = 0
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
      if (x * x + y * y > 16) continue
      const px = Math.round(berry.x + x / 4 * berry.radius)
      const py = Math.round(berry.y + y / 4 * berry.radius)
      covered += foreground[(py * contour.width + px) * 4 + 3] / 255
      samples++
    }
    assert.ok(covered / samples < .2, `${category}: label hides the berry`)

    const seeds = category === 'digital' ? [11, 24, 37, 89] : category === 'poster' ? [11, 37, 76, 89] : [11, 37, 89]
    for (const seed of seeds) {
      const world = createBerryWorld(contour, foreground, seed)
      assert.equal(world.berries.length, berryCount(contour), `${category}: incorrect berry count`)
      if (category === 'digital') {
        assert.ok(world.berries.length >= 18, 'jar-6 should have more berries for its larger glass body')
        assert.ok(world.bands[0].y < contour.height * .43, 'jar-6 berries must reach the shoulder above the halfway point')
        const middle = bodyAt(contour, contour.height * .6)
        assert.ok(middle.right - middle.left > contour.width * .69, 'jar-6 should use the full rounded glass width')
      }
      if (category === 'poster') assert.ok(world.bands[0].y < contour.height * .34, 'jar-5 berries must reach the glass directly below the cloth')
      const initial = world.berries.map(berry => ({ ...berry }))
      const maxTravel = initial.map(() => 0)
      assert.ok(world.berries.every(berry => berry.rotation >= 0 && berry.rotation < 360))
      assert.equal(new Set(world.berries.map(berry => berry.rotation)).size, world.berries.length, `${category}: individual berry rotations`)
      let highestY = Infinity
      for (let frame = 0; frame < 1800; frame++) {
        stepBerryWorld(world, frame % 60 === 0 ? .05 : 1 / 60)
        for (const [i, berry] of world.berries.entries()) {
          highestY = Math.min(highestY, berry.y)
          maxTravel[i] = Math.max(maxTravel[i], Math.hypot(berry.x - initial[i].x, berry.y - initial[i].y))
          const span = safeSpan(contour, berry.y, berry.y, berry.radius)
          assert.ok(span && berry.x >= span.left && berry.x <= span.right, `${category}: berry ${i} leaves glass at frame ${frame}`)
          assert.ok(Number.isFinite(berry.vx + berry.vy))
          for (const other of world.berries.slice(i + 1)) {
            assert.ok(Math.hypot(berry.x - other.x, berry.y - other.y) >= berry.radius + other.radius - .01, `${category}: berries overlap at frame ${frame}`)
          }
        }
      }
      if (category === 'digital') assert.ok(highestY < contour.height * .43, 'jar-6 berries should actually visit its upper shoulder')
      if (category === 'poster') assert.ok(highestY < contour.height * .34, 'jar-5 berries should actually visit the glass below the lid')
      assert.ok(maxTravel.every(distance => distance > contour.width * .01), `${category}: berries should move through the glass`)
    }
  }
})
