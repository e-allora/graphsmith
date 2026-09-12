import type { GraphDefinition, GraphNode, Router, GraphEdge } from './types';

export type Element = { kind: 'node'; node: GraphNode } | { kind: 'router'; router: Router };

export function findElement(g: GraphDefinition, id: string): Element | undefined {
  const node = g.nodes.find((n) => n.id === id);
  if (node) return { kind: 'node', node };
  const router = g.routers.find((r) => r.id === id);
  if (router) return { kind: 'router', router };
  return undefined;
}

export function elementName(g: GraphDefinition, id: string): string {
  const el = findElement(g, id);
  if (!el) return id;
  return el.kind === 'node' ? el.node.name : el.router.question;
}

export function outgoing(g: GraphDefinition, id: string): GraphEdge[] {
  return g.edges.filter((e) => e.sourceNodeId === id);
}

export function incoming(g: GraphDefinition, id: string): GraphEdge[] {
  return g.edges.filter((e) => e.targetNodeId === id);
}

export function allIds(g: GraphDefinition): string[] {
  return [...g.nodes.map((n) => n.id), ...g.routers.map((r) => r.id)];
}

export function reachableFrom(g: GraphDefinition, start: string): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of outgoing(g, id)) stack.push(e.targetNodeId);
  }
  return seen;
}

/** Returns the set of element ids that sit on at least one cycle. */
export function cycleMembers(g: GraphDefinition): Set<string> {
  const ids = allIds(g);
  const members = new Set<string>();
  for (const id of ids) {
    // id is on a cycle if it can reach itself
    const seen = new Set<string>();
    const stack = outgoing(g, id).map((e) => e.targetNodeId);
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === id) { members.add(id); break; }
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const e of outgoing(g, cur)) stack.push(e.targetNodeId);
    }
  }
  return members;
}

export function readersOf(g: GraphDefinition, field: string): GraphNode[] {
  return g.nodes.filter((n) => n.reads.includes(field));
}
export function writersOf(g: GraphDefinition, field: string): GraphNode[] {
  return g.nodes.filter((n) => n.writes.includes(field));
}
export function routersReading(g: GraphDefinition, field: string): Router[] {
  return g.routers.filter((r) => r.rules.some((rule) => rule.field === field));
}

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

/** Basic topology validation for a proposed edge. Returns a reason string when invalid. */
export function validateNewEdge(g: GraphDefinition, source: string, target: string): string | undefined {
  if (source === target) return 'A step cannot connect to itself.';
  if (!findElement(g, source) || !findElement(g, target)) return 'Both ends must exist.';
  if (g.edges.some((e) => e.sourceNodeId === source && e.targetNodeId === target)) return 'That connection already exists.';
  const src = findElement(g, source)!;
  if (src.kind === 'node' && src.node.category === 'output') return 'An output step is an end point; it cannot lead anywhere.';
  const tgt = findElement(g, target)!;
  if (tgt.kind === 'node' && tgt.node.category === 'input' && g.entryNodeId === target) return 'The entry step cannot be a target.';
  return undefined;
}
