import { useEffect, useRef } from 'react'

export default function CustomCursor({ erasing }: { erasing: boolean }) {
  const cursor = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = cursor.current
    if (!element || !matchMedia('(pointer: fine)').matches) return
    let frame = 0
    let x = -100, y = -100, targetX = -100, targetY = -100
    const move = (event: MouseEvent) => {
      targetX = event.clientX
      targetY = event.clientY
      // Navigation needs the visible cursor to match the actual click position.
      if ((event.target as Element)?.closest('.project-tabs, .category-links')) {
        x = targetX
        y = targetY
      }
      element.classList.add('cursor-visible')
      element.classList.toggle('cursor-active', !!(event.target as Element)?.closest('[data-interactive]'))
      if (!frame) frame = requestAnimationFrame(animate)
    }
    const leave = () => { element.classList.remove('cursor-visible'); cancelAnimationFrame(frame); frame = 0 }
    const animate = () => {
      frame = 0
      x += (targetX - x) * .28
      y += (targetY - y) * .28
      const moving = Math.abs(targetX - x) + Math.abs(targetY - y) > .1
      if (!moving) { x = targetX; y = targetY }
      element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
      if (moving && !document.hidden) frame = requestAnimationFrame(animate)
    }
    window.addEventListener('mousemove', move)
    document.addEventListener('mouseleave', leave)
    document.addEventListener('visibilitychange', leave)
    return () => { window.removeEventListener('mousemove', move); document.removeEventListener('mouseleave', leave); document.removeEventListener('visibilitychange', leave); cancelAnimationFrame(frame) }
  }, [])
  return <div ref={cursor} className={`custom-cursor ${erasing ? 'cursor-eraser' : ''}`} aria-hidden="true"><span /></div>
}
