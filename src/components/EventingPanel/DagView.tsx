/* ═══════════════════════════════════════════════════
   src/components/EventingPanel/DagView.tsx

   React Flow rendering of a workflow's step DAG.
   Used for both the editor (mutable) and instance view
   (read-only with live status colors).
   ═══════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type OnConnect,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import {
  computeLayout,
  statusColor,
  type WorkflowStep,
} from './eventingTypes'
import styles from './EventingPanel.module.css'

// Node data carries enough for the renderer + selection callback
type StepNodeData = {
  step: WorkflowStep
  status?: string
  layer: number
  selected: boolean
}

type StepNode = Node<StepNodeData, 'step'>

function StepNodeView({ data, selected }: NodeProps<StepNode>) {
  const color = statusColor(data.status)
  return (
    <div className={`${styles.node} ${selected ? styles.nodeSelected : ''}`}>
      <div className={styles.nodeStatusBar} style={{ background: color }} />
      <Handle type="target" position={Position.Left} />
      <div className={styles.nodeName}>{data.step.name}</div>
      <div className={styles.nodeAction}>{data.step.action}</div>
      {data.step.description && (
        <div className={styles.nodeDesc}>{data.step.description}</div>
      )}
      <div className={styles.nodeFooter}>
        <span className={styles.nodeStatus} style={{ color }}>
          {data.status ?? '—'}
        </span>
        <span className={styles.nodeLayer}>L{data.layer}</span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

const NODE_TYPES = { step: StepNodeView }

export interface DagViewProps {
  steps: WorkflowStep[]
  /** map of step name → status, used for instance live view */
  statusMap?: Record<string, string>
  selectedName?: string | null
  onSelect?: (name: string | null) => void
  /** when true, allow drag/connect for the editor */
  editable?: boolean
  /** called when an edge is created/removed in editable mode */
  onDependencyAdd?: (childName: string, parentName: string) => void
  onDependencyRemove?: (childName: string, parentName: string) => void
}

export function DagView(props: DagViewProps) {
  const layoutNodes = useMemo(() => computeLayout(props.steps), [props.steps])

  // Build React Flow nodes/edges from layout
  const initialNodes = useMemo<StepNode[]>(
    () =>
      layoutNodes.map((ln) => ({
        id: ln.id,
        type: 'step',
        position: { x: ln.x, y: ln.y },
        data: {
          step: ln.step,
          status: props.statusMap?.[ln.id],
          layer: ln.layer,
          selected: ln.id === props.selectedName,
        },
        selected: ln.id === props.selectedName,
      })),
    [layoutNodes, props.statusMap, props.selectedName],
  )

  const initialEdges = useMemo<Edge[]>(
    () =>
      props.steps.flatMap((s) =>
        (s.depends_on ?? []).map((dep) => ({
          id: `${dep}->${s.name}`,
          source: dep,
          target: s.name,
          animated: !!props.statusMap?.[s.name] && props.statusMap[s.name] === 'running',
        })),
      ),
    [props.steps, props.statusMap],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState<StepNode>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges)

  // Sync when source data changes
  useEffect(() => { setNodes(initialNodes) }, [initialNodes, setNodes])
  useEffect(() => { setEdges(initialEdges) }, [initialEdges, setEdges])

  const onConnect: OnConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return
      if (params.source === params.target) return
      setEdges((eds) => addEdge({ ...params, animated: false }, eds))
      props.onDependencyAdd?.(params.target, params.source)
    },
    [setEdges, props],
  )

  const onEdgesDelete = useCallback(
    (edgesToRemove: Edge[]) => {
      for (const e of edgesToRemove) {
        props.onDependencyRemove?.(e.target, e.source)
      }
    },
    [props],
  )

  const onNodeClick = useCallback(
    (_evt: React.MouseEvent, node: Node) => {
      props.onSelect?.(node.id)
    },
    [props],
  )

  const onPaneClick = useCallback(() => props.onSelect?.(null), [props])

  return (
    <div className={styles.dag}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={props.editable ? onConnect : undefined}
        onEdgesDelete={props.editable ? onEdgesDelete : undefined}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodesDraggable={!!props.editable}
        nodesConnectable={!!props.editable}
        edgesFocusable={!!props.editable}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} color="rgba(239,239,218,0.06)" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n: Node) => statusColor((n.data as StepNodeData)?.status)}
          maskColor="rgba(8,6,4,0.6)"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  )
}
