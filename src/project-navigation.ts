export type ProjectPosition = { projectIndex: number; sectionIndex: number }
export type ViewerPosition = ProjectPosition & { selected: number | null }
export type CategoryPosition = ProjectPosition & { categoryIndex: number }
export type CategoryViewerPosition = CategoryPosition & { selected: number | null }
type MediaProject = { media: { path: string }[]; sections: { media: { path: string }[] }[] }

function flattenProjects<T>(projectsByCategory: T[][]) {
  return projectsByCategory.flatMap((projects, categoryIndex) =>
    projects.map((project, projectIndex) => ({ categoryIndex, projectIndex, project })))
}

// Navigate the whole catalog in menu order, keeping category and project atomic.
export function advanceCategorySection(sectionCounts: number[][], position: CategoryPosition, direction: number): CategoryPosition {
  const projects = flattenProjects(sectionCounts.map(counts => counts.length ? counts : [0]))
  const currentIndex = projects.findIndex(item => item.categoryIndex === position.categoryIndex && item.projectIndex === position.projectIndex)
  if (currentIndex < 0 || !direction) return position
  const next = advanceProjectSection(projects.map(item => item.project), { projectIndex: currentIndex, sectionIndex: position.sectionIndex }, direction)
  const target = projects[next.projectIndex]
  return { ...position, categoryIndex: target.categoryIndex, projectIndex: target.projectIndex, sectionIndex: next.sectionIndex }
}

export function advanceCategoryMedia(categories: { projects: MediaProject[] }[], position: CategoryViewerPosition, direction: number): CategoryViewerPosition {
  const projects = flattenProjects(categories.map(category => category.projects))
  const currentIndex = projects.findIndex(item => item.categoryIndex === position.categoryIndex && item.projectIndex === position.projectIndex)
  if (currentIndex < 0 || position.selected === null || !direction) return position
  const next = advanceFullscreenMedia(projects.map(item => item.project), { ...position, projectIndex: currentIndex }, direction)
  const target = projects[next.projectIndex]
  return { ...position, categoryIndex: target.categoryIndex, projectIndex: target.projectIndex, sectionIndex: next.sectionIndex, selected: next.selected }
}

// Treat the category as one carousel, skipping projects without any sections.
export function advanceProjectSection(sectionCounts: number[], position: ProjectPosition, direction: number): ProjectPosition {
  if (!direction || !sectionCounts.some(count => count > 0)) return position
  const step = direction > 0 ? 1 : -1
  const nextSection = position.sectionIndex + step
  if (nextSection >= 0 && nextSection < sectionCounts[position.projectIndex]) {
    return { ...position, sectionIndex: nextSection }
  }
  for (let offset = 1; offset <= sectionCounts.length; offset++) {
    const projectIndex = (position.projectIndex + step * offset + sectionCounts.length) % sectionCounts.length
    const count = sectionCounts[projectIndex]
    if (count > 0) return { projectIndex, sectionIndex: step > 0 ? 0 : count - 1 }
  }
  return position
}

export function advanceFullscreenMedia(projects: MediaProject[], position: ViewerPosition, direction: number): ViewerPosition {
  if (position.selected === null || !direction) return position
  const project = projects[position.projectIndex]
  const current = project?.media[position.selected]
  if (!current) return position
  const sectionIndex = project.sections.findIndex(section => section.media.some(item => item.path === current.path))
  if (sectionIndex < 0) return position
  const step = direction > 0 ? 1 : -1
  const media = project.sections[sectionIndex].media
  const nextIndex = media.findIndex(item => item.path === current.path) + step
  if (nextIndex >= 0 && nextIndex < media.length) {
    const selected = project.media.findIndex(item => item.path === media[nextIndex].path)
    return selected < 0 ? position : { ...position, sectionIndex, selected }
  }
  const counts = projects.map(item => item.sections.length)
  let next: ProjectPosition = { projectIndex: position.projectIndex, sectionIndex }
  for (let i = 0; i < counts.reduce((total, count) => total + count, 0); i++) {
    next = advanceProjectSection(counts, next, step)
    const nextProject = projects[next.projectIndex]
    const nextMedia = nextProject.sections[next.sectionIndex]?.media ?? []
    const target = nextMedia[step > 0 ? 0 : nextMedia.length - 1]
    if (!target) continue
    const selected = nextProject.media.findIndex(item => item.path === target.path)
    if (selected >= 0) return { ...next, selected }
  }
  return position
}
