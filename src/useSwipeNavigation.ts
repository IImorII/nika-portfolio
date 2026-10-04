import { useRef } from 'react'
import type { DragEvent, MouseEvent, PointerEvent } from 'react'

type Gesture = { id: number; x: number; y: number; horizontal: boolean; cancelled: boolean }

// Share the same gesture rules between section and fullscreen carousels.
// Capture only after a horizontal drag, so taps, vertical scrolling and zoom
// remain native browser interactions.
export default function useSwipeNavigation(onNavigate: (direction: number) => void) {
  const gesture = useRef<Gesture | null>(null)
  const suppressClickUntil = useRef(0)
  const blockClick = () => { suppressClickUntil.current = performance.now() + 500 }
  const reset = (event: PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    gesture.current = null
  }

  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (!event.isPrimary) { gesture.current = null; blockClick(); return }
      if (event.button !== 0 || (event.target as Element).closest('button:not(.work-image-button), a')) return
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false, cancelled: false }
      suppressClickUntil.current = 0
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const start = gesture.current
      if (!start || start.id !== event.pointerId || start.cancelled) return
      const dx = Math.abs(event.clientX - start.x)
      const dy = Math.abs(event.clientY - start.y)
      if (Math.max(dx, dy) < 10) return
      blockClick()
      if (!start.horizontal) {
        if (dy >= dx) { start.cancelled = true; return }
        if (dx > dy * 1.35) {
          start.horizontal = true
          event.currentTarget.setPointerCapture(event.pointerId)
        }
      }
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const start = gesture.current
      if (!start || start.id !== event.pointerId) return
      const dx = event.clientX - start.x
      const dy = event.clientY - start.y
      if (start.horizontal || start.cancelled) blockClick()
      reset(event)
      if (!start.cancelled && Math.abs(dx) >= 36 && Math.abs(dx) > Math.abs(dy) * 1.35) {
        blockClick()
        onNavigate(dx < 0 ? 1 : -1)
      }
    },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => { blockClick(); reset(event) },
    onLostPointerCapture: () => { gesture.current = null },
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      if (event.detail !== 0 && performance.now() < suppressClickUntil.current) {
        event.preventDefault()
        event.stopPropagation()
      }
    },
    onDragStart: (event: DragEvent<HTMLElement>) => event.preventDefault(),
  }
}
