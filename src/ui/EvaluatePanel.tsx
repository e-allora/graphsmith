import type { GraphProject, TraceStep, ReviewerAction } from '../domain/types';
import { elementName, outgoing } from '../domain/graph';
import type { SimState } from './store';
import type { SimulationOverrides } from '../domain/simulate';

type Props = {
  project: GraphProject;
  sim: SimState | null;
  onRun: (scenarioId: string, overrides: SimulationOverrides) => void;
  onStep: (i: number) => void;
  onPlay: (playing: boolean) => void;
  onSelectElement: (id: string) => void;
};

const DISCLAIMER = 'This is a mock evaluation using the rules and sample data in this project. A passing result does not guarantee behavior with real users, data, integrations, or deployment conditions.';

function patchLines(step: TraceStep): string[] {
  return Object.entries(step.patch).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`.slice(0, 120));
}

export function EvaluatePanel(p: Props) {
  const sim = p.sim;
  const scenario = p.project.scenarios.find((s) => s.id === (sim?.scenarioId ?? p.project.scenarios[0]?.id));
  const step = sim ? sim.result.steps[sim.stepIndex] : undefined;
  const last = sim ? sim.stepIndex >= sim.result.steps.length - 1 : true;
  const hasReview = p.project.graph.nodes.some((n) => n.category === 'human_review');

  return (
    <div className="three">
      <section aria-label="Run">
        <div className="panel-h" style={{ padding: '0 0 6px' }}>Evaluation run</div>
        <div className="field">
          <label htmlFor="scen">Input scenario</label>
          <select id="scen" value={scenario?.id ?? ''} onChange={(e) => p.onRun(e.target.value, sim?.overrides ?? {})}>
            {p.project.scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {scenario && <span className="hint">{scenario.description}</span>}
        </div>
        {hasReview && (
          <div className="field">
            <label htmlFor="rev">Reviewer decision at the checkpoint</label>
            <select id="rev" value={sim?.overrides.reviewerDecision ?? ''} onChange={(e) => scenario && p.onRun(scenario.id, { reviewerDecision: (e.target.value || undefined) as SimulationOverrides['reviewerDecision'] })}>
              <option value="">as scripted in the scenario</option>
              <option value="approved">Approve</option>
              <option value="revise">Request revision</option>
              <option value="request_evidence">Request more evidence</option>
              <option value="stop">Stop the workflow</option>
            </select>
          </div>
        )}
        <div className="toolbar">
          <button className="btn accent" onClick={() => scenario && p.onRun(scenario.id, sim?.overrides ?? {})}>▶ Run safe simulation</button>
          {sim && <>
            <button className="btn sm" onClick={() => p.onStep(Math.max(0, sim.stepIndex - 1))} disabled={sim.stepIndex === 0} aria-label="Previous step">◀</button>
            <button className="btn sm" onClick={() => p.onPlay(!sim.playing)} disabled={last && !sim.playing}>{sim.playing ? 'Pause' : 'Play'}</button>
            <button className="btn sm" onClick={() => p.onStep(Math.min(sim.result.steps.length - 1, sim.stepIndex + 1))} disabled={last} aria-label="Next step">▶</button>
          </>}
        </div>
        {sim && (
          <div className={`note ${sim.result.reachedEnd ? 'ok' : 'warn'}`}>
            {sim.result.reachedEnd ? `Reached the end outcome in ${sim.result.steps.length} steps.` : `Stopped after ${sim.result.steps.length} steps: ${sim.result.stoppedReason}`}
            {' '}Decisions: {sim.result.routerOutcomes.join(' → ') || 'none'}.
          </div>
        )}
        <div className="note">{DISCLAIMER}</div>
      </section>

      <section aria-label="Current step">
        <div className="panel-h" style={{ padding: '0 0 6px' }}>Current step {sim ? `${sim.stepIndex + 1} of ${sim.result.steps.length}` : ''}</div>
        {!step && <p className="hint">Run a simulation to walk through the graph one step at a time. Each step shows which State fields changed and why the path was chosen.</p>}
        {step && (
          <div>
            <div className="toolbar">
              <span className={`badge ${step.kind === 'router' ? 'router' : step.kind === 'failure' ? 'gap' : step.kind === 'checkpoint' ? 'review' : step.kind === 'end' ? 'ok' : 'accent'}`}>{{ node: 'Step', router: 'Decision', checkpoint: 'Human checkpoint', failure: 'Mock failure', end: 'End outcome' }[step.kind]}</span>
              <button className="chip" onClick={() => p.onSelectElement(step.elementId)}>{step.elementName}</button>
              <span className="hint mono">t+{(step.timestamp / 1000).toFixed(2)}s</span>
            </div>
            {step.routerDetail ? (
              <div>
                <div className="rule">
                  <b>What happened</b>{'\n'}Path taken: <b>{step.routerDetail.selectedLabel}</b>{step.routerDetail.usedDefault ? ' (safe default)' : step.routerDetail.insufficient ? ' (abstained)' : ''}{'\n\n'}
                  <b>Why</b>{'\n'}
                  {step.routerDetail.evaluated.map((ev) => `${ev.field} = ${ev.actual === undefined || ev.actual === null ? 'no value' : JSON.stringify(ev.actual)}\nRule: ${ev.field} ${ev.operator.replace(/_/g, ' ')} ${JSON.stringify(ev.expected)}\nMatched: ${ev.actual === undefined || ev.actual === null ? 'cannot evaluate' : ev.matched ? 'yes' : 'no'}\n`).join('\n')}
                  {'\n'}<b>What could change the outcome</b>{'\n'}{step.routerDetail.counterfactuals.map((c) => `• ${c}`).join('\n')}
                </div>
              </div>
            ) : (
              <p style={{ margin: '6px 0' }}>{step.explanation}</p>
            )}
            {step.kind === 'checkpoint' && <DecisionPacket project={p.project} step={step} onDecide={(d) => scenario && p.onRun(scenario.id, { reviewerDecision: d })} />}
            <div className="panel-h" style={{ padding: '10px 0 4px' }}>State changes</div>
            {patchLines(step).length ? <ul className="mono" style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>{patchLines(step).map((l) => <li key={l}>+ {l}</li>)}</ul> : <span className="hint">none</span>}
          </div>
        )}
      </section>

      <section aria-label="Trace">
        <div className="panel-h" style={{ padding: '0 0 6px' }}>Trace</div>
        {!sim && <p className="hint">The full run appears here. Click any step to replay it.</p>}
        {sim && (
          <div className="trace" role="list">
            {sim.result.steps.map((s) => (
              <div key={s.index} role="listitem" className="trace-step" aria-current={s.index === sim.stepIndex} onClick={() => p.onStep(s.index)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') p.onStep(s.index); }}>
                <span className="n">{s.index + 1}</span>
                <span>
                  <span className="t">{s.kind === 'router' ? '◇ ' : s.kind === 'failure' ? '⚠ ' : s.kind === 'checkpoint' ? '👤 ' : ''}{s.elementName}</span>
                  <br /><span className="x">{s.routerDetail ? `→ ${s.routerDetail.selectedLabel}` : Object.keys(s.patch).length ? `wrote ${Object.keys(s.patch).join(', ')}` : s.kind === 'end' ? 'end outcome' : 'no State change'}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}


const ACTION_LABEL: Record<ReviewerAction, string> = { approve: 'Approve', revise: 'Request revision', request_evidence: 'Request more evidence', stop: 'Stop the workflow' };
const ACTION_OVERRIDE: Record<ReviewerAction, SimulationOverrides['reviewerDecision']> = { approve: 'approved', revise: 'revise', request_evidence: 'request_evidence', stop: 'stop' };
const AUTHORITY_TEXT = { inform: 'is informed; the workflow continues either way', audit_after: 'reviews after the fact; the workflow continues', approve_before: 'must approve before the next action runs', choose: 'chooses which path the workflow takes', block: 'can block the workflow and escalate' };

function fmtValue(v: unknown): string {
  if (v === undefined || v === null || v === '') return 'no value';
  if (typeof v === 'string') return v.length > 90 ? v.slice(0, 90) + '…' : v;
  if (Array.isArray(v) && v.length === 0) return 'none';
  const s = JSON.stringify(v);
  return s.length > 90 ? s.slice(0, 90) + '…' : s;
}

/** The reviewer sees evidence and a rationale, not a yes/no prompt. */
function DecisionPacket({ project, step, onDecide }: { project: GraphProject; step: TraceStep; onDecide: (d: NonNullable<SimulationOverrides['reviewerDecision']>) => void }) {
  const g = project.graph;
  const node = g.nodes.find((n) => n.id === step.elementId);
  const o = node?.oversight;
  const sees = o?.sees ?? node?.reads ?? [];
  const actions = o?.actions ?? (['approve', 'revise'] as ReviewerAction[]);
  const next = outgoing(g, step.elementId)[0];
  const nextRouter = next ? g.routers.find((r) => r.id === next.targetNodeId) : undefined;
  const proposed = nextRouter ? nextRouter.rules[0] && elementName(g, nextRouter.rules[0].targetNodeId) : next ? elementName(g, next.targetNodeId) : undefined;
  const st = step.stateAfter;
  const gaps = Array.isArray(st.coverageGaps) ? (st.coverageGaps as string[]) : [];
  const errors = Array.isArray(st.errors) ? (st.errors as { message: string }[]) : [];
  const uncertainty = [...gaps, ...errors.map((e) => `Recorded error: ${e.message}`), ...(st.coverageScore === null || st.coverageScore === undefined ? ['No coverage score is available; the decision before this step abstained.'] : [])];
  return (
    <div className="packet" aria-label="Reviewer decision packet">
      <h4>Reviewer decision packet</h4>
      <dl>
        <dt>Proposed action</dt><dd>{proposed ? `Continue to ${proposed}` : 'Continue'}</dd>
        <dt>Why a person</dt><dd>{o ? `${o.who ?? 'The reviewer'} ${AUTHORITY_TEXT[o.authority]}.` : 'This checkpoint has no declared authority; see Readiness.'} {node?.description}</dd>
        <dt>Evidence</dt><dd>{sees.length ? <ul style={{ margin: 0, paddingLeft: 16 }}>{sees.map((f) => <li key={f}><code>{f}</code>: {fmtValue(st[f])}</li>)}</ul> : 'none declared'}</dd>
        <dt>Uncertainty</dt><dd>{uncertainty.length ? <ul style={{ margin: 0, paddingLeft: 16 }}>{uncertainty.map((u) => <li key={u}>{u}</li>)}</ul> : 'No open gaps or errors recorded.'}</dd>
        <dt>Decision in this run</dt><dd><b>{String(st.reviewerDecision)}</b>{st.reviewerNotes ? ` — "${String(st.reviewerNotes)}"` : ''}</dd>
      </dl>
      <div className="acts">
        {actions.map((a) => <button key={a} className={`btn sm ${a === 'approve' ? 'accent' : a === 'stop' ? 'danger' : ''}`} onClick={() => onDecide(ACTION_OVERRIDE[a]!)}>{ACTION_LABEL[a]}</button>)}
      </div>
      <span className="hint">Choosing an action re-runs this scenario with that decision at the first visit to the checkpoint.</span>
    </div>
  );
}
