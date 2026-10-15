import assert from 'node:assert/strict'
import { test } from 'node:test'
import { subscribeAnimation } from '../src/animation-clock.ts'

test('one shared clock caps fast displays, pauses, resumes without catch-up and cleans up', () => {
  const events = new Map(), mediaEvents = new Map(), pending = new Map()
  let next = 0
  const media = { matches: false, addEventListener: (type, fn) => mediaEvents.set(type, fn), removeEventListener: type => mediaEvents.delete(type) }
  globalThis.document = { hidden: false, addEventListener: (type, fn) => events.set(type, fn), removeEventListener: type => events.delete(type) }
  globalThis.matchMedia = () => media
  globalThis.requestAnimationFrame = fn => { pending.set(++next, fn); return next }
  globalThis.cancelAnimationFrame = id => pending.delete(id)
  const tick = time => { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(fn => fn(time)) }
  const first = [], second = []
  const stopA = subscribeAnimation(dt => first.push(dt)), stopB = subscribeAnimation(dt => second.push(dt))
  assert.equal(pending.size, 1)
  for (let time = 0; time <= 1000; time += 1000 / 144) tick(time)
  assert.ok(first.length <= 61 && first.length >= 45)
  assert.deepEqual(first, second)
  document.hidden = true; events.get('visibilitychange')()
  assert.equal(pending.size, 0)
  document.hidden = false; events.get('visibilitychange')(); tick(6000)
  assert.equal(first.at(-1), 0)
  media.matches = true; mediaEvents.get('change')()
  assert.equal(pending.size, 0)
  media.matches = false; mediaEvents.get('change')(); tick(9000)
  stopA(); assert.equal(pending.size, 1)
  stopB(); assert.equal(pending.size, 0)
  assert.equal(events.size + mediaEvents.size, 0)
})
