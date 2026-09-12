import type { GraphProject, GraphDefinition, StateField } from './types';
import { elementName } from './graph';
import { describeOperator } from './simulate';
import { lint } from './lint';
import { simulate } from './simulate';

export const EXPORT_DISCLAIMER = `Export status: Prototype specification

This export documents the current workflow design. It does not include a deployed runtime,
security certification, legal review, or production-operational guarantees.`;

const mid = (id: string) => id.replace(/[^A-Za-z0-9_]/g, '_');
const q = (s: string) => s.replace(/"/g, '#quot;');

export function toMermaid(g: GraphDefinition): string {
  const lines = ['flowchart TD'];
  for (const n of g.nodes) {
    const shape = n.category === 'human_review' ? `[/"${q(n.name)}"/]` : n.category === 'input' || n.category === 'output' ? `(["${q(n.name)}"])` : `["${q(n.name)}"]`;
    lines.push(`  ${mid(n.id)}${shape}`);
  }
  for (const r of g.routers) lines.push(`  ${mid(r.id)}{"${q(r.question)}"}`);
  for (const e of g.edges) {
    const arrow = e.type === 'failure' ? '-.->' : e.type === 'retry' || e.type === 'review_resume' ? '-. ' : '-->';
    const label = e.label ? `|${q(e.label)}|` : '';
    if (arrow === '-. ') lines.push(`  ${mid(e.sourceNodeId)} -. ${e.label ? q(e.label) : ''} .-> ${mid(e.targetNodeId)}`);
    else lines.push(`  ${mid(e.sourceNodeId)} ${arrow}${label} ${mid(e.targetNodeId)}`);
  }
  lines.push(`  %% ${EXPORT_DISCLAIMER.split('\n')[0]}`);
  return lines.join('\n');
}

export function redactForPublic(project: GraphProject): GraphProject {
  const copy = JSON.parse(JSON.stringify(project)) as GraphProject;
  copy.stateSchema.fields = copy.stateSchema.fields.map((f: StateField) => (f.exportPolicy === 'redact' ? { ...f, defaultValue: '[redacted]' } : f.exportPolicy === 'exclude' ? { ...f, defaultValue: '[excluded]' } : f));
  const policy = new Map(project.stateSchema.fields.map((f) => [f.id, f.exportPolicy]));
  const scrub = (obj: Record<string, unknown>) => {
    for (const k of Object.keys(obj)) {
      if (policy.get(k) === 'redact') obj[k] = '[redacted]';
      else if (policy.get(k) === 'exclude') delete obj[k];
    }
  };
  for (const s of copy.scenarios) {
    scrub(s.input);
    for (const o of Object.values(s.mockedOutcomes)) { o.patches.forEach(scrub); delete o.failMessage; }
  }
  return copy;
}

export function toJson(project: GraphProject, publicMode: boolean): string {
  const p = publicMode ? redactForPublic(project) : project;
  return JSON.stringify({ exportStatus: 'Prototype specification', disclaimer: EXPORT_DISCLAIMER, exportMode: publicMode ? 'public (sensitive fields redacted)' : 'internal', project: p }, null, 2);
}

export function toMarkdownBrief(project: GraphProject): string {
  const g = project.graph;
  const sims = project.scenarios.map((s) => simulate(project, s));
  const r = lint(project, sims);
  const L: string[] = [];
  L.push(`# ${project.name}: implementation brief`, '', `> ${EXPORT_DISCLAIMER.replace(/\n/g, ' ')}`, '', `**Purpose.** ${project.description}`, '');
  L.push('## Steps', '', '| Step | Category | Reads | Writes | Side effect | Impact |', '|---|---|---|---|---|---|');
  for (const n of g.nodes) L.push(`| ${n.name} | ${n.category} | ${n.reads.join(', ') || '–'} | ${n.writes.join(', ') || '–'} | ${n.sideEffect} | ${n.impact} |`);
  L.push('', '## Decisions', '');
  for (const rt of g.routers) {
    L.push(`### ${rt.question}`, '');
    for (const rule of rt.rules) L.push(`- IF ${rule.field} ${describeOperator(rule.operator)} ${JSON.stringify(rule.value)} THEN go to ${elementName(g, rule.targetNodeId)} (${rule.label})`);
    L.push(`- OTHERWISE go to ${elementName(g, rt.defaultTargetNodeId)} (${rt.defaultLabel}, safe default)`);
    if (rt.maxIterations !== undefined) L.push(`- Loop limit: ${rt.maxIterations} iterations`);
    L.push('');
  }
  L.push('## State contract', '', '| Field | Type | Classification | Export | Description |', '|---|---|---|---|---|');
  for (const f of project.stateSchema.fields) L.push(`| ${f.name} | ${f.type} | ${f.classification} | ${f.exportPolicy} | ${f.description} |`);
  L.push('', '## Connections', '');
  for (const e of g.edges) L.push(`- ${elementName(g, e.sourceNodeId)} → ${elementName(g, e.targetNodeId)}${e.label ? ` (${e.label})` : ''} [${e.type}]`);
  L.push('', '## Test scenarios', '');
  for (const s of project.scenarios) {
    const sim = sims.find((x) => x.scenarioId === s.id)!;
    L.push(`- **${s.name}.** ${s.description} Result: ${sim.reachedEnd ? 'reached the end outcome' : `stopped (${sim.stoppedReason})`} in ${sim.steps.length} steps; decisions: ${sim.routerOutcomes.join(' → ') || 'none'}.`);
  }
  L.push('', '## Prototype readiness', '', `Status: ${r.status}.`, `Not yet: ${r.notYet}.`, '');
  for (const f of r.findings.filter((x) => x.level !== 'pass')) L.push(`- ${f.level === 'gap' ? 'Gap' : 'Recommended review'}: ${f.message}`);
  L.push(`- Design checks passed: ${r.passes}`, '', '## Requires implementation review', '', 'This brief is a design-time specification. Runtime behaviour, real data sources, error handling under load, and authorization must be designed and reviewed separately.', '');
  return L.join('\n');
}
