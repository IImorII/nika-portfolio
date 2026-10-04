import { openSync, closeSync, readSync, fstatSync } from 'node:fs'
import sharp from 'sharp'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import ffmpeg from '@ffmpeg-installer/ffmpeg'

const runFFmpeg = promisify(execFile)

// Header scans must release files so assets can be replaced in Windows watch builds.
sharp.cache({ files: 0 })

// Read MP4 track headers without decoding or reading the video payload.
function videoDimensions(file) {
  const descriptor = openSync(file, 'r')
  try {
    const read = (position, size) => {
      const buffer = Buffer.alloc(size)
      if (readSync(descriptor, buffer, 0, size, position) !== size) throw new Error('truncated MP4 header')
      return buffer
    }
    const findTrack = (start, end) => {
      for (let position = start; position + 8 <= end;) {
        const header = read(position, 8)
        const type = header.toString('ascii', 4, 8)
        let size = header.readUInt32BE(0)
        let headerSize = 8
        if (size === 1) {
          size = Number(read(position + 8, 8).readBigUInt64BE())
          headerSize = 16
        } else if (size === 0) size = end - position
        if (!Number.isSafeInteger(size) || size < headerSize || position + size > end) throw new Error('invalid MP4 box size')
        const payload = position + headerSize
        if (type === 'moov' || type === 'trak') {
          const dimensions = findTrack(payload, position + size)
          if (dimensions) return dimensions
        } else if (type === 'tkhd') {
          const version = read(payload, 1)[0]
          if (version !== 0 && version !== 1) throw new Error('unsupported MP4 track header version')
          const matrixOffset = version === 1 ? 52 : 40
          if (size - headerSize < matrixOffset + 44) throw new Error('truncated MP4 track header')
          const track = read(payload + matrixOffset, 44)
          const width = track.readUInt32BE(36) / 65536
          const height = track.readUInt32BE(40) / 65536
          if (width > 0 && height > 0) {
            // Account for portrait videos stored with a rotation matrix.
            const a = track.readInt32BE(0) / 65536
            const b = track.readInt32BE(4) / 65536
            const c = track.readInt32BE(12) / 65536
            const d = track.readInt32BE(16) / 65536
            return { width: Math.abs(a) * width + Math.abs(c) * height, height: Math.abs(b) * width + Math.abs(d) * height }
          }
        }
        position += size
      }
    }
    return findTrack(0, fstatSync(descriptor).size)
  } finally { closeSync(descriptor) }
}

export async function readMediaDimensions(file, kind) {
  try {
    let dimensions
    if (kind === 'video') dimensions = videoDimensions(file)
    else {
      const metadata = await sharp(file).metadata()
      // Animated files use one frame; EXIF orientation can swap the axes.
      const height = metadata.pageHeight ?? metadata.height
      const rotated = metadata.orientation >= 5 && metadata.orientation <= 8
      dimensions = rotated ? { width: height, height: metadata.width } : { width: metadata.width, height }
    }
    if (!dimensions || !Number.isFinite(dimensions.width) || dimensions.width <= 0 || !Number.isFinite(dimensions.height) || dimensions.height <= 0) {
      throw new Error('missing or invalid dimensions')
    }
    return dimensions
  } catch (error) {
    throw new Error(`${file}: cannot read media dimensions: ${error.message}`, { cause: error })
  }
}

async function encodePreview(input) {
  const preview = await sharp(input)
    .autoOrient()
    .resize({ width: 32, height: 32, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 30, effort: 3 })
    .toBuffer()
  return `data:image/webp;base64,${preview.toString('base64')}`
}

export async function readImagePreview(file) {
  try {
    // Inline a tiny first frame so opening a section needs no preview requests.
    return await encodePreview(file)
  } catch (error) {
    throw new Error(`${file}: cannot create image preview: ${error.message}`, { cause: error })
  }
}

export async function readVideoPreview(file) {
  try {
    // Decode exactly the first video frame, applying the MP4 rotation metadata.
    // Pass arguments directly without a shell so arbitrary asset names are safe.
    const { stdout } = await runFFmpeg(ffmpeg.path, [
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-threads', '1',
      '-i', file, '-map', '0:v:0', '-frames:v', '1', '-an', '-sn', '-dn',
      '-vf', "scale=w='min(32,iw)':h='min(32,ih)':force_original_aspect_ratio=decrease",
      '-threads', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1',
    ], { encoding: 'buffer', windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 })
    return await encodePreview(stdout)
  } catch (error) {
    throw new Error(`${file}: cannot create video preview: ${error.message}`, { cause: error })
  }
}
