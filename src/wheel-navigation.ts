type WheelInput = Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode' | 'ctrlKey' | 'preventDefault'>

export function createWheelNavigation(onNavigate: (direction: number) => void, now = () => performance.now()) {
  let accumulated = 0
  let lastEvent = -Infinity
  let lastDirection = 0
  let lastNavigation = -Infinity

  return (event: WheelInput) => {
    if (event.ctrlKey) return
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
    if (!delta) return
    event.preventDefault()
    const direction = Math.sign(delta)
    const time = now()
    if (time - lastEvent > 180 || direction !== lastDirection) accumulated = 0
    lastEvent = time
    lastDirection = direction
    accumulated += delta

    // Line/page events are discrete wheel ticks; pixel events also cover
    // trackpads. The first step is immediate; subsequent steps are spaced 100ms.
    if (event.deltaMode === 0 && Math.abs(accumulated) < 40) return
    accumulated = 0
    if (time - lastNavigation < 100) return
    lastNavigation = time
    onNavigate(direction)
  }
}
