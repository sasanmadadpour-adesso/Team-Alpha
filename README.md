# Team-Alpha
Vibe Coding Challenge 2026 - Team Alpha


## VNB Konstruktportal mockup

This repository contains a React/Vite mockup for the **Anmeldung Konstrukt** MVP. It includes a dashboard, a three-step registration flow, a participant registry, monitoring preview, and a simulated direct API submission result.

Run locally with:

```bash
npm install
npm run dev
```

Then open the URL printed by Vite, normally `http://localhost:5173/`.

> Do not open the source `index.html` by double-clicking it. The source page imports React through Vite and must be served by the development server. To create a self-contained version that can be opened directly, run `npm run build` and open `dist/index.html`.


## Graphify

This repository uses [Graphify](https://github.com/Graphify-Labs/graphify) to keep a shared, queryable map of the application code and workbook data.

Install the project integration and Excel support once:

```bash
uv tool install "graphifyy[office]"
graphify install --project --platform opencode
```

Restart OpenCode after installing or updating the integration. Build or refresh the graph from the repository root with `/graphify .` or `/graphify . --update`. The shared outputs are stored in `graphify-out/`; caches, conversion files, and local cost data are intentionally ignored.

For direct graph queries:

```bash
graphify query "How does the workbook data reach the energy overview service?"
