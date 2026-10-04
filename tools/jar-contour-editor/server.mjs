import { createServer } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile, rename, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { scanPortfolio } from '../../scripts/portfolio-assets.mjs'
import { pointsZone, zonePoints } from './geometry.mjs'

const directory = path.dirname(fileURLToPath(import.meta.url))
const defaultAssets = path.resolve(directory, '../../public/assets')
const revision = text => createHash('sha256').update(text).digest('hex')
const staticFiles = new Map([['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/geometry.mjs', ['geometry.mjs', 'text/javascript']], ['/styles.css', ['styles.css', 'text/css']]])

export function createJarEditorServer({ assetsRoot = defaultAssets } = {}) {
  let writeQueue = Promise.resolve()
  const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)) }
  const catalog = () => scanPortfolio(assetsRoot).categories.filter(category => category.jarPath.endsWith('/jar/base.webp'))
  async function settingsFor(id) {
    const file = path.join(assetsRoot, id, 'jar/settings.json')
    let text
    try { text = await readFile(file, 'utf8') } catch (error) { if (error.code !== 'ENOENT') throw error; text = '{}' }
    return { file, text, settings: JSON.parse(text.replace(/^\uFEFF/, '')), revision: revision(text) }
  }
  const server = createServer(async (req, res) => {
    try {
      const port = server.address().port
      if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(req.headers.host)) return json(res, 403, { error: 'Редактор доступен только локально.' })
      const url = new URL(req.url, `http://${req.headers.host}`)
      if (req.method === 'GET' && staticFiles.has(url.pathname)) {
        const [file, type] = staticFiles.get(url.pathname)
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' }); res.end(await readFile(path.join(directory, file))); return
      }
      if (req.method === 'GET' && url.pathname === '/api/jars') {
        const jars = await Promise.all(catalog().map(async (category, index) => {
          const current = await settingsFor(category.id)
          const manifest = JSON.parse(await readFile(path.join(assetsRoot, category.id, 'jar/manifest.json'), 'utf8'))
          return { id: category.id, title: category.title, number: String(index + 1).padStart(2, '0'), width: manifest.width, height: manifest.height,
            points: zonePoints(current.settings.particleZone, category.glassPolygon), glass: category.glassPolygon,
            revision: current.revision, settingsPath: `public/assets/${category.id}/jar/settings.json`,
            images: [{ url: `/images/${encodeURIComponent(category.id)}/base.webp`, blendMode: 'normal' }, ...category.jarLayers.map(layer => ({ url: `/images/${encodeURIComponent(category.id)}/${path.basename(layer.path)}`, blendMode: layer.blendMode }))] }
        }))
        return json(res, 200, { jars })
      }
      const imageMatch = /^\/images\/([^/]+)\/(base\.webp|layer_\d+\.webp)$/.exec(url.pathname)
      if (req.method === 'GET' && imageMatch) {
        const id = decodeURIComponent(imageMatch[1]), name = imageMatch[2]
        const category = catalog().find(item => item.id === id)
        if (!category || (name !== 'base.webp' && !category.jarLayers.some(layer => path.basename(layer.path) === name))) return json(res, 404, { error: 'Изображение не найдено.' })
        res.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'no-cache' }); res.end(await readFile(path.join(assetsRoot, id, 'jar', name))); return
      }
      const saveMatch = /^\/api\/jars\/([^/]+)\/save$/.exec(url.pathname)
      if (req.method === 'POST' && saveMatch) {
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(res, 403, { error: 'Запись разрешена только из локального редактора.' })
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) return json(res, 415, { error: 'Ожидается JSON.' })
        const id = decodeURIComponent(saveMatch[1])
        if (!catalog().some(category => category.id === id)) return json(res, 404, { error: 'Банка не найдена.' })
        const chunks = []; let size = 0
        for await (const chunk of req) { size += chunk.length; if (size > 64 * 1024) return json(res, 413, { error: 'Слишком большой запрос.' }); chunks.push(chunk) }
        let payload
        try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return json(res, 400, { error: 'Некорректный JSON.' }) }
        let zone
        try { zone = pointsZone(payload?.points) } catch (error) { return json(res, 400, { error: error.message }) }
        const save = async () => {
          const current = await settingsFor(id)
          if (payload.revision !== current.revision) return json(res, 409, { error: 'Файл изменился после открытия редактора. Обновите страницу и повторите правки.' })
          const text = JSON.stringify({ ...current.settings, particleZone: zone }, null, 2) + '\n'
          const temporary = path.join(path.dirname(current.file), `.settings-${randomUUID()}.tmp`)
          try {
            await writeFile(temporary, text, { flag: 'wx' })
            if ((await settingsFor(id)).revision !== current.revision) return json(res, 409, { error: 'Настройки изменились во время сохранения. Обновите страницу.' })
            await rename(temporary, current.file)
          } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error }) }
          return json(res, 200, { revision: revision(text), points: zonePoints(zone), particleZone: zone })
        }
        const pending = writeQueue.then(save)
        writeQueue = pending.catch(() => {})
        await pending
        return
      }
      json(res, 404, { error: 'Страница не найдена.' })
    } catch (error) {
      console.error(error)
      if (!res.headersSent) json(res, 500, { error: 'Не удалось прочитать или записать файлы. Подробности — в терминале редактора.' })
      else res.end()
    }
  })
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.JAR_EDITOR_PORT ?? 5174)
  const server = createJarEditorServer()
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Set JAR_EDITOR_PORT to another port.` : error); process.exitCode = 1 })
  server.listen(port, '127.0.0.1', () => console.log(`Jar contour editor: http://127.0.0.1:${port}\nSave writes particleZone to public/assets/<category>/jar/settings.json.\nPress Ctrl+C to stop.`))
}
