import type { GraphProject, GraphNode, GraphEdge, Router, StateField, NodeCategory, TestScenario } from './types';
import { autoLayout } from './layout';

export type GeneratedDraft = {
  summary: string;
  project: GraphProject;
  assumptions: string[];
  openQuestions: string[];
  safetyNotes: string[];
  suggestedScenarios: string[];
  confidenceNotes: string[];
};

export type DraftResult = { ok: true; draft: GeneratedDraft } | { ok: false; reason: string };

const RESTRICTED = [/\bhir(e|ing)\b/i, /\bcredit\b/i, /\bloan/i, /\binsurance\b/i, /\bmedical\b/i, /\bdiagnos/i, /\blegal advice\b/i, /\bpolic(e|ing)\b/i, /\bbenefit(s)? (claim|eligib)/i, /\bimmigration\b/i];
const SECRET = /(api[_ -]?key|password|secret|token)\s*[:=]\s*\S+/i;

type Guess = { category: NodeCategory; reads: string[]; writes: string[]; sideEffect: GraphNode['sideEffect']; impact: GraphNode['impact'] };

function guess(clause: string): Guess {
  const c = clause.toLowerCase();
  if (/\b(review|approve|approval|sign[- ]off|human|person|reviewer)\b/.test(c)) return { category: 'human_review', reads: ['draft'], writes: ['reviewerDecision'], sideEffect: 'none', impact: 'low' };
  if (/\b(send|email|publish|post|notify|update record|create record|write to|charge|pay)\b/.test(c)) return { category: 'action', reads: ['draft'], writes: ['receipt'], sideEffect: 'mocked', impact: 'moderate' };
  if (/\b(check|validate|evaluate|score|verify|assess|measure)\b/.test(c)) return { category: 'validate', reads: ['findings'], writes: ['score', 'gaps'], sideEffect: 'none', impact: 'low' };
  if (/\b(research|search|fetch|collect|gather|investigate|look up|retrieve|scrape|query)\b/.test(c)) return { category: 'retrieve', reads: ['plan'], writes: ['findings'], sideEffect: 'mocked', impact: 'low' };
  if (/\b(final|deliver|output|report|brief|result)\b/.test(c) && !/\b(draft|write|combine)\b/.test(c)) return { category: 'output', reads: ['draft'], writes: [], sideEffect: 'none', impact: 'low' };
  if (/\b(plan|outline|break down|decide what)\b/.test(c)) return { category: 'transform', reads: ['goal'], writes: ['plan'], sideEffect: 'none', impact: 'low' };
  if (/\b(combine|merge|summari[sz]e|draft|write|generate|compose|synthesi[sz]e)\b/.test(c)) return { category: 'transform', reads: ['findings'], writes: ['draft'], sideEffect: 'none', impact: 'low' };
  if (/\b(receive|input|start with|take|capture|intake)\b/.test(c)) return { category: 'input', reads: [], writes: ['goal'], sideEffect: 'none', impact: 'low' };
  return { category: 'transform', reads: [], writes: [], sideEffect: 'none', impact: 'low' };
}

function titleCase(s: string): string {
  const t = s.trim().replace(/^(then|and|finally|first|next|after that)\s+/i, '').replace(/[.]+$/, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function splitClauses(text: string): string[] {
  return text
    .replace(/\n+/g, '. ')
    .split(/(?:[.;,]|\s+then\s+|\s+and then\s+)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 3)
    .slice(0, 9);
}

/** Rule-based drafter. Runs entirely in the browser; a model-backed drafter would replace this behind the same output shape. */
export function draftFromDescription(text: string): DraftResult {
  const trimmed = text.trim();
  if (trimmed.length < 12) return { ok: false, reason: 'Describe the workflow in at least one full sentence.' };
  for (const re of RESTRICTED) if (re.test(trimmed)) return { ok: false, reason: 'This demo does not draft workflows for hiring, credit, insurance, medical, legal, policing, immigration, or public-benefit decisions. Those need a review process the demo cannot provide.' };
  const secretsRemoved = SECRET.test(trimmed);
  const clean = trimmed.replace(SECRET, '[removed]');
  const clauses = splitClauses(clean);
  if (clauses.length === 0) return { ok: false, reason: 'Could not find any steps in that description.' };

  const wantsParallel = /\b(parallel|independent|at the same time|simultaneous|concurrent|several sources|multiple sources)\b/i.test(clean);
  const wantsLoop = /\b(repeat|retry|again|loop|if .*(incomplete|insufficient|missing|not enough)|until)\b/i.test(clean);

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const routers: Router[] = [];
  const assumptions: string[] = [];
  const openQuestions: string[] = [];
  const safetyNotes: string[] = ['All steps are design-time only. Nothing in this draft can call a real service.'];
  if (secretsRemoved) safetyNotes.push('A credential-like value was found in your description and removed. Graphsmith never stores keys or passwords.');

  const mk = (id: string, name: string, g: Guess, description: string): GraphNode => ({ id, name, category: g.category, description, reads: g.reads, writes: g.writes, sideEffect: g.sideEffect, impact: g.impact, position: { x: 0, y: 0 } });
  const link = (a: string, b: string, type: GraphEdge['type'] = 'default', label?: string, routerRuleId?: string) => edges.push({ id: `e_${a}__${b}`, sourceNodeId: a, targetNodeId: b, type, label, routerRuleId });

  let prev: string | undefined;
  let parallelDone = false;
  let reviewAdded = false;
  let validateId: string | undefined;
  let retrieveIds: string[] = [];
  let firstRetrieveId: string | undefined;

  clauses.forEach((clause, i) => {
    const g = guess(clause);
    const id = `s${i + 1}`;
    if (i === 0 && g.category !== 'input') {
      nodes.push(mk('s0', 'Receive request', { category: 'input', reads: [], writes: ['goal'], sideEffect: 'none', impact: 'low' }, 'Capture the request that starts the workflow.'));
      prev = 's0';
      assumptions.push('The workflow starts with a request captured as "goal".');
    }
    if (g.category === 'retrieve' && wantsParallel && !parallelDone) {
      parallelDone = true;
      const dispatch = mk(`${id}_dispatch`, 'Dispatch in parallel', { category: 'transform', reads: ['plan'], writes: [], sideEffect: 'none', impact: 'low' }, 'Hand the work to parallel branches.');
      nodes.push(dispatch);
      if (prev) link(prev, dispatch.id);
      retrieveIds = ['A', 'B', 'C'].map((k) => `${id}_${k}`);
      retrieveIds.forEach((rid, j) => {
        nodes.push(mk(rid, `${titleCase(clause)} (${['A', 'B', 'C'][j]})`, g, `Parallel branch ${['A', 'B', 'C'][j]} of: ${clause}`));
        link(dispatch.id, rid, 'parallel', 'branch');
      });
      const join = mk(`${id}_join`, 'Combine results', { category: 'transform', reads: ['findings'], writes: ['summary'], sideEffect: 'none', impact: 'low' }, 'Merge the branch results.');
      nodes.push(join);
      retrieveIds.forEach((rid) => link(rid, join.id, 'join'));
      prev = join.id;
      firstRetrieveId = dispatch.id;
      assumptions.push('Three parallel branches are enough; the description did not say how many.');
      openQuestions.push('How should results from parallel branches be merged if they disagree?');
      return;
    }
    if (g.category === 'human_review') {
      reviewAdded = true;
      const n = mk(id, titleCase(clause), g, `A person decides here: ${clause}`);
      nodes.push(n);
      if (prev) link(prev, n.id);
      const r: Router = { id: `${id}_r`, name: 'Approval decision', question: 'Did the reviewer approve?', rules: [{ id: `${id}_r_yes`, field: 'reviewerDecision', operator: 'equals', value: 'approved', targetNodeId: '', label: 'Approved' }], defaultTargetNodeId: '', defaultLabel: 'Revision requested', maxIterations: 1, position: { x: 0, y: 0 } };
      routers.push(r);
      link(n.id, r.id);
      const fix = mk(`${id}_fix`, 'Revise and resubmit', { category: 'transform', reads: ['draft', 'reviewerDecision'], writes: ['draft'], sideEffect: 'none', impact: 'low' }, 'Apply the reviewer feedback.');
      nodes.push(fix);
      r.defaultTargetNodeId = fix.id;
      link(r.id, fix.id, 'default', 'Revise');
      link(fix.id, n.id, 'review_resume', 'resubmit');
      prev = r.id; // the "Approved" edge is linked to the next node
      return;
    }
    const n = mk(id, titleCase(clause), g, clause);
    if (g.category === 'validate') validateId = n.id;
    if (g.category === 'retrieve' && !firstRetrieveId) firstRetrieveId = n.id;
    nodes.push(n);
    if (prev) {
      const pr = routers.find((r) => r.id === prev);
      if (pr) { pr.rules[0].targetNodeId = n.id; link(pr.id, n.id, 'success', pr.rules[0].label, pr.rules[0].id); }
      else link(prev, n.id);
    }
    prev = n.id;
    if (g.category === 'action') {
      safetyNotes.push(`"${n.name}" would have a real effect in production. It is mocked here and marked ${g.impact} impact.`);
      openQuestions.push(`Who is accountable when "${n.name}" runs, and does it need a human checkpoint first?`);
    }
  });

  // Close a dangling router (review was the last clause)
  const last = nodes[nodes.length - 1];
  if (prev && routers.some((r) => r.id === prev)) {
    const out = mk('s_end', 'Final result', { category: 'output', reads: ['draft'], writes: [], sideEffect: 'none', impact: 'low' }, 'The approved result.');
    nodes.push(out);
    const pr = routers.find((r) => r.id === prev)!;
    pr.rules[0].targetNodeId = out.id;
    link(pr.id, out.id, 'success', pr.rules[0].label, pr.rules[0].id);
    prev = out.id;
  } else if (last && last.category !== 'output') {
    const out = mk('s_end', 'Final result', { category: 'output', reads: last.writes.length ? last.writes : ['draft'], writes: [], sideEffect: 'none', impact: 'low' }, 'The end outcome of the workflow.');
    nodes.push(out);
    link(last.id, out.id);
    assumptions.push('The last step produces the final result; the description did not name an end outcome.');
  }

  // Bounded loop: validate → decision → back to research
  if (wantsLoop && validateId && firstRetrieveId) {
    const succ = edges.find((e) => e.sourceNodeId === validateId);
    const r: Router = { id: 'r_enough', name: 'Coverage decision', question: 'Is the result good enough?', rules: [{ id: 'r_enough_yes', field: 'score', operator: 'greater_or_equal', value: 0.8, targetNodeId: succ?.targetNodeId ?? '', label: 'Yes, continue' }], defaultTargetNodeId: firstRetrieveId, defaultLabel: 'No, try again', maxIterations: 1, position: { x: 0, y: 0 } };
    routers.push(r);
    if (succ) { edges.splice(edges.indexOf(succ), 1); link(r.id, succ.targetNodeId, 'success', 'Yes', r.rules[0].id); }
    link(validateId, r.id);
    link(r.id, firstRetrieveId, 'retry', 'retry once');
    assumptions.push('"Good enough" means a score of at least 0.8; the description did not give a threshold.');
    assumptions.push('The retry loop runs at most once, so the workflow always ends.');
  } else if (wantsLoop) {
    openQuestions.push('You mentioned repeating work, but there is no checking step to decide when to stop. Add a validate step and a decision.');
  }
  if (!reviewAdded) openQuestions.push('No human checkpoint was described. Should a person approve the result before it is used?');

  // State schema from the reads/writes used
  const used = new Set<string>();
  nodes.forEach((n) => { n.reads.forEach((x) => used.add(x)); n.writes.forEach((x) => used.add(x)); });
  routers.forEach((r) => r.rules.forEach((x) => used.add(x.field)));
  const fields: StateField[] = [...used].map((id) => ({
    id, name: id, description: `Proposed field "${id}"; refine its meaning.`, type: id === 'score' ? 'number' : id === 'reviewerDecision' ? 'enum' : id === 'findings' ? 'object' : id === 'gaps' ? 'array' : 'string',
    classification: 'internal', defaultValue: id === 'score' ? 0 : id === 'reviewerDecision' ? 'pending' : id === 'findings' ? {} : id === 'gaps' ? [] : '', exportPolicy: 'include', isInput: id === 'goal',
    mergeStrategy: id === 'findings' && parallelDone ? 'Each branch writes its own key.' : undefined,
  }));
  openQuestions.push('Which State fields hold personal or confidential data? Mark them so exports redact them.');

  const entry = nodes[0].id;
  const ends = nodes.filter((n) => n.category === 'output').map((n) => n.id);
  const graph = autoLayout({ specVersion: '1.0', nodes, edges, routers, entryNodeId: entry, endNodeIds: ends });

  const scenario: TestScenario = { id: 'happy_path', name: 'Expected path (proposed)', description: 'A first scenario where every step succeeds. Edit the mocked values to make it realistic.', input: { goal: clean.slice(0, 120) }, mockedOutcomes: {} };
  for (const n of nodes) {
    const patch: Record<string, unknown> = {};
    for (const w of n.writes) patch[w] = w === 'score' ? 0.9 : w === 'reviewerDecision' ? 'approved' : w === 'findings' ? { [n.id]: [{ source: 'mock', claim: 'example claim' }] } : w === 'gaps' ? [] : `example ${w} from ${n.name}`;
    if (Object.keys(patch).length) scenario.mockedOutcomes[n.id] = { patches: [patch] };
  }

  const project: GraphProject = { id: 'generated_draft', name: 'Generated draft', description: clean.slice(0, 200), status: 'draft', graph, stateSchema: { version: '1', fields }, scenarios: [scenario] };
  return {
    ok: true,
    draft: {
      summary: `${nodes.length} steps, ${routers.length} decision${routers.length === 1 ? '' : 's'}, ${edges.length} connections, drafted from ${clauses.length} phrases in your description.`,
      project, assumptions, openQuestions, safetyNotes,
      suggestedScenarios: ['Expected path where every step succeeds', routers.length ? 'Each decision takes its default path at least once' : 'A step returns an empty result', 'A retrieve or action step fails and the run stops'],
      confidenceNotes: ['This draft comes from a rule-based drafter running in your browser, not from a language model. It recognises verbs like plan, research, check, review, and publish.', 'Step names are your own phrases; categories are guesses. Check each one in the inspector.'],
    },
  };
}
