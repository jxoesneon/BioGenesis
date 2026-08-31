# AAA+ UI/UX, Spatial Hologram & Accessibility Engineering Specification
**Institutional Specification Document — BioGenesis Engine Core**
**Document Reference**: `BIO-SPEC-2026-UIUX-007`  
**Version**: 2.4.0-PROD  
**Author**: Subagent G (UI/UX, Spatial Hologram & A11y Spec Lead)  
**Status**: Institutional Standard / Mandatory Implementation  
**Target Systems**: BioGenesis Engine (TypeScript 5.x / React 19 / Three.js r170 / WebGL2 / WebGPU WGSL / GLSL ES 3.0)  

---

## 1. Executive Summary & Aesthetic Architecture

### 1.1 Scope & Operational Purpose
This specification establishes the institutional engineering standards for the visual, spatial, optical, interactive, and accessibility subsystems of **BioGenesis**. BioGenesis demands an unprecedented interactive paradigm: bridging the ultra-clean, familiar control surfaces of human spacefarers with the living, alien, bioluminescent biology of Void-Fauna ships.

The user interface is not a flat two-dimensional overlay slapped onto a 3D viewport; it is a **physical, spatial, optically refracting multi-layered construct** existing inside the living cockpit of the vessel. The engine must seamlessly manage real-time refraction, volumetric raymarching, neural pain post-processing, WCAG AAA accessibility compliance, and multi-device input normalization without exceeding a 16.6ms frame budget (60 FPS) on standard hardware or 11.1ms (90 FPS) in VR head-mounted displays.

```
+-----------------------------------------------------------------------------------------------+
|                                  BIOGENESIS COCKPIT UI LAYERS                                 |
|                                                                                               |
|  [ LAYER 1: INTERFACE LAYER ]  --> Frutiger Aero Glossy White Glass, Cyan/Amber Accents       |
|  [ LAYER 2: STRUCTURE LAYER ]  --> Heavy Ribbed Bio-Frame, Chitin Hardpoints, Anchor Rings    |
|  [ LAYER 3: BIOLOGY LAYER ]    --> Translucent Organ Chambers, Pulsing Vascular Hemolymph     |
|  [ LAYER 4: ENVIRONMENT LAYER] --> External Deep-Space Bio-Nebulae, Hydrothermal Vents        |
|  [ LAYER 5: ANCIENT LAYER ]    --> Architect-Green Precursor Glyphs & Brutalist Bio-Monoliths  |
+-----------------------------------------------------------------------------------------------+
```

### 1.2 The Five Aesthetic Layers & Frutiger Aero Synergy
As established in `LIVING_SHIPS_RESEARCH.md`, BioGenesis structures the living ship into five concentric aesthetic layers. The UI/UX architecture primarily operates at the intersection of **Layer 1 (The Interface Layer)** and **Layer 3 (The Biology Layer)**.

1. **Layer 1: Interface Layer (Frutiger Aero / Skeuomorphic Futurism)**:
   - **Tactile Comfort Bubble**: The human pilot interacts with glossy white surfaces (`#F4F7F6`, `#FFFFFF`), rounded organic curves (border radius $16\text{px} - 32\text{px}$), ultra-high gloss specular reflections, and vibrant signal accents (Cyan `#00CED1`, Electric Orange `#FF6B35`, Solar Yellow `#FFD23F`).
   - **Translucent Bio-Panels**: Glass panels are optically active (Index of Refraction $IOR = 1.48$), utilizing Kawase dual-filter background blur and chromatic dispersion ($\Delta n = 0.03$).
   - **Subnautica Tension Principle**: Translucent sections of the clean interface reveal the underlying biological engine. The pilot sits inside a clean, friendly environment, but warm amber bioluminescent light (`#FFB347`) showing through the glass constantly reminds them that the ship is a living, breathing alien organism.

2. **Layer 2: Structure Layer (Cassette Futurism / Industrial Raypunk)**:
   - Utility framing, structural anchor points, caution-striped hazard borders (`#8B7D6B` with `#FFD23F` stripes), and heavy mechanical-biological interfaces.

3. **Layer 3: Biology Layer (Bioluminescent Fantasy / Deep-Sea Ocean)**:
   - The alien core underneath the glass: pulsing vascular channels, hemolymph fluid dynamics, neural ganglia clusters, and organic organ chambers rendered in deep abyssal darkness (`#0A0A20`) with saturated emission.

4. **Layer 4: Environment Layer (Stylized Realism / Deep-Sea Space)**:
   - Readability of external space as an ocean—nebulae rendered as coral reefs, celestial whale falls, and bio-lumuminescent space fauna.

5. **Layer 5: Ancient Layer (Alien Brutalism / Precursor Bio-Tech)**:
   - Monolithic geometric sharpness, architect-green glyph glows (`#00FF7F`), and ancient bio-carved hieroglyphs integrated into endgame HUD telemetry.

---

### 1.3 Design Token Specification

The following design tokens define the institutional color palette, optical constants, and spatial typography for BioGenesis UI components.

#### Color Palette Tokens
| Token Name | Hex Code | HSL / RGBA Equivalent | Operational Purpose |
| :--- | :--- | :--- | :--- |
| `color-interface-white` | `#F4F7F6` | `hsl(150, 15%, 96%)` | Glossy white primary panel surface |
| `color-interface-glass` | `#FFFFFF` | `rgba(255, 255, 255, 0.45)` | Base glass container fill |
| `color-accent-cyan` | `#00CED1` | `hsl(180, 100%, 41%)` | Primary active telemetry & healthy state |
| `color-accent-orange` | `#FF6B35` | `hsl(16, 100%, 60%)` | Interactive hover & secondary action |
| `color-accent-yellow` | `#FFD23F` | `hsl(45, 100%, 62%)` | Tactical focus & warning state |
| `color-bio-amber` | `#FFB347` | `hsl(36, 100%, 64%)` | Translucent backlit bio-vascular pulse |
| `color-bio-abyssal` | `#0A0A20` | `hsl(240, 52%, 8%)` | Background organic chamber void |
| `color-pain-red` | `#CC0C2F` | `hsl(349, 89%, 43%)` | Neuro-link pain feedback & severe damage |
| `color-ancient-green` | `#00FF7F` | `hsl(150, 100%, 50%)` | Precursor glyphs & ancient telemetry |

#### Optical & Material Tokens
| Token Name | Value | Unit | Description |
| :--- | :--- | :--- | :--- |
| `optical-ior-glass` | `1.48` | Ratio | Index of Refraction for silica-organ glass |
| `optical-dispersion` | `0.030` | $\Delta n$ | Abbe chromatic dispersion offset factor |
| `optical-blur-iterations` | `4` | Passes | Kawase dual-filter blur downscaling passes |
| `optical-fresnel-f0` | `0.04` | Ratio | Baseline normal-incidence specular reflectivity |
| `spatial-radius-default` | `1.25` | Meters | Cylindrical projection distance from pilot head |
| `spatial-tilt-ergonomic` | `-8.5` | Degrees | Forward downward ergonomic panel tilt ($\phi_{\text{tilt}}$) |

---

> [!IMPORTANT]
> **Subnautica Visual Tension Mandate**: All UI panels MUST feature a dual visual state. The front surface MUST exhibit high-gloss Frutiger Aero clean reflections (Interface Layer), while the rear alpha channel MUST pass through warm amber backlight (`#FFB347`) driven by real-time organ pulse shaders (Biology Layer). Structural damage directly erodes the Frutiger Aero surface layer, exposing raw biological tissue beneath.

---

## 2. 3D Spatial UI Layout Mathematics

### 2.1 Curved Cylindrical Projection & World-Space Anchoring
To eliminate perspective distortion at peripheral angles and match human eye vergence-accommodation curves in stereoscopic VR and 3D display systems, all spatial UI panels are projected onto a virtual cylindrical manifold centered at the pilot's head origin $\mathbf{H} = (H_x, H_y, H_z)^T$.

```
                  Top-Down View of Cylindrical Spatial Canvas
                                  
                               Panel Right (+theta)
                                 /
                                /   Radius R = 1.25m
                               v   
                      +-------------------+
                     /   Spatial Panel     \
                    |   (Curved Surface)    |
                     \                     /
                      +-------------------+
                                ^
                                |  Normal Vector N(theta)
                                |
                           [ Pilot Head ]  H = (Hx, Hy, Hz)
```

#### Mathematical Formulation
Let panel spatial parameters be defined as:
- $R \in [0.8, 3.0]$: Cylinder radius in meters ($1.25\text{m}$ standard cockpit distance).
- $\theta \in [\theta_{\text{min}}, \theta_{\text{max}}]$: Azimuthal angle along the horizontal arc in radians.
- $y \in [y_{\text{min}}, y_{\text{max}}]$: Vertical displacement along the cylinder's axial height vector.
- $\phi_{\text{tilt}} \in [-20^\circ, 5^\circ]$: Ergonomic forward pitch rotation angle (typically $-8.5^\circ$).

The pitch rotation matrix $\mathbf{R}_{\text{tilt}}(\phi_{\text{tilt}})$ about the local X-axis is defined as:

$$\mathbf{R}_{\text{tilt}}(\phi_{\text{tilt}}) = \begin{pmatrix} 1 & 0 & 0 \\ 0 & \cos\phi_{\text{tilt}} & -\sin\phi_{\text{tilt}} \\ 0 & \sin\phi_{\text{tilt}} & \cos\phi_{\text{tilt}} \end{pmatrix}$$

The 3D world-space position vector $\mathbf{P}_{\text{world}}(\theta, y)$ of any point $(\theta, y)$ on the curved UI manifold relative to head origin $\mathbf{H}$ is derived as:

$$\mathbf{P}_{\text{world}}(\theta, y) = \mathbf{H} + \mathbf{R}_{\text{tilt}}(\phi_{\text{tilt}}) \begin{pmatrix} R \sin\theta \\ y \\ R \cos\theta \end{pmatrix}$$

Expanding into parametric coordinate components:

$$\begin{cases} P_x(\theta, y) = H_x + R \sin\theta \\ P_y(\theta, y) = H_y + y \cos\phi_{\text{tilt}} - R \cos\theta \sin\phi_{\text{tilt}} \\ P_z(\theta, y) = H_z + y \sin\phi_{\text{tilt}} + R \cos\theta \cos\phi_{\text{tilt}} \end{cases}$$

The inward-facing unit normal vector $\mathbf{N}_{\text{panel}}(\theta)$ pointing directly toward the pilot's eyes is:

$$\mathbf{N}_{\text{panel}}(\theta) = -\mathbf{R}_{\text{tilt}}(\phi_{\text{tilt}}) \begin{pmatrix} \sin\theta \\ 0 \\ \cos\theta \end{pmatrix} = \begin{pmatrix} -\sin\theta \\ \sin\phi_{\text{tilt}} \cos\theta \\ -\cos\phi_{\text{tilt}} \cos\theta \end{pmatrix}$$

---

### 2.2 Dynamic Parallax Offset Math (Spatial Depth Stack)
Spatial UI components consist of a multi-layered depth stack (glass substrate, bio-gauge indicators, text overlays, and floating interactive glyphs). To provide stereoscopic depth cues without causing stereoscopic vergence mismatch, vertex displacement is calculated dynamically based on the current gaze/cursor vector $\mathbf{V}_{\text{gaze}}$.

```
+-----------------------------------------------------------------------+
| LAYER DEPTH STACK (d_layer)                                           |
|                                                                       |
| [ Layer 4: Interactive Glyphs ] ----> d_layer = +0.060m (Outermost)   |
| [ Layer 3: Text / Telemetry   ] ----> d_layer = +0.035m               |
| [ Layer 2: Bio-Gauges / Flow  ] ----> d_layer = +0.015m               |
| [ Layer 1: Glass Substrate    ] ----> d_layer =  0.000m (Base Canvas) |
+-----------------------------------------------------------------------+
```

Given the unit gaze vector $\mathbf{V}_{\text{gaze}} = \frac{\mathbf{P}_{\text{target}} - \mathbf{H}}{\|\mathbf{P}_{\text{target}} - \mathbf{H}\|}$, we project $\mathbf{V}_{\text{gaze}}$ onto the tangent plane of the UI panel.

The tangentially projected offset vector $\mathbf{V}_{\text{tangent}}$ is defined by subtracting the normal component:

$$\mathbf{V}_{\text{tangent}} = \mathbf{V}_{\text{gaze}} - \left( \mathbf{V}_{\text{gaze}} \cdot \mathbf{N}_{\text{panel}}(\theta) \right) \mathbf{N}_{\text{panel}}(\theta)$$

The dynamic world-space displacement $\Delta \mathbf{P}_{\text{layer}}$ applied to a UI element at depth layer multiplier $d_{\text{layer}}$ is:

$$\Delta \mathbf{P}_{\text{layer}} = d_{\text{layer}} \cdot \mathbf{V}_{\text{tangent}}$$

The final rendered world position $\mathbf{P}_{\text{rendered}}$ of a visual element on depth layer $k$ is:

$$\mathbf{P}_{\text{rendered}}(\theta, y, k) = \mathbf{P}_{\text{world}}(\theta, y) + d_{\text{layer}}(k) \cdot \mathbf{N}_{\text{panel}}(\theta) + \Delta \mathbf{P}_{\text{layer}}$$

---

### 2.3 Quadratic 3D Ray-Cylinder Hit Testing Algorithm
To perform mouse picking or 6DOF VR laser raycasting against the curved spatial canvas, we intersect a 3D ray $\mathbf{r}(t) = \mathbf{O} + t\mathbf{D}$ (where $\mathbf{O}$ is ray origin, $\mathbf{D}$ is normalized ray direction, and $t \ge 0$) with the tilted cylindrical manifold.

#### Step 1: Transform Ray into Un-tilted Cylinder Space
Apply the inverse tilt rotation $\mathbf{R}_{\text{tilt}}(-\phi_{\text{tilt}})$ to both origin and direction relative to head center $\mathbf{H}$:

$$\mathbf{O}' = \mathbf{R}_{\text{tilt}}(-\phi_{\text{tilt}}) (\mathbf{O} - \mathbf{H})$$

$$\mathbf{D}' = \mathbf{R}_{\text{tilt}}(-\phi_{\text{tilt}}) \mathbf{D}$$

#### Step 2: Solve Quadratic Cylinder Intersection
The equation of an un-tilted cylinder aligned with the Y-axis of radius $R$ is:

$$(O'_x + t D'_x)^2 + (O'_z + t D'_z)^2 = R^2$$

Expanding into quadratic standard form $A t^2 + B t + C = 0$:

$$\begin{cases} A = (D'_x)^2 + (D'_z)^2 \\ B = 2 \left( O'_x D'_x + O'_z D'_z \right) \\ C = (O'_x)^2 + (O'_z)^2 - R^2 \end{cases}$$

The discriminant $\Delta_{\text{cyl}}$ is evaluated as:

$$\Delta_{\text{cyl}} = B^2 - 4 A C$$

- If $\Delta_{\text{cyl}} < 0$: No intersection exists (ray misses cylinder).
- If $\Delta_{\text{cyl}} \ge 0$: The closest intersection parameter $t_{\text{hit}}$ is:

$$t_{\text{hit}} = \frac{-B - \sqrt{\Delta_{\text{cyl}}}}{2A}$$

#### Step 3: Extract Parametric $(u, v)$ UV Coordinates
Using $t_{\text{hit}}$, compute the intersection coordinate in cylinder space $\mathbf{P}'_{\text{hit}} = \mathbf{O}' + t_{\text{hit}} \mathbf{D}'$:

$$y_{\text{hit}} = P'_{y,\text{hit}}$$

$$\theta_{\text{hit}} = \text{atan2}(P'_{x,\text{hit}}, P'_{z,\text{hit}})$$

Validate bounds:
1. Verify $y_{\text{hit}} \in [y_{\text{min}}, y_{\text{max}}]$.
2. Verify $\theta_{\text{hit}} \in [\theta_{\text{min}}, \theta_{\text{max}}]$.

If valid, compute normalized UV panel coordinates $(u, v) \in [0, 1]^2$:

$$u = \frac{\theta_{\text{hit}} - \theta_{\text{min}}}{\theta_{\text{max}} - \theta_{\text{min}}}, \quad v = \frac{y_{\text{hit}} - y_{\text{min}}}{y_{\text{max}} - y_{\text{min}}}$$

```typescript
/**
 * Executes high-precision quadratic ray-cylinder hit testing for spatial UI panels.
 */
export function rayIntersectsCylindricalPanel(
  rayOrigin: THREE.Vector3,
  rayDirection: THREE.Vector3,
  headOrigin: THREE.Vector3,
  radius: number,
  tiltDegrees: number,
  bounds: { thetaMin: number; thetaMax: number; yMin: number; yMax: number }
): { hit: boolean; distance: number; uv: THREE.Vector2; worldHitPoint: THREE.Vector3 } | null {
  const radTilt = (tiltDegrees * Math.PI) / 180;
  const cosT = Math.cos(-radTilt);
  const sinT = Math.sin(-radTilt);

  // Transform ray origin and direction by inverse tilt
  const relO = new THREE.Vector3().subVectors(rayOrigin, headOrigin);
  const O_prime = new THREE.Vector3(
    relO.x,
    relO.y * cosT - relO.z * sinT,
    relO.y * sinT + relO.z * cosT
  );

  const D_prime = new THREE.Vector3(
    rayDirection.x,
    rayDirection.y * cosT - rayDirection.z * sinT,
    rayDirection.y * sinT + rayDirection.z * cosT
  );

  const A = D_prime.x * D_prime.x + D_prime.z * D_prime.z;
  const B = 2 * (O_prime.x * D_prime.x + O_prime.z * D_prime.z);
  const C = O_prime.x * O_prime.x + O_prime.z * O_prime.z - radius * radius;

  const discriminant = B * B - 4 * A * C;
  if (discriminant < 0 || A === 0) return null;

  const t = (-B - Math.sqrt(discriminant)) / (2 * A);
  if (t < 0) return null;

  const P_hit = new THREE.Vector3().copy(O_prime).addScaledVector(D_prime, t);
  const theta = Math.atan2(P_hit.x, P_hit.z);
  const y = P_hit.y;

  if (
    theta < bounds.thetaMin ||
    theta > bounds.thetaMax ||
    y < bounds.yMin ||
    y > bounds.yMax
  ) {
    return null;
  }

  const u = (theta - bounds.thetaMin) / (bounds.thetaMax - bounds.thetaMin);
  const v = (y - bounds.yMin) / (bounds.yMax - bounds.yMin);
  const worldHitPoint = new THREE.Vector3().copy(rayOrigin).addScaledVector(rayDirection, t);

  return { hit: true, distance: t, uv: new THREE.Vector2(u, v), worldHitPoint };
}
```

---

## 3. Shader Technical Specifications

### 3.1 Frutiger Aero Glass Shader (`frutigerGlass.glsl` & `frutigerGlass.wgsl`)
The primary UI material simulates silica-organic spatial glass featuring physical index of refraction ($IOR = 1.48$), Abbe chromatic dispersion ($\Delta n = 0.03$), Schlick Fresnel reflectivity, Kawase dual-filter background blur downsampling, and warm amber backlight emissions from underlying Layer 3 organ vasculature.

#### GLSL Implementation (`frutigerGlass.glsl`)
```glsl
#version 300 es
precision highp float;

// Uniform Inputs
uniform sampler2D u_BackgroundTexture; // Scene background render pass
uniform sampler2D u_NormalMap;         // Organic micro-curvature normal map
uniform vec3 u_GlassColor;             // Tint color (default vec3(0.95, 0.98, 1.0))
uniform vec3 u_AmberBacklight;         // Bioluminescent vascular color vec3(1.0, 0.7, 0.28)
uniform float u_IOR;                   // Index of refraction (1.48)
uniform float u_Dispersion;            // Chromatic dispersion delta (0.030)
uniform float u_BlurMipLevel;          // Mipmap level for Kawase blur approximation
uniform float u_Roughness;             // Surface micro-facet roughness (0.08)
uniform float u_BioGlowPulse;          // Pulsing vascular intensity [0.0, 1.0]
uniform vec2 u_ScreenResolution;       // Screen dimensions in pixels

// Inputs from Vertex Shader
in vec3 v_WorldNormal;
in vec3 v_ViewPosition;
in vec2 v_Uv;

// Output
out vec4 fragColor;

// Schlick's Fresnel Approximation
float FresnelSchlick(float cosTheta, float F0) {
    return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

void main() {
    vec3 N = normalize(v_WorldNormal);
    vec3 V = normalize(-v_ViewPosition);
    
    // Sample normal map micro-detail
    vec3 nm = texture(u_NormalMap, v_Uv * 4.0).rgb * 2.0 - 1.0;
    N = normalize(N + nm * 0.15);

    float cosTheta = max(dot(N, V), 0.0);
    vec2 screenUv = gl_FragCoord.xy / u_ScreenResolution;

    // 1. Refraction with Chromatic Dispersion (R, G, B channels refract at different IORs)
    vec3 refractR = refract(-V, N, 1.0 / (u_IOR - u_Dispersion));
    vec3 refractG = refract(-V, N, 1.0 / u_IOR);
    vec3 refractB = refract(-V, N, 1.0 / (u_IOR + u_Dispersion));

    float sampleR = textureLod(u_BackgroundTexture, screenUv + refractR.xy * 0.04, u_BlurMipLevel).r;
    float sampleG = textureLod(u_BackgroundTexture, screenUv + refractG.xy * 0.04, u_BlurMipLevel).g;
    float sampleB = textureLod(u_BackgroundTexture, screenUv + refractB.xy * 0.04, u_BlurMipLevel).b;
    vec3 refractedColor = vec3(sampleR, sampleG, sampleB);

    // 2. Specular Highlights & Sunlight Sweeps
    float F0 = 0.04;
    float fresnel = FresnelSchlick(cosTheta, F0);
    vec3 lightDir = normalize(vec3(0.4, 0.9, 0.6));
    vec3 H = normalize(V + lightDir);
    float specPower = 128.0 / (u_Roughness * u_Roughness);
    float spec = pow(max(dot(N, H), 0.0), specPower);
    vec3 specularColor = vec3(1.0, 1.0, 1.0) * spec * 2.0;

    // 3. Layer 3 Biology Backlight (Subnautica Translucent Panel Effect)
    // Vascular glow intensifies at grazing angles and pulses with heartbeat
    float bioFresnel = pow(1.0 - cosTheta, 3.0);
    vec3 bioGlow = u_AmberBacklight * (0.3 + 0.7 * u_BioGlowPulse) * (0.2 + 0.8 * bioFresnel);

    // 4. Final Color Composition
    vec3 composite = mix(refractedColor * u_GlassColor, vec3(1.0), fresnel * 0.35);
    composite += specularColor + bioGlow;

    // Alpha ramp ensuring high-gloss edge visibility
    float finalAlpha = clamp(0.40 + fresnel * 0.55, 0.0, 0.98);
    fragColor = vec4(composite, finalAlpha);
}
```

#### WGSL WebGPU Implementation (`frutigerGlass.wgsl`)
```wgsl
struct Uniforms {
    glassColor: vec3<f32>,
    amberBacklight: vec3<f32>,
    ior: f32,
    dispersion: f32,
    blurMipLevel: f32,
    roughness: f32,
    bioGlowPulse: f32,
    screenResolution: vec2<f32>,
};

@group(0) @binding(0) var u_sampler: sampler;
@group(0) @binding(1) var u_backgroundTexture: texture_2d<f32>;
@group(0) @binding(2) var u_normalMap: texture_2d<f32>;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) worldNormal: vec3<f32>,
    @location(1) viewPosition: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

fn fresnelSchlick(cosTheta: f32, F0: f32) -> f32 {
    return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

@fragment
fn main(in: VertexOutput) -> @location(0) vec4<f32> {
    let N = normalize(in.worldNormal);
    let V = normalize(-in.viewPosition);
    let cosTheta = max(dot(N, V), 0.0);
    let screenUv = in.position.xy / uniforms.screenResolution;

    let refrR = refract(-V, N, 1.0 / (uniforms.ior - uniforms.dispersion));
    let refrG = refract(-V, N, 1.0 / uniforms.ior);
    let refrB = refract(-V, N, 1.0 / (uniforms.ior + uniforms.dispersion));

    let sampleR = textureSampleLevel(u_backgroundTexture, u_sampler, screenUv + refrR.xy * 0.04, uniforms.blurMipLevel).r;
    let sampleG = textureSampleLevel(u_backgroundTexture, u_sampler, screenUv + refrG.xy * 0.04, uniforms.blurMipLevel).g;
    let sampleB = textureSampleLevel(u_backgroundTexture, u_sampler, screenUv + refrB.xy * 0.04, uniforms.blurMipLevel).b;
    let refractedColor = vec3<f32>(sampleR, sampleG, sampleB);

    let fresnel = fresnelSchlick(cosTheta, 0.04);
    let H = normalize(V + vec3<f32>(0.4, 0.9, 0.6));
    let spec = pow(max(dot(N, H), 0.0), 128.0 / (uniforms.roughness * uniforms.roughness));
    let specular = vec3<f32>(1.0) * spec * 2.0;

    let bioGlow = uniforms.amberBacklight * (0.3 + 0.7 * uniforms.bioGlowPulse) * pow(1.0 - cosTheta, 3.0);
    let finalColor = mix(refractedColor * uniforms.glassColor, vec3<f32>(1.0), fresnel * 0.35) + specular + bioGlow;
    let alpha = clamp(0.40 + fresnel * 0.55, 0.0, 0.98);

    return vec4<f32>(finalColor, alpha);
}
```

---

### 3.2 Volumetric 3D Hologram Shader (`volumetricHologram.glsl`)
The 3D tactical command hologram renders real-time volumetric representations of ship internal organs, vascular networks, and external tactical units using raymarched 3D scalar density fields with additive scanline interference and health heatmaps.

```glsl
#version 300 es
precision highp float;

uniform vec3 u_VolumeBoundsMin;       // Minimum bounding box in world space
uniform vec3 u_VolumeBoundsMax;       // Maximum bounding box in world space
uniform highp sampler3D u_OrganDensityMap; // 3D SDF scalar field of ship organs
uniform float u_Time;                 // Animation timestamp
uniform vec3 u_HoloColorPrimary;      // Cyan vec3(0.0, 0.9, 1.0)
uniform vec3 u_HoloColorWarning;      // Red/Amber vec3(1.0, 0.2, 0.1) for damage
uniform float u_ScanlineFrequency;    // Scanline density (default 180.0)
uniform float u_GlitchFlicker;        // Interference glitch amplitude [0.0, 1.0]

in vec3 v_WorldPosition;
in vec3 v_RayDir;
out vec4 fragColor;

// Axis-Aligned Bounding Box (AABB) Ray Intersection
bool IntersectAABB(vec3 ro, vec3 rd, vec3 boxMin, vec3 boxMax, out float t0, out float t1) {
    vec3 invR = 1.0 / rd;
    vec3 tbot = invR * (boxMin - ro);
    vec3 ttop = invR * (boxMax - ro);
    vec3 tmin = min(ttop, tbot);
    vec3 tmax = max(ttop, tbot);
    t0 = max(tmin.x, max(tmin.y, tmin.z));
    t1 = min(tmax.x, min(tmax.y, tmax.z));
    return t1 > max(t0, 0.0);
}

void main() {
    vec3 rayOrigin = cameraPosition;
    vec3 rayDir = normalize(v_RayDir);

    float tNear, tFar;
    if (!IntersectAABB(rayOrigin, rayDir, u_VolumeBoundsMin, u_VolumeBoundsMax, tNear, tFar)) {
        discard;
    }

    const int MAX_STEPS = 64;
    float stepSize = (tFar - tNear) / float(MAX_STEPS);
    vec3 currentPos = rayOrigin + rayDir * (tNear + stepSize * 0.5);

    vec4 accumulatedColor = vec4(0.0);

    for (int i = 0; i < MAX_STEPS; i++) {
        // Map world coordinate to normalized 3D texture coordinate [0.0, 1.0]^3
        vec3 texCoord = (currentPos - u_VolumeBoundsMin) / (u_VolumeBoundsMax - u_VolumeBoundsMin);
        
        vec4 densitySample = texture(u_OrganDensityMap, texCoord);
        float density = densitySample.a;
        float healthRatio = densitySample.r; // 1.0 = Healthy, 0.0 = Severely Damaged

        if (density > 0.005) {
            // Dynamic health heatmap color gradient
            vec3 organColor = mix(u_HoloColorWarning, u_HoloColorPrimary, healthRatio);

            // Scanline interference calculation
            float scanline = sin(currentPos.y * u_ScanlineFrequency - u_Time * 12.0) * 0.5 + 0.5;
            float pseudoRandom = fract(sin(dot(currentPos.xz + u_Time, vec2(12.9898, 78.233))) * 43758.5453);
            scanline = mix(scanline, pseudoRandom, u_GlitchFlicker);

            vec3 emission = organColor * density * (0.75 + 0.45 * scanline);
            float stepAlpha = density * stepSize * 3.2;

            // Front-to-back volumetric opacity compositing
            accumulatedColor.rgb += (1.0 - accumulatedColor.a) * emission * stepAlpha;
            accumulatedColor.a += (1.0 - accumulatedColor.a) * stepAlpha;

            if (accumulatedColor.a >= 0.98) break;
        }

        currentPos += rayDir * stepSize;
    }

    // Holographic edge fresnel glow
    float edgeGlow = pow(1.0 - abs(dot(rayDir, vec3(0.0, 1.0, 0.0))), 2.5);
    accumulatedColor.rgb += u_HoloColorPrimary * edgeGlow * 0.25;

    fragColor = accumulatedColor;
}
```

---

### 3.3 Neuro-Link HUD Pain/Stress Post-Processing Shader (`neuroLinkHUD.glsl`)
Renders screen-space direct neural feedback when ship organs sustain physical damage, thermal strain, or oxygen deprivation. Combines radial chromatic aberration, 2D Simplex electrical discharge noise, smoothstep vignetting, and heartbeat-synced radial lens distortion.

```glsl
#version 300 es
precision highp float;

uniform sampler2D u_SceneColorTexture; // Input scene render pass
uniform float u_PainIntensity;         // Pain level [0.0 = Calm, 1.0 = Critical Pain]
uniform float u_NeuralStrain;          // Electrical noise factor [0.0, 1.0]
uniform float u_HeartbeatPhase;        // Pulse phase [0, 2\pi]
uniform float u_Time;                  // Time counter
uniform vec2 u_ScreenResolution;

in vec2 v_Uv;
out vec4 fragColor;

// 2D Simplex Noise Helper Functions
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

float SimplexNoise2D(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m; m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

void main() {
    vec2 uv = v_Uv;
    vec2 delta = uv - vec2(0.5);
    float dist = length(delta);

    // 1. Heartbeat Radial Lens Deformation
    float pulseDistort = sin(u_HeartbeatPhase) * 0.018 * (0.2 + 0.8 * u_PainIntensity);
    uv += normalize(delta) * pulseDistort * smoothstep(0.15, 0.85, dist);

    // 2. Pain-Driven Radial Chromatic Aberration (Separates R, G, B outward)
    float shiftMagnitude = pow(u_PainIntensity, 2.2) * 0.045 * dist;
    float rChannel = texture(u_SceneColorTexture, uv + delta * shiftMagnitude).r;
    float gChannel = texture(u_SceneColorTexture, uv).g;
    float bChannel = texture(u_SceneColorTexture, uv - delta * shiftMagnitude).b;
    vec3 chromaticColor = vec3(rChannel, gChannel, bChannel);

    // 3. Electrical Neural Discharge Noise
    float noiseFreq = 32.0;
    float rawNoise = SimplexNoise2D(uv * noiseFreq + vec2(u_Time * 18.0));
    float spark = pow(clamp(rawNoise, 0.0, 1.0), 4.5) * u_NeuralStrain;
    vec3 sparkColor = vec3(0.1, 0.85, 1.0) * spark * 3.0;

    // 4. Smoothstep Vignette & Peripheral Pain Tinting
    float vignette = smoothstep(0.80, 0.20, dist * (1.0 + u_PainIntensity * 0.6));
    vec3 painVignette = vec3(0.85, 0.03, 0.08) * (1.0 - vignette) * u_PainIntensity * 2.0;

    vec3 finalOutput = chromaticColor * vignette + sparkColor + painVignette;
    fragColor = vec4(finalOutput, 1.0);
}
```

---

## 4. Accessibility (a11y) & Motor Inclusivity Matrix

### 4.1 WCAG AAA Compliance & High-Contrast Systems
BioGenesis enforces strict contrast compliance across all spatial UI components:
- **Standard Body Text ($< 18\text{pt} / 24\text{px}$)**: Minimum contrast ratio $\ge 7:1$ against the background.
- **Large Scale Text ($\ge 18\text{pt} / 24\text{px}$ bold)**: Minimum contrast ratio $\ge 4.5:1$.
- **High-Contrast A11y Theme**: A dedicated toggle transforms translucent glass components into solid opaque containers (`#050811`, 100% alpha) with high-visibility solid 3px cyan/white strokes (`#00FFFF`), completely bypassing glass refraction cost and boosting legibility ratio to $> 14:1$.

```
+-----------------------------------------------------------------------------------+
|                            HIGH-CONTRAST A11Y MODE TOGGLE                         |
|                                                                                   |
|  DEFAULT FRUTIGER AERO GLASS MODE        HIGH-CONTRAST OPAQUE ACCESSIBLE MODE    |
|  - Fill: rgba(255, 255, 255, 0.45)        - Fill: #050811 (100% Opaque Solid)     |
|  - Border: Subtle Refraction Specular    - Border: 3px Solid Cyan (#00FFFF)       |
|  - Contrast Ratio: ~5.2:1 (WCAG AA)      - Contrast Ratio: 14.8:1 (WCAG AAA)     |
+-----------------------------------------------------------------------------------+
```

---

### 4.2 Post-Processing Colorblind Filter Algorithms (Daltonization Matrix)
To support pilots with color vision deficiencies (Protanopia, Deuteranopia, Tritanopia), BioGenesis incorporates a full screen-space Daltonization pass executing LMS cone space transformations.

#### Daltonization Mathematical Model
1. Convert RGB pixel color $\mathbf{C}_{\text{RGB}}$ to Long-Medium-Short (LMS) cone response space using matrix $\mathbf{M}_{\text{RGB}\rightarrow\text{LMS}}$:

$$\begin{pmatrix} L \\ M \\ S \end{pmatrix} = \begin{pmatrix} 17.8824 & 43.5161 & 4.11935 \\ 3.45565 & 27.1554 & 3.86714 \\ 0.0299566 & 0.184309 & 1.46709 \end{pmatrix} \begin{pmatrix} R \\ G \\ B \end{pmatrix}$$

2. Apply deficiency simulation matrix $\mathbf{S}_{\text{type}}$ to yield simulated perception $\mathbf{LMS}_{\text{sim}}$:

$$\mathbf{S}_{\text{Protanopia}} = \begin{pmatrix} 0.0 & 2.02344 & -2.52581 \\ 0.0 & 1.0 & 0.0 \\ 0.0 & 0.0 & 1.0 \end{pmatrix}$$

$$\mathbf{S}_{\text{Deuteranopia}} = \begin{pmatrix} 1.0 & 0.0 & 0.0 \\ 0.494207 & 0.0 & 1.24827 \\ 0.0 & 0.0 & 1.0 \end{pmatrix}$$

$$\mathbf{S}_{\text{Tritanopia}} = \begin{pmatrix} 1.0 & 0.0 & 0.0 \\ 0.0 & 1.0 & 0.0 \\ -0.395913 & 0.801109 & 0.0 \end{pmatrix}$$

3. Convert simulated color back to RGB using $\mathbf{M}_{\text{LMS}\rightarrow\text{RGB}} = \mathbf{M}_{\text{RGB}\rightarrow\text{LMS}}^{-1}$. Calculate error vector $\mathbf{E}_{\text{RGB}} = \mathbf{C}_{\text{RGB}} - \mathbf{C}_{\text{sim}}$.
4. Shift lost detail into readable channels via compensation matrix $\mathbf{D}$:

$$\begin{pmatrix} \Delta R \\ \Delta G \\ \Delta B \end{pmatrix} = \begin{pmatrix} 0.0 & 0.0 & 0.0 \\ 0.7 & 0.3 & 0.0 \\ 0.7 & 0.0 & 0.3 \end{pmatrix} \begin{pmatrix} E_r \\ E_g \\ E_b \end{pmatrix}$$

5. Final daltonized output: $\mathbf{C}_{\text{final}} = \text{clamp}(\mathbf{C}_{\text{RGB}} + \mathbf{\Delta C}, 0.0, 1.0)$.

```glsl
// GLSL Fragment Shader Function: Screen-Space Daltonization Filter
uniform int u_ColorblindType; // 0 = Off, 1 = Protanopia, 2 = Deuteranopia, 3 = Tritanopia

vec3 ApplyDaltonizationFilter(vec3 rgb) {
    if (u_ColorblindType == 0) return rgb;

    const mat3 RGB_TO_LMS = mat3(
        17.8824, 43.5161, 4.11935,
        3.45565, 27.1554, 3.86714,
        0.0299566, 0.184309, 1.46709
    );

    const mat3 LMS_TO_RGB = mat3(
        0.080944, -0.130504, 0.116721,
        -0.0102485, 0.0540194, -0.0113615,
        -0.000365294, -0.00412161, 0.693511
    );

    mat3 simMatrix;
    if (u_ColorblindType == 1) { // Protanopia
        simMatrix = mat3(0.0, 2.02344, -2.52581, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0);
    } else if (u_ColorblindType == 2) { // Deuteranopia
        simMatrix = mat3(1.0, 0.0, 0.0, 0.494207, 0.0, 1.24827, 0.0, 0.0, 1.0);
    } else { // Tritanopia
        simMatrix = mat3(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, -0.395913, 0.801109, 0.0);
    }

    vec3 lms = RGB_TO_LMS * rgb;
    vec3 simLms = simMatrix * lms;
    vec3 simRgb = LMS_TO_RGB * simLms;

    vec3 error = rgb - simRgb;

    vec3 shift;
    shift.r = 0.0;
    shift.g = (error.g * 0.7) + (error.r * 0.3);
    shift.b = (error.b * 0.7) + (error.r * 0.3);

    return clamp(rgb + shift, 0.0, 1.0);
}
```

---

### 4.3 Motor Inclusivity Matrix & Mitigation Systems

| Accessibility Feature | Implementation Technical Specification | Operational Benefit |
| :--- | :--- | :--- |
| **Gaze / Laser Dwell Select** | Continuous raycast dwell timer ($0.2\text{s} - 2.0\text{s}$ configurable duration) rendering an animated circular progress ring on focused targets. Automatically triggers click event upon timer expiration. | Allows completely hands-free UI interaction or single-trigger control for pilots with limited motor capability. |
| **Horizon Lock System** | Damped exponential roll/pitch stabilization ($\tau = 0.3\text{s}$) binding the UI canvas's up vector to world gravity rather than head roll. | Eliminates spatial disorientation and simulator motion sickness in high-speed maneuvering and VR. |
| **Dynamic FOV Vignetting** | Peripheral visual field reduction ($75^\circ \to 50^\circ$ FOV) dynamically scaled during rapid angular acceleration ($\omega > 45^\circ/\text{s}$). | Comfortably suppresses optical flow motion triggers during violent ship combat maneuvers. |
| **Magnetic Cursor Snapping** | Angular cone threshold raycast solver ($15^\circ$ alignment cone) applying a spring attraction force $\mathbf{F}_{\text{snap}} = -k (\mathbf{x}_{\text{cursor}} - \mathbf{x}_{\text{target}})$ toward the nearest interactive UI node. | Assists pilots experiencing physical hand tremors or low pointing precision. |
| **Hold-to-Toggle Converter** | Global state machine intercepting continuous press-and-hold input actions and converting them into discrete single-tap toggle states. | Eliminates physical muscle fatigue caused by prolonged button holds during long space voyages. |

---

## 5. Multi-Input Device Abstraction Layer

### 5.1 Universal Multi-Input Engine Architecture
The Multi-Input Abstraction Layer normalizes input events from 6DOF VR spatial controllers (OpenXR / WebXR), Gamepads (XInput / DualSense), and Mouse/Keyboard into a single unified action pipeline. Active device auto-switching executes with **zero-latency (0ms)** upon detection of input events.

```
                               MULTI-INPUT PIPELINE
                               
 [ 6DOF VR Spatial Rays ]    [ Gamepad Sticks & Triggers ]    [ Mouse Pointer / Keys ]
            |                              |                             |
            v                              v                             v
 +-----------------------------------------------------------------------------------+
 |                         UNIFIED DEVICE NORMALIZATION ENGINE                       |
 |                                                                                   |
 |  - Auto-Switch Active Input Mode on Event Timestamp (0ms Latency)                |
 |  - Vector Ray Normalization & 3D Cylinder Projection                             |
 |  - Radial Menu Selector Math with Angular Deadzone Filtering (0.25 Threshold)    |
 +-----------------------------------------------------------------------------------+
                                           |
                                           v
                       [ Spatial UI State Manager (Focus Node) ]
                                           |
                  +------------------------+------------------------+
                  |                                                 |
                  v                                                 v
        [ 3D Raycast Hit Event ]                           [ 150ms Micro-Animation ]
```

---

### 5.2 TypeScript Input Normalization Engine Implementation

```typescript
import * as THREE from 'three';

export type InputDeviceType = 'VR_6DOF' | 'GAMEPAD' | 'MOUSE_KEYBOARD';

export type UserAction = 
  | 'SELECT_PRIMARY'
  | 'SELECT_SECONDARY'
  | 'RADIAL_MENU_OPEN'
  | 'OVERCLOCK_ORGAN'
  | 'PANEL_NAVIGATE_AXIS'
  | 'CAMERA_FREELOOK';

export interface NormalizedInputEvent {
  deviceType: InputDeviceType;
  action: UserAction;
  rayOrigin?: THREE.Vector3;
  rayDirection?: THREE.Vector3;
  analogStick?: THREE.Vector2;
  value: number;
  timestamp: number;
}

export class MultiInputManager {
  private activeDevice: InputDeviceType = 'MOUSE_KEYBOARD';
  private listeners: Array<(event: NormalizedInputEvent) => void> = [];
  private lastInputTimestamp: number = 0;
  private gamepadDeadzone: number = 0.25;

  constructor() {
    this.initKeyboardMouseListeners();
    this.initGamepadPolling();
  }

  public subscribe(callback: (event: NormalizedInputEvent) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  public getActiveDevice(): InputDeviceType {
    return this.activeDevice;
  }

  private dispatch(event: NormalizedInputEvent): void {
    if (event.timestamp >= this.lastInputTimestamp) {
      if (this.activeDevice !== event.deviceType) {
        this.activeDevice = event.deviceType;
        console.log(`[MultiInputManager] Zero-latency active device switch to: ${this.activeDevice}`);
      }
      this.lastInputTimestamp = event.timestamp;
      this.listeners.forEach(listener => listener(event));
    }
  }

  private initKeyboardMouseListeners(): void {
    window.addEventListener('mousemove', (e) => {
      // Convert screen pixels to normalized device coordinates [-1, 1]
      const ndcX = (e.clientX / window.innerWidth) * 2 - 1;
      const ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
      
      this.dispatch({
        deviceType: 'MOUSE_KEYBOARD',
        action: 'CAMERA_FREELOOK',
        analogStick: new THREE.Vector2(ndcX, ndcY),
        value: 1.0,
        timestamp: performance.now()
      });
    });

    window.addEventListener('mousedown', (e) => {
      this.dispatch({
        deviceType: 'MOUSE_KEYBOARD',
        action: e.button === 0 ? 'SELECT_PRIMARY' : 'SELECT_SECONDARY',
        value: 1.0,
        timestamp: performance.now()
      });
    });
  }

  private initGamepadPolling(): void {
    const poll = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const gp of gamepads) {
        if (!gp) continue;

        // Process Analog Left Stick with Deadzone
        const lx = gp.axes[0] || 0;
        const ly = gp.axes[1] || 0;
        const mag = Math.sqrt(lx * lx + ly * ly);

        if (mag > this.gamepadDeadzone) {
          const normX = (lx / mag) * ((mag - this.gamepadDeadzone) / (1 - this.gamepadDeadzone));
          const normY = (ly / mag) * ((mag - this.gamepadDeadzone) / (1 - this.gamepadDeadzone));

          this.dispatch({
            deviceType: 'GAMEPAD',
            action: 'PANEL_NAVIGATE_AXIS',
            analogStick: new THREE.Vector2(normX, normY),
            value: mag,
            timestamp: performance.now()
          });
        }

        // Process Primary Action Button (A / Cross)
        if (gp.buttons[0]?.pressed) {
          this.dispatch({
            deviceType: 'GAMEPAD',
            action: 'SELECT_PRIMARY',
            value: gp.buttons[0].value,
            timestamp: performance.now()
          });
        }
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  }

  /**
   * Dispatches VR 6DOF controller pose data received from WebXR frame loop.
   */
  public processVRPose(controllerRayOrigin: THREE.Vector3, controllerRayDirection: THREE.Vector3, triggerValue: number): void {
    this.dispatch({
      deviceType: 'VR_6DOF',
      action: 'SELECT_PRIMARY',
      rayOrigin: controllerRayOrigin,
      rayDirection: controllerRayDirection,
      value: triggerValue,
      timestamp: performance.now()
    });
  }
}
```

---

### 5.3 Micro-Interaction Transition Specifications
Hovering or focusing any interactive spatial UI node triggers a smooth 150ms state transition governed by cubic-bezier physics.

- **Transition Duration**: Exactly $150\text{ms}$ ($0.15\text{s}$).
- **Easing Curve**: `cubic-bezier(0.25, 1.0, 0.5, 1.0)` (High-responsiveness ease-out).
- **Physical Elevation ($\Delta z$)**: Interactive elements shift forward along panel normal by $+0.015\text{m}$ ($15\text{mm}$).
- **Vascular Illumination Shift**: Translucent backlighting intensity scales from baseline $0.20$ to hover peak $0.85$.

```css
/* Institutional CSS Tokens for 150ms Spatial Micro-Interactions */
:root {
  --spatial-transition-duration: 150ms;
  --spatial-transition-easing: cubic-bezier(0.25, 1.0, 0.5, 1.0);
  --spatial-hover-elevation: translateZ(15mm);
  --spatial-bio-glow-idle: rgba(255, 179, 71, 0.20);
  --spatial-bio-glow-hover: rgba(255, 179, 71, 0.85);
}

.frutiger-spatial-card {
  transition: transform var(--spatial-transition-duration) var(--spatial-transition-easing),
              box-shadow var(--spatial-transition-duration) var(--spatial-transition-easing),
              background-color var(--spatial-transition-duration) var(--spatial-transition-easing);
  transform: translateZ(0mm);
  background: var(--spatial-bio-glow-idle);
}

.frutiger-spatial-card:hover,
.frutiger-spatial-card:focus-visible {
  transform: var(--spatial-hover-elevation);
  background: var(--spatial-bio-glow-hover);
  box-shadow: 0 8px 32px rgba(0, 206, 209, 0.45), 0 0 16px rgba(255, 179, 71, 0.60);
}
```

---

## 6. Technical Integration & Roadmap

```
+-----------------------------------------------------------------------------------+
|                        TECHNICAL INTEGRATION ROADMAP MATRIX                       |
|                                                                                   |
|  PHASE 1: Core Spatial Engine & Glass Shaders  [TARGET: SPRINT 1 - COMPLETE]     |
|  - Deploy FrutigerGlassMaterial shader in Three.js pipeline                       |
|  - Wire cylindrical projection math into Canvas3D.tsx cockpit viewport           |
|                                                                                   |
|  PHASE 2: Volumetric Telemetry & Organ Holograms  [TARGET: SPRINT 2 - COMPLETE]  |
|  - Connect OrganSDFRegistry to 3D scalar density volume sampler                   |
|  - Integrate volumetric raymarching into Tactical Command Room grid               |
|                                                                                   |
|  PHASE 3: Neuro-Link Post-Processing Pipeline   [TARGET: SPRINT 3 - COMPLETE]   |
|  - Deploy EffectComposer pass for chromatic aberration & neural noise             |
|  - Wire organ damage telemetry to real-time pain shader parameters                |
|                                                                                   |
|  PHASE 4: Accessibility & Unified Input Layer   [TARGET: SPRINT 4 - COMPLETE]   |
|  - Integrate Daltonization shader pass and High-Contrast mode in GeneticsDrawer   |
|  - Deploy MultiInputManager supporting 6DOF VR, Gamepad, and Mouse/Keyboard       |
+-----------------------------------------------------------------------------------+
```

---
*End of Institutional Engineering Specification — Document Reference: `BIO-SPEC-2026-UIUX-007`*  
*Subagent G (UI/UX, Spatial Hologram & A11y Spec Lead)*
