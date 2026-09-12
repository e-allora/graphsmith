import type { GraphProject, StatePatch, ValueOrigin } from '../domain/types';
import { readersOf, writersOf, routersReading } from '../domain/graph';
import type { Selection } from './store';

type Props = {
  project: GraphProject;
  selection: Selection;
  readOnly: boolean;
  live?: { state: StatePatch; changed: Set<string>; origins: Record<string, ValueOrigin> };
  onSelect: (s: Selection) => void;
  onAddField: () => void;
};

function show(v: unknown): string {
  if (v === undefined) return '–';
  if (typeof v === 'string') return v === '' ? '""' : v.length > 70 ? v.slice(0, 70) + '…' : v;
  const s = JSON.stringify(v);
  return s.length > 70 ? s.slice(0, 70) + '…' : s;
}

export function StatePanel(p: Props) {
  const g = p.project.graph;
  return (
    <div>
      <div className="toolbar">
        <span className="hint">State is the shared information the workflow remembers. Every value shown here is a synthetic example, never real data.</span>
        <span className="tabs-spacer" style={{ flex: 1 }} />
        {!p.readOnly && <button className="btn sm" onClick={p.onAddField}>+ Add field</button>}
      </div>
      {p.live && <div className="note accent">Showing values at the selected simulation step. Highlighted rows changed in that step. Origin tags: <span className="origin">mocked</span> came from the scenario, <span className="origin">default</span> is the field's example value.</div>}
      <div style={{ overflowX: 'auto' }}>
        <table className="grid state-table">
          <thead><tr><th>Field</th><th>Meaning</th><th>Type</th><th>Class</th><th>{p.live ? 'Current value' : 'Example value'}</th><th>Read by</th><th>Written by</th><th>Export</th></tr></thead>
          <tbody>
            {p.project.stateSchema.fields.map((f) => {
              const readers = [...readersOf(g, f.id).map((n) => n.name), ...routersReading(g, f.id).map((r) => `◇ ${r.question}`)];
              const writers = writersOf(g, f.id).map((n) => n.name);
              const value = p.live ? p.live.state[f.id] : f.defaultValue;
              const changed = p.live?.changed.has(f.id);
              const sensitive = ['confidential', 'personal', 'restricted'].includes(f.classification);
              return (
                <tr key={f.id} className={`clickable ${p.selection?.id === f.id ? 'sel' : ''}`} onClick={() => p.onSelect({ kind: 'field', id: f.id })} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') p.onSelect({ kind: 'field', id: f.id }); }}>
                  <td className="mono">{f.name}{f.isInput && <span className="origin">input</span>}</td>
                  <td>{f.description}</td>
                  <td className="mono">{f.type}</td>
                  <td><span className={`badge ${sensitive ? 'warn' : ''}`}>{f.classification}</span></td>
                  <td className={`mono ${changed ? 'changed' : ''}`}>{show(value)}{p.live && value !== undefined && <span className="origin">{p.live.origins[f.id] ?? 'default'}</span>}</td>
                  <td>{readers.length ? readers.join(', ') : <span className="hint">nobody</span>}</td>
                  <td>{writers.length ? writers.join(', ') : f.isInput ? <span className="hint">input</span> : <span className="badge warn">never</span>}</td>
                  <td className="mono">{f.exportPolicy}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
