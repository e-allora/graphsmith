import type { GraphProject, GraphNode, Router, GraphEdge, StateField, NodeCategory, RuleOperator, EdgeType, Classification, ExportPolicy, FieldType } from '../domain/types';
import { readersOf, writersOf, routersReading, elementName } from '../domain/graph';
import { describeOperator } from '../domain/simulate';
import { CATEGORY_LABEL, CATEGORY_HELP, EDGE_LABEL, CLASS_HELP } from './labels';
import type { Selection } from './store';

type Props = {
  project: GraphProject;
  selection: Selection;
  readOnly: boolean;
  onNode: (id: string, patch: Partial<GraphNode>) => void;
  onRouter: (id: string, patch: Partial<Router>) => void;
  onEdge: (id: string, patch: Partial<GraphEdge>) => void;
  onField: (id: string, patch: Partial<StateField>) => void;
  onSelect: (s: Selection) => void;
  onDelete: () => void;
  onSetEntry: (id: string) => void;
  onToggleEnd: (id: string) => void;
};

const CATS: NodeCategory[] = ['input', 'transform', 'retrieve', 'validate', 'human_review', 'action', 'recovery', 'output'];
const OPS: RuleOperator[] = ['equals', 'not_equals', 'greater_than', 'greater_or_equal', 'less_than', 'includes'];
const EDGE_TYPES: EdgeType[] = ['default', 'success', 'failure', 'retry', 'review_resume', 'parallel', 'join'];
const CLASSES: Classification[] = ['public', 'internal', 'confidential', 'personal', 'restricted'];
const POLICIES: ExportPolicy[] = ['include', 'redact', 'exclude'];
const TYPES: FieldType[] = ['string', 'number', 'boolean', 'array', 'object', 'enum'];

function parseValue(raw: string): string | number | boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const n = Number(raw);
  if (raw.trim() !== '' && !Number.isNaN(n)) return n;
  return raw;
}

function FieldChips({ ids, project, onSelect }: { ids: string[]; project: GraphProject; onSelect: (s: Selection) => void }) {
  if (!ids.length) return <span className="hint">none</span>;
  return <span className="chips">{ids.map((id) => <button key={id} className="chip" onClick={() => onSelect({ kind: 'field', id })} title={project.stateSchema.fields.find((f) => f.id === id)?.description ?? 'Not declared in State'}>{id}</button>)}</span>;
}

function ListEditor({ label, value, readOnly, onChange, options }: { label: string; value: string[]; readOnly: boolean; onChange: (v: string[]) => void; options: string[] }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input disabled={readOnly} value={value.join(', ')} list={`dl-${label}`} onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} placeholder="comma-separated State fields" />
      <datalist id={`dl-${label}`}>{options.map((o) => <option key={o} value={o} />)}</datalist>
    </div>
  );
}

export function Inspector(p: Props) {
  const g = p.project.graph;
  const fieldIds = p.project.stateSchema.fields.map((f) => f.id);
  const ro = p.readOnly;
  const targets = [...g.nodes.map((n) => ({ id: n.id, name: n.name })), ...g.routers.map((r) => ({ id: r.id, name: r.question }))];

  if (!p.selection) {
    return (
      <div className="panel-body">
        <p className="hint">Select a step, decision, connection, or State field to inspect it.</p>
        <div className="note" style={{ marginTop: 12 }}>
          <b>Reading the graph.</b> Steps are boxes. Decisions are amber and show their rule and safe default. Dotted red connections are failure paths. Dashed amber ones are bounded retry loops.
        </div>
        <dl className="kv" style={{ marginTop: 12 }}>
          <dt>Steps</dt><dd>{g.nodes.length}</dd>
          <dt>Decisions</dt><dd>{g.routers.length}</dd>
          <dt>Connections</dt><dd>{g.edges.length}</dd>
          <dt>State fields</dt><dd>{p.project.stateSchema.fields.length}</dd>
          <dt>Scenarios</dt><dd>{p.project.scenarios.length}</dd>
        </dl>
      </div>
    );
  }

  if (p.selection.kind === 'node') {
    const n = g.nodes.find((x) => x.id === p.selection!.id);
    if (!n) return null;
    const isEntry = g.entryNodeId === n.id;
    const isEnd = g.endNodeIds.includes(n.id);
    return (
      <div className="panel-body">
        <div className="toolbar">
          <span className="badge accent">{CATEGORY_LABEL[n.category]}</span>
          {isEntry && <span className="badge ok">Entry</span>}
          {isEnd && <span className="badge">End</span>}
          {n.category === 'action' && <span className="badge warn">{n.impact} impact · {n.sideEffect}</span>}
        </div>
        <p className="hint" style={{ marginBottom: 10 }}>{CATEGORY_HELP[n.category]}</p>
        <div className="field"><label htmlFor="n-name">Name</label><input id="n-name" disabled={ro} value={n.name} onChange={(e) => p.onNode(n.id, { name: e.target.value })} /></div>
        <div className="field"><label htmlFor="n-desc">What it does</label><textarea id="n-desc" disabled={ro} value={n.description} onChange={(e) => p.onNode(n.id, { description: e.target.value })} /></div>
        <div className="field"><label htmlFor="n-cat">Category</label>
          <select id="n-cat" disabled={ro} value={n.category} onChange={(e) => p.onNode(n.id, { category: e.target.value as NodeCategory })}>{CATS.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select>
        </div>
        <ListEditor label="Reads" value={n.reads} readOnly={ro} options={fieldIds} onChange={(reads) => p.onNode(n.id, { reads })} />
        <ListEditor label="Writes" value={n.writes} readOnly={ro} options={fieldIds} onChange={(writes) => p.onNode(n.id, { writes })} />
        <div className="two">
          <div className="field"><label htmlFor="n-se">Side effect</label>
            <select id="n-se" disabled={ro} value={n.sideEffect} onChange={(e) => p.onNode(n.id, { sideEffect: e.target.value as GraphNode['sideEffect'] })}>
              <option value="none">none</option><option value="mocked">mocked</option><option value="external">external (not allowed in demo)</option>
            </select>
          </div>
          <div className="field"><label htmlFor="n-imp">Impact</label>
            <select id="n-imp" disabled={ro} value={n.impact} onChange={(e) => p.onNode(n.id, { impact: e.target.value as GraphNode['impact'] })}><option>low</option><option>moderate</option><option>high</option></select>
          </div>
        </div>
        <div className="field"><label htmlFor="n-fm">If this step fails</label>
          <select id="n-fm" disabled={ro} value={n.failureMode ?? 'stop'} onChange={(e) => p.onNode(n.id, { failureMode: e.target.value as GraphNode['failureMode'] })}>
            <option value="stop">stop the run</option><option value="route_to_recovery">follow the failure path</option><option value="retry">retry once</option>
          </select>
        </div>
        {n.sideEffect === 'external' && <div className="note warn">Demo mode does not allow real external actions. This will show as a gap in Readiness.</div>}
        <div className="panel-h" style={{ padding: '10px 0 4px' }}>Safety notes</div>
        <ul className="hint" style={{ margin: 0, paddingLeft: 16 }}>
          {n.category === 'action' && <li>Mocked in this demo: nothing is sent, changed, or charged.</li>}
          {n.category === 'retrieve' && <li>Returns synthetic sample data. No live source is contacted.</li>}
          {n.category === 'human_review' && <li>The workflow pauses here until a person decides.</li>}
          {n.writes.some((w) => ['confidential', 'personal', 'restricted'].includes(p.project.stateSchema.fields.find((f) => f.id === w)?.classification ?? '')) && <li>Writes a sensitive State field. It is redacted in public export.</li>}
          <li>Reads {n.reads.length} and writes {n.writes.length} State field{n.writes.length === 1 ? '' : 's'}.</li>
        </ul>
        {!ro && (
          <div className="toolbar" style={{ marginTop: 12 }}>
            {!isEntry && <button className="btn sm" onClick={() => p.onSetEntry(n.id)}>Make entry</button>}
            <button className="btn sm" onClick={() => p.onToggleEnd(n.id)}>{isEnd ? 'Unmark end' : 'Mark as end'}</button>
            <button className="btn sm danger" onClick={p.onDelete}>Delete step</button>
          </div>
        )}
      </div>
    );
  }

  if (p.selection.kind === 'router') {
    const r = g.routers.find((x) => x.id === p.selection!.id);
    if (!r) return null;
    const setRule = (i: number, patch: Partial<Router['rules'][number]>) => p.onRouter(r.id, { rules: r.rules.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
    return (
      <div className="panel-body">
        <div className="toolbar"><span className="badge router">Decision</span>{r.maxIterations !== undefined && <span className="badge">max {r.maxIterations} loops</span>}</div>
        <div className="field"><label htmlFor="r-q">Question</label><input id="r-q" disabled={ro} value={r.question} onChange={(e) => p.onRouter(r.id, { question: e.target.value })} /></div>
        <div className="rule" style={{ marginBottom: 12 }}>
          {r.rules.map((rule) => <div key={rule.id}>IF <b>{rule.field}</b> {describeOperator(rule.operator)} <b>{JSON.stringify(rule.value)}</b>{'\n'}THEN go to <b>{elementName(g, rule.targetNodeId) || '?'}</b>{'\n\n'}</div>)}
          OTHERWISE{'\n'}GO TO <b>{elementName(g, r.defaultTargetNodeId) || 'missing default'}</b>{'\n\n'}Safe default: {elementName(g, r.defaultTargetNodeId) || 'not set'}
        </div>
        {r.rules.map((rule, i) => (
          <div key={rule.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
            <div className="two">
              <div className="field"><label>Field</label><select disabled={ro} value={rule.field} onChange={(e) => setRule(i, { field: e.target.value })}>{[rule.field, ...fieldIds.filter((f) => f !== rule.field)].map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
              <div className="field"><label>Comparison</label><select disabled={ro} value={rule.operator} onChange={(e) => setRule(i, { operator: e.target.value as RuleOperator })}>{OPS.map((o) => <option key={o} value={o}>{describeOperator(o)}</option>)}</select></div>
            </div>
            <div className="two">
              <div className="field"><label>Value</label><input disabled={ro} value={String(rule.value)} onChange={(e) => setRule(i, { value: parseValue(e.target.value) })} /></div>
              <div className="field"><label>Then go to</label><select disabled={ro} value={rule.targetNodeId} onChange={(e) => setRule(i, { targetNodeId: e.target.value })}><option value="">choose…</option>{targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            </div>
            <div className="field"><label>Path label</label><input disabled={ro} value={rule.label} onChange={(e) => setRule(i, { label: e.target.value })} /></div>
          </div>
        ))}
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          <div className="two">
            <div className="field"><label>Otherwise go to (safe default)</label><select disabled={ro} value={r.defaultTargetNodeId} onChange={(e) => p.onRouter(r.id, { defaultTargetNodeId: e.target.value })}><option value="">choose…</option>{targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            <div className="field"><label>Default label</label><input disabled={ro} value={r.defaultLabel} onChange={(e) => p.onRouter(r.id, { defaultLabel: e.target.value })} /></div>
          </div>
          <div className="field"><label>Maximum loops through this decision</label><input type="number" min={0} max={10} disabled={ro} value={r.maxIterations ?? ''} onChange={(e) => p.onRouter(r.id, { maxIterations: e.target.value === '' ? undefined : Number(e.target.value) })} /></div>
        </div>
        <div className="note">A decision is only valid with a visible default path. The target of a rule also needs a connection on the canvas; drag from the decision's bottom dot to create one.</div>
        {!ro && <div className="toolbar"><button className="btn sm danger" onClick={p.onDelete}>Delete decision</button></div>}
      </div>
    );
  }

  if (p.selection.kind === 'edge') {
    const e = g.edges.find((x) => x.id === p.selection!.id);
    if (!e) return null;
    const fromRouter = g.routers.find((r) => r.id === e.sourceNodeId);
    return (
      <div className="panel-body">
        <div className="toolbar"><span className="badge">{EDGE_LABEL[e.type]}</span></div>
        <dl className="kv">
          <dt>From</dt><dd><button className="chip" onClick={() => p.onSelect({ kind: fromRouter ? 'router' : 'node', id: e.sourceNodeId })}>{elementName(g, e.sourceNodeId)}</button></dd>
          <dt>To</dt><dd><button className="chip" onClick={() => p.onSelect({ kind: g.routers.some((r) => r.id === e.targetNodeId) ? 'router' : 'node', id: e.targetNodeId })}>{elementName(g, e.targetNodeId)}</button></dd>
        </dl>
        <div className="field" style={{ marginTop: 10 }}><label>Label</label><input disabled={ro} value={e.label ?? ''} onChange={(ev) => p.onEdge(e.id, { label: ev.target.value })} /></div>
        <div className="field"><label>Type</label><select disabled={ro} value={e.type} onChange={(ev) => p.onEdge(e.id, { type: ev.target.value as EdgeType })}>{EDGE_TYPES.map((t) => <option key={t} value={t}>{EDGE_LABEL[t]}</option>)}</select></div>
        {fromRouter && (
          <div className="field"><label>Taken when</label>
            <select disabled={ro} value={e.routerRuleId ?? ''} onChange={(ev) => p.onEdge(e.id, { routerRuleId: ev.target.value || undefined })}>
              <option value="">the safe default applies</option>
              {fromRouter.rules.map((rule) => <option key={rule.id} value={rule.id}>rule: {rule.label}</option>)}
            </select>
          </div>
        )}
        {e.type === 'retry' && <div className="note warn">Retry paths must be bounded. The decision that starts the loop needs a maximum iteration count.</div>}
        {e.type === 'failure' && <div className="note">Failure paths are followed only when the source step reports an error.</div>}
        {!ro && <div className="toolbar"><button className="btn sm danger" onClick={p.onDelete}>Delete connection</button></div>}
      </div>
    );
  }

  const selId = p.selection.id;
  const f = p.project.stateSchema.fields.find((x) => x.id === selId);
  if (!f) return <div className="panel-body"><p className="hint">"{selId}" is not declared in the State schema. Add it in the State tab.</p></div>;
  const readers = readersOf(g, f.id).map((n) => n.id);
  const writers = writersOf(g, f.id).map((n) => n.id);
  const rr = routersReading(g, f.id);
  return (
    <div className="panel-body">
      <div className="toolbar"><span className="badge accent">State field</span><span className={`badge ${['confidential', 'personal', 'restricted'].includes(f.classification) ? 'warn' : ''}`}>{f.classification}</span><span className="badge">{f.type}</span></div>
      <div className="field"><label>Name</label><input disabled={ro} value={f.name} onChange={(e) => p.onField(f.id, { name: e.target.value })} /></div>
      <div className="field"><label>Meaning</label><textarea disabled={ro} value={f.description} onChange={(e) => p.onField(f.id, { description: e.target.value })} /></div>
      <div className="two">
        <div className="field"><label>Type</label><select disabled={ro} value={f.type} onChange={(e) => p.onField(f.id, { type: e.target.value as FieldType })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="field"><label>Classification</label><select disabled={ro} value={f.classification} onChange={(e) => p.onField(f.id, { classification: e.target.value as Classification })}>{CLASSES.map((c) => <option key={c}>{c}</option>)}</select></div>
      </div>
      <p className="hint" style={{ marginBottom: 10 }}>{CLASS_HELP[f.classification]}</p>
      <div className="field"><label>In public export</label><select disabled={ro} value={f.exportPolicy} onChange={(e) => p.onField(f.id, { exportPolicy: e.target.value as ExportPolicy })}>{POLICIES.map((x) => <option key={x}>{x}</option>)}</select></div>
      <div className="field"><label>Example value (mock)</label><input disabled={ro} value={typeof f.defaultValue === 'string' ? f.defaultValue : JSON.stringify(f.defaultValue ?? '')} onChange={(e) => p.onField(f.id, { defaultValue: f.type === 'string' ? e.target.value : safeJson(e.target.value) })} /></div>
      {f.mergeStrategy && <div className="field"><label>Merge approach for parallel writes</label><input disabled={ro} value={f.mergeStrategy} onChange={(e) => p.onField(f.id, { mergeStrategy: e.target.value })} /></div>}
      <dl className="kv" style={{ marginTop: 6 }}>
        <dt>Read by</dt><dd>{readers.length || rr.length ? <span className="chips">{readers.map((id) => <button key={id} className="chip" onClick={() => p.onSelect({ kind: 'node', id })}>{elementName(g, id)}</button>)}{rr.map((r) => <button key={r.id} className="chip" onClick={() => p.onSelect({ kind: 'router', id: r.id })}>◇ {r.question}</button>)}</span> : <span className="hint">nobody</span>}</dd>
        <dt>Written by</dt><dd><FieldChips ids={writers} project={p.project} onSelect={(s) => s && p.onSelect({ kind: 'node', id: s.id })} /></dd>
        <dt>Input?</dt><dd>{f.isInput ? 'Yes, supplied when the run starts' : 'No'}</dd>
      </dl>
      {!ro && <div className="toolbar" style={{ marginTop: 12 }}><button className="btn sm danger" onClick={p.onDelete}>Delete field</button></div>}
    </div>
  );
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}
