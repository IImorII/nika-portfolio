/// <reference types="vite/client" />

declare module 'virtual:portfolio-assets' {
  const catalog: {
    id: string
    title: string
    jarPath: string
    mobileJar?: import('./data').Category['mobileJar']
    jarLayers: import('./data').Category['jarLayers']
    glassPolygon?: import('./data').Category['glassPolygon']
    jarSettings: import('./data').JarSettings
    projects: import('./data').PortfolioProject[]
  }[]
  export default catalog
}
