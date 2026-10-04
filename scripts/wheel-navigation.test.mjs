import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/wheel-navigation.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const { createWheelNavigation } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))

function fixture() {
  let time = 0
  const moves = []
  const wheel = createWheelNavigation(direction => moves.push({ direction, time }), () => time)
  const send = (deltaY, delay = 0, extra = {}) => {
    time += delay
    let prevented = false
    wheel({ deltaX: 0, deltaY, deltaMode: 0, ctrlKey: false, preventDefault: () => { prevented = true }, ...extra })
    return prevented
  }
  return { moves, send }
}

test('rapid wheel ticks navigate immediately, then at intervals of at least 100ms without waiting for a pause', () => {
  const f = fixture()
  for (let i = 0; i < 10; i++) f.send(120, 20)
  assert.equal(f.moves.length, 2)
  assert.deepEqual(f.moves.map(move => move.time), [20, 120])
  f.send(-120, 20)
  assert.deepEqual(f.moves.at(-1), { direction: -1, time: 220 })
})

test('continuous trackpad input accumulates small deltas and can keep advancing', () => {
  const f = fixture()
  for (let i = 0; i < 20; i++) f.send(10, 16)
  assert.equal(f.moves.length, 3)
  assert.deepEqual(f.moves.map(move => move.time), [64, 192, 320])
})

test('line/page ticks navigate immediately, and a coalesced large event only advances once', () => {
  const f = fixture()
  f.send(1, 0, { deltaMode: 1 })
  f.send(-1, 100, { deltaMode: 2 })
  f.send(1000, 100)
  assert.deepEqual(f.moves.map(move => move.direction), [1, -1, 1])
})

test('horizontal scrolling works and changing direction clears partial movement', () => {
  const f = fixture()
  f.send(0, 0, { deltaX: -120 })
  f.send(30, 100)
  f.send(-30)
  assert.equal(f.moves.length, 1)
  f.send(-10)
  assert.deepEqual(f.moves.map(move => move.direction), [-1, -1])
})

test('jitter does not accumulate across separate gestures, and zoom stays native', () => {
  const f = fixture()
  f.send(25)
  f.send(25, 200)
  assert.deepEqual(f.moves, [])
  assert.equal(f.send(120, 0, { ctrlKey: true }), false)
  assert.equal(f.send(0), false)
  assert.deepEqual(f.moves, [])
})
