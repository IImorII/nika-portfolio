import type { CSSProperties } from 'react'
import type { Category, JarConfig } from '../data'

// Mobile loads one precomposed image and never mounts the pixel analysis,
// layered textures or simulation used by the desktop jar.
export default function MobileJar({ jar, project, onOpen }: { jar: JarConfig; project: Category; onOpen: (project: Category, rect: DOMRect) => void }) {
  const image = jar.mobileImage!
  const style = {
    '--x': `${jar.x}%`, '--y': `${jar.y}%`, '--mx': `${jar.mobileX}%`, '--my': `${jar.mobileY}%`,
    '--rotation': `${jar.rotation}deg`, '--scale': jar.scale, '--jar-aspect': image.width / image.height,
  } as CSSProperties
  return <button className="jar-button mobile-jar" style={style} type="button" aria-label={`Open ${project.title}`} data-interactive="true" data-jar-number={project.number}
    onClick={event => onOpen(project, event.currentTarget.getBoundingClientRect())}>
    <span className="jar-body"><img className="jar-photo" src={image.image} width={image.width} height={image.height} alt="" draggable="false" decoding="async" fetchPriority={project.number === '01' || project.number === '02' ? 'high' : 'auto'} /></span>
    <span className={'jar-index-anchor' + (jar.indexAnchor ? ' jar-index-anchor-custom' : '')} style={jar.indexAnchor ? { left: `${jar.indexAnchor.x}%`, top: `${jar.indexAnchor.y}%` } : undefined} aria-hidden="true">{project.number}</span>
  </button>
}
