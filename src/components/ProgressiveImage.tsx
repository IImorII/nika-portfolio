import { useEffect, useRef, useState } from 'react'
import { assetUrl } from '../data'
import type { PortfolioMedia } from '../data'

export default function ProgressiveImage({ media, label }: { media: PortfolioMedia; label: string }) {
  const imageRef = useRef<HTMLImageElement>(null)
  const [decodedSrc, setDecodedSrc] = useState<string | null>(null)
  const src = assetUrl(media.path)
  const ready = decodedSrc === src

  useEffect(() => {
    const image = imageRef.current
    if (!image) return
    let cancelled = false
    const reveal = async () => {
      if (!image.complete || !image.naturalWidth) return
      try { await image.decode() } catch {
        // A browser may reject decode() for a valid animated image.
        if (!image.complete || !image.naturalWidth) return
      }
      if (!cancelled) setDecodedSrc(src)
    }
    image.addEventListener('load', reveal)
    // Cached images can finish before the effect attaches the load listener.
    void reveal()
    return () => { cancelled = true; image.removeEventListener('load', reveal) }
  }, [src])

  return <span className="progressive-image" data-has-preview={!!media.preview} data-ready={ready}>
    {media.preview && <img className="image-preview" src={media.preview} alt="" aria-hidden="true" width={media.width} height={media.height} draggable="false" />}
    <img ref={imageRef} className="image-original" src={src} alt={label} width={media.width} height={media.height} decoding="async" draggable="false" />
  </span>
}
