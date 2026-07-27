import { nanoid } from 'nanoid'
import { create } from 'zustand'
import { db, SCHEMA_VERSION } from '../model/db'
import type {
  Character,
  Fact,
  Id,
  Link,
  Project,
  RichDoc,
  StoryNode,
  Storyline,
  ThemeMode,
} from '../model/types'

const emptyDoc: RichDoc = { type: 'doc', content: [{ type: 'paragraph' }] }

const now = () => Date.now()

/**
 * Текст сцены пишется в базу не на каждую букву, а через паузу в наборе.
 * Очередь держим здесь, а не внутри компонента: структурная правка (новая
 * сцена, развилка) обязана сначала дописать несохранённое, иначе набранное
 * между последней паузой и кликом теряется.
 */
const SAVE_DELAY = 400
const pendingDocs = new Map<Id, RichDoc>()
let flushTimer: number | undefined

interface State {
  ready: boolean
  theme: ThemeMode
  projects: Project[]
  projectId: Id | null

  storylines: Storyline[]
  nodes: StoryNode[]
  links: Link[]
  facts: Fact[]
  characters: Character[]

  /** Активный путь: стартовый узел и выбор ветки на каждой развилке. */
  startNodeId: Id | null
  choices: Record<Id, Id>

  /** Сцена, на которой стоит курсор — под неё подсвечивается граф и панели. */
  focusedNodeId: Id | null

  /** Когда последний раз выгружали копию — для напоминания об экспорте. */
  lastExportAt: number | null
}

interface Actions {
  init: () => Promise<void>
  setTheme: (theme: ThemeMode) => Promise<void>

  createProject: (title: string) => Promise<Id>
  openProject: (id: Id) => Promise<void>
  closeProject: () => void

  /** Плюсик между двумя сценами: новая сцена встаёт в разрыв связи. */
  insertSceneInto: (linkId: Id) => Promise<Id>
  /** Плюсик в конце ленты: сцена дописывается следом. */
  appendScene: (afterNodeId: Id) => Promise<Id>
  /** Плюсик «развилка»: ещё одна ветка из той же сцены. */
  addBranch: (fromNodeId: Id, label?: string) => Promise<Id>

  /** Набор текста: в состоянии сразу, в базу — через паузу. */
  queueNodeDoc: (nodeId: Id, doc: RichDoc) => void
  /** Досрочно дописать всё, что ждёт очереди. */
  flushDocs: () => Promise<void>
  updateNodeTitle: (nodeId: Id, title: string) => Promise<void>
  chooseBranch: (nodeId: Id, linkId: Id) => void
  focusNode: (nodeId: Id | null) => void
}

export const useStore = create<State & Actions>((set, get) => ({
  ready: false,
  theme: 'light',
  projects: [],
  projectId: null,
  storylines: [],
  nodes: [],
  links: [],
  facts: [],
  characters: [],
  startNodeId: null,
  choices: {},
  focusedNodeId: null,
  lastExportAt: null,

  async init() {
    const [settings, projects] = await Promise.all([
      db.settings.get('settings'),
      db.projects.orderBy('updatedAt').reverse().toArray(),
    ])

    set({
      theme: settings?.theme ?? 'light',
      lastExportAt: settings?.lastExportAt ?? null,
      projects,
      ready: true,
    })

    if (settings?.lastProjectId) {
      const exists = projects.some((p) => p.id === settings.lastProjectId)
      if (exists) await get().openProject(settings.lastProjectId)
    }
  },

  async setTheme(theme) {
    set({ theme })
    await persistSettings(get())
  },

  async createProject(title) {
    const id = nanoid()
    const stamp = now()

    const project: Project = {
      id,
      title: title.trim() || 'Без названия',
      schemaVersion: SCHEMA_VERSION,
      createdAt: stamp,
      updatedAt: stamp,
    }

    // Пустой проект бесполезен: сразу даём основную линию и первую сцену,
    // чтобы было куда поставить курсор.
    const storyline: Storyline = {
      id: nanoid(),
      projectId: id,
      title: 'Основная линия',
      color: '#4f46e5',
      parentId: null,
      order: 0,
    }

    const node: StoryNode = {
      id: nanoid(),
      projectId: id,
      title: 'Начало',
      doc: emptyDoc,
      storylineId: storyline.id,
      kind: 'normal',
      tags: [],
      position: null,
      ending: null,
      createdAt: stamp,
      updatedAt: stamp,
    }

    await db.transaction('rw', [db.projects, db.storylines, db.nodes], async () => {
      await db.projects.add(project)
      await db.storylines.add(storyline)
      await db.nodes.add(node)
    })

    set({ projects: [project, ...get().projects] })
    await get().openProject(id)
    return id
  },

  async openProject(projectId) {
    await get().flushDocs()
    const [storylines, nodes, links, facts, characters, routes] =
      await Promise.all([
        db.storylines.where({ projectId }).toArray(),
        db.nodes.where({ projectId }).toArray(),
        db.links.where({ projectId }).toArray(),
        db.facts.where({ projectId }).toArray(),
        db.characters.where({ projectId }).toArray(),
        db.routes.where({ projectId }).toArray(),
      ])

    const route = routes[0]

    set({
      projectId,
      storylines,
      nodes,
      links,
      facts,
      characters,
      startNodeId: route?.startNodeId ?? null,
      choices: route?.choices ?? {},
      focusedNodeId: null,
    })

    await persistSettings(get())
  },

  closeProject() {
    set({
      projectId: null,
      storylines: [],
      nodes: [],
      links: [],
      facts: [],
      characters: [],
      startNodeId: null,
      choices: {},
      focusedNodeId: null,
    })
  },

  async insertSceneInto(linkId) {
    await get().flushDocs()
    const { links, nodes, projectId } = get()
    const link = links.find((l) => l.id === linkId)
    if (!link || !projectId) throw new Error('Связь не найдена')

    const source = nodes.find((n) => n.id === link.from)
    const node = await createNode(projectId, source?.storylineId ?? null)

    // Связь A→B превращается в A→N, и добавляется N→B: сцена встаёт в разрыв.
    const tail: Link = {
      id: nanoid(),
      projectId,
      from: node.id,
      to: link.to,
      label: '',
      kind: 'story',
      condition: null,
      order: 0,
    }

    await db.transaction('rw', [db.nodes, db.links], async () => {
      await db.nodes.add(node)
      await db.links.update(linkId, { to: node.id })
      await db.links.add(tail)
    })

    set({
      nodes: [...get().nodes, node],
      links: [
        ...get().links.map((l) => (l.id === linkId ? { ...l, to: node.id } : l)),
        tail,
      ],
      focusedNodeId: node.id,
    })

    return node.id
  },

  async appendScene(afterNodeId) {
    await get().flushDocs()
    const { nodes, links, projectId } = get()
    if (!projectId) throw new Error('Проект не открыт')

    const source = nodes.find((n) => n.id === afterNodeId)
    const node = await createNode(projectId, source?.storylineId ?? null)

    const order = links.filter((l) => l.from === afterNodeId).length
    const link: Link = {
      id: nanoid(),
      projectId,
      from: afterNodeId,
      to: node.id,
      label: '',
      kind: 'story',
      condition: null,
      order,
    }

    await db.transaction('rw', [db.nodes, db.links], async () => {
      await db.nodes.add(node)
      await db.links.add(link)
    })

    set({
      nodes: [...get().nodes, node],
      links: [...get().links, link],
      focusedNodeId: node.id,
    })

    return node.id
  },

  async addBranch(fromNodeId, label = '') {
    await get().flushDocs()
    const { nodes, links, projectId } = get()
    if (!projectId) throw new Error('Проект не открыт')

    const source = nodes.find((n) => n.id === fromNodeId)
    const node = await createNode(projectId, source?.storylineId ?? null)

    const siblings = links.filter((l) => l.from === fromNodeId && l.kind === 'story')
    const link: Link = {
      id: nanoid(),
      projectId,
      from: fromNodeId,
      to: node.id,
      label,
      kind: 'story',
      condition: null,
      order: siblings.length,
    }

    // Со второй исходящей связи сцена становится развилкой — помечаем её,
    // чтобы граф и лента показывали это без дополнительных вычислений.
    const becomesBranch = siblings.length >= 1 && source && source.kind === 'normal'

    await db.transaction('rw', [db.nodes, db.links], async () => {
      await db.nodes.add(node)
      await db.links.add(link)
      if (becomesBranch) await db.nodes.update(fromNodeId, { kind: 'branch' })
    })

    set({
      nodes: [...get().nodes, node].map((n) =>
        becomesBranch && n.id === fromNodeId ? { ...n, kind: 'branch' } : n,
      ),
      links: [...get().links, link],
      focusedNodeId: node.id,
    })

    return node.id
  },

  queueNodeDoc(nodeId, doc) {
    const updatedAt = now()
    set({
      nodes: get().nodes.map((n) => (n.id === nodeId ? { ...n, doc, updatedAt } : n)),
    })

    pendingDocs.set(nodeId, doc)
    window.clearTimeout(flushTimer)
    flushTimer = window.setTimeout(() => void get().flushDocs(), SAVE_DELAY)
  },

  async flushDocs() {
    if (pendingDocs.size === 0) return

    window.clearTimeout(flushTimer)
    const batch = [...pendingDocs.entries()]
    pendingDocs.clear()

    const updatedAt = now()
    await db.transaction('rw', db.nodes, async () => {
      for (const [nodeId, doc] of batch) {
        await db.nodes.update(nodeId, { doc, updatedAt })
      }
    })
  },

  async updateNodeTitle(nodeId, title) {
    const updatedAt = now()
    set({
      nodes: get().nodes.map((n) => (n.id === nodeId ? { ...n, title, updatedAt } : n)),
    })
    await db.nodes.update(nodeId, { title, updatedAt })
  },

  chooseBranch(nodeId, linkId) {
    const choices = { ...get().choices, [nodeId]: linkId }
    set({ choices })
    void persistRoute(get().projectId, get().startNodeId, choices)
  },

  focusNode(nodeId) {
    set({ focusedNodeId: nodeId })
  },
}))

/** Настройки — одна запись, пишем её целиком из состояния. */
async function persistSettings(state: State) {
  await db.settings.put({
    key: 'settings',
    theme: state.theme,
    lastProjectId: state.projectId,
    lastExportAt: state.lastExportAt,
  })
}

async function createNode(projectId: Id, storylineId: Id | null): Promise<StoryNode> {
  const stamp = now()
  return {
    id: nanoid(),
    projectId,
    title: '',
    doc: emptyDoc,
    storylineId,
    kind: 'normal',
    tags: [],
    position: null,
    ending: null,
    createdAt: stamp,
    updatedAt: stamp,
  }
}

/** Маршрут хранится один на проект, пока сохранённых маршрутов нет в интерфейсе. */
async function persistRoute(
  projectId: Id | null,
  startNodeId: Id | null,
  choices: Record<Id, Id>,
) {
  if (!projectId) return
  const existing = await db.routes.where({ projectId }).first()
  if (existing) {
    await db.routes.update(existing.id, { startNodeId, choices })
  } else {
    await db.routes.add({
      id: nanoid(),
      projectId,
      title: 'Текущий путь',
      startNodeId,
      choices,
    })
  }
}
