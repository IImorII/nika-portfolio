import { nearestEdge, validatePoints } from './geometry.mjs'

const svgNS = 'http://www.w3.org/2000/svg'
const clone = value => structuredClone(value)
const clamp = value => Math.max(0, Math.min(1, value))
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const states = []
const dialog = document.querySelector('#zoom')
let zoomed
function unzoom() { if (zoomed) { zoomed.placeholder.replaceWith(zoomed.card); zoomed = null } }
document.querySelector('#close-zoom').onclick = () => dialog.close()
dialog.addEventListener('close', unzoom)
window.addEventListener('beforeunload', event => { if (states.some(state => !equal(state.points, state.saved))) { event.preventDefault(); event.returnValue = '' } })

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}
function svgElement(tag, attributes) {
  const node = document.createElementNS(svgNS, tag)
  for (const [key, value] of Object.entries(attributes ?? {})) node.setAttribute(key, value)
  return node
}
function button(text, action, className) { const node = element('button', className, text); node.type = 'button'; node.onclick = action; return node }

function renderJar(jar, index) {
  const state = { jar, points: clone(jar.points), saved: clone(jar.points), selected: 0, history: [clone(jar.points)], cursor: 0, saving: false, message: '', success: false }
  states.push(state)
  const card = element('section', 'card'); card.dataset.jar = jar.id; card.setAttribute('aria-label', jar.title)
  const header = element('div', 'card-head'), title = element('h2')
  title.append(element('span', 'number', jar.number), document.createTextNode(jar.title))
  const enlarge = button('Открыть крупно ↗', () => {
    const placeholder = document.createComment('jar card')
    card.replaceWith(placeholder); zoomed = { card, placeholder }
    document.querySelector('#zoom-content').append(card); dialog.showModal()
  }, 'enlarge')
  header.append(title, enlarge); card.append(header)
  const picture = element('div', 'picture'); picture.style.aspectRatio = `${jar.width} / ${jar.height}`
  for (const layer of jar.images) {
    const image = element('img'); image.src = layer.url; image.alt = ''; image.draggable = false; image.style.mixBlendMode = layer.blendMode
    image.onerror = () => { state.message = 'Не удалось загрузить изображение. Обновите страницу.'; update() }
    picture.append(image)
  }
  const svg = svgElement('svg', { viewBox: '0 0 1000 1000', preserveAspectRatio: 'none', 'aria-label': `Контур ${jar.title}` })
  const fill = svgElement('polygon', { class: 'zone', style: 'stroke:none' })
  const glass = svgElement('polygon', { class: 'glass', points: (jar.glass ?? []).map(([x, y]) => `${x * 1000},${y * 1000}`).join(' ') })
  const line = svgElement('polygon', { class: 'zone', style: 'fill:none' }), vertices = svgElement('g')
  svg.append(fill, glass, line, vertices); picture.append(svg); card.append(picture)
  const selection = element('div', 'selection'), selectedLabel = element('span')
  const inputs = ['X, %', 'Y, %'].map((text, axis) => {
    const label = element('label', '', text), input = element('input')
    input.type = 'number'; input.min = '0'; input.max = '100'; input.step = '.1'; input.setAttribute('aria-label', `${text} выбранной вершины`)
    input.onchange = () => {
      if (input.value.trim() === '' || !Number.isFinite(Number(input.value))) { update(); return }
      state.points[state.selected][axis] = clamp(Number(input.value) / 100); commit(); update()
    }
    label.append(input); selection.append(label); return input
  })
  selection.prepend(selectedLabel); card.append(selection)
  const actions = element('div', 'actions')
  const undo = button('Отменить', () => { state.points = clone(state.history[--state.cursor]); state.selected = Math.min(state.selected, state.points.length - 1); state.message = ''; update() })
  const redo = button('Вернуть', () => { state.points = clone(state.history[++state.cursor]); state.selected = Math.min(state.selected, state.points.length - 1); state.message = ''; update() })
  const remove = button('Удалить точку', removePoint)
  const reset = button('Сбросить правки', () => { state.points = clone(state.saved); state.selected = 0; commit(); update() })
  const save = button('Save', async () => {
    state.saving = true; state.message = 'Сохраняем…'; update()
    try {
      const response = await fetch(`/api/jars/${encodeURIComponent(jar.id)}/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ points: state.points, revision: jar.revision }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      state.points = clone(result.points); state.saved = clone(result.points); jar.revision = result.revision; commit()
      state.message = 'Сохранено в settings.json'; state.success = true
    } catch (error) { state.message = error.message; state.success = false }
    finally { state.saving = false; update() }
  }, 'save')
  actions.append(undo, redo, remove, reset, save); card.append(actions)
  const status = element('p', 'status'); status.setAttribute('role', 'status'); const file = element('span', 'file', jar.settingsPath)
  card.append(status, file)
  let dragging = null
  function coordinates(event) { const rect = svg.getBoundingClientRect(); return [clamp((event.clientX - rect.left) / rect.width), clamp((event.clientY - rect.top) / rect.height)] }
  function commit() {
    if (!equal(state.points, state.history[state.cursor])) { state.history = state.history.slice(0, state.cursor + 1); state.history.push(clone(state.points)); state.cursor++ }
    state.message = ''; state.success = false
  }
  function removePoint() { if (state.points.length > 3) { state.points.splice(state.selected, 1); state.selected = Math.min(state.selected, state.points.length - 1); commit(); update() } }
  function update() {
    const points = state.points.map(([x, y]) => `${x * 1000},${y * 1000}`).join(' '); fill.setAttribute('points', points); line.setAttribute('points', points)
    if (vertices.children.length !== state.points.length) {
      vertices.replaceChildren(...state.points.map((_, i) => svgElement('circle', { class: 'vertex', r: '10', tabindex: '0', role: 'button', 'data-index': i, 'aria-label': `Вершина ${i + 1}` })))
    }
    state.points.forEach(([x, y], i) => { const node = vertices.children[i]; node.setAttribute('cx', x * 1000); node.setAttribute('cy', y * 1000); node.setAttribute('class', `vertex${i === state.selected ? ' selected' : ''}`); node.setAttribute('aria-pressed', String(i === state.selected)) })
    selectedLabel.textContent = `Точка ${state.selected + 1} / ${state.points.length}`
    inputs.forEach((input, axis) => { input.value = (state.points[state.selected][axis] * 100).toFixed(3); input.disabled = state.saving })
    let invalid
    try { validatePoints(state.points) } catch (error) { invalid = error.message }
    const dirty = !equal(state.points, state.saved)
    save.disabled = !dirty || !!invalid || state.saving || dragging !== null
    undo.disabled = state.cursor === 0 || state.saving; redo.disabled = state.cursor === state.history.length - 1 || state.saving
    remove.disabled = state.points.length <= 3 || state.saving; reset.disabled = !dirty || state.saving; enlarge.disabled = state.saving
    status.textContent = invalid ?? (state.message || (dirty ? 'Есть несохранённые изменения' : 'Контур сохранён. Можно редактировать.'))
    status.className = `status${invalid || (state.message && !state.success && !state.saving) ? ' error' : state.success ? ' success' : ''}`
  }
  svg.addEventListener('pointerdown', event => {
    if (state.saving || event.button !== 0 || !event.target.matches('.vertex')) return
    event.preventDefault(); state.selected = Number(event.target.dataset.index); dragging = { pointer: event.pointerId, before: clone(state.points) }
    svg.setPointerCapture(event.pointerId); event.target.focus(); state.message = ''; update()
  })
  svg.addEventListener('focusin', event => { if (event.target.matches('.vertex') && !state.saving) { state.selected = Number(event.target.dataset.index); update() } })
  svg.addEventListener('pointermove', event => { if (dragging && event.pointerId === dragging.pointer) { state.points[state.selected] = coordinates(event); update() } })
  function endDrag(event, cancelled = false) {
    if (!dragging || event.pointerId !== dragging.pointer) return
    if (cancelled) state.points = dragging.before
    dragging = null; if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId); commit(); update()
  }
  svg.addEventListener('pointerup', event => endDrag(event)); svg.addEventListener('pointercancel', event => endDrag(event, true))
  svg.addEventListener('lostpointercapture', event => endDrag(event))
  svg.addEventListener('dblclick', event => {
    if (state.saving || event.target.matches('.vertex') || state.points.length >= 200) return
    const edge = nearestEdge(state.points, coordinates(event)), rect = svg.getBoundingClientRect()
    if (edge.distance * Math.min(rect.width, rect.height) > 25) return
    state.points.splice(edge.index + 1, 0, edge.point); state.selected = edge.index + 1; commit(); update()
  })
  svg.addEventListener('keydown', event => {
    if (state.saving || !event.target.matches('.vertex')) return
    state.selected = Number(event.target.dataset.index)
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removePoint(); return }
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
    if (delta) { event.preventDefault(); state.points[state.selected] = state.points[state.selected].map((value, axis) => clamp(value + delta[axis] * (event.shiftKey ? .01 : .001))); commit(); update() }
  })
  update(); return card
}

try {
  const response = await fetch('/api/jars'), result = await response.json()
  if (!response.ok) throw new Error(result.error)
  document.querySelector('.badge').textContent = `${result.jars.length} банок · без поворотов`
  document.querySelector('#jars').append(...result.jars.map(renderJar))
  document.querySelector('#page-status').textContent = result.jars.length ? '' : 'Банки с папкой jar не найдены.'
} catch (error) { document.querySelector('#page-status').textContent = error.message }
