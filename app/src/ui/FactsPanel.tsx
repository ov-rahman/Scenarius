import { useState } from 'react'
import { buildPath, isSetupClosed } from '../model/path'
import type { Fact, FactFace, Id } from '../model/types'
import { useStore } from '../store/useStore'

/**
 * Контекстная панель. Факты внутри — одна сущность, но снаружи разложены по
 * вкладкам: думает автор о них по-разному — что сделал игрок, что знает
 * персонаж, что ещё висит незакрытым.
 */
type Tab = FactFace | 'characters'

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
  const [tab, setTab] = useState<Tab>('moment')

  return (
    <aside className="panel">
      <div className="panel__tabs">
        {FACES.map((item) => (
          <button
            key={item.face}
            type="button"
            className={tab === item.face ? 'is-on' : ''}
            onClick={() => setTab(item.face)}
          >
            {item.tab}
            {item.face === 'setup' && openCount(facts) > 0 && <em>{openCount(facts)}</em>}
          </button>
        ))}
        <button
          type="button"
          className={tab === 'characters' ? 'is-on' : ''}
          onClick={() => setTab('characters')}
        >
          персонажи
        </button>
      </div>

      {tab === 'characters' ? <CharactersTab /> : <FactsTab face={tab} />}
    </aside>
  )
}

function FactsTab({ face }: { face: FactFace }) {
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
    <>
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
                    void updateFact(fact.id, { characterId: event.target.value || null })
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
                    void updateFact(fact.id, { payoffNodeId: event.target.value || null })
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
    </>
  )
}

/** Персонажи: карточка целиком редактируется здесь, а `@` вставляет ссылку. */
function CharactersTab() {
  const characters = useStore((s) => s.characters)
  const facts = useStore((s) => s.facts)
  const nodes = useStore((s) => s.nodes)
  const addCharacter = useStore((s) => s.addCharacter)
  const updateCharacter = useStore((s) => s.updateCharacter)
  const removeCharacter = useStore((s) => s.removeCharacter)

  const [draft, setDraft] = useState('')
  const [openId, setOpenId] = useState<Id | null>(null)

  const nodeById = new Map(nodes.map((n) => [n.id, n]))

  return (
    <>
      <form
        className="panel__add"
        onSubmit={(event) => {
          event.preventDefault()
          if (!draft.trim()) return
          void addCharacter(draft)
          setDraft('')
        }}
      >
        <input
          value={draft}
          placeholder="Имя персонажа"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={!draft.trim()}>
          +
        </button>
      </form>

      <p className="panel__target">упоминай их в тексте через @</p>

      {characters.length === 0 ? (
        <p className="panel__empty">
          Персонажей пока нет. Заведи первого — и `@` начнёт их подсказывать.
        </p>
      ) : (
        <ul className="panel__list">
          {characters.map((character) => {
            const open = openId === character.id
            const knowledge = facts.filter(
              (f) => f.face === 'knowledge' && f.characterId === character.id,
            )

            return (
              <li key={character.id}>
                <div className="panel__row">
                  <button
                    type="button"
                    className="panel__title panel__toggle"
                    onClick={() => setOpenId(open ? null : character.id)}
                  >
                    {character.name}
                  </button>
                  <button
                    type="button"
                    className="panel__remove"
                    onClick={() => void removeCharacter(character.id)}
                    aria-label="Удалить"
                  >
                    ×
                  </button>
                </div>

                {open && (
                  <div className="panel__fields">
                    <input
                      value={character.aliases.join(', ')}
                      placeholder="Псевдонимы через запятую"
                      onChange={(event) =>
                        void updateCharacter(character.id, {
                          aliases: event.target.value
                            .split(',')
                            .map((alias) => alias.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                    <textarea
                      value={character.personality}
                      placeholder="Характер"
                      onChange={(event) =>
                        void updateCharacter(character.id, {
                          personality: event.target.value,
                        })
                      }
                    />
                    <textarea
                      value={character.motivation}
                      placeholder="Мотивация"
                      onChange={(event) =>
                        void updateCharacter(character.id, {
                          motivation: event.target.value,
                        })
                      }
                    />
                    <textarea
                      value={character.manner}
                      placeholder="Манера поведения и речи"
                      onChange={(event) =>
                        void updateCharacter(character.id, { manner: event.target.value })
                      }
                    />

                    <h4 className="panel__section">Узнаёт</h4>
                    {knowledge.length === 0 ? (
                      <p className="panel__empty">Знаний не заведено.</p>
                    ) : (
                      <ul className="panel__timeline">
                        {knowledge.map((fact) => (
                          <li key={fact.id}>
                            {fact.title}
                            <em>
                              {fact.originNodeId
                                ? nodeById.get(fact.originNodeId)?.title || 'без названия'
                                : 'сцена не указана'}
                            </em>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
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
