import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/work-layout.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const { packWorks } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))

test('every container fits without overlaps or viewport overflow in portrait and landscape', () => {
  for (const ratios of [[1], [.1, 10], [.7, .7, 1.5, 2.4, 1, 1.2, .4], Array.from({ length: 25 }, (_, i) => [.7, 1, 1.8, .5][i % 4])]) {
    for (const [width, height] of [[1360, 720], [366, 650], [720, 240]]) {
      const rects = packWorks(ratios, width, height)
      assert.equal(rects.length, ratios.length)
      rects.forEach((rect, i) => {
        assert.ok(rect.width > 0 && rect.height > 0)
        assert.ok(rect.x >= -1e-8 && rect.y >= -1e-8)
        assert.ok(rect.x + rect.width <= width + 1e-8 && rect.y + rect.height <= height + 1e-8)
        for (const other of rects.slice(i + 1)) {
          assert.ok(rect.x + rect.width <= other.x + 1e-8 || other.x + other.width <= rect.x + 1e-8 || rect.y + rect.height <= other.y + 1e-8 || other.y + other.height <= rect.y + 1e-8)
        }
      })
    }
  }
})

function verifyGutters(rects, area, gap) {
  const equal = (a, b) => Math.abs(a - b) < 1e-6
  if (rects.length === 1) {
    const rect = rects[0]
    assert.ok(equal(rect.x, area.x) && equal(rect.y, area.y) && equal(rect.width, area.width) && equal(rect.height, area.height), 'container fills its assigned region')
    return
  }
  for (const axis of ['x', 'y']) {
    const dimension = axis === 'x' ? 'width' : 'height'
    for (const rect of rects) {
      const cut = rect[axis] + rect[dimension]
      const first = rects.filter(item => item[axis] + item[dimension] <= cut + 1e-6)
      const second = rects.filter(item => item[axis] >= cut + gap - 1e-6)
      if (!first.length || !second.length || first.length + second.length !== rects.length) continue
      verifyGutters(first, { ...area, [dimension]: cut - area[axis] }, gap)
      verifyGutters(second, { ...area, [axis]: cut + gap, [dimension]: area[axis] + area[dimension] - cut - gap }, gap)
      return
    }
  }
  assert.fail('containers must tile the canvas with the same horizontal and vertical gap')
}

test('tiles the complete canvas with exactly equal gutters for mixed proportions', () => {
  for (const ratios of [[.8, .8, .8, .8, .8, .8], [.7, 2.4, 1, 1.2, .4], Array.from({ length: 25 }, (_, i) => [.7, 1, 1.8, .5][i % 4])]) {
    for (const [width, height, gap] of [[1227, 753, 10], [270, 714, 6], [700, 240, 10]]) {
      verifyGutters(packWorks(ratios, width, height, gap), { x: 0, y: 0, width, height }, gap)
    }
  }
})

test('prefers a small crop and displays a single work in its original proportions', () => {
  const ratios = Array(6).fill(.8)
  for (const [width, height] of [[1227, 753], [270, 714]]) {
    const rects = packWorks(ratios, width, height, 6)
    for (const rect of rects) {
      const relativeRatio = rect.width / rect.height / .8
      assert.ok(Math.min(relativeRatio, 1 / relativeRatio) > .85, 'at least 85% of each image remains visible')
    }
    const [single] = packWorks([.8], width, height)
    assert.ok(Math.abs(single.width / single.height - .8) < 1e-8)
  }
})

test('packs mixed proportions densely while keeping every work readable', () => {
  const ratios = [.75, .75, 1.5, 1.5, 1, 1]
  for (const [width, height] of [[1280, 720], [360, 640]]) {
    const rects = packWorks(ratios, width, height)
    const coverage = rects.reduce((sum, rect) => sum + rect.width * rect.height, 0) / (width * height)
    assert.ok(coverage > .8, `coverage ${coverage}`)
    assert.ok(rects.every(rect => rect.width * rect.height > width * height * .025))
  }
})

test('handles unloaded dimensions and empty sections safely', () => {
  assert.deepEqual(packWorks([], 360, 640), [])
  assert.deepEqual(packWorks([1], 0, 640), [])
  assert.ok(packWorks([0, NaN, Infinity], 360, 640).every(rect => Number.isFinite(rect.width) && rect.width > 0))
})

test('gives #1 the largest container at any alphabetical position with equal or similar proportions', () => {
  for (const ratios of [Array(6).fill(.8), [.8, .82, .79, .81, .78, .8]]) {
    for (const [width, height, gap] of [[1227, 753, 10], [270, 714, 6]]) {
      for (let index = 0; index < ratios.length; index++) {
        const priorities = ratios.map((_, peer) => peer === index ? 1 : undefined)
        const rects = packWorks(ratios, width, height, gap, priorities)
        const areas = rects.map(rect => rect.width * rect.height)
        assert.ok(areas[index] >= Math.max(...areas) - 1e-6, `#1 at index ${index} must get the largest container: ${areas}`)
        verifyGutters(rects, { x: 0, y: 0, width, height }, gap)
        for (const [peer, rect] of rects.entries()) {
          const ratio = rect.width / rect.height / ratios[peer]
          assert.ok(Math.min(ratio, 1 / ratio) > .75, 'choose the smallest crop compatible with priority')
        }
      }
    }
  }
})

test('lettering 3#1.jpg receives the largest container among the five real square works', () => {
  const ratios = [1200 / 1197, 1500 / 1502, 1, 1500 / 1506, 1080 / 1081]
  for (const [width, height, gap] of [[1227, 753, 10], [270, 714, 6], [1690, 820, 10], [400, 600, 6]]) {
    const rects = packWorks(ratios, width, height, gap, [undefined, undefined, 1, undefined, undefined])
    const areas = rects.map(rect => rect.width * rect.height)
    assert.ok(areas[2] >= Math.max(...areas) - 1e-6, `3#1.jpg must be largest: ${areas}`)
    verifyGutters(rects, { x: 0, y: 0, width, height }, gap)
  }
})

test('changing numeric priorities changes prominence without reordering the works', () => {
  for (const priorities of [[1, 2, 3, 4, 5, 6], [6, 4, 2, 1, 3, 5]]) {
    const rects = packWorks(Array(6).fill(.8), 1227, 753, 10, priorities)
    const areas = rects.map(rect => rect.width * rect.height)
    const top = priorities.indexOf(1)
    assert.ok(areas[top] >= Math.max(...areas) - 1e-6, `#1 gets the largest tile: ${areas}`)
    assert.ok(areas[priorities.indexOf(2)] >= areas[priorities.indexOf(3)] - 1e-6, '#2 is no smaller than #3')
    verifyGutters(rects, { x: 0, y: 0, width: 1227, height: 753 }, 10)
  }
  const first = packWorks(Array(6).fill(.8), 1227, 753, 10, [1, undefined, undefined, undefined, undefined, 2])
  const last = packWorks(Array(6).fill(.8), 1227, 753, 10, [2, undefined, undefined, undefined, undefined, 1])
  assert.ok(first[0].width * first[0].height > first[5].width * first[5].height)
  assert.ok(last[5].width * last[5].height > last[0].width * last[0].height)
})

test('priority order is mandatory for every comparable pair, including crowded mixed ranks', () => {
  for (const [ratios, priorities] of [
    [Array(6).fill(.8), [undefined, 2, undefined, 1, 3, undefined]],
    [[.92, 1.02, .96, 1.08, .9, 1.01, .98, 1.05], [8, 2, 6, 1, 7, 3, 5, 4]],
  ]) {
    for (const [width, height, gap] of [[1227, 753, 10], [270, 714, 6]]) {
      const rects = packWorks(ratios, width, height, gap, priorities)
      const areas = rects.map(rect => rect.width * rect.height)
      for (let a = 0; a < ratios.length; a++) for (let b = 0; b < ratios.length; b++) {
        if ((priorities[a] ?? Infinity) >= (priorities[b] ?? Infinity) || Math.abs(Math.log(ratios[a] / ratios[b])) > Math.log(1.2)) continue
        assert.ok(areas[a] >= areas[b] - 1e-6, `priority ${priorities[a]} must not be smaller than ${priorities[b]}: ${areas}`)
      }
      verifyGutters(rects, { x: 0, y: 0, width, height }, gap)
    }
  }
})

test('untagged works retain the existing layout and distinct proportions are unaffected', () => {
  const ratios = [.7, 1, 1.8, .5]
  assert.deepEqual(packWorks(ratios, 1227, 753, 10, ratios.map(() => undefined)), packWorks(ratios, 1227, 753, 10))
  assert.deepEqual(packWorks([.2, 3], 1227, 753, 10, [1, undefined]), packWorks([.2, 3], 1227, 753, 10))
})
