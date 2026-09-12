import type { GraphProject, Finding, SimulationResult, CoverageCount } from './types';
import { INSUFFICIENT_LABEL } from './simulate';
import { allIds, reachableFrom, outgoing, incoming, cycleMembers, writersOf, elementName } from './graph';

export type Readiness = { findings: Finding[]; passes: number; warnings: number; gaps: number; status: string; notYet: string; coverage: CoverageCount[] };

export function lint(project: GraphProject, sims: SimulationResult[] = []): Readiness {
  const g = project.graph;
  const f: Finding[] = [];
  const add = (group: Finding['group'], level: Finding['level'], message: string, elementId?: string) => f.push({ id: `${group}_${f.length}`, group, level, message, elementId });

  // Topology
  const hasEntry = !!g.nodes.find((n) => n.id === g.entryNodeId);
  const hasEnd = g.endNodeIds.some((id) => g.nodes.find((n) => n.id === id));
  if (hasEntry && hasEnd) add('topology', 'pass', 'The graph has an entry point and an end outcome.');
  else add('topology', 'gap', hasEntry ? 'No end outcome is defined.' : 'No entry point is defined.');

  const reach = hasEntry ? reachableFrom(g, g.entryNodeId) : new Set<string>();
  const unreachable = allIds(g).filter((id) => !reach.has(id));
  if (unreachable.length === 0) add('topology', 'pass', 'Every step is reachable from the entry point.');
  for (const id of unreachable) add('topology', 'warn', `"${elementName(g, id)}" cannot be reached from the entry point.`, id);

  for (const n of g.nodes) {
    if (outgoing(g, n.id).length === 0 && !g.endNodeIds.includes(n.id)) add('topology', 'warn', `"${n.name}" leads nowhere and is not an end outcome.`, n.id);
    if (incoming(g, n.id).length === 0 && n.id !== g.entryNodeId) add('topology', 'warn', `"${n.name}" is disconnected: nothing leads to it.`, n.id);
  }

  for (const r of g.routers) {
    const outs = outgoing(g, r.id);
    const hasDefault = !!r.defaultTargetNodeId && outs.some((e) => e.targetNodeId === r.defaultTargetNodeId);
    if (!hasDefault) add('topology', 'gap', `Decision "${r.question}" has no visible default path.`, r.id);
    for (const rule of r.rules) if (!outs.some((e) => e.targetNodeId === rule.targetNodeId)) add('topology', 'warn', `Rule "${rule.label}" on "${r.question}" points to a step with no connection.`, r.id);
  }
  if (g.routers.length && g.routers.every((r) => outgoing(g, r.id).some((e) => e.targetNodeId === r.defaultTargetNodeId))) add('topology', 'pass', 'All decisions have a visible default path.');

  const cyc = cycleMembers(g);
  if (cyc.size) {
    const bounded = g.routers.filter((r) => cyc.has(r.id) && r.maxIterations !== undefined);
    const unbounded = g.routers.filter((r) => cyc.has(r.id) && r.maxIterations === undefined);
    for (const r of bounded) add('topology', 'pass', `Loop through "${r.question}" has a maximum of ${r.maxIterations} iterations.`, r.id);
    for (const r of unbounded) add('topology', 'gap', `Loop through "${r.question}" has no maximum iteration count.`, r.id);
    if (bounded.length === 0 && unbounded.length === 0) add('topology', 'gap', 'The graph contains a loop with no decision to exit it.');
  } else add('topology', 'pass', 'The graph has no loops.');

  // State
  const fields = project.stateSchema.fields;
  const byId = new Map(fields.map((x) => [x.id, x]));
  const readFields = new Set<string>();
  for (const n of g.nodes) n.reads.forEach((x) => readFields.add(x));
  for (const r of g.routers) r.rules.forEach((x) => readFields.add(x.field));
  let stateOk = true;
  for (const id of readFields) {
    const fld = byId.get(id);
    if (!fld) { add('state', 'gap', `"${id}" is read but is not declared in the State schema.`); stateOk = false; continue; }
    const written = writersOf(g, id).length > 0 || fld.defaultValue !== undefined || fld.isInput;
    if (!written) { add('state', 'warn', `"${id}" is read but never written and has no default.`); stateOk = false; }
  }
  if (stateOk) add('state', 'pass', 'Every State field that is read is written, has a default, or is an input.');
  add('state', 'pass', 'All State fields have a declared type.');
  for (const n of g.nodes) for (const w of n.writes) if (!byId.has(w)) add('state', 'warn', `"${n.name}" writes "${w}", which is not in the State schema.`, n.id);

  const parallelTargets = new Set(g.edges.filter((e) => e.type === 'parallel').map((e) => e.targetNodeId));
  const parallelWrites = new Map<string, string[]>();
  for (const n of g.nodes) if (parallelTargets.has(n.id)) for (const w of n.writes) parallelWrites.set(w, [...(parallelWrites.get(w) ?? []), n.name]);
  for (const [fieldId, writers] of parallelWrites) {
    if (writers.length < 2) continue;
    const fld = byId.get(fieldId);
    if (fld?.mergeStrategy) add('state', 'pass', `"${fieldId}" is written by ${writers.length} parallel branches with a declared merge approach.`);
    else add('state', 'warn', `"${fieldId}" is written by parallel branches (${writers.join(', ')}) with no declared merge approach.`);
  }

  // Safety
  const actions = g.nodes.filter((n) => n.category === 'action');
  const external = g.nodes.filter((n) => n.sideEffect === 'external');
  if (external.length) for (const n of external) add('safety', 'gap', `"${n.name}" is marked as a real external action. Demo mode does not allow that.`, n.id);
  else add('safety', 'pass', actions.length ? 'All demo actions are mocked; nothing leaves this browser.' : 'No action steps; nothing leaves this browser.');
  for (const n of actions) add('safety', 'pass', `"${n.name}" declares ${n.impact} impact.`, n.id);
  for (const e of g.edges.filter((x) => x.type === 'retry')) {
    const touched = reachableFrom(g, e.targetNodeId);
    for (const a of actions) if (touched.has(a.id)) add('safety', 'warn', `Retry path "${e.label ?? e.id}" can reach the action "${a.name}". Make it idempotent or it may run twice.`, a.id);
  }
  for (const a of actions.filter((x) => x.impact === 'high')) {
    const upstream = g.nodes.filter((n) => n.category === 'human_review' && reachableFrom(g, n.id).has(a.id));
    if (upstream.length) add('safety', 'pass', `High-impact action "${a.name}" has an oversight checkpoint before it.`, a.id);
    else add('safety', 'gap', `High-impact action "${a.name}" has no human checkpoint before it.`, a.id);
  }
  for (const n of g.nodes.filter((x) => x.category === 'human_review')) {
    if (n.oversight) add('safety', 'pass', `"${n.name}" declares its authority (${n.oversight.authority.replace('_', ' ')}) and what the reviewer sees (${n.oversight.sees.length} fields).`, n.id);
    else add('safety', 'warn', `"${n.name}" does not say what authority the reviewer has or what they will see. A yes/no prompt invites rubber-stamping.`, n.id);
  }
  for (const r of g.routers) {
    if (r.insufficientEvidenceTargetNodeId) add('safety', 'pass', `"${r.question}" can abstain: when its evidence is missing it routes to ${elementName(g, r.insufficientEvidenceTargetNodeId)}.`, r.id);
    else add('safety', 'warn', `"${r.question}" has no insufficient-evidence route. With a missing value it will silently take the default.`, r.id);
  }
  const sensitive = fields.filter((x) => ['confidential', 'personal', 'restricted'].includes(x.classification));
  const leaking = sensitive.filter((x) => x.exportPolicy === 'include');
  if (leaking.length === 0) add('safety', 'pass', `Sensitive State fields (${sensitive.length}) are redacted or excluded from public export.`);
  for (const x of leaking) add('safety', 'warn', `"${x.id}" is ${x.classification} but is included in public export.`);

  // Evaluation
  const outcomes = new Set(sims.flatMap((s) => s.routerOutcomes));
  for (const r of g.routers) {
    for (const label of [...r.rules.map((x) => x.label), r.defaultLabel, ...(r.insufficientEvidenceTargetNodeId ? [INSUFFICIENT_LABEL] : [])]) {
      if (outcomes.has(label)) add('evaluation', 'pass', `Outcome "${label}" of "${r.question}" is covered by a scenario.`, r.id);
      else add('evaluation', 'warn', `Outcome "${label}" of "${r.question}" has no scenario.`, r.id);
    }
  }
  const traversed = new Set(sims.flatMap((s) => s.traversedEdgeIds));
  for (const e of g.edges.filter((x) => x.type === 'failure')) {
    if (traversed.has(e.id)) add('evaluation', 'pass', `Failure path from "${elementName(g, e.sourceNodeId)}" is exercised by a scenario.`, e.sourceNodeId);
    else add('evaluation', 'warn', `Failure path from "${elementName(g, e.sourceNodeId)}" is untested.`, e.sourceNodeId);
  }
  for (const n of g.nodes.filter((x) => x.category === 'retrieve' || x.category === 'action')) {
    if (!outgoing(g, n.id).some((e) => e.type === 'failure')) add('evaluation', 'warn', `"${n.name}" has no failure path. If it fails, the run stops.`, n.id);
  }
  for (const s of sims) if (s.stoppedReason) add('evaluation', 'warn', `Scenario "${s.scenarioId}" stopped early: ${s.stoppedReason}`);

  // Coverage counts: what the scenarios actually exercised
  const visited = new Set(sims.flatMap((x) => x.visitedNodeIds));
  const outcomeTotal = g.routers.reduce((n, r) => n + r.rules.length + 1 + (r.insufficientEvidenceTargetNodeId ? 1 : 0), 0);
  const outcomeDone = g.routers.reduce((n, r) => n + [...r.rules.map((x) => x.label), r.defaultLabel, ...(r.insufficientEvidenceTargetNodeId ? [INSUFFICIENT_LABEL] : [])].filter((l) => outcomes.has(l)).length, 0);
  const failEdges = g.edges.filter((x) => x.type === 'failure');
  const reviews = g.nodes.filter((x) => x.category === 'human_review');
  const coverage: CoverageCount[] = [
    { label: 'Steps exercised', done: g.nodes.filter((n) => visited.has(n.id)).length, total: g.nodes.length },
    { label: 'Decision outcomes covered', done: outcomeDone, total: outcomeTotal },
    { label: 'Failure paths exercised', done: failEdges.filter((e) => traversed.has(e.id)).length, total: failEdges.length },
    { label: 'Human checkpoints exercised', done: reviews.filter((n) => visited.has(n.id)).length, total: reviews.length },
    { label: 'Scenarios reaching the end', done: sims.filter((x) => x.reachedEnd).length, total: sims.length },
  ];

  const passes = f.filter((x) => x.level === 'pass').length;
  const warnings = f.filter((x) => x.level === 'warn').length;
  const gaps = f.filter((x) => x.level === 'gap').length;
  const status = gaps ? 'Prototype with known gaps: fix the gaps before a design review' : 'Prototype: suitable for demonstration and design review';
  return { findings: f, passes, warnings, gaps, status, notYet: 'Runtime-ready or production-certified', coverage };
}
