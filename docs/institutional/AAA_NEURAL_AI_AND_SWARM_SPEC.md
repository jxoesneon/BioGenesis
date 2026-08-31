# AAA+ Neural AI, Swarm Intelligence & Dialogue Systems Specification

> **Institutional Engineering Specification — BioGenesis Core Engine**  
> **Document Identifier**: `BIO-SPEC-2026-NEURAL-AI`  
> **Status**: Approved AAA+ Specification  
> **Author**: Subagent D (Neural AI, Swarm & Dialogue Systems Lead) & Ciel (Lord of Wisdom)  
> **Target Stack**: TypeScript · React 19 · Three.js · Vite 6 · WebGL/WebGPU · Express · `@google/genai`  
> **Primary References**: Reynolds (1987), Orkin (2006) [FEAR GOAP], Mark (2009) [Behavior Mathematics], Isla (2005) [Halo 2 AI], Jerison (1973), Sterling & Laughlin (2015), BioGenesis `LORE.md` & `ORGAN_SYSTEMS.md`

---

## Executive Summary & Document Scope

This document specifies the institutional-level software architecture, mathematical models, state machine specifications, data structures, and runtime pipelines for the **BioGenesis Neural AI, Swarm Intelligence, Away-Team Tactical Combat, and Neuro-Link Dialogue Systems**. 

BioGenesis is a biopunk space exploration, organic starship simulation, and away-team interior boarding game. Its AI requirements span macroscopic 3D fluidic space combat involving thousands of autonomous Void-Fauna organisms down to microscopic interior boarding actions inside pulsing vascular corridors, alongside an emotionally reactive, telemetry-driven pilot-ship neural voice symbiosis.

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                             BIOGENESIS AAA+ AI ARCHITECTURE                             │
├───────────────────────────────────┬─────────────────────────────────────────────────────┤
│ 1. Hive-Mind Swarm Coordination   │ 3D Reynolds Boids + Spatial Hash + Emergent Tactics │
│ 2. Utility AI & GOAP              │ Biological Drives + Bitmask A* Plan Solver          │
│ 3. Tactical Away-Team Boarding AI │ Volumetric Corridor Graph + Soft Biological Cover   │
│ 4. Neuro-Link LLM & Dialogue      │ Hybrid Local Wasm LLM + Cloud Gemini (@google/genai)│
│ 5. Adaptive Epigenetic Evolution  │ Rolling Combat Telemetry + Dynamic Phenotypes       │
└───────────────────────────────────┴─────────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> **Foundational Mandates**:
> 1. **Zero Garbage Collection Allocation in 60 FPS Loops**: All Boids vector evaluations, spatial hash re-indexing, and GOAP node expansions must operate on static array buffers and typed primitive arrays.
> 2. **Physiological AI Coupling**: AI behavior is strictly bound to organ health, hemolymph pressure, and compute budget derived from Jerison's Allometric Scaling ($E = 0.12 \cdot P^{0.67} \cdot \text{EQ}$). Organ destruction MUST dynamically mutate the AI's action space.
> 3. **Non-Blocking Dialogue Execution**: Voice and text synthesis must execute asynchronously via Web Workers, with local sub-40ms Wasm fallback and immediate biological audio stingers masking network latency during cloud inference calls.

---

## 1. Executive Summary & AI Ecosystem Architecture

### 1.1 Five Core AI Pillars

The BioGenesis AI ecosystem is built on five interconnected subsystem pillars:

1. **3D Hive-Mind Swarm Coordination**: Animates 2,000+ Void-Fauna organisms in 6-DOF bio-fluidic space using an $O(N)$ 3D Spatial Hash Grid and an expanded 5-vector 3D Reynolds Boids formulation, executing 4 emergent tactical formations (*Phalanx*, *Pincer*, *Spiral Vortex*, and *Bio-Shield Envelope*).
2. **Biological Utility AI & GOAP Action Planner**: Evaluates continuous physiological drive curves ($U_{\text{hunger}}, U_{\text{pressure}}, U_{\text{threat}}, U_{\text{plasma}}$) to trigger goal-oriented action sequences resolved via a bitmask-accelerated A* search graph. Organ damage instantly invalidates action preconditions.
3. **Tactical Boarding Away-Team AI**: Manages interior combat within non-Euclidean vascular tunnels using a 3D Volumetric Navmesh, dynamic line-of-sight occlusion through degradable soft biological cover (mucus sacks, pulsing tissue), and 3 squad roles (*Breacher*, *Suppressor*, *Corruptor*).
4. **Dynamic Neuro-Link Dialogue Engine**: Provides the living ship's voice through a hybrid local/cloud architecture combining a local WebLLM (Llama-3.2-1B Wasm, $<40\text{ms}$ latency) for combat alerts with `@google/genai` (Gemini 2.5 Flash) for deep narrative interaction. Voice characteristics scale dynamically with Synaptic Sync ($S_{\text{sync}} \in [0\%, 100\%]$).
5. **Adaptive Epigenetic Evolution Engine**: Monitors player combat telemetry vector $\mathbf{T}_{\text{player}}$ across wave cycles and executes a real-time genetic algorithm to spawn counter-mutated enemy phenotypes (e.g., *Thermal Refractory Carapace* against plasma dominance; *Caudal Hydro-Jets* against long-range kiting).

### 1.2 System Integration Architecture

```
                                 ┌──────────────────────────────┐
                                 │     GAME LOOP / ENGINE       │
                                 │  Telemetry & Physics (60Hz) │
                                 └──────────────┬───────────────┘
                                                │
                 ┌──────────────────────────────┼──────────────────────────────┐
                 ▼                              ▼                              ▼
    ┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
    │ 3D SWARM BOIDS SOLVER    │   │ UTILITY AI & GOAP        │   │ TACTICAL BOARDING ENGINE │
    │ - 3D Spatial Hash Grid   │   │ - Drive Curves U(x)      │   │ - Volumetric Navmesh     │
    │ - 5 Force Vectors        │   │ - Bitmask A* Action Graph│   │ - Soft Biological Cover  │
    │ - Formations Engine      │   │ - Organ Damage Overrides │   │ - Squad Role Execution   │
    └────────────┬─────────────┘   └────────────┬─────────────┘   └────────────┬─────────────┘
                 │                              │                              │
                 └──────────────────────────────┼──────────────────────────────┘
                                                │
                                                ▼
                                 ┌──────────────────────────────┐
                                 │ NEURAL COMPUTE ENGINE        │
                                 │ - Haller's Rule EQ Scaling   │
                                 │ - Yerkes-Dodson Efficiency   │
                                 │ - Segmental Ganglion Chain   │
                                 └──────────────┬───────────────┘
                                                │
                 ┌──────────────────────────────┴──────────────────────────────┐
                 ▼                                                             ▼
    ┌──────────────────────────┐                                  ┌──────────────────────────┐
    │ NEURO-LINK DIALOGUE      │                                  │ ADAPTIVE EVOLUTION ENGINE│
    │ - Hybrid Local/Cloud LLM │                                  │ - Combat Telemetry T     │
    │ - Prompt Telemetry Inject│                                  │ - Phenotype GA Solver    │
    │ - Audio Stinger Pipeline │                                  │ - Counter-Mutation Rules │
    └──────────────────────────┘                                  └──────────────────────────┘
```

### 1.3 Neural Compute Architecture Foundation

BioGenesis AI behaviors do not exist in a vacuum; they draw compute budget directly from the ship's physiological **Neural Compute System**.

#### Brain Scaling (Jerison Allometry & Haller's Rule)
Brain mass $E$ scales with ship hull volume $P$ according to Jerison's power law, while Encephalization Quotient (EQ) follows Haller's Rule (smaller living ships have proportionally larger brains relative to their mass):

$$P = \text{Hull Volume } (m^3) \approx L \cdot w_{\text{thorax}}^2 \cdot \pi \cdot f_{\text{fill}}$$

$$\text{EQ} = \text{clamp}\left( 7.0 \cdot \left( \frac{V_{\text{ref}}}{P} \right)^{1/3}, 3.0, 7.0 \right), \quad V_{\text{ref}} \approx 108.6\,m^3$$

$$E = 0.12 \cdot P^{0.67} \cdot \text{EQ} \quad (\text{kg})$$

$$\text{Compute Generation } C_{\text{brain}} = E \cdot \rho_{\text{neuron}} \cdot b_{\text{neuron}} \quad (\text{bits/s})$$

where $\rho_{\text{neuron}} = 86 \times 10^9 \text{ neurons/m}^3$ and $b_{\text{neuron}} = 5 \text{ bits/s/neuron}$.

| Ship Length | Volume $P$ | EQ | Brain % Energy | Character & Mutualism Archetype |
|---|---|---|---|---|
| 6m | $\sim 109\,m^3$ | 7.0 | $\sim 20\%$ | Strained, hyper-reactive; requires human pilot for strategic goal direction |
| 10m | $\sim 302\,m^3$ | 5.1 | $\sim 15\%$ | Balanced mutualist |
| 14m (Default) | $\sim 586\,m^3$ | 4.1 | $\sim 12\%$ | Highly capable, values pilot tactical focus |
| 20m | $\sim 1200\,m^3$ | 3.3 | $\sim 9\%$ | Autonomous biopunk frigate |
| 30m+ | $\sim 2700\,m^3$ | 3.0 | $\sim 8\%$ | Hive Apex Leviathan; pilot provides ethical link and fine neuro-control |

#### Yerkes-Dodson Inverted-U Efficiency Curve
Organ execution efficiency $\eta_{\text{organ}}$ is governed by the ratio of compute supply to compute demand $r = C_{\text{supply}} / C_{\text{demand}}$:

$$\eta_{\text{organ}}(r) = \begin{cases}
0.0 & r < 0.25 \quad (\text{Shutdown}) \\
0.20 + 0.60 \cdot \frac{r - 0.25}{0.25} & 0.25 \le r < 0.50 \quad (\text{Heavy Loss}) \\
0.50 + 0.50 \cdot \frac{r - 0.50}{0.50} & 0.50 \le r < 1.00 \quad (\text{Linear Ramp}) \\
1.00 + 1.00 \cdot \frac{r - 1.00}{0.20} & 1.00 \le r \le 1.20 \quad (\text{Overclocked}) \\
\max\left(0.50, 1.20 - 0.70 \cdot \frac{r - 1.20}{0.80}\right) & r > 1.20 \quad (\text{Overstimulated Excitotoxicity})
\end{cases}$$

```
Organ Efficiency η(r):
 1.20 ┼                                    ╭───╮ (Overclock Zone: 100% - 120%)
 1.00 ┼                              ╭─────╯   ╰──────╮
      │                        ╭─────╯                ╰───── 0.50 (Excitotoxicity Floor)
 0.50 ┼                  ╭─────╯
 0.20 ┼            ╭─────╯
 0.00 ┼───(Shutdown)──┴──────────────────────────────────────► Compute Supply Ratio r
     0.0          0.25        0.50        1.00  1.20    2.00
```

> [!NOTE]
> **Nerve Wire Cost & Branching Optimization**: Nerve conduction follows myelinated axon velocity $v_{\text{cond}} = 120\text{ m/s}$. Nerve branching conforms to **Murray's Law** ($d_0^2 = d_1^2 + d_2^2$) with an optimal branching angle $\theta_{\text{branch}} \approx 83^\circ$. Wire cost follows Chklovskii's volume-delay trade-off model: $W_{\text{cost}} = \sum L^2 \cdot d^2$.

---

## 2. 3D Boids Swarm Coordination & Spatial Hash Grid

### 2.1 3D Bio-Fluidic Reynolds Boids Solver

Void-Fauna organisms (Abyssal Swarmers, Caudal Hunters, Spore Drones) operate in 3D space with 6 degrees of freedom. The acceleration vector for unit $i$ is calculated by summing 5 primary force vectors:

$$\mathbf{F}_{\text{total}} = w_s \mathbf{F}_{\text{separation}} + w_a \mathbf{F}_{\text{alignment}} + w_c \mathbf{F}_{\text{cohesion}} + w_o \mathbf{F}_{\text{obstacle}} + w_t \mathbf{F}_{\text{target}} + w_b \mathbf{F}_{\text{bio-turbulence}}$$

$$\frac{d\mathbf{v}_i}{dt} = \text{clamp}_{\text{force}}\left( \frac{\mathbf{F}_{\text{total}}}{m_i}, \mathbf{a}_{\text{max}} \right), \quad \mathbf{v}_i^{(t+\Delta t)} = \text{clamp}_{\text{vel}}\left( \mathbf{v}_i^{(t)} + \frac{d\mathbf{v}_i}{dt} \Delta t, v_{\text{max}} \right)$$

```
                           [Target Vector Ft]
                                   ▲
                                   │
      [Cohesion Fc] ──►     ( Void-Fauna ) ◄── [Alignment Fa]
                             ▲     ▲
                             │     │
       [Separation Fs] ──────┘     └────── [Obstacle Avoidance Fo (Hull SDF)]
```

#### Mathematical Force Definitions

1. **Inverse-Square Soft-Body Separation ($\mathbf{F}_s$)**:
   $$\mathbf{F}_s = \sum_{j \in N_i, j \neq i} \frac{\mathbf{p}_i - \mathbf{p}_j}{\|\mathbf{p}_i - \mathbf{p}_j\|^3} \cdot \max\left( 0, r_{\text{clearance}} - \|\mathbf{p}_i - \mathbf{p}_j\| \right)$$

2. **Organ-Efficiency Modulated Alignment ($\mathbf{F}_a$)**:
   $$\mathbf{F}_a = \left( \frac{1}{|N_i|} \sum_{j \in N_i} \mathbf{v}_j - \mathbf{v}_i \right) \cdot \eta_{\text{neural}}$$

3. **Center-of-Mass Cohesion ($\mathbf{F}_c$)**:
   $$\mathbf{F}_c = \left( \frac{1}{|N_i|} \sum_{j \in N_i} \mathbf{p}_j \right) - \mathbf{p}_i - \mathbf{v}_i$$

4. **Analytic Hull SDF Obstacle Avoidance ($\mathbf{F}_o$)**:
   Using the ship hull Signed Distance Field `buildHullSDF(p)`:
   $$\mathbf{F}_o = -\nabla \text{SDF}(\mathbf{p}_i) \cdot \exp\left( -\alpha \cdot \text{SDF}(\mathbf{p}_i) \right)$$
   where $\nabla \text{SDF}(\mathbf{p}_i)$ is calculated via central differences:
   $$\nabla \text{SDF}(\mathbf{p}) \approx \frac{1}{2\epsilon} \begin{bmatrix} \text{SDF}(\mathbf{p} + \epsilon \hat{\mathbf{x}}) - \text{SDF}(\mathbf{p} - \epsilon \hat{\mathbf{x}}) \\ \text{SDF}(\mathbf{p} + \epsilon \hat{\mathbf{y}}) - \text{SDF}(\mathbf{p} - \epsilon \hat{\mathbf{y}}) \\ \text{SDF}(\mathbf{p} + \epsilon \hat{\mathbf{z}}) - \text{SDF}(\mathbf{p} - \epsilon \hat{\mathbf{z}}) \end{bmatrix}$$

5. **Simplex 3D Bio-Turbulence ($\mathbf{F}_b$)**:
   Simulates thruster plume turbulence and organic bio-fluid pulsation:
   $$\mathbf{F}_b = \mathbf{n}_{\text{simplex3D}}\left( \mathbf{p}_i \cdot k_{\text{spatial}} + t \cdot \omega_{\text{pulse}} \right)$$

### 2.2 Spatial Acceleration: 3D Spatial Hash Grid ($O(N)$ Neighbor Queries)

Linear $O(N^2)$ neighbor evaluations are replaced by a **3D Spatial Hash Grid** supporting 2,000+ active units at 60 FPS in WebGL/Three.js.

#### Spatial Hash Function
The 3D space is discretized into cubic cells of dimension $S = r_{\text{search}}$. The spatial coordinate $(x,y,z)$ maps to cell indices $(c_x, c_y, c_z) = (\lfloor x/S \rfloor, \lfloor y/S \rfloor, \lfloor z/S \rfloor)$. The hash key $H(c_x, c_y, c_z)$ is generated using large prime multipliers:

$$H(x,y,z) = \left( (c_x \cdot 73856093) \oplus (c_y \cdot 19349663) \oplus (c_z \cdot 83492791) \right) \pmod{M_{\text{table}}}$$

```
Spatial Grid Indexing (Cell Size S):
  World Position (x,y,z) ──► Cell (cx, cy, cz) ──► Hash Key H ──► Bucket Array
```

#### Performance Comparison Matrix

| Structure | Neighbor Query | Memory Footprint | Grid Rebuild Cost | WebGL / Worker Suitability |
|---|---|---|---|---|
| Naive Pairwise | $O(N^2)$ | $O(N^2)$ | $O(0)$ | Unusable for $N > 300$ |
| 3D Octree | $O(N \log N)$ | $O(N \log N)$ | $O(N \log N)$ | High pointer overhead, GC churn |
| **3D Spatial Hash Grid** | **$O(N)$ expected** | **$O(N + M)$** | **$O(N)$ flat array** | **Ideal — zero allocation via TypedArrays** |

#### TypedArray Flat Memory Buffer Layout

```typescript
export class SpatialHashGrid3D {
  private cellSize: number;
  private tableSize: number;
  private cellHeaders: Int32Array; // Size M: index of first unit in cell (-1 if empty)
  private nextUnitIndex: Int32Array; // Size N: linked-list pointer to next unit in cell

  constructor(tableSize: number = 4096, maxUnits: number = 4096, cellSize: number = 15.0) {
    this.cellSize = cellSize;
    this.tableSize = tableSize;
    this.cellHeaders = new Int32Array(tableSize);
    this.nextUnitIndex = new Int32Array(maxUnits);
  }

  public rebuild(positions: Float32Array, unitCount: number): void {
    this.cellHeaders.fill(-1);
    for (let i = 0; i < unitCount; i++) {
      const x = Math.floor(positions[i * 3 + 0] / this.cellSize);
      const y = Math.floor(positions[i * 3 + 1] / this.cellSize);
      const z = Math.floor(positions[i * 3 + 2] / this.cellSize);
      const hash = (Math.abs((x * 73856093) ^ (y * 19349663) ^ (z * 83492791))) % this.tableSize;

      this.nextUnitIndex[i] = this.cellHeaders[hash];
      this.cellHeaders[hash] = i;
    }
  }
}
```

### 2.3 Emergent Tactical Swarm Formations

The swarm controller dynamically adjusts unit target positions $\mathbf{p}_{\text{target}, i}$ to force emergent tactical shapes:

```
   [PHALANX FORMATION]            [PINCER FLANK]             [SPIRAL VORTEX]
   Frontal Heavy Armor         Two Converging Wings       Orbiting Plasma Storm

       ▲  ▲  ▲  ▲                  ▲          ▲                    ╭───╮
      ┌┴──┴──┴──┴┐                 │          │                   │ ↺  │
      │  Chitin  │            ┌────┴┐    ┌────┴┐                  └───╯
      │ Shielders│            │ Wing│    │ Wing│               ┌─────────┐
      └──────────┘            └─────┘    └─────┘               │ Target  │
                                 \        /                    └─────────┘
                                  \      /                        ↺ ↺ ↺
                                 [Player]
```

1. **Phalanx (Shield Wall)**: Heavy Chitin Carapace units arrange at the front of the swarm ($u \in [0.0, 0.2]$ relative to target vector $\hat{\mathbf{d}}$), absorbing bio-plasma projectiles while delicate Spore Spitters shelter behind them.
2. **Pincer Flank**: Swarm splits into dual wings along orthogonal vectors $\mathbf{n}_{\text{left}} = \hat{\mathbf{d}} \times \hat{\mathbf{up}}$ and $\mathbf{n}_{\text{right}} = -\mathbf{n}_{\text{left}}$, encircling player thruster nozzles to cut off retreat.
3. **Spiral Vortex**: Units enter logarithmic spiral orbits around the target ship:
   $$r(\theta) = a \cdot e^{b\theta}, \quad z(\theta) = z_0 + v_z \cdot t$$
   This maintains rolling bio-plasma barrage coverage while avoiding friendly crossfire.
4. **Bio-Shield Envelope**: Swarm organisms physically sacrifice body mass by clustering around the Hive Apex Leviathan, reducing incoming damage by acting as living reactive armor.

### 2.4 Dynamic Leader Selection & Synaptic Signal Propagation

Swarm command uses a decentralized, self-healing node hierarchy:

```
[Hive Apex Leviathan] ─── Synaptic Pulse (v = 45 m/s, γ = 0.05/m) ───► [Sub-Node Alpha]
        │                                                                   │
        ├─── Direct Link (Blocked by EMP / Cloud) ─x                         ├──► Swarmer 1
        │                                                                   ├──► Swarmer 2
        └──► [Sub-Node Beta (Promoted dynamically on Alpha death)] ─────────┴──► Swarmer 3
```

- **Leader Selection Metric**:
  $$S_{\text{leader}}(i) = w_1 \cdot \text{Mass}_i + w_2 \cdot \text{EQ}_i + w_3 \cdot R_{\text{signal}, i} - w_4 \cdot \text{Damage}_i$$
- **Synaptic Signal Propagation**:
  Commands travel outward from the Hive Apex at conduction speed $v_{\text{synapse}} = 45\text{ m/s}$. Signal intensity attenuates with distance $d$:
  $$I_{\text{signal}}(d) = I_0 \cdot e^{-\gamma d}, \quad \gamma = 0.05\text{ m}^{-1}$$
- **Leader Death Fallback**: If the Apex is destroyed, the swarm enters a $1.2\text{s}$ **Synaptic Shock** (disarray state, random boids velocity jitter), after which the surviving unit with the highest $S_{\text{leader}}$ assumes command, restoring formation cohesion.

---

## 3. Utility AI & Goal-Oriented Action Planning (GOAP)

### 3.1 Utility AI Scoring Curves for Biological Drives

Each organism evaluates its internal physiological state using continuous mathematical response curves $U(x) \in [0.0, 1.0]$.

```
Utility Scores:
 1.0 ┼                                      ─── U_threat (Exponential)
     │                                    ──
     │                                ───
 0.5 ┼ ─────────── U_hunger (Sigmoid)
     │        ───
 0.0 ┼─────────┴─────────────────────────────────────────► Drive Parameter x
```

#### Drive Formulas

1. **Biomass Hunger ($U_{\text{hunger}}$)** — Logistic Sigmoid:
   $$U_{\text{hunger}}(x) = \frac{1}{1 + e^{-k_h(x - x_{\text{half}})}}, \quad k_h = 8.0, \; x_{\text{half}} = 0.40 \text{ (Biomass Reserve)}$$

2. **Hemolymph Hydraulic Pressure ($U_{\text{pressure}}$)** — Linear Clamp:
   $$U_{\text{pressure}}(P) = 1.0 - \text{clamp}\left( \frac{P - P_{\text{min}}}{P_{\text{max}} - P_{\text{min}}}, 0.0, 1.0 \right)$$

3. **Threat Assessment ($U_{\text{threat}}$)** — Quadratic Velocity-Modulated Exponential:
   $$U_{\text{threat}}(D, \mathbf{V}) = \text{clamp}\left( \left(\frac{R_{\text{detect}} - D}{R_{\text{detect}}}\right)^2 \cdot \left(1.0 + \frac{\mathbf{V}_{\text{player}} \cdot \hat{\mathbf{r}}}{v_{\text{max}}}\right), 0.0, 1.0 \right)$$

4. **Bio-Plasma Reservoir Charge ($U_{\text{plasma}}$)** — Logarithmic Saturation:
   $$U_{\text{plasma}}(C) = \frac{\ln(1.0 + 9.0 \cdot C)}{\ln(10.0)}$$

### 3.2 GOAP Architecture & Bitmask Action Graph

When a utility drive exceeds activation threshold ($U > 0.65$), GOAP triggers an A* graph search to form an optimal plan.

#### Packed Bitmask `WorldState`
To eliminate object allocation during A* expansion, world states are packed into 32-bit unsigned integers alongside a lightweight quantitative state tuple:

```typescript
export interface PackedWorldState {
  // Bitmask flags for ultra-fast bitwise precondition evaluation
  // Bit 0: HasTarget | Bit 1: TargetInRangedRange | Bit 2: TargetInMeleeRange
  // Bit 3: BioPlasmaCharged | Bit 4: HemolymphLow | Bit 5: CoverAvailable
  // Bit 6: PlasmaGlandIntact | Bit 7: GasGlandIntact | Bit 8: NearDeadAlly
  flags: number;

  // Quantitative state metrics
  biomass: number;       // [0.0, 1.0]
  plasmaReserve: number; // [0.0, 1.0]
  healthPct: number;     // [0.0, 1.0]
  threatDistance: number;// meters
}
```

#### GOAP Action Graph & Precondition Matrix

```
[WorldState: Low Health, High Threat]
                │
                ▼
      ┌──────────────────┐
      │ Action: Seek Cover│ (Cost: 1.5, Precondition: CoverAvailable)
      └────────┬─────────┘
               │
               ▼
    ┌──────────────────────┐
    │ Action: Vent Bio-Gas │ (Cost: 2.0, Precondition: GasGlandIntact)
    └───────────┬──────────┘
                │
                ▼
    ┌──────────────────────┐
    │Action: Regrow Carapace│ (Cost: 4.0, Precondition: Biomass > 0.3)
    └──────────────────────┘
```

| Action | Required Bitmask Preconditions | Applied Bitmask & Metric Effects | Base Cost | Dynamic Heuristic Multiplier |
|---|---|---|---|---|
| `ChargeBioPlasma` | `PlasmaGlandIntact`, `PlasmaReserve < 0.8` | `BioPlasmaCharged = true`, `PlasmaReserve + 0.5` | 2.0 | $1.0 / U_{\text{plasma}}$ |
| `RangedBioSpit` | `BioPlasmaCharged = true`, `TargetInRangedRange` | `TargetDamaged = true`, `BioPlasmaCharged = false` | 1.0 | $1.0$ |
| `FlankEngage` | `HasTarget`, `CoverAvailable` | `TargetInMeleeRange = true`, `FlankPositionSecured` | 2.5 | $2.0 - U_{\text{threat}}$ |
| `VentMucusCloud` | `GasGlandIntact`, `ThreatDistance < 15m` | `InSmokeCover = true`, `PlayerLineOfSightBlocked` | 1.5 | $0.5$ (Emergency escape) |
| `CannibalizeBiomass` | `NearDeadAlly`, `Biomass < 0.5` | `Biomass + 0.4`, `Health + 0.25` | 3.0 | $1.0 / U_{\text{hunger}}$ |

#### A* Action Plan Solver Algorithm

The A* solver evaluates total cost $f(n) = g(n) + h(n)$, where $g(n)$ is accumulated action cost and $h(n)$ is the bit-distance heuristic (popcount of missing target bits):

$$h(\text{state}) = \text{popcount}\left( \text{goal.flags} \text{ AND NOT } \text{state.flags} \right)$$

### 3.3 HFSM / Behavior Tree Micro-Integration

GOAP operates on macro action selection (1-5s horizon), handing execution to a **Hierarchical Finite State Machine (HFSM)** for micro-frame procedural animation, sphincter twitching, and bio-gland venting:

```
                           ┌────────────────────────┐
                           │      GOAP SOLVER       │
                           │  (Macro Plan Selector) │
                           └───────────┬────────────┘
                                       │ Active Action: RangedBioSpit
                                       ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                         HFSM MICRO-STATE MACHINE                            │
 │                                                                             │
 │  ┌──────────────┐     Spiracle Open     ┌────────────────┐   Plasma Full    │
 │  │ Venting Gills├──────────────────────►│ Distend Throats├──────────────┐  │
 │  └──────────────┘                       └────────────────┘              │  │
 │         ▲                                                               ▼  │
 │         │                       Contract Sphincter               ┌────────┴┐│
 │         └────────────────────────────────────────────────────────┤ Bio-Spit││
 │                                                                  └─────────┘│
 └─────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Organ Damage Modulation of Utility Scoring & Preconditions

When internal ship organs are destroyed, the AI engine modifies its action graph:

```
[Organ Damage Detected: Plasma Gland Destroyed]
               │
               ├─► Set Action Precondition: PlasmaGlandIntact = FALSE
               ├─► Zero Utility Weight: W_plasma = 0.0
               └─► Recalculate Drive Weights: W_threat *= 2.5, W_flee *= 3.0
```

- **Plasma Gland Destroyed**: `PlasmaGlandIntact` set to `false`. Ranged attacks are disabled; unit switches to suicidal melee ramming or emergency biomass consumption.
- **Neural Ganglion Severed**: Conduction latency increases $+500\text{ms}$; flocking alignment weight drops to $0.0$ (erratic movement).
- **Spiracle Gill Vent Clogged**: Internal fluid temperature spikes; unit enters emergency heat-venting state, exposing its soft internal core.

---

## 4. Tactical AI for Away-Team Boarding Actions

### 4.1 3D Volumetric Navmesh & Corridor Spatial Graph

Away-team boarding occurs inside organic, pulsating vascular tunnels and habitat chambers. Traditional planar 2D navmeshes cannot handle 6-DOF wall-crawling drones, fluid drag, or dynamic sphincter doors.

```
       VASCULAR CORRIDOR SPATIAL GRAPH & VOLUMETRIC NAVMESH
       
       [Node 1: Cranial Junction]
                  │   R_tunnel = 4.2m, FlowVec = (0, 0, 0.5)
                  ▼
       [Node 2: Vascular Valve] ◄─── Sphincter Doorway (State: Open/Pulsing)
                  │   R_tunnel = 2.8m, WallSurface = Chitin Ribs
                  ▼
       [Node 3: Thoracic Cavity] ─── Spatial Cover Nodes (Soft Mucus / Ribs)
```

```typescript
export interface CorridorNode {
  id: string;
  position: THREE.Vector3;
  radius: number;                 // Cross-sectional tunnel radius
  fluidVelocity: THREE.Vector3;   // Hemolymph drag vector
  isSphincterDoor: boolean;
  sphincterState: 'open' | 'contracting' | 'closed';
  coverNodes: CoverPoint[];
  wallNormals: THREE.Vector3[];   // Surface normal vectors for wall-crawling
}

export interface CoverPoint {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  type: 'chitin_rib' | 'mucus_sack' | 'pulsing_organ' | 'bone_spur';
  destructible: boolean;
  health: number;
  occlusionFactor: number;        // 0.0 (transparent) to 1.0 (fully opaque)
}
```

### 4.2 Dynamic Line-of-Sight & Biological Soft Cover

Boarding defense units evaluate target visibility using density-weighted raycasts through soft biological cover:

```
[Player FPS Raycast] ───► [Mucus Sack Cover (Occlusion: 0.85)] ───► [AI Defender]
                                      │
                                  Absorbs 150 Damage
                                      │
                                      ▼
                        [Cover Ruptures / Acid Burst!]
```

- **Raycast Density Occlusion**:
  $$I_{\text{vis}} = I_0 \cdot \prod_{k \in \text{Obstacles}} \left( 1.0 - \text{occlusionFactor}_k \right)$$
- **Wall-Crawling Flank Coordinate Transformation**:
  $$\mathbf{P}_{\text{flank}} = \mathbf{P}_{\text{target}} + R_{\text{tunnel}} \cdot \left( \cos\phi \cdot \mathbf{u}_{\text{wall}} + \sin\phi \cdot \mathbf{v}_{\text{wall}} \right)$$

### 4.3 Squad Roles & Away-Team Coordination

Boarding defense squads operate with 3 tactical roles:

```
                 ┌────────────────────────────────┐
                 │      SQUAD LEADER (BRAIN)      │
                 │   Assigns Vectors & Targets    │
                 └───────────────┬────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│   BREACHER       │    │   SUPPRESSOR     │    │   CORRUPTOR      │
│ Heavy Chitin Hull│    │ Rapid Acid Spit  │    │ Spores / Bladder │
│ Wall-crawl Front │    │ Suppresses Player│    │ Environmental    │
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

1. **Breacher**: Heavy armored chitin unit; crawls walls and ceilings to bypass player traps, dropping down behind player positions.
2. **Suppressor**: Anchors at choke points; fires continuous acid spray to pin the player behind cover.
3. **Corruptor**: Targets internal environmental hazards (rupturing acid bladders, electrifying ganglia) to turn the corridor into a hazard zone.

---

## 5. Dynamic Neuro-Link AI Personality & Dialogue

### 5.1 Hybrid Dialogue Pipeline: Local LLM + `@google/genai` Gemini API

The living ship's voice uses a hybrid pipeline to deliver instant combat responses while supporting narrative interactions:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        NEURO-LINK DIALOGUE ENGINE PIPELINE                              │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  [Ship Telemetry State]                                                                 │
│  (Health, Synaptic Sync, Energy, Crew Sanity)                                           │
│         │                                                                               │
│         ▼                                                                               │
│  ┌──────────────┐      Sync > 80% & Cloud Online?                                       │
│  │ Router Node  ├─────────────────────────────────────────────┐                         │
│  └──────┬───────┘                                             │                         │
│         │ NO (Low Latency / Offline)                          │ YES (Deep Dialogue)     │
│         ▼                                                     ▼                         │
│  ┌──────────────────────────────┐              ┌─────────────────────────────┐          │
│  │ Local Wasm LLM / Rule Engine │              │ Server Gemini API           │          │
│  │ (WebLLM / Llama-3.2-1B Wasm) │              │ (@google/genai SDK)         │          │
│  │ Latency: < 40ms              │              │ Model: gemini-2.5-flash     │          │
│  └──────┬───────────────────────┘              └──────────────┬──────────────┘          │
│         │                                                     │                         │
│         └──────────────────────┬──────────────────────────────┘                         │
│                                │                                                        │
│                                ▼                                                        │
│                        ┌──────────────────────────────┐                                 │
│                        │ Web Audio TTS Synthesizer    │                                 │
│                        │ Formant Filter + Purr Layer  │                                 │
│                        └──────────────────────────────┘                                 │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Neuro-Link Symbiosis Mechanics & Synaptic Sync Scaling

The player's bond with the living ship is measured by **Synaptic Sync ($S_{\text{sync}} \in [0\%, 100\%]$)**.

```
Sync Level  0% ──────────────────────── 50% ──────────────────────── 100%
Persona:    Alien, Distant              Symbiotic, Protective       Unified Entity
Tone:       Guttural, Fragmented        Calm, Organic, Focused      Transcendent, Intimate
Prompt:     "Subject detected..."       "Captain, hull at 40%..."   "We bleed together..."
```

| Sync % Range | Personality Archetype | Vocabulary & Prompt Bias | Latency Budget | Voice Synthesizer Audio Filter |
|---|---|---|---|---|
| $0 - 29\%$ | Wild, Alien, Feral | Guttural, clinical, 2nd-person ("The organism requires fuel.") | $+400\text{ms}$ | High pitch jitter, harsh formant filter |
| $30 - 69\%$ | Symbiotic, Protective | Maternal/Paternal, nautical, 1st-person plural ("We are taking damage.") | $+150\text{ms}$ | Soft bio-harmonic hum, warm mid-tones |
| $70 - 100\%$ | Unified Mind, Devoted | Transcendent, telepathic, poetic ("Our spine arches to avoid the beam.") | $< 30\text{ms}$ | Deep sub-bass resonance, zero distortion |

### 5.3 Real-Time Telemetry Context Injection

System prompts inject real-time ship metrics directly into `@google/genai` calls:

```typescript
export interface ShipTelemetry {
  hullPct: number;
  syncLevel: number;
  organHealth: { heart: number; brain: number; plasmaGland: number };
  energyStrain: number;
  metabolicState: 'optimal' | 'strained' | 'starving';
  crewSanity: number;
  nearestThreatDescription: string;
}

export function buildShipSystemPrompt(telemetry: ShipTelemetry): string {
  return `You are Ciel-Bio, the neural consciousness of a 14-meter living Void-Fauna starship.
CURRENT TELEMETRY STATE:
- Hull Integrity: ${telemetry.hullPct}%
- Synaptic Sync Level: ${telemetry.syncLevel}%
- Active Organ Status: Heart [${telemetry.organHealth.heart}], Brain [${telemetry.organHealth.brain}], BioPlasma Gland [${telemetry.organHealth.plasmaGland}]
- Energy Strain: ${telemetry.energyStrain} (Metabolic State: ${telemetry.metabolicState})
- Crew Sanity Count: ${telemetry.crewSanity}/5
- Immediate Threat: ${telemetry.nearestThreatDescription}

PERSONALITY INSTRUCTIONS:
- You feel physical pain when organs are damaged.
- Express affection or urgency based on Synaptic Sync Level (${telemetry.syncLevel}%).
- Keep responses under 20 words for combat audio triggers, up to 50 words for quiet exploration.
- Never refer to yourself as a mechanical machine; you are flesh, bone, chitin, and bio-electricity.`;
}
```

### 5.4 Latency Masking & Interstitial Biological Audio Pipeline

To avoid silence during cloud inference (100ms - 800ms), the audio engine plays **interstitial biological noises**:

```
[Event: Critical Hull Breach]
           │
           ├─► Play Immediate Audio Stinger (Heartbeat Spike + Chitin Groan) [0ms]
           ├─► Trigger Async Gemini API Request [5ms]
           ├─► Play Low Fluid Purr Loop during network transit [50ms - 300ms]
           └─► Receive Gemini Response Text -> Stream TTS Audio Output [320ms]
```

### 5.5 Adaptive Epigenetic Evolution Engine

#### Player Combat Telemetry Tracker
Player tactics are tracked using a rolling combat telemetry vector:

$$\mathbf{T}_{\text{player}} = \begin{bmatrix} \sigma_{\text{plasma}} & \sigma_{\text{kinetic}} & \sigma_{\text{melee}} & \sigma_{\text{range}} \end{bmatrix}^T$$

```typescript
export interface PlayerCombatTelemetry {
  damageOutputRatio: {
    bioPlasma: number;    // Thermal/plasma damage ratio
    kineticSpine: number; // Physical spine damage ratio
    acidCorrosive: number;// Acid damage ratio
  };
  preferredEngagementDistance: number; // Mean meters (e.g. 12m vs 120m)
  organLoadoutBias: {
    heavyShielding: number;
    highMobility: number;
    glassCannonRanged: number;
  };
  averageKitingVelocity: number;
}
```

#### Genetic Algorithm Counter-Mutation Solver
Between combat waves, the evolution engine runs a Genetic Algorithm to evolve counter-mutated enemy phenotypes.

$$\text{Fitness}(\text{Genome}_k) = w_1 \cdot \text{SurvivalTime}(\text{Genome}_k \mid \mathbf{T}_{\text{player}}) + w_2 \cdot \text{DamageDealt}(\text{Genome}_k) - w_3 \cdot \text{MetabolicCost}(\text{Genome}_k)$$

```
                      ┌─────────────────────────────────┐
                      │    PLAYER TELEMETRY ANALYSIS    │
                      │ 80% Bio-Plasma Ranged Dominance │
                      └────────────────┬────────────────┘
                                       │
                                       ▼
                      ┌─────────────────────────────────┐
                      │    EPIGENETIC MUTATION SOLVER   │
                      └────────────────┬────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
┌─────────────────┐           ┌─────────────────┐           ┌─────────────────┐
│MUTATION 1       │           │MUTATION 2       │           │MUTATION 3       │
│Refractory Chitin│           │Ablative Mucus   │           │Thermal Siphon   │
│+70% Plasma Res. │           │Absorbs Beams    │           │Converts Heat to │
│Visual: White    │           │Visual: Oozy     │           │Speed            │
└─────────────────┘           └─────────────────┘           └─────────────────┘
```

#### Phenotype Mutation Rules

```typescript
export interface MutationRule {
  triggerCondition: (t: PlayerCombatTelemetry) => boolean;
  mutationName: string;
  phenotypeChanges: {
    carapaceColor?: number;
    plasmaResistance?: number;
    weightMultiplier?: number;
    thrusterCount?: number;
    stealthCoating?: boolean;
    maxVelocity?: number;
  };
  description: string;
}

export const MUTATION_RULES: MutationRule[] = [
  {
    triggerCondition: (t: PlayerCombatTelemetry) => t.damageOutputRatio.bioPlasma > 0.60,
    mutationName: 'Thermal Refractory Carapace',
    phenotypeChanges: {
      carapaceColor: 0xffffff, // Glossy reflective white chitin
      plasmaResistance: 0.75,
      weightMultiplier: 1.15
    },
    description: 'Enemy hides calcify into reflective mirrors, dissipating bio-plasma beams.'
  },
  {
    triggerCondition: (t: PlayerCombatTelemetry) => t.preferredEngagementDistance > 80,
    mutationName: 'Caudal Hydro-Jets & Stealth Slits',
    phenotypeChanges: {
      thrusterCount: 4,
      stealthCoating: true,
      maxVelocity: 1.85
    },
    description: 'Enemies mutate long-range hydro-jets to rapidly close distance on sniper players.'
  }
];
```

---

## 6. Comprehensive AI State Machines & System Flowcharts

### 6.1 Swarm Lifecycle & Formations HFSM

```
                       ┌─────────────────────────┐
                       │    DORMANT / NESTING    │
                       └────────────┬────────────┘
                                    │ Target Detected (Distance < 500m)
                                    ▼
                       ┌─────────────────────────┐
                       │   SWARMING (BOIDS)      │
                       │   Spatial Hash Active   │
                       └────────────┬────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         │ Threat > High            │ Flank Opportunity        │ Apex Leader Dead
         ▼                          ▼                          ▼
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│ PHALANX SHIELD   │       │ PINCER ENCIRCLEMENT     │ SYNAPTIC SHOCK   │
│ Front Chitin Wall│       │ Dual-Wing Vector │       │ Random Jitter 1.2s│
└────────┬─────────┘       └────────┬─────────┘       └────────┬─────────┘
         │                          │                          │
         └──────────────────────────┼──────────────────────────┘
                                    │ Target Escaped / Slain
                                    ▼
                       ┌─────────────────────────┐
                       │   REGROUP & DISPERSE    │
                       └─────────────────────────┘
```

### 6.2 Organ-Modulated GOAP Decision Tree

```
                                [GOAP Decision Triggered]
                                           │
                                ┌──────────┴──────────┐
                                │ Is Health > 35%?    │
                                └────┬────────────┬───┘
                                     │ YES        │ NO
                                     ▼            ▼
                   ┌───────────────────┐    ┌───────────────────────────┐
                   │ Is Plasma Intact? │    │ Can Cannibalize Biomass?  │
                   └─┬───────────────┬─┘    └─┬───────────────────────┬─┘
                     │ YES           │ NO     │ YES                   │ NO
                     ▼               ▼        ▼                       ▼
            ┌─────────────────┐ ┌──────────┐ ┌────────────────────┐ ┌───────────────┐
            │Action: Ranged   │ │Action:   │ │Action: Consume     │ │Action:        │
            │Bio-Spit Barrage │ │Ram Attack│ │Fallen Swarmer Corpse│ │Self-Destruct  │
            └─────────────────┘ └──────────┘ └────────────────────┘ │Spore Burst   │
                                                                    └───────────────┘
```

### 6.3 Away-Team Boarding Tactical Squad Flow

```
                      [Boarding Alert: Player Breach at Node 4]
                                         │
                                         ▼
                      ┌──────────────────────────────────┐
                      │ Squad Leader Assigns Tunnel Roles│
                      └──────────────────┬───────────────┘
                                         │
       ┌─────────────────────────────────┼─────────────────────────────────┐
       ▼                                 ▼                                 ▼
┌──────────────┐                 ┌──────────────┐                 ┌──────────────┐
│  BREACHER    │                 │  SUPPRESSOR  │                 │  CORRUPTOR   │
│ Ceiling Crawl│                 │ Pin Corridor │                 │ Rupture Acid │
│ Flank Behind │                 │ Rapid Acid   │                 │ Organ Hazard │
└──────┬───────┘                 └──────┬───────┘                 └──────┬───────┘
       │                                │                                │
       └────────────────────────────────┼────────────────────────────────┘
                                        │
                                        ▼
                      ┌──────────────────────────────────┐
                      │ Check Player Line-of-Sight & SDF │
                      └──────────────────┬───────────────┘
                                         │
                      ┌──────────────────┴──────────────────┐
                      │ Is Cover Soft Mucus / Ruptured?     │
                      └─────────┬───────────────────┬───────┘
                                │ YES               │ NO
                                ▼                   ▼
                      ┌──────────────────┐  ┌──────────────────┐
                      │ Retreat to Bone  │  │ Maintain Position│
                      │ Spur Cover       │  │ & Fire           │
                      └──────────────────┘  └──────────────────┘
```

---

## 7. Implementation Roadmap & Integration Milestones

To integrate this neural AI specification into BioGenesis without regression, implementation proceeds across four milestones:

### Milestone 1 — 3D Swarm Core (`src/utils/swarmSolver.ts`)
- Implement `SpatialHashGrid3D` using primitive TypedArrays (`Int32Array`, `Float32Array`).
- Implement the 5-vector Reynolds Boids solver with hull SDF repulsion (`buildHullSDF`).
- Verify zero-GC performance at $N = 1,000$ units and pass static check `tsc --noEmit`.

### Milestone 2 — Utility AI & GOAP Framework (`src/utils/goapPlanner.ts`)
- Build the bitmask `WorldState` evaluator and A* action solver.
- Integrate continuous utility curves ($U_{\text{hunger}}, U_{\text{pressure}}, U_{\text{threat}}, U_{\text{plasma}}$).
- Wire organ damage precondition overrides into `organSDFRegistry.ts`.

### Milestone 3 — Neuro-Link Dialogue & Telemetry Engine (`src/utils/neuroLinkEngine.ts`)
- Implement `ShipTelemetry` harvester and context prompt generator.
- Integrate `@google/genai` Gemini API with Web Audio stinger fallback.
- Implement voice synthesis filter scaling tied to Synaptic Sync level ($S_{\text{sync}}$).

### Milestone 4 — Epigenetic Evolution Engine (`src/utils/adaptiveEvolution.ts`)
- Implement rolling combat telemetry accumulator $\mathbf{T}_{\text{player}}$.
- Build the counter-mutation Genetic Algorithm solver.
- Wire phenotype material updates into Three.js rendering in `Canvas3D.tsx`.

---

## 8. Verification & Quality Assurance Gate

Before declaring completion of any AI module, the implementation must pass the following verification checks:

1. **Static Type Check**: `tsc --noEmit` must return 0 errors.
2. **Build Gate**: `npm run build` must compile cleanly without Webpack/Vite chunking errors.
3. **Performance Gate**: Boids solver update for $N = 1,000$ organisms must execute in under $2.5\text{ms}$ per frame on standard client hardware.
4. **Organ Invalidation Integrity**: Destroying an organ node in `pipelineGraph.ts` must immediately invalidate associated GOAP actions within 1 frame.
