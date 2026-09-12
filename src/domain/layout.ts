import type { GraphDefinition } from './types';
import { outgoing, findElement } from './graph';

const COL = 300;
const ROW = 130;

/** Simple layered layout: breadth-first levels from the entry, centred per level. Back edges are ignored. */
export function autoLayout(g: GraphDefinition): GraphDefinition {
  const level = new Map<string, number>();
  const queue: string[] = [g.entryNodeId];
  level.set(g.entryNodeId, 0);
  while (queue.length) {
    const id = queue.shift()!;
    const lv = level.get(id)!;
    for (const e of outgoing(g, id)) {
      if (e.type === 'retry' || e.type === 'review_resume') continue;
      if (!level.has(e.targetNodeId)) { level.set(e.targetNodeId, lv + 1); queue.push(e.targetNodeId); }
    }
  }
  const unplaced = [...g.nodes.map((n) => n.id), ...g.routers.map((r) => r.id)].filter((id) => !level.has(id));
  let extra = Math.max(0, ...level.values()) + 1;
  for (const id of unplaced) level.set(id, extra++);
  const rows = new Map<number, string[]>();
  for (const [id, lv] of level) rows.set(lv, [...(rows.get(lv) ?? []), id]);
  const pos = new Map<string, { x: number; y: number }>();
  for (const [lv, ids] of rows) {
    const width = (ids.length - 1) * COL;
    ids.forEach((id, i) => pos.set(id, { x: 320 + i * COL - width / 2, y: lv * ROW }));
  }
  return {
    ...g,
    nodes: g.nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position })),
    routers: g.routers.map((r) => ({ ...r, position: pos.get(r.id) ?? r.position })),
  };
}

export function hasElement(g: GraphDefinition, id: string): boolean {
  return !!findElement(g, id);
}
