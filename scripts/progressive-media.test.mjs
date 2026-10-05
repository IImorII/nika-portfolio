import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
const reactUrl = moduleUrl(`
  export const effects = [], updates = [];
  let ref;
  export const setRef = value => { ref = value; effects.length = 0; updates.length = 0 };
  export const useRef = () => ({ current: ref });
  export const useState = value => [value, next => updates.push(next)];
  export const useEffect = callback => effects.push(callback);
`)
const jsxUrl = moduleUrl('export const jsx = (type, props) => ({ type, props }); export const jsxs = jsx;')
const dataUrl = moduleUrl('export const assetUrl = path => "/" + path;')
const react = await import(reactUrl)
async function loadComponent(name) {
  const source = readFileSync(new URL(`../src/components/${name}.tsx`, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
    .replace(/from ['"]react['"]/, `from '${reactUrl}'`)
    .replace(/from ['"]react\/jsx-runtime['"]/, `from '${jsxUrl}'`)
    .replace(/from ['"]\.\.\/data['"]/, `from '${dataUrl}'`)
  return (await import(moduleUrl(compiled))).default
}
const Image = await loadComponent('ProgressiveImage')
const Video = await loadComponent('ProgressiveVideo')
const media = { path: 'work.jpg', width: 800, height: 600 }

function element(extra = {}) {
  const listeners = new Map()
  const calls = []
  const node = {
    src: '', complete: false, naturalWidth: 0, readyState: 0,
    getAttribute: key => node[key] || null,
    removeAttribute: key => { delete node[key]; calls.push(`remove:${key}`) },
    addEventListener: (key, listener) => listeners.set(key, listener),
    removeEventListener: key => listeners.delete(key),
    pause: () => calls.push('pause'),
    play: () => { calls.push('play'); return Promise.resolve() },
    load: () => { calls.push('load'); listeners.get('emptied')?.() },
    ...extra,
  }
  return { node, listeners, calls }
}

test('image loading never waits for load/decode, and leaving cancels its request', () => {
  const f = element()
  react.setRef(f.node)
  Image({ media, label: 'Work' })
  const cleanup = react.effects[0]()
  assert.equal(f.node.src, '/work.jpg')
  assert.equal(f.listeners.has('load'), true)
  cleanup()
  assert.equal(f.listeners.size, 0)
  assert.equal(f.node.src, undefined)
})

test('late image decode after navigation cannot update the next view', async () => {
  let finishDecode
  const f = element({ complete: true, naturalWidth: 800, decode: () => new Promise(resolve => { finishDecode = resolve }) })
  react.setRef(f.node)
  Image({ media, label: 'Work' })
  const cleanup = react.effects[0]()
  cleanup()
  finishDecode()
  await Promise.resolve()
  assert.deepEqual(react.updates, [])
})

test('inactive gallery images do not download behind a fullscreen viewer', () => {
  const f = element()
  react.setRef(f.node)
  Image({ media, label: 'Work', active: false })
  assert.equal(react.effects[0](), undefined)
  assert.equal(f.node.src, '')
  assert.equal(f.listeners.size, 0)
})

test('video playback never blocks navigation and cleanup releases loading and playback', () => {
  const f = element()
  react.setRef(f.node)
  Video({ media: { ...media, path: 'work.mp4' }, label: 'Work' })
  const cleanups = react.effects.map(effect => effect())
  assert.equal(f.node.src, '/work.mp4')
  assert.deepEqual(f.calls, ['play'])
  cleanups.forEach(cleanup => cleanup?.())
  assert.deepEqual(f.calls.slice(1), ['pause', 'remove:src', 'load'])
  assert.equal(f.listeners.size, 0)
})

test('inactive gallery videos keep their preview without starting a download', () => {
  const f = element()
  react.setRef(f.node)
  Video({ media, label: 'Work', playing: false })
  const cleanups = react.effects.map(effect => effect())
  assert.equal(f.calls.includes('play'), false)
  assert.equal(f.node.src, undefined)
  cleanups.forEach(cleanup => cleanup?.())
})

test('mobile gallery downloads only the small image; fullscreen and desktop use the original', () => {
  const item = { ...media, mobilePath: 'mobile-media/small.webp' }
  for (const [mobilePreview, expected] of [[true, '/mobile-media/small.webp'], [false, '/work.jpg']]) {
    const f = element()
    react.setRef(f.node)
    const rendered = Image({ media: item, label: 'Work', mobilePreview })
    assert.equal(rendered.props.children[1].props.src, expected)
    const cleanup = react.effects[0]()
    assert.equal(f.node.src, expected)
    cleanup()
  }
})

test('mobile gallery plays the low resolution MP4; fullscreen plays the original MP4', () => {
  const item = { ...media, path: 'work.mp4', mobilePath: 'mobile-media/small.mp4' }
  for (const [mobilePreview, expected] of [[true, '/mobile-media/small.mp4'], [false, '/work.mp4']]) {
    const f = element()
    react.setRef(f.node)
    const rendered = Video({ media: item, label: 'Work', mobilePreview })
    assert.equal(rendered.props.children[1].type, 'video')
    const cleanups = react.effects.map(effect => effect())
    assert.equal(f.node.src, expected)
    assert.ok(f.calls.includes('play'))
    cleanups.forEach(cleanup => cleanup?.())
  }
})

test('missing mobile derivatives never silently download the original', () => {
  for (const Component of [Image, Video]) {
    const f = element()
    react.setRef(f.node)
    Component({ media, label: 'Work', mobilePreview: true })
    const cleanups = react.effects.map(effect => effect())
    assert.ok(!f.node.src)
    assert.ok(!f.calls.includes('play'))
    cleanups.forEach(cleanup => cleanup?.())
  }
})
