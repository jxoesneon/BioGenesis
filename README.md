# BioGenesis

> A 3D biopunk procedural **living-ship** builder. Grow, mutate, and pilot
> biological starships — *Void-Fauna* — built from procedural organ systems,
> vascular networks, and chitin carapaces, rendered in real time with Three.js.

BioGenesis is a prototype engine and design sandbox for a planned AAA biopunk
space simulator. The current prototype runs in the browser (React 19 + Vite 6 +
Three.js WebGL) and lets you procedurally generate a living ship from a NURBS
hull, place organ systems along anatomical sections, route connecting conduits,
tune genetics, and export the result.

---

## Status

This repository contains the **WebGL prototype** (Phase 1 of a 3-phase roadmap):
a React/Three.js application that proves out the procedural organ pipeline, the
force-field organ placement solver, and the bio-telemetry UI. It is a design
and engineering sandbox, not a playable game yet.

The static correctness gate is `tsc --noEmit` (no test suite is wired into CI
yet; a standalone symmetry test is available via `npm run test:symmetry`).

---

## Quick start

```bash
npm install
npm run dev      # http://localhost:3000
```

Build and preview:

```bash
npm run build    # outputs to dist/
npm run preview
```

Type-check (the project's correctness gate):

```bash
npm run lint     # tsc --noEmit
```

### Environment

The prototype can optionally call the server-side Google Gemini API. Copy
`.env.example` to `.env` and fill in your key if you want that feature; the app
runs without it.

```bash
cp .env.example .env
# GEMINI_API_KEY=...   (server-side only; never committed)
```

---

## Tech stack

- **React 19** + **Vite 6** — UI shell and dev server
- **Three.js** (WebGL) — 3D rendering, NURBS hull, organ meshes, conduit splines
- **Tailwind CSS 4** — styling
- **Motion** — UI animation
- **Express** + **@google/genai** — optional server-side Gemini API integration
- **TypeScript 5.8** — strict typing throughout

---

## What it does

- **Procedural hull** generated from a NURBS surface, divided into 5 anatomical
  sections (Cranial, Neck, Thoracic, Caudal, Tail Tip).
- **Organ systems** placed along the hull via a force-field repulsion solver
  with anatomical exclusion rules and per-section clamping.
- **Connecting conduits** (arteries, veins, ducts, neural trunks) routed as
  Bishop-frame tubes between organ nodes.
- **Genetics drawer** to tune species presets and organ parameters.
- **Bio-telemetry HUD** showing real-time organ pipeline state.
- **OBJ export** of the generated mesh.

---

## Architecture

### Key source files

| File | Role |
| :--- | :--- |
| `src/App.tsx` | Top-level app shell and state |
| `src/components/Canvas3D.tsx` | Three.js scene, organ placement solver, conduit routing, render loop |
| `src/components/EngineeringView.tsx` | Engineering / inspection view |
| `src/components/GeneticsDrawer.tsx` | Genetics tuning UI |
| `src/components/TelemetryPanel.tsx` | Bio-telemetry HUD |
| `src/utils/nurbs.ts` | NURBS hull surface generation |
| `src/utils/pipelineGraph.ts` | Organ pipeline node graph (5 pipelines, 15 organ types) |
| `src/utils/organPlacement.ts` | Anatomical section placement bands |
| `src/utils/organSDFRegistry.ts` | Maps each organ node to its SDF composition |
| `src/utils/proceduralPipeline.ts` | Unified entry point composing all procedural modules |
| `src/types.ts` | Organ pipeline data contracts and species presets |

### Procedural mesh pipeline (`src/utils/`)

A set of research-backed procedural generation modules, composed by
`proceduralPipeline.ts`:

- `sdf.ts` — SDF primitives, CSG, smooth-min blending
- `marchingCubes.ts` — Marching Cubes + Surface Nets isosurface extraction
- `dualContouring.ts` — Dual contouring with QEF sharp-feature preservation
- `tubeGeometry.ts` — Bishop-frame (rotation-minimizing) tubes, branching networks
- `metaballs.ts` — Blinn/Wyvill metaball implicit fields
- `lsystem.ts` — Parametric L-systems + space colonization (Runions 2007)
- `subdivision.ts` — Catmull-Clark subdivision with semi-sharp creases
- `reactionDiffusion.ts` — Gray-Scott bioluminescent surface patterns
- `arap.ts` — As-rigid-as-possible mesh deformation
- `noise.ts` — Simplex, Worley, fBm, ridged multifractal, domain warping

### Optional MCP server (`src/mcp/`)

A project-native MCP server (`npm run mcp`) exposes the codebase to MCP-aware
agent runtimes for read/write/search/exec/build operations, locked to the
project root.

---

## Documentation

- [`LORE.md`](LORE.md) — Void-Fauna lore and cosmology
- [`ORGAN_SYSTEMS.md`](ORGAN_SYSTEMS.md) — Closed-loop organ pipeline specification
- [`docs/research/`](docs/research) — Procedural mesh generation, living-ship
  design, and per-system research documents
- [`docs/institutional/`](docs/institutional) — Master specification suite
  (gameplay, graphics, physics, netcode, audio, AI, QA, roadmap). Start at
  [`docs/institutional/README.md`](docs/institutional/README.md)

---

## License

All rights reserved. No open-source license has been applied yet; default
copyright applies. Contact the maintainer before reusing any code or assets.
