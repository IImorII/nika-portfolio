import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import sharp from 'sharp'
import { compositeLayer, createMobileJar } from './mobile-jars.mjs'
import { scanPortfolio } from './portfolio-assets.mjs'

test('CSS blend modes preserve source alpha and transparent backgrounds', () => {
  const backdrop = Buffer.from([128, 128, 128, 255, 0, 0, 0, 0])
  compositeLayer(backdrop, Buffer.from([128, 128, 128, 255, 240, 80, 20, 128]), 'multiply')
  assert.deepEqual([...backdrop], [64, 64, 64, 255, 240, 80, 20, 128])
  const color = Buffer.from([255, 0, 0, 255])
  compositeLayer(color, Buffer.from([100, 100, 100, 255]), 'luminosity')
  assert.ok(color[0] > 245 && color[1] > 25 && color[1] < 45 && color[1] === color[2], 'luminosity keeps the backdrop hue and uses the source luminance')
  const burn = Buffer.from([128, 255, 0, 255])
  compositeLayer(burn, Buffer.from([128, 0, 255, 255]), 'color-burn')
  assert.deepEqual([...burn], [2, 255, 0, 255])
})

test('mobile flattening orders interior before foreground and rebuilds after an asset change', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nika-mobile-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, 'test/jar'), { recursive: true })
  const image = color => sharp({ create: { width: 64, height: 64, channels: 4, background: color } }).webp({ lossless: true }).toBuffer()
  await writeFile(path.join(root, 'test/jar/base.webp'), await image({ r: 0, g: 0, b: 255, alpha: 0 }))
  await writeFile(path.join(root, 'test/jar/front.webp'), await image({ r: 0, g: 255, b: 0, alpha: 1 }))
  await writeFile(path.join(root, 'test/jar/inside.webp'), await image({ r: 255, g: 0, b: 0, alpha: 1 }))
  const category = { id: 'test', jarPath: 'assets/test/jar/base.webp', jarLayers: [
    { path: 'assets/test/jar/front.webp', blendMode: 'normal', placement: 'foreground' },
    { path: 'assets/test/jar/inside.webp', blendMode: 'normal', placement: 'interior' },
  ], jarSettings: { particleCount: 0 } }
  const first = await createMobileJar(root, category)
  const pixels = await sharp(first.source).ensureAlpha().raw().toBuffer()
  assert.ok(pixels[1] > 245 && pixels[0] < 10 && pixels[3] === 255, 'the foreground remains on top')
  assert.equal(await createMobileJar(root, category), first, 'unchanged jars reuse the encoded image')
  await writeFile(path.join(root, 'test/jar/front.webp'), await image({ r: 0, g: 0, b: 255, alpha: 1 }))
  const updated = await createMobileJar(root, category)
  assert.notEqual(updated.fileName, first.fileName, 'a new fingerprint invalidates browser caches')
  category.jarLayers = []
  const transparent = await createMobileJar(root, category)
  const transparentPixels = await sharp(transparent.source).ensureAlpha().raw().toBuffer()
  assert.equal(transparentPixels[3], 0, 'flattening does not add a background')
})

test('all shipped jars become transparent single images within the mobile byte budget', async () => {
  const root = fileURLToPath(new URL('../public/assets', import.meta.url))
  const { categories } = scanPortfolio(root)
  let originalBytes = 0, mobileBytes = 0
  for (const [index, category] of categories.entries()) {
    const image = await createMobileJar(root, category, index)
    const metadata = await sharp(image.source).metadata()
    assert.equal(metadata.format, 'webp')
    assert.equal(metadata.hasAlpha, true)
    assert.ok(metadata.width <= 512 && metadata.height <= 512)
    assert.ok(image.source.length < 60000, `${category.id}: mobile jar must fit in 60 KB`)
    originalBytes += image.originalBytes
    mobileBytes += image.source.length
  }
  assert.ok(categories.length > 0)
  assert.ok(mobileBytes < originalBytes / 50, 'the mobile jars use less than 2% of the layered payload')
})
