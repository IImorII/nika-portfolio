import { useEffect, useLayoutEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

type Frame = { key: string; content: ReactNode }

export default function SwipeTransition({ slideKey, direction, ready = true, className = '', children }: {
  slideKey: string; direction: number; ready?: boolean; className?: string; children: ReactNode
}) {
  const [frames, setFrames] = useState<{ current: Frame; previous: Frame | null; direction: number }>({ current: { key: slideKey, content: children }, previous: null, direction: 0 })
  useLayoutEffect(() => {
    // Keep the old mosaic visible until the next section's layout is ready.
    if (!ready) return
    setFrames(old => old.current.key === slideKey
      ? { ...old, current: { key: slideKey, content: children } }
      : { current: { key: slideKey, content: children }, previous: direction && !matchMedia('(prefers-reduced-motion: reduce)').matches ? old.current : null, direction })
  }, [slideKey, direction, ready, children])
  useEffect(() => {
    if (!frames.previous) return
    // Also covers interruptions, rapid navigation and reduced-motion changes.
    const timer = setTimeout(() => setFrames(old => ({ ...old, previous: null })), 280)
    return () => clearTimeout(timer)
  }, [frames.previous])
  return <div className={`swipe-transition ${className}`} style={{ '--swipe-direction': frames.direction } as CSSProperties}>
    {frames.previous && <div key={frames.previous.key} className="swipe-frame swipe-outgoing" inert aria-hidden="true">{frames.previous.content}</div>}
    <div key={frames.current.key} className={`swipe-frame${frames.previous ? ' swipe-incoming' : ''}`} inert={!ready}>{frames.current.content}</div>
  </div>
}
