import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'

export type ReservedArea = { left: number; top: number; right: number; bottom: number }

type Digit = { value: string; x: number; y: number; fontSize: number; dx: number; dy: number; scale: number; targetScale: number; color: string }
type Layout = { left: number; top: number; size: number; rise: number; digits: Digit[] }

// Palm contact points measured on the digit-free 1245 × 1263 asset.
const PALMS = [{ x: .25, y: .566, font: .32 }, { x: .805, y: .532, font: .37 }]
const IMAGE_ASPECT = 1263 / 1245

export default function SixSevenEffect({ active, returning, dark, shellRef, onReservedAreasChange }: { active: boolean; returning: boolean; dark: boolean; shellRef: RefObject<HTMLDivElement | null>; onReservedAreasChange: (areas: ReservedArea[]) => void }) {
  const [layout, setLayout] = useState<Layout | null>(null)
  const frame = useRef(0)

  useLayoutEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const measure = () => {
      const buttons = ['06', '07'].map(number => shell.querySelector<HTMLElement>(`.jar-button[data-jar-number="${number}"]`))
      const labels = ['06', '07'].map(number => shell.querySelector<HTMLElement>(`.jar-indices [data-jar-number="${number}"] .jar-index-last`))
      if (!buttons[0] || !buttons[1] || !labels[0] || !labels[1]) return
      const bounds = buttons.map(button => button!.getBoundingClientRect())
      const centerX = bounds.reduce((sum, rect) => sum + rect.left + rect.width / 2, 0) / 2
      const centerY = bounds.reduce((sum, rect) => sum + rect.top + rect.height / 2, 0) / 2
      const size = Math.min(window.innerWidth < 651 ? 210 : 320, window.innerWidth * .44)
      const left = Math.max(8, Math.min(window.innerWidth - size - 8, centerX - size / 2))
      const top = Math.max(64, Math.min(centerY - size * .48, window.innerHeight - size * .84 - 16))
      const context = document.createElement('canvas').getContext('2d')
      const digits = labels.map((label, index) => {
        // Use the original glyph's baseline and start of its advance, so the
        // return does not depend on line-box height or trailing letter spacing.
        const baseline = label!.querySelector<HTMLElement>('.jar-index-baseline')!.getBoundingClientRect()
        const labelStyle = getComputedStyle(label!)
        const fontSize = parseFloat(labelStyle.fontSize)
        const palm = PALMS[index]
        const targetFontSize = size * palm.font
        const value = index === 0 ? '6' : '7'
        if (context) context.font = `800 ${targetFontSize}px Helvetica`
        const metrics = context?.measureText(value)
        const advance = metrics?.width ?? targetFontSize * .556
        const descent = metrics?.actualBoundingBoxDescent ?? 0
        const x = baseline.left
        const y = baseline.top
        return { value, x, y, fontSize,
          dx: left + size * palm.x - advance / 2 - x,
          dy: top + size * IMAGE_ASPECT * palm.y - descent - y,
          scale: 1, targetScale: targetFontSize / fontSize,
          color: dark ? '#fff' : '#000' }
      })
      setLayout({ left, top, size, rise: window.innerHeight - top + size * .1, digits })
      // Reserve the whole swept area even while hidden, so labels do not jump
      // into the smiley's entrance/exit or the digits' flight paths.
      const padding = 14
      const areas: ReservedArea[] = [{ left: left - padding, top: top - padding,
        right: left + size + padding, bottom: Math.max(window.innerHeight, top + size * IMAGE_ASPECT) + padding }]
      digits.forEach(digit => {
        const targetFontSize = digit.fontSize * digit.targetScale
        areas.push({
          left: Math.min(digit.x, digit.x + digit.dx) - padding,
          top: Math.min(digit.y - digit.fontSize, digit.y + digit.dy - targetFontSize) - padding,
          right: Math.max(digit.x + digit.fontSize, digit.x + digit.dx + targetFontSize) + padding,
          bottom: Math.max(digit.y + digit.fontSize * .25, digit.y + digit.dy + targetFontSize * .25) + padding,
        })
      })
      onReservedAreasChange(areas)
    }
    const schedule = () => { cancelAnimationFrame(frame.current); frame.current = requestAnimationFrame(measure) }
    const observer = new ResizeObserver(schedule)
    observer.observe(shell)
    shell.querySelectorAll('.jar-button').forEach(button => observer.observe(button))
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, { passive: true })
    measure()
    return () => { cancelAnimationFrame(frame.current); observer.disconnect(); window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule) }
  }, [shellRef, active, dark, onReservedAreasChange])

  if (!layout) return null
  return <div className={`six-seven-effect${active ? ' is-active' : ''}${returning ? ' is-returning' : ''}`} aria-hidden="true">
    <img className="six-seven-smiley" src={import.meta.env.BASE_URL + 'effects/six-seven-smiley.png'} alt="" draggable="false"
      style={{ left: layout.left, top: layout.top, width: layout.size, '--smiley-rise': `${layout.rise}px` } as CSSProperties} />
    {layout.digits.map(digit => <span key={digit.value} className="six-seven-digit"
      style={{ left: digit.x, top: digit.y, fontSize: digit.fontSize, '--digit-x': `${digit.dx}px`, '--digit-y': `${digit.dy}px`, '--digit-origin-scale': digit.scale, '--digit-target-scale': digit.targetScale, '--digit-origin-color': digit.color } as CSSProperties}>
      <svg width="1" height="1" overflow="visible"><text x="0" y="0" dominantBaseline="alphabetic">{digit.value}</text></svg>
    </span>)}
  </div>
}
