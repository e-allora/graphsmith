import type { NodeCategory, EdgeType, Classification } from '../domain/types';

export const CATEGORY_LABEL: Record<NodeCategory, string> = { input: 'Input', transform: 'Step', retrieve: 'Lookup', validate: 'Check', human_review: 'Human review', action: 'Action', recovery: 'Recovery', output: 'Outcome' };
export const CATEGORY_GLYPH: Record<NodeCategory, string> = { input: 'IN', transform: 'ST', retrieve: 'LK', validate: 'CK', human_review: 'HR', action: 'AC', recovery: 'RC', output: 'OUT' };
export const CATEGORY_COLOR: Record<NodeCategory, string> = { input: '#dcfce7', transform: '#e0f2fe', retrieve: '#e0e7ff', validate: '#fef9c3', human_review: '#ede9fe', action: '#fee2e2', recovery: '#f1f5f9', output: '#d1fae5' };
export const CATEGORY_HELP: Record<NodeCategory, string> = {
  input: 'Where information enters the workflow.',
  transform: 'Turns what the workflow knows into something new.',
  retrieve: 'Looks something up. Mocked in this demo.',
  validate: 'Checks quality and writes a score or a list of gaps.',
  human_review: 'A person decides here. The workflow waits.',
  action: 'Would have a real effect in production. Mocked here.',
  recovery: 'Runs when another step fails.',
  output: 'The end outcome of the workflow.',
};
export const EDGE_LABEL: Record<EdgeType, string> = { default: 'Connection', success: 'Decision path', failure: 'Failure path', retry: 'Retry loop', review_resume: 'Resubmit after review', parallel: 'Parallel branch', join: 'Join' };
export const EDGE_COLOR: Record<EdgeType, string> = { default: '#94a3b8', success: '#16a34a', failure: '#dc2626', retry: '#d97706', review_resume: '#7c3aed', parallel: '#0ea5e9', join: '#0ea5e9' };
export const CLASS_HELP: Record<Classification, string> = { public: 'Safe to show anywhere.', internal: 'Fine inside the team; not for public export.', confidential: 'Redacted in public export.', personal: 'About a person. Redacted in public export.', restricted: 'Never leaves the workspace.' };
