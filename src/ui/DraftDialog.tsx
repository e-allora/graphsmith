import { useMemo, useState } from 'react';
import { draftFromDescription, type GeneratedDraft, type DraftOptions } from '../domain/draft';
import { lint } from '../domain/lint';
import { simulate } from '../domain/simulate';

type Props = { onClose: () => void; onAccept: (d: GeneratedDraft) => void };

const EXAMPLE = 'Plan research, investigate independent questions in parallel, combine evidence, check coverage and repeat research once if evidence is incomplete, ask a reviewer to approve the final brief, then publish it.';

export function DraftDialog({ onClose, onAccept }: Props) {
  const [text, setText] = useState('');
  const [opts, setOpts] = useState<DraftOptions>({});
  const [submitted, setSubmitted] = useState<string | null>(null);
  const result = useMemo(() => (submitted === null ? null : draftFromDescription(submitted, opts)), [submitted, opts]);
  const readiness = useMemo(() => {
    if (!result || !result.ok) return null;
    const pr = result.draft.project;
    return lint(pr, pr.scenarios.map((sc) => simulate(pr, sc)));
  }, [result]);
  const run = () => { setOpts({}); setSubmitted(text); };
  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-labelledby="draft-title" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="draft-title">Describe a workflow you want to prototype</h2>
        <p className="hint">The demo drafter is rule-based and runs in your browser. It recognises verbs like plan, research, check, review, and publish. A model-backed drafter would return the same shape: a proposal with assumptions and open questions, never a finished graph.</p>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="draft-text">Description</label>
          <textarea id="draft-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Example:\n${EXAMPLE}`} style={{ minHeight: 96 }} />
        </div>
        <div className="row" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
          <button className="btn sm ghost" onClick={() => setText(EXAMPLE)}>Use the example</button>
          <button className="btn sm primary" onClick={run} disabled={text.trim().length < 12}>Draft a starter graph</button>
        </div>
        {result && !result.ok && <div className="note warn" style={{ marginTop: 12 }}>{result.reason}</div>}
        {result && result.ok && (
          <div style={{ marginTop: 14 }}>
            <div className="note accent"><b>Starter draft generated from your description.</b> This graph is a proposal, not a verified implementation. Review the assumptions, routing rules, State fields, and safety notes before using it.</div>
            <div className="two" style={{ marginTop: 10 }}>
              <div>
                <b>What I understood</b>
                <dl className="kv" style={{ marginTop: 6 }}>
                  <dt>Goal</dt><dd>{result.draft.interpretation.goal}</dd>
                  <dt>Actors</dt><dd>{result.draft.interpretation.actors.join(', ')}</dd>
                  <dt>Consequential actions</dt><dd>{result.draft.interpretation.consequentialActions.length ? result.draft.interpretation.consequentialActions.join('; ') : 'none: nothing in this draft would act on the world'}</dd>
                </dl>
              </div>
              <div>
                <b>Assumptions to confirm</b>
                {result.draft.interpretation.choices.map((c) => (
                  <div key={c.key} className="choice">
                    <span>{c.label}</span>
                    <span className="seg" role="group" aria-label={c.label}>
                      <button aria-pressed={c.on} onClick={() => setOpts((o) => ({ ...o, [c.key]: true }))}>{c.keep}</button>
                      <button aria-pressed={!c.on} onClick={() => setOpts((o) => ({ ...o, [c.key]: false }))}>{c.drop}</button>
                    </span>
                  </div>
                ))}
                <span className="hint">Changing an answer redraws the draft.</span>
              </div>
            </div>
            <p style={{ marginTop: 10 }}><b>Summary.</b> {result.draft.summary}</p>
            {readiness && (
              <div className="status-box" style={{ marginTop: 10 }}>
                <b>Draft readiness</b>
                <div className="coverage">
                  {readiness.coverage.map((c) => <div key={c.label}><b>{c.done} <span style={{ fontSize: 12 }}>of</span> {c.total}</b><span>{c.label}</span></div>)}
                  <div><b>{readiness.passes}</b><span>design checks passed</span></div>
                  <div><b>{readiness.warnings + readiness.gaps}</b><span>items to review</span></div>
                </div>
                {readiness.findings.filter((f) => f.level !== 'pass').length > 0 && <div style={{ marginTop: 8 }}><b style={{ fontSize: 13 }}>Main gaps</b><ul style={{ margin: '4px 0 0' }}>{readiness.findings.filter((f) => f.level !== 'pass').slice(0, 4).map((f) => <li key={f.id}>{f.message}</li>)}</ul></div>}
                <div className="not">Implementation readiness: prototype only. Counts, not scores: they say what the one proposed scenario exercised.</div>
              </div>
            )}
            <div className="two" style={{ marginTop: 8 }}>
              <div><b>Assumptions</b><ul>{result.draft.assumptions.map((a) => <li key={a}>{a}</li>)}{!result.draft.assumptions.length && <li className="hint">none recorded</li>}</ul></div>
              <div><b>Open questions</b><ul>{result.draft.openQuestions.map((a) => <li key={a}>{a}</li>)}</ul></div>
              <div><b>Safety notes</b><ul>{result.draft.safetyNotes.map((a) => <li key={a}>{a}</li>)}</ul></div>
              <div><b>Suggested scenarios</b><ul>{result.draft.suggestedScenarios.map((a) => <li key={a}>{a}</li>)}</ul></div>
            </div>
            <p className="hint" style={{ marginTop: 8 }}>{result.draft.confidenceNotes.join(' ')}</p>
            <div className="row">
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn accent" onClick={() => onAccept(result.draft)}>Create draft in the workspace (replaces current graph; undo available)</button>
            </div>
          </div>
        )}
        {!result && <div className="row"><button className="btn" onClick={onClose}>Close</button></div>}
      </div>
    </div>
  );
}
