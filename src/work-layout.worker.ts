import { packWorks } from './work-layout'

self.onmessage = (event: MessageEvent<{ ratios: number[]; width: number; height: number; gap: number; priorities: (number | undefined)[] }>) => {
  const { ratios, width, height, gap, priorities } = event.data
  self.postMessage(packWorks(ratios, width, height, gap, priorities))
}
