# AAA+ Quality Assurance Automation, Performance Profiling & Telemetry Specification — BioGenesis

> **Document Identifier**: `BIO-QA-SPEC-2026-V1`  
> **Document Class**: Institutional Engineering Specification  
> **Target File Path**: `file:///Users/mey/BioGenesis/docs/institutional/AAA_QA_AUTOMATION_AND_TELEMETRY_SPEC.md`  
> **Author**: Subagent J (QA Automation, Telemetry & Audit Master Lead) — AAA+ Swarm Loop 2  
> **Runtime Environment**: TypeScript · React 19 · Vite 6 · Three.js (WebGL2) · WebGPU WGSL · Express · Playwright  
> **Status**: APPROVED INSTITUTIONAL SPECIFICATION  
> **Companion Base Specs**: [`PROFILING_AND_QA_AUTOMATION_ARCHITECTURE.md`](file:///Users/mey/BioGenesis/docs/research/PROFILING_AND_QA_AUTOMATION_ARCHITECTURE.md) · [`TECHNICAL_ARCHITECTURE_AND_ROADMAP.md`](file:///Users/mey/BioGenesis/docs/institutional/TECHNICAL_ARCHITECTURE_AND_ROADMAP.md) · [`PROCEDURAL_ORGAN_GENETICS_AND_SDF_SPEC.md`](file:///Users/mey/BioGenesis/docs/institutional/PROCEDURAL_ORGAN_GENETICS_AND_SDF_SPEC.md) · [`COUNCIL_AUDIT_REPORT.md`](file:///Users/mey/BioGenesis/docs/institutional/COUNCIL_AUDIT_REPORT.md)

---

## 1. Executive Summary & QA Automation Strategy

BioGenesis is a complex biopunk living-ship engineering simulator incorporating real-time procedural mesh generation (Signed Distance Fields [SDFs], Marching Cubes, Surface Nets, Dual Contouring, ARAP mesh deformation, L-Systems, Gray-Scott reaction-diffusion surface texturing), a 3D Position-Based Dynamics (PBD) force-field organ placement solver, biological organ system topology, and a bio-neural compute pipeline based on Haller's rule, Jerison allometry, and the Yerkes-Dodson inverted-U efficiency curve.

To achieve publication-grade AAA+ quality, framerate stability, and memory safety, BioGenesis mandates an automated quality assurance and performance profiling architecture. This institutional specification defines the binding engineering standards for:

1. **Automated Continuous Integration (CI) Performance Benchmarking**: Strict execution allocations for 60 FPS ($16.67\text{ ms}$) and 120 FPS ($8.33\text{ ms}$) targets, p99 spike ceilings ($< 33.33\text{ ms}$ / $< 16.67\text{ ms}$), and a $5\%$ regression threshold.
2. **Headless Testing Suites**: Zero-DOM validation covering 5-section anatomical placement bands, 4-layer organ exclusion culling, force-field solver stability over `SOLVER_PASSES = 45`, and procedural SDF/mesh grid bounds.
3. **Real-time VRAM/RAM Memory Leak Detection**: Active tracking via `VRAMLeakAuditor` for Three.js resource disposal (`geometry.dispose()`, `material.dispose()`, `texture.dispose()`), V8 heap snapshot comparison ($< 5.0\text{ MB}$ growth over 500 mutation cycles), and `TransformControls` detachment protocols.
4. **Telemetry Collection & Monitoring Pipeline**: High-efficiency client-side `RingBufferQueue` (capacity 1,000 events) streaming gzip-compressed batches every 5 seconds to an Express `/api/telemetry` endpoint, tracking pilot neuro-sync errors (`ERR_NEURAL_SHUTDOWN`, `ERR_NEURAL_STRAIN`, `ERR_NEURAL_EXCITOTOXICITY`, `ERR_AXON_LATENCY_SPIKE`), organ failure states, and micro-stutters.
5. **Static Gate Compliance**: Mandatory static type verification via `npx tsc --noEmit` (exit code 0, zero type errors), production bundle build validation (`vite build`), and automated headless symmetry testing.

```
 ┌─────────────────────────────────────────────────────────────────────────┐
 │                   BioGenesis AAA+ QA & Profiling Engine                 │
 └────────────────────────────────────┬────────────────────────────────────┘
                                      │
       ┌──────────────────────────────┼──────────────────────────────┐
       ▼                              ▼                              ▼
┌───────────────┐              ┌───────────────┐              ┌───────────────┐
│ Performance   │              │ Headless Test │              │ Memory & VRAM │
│ Benchmarking  │              │ Suites        │              │ Leak Auditor  │
│ (60/120 FPS)  │              │ (35-45 PBD)   │              │ (V8 Snapshots)│
└───────┬───────┘              └───────┬───────┘              └───────┬───────┘
        │                              │                              │
        └──────────────────────────────┼──────────────────────────────┘
                                       ▼
                       ┌──────────────────────────────┐
                       │ Static Gate: tsc --noEmit    │
                       │ & CI Pipeline (.github/ci)  │
                       └──────────────────────────────┘
```

---

## 2. Automated CI Performance Benchmarking

### 2.1 Frame Budget Allocation Matrix

BioGenesis enforces strict frame time budgets split between CPU simulation (force-field solver, neural compute, vascular network generation, SDF blending) and GPU rendering (Three.js draw calls, shader evaluation, Gray-Scott reaction-diffusion texture updates).

| Metric / Sub-system | 60 FPS Target (Standard) | 120 FPS Target (High Refresh) | CI Regression Failure Threshold |
| :--- | :--- | :--- | :--- |
| **Total Frame Time Budget** | **16.67 ms** | **8.33 ms** | $> 16.67\text{ ms}$ (60 FPS) / $> 8.33\text{ ms}$ (120 FPS) |
| **CPU Simulation Budget** | **5.50 ms** | **2.75 ms** | $> +10\%$ over baseline |
| — *PBD Force-Field Repulsion Solver* | 1.80 ms (`SOLVER_PASSES = 45`) | 0.90 ms | $> 2.50\text{ ms}$ |
| — *Neural Compute & Yerkes-Dodson* | 0.50 ms | 0.25 ms | $> 0.80\text{ ms}$ |
| — *SDF & Organ Blend Evaluation* | 2.20 ms | 1.10 ms | $> 3.00\text{ ms}$ |
| — *Scripting & React Re-renders* | 1.00 ms | 0.50 ms | $> 1.50\text{ ms}$ |
| **GPU Render Budget** | **11.17 ms** | **5.58 ms** | $> +15\%$ over baseline |
| — *Geometry Draw Calls & Shadows* | 6.00 ms | 3.00 ms | $> 7.50\text{ ms}$ |
| — *Bioluminescent Reaction-Diffusion* | 2.50 ms | 1.25 ms | $> 3.50\text{ ms}$ |
| — *Post-Processing / Shaders* | 2.67 ms | 1.33 ms | $> 3.50\text{ ms}$ |
| **Frame Spike Ceiling (p99)** | $< 33.33\text{ ms}$ (1 dropped frame) | $< 16.67\text{ ms}$ (1 dropped frame) | $> 2$ consecutive dropped frames |

### 2.2 CI Performance Runner Architecture

The automated performance suite executes headlessly in CI using Playwright with WebGL passthrough (`--enable-unsafe-webgpu`, `--use-gl=angle` or SwiftShader fallback).

```
 ┌─────────────────────────────────────────────────────────────────────────┐
 │                      Playwright Headless CI Runner                      │
 └────────────────────────────────────┬────────────────────────────────────┘
                                      │
           ┌──────────────────────────┴──────────────────────────┐
           ▼                                                     ▼
┌─────────────────────┐                               ┌─────────────────────┐
│ Frame Time Sampling │                               │ CPU Execution Profil│
│ (PerformanceObserver│                               │ (v8 Profiler API /  │
│  longtask / fps)    │                               │  performance.mark)  │
└──────────┬──────────┘                               └──────────┬──────────┘
           │                                                     │
           └──────────────────────────┬──────────────────────────┘
                                      │
                                      ▼
             ┌──────────────────────────────────────────────────┐
             │ Benchmark Aggregator & Regression Gate Evaluator │
             │  - Calculates p50, p95, p99 frame times          │
             │  - Compares against baseline.json metrics        │
             │  - Triggers failure if p95 exceeds budget by >5% │
             └──────────────────────────────────────────────────┘
```

#### Benchmark Execution Protocol & Test Scenarios:

1. **Scenario 1: Baseline Idle Rendering**
   - **Conditions**: Ship rendered at rest with active Gray-Scott reaction-diffusion surface textures; 1,000 frames sampled continuously.
   - **Target**: Average frame time $\le 12.0\text{ ms}$ (60 FPS mode); zero dropped frames.

2. **Scenario 2: Heavy Organ Drag & Solver Update**
   - **Conditions**: Programmatic dragging of primary heart/gland organ across hull, triggering real-time PBD force-field recalculation (`SOLVER_PASSES = 45`) and dynamic blend bridge mesh regeneration via `BlendBridgeManager`.
   - **Target**: Peak CPU frame time $\le 16.67\text{ ms}$; solver pass duration $\le 1.80\text{ ms}$.

3. **Scenario 3: Maximum Pipeline Complexity**
   - **Conditions**: 30+ organ nodes placed across all 5 anatomical hull sections, 5 habitats, 19 pipeline conduits, active reaction-diffusion DataTextures, and Command Room viewport cut rendered.
   - **Target**: p95 total frame time $\le 15.80\text{ ms}$; GPU memory usage $\le 450\text{ MB}$.

---

## 3. Headless Testing Suites

### 3.1 Organ Intersection & Placement Audit Suite

The PBD force-field solver in `Canvas3D.tsx` enforces spatial separation between organ center points, but actual physical mesh extents (e.g., rib spurs sweeping 2.5m, dangling tentacles) exceed center-point radii. The headless audit suite validates anatomical placement rules and culling layers without requiring a browser instance.

#### 5-Section Anatomical Placement Bands
Organs are strictly bound to their anatomical hull sections along the longitudinal axis $U \in [0.0, 1.0]$:

- **Cranial ($U \in [0.02, 0.15]$)**: Eyes / Ocular Pods, Brain Core, Neural Ganglia.
- **Neck / Upper Trunk ($U \in [0.15, 0.30]$)**: Neural Cluster, Dorsal Sail.
- **Thoracic ($U \in [0.30, 0.65]$)**: Heart, Plasma Gland, Habitats ($U \in [0.32, 0.60]$, offset $V$), Ribs, Spiracles, Pectoral Fins, Landing Limbs.
- **Caudal ($U \in [0.65, 0.85]$)**: Spore Launcher Sacs, Tentacles, Caudal Manifold.
- **Tail Tip ($U \in [0.85, 0.98]$)**: Caudal Fluke, Vent Nozzles.

#### 4-Layer Audit Exclusion Hierarchy

```
                      ┌──────────────────────────────┐
                      │   Organ Intersection Input   │
                      └──────────────┬───────────────┘
                                     │
                                     ▼
        Layer 1: Threading Element? ───(YES)───► [EXCLUDE / PASS]
                     │ (NO)
                     ▼
        Layer 2: Direct Exclusion Pair? ──(YES)──► [EXCLUDE / PASS]
                     │ (NO)
                     ▼
        Layer 3: Anatomical Expected Pair? ──(YES)──► [EXCLUDE / PASS]
                     │ (NO)
                     ▼
        Layer 4: Internal vs Surface Distance Rule ──► Evaluate d > 0.5*(rA + rB)
                     │
                     ├──────(Pass)──────► [EXCLUDE / LEGITIMATE INTERFACE]
                     └──────(Fail)──────► [FLAG GEOMETRY INTERSECTION BUG]
```

1. **Layer 1: Threading Elements** (`isThreadingElement`): Culls conduits, ducts, feeds, lines, tendons, fibers, arteries, veins, and `BlendBridge` mesh geometry from intersection alerts.
2. **Layer 2: Direct Exclusions**: Culls known biological surface/interior structural crossings:
   - Plasma gland $\leftrightarrow$ neural ganglion (nervous system interfaces all organs).
   - Plasma gland $\leftrightarrow$ spiracle / rib / spore / tentacle / ocular (internal vs surface).
   - Spiracle / Ocular Pod / Spore $\leftrightarrow$ habitat (shared hull skin).
3. **Layer 3: Anatomical Expected Pairs** (`isExpectedPair`): Allows natural biological connections:
   - Vertebra + spinal cord, artery + heart, nozzle + cowl, spiracle + rib, brain + neurolink, heart + atrium, gland + bladder, disruptor + plasma trunk, appendage + appendage, vertebra + vertebra, thoracic organs.
4. **Layer 4: Distance-Aware Internal vs Surface Rule**: Internal organs vs surface organs are excluded when center distance $d > 0.5 \times (r_A + r_B)$, where $r_A, r_B$ are bounding sphere radii.

### 3.2 Force-Field Collision Solver Stability Suite

Validates force-field convergence, stability, and bilateral symmetry invariants in `Canvas3D.tsx` and `organPlacement.ts`:

- **Iterative Repulsion Passes**: Enforces `SOLVER_PASSES = 45` iterations during active organ placement.
- **Adaptive Spatial Grid Size**: Verifies $GRID\_SIZE = \text{clamp}(1.5, 4.0, \min(r_{\text{clearance}}) \times 2.0)$.
- **Locked Partner Invariance**: Primary organs (starboard / `sideIdx == 0`) move via force field; locked partners (port / `sideIdx > 0`) receive exact mirrored $V$ ($V_{\text{port}} = 1.0 - V_{\text{starboard}}$) and identical $U$.
- **Convergence Metric**: Flags a solver error if net displacement per organ $\Delta U > 0.001$ after pass 45 (detecting force-field oscillation).

### 3.3 Procedural Mesh & SDF Grid Bounds Suite

Direct headless verification of implicit volume algorithms in `src/utils/`:

- **SDF Range & Continuity** (`src/utils/sdf.ts`): Tests smooth-min blending ($smin(a, b, k)$) across gradient boundaries; verifies zero NaN/Infinity return values for out-of-bounds evaluation coordinates.
- **Marching Cubes Isosurface Extraction** (`src/utils/marchingCubes.ts`): Validates canonical 256-entry Paul Bourke triangle lookup table; checks exported `BufferGeometry` for manifold closure (zero unshared edges) and non-zero normal vectors.
- **Dual Contouring Sharp Feature Preservation** (`src/utils/dualContouring.ts`): Validates Quadratic Error Function (QEF) solver ($A x^* = b$) with Tikhonov regularization ($\epsilon = 10^{-3}$) for crystalline organs (disruptor glands, chitin vertebrae).
- **Subdivision Surface Creases** (`src/utils/subdivision.ts`): Verifies Catmull-Clark dihedral angle crease detection and Taubin shrinkage-free Laplacian smoothing ($\lambda = 0.5, \mu = -0.53$).

---

## 4. Real-time VRAM/RAM Memory Leak Detection

### 4.1 GPU VRAM & Three.js Disposal Audit

Three.js requires explicit GPU resource deallocation. The `VRAMLeakAuditor` class hooks into Three.js rendering loops to audit memory disposal during ship rebuilds and organ mutations.

```typescript
export interface VRAMMemorySnapshot {
  geometries: number;
  textures: number;
  programs: number;
  totalVRAMBytesEstimate: number;
}

export class VRAMLeakAuditor {
  private baselineSnapshot: VRAMMemorySnapshot | null = null;

  public captureSnapshot(renderer: THREE.WebGLRenderer): VRAMMemorySnapshot {
    const info = renderer.info.memory;
    const programs = renderer.info.programs?.length || 0;
    return {
      geometries: info.geometries,
      textures: info.textures,
      programs,
      totalVRAMBytesEstimate: this.estimateVRAMUsage(renderer),
    };
  }

  public setBaseline(snapshot: VRAMMemorySnapshot): void {
    this.baselineSnapshot = snapshot;
  }

  public assertNoLeak(current: VRAMMemorySnapshot, tolerance: number = 0): void {
    if (!this.baselineSnapshot) return;
    if (current.geometries > this.baselineSnapshot.geometries + tolerance) {
      throw new Error(`[VRAM Leak] Geometry count leaked: expected <= ${this.baselineSnapshot.geometries}, got ${current.geometries}`);
    }
    if (current.textures > this.baselineSnapshot.textures + tolerance) {
      throw new Error(`[VRAM Leak] Texture count leaked: expected <= ${this.baselineSnapshot.textures}, got ${current.textures}`);
    }
  }

  private estimateVRAMUsage(renderer: THREE.WebGLRenderer): number {
    const info = renderer.info.memory;
    // Estimate: ~100KB per geometry, ~4MB per DataTexture (1024x1024 RGBA)
    return info.geometries * 102,400 + info.textures * 4,194,304;
  }
}
```

#### Resource Disposal Verification Checklist:
- `geometry.dispose()` called on all replaced SDF/Marching Cubes meshes.
- `material.dispose()` and `texture.dispose()` called on Gray-Scott reaction-diffusion canvas DataTextures.
- **TransformControls Detachment Protocol**: `transformControls.detach()` MUST be invoked BEFORE clearing `shipGroup` children during ship rebuilds. Clearing scene nodes while controls remain attached creates dangling object references and RAF loop null-pointer exceptions.

### 4.2 V8 Engine Heap Snapshot & Retainer Tree Tracking

Automated RAM memory leak detection runs via Node.js / Playwright using `v8.getHeapSnapshot()`:

- **Leak Benchmark**: Programmatically re-render ship and mutate organ chromosomes 500 times.
- **Max Heap Growth Ceiling**: $< 5.0\text{ MB}$ total heap growth after explicit garbage collection (`window.gc()`).
- **Retainer Inspection**: Scans memory retainer graphs for detached `HTMLCanvasElement` nodes, orphaned Three.js `Object3D` instances, and uncleared `requestAnimationFrame` callbacks.

---

## 5. Telemetry Collection & Monitoring Pipeline

### 5.1 Pilot Neuro-Sync Error & Efficiency Curve Tracking

The bio-neural compute model (`src/utils/neuralCompute.ts`) computes brain mass, Encephalization Quotient (EQ), nerve conduction delays, and organ compute efficiency based on the Yerkes-Dodson inverted-U curve.

$$\text{EQ} = \text{clamp}\left(7.0 \times \left(\frac{V_{\text{ref}}}{V_{\text{ship}}}\right)^{1/3}, 3.0, 7.0\right)$$

$$E_{\text{brain}} = 0.12 \times V_{\text{ship}}^{0.67} \times \text{EQ}$$

$$\text{Supply Ratio } r = \frac{\text{Available Compute (bits/s)}}{\text{Total Organ Compute Demand}}$$

#### Yerkes-Dodson Piecewise Efficiency Curve:

$$\eta(r) = \begin{cases} 
0.0 & \text{if } r < 0.25 \quad (\text{Shutdown}) \\
0.20 + 1.20(r - 0.25) & \text{if } 0.25 \le r < 0.50 \quad (\text{Heavy Loss}) \\
0.50 + 1.00(r - 0.50) & \text{if } 0.50 \le r < 1.00 \quad (\text{Linear Ramp}) \\
1.00 & \text{if } 1.00 \le r \le 1.20 \quad (\text{Optimal / Overclocked}) \\
1.00 - 1.50(r - 1.20) & \text{if } r > 1.20 \quad (\text{Excitotoxicity Drop})
\end{cases}$$

```
Efficiency Curve η(r)
 1.20+ ┌───────────────────────────┐ Excitotoxicity Overstimulation (Drop in Efficiency)
       │       /───────────\       │
 1.00  ├──────/─────────────\──────┤ Normal Operational Range (100% Efficiency)
       │     /               \     │
 0.50  ├────/                 \────┤ Heavy Performance Loss (20%-50% Efficiency)
       │   /                       │
 0.25  ├──/                        └── Shutdown State (0% Efficiency / Organ Failure)
       └──┴──────┴──────┴──────┴───
         0.25   0.50   1.00   1.20+   Supply Ratio (r)
```

#### Neuro-Sync Telemetry Error Flags:
- `ERR_NEURAL_SHUTDOWN`: Supply ratio $r < 0.25$ (organ completely unpowered).
- `ERR_NEURAL_STRAIN`: Brain metabolic cost $> 25\%$ of total ship energy budget.
- `ERR_NEURAL_EXCITOTOXICITY`: Supply ratio $r > 1.20$ (overclocked state past safe duration).
- `ERR_AXON_LATENCY_SPIKE`: Conduction delay $> 15\text{ ms}$ along spinal axon cord ($v = 120\text{ m/s}$).

### 5.2 Organ Failure & Metabolic Health Telemetry

Monitors real-time organ operational states:
- **Thermal Overload**: Plasma gland output exceeding heat dissipation capacity ($> 820\text{ W/m}^2$ IR spiracle limit).
- **Vascular Blockage**: Fluid velocity drop below $0.05\text{ m/s}$ in bi-directional vascular loop conduits.
- **Structural Integrity Breach**: Hull mechanical stress exceeding carapace yield tolerance ($> 85\text{ Gy/hr}$ equivalent structural load).

### 5.3 Frame Stutter & Micro-Lag Detection

Telemetry collector records render stutters in real time via high-resolution timing:
- **Frame Stutter Event**: Any individual frame exceeding $24.0\text{ ms}$ (60 FPS mode) or $12.0\text{ ms}$ (120 FPS mode).
- **GC Correlation**: Correlates frame stutters with V8 garbage collection pauses using `PerformanceObserver` entry type `gc`.

### 5.4 End-to-End Telemetry Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Client Telemetry Engine                           │
│  ┌─────────────────────────┐   ┌───────────────────┐   ┌─────────────────┐  │
│  │ NeuroSyncMonitor        │   │ OrganHealthLogger │   │ FrameStutterRec │  │
│  └───────────┬─────────────┘   └─────────┬─────────┘   └────────┬────────┘  │
└──────────────┼───────────────────────────┼──────────────────────┼───────────┘
               │                           │                      │
               └───────────────────────────┼──────────────────────┘
                                           ▼
                        ┌──────────────────────────────────────┐
                        │ RingBufferQueue (Max 1,000 Events)   │
                        └──────────────────┬───────────────────┘
                                           │ (Batched every 5s / Web Worker)
                                           ▼
                        ┌──────────────────────────────────────┐
                        │ Express Telemetry Endpoint           │
                        │ POST /api/telemetry (gzip compressed)│
                        └──────────────────┬───────────────────┘
                                           │
                                           ▼
                        ┌──────────────────────────────────────┐
                        │ TelemetryPanel Dashboard             │
                        │  - Live Neuro-Sync Error Graph       │
                        │  - FPS & Stutter Distribution        │
                        │  - Organ Failure Alert Feed          │
                        └──────────────────────────────────────┘
```

---

## 6. Static Gate Compliance & Continuous Integration Pipeline

### 6.1 Static Code Quality & Type Safety Verification

BioGenesis relies on strict static typing as the primary correctness gate:
- **Type Checker**: `tsc --noEmit` (Must pass with 0 errors).
- **Production Build**: `vite build` (Must complete clean bundle generation).
- **Headless Symmetry Suite**: `npx tsx src/tests/symmetryTest.ts` (Validates bounding box and V-coordinate mirror alignment).

### 6.2 GitHub Actions Automated CI Workflow (`.github/workflows/ci.yml`)

```yaml
name: BioGenesis AAA+ QA & Profiling CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  static-gate:
    name: Static Type & Build Gate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - name: TypeScript Static Check
        run: npx tsc --noEmit
      - name: Production Bundle Build
        run: npm run build
      - name: Headless Symmetry Test Suite
        run: npx tsx src/tests/symmetryTest.ts

  performance-benchmark:
    name: 60/120 FPS Performance & VRAM Leak Audit
    needs: static-gate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - name: Install Playwright & Browsers
        run: npx playwright install --with-deps chromium
      - name: Run Headless WebGL Performance Benchmarks
        run: npx tsx src/tests/perfBenchmark.ts
      - name: Run VRAM & Heap Memory Leak Audit
        run: npx tsx src/tests/memoryLeakAudit.ts
```

---

## 7. Summary Table of Technical Specifications

| Domain / Sub-system | Key Parameter / Rule | Target Specification | Automated Verification Suite |
| :--- | :--- | :--- | :--- |
| **60 FPS Budget** | Total Frame Time | $\le 16.67\text{ ms}$ (11.17ms GPU, 5.50ms CPU) | Playwright Performance Benchmark Runner |
| **120 FPS Budget** | Total Frame Time | $\le 8.33\text{ ms}$ (5.58ms GPU, 2.75ms CPU) | Playwright Performance Benchmark Runner |
| **Frame Spike Ceiling** | p99 Spike Ceiling | $< 33.33\text{ ms}$ (60 FPS) / $< 16.67\text{ ms}$ (120 FPS) | Playwright Performance Benchmark Runner |
| **PBD Force Solver** | Pass Count & Grid Size | `SOLVER_PASSES = 45`, $GRID\_SIZE \in [1.5, 4.0]$ | Headless Solver Stability Suite |
| **Organ Placement** | 5 Hull Bands | Cranial, Neck, Thoracic, Caudal, Tail Tip | Organ Intersection Audit Suite |
| **Exclusion Culling** | 4 Exclusion Layers | Threading $\to$ Direct $\to$ Expected $\to$ Distance | Organ Intersection Audit Suite |
| **VRAM Leak Detection** | Disposable Resources | 0 leaked geometries/textures on ship rebuild | Three.js `VRAMLeakAuditor` (`renderer.info`) |
| **RAM Leak Detection** | V8 Heap Growth | $< 5.0\text{ MB}$ heap growth across 500 cycles | V8 Heap Snapshot Comparison (`v8.getHeapSnapshot`) |
| **Controls Safety** | TransformControls | Detached prior to `shipGroup.clear()` | Memory & Render Loop Audit |
| **Neuro-Sync Error** | Yerkes-Dodson Curve | Supply ratio $r \in [0.50, 1.20]$ optimal | Client Telemetry Ring Buffer (`/api/telemetry`) |
| **Telemetry Buffer** | Event Ring Buffer | Capacity 1,000 events, 5s gzip batch POST | Express Telemetry Endpoint & Dashboard |
| **Static Type Gate** | TypeScript Strictness | `tsc --noEmit` exit code 0 (0 errors) | CI Static Gate Pipeline |

---
*Specification approved by Subagent J (QA Automation, Telemetry & Audit Master Lead) — Loop 2 AAA+ Swarm.*
