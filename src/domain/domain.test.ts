import { describe, it, expect } from 'vitest';
import { researchBriefProject, templates } from './template';
import { simulate } from './simulate';
import { lint } from './lint';
import { toMermaid, toJson, toMarkdownBrief } from './exportFormats';
import { encodeShare, decodeShare } from './share';
import { draftFromDescription } from './draft';

const p = researchBriefProject;
const byId = (id: string) => p.scenarios.find((s) => s.id === id)!;

describe('simulator', () => {
  it('runs every built-in scenario to the end, deterministically', () => {
    for (const s of p.scenarios) {
      const a = simulate(p, s);
      const b = simulate(p, s);
      expect(a.reachedEnd, s.id).toBe(true);
      expect(a.stoppedReason).toBeUndefined();
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.routerOutcomes).toEqual(s.expectedRouterOutcomes);
    }
  });
  it('explains the coverage decision from visible values', () => {
    const r = simulate(p, byId('evidence_incomplete'));
    const router = r.steps.find((st) => st.kind === 'router')!;
    expect(router.routerDetail?.usedDefault).toBe(true);
    expect(router.explanation).toContain('coverageScore = 0.62');
    expect(router.explanation).toContain('improve the plan');
    expect(r.finalState.iterationCount).toBe(1);
    expect(r.finalState.coverageScore).toBe(0.88);
  });
  it('routes a mock failure through the recovery path without leaking internals', () => {
    const r = simulate(p, byId('source_failure'));
    const fail = r.steps.find((st) => st.kind === 'failure')!;
    expect(fail.nextElementId).toBe('fallback_b');
    expect(r.visitedNodeIds).toContain('fallback_b');
    expect((r.finalState.errors as unknown[]).length).toBe(2);
    expect(JSON.stringify(r.finalState.errors)).not.toMatch(/stack|at /);
  });
  it('abstains when the decision has no evidence and explains what would change the outcome', () => {
    const r = simulate(p, byId('evidence_unavailable'));
    const router = r.steps.find((st) => st.kind === 'router')!;
    expect(router.routerDetail?.insufficient).toBe(true);
    expect(router.nextElementId).toBe('human_review');
    expect(router.routerDetail?.counterfactuals[0]).toMatch(/had a value/);
    const ok = simulate(p, byId('evidence_sufficient')).steps.find((st) => st.kind === 'router')!;
    expect(ok.routerDetail?.counterfactuals.join(' ')).toMatch(/were not at least 0.8/);
    expect(r.reachedEnd).toBe(true);
  });
  it('lets the reviewer stop the workflow', () => {
    const r = simulate(p, byId('evidence_sufficient'), { reviewerDecision: 'stop' });
    expect(r.reachedEnd).toBe(false);
    expect(r.stoppedReason).toMatch(/reviewer/);
  });
  it('lets the demo operator override the reviewer decision', () => {
    const r = simulate(p, byId('evidence_sufficient'), { reviewerDecision: 'revise' });
    expect(r.routerOutcomes).toEqual(['Yes, draft the brief', 'Revision requested', 'Approved']);
    expect(r.reachedEnd).toBe(true);
  });
  it('stops when a loop reaches its limit', () => {
    const s = structuredClone(byId('evidence_incomplete'));
    s.mockedOutcomes.evaluate.patches = [{ coverageScore: 0.5, coverageGaps: ['x'] }];
    s.mockedOutcomes.improve_plan.patches = [{ iterationCount: 1 }, { iterationCount: 2 }, { iterationCount: 3 }];
    const r = simulate(p, s);
    expect(r.reachedEnd).toBe(false);
    expect(r.stoppedReason).toMatch(/Loop limit/);
  });
});

describe('lint', () => {
  it('reports no gaps for the template and finds the untested failure paths honestly', () => {
    const sims = p.scenarios.map((s) => simulate(p, s));
    const r = lint(p, sims);
    expect(r.gaps).toBe(0);
    expect(r.findings.some((f) => f.message.includes('Research source A') && f.message.includes('no failure path'))).toBe(true);
    expect(r.findings.some((f) => f.message.includes('maximum of 2 iterations'))).toBe(true);
    const cov = Object.fromEntries(r.coverage.map((c) => [c.label, `${c.done}/${c.total}`]));
    expect(cov['Steps exercised']).toBe('15/15');
    expect(cov['Decision outcomes covered']).toBe('5/5');
    expect(cov['Failure paths exercised']).toBe('1/1');
  });
  it('flags a router without a default path', () => {
    const q = structuredClone(p);
    q.graph.edges = q.graph.edges.filter((e) => e.id !== 'e_r_coverage__improve_plan');
    const r = lint(q, []);
    expect(r.findings.some((f) => f.level === 'gap' && f.message.includes('no visible default path'))).toBe(true);
  });
});

describe('export and share', () => {
  it('produces mermaid, json and markdown with the disclaimer', () => {
    expect(toMermaid(p.graph)).toContain('flowchart TD');
    expect(toJson(p, true)).toContain('[redacted]');
    expect(toJson(p, true)).not.toContain('timed out');
    expect(toMarkdownBrief(p)).toContain('Prototype specification');
  });
  it('round-trips a redacted share token', () => {
    const t = encodeShare(p);
    const back = decodeShare(t)!;
    expect(back.graph.nodes.length).toBe(p.graph.nodes.length);
    expect(back.stateSchema.fields.find((f) => f.id === 'draftBrief')?.defaultValue).toBe('[redacted]');
    expect(decodeShare('nope')).toBeUndefined();
  });
});

describe('drafter', () => {
  it('drafts a graph with parallel work, a decision loop and a review from plain language', () => {
    const r = draftFromDescription('Plan research, investigate independent questions in parallel, combine evidence, check coverage and repeat research once if evidence is incomplete, ask a reviewer to approve the final brief, then publish it.');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const g = r.draft.project.graph;
    expect(g.edges.some((e) => e.type === 'parallel')).toBe(true);
    expect(g.routers.length).toBe(2);
    expect(g.nodes.some((n) => n.category === 'human_review')).toBe(true);
    expect(r.draft.assumptions.length).toBeGreaterThan(0);
    expect(r.draft.openQuestions.length).toBeGreaterThan(0);
    const sim = simulate(r.draft.project, r.draft.project.scenarios[0]);
    expect(sim.reachedEnd).toBe(true);
    expect(lint(r.draft.project, [sim]).gaps).toBe(0);
    expect(r.draft.interpretation.choices.find((c) => c.key === 'review')?.on).toBe(true);
    const seq = draftFromDescription('Plan research, investigate independent questions in parallel, combine evidence, then publish it.', { parallel: false, review: true });
    expect(seq.ok && seq.draft.project.graph.edges.some((e) => e.type === 'parallel')).toBe(false);
    expect(seq.ok && seq.draft.project.graph.nodes.some((n) => n.category === 'human_review')).toBe(true);
  });
  it('refuses restricted domains and strips secrets', () => {
    expect(draftFromDescription('Screen candidates for hiring and rank them').ok).toBe(false);
    const r = draftFromDescription('Fetch the data with api_key=sk-12345, summarize it, and email the summary.');
    expect(r.ok && r.draft.safetyNotes.some((n) => n.includes('removed'))).toBe(true);
    expect(r.ok && JSON.stringify(r.draft.project)).not.toContain('sk-12345');
  });
});

describe('all templates', () => {
  for (const [id, t] of Object.entries(templates)) {
    it(`${id}: every scenario ends, outcomes match, lint has no gaps`, () => {
      const sims = t.scenarios.map((sc) => simulate(t, sc));
      for (const [i, sim] of sims.entries()) {
        expect(sim.reachedEnd, `${id}/${t.scenarios[i].id}: ${sim.stoppedReason}`).toBe(true);
        expect(sim.routerOutcomes, `${id}/${t.scenarios[i].id}`).toEqual(t.scenarios[i].expectedRouterOutcomes);
      }
      const r = lint(t, sims);
      expect(r.gaps, r.findings.filter((x) => x.level === 'gap').map((x) => x.message).join('; ')).toBe(0);
      expect(r.coverage.find((c) => c.label === 'Decision outcomes covered')!.done).toBe(r.coverage.find((c) => c.label === 'Decision outcomes covered')!.total);
      expect(t.graph.nodes.filter((x) => x.category === 'human_review').every((x) => x.oversight)).toBe(true);
    });
  }
});
