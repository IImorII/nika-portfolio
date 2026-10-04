import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

// This hook only uses refs. Supply their storage without mounting a React tree,
// then exercise the actual event handlers, including capture and click blocking.
const reactStub = 'data:text/javascript;base64,' + Buffer.from('export const useRef = current => ({ current })').toString('base64')
const source = readFileSync(new URL('../src/useSwipeNavigation.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replace(/from ['"]react['"]/, `from '${reactStub}'`)
const { default: useSwipeNavigation } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))

function fixture() {
  const moves = []
  const captured = new Set()
  const handlers = useSwipeNavigation(direction => moves.push(direction))
  const target = { closest: () => null }
  const currentTarget = {
    setPointerCapture: id => captured.add(id),
    hasPointerCapture: id => captured.has(id),
    releasePointerCapture: id => { captured.delete(id); handlers.onLostPointerCapture() },
  }
  const event = (x, y, extra = {}) => ({ pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y, currentTarget, target, ...extra })
  const click = (detail = 1) => {
    let prevented = false
    let stopped = false
    handlers.onClickCapture({ detail, preventDefault: () => { prevented = true }, stopPropagation: () => { stopped = true } })
    assert.equal(prevented, stopped)
    return prevented
  }
  return { handlers, moves, captured, event, click }
}

test('left/right swipes navigate once, release capture and block the resulting click', () => {
  for (const [dx, direction] of [[-80, 1], [80, -1]]) {
    const f = fixture()
    f.handlers.onPointerDown(f.event(100, 100))
    assert.equal(f.captured.size, 0, 'taps retain their original target')
    f.handlers.onPointerMove(f.event(100 + dx / 2, 103))
    assert.equal(f.captured.size, 1)
    f.handlers.onPointerUp(f.event(100 + dx, 108))
    f.handlers.onPointerUp(f.event(100 + dx, 108))
    assert.deepEqual(f.moves, [direction])
    assert.equal(f.captured.size, 0)
    assert.equal(f.click(), true)
    assert.equal(f.click(0), false, 'keyboard activation still works')
    f.handlers.onPointerDown(f.event(100, 100))
    f.handlers.onPointerUp(f.event(102, 102))
    assert.equal(f.click(), false, 'a fresh deliberate tap works immediately')
  }
})

test('tap jitter, short drags, vertical gestures and diagonals do not change slides', () => {
  for (const [dx, dy] of [[3, 2], [25, 2], [5, 90], [50, 50], [45, 40]]) {
    const f = fixture()
    f.handlers.onPointerDown(f.event(100, 100))
    f.handlers.onPointerMove(f.event(100 + dx, 100 + dy))
    f.handlers.onPointerUp(f.event(100 + dx, 100 + dy))
    assert.deepEqual(f.moves, [])
    assert.equal(f.click(), Math.max(Math.abs(dx), Math.abs(dy)) >= 10)
  }
})

test('a vertical gesture cannot turn into a swipe halfway through scrolling', () => {
  const f = fixture()
  f.handlers.onPointerDown(f.event(100, 100))
  f.handlers.onPointerMove(f.event(104, 130))
  f.handlers.onPointerMove(f.event(10, 135))
  f.handlers.onPointerUp(f.event(10, 135))
  assert.deepEqual(f.moves, [])
})

test('cancelled, multi-touch and unrelated pointer gestures never navigate', () => {
  for (const cancel of ['cancel', 'multi', 'lost']) {
    const f = fixture()
    f.handlers.onPointerDown(f.event(100, 100))
    f.handlers.onPointerMove(f.event(60, 100))
    if (cancel === 'cancel') f.handlers.onPointerCancel(f.event(60, 100))
    if (cancel === 'multi') f.handlers.onPointerDown(f.event(80, 110, { pointerId: 2, isPrimary: false }))
    if (cancel === 'lost') f.handlers.onLostPointerCapture()
    f.handlers.onPointerUp(f.event(20, 100))
    assert.deepEqual(f.moves, [])
  }
  const f = fixture()
  f.handlers.onPointerDown(f.event(100, 100))
  f.handlers.onPointerMove(f.event(20, 100, { pointerId: 2 }))
  f.handlers.onPointerUp(f.event(20, 100, { pointerId: 2 }))
  assert.deepEqual(f.moves, [])
})

test('navigation buttons and links do not start carousel gestures', () => {
  const f = fixture()
  const target = { closest: () => ({ tagName: 'BUTTON' }) }
  f.handlers.onPointerDown(f.event(100, 100, { target }))
  f.handlers.onPointerMove(f.event(20, 100, { target }))
  f.handlers.onPointerUp(f.event(20, 100, { target }))
  assert.deepEqual(f.moves, [])
  assert.equal(f.click(), false)
})
