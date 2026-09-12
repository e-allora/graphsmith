import { CATEGORY_COLOR } from './labels';

function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#0f172a" /><circle cx="9" cy="10" r="3.2" fill="#38bdf8" /><circle cx="23" cy="10" r="3.2" fill="#38bdf8" /><circle cx="16" cy="23" r="3.2" fill="#f59e0b" /><path d="M9 10 L16 23 L23 10" stroke="#e2e8f0" strokeWidth="2" fill="none" /></svg>
  );
}

function HeroGraph() {
  const box = (x: number, y: number, w: number, label: string, fill = '#fff') => (
    <g key={label}><rect x={x} y={y} width={w} height="34" rx="8" fill={fill} stroke="#cbd5e1" strokeWidth="1.5" /><text x={x + w / 2} y={y + 21} textAnchor="middle" fontSize="12" fontWeight="600" fill="#0f172a">{label}</text></g>
  );
  return (
    <svg viewBox="0 0 520 330" role="img" aria-label="A workflow graph: plan, three parallel research branches, combine, a coverage decision that either drafts the brief or loops back to improve the plan, then human review.">
      <defs><marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#94a3b8" /></marker></defs>
      {box(200, 10, 120, 'Plan research')}
      <path className="art-edge" d="M260 44 V70" markerEnd="url(#arr)" />
      {box(200, 70, 120, 'Dispatch')}
      <path className="art-edge" d="M260 104 C260 130 120 120 120 140" markerEnd="url(#arr)" />
      <path className="art-edge" d="M260 104 V140" markerEnd="url(#arr)" />
      <path className="art-edge" d="M260 104 C260 130 400 120 400 140" markerEnd="url(#arr)" />
      {box(60, 140, 120, 'Source A', '#eef2ff')}
      {box(200, 140, 120, 'Source B', '#eef2ff')}
      {box(340, 140, 120, 'Source C', '#eef2ff')}
      <path className="art-edge" d="M120 174 C120 200 260 190 260 210" markerEnd="url(#arr)" />
      <path className="art-edge" d="M260 174 V210" markerEnd="url(#arr)" />
      <path className="art-edge" d="M400 174 C400 200 260 190 260 210" markerEnd="url(#arr)" />
      {box(200, 210, 120, 'Evaluate coverage', '#fef9c3')}
      <path className="art-edge" d="M260 244 V262" markerEnd="url(#arr)" />
      <g><polygon points="260,262 320,290 260,318 200,290" fill="#fef3c7" stroke="#f59e0b" strokeWidth="1.5" /><text x="260" y="294" textAnchor="middle" fontSize="11" fontWeight="700" fill="#78350f">enough?</text></g>
      <path className="art-edge" d="M320 290 H400 V330" />
      <text x="330" y="284" fontSize="10.5" fill="#15803d" fontWeight="600">yes → draft brief</text>
      <path className="art-edge" d="M200 290 H60 V27 H198" strokeDasharray="6 5" markerEnd="url(#arr)" />
      <text x="66" y="284" fontSize="10.5" fill="#92400e" fontWeight="600">no → improve plan (max 2)</text>
      <path className="art-flow" d="M260 44 V70 V104 V140 V174 V210 V244 V262" />
    </svg>
  );
}

export function Landing() {
  const blocks = [
    { k: 'transform', t: 'Node', d: 'One unit of work. It says what it reads, what it writes, and whether it would touch the real world.' },
    { k: 'input', t: 'Edge', d: 'A possible next step. Parallel branches, joins, failure paths, and bounded retries are all visible.' },
    { k: 'validate', t: 'State', d: 'What the workflow remembers. Typed, classified, and traced: you can see who writes each field and who reads it.' },
    { k: 'action', t: 'Router', d: 'A visible decision with a rule and a safe default. The simulation shows exactly which value chose the path.' },
  ] as const;
  return (
    <div className="landing">
      <header className="landing-nav">
        <a className="brand" href="#/"><Logo /> Graphsmith</a>
        <nav aria-label="Primary">
          <a className="btn ghost" href="#how">How it works</a>
          <a className="btn ghost" href="#safety">Safety</a>
          <a className="btn primary" href="#/demo">Explore the interactive demo</a>
        </nav>
      </header>

      <section className="hero">
        <div>
          <h1>Build workflows that can think in paths, not just steps.</h1>
          <p className="lede">Describe an AI or automation workflow. Graphsmith turns it into a visual model that you can inspect, simulate, test, and improve before implementation.</p>
          <div className="cta">
            <a className="btn primary" href="#/demo">Explore the interactive demo</a>
            <a className="btn" href="#how">See how it works</a>
          </div>
          <p className="hint" style={{ marginTop: 14 }}>No login. Nothing leaves your browser. Every run is a mock simulation on synthetic data.</p>
        </div>
        <div className="hero-art"><HeroGraph /></div>
      </section>

      <section className="section" id="how">
        <h2>Four building blocks</h2>
        <p className="sub">Every Graphsmith project is made of the same four parts. If you can read a flowchart, you can read a Graphsmith graph.</p>
        <div className="cards">
          {blocks.map((b) => (
            <div className="card" key={b.t}><h3><span className="glyph" style={{ background: CATEGORY_COLOR[b.k] }}>{b.t[0]}</span>{b.t}</h3><p>{b.d}</p></div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Hidden logic versus visible logic</h2>
        <p className="sub">Most automation lives in code or in a chain of prompts. When it misbehaves, nobody can point at the step that decided. Graphsmith makes the decision a thing you can click.</p>
        <div className="compare">
          <div className="card"><h3>Hidden sequential logic</h3><p>A script, a prompt chain, or an agent loop.</p><pre>{`result = llm(prompt)
if "insufficient" in result:
    result = llm(prompt + "try harder")
send(result)

# Which value decided? How many times can it loop?
# What did it remember between steps? Who approved it?`}</pre></div>
          <div className="card"><h3>Visible workflow logic</h3><p>The same idea as a Graphsmith graph.</p><pre>{`Evaluate coverage  writes coverageScore, coverageGaps
◇ Is the evidence sufficient?
   IF coverageScore ≥ 0.80 → Draft brief
   OTHERWISE → Improve research plan (safe default)
   Loop limit: 2 iterations
Human review checkpoint  writes reviewerDecision
Publish brief  action · mocked · moderate impact`}</pre></div>
        </div>
      </section>

      <section className="section">
        <h2>Use cases in the demo</h2>
        <p className="sub">One scenario is fully interactive. The other two show the shape of what comes next.</p>
        <div className="cards">
          <div className="card"><h3>Research Brief Assistant <span className="badge accent">interactive</span></h3><p>Plan, research three sources in parallel, evaluate coverage, loop once if evidence is thin, get a human sign-off, publish. Four scripted scenarios including a mock tool failure.</p></div>
          <div className="card"><h3>Support Triage <span className="badge">outline</span></h3><p>Classify a ticket, route by urgency with a visible rule, escalate to a person when the classifier is unsure.</p></div>
          <div className="card"><h3>Document Intake <span className="badge">outline</span></h3><p>Extract fields, validate them, ask for corrections, file the record. Personal data fields are classified and redacted in exports.</p></div>
        </div>
      </section>

      <section className="safety" id="safety">
        <div>
          <h2>Design-time by design</h2>
          <p>Graphsmith is a place to prototype workflow reasoning. It is not a runtime. The demo cannot deploy a workflow, call a live service, store a credential, send a message, or change a record. Simulation uses the rules and synthetic data in the project, and a passing run is not a guarantee about real users, data, or integrations.</p>
          <p className="boundary">Prototype safely. Execute elsewhere.</p>
        </div>
        <div>
          <b>What the readiness report does</b>
          <ul>
            <li>Checks topology: entry, end, reachability, default paths, bounded loops.</li>
            <li>Checks State: every field read is written, typed, and merge-safe.</li>
            <li>Checks safety: actions are mocked and labelled by impact; sensitive fields stay out of public exports.</li>
            <li>Checks test coverage: every decision outcome and failure path has a scenario, or you see the gap.</li>
          </ul>
          <b style={{ display: 'block', marginTop: 12 }}>What it never says</b>
          <ul><li>Certified safe. Compliant. Secure by default. Production safe. Guaranteed correct.</li></ul>
        </div>
      </section>

      <footer className="footer">
        <span>Graphsmith is a design-time prototype. Source under the Business Source License 1.1.</span>
        <a href="https://github.com/e-allora/graphsmith">GitHub</a>
        <a href="#/demo">Open the demo</a>
      </footer>
    </div>
  );
}
