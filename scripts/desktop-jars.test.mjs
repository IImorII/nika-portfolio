import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { createDesktopJar, extractForeground } from './desktop-jars.mjs'
import { compositeLayer } from './mobile-jars.mjs'
import { scanPortfolio } from './portfolio-assets.mjs'

test('foreground extraction preserves mixed blends and leaves uncovered lights visible', () => {
  const lower = Buffer.from([180, 140, 100, 255, 100, 150, 200, 255])
  const coverage = Buffer.alloc(8), full = Buffer.from(lower)
  for (const [color, mode] of [[[80, 100, 130, 90, 0, 0, 0, 0], 'multiply'], [[190, 130, 80, 120, 0, 0, 0, 0], 'normal'], [[100, 110, 120, 40, 0, 0, 0, 0], 'luminosity']]) {
    compositeLayer(full, Buffer.from(color), mode)
    compositeLayer(coverage, Buffer.from(color))
  }
  const upper = extractForeground(lower, full, coverage)
  const result = Buffer.from(lower)
  compositeLayer(result, upper)
  result.forEach((channel, i) => assert.ok(Math.abs(channel - full[i]) <= 1))
  assert.equal(upper[7], 0, 'uncovered glass stays transparent to animation')
})

test('all desktop jars reconstruct the static reference with two textures and retain geometry', async () => {
  const root = fileURLToPath(new URL('../public/assets', import.meta.url))
  const { categories } = scanPortfolio(root)
  let before = 0, after = 0, images = 0, originalPixels = 0, finalPixels = 0
  for (const [index, category] of categories.entries()) {
    const jar = await createDesktopJar(root, category, index)
    assert.equal(await createDesktopJar(root, category, index), jar, 'unchanged content reuses its build cache')
    const [lower, upper, reference] = await Promise.all(jar.files.map(file => sharp(file.source).ensureAlpha().raw().toBuffer()))
    compositeLayer(lower, upper)
    let maxError = 0
    for (let i = 0; i < lower.length; i += 4) for (let c = 0; c < 3; c++) {
      const error = Math.abs(lower[i + c] * lower[i + 3] / 255 - reference[i + c] * reference[i + 3] / 255)
      maxError = Math.max(maxError, error)
    }
    assert.ok(maxError <= 2, `${category.id}: premultiplied reconstruction error ${maxError}/255`)
    assert.ok(jar.width <= 1024 && jar.height <= 1024)
    assert.ok(jar.contour?.rows.length > 1)
    assert.equal(jar.berries.berries.length, category.jarSettings.blueberryCount)
    before += jar.originalBytes
    after += jar.files[0].source.length + jar.files[1].source.length
    images += jar.originalImages
    finalPixels += jar.width * jar.height * 2
    const metadata = await sharp(fileURLToPath(new URL(`../public/${category.jarPath}`, import.meta.url))).metadata()
    originalPixels += metadata.width * metadata.height * jar.originalImages
  }
  assert.ok(after < before, 'the initial textures use less bandwidth')
  assert.ok(finalPixels < originalPixels / 5, 'decoded texture area falls by at least 80%')
  console.log(JSON.stringify({ originalImages: images, desktopImages: categories.length * 2, originalBytes: before, desktopBytes: after, originalPixels, desktopPixels: finalPixels }))
})
