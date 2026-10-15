type Listener = (seconds: number) => void
const listeners = new Set<Listener>()
let frame = 0
let previous: number | null = null
let nextTime = 0
let preference: MediaQueryList | null = null

function animate(time: number) {
  frame = 0
  // Avoid doubling simulation and DOM work on 120/144/240 Hz displays.
  if (previous === null || time >= nextTime - .5) {
    const seconds = previous === null ? 0 : Math.min(.05, (time - previous) / 1000)
    previous = time
    nextTime += 1000 / 60
    if (nextTime <= time) nextTime = time + 1000 / 60
    for (const listener of listeners) listener(seconds)
  }
  if (listeners.size) frame = requestAnimationFrame(animate)
}

function update() {
  cancelAnimationFrame(frame)
  frame = 0
  previous = null
  nextTime = 0
  if (listeners.size && !document.hidden && !preference?.matches) frame = requestAnimationFrame(animate)
}

export function subscribeAnimation(listener: Listener) {
  if (!listeners.size) {
    preference = matchMedia('(prefers-reduced-motion: reduce)')
    preference.addEventListener('change', update)
    document.addEventListener('visibilitychange', update)
  }
  listeners.add(listener)
  if (!frame) update()
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      update()
      preference?.removeEventListener('change', update)
      document.removeEventListener('visibilitychange', update)
      preference = null
    }
  }
}
