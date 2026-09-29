import { useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent, RefObject } from 'react'

type Props = {
  titleRef: RefObject<HTMLButtonElement | null>
  onReveal: () => void
  onConceal: () => void
  onOpen: () => void
}

export default function NikaTitle({ titleRef, onReveal, onConceal, onOpen }: Props) {
  const hitRef = useRef<HTMLSpanElement>(null)
  const mask = useRef<{ pixels: Uint8ClampedArray; width: number; height: number; padding: number } | null>(null)
  const hovered = useRef(false)
  const focused = useRef(false)
  const [active, setActive] = useState(false)

  useLayoutEffect(() => {
    const span = hitRef.current
    if (!span) return
    let disposed = false
    const measure = () => {
      if (disposed) return
      const style = getComputedStyle(span)
      const padding = Math.ceil(parseFloat(style.fontSize) * .3)
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(span.offsetWidth) + padding * 2
      canvas.height = Math.ceil(span.offsetHeight) + padding * 2
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      context.letterSpacing = style.letterSpacing
      context.textBaseline = 'alphabetic'
      const metrics = context.measureText('NIKA')
      // Match the browser's baseline inside the deliberately tight line height.
      const baseline = (span.offsetHeight - metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2 + metrics.fontBoundingBoxAscent
      context.fillText('NIKA', padding, baseline + padding)
      mask.current = { pixels: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height, padding }
    }
    const observer = new ResizeObserver(measure)
    observer.observe(span)
    document.fonts.ready.then(measure)
    document.fonts.addEventListener('loadingdone', measure)
    measure()
    return () => { disposed = true; observer.disconnect(); document.fonts.removeEventListener('loadingdone', measure) }
  }, [])

  const updateHover = (value: boolean) => {
    if (hovered.current === value) return
    hovered.current = value
    setActive(value)
    // Update synchronously so the custom cursor also follows the letter mask.
    if (titleRef.current) {
      if (value) titleRef.current.dataset.interactive = 'true'
      else delete titleRef.current.dataset.interactive
    }
    if (value) onReveal()
    else if (!focused.current) onConceal()
  }

  const move = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'touch') return
    const span = hitRef.current
    const bitmap = mask.current
    if (!span || !bitmap) return
    const rect = span.getBoundingClientRect()
    const matrix = new DOMMatrix(getComputedStyle(span).transform)
    const point = new DOMPoint(event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2).matrixTransform(matrix.inverse())
    const x = Math.floor(point.x + span.offsetWidth / 2 + bitmap.padding)
    const y = Math.floor(point.y + span.offsetHeight / 2 + bitmap.padding)
    updateHover(x >= 0 && x < bitmap.width && y >= 0 && y < bitmap.height && bitmap.pixels[(y * bitmap.width + x) * 4 + 3] > 24)
  }

  return <button ref={titleRef} type="button" className={`nika-title${active ? ' is-hovered' : ''}`}
    onPointerEnter={move} onPointerMove={move} onPointerLeave={() => updateHover(false)}
    onFocus={event => { if (event.currentTarget.matches(':focus-visible')) { focused.current = true; onReveal() } }}
    onBlur={() => { focused.current = false; if (!hovered.current) onConceal() }}
    onClick={event => { if (event.detail === 0 || hovered.current || matchMedia('(pointer: coarse)').matches) onOpen() }}
    aria-label="Open Nika's CV">
    <span ref={hitRef} className="nika-hit-text" aria-hidden="true">NIKA</span>
    <span className="nika-visible-text" aria-hidden="true">NIKA</span>
  </button>
}
