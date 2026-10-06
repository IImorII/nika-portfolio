import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/analytics.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText

function fixture({ hostname = 'veronicacherepko.com', resources = [], observerSupported = true } = {}) {
  const events = new Map()
  const scripts = []
  const intervals = []
  const navigation = { responseEnd: 0, transferSize: 0 }
  let observer
  const document = {
    visibilityState: 'visible', createElement: () => ({}),
    head: { appendChild: script => scripts.push(script) },
    addEventListener: (name, callback) => events.set(name, callback),
  }
  const window = {
    location: { hostname, origin: `https://${hostname}` },
    setInterval: (callback, delay) => intervals.push({ callback, delay }),
    addEventListener: (name, callback) => events.set(name, callback),
  }
  class Observer {
    constructor(callback) { this.callback = callback; this.pending = []; observer = this }
    observe(options) {
      assert.equal(options.type, 'resource')
      assert.equal(options.buffered, true)
      this.deliver(resources)
    }
    deliver(entries) { this.callback({ getEntries: () => entries }) }
    takeRecords() { return this.pending.splice(0) }
    disconnect() {}
  }
  const context = vm.createContext({ exports: {}, window, document, URL,
    PerformanceObserver: observerSupported ? Observer : undefined,
    performance: { getEntriesByType: type => type === 'resource' ? resources : [navigation] },
  })
  vm.runInContext(compiled, context)
  return { ...context.exports, scripts, intervals, navigation, resources,
    get observer() { return observer },
    messages: () => JSON.parse(JSON.stringify((window.dataLayer ?? []).map(args => Array.from(args)))),
    flush: () => intervals[0].callback(),
    hide: () => { document.visibilityState = 'hidden'; events.get('visibilitychange')() },
    pagehide: () => events.get('pagehide')(), load: () => events.get('load')(),
  }
}
const resource = (name, transferSize, extra = {}) => ({ entryType: 'resource', name, transferSize, ...extra })
const transfers = app => app.messages().filter(message => message[1] === 'site_transfer')

test('analytics is disabled for missing/invalid IDs, development and local previews', () => {
  const cases = [[undefined, true], ['', true], ['UA-123-1', true], ['G-X<script>', true], ['G-TEST123', false]]
  for (const [id, production] of cases) {
    const app = fixture()
    app.initializeAnalytics(id, production)
    app.trackPortfolioEvent('project_view')
    assert.equal(app.scripts.length, 0)
    assert.equal(app.intervals.length, 0)
    assert.deepEqual(app.messages(), [])
  }
  for (const hostname of ['localhost', 'preview.localhost', '127.0.0.1', '[::1]', '::1']) {
    const app = fixture({ hostname })
    app.initializeAnalytics('G-TEST123', true)
    assert.equal(app.scripts.length, 0)
  }
})

test('one async Google tag and config initialize visits, and custom events use the same queue', () => {
  const app = fixture()
  app.initializeAnalytics(' G-TEST123 ', true)
  app.initializeAnalytics('G-TEST123', true)
  assert.equal(app.scripts.length, 1)
  assert.equal(app.scripts[0].async, true)
  assert.equal(app.scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-TEST123')
  const configs = app.messages().filter(message => message[0] === 'config')
  assert.equal(configs.length, 1)
  assert.equal(configs[0][1], 'G-TEST123')
  assert.equal(configs[0][2].allow_google_signals, false)
  assert.equal(configs[0][2].send_page_view, undefined)
  assert.equal(app.messages().filter(message => message[0] === 'event').length, 0)
  assert.equal(app.intervals.length, 1)
  assert.equal(app.intervals[0].delay, 30_000)
  app.trackPortfolioEvent('project_view', { project_id: 'demo' })
  assert.deepEqual(app.messages().at(-1), ['event', 'project_view', { project_id: 'demo' }])
})

test('traffic includes same-origin response bytes, excludes cache bodies and third-party resources', () => {
  const app = fixture({ resources: [
    resource('https://veronicacherepko.com/a.webp', 1_000_000),
    resource('https://veronicacherepko.com/cached.webp', 0, { encodedBodySize: 5_000_000 }),
    resource('https://www.googletagmanager.com/gtag/js', 300_000),
    resource('data:image/webp;base64,AAAA', 10), resource('invalid URL', 10),
    resource('https://veronicacherepko.com/unknown', NaN),
  ] })
  Object.assign(app.navigation, { responseEnd: 100, transferSize: 10_000 })
  app.initializeAnalytics('G-TEST123', true)
  app.flush()
  assert.deepEqual(transfers(app), [['event', 'site_transfer', {
    transferred_bytes: 1_010_000, transferred_mb: 1.01, transport_type: 'beacon',
  }]])
})

test('interval, hide and pagehide send deltas without duplicate bytes and drain pending entries', () => {
  const first = resource('https://veronicacherepko.com/a.jpg', 2_000_000)
  const app = fixture({ resources: [first] })
  Object.assign(app.navigation, { responseEnd: 1, transferSize: 1000 })
  app.initializeAnalytics('G-TEST123', true)
  app.flush()
  app.observer.deliver([first])
  app.observer.pending.push(resource('https://veronicacherepko.com/b.jpg', 500_000))
  app.hide()
  app.pagehide()
  app.observer.deliver([resource('https://veronicacherepko.com/a.jpg', 200_000)])
  app.flush()
  assert.deepEqual(transfers(app).map(event => event[2].transferred_bytes), [2_001_000, 500_000, 200_000])
})

test('the document is counted once after it finishes loading', () => {
  const app = fixture()
  app.initializeAnalytics('G-TEST123', true)
  app.flush()
  assert.equal(transfers(app).length, 0)
  Object.assign(app.navigation, { responseEnd: 120, transferSize: 2000 })
  app.load()
  app.flush()
  assert.deepEqual(transfers(app).map(event => event[2].transferred_bytes), [2000])
})

test('without PerformanceObserver, fallback tracks new resources without counting them twice', () => {
  const app = fixture({ observerSupported: false, resources: [resource('https://veronicacherepko.com/a.jpg', 1000)] })
  app.initializeAnalytics('G-TEST123', true)
  app.flush()
  app.flush()
  app.resources.push(resource('https://veronicacherepko.com/a.jpg', 2000))
  app.pagehide()
  assert.deepEqual(transfers(app).map(event => event[2].transferred_bytes), [1000, 2000])
})
