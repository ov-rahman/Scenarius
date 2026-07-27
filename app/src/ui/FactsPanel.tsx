import { useState } from 'react'
import { buildPath, isSetupClosed } from '../model/path'
import type { Fact, FactFace, Id } from '../model/types'
import { useStore } from '../store/useStore'

/**
 * Панель фактов. Внутри это одна сущность, снаружи — три вкладки, потому что
 * думает автор о них по-разному: что сделал игрок, что знает персонаж и что
 * ещё висит незакрытым.
 */
const FACES: Array<{ face: FactFace; tab: string; add: string; empty: string }> = [
  {
    face: 'moment',
    tab: 'моменты',
    add: 'Что произошло',
    empty: 'Ключевых моментов пока нет. Отметь то, что игрок может сделать.',
  },
  {
    face: 'knowledge',
    tab: 'знания',
    add: 'Что узнали',
    empty: 'Знаний пока нет. Отметь, что персонаж узнаёт в этой сцене.',
  },
  {
    face: 'setup',
    tab: 'заделы',
    add: 'Что заявлено',
    empty: 'Заделов пока нет. Заяви то, что должно отыграться позже.',
  },
]

export function FactsPanel() {
  const facts = useStore((s) => s.facts)
  const nodes = useStore((s) => s.nodes)
  const links = useStore((s) => s.links)
  const characters = useStore((s) => s.characters)
  const focusedNodeId = useStore((s) => s.focusedNodeId)
  const startNodeId = useStore((s) => s.startNodeId)
  const choices = useStore((s) => s.choices)
  const addFact = useStore((s) => s.addFact)
  const updateFact = useStore((s) => s.updateFact)
  const removeFact = useStore((s) => s.removeFact)

  const [face, setFace] = useState<FactFace>('moment')
  const [draft, setDraft] = useState('')

  const config = FACES.find((f) => f.face === face)!
  const shown = facts.filter((f) => f.face === face)
  const nodeById = new Map(nodes.map((n) => [n.id, n]))

  // Для задела важно, отыгран ли он на текущем пути, а не вообще где-нибудь.
  const steps = buildPath(nodes, links, facts, { startNodeId, choices })
  const onPath = new Set(steps.map((s) => s.nodeId))

  /*
   * Панель обязана целиться в сцену, которая видна в ленте. Фокус может
   * оказаться вне пути — например, ветку, где ты писал, позже отсекло условием.
   * Тогда берём последнюю сцену пути, а не молча привязываем факт к невидимке.
   */
  const target =
    focusedNodeId && onPath.has(focusedNodeId)
      ? focusedNodeId
      : (steps[steps.length - 1]?.nodeId ?? null)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft.trim() || !target) return
    void addFact(face, draft, target)
    setDraft('')
  }

  return (
    <aside className="panel">
      <div className="panel__tabs">
        {FACES.map((item) => (
          <button
            key={item.face}
            type="button"
            className={face === item.face ? 'is-on' : ''}
            onClick={() => setFace(item.face)}
          >
            {item.tab}
            {item.face === 'setup' && openCount(facts) > 0 && (
              <em>{openCount(facts)}</em>
            )}
          </button>
        ))}
      </div>

      <form className="panel__add" onSubmit={submit}>
        <input
          value={draft}
          placeholder={config.add}
          disabled={!target}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={!target || !draft.trim()}>
          +
        </button>
      </form>

      {target && (
        <p className="panel__target">
          в сцене «{nodeById.get(target)?.title || 'без названия'}»
        </p>
      )}

      {shown.length === 0 ? (
        <p className="panel__empty">{config.empty}</p>
      ) : (
        <ul className="panel__list">
          {shown.map((fact) => (
            <li key={fact.id} className={isSetupClosed(fact) ? 'is-closed' : ''}>
              <div className="panel__row">
                <span className="panel__title">{fact.title}</span>
                <button
                  type="button"
                  className="panel__remove"
                  onClick={() => void removeFact(fact.id)}
                  aria-label="Удалить"
                >
                  ×
                </button>
              </div>

              <p className="panel__where">
                {fact.originNodeId
                  ? nodeById.get(fact.originNodeId)?.title || 'без названия'
                  : 'сцена не указана'}
                {fact.originNodeId && !onPath.has(fact.originNodeId) && (
                  <span className="panel__off"> — не на этом пути</span>
                )}
              </p>

              {fact.face === 'knowledge' && (
                <select
                  value={fact.characterId ?? ''}
                  onChange={(event) =>
                    void updateFact(fact.id, {
                      characterId: event.target.value || null,
                    })
                  }
                >
                  <option value="">чьё знание?</option>
                  {characters.map((character) => (
                    <option key={character.id} value={character.id}>
                      {character.name}
                    </option>
                  ))}
                </select>
              )}

              {fact.face === 'setup' && (
                <select
                  value={fact.payoffNodeId ?? ''}
                  onChange={(event) =>
                    void updateFact(fact.id, {
                      payoffNodeId: event.target.value || null,
                    })
                  }
                >
                  <option value="">не отыгран</option>
                  {nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.title || 'без названия'}
                    </option>
                  ))}
                </select>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

function openCount(facts: Fact[]): number {
  return facts.filter((f) => f.face === 'setup' && !isSetupClosed(f)).length
}

/**
 * Условие на ветке: какие факты нужны, а каких быть не должно.
 * Три состояния на факт вместо двух списков — иначе автору приходится держать
 * в голове, в какой из списков он сейчас пишет.
 */
export function ConditionEditor({ linkId }: { linkId: Id }) {
  const link = useStore((s) => s.links.find((l) => l.id === linkId))
  const facts = useStore((s) => s.facts)
  const setLinkCondition = useStore((s) => s.setLinkCondition)

  if (!link) return null
  if (facts.length === 0) {
    return <p className="cond__empty">Сначала заведи хотя бы один факт.</p>
  }

  const state = (factId: Id): 'need' | 'ban' | 'any' => {
    if (link.condition?.all.includes(factId)) return 'need'
    if (link.condition?.none.includes(factId)) return 'ban'
    return 'any'
  }

  const cycle = (factId: Id) => {
    const all = new Set(link.condition?.all ?? [])
    const none = new Set(link.condition?.none ?? [])

    if (state(factId) === 'any') all.add(factId)
    else if (state(factId) === 'need') {
      all.delete(factId)
      none.add(factId)
    } else none.delete(factId)

    const next = { all: [...all], none: [...none] }
    void setLinkCondition(linkId, next.all.length || next.none.length ? next : null)
  }

  return (
    <div className="cond">
      {facts.map((fact) => (
        <button
          key={fact.id}
          type="button"
          className={`cond__chip cond__chip--${state(fact.id)}`}
          onClick={() => cycle(fact.id)}
        >
          {state(fact.id) === 'need' && '✓ '}
          {state(fact.id) === 'ban' && '✕ '}
          {fact.title}
        </button>
      ))}
    </div>
  )
}
