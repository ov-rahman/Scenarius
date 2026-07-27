import type { Condition, Fact, Id, Link, Route, StoryNode } from './types'

/**
 * Активный путь — стержень всего приложения.
 *
 * Из него получаются сразу три вещи:
 *  - последовательность сцен для ленты письма;
 *  - расклад фактов на каждом шаге (что игрок сделал, что персонажи знают);
 *  - доступность веток, потому что условие на связи проверяется по этому раскладу.
 *
 * Мягкие связи (kind === 'soft') здесь не участвуют вообще: они существуют
 * только как пометка на графе, и именно поэтому цикл через них ничего не ломает.
 */

export interface PathStep {
  nodeId: Id
  /** Доступные сюжетные ветки из этого узла, с учётом накопленных фактов. */
  available: Link[]
  /** Ветки, отсечённые условием: показываем их погашенными, а не прячем. */
  blocked: Link[]
  /** Выбранная ветка — по ней путь идёт дальше. */
  chosenLinkId: Id | null
  /** Факты, действующие сразу после этой сцены. */
  facts: Set<Id>
}

export function evaluateCondition(
  condition: Condition | null,
  facts: ReadonlySet<Id>,
): boolean {
  if (!condition) return true
  if (condition.all.some((id) => !facts.has(id))) return false
  if (condition.none.some((id) => facts.has(id))) return false
  return true
}

/** Узлы без входящих сюжетных связей — кандидаты в начало сценария. */
export function findStartNodes(nodes: StoryNode[], links: Link[]): StoryNode[] {
  const hasIncoming = new Set(
    links.filter((l) => l.kind === 'story').map((l) => l.to),
  )
  return nodes.filter((n) => !hasIncoming.has(n.id))
}

/**
 * Разворачивает маршрут в последовательность шагов.
 * На развилке берётся выбор из маршрута; если он недоступен или не задан —
 * первая доступная ветка, чтобы лента никогда не обрывалась молча.
 */
export function buildPath(
  nodes: StoryNode[],
  links: Link[],
  facts: Fact[],
  route: Pick<Route, 'startNodeId' | 'choices'>,
): PathStep[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const outgoing = new Map<Id, Link[]>()
  for (const link of links) {
    if (link.kind !== 'story') continue
    const list = outgoing.get(link.from)
    if (list) list.push(link)
    else outgoing.set(link.from, [link])
  }
  for (const list of outgoing.values()) list.sort((a, b) => a.order - b.order)

  const factsByOrigin = new Map<Id, Id[]>()
  for (const fact of facts) {
    if (!fact.originNodeId) continue
    const list = factsByOrigin.get(fact.originNodeId)
    if (list) list.push(fact.id)
    else factsByOrigin.set(fact.originNodeId, [fact.id])
  }

  const start =
    (route.startNodeId && nodeById.has(route.startNodeId)
      ? route.startNodeId
      : findStartNodes(nodes, links)[0]?.id) ?? null

  const steps: PathStep[] = []
  const visited = new Set<Id>()
  const active = new Set<Id>()

  let currentId = start
  while (currentId && nodeById.has(currentId) && !visited.has(currentId)) {
    visited.add(currentId)

    for (const factId of factsByOrigin.get(currentId) ?? []) active.add(factId)

    const branches = outgoing.get(currentId) ?? []
    const available: Link[] = []
    const blocked: Link[] = []
    for (const link of branches) {
      if (evaluateCondition(link.condition, active)) available.push(link)
      else blocked.push(link)
    }

    const preferred = route.choices[currentId]
    const chosen =
      available.find((l) => l.id === preferred) ?? available[0] ?? null

    steps.push({
      nodeId: currentId,
      available,
      blocked,
      chosenLinkId: chosen?.id ?? null,
      facts: new Set(active),
    })

    currentId = chosen?.to ?? null
  }

  return steps
}

/**
 * Факты, действующие в момент указанной сцены, — то, что нужно карточке
 * персонажа («что он знает на этот момент») и условным блокам текста.
 */
export function factsAtNode(steps: PathStep[], nodeId: Id): Set<Id> {
  const step = steps.find((s) => s.nodeId === nodeId)
  return step ? step.facts : new Set<Id>()
}

/** Задел считается закрытым, если закрыт вручную или привязан узел-отыгрыш. */
export function isSetupClosed(fact: Fact): boolean {
  return fact.closedManually || fact.payoffNodeId !== null
}
