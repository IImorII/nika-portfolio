import { useEffect, useRef, useState } from 'react'
import { assetUrl } from '../data'
import type { PortfolioMedia } from '../data'

export default function ProgressiveImage({ media, label, priority = 'low', active = true, mobilePreview = false }: { media: PortfolioMedia; label: string; priority?: 'low' | 'high'; active?: boolean; mobilePreview?: boolean }) {
  const imageRef = useRef<HTMLImageElement>(null)
  const [decodedSrc, setDecodedSrc] = useState<string | null>(null)
  const src = mobilePreview ? (media.mobilePath ? assetUrl(media.mobilePath) : undefined) : assetUrl(media.path)
  const ready = active && decodedSrc === src

  useEffect(() => {
    const image = imageRef.current
    if (!image || !active || !src) return
    if (image.getAttribute('src') !== src) image.src = src
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
    return () => {
      cancelled = true
      image.removeEventListener('load', reveal)
      image.removeAttribute('src')
    }
  }, [src, active])

  return <span className="progressive-image" data-has-preview={!!media.preview} data-ready={ready}>
    {media.preview && <img className="image-preview" src={media.preview} alt="" aria-hidden="true" width={media.width} height={media.height} draggable="false" />}
    <img ref={imageRef} className="image-original" src={active ? src : undefined} alt={label} width={media.width} height={media.height} decoding="async" fetchPriority={priority} draggable="false" />
  </span>
}
