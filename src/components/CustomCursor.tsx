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
    }
    const leave = () => element.classList.remove('cursor-visible')
    const animate = () => {
      x += (targetX - x) * .28
      y += (targetY - y) * .28
      element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
      frame = requestAnimationFrame(animate)
    }
    window.addEventListener('mousemove', move)
    document.addEventListener('mouseleave', leave)
    frame = requestAnimationFrame(animate)
    return () => { window.removeEventListener('mousemove', move); document.removeEventListener('mouseleave', leave); cancelAnimationFrame(frame) }
  }, [])
  return <div ref={cursor} className={`custom-cursor ${erasing ? 'cursor-eraser' : ''}`} aria-hidden="true"><span /></div>
}
