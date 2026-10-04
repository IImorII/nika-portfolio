import assert from 'node:assert/strict'
import { test } from 'node:test'
import { once } from 'node:events'
import { request } from 'node:http'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createJarEditorServer } from './server.mjs'
import { pointsZone, zonePoints, nearestEdge, validatePoints } from './geometry.mjs'

const polygon = [[.2, .4], [.8, .4], [.8, .9], [.2, .9]]

async function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nika-jar-editor-'))
  const directory = path.join(root, 'category #1/jar'); mkdirSync(directory, { recursive: true })
  writeFileSync(path.join(directory, 'base.webp'), 'image')
  writeFileSync(path.join(directory, 'layer_1.webp'), 'layer')
  writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ width: 1254, height: 1254, glassPolygon: polygon, layers: [{ file: 'layer_1.webp', blendMode: 'multiply' }] }))
  const settings = { scale: 1.2, rotation: -28, position: { x: 25, y: 40 }, blueberryCount: 0, particleColor: '#ff8b10', particleZone: pointsZone(polygon) }
  const settingsFile = path.join(directory, 'settings.json'); writeFileSync(settingsFile, JSON.stringify(settings))
  const server = createJarEditorServer({ assetsRoot: root }); server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(root, { recursive: true, force: true }) })
  const url = `http://127.0.0.1:${server.address().port}`
  const jars = (await (await fetch(url + '/api/jars')).json()).jars
  const save = (body, headers = {}) => fetch(url + '/api/jars/category%20%231/save', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
  return { root, directory, url, settingsFile, settings, jars, save }
}

test('editor polygon round trips preserve every shipped contour and derive resized bounds', () => {
  const regions = JSON.parse(readFileSync(new URL('../../scripts/jar-glass-regions.json', import.meta.url)))
  for (const [category, points] of Object.entries(regions)) {
    const restored = zonePoints(pointsZone(points))
    points.forEach((point, i) => point.forEach((value, axis) => assert.ok(Math.abs(restored[i][axis] - value) < 1e-10, category)))
  }
  assert.deepEqual(zonePoints({ x: 20, y: 40, width: 60, height: 50 }), polygon)
  assert.deepEqual(zonePoints(undefined, polygon), polygon)
  const edge = nearestEdge(polygon, [.5, .42]); assert.equal(edge.index, 0); assert.deepEqual(edge.point, [.5, .4])
  for (const points of [[], [[0, 0], [1, 1], [1, 0], [0, 1]], [[0, 0], [0, 0], [1, 1]], [[0, 0], [.5, .5], [1, 1]], [[0, 0], [2, 0], [1, 1]]]) assert.throws(() => validatePoints(points))
})

test('local editor loads aligned layer stacks and saves only particleZone atomically', async t => {
  const { directory, url, settingsFile, settings, jars, save } = await fixture(t)
  assert.equal(jars.length, 1)
  assert.deepEqual(jars[0].points, polygon)
  assert.deepEqual(jars[0].images.map(image => image.blendMode), ['normal', 'multiply'])
  assert.equal(jars[0].images[0].url, '/images/category%20%231/base.webp')
  assert.equal((await fetch(url + jars[0].images[0].url)).headers.get('content-type'), 'image/webp')
  assert.match(await (await fetch(url)).text(), /Контуры банок/)
  const edited = [[.25, .45], [.75, .4], [.8, .85], [.2, .9]]
  const response = await save({ points: edited, revision: jars[0].revision }); assert.equal(response.status, 200)
  const result = await response.json(), persisted = JSON.parse(readFileSync(settingsFile, 'utf8'))
  assert.deepEqual(persisted, { ...settings, particleZone: pointsZone(edited) })
  assert.deepEqual(result.points, zonePoints(persisted.particleZone))
  assert.notEqual(result.revision, jars[0].revision)
  assert.equal(readdirSync(directory).some(file => file.endsWith('.tmp')), false)
  assert.equal((await save({ points: polygon, revision: jars[0].revision })).status, 409)
  assert.deepEqual(JSON.parse(readFileSync(settingsFile, 'utf8')), persisted)
})

test('invalid contours, outside origins, unknown jars and external edits cannot overwrite settings', async t => {
  const { url, settingsFile, settings, jars, save } = await fixture(t)
  const before = readFileSync(settingsFile, 'utf8')
  assert.equal((await save({ points: [[0, 0], [1, 1], [1, 0], [0, 1]], revision: jars[0].revision })).status, 400)
  assert.equal((await save({ points: polygon, revision: jars[0].revision }, { Origin: 'https://example.com' })).status, 403)
  const outsideHostStatus = await new Promise((resolve, reject) => {
    const req = request(url + '/api/jars', { headers: { Host: 'example.com' } }, response => { response.resume(); resolve(response.statusCode) })
    req.on('error', reject); req.end()
  })
  assert.equal(outsideHostStatus, 403)
  assert.equal((await fetch(url + '/api/jars/unknown/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 404)
  assert.equal((await fetch(url + '/images/category%20%231/settings.json')).status, 404)
  assert.equal(readFileSync(settingsFile, 'utf8'), before)
  const external = { ...settings, particleColor: '#00aaff' }; writeFileSync(settingsFile, JSON.stringify(external))
  assert.equal((await save({ points: polygon, revision: jars[0].revision })).status, 409)
  assert.deepEqual(JSON.parse(readFileSync(settingsFile, 'utf8')), external)
})
