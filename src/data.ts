import catalog from 'virtual:portfolio-assets'

export interface PortfolioMedia {
  name: string
  path: string
  kind: 'image' | 'video'
  width: number
  height: number
  preview?: string
  priority?: number
}

export interface PortfolioProject {
  id: string
  title: string
  media: PortfolioMedia[]
  sections: { id: string; media: PortfolioMedia[] }[]
  copyright?: { text: string; font?: string; size?: number; color?: string }
}

export interface JarSettings {
  scale?: number
  rotation?: number
  position?: { x?: number; y?: number }
  mobilePosition?: { x?: number; y?: number }
  indexAnchor?: { x: number; y: number }
  seed?: number
  particleCount?: number
  blueberryCount?: number | null
  blueberrySize?: number
  particleSize?: number
  particleColor?: string
  particleZone?: import('./jar-geometry').ParticleZone
}

export interface Category {
  id: string
  number: string
  title: string
  jarPath: string
  mobileJar?: { path: string; width: number; height: number }
  jarLayers: { path: string; blendMode: 'normal' | 'multiply' | 'lighten' | 'luminosity' | 'color-burn'; placement?: 'interior' | 'foreground' }[]
  glassPolygon?: import('./jar-geometry').GlassPolygon
  jarSettings: JarSettings
  projects: PortfolioProject[]
}

export interface JarConfig {
  id: string
  categoryId: string
  image: string
  mobileImage?: { image: string; width: number; height: number }
  layers: { image: string; blendMode: 'normal' | 'multiply' | 'lighten' | 'luminosity' | 'color-burn'; placement?: 'interior' | 'foreground' }[]
  glassPolygon?: import('./jar-geometry').GlassPolygon
  rotation: number
  scale: number
  x: number
  y: number
  mobileX: number
  mobileY: number
  indexAnchor?: { x: number; y: number }
  seed: number
  particleCount: number
  blueberryCount?: number
  blueberrySize?: number
  particleSize: number
  particleColor: string
  particleZone?: import('./jar-geometry').ParticleZone
}

export const assetUrl = (path: string) => import.meta.env.BASE_URL + path
export const blueberryUrl = assetUrl('blueberries/base.svg')
export const blueberrySplashUrl = assetUrl('blueberries/splash.svg')
export const categories: Category[] = catalog.map((category, index) => ({
  ...category, number: String(index + 1).padStart(2, '0'),
}))

// Balanced rows above and below the central title, without a fixed category limit.
const rowCount = Math.max(2, Math.ceil(categories.length / 4))
const mobileRows = Math.max(2, Math.ceil(categories.length / 2))
const stageHeightFor = (rows: number, mobile: boolean) => mobile
  ? Math.max(740, Math.ceil(rows / 2) * 400 + 220)
  : rows === 2 ? 540 : Math.ceil(rows / 2) * 560 + 220
function position(index: number, rows: number, mobile = false) {
  const columns = Math.ceil(categories.length / rows)
  const row = Math.floor(index / columns)
  const count = Math.min(columns, categories.length - row * columns)
  const upperRows = Math.ceil(rows / 2)
  const upper = row < upperRows
  const stageHeight = stageHeightFor(rows, mobile)
  const gap = 220
  const bandHeight = (stageHeight - gap) / 2
  const localRow = upper ? row : row - upperRows
  const bandRows = upper ? upperRows : rows - upperRows
  return {
    x: (index % columns + .5) * 100 / count,
    y: ((localRow + .5) * bandHeight / bandRows + (upper ? 0 : bandHeight + gap)) / stageHeight * 100,
  }
}

export const jars: JarConfig[] = categories.map((category, index) => {
  const desktop = position(index, rowCount)
  const mobile = position(index, mobileRows, true)
  const settings = category.jarSettings
  return {
    id: `jar-${category.number}`, categoryId: category.id, image: assetUrl(category.jarPath),
    mobileImage: category.mobileJar ? { image: assetUrl(category.mobileJar.path), width: category.mobileJar.width, height: category.mobileJar.height } : undefined,
    layers: category.jarLayers.map(layer => ({ image: assetUrl(layer.path), blendMode: layer.blendMode, placement: layer.placement })),
    glassPolygon: category.glassPolygon,
    rotation: settings.rotation ?? (index * 47 % 61) - 30, scale: settings.scale ?? 1,
    x: settings.position?.x ?? desktop.x, y: settings.position?.y ?? desktop.y,
    mobileX: settings.mobilePosition?.x ?? mobile.x, mobileY: settings.mobilePosition?.y ?? mobile.y,
    indexAnchor: settings.indexAnchor,
    seed: settings.seed ?? 11 + index * 13, particleCount: settings.particleCount ?? 11,
    blueberryCount: settings.blueberryCount ?? undefined, blueberrySize: settings.blueberrySize,
    particleSize: settings.particleSize ?? 1, particleColor: settings.particleColor ?? '#ff8b10',
    particleZone: settings.particleZone,
  }
})

// Two desktop rows fit the viewport; larger archives reserve scrollable space.
export const desktopStageHeight = rowCount === 2 ? 0 : stageHeightFor(rowCount, false)
export const mobileStageHeight = stageHeightFor(mobileRows, true)
