// Graph specification v1. This module is the product core; every view reads it.

export type NodeCategory =
  | 'input'
  | 'transform'
  | 'retrieve'
  | 'validate'
  | 'human_review'
  | 'action'
  | 'recovery'
  | 'output';

export type SideEffect = 'none' | 'mocked' | 'external';
export type Impact = 'low' | 'moderate' | 'high';
export type FailureMode = 'route_to_recovery' | 'stop' | 'retry';

export type GraphNode = {
  id: string;
  name: string;
  category: NodeCategory;
  description: string;
  reads: string[];
  writes: string[];
  sideEffect: SideEffect;
  impact: Impact;
  failureMode?: FailureMode;
  oversight?: Oversight;
  position: { x: number; y: number };
};

export type OversightAuthority = 'inform' | 'audit_after' | 'approve_before' | 'choose' | 'block';
export type ReviewerAction = 'approve' | 'revise' | 'request_evidence' | 'stop';

/** Configuration of a human review checkpoint: what authority the person has, what they see, what they can do. */
export type Oversight = {
  authority: OversightAuthority;
  sees: string[];
  actions: ReviewerAction[];
  who?: string;
};

export type EdgeType = 'default' | 'success' | 'failure' | 'retry' | 'review_resume' | 'parallel' | 'join';

export type GraphEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: EdgeType;
  label?: string;
  routerRuleId?: string;
};

export type RuleOperator = 'equals' | 'not_equals' | 'greater_than' | 'greater_or_equal' | 'less_than' | 'includes';

export type RouterRule = {
  id: string;
  field: string;
  operator: RuleOperator;
  value: string | number | boolean;
  targetNodeId: string;
  label: string;
};

export type Router = {
  id: string;
  name: string;
  question: string;
  rules: RouterRule[];
  defaultTargetNodeId: string;
  defaultLabel: string;
  /** Where to go when a rule's field has no value. The abstention route. */
  insufficientEvidenceTargetNodeId?: string;
  maxIterations?: number;
  position: { x: number; y: number };
};

export type Classification = 'public' | 'internal' | 'confidential' | 'personal' | 'restricted';
export type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'enum';
export type ExportPolicy = 'include' | 'redact' | 'exclude';

export type StateField = {
  id: string;
  name: string;
  description: string;
  type: FieldType;
  classification: Classification;
  defaultValue?: unknown;
  exportPolicy: ExportPolicy;
  isInput?: boolean;
  mergeStrategy?: string;
};

export type StateSchema = { version: string; fields: StateField[] };

export type GraphDefinition = {
  specVersion: '1.0';
  nodes: GraphNode[];
  edges: GraphEdge[];
  routers: Router[];
  entryNodeId: string;
  endNodeIds: string[];
};

export type StatePatch = Record<string, unknown>;

/** A scenario supplies mocked outcomes per node. Each visit to a node consumes the next patch. */
export type MockedOutcome = {
  patches: StatePatch[];
  /** When set on a visit, the node fails on that visit (1-based index). */
  failOnVisit?: number;
  failMessage?: string;
};

export type TestScenario = {
  id: string;
  name: string;
  description: string;
  input: StatePatch;
  mockedOutcomes: Record<string, MockedOutcome>;
  expectedRouterOutcomes?: string[];
};

export type GraphProject = {
  id: string;
  name: string;
  description: string;
  status: 'demo' | 'draft' | 'prototype';
  graph: GraphDefinition;
  stateSchema: StateSchema;
  scenarios: TestScenario[];
};

export type ValueOrigin = 'mocked' | 'generated' | 'user' | 'default';

export type TraceStep = {
  index: number;
  kind: 'node' | 'router' | 'checkpoint' | 'failure' | 'end';
  elementId: string;
  elementName: string;
  timestamp: number;
  patch: StatePatch;
  stateAfter: StatePatch;
  selectedEdgeId?: string;
  nextElementId?: string;
  explanation: string;
  routerDetail?: {
    evaluated: { ruleId: string; field: string; actual: unknown; operator: RuleOperator; expected: unknown; matched: boolean; label: string }[];
    selectedLabel: string;
    usedDefault: boolean;
    insufficient: boolean;
    counterfactuals: string[];
  };
  origins: Record<string, ValueOrigin>;
};

export type SimulationResult = {
  scenarioId: string;
  steps: TraceStep[];
  finalState: StatePatch;
  reachedEnd: boolean;
  visitedNodeIds: string[];
  traversedEdgeIds: string[];
  routerOutcomes: string[];
  stoppedReason?: string;
};

export type CoverageCount = { label: string; done: number; total: number };

export type Finding = {
  id: string;
  group: 'topology' | 'state' | 'safety' | 'evaluation';
  level: 'pass' | 'warn' | 'gap';
  message: string;
  elementId?: string;
};
