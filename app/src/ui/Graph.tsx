import dagre from '@dagrejs/dagre'
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useMemo, useState } from 'react'
import { buildPath, isSetupClosed } from '../model/path'
import { storylineDepth, storylineWeight } from '../model/storylines'
import type { Id, Link, StoryNode, Storyline } from '../model/types'
import { useStore } from '../store/useStore'
import { useTouch } from './useTouch'

const NODE_WIDTH = 190
const NODE_HEIGHT = 56

type Filter =
  | { kind: 'all' }
  | { kind: 'storyline'; storylineId: Id }
  | { kind: 'setups' }
  | { kind: 'endings' }

/**
 * Режим структуры: тот же сценарий схемой.
 * Активный путь подсвечен — так видно, какое прохождение сейчас в ленте письма.
 */
export function Graph() {
  const nodes = useStore((s) => s.nodes)
  const links = useStore((s) => s.links)
  const facts = useStore((s) => s.facts)
  const storylines = useStore((s) => s.storylines)
  const startNodeId = useStore((s) => s.startNodeId)
  const choices = useStore((s) => s.choices)
  const focusNode = useStore((s) => s.focusNode)
  const moveNode = useStore((s) => s.moveNode)
  const setViewMode = useStore((s) => s.setViewMode)

  const [filter, setFilter] = useState<Filter>({ kind: 'all' })
  const touch = useTouch()

  const steps = useMemo(
    () => buildPath(nodes, links, facts, { startNodeId, choices }),
    [nodes, links, facts, startNodeId, choices],
  )

  const activeNodes = useMemo(() => new Set(steps.map((s) => s.nodeId)), [steps])
  const activeLinks = useMemo(
    () => new Set(steps.map((s) => s.chosenLinkId).filter(Boolean) as Id[]),
    [steps],
  )

  const visible = useMemo(
    () => visibleNodeIds(nodes, links, facts, storylines, filter),
    [nodes, links, facts, storylines, filter],
  )

  const { rfNodes, rfEdges } = useMemo(
    () =>
      toFlow({
        nodes: nodes.filter((n) => visible.has(n.id)),
        links: links.filter((l) => visible.has(l.from) && visible.has(l.to)),
        storylines,
        activeNodes,
        activeLinks,
      }),
    [nodes, links, storylines, visible, activeNodes, activeLinks],
  )

  return (
    <div className="graph">
      <div className="graph__filters">
        <button
          type="button"
          className={filter.kind === 'all' ? 'is-on' : ''}
          onClick={() => setFilter({ kind: 'all' })}
        >
          всё
        </button>
        {storylines.map((line) => (
          <button
            key={line.id}
            type="button"
            className={
              filter.kind === 'storyline' && filter.storylineId === line.id
                ? 'is-on'
                : ''
            }
            style={{ borderColor: line.color }}
            onClick={() => setFilter({ kind: 'storyline', storylineId: line.id })}
          >
            {line.title}
          </button>
        ))}
        <button
          type="button"
          className={filter.kind === 'setups' ? 'is-on' : ''}
          onClick={() => setFilter({ kind: 'setups' })}
        >
          незакрытые заделы
        </button>
        <button
          type="button"
          className={filter.kind === 'endings' ? 'is-on' : ''}
          onClick={() => setFilter({ kind: 'endings' })}
        >
          концовки
        </button>
      </div>

      <div className="graph__canvas">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          /* На телефоне граф только смотрят: перетаскивание пальцем в первую
             версию не входит, а случайный сдвиг узла при панораме — входит. */
          nodesDraggable={!touch}
          minZoom={0.1}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, node) => focusNode(node.id)}
          onNodeDoubleClick={(_, node) => {
            // Двойной клик — переход в письмо на этой сцене.
            focusNode(node.id)
            setViewMode('write')
          }}
          onNodeDragStop={(_, node) => void moveNode(node.id, node.position)}
        >
          <Background gap={24} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  )
}

// ─── Узел ────────────────────────────────────────────────────────────────────

interface SceneData extends Record<string, unknown> {
  title: string
  color: string
  opacity: number
  isActive: boolean
  kind: StoryNode['kind']
}

function SceneNode({ id, data }: NodeProps<Node<SceneData>>) {
  /*
   * Подсветку фокуса узел берёт из хранилища сам. Если бы она приезжала в data,
   * смена фокуса пересобирала бы весь список узлов — и первый клик двойного
   * клика заменял бы элемент под курсором, из-за чего второй клик пропадал.
   */
  const isFocused = useStore((s) => s.focusedNodeId === id)

  const classes = [
    'gnode',
    data.isActive && 'gnode--active',
    isFocused && 'gnode--focused',
    data.kind === 'ending' && 'gnode--ending',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classes}
      style={
        { '--storyline': data.color, opacity: data.opacity } as React.CSSProperties
      }
    >
      <Handle type="target" position={Position.Top} />
      <span className="gnode__title">{data.title || 'Без названия'}</span>
      {data.kind === 'branch' && <span className="gnode__mark">развилка</span>}
      {data.kind === 'ending' && <span className="gnode__mark">концовка</span>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

const nodeTypes = { scene: SceneNode }

// ─── Раскладка ───────────────────────────────────────────────────────────────

/**
 * Узлы без сохранённой позиции раскладываются автоматически.
 * Подвинутые рукой остаются там, где их оставили: dagre считает раскладку
 * для всех, но его результат применяется только к узлам с position === null.
 */
function layout(nodes: StoryNode[], links: Link[]): Map<Id, { x: number; y: number }> {
  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 70 })

  for (const node of nodes) {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }
  for (const link of links) {
    // Мягкие связи не должны влиять на порядок ярусов — иначе возврат
    // в таверну потянул бы её вниз, под все свои задания.
    if (link.kind !== 'story') continue
    if (graph.hasNode(link.from) && graph.hasNode(link.to)) {
      graph.setEdge(link.from, link.to)
    }
  }

  dagre.layout(graph)

  const result = new Map<Id, { x: number; y: number }>()
  for (const node of nodes) {
    const laid = graph.node(node.id)
    result.set(
      node.id,
      node.position ?? {
        x: (laid?.x ?? 0) - NODE_WIDTH / 2,
        y: (laid?.y ?? 0) - NODE_HEIGHT / 2,
      },
    )
  }

  return result
}

function toFlow(input: {
  nodes: StoryNode[]
  links: Link[]
  storylines: Storyline[]
  activeNodes: Set<Id>
  activeLinks: Set<Id>
}) {
  const { nodes, links, storylines, activeNodes, activeLinks } = input

  const lineById = new Map(storylines.map((l) => [l.id, l]))
  const positions = layout(nodes, links)

  const rfNodes: Node<SceneData>[] = nodes.map((node) => {
    const depth = storylineDepth(node.storylineId, lineById)
    const { opacity } = storylineWeight(depth)

    return {
      id: node.id,
      type: 'scene',
      position: positions.get(node.id) ?? { x: 0, y: 0 },
      data: {
        title: node.title,
        color: (node.storylineId && lineById.get(node.storylineId)?.color) || '#8b8b8b',
        opacity: activeNodes.has(node.id) ? 1 : opacity * 0.75,
        isActive: activeNodes.has(node.id),
        kind: node.kind,
      },
    }
  })

  const rfEdges: Edge[] = links.map((link) => {
    const source = nodes.find((n) => n.id === link.from)
    const depth = storylineDepth(source?.storylineId ?? null, lineById)
    const { width, opacity } = storylineWeight(depth)
    const isActive = activeLinks.has(link.id)
    const isSoft = link.kind === 'soft'

    return {
      id: link.id,
      source: link.from,
      target: link.to,
      label: link.label || undefined,
      animated: false,
      style: {
        // Возвраты и посев-отыгрыш — пунктиром: видно, что связь есть,
        // но она не часть движения вперёд.
        strokeDasharray: isSoft ? '6 5' : undefined,
        strokeWidth: isActive ? width + 1 : width,
        stroke: isActive
          ? 'var(--accent)'
          : (source?.storylineId && lineById.get(source.storylineId)?.color) || '#9a9a9a',
        opacity: isActive ? 1 : opacity * 0.7,
      },
    }
  })

  return { rfNodes, rfEdges }
}

// ─── Фильтры ─────────────────────────────────────────────────────────────────

function visibleNodeIds(
  nodes: StoryNode[],
  links: Link[],
  facts: Parameters<typeof buildPath>[2],
  storylines: Storyline[],
  filter: Filter,
): Set<Id> {
  if (filter.kind === 'all') return new Set(nodes.map((n) => n.id))

  if (filter.kind === 'storyline') {
    // Показывая линию, показываем и её ветви: без них она обрывается в пустоту.
    const descendants = new Set<Id>([filter.storylineId])
    let grew = true
    while (grew) {
      grew = false
      for (const line of storylines) {
        if (line.parentId && descendants.has(line.parentId) && !descendants.has(line.id)) {
          descendants.add(line.id)
          grew = true
        }
      }
    }
    return new Set(
      nodes.filter((n) => n.storylineId && descendants.has(n.storylineId)).map((n) => n.id),
    )
  }

  if (filter.kind === 'setups') {
    const open = facts.filter((f) => f.face === 'setup' && !isSetupClosed(f))
    return new Set(open.map((f) => f.originNodeId).filter(Boolean) as Id[])
  }

  // Концовка — либо помеченный узел, либо просто тупик: из него никуда не ведёт.
  const hasOutgoing = new Set(links.filter((l) => l.kind === 'story').map((l) => l.from))
  return new Set(
    nodes.filter((n) => n.kind === 'ending' || !hasOutgoing.has(n.id)).map((n) => n.id),
  )
}
