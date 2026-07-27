/**
 * Модель данных «Сценариуса».
 *
 * Главные решения, из которых всё вытекает:
 *  - первичны узлы-сцены, а не сплошной документ;
 *  - сюжетные связи ведут только вперёд (граф ациклический),
 *    возвраты выражаются мягкими ссылками и в расчётах не участвуют;
 *  - ключевой момент, знание персонажа и задел — это одна сущность Fact
 *    с разными лицами;
 *  - расклад фактов вычисляется из активного пути, а не задаётся руками.
 */

/**
 * Документ ProseMirror в виде JSON. Описан структурно, а не импортом из Tiptap:
 * модель не должна зависеть от редактора — при переносе на мобильную платформу
 * редактор может смениться, а формат хранения останется прежним.
 */
export interface RichNode {
  type?: string
  attrs?: Record<string, unknown>
  content?: RichNode[]
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  text?: string
  [key: string]: unknown
}

export type RichDoc = RichNode & { type: 'doc' }

export type Id = string

export interface Project {
  id: Id
  title: string
  /** Версия схемы — понадобится при миграциях и при будущей синхронизации. */
  schemaVersion: number
  createdAt: number
  updatedAt: number
}

// ─── Сюжетные линии ──────────────────────────────────────────────────────────

/**
 * Линии образуют дерево: второстепенная не противопоставлена основной,
 * а исходит из неё. Корневая линия (parentId === null) — основная,
 * её ветви — второстепенные, и те, в свою очередь, могут ветвиться дальше.
 * Чем глубже линия, тем тоньше и приглушённее она рисуется на графе.
 */
export interface Storyline {
  id: Id
  projectId: Id
  title: string
  /** CSS-цвет: им красятся узлы линии и её рёбра. */
  color: string
  /** Линия, от которой эта ответвляется. null — корневая, то есть основная. */
  parentId: Id | null
  order: number
}

// ─── Узлы ────────────────────────────────────────────────────────────────────

export type NodeKind =
  | 'normal'
  | 'key' // ключевой момент
  | 'branch' // развилка
  | 'merge' // схождение
  | 'ending' // концовка

export type EndingTone = 'good' | 'bad' | 'neutral' | 'secret'

export interface EndingMeta {
  name: string
  tone: EndingTone
  /** Условия достижения — свободным текстом, для себя. */
  conditions: string
}

export interface StoryNode {
  id: Id
  projectId: Id
  title: string
  doc: RichDoc
  storylineId: Id | null
  kind: NodeKind
  tags: string[]
  /** Позиция на графе. null — раскладывается автоматически. */
  position: { x: number; y: number } | null
  ending: EndingMeta | null
  createdAt: number
  updatedAt: number
}

// ─── Связи ───────────────────────────────────────────────────────────────────

/**
 * story — сюжетная связь, всегда вперёд, участвует в расчёте пути и фактов.
 * soft  — возврат или отсылка: рисуется пунктиром как напоминание,
 *         в расчётах игнорируется, цикл через неё безопасен.
 */
export type LinkKind = 'story' | 'soft'

export interface Link {
  id: Id
  projectId: Id
  from: Id
  to: Id
  /** Подпись выбора на развилке: «Пощадить», «Атаковать». */
  label: string
  kind: LinkKind
  /** Доступность ветки. null — доступна всегда. */
  condition: Condition | null
  order: number
}

// ─── Условия ─────────────────────────────────────────────────────────────────

/**
 * Условие — единственный вид логики в проекте. Применяется в двух местах:
 * к связи (доступна ли ветка) и к блоку текста внутри сцены (виден ли абзац).
 * Только факты, никаких чисел и счётчиков — это осознанная граница.
 */
export interface Condition {
  /** Все перечисленные факты должны быть в текущем раскладе. */
  all: Id[]
  /** Ни одного из перечисленных фактов быть не должно. */
  none: Id[]
}

// ─── Факты ───────────────────────────────────────────────────────────────────

/**
 * Три лица одной сущности:
 *  moment    — ключевой момент: игрок что-то сделал;
 *  knowledge — знание: персонаж что-то узнал;
 *  setup     — задел: заявка, ждущая отыгрыша.
 * Внутри они устроены одинаково — «нечто, случающееся в узле и действующее дальше».
 */
export type FactFace = 'moment' | 'knowledge' | 'setup'

export interface Fact {
  id: Id
  projectId: Id
  face: FactFace
  title: string
  description: string
  /** Узел, в котором факт случается. Для задела — узел-посев. */
  originNodeId: Id | null
  /** Только для знания: чьё оно. */
  characterId: Id | null
  /** Только для задела: узел-отыгрыш. Привязка закрывает задел автоматически. */
  payoffNodeId: Id | null
  /** Только для задела: закрыт вручную, без узла-отыгрыша. */
  closedManually: boolean
  createdAt: number
  updatedAt: number
}

// ─── Персонажи ───────────────────────────────────────────────────────────────

export interface Character {
  id: Id
  projectId: Id
  name: string
  aliases: string[]
  personality: string
  motivation: string
  /** Манера поведения и речи. */
  manner: string
  color: string
}

// ─── Маршруты ────────────────────────────────────────────────────────────────

/**
 * Активный путь — это стартовый узел плюс выбор ветки на каждой развилке.
 * Из него вычисляется и последовательность сцен для ленты письма,
 * и расклад фактов, под который перестраиваются условия.
 * Сохранённый маршрут — способ вернуться к прохождению («пацифист», «геноцид»).
 */
export interface Route {
  id: Id
  projectId: Id
  title: string
  startNodeId: Id | null
  /** nodeId → выбранный из него linkId. */
  choices: Record<Id, Id>
}

// ─── Настройки ───────────────────────────────────────────────────────────────

export type ThemeMode = 'light' | 'dark'

export interface Settings {
  key: 'settings'
  theme: ThemeMode
  lastProjectId: Id | null
  /** Когда последний раз выгружали копию — для напоминания об экспорте. */
  lastExportAt: number | null
}
