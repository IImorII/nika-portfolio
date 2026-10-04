import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export default function ScrollableNavigation({ label, className, activeKey, revealActive = true, children }: {
  label: string; className: string; activeKey: string; revealActive?: boolean; children: ReactNode
}) {
  const navRef = useRef<HTMLElement>(null)
  const [edges, setEdges] = useState({ overflow: false, start: true, end: true })
  const measure = () => {
    const nav = navRef.current
    if (!nav) return
    const overflow = nav.scrollWidth > nav.clientWidth + 2
    const start = nav.scrollLeft <= 2
    const end = nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 2
    setEdges(previous => previous.overflow === overflow && previous.start === start && previous.end === end ? previous : { overflow, start, end })
  }
  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const observer = new ResizeObserver(measure)
    observer.observe(nav)
    Array.from(nav.children).forEach(child => observer.observe(child))
    measure()
    return () => observer.disconnect()
  }, [children])
  useLayoutEffect(() => {
    if (revealActive) navRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    measure()
  }, [activeKey, revealActive])
  const scroll = (direction: number) => {
    const nav = navRef.current
    if (!nav) return
    nav.scrollBy({ left: direction * Math.max(120, nav.clientWidth * .8), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }

  return <div className={`navigation-group ${className}-group`} data-overflow={edges.overflow}>
    <div className="navigation-scroll">
      <button type="button" className="navigation-scroll-button" disabled={edges.start} onClick={() => scroll(-1)} aria-label={`Scroll ${label.toLowerCase()} left`} data-interactive="true">‹</button>
      <nav ref={navRef} className={className} aria-label={label} onScroll={measure}>{children}</nav>
      <button type="button" className="navigation-scroll-button" disabled={edges.end} onClick={() => scroll(1)} aria-label={`Scroll ${label.toLowerCase()} right`} data-interactive="true">›</button>
    </div>
  </div>
}
