import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { scanPortfolio } from './portfolio-assets.mjs'
import ts from 'typescript'

async function jarData(catalog) {
  const source = readFileSync(new URL('../src/data.ts', import.meta.url), 'utf8')
    .replace("import catalog from 'virtual:portfolio-assets'", `const catalog = ${JSON.stringify(catalog)}`)
    .replace('import.meta.env.BASE_URL', "'/repo/'")
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))
}

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nika-assets-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const file = relative => {
    const target = path.join(root, relative)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, 'fixture')
  }
  return { root, file }
}

test('discovers folders and mixed media in natural order, preserving folder titles', t => {
  const { root, file } = fixture(t)
  file('packaging/jar.webp')
  for (const name of ['10.png', '2.JPG', '1.jpeg', '3.MP4', 'notes.txt', '4.psd', '.hidden.png']) file(`packaging/works/media expert/${name}`)
  file('illustration/jar.webp')
  file('packaging/works/project 10/1.png')
  file('packaging/works/project 2/1.png')
  const result = scanPortfolio(root)
  assert.deepEqual(result.categories.map(category => category.title), ['illustration', 'packaging'])
  const projects = result.categories[1].projects
  assert.deepEqual(projects.map(project => project.title), ['media expert', 'project 2', 'project 10'])
  assert.deepEqual(projects[0].media.map(media => media.name), ['1.jpeg', '2.JPG', '3.MP4', '10.png'])
  assert.deepEqual(projects[0].media.map(media => media.kind), ['image', 'image', 'video', 'image'])
  assert.deepEqual(projects[0].sections.map(section => section.id), ['loose'])
})

test('sections contain all supported works, sort numerically and preserve encoded paths', t => {
  const { root, file } = fixture(t)
  file('digital/jar.webp')
  for (const name of ['10.png', '2.JPG', '1.svg', '3.MP4', '4.webp', '5.gif', '6.avif', 'notes.txt']) file(`digital/works/project #1/section_2/${name}`)
  file('digital/works/project #1/section_10/50% #2.png')
  file('digital/works/project #1/section_1/.gitkeep')
  file('digital/works/project #1/.section_3/hidden.png')
  file('digital/works/project #1/notes/ignored.jpg')
  file('digital/works/project #1/section_2/nested/ignored.png')
  const { categories, watched } = scanPortfolio(root)
  const project = categories[0].projects[0]
  assert.deepEqual(project.sections.map(section => section.id), ['section_1', 'section_2', 'section_10'])
  assert.deepEqual(project.sections[0].media, [])
  assert.deepEqual(project.sections[1].media.map(media => media.name), ['1.svg', '2.JPG', '3.MP4', '4.webp', '5.gif', '6.avif', '10.png'])
  assert.equal(project.media.length, 8)
  assert.equal(project.sections[2].media[0].path, 'assets/digital/works/project%20%231/section_10/50%25%20%232.png')
  assert.ok(watched.includes(path.join(root, 'digital/works/project #1/section_2/3.MP4')))
  assert.ok(watched.includes(path.join(root, 'digital/works/project #1/section_1')))
})

test('keeps ungrouped works visible alongside numbered sections', t => {
  const { root, file } = fixture(t)
  file('print/jar.webp')
  file('print/works/project/cover.png')
  file('print/works/project/section_1/inside.jpg')
  const project = scanPortfolio(root).categories[0].projects[0]
  assert.deepEqual(project.sections.map(section => section.id), ['loose', 'section_1'])
  assert.deepEqual(project.media.map(media => media.name), ['cover.png', 'inside.jpg'])
})

test('reads media priority tags without sorting by priority or changing paths', t => {
  const { root, file } = fixture(t)
  file('digital/jar.webp')
  const names = ['a #10.png', 'b#2.jpg', 'c #1.png', 'd #3 #1.MP4', 'e.png', 'f #0.png', 'g #2draft.png']
  for (const name of names) file(`digital/works/project #2/section_1/${name}`)
  file('digital/works/project #2/#2 cover.png')
  const project = scanPortfolio(root).categories[0].projects[0]
  assert.deepEqual(project.sections[1].media.map(media => media.name), names)
  assert.deepEqual(project.sections[1].media.map(media => media.priority), [10, 2, 1, 1, undefined, undefined, undefined])
  assert.equal(project.sections[0].media[0].priority, 2)
  assert.equal(project.sections[1].media[2].path, 'assets/digital/works/project%20%232/section_1/c%20%231.png')
  assert.equal(project.sections[1].media[3].kind, 'video')
  assert.equal(project.title, 'project')
})

test('orders projects by the trailing number, hides the suffix and preserves asset paths', t => {
  const { root, file } = fixture(t)
  file('digital/jar.webp')
  for (const name of ['Alpha', 'Beta #10', 'Zebra #1', 'Gamma#2', 'Дизайн_сайта #03']) {
    file(`digital/works/${name}/section_1/cover #1.png`)
  }
  const projects = scanPortfolio(root).categories[0].projects
  assert.deepEqual(projects.map(project => project.id), ['Zebra #1', 'Gamma#2', 'Дизайн_сайта #03', 'Beta #10', 'Alpha'])
  assert.deepEqual(projects.map(project => project.title), ['Zebra', 'Gamma', 'Дизайн сайта', 'Beta', 'Alpha'])
  assert.equal(projects[0].media[0].path, 'assets/digital/works/Zebra%20%231/section_1/cover%20%231.png')
  assert.equal(projects[3].sections[0].id, 'section_1')
})

test('project numbering is local to each category and ties have a stable order', t => {
  const { root, file } = fixture(t)
  for (const category of ['digital', 'print']) file(`${category}/jar.webp`)
  for (const name of ['Z #2', 'A #2', 'B #5']) file(`digital/works/${name}/section_1/1.png`)
  for (const name of ['Z #1', 'A #10']) file(`print/works/${name}/section_1/1.png`)
  const { categories } = scanPortfolio(root)
  assert.deepEqual(categories[0].projects.map(project => project.title), ['A', 'Z', 'B'])
  assert.deepEqual(categories[1].projects.map(project => project.title), ['Z', 'A'])
})

test('only a positive integer suffix at the end sets project order', t => {
  const { root, file } = fixture(t)
  file('print/jar.webp')
  const unordered = ['Chapter #2 draft', 'Zero #0', 'Negative #-1', 'Label #abc', 'Huge #9999999999999999999999']
  for (const name of [...unordered, 'Last #1']) file(`print/works/${name}/section_1/1.png`)
  const projects = scanPortfolio(root).categories[0].projects
  assert.equal(projects[0].title, 'Last')
  assert.deepEqual(new Set(projects.slice(1).map(project => project.title)), new Set(unordered.map(name => name.replace(/[-_]+/g, ' '))))
})

test('encodes spaces, Cyrillic and URL punctuation per path segment', t => {
  const { root, file } = fixture(t)
  file('иллюстрация #1/jar.webp')
  file('иллюстрация #1/works/media expert/50% #2.png')
  const category = scanPortfolio(root).categories[0]
  assert.equal(category.title, 'иллюстрация #1')
  assert.equal(category.projects[0].media[0].path, 'assets/' + ['иллюстрация #1', 'works', 'media expert', '50% #2.png'].map(encodeURIComponent).join('/'))
})

test('skips invalid categories with a warning; keeps empty valid categories and projects', t => {
  const { root, file } = fixture(t)
  file('missing/works/test/1.png')
  file('valid/jar.webp')
  file('valid/works/empty/.gitkeep')
  file('no works/jar.webp')
  file('.hidden/jar.webp')
  const result = scanPortfolio(root)
  assert.equal(result.warnings.length, 1)
  assert.equal(result.categories.length, 2)
  assert.deepEqual(result.categories[0].projects, [])
  assert.deepEqual(result.categories[1].projects[0].media, [])
})

test('missing root is an empty catalog', () => {
  assert.deepEqual(scanPortfolio(path.join(os.tmpdir(), 'nika-nonexistent-assets-root')).categories, [])
})

test('jar settings reach the runtime independently, including zero values and legacy jars', async t => {
  const { root, file } = fixture(t)
  file('a/jar/base.webp')
  file('b/jar.webp')
  file('a/jar/settings.json')
  const settingsFile = path.join(root, 'a/jar/settings.json')
  const settings = { scale: 1.25, rotation: 0, position: { x: 0, y: 100 }, mobilePosition: { x: 72, y: 16 }, seed: 0, particleCount: 0, blueberryCount: 0, blueberrySize: 1.5, particleSize: 2, particleColor: '#66aaff' }
  writeFileSync(settingsFile, JSON.stringify(settings))
  let result = scanPortfolio(root)
  assert.deepEqual(result.categories[0].jarSettings, settings)
  assert.deepEqual(result.categories[1].jarSettings, {})
  assert.ok(result.watched.includes(settingsFile))
  assert.ok(result.watched.includes(path.join(root, 'b/jar/settings.json')))
  const { jars } = await jarData(result.categories)
  assert.deepEqual([jars[0].scale, jars[0].rotation, jars[0].x, jars[0].y, jars[0].mobileX, jars[0].mobileY, jars[0].seed, jars[0].particleCount], [1.25, 0, 0, 100, 72, 16, 0, 0])
  assert.deepEqual([jars[0].blueberryCount, jars[0].blueberrySize, jars[0].particleSize, jars[0].particleColor], [0, 1.5, 2, '#66aaff'])
  assert.equal(jars[1].scale, 1)
  assert.equal(jars[1].particleCount, 11)
  assert.deepEqual([jars[1].blueberryCount, jars[1].blueberrySize, jars[1].particleSize, jars[1].particleColor], [undefined, undefined, 1, '#ff8b10'])
  assert.notEqual(jars[1].x, jars[0].x)
  writeFileSync(settingsFile, JSON.stringify({ rotation: -12, position: { x: 35 } }))
  result = scanPortfolio(root)
  const { jars: changed } = await jarData(result.categories)
  assert.equal(changed[0].rotation, -12)
  assert.equal(changed[0].x, 35)
  assert.notEqual(changed[0].y, 100)
  assert.equal(changed[0].scale, 1)
  assert.deepEqual(changed[1], jars[1])
  writeFileSync(settingsFile, JSON.stringify({ blueberryCount: null }))
  assert.equal((await jarData(scanPortfolio(root).categories)).jars[0].blueberryCount, undefined)
})

test('invalid jar settings stop the build with the file and field in the error', t => {
  const { root, file } = fixture(t)
  file('print/jar/base.webp')
  file('print/jar/settings.json')
  const settingsFile = path.join(root, 'print/jar/settings.json')
  for (const [contents, message] of [
    ['{', /invalid JSON/], ['null', /must be an object/], ['[]', /must be an object/],
    ['{"scale":0}', /invalid scale/], ['{"scale":"1"}', /invalid scale/],
    ['{"rotation":null}', /invalid rotation/], ['{"rotation":1e999}', /invalid rotation/],
    ['{"position":{"x":101}}', /position.x/], ['{"mobilePosition":{"y":-1}}', /mobilePosition.y/],
    ['{"position":null}', /position must be an object/], ['{"position":{"z":50}}', /position.z/],
    ['{"seed":0.5}', /invalid seed/], ['{"particleCount":-1}', /invalid particleCount/],
    ['{"blueberryCount":1.5}', /invalid blueberryCount/], ['{"blueberryCount":-1}', /invalid blueberryCount/],
    ['{"blueberrySize":0}', /invalid blueberrySize/], ['{"blueberrySize":"1"}', /invalid blueberrySize/],
    ['{"particleSize":-1}', /invalid particleSize/], ['{"particleColor":"red"}', /invalid particleColor/],
    ['{"particleColor":"#gggggg"}', /invalid particleColor/],
    ['{"scalle":1}', /unknown setting/],
  ]) {
    writeFileSync(settingsFile, contents)
    assert.throws(() => scanPortfolio(root), error => error.message.includes(settingsFile) && message.test(error.message), contents)
  }
  writeFileSync(settingsFile, '\uFEFF{"scale":1}')
  assert.deepEqual(scanPortfolio(root).categories[0].jarSettings, { scale: 1 })
})

test('particle zone settings reach the runtime at build time and are validated', async t => {
  const { root, file } = fixture(t)
  file('print/jar/base.webp')
  const settingsFile = path.join(root, 'print/jar/settings.json')
  const zone = { x: 18, y: 45, width: 63, height: 45, polygon: [[0, 0], [1, 0], [1, 1], [0, 1]] }
  writeFileSync(settingsFile, JSON.stringify({ particleZone: zone }))
  let result = scanPortfolio(root)
  assert.ok(result.watched.includes(settingsFile))
  assert.deepEqual((await jarData(result.categories)).jars[0].particleZone, zone)
  const changed = { x: 25, y: 50, width: 50, height: 30 }
  writeFileSync(settingsFile, JSON.stringify({ particleZone: changed }))
  result = scanPortfolio(root)
  assert.deepEqual((await jarData(result.categories)).jars[0].particleZone, changed)
  for (const invalid of [null, [], {}, { ...zone, x: -1 }, { ...zone, y: '45' }, { ...zone, width: 0 }, { ...zone, height: 101 }, { ...zone, x: 50 }, { ...zone, y: 70 }, { ...zone, unknown: 1 }, { ...zone, polygon: [] }, { ...zone, polygon: [[0, 0], [1, 0], [1, 2]] }]) {
    writeFileSync(settingsFile, JSON.stringify({ particleZone: invalid }))
    assert.throws(() => scanPortfolio(root), error => error.message.includes(settingsFile) && error.message.includes('particleZone'))
  }
  writeFileSync(settingsFile, '{}')
  assert.equal((await jarData(scanPortfolio(root).categories)).jars[0].particleZone, undefined)
})

test('all shipped jars have valid editable settings that reach the runtime', async () => {
  const root = fileURLToPath(new URL('../public/assets/', import.meta.url))
  const result = scanPortfolio(root)
  assert.deepEqual(result.warnings, [])
  for (const category of result.categories) {
    const settings = JSON.parse(readFileSync(path.join(root, category.id, 'jar/settings.json'), 'utf8'))
    assert.deepEqual(category.jarSettings, settings)
  }
  const { jars } = await jarData(result.categories)
  for (const [index, category] of result.categories.entries()) {
    const settings = category.jarSettings
    const jar = jars[index]
    for (const key of ['scale', 'rotation', 'seed', 'particleCount', 'blueberrySize', 'particleSize', 'particleColor']) if (settings[key] !== undefined) assert.equal(jar[key], settings[key], `${category.id}: ${key}`)
    assert.equal(jar.blueberryCount, settings.blueberryCount ?? undefined)
    assert.deepEqual(jar.particleZone, settings.particleZone, `${category.id}: particle zone must come from settings`)
    for (const [group, prefix] of [['position', ''], ['mobilePosition', 'mobile']]) {
      for (const axis of ['x', 'y']) if (settings[group]?.[axis] !== undefined) assert.equal(jar[prefix ? prefix + axis.toUpperCase() : axis], settings[group][axis], `${category.id}: ${group}.${axis}`)
    }
  }
})

test('prefers layered jars, sorts foregrounds numerically and watches their blend metadata', t => {
  const { root, file } = fixture(t)
  for (const name of ['base.webp', 'layer_10.webp', 'layer_2.webp', 'layer_1.webp', 'preview.webp', 'layer_notes.webp']) file(`print/jar/${name}`)
  file('print/jar-1.webp')
  file('print/works/posters/1.png')
  file('print/jar/manifest.json')
  writeFileSync(path.join(root, 'print/jar/manifest.json'), JSON.stringify({ layers: [{ file: 'layer_2.webp', blendMode: 'multiply' }] }))
  const result = scanPortfolio(root)
  assert.equal(result.categories[0].jarPath, 'assets/print/jar/base.webp')
  assert.deepEqual(result.categories[0].jarLayers, [
    { path: 'assets/print/jar/layer_1.webp', blendMode: 'normal' },
    { path: 'assets/print/jar/layer_2.webp', blendMode: 'multiply' },
    { path: 'assets/print/jar/layer_10.webp', blendMode: 'normal' },
  ])
  for (const name of ['base.webp', 'layer_1.webp', 'layer_2.webp', 'layer_10.webp', 'manifest.json']) assert.ok(result.watched.includes(path.join(root, 'print/jar', name)))
  assert.equal(result.categories[0].projects.length, 1)
  assert.deepEqual(result.warnings, [])
})

test('layer metadata is optional; invalid metadata warns and falls back to normal', t => {
  const { root, file } = fixture(t)
  file('category #1/jar/base.webp')
  file('category #1/jar/layer_1.webp')
  assert.deepEqual(scanPortfolio(root).categories[0].jarLayers, [{ path: 'assets/category%20%231/jar/layer_1.webp', blendMode: 'normal' }])
  file('category #1/jar/manifest.json')
  let result = scanPortfolio(root)
  assert.equal(result.warnings.length, 1)
  assert.equal(result.categories[0].jarLayers[0].blendMode, 'normal')
  writeFileSync(path.join(root, 'category #1/jar/manifest.json'), JSON.stringify({ layers: [{ file: 'layer_1.webp', blendMode: 'unknown' }] }))
  result = scanPortfolio(root)
  assert.equal(result.warnings.length, 1)
  assert.equal(result.categories[0].jarLayers[0].blendMode, 'normal')
})

test('interior placement and PSD blend modes reach jar rendering data; legacy layers stay in front', async t => {
  const { root, file } = fixture(t)
  for (const name of ['base.webp', 'layer_1.webp', 'layer_2.webp', 'layer_3.webp']) file(`print/jar/${name}`)
  const manifest = path.join(root, 'print/jar/manifest.json')
  writeFileSync(manifest, JSON.stringify({ layers: [
    { file: 'layer_1.webp', blendMode: 'color-burn', placement: 'interior' },
    { file: 'layer_2.webp', blendMode: 'luminosity', placement: 'foreground' },
  ] }))
  const result = scanPortfolio(root)
  assert.deepEqual(result.warnings, [])
  const { jars } = await jarData(result.categories)
  assert.deepEqual(jars[0].layers.map(({ placement, blendMode }) => ({ placement, blendMode })), [
    { placement: 'interior', blendMode: 'color-burn' },
    { placement: 'foreground', blendMode: 'luminosity' },
    { placement: undefined, blendMode: 'normal' },
  ])
  writeFileSync(manifest, JSON.stringify({ layers: [{ file: 'layer_1.webp', placement: 'unknown' }] }))
  const fallback = scanPortfolio(root)
  assert.match(fallback.warnings[0], /unsupported placement/)
  assert.equal(fallback.categories[0].jarLayers[0].placement, undefined)
})

test('reads normalized glass geometry from the jar manifest and rejects invalid coordinates', t => {
  const { root, file } = fixture(t)
  file('print/jar/base.webp')
  file('print/jar/manifest.json')
  const polygon = [[.2, .5], [.8, .5], [.8, .9], [.2, .9]]
  const manifestPath = path.join(root, 'print/jar/manifest.json')
  writeFileSync(manifestPath, JSON.stringify({ glassPolygon: polygon }))
  assert.deepEqual(scanPortfolio(root).categories[0].glassPolygon, polygon)
  writeFileSync(manifestPath, JSON.stringify({ glassPolygon: [[0, .5], [1.5, .8], [.5, .9]] }))
  const result = scanPortfolio(root)
  assert.equal(result.categories[0].glassPolygon, undefined)
  assert.match(result.warnings[0], /invalid glassPolygon/)
})

test('incomplete layered jar falls back to a legacy image or skips the category', t => {
  const { root, file } = fixture(t)
  file('legacy/jar/layer_1.webp')
  file('legacy/jar.webp')
  file('missing/jar/layer_1.webp')
  const result = scanPortfolio(root)
  assert.equal(result.categories[0].jarPath, 'assets/legacy/jar.webp')
  assert.deepEqual(result.categories[0].jarLayers, [])
  assert.equal(result.warnings.length, 1)
})

test('accepts PNG/WebP with jar anywhere in the name, case-insensitively', t => {
  const { root, file } = fixture(t)
  file('packaging/jar-01.png')
  file('illustration/my JAR final.WEBP')
  file('objects/JAR.PNG')
  const result = scanPortfolio(root)
  assert.deepEqual(result.categories.map(category => category.jarPath), [
    'assets/illustration/my%20JAR%20final.WEBP', 'assets/objects/JAR.PNG', 'assets/packaging/jar-01.png',
  ])
  assert.deepEqual(result.warnings, [])
})

test('prefers jar.webp, then jar.png, then the naturally first matching filename', t => {
  const { root, file } = fixture(t)
  for (const name of ['jar-10.png', 'jar-2.webp', 'jar.png', 'jar.webp']) file(`packaging/${name}`)
  assert.equal(scanPortfolio(root).categories[0].jarPath, 'assets/packaging/jar.webp')
  rmSync(path.join(root, 'packaging/jar.webp'))
  assert.equal(scanPortfolio(root).categories[0].jarPath, 'assets/packaging/jar.png')
  rmSync(path.join(root, 'packaging/jar.png'))
  const result = scanPortfolio(root)
  assert.equal(result.categories[0].jarPath, 'assets/packaging/jar-2.webp')
  assert.match(result.warnings[0], /using jar-2.webp/)
})

test('accepts extensionless jar images by signature and rejects non-image files', t => {
  const { root, file } = fixture(t)
  file('png/jar-01')
  writeFileSync(path.join(root, 'png/jar-01'), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  file('webp/jar-02')
  writeFileSync(path.join(root, 'webp/jar-02'), Buffer.from('RIFF0000WEBP'))
  file('invalid/jar-03')
  file('invalid/jar.txt')
  file('invalid/jar.mp4')
  file('invalid/photo.png')
  file('invalid/.jar.png')
  file('invalid/works/jar.png')
  const result = scanPortfolio(root)
  assert.deepEqual(result.categories.map(category => category.jarPath), ['assets/png/jar-01', 'assets/webp/jar-02'])
  assert.equal(result.warnings.length, 1)
})

test('new and removed categories are reflected in the next scan, with no hardcoded limit', t => {
  const { root, file } = fixture(t)
  for (let index = 1; index <= 15; index++) file(`category ${index}/jar.webp`)
  assert.equal(scanPortfolio(root).categories.length, 15)
  rmSync(path.join(root, 'category 2'), { recursive: true })
  assert.equal(scanPortfolio(root).categories.length, 14)
  assert.ok(scanPortfolio(root).watched.includes(root))
})

test('local preview serves encoded names, video byte ranges and rejects escaping paths', async t => {
  const { createServer } = await import('node:http')
  const { servePortfolioAssets } = await import('./portfolio-assets.mjs')
  const { root, file } = fixture(t)
  file('тест #2/works/media expert/50% #1.png')
  file('packaging/works/project/movie.mp4')
  file('packaging/jar-01')
  writeFileSync(path.join(root, 'packaging/jar-01'), Buffer.from('RIFF0000WEBP'))
  const middleware = servePortfolioAssets(root, '/repo/')
  const server = createServer((req, res) => middleware(req, res, () => { res.writeHead(404); res.end() }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}/repo/assets/`
  const response = await fetch(base + ['тест #2', 'works', 'media expert', '50% #1.png'].map(encodeURIComponent).join('/'))
  assert.equal(response.headers.get('content-type'), 'image/png')
  assert.equal(await response.text(), 'fixture')
  const jar = await fetch(base + 'packaging/jar-01')
  assert.equal(jar.headers.get('content-type'), 'image/webp')
  assert.equal(await jar.text(), 'RIFF0000WEBP')
  const range = await fetch(base + 'packaging/works/project/movie.mp4', { headers: { Range: 'bytes=1-3' } })
  assert.equal(range.status, 206)
  assert.equal(range.headers.get('content-range'), 'bytes 1-3/7')
  assert.equal(await range.text(), 'ixt')
  assert.equal((await fetch(base + 'packaging/works/project/movie.mp4', { headers: { Range: 'bytes=99-' } })).status, 416)
  assert.equal((await fetch(base + '%2e%2e%2fsecret.png')).status, 404)
})
