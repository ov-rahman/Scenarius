import Dexie, { type EntityTable } from 'dexie'
import type {
  Character,
  Fact,
  Link,
  Project,
  Route,
  Settings,
  StoryNode,
  Storyline,
} from './types'

export const SCHEMA_VERSION = 1

/**
 * Локальное хранилище. Источник истины на первом этапе — только оно.
 * Каждая запись несёт updatedAt: когда появится синхронизация с GitHub,
 * она сможет сливать изменения без переписывания модели.
 */
class ScenariusDb extends Dexie {
  projects!: EntityTable<Project, 'id'>
  storylines!: EntityTable<Storyline, 'id'>
  nodes!: EntityTable<StoryNode, 'id'>
  links!: EntityTable<Link, 'id'>
  facts!: EntityTable<Fact, 'id'>
  characters!: EntityTable<Character, 'id'>
  routes!: EntityTable<Route, 'id'>
  settings!: EntityTable<Settings, 'key'>

  constructor() {
    super('scenarius')
    this.version(1).stores({
      projects: 'id, updatedAt',
      storylines: 'id, projectId, order',
      nodes: 'id, projectId, storylineId, kind, updatedAt',
      links: 'id, projectId, from, to, kind',
      facts: 'id, projectId, face, originNodeId, characterId, payoffNodeId',
      characters: 'id, projectId, name',
      routes: 'id, projectId',
      settings: 'key',
    })
  }
}

export const db = new ScenariusDb()

/** Весь проект одним объектом — формат экспорта и импорта. */
export interface ProjectBundle {
  schemaVersion: number
  project: Project
  storylines: Storyline[]
  nodes: StoryNode[]
  links: Link[]
  facts: Fact[]
  characters: Character[]
  routes: Route[]
}

export async function exportProject(projectId: string): Promise<ProjectBundle> {
  const [project, storylines, nodes, links, facts, characters, routes] =
    await Promise.all([
      db.projects.get(projectId),
      db.storylines.where({ projectId }).toArray(),
      db.nodes.where({ projectId }).toArray(),
      db.links.where({ projectId }).toArray(),
      db.facts.where({ projectId }).toArray(),
      db.characters.where({ projectId }).toArray(),
      db.routes.where({ projectId }).toArray(),
    ])

  if (!project) throw new Error(`Проект ${projectId} не найден`)

  return {
    schemaVersion: SCHEMA_VERSION,
    project,
    storylines,
    nodes,
    links,
    facts,
    characters,
    routes,
  }
}

export async function importProject(bundle: ProjectBundle): Promise<string> {
  if (bundle.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      'Файл сохранён более новой версией приложения — обнови вкладку и попробуй снова',
    )
  }

  await db.transaction(
    'rw',
    [db.projects, db.storylines, db.nodes, db.links, db.facts, db.characters, db.routes],
    async () => {
      await db.projects.put(bundle.project)
      await db.storylines.bulkPut(bundle.storylines)
      await db.nodes.bulkPut(bundle.nodes)
      await db.links.bulkPut(bundle.links)
      await db.facts.bulkPut(bundle.facts)
      await db.characters.bulkPut(bundle.characters)
      await db.routes.bulkPut(bundle.routes)
    },
  )

  return bundle.project.id
}
