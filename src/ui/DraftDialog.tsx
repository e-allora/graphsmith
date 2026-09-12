import { useState } from 'react';
import { draftFromDescription, type GeneratedDraft } from '../domain/draft';

type Props = { onClose: () => void; onAccept: (d: GeneratedDraft) => void };

const EXAMPLE = 'Plan research, investigate independent questions in parallel, combine evidence, check coverage and repeat research once if evidence is incomplete, ask a reviewer to approve the final brief, then publish it.';

export function DraftDialog({ onClose, onAccept }: Props) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ReturnType<typeof draftFromDescription> | null>(null);
  const run = () => setResult(draftFromDescription(text));
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
            <p><b>Summary.</b> {result.draft.summary}</p>
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
