import { useEffect, useRef, useState } from 'react'
import { assetUrl } from '../data'
import type { PortfolioMedia } from '../data'

export default function ProgressiveVideo({ media, label, playing = true }: { media: PortfolioMedia; label: string; playing?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [decodedSrc, setDecodedSrc] = useState<string | null>(null)
  const src = assetUrl(media.path)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    // Metadata alone does not provide a drawable frame. Keep the preview until
    // HAVE_CURRENT_DATA, including when playback is paused or autoplay is blocked.
    const reveal = () => { if (video.readyState >= 2) setDecodedSrc(src) }
    const reset = () => setDecodedSrc(null)
    video.addEventListener('loadeddata', reveal)
    video.addEventListener('playing', reveal)
    video.addEventListener('emptied', reset)
    video.addEventListener('error', reset)
    reveal()
    return () => {
      video.removeEventListener('loadeddata', reveal)
      video.removeEventListener('playing', reveal)
      video.removeEventListener('emptied', reset)
      video.removeEventListener('error', reset)
    }
  }, [src])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (playing) {
      video.src = src
      void video.play().catch(() => {})
    } else {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
    return () => {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [src, playing])

  return <span className="progressive-image" data-has-preview={!!media.preview} data-ready={decodedSrc === src}>
    {media.preview && <img className="image-preview" src={media.preview} alt="" aria-hidden="true" width={media.width} height={media.height} draggable="false" />}
    <video ref={videoRef} className="image-original" poster={media.preview} width={media.width} height={media.height} loop muted playsInline preload="none" aria-label={label} />
  </span>
}
