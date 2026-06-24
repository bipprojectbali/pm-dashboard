import { SegmentedControl } from '@mantine/core'
import { type Edge, type Node, useEdgesState, useNodesState, useReactFlow } from '@xyflow/react'
import ELK from 'elkjs/lib/elk.bundled.js'
import { useCallback, useMemo, useRef, useState } from 'react'

const elk = new ELK()

export type LayoutType = 'horizontal' | 'vertical' | 'radial' | 'force'

const ELK_OPTIONS: Record<string, Record<string, string>> = {
  horizontal: {
    'elk.algorithm': 'layered',
    'elk.direction': 'RIGHT',
    'elk.layered.spacing.nodeNodeBetweenLayers': '100',
    'elk.spacing.nodeNode': '60',
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  },
  vertical: {
    'elk.algorithm': 'layered',
    'elk.direction': 'DOWN',
    'elk.layered.spacing.nodeNodeBetweenLayers': '80',
    'elk.spacing.nodeNode': '60',
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  },
  force: {
    'elk.algorithm': 'force',
    'elk.force.iterations': '100',
    'elk.spacing.nodeNode': '80',
    'elk.force.repulsion': '2.0',
  },
}

function radialLayout(nodes: Node[], nodeWidth = 240, nodeHeight = 100): Node[] {
  if (nodes.length === 0) return nodes
  if (nodes.length === 1) return [{ ...nodes[0], position: { x: 0, y: 0 } }]

  const perRing = Math.max(6, Math.ceil(nodes.length * 0.6))
  const ringGap = Math.max(nodeWidth, nodeHeight) + 80

  return nodes.map((n, i) => {
    const ring = Math.floor(i / perRing)
    const idxInRing = i % perRing
    const countInRing = Math.min(perRing, nodes.length - ring * perRing)
    const radius = (ring + 1) * ringGap
    const angle = (2 * Math.PI * idxInRing) / countInRing - Math.PI / 2
    return {
      ...n,
      position: {
        x: radius * Math.cos(angle) - nodeWidth / 2,
        y: radius * Math.sin(angle) - nodeHeight / 2,
      },
    }
  })
}

export async function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  layout: LayoutType,
  nodeWidth = 240,
  nodeHeight = 100,
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  if (nodes.length === 0) return { nodes, edges }

  if (layout === 'radial') {
    return { nodes: radialLayout(nodes, nodeWidth, nodeHeight), edges }
  }

  const graph = {
    id: 'root',
    layoutOptions: ELK_OPTIONS[layout],
    children: nodes.map((node) => ({
      id: node.id,
      width: nodeWidth,
      height: nodeHeight,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  }

  const layoutedGraph = await elk.layout(graph)

  const layoutedNodes = nodes.map((node) => {
    const elkNode = layoutedGraph.children?.find((n) => n.id === node.id)
    return {
      ...node,
      position: elkNode ? { x: elkNode.x!, y: elkNode.y! } : node.position,
    }
  })

  return { nodes: layoutedNodes, edges }
}

function savedLayout(key: string): LayoutType {
  try {
    return (localStorage.getItem(`${key}:layout`) as LayoutType) || 'horizontal'
  } catch {
    return 'horizontal'
  }
}

export function storageKey(view: string) {
  return `dev:project:${view}`
}

export function LayoutSelector({ layoutKey, onLayout }: { layoutKey: string; onLayout: (layout: LayoutType) => void }) {
  const [layout, setLayout] = useState<LayoutType>(() => savedLayout(layoutKey))
  const change = (v: string) => {
    const l = v as LayoutType
    setLayout(l)
    localStorage.setItem(`${layoutKey}:layout`, l)
    onLayout(l)
  }
  return (
    <SegmentedControl
      size="xs"
      value={layout}
      onChange={change}
      data={[
        { label: '↔ Horizontal', value: 'horizontal' },
        { label: '↕ Vertical', value: 'vertical' },
        { label: '◎ Radial', value: 'radial' },
        { label: '⚡ Force', value: 'force' },
      ]}
    />
  )
}

export function useFlowAutoSave(key: string) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const vpTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const savedVp = useMemo(() => {
    try {
      const r = localStorage.getItem(`${key}:viewport`)
      return r ? JSON.parse(r) : null
    } catch {
      return null
    }
  }, [key])
  const loadPos = useMemo(() => {
    try {
      const r = localStorage.getItem(`${key}:positions`)
      return r ? (JSON.parse(r) as Record<string, { x: number; y: number }>) : null
    } catch {
      return null
    }
  }, [key])

  const handleNodesChange = useCallback(
    (changes: any) => {
      onNodesChange(changes)
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        setNodes((cur) => {
          const pos: Record<string, { x: number; y: number }> = {}
          for (const n of cur) pos[n.id] = n.position
          localStorage.setItem(`${key}:positions`, JSON.stringify(pos))
          return cur
        })
      }, 500)
    },
    [onNodesChange, key, setNodes],
  )

  const handleMoveEnd = useCallback(
    (_e: any, vp: { x: number; y: number; zoom: number }) => {
      clearTimeout(vpTimer.current)
      vpTimer.current = setTimeout(() => localStorage.setItem(`${key}:viewport`, JSON.stringify(vp)), 500)
    },
    [key],
  )

  const { fitView } = useReactFlow()

  const relayout = useCallback(
    (layout: LayoutType) => {
      const currentNodes = nodes
      const currentEdges = edges
      getLayoutedElements(currentNodes, currentEdges, layout).then(({ nodes: laid }) => {
        setNodes(laid)
        localStorage.removeItem(`${key}:positions`)
        localStorage.removeItem(`${key}:viewport`)
        const pos: Record<string, { x: number; y: number }> = {}
        for (const n of laid) pos[n.id] = n.position
        localStorage.setItem(`${key}:positions`, JSON.stringify(pos))
        requestAnimationFrame(() => fitView({ padding: 0.2 }))
      })
    },
    [key, nodes, edges, fitView, setNodes],
  )

  return {
    nodes,
    setNodes,
    edges,
    setEdges,
    onEdgesChange,
    handleNodesChange,
    handleMoveEnd,
    savedVp,
    loadPos,
    relayout,
  }
}
