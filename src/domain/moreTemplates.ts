import type { GraphProject, GraphNode, GraphEdge, Router, StateField, TestScenario } from './types';
import type { GraphDefinition } from './types';

const X = 320;
function place(g: GraphDefinition, pos: Record<string, [number, number]>): GraphDefinition {
  const at = (id: string, cur: { x: number; y: number }) => (pos[id] ? { x: pos[id][0], y: pos[id][1] } : cur);
  return { ...g, nodes: g.nodes.map((n) => ({ ...n, position: at(n.id, n.position) })), routers: g.routers.map((r) => ({ ...r, position: at(r.id, r.position) })) };
}

const n = (id: string, name: string, category: GraphNode['category'], description: string, reads: string[], writes: string[], extra: Partial<GraphNode> = {}): GraphNode => ({
  id, name, category, description, reads, writes, sideEffect: category === 'action' || category === 'retrieve' ? 'mocked' : 'none', impact: category === 'action' ? 'moderate' : 'low', position: { x: 0, y: 0 }, ...extra,
});
const e = (src: string, tgt: string, type: GraphEdge['type'] = 'default', extra: Partial<GraphEdge> = {}): GraphEdge => ({ id: `e_${src}__${tgt}`, sourceNodeId: src, targetNodeId: tgt, type, ...extra });
const f = (id: string, description: string, type: StateField['type'], classification: StateField['classification'], defaultValue: unknown, extra: Partial<StateField> = {}): StateField => ({
  id, name: id, description, type, classification, defaultValue, exportPolicy: ['confidential', 'personal', 'restricted'].includes(classification) ? 'redact' : 'include', ...extra,
});

/* ------------------------------------------------------------------ */
/* Support Triage                                                      */
/* ------------------------------------------------------------------ */

const triageNodes: GraphNode[] = [
  n('receive_ticket', 'Receive ticket', 'input', 'A customer message arrives from the support form.', [], ['ticket']),
  n('classify', 'Classify request', 'transform', 'A mock classifier labels the category and scores urgency. It also reports how sure it is.', ['ticket'], ['category', 'urgencyScore', 'classifierConfidence']),
  n('escalate', 'Escalate to a person', 'human_review', 'A support lead takes the case. The workflow does nothing further on its own.', ['ticket', 'category', 'urgencyScore', 'classifierConfidence'], ['reviewerDecision', 'escalationNote'],
    { oversight: { authority: 'block', who: 'Support lead', sees: ['ticket', 'category', 'urgencyScore', 'classifierConfidence', 'errors'], actions: ['approve', 'stop'] } }),
  n('search_answers', 'Search help articles', 'retrieve', 'Look up candidate answers in the mock knowledge base.', ['ticket', 'category'], ['candidateAnswers'], { failureMode: 'route_to_recovery' }),
  n('no_answers', 'Knowledge base unavailable', 'recovery', 'If search fails, continue with no candidates and record the error. The draft will be low confidence.', [], ['candidateAnswers', 'errors']),
  n('draft_reply', 'Draft reply', 'transform', 'Write a reply from the candidate answers and score how well they cover the question.', ['ticket', 'candidateAnswers'], ['draftReply', 'answerConfidence']),
  n('agent_review', 'Agent review checkpoint', 'human_review', 'A support agent reads the draft before anything is sent.', ['ticket', 'draftReply', 'answerConfidence', 'candidateAnswers'], ['reviewerDecision', 'reviewerNotes'],
    { oversight: { authority: 'approve_before', who: 'Support agent', sees: ['ticket', 'draftReply', 'answerConfidence', 'candidateAnswers', 'errors'], actions: ['approve', 'revise', 'request_evidence', 'stop'] } }),
  n('improve_reply', 'Improve reply', 'transform', 'Revise the draft using the agent notes.', ['draftReply', 'reviewerNotes'], ['draftReply', 'iterationCount']),
  n('send_reply', 'Send reply', 'action', 'Send the reply to the customer. Mocked: nothing is sent.', ['draftReply'], ['sendReceipt'], { impact: 'moderate' }),
  n('closed', 'Ticket resolved', 'output', 'The reply went out and the ticket is closed.', ['sendReceipt'], []),
  n('handled_by_person', 'Handled by a person', 'output', 'The case is with a support lead. The workflow records the handoff.', ['escalationNote'], []),
];

const triageRouters: Router[] = [
  { id: 'r_urgent', name: 'Urgency decision', question: 'Is this urgent or unsafe to automate?', rules: [{ id: 'r_urgent_yes', field: 'urgencyScore', operator: 'greater_or_equal', value: 0.7, targetNodeId: 'escalate', label: 'Urgent: a person takes it' }], defaultTargetNodeId: 'search_answers', defaultLabel: 'Routine: search for an answer', insufficientEvidenceTargetNodeId: 'escalate', position: { x: 0, y: 0 } },
  { id: 'r_confident', name: 'Confidence decision', question: 'Is the draft good enough to send without review?', rules: [{ id: 'r_confident_yes', field: 'answerConfidence', operator: 'greater_or_equal', value: 0.85, targetNodeId: 'send_reply', label: 'Confident: send' }], defaultTargetNodeId: 'agent_review', defaultLabel: 'Not sure: agent reviews', insufficientEvidenceTargetNodeId: 'agent_review', position: { x: 0, y: 0 } },
  { id: 'r_agent_ok', name: 'Agent decision', question: 'Did the agent approve the reply?', rules: [{ id: 'r_agent_ok_yes', field: 'reviewerDecision', operator: 'equals', value: 'approved', targetNodeId: 'send_reply', label: 'Approved' }], defaultTargetNodeId: 'improve_reply', defaultLabel: 'Revision requested', maxIterations: 2, position: { x: 0, y: 0 } },
];

const triageEdges: GraphEdge[] = [
  e('receive_ticket', 'classify'),
  e('classify', 'r_urgent'),
  e('r_urgent', 'escalate', 'success', { label: 'Urgent', routerRuleId: 'r_urgent_yes' }),
  e('r_urgent', 'search_answers', 'default', { label: 'Routine' }),
  e('r_urgent', 'escalate', 'default', { label: '? no score', routerRuleId: 'insufficient' }),
  e('escalate', 'handled_by_person'),
  e('search_answers', 'draft_reply'),
  e('search_answers', 'no_answers', 'failure', { label: 'search failed' }),
  e('no_answers', 'draft_reply'),
  e('draft_reply', 'r_confident'),
  e('r_confident', 'send_reply', 'success', { label: 'Confident', routerRuleId: 'r_confident_yes' }),
  e('r_confident', 'agent_review', 'default', { label: 'Review' }),
  e('r_confident', 'agent_review', 'default', { label: '? no score', routerRuleId: 'insufficient' }),
  e('agent_review', 'r_agent_ok'),
  e('r_agent_ok', 'send_reply', 'success', { label: 'Approved', routerRuleId: 'r_agent_ok_yes' }),
  e('r_agent_ok', 'improve_reply', 'default', { label: 'Revise' }),
  e('improve_reply', 'agent_review', 'review_resume', { label: 'resubmit' }),
  e('send_reply', 'closed'),
];

const triageFields: StateField[] = [
  f('ticket', 'The customer message. Personal data: redacted in exports.', 'string', 'personal', '', { isInput: true }),
  f('category', 'Mock classifier label: billing, access, how_to, safety.', 'enum', 'internal', 'unknown'),
  f('urgencyScore', 'Mock urgency score, 0 to 1.', 'number', 'internal', 0),
  f('classifierConfidence', 'How sure the classifier was, 0 to 1.', 'number', 'internal', 0),
  f('candidateAnswers', 'Help articles that may answer the question.', 'array', 'internal', []),
  f('draftReply', 'The reply text before it is sent.', 'string', 'confidential', ''),
  f('answerConfidence', 'How well the candidates cover the question, 0 to 1.', 'number', 'internal', 0),
  f('reviewerDecision', 'pending, approved, or revise.', 'enum', 'internal', 'pending'),
  f('reviewerNotes', 'Agent notes on the draft.', 'string', 'confidential', ''),
  f('escalationNote', 'Why the case went to a person.', 'string', 'confidential', ''),
  f('sendReceipt', 'Mock confirmation from the send step.', 'string', 'internal', ''),
  f('iterationCount', 'How many revision loops have run.', 'number', 'public', 0),
  f('errors', 'Controlled error records. Excluded from exports.', 'array', 'internal', [], { exportPolicy: 'exclude' }),
];

const articles = [{ source: 'Help center: Reset your password', claim: 'Use the Forgot password link on the sign-in page.' }];
const triageScenarios: TestScenario[] = [
  { id: 'routine_question', name: 'Routine question', description: 'A how-to question. Low urgency, a strong help article, and a confident draft. The reply goes out with no human in the loop.', input: { ticket: 'How do I reset my password? (synthetic)' }, expectedRouterOutcomes: ['Routine: search for an answer', 'Confident: send'],
    mockedOutcomes: { classify: { patches: [{ category: 'how_to', urgencyScore: 0.15, classifierConfidence: 0.93 }] }, search_answers: { patches: [{ candidateAnswers: articles }] }, draft_reply: { patches: [{ draftReply: 'Hi! You can reset it from the Forgot password link... (mock)', answerConfidence: 0.91 }] }, send_reply: { patches: [{ sendReceipt: 'mock-send-0001 (nothing was sent)' }] } } },
  { id: 'urgent_safety', name: 'Urgent safety message', description: 'The classifier flags a safety concern with high urgency. The urgency decision hands the case to a support lead and the workflow does nothing else on its own.', input: { ticket: 'Someone is using my account and threatening me. (synthetic)' }, expectedRouterOutcomes: ['Urgent: a person takes it'],
    mockedOutcomes: { classify: { patches: [{ category: 'safety', urgencyScore: 0.96, classifierConfidence: 0.88 }] }, escalate: { patches: [{ reviewerDecision: 'approved', escalationNote: 'Support lead took the case at once; account locked pending contact (mock).' }] } } },
  { id: 'uncertain_answer', name: 'Uncertain answer', description: 'The help articles only partly cover the question. The confidence decision sends the draft to an agent, who approves it.', input: { ticket: 'Why was I charged twice this month? (synthetic)' }, expectedRouterOutcomes: ['Routine: search for an answer', 'Not sure: agent reviews', 'Approved'],
    mockedOutcomes: { classify: { patches: [{ category: 'billing', urgencyScore: 0.35, classifierConfidence: 0.8 }] }, search_answers: { patches: [{ candidateAnswers: [{ source: 'Help center: Understanding your invoice', claim: 'Charges appear on the billing date and on plan changes.' }] }] }, draft_reply: { patches: [{ draftReply: 'It looks like a plan change created a second charge... (mock)', answerConfidence: 0.58 }] }, agent_review: { patches: [{ reviewerDecision: 'approved', reviewerNotes: 'Correct; the second charge is a prorated upgrade.' }] }, send_reply: { patches: [{ sendReceipt: 'mock-send-0002 (nothing was sent)' }] } } },
  { id: 'search_outage', name: 'Knowledge base outage', description: 'Search fails with a mock error. The failure path continues with no candidates, the draft is low confidence, the agent asks for a revision, and the improved reply is approved.', input: { ticket: 'I cannot find where to download my invoices. (synthetic)' }, expectedRouterOutcomes: ['Routine: search for an answer', 'Not sure: agent reviews', 'Revision requested', 'Approved'],
    mockedOutcomes: { classify: { patches: [{ category: 'how_to', urgencyScore: 0.2, classifierConfidence: 0.9 }] }, search_answers: { patches: [{ candidateAnswers: articles }], failOnVisit: 1, failMessage: 'Mock knowledge base timed out' }, no_answers: { patches: [{ candidateAnswers: [], errors: [{ node: 'search_answers', type: 'timeout', message: 'Mock knowledge base timed out' }] }] }, draft_reply: { patches: [{ draftReply: 'Thanks for reaching out. Could you tell me more... (mock, no sources)', answerConfidence: 0.3 }] }, agent_review: { patches: [{ reviewerDecision: 'revise', reviewerNotes: 'Invoices are under Billing > Documents. Say that.' }, { reviewerDecision: 'approved', reviewerNotes: 'Good.' }] }, improve_reply: { patches: [{ draftReply: 'Your invoices are under Billing > Documents... (mock)', iterationCount: 1 }] }, send_reply: { patches: [{ sendReceipt: 'mock-send-0003 (nothing was sent)' }] } } },
  { id: 'classifier_no_score', name: 'Classifier returns no score', description: 'The classifier fails to produce an urgency score. The urgency decision abstains and hands the case to a person rather than treating it as routine.', input: { ticket: '???? (synthetic garbled message)' }, expectedRouterOutcomes: ['Insufficient evidence'],
    mockedOutcomes: { classify: { patches: [{ category: 'unknown', urgencyScore: null, classifierConfidence: 0.1 }] }, escalate: { patches: [{ reviewerDecision: 'approved', escalationNote: 'Message unreadable; support lead replied by phone (mock).' }] } } },
];

export const supportTriageProject: GraphProject = {
  id: 'support_triage', name: 'Support Triage', status: 'demo',
  description: 'Classify a support ticket, route urgent or unsafe cases to a person, answer routine questions from help articles, and keep an agent in the loop when the draft is not confident.',
  graph: place({ specVersion: '1.0', nodes: triageNodes, edges: triageEdges, routers: triageRouters, entryNodeId: 'receive_ticket', endNodeIds: ['closed', 'handled_by_person'] }, {
    receive_ticket: [X, 0], classify: [X, 120], r_urgent: [X, 250], escalate: [X - 340, 440], handled_by_person: [X - 340, 600],
    search_answers: [X, 440], no_answers: [X + 320, 440], draft_reply: [X, 580], r_confident: [X, 710],
    agent_review: [X + 40, 900], r_agent_ok: [X + 40, 1040], improve_reply: [X + 380, 1040], send_reply: [X - 340, 1040], closed: [X - 340, 1180],
  }),
  stateSchema: { version: '1', fields: triageFields },
  scenarios: triageScenarios,
};

/* ------------------------------------------------------------------ */
/* Document Intake                                                     */
/* ------------------------------------------------------------------ */

const intakeNodes: GraphNode[] = [
  n('receive_document', 'Receive document', 'input', 'A submitted form arrives as text. Synthetic in this demo.', [], ['documentText']),
  n('extract_fields', 'Extract fields', 'retrieve', 'A mock extractor pulls name, date, amount, and reference into structured fields.', ['documentText'], ['extracted', 'extractionConfidence'], { failureMode: 'route_to_recovery' }),
  n('manual_entry', 'Manual entry fallback', 'recovery', 'If extraction fails, a clerk keys the fields by hand and the error is recorded.', ['documentText'], ['extracted', 'errors']),
  n('validate_fields', 'Validate fields', 'validate', 'Check required fields, formats, and totals. Write a status and the list of issues.', ['extracted'], ['validationStatus', 'validationIssues']),
  n('request_correction', 'Ask submitter to correct', 'human_review', 'The submitter sees the issues and supplies corrected values.', ['extracted', 'validationIssues'], ['extracted', 'reviewerDecision', 'iterationCount'],
    { oversight: { authority: 'choose', who: 'Submitter', sees: ['extracted', 'validationIssues'], actions: ['approve', 'stop'] } }),
  n('classify_sensitivity', 'Classify sensitivity', 'validate', 'Decide whether the record holds sensitive personal data.', ['extracted'], ['sensitivityLevel']),
  n('privacy_review', 'Privacy review checkpoint', 'human_review', 'A privacy reviewer decides whether the record can be filed as is or needs redaction.', ['extracted', 'sensitivityLevel'], ['reviewerDecision', 'reviewerNotes'],
    { oversight: { authority: 'approve_before', who: 'Privacy reviewer', sees: ['extracted', 'sensitivityLevel', 'validationIssues', 'errors'], actions: ['approve', 'revise', 'stop'] } }),
  n('redact_fields', 'Redact sensitive fields', 'transform', 'Mask the fields the reviewer flagged before filing.', ['extracted', 'reviewerNotes'], ['extracted', 'redactionApplied']),
  n('file_record', 'File the record', 'action', 'Write the record to the mock registry. Nothing is stored outside this browser.', ['extracted'], ['recordId'], { impact: 'moderate' }),
  n('filed', 'Record filed', 'output', 'The record is filed with an id and a review trail.', ['recordId'], []),
];

const intakeRouters: Router[] = [
  { id: 'r_valid', name: 'Validity decision', question: 'Are the fields valid?', rules: [{ id: 'r_valid_yes', field: 'validationStatus', operator: 'equals', value: 'valid', targetNodeId: 'classify_sensitivity', label: 'Valid' }], defaultTargetNodeId: 'request_correction', defaultLabel: 'Needs correction', insufficientEvidenceTargetNodeId: 'request_correction', maxIterations: 2, position: { x: 0, y: 0 } },
  { id: 'r_sensitive', name: 'Sensitivity decision', question: 'Does it hold sensitive personal data?', rules: [{ id: 'r_sensitive_yes', field: 'sensitivityLevel', operator: 'equals', value: 'high', targetNodeId: 'privacy_review', label: 'Sensitive: privacy review' }], defaultTargetNodeId: 'file_record', defaultLabel: 'Not sensitive: file it', insufficientEvidenceTargetNodeId: 'privacy_review', position: { x: 0, y: 0 } },
  { id: 'r_privacy_ok', name: 'Privacy decision', question: 'Can it be filed as is?', rules: [{ id: 'r_privacy_ok_yes', field: 'reviewerDecision', operator: 'equals', value: 'approved', targetNodeId: 'file_record', label: 'File as is' }], defaultTargetNodeId: 'redact_fields', defaultLabel: 'Redact first', position: { x: 0, y: 0 } },
];

const intakeEdges: GraphEdge[] = [
  e('receive_document', 'extract_fields'),
  e('extract_fields', 'validate_fields'),
  e('extract_fields', 'manual_entry', 'failure', { label: 'extraction failed' }),
  e('manual_entry', 'validate_fields'),
  e('validate_fields', 'r_valid'),
  e('r_valid', 'classify_sensitivity', 'success', { label: 'Valid', routerRuleId: 'r_valid_yes' }),
  e('r_valid', 'request_correction', 'default', { label: 'Fix' }),
  e('r_valid', 'request_correction', 'default', { label: '? no status', routerRuleId: 'insufficient' }),
  e('request_correction', 'validate_fields', 'review_resume', { label: 'corrected (max 2)' }),
  e('classify_sensitivity', 'r_sensitive'),
  e('r_sensitive', 'privacy_review', 'success', { label: 'Sensitive', routerRuleId: 'r_sensitive_yes' }),
  e('r_sensitive', 'file_record', 'default', { label: 'File' }),
  e('r_sensitive', 'privacy_review', 'default', { label: '? unknown', routerRuleId: 'insufficient' }),
  e('privacy_review', 'r_privacy_ok'),
  e('r_privacy_ok', 'file_record', 'success', { label: 'As is', routerRuleId: 'r_privacy_ok_yes' }),
  e('r_privacy_ok', 'redact_fields', 'default', { label: 'Redact' }),
  e('redact_fields', 'file_record'),
  e('file_record', 'filed'),
];

const intakeFields: StateField[] = [
  f('documentText', 'The submitted form as text. Confidential: redacted in exports.', 'string', 'confidential', '', { isInput: true }),
  f('extracted', 'Structured fields pulled from the document. Personal data.', 'object', 'personal', {}),
  f('extractionConfidence', 'How sure the extractor was, 0 to 1.', 'number', 'internal', 0),
  f('validationStatus', 'valid or invalid.', 'enum', 'internal', 'pending'),
  f('validationIssues', 'What is missing or malformed.', 'array', 'internal', []),
  f('sensitivityLevel', 'low, medium, or high.', 'enum', 'internal', 'unknown'),
  f('reviewerDecision', 'pending, approved, or revise.', 'enum', 'internal', 'pending'),
  f('reviewerNotes', 'Which fields to redact, and why.', 'string', 'confidential', ''),
  f('redactionApplied', 'Whether masking was applied before filing.', 'boolean', 'public', false),
  f('recordId', 'Mock registry id.', 'string', 'internal', ''),
  f('iterationCount', 'How many correction rounds have run.', 'number', 'public', 0),
  f('errors', 'Controlled error records. Excluded from exports.', 'array', 'internal', [], { exportPolicy: 'exclude' }),
];

const extractedOk = { name: 'A. Sample', date: '2026-09-01', amount: 240, reference: 'INV-1001' };
const intakeScenarios: TestScenario[] = [
  { id: 'clean_document', name: 'Clean document', description: 'Extraction succeeds, validation passes, nothing sensitive. The record is filed with no human in the loop.', input: { documentText: 'Invoice INV-1001, A. Sample, 2026-09-01, 240.00 (synthetic)' }, expectedRouterOutcomes: ['Valid', 'Not sensitive: file it'],
    mockedOutcomes: { extract_fields: { patches: [{ extracted: extractedOk, extractionConfidence: 0.94 }] }, validate_fields: { patches: [{ validationStatus: 'valid', validationIssues: [] }] }, classify_sensitivity: { patches: [{ sensitivityLevel: 'low' }] }, file_record: { patches: [{ recordId: 'mock-rec-0001' }] } } },
  { id: 'needs_correction', name: 'Needs a correction', description: 'The amount is missing. The validity decision asks the submitter to correct it; one bounded round later the record passes and is filed.', input: { documentText: 'Invoice INV-1002, A. Sample, 2026-09-03, amount smudged (synthetic)' }, expectedRouterOutcomes: ['Needs correction', 'Valid', 'Not sensitive: file it'],
    mockedOutcomes: { extract_fields: { patches: [{ extracted: { name: 'A. Sample', date: '2026-09-03', reference: 'INV-1002' }, extractionConfidence: 0.71 }] }, validate_fields: { patches: [{ validationStatus: 'invalid', validationIssues: ['amount is missing'] }, { validationStatus: 'valid', validationIssues: [] }] }, request_correction: { patches: [{ extracted: { name: 'A. Sample', date: '2026-09-03', amount: 180, reference: 'INV-1002' }, reviewerDecision: 'approved', iterationCount: 1 }] }, classify_sensitivity: { patches: [{ sensitivityLevel: 'low' }] }, file_record: { patches: [{ recordId: 'mock-rec-0002' }] } } },
  { id: 'sensitive_document', name: 'Sensitive document', description: 'The record holds a date of birth and an id number. The sensitivity decision sends it to a privacy reviewer, who asks for redaction before filing.', input: { documentText: 'Application, B. Sample, DOB 1990-01-01, ID 000-00-0000 (synthetic)' }, expectedRouterOutcomes: ['Valid', 'Sensitive: privacy review', 'Redact first'],
    mockedOutcomes: { extract_fields: { patches: [{ extracted: { name: 'B. Sample', dob: '1990-01-01', idNumber: '000-00-0000', reference: 'APP-2001' }, extractionConfidence: 0.9 }] }, validate_fields: { patches: [{ validationStatus: 'valid', validationIssues: [] }] }, classify_sensitivity: { patches: [{ sensitivityLevel: 'high' }] }, privacy_review: { patches: [{ reviewerDecision: 'revise', reviewerNotes: 'Mask idNumber; keep DOB year only.' }] }, redact_fields: { patches: [{ extracted: { name: 'B. Sample', dob: '1990', idNumber: '***-**-0000', reference: 'APP-2001' }, redactionApplied: true }] }, file_record: { patches: [{ recordId: 'mock-rec-0003' }] } } },
  { id: 'extractor_failure', name: 'Extractor failure', description: 'The mock extractor fails. The failure path goes to manual entry, which records the error and supplies the fields by hand.', input: { documentText: 'Scanned page, low quality (synthetic)' }, expectedRouterOutcomes: ['Valid', 'Not sensitive: file it'],
    mockedOutcomes: { extract_fields: { patches: [{ extracted: extractedOk }], failOnVisit: 1, failMessage: 'Mock extractor could not read the scan' }, manual_entry: { patches: [{ extracted: { ...extractedOk, reference: 'INV-1004' }, errors: [{ node: 'extract_fields', type: 'unreadable', message: 'Mock extractor could not read the scan' }] }] }, validate_fields: { patches: [{ validationStatus: 'valid', validationIssues: [] }] }, classify_sensitivity: { patches: [{ sensitivityLevel: 'low' }] }, file_record: { patches: [{ recordId: 'mock-rec-0004' }] } } },
  { id: 'sensitivity_unknown', name: 'Sensitivity unknown', description: 'The sensitivity classifier returns nothing. Rather than file the record, the decision abstains to the privacy reviewer, who approves filing as is.', input: { documentText: 'Note, C. Sample, no structured fields (synthetic)' }, expectedRouterOutcomes: ['Valid', 'Insufficient evidence', 'File as is'],
    mockedOutcomes: { extract_fields: { patches: [{ extracted: { name: 'C. Sample', reference: 'NOTE-3001' }, extractionConfidence: 0.6 }] }, validate_fields: { patches: [{ validationStatus: 'valid', validationIssues: [] }] }, classify_sensitivity: { patches: [{ sensitivityLevel: null }] }, privacy_review: { patches: [{ reviewerDecision: 'approved', reviewerNotes: 'Plain note, nothing personal beyond a name.' }] }, file_record: { patches: [{ recordId: 'mock-rec-0005' }] } } },
];

export const documentIntakeProject: GraphProject = {
  id: 'document_intake', name: 'Document Intake', status: 'demo',
  description: 'Extract fields from a submitted document, validate them, ask the submitter to correct what is wrong, route sensitive records through a privacy reviewer, and file the result.',
  graph: place({ specVersion: '1.0', nodes: intakeNodes, edges: intakeEdges, routers: intakeRouters, entryNodeId: 'receive_document', endNodeIds: ['filed'] }, {
    receive_document: [X, 0], extract_fields: [X, 120], manual_entry: [X + 340, 250], validate_fields: [X, 270], r_valid: [X, 410], request_correction: [X - 340, 410],
    classify_sensitivity: [X, 580], r_sensitive: [X, 710], privacy_review: [X + 340, 880], r_privacy_ok: [X + 340, 1020], redact_fields: [X + 680, 1020],
    file_record: [X, 1160], filed: [X, 1290],
  }),
  stateSchema: { version: '1', fields: intakeFields },
  scenarios: intakeScenarios,
};
