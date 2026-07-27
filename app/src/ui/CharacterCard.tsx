import { useEffect, useState } from 'react'
import { buildPath } from '../model/path'
import type { Id } from '../model/types'
import { useStore } from '../store/useStore'

interface Open {
  characterId: Id
  /** Сцена, в которой стоит упоминание: от неё считаются актуальные знания. */
  nodeId: Id | null
  x: number
  y: number
}

/**
 * Карточка персонажа по клику на `@упоминание`.
 * Показывает не всё, что персонаж знает вообще, а то, что он знает
 * к этому месту сюжета: факты собираются вдоль активного пути до этой сцены.
 */
export function CharacterCard() {
  const [open, setOpen] = useState<Open | null>(null)

  const characters = useStore((s) => s.characters)
  const nodes = useStore((s) => s.nodes)
  const links = useStore((s) => s.links)
  const facts = useStore((s) => s.facts)
  const startNodeId = useStore((s) => s.startNodeId)
  const choices = useStore((s) => s.choices)

  // Упоминания рождаются внутри редактора, поэтому слушаем всплывший клик,
  // а не вешаем обработчик на каждый span.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const mention = target?.closest?.('.mention') as HTMLElement | null

      if (!mention) {
        setOpen(null)
        return
      }

      const characterId = mention.dataset.id
      if (!characterId) return

      const scene = mention.closest('[data-node-id]') as HTMLElement | null
      const rect = mention.getBoundingClientRect()

      setOpen({
        characterId,
        nodeId: scene?.dataset.nodeId ?? null,
        x: rect.left,
        y: rect.bottom + 6,
      })
    }

    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  if (!open) return null

  const character = characters.find((c) => c.id === open.characterId)
  if (!character) return null

  const steps = buildPath(nodes, links, facts, { startNodeId, choices })
  const index = open.nodeId ? steps.findIndex((s) => s.nodeId === open.nodeId) : -1
  const known = index >= 0 ? steps[index].facts : new Set<Id>()

  const timeline = facts.filter(
    (f) => f.face === 'knowledge' && f.characterId === character.id,
  )
  const nodeById = new Map(nodes.map((n) => [n.id, n]))

  return (
    <div className="card" style={{ left: open.x, top: open.y }}>
      <h3 className="card__name">{character.name}</h3>
      {character.aliases.length > 0 && (
        <p className="card__aliases">{character.aliases.join(', ')}</p>
      )}

      {character.personality && <p className="card__line">{character.personality}</p>}
      {character.motivation && (
        <p className="card__line">
          <span>Хочет:</span> {character.motivation}
        </p>
      )}
      {character.manner && (
        <p className="card__line">
          <span>Манера:</span> {character.manner}
        </p>
      )}

      <h4 className="card__section">Знает на этот момент</h4>
      {timeline.length === 0 ? (
        <p className="card__empty">Знаний пока не заведено.</p>
      ) : (
        <ul className="card__facts">
          {timeline.map((fact) => (
            <li key={fact.id} className={known.has(fact.id) ? 'is-known' : ''}>
              {known.has(fact.id) ? '✓' : '·'} {fact.title}
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
  )
}
