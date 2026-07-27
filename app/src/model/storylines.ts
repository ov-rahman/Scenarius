import type { Id, Storyline } from './types'

/**
 * Линии живут деревом: корневая — основная, её ветви — второстепенные.
 * Глубина определяет визуальный вес на графе: чем глубже, тем тоньше и бледнее.
 */

/** Насколько глубоко линия сидит в дереве. Корень — 0. */
export function storylineDepth(
  storylineId: Id | null,
  byId: Map<Id, Storyline>,
): number {
  let depth = 0
  let current = storylineId ? byId.get(storylineId) : undefined
  const seen = new Set<Id>()

  while (current?.parentId) {
    // Страховка от цикла: переподчинение линии самой себе не должно вешать граф.
    if (seen.has(current.id)) break
    seen.add(current.id)
    current = byId.get(current.parentId)
    depth += 1
  }

  return depth
}

/**
 * Толщина ребра и непрозрачность узлов линии.
 * Глубже третьего уровня различать на глаз всё равно нельзя, поэтому упираемся.
 */
export function storylineWeight(depth: number): { width: number; opacity: number } {
  const level = Math.min(depth, 3)
  return {
    width: [3, 2, 1.5, 1][level],
    opacity: [1, 0.8, 0.65, 0.5][level],
  }
}

/** Можно ли подчинить линию другой, не создав цикл. */
export function canReparent(
  storylineId: Id,
  nextParentId: Id | null,
  byId: Map<Id, Storyline>,
): boolean {
  if (nextParentId === null) return true
  if (nextParentId === storylineId) return false

  let current = byId.get(nextParentId)
  const seen = new Set<Id>()
  while (current) {
    if (current.id === storylineId) return false
    if (seen.has(current.id)) return false
    seen.add(current.id)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }

  return true
}

/** Линии в порядке обхода дерева — так их показывает панель навигации. */
export function flattenStorylines(
  storylines: Storyline[],
): Array<{ storyline: Storyline; depth: number }> {
  const children = new Map<Id | null, Storyline[]>()
  for (const line of storylines) {
    const list = children.get(line.parentId)
    if (list) list.push(line)
    else children.set(line.parentId, [line])
  }
  for (const list of children.values()) list.sort((a, b) => a.order - b.order)

  const result: Array<{ storyline: Storyline; depth: number }> = []
  const walk = (parentId: Id | null, depth: number) => {
    for (const storyline of children.get(parentId) ?? []) {
      result.push({ storyline, depth })
      walk(storyline.id, depth + 1)
    }
  }
  walk(null, 0)

  return result
}
