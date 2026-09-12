import type { GraphProject, GraphNode, GraphEdge, Router, StateField, TestScenario } from './types';

const X = 320;

const nodes: GraphNode[] = [
  { id: 'define_goal', name: 'Define research goal', category: 'input', description: 'Capture the topic and the audience for the brief.', reads: [], writes: ['researchGoal'], sideEffect: 'none', impact: 'low', position: { x: X, y: 0 } },
  { id: 'plan_tasks', name: 'Plan research tasks', category: 'transform', description: 'Break the goal into independent questions that can be researched separately.', reads: ['researchGoal'], writes: ['researchPlan'], sideEffect: 'none', impact: 'low', position: { x: X, y: 110 } },
  { id: 'dispatch', name: 'Dispatch research', category: 'transform', description: 'Hand each planned question to a research branch. Branches run in parallel.', reads: ['researchPlan'], writes: [], sideEffect: 'none', impact: 'low', position: { x: X, y: 220 } },
  { id: 'research_a', name: 'Research source A', category: 'retrieve', description: 'Search mock academic sources for the first question.', reads: ['researchPlan'], writes: ['findings'], sideEffect: 'mocked', impact: 'low', position: { x: X - 300, y: 340 } },
  { id: 'research_b', name: 'Research source B', category: 'retrieve', description: 'Search mock industry reports for the second question.', reads: ['researchPlan'], writes: ['findings'], sideEffect: 'mocked', impact: 'low', failureMode: 'route_to_recovery', position: { x: X, y: 340 } },
  { id: 'research_c', name: 'Research source C', category: 'retrieve', description: 'Search mock news archives for the third question.', reads: ['researchPlan'], writes: ['findings'], sideEffect: 'mocked', impact: 'low', position: { x: X + 300, y: 340 } },
  { id: 'fallback_b', name: 'Fallback source', category: 'recovery', description: 'If source B fails, use a cached mock dataset and record the error.', reads: ['researchPlan'], writes: ['findings', 'errors'], sideEffect: 'mocked', impact: 'low', position: { x: X + 320, y: 470 } },
  { id: 'combine', name: 'Combine findings', category: 'transform', description: 'Merge the branch findings into one evidence summary.', reads: ['findings'], writes: ['evidenceSummary'], sideEffect: 'none', impact: 'low', position: { x: X - 40, y: 490 } },
  { id: 'evaluate', name: 'Evaluate coverage', category: 'validate', description: 'Score how well the evidence answers the planned questions and list gaps.', reads: ['findings', 'researchPlan'], writes: ['coverageScore', 'coverageGaps'], sideEffect: 'none', impact: 'low', position: { x: X, y: 600 } },
  { id: 'improve_plan', name: 'Improve research plan', category: 'transform', description: 'Add questions that target the coverage gaps, then research again.', reads: ['coverageGaps', 'researchPlan'], writes: ['researchPlan', 'iterationCount'], sideEffect: 'none', impact: 'low', position: { x: X - 340, y: 600 } },
  { id: 'draft_brief', name: 'Draft brief', category: 'transform', description: 'Create a readable research brief from the evidence summary.', reads: ['evidenceSummary', 'researchGoal'], writes: ['draftBrief'], sideEffect: 'none', impact: 'low', position: { x: X, y: 850 } },
  { id: 'human_review', name: 'Human review checkpoint', category: 'human_review', description: 'A person reads the draft and approves it or requests a revision.', reads: ['draftBrief'], writes: ['reviewerDecision', 'reviewerNotes'], sideEffect: 'none', impact: 'low', position: { x: X, y: 960 } },
  { id: 'improve_draft', name: 'Improve draft', category: 'transform', description: 'Revise the draft using the reviewer notes.', reads: ['draftBrief', 'reviewerNotes'], writes: ['draftBrief', 'iterationCount'], sideEffect: 'none', impact: 'low', position: { x: X - 340, y: 960 } },
  { id: 'publish', name: 'Publish brief', category: 'action', description: 'Send the approved brief to the team space. Mocked in this demo: nothing is sent.', reads: ['draftBrief'], writes: ['publishReceipt'], sideEffect: 'mocked', impact: 'moderate', position: { x: X, y: 1210 } },
  { id: 'final_brief', name: 'Final brief', category: 'output', description: 'The publish-ready brief and its review record.', reads: ['draftBrief', 'publishReceipt'], writes: [], sideEffect: 'none', impact: 'low', position: { x: X, y: 1320 } },
];

const routers: Router[] = [
  {
    id: 'r_coverage', name: 'Coverage decision', question: 'Is the evidence sufficient?',
    rules: [{ id: 'r_coverage_yes', field: 'coverageScore', operator: 'greater_or_equal', value: 0.8, targetNodeId: 'draft_brief', label: 'Yes, draft the brief' }],
    defaultTargetNodeId: 'improve_plan', defaultLabel: 'No, improve the plan', insufficientEvidenceTargetNodeId: 'improve_plan', maxIterations: 2,
    position: { x: X, y: 720 },
  },
  {
    id: 'r_approved', name: 'Approval decision', question: 'Did the reviewer approve?',
    rules: [{ id: 'r_approved_yes', field: 'reviewerDecision', operator: 'equals', value: 'approved', targetNodeId: 'publish', label: 'Approved' }],
    defaultTargetNodeId: 'improve_draft', defaultLabel: 'Revision requested', maxIterations: 2,
    position: { x: X, y: 1080 },
  },
];

const e = (src: string, tgt: string, type: GraphEdge['type'] = 'default', extra: Partial<GraphEdge> = {}): GraphEdge => ({ id: `e_${src}__${tgt}`, sourceNodeId: src, targetNodeId: tgt, type, ...extra });

const edges: GraphEdge[] = [
  e('define_goal', 'plan_tasks'),
  e('plan_tasks', 'dispatch'),
  e('dispatch', 'research_a', 'parallel', { label: 'branch' }),
  e('dispatch', 'research_b', 'parallel', { label: 'branch' }),
  e('dispatch', 'research_c', 'parallel', { label: 'branch' }),
  e('research_a', 'combine', 'join'),
  e('research_b', 'combine', 'join'),
  e('research_c', 'combine', 'join'),
  e('research_b', 'fallback_b', 'failure', { label: 'source failed' }),
  e('fallback_b', 'combine', 'join'),
  e('combine', 'evaluate'),
  e('evaluate', 'r_coverage'),
  e('r_coverage', 'draft_brief', 'success', { label: 'Yes', routerRuleId: 'r_coverage_yes' }),
  e('r_coverage', 'improve_plan', 'default', { label: 'No' }),
  e('improve_plan', 'dispatch', 'retry', { label: 'retry research (max 2)' }),
  e('draft_brief', 'human_review'),
  e('human_review', 'r_approved'),
  e('r_approved', 'publish', 'success', { label: 'Approved', routerRuleId: 'r_approved_yes' }),
  e('r_approved', 'improve_draft', 'default', { label: 'Revise' }),
  e('improve_draft', 'human_review', 'review_resume', { label: 'resubmit' }),
  e('publish', 'final_brief'),
];

const fields: StateField[] = [
  { id: 'researchGoal', name: 'researchGoal', description: 'The topic and audience for the brief.', type: 'string', classification: 'internal', defaultValue: '', exportPolicy: 'include', isInput: true },
  { id: 'researchPlan', name: 'researchPlan', description: 'The questions to research, each with an id.', type: 'array', classification: 'internal', defaultValue: [], exportPolicy: 'include' },
  { id: 'findings', name: 'findings', description: 'Claims collected per source. Each branch writes its own key.', type: 'object', classification: 'internal', defaultValue: {}, exportPolicy: 'include', mergeStrategy: 'Each branch writes a separate key; no branch overwrites another.' },
  { id: 'evidenceSummary', name: 'evidenceSummary', description: 'The combined evidence, ready for drafting.', type: 'string', classification: 'internal', defaultValue: '', exportPolicy: 'include' },
  { id: 'coverageScore', name: 'coverageScore', description: 'Share of planned questions with supporting evidence, 0 to 1.', type: 'number', classification: 'public', defaultValue: 0, exportPolicy: 'include' },
  { id: 'coverageGaps', name: 'coverageGaps', description: 'Questions that still lack evidence.', type: 'array', classification: 'internal', defaultValue: [], exportPolicy: 'include' },
  { id: 'draftBrief', name: 'draftBrief', description: 'The working text of the brief.', type: 'string', classification: 'confidential', defaultValue: '', exportPolicy: 'redact' },
  { id: 'reviewerDecision', name: 'reviewerDecision', description: 'pending, approved, or revise.', type: 'enum', classification: 'internal', defaultValue: 'pending', exportPolicy: 'include' },
  { id: 'reviewerNotes', name: 'reviewerNotes', description: 'Free-text notes from the reviewer.', type: 'string', classification: 'confidential', defaultValue: '', exportPolicy: 'redact' },
  { id: 'iterationCount', name: 'iterationCount', description: 'How many improvement loops have run.', type: 'number', classification: 'public', defaultValue: 0, exportPolicy: 'include' },
  { id: 'publishReceipt', name: 'publishReceipt', description: 'Mock confirmation from the publish step.', type: 'string', classification: 'internal', defaultValue: '', exportPolicy: 'include' },
  { id: 'errors', name: 'errors', description: 'Controlled error records: node, type, message. No stack traces.', type: 'array', classification: 'internal', defaultValue: [], exportPolicy: 'exclude' },
];

const plan1 = [
  { id: 'q1', question: 'What changed in the field since 2024?' },
  { id: 'q2', question: 'Who are the main practitioners?' },
  { id: 'q3', question: 'What are the open disagreements?' },
];
const plan2 = [...plan1, { id: 'q4', question: 'Which primary sources exist?' }];

const findingsA = { A: [{ source: 'Mock journal', claim: 'Adoption doubled between 2024 and 2026.' }] };
const findingsB = { B: [{ source: 'Mock industry report', claim: 'Three vendors hold most of the market.' }] };
const findingsC = { C: [{ source: 'Mock news archive', claim: 'Regulators opened a review in 2025.' }] };
const findingsB2 = { B: [{ source: 'Mock industry report', claim: 'Three vendors hold most of the market.' }, { source: 'Mock primary survey', claim: 'Practitioners report a 40% time saving.' }] };

const goal = 'Prepare a two-page brief on graph-based AI workflow tools for a product team.';

const commonTail = {
  combine: { patches: [{ evidenceSummary: 'Combined 3 sources: adoption trend, market structure, regulatory review.' }, { evidenceSummary: 'Combined 4 sources, now including a primary survey.' }] },
  draft_brief: { patches: [{ draftBrief: 'Graph-based workflow tools: adoption doubled since 2024, market led by three vendors, regulatory review open... (mock draft, 640 words)' }] },
  publish: { patches: [{ publishReceipt: 'mock-receipt-0001 (nothing was sent)' }] },
};

const scenarios: TestScenario[] = [
  {
    id: 'evidence_sufficient', name: 'Evidence sufficient',
    description: 'All three research branches return findings. Coverage passes the threshold on the first pass and the reviewer approves.',
    input: { researchGoal: goal },
    expectedRouterOutcomes: ['Yes, draft the brief', 'Approved'],
    mockedOutcomes: {
      plan_tasks: { patches: [{ researchPlan: plan1 }] },
      research_a: { patches: [{ findings: findingsA }] },
      research_b: { patches: [{ findings: findingsB }] },
      research_c: { patches: [{ findings: findingsC }] },
      evaluate: { patches: [{ coverageScore: 0.86, coverageGaps: [] }] },
      human_review: { patches: [{ reviewerDecision: 'approved', reviewerNotes: 'Clear and well sourced.' }] },
      ...commonTail,
    },
  },
  {
    id: 'evidence_incomplete', name: 'Evidence incomplete',
    description: 'The first research pass scores below the threshold. The coverage decision routes to the improvement path, one bounded loop runs, and the second pass succeeds.',
    input: { researchGoal: goal },
    expectedRouterOutcomes: ['No, improve the plan', 'Yes, draft the brief', 'Approved'],
    mockedOutcomes: {
      plan_tasks: { patches: [{ researchPlan: plan1 }] },
      research_a: { patches: [{ findings: findingsA }, { findings: findingsA }] },
      research_b: { patches: [{ findings: { B: [] } }, { findings: findingsB2 }] },
      research_c: { patches: [{ findings: findingsC }, { findings: findingsC }] },
      evaluate: { patches: [{ coverageScore: 0.62, coverageGaps: ['Missing primary sources', 'Question q2 has no evidence'] }, { coverageScore: 0.88, coverageGaps: [] }] },
      improve_plan: { patches: [{ researchPlan: plan2, iterationCount: 1 }] },
      human_review: { patches: [{ reviewerDecision: 'approved', reviewerNotes: 'Good after the second pass.' }] },
      ...commonTail,
    },
  },
  {
    id: 'reviewer_revision', name: 'Human requests revision',
    description: 'Coverage passes, but the reviewer asks for a revision. The draft is improved and resubmitted, then approved.',
    input: { researchGoal: goal },
    expectedRouterOutcomes: ['Yes, draft the brief', 'Revision requested', 'Approved'],
    mockedOutcomes: {
      plan_tasks: { patches: [{ researchPlan: plan1 }] },
      research_a: { patches: [{ findings: findingsA }] },
      research_b: { patches: [{ findings: findingsB }] },
      research_c: { patches: [{ findings: findingsC }] },
      evaluate: { patches: [{ coverageScore: 0.84, coverageGaps: [] }] },
      human_review: { patches: [{ reviewerDecision: 'revise', reviewerNotes: 'Add a short section on costs.' }, { reviewerDecision: 'approved', reviewerNotes: 'Costs section is fine now.' }] },
      improve_draft: { patches: [{ draftBrief: 'Graph-based workflow tools... now with a costs section (mock draft, 720 words)', iterationCount: 1 }] },
      ...commonTail,
    },
  },
  {
    id: 'source_failure', name: 'Mock research tool failure',
    description: 'Research source B returns a controlled mock error. The failure edge routes to the fallback source, which records the error and supplies cached findings.',
    input: { researchGoal: goal },
    expectedRouterOutcomes: ['Yes, draft the brief', 'Approved'],
    mockedOutcomes: {
      plan_tasks: { patches: [{ researchPlan: plan1 }] },
      research_a: { patches: [{ findings: findingsA }] },
      research_b: { patches: [{ findings: findingsB }], failOnVisit: 1, failMessage: 'Mock source B timed out' },
      research_c: { patches: [{ findings: findingsC }] },
      fallback_b: { patches: [{ findings: { B_fallback: [{ source: 'Cached mock dataset', claim: 'Three vendors hold most of the market (cached 2025).' }] }, errors: [{ node: 'research_b', type: 'timeout', message: 'Mock source B timed out' }] }] },
      evaluate: { patches: [{ coverageScore: 0.81, coverageGaps: ['Source B evidence is cached, not fresh'] }] },
      human_review: { patches: [{ reviewerDecision: 'approved', reviewerNotes: 'Acceptable; note the cached source.' }] },
      ...commonTail,
    },
  },
];

export const researchBriefProject: GraphProject = {
  id: 'research_brief_assistant',
  name: 'Research Brief Assistant',
  description: 'Turn a topic into a reviewed research brief: plan, research in parallel, combine, evaluate coverage, review, publish.',
  status: 'demo',
  graph: { specVersion: '1.0', nodes, edges, routers, entryNodeId: 'define_goal', endNodeIds: ['final_brief'] },
  stateSchema: { version: '1', fields },
  scenarios,
};

/** Other gallery templates are outlines only; the Research Brief Assistant is the interactive one. */
export const templateGallery = [
  { id: 'research_brief_assistant', name: 'Research Brief Assistant', summary: 'Plan, parallel research, coverage decision, human review, publish.', interactive: true },
  { id: 'support_triage', name: 'Support Triage', summary: 'Classify a ticket, route by urgency, escalate to a person when unsure.', interactive: false },
  { id: 'document_intake', name: 'Document Intake', summary: 'Extract fields, validate, ask for corrections, file the record.', interactive: false },
];

export function cloneProject(p: GraphProject): GraphProject {
  return JSON.parse(JSON.stringify(p)) as GraphProject;
}
