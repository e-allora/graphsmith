import type { GraphProject, SimulationResult, GraphNode, Router, GraphEdge, StateField, NodeCategory } from '../domain/types';
import { templateById } from '../domain/template';
import { newId, validateNewEdge } from '../domain/graph';
import type { SimulationOverrides } from '../domain/simulate';

export type Selection = { kind: 'node' | 'router' | 'edge' | 'field'; id: string } | null;
export type Tab = 'design' | 'state' | 'evaluate' | 'readiness' | 'export';

export type SimState = { scenarioId: string; overrides: SimulationOverrides; result: SimulationResult; stepIndex: number; playing: boolean };

export type WsState = {
  project: GraphProject;
  past: GraphProject[];
  future: GraphProject[];
  selection: Selection;
  tab: Tab;
  readOnly: boolean;
  sim: SimState | null;
  toast: string | null;
  lastError: string | null;
};

export type Action =
  | { type: 'commit'; project: GraphProject; label?: string }
  | { type: 'replace'; project: GraphProject }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'select'; selection: Selection }
  | { type: 'tab'; tab: Tab }
  | { type: 'sim'; sim: SimState | null }
  | { type: 'step'; index: number }
  | { type: 'playing'; playing: boolean }
  | { type: 'toast'; message: string | null }
  | { type: 'error'; message: string | null };

const HISTORY = 60;

export function initialState(project: GraphProject, readOnly: boolean): WsState {
  return { project, past: [], future: [], selection: null, tab: 'design', readOnly, sim: null, toast: null, lastError: null };
}

export function reducer(s: WsState, a: Action): WsState {
  switch (a.type) {
    case 'commit':
      if (s.readOnly) return s;
      return { ...s, project: a.project, past: [...s.past.slice(-HISTORY), s.project], future: [], sim: null };
    case 'replace':
      return { ...s, project: a.project, sim: null };
    case 'undo': {
      if (!s.past.length) return s;
      const prev = s.past[s.past.length - 1];
      return { ...s, project: prev, past: s.past.slice(0, -1), future: [s.project, ...s.future], sim: null, selection: null };
    }
    case 'redo': {
      if (!s.future.length) return s;
      const next = s.future[0];
      return { ...s, project: next, past: [...s.past, s.project], future: s.future.slice(1), sim: null, selection: null };
    }
    case 'select': return { ...s, selection: a.selection };
    case 'tab': return { ...s, tab: a.tab };
    case 'sim': return { ...s, sim: a.sim };
    case 'step': return s.sim ? { ...s, sim: { ...s.sim, stepIndex: a.index } } : s;
    case 'playing': return s.sim ? { ...s, sim: { ...s.sim, playing: a.playing } } : s;
    case 'toast': return { ...s, toast: a.message };
    case 'error': return { ...s, lastError: a.message };
  }
}

/* ---- Editing commands: pure functions from project to project ---- */

export function updateNode(p: GraphProject, id: string, patch: Partial<GraphNode>): GraphProject {
  return { ...p, graph: { ...p.graph, nodes: p.graph.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) } };
}
export function updateRouter(p: GraphProject, id: string, patch: Partial<Router>): GraphProject {
  return { ...p, graph: { ...p.graph, routers: p.graph.routers.map((r) => (r.id === id ? { ...r, ...patch } : r)) } };
}
export function updateEdge(p: GraphProject, id: string, patch: Partial<GraphEdge>): GraphProject {
  return { ...p, graph: { ...p.graph, edges: p.graph.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) } };
}
export function updateField(p: GraphProject, id: string, patch: Partial<StateField>): GraphProject {
  return { ...p, stateSchema: { ...p.stateSchema, fields: p.stateSchema.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) } };
}
export function movePositions(p: GraphProject, moves: Record<string, { x: number; y: number }>): GraphProject {
  return {
    ...p,
    graph: {
      ...p.graph,
      nodes: p.graph.nodes.map((n) => (moves[n.id] ? { ...n, position: moves[n.id] } : n)),
      routers: p.graph.routers.map((r) => (moves[r.id] ? { ...r, position: moves[r.id] } : r)),
    },
  };
}
export function addNode(p: GraphProject, category: NodeCategory, near?: { x: number; y: number }): { project: GraphProject; id: string } {
  const id = newId('step');
  const names: Record<NodeCategory, string> = { input: 'New input', transform: 'New step', retrieve: 'New lookup', validate: 'New check', human_review: 'New review checkpoint', action: 'New action (mocked)', recovery: 'New recovery step', output: 'New outcome' };
  const node: GraphNode = { id, name: names[category], category, description: 'Describe what this step does.', reads: [], writes: [], sideEffect: category === 'action' || category === 'retrieve' ? 'mocked' : 'none', impact: category === 'action' ? 'moderate' : 'low', position: near ?? { x: 700, y: 100 } };
  return { project: { ...p, graph: { ...p.graph, nodes: [...p.graph.nodes, node] } }, id };
}
export function addRouter(p: GraphProject, near?: { x: number; y: number }): { project: GraphProject; id: string } {
  const id = newId('decision');
  const firstField = p.stateSchema.fields[0]?.id ?? 'value';
  const router: Router = { id, name: 'New decision', question: 'Which path?', rules: [{ id: newId('rule'), field: firstField, operator: 'equals', value: true, targetNodeId: '', label: 'Yes' }], defaultTargetNodeId: '', defaultLabel: 'Otherwise (safe default)', maxIterations: 1, position: near ?? { x: 700, y: 300 } };
  return { project: { ...p, graph: { ...p.graph, routers: [...p.graph.routers, router] } }, id };
}
export function connect(p: GraphProject, source: string, target: string): { project?: GraphProject; error?: string; id?: string } {
  const error = validateNewEdge(p.graph, source, target);
  if (error) return { error };
  const id = `e_${source}__${target}`;
  const isRouter = p.graph.routers.some((r) => r.id === source);
  const edge: GraphEdge = { id, sourceNodeId: source, targetNodeId: target, type: 'default', label: isRouter ? 'path' : undefined };
  let graph = { ...p.graph, edges: [...p.graph.edges, edge] };
  if (isRouter) {
    // First connection from a decision becomes its default path when none is set.
    graph = { ...graph, routers: graph.routers.map((r) => (r.id === source && !r.defaultTargetNodeId ? { ...r, defaultTargetNodeId: target } : r)) };
  }
  return { project: { ...p, graph }, id };
}
export function removeElement(p: GraphProject, sel: Selection): GraphProject {
  if (!sel) return p;
  const g = p.graph;
  if (sel.kind === 'edge') return { ...p, graph: { ...g, edges: g.edges.filter((e) => e.id !== sel.id) } };
  if (sel.kind === 'field') return { ...p, stateSchema: { ...p.stateSchema, fields: p.stateSchema.fields.filter((f) => f.id !== sel.id) } };
  const id = sel.id;
  return {
    ...p,
    graph: {
      ...g,
      nodes: g.nodes.filter((n) => n.id !== id),
      routers: g.routers.filter((r) => r.id !== id).map((r) => ({ ...r, defaultTargetNodeId: r.defaultTargetNodeId === id ? '' : r.defaultTargetNodeId, rules: r.rules.map((x) => (x.targetNodeId === id ? { ...x, targetNodeId: '' } : x)) })),
      edges: g.edges.filter((e) => e.sourceNodeId !== id && e.targetNodeId !== id),
      endNodeIds: g.endNodeIds.filter((x) => x !== id),
    },
  };
}
export function addField(p: GraphProject): { project: GraphProject; id: string } {
  const id = newId('field');
  const f: StateField = { id, name: id, description: 'Describe this field.', type: 'string', classification: 'internal', defaultValue: '', exportPolicy: 'include' };
  return { project: { ...p, stateSchema: { ...p.stateSchema, fields: [...p.stateSchema.fields, f] } }, id };
}
export function resetProject(templateId?: string): GraphProject {
  return templateById(templateId);
}
