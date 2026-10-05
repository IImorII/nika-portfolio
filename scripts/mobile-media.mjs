import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import sharp from 'sharp'
import ffmpeg from '@ffmpeg-installer/ffmpeg'

const runFFmpeg = promisify(execFile)
const defaultCache = fileURLToPath(new URL('../node_modules/.cache/mobile-media/', import.meta.url))
const pending = new Map()
const ENCODER_VERSION = 'mobile-media-v1-webp640-q55-mp4480-fps18-crf32'

export async function createMobileMedia(file, kind, cacheDirectory = defaultCache) {
  try {
    const info = await stat(file)
    const fingerprint = createHash('sha256').update(JSON.stringify([ENCODER_VERSION, file, kind, info.size, info.mtimeMs, info.ctimeMs])).digest('hex').slice(0, 24)
    const extension = kind === 'video' ? 'mp4' : 'webp'
    const fileName = `mobile-media/${fingerprint}.${extension}`
    const output = path.join(cacheDirectory, `${fingerprint}.${extension}`)
    if (!pending.has(output)) {
      const work = (async () => {
        await mkdir(cacheDirectory, { recursive: true })
        try { return { fileName, source: await readFile(output) } } catch (error) {
          if (error.code !== 'ENOENT') throw error
        }
        const temporary = `${output}.${process.pid}.tmp`
        try {
          if (kind === 'video') {
            // Keep the entire moving clip. Autorotation is baked into the pixels;
            // no audio is needed by the muted gallery. Faststart enables streaming.
            await runFFmpeg(ffmpeg.path, [
              '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-threads', '1',
              '-i', file, '-map', '0:v:0', '-an', '-sn', '-dn', '-map_metadata', '-1',
              '-vf', "scale=w='max(2,trunc(iw*min(1,480/max(iw,ih))/2)*2)':h='max(2,trunc(ih*min(1,480/max(iw,ih))/2)*2)',setsar=1,fps=18",
              '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '32', '-maxrate', '450k', '-bufsize', '900k',
              '-pix_fmt', 'yuv420p', '-threads', '1', '-movflags', '+faststart', '-metadata:s:v:0', 'rotate=0',
              '-f', 'mp4', temporary,
            ], { windowsHide: true, timeout: 300000, maxBuffer: 1024 * 1024 })
          } else {
            await sharp(file, { animated: true }).autoOrient()
              .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
              .webp({ quality: 55, effort: 4 }).toFile(temporary)
          }
          await rename(temporary, output)
          return { fileName, source: await readFile(output) }
        } finally { await rm(temporary, { force: true }) }
      })()
      pending.set(output, work)
      // Keep only in-flight work; subsequent builds read the persistent cache.
      work.finally(() => pending.delete(output)).catch(() => {})
    }
    return await pending.get(output)
  } catch (error) {
    throw new Error(`${file}: cannot create mobile ${kind}: ${error.message}`, { cause: error })
  }
}
