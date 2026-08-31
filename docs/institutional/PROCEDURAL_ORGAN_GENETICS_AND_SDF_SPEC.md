# Institutional Specification: Procedural Organ Genetics & SDF Pipeline

**Document Identifier**: `SPEC-BIO-2026-SDF04`  
**Status**: Institutional Standard / Publication-Grade Specification  
**Author**: Subagent 4 (Procedural Biology & SDF Math Lead) — BioGenesis Double Agentic Loop  
**Target Codebase Modules**: `src/utils/sdf.ts`, `src/utils/organSDFRegistry.ts`, `src/utils/organBlending.ts`, `src/utils/tubeGeometry.ts`, `src/utils/lsystem.ts`, `src/utils/reactionDiffusion.ts`, `src/utils/dualContouring.ts`, `src/utils/subdivision.ts`  
**Date**: August 2026  

---

## Executive Summary & Table of Contents

This document establishes the mathematical, architectural, and algorithmic specification for the procedural organ genetics and Signed Distance Field (SDF) mesh generation pipeline in **BioGenesis**. In BioGenesis, living spaceships and Void-Fauna organisms are synthesized procedurally from volumetric implicit representations rather than pre-baked polygonal meshes. The SDF represents the single source of truth for organ geometry, structural framing, vascular networks, and biological surfaces.

### Table of Contents
1. [Executive Summary & Mathematical Foundations](#1-executive-summary--mathematical-foundations)
2. [Mathematical Specification of Organ SDF Primitives & Compositions](#2-mathematical-specification-of-organ-sdf-primitives--compositions)
3. [Seamless Organ Blending Matrix & Anatomical Rules](#3-seamless-organ-blending-matrix--anatomical-rules)
4. [Procedural Geometry Synthesis Algorithms](#4-procedural-geometry-synthesis-algorithms)
5. [Genetic Parameter Representation & Genome Mutation Pipeline](#5-genetic-parameter-representation--genome-mutation-pipeline)

---

## 1. Executive Summary & Mathematical Foundations

### 1.1 Volumetric Implicit Representation & Signed Distance Fields
A Signed Distance Field (SDF) is a continuous scalar mapping $f: \mathbb{R}^3 \to \mathbb{R}$ that quantifies the shortest Euclidean distance from any point $p \in \mathbb{R}^3$ to an implicit boundary surface $\mathcal{S}$. The sign of $f(p)$ designates spatial containment:

$$\mathcal{S} = \{ p \in \mathbb{R}^3 \mid f(p) = 0 \}$$
$$\Omega_{\text{interior}} = \{ p \in \mathbb{R}^3 \mid f(p) < 0 \}$$
$$\Omega_{\text{exterior}} = \{ p \in \mathbb{R}^3 \mid f(p) > 0 \}$$

An exact SDF satisfies the **Eikonal Equation** almost everywhere:

$$\| \nabla f(p) \| = \sqrt{\left(\frac{\partial f}{\partial x}\right)^2 + \left(\frac{\partial f}{\partial y}\right)^2 + \left(\frac{\partial f}{\partial z}\right)^2} = 1$$

This Lipschitz-1 continuity property ensures that step sizes during spatial ray-marching or numerical grid evaluations accurately reflect geometric bounds without overshooting or gradient instability.

### 1.2 Constructive Solid Geometry (CSG) Operators
Complex biological structures are synthesized by combining canonical SDF primitives using set-theoretic Constructive Solid Geometry (CSG) operators:

- **Hard Union** ($A \cup B$): Represents the enclosing envelope of two implicit bodies:
  $$\text{opUnion}(f_A, f_B)(p) = \min(f_A(p), f_B(p))$$

- **Hard Intersection** ($A \cap B$): Preserves only the spatial overlap:
  $$\text{opIntersection}(f_A, f_B)(p) = \max(f_A(p), f_B(p))$$

- **Hard Subtraction** ($A \setminus B$): Hollows or carves body $B$ out of body $A$:
  $$\text{opSubtraction}(f_A, f_B)(p) = \max(f_A(p), -f_B(p))$$

### 1.3 Polynomial Smooth-Min (`smin`) Blending
Hard CSG operations introduce derivative discontinuities ($C^0$ sharp creases) along intersecting boundaries. To model organic tissue transitions, BioGenesis employs Inigo Quilez's polynomial smooth-minimum operator (`opSmoothUnion`), which constructs a $C^1$-continuous blend fillet of controlled radius $k > 0$:

$$h(d_1, d_2, k) = \text{clamp}\left(0.5 + 0.5 \frac{d_2 - d_1}{2k}, 0, 1\right)$$

$$\text{smin}(d_1, d_2, k) = d_2 \cdot (1 - h) + d_1 \cdot h - k \cdot h \cdot (1 - h)$$

Where $d_1 = f_A(p)$ and $d_2 = f_B(p)$. As $k \to 0$, the function converges to hard minimum. For $k > 0$, the blending creates a smooth anatomical fillet bridging the two shapes.

```typescript
// Core C1-continuous Smooth-Min implementation (src/utils/sdf.ts)
export function opSmoothUnion(a: SDF, b: SDF, k: number): SDF {
  return (p: THREE.Vector3) => {
    const d1 = a(p);
    const d2 = b(p);
    const h = Math.max(0, Math.min(0.5 + 0.5 * (d2 - d1) / (k * 2), 1));
    return d2 * (1 - h) + d1 * h - k * h * (1 - h);
  };
}
```

The corresponding smooth subtraction (`opSmoothSubtraction`) and smooth intersection (`opSmoothIntersection`) operators are defined analogously:

$$\text{ssub}(d_1, d_2, k) = \text{smin}(d_1, -d_2, k) \quad \text{with } h = \text{clamp}\left(0.5 - 0.5 \frac{d_2 + d_1}{2k}, 0, 1\right)$$

$$\text{sinter}(d_1, d_2, k) = d_2 (1 - h) + d_1 h + k h (1 - h) \quad \text{with } h = \text{clamp}\left(0.5 + 0.5 \frac{d_2 - d_1}{2k}, 0, 1\right)$$

### 1.4 Spatial Domain Transformations
Spatial transformations mutate the domain evaluation point $p$ prior to evaluating the core SDF $f$:

| Transformation | Mathematical Formulation | TypeScript Function |
| :--- | :--- | :--- |
| **Translation** | $f_{\text{trans}}(p) = f(p - v)$ | `opTranslate(sdf, offset)` |
| **Rotation** | $f_{\text{rot}}(p) = f(R^{-1} p)$ | `opRotate(sdf, rotationMatrix)` |
| **Uniform Scale** | $f_{\text{scale}}(p) = s \cdot f(p / s)$ | `opScale(sdf, scale)` |
| **Affine Transform** | $f_{\text{transform}}(p) = f(M^{-1} p)$ | `opTransform(sdf, matrix4)` |
| **Y-Axis Twist** | $p' = \begin{pmatrix} \cos(\theta y) p_x - \sin(\theta y) p_z \\ y \\ \sin(\theta y) p_x + \cos(\theta y) p_z \end{pmatrix}, f_{\text{twist}}(p) = f(p')$ | `opTwist(sdf, twistAmount)` |
| **X-Axis Bend** | $p' = \begin{pmatrix} \cos(\theta x) p_x - \sin(\theta x) p_y \\ \sin(\theta x) p_x + \cos(\theta x) p_y \\ p_z \end{pmatrix}, f_{\text{bend}}(p) = f(p')$ | `opBend(sdf, bendAmount)` |
| **Noise Displacement** | $f_{\text{displace}}(p) = f(p) + d(p)$ | `opDisplace(sdf, displacementFn)` |

---

## 2. Mathematical Specification of Organ SDF Primitives & Compositions

### 2.1 Geometric Primitives
All 15+ organ types are constructed by compositing eight mathematical primitives defined in `src/utils/sdf.ts`.

```
           [Sphere]           [Box]          [Ellipsoid]        [Capsule]
          x² + y² + z²      |x|,|y|,|z|     (x/a)²+(y/b)²     Axis-Clamped
               │              │                   │                 │
               └──────────────┼───────────────────┴─────────────────┘
                              ▼
                     [SDF Composition Engine]
                              │
                    (smin / CSG / Noise)
                              │
                              ▼
                  [Organ Isosurface Extraction]
```

#### 1. Sphere Primitive (`sdSphere`)
$$f_{\text{sphere}}(p, r) = \| p \| - r$$

#### 2. Axis-Aligned Box Primitive (`sdBox`)
Given half-extents vector $e = (e_x, e_y, e_z)^T$:
$$q = |p| - e = (|p_x| - e_x, |p_y| - e_y, |p_z| - e_z)^T$$
$$f_{\text{box}}(p, e) = \| \max(q, \mathbf{0}) \| + \min(\max(q_x, \max(q_y, q_z)), 0)$$

#### 3. Y-Axis Capsule Primitive (`sdCapsule`)
Given radius $r$ and half-height $h$:
$$y_{\text{clamped}} = \text{clamp}(p_y, -h, h)$$
$$d = (p_x, p_y - y_{\text{clamped}}, p_z)^T$$
$$f_{\text{capsule}}(p, r, h) = \| d \| - r$$

#### 4. XZ-Plane Torus Primitive (`sdTorus`)
Given major radius $R$ and minor radius $r$:
$$q = \left( \sqrt{p_x^2 + p_z^2} - R, \; p_y \right)^T$$
$$f_{\text{torus}}(p, R, r) = \| q \| - r$$

#### 5. Y-Axis Cone Primitive (`sdCone`)
Given base radius $r$ and height $h$ with apex at $(0, h, 0)^T$:
$$q = \left( \sqrt{p_x^2 + p_z^2}, \; p_y \right)^T$$
$$c_a = (-r, h)^T, \quad c_b = q - (0, h)^T$$
$$k_{\text{proj}} = \text{clamp}\left( \frac{c_b \cdot c_a}{c_a \cdot c_a}, 0, 1 \right)$$
$$d = c_b - c_a \cdot k_{\text{proj}}$$
$$f_{\text{cone}}(p, r, h) = \text{sign}(c_a \cdot c_b^\perp) \cdot \| d \|$$

#### 6. Y-Axis Cylinder Primitive (`sdCylinder`)
Given radius $r$ and half-height $h$:
$$d = \left( \sqrt{p_x^2 + p_z^2} - r, \; |p_y| - h \right)^T$$
$$f_{\text{cylinder}}(p, r, h) = \min(\max(d_x, d_y), 0) + \| \max(d, \mathbf{0}) \|$$

#### 7. Ellipsoid Primitive (`sdEllipsoid`)
Given semi-axis radii vector $r = (a, b, c)^T$:
$$k_0 = \sqrt{\frac{p_x^2}{a^2} + \frac{p_y^2}{b^2} + \frac{p_z^2}{c^2}}, \quad k_1 = \sqrt{\frac{p_x^2}{a^4} + \frac{p_y^2}{b^4} + \frac{p_z^2}{c^4}}$$
$$f_{\text{ellipsoid}}(p, r) = \frac{k_0 (k_0 - 1)}{k_1}$$

#### 8. Infinite Plane Primitive (`sdPlane`)
Given unit normal vector $\hat{n}$ and offset $h$:
$$f_{\text{plane}}(p, \hat{n}, h) = p \cdot \hat{n} + h$$

---

### 2.2 Composited Organ SDF Specifications Across 5 Pipelines
BioGenesis registers 15 distinct organ types across five biological functional pipelines in `src/utils/organSDFRegistry.ts`.

| Pipeline | Organ Node ID | Primitive Composition Technique | Extraction Algorithm | Category |
| :--- | :--- | :--- | :--- | :--- |
| **Bio-Plasma** | `plasma_gland` | Cone($0.6r, 1.2r$) $\oplus_{\text{smin}}$ Sphere($0.5r$) + Worley noise | Marching Cubes (32³) | `generation` |
| | `plasma_bladder` | Ellipsoid($r, 0.8r, 1.2r$) $\oplus_{\text{smin}}$ Sphere($0.6r$) $\ominus_{\text{smin}}$ Sphere($0.4r$) + Warped fBm | Marching Cubes (32³) | `storage` |
| | `siphon_vent_nozzle` | Cone($0.4r, 1.5r$) $\oplus_{\text{smin}}$ Cylinder($0.3r, 0.3r$) | Dual Contouring (28³) | `effector` |
| | `disruptor_gland` | Cone($0.5r, 1.5r$) $\oplus_{\text{smin}}$ Box($0.3r, 0.3r, 0.3r$) + Y-Twist | Dual Contouring (32³) | `effector` |
| **Hemolymph** | `heart_core` | Quad-chamber Ellipsoid($r, 0.7r, 0.8r$) $\oplus_{\text{smin}}$ Spheres + fBm noise | Marching Cubes (36³) | `generation` |
| | `hemolymph_atrium` | Pulsating Ellipsoid($r, 1.1r, 0.9r$) $\oplus_{\text{smin}}$ Sphere($0.5r$) + fBm noise | Marching Cubes (32³) | `storage` |
| **Nervous** | `brain_core` | Folded Ellipsoid($r, 0.8r, 0.9r$) + High-freq 6-octave fBm Cortical Folds | Marching Cubes (40³) | `generation` |
| | `ocular_pod` | Sensor Sphere($r$) $\oplus_{\text{smin}}$ Stalk Capsule($0.2r, 0.3r$) | Marching Cubes (28³) | `effector` |
| **Life Support** | `ice_gizzard` | Cryo Ellipsoid($r, 0.9r, 1.1r$) $\oplus_{\text{smin}}$ Sphere($0.4r$) + Worley noise | Marching Cubes (32³) | `generation` |
| | `bio_moss` | Photosynthetic Sphere($r$) + Warped fBm Surface Distortion | Marching Cubes (32³) | `generation` |
| | `habitat_chamber` | Hollow Crew Sphere($r$) $\ominus_{\text{smin}}$ Inner Sphere($0.85r$) + fBm noise | Marching Cubes (28³) | `storage` |
| **Armor & Defense**| `chitin_vertebra` | Spine Box($0.8r, 0.3r, 0.8r$) $\oplus_{\text{smin}}$ Canal Torus($0.6r, 0.15r$) | Dual Contouring (24³) | `structural` |
| | `carapace_plate` | Curved Shell Box($r, 0.15r, 0.8r$) + Surface fBm noise | Dual Contouring (24³) | `defense` |
| | `bio_nanite_bed` | Porous Matrix Sphere($r$) $\ominus_{\text{smin}}$ Core + Worley Cavities | Marching Cubes (32³) | `defense` |
| | `shield_emitter` | Crystalline Octahedron $|x| + |y| + |z| - r$ | Dual Contouring (24³) | `defense` |

#### Detailed Mathematical Blueprint: Bio-Plasma Bladder (`plasma_bladder`)
The plasma bladder models a muscular internal storage volume with a secondary sphincter mass and internal fluid cavity:

$$f_{\text{outer}}(p) = f_{\text{ellipsoid}}\left(p, (r, 0.8r, 1.2r)^T\right)$$
$$f_{\text{lobe}}(p) = f_{\text{sphere}}(p, 0.6r)$$
$$f_{\text{mass}}(p) = \text{smin}\left(f_{\text{outer}}(p), f_{\text{lobe}}(p), 0.3r\right)$$
$$f_{\text{cavity}}(p) = f_{\text{sphere}}(p, 0.4r)$$
$$f_{\text{structural}}(p) = \text{ssub}\left(f_{\text{mass}}(p), f_{\text{cavity}}(p), 0.15r\right)$$
$$f_{\text{bladder}}(p) = f_{\text{structural}}(p - c) + \text{fBm}_{\text{warped}}(p, \text{freq}=2/r, \text{amp}=0.05r)$$

---

## 3. Seamless Organ Blending Matrix & Anatomical Rules

### 3.1 Architecture of the `BlendBridgeManager`
The `BlendBridgeManager` (`src/utils/organBlending.ts`) governs the physical connection fillets between organs, conduits, and the outer hull carapace. It generates discrete bridge meshes that overlap parent geometry, avoiding expensive full-ship volumetric re-evaluations while yielding seamless visual integration.

```
       [Hull Spine Nodes] ────────► [Analytic Swept-Sphere Hull SDF]
                                                   │
   [Entity A] + [Entity B]                         │
            │                                      │
            ▼                                      ▼
   [evaluateBlend(A, B)] ──────► [Blend Bridge Generator (smin)]
            │                                      │
  (Approved / Declined)                            ▼
            │                         [Marching Cubes Isosurface]
            ▼                                      │
   [Render / Collar] ◄─────────────────────────────┘
```

### 3.2 Analytic Swept-Sphere Hull SDF Approximation
Converting the complex parametric hull mesh into a runtime SDF is computationally intractable. BioGenesis solves this by evaluating an analytic swept-sphere SDF derived from the 11 hull spine nodes (`SpineNode[]`):

$$\text{sampleSpine}(z) \to \{ c_x(z), c_y(z), c_z(z), r(z) \}$$

To account for the flattened leviathan cross-section profile, the query point $p$ is scaled vertically by the height factor $h_f \approx 0.84$:

$$p' = \left( p_x, \; c_y(z) + \frac{p_y - c_y(z)}{h_f}, \; p_z \right)^T$$

$$f_{\text{hull}}(p) = \min_{z \in [z_{\text{min}}, z_{\text{max}}]} \left( \sqrt{(p'_x - c_x(z))^2 + (p'_y - c_y(z))^2 + (p'_z - z)^2} - r(z) \right)$$

### 3.3 Complete Anatomical Blend Rules Decision Matrix
Every potential structural pairing is evaluated sequentially against a data-driven rules registry (`RULES` array in `src/utils/organBlending.ts`). The first matching rule emits a `BlendDecision`:

$$\text{BlendDecision} = \{ \text{shouldBlend}: \mathbb{B}, \text{blendRadius } k \in \mathbb{R}^+, \text{materialRole} \in \{\text{'carapace'}, \text{'flesh'}, \text{'vein'}\}, \text{reason}: \text{String} \}$$

| Rule ID | Entity Pair Source ($A$) | Entity Pair Target ($B$) | Blend Approved? | Blend Radius ($k$) | Material Role | Anatomical Justification |
| :---: | :--- | :--- | :---: | :---: | :---: | :--- |
| **1** | Conduit (all 19 types) | Pipeline Organ Node | **YES** | $0.20\,\text{m}$ | `vein` | Vascular conduits root seamlessly into organ entrance manifolds. |
| **2** | Auto-wire Vein | Candidate Organ | **YES** | $0.12\,\text{m}$ | `vein` | Central aorta auto-wire veins root into candidate organ sockets. |
| **3** | Exoskeleton Node | Hull Carapace | **YES** | $0.15\,\text{m}$ | `carapace` | Fixed surface effectors (thrusters, airlocks, vents) grow from chitin. |
| **4a** | Eye Pod Candidate | Hull Carapace | **YES** | $0.15\,\text{m}$ | `carapace` | Eye stalks root seamlessly into cranial carapace plates. |
| **4b** | Neural Node Candidate | Hull Carapace | **YES** | $0.12\,\text{m}$ | `carapace` | Surface sensory ganglia blend into outer skin. |
| **4c** | Spore Sac Candidate | Hull Carapace | **YES** | $0.14\,\text{m}$ | `flesh` | Weapon pod bases grow organically from skin layer. |
| **4d** | Fins / Fluke / Sail | Hull Carapace | **YES** | $0.25\,\text{m}$ | `carapace` | Dynamic flight membranes fillet seamlessly into main hull. |
| **5a** | Heart Core | Hemolymph Atrium | **YES** | $0.25\,\text{m}$ | `vein` | Atrium is an immediate cardiac extension of the pumping chamber. |
| **5b** | Brain Core | Neuro-Link | **YES** | $0.15\,\text{m}$ | `flesh` | Neuro-link conduit plugs directly into cerebral mass. |
| **5c** | Plasma Gland | Plasma Bladder | **YES** | $0.18\,\text{m}$ | `flesh` | Electrolysis gland feeds directly into primary storage bladder. |
| **5d** | Carapace Plate | Bio-Nanite Bed | **YES** | $0.15\,\text{m}$ | `flesh` | Repair nanite bed resides sub-dermally against chitin plating. |
| **5e** | Bio-Nanite Bed | Shield Emitter | **YES** | $0.12\,\text{m}$ | `flesh` | Nanite matrix supplies structural energy to shield generator. |
| **5f** | Chitin Vertebra | Carapace Plate | **YES** | $0.15\,\text{m}$ | `carapace` | Internal spinal vertebra supports external armor plate. |
| **6** | Habitat Chamber | Cyber Airlock | **YES** | $0.20\,\text{m}$ | `flesh` | Pressurized crew habitat connects seamlessly to hallway airlock. |
| **7** | Internal Organ Node | Hull Carapace | **NO** | $0.00\,\text{m}$ | `flesh` | Internal organs reside in body cavity; must not fuse to outer skin. |
| **8a** | Tentacle Appendage | Hull Carapace | **NO** | $0.00\,\text{m}$ | `flesh` | Uses dynamic FABRIK IK animation; static SDF bridge would detach. |
| **8b** | Spiracle Gill Vent | Hull Carapace | **NO** | $0.00\,\text{m}$ | `carapace` | Flexes during breathing cycles; retained via socket collar. |
| **8c** | Chitin Rib Spur | Hull Carapace | **NO** | $0.00\,\text{m}$ | `carapace` | Discrete structural armor segment; no hull blending. |
| **9** | Habitat Chamber | Non-Airlock Entity | **NO** | $0.00\,\text{m}$ | `flesh` | Pressurized crew module isolated from all non-hallway organs. |
| **10** | Conduit | Hull Carapace | **NO** | $0.00\,\text{m}$ | `vein` | Vascular conduits remain internal; do not pierce hull surface. |
| **11** | Conduit | Conduit | **NO** | $0.00\,\text{m}$ | `vein` | Conduits branch at discrete manifold junctions. |
| **12** | Cross-Pipeline Node | Cross-Pipeline Node | **NO** | $0.00\,\text{m}$ | `flesh` | Organs across distinct functional pipelines remain discrete. |
| **13** | Candidate Organ | Internal Pipeline Node | **NO** | $0.00\,\text{m}$ | `flesh` | Candidate organs belong to exterior layer; no direct interior blend. |
| **14** | Candidate Organ | Candidate Organ | **NO** | $0.00\,\text{m}$ | `flesh` | External appendages separated by force-field solver. |

---

## 4. Procedural Geometry Synthesis Algorithms

### 4.1 Rotation-Minimizing Bishop Frames & Tube Synthesis
Standard Frenet-Serret frames $(\mathbf{T}, \mathbf{N}, \mathbf{B})$ collapse or undergo catastrophic $180^\circ$ twisting at curve inflection points where curvature $\kappa(s) = 0$. BioGenesis implements the **Bishop Frame** (Rotation-Minimizing Frame, RMF) parallel transport algorithm using the double-reflection method (Wang et al., 2008) in `src/utils/tubeGeometry.ts`.

Given a discrete space curve points $x_i$ and normalized unit tangents $t_i$:

1. **First Reflection**: Reflect frame $\mathbf{u}_{i-1}$ across the bisecting plane of vector $v_1 = x_i - x_{i-1}$:
   $$c_1 = v_1 \cdot v_1, \quad f_1 = \frac{2}{c_1} v_1$$
   $$n_1 = n_{i-1} - f_1 (n_{i-1} \cdot v_1), \quad t_0^R = t_{i-1} - f_1 (t_{i-1} \cdot v_1)$$

2. **Second Reflection**: Reflect $n_1$ across the bisecting plane between $t_0^R$ and target tangent $t_i$:
   $$v_2 = t_i - t_0^R, \quad c_2 = v_2 \cdot v_2, \quad f_2 = \frac{2}{c_2} v_2$$
   $$n_i = n_1 - f_2 (n_1 \cdot v_2), \quad b_i = t_i \times n_i$$

```typescript
// Double-reflection Bishop Frame computation (src/utils/tubeGeometry.ts)
export function computeBishopFrames(
  points: THREE.Vector3[],
  tangents: THREE.Vector3[],
  initialNormal?: THREE.Vector3,
): { normal: THREE.Vector3; binormal: THREE.Vector3 }[] {
  // Parallel transport normal vector n_i along the discrete spline curve
  // via two reflections per step, eliminating Frenet twisting artifacts.
  // ... (Full implementation in src/utils/tubeGeometry.ts)
}
```

#### Tube Cross-Section & Variable Radius Functions
Vertices along the tube surface are evaluated at length parameter $t \in [0, 1]$ and azimuthal angle $\phi \in [0, 2\pi]$:

$$v(t, \phi) = x(t) + r(t, \phi) \cdot \left[ \cos(\phi) \mathbf{n}(t) + \sin(\phi) \mathbf{b}(t) \right]$$

Supported radius functions $r(t, \phi)$:
- **Linear Taper**: $r(t) = r_0 \cdot \left[1 - (1 - \alpha) t\right]$
- **Organic Noise Taper**: $r(t, \phi) = r_0 \cdot \left[ (1 - (1 - \alpha) t) + A \sin(2\pi f t + 3\phi) \right]$
- **Pulsating Arterial Radius**: $r(t, t_{\text{anim}}) = r_0 \cdot \left[1 + A_{\text{pulse}} \sin(2\pi f_{\text{pulse}} t + t_{\text{anim}})\right]$

---

### 4.2 Space Colonization & Murray's Law Scaling
Space colonization (`src/utils/lsystem.ts`) synthesizes space-filling vascular and neural networks (Runions et al., 2007).

#### Space Colonization Algorithm
1. Uniformly distribute $N_{\text{pts}}$ attraction points $p_a \in V_{\text{target}}$ inside the target volume.
2. For each active attraction point $p_a$, identify the closest tree node $n_{\text{close}}$ within influence radius $d_{\text{inf}}$.
3. Compute normalized growth direction for each node:
   $$\vec{D}(n) = \text{normalize}\left( \sum_{p_a \in \text{Attr}(n)} \frac{p_a - x_n}{\| p_a - x_n \|} \right)$$
4. Extend new child node $n_{\text{child}}$ at $x_n + \Delta s \cdot \vec{D}(n)$.
5. Deactivate attraction points within kill distance $d_{\text{kill}}$ of any tree node.

```
       [Attraction Points in Volume]
                  │
                  ▼
       [Find Closest Tree Node]
                  │  (within d_inf)
                  ▼
      [Accumulate Direction Vectors]
                  │
                  ▼
     [Grow Child Segment (Δs step)]
                  │
                  ▼
       [Kill Points within d_kill]
                  │
                  ▼
       [Apply Murray's Law Radius]
```

#### Murray's Law Vascular Branching
Biological transport efficiency dictates that the cube of the parent vessel radius equals the sum of the cubes of the daughter branch radii (Murray, 1926):

$$r_{\text{parent}}^m = \sum_{i=1}^{K} r_{\text{child}, i}^m \quad \text{with } m = 3.0$$

In `colonizeSpace()`, radii are computed in a bottom-up pass starting from leaf nodes ($r_{\text{leaf}} = r_{\text{min}}$):

$$r_{\text{node}} = \left( \sum_{c \in \text{Children}} r_c^3 \right)^{1/3}$$

---

### 4.3 Surface Nets & Dual Contouring for Chitin Armor
While Marching Cubes extracts smooth isosurfaces by interpolating along grid edges, it rounds off sharp geometric features. Dual Contouring (`src/utils/dualContouring.ts`) preserves sharp chitin plate edges and crystalline facets by solving a Quadratic Error Function (QEF) inside each sign-changing grid cell.

#### Quadratic Error Function (QEF) Minimization
For a cell containing edge intersection points $p_i$ with surface normals $n_i = \nabla f(p_i)$:

$$E(x) = \sum_{i=1}^{K} \left[ n_i \cdot (x - p_i) \right]^2 = x^T A x - 2 x^T b + c$$

Where:
$$A = \sum_{i=1}^{K} n_i n_i^T \in \mathbb{R}^{3 \times 3}, \quad b = \sum_{i=1}^{K} (n_i \cdot p_i) n_i \in \mathbb{R}^3$$

The optimal sharp vertex position $x^*$ minimizes $E(x)$:

$$A x^* = b \implies x^* = A^{-1} b$$

To ensure numerical stability when normal vectors are near-parallel (rank-deficient $A$), BioGenesis applies Tikhonov regularization with a diagonal shift $\epsilon = 10^{-3}$ and clamps $x^*$ to the cell mass point $\bar{p} = \frac{1}{K} \sum p_i$ if $\| x^* - \bar{p} \| > 2.0$:

$$(A + \epsilon I) x^* = b$$

---

### 4.4 Gray-Scott Reaction-Diffusion Surface Textures
Bioluminescent surface patterns (veins, spots, maze-like stripes) are synthesized by integrating the two-component non-linear **Gray-Scott Reaction-Diffusion PDE** (`src/utils/reactionDiffusion.ts`):

$$\frac{\partial A}{\partial t} = D_A \nabla^2 A - A B^2 + f (1 - A)$$

$$\frac{\partial B}{\partial t} = D_B \nabla^2 B + A B^2 - (k + f) B$$

Where $A$ is the substrate reactant, $B$ is the autocatalytic bioluminescent agent, $D_A = 1.0$, $D_B = 0.5$, $f$ is the feed rate, and $k$ is the kill rate.

#### Discretization Stencil
The 2D Laplacian $\nabla^2$ is evaluated using a 9-point isotropic finite-difference convolution kernel:

$$\mathbf{K}_{\nabla^2} = \begin{pmatrix} 0.05 & 0.20 & 0.05 \\ 0.20 & -1.00 & 0.20 \\ 0.05 & 0.20 & 0.05 \end{pmatrix}$$

#### BioGenesis Pattern Presets
| Preset Key | Feed Rate ($f$) | Kill Rate ($k$) | Visual Phenotype Description |
| :--- | :---: | :---: | :--- |
| `spots` | 0.0367 | 0.0649 | Discrete bioluminescent polka-dots |
| `stripes` | 0.0140 | 0.0450 | Parallel tiger-stripe light bands |
| `maze` | 0.0290 | 0.0570 | Labyrinthine Turing organ maze |
| `bioluminescent_veins` | 0.0220 | 0.0510 | Pulsating vascular energy conduits |
| `void_fauna_maze` | 0.0280 | 0.0550 | Deep-space alien organism skin pattern |
| `abyssal_spots` | 0.0400 | 0.0700 | Saturated bioluminescent cluster nodes |
| `acid_bubbles` | 0.0180 | 0.0470 | Organic cellular bubble clusters |

The simulation outputs dual RGBA `THREE.DataTexture` maps: a diffuse color map and an emissive glow map ($B > 0.3$).

---

### 4.5 Catmull-Clark Creased Subdivision & Taubin Smoothing
To refine coarse organ and hull control meshes, BioGenesis provides Catmull-Clark subdivision (`src/utils/subdivision.ts`) enhanced with Pixar semi-sharp creases (DeRose et al., 1998) and shrinkage-free Taubin smoothing.

#### Catmull-Clark Refinement Rules
For each face $F$, edge $E$, and vertex $V$:
- **Face Point** $F'$: Centroid of all vertices defining the face.
- **Edge Point** $E'$: Average of edge endpoints and adjacent face points:
  $$E' = \frac{v_1 + v_2 + F'_1 + F'_2}{4}$$
- **Vertex Point** $V'$: Weighted linear combination:
  $$V' = \frac{Q}{n} + \frac{2 R}{n} + \frac{(n - 3) S}{n}$$
  Where $Q = \frac{1}{n} \sum F'$, $R = \frac{1}{n} \sum \frac{v_1 + v_2}{2}$, $S = V$, and $n$ is vertex valence.

#### Semi-Sharp Creases
Edges store a fractional sharpness parameter $s \ge 0$. During each subdivision step, if $s > 0$, the edge point calculation blends between the smooth point $E'_{\text{smooth}}$ and the sharp edge midpoint $E'_{\text{sharp}} = \frac{v_1 + v_2}{2}$:

$$w = \frac{s}{s + 1}, \quad E' = (1 - w) E'_{\text{smooth}} + w E'_{\text{sharp}}$$

The sharpness decays linearly at each iteration: $s \to \max(0, s - 1)$.

#### Taubin Shrinkage-Free Laplacian Smoothing
Standard Laplacian smoothing causes significant mesh shrinkage. Taubin smoothing counteracts volume loss by oscillating two smoothing passes with scale factors $\lambda > 0$ and $\mu < 0$ satisfying $\frac{1}{\lambda} + \frac{1}{\mu} < 0$ (default $\lambda = 0.5, \mu = -0.53$):

$$\Delta x_i = \frac{1}{|N(i)|} \sum_{j \in N(i)} (x_j - x_i)$$
$$\text{Pass 1}: x_i' = x_i + \lambda \Delta x_i \quad (\text{Smoothing/Expansion})$$
$$\text{Pass 2}: x_i'' = x_i' + \mu \Delta x_i' \quad (\text{Anti-Shrinkage Shrink})$$

---

## 5. Genetic Parameter Representation & Genome Mutation Pipeline

### 5.1 Genotype-to-Phenotype Architecture
In BioGenesis, an organism's genetic code is represented as a normalized continuous chromosome vector $\mathbf{g} \in [0, 1]^N$. The genotype-to-phenotype mapping transforms $\mathbf{g}$ into structural SDF parameters, organ bounds, blend radii, and reaction-diffusion parameters.

```
       [Chromosome Vector g ∈ [0, 1]^N]
                      │
                      ▼
   [Gene Loci Unpacking & Scaling Engine]
                      │
        ┌─────────────┼──────────────┐
        ▼             ▼              ▼
   [SDF Params] [Blend Radii] [Pattern Genes]
        │             │              │
        └─────────────┼──────────────┘
                      ▼
        [Procedural Organ Synthesis]
                      │
                      ▼
        [Anatomical Viability Gate]
```

### 5.2 Gene Loci Schema & Mapping Matrix
The chromosome vector $\mathbf{g}$ is partitioned into functional gene loci mapping directly to procedural engine parameters:

| Locus Index | Gene Symbol | Target Procedural Parameter | Mapping Equation | Phenotypic Range |
| :---: | :--- | :--- | :--- | :--- |
| `g[0]` | `GENE_LENGTH` | Ship Total Length | $L = 6.0 + 24.0 \cdot g[0]$ | $6.0\,\text{m} \dots 30.0\,\text{m}$ |
| `g[1]` | `GENE_SCALE_RAD` | Hull Midbody Base Radius | $R_{\text{base}} = 1.0 + 3.5 \cdot g[1]$ | $1.0\,\text{m} \dots 4.5\,\text{m}$ |
| `g[2]` | `GENE_HEART_SIZE` | Heart Core Radius $r_{\text{heart}}$ | $r = 0.4 + 0.8 \cdot g[2]$ | $0.4\,\text{m} \dots 1.2\,\text{m}$ |
| `g[3]` | `GENE_BRAIN_FOLDS` | Brain Cortical Noise Freq | $f = 4.0 + 8.0 \cdot g[3]$ | $4.0 \dots 12.0\,\text{rad/m}$ |
| `g[4]` | `GENE_BLEND_K` | Master SDF Blend Radius $k$ | $k = 0.05 + 0.35 \cdot g[4]$ | $0.05\,\text{m} \dots 0.40\,\text{m}$ |
| `g[5]` | `GENE_RD_FEED` | Reaction-Diffusion Feed Rate $f$ | $f = 0.010 + 0.070 \cdot g[5]$ | $0.010 \dots 0.080$ |
| `g[6]` | `GENE_RD_KILL` | Reaction-Diffusion Kill Rate $k$ | $k = 0.040 + 0.030 \cdot g[6]$ | $0.040 \dots 0.070$ |
| `g[7]` | `GENE_ARMOR_THICK` | Carapace Plate Thickness | $t = 0.05 + 0.25 \cdot g[7]$ | $0.05\,\text{m} \dots 0.30\,\text{m}$ |
| `g[8]` | `GENE_TENT_CURL` | Tentacle Helical Curl Factor | $C = 0.1 + 0.9 \cdot g[8]$ | $0.1 \dots 1.0$ |
| `g[9]` | `GENE_MURRAY_EXP` | Vascular Branching Exponent | $m = 2.5 + 1.0 \cdot g[9]$ | $2.5 \dots 3.5$ |

---

### 5.3 Procedural Mutation & Crossover Operators

#### 1. Adaptive Gaussian Mutation
During asexual reproduction or radiation exposure, each gene locus $g_i$ undergoes adaptive Gaussian perturbation:

$$g_i' = \text{clamp}\left( g_i + \mathcal{N}\left(0, \; \sigma_i^2 \cdot \mu_{\text{rate}}\right), \; 0, \; 1 \right)$$

Where $\mu_{\text{rate}} \in (0, 1]$ is the global mutation rate and $\sigma_i$ is the locus volatility.

#### 2. Simulated Binary Crossover (SBX)
For sexual genetic combination between two parent genomes $\mathbf{g}^A$ and $\mathbf{g}^B$, Simulated Binary Crossover generates offspring alleles with distribution index $\eta = 2$:

$$u \sim U(0, 1)$$

$$\beta = \begin{cases} (2u)^{\frac{1}{\eta + 1}} & \text{if } u \le 0.5 \\ \left(\frac{1}{2(1 - u)}\right)^{\frac{1}{\eta + 1}} & \text{if } u > 0.5 \end{cases}$$

$$g_i^{\text{child1}} = 0.5 \left[ (1 + \beta) g_i^A + (1 - \beta) g_i^B \right]$$
$$g_i^{\text{child2}} = 0.5 \left[ (1 - \beta) g_i^A + (1 + \beta) g_i^B \right]$$

---

### 5.4 Phenotypic Anatomical Viability Constraints
Before synthesizing 3D geometry from mutated chromosomes, the phenotype must pass four non-negotiable viability gates:

1. **Volume Conservation Constraint**: Total organ volume must not exceed internal hull cavity volume:
   $$\sum_{i \in \text{Organs}} V(O_i) \le 0.65 \cdot V_{\text{hull}}$$

2. **Neural Compute Budget Constraint**: Intelligence scaling must conform to Haller's rule and Jerison allometry:
   $$E_{\text{brain}} = 0.12 \cdot V_{\text{ship}}^{0.67} \cdot \text{EQ} \le 0.25 \cdot E_{\text{total}}$$

3. **Geometrical Non-Collision Constraint**: Hard organ bounding spheres must satisfy anatomical clearance exclusion rules enforced by `Canvas3D.tsx`'s 35-pass force-field solver.

4. **Vascular Continuity Constraint**: Every organ must be reachable from the main aorta via space colonization vascular trees.

---

## 6. Verification & Compilation Instructions

To verify that the procedural biology, SDF compositions, blending rules, and synthesis modules compile cleanly without type errors or broken dependencies, run the static gate check from the BioGenesis root:

```bash
cd BioGenesis
npx tsc --noEmit
npm run build
```

This specification represents the official, binding architecture for procedural organ generation in the BioGenesis engine. All future organ types and procedural shaders must adhere to the SDF formulations and anatomical rules detailed herein.
