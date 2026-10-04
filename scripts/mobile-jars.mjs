import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { particleContourForZone, particlePlacements, traceGlassPixels } from '../src/jar-geometry.ts'

const cache = new Map()
const MAX_SIZE = 512
const ENCODER_VERSION = 'mobile-jar-v1'

// The non-separable luminosity mode needs the same sRGB blending as CSS.
const luminance = color => .3 * color[0] + .59 * color[1] + .11 * color[2]
function setLuminance(color, value) {
  const delta = value - luminance(color)
  let result = color.map(channel => channel + delta)
  const low = Math.min(...result), high = Math.max(...result)
  if (low < 0) result = result.map(channel => value + (channel - value) * value / (value - low))
  if (high > 1) result = result.map(channel => value + (channel - value) * (1 - value) / (high - value))
  return result
}

export function compositeLayer(backdrop, source, mode = 'normal') {
  for (let i = 0; i < backdrop.length; i += 4) {
    const sourceAlpha = source[i + 3] / 255
    if (!sourceAlpha) continue
    const backAlpha = backdrop[i + 3] / 255
    const alpha = sourceAlpha + backAlpha * (1 - sourceAlpha)
    const back = [backdrop[i] / 255, backdrop[i + 1] / 255, backdrop[i + 2] / 255]
    const front = [source[i] / 255, source[i + 1] / 255, source[i + 2] / 255]
    const blend = mode === 'luminosity' ? setLuminance(back, luminance(front)) : front.map((channel, j) => {
      if (mode === 'multiply') return back[j] * channel
      if (mode === 'lighten') return Math.max(back[j], channel)
      if (mode === 'color-burn') return back[j] === 1 ? 1 : channel === 0 ? 0 : 1 - Math.min(1, (1 - back[j]) / channel)
      return channel
    })
    for (let j = 0; j < 3; j++) backdrop[i + j] = Math.round(255 * (
      sourceAlpha * ((1 - backAlpha) * front[j] + backAlpha * blend[j]) +
      (1 - sourceAlpha) * backAlpha * back[j]
    ) / alpha)
    backdrop[i + 3] = Math.round(alpha * 255)
  }
}

const sourceFile = (root, asset) => path.join(root, ...asset.split('/').slice(1).map(decodeURIComponent))

export async function createMobileJar(root, category, index = 0) {
  const layers = [
    { path: category.jarPath, blendMode: 'normal' },
    ...category.jarLayers.filter(layer => layer.placement === 'interior'),
    ...category.jarLayers.filter(layer => layer.placement !== 'interior'),
  ]
  const inputs = await Promise.all(layers.map(layer => readFile(sourceFile(root, layer.path))))
  const hash = createHash('sha256').update(ENCODER_VERSION).update(JSON.stringify({ layers, settings: category.jarSettings, glass: category.glassPolygon, index }))
  inputs.forEach(input => hash.update(input))
  const fingerprint = hash.digest('hex').slice(0, 20)
  if (cache.has(category.id) && cache.get(category.id).fingerprint === fingerprint) return cache.get(category.id)

  const base = await sharp(inputs[0]).autoOrient().resize({ width: MAX_SIZE, height: MAX_SIZE, fit: 'inside', withoutEnlargement: true }).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = base.info
  const pixels = Buffer.from(base.data)
  const settings = category.jarSettings ?? {}
  const contour = settings.particleZone
    ? particleContourForZone({ width, height }, settings.particleZone)
    : traceGlassPixels(base.data, width, height, category.glassPolygon)
  let lightsAdded = false
  const addStaticLights = async () => {
    if (lightsAdded) return
    lightsAdded = true
    if (!contour || (settings.particleCount ?? 11) === 0) return
    const color = settings.particleColor ?? '#ff8b10'
    const amber = color.toLowerCase() === '#ff8b10'
    const lights = particlePlacements(contour, settings.seed ?? 11 + index * 13, settings.particleCount ?? 11, settings.particleSize ?? 1)
      .filter(Boolean).map(({ x, y, radius }) => `<circle cx="${x}" cy="${y}" r="${radius}" fill="url(#glow)"/>`).join('')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><radialGradient id="glow"><stop stop-color="${amber ? '#fffbb0' : '#ffffff'}"/><stop offset=".19" stop-color="${amber ? '#ffe13e' : color}" stop-opacity=".85"/><stop offset=".46" stop-color="${color}" stop-opacity=".5"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient><clipPath id="body"><path d="${contour.path}"/></clipPath></defs><g clip-path="url(#body)" opacity=".68">${lights}</g></svg>`
    const lightPixels = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer()
    compositeLayer(pixels, lightPixels)
  }
  for (let i = 1; i < layers.length; i++) {
    if (layers[i].placement !== 'interior') await addStaticLights()
    const layer = await sharp(inputs[i]).autoOrient().resize(width, height, { fit: 'fill' }).toColourspace('srgb').ensureAlpha().raw().toBuffer()
    compositeLayer(pixels, layer, layers[i].blendMode)
  }
  await addStaticLights()
  const source = await sharp(pixels, { raw: { width, height, channels: 4 } })
    .webp({ quality: 65, alphaQuality: 85, effort: 6 }).toBuffer()
  const result = { fingerprint, fileName: `mobile-jars/${fingerprint}.webp`, width, height, source, originalBytes: inputs.reduce((sum, input) => sum + input.length, 0), originalImages: inputs.length }
  cache.set(category.id, result)
  return result
}
