import { readdirSync, readFileSync, existsSync, statSync, createReadStream, openSync, readSync, closeSync } from 'node:fs'
import { pipeline } from 'node:stream'
import path from 'node:path'
import { createMobileJar } from './mobile-jars.mjs'
import { readMediaDimensions, readImagePreview, readVideoPreview } from './media-dimensions.mjs'

const moduleId = 'virtual:portfolio-assets'
const resolvedId = '\0' + moduleId
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
const supported = /\.(jpe?g|png|webp|svg|gif|avif|mp4)$/i
const folderTitle = name => name.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()

function projectFolder(name) {
  const suffix = /#(\d+)\s*$/.exec(name)
  const number = suffix ? Number(suffix[1]) : NaN
  const ordered = Number.isSafeInteger(number) && number > 0
  const title = folderTitle(ordered ? name.slice(0, suffix.index) : name)
  return { order: ordered ? number : Infinity, title: title || folderTitle(name) }
}

function compareProjects(first, second) {
  const a = projectFolder(first.name).order
  const b = projectFolder(second.name).order
  return (a === b ? 0 : a < b ? -1 : 1)
    || collator.compare(first.name, second.name)
    || first.name.localeCompare(second.name)
}

function mediaPriority(name) {
  const stem = path.basename(name, path.extname(name))
  const numbers = [...stem.matchAll(/#(\d+)(?=$|[\s_-])/g)]
    .map(match => Number(match[1]))
    .filter(number => Number.isSafeInteger(number) && number > 0)
  return numbers.length ? Math.min(...numbers) : undefined
}

function jarContentType(file) {
  if (!/jar/i.test(path.basename(file, path.extname(file)))) return null
  const extension = path.extname(file).toLowerCase()
  if (extension === '.png') return 'image/png'
  if (extension === '.webp') return 'image/webp'
  if (extension) return null
  // Also accept an actual PNG/WebP with no extension, such as "jar-01".
  const header = Buffer.alloc(12)
  const descriptor = openSync(file, 'r')
  try { readSync(descriptor, header, 0, header.length, 0) } finally { closeSync(descriptor) }
  if (header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

function entries(directory, watched) {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) return []
  watched.add(directory)
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => !entry.name.startsWith('.'))
    .sort((a, b) => collator.compare(a.name, b.name) || a.name.localeCompare(b.name))
}

// Encode each segment so spaces, Cyrillic, # and % work on GitHub Pages.
const assetPath = (...segments) => ['assets', ...segments].map(encodeURIComponent).join('/')

function readJarSettings(directory, watched) {
  const file = path.join(directory, 'settings.json')
  watched.add(file)
  if (!existsSync(file)) return {}
  const fail = message => { throw new Error(`${file}: ${message}`) }
  let settings
  try { settings = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) }
  catch { fail('invalid JSON') }
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  if (!isObject(settings)) fail('settings must be an object')
  const validators = {
    scale: value => Number.isFinite(value) && value > 0,
    blueberryCount: value => value === null || Number.isSafeInteger(value) && value >= 0,
    blueberrySize: value => Number.isFinite(value) && value > 0,
    particleSize: value => Number.isFinite(value) && value > 0,
    particleColor: value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value),
    rotation: value => Number.isFinite(value),
    seed: value => Number.isSafeInteger(value) && value >= 0,
    particleCount: value => Number.isSafeInteger(value) && value >= 0,
  }
  for (const [key, value] of Object.entries(settings)) {
    if (key === 'particleZone') {
      if (!isObject(value)) fail('particleZone must be an object with x, y, width and height in percent')
      for (const field of Object.keys(value)) if (!['x', 'y', 'width', 'height', 'polygon'].includes(field)) fail(`unknown particleZone.${field}`)
      for (const field of ['x', 'y', 'width', 'height']) {
        const number = value[field]
        if (!Number.isFinite(number) || number < 0 || number > 100 || (['width', 'height'].includes(field) && number === 0)) fail(`invalid particleZone.${field}: position must be 0–100 and size must be greater than 0, up to 100`)
      }
      if (value.x + value.width > 100 + 1e-9 || value.y + value.height > 100 + 1e-9) fail('particleZone must fit within the jar image (x + width and y + height must be at most 100)')
      if (value.polygon !== undefined && !(Array.isArray(value.polygon) && value.polygon.length >= 3 && value.polygon.every(point => Array.isArray(point) && point.length === 2 && point.every(coordinate => Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1)))) fail('invalid particleZone.polygon: use at least 3 [x, y] points in the range 0–1, relative to the zone')
    } else if (key === 'indexAnchor') {
      if (!isObject(value)) fail('indexAnchor must be an object with x/y coordinates in percent of the jar image')
      for (const axis of Object.keys(value)) if (!['x', 'y'].includes(axis)) fail(`unknown indexAnchor.${axis}`)
      for (const axis of ['x', 'y']) if (!Number.isFinite(value[axis])) fail(`indexAnchor.${axis} must be a finite number (percent of the jar image)`)
    } else if (key === 'position' || key === 'mobilePosition') {
      if (!isObject(value)) fail(`${key} must be an object with x/y coordinates in percent`)
      for (const [axis, coordinate] of Object.entries(value)) {
        if (!['x', 'y'].includes(axis) || !Number.isFinite(coordinate) || coordinate < 0 || coordinate > 100) fail(`${key}.${axis} must be a number from 0 to 100`)
      }
    } else if (!Object.hasOwn(validators, key)) {
      fail(`unknown setting "${key}"`)
    } else if (!validators[key](value)) {
      fail(`invalid ${key}: sizes/scale must be positive numbers, rotation must be finite, counts/seed must be nonnegative integers (blueberryCount also accepts null), particleColor must be #RRGGBB`)
    }
  }
  return settings
}

function readCopyright(directory, watched) {
  const file = path.join(directory, 'copyright.json')
  watched.add(file)
  if (!existsSync(file)) return undefined
  const fail = message => { throw new Error(`${file}: ${message}`) }
  let settings
  try { settings = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) }
  catch { fail('invalid JSON') }
  if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) fail('copyright must be an object')
  for (const key of Object.keys(settings)) if (!['text', 'font', 'size', 'color'].includes(key)) fail(`unknown setting "${key}"`)
  if (typeof settings.text !== 'string') fail('text must be a string')
  if (settings.font !== undefined && (typeof settings.font !== 'string' || !settings.font.trim())) fail('font must be a nonempty font family string')
  if (settings.size !== undefined && (!Number.isFinite(settings.size) || settings.size <= 0)) fail('size must be a positive number in pixels')
  if (settings.color !== undefined && (typeof settings.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(settings.color))) fail('color must be #RRGGBB')
  return settings
}

export function scanPortfolio(root) {
  const watched = new Set()
  const warnings = []
  const categories = []
  for (const category of entries(root, watched).filter(entry => entry.isDirectory())) {
    const directory = path.join(root, category.name)
    watched.add(directory)
    const jarDirectory = path.join(directory, 'jar')
    const layerFiles = entries(jarDirectory, watched).filter(entry => entry.isFile())
    const base = layerFiles.find(entry => entry.name === 'base.webp')
    let jarLayers = []
    let glassPolygon
    if (base) {
      const manifestFile = path.join(jarDirectory, 'manifest.json')
      let metadata = []
      if (existsSync(manifestFile)) {
        watched.add(manifestFile)
        try {
          const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
          metadata = manifest.layers ?? []
          if (manifest.glassPolygon !== undefined) {
            const points = manifest.glassPolygon
            if (Array.isArray(points) && points.length >= 3 && points.every(point => Array.isArray(point) && point.length === 2 && point.every(value => Number.isFinite(value) && value >= 0 && value <= 1))) glassPolygon = points
            else warnings.push(`assets/${category.name}/jar: invalid glassPolygon; using a conservative glass region.`)
          }
        }
        catch { warnings.push(`assets/${category.name}/jar: invalid manifest.json; using normal blend modes.`) }
        if (!Array.isArray(metadata)) metadata = []
      }
      const blends = new Set(['normal', 'multiply', 'lighten', 'luminosity', 'color-burn'])
      jarLayers = layerFiles.filter(entry => /^layer_\d+\.webp$/i.test(entry.name)).map(entry => {
        const layer = metadata.find(layer => layer?.file === entry.name)
        const blendMode = layer?.blendMode ?? 'normal'
        const placement = layer?.placement
        const validPlacement = placement === 'interior' || placement === 'foreground'
        if (placement !== undefined && !validPlacement) warnings.push(`assets/${category.name}/jar/${entry.name}: unsupported placement ${placement}; using foreground.`)
        if (!blends.has(blendMode)) warnings.push(`assets/${category.name}/jar/${entry.name}: unsupported blend mode ${blendMode}; using normal.`)
        watched.add(path.join(jarDirectory, entry.name))
        return { path: assetPath(category.name, 'jar', entry.name), blendMode: blends.has(blendMode) ? blendMode : 'normal', ...(validPlacement ? { placement } : {}) }
      })
      watched.add(path.join(jarDirectory, base.name))
    }
    const jarFiles = entries(directory, watched)
      .filter(entry => entry.isFile() && /jar/i.test(path.basename(entry.name, path.extname(entry.name))))
      .filter(entry => {
        const file = path.join(directory, entry.name)
        watched.add(file)
        return jarContentType(file)
      })
    const jar = jarFiles.find(entry => /^jar\.webp$/i.test(entry.name))
      ?? jarFiles.find(entry => /^jar\.png$/i.test(entry.name))
      ?? jarFiles[0]
    if (!base && !jar) {
      warnings.push(`assets/${category.name}: missing jar/base.webp or PNG/WebP image with "jar" in its name; category skipped.`)
      continue
    }
    if (!base && jarFiles.length > 1) warnings.push(`assets/${category.name}: multiple jar images found; using ${jar.name}.`)
    const worksRoot = path.join(directory, 'works')
    const projects = entries(worksRoot, watched).filter(entry => entry.isDirectory()).sort(compareProjects).map(project => {
      const projectDirectory = path.join(worksRoot, project.name)
      const readMedia = (directory, segments) => entries(directory, watched)
        .filter(entry => entry.isFile() && supported.test(entry.name))
        .map(entry => {
          watched.add(path.join(directory, entry.name))
          const priority = mediaPriority(entry.name)
          return {
            name: entry.name,
            path: assetPath(category.name, 'works', project.name, ...segments, entry.name),
            kind: /\.mp4$/i.test(entry.name) ? 'video' : 'image',
            ...(priority !== undefined ? { priority } : {}),
          }
        })
      const sections = entries(projectDirectory, watched)
        .filter(entry => entry.isDirectory() && /^section_\d+$/i.test(entry.name))
        .map(section => ({
          id: section.name,
          media: readMedia(path.join(projectDirectory, section.name), [section.name]),
        }))
      // Existing projects remain visible while their files are being organized.
      const looseMedia = readMedia(projectDirectory, [])
      if (looseMedia.length) sections.unshift({ id: 'loose', media: looseMedia })
      const copyright = readCopyright(projectDirectory, watched)
      return { id: project.name, title: projectFolder(project.name).title, sections, media: sections.flatMap(section => section.media), ...(copyright !== undefined ? { copyright } : {}) }
    })
    const jarSettings = readJarSettings(jarDirectory, watched)
    categories.push({ id: category.name, title: folderTitle(category.name), jarPath: base ? assetPath(category.name, 'jar', base.name) : assetPath(category.name, jar.name), jarLayers, glassPolygon, jarSettings, projects })
  }
  return { categories, watched: [...watched], warnings }
}

export async function scanPortfolioWithDimensions(root, { previews = false } = {}) {
  const catalog = scanPortfolio(root)
  // Section and fullscreen lists share these objects, so enrich each only once.
  const media = catalog.categories.flatMap(category => category.projects.flatMap(project => project.media))
  // Bound concurrent header reads for large archives.
  let next = 0
  await Promise.all(Array.from({ length: Math.min(8, media.length) }, async () => {
    while (next < media.length) {
      const item = media[next++]
      const file = path.join(root, ...item.path.split('/').slice(1).map(decodeURIComponent))
      Object.assign(item, await readMediaDimensions(file, item.kind))
      if (previews) item.preview = await (item.kind === 'video' ? readVideoPreview(file) : readImagePreview(file))
    }
  }))
  return catalog
}

// Vite's default static middleware leaves encoded # characters undecoded.
// Serve catalog assets consistently in dev/preview, including MP4 seeking.
export function servePortfolioAssets(root, base = '/') {
  const prefix = base + 'assets/'
  const mime = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.avif': 'image/avif', '.mp4': 'video/mp4' }
  return (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) || !req.url?.startsWith(prefix)) return next()
    let file
    try { file = path.resolve(root, decodeURIComponent(req.url.split('?')[0].slice(prefix.length))) } catch { return next() }
    const relative = path.relative(root, file)
    if (relative.startsWith('..') || path.isAbsolute(relative)) return next()
    if (!existsSync(file) || !statSync(file).isFile()) return next()
    const contentType = mime[path.extname(file).toLowerCase()] ?? jarContentType(file)
    if (!contentType) return next()
    const { size, mtime } = statSync(file)
    let start = 0
    let end = size - 1
    if (req.headers.range) {
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range)
      if (!range || (!range[1] && !range[2])) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end() }
      start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
      end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1
      if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end() }
      res.statusCode = 206
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
    }
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Length', Math.max(0, end - start + 1))
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Last-Modified', mtime.toUTCString())
    res.setHeader('Cache-Control', 'no-cache')
    if (req.method === 'HEAD' || size === 0) return res.end()
    pipeline(createReadStream(file, { start, end }), res, () => {})
  }
}

export default function portfolioAssets() {
  let assetsRoot
  let base
  let development = false
  const mobileImages = new Map()
  return {
    name: 'portfolio-assets',
    configResolved(config) { assetsRoot = path.join(config.publicDir, 'assets'); base = config.base; development = config.command === 'serve' },
    resolveId(id) { if (id === moduleId) return resolvedId },
    async load(id) {
      if (id !== resolvedId) return
      const catalog = await scanPortfolioWithDimensions(assetsRoot, { previews: true })
      for (const [index, category] of catalog.categories.entries()) {
        const image = await createMobileJar(assetsRoot, category, index)
        category.mobileJar = { path: image.fileName, width: image.width, height: image.height }
        if (development) mobileImages.set(base + image.fileName, image.source)
        else this.emitFile({ type: 'asset', fileName: image.fileName, source: image.source })
      }
      for (const file of catalog.watched) this.addWatchFile(file)
      this.addWatchFile(path.dirname(assetsRoot))
      for (const warning of catalog.warnings) this.warn(warning)
      return `export default ${JSON.stringify(catalog.categories)}`
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const image = mobileImages.get(req.url?.split('?')[0])
        if (!image || !['GET', 'HEAD'].includes(req.method)) return next()
        res.setHeader('Content-Type', 'image/webp')
        res.setHeader('Content-Length', image.length)
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        res.end(req.method === 'HEAD' ? undefined : image)
      })
      server.middlewares.use(servePortfolioAssets(assetsRoot, base))
      server.watcher.add(assetsRoot)
      const refresh = (event, file) => {
        const relative = path.relative(assetsRoot, file)
        if (relative.startsWith('..') || path.isAbsolute(relative)) return
        const module = server.moduleGraph.getModuleById(resolvedId)
        if (module) server.moduleGraph.invalidateModule(module)
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('all', refresh)
      server.httpServer?.once('close', () => server.watcher.off('all', refresh))
    },
    configurePreviewServer(server) {
      server.middlewares.use(servePortfolioAssets(path.resolve(server.config.root, server.config.build.outDir, 'assets'), base))
    },
  }
}
