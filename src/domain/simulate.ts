import type { GraphProject, GraphDefinition, TestScenario, TraceStep, SimulationResult, StatePatch, ValueOrigin, RouterRule, GraphEdge } from './types';
import { findElement, outgoing, elementName } from './graph';

const STEP_MS = 250;
const MAX_STEPS = 200;

export type SimulationOverrides = { reviewerDecision?: 'approved' | 'revise' };

function compare(actual: unknown, op: RouterRule['operator'], expected: unknown): boolean {
  switch (op) {
    case 'equals': return actual === expected;
    case 'not_equals': return actual !== expected;
    case 'greater_than': return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'greater_or_equal': return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'less_than': return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'includes':
      if (Array.isArray(actual)) return actual.includes(expected);
      if (typeof actual === 'string') return actual.includes(String(expected));
      return false;
  }
}

export function describeOperator(op: RouterRule['operator']): string {
  return { equals: 'is', not_equals: 'is not', greater_than: 'is greater than', greater_or_equal: 'is at least', less_than: 'is less than', includes: 'includes' }[op];
}

function fmt(v: unknown): string {
  if (typeof v === 'string') return `"${v}"`;
  if (v === undefined) return 'not set';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 60);
  return String(v);
}

function mergePatch(state: StatePatch, patch: StatePatch, schemaObjectFields: Set<string>): StatePatch {
  const next = { ...state };
  for (const [k, v] of Object.entries(patch)) {
    const cur = next[k];
    if (schemaObjectFields.has(k) && cur && typeof cur === 'object' && !Array.isArray(cur) && v && typeof v === 'object' && !Array.isArray(v)) {
      next[k] = { ...(cur as object), ...(v as object) };
    } else if (Array.isArray(cur) && Array.isArray(v) && k === 'errors') {
      next[k] = [...cur, ...v];
    } else {
      next[k] = v;
    }
  }
  return next;
}

/** Deterministic mock simulation. No network, no side effects, fake clock. */
export function simulate(project: GraphProject, scenario: TestScenario, overrides: SimulationOverrides = {}): SimulationResult {
  const g: GraphDefinition = project.graph;
  const objectFields = new Set(project.stateSchema.fields.filter((f) => f.type === 'object').map((f) => f.id));
  let state: StatePatch = {};
  const origins: Record<string, ValueOrigin> = {};
  for (const f of project.stateSchema.fields) {
    if (f.defaultValue !== undefined) { state[f.id] = f.defaultValue; origins[f.id] = 'default'; }
  }
  for (const [k, v] of Object.entries(scenario.input)) { state[k] = v; origins[k] = 'mocked'; }

  const steps: TraceStep[] = [];
  const visits: Record<string, number> = {};
  const visitedNodeIds: string[] = [];
  const traversedEdgeIds: string[] = [];
  const routerOutcomes: string[] = [];
  let stoppedReason: string | undefined;
  let reachedEnd = false;

  const push = (s: Omit<TraceStep, 'index' | 'timestamp' | 'stateAfter' | 'origins'>) => {
    steps.push({ ...s, index: steps.length, timestamp: steps.length * STEP_MS, stateAfter: { ...state }, origins: { ...origins } });
  };

  const applyPatch = (patch: StatePatch) => {
    state = mergePatch(state, patch, objectFields);
    for (const k of Object.keys(patch)) origins[k] = 'mocked';
  };

  /** Executes one node. Returns the edge to follow next, or undefined when the walk stops here. */
  const runNode = (id: string): GraphEdge | 'parallel' | undefined => {
    const el = findElement(g, id);
    if (!el || el.kind !== 'node') { stoppedReason = `Unknown step "${id}".`; return undefined; }
    const node = el.node;
    visits[id] = (visits[id] ?? 0) + 1;
    visitedNodeIds.push(id);
    const outcome = scenario.mockedOutcomes[id];
    const outs = outgoing(g, id);

    if (outcome?.failOnVisit === visits[id]) {
      const failEdge = outs.find((e) => e.type === 'failure');
      const message = outcome.failMessage ?? 'Mock failure';
      applyPatch({ errors: [{ node: id, type: 'mock_failure', message }] });
      push({ kind: 'failure', elementId: id, elementName: node.name, patch: { errors: `+ ${message}` }, selectedEdgeId: failEdge?.id, nextElementId: failEdge?.targetNodeId,
        explanation: failEdge ? `${node.name} reported a controlled mock error ("${message}"). The failure edge routes to ${elementName(g, failEdge.targetNodeId)}.` : `${node.name} reported a controlled mock error ("${message}") and has no failure path. The run stops here.` });
      if (!failEdge) { stoppedReason = `${node.name} failed with no failure path.`; return undefined; }
      traversedEdgeIds.push(failEdge.id);
      return failEdge;
    }

    let patch: StatePatch = {};
    if (outcome && outcome.patches.length) {
      patch = outcome.patches[Math.min(visits[id] - 1, outcome.patches.length - 1)];
    }
    if (node.category === 'human_review' && overrides.reviewerDecision) {
      const override = overrides.reviewerDecision;
      // Honour the override on the first visit only; a second visit after revision always approves so the run terminates.
      patch = visits[id] === 1 ? { ...patch, reviewerDecision: override, reviewerNotes: override === 'approved' ? 'Approved by the demo operator.' : 'Demo operator requested a revision.' } : { ...patch, reviewerDecision: 'approved' };
    }
    applyPatch(patch);

    const normal = outs.filter((e) => e.type !== 'failure');
    const parallel = normal.filter((e) => e.type === 'parallel');
    const isEnd = g.endNodeIds.includes(id);
    const written = Object.keys(patch);
    const summary = written.length ? `Wrote ${written.join(', ')}.` : 'No State changes.';

    if (node.category === 'human_review') {
      push({ kind: 'checkpoint', elementId: id, elementName: node.name, patch, explanation: `Paused for a person. Reviewer decision: ${fmt(state.reviewerDecision)}. ${summary}`, selectedEdgeId: normal[0]?.id, nextElementId: normal[0]?.targetNodeId });
    } else if (parallel.length > 1) {
      push({ kind: 'node', elementId: id, elementName: node.name, patch, explanation: `${summary} Fans out to ${parallel.length} parallel branches: ${parallel.map((e) => elementName(g, e.targetNodeId)).join(', ')}.` });
      return 'parallel';
    } else if (isEnd && normal.length === 0) {
      push({ kind: 'end', elementId: id, elementName: node.name, patch, explanation: `${summary} Reached the end outcome.` });
      reachedEnd = true;
      return undefined;
    } else {
      push({ kind: 'node', elementId: id, elementName: node.name, patch, explanation: `${summary}${normal[0] ? ` Continues to ${elementName(g, normal[0].targetNodeId)}.` : ' No outgoing connection; the run stops.'}`, selectedEdgeId: normal[0]?.id, nextElementId: normal[0]?.targetNodeId });
    }
    if (!normal[0]) { if (!isEnd) stoppedReason = `${node.name} has no outgoing connection.`; else reachedEnd = true; return undefined; }
    traversedEdgeIds.push(normal[0].id);
    return normal[0];
  };

  const runRouter = (id: string): GraphEdge | undefined => {
    const el = findElement(g, id);
    if (!el || el.kind !== 'router') { stoppedReason = `Unknown decision "${id}".`; return undefined; }
    const r = el.router;
    visits[id] = (visits[id] ?? 0) + 1;
    visitedNodeIds.push(id);
    const evaluated = r.rules.map((rule) => ({ ruleId: rule.id, field: rule.field, actual: state[rule.field], operator: rule.operator, expected: rule.value, matched: compare(state[rule.field], rule.operator, rule.value), label: rule.label }));
    const hit = evaluated.find((x) => x.matched);
    const rule = hit ? r.rules.find((x) => x.id === hit.ruleId) : undefined;
    const targetId = rule ? rule.targetNodeId : r.defaultTargetNodeId;
    const label = rule ? rule.label : r.defaultLabel;
    const outs = outgoing(g, id);
    const edge = outs.find((e) => (rule ? e.routerRuleId === rule.id : !e.routerRuleId && e.targetNodeId === r.defaultTargetNodeId)) ?? outs.find((e) => e.targetNodeId === targetId);
    const iteration = typeof state.iterationCount === 'number' ? state.iterationCount : 0;
    const lines = evaluated.map((x) => `${x.field} = ${fmt(x.actual)}. Rule: ${x.field} ${describeOperator(x.operator)} ${fmt(x.expected)}. Matched: ${x.matched ? 'yes' : 'no'}.`);
    const why = `${lines.join(' ')} Selected path: ${label}${rule ? '' : ' (the safe default)'}.`;
    routerOutcomes.push(label);

    if (!rule && r.maxIterations !== undefined && iteration >= r.maxIterations) {
      push({ kind: 'router', elementId: id, elementName: r.question, patch: {}, explanation: `${why} Loop limit reached (${r.maxIterations} iterations). The run stops with the evidence it has.`, routerDetail: { evaluated, selectedLabel: label, usedDefault: true } });
      stoppedReason = `Loop limit of ${r.maxIterations} reached at "${r.question}".`;
      return undefined;
    }
    push({ kind: 'router', elementId: id, elementName: r.question, patch: {}, selectedEdgeId: edge?.id, nextElementId: targetId, explanation: why, routerDetail: { evaluated, selectedLabel: label, usedDefault: !rule } });
    if (!edge) { stoppedReason = `Decision "${r.question}" points to a missing step.`; return undefined; }
    traversedEdgeIds.push(edge.id);
    return edge;
  };

  /** Runs a branch until it reaches a join edge; returns the join target. */
  const runBranch = (startId: string): string | undefined => {
    let cur: string | undefined = startId;
    let guard = 0;
    while (cur && guard++ < 20) {
      const el = findElement(g, cur);
      if (!el) return undefined;
      const res: GraphEdge | 'parallel' | undefined = el.kind === 'node' ? runNode(cur) : runRouter(cur);
      if (!res || res === 'parallel') return undefined;
      if (res.type === 'join') return res.targetNodeId;
      cur = res.targetNodeId;
    }
    return undefined;
  };

  let current: string | undefined = g.entryNodeId;
  let guard = 0;
  while (current && guard++ < MAX_STEPS && !stoppedReason && !reachedEnd) {
    const el = findElement(g, current);
    if (!el) { stoppedReason = `Missing element "${current}".`; break; }
    if (el.kind === 'router') { const e = runRouter(current); current = e?.targetNodeId; continue; }
    const res = runNode(current);
    if (res === 'parallel') {
      const branches = outgoing(g, current).filter((e) => e.type === 'parallel');
      let joinTarget: string | undefined;
      for (const b of branches) {
        traversedEdgeIds.push(b.id);
        const jt = runBranch(b.targetNodeId);
        if (stoppedReason) break;
        if (jt) {
          if (joinTarget && joinTarget !== jt) stoppedReason = 'Parallel branches join at different steps.';
          joinTarget = jt;
        }
      }
      if (!stoppedReason && !joinTarget) stoppedReason = 'Parallel branches never join.';
      current = joinTarget;
      continue;
    }
    current = res?.targetNodeId;
  }
  if (guard >= MAX_STEPS && !reachedEnd) stoppedReason = 'Step limit reached; the graph may loop without an exit.';

  return { scenarioId: scenario.id, steps, finalState: state, reachedEnd, visitedNodeIds, traversedEdgeIds, routerOutcomes, stoppedReason };
}
