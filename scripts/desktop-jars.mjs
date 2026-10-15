import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { compositeLayer } from './mobile-jars.mjs'
import { traceGlassPixels } from '../src/jar-geometry.ts'
import { createBerryWorld } from '../src/berry-physics.ts'

const cache = new Map()

// Resolve backdrop-dependent PSD blends once. The resulting normal-alpha
// overlay reconstructs the reference appearance over the baked lower image.
// Blending against moving lights is necessarily an approximation for modes
// such as luminosity; retain the original foreground coverage where possible.
export function extractForeground(lower, full, coverage) {
  const upper = Buffer.alloc(lower.length)
  for (let i = 0; i < lower.length; i += 4) {
    const ba = lower[i + 3] / 255, fa = full[i + 3] / 255
    let alpha = coverage[i + 3] / 255
    if (!alpha) continue
    for (let c = 0; c < 3; c++) {
      const back = lower[i + c] / 255 * ba, final = full[i + c] / 255 * fa
      if (back > 0) alpha = Math.max(alpha, (back - final) / back)
      if (back < 1) alpha = Math.max(alpha, (final - back) / (1 - back))
    }
    alpha = Math.ceil(Math.min(1, alpha) * 255) / 255
    upper[i + 3] = alpha * 255
    for (let c = 0; c < 3; c++) upper[i + c] = Math.round(255 * Math.max(0, Math.min(1,
      (full[i + c] / 255 * fa - lower[i + c] / 255 * ba * (1 - alpha)) / alpha)))
  }
  return upper
}

export async function createDesktopJar(root, category, index = 0) {
  const layers = [{ path: category.jarPath, blendMode: 'normal', placement: 'interior' },
    ...category.jarLayers.filter(layer => layer.placement === 'interior'),
    ...category.jarLayers.filter(layer => layer.placement !== 'interior')]
  const inputs = await Promise.all(layers.map(layer => readFile(path.join(root, ...layer.path.split('/').slice(1).map(decodeURIComponent)))))
  const hash = createHash('sha256').update('desktop-jar-v1').update(JSON.stringify({ layers, settings: category.jarSettings, glass: category.glassPolygon, index }))
  inputs.forEach(input => hash.update(input))
  const fingerprint = hash.digest('hex').slice(0, 20)
  if (cache.get(category.id)?.fingerprint === fingerprint) return cache.get(category.id)
  const base = await sharp(inputs[0]).autoOrient().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = base.info
  const lower = Buffer.from(base.data), coverage = Buffer.alloc(lower.length)
  const contour = traceGlassPixels(base.data, width, height, category.glassPolygon)
  let full
  for (let i = 1; i < layers.length; i++) {
    const pixels = await sharp(inputs[i]).autoOrient().resize(width, height, { fit: 'fill' }).toColourspace('srgb').ensureAlpha().raw().toBuffer()
    if (layers[i].placement === 'interior') compositeLayer(lower, pixels, layers[i].blendMode)
    else {
      full ??= Buffer.from(lower)
      compositeLayer(full, pixels, layers[i].blendMode)
      compositeLayer(coverage, pixels)
    }
  }
  full ??= Buffer.from(lower)
  const upper = extractForeground(lower, full, coverage)
  const settings = category.jarSettings ?? {}
  const berries = contour ? createBerryWorld(contour, coverage, settings.seed ?? 11 + index * 13,
    { count: settings.blueberryCount ?? undefined, size: settings.blueberrySize }) : null
  const encode = pixels => sharp(pixels, { raw: { width, height, channels: 4 } }).webp({ lossless: true, effort: 6 }).toBuffer()
  const sources = await Promise.all([lower, upper, full].map(encode))
  const files = ['lower', 'upper', 'whole'].map((name, i) => ({ fileName: `desktop-jars/${fingerprint}-${name}.webp`, source: sources[i] }))
  const result = { fingerprint, files, width, height, contour, berries, originalBytes: inputs.reduce((sum, input) => sum + input.length, 0), originalImages: inputs.length }
  cache.set(category.id, result)
  return result
}
