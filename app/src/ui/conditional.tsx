import { mergeAttributes, Node } from '@tiptap/core'
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react'
import { useState } from 'react'
import { buildPath, evaluateCondition } from '../model/path'
import type { Id } from '../model/types'
import { useStore } from '../store/useStore'

/**
 * Условный блок — кусок текста, который виден не всегда.
 *
 * Хранит те же условия, что и ветки: набор обязательных фактов и набор
 * запрещённых. Приложение ничего не исполняет — оно показывает автору,
 * как сцена читается при текущем раскладе, а расклад берётся из активного пути.
 */
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    conditional: {
      wrapInConditional: () => ReturnType
      liftConditional: () => ReturnType
    }
  }
}

export interface ConditionalOptions {
  /** Сцена, которой принадлежит редактор: от неё считается расклад фактов. */
  sceneId: Id | null
}

export const Conditional = Node.create<ConditionalOptions>({
  name: 'conditional',
  group: 'block',
  content: 'block+',
  defining: true,

  addOptions() {
    return { sceneId: null }
  },

  addAttributes() {
    return {
      all: {
        default: [] as Id[],
        parseHTML: (element) => parseIds(element.getAttribute('data-all')),
        renderHTML: (attributes) => ({ 'data-all': (attributes.all ?? []).join(',') }),
      },
      none: {
        default: [] as Id[],
        parseHTML: (element) => parseIds(element.getAttribute('data-none')),
        renderHTML: (attributes) => ({ 'data-none': (attributes.none ?? []).join(',') }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-conditional]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-conditional': '' }), 0]
  },

  addCommands() {
    return {
      wrapInConditional:
        () =>
        ({ commands }) =>
          commands.wrapIn(this.name, { all: [], none: [] }),
      liftConditional:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(ConditionalView)
  },
})

function parseIds(value: string | null): Id[] {
  if (!value) return []
  return value.split(',').filter(Boolean)
}

function ConditionalView({ node, updateAttributes, editor, deleteNode }: NodeViewProps) {
  const sceneId = (editor.extensionManager.extensions.find((e) => e.name === 'conditional')
    ?.options as ConditionalOptions | undefined)?.sceneId ?? null

  const nodes = useStore((s) => s.nodes)
  const links = useStore((s) => s.links)
  const facts = useStore((s) => s.facts)
  const startNodeId = useStore((s) => s.startNodeId)
  const choices = useStore((s) => s.choices)

  const [open, setOpen] = useState(false)

  const condition = {
    all: (node.attrs.all ?? []) as Id[],
    none: (node.attrs.none ?? []) as Id[],
  }

  const steps = buildPath(nodes, links, facts, { startNodeId, choices })
  const here = sceneId ? steps.find((s) => s.nodeId === sceneId) : undefined
  const active = here?.facts ?? new Set<Id>()

  const shown = evaluateCondition(
    condition.all.length || condition.none.length ? condition : null,
    active,
  )

  const factById = new Map(facts.map((f) => [f.id, f]))
  const describe = () => {
    if (!condition.all.length && !condition.none.length) return 'всегда'
    return [
      ...condition.all.map((id) => factById.get(id)?.title ?? '?'),
      ...condition.none.map((id) => `не ${factById.get(id)?.title ?? '?'}`),
    ].join(', ')
  }

  return (
    <NodeViewWrapper className={`cblock${shown ? '' : ' cblock--hidden'}`}>
      <div className="cblock__head" contentEditable={false}>
        <button type="button" className="cblock__cond" onClick={() => setOpen((v) => !v)}>
          если: {describe()}
        </button>
        <span className="cblock__state">{shown ? 'виден' : 'скрыт'}</span>
        <button
          type="button"
          className="cblock__drop"
          onClick={() => deleteNode()}
          aria-label="Убрать блок вместе с текстом"
        >
          ×
        </button>
      </div>

      {open && (
        <div className="cblock__editor" contentEditable={false}>
          <InlineCondition
            condition={condition}
            onChange={(next) => updateAttributes(next)}
          />
        </div>
      )}

      <NodeViewContent className="cblock__body" />
    </NodeViewWrapper>
  )
}

/**
 * Тот же набор фишек, что и у веток, но пишет не в связь, а в атрибуты блока.
 * Условие в обоих местах одно и то же — значит и управление им должно совпадать.
 */
function InlineCondition({
  condition,
  onChange,
}: {
  condition: { all: Id[]; none: Id[] }
  onChange: (next: { all: Id[]; none: Id[] }) => void
}) {
  const facts = useStore((s) => s.facts)

  if (facts.length === 0) {
    return <p className="cond__empty">Сначала заведи хотя бы один факт.</p>
  }

  const state = (factId: Id): 'need' | 'ban' | 'any' => {
    if (condition.all.includes(factId)) return 'need'
    if (condition.none.includes(factId)) return 'ban'
    return 'any'
  }

  const cycle = (factId: Id) => {
    const all = new Set(condition.all)
    const none = new Set(condition.none)

    if (state(factId) === 'any') all.add(factId)
    else if (state(factId) === 'need') {
      all.delete(factId)
      none.add(factId)
    } else none.delete(factId)

    onChange({ all: [...all], none: [...none] })
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
