import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import sharp from 'sharp'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import ffmpeg from '@ffmpeg-installer/ffmpeg'
import { readMediaDimensions, readImagePreview, readVideoPreview } from './media-dimensions.mjs'
import { scanPortfolioWithDimensions } from './portfolio-assets.mjs'

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nika-dimensions-'))
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }))
  return root
}

const image = (width, height) => sharp({ create: { width, height, channels: 4, background: '#abcdef' } })
const runFFmpeg = promisify(execFile)

test('video preview uses the first frame, respects rotation and updates after replacement', async t => {
  const root = fixture(t)
  const file = path.join(root, 'видео 50% #1.mp4')
  await sharp({ create: { width: 80, height: 40, channels: 3, background: '#ff0000' } }).png().toFile(path.join(root, 'frame01.png'))
  await sharp({ create: { width: 80, height: 40, channels: 3, background: '#0000ff' } }).png().toFile(path.join(root, 'frame02.png'))
  await runFFmpeg(ffmpeg.path, ['-loglevel', 'error', '-y', '-framerate', '1', '-i', path.join(root, 'frame%02d.png'), '-frames:v', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file], { windowsHide: true })
  const preview = await readVideoPreview(file)
  const buffer = Buffer.from(preview.split(',')[1], 'base64')
  assert.ok(preview.startsWith('data:image/webp;base64,'))
  assert.ok(buffer.length < 2048)
  assert.deepEqual([(await sharp(buffer).metadata()).width, (await sharp(buffer).metadata()).height], [32, 16])
  const { channels } = await sharp(buffer).stats()
  assert.ok(channels[0].mean > 180 && channels[2].mean < 80, 'preview must be the red first frame, not the blue second frame')
  const rotated = path.join(root, 'rotated.mp4')
  await runFFmpeg(ffmpeg.path, ['-loglevel', 'error', '-y', '-i', file, '-c', 'copy', '-metadata:s:v:0', 'rotate=90', rotated], { windowsHide: true })
  const rotatedBuffer = Buffer.from((await readVideoPreview(rotated)).split(',')[1], 'base64')
  const rotatedMetadata = await sharp(rotatedBuffer).metadata()
  assert.deepEqual([rotatedMetadata.width, rotatedMetadata.height], [16, 32])
  await runFFmpeg(ffmpeg.path, ['-loglevel', 'error', '-y', '-i', path.join(root, 'frame02.png'), '-frames:v', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file], { windowsHide: true })
  assert.notEqual(await readVideoPreview(file), preview)
  mkdirSync(path.join(root, 'digital/works/test/section_1'), { recursive: true })
  writeFileSync(path.join(root, 'digital/jar.webp'), 'fixture')
  writeFileSync(path.join(root, 'digital/works/test/section_1/movie.mp4'), readFileSync(file))
  const catalog = await scanPortfolioWithDimensions(root, { previews: true })
  const project = catalog.categories[0].projects[0]
  assert.equal(project.media[0].preview, await readVideoPreview(file))
  assert.strictEqual(project.sections[0].media[0], project.media[0])
})

test('reads every supported image format and browser EXIF orientation', async t => {
  const root = fixture(t)
  for (const format of ['png', 'jpeg', 'webp', 'gif', 'avif']) {
    const file = path.join(root, `image.${format}`)
    await image(37, 19).toFormat(format).toFile(file)
    assert.deepEqual(await readMediaDimensions(file, 'image'), { width: 37, height: 19 }, format)
    const preview = Buffer.from((await readImagePreview(file)).split(',')[1], 'base64')
    const metadata = await sharp(preview).metadata()
    assert.equal(metadata.format, 'webp')
    assert.ok(metadata.width <= 32 && metadata.height <= 32, format)
    assert.ok(preview.length < 2048, format)
  }
  const svg = path.join(root, 'image.svg')
  writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 120"></svg>')
  assert.deepEqual(await readMediaDimensions(svg, 'image'), { width: 80, height: 120 })
  const svgPreview = await sharp(Buffer.from((await readImagePreview(svg)).split(',')[1], 'base64')).metadata()
  assert.equal(svgPreview.height, 32)
  assert.ok(svgPreview.hasAlpha)
  const rotated = path.join(root, 'rotated.jpg')
  await image(37, 19).withMetadata({ orientation: 6 }).jpeg().toFile(rotated)
  assert.deepEqual(await readMediaDimensions(rotated, 'image'), { width: 19, height: 37 })
  const rotatedPreview = await sharp(Buffer.from((await readImagePreview(rotated)).split(',')[1], 'base64')).metadata()
  assert.ok(rotatedPreview.width < rotatedPreview.height)
})

test('animated images reserve the dimensions of a single frame', async t => {
  const file = path.join(fixture(t), 'animated.gif')
  const frames = Buffer.alloc(7 * 22 * 4, 255)
  frames.fill(0, 7 * 11 * 4)
  await sharp(frames, { raw: { width: 7, height: 22, channels: 4, pageHeight: 11 } }).gif().toFile(file)
  assert.equal((await sharp(file).metadata()).pages, 2)
  assert.deepEqual(await readMediaDimensions(file, 'image'), { width: 7, height: 11 })
  const preview = await sharp(Buffer.from((await readImagePreview(file)).split(',')[1], 'base64')).metadata()
  assert.deepEqual([preview.width, preview.height], [7, 11])
})

function box(type, payload, extended = false) {
  const header = Buffer.alloc(extended ? 16 : 8)
  header.writeUInt32BE(extended ? 1 : header.length + payload.length)
  header.write(type, 4)
  if (extended) header.writeBigUInt64BE(BigInt(header.length + payload.length), 8)
  return Buffer.concat([header, payload])
}

function track(width, height, version = 0, rotated = false) {
  const offset = version === 1 ? 52 : 40
  const header = Buffer.alloc(offset + 44)
  header[0] = version
  header.writeInt32BE(rotated ? 0 : 65536, offset)
  header.writeInt32BE(rotated ? 65536 : 0, offset + 4)
  header.writeInt32BE(rotated ? -65536 : 0, offset + 12)
  header.writeInt32BE(rotated ? 0 : 65536, offset + 16)
  header.writeInt32BE(1 << 30, offset + 32)
  header.writeUInt32BE(width * 65536, offset + 36)
  header.writeUInt32BE(height * 65536, offset + 40)
  return box('trak', box('tkhd', header))
}

test('MP4 headers support audio-first tracks, moov at the end, rotation and extended boxes', async t => {
  const root = fixture(t)
  for (const version of [0, 1]) for (const rotated of [false, true]) {
    const file = path.join(root, `movie-${version}-${rotated}.mp4`)
    writeFileSync(file, Buffer.concat([
      box('ftyp', Buffer.from('isom0000')),
      box('mdat', Buffer.alloc(1024)),
      box('moov', Buffer.concat([track(0, 0), track(1920, 1080, version, rotated)]), true),
    ]))
    assert.deepEqual(await readMediaDimensions(file, 'video'), rotated ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 })
  }
})

test('invalid media fails with its path instead of silently using square placeholders', async t => {
  const root = fixture(t)
  for (const [name, kind, content] of [['broken.png', 'image', 'broken'], ['broken.mp4', 'video', box('moov', Buffer.alloc(0))], ['truncated.mp4', 'video', Buffer.from([0, 0, 0, 30, 109, 111, 111, 118])]]) {
    const file = path.join(root, name)
    writeFileSync(file, content)
    await assert.rejects(readMediaDimensions(file, kind), error => error.message.includes(file) && error.message.includes('cannot read media dimensions'))
    if (kind === 'video') await assert.rejects(readVideoPreview(file), error => error.message.includes(file) && error.message.includes('cannot create video preview'))
  }
})

test('build catalog contains dimensions for sections and fullscreen; replacement files update them', async t => {
  const root = fixture(t)
  const project = path.join(root, 'digital/works/тест #1')
  mkdirSync(path.join(project, 'section_1'), { recursive: true })
  writeFileSync(path.join(root, 'digital/jar.webp'), 'fixture')
  const file = path.join(project, 'section_1/50% #1.png')
  await image(80, 120).png().toFile(file)
  let catalog = await scanPortfolioWithDimensions(root, { previews: true })
  const media = catalog.categories[0].projects[0].media[0]
  assert.deepEqual([media.width, media.height], [80, 120])
  assert.strictEqual(catalog.categories[0].projects[0].sections[0].media[0], media)
  assert.ok(catalog.watched.includes(file))
  assert.ok(media.preview.startsWith('data:image/webp;base64,'))
  await image(160, 90).png().toFile(file)
  catalog = await scanPortfolioWithDimensions(root, { previews: true })
  assert.deepEqual(catalog.categories[0].projects[0].media.map(item => [item.width, item.height]), [[160, 90]])
  assert.notEqual(catalog.categories[0].projects[0].media[0].preview, media.preview)
})

test('every shipped image and video has dimensions before any browser request', async () => {
  const catalog = await scanPortfolioWithDimensions(fileURLToPath(new URL('../public/assets/', import.meta.url)), { previews: true })
  const media = catalog.categories.flatMap(category => category.projects.flatMap(project => project.media))
  assert.ok(media.length > 100)
  assert.ok(media.some(item => item.kind === 'video'))
  for (const item of media) {
    assert.ok(item.width > 0 && item.height > 0, item.path)
    assert.ok(Number.isFinite(item.width / item.height), item.path)
    assert.ok(item.preview.startsWith('data:image/webp;base64,'), item.path)
    const preview = await sharp(Buffer.from(item.preview.split(',')[1], 'base64')).metadata()
    assert.ok(preview.width <= 32 && preview.height <= 32, item.path)
  }
})
