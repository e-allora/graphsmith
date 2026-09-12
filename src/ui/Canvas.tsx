import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, Handle, Position, MarkerType, applyNodeChanges, type Node, type Edge, type NodeChange, type Connection, type NodeProps, type ReactFlowInstance } from '@xyflow/react';
import type { GraphProject, GraphNode, Router } from '../domain/types';
import { describeOperator } from '../domain/simulate';
import { elementName } from '../domain/graph';
import { CATEGORY_GLYPH, CATEGORY_COLOR, CATEGORY_LABEL, EDGE_COLOR } from './labels';
import type { Selection } from './store';

type StepData = { node: GraphNode; entry: boolean; end: boolean; active: boolean; visited: boolean; readOnly: boolean };
type RouterData = { router: Router; ruleText: string; defaultText: string; active: boolean; visited: boolean; readOnly: boolean };
type StepRF = Node<StepData, 'step'>;
type RouterRF = Node<RouterData, 'decision'>;
type AnyRF = StepRF | RouterRF;

function StepNode({ data, selected }: NodeProps<StepRF>) {
  const n = data.node;
  return (
    <div className={`gs-node cat-${n.category} ${selected ? 'selected' : ''} ${data.active ? 'active' : ''} ${data.visited ? 'visited' : ''}`} role="group" aria-label={`${CATEGORY_LABEL[n.category]}: ${n.name}`}>
      <Handle type="target" position={Position.Top} isConnectable={!data.readOnly} />
      {data.entry && <span className="tag entry">ENTRY</span>}
      {data.end && <span className="tag end">END</span>}
      {n.category === 'action' && <span className="tag impact">{n.impact} impact · {n.sideEffect}</span>}
      <div className="head">
        <span className="cat" style={{ background: CATEGORY_COLOR[n.category] }} aria-hidden="true">{CATEGORY_GLYPH[n.category]}</span>
        <span className="name">{n.name}</span>
        <span className="st">{data.active ? 'Running' : data.visited ? 'Done' : 'Ready'}</span>
      </div>
      <div className="desc">{n.description}</div>
      <div className="rw">
        <span><b>Reads:</b> {n.reads.length ? n.reads.join(', ') : '–'}</span>
        <span><b>Writes:</b> {n.writes.length ? n.writes.join(', ') : '–'}</span>
      </div>
      {n.category !== 'output' && <Handle type="source" position={Position.Bottom} isConnectable={!data.readOnly} />}
    </div>
  );
}

function RouterNode({ data, selected }: NodeProps<RouterRF>) {
  const r = data.router;
  return (
    <div className={`gs-router ${selected ? 'selected' : ''} ${data.active ? 'active' : ''}`} role="group" aria-label={`Decision: ${r.question}`}>
      <Handle type="target" position={Position.Top} isConnectable={!data.readOnly} />
      <div className="head"><span className="dia" aria-hidden="true" /> <span>Decision</span></div>
      <div className="q">{r.question}</div>
      <div className="rule">{data.ruleText}<br />else → {data.defaultText}</div>
      <Handle type="source" position={Position.Bottom} isConnectable={!data.readOnly} />
    </div>
  );
}

const nodeTypes = { step: StepNode, decision: RouterNode };

type Props = {
  project: GraphProject;
  selection: Selection;
  readOnly: boolean;
  activeId?: string;
  visitedIds: Set<string>;
  traversedEdgeIds: Set<string>;
  currentEdgeId?: string;
  onSelect: (s: Selection) => void;
  onMove: (moves: Record<string, { x: number; y: number }>) => void;
  onConnect: (source: string, target: string) => void;
  onDeleteSelection: () => void;
};

export function Canvas(p: Props) {
  const g = p.project.graph;
  const built = useMemo<AnyRF[]>(() => {
    const steps: StepRF[] = g.nodes.map((n) => ({
      id: n.id, type: 'step', position: n.position, selected: p.selection?.id === n.id, draggable: !p.readOnly,
      data: { node: n, entry: g.entryNodeId === n.id, end: g.endNodeIds.includes(n.id), active: p.activeId === n.id, visited: p.visitedIds.has(n.id), readOnly: p.readOnly },
    }));
    const routers: RouterRF[] = g.routers.map((r) => ({
      id: r.id, type: 'decision', position: r.position, selected: p.selection?.id === r.id, draggable: !p.readOnly,
      data: {
        router: r, active: p.activeId === r.id, visited: p.visitedIds.has(r.id), readOnly: p.readOnly,
        ruleText: r.rules.map((rule) => `if ${rule.field} ${describeOperator(rule.operator)} ${JSON.stringify(rule.value)} → ${elementName(g, rule.targetNodeId) || '?'}`).join('\n'),
        defaultText: elementName(g, r.defaultTargetNodeId) || 'missing default',
      },
    }));
    return [...steps, ...routers];
  }, [g, p.selection, p.activeId, p.visitedIds, p.readOnly]);

  const [nodes, setNodes] = useState<AnyRF[]>(built);
  useEffect(() => setNodes(built), [built]);

  const edges = useMemo<Edge[]>(() => g.edges.map((e) => {
    const traversed = p.traversedEdgeIds.has(e.id);
    const color = traversed ? '#0284c7' : EDGE_COLOR[e.type];
    const dashed = e.type === 'retry' || e.type === 'review_resume' ? '7 5' : e.type === 'failure' ? '3 4' : undefined;
    return {
      id: e.id, source: e.sourceNodeId, target: e.targetNodeId, label: e.label, selected: p.selection?.id === e.id,
      type: e.type === 'retry' || e.type === 'review_resume' ? 'smoothstep' : 'default',
      animated: p.currentEdgeId === e.id,
      style: { stroke: color, strokeWidth: traversed ? 2.6 : 1.8, strokeDasharray: dashed },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
      labelStyle: { fill: e.type === 'failure' ? '#b91c1c' : e.type === 'retry' ? '#92400e' : '#334155', fontWeight: 600 },
      labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
      ariaLabel: `${e.type} connection from ${elementName(g, e.sourceNodeId)} to ${elementName(g, e.targetNodeId)}`,
    };
  }), [g, p.selection, p.traversedEdgeIds, p.currentEdgeId]);

  const onNodesChange = useCallback((changes: NodeChange<AnyRF>[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns));
    for (const c of changes) {
      if (c.type === 'select') {
        if (c.selected) p.onSelect({ kind: g.routers.some((r) => r.id === c.id) ? 'router' : 'node', id: c.id });
        else if (p.selection?.id === c.id) p.onSelect(null);
      }
      if (c.type === 'remove') p.onDeleteSelection();
    }
  }, [g, p]);

  const onNodeDragStop = useCallback((_: unknown, _node: AnyRF, dragged: AnyRF[]) => {
    const moves: Record<string, { x: number; y: number }> = {};
    for (const n of dragged.length ? dragged : [_node]) moves[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
    p.onMove(moves);
  }, [p]);

  const onConnect = useCallback((c: Connection) => { if (c.source && c.target) p.onConnect(c.source, c.target); }, [p]);

  // Fit the graph, but never below a zoom where labels stop being readable; when it does not fit, start at the top.
  const wrap = useRef<HTMLDivElement>(null);
  const onInit = useCallback((inst: ReactFlowInstance<AnyRF, Edge>) => {
    const el = wrap.current;
    if (!el) return;
    const w = el.clientWidth, h = el.clientHeight;
    const xs = [...g.nodes.map((n) => n.position.x), ...g.routers.map((r) => r.position.x)];
    const ys = [...g.nodes.map((n) => n.position.y), ...g.routers.map((r) => r.position.y)];
    if (!xs.length) return;
    const minX = Math.min(...xs), maxX = Math.max(...xs) + 210, minY = Math.min(...ys), maxY = Math.max(...ys) + 110;
    const gw = maxX - minX, gh = maxY - minY;
    const zoom = Math.min(Math.max(Math.min((w - 40) / gw, (h - 40) / gh), 0.6), 0.95);
    const fits = gh * zoom <= h - 20;
    inst.setViewport({ zoom, x: (w - gw * zoom) / 2 - minX * zoom, y: fits ? (h - gh * zoom) / 2 - minY * zoom : 16 - minY * zoom });
  }, [g]);

  return (
    <div className="ws-canvas" aria-label="Graph canvas" ref={wrap}>
      <div className="canvas-hint" aria-hidden="true">
        <span className="badge">Scroll to zoom · drag to pan</span>
        {!p.readOnly && <span className="badge">Drag from a step's bottom dot to connect</span>}
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onEdgeClick={(_, e) => p.onSelect({ kind: 'edge', id: e.id })}
        onPaneClick={() => p.onSelect(null)}
        nodesConnectable={!p.readOnly}
        elementsSelectable
        deleteKeyCode={null}
        onInit={onInit}
        minZoom={0.2}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} color="#e2e8f0" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor={(n) => (n.type === 'decision' ? '#f59e0b' : '#94a3b8')} style={{ width: 140, height: 100 }} />
      </ReactFlow>
    </div>
  );
}
