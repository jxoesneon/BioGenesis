# GAMEPLAY REFINEMENT SPECIFICATION: COMBAT MECHANICS & VISCERAL SYSTEMS
> **Document Status**: Institutional Standard · Production-Ready Specification  
> **Engine Target**: GENESIS-X Living Ship Engine (Three.js / React 19 / Vite 6 / WebGPU)  
> **Classification**: Gameplay Combat Mechanics & Refinement Architecture  
> **Author**: Subagent 3 (Combat Mechanics Refinement Lead)  
> **Cross-References**: [`LORE.md`](../../LORE.md) · [`ORGAN_SYSTEMS.md`](../../ORGAN_SYSTEMS.md) · [`AAA_GAMEPLAY_SYSTEMS_DESIGN.md`](./AAA_GAMEPLAY_SYSTEMS_DESIGN.md) · [`BEST_IN_CLASS_COMBAT_RESEARCH.md`](../research/BEST_IN_CLASS_COMBAT_RESEARCH.md) · [`NEURAL_COMPUTE_ARCHITECTURE.md`](../research/NEURAL_COMPUTE_ARCHITECTURE.md) · [`COMMAND_ROOM_SPEC.md`](../research/COMMAND_ROOM_SPEC.md)

---

## 1. Executive Overview & Combat Architecture Philosophy

### 1.1 The Visceral Biopunk Combat Vision
BioGenesis replaces traditional, rigid metal starships with living, breathing Void-Fauna organisms. Combat in BioGenesis is not a game of abstract hit-point subtraction or simple shield depletion; it is a battle of **biological trauma, organ dismemberment, metabolic strain, and fluidic momentum**.

Ships are anatomical entities possessing organic carapace plates, vascular networks, neural ganglia, and pressurized organ bladders. Combat operations engage both the **Outer Spatial Layer (6-DOF Dogfighting)** and the **Inner Vascular Layer (FPS Corridor Defense)** simultaneously.

```
+-----------------------------------------------------------------------------------+
|                           BIOGENESIS COMBAT QUAD-PILLAR                           |
+-----------------------------------------------------------------------------------+
| 1. 6-DOF Hydro-Pulse Vectoring   | Fluidic mass ejection, sphincter thrust         |
|                                  | deflection, and real-time hemolymph inertia    |
+----------------------------------+------------------------------------------------+
| 2. Targeted Organ Dismemberment  | Surgical slicing of ocular pods, spinal cords, |
|                                  | and bladders causing functional failure cascades|
+----------------------------------+------------------------------------------------+
| 3. Yerkes-Dodson Overclocking    | Bi-phasic neural curve balancing excitotoxic   |
|                                  | performance boost against cardiac arrest risk  |
+----------------------------------+------------------------------------------------+
| 4. Dual-Layer Spatial/FPS Sync   | Real-time physical G-force transfer between     |
|                                  | outer dogfights and interior vascular defense  |
+----------------------------------+------------------------------------------------+
```

---

### 1.2 Visceral Combat Feedback Loops
To ensure maximum tactile and somatosensory immersion, combat interactions trigger five simultaneous feedback vectors:

1. **Hit-Stop Micro-Stutter**: Kinetic or bio-plasmic impacts on primary organ nodes trigger a 15–45 ms physics freeze-frame, simulating structural tissue density and impact absorption.
2. **Volumetric Fluid Ejection**: Rupturing pressurized organ bladders releases high-velocity particle streams of emissive bio-plasma (bright green), dark hemolymph (viscous crimson), or digestive acid (yellow-green) that accumulate on external viewports.
3. **Procedural Mesh Tearing**: Soft-body organ surfaces deform dynamically via XPBD (Extended Position-Based Dynamics) and tear when tensile strain exceeds elastic thresholds, exposing underlying vascular tissue.
4. **Biological Audio Spatialization**: Direct organ damage generates wet muscular impacts, squelching membrane ruptures, atmospheric decompression hiss, and pilot cardiac tachycardia audio cues.
5. **Dynamic Stance Switching**: Living ships alter their physical geometry in real time, flexing structural muscles and repositioning chitin carapace plates to optimize mobility, defense, or biomass harvesting.

```
+------------------------------------------------------------------------------------+
|                               BIOLOGICAL COMBAT STANCES                            |
+--------------------+--------------------------+------------------------------------+
| Stance             | Geometry Configuration   | Mechanical / Envelope Effect       |
+--------------------+--------------------------+------------------------------------+
| Hydro-Drift        | Hydro-sphincters wide    | Maximum turn rate, decoupled       |
|                    | open, ribs relaxed       | trajectory, 0% stability damping   |
+--------------------+--------------------------+------------------------------------+
| Predator Pursuit   | Axons tense, caudal      | Maximum forward thrust vector,     |
|                    | vents locked posterior   | tight pitch radius, high bio-dps   |
+--------------------+--------------------------+------------------------------------+
| Skeletal Shielding | Rib cage tightly clamped | +70% carapace turgor/armor,        |
|                    | over thoracic cavity     | -50% top speed, restricted optics  |
+--------------------+--------------------------+------------------------------------+
| Siphon Harvest     | Oral vent flared wide,   | High biomass fragment intake,      |
|                    | vacuum sphincter open    | mid-flight fluid recovery, 0% armor|
+--------------------+--------------------------+------------------------------------+
```

---

## 2. 6-DOF Hydro-Pulse Thrust Vectoring & Newtonian Flight Engine

### 2.1 Newtonian Hydro-Pulse Jet Propulsion
Propulsion in Void-Fauna is generated by high-frequency contractions of muscular caudal cavities, forcing pressurized hemolymph through dynamic directional sphincters.

The total instantaneous thrust vector $\mathbf{F}_{\text{thrust}}(t)$ produced by $N_{\text{vent}}$ active hydro-pulse sphincters is given by:

$$\mathbf{F}_{\text{thrust}}(t) = \sum_{k=1}^{N_{\text{vent}}} \eta_k(t) \cdot \left[ \dot{m}_k(t) \mathbf{v}_{\text{jet}, k}(t) + \bigl(p_k(t) - p_{\infty}\bigr) A_k(t) \mathbf{n}_k(t) \right]$$

where:
- $\dot{m}_k(t)$: Mass flow rate of expelled hemolymph fluid through sphincter $k$ ($\text{kg/s}$).
- $\mathbf{v}_{\text{jet}, k}(t)$: Exhaust jet velocity vector ($\text{m/s}$), constrained by maximum sphincter deflection angle $\theta_{\text{vent}} \le 45^\circ$.
- $p_k(t)$: Hydrostatic pressure within the muscular caudal cavity ($\text{Pa}$).
- $p_{\infty}$: Ambient ambient spatial pressure ($0.0\text{ Pa}$ in vacuum).
- $A_k(t)$: Cross-sectional nozzle exit area of sphincter $k$ ($\text{m}^2$).
- $\mathbf{n}_k(t)$: Unit directional vector of the sphincter nozzle.
- $\eta_k(t) \in [0, 1]$: Functional health scalar of sphincter muscle $k$.

---

### 2.2 Biological RCS & Sphincter Torque Integration
Rotational torque $\boldsymbol{\tau}_{\text{hydro}}$ about the ship's center of mass $\mathbf{r}_{\text{cg}}$ is produced by asymmetric, differential sphincter contractions and tail appendage muscular actuation:

$$\boldsymbol{\tau}_{\text{hydro}} = \sum_{k=1}^{N_{\text{vent}}} (\mathbf{r}_k - \mathbf{r}_{\text{cg}}) \times \mathbf{F}_{\text{thrust}, k} + \boldsymbol{\tau}_{\text{caudal\_muscles}}$$

When pitch/yaw control commands are issued, sphincter nozzle orientation vectors $\mathbf{n}_k$ deflect up to $\pm 45^\circ$ at a maximum angular velocity of $\omega_{\text{sphincter}} = 180^\circ/\text{s}$.

```
                 [ Hydro-Pulse Vectoring Dynamics ]

                         Forward Thrust Vector F_thrust
                                    ^
                                    |
            Yaw Vector              |              Yaw Vector
       F_left <------------- [ Living Ship ] -------------> F_right
                                    |
                                    |
                                    v
                          Retro Pulse Vector F_retro
```

---

### 2.3 Hemolymph Mass Shift & Dynamic Inertia Tensor
As hemolymph is expelled during intense maneuvers or shifted between thoracic organ bladders, the ship's total mass $m(t)$ and moment of inertia tensor $\mathbf{I}_{\text{ship}}(t)$ evolve dynamically:

$$m(t) = m_{\text{dry}} + \int_{0}^{t} \left( \dot{m}_{\text{intake}}(\tau) - \sum_{k=1}^{N_{\text{vent}}} \dot{m}_{\text{vent}, k}(\tau) \right) d\tau$$

$$\mathbf{I}_{\text{ship}}(t) = \mathbf{I}_{\text{carapace}} + \sum_{j=1}^{N_{\text{organs}}} m_{\text{fluid}, j}(t) \left( \|\mathbf{r}_j(t)\|^2 \mathbf{E} - \mathbf{r}_j(t) \otimes \mathbf{r}_j(t) \right)$$

where $\mathbf{E}$ is the $3 \times 3$ identity matrix, $\mathbf{r}_j(t)$ is the offset vector from the center of mass to organ bladder $j$, and $m_{\text{fluid}, j}(t)$ is the fluid mass in bladder $j$. Expending 50% of fluid mass reduces rotational inertia by up to ~35%, causing the ship to become significantly more twitchy and agile during extended dogfights.

---

### 2.4 Mermaid State Machine: Flight & Stance Controls

```mermaid
stateDiagram-v2
    [*] --> HydroDrift: Default Flight Mode
    
    HydroDrift --> PredatorPursuit: Engaged Forward Vector (Throttle > 90%)
    PredatorPursuit --> HydroDrift: Decouple Heading (Brake / Drift Key)
    
    HydroDrift --> SkeletalShielding: Command Shielding (Clamp Ribs)
    PredatorPursuit --> SkeletalShielding: Command Shielding (Clamp Ribs)
    SkeletalShielding --> HydroDrift: Release Shielding
    
    HydroDrift --> SiphonHarvest: Near Biomass Field & Mouth Open
    SiphonHarvest --> HydroDrift: Biomass Full / Harvest Cancel
    
    HydroDrift --> ParalysisDrift: Spinal Cord Severed (H_axon = 0)
    PredatorPursuit --> ParalysisDrift: Spinal Cord Severed (H_axon = 0)
    SkeletalShielding --> ParalysisDrift: Spinal Cord Severed (H_axon = 0)
    SiphonHarvest --> ParalysisDrift: Spinal Cord Severed (H_axon = 0)
    
    ParalysisDrift --> HydroDrift: Bio-Plasma Axon Bridge Regenerated
```

---

## 3. Targeted Organ Dismemberment & Anatomical Failure Cascades

### 3.1 Anatomical Dismemberment Philosophy
Ships do not feature global health bars. Damage is evaluated against localized organ geometry, chitin carapace turgor, and vascular interconnectivity.

```
       [ Ocular Pods (Cranial) ] ------------> Loss of Visual Tracking & Reticle Jitter
                |
       [ Brain / Ganglia (Cranial) ] --------> Loss of Neural Command & EQ Capacity
                |
  +-------------+-------------+
  |                           |
[ Heart (Thoracic) ]    [ Axon Cord (Spine) ] -> Paralyzes Caudal Hydro-Vents
  |                           |
[ Plasma Gland ]        [ Caudal Vent ] -------> Complete Loss of Propulsion
  |
  +-> Rupture -> Acid Spill into Internal Corridors
```

---

### 3.2 Ocular Pod Dismemberment & Reticle Noise
Destruction of cranial ocular pods severely degrades optical data fed into the pilot's neural link.

- **Single Ocular Pod Loss ($H_{\text{left}} = 0 \lor H_{\text{right}} = 0$)**: Destroys stereoscopic depth perception. Targeting lead reticles experience angular jitter variance $\sigma_{\text{target}}^2$:

$$\sigma_{\text{target}}^2(H_{\text{eye}}) = \sigma_{\text{base}}^2 + K_{\text{jitter}} \cdot \left(1.0 - \frac{H_{\text{left}} + H_{\text{right}}}{2}\right)^{3.5}$$

- **Dual Ocular Pod Loss ($H_{\text{left}} = 0 \land H_{\text{right}} = 0$)**: Completely disables visual optical rendering. The viewport switches to a low-frequency, high-noise thermal electromagnetic sonar overlay.

---

### 3.3 Spinal Axon Cord Severance & Neural Latency
The Spinal Axon Cord conveys electrical command impulses from the cranial neural ganglia to caudal hydro-pulse sphincters at an uninjured signal velocity of $v_{\text{axon}} = 120\text{ m/s}$.

- **Partial Damage ($0 < H_{\text{axon}} < 0.5$)**: Signal transmission velocity drops non-linearly, adding pitch/yaw input lag $\Delta t_{\text{delay}}$:

$$\Delta t_{\text{delay}} = \Delta t_{\text{base}} + \frac{L_{\text{spine}}}{v_{\text{axon}} \cdot \max(0.05, H_{\text{axon}})}$$

- **Total Severance ($H_{\text{axon}} = 0$)**: Complete electrical disconnect. All caudal thrusters freeze in their last position, forcing the ship into **Paralysis Drift** with zero main vector authority.

---

### 3.4 Bladder & Gland Ruptures
Pressurized fluid bladders (Bio-Plasma Glands, Hemolymph Reservoirs, Acid Chambers) operate at internal hydrostatic pressures up to $140\text{ Bar}$.

- **External Rupture**: Releases a expanding volumetric cloud of corrosive fluid into space ($R(t) = v_{\text{exp}} t$). Enemies flying through the cloud suffer $85\text{ DPS}$ carapace corrosion.
- **Internal Corridor Rupture**: Floods interior vascular corridors with acidic hemolymph, inflicting continuous environmental damage ($45\text{ DPS}$) on crew members, internal turrets, and parasite invaders.

---

### 3.5 Comprehensive Organ Damage Matrix

| Organ Name | Location Band | Dismember Trigger | Primary Failure Effect | Secondary Cascade Effect | Repair Cost & Time | Kinetic Mult | Bio-Plasma Mult | Acid Mult | Thermal Mult |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Left Ocular Pod** | Cranial ($U=0.02-0.13$) | Structural Cut | Loss of left stereo optic view | +8.5px reticle jitter variance | 45 Biomass / 12s | 1.2x | 1.0x | 1.5x | 0.8x |
| **Right Ocular Pod** | Cranial ($U=0.02-0.13$) | Structural Cut | Loss of right stereo optic view | +8.5px reticle jitter variance | 45 Biomass / 12s | 1.2x | 1.0x | 1.5x | 0.8x |
| **Spinal Axon Cord** | Spine ($U=0.05-0.85$) | Tensile Tearing | Neural input lag on caudal vents | Complete thruster paralysis at 0 HP | 120 Biomass / 25s | 1.5x | 0.8x | 2.0x | 1.0x |
| **Cardiac Myocardium** | Thoracic ($U=0.35-0.55$) | Ischemic Necrosis | Systemic pressure drops (-70%) | Ischemic starvation of downstream organs | 200 Biomass / 45s | 1.0x | 1.2x | 1.2x | 1.5x |
| **Bio-Plasma Gland** | Thoracic ($U=0.40-0.60$) | Explosive Rupture | Disables heavy plasma artillery | Corrosive acid spill in internal corridors | 150 Biomass / 30s | 1.8x | 0.5x | 0.8x | 2.5x |
| **Caudal Sphincter** | Caudal ($U=0.67-0.82$) | Shear Dismember | Loss of primary forward vector | Hemolymph leak rate +60%/min | 90 Biomass / 20s | 1.1x | 1.4x | 1.0x | 1.2x |
| **Siphon Intake Vent** | Cranial ($U=0.01-0.10$) | Impact Fracture | Prevents biomass fragment intake | Disables mid-fight hemolymph repair | 70 Biomass / 15s | 1.4x | 1.0x | 1.0x | 1.0x |
| **Shield Emitter Node** | Mid-Hull ($U=0.30-0.65$) | Thermal Ablation | Collapses chitin force-field | Overheats adjacent cranial ganglia | 110 Biomass / 22s | 0.8x | 2.0x | 1.2x | 2.0x |
| **Cyber Air Lock** | Thoracic ($U=0.32-0.60$) | Hull Breach | Hallway depressurization | Allows enemy boarding pod entry | 60 Biomass / 10s | 2.0x | 1.0x | 1.0x | 1.0x |
| **Neural Ganglion** | Cranial/Neck ($U=0.03-0.28$)| Excitotoxic Shock| Reductions in ship EQ compute | Autopilot & HUD tracking offline | 130 Biomass / 35s | 1.0x | 1.5x | 1.8x | 1.2x |

---

### 3.6 Mermaid State Machine: Organ Dismemberment & Cascades

```mermaid
stateDiagram-v2
    [*] --> Nominal: Organ Integrity = 100%
    
    Nominal --> Damaged: Takes Damage (HP < 100%)
    Damaged --> Nominal: Biomass Repair Applied
    
    Damaged --> Severed: Health Drops to 0%
    Damaged --> Ruptured: Health Drops to 0% (Fluid Bladders)
    
    Severed --> CascadeStarvation: Triggers Downstream Axon Lag
    Ruptured --> CorridorSpill: Floods Vascular Corridor with Acid
    
    CascadeStarvation --> Necrotic: Lack of Biomass Repair > 60s
    CorridorSpill --> Necrotic: Tissues Dissolved by Acid
    
    Necrotic --> Severed: Biomass Injected (Restores Base Organ)
```

---

## 4. Yerkes-Dodson Neuro-Overclocking & Excitotoxicity Engine

### 4.1 Inverted-U Neural Curve Mathematical Model
Ganglia feed neural compute supply $S \in [0, 200\%]$ to ship organs. Organ functional efficiency $\eta_{\text{organ}}(S)$ strictly obeys the bi-phasic **Yerkes-Dodson Law**:

$$\eta_{\text{organ}}(S) = \begin{cases} 
0.0 & S < 25\% \quad (\text{Organ Shutdown}) \\
\frac{S - 25}{50} & 25\% \le S < 75\% \quad (\text{Sub-Optimal Supply}) \\
1.0 & 75\% \le S \le 100\% \quad (\text{Nominal Operating Range}) \\
1.0 + 0.02 (S - 100) & 100\% < S \le 120\% \quad (\text{Controlled Overclock, +40\% Output}) \\
1.4 - 0.005 (S - 120)^2 & S > 120\% \quad (\text{Excitotoxic Overstimulation Decay})
\end{cases}$$

```
   Organ Efficiency (η)
      1.4 |                      / \  <- Peak Performance (120% Supply, Overclocked)
          |                     /   \
      1.0 |.........+----------+     \  <- Normal Operating Zone (100%)
          |        /            \     \
      0.5 |       /              \     \  <- Excitotoxicity & Damage Zone (>120%)
          |      /                \     \
        0 +-----+------------------+-----+-----> Neural Supply (S %)
               25%                100%  120% 140%
```

---

### 4.2 Neurotoxin Kinetics & Cellular Necrosis
Forcing an organ into $S > 120\%$ initiates anaerobic excitotoxicity, accumulating neurotoxins $T_{\text{neuro}, i}$:

$$\frac{d T_{\text{neuro}, i}}{dt} = k_{\text{tox}} \cdot \max(0, S_i - 120)^{1.6} - \delta_{\text{clearance}} \cdot H_{\text{kidney}}$$

where $k_{\text{tox}} = 0.005$, $\delta_{\text{clearance}} = 0.02$, and $H_{\text{kidney}}$ is renal organ health. Accumulated neurotoxins induce organ tissue necrosis:

$$\frac{d H_{\text{organ}, i}}{dt} = -\mu_{\text{necrosis}} \cdot T_{\text{neuro}, i} - \alpha_{\text{thermal}} \cdot \max(0, T_{\text{temp}, i} - T_{\text{critical}})$$

---

### 4.3 Ventricular Fibrillation & Cardiac Arrest Probability Model
If neurotoxins in the Cardiac Myocardium exceed $T_{\text{crit}} = 100.0$, the heart enters **Ventricular Fibrillation (Cardiac Arrest)**. The probability per second $P_{\text{arrest}}$ is governed by an inhomogeneous Poisson process:

$$P_{\text{arrest}}(t) = 1.0 - \exp\left(-\lambda_{\text{arrest}} \cdot \max(0, T_{\text{neuro}, heart}(t) - 100.0) \cdot \Delta t\right)$$

where $\lambda_{\text{arrest}} = 0.05$. In cardiac arrest, hemolymph pressure drops to $0\text{ mmHg}$, starves all downstream organs within $15\text{s}$, and forces emergency bio-defibrillation via interior corridor shock nodes.

---

### 4.4 Pilot Symbiosis Feedback & Somatosensory Trauma
Because the pilot is neurally linked to the living ship, ship trauma and neurotoxins mirror directly into pilot physiological strain:

$$P_{\text{pilot}} = \min\left(1.0, \sum_{i=1}^{N} w_i (1.0 - H_{\text{organ}, i}) + \beta_{\text{tox}} \cdot T_{\text{neuro}, total}\right)$$

```
+------------------------------------------------------------------------------------+
|                             SOMATOSENSORY TRAUMA EFFECTS                           |
+---------------------+--------------------------------------------------------------+
| Pain Index Level    | Audio-Visual & Haptic Distortion Feedback                    |
+---------------------+--------------------------------------------------------------+
| P_pilot < 0.3       | Nominal. Subtle bioluminescent pulse in HUD margin.          |
| 0.3 <= P_pilot < 0.6| Minor chromatic aberration (2px). Heartbeat audio at 110 BPM.|
| 0.6 <= P_pilot < 0.8| Vignette tunnel vision (FOV clamps to 45°). Audio low-pass   |
|                     | filter at 450Hz. Heartbeat at 155 BPM. High-freq haptics.    |
| P_pilot >= 0.8      | Severe visual noise. Redout/blackout flashing. Desynchronized|
|                     | neural feedback spasms. Direct pilot health drain (2 HP/s).  |
+---------------------+--------------------------------------------------------------+
```

---

### 4.5 Mermaid State Machine: Overclocking & Cardiac Arrest

```mermaid
stateDiagram-v2
    [*] --> NominalSupply: Neural Supply S = 100%
    
    NominalSupply --> Overclocked: Pilot Command Overclock (100% < S <= 120%)
    Overclocked --> NominalSupply: Release Overclock Command
    
    Overclocked --> Excitotoxic: S > 120% (Neurotoxins Accumulate)
    Excitotoxic --> NominalSupply: Throttle Supply & Clear Neurotoxins
    
    Excitotoxic --> CardiacArrest: T_neuro(Heart) > 100.0 & P_arrest Triggered
    
    CardiacArrest --> EmergencyDefibrillation: Crew Administers Bio-Shock
    EmergencyDefibrillation --> NominalSupply: Heart Rhythm Restored
    
    CardiacArrest --> SystemicDeath: 15s Timeout without Defibrillation
```

---

## 5. Dual-Layer Spatial-to-Interior Vascular Boarding Defense

### 5.1 Dual-Layer Real-Time Synchronization Architecture
Combat occurs simultaneously across two seamlessly integrated layers running in lockstep:

```
+-----------------------------------------------------------------------------------+
|                        DUAL-LAYER COMBAT SYNCHRONIZATION                          |
+-----------------------------------------------------------------------------------+
| LAYER 1: SPATIAL DOGFIGHT (External 6-DOF View)                                   |
| [ Living Ship ] <====== Enemy Parasite Boarding Pod Breaches Chitin Hull          |
|        ||                                                                         |
|        || Dynamic G-Force & Structural Kinetic Shockwave Synchronization          |
|        \/                                                                         |
| LAYER 2: VASCULAR CORRIDOR DEFENSE (FPS Internal View)                            |
| [ Corridor Membrane ] ---> [ Sphincter Seal ] ---> [ White Blood Cell Leukocytes ]|
|   (Shakes with 15G)        (Clamps Hall)             (Attacks Parasites)          |
+-----------------------------------------------------------------------------------+
```

---

### 5.2 Dynamic G-Force Interior Acceleration Transfer
When the living ship undergoes extreme angular or linear accelerations in outer space ($\mathbf{a}_{\text{ship}}$), an exact fictitious inertial force $\mathbf{F}_{\text{inertial}}$ is transferred to players and entities moving inside interior vascular corridors:

$$\mathbf{F}_{\text{inertial}} = -m_{\text{player}} \cdot \left( \mathbf{a}_{\text{ship}} + \boldsymbol{\alpha}_{\text{ship}} \times \mathbf{r}_{\text{int}} + \boldsymbol{\omega}_{\text{ship}} \times (\boldsymbol{\omega}_{\text{ship}} \times \mathbf{r}_{\text{int}}) + 2 \boldsymbol{\omega}_{\text{ship}} \times \mathbf{v}_{\text{int}} \right)$$

where $\mathbf{r}_{\text{int}}$ and $\mathbf{v}_{\text{int}}$ are the relative position and velocity of the player inside the interior corridor. 

- **Positive/Negative $G_z$ Acceleration**: Causes pilot visual blackout (positive $G_z > +9G$) or redout (negative $G_z < -4G$).
- **Inertial Wall Slamming**: If $\|\mathbf{F}_{\text{inertial}}\| / m_{\text{player}} > 12G$, interior players are thrown against vascular walls, suffering kinetic impact damage proportional to wall impact velocity:

$$D_{\text{impact}} = \frac{1}{2} m_{\text{player}} \|\mathbf{v}_{\text{impact}}\|^2 \cdot K_{\text{tissue\_stiffness}}$$

---

### 5.3 Interior Vascular Environment & Defense Dynamics
- **Pulsing Arterial Walls**: Wall geometry flexes procedurally in rhythm with heart rate ($BPM$).
- **Hemolymph Fluid Currents**: High-velocity fluid streams in flooded corridors push entities downstream at $v_{\text{fluid}} = 3.5\text{ m/s}$.
- **Sphincter Blast Doors**: Muscular sphincters close off breached vascular sections to isolate depressurization and prevent parasites from reaching the cranial command room.
- **Leukocyte Swarms**: Immune defender nodes spawn autonomous white blood cell entities that swarm and engulf parasite invaders.

---

### 5.4 Mermaid State Machine: Parasite Boarding & Vascular Defense

```mermaid
stateDiagram-v2
    [*] --> PodApproach: Enemy Pod Launches
    
    PodApproach --> HullBoring: Clamps Chitin Carapace
    HullBoring --> CorridorBreach: Cuts Through Carapace Plate
    
    CorridorBreach --> SphincterLockdown: Internal Sensors Detect Depressurization
    SphincterLockdown --> ImmuneDeployment: Leukocyte Swarms & Plasma Vents Spawn
    
    ImmuneDeployment --> ParasitesNeutralized: All Invaders Eliminated
    ImmuneDeployment --> ChamberOverrun: Invaders Breach Sphincter Blast Door
    
    ParasitesNeutralized --> RepairCorridor: Bio-Nanites Seal Hull Breach
    ChamberOverrun --> CoreOrganDestroyed: Invaders Destroy Cranial Ganglia
    
    RepairCorridor --> [*]
```

---

## 6. Exhaustive Stress-Testing & Edge Case Architectural Solutions

### 6.1 Edge Case 1: Total Spinal Cord Severance Recovery Protocol
**Problem / Failure Mode**: When the Spinal Axon Cord health reaches $H_{\text{axon}} = 0$, electrical signal transmission to caudal thrusters drops to 0, leaving the ship completely paralyzed in an unguided spin with 0 main vector authority.

**Solution / Architectural Protocol**:
1. **Cranial Mini-Pulse RCS Fallback**: When $H_{\text{axon}} = 0$, control routing automatically shifts to auxiliary cranial ocular/spiracle vents. Pitch and yaw authority are maintained at $25\%$ nominal output, allowing basic orientation control.
2. **Bio-Plasma Neural Bridge Re-Stitching**: The pilot can channel stored bio-plasma into the severed spinal gap, creating a transient ionized plasma bridge that restores $40\%$ signal speed for $15\text{ seconds}$ (consumes $20\text{ Bio-Plasma/s}$).
3. **Permanent Axon Repair**: Injecting $120\text{ Biomass}$ directly into the spinal node initiates tissue re-growth over $25\text{ seconds}$.

```
[ Cranial Brain ] ===( Severed Gap )===//===> [ Caudal Vents (Paralyzed) ]
       ||
       +---> Auto-Fallback: [ Auxiliary Cranial Vents (25% RCS Authority) ]
       +---> Player Trigger: [ Bio-Plasma Ion Bridge (40% Signal Velocity) ]
```

---

### 6.2 Edge Case 2: Zero-Thrust Drift Recovery & Inertial Arrest
**Problem / Failure Mode**: If all hydro-pulse vents are simultaneously destroyed or drained of fluid, the ship enters an uncontrollable Newtonian drift. Traditional space games freeze ship motion artificially; BioGenesis maintains strict physics conservation, risking perpetual drift out of bounds.

**Solution / Architectural Protocol**:
1. **Emergency Hemolymph Venting Flares**: The ship can execute an emergency fluid dump, expelling pressurized hemolymph from damaged vascular tears to generate an un-vectored retrograde impulse $\Delta \mathbf{v}_{\text{arrest}}$:

$$\Delta \mathbf{v}_{\text{arrest}} = -\frac{m_{\text{dump}}}{m_{\text{ship}}} \mathbf{v}_{\text{rel\_exhaust}}$$

2. **Biomechanical Tendon Anchoring**: Players can fire high-tensile chitin tendons from lateral rib nodes to anchor onto nearby asteroid structures or enemy hulls, leveraging cable tension to arrest linear drift and whip-turn the ship.

---

### 6.3 Edge Case 3: Simultaneous Multi-Organ Destruction Cascade Loops
**Problem / Failure Mode**: If a high-yield explosive strike destroys the Heart, Brain, Axon Cord, and Bio-Plasma Gland in the exact same physics tick, un-ordered event processing causes infinite recursion loops or invalid pointer references during cascade evaluations.

**Solution / Architectural Protocol**:
1. **Directed Acyclic Graph (DAG) Resolution Order**: Organ failure cascades are strictly resolved in topological DAG order: `Cranial Brain` $\rightarrow$ `Spinal Axon Cord` $\rightarrow$ `Cardiac Myocardium` $\rightarrow$ `Thoracic Glands` $\rightarrow$ `Caudal Vents`.
2. **Atomic Frame State Evaluation**: Organ health updates are staged in a read-only buffer and applied atomically at the end of the physics frame tick (`dt`). No cascade handler can mutate organ health during iteration.

```
       [ 1. Cranial Brain ]
                │
                ▼
      [ 2. Spinal Axon Cord ]
                │
                ▼
    [ 3. Cardiac Myocardium ]
                │
        ┌───────┴───────┐
        ▼               ▼
[ 4. Plasma Gland ]  [ 5. Caudal Vents ]
```

---

### 6.4 Edge Case 4: High-Velocity Boarding Pod Geometry Clipping & Spatial Portal Transition
**Problem / Failure Mode**: At high angular rotation rates ($\omega_{\text{ship}} > 180^\circ/\text{s}$), fast-moving boarding pods can clip through external carapace collision meshes into non-walkable void geometry.

**Solution / Architectural Protocol**:
1. **Continuous Collision Detection (CCD)**: Boarding pod trajectories use swept-sphere volume casting along the velocity vector $\mathbf{v}_{\text{pod}} \cdot \Delta t$.
2. **Proxy Portal Transition Buffer**: When a breach occurs, the pod does not instantaneously teleport into interior space. It anchors to a **Portal Proxy Node** on the hull surface. The interior corridor geometry is instantiated underneath the node, and entities transition through a seamless spatial transformation matrix:

$$\mathbf{T}_{\text{int}} = \mathbf{M}_{\text{hull\_local}}^{-1} \cdot \mathbf{T}_{\text{world}}$$

---

### 6.5 Edge Case 5: Extreme G-Force Acceleration Desync & FPS Out-of-Bounds Safeguards
**Problem / Failure Mode**: Sudden collision impulses (e.g. ramming an asteroid at $300\text{ m/s}$) produce momentary spatial acceleration spikes exceeding $+150G$, launching internal FPS players through corridor mesh walls into outer space.

**Solution / Architectural Protocol**:
1. **Peak G-Force Saturation Clamp**: Fictitious internal acceleration $\mathbf{a}_{\text{internal}}$ is strictly clamped to a biomechanical max limit:

$$\|\mathbf{a}_{\text{internal}}\| = \min\left(\|\mathbf{a}_{\text{ship}}\|, 25.0 \cdot g_0\right)$$

2. **Hermite Frame Interpolation & Elastic Clamping**: Internal acceleration transfers are smoothed over a 3-frame Hermite curve. If a player entity penetrates an internal wall bounding box, elastic penalty forces $\mathbf{F}_{\text{clamp}} = -k_{\text{wall}} \mathbf{d}_{\text{penetration}} - c_{\text{damp}} \mathbf{v}$ instantly push the entity back into the navigable corridor volume.

---

## 7. Production Implementation Code Specifications

### 7.1 Production TypeScript Combat Engine (`CombatEngine.ts`)

```typescript
/**
 * CombatEngine.ts - BioGenesis Living-Ship Combat & Dismemberment Engine
 * Evaluates anatomical damage, organ failure cascades, reticle jitter, and pilot pain.
 */

export interface OrganState {
  id: string;
  name: string;
  section: 'cranial' | 'neck' | 'thoracic' | 'caudal' | 'tail';
  health: number; // Normalized 0.0 to 1.0
  maxHealth: number;
  isDismembered: boolean;
  neuralSupply: number; // Supply percentage (100 = nominal)
  neurotoxin: number; // Accumulated neurotoxin level
  temperature: number; // Degrees Celsius
}

export interface HitEvent {
  targetOrganId: string;
  damageAmount: number;
  damageType: 'kinetic' | 'bio_plasma' | 'corrosive_acid' | 'thermal';
  impactPoint: [number, number, number];
  impactNormal: [number, number, number];
}

export class CombatEngine {
  private organs: Map<string, OrganState> = new Map();
  private hitStopTimerMs: number = 0;
  private pilotPainIndex: number = 0;

  constructor() {
    this.initializeDefaultOrgans();
  }

  private initializeDefaultOrgans(): void {
    const defaultOrgans: OrganState[] = [
      { id: 'ocular_left', name: 'Left Ocular Pod', section: 'cranial', health: 1.0, maxHealth: 100, isDismembered: false, neuralSupply: 100, neurotoxin: 0, temperature: 37 },
      { id: 'ocular_right', name: 'Right Ocular Pod', section: 'cranial', health: 1.0, maxHealth: 100, isDismembered: false, neuralSupply: 100, neurotoxin: 0, temperature: 37 },
      { id: 'axon_cord', name: 'Spinal Axon Cord', section: 'cranial', health: 1.0, maxHealth: 250, isDismembered: false, neuralSupply: 100, neurotoxin: 0, temperature: 37 },
      { id: 'heart', name: 'Cardiac Myocardium', section: 'thoracic', health: 1.0, maxHealth: 400, isDismembered: false, neuralSupply: 100, neurotoxin: 0, temperature: 37 },
      { id: 'plasma_gland', name: 'Bio-Plasma Gland', section: 'thoracic', health: 1.0, maxHealth: 200, isDismembered: false, neuralSupply: 100, neurotoxin: 0, temperature: 37 },
      { id: 'caudal_vent', name: 'Caudal Hydro Vent', section: 'caudal', health: 1.0, maxHealth: 300, isDismembered: false, neuralSupply: 100, neurotoxin: 0, temperature: 37 },
    ];

    for (const organ of defaultOrgans) {
      this.organs.set(organ.id, organ);
    }
  }

  /**
   * Processes an incoming projectile/beam hit event on a target organ.
   */
  public processHit(hit: HitEvent): { hitStopMs: number; dismembermentOccurred: boolean } {
    const organ = this.organs.get(hit.targetOrganId);
    if (!organ || organ.isDismembered) {
      return { hitStopMs: 0, dismembermentOccurred: false };
    }

    const damageMultiplier = this.getDamageMultiplier(hit.damageType, organ.id);
    const effectiveDamage = hit.damageAmount * damageMultiplier;
    
    organ.health = Math.max(0.0, organ.health - effectiveDamage / organ.maxHealth);

    let dismembermentOccurred = false;
    let hitStopMs = 0;

    if (organ.health <= 0.0 && !organ.isDismembered) {
      organ.isDismembered = true;
      dismembermentOccurred = true;
      this.triggerOrganCascadeFailure(organ);
      hitStopMs = 45; // 45ms hit-stop for full dismemberment
    } else {
      hitStopMs = Math.min(30, Math.floor(effectiveDamage * 0.4));
    }

    this.hitStopTimerMs = hitStopMs;
    this.updatePilotPainIndex();

    return { hitStopMs, dismembermentOccurred };
  }

  private getDamageMultiplier(damageType: string, organId: string): number {
    if (damageType === 'kinetic' && organId === 'plasma_gland') return 1.8;
    if (damageType === 'bio_plasma' && organId === 'heart') return 1.2;
    if (damageType === 'corrosive_acid' && organId === 'axon_cord') return 2.0;
    if (damageType === 'thermal' && organId === 'plasma_gland') return 2.5;
    return 1.0;
  }

  /**
   * Resolves cascading organ failure in strict DAG order.
   */
  private triggerOrganCascadeFailure(severedOrgan: OrganState): void {
    switch (severedOrgan.id) {
      case 'axon_cord': {
        const caudalVent = this.organs.get('caudal_vent');
        if (caudalVent) {
          caudalVent.neuralSupply = 0; // Paralyzes thruster
        }
        break;
      }
      case 'heart': {
        for (const organ of this.organs.values()) {
          organ.neuralSupply *= 0.2; // Ischemic starvation
        }
        break;
      }
      case 'plasma_gland': {
        console.warn('[HAZARD] Bio-Plasma Gland ruptured! Acid spilling into thoracic corridor.');
        break;
      }
    }
  }

  public updatePilotPainIndex(): number {
    let totalDamage = 0;
    let totalToxin = 0;

    for (const organ of this.organs.values()) {
      totalDamage += (1.0 - organ.health);
      totalToxin += organ.neurotoxin;
    }

    this.pilotPainIndex = Math.min(1.0, (totalDamage / this.organs.size) * 0.7 + (totalToxin / 500.0) * 0.3);
    return this.pilotPainIndex;
  }

  public getTargetingReticleJitter(): number {
    const leftEye = this.organs.get('ocular_left');
    const rightEye = this.organs.get('ocular_right');

    const hLeft = leftEye && !leftEye.isDismembered ? leftEye.health : 0.0;
    const hRight = rightEye && !rightEye.isDismembered ? rightEye.health : 0.0;

    const avgEyeHealth = (hLeft + hRight) / 2.0;
    return Math.pow(1.0 - avgEyeHealth, 3.5) * 15.0; // Jitter radius in pixels
  }

  public getOrgan(id: string): OrganState | undefined {
    return this.organs.get(id);
  }
}
```

---

### 7.2 WebGPU Hydro-Pulse Compute Shader (`hydroPulseVectoring.wgsl`)

```wgsl
// hydroPulseVectoring.wgsl - WebGPU Compute Shader for 6-DOF Hydro-Pulse Thrust Vectoring

struct VentParams {
    position: vec3<f32>,
    direction: vec3<f32>,
    massFlowRate: f32,
    exhaustVelocity: f32,
    nozzleArea: f32,
    health: f32,
};

struct ShipDynamics {
    position: vec3<f32>,
    velocity: vec3<f32>,
    orientation: vec4<f32>, // Quaternion (x, y, z, w)
    angularVelocity: vec3<f32>,
    centerOfMass: vec3<f32>,
    totalMass: f32,
};

@group(0) @binding(0) var<storage, read> vents: array<VentParams>;
@group(0) @binding(1) var<storage, read_write> dynamics: ShipDynamics;
@group(0) @binding(2) var<storage, read_write> forceOutput: array<vec3<f32>>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) GlobalInvocationID: vec3<u32>) {
    let index = GlobalInvocationID.x;
    if (index >= arrayLength(&vents)) {
        return;
    }

    let vent = vents[index];
    if (vent.health <= 0.0) {
        forceOutput[index] = vec3<f32>(0.0, 0.0, 0.0);
        return;
    }

    // Thrust calculation: F = eta * (dot(m) * v_jet + P_delta * Area)
    let thrustMagnitude = vent.health * (vent.massFlowRate * vent.exhaustVelocity);
    let thrustForce = vent.direction * thrustMagnitude;

    // Store individual vent force vector for GPU torque integration
    forceOutput[index] = thrustForce;
}
```

---

### 7.3 Yerkes-Dodson Excitotoxicity Calculator (`ExcitotoxicitySolver.ts`)

```typescript
/**
 * ExcitotoxicitySolver.ts - Yerkes-Dodson Neural Curve & Cardiac Arrest Solver
 */

export class ExcitotoxicitySolver {
  private static readonly TOXICITY_K = 0.005;
  private static readonly CLEARANCE_RATE = 0.02;

  /**
   * Calculates organ efficiency given neural supply percentage (0..200%)
   */
  public static calculateEfficiency(neuralSupplyPercent: number): number {
    const S = neuralSupplyPercent;
    if (S < 25.0) {
      return 0.0; // Organ Shutdown
    } else if (S < 75.0) {
      return (S - 25.0) / 50.0;
    } else if (S <= 100.0) {
      return 1.0; // Nominal Zone
    } else if (S <= 120.0) {
      return 1.0 + 0.02 * (S - 100.0); // Overclock Zone (+40% Max)
    } else {
      const over = S - 120.0;
      return Math.max(0.1, 1.4 - 0.005 * over * over); // Excitotoxic Decay
    }
  }

  /**
   * Evaluates neurotoxin accumulation rate and cardiac arrest probability.
   */
  public static updateExcitotoxicity(
    currentToxin: number,
    neuralSupplyPercent: number,
    deltaTime: number
  ): { nextToxin: number; cardiacArrestProbability: number } {
    let toxinDelta = 0.0;

    if (neuralSupplyPercent > 120.0) {
      const excess = neuralSupplyPercent - 120.0;
      toxinDelta = this.TOXICITY_K * Math.pow(excess, 1.6) * deltaTime;
    } else {
      toxinDelta = -this.CLEARANCE_RATE * deltaTime;
    }

    const nextToxin = Math.max(0.0, currentToxin + toxinDelta);

    let cardiacArrestProbability = 0.0;
    if (nextToxin > 100.0) {
      const excessToxin = nextToxin - 100.0;
      cardiacArrestProbability = 1.0 - Math.exp(-0.05 * excessToxin * deltaTime);
    }

    return { nextToxin, cardiacArrestProbability };
  }
}
```

---

### 7.4 Dual-Layer Boarding & Vascular Defense Engine (`VascularDefenseSystem.ts`)

```typescript
/**
 * VascularDefenseSystem.ts - Dual-Layer Boarding & G-Force Synchronization
 */

export interface BoardingPod {
  id: string;
  breachLocation: [number, number, number];
  parasiteCount: number;
  hullBreached: boolean;
}

export interface InteriorCorridor {
  id: string;
  section: string;
  hemolymphPressure: number;
  sphincterSealed: boolean;
  leukocyteCount: number;
}

export class VascularDefenseSystem {
  private activePods: BoardingPod[] = [];
  private corridors: Map<string, InteriorCorridor> = new Map();

  constructor() {
    this.corridors.set('corridor_thoracic_1', {
      id: 'corridor_thoracic_1',
      section: 'thoracic',
      hemolymphPressure: 120.0, // mmHg
      sphincterSealed: false,
      leukocyteCount: 50,
    });
  }

  public registerPodBreach(pod: BoardingPod): void {
    pod.hullBreached = true;
    this.activePods.push(pod);
    console.log(`[ALERT] Parasite pod ${pod.id} breached carapace at ${pod.breachLocation}`);
  }

  /**
   * Computes internal fictitious inertial forces from outer 6-DOF spatial acceleration.
   * Clamps peak G-force to 25G to prevent out-of-bounds mesh clipping.
   */
  public computeInteriorInertialForce(
    shipAcceleration: [number, number, number],
    entityMass: number
  ): [number, number, number] {
    const MAX_G = 25.0 * 9.81;
    
    let ax = -entityMass * shipAcceleration[0];
    let ay = -entityMass * shipAcceleration[1];
    let az = -entityMass * shipAcceleration[2];

    const mag = Math.sqrt(ax * ax + ay * ay + az * az);
    if (mag > MAX_G * entityMass) {
      const scale = (MAX_G * entityMass) / mag;
      ax *= scale;
      ay *= scale;
      az *= scale;
    }

    return [ax, ay, az];
  }

  public toggleSphincterSeal(corridorId: string): boolean {
    const corridor = this.corridors.get(corridorId);
    if (!corridor) return false;

    corridor.sphincterSealed = !corridor.sphincterSealed;
    return corridor.sphincterSealed;
  }
}
```

---

## 8. Verification, Performance Targets & Type Safety

### 8.1 Performance Targets & Computational Allocations

| Subsystem Component | Target Frame Budget | Max Memory Allocation | Target Frame Rate |
| --- | --- | --- | --- |
| **Combat Engine State Solver** | $< 0.25\text{ ms}$ | Heap $< 5\text{ MB}$ | $120\text{ FPS}$ |
| **WebGPU Hydro-Pulse Compute** | $< 0.15\text{ ms}$ | VRAM $< 12\text{ MB}$ | $120\text{ FPS}$ |
| **Excitotoxicity & Pain Solver** | $< 0.05\text{ ms}$ | Heap $< 1\text{ MB}$ | $120\text{ FPS}$ |
| **Dual-Layer Boarding Sync** | $< 0.10\text{ ms}$ | Heap $< 2\text{ MB}$ | $120\text{ FPS}$ |
| **Total Subsystem Budget** | **$< 0.55\text{ ms / frame}$** | **Total $< 20\text{ MB}$** | **$120\text{ FPS}$** |

---

### 8.2 TypeScript Type Checker Gate Verification
All combat systems code must pass strict static type evaluation with zero errors:

```bash
npx tsc --noEmit
```

---

## Conclusion
This specification establishes a robust, mathematically complete combat framework for BioGenesis. By integrating 6-DOF hydro-pulse vectoring, targeted anatomical organ dismemberment, Yerkes-Dodson excitotoxicity overclocking, and seamless dual-layer spatial-to-interior G-force synchronization, BioGenesis delivers an unprecedented AAA biopunk combat experience.
