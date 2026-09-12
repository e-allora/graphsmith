# Graphsmith

A design-time environment for graph-based AI and automation workflows. Describe a workflow, see it as Nodes, Edges, State, and Routers, run a safe mock simulation, read the readiness report, and export a specification.

**Live demo:** https://graphsmith-alpha.vercel.app

Prototype safely. Execute elsewhere. The demo cannot deploy a workflow, call a live service, store a credential, send a message, or change a record. Every run is a deterministic mock simulation on synthetic data, entirely in the browser.

## What the demo does

- **Landing page** that explains the four building blocks and the design-time boundary.
- **Workspace** with a graph canvas (drag, connect, add steps and decisions, undo/redo, reset), an inspector, a keyboard-friendly outline view, and five tabs: Design, State, Evaluate, Readiness, Export.
- **Research Brief Assistant** template: plan, three parallel research branches, a fallback path, a coverage decision with a bounded retry loop, a human review checkpoint, a mocked publish action.
- **Mock simulation** with four scripted scenarios (evidence sufficient, evidence incomplete, reviewer requests revision, mock tool failure). Each step shows the State patch and a plain-language reason; every decision shows the value that chose the path.
- **Readiness checks** for topology, State, safety, and test coverage. The wording never claims certification.
- **Export** to Mermaid, JSON (with sensitive fields redacted in public mode), and a Markdown implementation brief.
- **Read-only share links** that encode a redacted copy of the project in the URL. No server, no accounts.
- **Draft from description**: a rule-based drafter that turns a sentence into a starter graph with assumptions, open questions, and safety notes. It refuses restricted domains and strips credential-like text. A model-backed drafter would sit behind the same output shape.

## Run it locally

```
npm install
npm run dev        # http://localhost:5173
npm test           # domain tests: simulator, lint, export, share, drafter
npm run build      # static site in dist/
```

Deploy: `npx vercel --prod`. The full product plan is in `graphsmith-demo.md`.

## Layout

```
src/domain/   graph spec, template, simulator, lint engine, exports, share encoding, drafter (no React)
src/ui/       landing page, workspace, canvas (React Flow), panels
```

## Credits and sources

- **Origin of the idea:** Ayoub Zulfiqar (Sensei), [Graph Engineering: The 11-Step Roadmap From Loops to Graph Architect](https://dev.to/ayoubzulfiqar/grpah-engineering-the-11-step-roadmap-from-loops-to-graph-architect-2f4b), dev.to, July 2026. Site: [ayoubzulfiqar.com](https://ayoubzulfiqar.com). The Node, Edge, State, Router model and the argument for explicit topology come from this article.
- **Safety and oversight framing:** NIST [AI RMF 1.0](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf) and the [Generative AI Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf); Green and Petre, [Cognitive Dimensions of visual programming](https://citeseerx.ist.psu.edu/document?repid=rep1&type=pdf&doi=54f8ae5828615d1fe7d61c0038cc1ec77f4697b0).
- **Idea, doctrine, and product direction:** Robert Sweetman ([LinkedIn](https://www.linkedin.com/in/robert-sweetman-74602a227/), [GitHub](https://github.com/e-allora)). The product critique was researched with Perplexity; the specification and build were written with Claude Code.
- **Built on:** [React Flow](https://reactflow.dev), React, Vite.

Contributions are welcome from anyone, and contributors are credited by name. If something here is wrong or uncredited, open an issue.

## License

Business Source License 1.1. See `LICENSE`. Converts to Apache 2.0 on 2030-09-12.
