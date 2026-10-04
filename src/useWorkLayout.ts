import { useEffect, useState } from 'react'
import type { PortfolioMedia } from './data'
import type { WorkRect } from './work-layout'

export default function useWorkLayout(media: PortfolioMedia[] | undefined, width: number, height: number) {
  const [result, setResult] = useState<{ media: typeof media; width: number; height: number; rects: WorkRect[] } | null>(null)

  useEffect(() => {
    if (!media?.length || width <= 0 || height <= 0) return
    // Mosaic search runs off the UI thread. Cancel outdated calculations instead
    // of letting quick category/project changes queue behind an old section.
    const worker = new Worker(new URL('./work-layout.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<WorkRect[]>) => {
      setResult({ media, width, height, rects: event.data })
      worker.terminate()
    }
    worker.postMessage({ ratios: media.map(item => item.width / item.height), width, height, gap: width < 600 ? 6 : 10, priorities: media.map(item => item.priority) })
    return () => worker.terminate()
  }, [media, width, height])

  return result && result.media === media && result.width === width && result.height === height ? result.rects : []
}
