import { useMemo } from 'react'
import { buildPath, type PathStep } from '../model/path'
import { useStore } from '../store/useStore'
import { SceneEditor } from './SceneEditor'

/**
 * Режим письма: сцены активного пути склеены в одну ленту.
 * На развилке лента без разрыва идёт по выбранной ветке, а переключатель
 * рядом позволяет перекинуть её на соседнюю.
 */
export function Ribbon() {
  const nodes = useStore((s) => s.nodes)
  const links = useStore((s) => s.links)
  const facts = useStore((s) => s.facts)
  const startNodeId = useStore((s) => s.startNodeId)
  const choices = useStore((s) => s.choices)

  const queueNodeDoc = useStore((s) => s.queueNodeDoc)
  const updateNodeTitle = useStore((s) => s.updateNodeTitle)
  const focusNode = useStore((s) => s.focusNode)

  const steps = useMemo(
    () => buildPath(nodes, links, facts, { startNodeId, choices }),
    [nodes, links, facts, startNodeId, choices],
  )

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  if (steps.length === 0) {
    return <p className="ribbon__empty">Сцен пока нет.</p>
  }

  return (
    <div className="ribbon">
      {steps.map((step, index) => {
        const node = nodeById.get(step.nodeId)
        if (!node) return null

        const isLast = index === steps.length - 1

        return (
          <div key={step.nodeId}>
            <SceneEditor
              node={node}
              onChangeDoc={(doc) => queueNodeDoc(node.id, doc)}
              onChangeTitle={(title) => void updateNodeTitle(node.id, title)}
              onFocus={() => focusNode(node.id)}
            />
            <BranchBar step={step} />
            <Inserter step={step} isLast={isLast} />
          </div>
        )
      })}
    </div>
  )
}

/** Переключатель веток и напоминание о тех, что отсечены условием. */
function BranchBar({ step }: { step: PathStep }) {
  const chooseBranch = useStore((s) => s.chooseBranch)

  if (step.available.length <= 1 && step.blocked.length === 0) return null

  const position = step.available.findIndex((l) => l.id === step.chosenLinkId)
  const shift = (delta: number) => {
    if (step.available.length < 2) return
    const next =
      (position + delta + step.available.length) % step.available.length
    chooseBranch(step.nodeId, step.available[next].id)
  }

  return (
    <div className="branches">
      {step.available.length > 1 && (
        <div className="branches__switch">
          <button type="button" onClick={() => shift(-1)} aria-label="Предыдущая ветка">
            ‹
          </button>
          <span className="branches__label">
            {step.available[position]?.label || `Ветка ${position + 1}`}
            <em>
              {position + 1}/{step.available.length}
            </em>
          </span>
          <button type="button" onClick={() => shift(1)} aria-label="Следующая ветка">
            ›
          </button>
        </div>
      )}

      {step.blocked.map((link) => (
        <p key={link.id} className="branches__blocked">
          «{link.label || 'без названия'}» — недоступна на этом пути
        </p>
      ))}
    </div>
  )
}

/** Плюсик между блоками: главный способ создать сцену или развилку. */
function Inserter({ step, isLast }: { step: PathStep; isLast: boolean }) {
  const insertSceneInto = useStore((s) => s.insertSceneInto)
  const appendScene = useStore((s) => s.appendScene)
  const addBranch = useStore((s) => s.addBranch)

  const addScene = () => {
    // В середине пути сцена встаёт в разрыв связи, в конце — дописывается следом.
    if (step.chosenLinkId && !isLast) void insertSceneInto(step.chosenLinkId)
    else void appendScene(step.nodeId)
  }

  return (
    <div className="inserter">
      <span className="inserter__line" />
      <div className="inserter__actions">
        <button type="button" onClick={addScene}>
          + сцена
        </button>
        <button type="button" onClick={() => void addBranch(step.nodeId)}>
          + развилка
        </button>
      </div>
    </div>
  )
}
