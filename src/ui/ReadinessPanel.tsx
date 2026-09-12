import type { Readiness } from '../domain/lint';
import type { GraphProject, Finding } from '../domain/types';
import type { Selection } from './store';

type Props = { readiness: Readiness; project: GraphProject; onSelect: (s: Selection) => void };

const GROUPS: { key: Finding['group']; title: string }[] = [
  { key: 'topology', title: 'Topology' },
  { key: 'state', title: 'State' },
  { key: 'safety', title: 'Safety' },
  { key: 'evaluation', title: 'Test coverage' },
];
const ICON = { pass: '✓', warn: '!', gap: '×' };
const WORD = { pass: 'Passed', warn: 'Recommended review', gap: 'Known gap' };

export function ReadinessPanel({ readiness: r, project, onSelect }: Props) {
  const select = (id?: string) => {
    if (!id) return;
    const kind = project.graph.routers.some((x) => x.id === id) ? 'router' : project.graph.nodes.some((x) => x.id === id) ? 'node' : project.stateSchema.fields.some((x) => x.id === id) ? 'field' : 'edge';
    onSelect({ kind, id });
  };
  return (
    <div>
      <div className="status-box">
        <b>Prototype readiness</b>
        <div className="toolbar" style={{ marginTop: 6, marginBottom: 4 }}>
          <span className="badge ok">{r.passes} design checks passed</span>
          <span className="badge warn">{r.warnings} recommended review{r.warnings === 1 ? '' : 's'}</span>
          <span className="badge gap">{r.gaps} known gap{r.gaps === 1 ? '' : 's'}</span>
        </div>
        <div>Status: <b style={{ display: 'inline' }}>{r.status}</b></div>
        <div className="not">Not yet: {r.notYet}. These checks describe the design, not a running system.</div>
        <div className="coverage" aria-label="Test coverage">
          {r.coverage.map((c) => <div key={c.label}><b>{c.done} <span style={{ fontSize: 12 }}>of</span> {c.total}</b><span>{c.label}</span></div>)}
        </div>
      </div>
      <div className="two">
        {GROUPS.map((grp) => {
          const items = r.findings.filter((f) => f.group === grp.key);
          const order = { gap: 0, warn: 1, pass: 2 };
          items.sort((a, b) => order[a.level] - order[b.level]);
          return (
            <section key={grp.key} aria-label={grp.title}>
              <div className="panel-h" style={{ padding: '0 0 6px' }}>{grp.title}</div>
              {items.length === 0 && <p className="hint">No checks apply.</p>}
              {items.map((f) => (
                <div key={f.id} className={`finding ${f.level}`}>
                  <span className="ico" aria-hidden="true">{ICON[f.level]}</span>
                  <span className="sr-only">{WORD[f.level]}:</span>
                  {f.elementId ? <button onClick={() => select(f.elementId)}>{f.message}</button> : <span>{f.message}</span>}
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
