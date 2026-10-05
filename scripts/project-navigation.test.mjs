import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/project-navigation.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const { advanceProjectSection: advance, advanceFullscreenMedia: advanceMedia, advanceCategorySection, advanceCategoryMedia } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))

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

test('sections traverse projects and categories in menu order and wrap the catalog in both directions', () => {
  const counts = [[2, 1], [1, 2]]
  const positions = [
    { categoryIndex: 0, projectIndex: 0, sectionIndex: 0 },
    { categoryIndex: 0, projectIndex: 0, sectionIndex: 1 },
    { categoryIndex: 0, projectIndex: 1, sectionIndex: 0 },
    { categoryIndex: 1, projectIndex: 0, sectionIndex: 0 },
    { categoryIndex: 1, projectIndex: 1, sectionIndex: 0 },
    { categoryIndex: 1, projectIndex: 1, sectionIndex: 1 },
  ]
  for (const direction of [1, -1]) {
    let current = positions[0]
    for (let i = 1; i <= positions.length * 2; i++) {
      current = advanceCategorySection(counts, current, direction)
      assert.deepEqual(current, positions[(i * direction % positions.length + positions.length) % positions.length])
    }
  }
})

test('category section navigation skips empty projects and categories and can leave an empty category', () => {
  const counts = [[1, 0], [], [0], [0, 2, 0]]
  const first = { categoryIndex: 0, projectIndex: 0, sectionIndex: 0 }
  const next = { categoryIndex: 3, projectIndex: 1, sectionIndex: 0 }
  const last = { ...next, sectionIndex: 1 }
  assert.deepEqual(advanceCategorySection(counts, first, 1), next)
  assert.deepEqual(advanceCategorySection(counts, first, -1), last)
  assert.deepEqual(advanceCategorySection(counts, last, 1), first)
  const empty = { categoryIndex: 1, projectIndex: 0, sectionIndex: 0 }
  assert.deepEqual(advanceCategorySection(counts, empty, 1), next)
  assert.deepEqual(advanceCategorySection(counts, empty, -1), first)
  assert.deepEqual(advanceCategorySection([[], [0]], empty, 1), empty)
  assert.equal(advanceCategorySection([], first, 1), first)
  assert.equal(advanceCategorySection(counts, first, 0), first)
})

test('fullscreen traverses the whole catalog without closing and selects the previous category last work', () => {
  const categories = [
    { projects: [project([['a', 'b'], ['c']], ['c', 'b', 'a']), project([['d']])] },
    { projects: [] },
    { projects: [project([]), project([[], ['e', 'f'], []], ['f', 'e'])] },
  ]
  const positions = [
    { categoryIndex: 0, projectIndex: 0, sectionIndex: 0, selected: 2 },
    { categoryIndex: 0, projectIndex: 0, sectionIndex: 0, selected: 1 },
    { categoryIndex: 0, projectIndex: 0, sectionIndex: 1, selected: 0 },
    { categoryIndex: 0, projectIndex: 1, sectionIndex: 0, selected: 0 },
    { categoryIndex: 2, projectIndex: 1, sectionIndex: 1, selected: 1 },
    { categoryIndex: 2, projectIndex: 1, sectionIndex: 1, selected: 0 },
  ]
  for (const direction of [1, -1]) {
    let current = positions[0]
    for (let i = 1; i <= positions.length * 2; i++) {
      current = advanceCategoryMedia(categories, current, direction)
      assert.deepEqual(current, positions[(i * direction % positions.length + positions.length) % positions.length])
      assert.notEqual(current.selected, null)
    }
  }
})

test('categories with a single section or work still navigate, while a closed viewer remains closed', () => {
  const counts = [[1], [1]]
  const categories = [{ projects: [project([['a']])] }, { projects: [project([['b']])] }]
  const first = { categoryIndex: 0, projectIndex: 0, sectionIndex: 0 }
  const second = { ...first, categoryIndex: 1 }
  for (const direction of [1, -1]) {
    assert.deepEqual(advanceCategorySection(counts, first, direction), second)
    assert.deepEqual(advanceCategoryMedia(categories, { ...first, selected: 0 }, direction), { ...second, selected: 0 })
    assert.deepEqual(advanceCategorySection([[1]], first, direction), first)
    assert.deepEqual(advanceCategoryMedia(categories.slice(0, 1), { ...first, selected: 0 }, direction), { ...first, selected: 0 })
  }
  const closed = { ...first, selected: null }
  assert.equal(advanceCategoryMedia(categories, closed, 1), closed)
  assert.equal(advanceCategoryMedia([], closed, -1), closed)
  const open = { ...first, selected: 0 }
  assert.equal(advanceCategoryMedia(categories, open, 0), open)
})
