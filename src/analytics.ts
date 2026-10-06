type EventParameters = Record<string, string | number | boolean>
type GoogleTag = (...args: unknown[]) => void

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: GoogleTag
  }
}

let enabled = false

export function trackPortfolioEvent(name: string, parameters: EventParameters = {}) {
  if (enabled) window.gtag?.('event', name, parameters)
}

// These are browser-observed transfers, not the hosting provider's bandwidth bill.
function observeTraffic() {
  let pendingBytes = 0
  let navigationCounted = false
  const seen = new WeakSet<PerformanceEntry>()
  const addResources = (entries: PerformanceEntry[]) => {
    for (const entry of entries) {
      if (entry.entryType !== 'resource' || seen.has(entry)) continue
      seen.add(entry)
      const resource = entry as PerformanceResourceTiming
      try {
        if (new URL(resource.name).origin !== window.location.origin) continue
      } catch { continue }
      // transferSize is zero for local cache hits; body size would overcount them.
      if (Number.isFinite(resource.transferSize) && resource.transferSize > 0) {
        pendingBytes += resource.transferSize
      }
    }
  }

  let observer: PerformanceObserver | undefined
  try {
    observer = new PerformanceObserver(list => addResources(list.getEntries()))
    observer.observe({ type: 'resource', buffered: true })
  } catch {
    observer?.disconnect()
    observer = undefined
  }

  const flush = () => {
    if (observer) addResources(observer.takeRecords())
    else addResources(performance.getEntriesByType('resource'))
    if (!navigationCounted) {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      // The document may still be loading when the application starts.
      if (navigation && navigation.responseEnd > 0) {
        navigationCounted = true
        if (Number.isFinite(navigation.transferSize) && navigation.transferSize > 0) {
          pendingBytes += navigation.transferSize
        }
      }
    }
    if (pendingBytes === 0) return
    const bytes = pendingBytes
    pendingBytes = 0
    trackPortfolioEvent('site_transfer', {
      transferred_bytes: bytes,
      transferred_mb: bytes / 1_000_000,
      transport_type: 'beacon',
    })
  }

  window.setInterval(flush, 30_000)
  window.addEventListener('load', flush, { once: true })
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}

export function initializeAnalytics(measurementId: string | undefined, production: boolean) {
  const id = measurementId?.trim()
  const hostname = window.location.hostname
  if (enabled || !production || !id || !/^G-[A-Z0-9]+$/.test(id)) return
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1') return

  window.dataLayer ??= []
  window.gtag ??= function (..._args: unknown[]) { window.dataLayer!.push(arguments) }
  window.gtag('js', new Date())
  window.gtag('config', id, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    transport_type: 'beacon',
  })
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
  document.head.appendChild(script)
  enabled = true
  observeTraffic()
}
