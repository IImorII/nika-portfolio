import { useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Category } from '../data'
import type { ReservedArea } from './SixSevenEffect'

type Props = { category: Category; shellRef: RefObject<HTMLDivElement | null>; reservedAreas: ReservedArea[] }

export default function CategoryLabel({ category, shellRef, reservedAreas }: Props) {
  const labelRef = useRef<HTMLSpanElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const shell = shellRef.current
    const label = labelRef.current
    const jar = shell?.querySelector<HTMLElement>(`.jar-button[data-jar-number="${category.number}"]`)
    if (!shell || !label || !jar) return
    const obstacles = Array.from(shell.querySelectorAll<HTMLElement>('.jar-button, .veronica-visible-text, .site-header, .site-footer'))
    let disposed = false

    const measure = () => {
      if (disposed) return
      const scene = shell.getBoundingClientRect()
      const target = jar.getBoundingClientRect()
      const width = label.offsetWidth
      const height = label.offsetHeight
      const gap = 14
      const centerX = (target.left + target.right) / 2
      const centerY = (target.top + target.bottom) / 2
      const bounds = [...obstacles.map(element => element.getBoundingClientRect()), ...reservedAreas]
      const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
      const sideBounds = bounds.filter(rect => rect.top < centerY + height / 2 && rect.bottom > centerY - height / 2)
      const rightEdge = Math.min(scene.right - 16, ...sideBounds.filter(rect => rect.left >= target.right).map(rect => rect.left))
      const leftEdge = Math.max(scene.left + 16, ...sideBounds.filter(rect => rect.right <= target.left).map(rect => rect.right))
      // Keep text horizontal, outside the rotated jar, and in the nearest free gap.
      const nearby = [
        { left: centerX - width / 2, top: target.bottom + gap },
        { left: centerX - width / 2, top: target.top - gap - height },
        { left: target.right + gap, top: centerY - height / 2 },
        { left: target.left - gap - width, top: centerY - height / 2 },
        // A narrow gap may fit the word when it is centered between neighbors.
        { left: (target.right + rightEdge - width) / 2, top: centerY - height / 2 },
        { left: (leftEdge + target.left - width) / 2, top: centerY - height / 2 },
      ]
      // Also try the edges of nearby obstacles when the four direct sides are crowded.
      const candidates = [...nearby, ...nearby.flatMap(candidate => bounds.flatMap(rect => [
        { left: rect.left - width - gap, top: candidate.top },
        { left: rect.right + gap, top: candidate.top },
        { left: candidate.left, top: rect.top - height - gap },
        { left: candidate.left, top: rect.bottom + gap },
      ]))].map((candidate, index) => {
        const left = clamp(candidate.left, scene.left + 16, scene.right - width - 16)
        const top = clamp(candidate.top, scene.top + 16, scene.bottom - height - 16)
        const overlap = bounds.reduce((area, rect) => area
          + Math.max(0, Math.min(left + width, rect.right + 4) - Math.max(left, rect.left - 4))
          * Math.max(0, Math.min(top + height, rect.bottom + 4) - Math.max(top, rect.top - 4)), 0)
        const reserved = reservedAreas.some(rect => left < rect.right && left + width > rect.left
          && top < rect.bottom && top + height > rect.top)
        return { left: left - scene.left, top: top - scene.top, reserved,
          score: overlap * 1000 + Math.hypot(left + width / 2 - centerX, top + height / 2 - centerY) + index * .01 }
      })
      // Reservation is a hard constraint, including in crowded layouts.
      const available = candidates.filter(candidate => !candidate.reserved)
      if (!available.length) { setPosition(null); return }
      const best = available.reduce((best, candidate) => candidate.score < best.score ? candidate : best)
      setPosition(current => current?.left === best.left && current.top === best.top ? current : { left: best.left, top: best.top })
    }

    const observer = new ResizeObserver(measure)
    observer.observe(shell)
    observer.observe(label)
    obstacles.forEach(element => observer.observe(element))
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, { passive: true })
    document.fonts.ready.then(measure)
    measure()
    return () => { disposed = true; observer.disconnect(); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure) }
  }, [category.number, shellRef, reservedAreas])

  return <span ref={labelRef} className="jar-category-label" aria-hidden="true"
    style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}>
    {category.title}
  </span>
}
