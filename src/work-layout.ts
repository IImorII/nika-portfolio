export interface WorkRect { x: number; y: number; width: number; height: number }

interface LayoutNode {
  ratio: number
  smallest: number
  prominence: number
  index?: number
  axis?: 'x' | 'y'
  first?: LayoutNode
  second?: LayoutNode
}

// Build a mosaic of adjoining containers. Media fill the containers with cover;
// select proportions that minimize cropping while keeping every gutter equal.
export function packWorks(ratios: number[], width: number, height: number, gap = 8, priorities: (number | undefined)[] = []): WorkRect[] {
  if (!ratios.length || width <= 0 || height <= 0) return []
  const count = ratios.length
  const mediaRatios = ratios.map(ratio => Number.isFinite(ratio) && ratio > 0 ? ratio : 1)
  const ranks = mediaRatios.map((_, index) => {
    const rank = priorities[index]
    return rank !== undefined && Number.isSafeInteger(rank) && rank > 0 ? rank : Infinity
  })
  const ranked = [...new Set(ranks.filter(rank => Number.isFinite(rank)))].sort((a, b) => a - b)
  const weights = ranks.map((rank, index) => {
    const hasPeer = mediaRatios.some((ratio, peer) => peer !== index && Math.abs(Math.log(ratio / mediaRatios[index])) <= Math.log(1.2))
    return Number.isFinite(rank) && hasPeer ? (ranked.length - ranked.indexOf(rank)) / ranked.length : 0
  })
  const hasPriority = weights.some(weight => weight > 0)
  const priorityPairs: [number, number][] = []
  for (let a = 0; a < count; a++) for (let b = a + 1; b < count; b++) {
    if (ranks[a] === ranks[b] || Math.abs(Math.log(mediaRatios[a] / mediaRatios[b])) > Math.log(1.2)) continue
    priorityPairs.push(ranks[a] < ranks[b] ? [a, b] : [b, a])
  }
  if (count === 1) {
    const w = Math.min(width, height * mediaRatios[0])
    const h = w / mediaRatios[0]
    return [{ x: (width - w) / 2, y: (height - h) / 2, width: w, height: h }]
  }
  const memo = new Map<string, LayoutNode[]>()
  const candidates = (start: number, end: number): LayoutNode[] => {
    const key = `${start}:${end}`
    const cached = memo.get(key)
    if (cached) return cached
    if (end - start === 1) {
      return [{ ratio: mediaRatios[start], smallest: 1, prominence: weights[start], index: start }]
    }
    const buckets = new Map<number, LayoutNode>()
    const priorityBuckets = new Map<number, LayoutNode>()
    // Bound the search for very large sections, while still displaying every file.
    const step = end - start > 40 ? Math.ceil((end - start) / 20) : 1
    for (let split = start + 1; split < end; split += step) {
      for (const first of candidates(start, split)) for (const second of candidates(split, end)) {
        for (const axis of ['x', 'y'] as const) {
          const ratio = axis === 'x' ? first.ratio + second.ratio : 1 / (1 / first.ratio + 1 / second.ratio)
          const firstBias = 1 + .25 * first.prominence
          const secondBias = 1 + .25 * second.prominence
          const fraction = hasPriority
            ? axis === 'x'
              ? first.ratio * firstBias / (first.ratio * firstBias + second.ratio * secondBias)
              : second.ratio * firstBias / (second.ratio * firstBias + first.ratio * secondBias)
            : axis === 'x' ? first.ratio / ratio : ratio / first.ratio
          const smallest = Math.min(first.smallest * fraction, second.smallest * (1 - fraction))
          const prominence = first.prominence * fraction + second.prominence * (1 - fraction)
          const bucket = Math.round(Math.log(ratio) / .18)
          const previous = buckets.get(bucket)
          const node = { ratio, smallest, prominence, axis, first, second }
          if (!previous || smallest > previous.smallest) buckets.set(bucket, node)
          const promoted = priorityBuckets.get(bucket)
          if (hasPriority && (!promoted || Math.log(smallest) + 4 * prominence > Math.log(promoted.smallest) + 4 * promoted.prominence)) priorityBuckets.set(bucket, node)
        }
      }
    }
    const result = [...buckets.values()].sort((a, b) => {
      const quality = (node: LayoutNode) => Math.log(node.smallest) - .35 * Math.abs(Math.log(node.ratio / (width / height)))
      return quality(b) - quality(a)
    }).slice(0, 18)
    const promoted = [...priorityBuckets.values()].sort((a, b) => {
      const quality = (node: LayoutNode) => Math.log(node.smallest) + 4 * node.prominence - .35 * Math.abs(Math.log(node.ratio / (width / height)))
      return quality(b) - quality(a)
    }).slice(0, 18)
    const combined = [...new Set([...result, ...promoted])]
    memo.set(key, combined)
    return combined
  }

  const place = (node: LayoutNode, area: WorkRect, output: WorkRect[], gutter: number, masses?: Map<LayoutNode, number>): boolean => {
    if (area.width <= 0 || area.height <= 0) return false
    if (node.index !== undefined) {
      output[node.index] = area
      return true
    }
    const first = node.first!
    const second = node.second!
    const firstBias = 1 + .25 * first.prominence
    const secondBias = 1 + .25 * second.prominence
    if (node.axis === 'x') {
      const available = area.width - gutter
      const fraction = masses ? masses.get(first)! / masses.get(node)! : first.ratio * firstBias / (first.ratio * firstBias + second.ratio * secondBias)
      const w = available * fraction
      return place(first, { ...area, width: w }, output, gutter, masses)
        && place(second, { ...area, x: area.x + w + gutter, width: available - w }, output, gutter, masses)
    } else {
      const available = area.height - gutter
      const fraction = masses ? masses.get(first)! / masses.get(node)! : second.ratio * firstBias / (second.ratio * firstBias + first.ratio * secondBias)
      const h = available * fraction
      return place(first, { ...area, height: h }, output, gutter, masses)
        && place(second, { ...area, y: area.y + h + gutter, height: available - h }, output, gutter, masses)
    }
  }

  let best: WorkRect[] = []
  let bestScore = -Infinity
  let gutter = Math.max(0, gap)
  // If a viewport is exceptionally small, reduce the shared gutter for the
  // entire mosaic instead of squeezing individual gaps to different widths.
  while (!best.length) {
    bestScore = -Infinity
    const layouts: { rects: WorkRect[]; quality: number; priority: number; respectsPriority: boolean }[] = []
    const evaluate = (output: WorkRect[]) => {
      const areas = output.map(rect => rect.width * rect.height)
      const retained = output.map((rect, index) => {
        const relativeRatio = rect.width / rect.height / mediaRatios[index]
        return Math.min(relativeRatio, 1 / relativeRatio)
      })
      const average = retained.reduce((sum, fraction) => sum + fraction, 0) / count
      const balance = Math.min(...areas) * count / (width * height)
      const prominence = areas.reduce((sum, area, index) => sum + area * weights[index], 0) / areas.reduce((sum, area) => sum + area, 0)
      const violations = priorityPairs.reduce((sum, [high, low]) => sum + Math.max(0, areas[low] - areas[high]) / (areas[low] + areas[high]), 0) / Math.max(1, priorityPairs.length)
      const score = .65 * average + .25 * Math.min(...retained) + .1 * Math.sqrt(balance)
      const respectsPriority = priorityPairs.every(([high, low]) => areas[high] >= areas[low] - 1e-6)
      layouts.push({ rects: output, quality: score, priority: prominence - 4 * violations, respectsPriority })
      if (score > bestScore) { bestScore = score; best = output }
    }
    const options = candidates(0, count)
    for (const candidate of options) {
      const output: WorkRect[] = []
      if (place(candidate, { x: 0, y: 0, width, height }, output, gutter)) evaluate(output)
    }
    if (hasPriority && best.length) {
      // A good crop cannot override an explicit priority. First satisfy the
      // size order among comparable works, then choose the best composition.
      if (!layouts.some(layout => layout.respectsPriority)) {
        // If aspect-based candidates cannot obey the tags, fit explicit area
        // targets to the same ordered trees. Correct for area lost to gutters.
        const targets = weights.map(weight => 1 + 2 * weight)
        const targetTotal = targets.reduce((sum, target) => sum + target, 0)
        for (const candidate of options) {
          const leafMasses = [...targets]
          let output: WorkRect[] = []
          for (let iteration = 0; iteration < 40; iteration++) {
            const masses = new Map<LayoutNode, number>()
            const measure = (node: LayoutNode): number => {
              const mass = node.index !== undefined ? leafMasses[node.index] : measure(node.first!) + measure(node.second!)
              masses.set(node, mass)
              return mass
            }
            measure(candidate)
            output = []
            if (!place(candidate, { x: 0, y: 0, width, height }, output, gutter, masses)) { output = []; break }
            const areas = output.map(rect => rect.width * rect.height)
            if (priorityPairs.every(([high, low]) => areas[high] >= areas[low] - 1e-6)) break
            const total = areas.reduce((sum, area) => sum + area, 0)
            for (let index = 0; index < count; index++) leafMasses[index] *= targets[index] / targetTotal * total / areas[index]
          }
          if (output.length === count) evaluate(output)
        }
      }
      const valid = layouts.filter(layout => layout.respectsPriority)
      best = valid.sort((a, b) => b.quality - a.quality || b.priority - a.priority)[0]?.rects ?? []
    }
    gutter /= 2
  }
  return best
}

