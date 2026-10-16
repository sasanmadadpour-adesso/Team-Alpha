# Team-Alpha
Vibe Coding Challenge 2026 - Team Alpha

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
```
