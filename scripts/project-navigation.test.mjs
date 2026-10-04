import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/project-navigation.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const { advanceProjectSection: advance, advanceFullscreenMedia: advanceMedia } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))

test('moves through sections and crosses project boundaries in both directions', () => {
  assert.deepEqual(advance([3, 2], { projectIndex: 0, sectionIndex: 0 }, 1), { projectIndex: 0, sectionIndex: 1 })
  assert.deepEqual(advance([3, 2], { projectIndex: 0, sectionIndex: 2 }, 1), { projectIndex: 1, sectionIndex: 0 })
  assert.deepEqual(advance([3, 2], { projectIndex: 1, sectionIndex: 0 }, -1), { projectIndex: 0, sectionIndex: 2 })
  assert.deepEqual(advance([3, 2], { projectIndex: 1, sectionIndex: 1 }, -1), { projectIndex: 1, sectionIndex: 0 })
})

test('cycles within the category and handles projects containing just one section', () => {
  assert.deepEqual(advance([3, 1], { projectIndex: 1, sectionIndex: 0 }, 1), { projectIndex: 0, sectionIndex: 0 })
  assert.deepEqual(advance([3, 1], { projectIndex: 0, sectionIndex: 0 }, -1), { projectIndex: 1, sectionIndex: 0 })
  assert.deepEqual(advance([1, 1], { projectIndex: 0, sectionIndex: 0 }, 1), { projectIndex: 1, sectionIndex: 0 })
  assert.deepEqual(advance([3], { projectIndex: 0, sectionIndex: 2 }, 1), { projectIndex: 0, sectionIndex: 0 })
})

test('skips empty projects and leaves an empty archive unchanged', () => {
  assert.deepEqual(advance([2, 0, 0, 3], { projectIndex: 0, sectionIndex: 1 }, 1), { projectIndex: 3, sectionIndex: 0 })
  assert.deepEqual(advance([2, 0, 0, 3], { projectIndex: 3, sectionIndex: 0 }, -1), { projectIndex: 0, sectionIndex: 1 })
  const position = { projectIndex: 0, sectionIndex: 0 }
  assert.equal(advance([], position, 1), position)
  assert.equal(advance([0, 0], position, -1), position)
  assert.deepEqual(advance([0, 2], position, 1), { projectIndex: 1, sectionIndex: 0 })
})

test('consecutive navigation events preserve the project and section together', () => {
  let position = { projectIndex: 0, sectionIndex: 0 }
  for (let i = 0; i < 4; i++) position = advance([3, 2], position, 1)
  assert.deepEqual(position, { projectIndex: 1, sectionIndex: 1 })
  for (let i = 0; i < 4; i++) position = advance([3, 2], position, -1)
  assert.deepEqual(position, { projectIndex: 0, sectionIndex: 0 })
})

function project(sectionPaths, mediaPaths = sectionPaths.flat()) {
  return {
    sections: sectionPaths.map(paths => ({ media: paths.map(path => ({ path })) })),
    media: mediaPaths.map(path => ({ path })),
  }
}

test('fullscreen advances within sections, then across sections and projects without closing', () => {
  const projects = [project([['a', 'b'], ['c']]), project([['d'], ['e', 'f']])]
  let position = { projectIndex: 0, sectionIndex: 0, selected: 0 }
  const expected = [
    { projectIndex: 0, sectionIndex: 0, selected: 1 },
    { projectIndex: 0, sectionIndex: 1, selected: 2 },
    { projectIndex: 1, sectionIndex: 0, selected: 0 },
    { projectIndex: 1, sectionIndex: 1, selected: 1 },
    { projectIndex: 1, sectionIndex: 1, selected: 2 },
    { projectIndex: 0, sectionIndex: 0, selected: 0 },
  ]
  for (const next of expected) {
    position = advanceMedia(projects, position, 1)
    assert.deepEqual(position, next)
    assert.notEqual(position.selected, null)
  }
  for (const next of [expected[4], expected[3], expected[2], expected[1], expected[0], expected[5]]) {
    position = advanceMedia(projects, position, -1)
    assert.deepEqual(position, next)
  }
})

test('fullscreen follows section order even when the project media list is ordered differently', () => {
  const projects = [project([['a', 'b'], ['c']], ['c', 'b', 'a'])]
  const position = { projectIndex: 0, sectionIndex: 0, selected: 2 }
  assert.deepEqual(advanceMedia(projects, position, 1), { projectIndex: 0, sectionIndex: 0, selected: 1 })
  assert.deepEqual(advanceMedia(projects, position, -1), { projectIndex: 0, sectionIndex: 1, selected: 0 })
})

test('fullscreen skips empty sections and projects in both directions', () => {
  const projects = [project([['a'], []]), project([]), project([[], ['b', 'c'], []])]
  assert.deepEqual(advanceMedia(projects, { projectIndex: 0, sectionIndex: 0, selected: 0 }, 1), { projectIndex: 2, sectionIndex: 1, selected: 0 })
  assert.deepEqual(advanceMedia(projects, { projectIndex: 0, sectionIndex: 0, selected: 0 }, -1), { projectIndex: 2, sectionIndex: 1, selected: 1 })
  assert.deepEqual(advanceMedia(projects, { projectIndex: 2, sectionIndex: 1, selected: 0 }, -1), { projectIndex: 0, sectionIndex: 0, selected: 0 })
})

test('fullscreen never opens a closed viewer and a single work stays open', () => {
  const projects = [project([['a']])]
  const closed = { projectIndex: 0, sectionIndex: 0, selected: null }
  assert.equal(advanceMedia(projects, closed, 1), closed)
  const open = { ...closed, selected: 0 }
  assert.deepEqual(advanceMedia(projects, open, 1), open)
  assert.deepEqual(advanceMedia(projects, open, -1), open)
})
