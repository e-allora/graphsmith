# Graphsmith

A design-time environment for graph-based AI and automation workflows. Describe a workflow, see it as Nodes, Edges, State, and Routers, run a safe mock simulation, read the readiness report, and export a specification.

**Live demo:** https://graphsmith.vercel.app

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

## Credits

Idea, doctrine, and product direction: Robert Sweetman ([LinkedIn](https://www.linkedin.com/in/robert-sweetman-74602a227/), [GitHub](https://github.com/e-allora)). Built with Claude Code.

## License

Business Source License 1.1. See `LICENSE`. Converts to Apache 2.0 on 2030-09-12.
