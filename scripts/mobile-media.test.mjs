import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { test } from 'node:test'
import sharp from 'sharp'
import ffmpeg from '@ffmpeg-installer/ffmpeg'
import { createMobileMedia } from './mobile-media.mjs'
import { readMediaDimensions } from './media-dimensions.mjs'

const runFFmpeg = promisify(execFile)
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nika-mobile-media-'))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }))
  return root
}

test('mobile images shrink, retain transparency/orientation, cache and update after replacement', async t => {
  const root = await fixture(t)
  const file = path.join(root, 'работа 50% #1.png')
  const cache = path.join(root, 'cache')
  await sharp({ create: { width: 1600, height: 800, channels: 4, background: '#abcdff80' } }).png().toFile(file)
  const original = await readFile(file)
  const mobile = await createMobileMedia(file, 'image', cache)
  const metadata = await sharp(mobile.source).metadata()
  assert.deepEqual([metadata.width, metadata.height], [640, 320])
  assert.ok(metadata.hasAlpha)
  assert.ok(mobile.source.length < original.length)
  assert.deepEqual(await readFile(file), original, 'original must remain untouched')
  assert.deepEqual(await createMobileMedia(file, 'image', cache), mobile)
  await sharp({ create: { width: 800, height: 1600, channels: 4, background: '#ff000080' } }).png().toFile(file)
  const replaced = await createMobileMedia(file, 'image', cache)
  assert.notEqual(replaced.fileName, mobile.fileName)
  const portrait = await sharp(replaced.source).metadata()
  assert.deepEqual([portrait.width, portrait.height], [320, 640])
  const rotated = path.join(root, 'rotated.jpg')
  await sharp({ create: { width: 1600, height: 800, channels: 3, background: '#abcdef' } }).withMetadata({ orientation: 6 }).jpeg().toFile(rotated)
  const rotatedMetadata = await sharp((await createMobileMedia(rotated, 'image', cache)).source).metadata()
  assert.deepEqual([rotatedMetadata.width, rotatedMetadata.height], [320, 640])
})

test('mobile animations retain multiple frames', async t => {
  const root = await fixture(t)
  const file = path.join(root, 'animated.gif')
  const pixels = Buffer.alloc(80 * 160 * 4, 255)
  pixels.fill(0, 80 * 80 * 4)
  await sharp(pixels, { raw: { width: 80, height: 160, channels: 4, pageHeight: 80 } }).gif().toFile(file)
  const metadata = await sharp((await createMobileMedia(file, 'image', path.join(root, 'cache'))).source, { animated: true }).metadata()
  assert.equal(metadata.pages, 2)
  assert.equal(metadata.pageHeight, 80)
})

test('mobile MP4 stays a moving full-duration video, shrinks and preserves rotation', async t => {
  const root = await fixture(t)
  const file = path.join(root, 'видео 50% #1.mp4')
  await runFFmpeg(ffmpeg.path, [
    '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '2', '-c:v', 'libx264', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-threads', '1', '-c:a', 'aac', file,
  ], { windowsHide: true })
  const original = await readFile(file)
  const mobile = await createMobileMedia(file, 'video', path.join(root, 'cache'))
  const output = path.join(root, 'cache', path.basename(mobile.fileName))
  const dimensions = await readMediaDimensions(output, 'video')
  assert.deepEqual(dimensions, { width: 480, height: 270 })
  assert.ok(mobile.source.length < original.length / 3)
  assert.deepEqual(await readFile(file), original)
  const { stdout } = await runFFmpeg(ffmpeg.path, ['-loglevel', 'error', '-i', output, '-map', '0:v:0', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'], { encoding: 'buffer', windowsHide: true, maxBuffer: 10 * 1024 * 1024 })
  const frameSize = dimensions.width * dimensions.height
  assert.equal(stdout.length / frameSize, 36, 'all two seconds remain at 18 fps')
  assert.notDeepEqual(stdout.subarray(0, frameSize), stdout.subarray(-frameSize), 'preview must move')
  await assert.rejects(runFFmpeg(ffmpeg.path, ['-loglevel', 'error', '-i', output, '-map', '0:a:0', '-f', 'null', '-'], { windowsHide: true }), 'muted preview needs no audio payload')
  const rotated = path.join(root, 'rotated.mp4')
  await runFFmpeg(ffmpeg.path, ['-loglevel', 'error', '-y', '-i', file, '-c', 'copy', '-metadata:s:v:0', 'rotate=90', rotated], { windowsHide: true })
  const portrait = await createMobileMedia(rotated, 'video', path.join(root, 'cache'))
  assert.deepEqual(await readMediaDimensions(path.join(root, 'cache', path.basename(portrait.fileName)), 'video'), { width: 270, height: 480 })
})
