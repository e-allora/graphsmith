import type { GraphProject } from '../domain/types';
import { outgoing, elementName } from '../domain/graph';
import { CATEGORY_LABEL, EDGE_COLOR } from './labels';
import type { Selection } from './store';

type Props = { project: GraphProject; selection: Selection; onSelect: (s: Selection) => void };

/** Keyboard-friendly alternative to the canvas: every step, decision and connection as a list. */
export function OutlineView({ project, selection, onSelect }: Props) {
  const g = project.graph;
  const items = [...g.nodes.map((n) => ({ id: n.id, kind: 'node' as const, label: n.name, sub: CATEGORY_LABEL[n.category], y: n.position.y, x: n.position.x })), ...g.routers.map((r) => ({ id: r.id, kind: 'router' as const, label: r.question, sub: 'Decision', y: r.position.y, x: r.position.x }))].sort((a, b) => a.y - b.y || a.x - b.x);
  return (
    <ul className="outline" aria-label="Graph outline">
      {items.map((it) => (
        <li key={it.id}>
          <button aria-current={selection?.id === it.id} onClick={() => onSelect({ kind: it.kind, id: it.id })}>
            <span className="dot" style={{ background: it.kind === 'router' ? '#f59e0b' : g.entryNodeId === it.id ? '#15803d' : '#94a3b8' }} aria-hidden="true" />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
            <small>{it.sub}</small>
          </button>
          <ul className="outline sub">
            {outgoing(g, it.id).map((e) => (
              <li key={e.id}>
                <button aria-current={selection?.id === e.id} onClick={() => onSelect({ kind: 'edge', id: e.id })}>
                  <span className="dot" style={{ background: EDGE_COLOR[e.type], borderRadius: 2 }} aria-hidden="true" />
                  <small>→ {elementName(g, e.targetNodeId)}{e.label ? ` (${e.label})` : ''}</small>
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
