export type Fabric = 'gingham-red' | 'gingham-blue' | 'floral' | 'paisley' | 'stripe' | 'embroidered' | 'vintage' | 'patchwork'
export type JarShape = 'mason' | 'tall' | 'squat' | 'wide' | 'hex' | 'bottle' | 'ribbed' | 'round'

export interface Project {
  id: string
  number: string
  title: string
  year: string
  type: string
  description: string
  images: string[]
  accent: string
}

export interface JarConfig {
  id: string
  projectId: string
  shape: JarShape
  fabric: Fabric
  rotation: number
  scale: number
  x: number
  y: number
  mobileX: number
  mobileY: number
  seed: number
  particleCount: number
}

// Replace demo projects and /public/projects images here when the real portfolio is ready.
export const projects: Project[] = Array.from({ length: 8 }, (_, index) => {
  const number = String(index + 1).padStart(2, '0')
  const types = ['Identity', 'Editorial', 'Campaign', 'Packaging', 'Art direction', 'Digital', 'Photography', 'Objects']
  return {
    id: `project-${number}`,
    number,
    title: `Project ${number}`,
    year: '20—',
    type: types[index],
    description: 'A space for the story behind this project. Add the concept, collaborators, role and outcome here when the work is ready to share.',
    images: [`${import.meta.env.BASE_URL}projects/study-${(index % 4) + 1}.svg`, `${import.meta.env.BASE_URL}projects/study-${((index + 1) % 4) + 1}.svg`],
    accent: ['#ccd3b9', '#d9b8ac', '#c9c8dd', '#ecd5a8', '#b8ccd1', '#d5c5a8', '#c4ccaa', '#d6bdbb'][index],
  }
})

// Coordinates are percentages of the desktop and mobile composition canvases.
export const jars: JarConfig[] = [
  { id: 'jar-01', projectId: 'project-01', shape: 'tall', fabric: 'gingham-red', rotation: -12, scale: 1.04, x: 10, y: 20, mobileX: 15, mobileY: 12, seed: 11, particleCount: 5 },
  { id: 'jar-02', projectId: 'project-02', shape: 'squat', fabric: 'floral', rotation: 24, scale: .94, x: 30, y: 13, mobileX: 70, mobileY: 9, seed: 23, particleCount: 4 },
  { id: 'jar-03', projectId: 'project-03', shape: 'bottle', fabric: 'gingham-blue', rotation: 76, scale: 1.04, x: 59, y: 18, mobileX: 19, mobileY: 31, seed: 37, particleCount: 5 },
  { id: 'jar-04', projectId: 'project-04', shape: 'round', fabric: 'paisley', rotation: -18, scale: 1.01, x: 85, y: 20, mobileX: 78, mobileY: 30, seed: 43, particleCount: 4 },
  { id: 'jar-05', projectId: 'project-05', shape: 'wide', fabric: 'stripe', rotation: 66, scale: 1.07, x: 8, y: 74, mobileX: 13, mobileY: 64, seed: 59, particleCount: 4 },
  { id: 'jar-06', projectId: 'project-06', shape: 'mason', fabric: 'embroidered', rotation: -22, scale: 1.05, x: 31, y: 82, mobileX: 75, mobileY: 60, seed: 61, particleCount: 5 },
  { id: 'jar-07', projectId: 'project-07', shape: 'hex', fabric: 'vintage', rotation: 14, scale: 1.03, x: 62, y: 77, mobileX: 22, mobileY: 85, seed: 79, particleCount: 5 },
  { id: 'jar-08', projectId: 'project-08', shape: 'ribbed', fabric: 'patchwork', rotation: -85, scale: .99, x: 87, y: 72, mobileX: 79, mobileY: 84, seed: 83, particleCount: 4 },
]
