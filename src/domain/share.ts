import type { GraphProject } from './types';
import { redactForPublic } from './exportFormats';

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Read-only share payload: sensitive State values are redacted before encoding. */
export function encodeShare(project: GraphProject): string {
  const p = redactForPublic(project);
  return toBase64Url(JSON.stringify({ v: 1, p }));
}

export function decodeShare(token: string): GraphProject | undefined {
  try {
    const obj = JSON.parse(fromBase64Url(token)) as { v: number; p: GraphProject };
    if (obj.v !== 1 || !obj.p?.graph?.nodes) return undefined;
    return obj.p;
  } catch {
    return undefined;
  }
}
