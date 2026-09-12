import { useMemo, useState } from 'react';
import type { GraphProject } from '../domain/types';
import { toMermaid, toJson, toMarkdownBrief, EXPORT_DISCLAIMER } from '../domain/exportFormats';

type Props = { project: GraphProject; onToast: (m: string) => void; onShare: () => void };
type Kind = 'mermaid' | 'json' | 'brief';

export function ExportPanel({ project, onToast, onShare }: Props) {
  const [kind, setKind] = useState<Kind>('mermaid');
  const [publicMode, setPublicMode] = useState(true);
  const text = useMemo(() => (kind === 'mermaid' ? toMermaid(project.graph) : kind === 'json' ? toJson(project, publicMode) : toMarkdownBrief(project)), [kind, project, publicMode]);
  const ext = kind === 'mermaid' ? 'mmd' : kind === 'json' ? 'json' : 'md';

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); onToast('Copied to clipboard.'); } catch { onToast('Could not copy. Select the text and copy it manually.'); }
  };
  const download = () => {
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${project.id}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div>
      <div className="toolbar">
        <button className={`btn sm ${kind === 'mermaid' ? 'primary' : ''}`} onClick={() => setKind('mermaid')}>Mermaid</button>
        <button className={`btn sm ${kind === 'json' ? 'primary' : ''}`} onClick={() => setKind('json')}>JSON spec</button>
        <button className={`btn sm ${kind === 'brief' ? 'primary' : ''}`} onClick={() => setKind('brief')}>Implementation brief (Markdown)</button>
        <span style={{ flex: 1 }} />
        {kind === 'json' && <label className="hint" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={publicMode} onChange={(e) => setPublicMode(e.target.checked)} /> Public mode (redact sensitive fields)</label>}
        <button className="btn sm" onClick={copy}>Copy</button>
        <button className="btn sm" onClick={download}>Download .{ext}</button>
        <button className="btn sm accent" onClick={onShare}>Copy read-only link</button>
      </div>
      <div className="note" style={{ whiteSpace: 'pre-wrap' }}>{EXPORT_DISCLAIMER}</div>
      <pre className="export" tabIndex={0} aria-label={`${kind} export`}>{text}</pre>
    </div>
  );
}
