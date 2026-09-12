import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import type { GraphProject, NodeCategory } from '../domain/types';
import { researchBriefProject, cloneProject, templateGallery } from '../domain/template';
import { simulate, type SimulationOverrides } from '../domain/simulate';
import { lint } from '../domain/lint';
import { decodeShare, encodeShare } from '../domain/share';
import type { GeneratedDraft } from '../domain/draft';
import { reducer, initialState, updateNode, updateRouter, updateEdge, updateField, movePositions, addNode, addRouter, connect, removeElement, addField, resetProject, type Tab, type Selection } from './store';
import { Canvas } from './Canvas';
import { Inspector } from './Inspector';
import { StatePanel } from './StatePanel';
import { EvaluatePanel } from './EvaluatePanel';
import { ReadinessPanel } from './ReadinessPanel';
import { ExportPanel } from './ExportPanel';
import { OutlineView } from './OutlineView';
import { DraftDialog } from './DraftDialog';
import { CATEGORY_LABEL } from './labels';

const TABS: { id: Tab; label: string }[] = [
  { id: 'design', label: 'Design' },
  { id: 'state', label: 'State' },
  { id: 'evaluate', label: 'Evaluate' },
  { id: 'readiness', label: 'Readiness' },
  { id: 'export', label: 'Export' },
];

const PALETTE: { cat: NodeCategory; label: string }[] = [
  { cat: 'transform', label: '+ Add step' },
  { cat: 'retrieve', label: '+ Add lookup (mocked)' },
  { cat: 'validate', label: '+ Add check' },
  { cat: 'human_review', label: '+ Add human review' },
  { cat: 'action', label: '+ Add action (mocked)' },
  { cat: 'output', label: '+ Add outcome' },
];

export function Workspace({ shareToken }: { shareToken?: string }) {
  const shared = useMemo(() => (shareToken ? decodeShare(shareToken) : undefined), [shareToken]);
  const [s, dispatch] = useReducer(reducer, undefined, () => initialState(shared ?? cloneProject(researchBriefProject), !!shared));
  const [draftOpen, setDraftOpen] = useState(false);
  const [bottomOpen, setBottomOpen] = useState(true);
  const project = s.project;

  const sims = useMemo(() => project.scenarios.map((sc) => simulate(project, sc)), [project]);
  const readiness = useMemo(() => lint(project, sims), [project, sims]);

  const commit = useCallback((p: GraphProject) => dispatch({ type: 'commit', project: p }), []);
  const toast = useCallback((m: string) => { dispatch({ type: 'toast', message: m }); window.setTimeout(() => dispatch({ type: 'toast', message: null }), 2600); }, []);
  const select = useCallback((sel: Selection) => dispatch({ type: 'select', selection: sel }), []);
  const selectElement = useCallback((id: string) => select({ kind: project.graph.routers.some((r) => r.id === id) ? 'router' : 'node', id }), [project, select]);

  const run = useCallback((scenarioId: string, overrides: SimulationOverrides) => {
    const sc = project.scenarios.find((x) => x.id === scenarioId);
    if (!sc) return;
    const result = simulate(project, sc, overrides);
    dispatch({ type: 'sim', sim: { scenarioId, overrides, result, stepIndex: 0, playing: true } });
    dispatch({ type: 'tab', tab: 'evaluate' });
  }, [project]);

  // Auto-play the trace
  useEffect(() => {
    if (!s.sim?.playing) return;
    const sim = s.sim;
    if (sim.stepIndex >= sim.result.steps.length - 1) { dispatch({ type: 'playing', playing: false }); return; }
    const t = window.setTimeout(() => dispatch({ type: 'step', index: sim.stepIndex + 1 }), 750);
    return () => window.clearTimeout(t);
  }, [s.sim]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); dispatch({ type: e.shiftKey ? 'redo' : 'undo' }); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); dispatch({ type: 'redo' }); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && s.selection && !s.readOnly) { e.preventDefault(); commit(removeElement(project, s.selection)); select(null); }
      else if (e.key === 'Escape') { setDraftOpen(false); select(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s.selection, s.readOnly, project, commit, select]);

  const share = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}#/demo?g=${encodeShare(project)}`;
    try { await navigator.clipboard.writeText(url); toast('Read-only link copied. Sensitive State values are redacted in it.'); }
    catch { window.prompt('Copy this read-only link:', url); }
  }, [project, toast]);

  const acceptDraft = (d: GeneratedDraft) => {
    commit(d.project);
    setDraftOpen(false);
    select(null);
    dispatch({ type: 'tab', tab: 'readiness' });
    toast('Draft created. It is a proposal: check Readiness and the open questions.');
  };

  const highlight = useMemo(() => {
    const visited = new Set<string>();
    const traversed = new Set<string>();
    let active: string | undefined;
    let currentEdge: string | undefined;
    if (s.sim) {
      const steps = s.sim.result.steps.slice(0, s.sim.stepIndex + 1);
      for (const st of steps) { visited.add(st.elementId); if (st.selectedEdgeId) traversed.add(st.selectedEdgeId); }
      const cur = steps[steps.length - 1];
      active = cur?.elementId;
      currentEdge = cur?.selectedEdgeId;
      if (cur && s.sim.stepIndex < s.sim.result.steps.length - 1 === false) currentEdge = undefined;
    }
    return { visited, traversed, active, currentEdge };
  }, [s.sim]);

  const liveState = useMemo(() => {
    if (!s.sim) return undefined;
    const st = s.sim.result.steps[s.sim.stepIndex];
    return st ? { state: st.stateAfter, changed: new Set(Object.keys(st.patch)), origins: st.origins } : undefined;
  }, [s.sim]);

  const addAt = (cat: NodeCategory) => {
    const n = project.graph.nodes.length + project.graph.routers.length;
    const { project: p, id } = addNode(project, cat, { x: 720, y: 60 + (n % 8) * 90 });
    commit(p); select({ kind: 'node', id });
  };
  const addDecision = () => {
    const n = project.graph.nodes.length + project.graph.routers.length;
    const { project: p, id } = addRouter(project, { x: 720, y: 60 + (n % 8) * 90 });
    commit(p); select({ kind: 'router', id });
  };

  return (
    <div className="ws">
      <header className="ws-top">
        <a className="brand" href="#/" aria-label="Graphsmith home"><svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#0f172a" /><circle cx="9" cy="10" r="3.2" fill="#38bdf8" /><circle cx="23" cy="10" r="3.2" fill="#38bdf8" /><circle cx="16" cy="23" r="3.2" fill="#f59e0b" /><path d="M9 10 L16 23 L23 10" stroke="#e2e8f0" strokeWidth="2" fill="none" /></svg> Graphsmith</a>
        <div className="title"><span className="name">{project.name}</span><span className={`badge ${s.readOnly ? 'warn' : 'accent'}`}>{s.readOnly ? 'Demo · read-only' : 'Demo mode'}</span>{project.status === 'draft' && <span className="badge">generated draft</span>}</div>
        <div className="spacer" />
        <div className="actions">
          {!s.readOnly && <>
            <button className="btn sm ghost" onClick={() => dispatch({ type: 'undo' })} disabled={!s.past.length} title="Undo (Ctrl+Z)">Undo</button>
            <button className="btn sm ghost" onClick={() => dispatch({ type: 'redo' })} disabled={!s.future.length} title="Redo (Ctrl+Shift+Z)">Redo</button>
            <button className="btn sm ghost" onClick={() => { commit(resetProject()); select(null); toast('Template restored.'); }}>Reset template</button>
            <button className="btn sm" onClick={() => setDraftOpen(true)}>✦ Draft from description</button>
          </>}
          {s.readOnly && <a className="btn sm" href="#/demo">Open the editable demo</a>}
          <button className="btn sm" onClick={share}>Share</button>
          <button className="btn sm accent" onClick={() => run(s.sim?.scenarioId ?? project.scenarios[0]?.id, s.sim?.overrides ?? {})} disabled={!project.scenarios.length}>Evaluate ▶</button>
        </div>
      </header>

      <div className="ws-body">
        <aside className="ws-left" aria-label="Build">
          {!s.readOnly && <>
            <div className="panel-h">Build</div>
            <div className="panel-body palette">
              {PALETTE.map((x) => <button key={x.cat} className="btn sm" onClick={() => addAt(x.cat)} title={CATEGORY_LABEL[x.cat]}>{x.label}</button>)}
              <button className="btn sm" onClick={addDecision} style={{ borderColor: 'var(--router)' }}>◇ Add decision</button>
              <span className="hint">Connect by dragging from a bottom dot to a top dot. Delete removes the selection.</span>
            </div>
          </>}
          <div className="panel-h">Templates</div>
          <div className="panel-body">
            {templateGallery.map((t) => (
              <div key={t.id} className={`tpl ${project.id === t.id ? 'active' : ''}`}>
                <b>{t.name} {t.interactive ? <span className="badge accent">interactive</span> : <span className="badge">outline</span>}</b>
                <small>{t.summary}</small>
                {t.interactive && !s.readOnly && project.id !== t.id && <button className="btn sm" style={{ marginTop: 6 }} onClick={() => { commit(resetProject()); select(null); }}>Load</button>}
              </div>
            ))}
          </div>
          <div className="panel-h">Outline</div>
          <div className="panel-body" style={{ paddingTop: 0 }}>
            <OutlineView project={project} selection={s.selection} onSelect={select} />
          </div>
        </aside>

        <main className="ws-center">
          <Canvas
            project={project}
            selection={s.selection}
            readOnly={s.readOnly}
            activeId={highlight.active}
            visitedIds={highlight.visited}
            traversedEdgeIds={highlight.traversed}
            currentEdgeId={highlight.currentEdge}
            onSelect={select}
            onMove={(moves) => commit(movePositions(project, moves))}
            onConnect={(src, tgt) => { const r = connect(project, src, tgt); if (r.error) toast(r.error); else if (r.project) { commit(r.project); if (r.id) select({ kind: 'edge', id: r.id }); } }}
            onDeleteSelection={() => { if (s.selection && !s.readOnly) { commit(removeElement(project, s.selection)); select(null); } }}
          />
          <div className={`ws-bottom ${bottomOpen ? '' : 'collapsed'} ${s.tab === 'evaluate' || s.tab === 'readiness' ? 'tall' : ''}`}>
            <div className="tabs" role="tablist" aria-label="Workspace views">
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={s.tab === t.id} onClick={() => { dispatch({ type: 'tab', tab: t.id }); setBottomOpen(true); }}>
                  {t.label}
                  {t.id === 'readiness' && (readiness.gaps ? <span className="badge gap">{readiness.gaps}</span> : readiness.warnings ? <span className="badge warn">{readiness.warnings}</span> : <span className="badge ok">✓</span>)}
                </button>
              ))}
              <span className="tabs-spacer" />
              <div className="legend" aria-hidden="true"><span><i className="par" />parallel</span><span><i className="fail" />failure</span><span><i className="retry" />retry</span></div>
              <button className="btn sm ghost" onClick={() => setBottomOpen((v) => !v)} aria-expanded={bottomOpen}>{bottomOpen ? 'Hide' : 'Show'}</button>
            </div>
            {bottomOpen && (
              <div className="tab-panel" role="tabpanel" key={s.tab}>
                {s.tab === 'design' && (
                  <div className="two">
                    <div>
                      <div className="panel-h" style={{ padding: '0 0 6px' }}>How to read this graph</div>
                      <p>{project.description}</p>
                      <ul className="hint" style={{ paddingLeft: 16, marginTop: 6 }}>
                        <li>Click any step to see what it reads, what it writes, and its safety notes.</li>
                        <li>Amber decisions show their rule and the safe default path.</li>
                        <li>Press <b>Evaluate ▶</b> to watch a scripted scenario move through the graph.</li>
                      </ul>
                    </div>
                    <div>
                      <div className="panel-h" style={{ padding: '0 0 6px' }}>Scenarios in this project</div>
                      {project.scenarios.map((sc) => <div key={sc.id} className="finding pass"><span className="ico" aria-hidden="true">▶</span><button onClick={() => run(sc.id, {})}>{sc.name}: {sc.description}</button></div>)}
                    </div>
                  </div>
                )}
                {s.tab === 'state' && <StatePanel project={project} selection={s.selection} readOnly={s.readOnly} live={liveState} onSelect={select} onAddField={() => { const { project: p, id } = addField(project); commit(p); select({ kind: 'field', id }); }} />}
                {s.tab === 'evaluate' && <EvaluatePanel project={project} sim={s.sim} onRun={run} onStep={(i) => { dispatch({ type: 'playing', playing: false }); dispatch({ type: 'step', index: i }); }} onPlay={(pl) => dispatch({ type: 'playing', playing: pl })} onSelectElement={selectElement} />}
                {s.tab === 'readiness' && <ReadinessPanel readiness={readiness} project={project} onSelect={select} />}
                {s.tab === 'export' && <ExportPanel project={project} onToast={toast} onShare={share} />}
              </div>
            )}
          </div>
        </main>

        <aside className="ws-right" aria-label="Inspect">
          <div className="panel-h">Inspect</div>
          <Inspector
            project={project}
            selection={s.selection}
            readOnly={s.readOnly}
            onNode={(id, patch) => commit(updateNode(project, id, patch))}
            onRouter={(id, patch) => commit(updateRouter(project, id, patch))}
            onEdge={(id, patch) => commit(updateEdge(project, id, patch))}
            onField={(id, patch) => commit(updateField(project, id, patch))}
            onSelect={select}
            onDelete={() => { commit(removeElement(project, s.selection)); select(null); }}
            onSetEntry={(id) => commit({ ...project, graph: { ...project.graph, entryNodeId: id } })}
            onToggleEnd={(id) => commit({ ...project, graph: { ...project.graph, endNodeIds: project.graph.endNodeIds.includes(id) ? project.graph.endNodeIds.filter((x) => x !== id) : [...project.graph.endNodeIds, id] } })}
          />
        </aside>
      </div>

      {draftOpen && <DraftDialog onClose={() => setDraftOpen(false)} onAccept={acceptDraft} />}
      {s.toast && <div className="toast" role="status">{s.toast}</div>}
    </div>
  );
}
