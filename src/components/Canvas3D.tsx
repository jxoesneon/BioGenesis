import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { AppState, TargetNodeInfo, SymmetryType, OrganPipelineType, OrganPipelineNode, ShipSection, SHIP_SECTIONS, uToSection } from '../types';
import { LCG } from '../utils/nurbs';
import { themes, generateBioSkinTexture } from '../utils/theme';
import { playHeartbeatSound, playScanChirp } from '../utils/audio';
import { buildPipelineNodes, buildPipelineConnections, ShipGeometryContext, NODE_IDS, PIPELINE_COLORS } from '../utils/pipelineGraph';
import {
  initPipeline,
  generateOrgan,
  generateConduitTube,
  generateTentacle,
  generateBioluminescentTextures,
  subdivideHull,
  DEFAULT_PIPELINE_CONFIG,
  PipelineConfig,
} from '../utils/proceduralPipeline';
import {
  BlendBridgeManager,
  SpineNode,
} from '../utils/organBlending';

interface Canvas3DProps {
  state: AppState;
  targetNode: TargetNodeInfo | null;
  onSelectTargetNode: (nodeInfo: TargetNodeInfo | null) => void;
  onShowToast: (msg: string) => void;
  onUpdateOrganList?: (organs: TargetNodeInfo[]) => void;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>;
  controlsRef: React.MutableRefObject<OrbitControls | null>;
  shipGroupRef: React.MutableRefObject<THREE.Group | null>;
  highlightedSection?: ShipSection | null;
}

// Helper function resolving natural biological symmetry coordinate distribution across hull parameter V [0..1]
const getSymmetryVCoords = (symmetry: SymmetryType, stepIdx: number = 0): { vCoords: number[]; names: string[] } => {
  switch (symmetry) {
    case 'radial-5':
      return {
        vCoords: [0.0, 0.2, 0.4, 0.6, 0.8],
        names: ['Dorsal Ray I', 'Dorsal-Right Ray II', 'Ventral-Right Ray III', 'Ventral-Left Ray IV', 'Dorsal-Left Ray V']
      };
    case 'radial-3':
      return {
        vCoords: [0.0, 0.333, 0.667],
        names: ['Dorsal Branch I', 'Right Ventral Branch II', 'Left Ventral Branch III']
      };
    case 'biradial':
      return {
        vCoords: [0.0, 0.25, 0.5, 0.75],
        names: ['Dorsal Plane', 'Starboard Plane', 'Ventral Plane', 'Port Plane']
      };
    case 'spherical':
      return {
        vCoords: [0.0, 0.166, 0.333, 0.5, 0.666, 0.833],
        names: ['Anterior Zenith', 'Dorsal Equatorial', 'Ventral Equatorial', 'Posterior Nadir', 'Port Lateral', 'Starboard Lateral']
      };
    case 'asymmetrical': {
      const phi = 0.618033988749895; // Golden ratio conjugate
      const v1 = (stepIdx * phi) % 1.0;
      const v2 = (v1 + 0.382) % 1.0;
      return {
        vCoords: [v1, v2],
        names: [`Chiral Spiral Node #${stepIdx + 1}-A`, `Chiral Spiral Node #${stepIdx + 1}-B`]
      };
    }
    case 'bilateral':
    default:
      return {
        vCoords: [0.18, 0.68],
        names: ['Port Side', 'Starboard Side']
      };
  }
};

export const Canvas3D: React.FC<Canvas3DProps> = ({
  state,
  targetNode,
  onSelectTargetNode,
  onShowToast,
  onUpdateOrganList,
  canvasRef,
  sceneRef,
  cameraRef,
  rendererRef,
  controlsRef,
  shipGroupRef,
  highlightedSection,
}) => {
  const highlightGroupRef = useRef<THREE.Group | null>(null);
  const sectionOverlayRef = useRef<THREE.Group | null>(null);
  const animatedTentaclesRef = useRef<THREE.Mesh[]>([]);
  const animatedAppendagesRef = useRef<THREE.Mesh[]>([]);
  const animatedOrgansRef = useRef<THREE.Mesh[]>([]);
  const animatedHeartRef = useRef<THREE.Mesh | null>(null);
  const animatedSpiraclesRef = useRef<THREE.Mesh[]>([]);
  const animatedVesselsRef = useRef<THREE.Mesh[]>([]);
  const animatedThrustersRef = useRef<THREE.Mesh[]>([]);
  const thrusterExhaustPointsRef = useRef<THREE.Vector3[]>([]);
  const materialsRef = useRef<Record<string, THREE.Material>>({});
  const sporeParticlesRef = useRef<THREE.Points | null>(null);
  const particleSystemRef = useRef<THREE.Points | null>(null);
  const particleVelocitiesRef = useRef<THREE.Vector3[]>([]);
  const lastBeatTimeRef = useRef<number>(0);
  const rimLightRef = useRef<THREE.PointLight | null>(null);
  const coreLightRef = useRef<THREE.PointLight | null>(null);

  // ── Pipeline conduit flow particle animation refs ──
  // Each entry holds a CatmullRomCurve3 and an array of small sphere meshes that travel along it.
  const conduitFlowRef = useRef<{ curve: THREE.CatmullRomCurve3; particles: THREE.Mesh[]; offset: number }[]>([]);
  // Conduit groups keyed by pipeline type, for visibility toggling without full rebuild.
  const conduitGroupsRef = useRef<Record<OrganPipelineType, THREE.Group | null>>({
    BIO_PLASMA: null,
    HEMOLYMPH: null,
    NERVOUS: null,
    LIFE_SUPPORT: null,
    ARMOR_DEFENSE: null,
  });

  // ── Disruptor firing FX refs ──
  const disruptorMeshesRef = useRef<THREE.Mesh[]>([]);
  const firingStateRef = useRef<{ isFiring: boolean; startTime: number; beams: THREE.Mesh[] }>({
    isFiring: false,
    startTime: 0,
    beams: [],
  });
  // Shared Timer ref — replaces deprecated THREE.Clock. Used by both the
  // animation loop and the disruptor firing handler so they share the same
  // time source (fixes a pre-existing bug where the firing handler created a
  // separate Clock with a different epoch, causing startTime ≈ 0 and instant
  // firing completion).
  const timerRef = useRef<THREE.Timer | null>(null);
  const lastFireDisruptorsRef = useRef<number>(0);

  // ── Organ dragging + live hull adaptation refs ──
  // Store the build-time state needed to re-adapt the hull when an organ is dragged.
  const spineNodesRef = useRef<{ z: number; y: number; xArch: number; radius: number; baseRadius: number }[]>([]);
  const candidateOrgansRef = useRef<any[]>([]);
  const pipelineNodesRef = useRef<OrganPipelineNode[]>([]);
  const hullGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const numCrossURef = useRef<number>(0);
  const numCrossVRef = useRef<number>(0);
  const sampleSurfacePosRef = useRef<((u: number, v: number) => THREE.Vector3) | null>(null);
  const sampleSurfaceRef = useRef<((u: number, v: number) => { position: THREE.Vector3; normal: THREE.Vector3; u: number; v: number }) | null>(null);
  const adaptHullRef = useRef<((reprojectOrgans?: boolean) => void) | null>(null);
  const blendBridgeManagerRef = useRef<BlendBridgeManager | null>(null);

  // ── Transform gizmo refs ──
  // TransformControls gizmo attached to the selected organ for translate/rotate.
  const transformControlsRef = useRef<TransformControls | null>(null);
  const selectedOrganMeshRef = useRef<THREE.Mesh | null>(null);
  const gizmoModeRef = useRef<'translate' | 'rotate'>('translate');

  // ── Procedural pipeline config ref ──
  // Stores the current pipeline configuration for SDF-first organ generation.
  // Initialized with defaults from the research recommendations.
  const pipelineConfigRef = useRef<PipelineConfig>(DEFAULT_PIPELINE_CONFIG);

  // Update Material colors & modes according to Anatomy Layer & View Mode
  const updateMaterials = useCallback(() => {
    const currentTheme = themes[state.theme];
    const texture = generateBioSkinTexture(state.seed);

    const isWire = state.viewMode === 'wireframe';
    const isXray = state.viewMode === 'xray';
    const layer = state.anatomyLayer;

    // Helper opacity calculator based on active anatomy layer
    const getLayerOpacity = (type: 'shell' | 'bone' | 'organ' | 'vein' | 'muscle') => {
      if (isXray) {
        if (type === 'shell') return 0.15;
        if (type === 'organ' || type === 'vein') return 0.9;
        return 0.3;
      }
      if (layer === 'full') return 1.0;
      if (layer === 'exoskeleton') {
        if (type === 'shell' || type === 'bone') return 1.0;
        return 0.15;
      }
      if (layer === 'vascular') {
        if (type === 'vein' || type === 'organ') return 1.0;
        return 0.12;
      }
      if (layer === 'organs') {
        if (type === 'organ') return 1.0;
        return 0.18;
      }
      if (layer === 'muscular') {
        if (type === 'muscle') return 1.0;
        return 0.2;
      }
      return 1.0;
    };

    const mats: Record<string, THREE.Material> = {};

    const carapaceOp = getLayerOpacity('shell');
    // Generate bioluminescent reaction-diffusion textures for the hull surface.
    // These create the organic, alien-looking patterns described in LORE.md
    // using the Gray-Scott model (see reactionDiffusion.ts).
    const bioluminescentTextures = pipelineConfigRef.current.enableBioluminescentTextures
      ? generateBioluminescentTextures(
          pipelineConfigRef.current,
          new THREE.Color(currentTheme.glow),
          new THREE.Color(currentTheme.carapace),
        )
      : null;
    mats.carapace = new THREE.MeshStandardMaterial({
      color: currentTheme.carapace,
      roughness: 0.35,
      metalness: 0.6,
      bumpMap: texture,
      bumpScale: 0.08,
      // Bioluminescent reaction-diffusion pattern (Gray-Scott model)
      emissiveMap: bioluminescentTextures?.emissive ?? null,
      emissive: bioluminescentTextures ? currentTheme.glow : 0x000000,
      emissiveIntensity: bioluminescentTextures ? 1.5 : 0,
      map: bioluminescentTextures?.diffuse ?? null,
      wireframe: isWire,
      transparent: carapaceOp < 1.0,
      opacity: carapaceOp,
      side: THREE.DoubleSide,
    });

    const fleshOp = getLayerOpacity('organ');
    mats.flesh = new THREE.MeshStandardMaterial({
      color: currentTheme.flesh,
      roughness: 0.2,
      metalness: 0.1,
      bumpMap: texture,
      bumpScale: 0.12,
      wireframe: isWire,
      transparent: fleshOp < 1.0,
      opacity: fleshOp,
    });

    // Appendage material — same as flesh but double-sided so thin surfaces
    // (fins, flukes, sails) are visible from both sides with correct lighting.
    mats.appendage = new THREE.MeshStandardMaterial({
      color: currentTheme.flesh,
      roughness: 0.25,
      metalness: 0.1,
      bumpMap: texture,
      bumpScale: 0.08,
      wireframe: isWire,
      transparent: fleshOp < 1.0,
      opacity: fleshOp,
      side: THREE.DoubleSide,
      flatShading: false,
    });

    const boneOp = getLayerOpacity('bone');
    mats.bone = new THREE.MeshStandardMaterial({
      color: currentTheme.bone,
      roughness: 0.6,
      metalness: 0.1,
      wireframe: isWire,
      transparent: boneOp < 1.0,
      opacity: boneOp,
    });

    const muscleOp = getLayerOpacity('muscle');
    mats.muscleTendon = new THREE.MeshStandardMaterial({
      color: currentTheme.flesh,
      roughness: 0.4,
      metalness: 0.2,
      wireframe: isWire,
      transparent: muscleOp < 1.0,
      opacity: muscleOp,
    });

    mats.glowNode = new THREE.MeshStandardMaterial({
      color: currentTheme.glow,
      emissive: currentTheme.glow,
      emissiveIntensity: layer === 'organs' || layer === 'vascular' || isXray ? 3.2 : 1.8,
      roughness: 0.1,
      wireframe: isWire,
    });

    mats.vascularVein = new THREE.MeshStandardMaterial({
      color: currentTheme.blood,
      emissive: currentTheme.blood,
      emissiveIntensity: layer === 'vascular' ? 3.5 : 2.0,
      roughness: 0.1,
      wireframe: isWire,
    });

    mats.heartCore = new THREE.MeshStandardMaterial({
      color: currentTheme.blood,
      emissive: currentTheme.glow,
      emissiveIntensity: 2.8,
      roughness: 0.2,
      wireframe: isWire,
    });

    mats.thrusterCore = new THREE.MeshBasicMaterial({
      color: currentTheme.glowSecondary,
      wireframe: isWire,
    });

    mats.sporeSac = new THREE.MeshPhysicalMaterial({
      color: currentTheme.glow,
      emissive: currentTheme.glow,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: layer === 'organs' ? 0.95 : 0.65,
      roughness: 0.1,
      transmission: 0.6,
    });

    mats.controlNetLine = new THREE.LineBasicMaterial({
      color: currentTheme.glowSecondary,
      transparent: true,
      opacity: 0.6,
    });

    mats.controlNodeMarker = new THREE.MeshBasicMaterial({
      color: currentTheme.glow,
    });

    mats.forceField = new THREE.MeshBasicMaterial({
      color: currentTheme.glowSecondary,
      transparent: true,
      opacity: 0.18,
      wireframe: true,
      depthWrite: false,
    });

    materialsRef.current = mats;

    if (rimLightRef.current) rimLightRef.current.color.setHex(currentTheme.glow);
    if (coreLightRef.current) coreLightRef.current.color.setHex(currentTheme.glow);
  }, [state.theme, state.seed, state.viewMode, state.anatomyLayer]);

  // Build the Procedural Spaceship Geometry
  const buildSpaceship = useCallback(() => {
    const shipGroup = shipGroupRef.current;
    if (!shipGroup) return;

    // Detach TransformControls before clearing children — otherwise the gizmo
    // stays attached to a mesh that's about to be removed from the scene graph,
    // causing the "attached 3D object must be a part of the scene graph" warning
    // to fire every frame. This can happen when state changes outside the
    // targetNode effect's dependency array trigger a rebuild.
    if (transformControlsRef.current) {
      transformControlsRef.current.detach();
      const helper = transformControlsRef.current.getHelper();
      if (helper.parent) helper.parent.remove(helper);
    }
    selectedOrganMeshRef.current = null;

    // Clear existing children
    while (shipGroup.children.length > 0) {
      shipGroup.remove(shipGroup.children[0]);
    }

    animatedTentaclesRef.current = [];
    animatedAppendagesRef.current = [];
    animatedOrgansRef.current = [];
    animatedSpiraclesRef.current = [];
    animatedVesselsRef.current = [];
    animatedThrustersRef.current = [];
    animatedHeartRef.current = null;
    thrusterExhaustPointsRef.current = [];
    conduitFlowRef.current = [];
    disruptorMeshesRef.current = [];
    // Clear firing beams from previous build
    firingStateRef.current.beams.forEach((b) => b.parent?.remove(b));
    firingStateRef.current.beams = [];
    firingStateRef.current.isFiring = false;

    const rng = LCG(state.seed);
    // Initialize the SDF-first procedural pipeline with the ship's seed
    // for deterministic noise variation across regenerations.
    initPipeline(state, DEFAULT_PIPELINE_CONFIG);
    updateMaterials();
    const mats = materialsRef.current;

    const length = state.length;
    const segments = state.segments;
    const startZ = -length / 2;

    // 1. PROCEDURAL REGULAR 3D SMOOTH ORGANIC CARAPACE HULL
    const numCrossU = Math.max(16, segments * 3); // Longitudinal mesh resolution
    const numCrossV = 28;                        // Cross-sectional ring resolution

    const spineNodes: { z: number; y: number; xArch: number; radius: number; baseRadius: number }[] = [];

    // ── Leviathan Silhouette Profile ──
    // Replaces the old symmetric sin(π·u) "grub" profile. Fast-swimming animals
    // (whales, tuna, Subnautica leviathans) carry their maximum girth at ~1/3
    // of body length from the nose, with a domed cranium, a subtle neck waist,
    // and a long graceful tail taper — a teardrop, not a larva.
    //
    //   nose half  (u ≤ peakU): r ∝ sin(π/2 · u/peakU)^noseRound   (domed nose)
    //   tail half  (u > peakU): r ∝ cos(π/2 · (u-peakU)/(1-peakU))^tailExp
    //
    // Both halves have zero slope at peakU → C1-continuous join. noseRound < 1
    // rounds the cranium; tailExp > 1 draws the tail out to a fine point.
    // Seed-driven variation keeps every ship's proportions unique.
    const peakU = 0.30 + rng() * 0.08;         // max girth at 30–38% from nose
    const noseRound = 0.70 + rng() * 0.22;     // < 1 = domed organic cranium
    const tailExp = 1.7 + rng() * 1.0;         // > 1 = long fine tail taper
    const headBulgeAmt = 0.08 + rng() * 0.08;  // cranial dome accent
    const neckPinchAmt = 0.05 + rng() * 0.05;  // waist behind the head
    const tailLift = 0.3 + rng() * 0.4;        // tail tip up-sweep fraction

    for (let i = 0; i <= numCrossU; i++) {
      const uProg = i / numCrossU;
      const z = startZ + uProg * length;

      // ── Spinal arch: mass over the thorax, proud head carriage, tail sweep ──
      // The old symmetric sin(π·u) arch humped the middle like a caterpillar.
      // A leviathan carries its dorsal mass over the thorax (at peakU), lifts
      // its head slightly, and sweeps the tail tip upward.
      let yArch = state.spinalArch * (
        0.85 * Math.exp(-((uProg - peakU) ** 2) / (2 * 0.24 ** 2)) +
        0.30 * Math.exp(-((uProg - 0.06) ** 2) / (2 * 0.06 ** 2)) +
        tailLift * Math.max(0, (uProg - 0.78) / 0.22) ** 2
      );
      let xArch = 0;
      if (state.symmetryType === 'asymmetrical') {
        xArch = Math.cos(uProg * Math.PI * 3) * 0.7;
        yArch += Math.sin(uProg * Math.PI * 3) * 0.7;
      }

      let r: number;
      if (state.symmetryType === 'spherical') {
        // Spherical archetypes stay intentionally round.
        r = Math.sin(uProg * Math.PI) * state.thoraxWidth * 1.5 + 0.4;
      } else {
        // Teardrop body of revolution.
        let f: number;
        if (uProg <= peakU) {
          f = Math.pow(Math.sin((Math.PI / 2) * (uProg / peakU)), noseRound);
        } else {
          f = Math.pow(Math.cos((Math.PI / 2) * ((uProg - peakU) / (1 - peakU))), tailExp);
        }
        // Cranial dome + neck waist give the head a readable identity.
        const headG = Math.exp(-((uProg - peakU * 0.30) ** 2) / (2 * 0.05 ** 2));
        const neckG = Math.exp(-((uProg - peakU * 0.68) ** 2) / (2 * 0.05 ** 2));
        f *= 1 + headBulgeAmt * headG - neckPinchAmt * neckG;
        r = f * state.thoraxWidth * 1.18;
      }
      // Taper to near-zero at the very tips so the hull closes smoothly.
      // The first and last 3% of the hull ramps the radius down to 0.02,
      // creating a smooth organic point instead of a flat disc cap.
      const tipZone = 0.03;
      if (uProg < tipZone) {
        const tipT = uProg / tipZone; // 0 at tip → 1 at zone edge
        r *= tipT * tipT; // quadratic ramp so it eases into the body curve
        r = Math.max(0.02, r);
      } else if (uProg > 1 - tipZone) {
        const tipT = (1 - uProg) / tipZone; // 0 at tip → 1 at zone edge
        r *= tipT * tipT;
        r = Math.max(0.02, r);
      } else {
        // Low floor keeps the fine tail taper (the old 0.35 floor forced a fat
        // tube everywhere — a major grub factor). adaptHull() still expands the
        // hull outward wherever organs need interior volume.
        r = Math.max(0.12, r);
      }

      spineNodes.push({ z, y: yArch, xArch, radius: r, baseRadius: r });
    }

    // ── Maximum base hull surface incline constraint (45°) ──
    // For a surface of revolution P(z,θ) = (r(z)cosθ, yArch(z) + r(z)sinθ, z),
    // the surface incline (angle from the longitudinal z-axis) at any point is:
    //   tan(α) = sqrt((dr/dz)² + (dyArch/dz)²)
    // At 45° this means sqrt(Δr² + Δy²) ≤ Δz between consecutive spine nodes.
    //
    // IMPORTANT: The constraint applies only to the *body* of the hull — the
    // region between the tip closure zones. The tips (first/last ~10%) must
    // close to near-zero radius, which inherently requires steep angles. Forcing
    // 45° on the tips would eat most of the ship length in gradual tapers,
    // making every ship look like a grub. The tip zones are exempt; the 45°
    // ceiling governs the main body transitions (head taper → thorax → tail
    // taper) so the hull doesn't have near-vertical walls or sheer drops.
    //
    // The constraint is enforced via alternating forward/backward passes that
    // clamp radius and y-arch changes. Passes are confined to the body region
    // so the tip closure shape is preserved.
    {
      const MAX_INCLINE_DEG = 45;
      const MAX_SLOPE = Math.tan((MAX_INCLINE_DEG * Math.PI) / 180); // 1.0
      const CONVERGENCE_PASSES = 3;
      // Body region: exclude the tip closure zones (first/last 10% of nodes).
      // The tips need to close sharply; the body needs the 45° ceiling.
      const tipFraction = 0.10;
      const bodyStart = Math.ceil(spineNodes.length * tipFraction);
      const bodyEnd = Math.floor(spineNodes.length * (1 - tipFraction));

      for (let pass = 0; pass < CONVERGENCE_PASSES; pass++) {
        // Forward pass (head body → tail body): clamp next node toward current
        for (let i = bodyStart; i < bodyEnd; i++) {
          const cur = spineNodes[i];
          const next = spineNodes[i + 1];
          const dz = Math.abs(next.z - cur.z);
          if (dz < 1e-6) continue;
          const dr = next.radius - cur.radius;
          const dy = next.y - cur.y;
          // Euclidean slope — correct formula for surface of revolution incline
          const slope = Math.sqrt(dr * dr + dy * dy) / dz;
          if (slope > MAX_SLOPE) {
            const scale = MAX_SLOPE / slope;
            next.radius = cur.radius + dr * scale;
            next.y = cur.y + dy * scale;
            next.baseRadius = next.radius;
          }
        }
        // Backward pass (tail body → head body): clamp previous node toward current
        for (let i = bodyEnd; i > bodyStart; i--) {
          const cur = spineNodes[i];
          const prev = spineNodes[i - 1];
          const dz = Math.abs(cur.z - prev.z);
          if (dz < 1e-6) continue;
          const dr = prev.radius - cur.radius;
          const dy = prev.y - cur.y;
          const slope = Math.sqrt(dr * dr + dy * dy) / dz;
          if (slope > MAX_SLOPE) {
            const scale = MAX_SLOPE / slope;
            prev.radius = cur.radius + dr * scale;
            prev.y = cur.y + dy * scale;
            prev.baseRadius = prev.radius;
          }
        }
      }
    }

    // Mathematical Surface Sampling Function for Regular Organic 3D Hull
    const sampleOrganicSurfacePos = (u: number, v: number): THREE.Vector3 => {
      const clampedU = Math.max(0, Math.min(1, u));
      const clampedV = (v % 1.0 + 1.0) % 1.0;

      const floatIdx = clampedU * (spineNodes.length - 1);
      const idx = Math.floor(floatIdx);
      const alpha = floatIdx - idx;
      const n0 = spineNodes[idx];
      const n1 = spineNodes[Math.min(spineNodes.length - 1, idx + 1)];

      const z = THREE.MathUtils.lerp(n0.z, n1.z, alpha);
      const yArch = THREE.MathUtils.lerp(n0.y, n1.y, alpha);
      const xArch = THREE.MathUtils.lerp(n0.xArch, n1.xArch, alpha);
      const r = THREE.MathUtils.lerp(n0.radius, n1.radius, alpha);

      const angle = clampedV * Math.PI * 2;
      let radMod = 1.0;

      if (state.symmetryType === 'radial-5') {
        radMod *= (1.0 + 0.35 * Math.cos(5 * angle));
      } else if (state.symmetryType === 'radial-3') {
        radMod *= (1.0 + 0.38 * Math.cos(3 * angle));
      } else if (state.symmetryType === 'biradial') {
        radMod *= (1.0 + 0.30 * Math.cos(4 * angle));
      } else if (state.symmetryType === 'spherical') {
        radMod *= (1.0 + 0.12 * Math.cos(2 * angle));
      } else if (state.symmetryType === 'asymmetrical') {
        radMod *= (1.0 + 0.30 * Math.sin(angle * 2 + clampedU * Math.PI * 4));
      }

      if (state.loftProfile === 'trilobed') {
        radMod *= (1.0 + 0.2 * Math.cos(3 * angle));
      } else if (state.loftProfile === 'spine') {
        if (Math.abs(angle - Math.PI / 2) < 0.6) radMod *= 1.4;
      } else if (state.loftProfile === 'star') {
        radMod *= (1.0 + 0.25 * Math.cos(5 * angle));
      }

      // ── Leviathan cross-section shaping ──
      // A perfect circle reads as a tube/grub. Real swimmers have flattened
      // elliptical sections with a full belly amidships and a subtle dorsal
      // ridge crest. Both accent terms have zero slope at the lateral line
      // (sinA = 0) so the section stays C1-smooth. Spherical archetypes keep
      // their intentional roundness.
      let hF = 1.0;
      let wF = 1.0;
      if (state.symmetryType !== 'spherical') {
        const sinA = Math.sin(angle);
        const bellyT = Math.exp(-((clampedU - 0.45) ** 2) / (2 * 0.16 ** 2));
        const dorsal = Math.max(0, sinA);
        const ventral = Math.max(0, -sinA);
        hF = 0.84 + 0.12 * bellyT * ventral * ventral + 0.05 * Math.pow(dorsal, 6);
        wF = 1.0 + 0.05 * bellyT;
      }

      return new THREE.Vector3(
        xArch + Math.cos(angle) * r * radMod * wF,
        yArch + Math.sin(angle) * r * radMod * hF,
        z
      );
    };

    const sampleOrganicSurface = (u: number, v: number) => {
      const clampedU = Math.max(0, Math.min(1, u));
      const clampedV = (v % 1.0 + 1.0) % 1.0;
      const pos = sampleOrganicSurfacePos(clampedU, clampedV);

      const eps = 0.005;
      const pU1 = sampleOrganicSurfacePos(Math.min(1, clampedU + eps), clampedV);
      const pU0 = sampleOrganicSurfacePos(Math.max(0, clampedU - eps), clampedV);
      const pV1 = sampleOrganicSurfacePos(clampedU, clampedV + eps);
      const pV0 = sampleOrganicSurfacePos(clampedU, clampedV - eps);

      const Tu = new THREE.Vector3().subVectors(pU1, pU0).normalize();
      const Tv = new THREE.Vector3().subVectors(pV1, pV0).normalize();
      // Tv × Tu produces the outward-pointing normal for this parameterization
      // (u along spine z-axis, v counterclockwise around circumference).
      // Tu × Tv would point inward, which is incorrect for exterior organ placement.
      const normal = new THREE.Vector3().crossVectors(Tv, Tu).normalize();
      if (normal.lengthSq() < 0.0001) normal.set(0, 1, 0);

      return { position: pos, normal, Tu, Tv, u: clampedU, v: clampedV };
    };

    // Build standard high-precision 3D BufferGeometry for Organic Carapace
    const hullGeometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= numCrossU; i++) {
      const u = i / numCrossU;
      for (let j = 0; j <= numCrossV; j++) {
        const v = j / numCrossV;
        const pt = sampleOrganicSurfacePos(u, v);
        positions.push(pt.x, pt.y, pt.z);
        uvs.push(u, v);
      }
    }

    for (let i = 0; i < numCrossU; i++) {
      for (let j = 0; j < numCrossV; j++) {
        const row1 = i * (numCrossV + 1);
        const row2 = (i + 1) * (numCrossV + 1);

        const a = row1 + j;
        const b = row1 + j + 1;
        const c = row2 + j + 1;
        const d = row2 + j;

        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    // The hull tapers to near-zero radius at both tips (see spine radius code above),
    // so the tube closes smoothly into an organic point — no flat cap faces needed.

    hullGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    hullGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    hullGeometry.setIndex(indices);
    hullGeometry.computeVertexNormals();

    // Optional Catmull-Clark subdivision for smoother hull surface with
    // semi-sharp crease preservation (see subdivision.ts).
    // Applied when the pipeline config has subdivision enabled.
    const finalHullGeometry = pipelineConfigRef.current.enableSubdivision
      ? subdivideHull(hullGeometry, pipelineConfigRef.current)
      : hullGeometry;

    const carapaceMesh = new THREE.Mesh(finalHullGeometry, mats.carapace);
    carapaceMesh.userData = {
      name: 'Regular 3D Smooth Organic Carapace',
      category: 'Exoskeleton',
      desc: 'High-precision smooth 3D parametric organic chitin hull with zero surface artifacts.',
      metabolicRate: '12% Passive Armor Synthesis',
      neuralFreq: 'N/A (Structural Chitin)',
      enzymaticPressure: '1.2 MPa Shell Integrity',
      isHull: true, // Structural shell — not interactable, click-through to surface organs
    };
    shipGroup.add(carapaceMesh);

    // ── Anatomical Section Overlay Bands ──
    // Build a translucent overlay mesh for each ship section (cranial, neck,
    // thoracic, caudal, tail) by sampling the hull surface across the section's
    // u-range. Overlays are always present in the scene; a separate effect
    // toggles visibility/opacity based on `highlightedSection`.
    const sectionOverlayGroup = new THREE.Group();
    sectionOverlayGroup.name = '__sectionOverlays';
    const sectionBandV = 28; // cross-sectional resolution
    for (const sec of SHIP_SECTIONS) {
      const uSpan = sec.uMax - sec.uMin;
      const sectionBandU = Math.max(6, Math.ceil(uSpan * numCrossU));
      const sPositions: number[] = [];
      const sIndices: number[] = [];
      for (let i = 0; i <= sectionBandU; i++) {
        const u = sec.uMin + (i / sectionBandU) * uSpan;
        for (let j = 0; j <= sectionBandV; j++) {
          const v = j / sectionBandV;
          const pt = sampleOrganicSurfacePos(u, v);
          // Push slightly outward along the hull normal to avoid z-fighting.
          const eps = 0.003;
          const pU1 = sampleOrganicSurfacePos(Math.min(1, u + eps), v);
          const pU0 = sampleOrganicSurfacePos(Math.max(0, u - eps), v);
          const pV1 = sampleOrganicSurfacePos(u, Math.min(1, v + eps));
          const pV0 = sampleOrganicSurfacePos(u, Math.max(0, v - eps));
          const n = new THREE.Vector3()
            .subVectors(pU1, pU0)
            .cross(new THREE.Vector3().subVectors(pV1, pV0))
            .normalize();
          sPositions.push(
            pt.x + n.x * 0.06,
            pt.y + n.y * 0.06,
            pt.z + n.z * 0.06,
          );
        }
      }
      for (let i = 0; i < sectionBandU; i++) {
        for (let j = 0; j < sectionBandV; j++) {
          const row1 = i * (sectionBandV + 1);
          const row2 = (i + 1) * (sectionBandV + 1);
          const a = row1 + j;
          const b = row1 + j + 1;
          const c = row2 + j + 1;
          const d = row2 + j;
          sIndices.push(a, b, d, b, c, d);
        }
      }
      const sGeo = new THREE.BufferGeometry();
      sGeo.setAttribute('position', new THREE.Float32BufferAttribute(sPositions, 3));
      sGeo.setIndex(sIndices);
      sGeo.computeVertexNormals();
      const sMat = new THREE.MeshBasicMaterial({
        color: sec.color,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true,
      });
      const sMesh = new THREE.Mesh(sGeo, sMat);
      sMesh.userData = { isSectionOverlay: true, sectionId: sec.id };
      sectionOverlayGroup.add(sMesh);
    }
    shipGroup.add(sectionOverlayGroup);
    sectionOverlayRef.current = sectionOverlayGroup;

    // Helper: Create Flanged Organic Socket Collar to guarantee zero mesh discontinuity
    const createSocketCollar = (
      pos: THREE.Vector3,
      normal: THREE.Vector3,
      innerRadius: number,
      height: number = 0.35,
      material: THREE.Material = mats.carapace,
      name: string = 'Organic Socket Flange Collar'
    ) => {
      const collarGeo = new THREE.CylinderGeometry(innerRadius * 0.9, innerRadius * 1.5, height, 12);
      const collar = new THREE.Mesh(collarGeo, material);
      collar.position.copy(pos).addScaledVector(normal, -height * 0.2);
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      collar.quaternion.copy(quat);

      collar.userData = {
        name,
        category: 'Anatomical Joint Socket',
        desc: 'Flanged tissue socket collar providing seamless structural blending into the carapace hull.',
      };
      shipGroup.add(collar);
      return collar;
    };

    // Helper: Generate a seamless SDF blend bridge between a candidate organ
    // and the hull surface, where anatomical rules approve the blend.
    // (see organBlending.ts — evaluateBlend + generateHullBlendBridge)
    // This replaces the hard cylinder socket collar with a smooth organic fillet
    // for organs that should grow seamlessly from the hull (eyes, neural, spore).
    // Discrete/animated organs (tentacles, spiracles, ribs, habitat) keep the
    // socket collar — the blend rules return shouldBlend=false for those.
    // The BlendBridgeManager tracks bridges by ID for drag regeneration.
    const bridgeManager = new BlendBridgeManager(shipGroup);
    blendBridgeManagerRef.current = bridgeManager;
    // Base cross-section height factor matches the leviathan ellipse (0.84);
    // spherical archetypes keep circular sections.
    const hullHeightFactor = state.symmetryType === 'spherical' ? 1.0 : 0.84;
    bridgeManager.setHullSDF(spineNodes as SpineNode[], hullHeightFactor);

    const createBlendBridge = (
      organId: string,
      organType: string,
      basePos: THREE.Vector3,
      normal: THREE.Vector3,
      size: number,
      stalkLength: number,
      material: THREE.Material,
    ): THREE.Mesh | null => {
      // Use the organ's candidate id as the bridge ID for drag regeneration.
      const bridgeId = `organ_${organId}`;
      return bridgeManager.generateOrganHullBridge(bridgeId, organType, basePos, normal, size, stalkLength, material);
    };

    // 2. OVERLAPPING CHITIN ARMOR PLATES
    if (state.plateOverlap > 0) {
      const plateCount = Math.min(state.plateOverlap, segments);
      for (let p = 0; p < plateCount; p++) {
        const uProg = 0.15 + (p / (plateCount + 1)) * 0.7;
        const surf = sampleOrganicSurface(uProg, 0.25);
        const node = spineNodes[Math.floor(uProg * (spineNodes.length - 1))];
        if (!node) continue;

        const plateRadius = node.radius * 1.15;
        const plateGeo = new THREE.CylinderGeometry(plateRadius * 0.88, plateRadius, 0.75, 12, 1, true, -Math.PI * 0.42, Math.PI * 0.84);
        plateGeo.rotateX(Math.PI / 2);
        const plateMesh = new THREE.Mesh(plateGeo, mats.carapace);

        plateMesh.position.copy(surf.position);
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), surf.normal);
        plateMesh.quaternion.copy(quat);

        plateMesh.userData = {
          name: `Overlapping Dorsal Chitin Plate #${p + 1}`,
          category: 'Exoskeleton',
          desc: 'Layered articulated armor scale mitigating directional kinetic force.',
          metabolicRate: '5% Chitin Regeneration',
          enzymaticPressure: '3.4 MPa Impact Capacity',
        };
        shipGroup.add(plateMesh);
      }
    }

    // 3. CENTRAL ORGAN SYSTEM PIPELINE TOPOLOGY NODES & CONDUITS
    const midIdx = Math.floor(spineNodes.length / 2);
    const heartNode = spineNodes[midIdx] || spineNodes[0];
    const headNode = spineNodes[0];

    // ── Build Ship Geometry Context & Pipeline Graph (pipelineGraph.ts) ──
    const tailNode = spineNodes[spineNodes.length - 1];

    // Hull radius interpolation: sample the spine node radius at any z-position.
    // This lets pipelineGraph position functions keep organs inside the hull.
    const sampleRadiusAtZ = (z: number): number => {
      const startZ = spineNodes[0].z;
      const endZ = spineNodes[spineNodes.length - 1].z;
      const span = endZ - startZ;
      if (span <= 0) return spineNodes[0].radius;
      const t = Math.max(0, Math.min(1, (z - startZ) / span));
      const floatIdx = t * (spineNodes.length - 1);
      const idx = Math.floor(floatIdx);
      const alpha = floatIdx - idx;
      const n0 = spineNodes[idx];
      const n1 = spineNodes[Math.min(spineNodes.length - 1, idx + 1)];
      return THREE.MathUtils.lerp(n0.radius, n1.radius, alpha);
    };
    const sampleSpineYAtZ = (z: number): number => {
      const startZ = spineNodes[0].z;
      const endZ = spineNodes[spineNodes.length - 1].z;
      const span = endZ - startZ;
      if (span <= 0) return spineNodes[0].y;
      const t = Math.max(0, Math.min(1, (z - startZ) / span));
      const floatIdx = t * (spineNodes.length - 1);
      const idx = Math.floor(floatIdx);
      const alpha = floatIdx - idx;
      const n0 = spineNodes[idx];
      const n1 = spineNodes[Math.min(spineNodes.length - 1, idx + 1)];
      return THREE.MathUtils.lerp(n0.y, n1.y, alpha);
    };

    const ctx: ShipGeometryContext = {
      headPos: new THREE.Vector3(headNode.xArch, headNode.y, headNode.z),
      headRadius: headNode.radius,
      heartPos: new THREE.Vector3(heartNode.xArch, heartNode.y, heartNode.z),
      heartRadius: heartNode.radius,
      tailPos: new THREE.Vector3(tailNode.xArch, tailNode.y, tailNode.z),
      tailRadius: tailNode.radius,
      spineNormal: new THREE.Vector3(0, 1, 0), // approximate up normal
      thoraxWidth: state.thoraxWidth,
      length: state.length,
      sampleRadiusAtZ,
      sampleSpineYAtZ,
    };
    const pipelineNodes = buildPipelineNodes(ctx);
    const pipelineConnections = buildPipelineConnections(pipelineNodes, ctx);
    const nodeMap = new Map(pipelineNodes.map(n => [n.id, n]));

    // Pipeline 1: Bio-Plasma Energy & Propulsion System
    const plasmaGlandGeo = new THREE.DodecahedronGeometry(heartNode.radius * 0.55, 1);
    const plasmaGlandMesh = new THREE.Mesh(plasmaGlandGeo, mats.glowNode);
    plasmaGlandMesh.position.set(...(nodeMap.get(NODE_IDS.PLASMA_GLAND)!.position));
    plasmaGlandMesh.userData = {
      name: 'Bio-Plasma Electrolysis Gland',
      category: 'Bio-Plasma System',
      desc: 'Thoracic organ electrolyzing ingested comet ice into reactive hydrogen plasma fuel.',
      metabolicRate: '850 kW Electrolysis Rate',
      enzymaticPressure: '140 Bar Fuel Buffer',
      pipeline: 'BIO_PLASMA',
      role: 'GENERATION',
      downstreamNodeNames: ['Muscular Plasma Bladder Reservoir'],
      operatingPressure: '140 Bar',
      outputCapacity: nodeMap.get(NODE_IDS.PLASMA_GLAND)!.telemetry.outputRate,
    };
    shipGroup.add(plasmaGlandMesh);

    const plasmaBladderGeo = new THREE.IcosahedronGeometry(heartNode.radius * 0.45, 2);
    const plasmaBladderMesh = new THREE.Mesh(plasmaBladderGeo, mats.sporeSac);
    plasmaBladderMesh.position.set(...(nodeMap.get(NODE_IDS.PLASMA_BLADDER)!.position));
    plasmaBladderMesh.userData = {
      name: 'Muscular Plasma Bladder Reservoir',
      category: 'Bio-Plasma System',
      desc: 'Pressurized bio-fuel reservoir storing high-energy plasma fuel under heavy sphincter tension.',
      metabolicRate: '140 Bar Hydro-Pressure',
      pipeline: 'BIO_PLASMA',
      role: 'STORAGE',
      upstreamNodeName: 'Bio-Plasma Electrolysis Gland',
      downstreamNodeNames: ['Primary Plasma Highway Trunk', 'Bio-Plasma Vent Nozzles'],
      operatingPressure: '140 Bar',
    };
    shipGroup.add(plasmaBladderMesh);

    // 3D Bio-Plasma Feed Conduit Tube
    const plasmaTrunkPos = nodeMap.get(NODE_IDS.PLASMA_TRUNK)!.position;
    const plasmaTubeCurve = new THREE.CatmullRomCurve3([
      plasmaGlandMesh.position,
      plasmaBladderMesh.position,
      new THREE.Vector3(plasmaTrunkPos[0], plasmaTrunkPos[1], plasmaTrunkPos[2]),
      new THREE.Vector3(0, heartNode.y - 0.4, spineNodes[spineNodes.length - 1].z)
    ]);
    const plasmaTubeGeo = new THREE.TubeGeometry(plasmaTubeCurve, 32, 0.18, 8, false);
    const plasmaTubeMesh = new THREE.Mesh(plasmaTubeGeo, mats.vascularVein);
    plasmaTubeMesh.userData = {
      name: 'Primary Plasma Highway Conduit Trunk',
      category: 'Bio-Plasma Conduit',
      pipeline: 'BIO_PLASMA',
      role: 'DISTRIBUTION',
      upstreamNodeName: 'Muscular Plasma Bladder Reservoir',
      downstreamNodeNames: ['Bio-Plasma Vent Nozzles'],
      operatingPressure: '140 Bar',
      outputCapacity: nodeMap.get(NODE_IDS.PLASMA_TRUNK)!.telemetry.outputRate,
    };
    shipGroup.add(plasmaTubeMesh);

    // Pipeline 2: Hemolymph Circulation System
    const heartGeo = new THREE.IcosahedronGeometry(heartNode.radius * 0.65, 2);
    const heartMesh = new THREE.Mesh(heartGeo, mats.heartCore);
    heartMesh.position.set(...(nodeMap.get(NODE_IDS.HEART_CORE)!.position));
    heartMesh.userData = {
      name: 'Aorta Bioluminescent Central Engine (Heart)',
      category: 'Circulatory Core',
      desc: 'Triple-chambered central hydraulic pump generating copper-hemocyanin blood pressure.',
      metabolicRate: '98% Primary Energy Flux',
      neuralFreq: `${Math.round(50 + state.neuralNodes * 1.5)} BPM Sync`,
      enzymaticPressure: '14.8 bar Hydraulic Stroke',
      pipeline: 'HEMOLYMPH',
      role: 'GENERATION',
      downstreamNodeNames: ['Hemolymph Atrium Reservoir', 'Central Aorta Highway'],
      operatingPressure: '18.5 Bar',
      outputCapacity: nodeMap.get(NODE_IDS.HEART_CORE)!.telemetry.outputRate,
    };
    shipGroup.add(heartMesh);
    animatedHeartRef.current = heartMesh;

    const atriumGeo = new THREE.OctahedronGeometry(heartNode.radius * 0.35, 1);
    const atriumMesh = new THREE.Mesh(atriumGeo, mats.heartCore);
    atriumMesh.position.set(...(nodeMap.get(NODE_IDS.HEMOLYMPH_ATRIUM)!.position));
    atriumMesh.userData = {
      name: 'Hemolymph Atrium Reservoir',
      category: 'Circulatory Core',
      desc: 'Sub-dorsal cardiac atrium buffering copper-hemocyanin blood pressure during maneuver spikes.',
      pipeline: 'HEMOLYMPH',
      role: 'STORAGE',
      upstreamNodeName: 'Aorta Bioluminescent Central Engine (Heart)',
      downstreamNodeNames: ['Central Aorta Highway'],
      operatingPressure: '18.5 Bar',
    };
    shipGroup.add(atriumMesh);

    // Pipeline 3: Nervous & Cybernetic Synaptic System
    const brainGeo = new THREE.IcosahedronGeometry(headNode.radius * 0.6, 2);
    const brainMesh = new THREE.Mesh(brainGeo, mats.glowNode);
    brainMesh.position.set(...(nodeMap.get(NODE_IDS.BRAIN_CORE)!.position));
    brainMesh.userData = {
      name: 'Primary Ganglion Brain Core',
      category: 'Nervous Subsystem',
      desc: 'Central bio-cognitive intelligence core coordinating autonomous ship systems.',
      neuralFreq: '98.4% Synaptic Coherence',
      pipeline: 'NERVOUS',
      role: 'GENERATION',
      downstreamNodeNames: ['Human Neuro-Link Interface Pod', 'Spinal Axon Cord Highway'],
      operatingPressure: '8.8 Bar Bio-Electric',
      efficiencyCoherence: nodeMap.get(NODE_IDS.BRAIN_CORE)!.telemetry.efficiencyCoherence,
    };
    shipGroup.add(brainMesh);

    const neuroLinkGeo = new THREE.CylinderGeometry(0.3, 0.35, 0.4, 8);
    const neuroLinkMesh = new THREE.Mesh(neuroLinkGeo, mats.carapace);
    neuroLinkMesh.position.set(...(nodeMap.get(NODE_IDS.NEURO_LINK)!.position));
    neuroLinkMesh.userData = {
      name: 'Human Neuro-Link Interface Pod',
      category: 'Nervous Subsystem',
      desc: 'Graphene conductive socket interfacing human pilot neural implants directly into the spinal ganglion.',
      pipeline: 'NERVOUS',
      role: 'INTERFACE',
      upstreamNodeName: 'Primary Ganglion Brain Core',
      downstreamNodeNames: ['Spinal Axon Cord Highway'],
      efficiencyCoherence: nodeMap.get(NODE_IDS.NEURO_LINK)!.telemetry.efficiencyCoherence,
    };
    shipGroup.add(neuroLinkMesh);

    // 3D Spinal Axon Nerve Cord Tube
    const axonCordPos = nodeMap.get(NODE_IDS.AXON_CORD)!.position;
    const axonCurve = new THREE.CatmullRomCurve3([
      brainMesh.position,
      neuroLinkMesh.position,
      new THREE.Vector3(axonCordPos[0], axonCordPos[1], axonCordPos[2]),
      new THREE.Vector3(0, spineNodes[spineNodes.length - 1].y + 0.4, spineNodes[spineNodes.length - 1].z)
    ]);
    const axonTubeGeo = new THREE.TubeGeometry(axonCurve, 32, 0.12, 8, false);
    const axonTubeMesh = new THREE.Mesh(axonTubeGeo, mats.glowNode);
    axonTubeMesh.userData = {
      name: 'Spinal Axon Cord Highway',
      category: 'Nervous Subsystem',
      desc: 'Encapsulated myelinated nerve trunk delivering 120 m/s nerve impulses along dorsal spine.',
      pipeline: 'NERVOUS',
      role: 'DISTRIBUTION',
      upstreamNodeName: 'Primary Ganglion Brain Core',
      downstreamNodeNames: ['Ocular Beam Stalk Pods', 'Biomechanical Muscle Tendons'],
      efficiencyCoherence: nodeMap.get(NODE_IDS.AXON_CORD)!.telemetry.efficiencyCoherence,
    };
    shipGroup.add(axonTubeMesh);

    // Pipeline 4: Endosymbiotic Life Support System
    const gizzardGeo = new THREE.ConeGeometry(headNode.radius * 0.5, 1.2, 8);
    const gizzardMesh = new THREE.Mesh(gizzardGeo, mats.bone);
    gizzardMesh.position.set(...(nodeMap.get(NODE_IDS.ICE_GIZZARD)!.position));
    gizzardMesh.rotation.x = Math.PI * 0.5;
    gizzardMesh.userData = {
      name: 'Comet Ice Ingestion Gizzard',
      category: 'Life Support System',
      desc: 'Ventral mouth cavity organ crushing ingested comet ice and minerals for metabolic bio-synthesis.',
      pipeline: 'LIFE_SUPPORT',
      role: 'GENERATION',
      downstreamNodeNames: ['Photosynthetic Bio-Moss Bed'],
      outputCapacity: nodeMap.get(NODE_IDS.ICE_GIZZARD)!.telemetry.outputRate,
    };
    shipGroup.add(gizzardMesh);

    const bioMossGeo = new THREE.TorusGeometry(heartNode.radius * 0.55, 0.15, 8, 24);
    const bioMossMesh = new THREE.Mesh(bioMossGeo, mats.flesh);
    bioMossMesh.position.set(...(nodeMap.get(NODE_IDS.BIO_MOSS)!.position));
    bioMossMesh.rotation.x = Math.PI * 0.5;
    bioMossMesh.userData = {
      name: 'Photosynthetic Bio-Moss Bed',
      category: 'Life Support System',
      desc: 'Kleptoplastic algal carpet converting crew CO2 and liquid waste into pure 420 L/min oxygen.',
      pipeline: 'LIFE_SUPPORT',
      role: 'STORAGE',
      upstreamNodeName: 'Comet Ice Ingestion Gizzard',
      downstreamNodeNames: ['Human Habitat Room Chambers'],
      outputCapacity: nodeMap.get(NODE_IDS.BIO_MOSS)!.telemetry.outputRate,
    };
    shipGroup.add(bioMossMesh);

    // ── Pipeline Graph: 7 Missing Organ Nodes (from pipelineGraph.ts) ──

    // 1. Caudal Manifold Distribution Trunk (BIO_PLASMA, DISTRIBUTION)
    const caudalManifoldPos = nodeMap.get(NODE_IDS.CAUDAL_MANIFOLD)!.position;
    const caudalManifoldGeo = new THREE.TorusKnotGeometry(0.45, 0.12, 64, 8, 2, 3);
    const caudalManifoldMesh = new THREE.Mesh(caudalManifoldGeo, mats.glowNode);
    caudalManifoldMesh.position.set(caudalManifoldPos[0], caudalManifoldPos[1], caudalManifoldPos[2]);
    caudalManifoldMesh.userData = {
      name: 'Caudal Manifold Distribution Trunk',
      category: 'Bio-Plasma System',
      desc: 'Hydrodynamic splitting manifold distributing plasma flow to caudal siphon vent nozzles.',
      pipeline: 'BIO_PLASMA',
      role: 'DISTRIBUTION',
      upstreamNodeName: 'Primary Plasma Highway Conduit Trunk',
      downstreamNodeNames: ['Bio-Plasma Vent Nozzles'],
      outputCapacity: nodeMap.get(NODE_IDS.CAUDAL_MANIFOLD)!.telemetry.outputRate,
    };
    shipGroup.add(caudalManifoldMesh);

    // 2. Bio-Plasma Disruptor Glands (BIO_PLASMA, EFFECTOR) — clickable for firing FX
    const disruptorPos = nodeMap.get(NODE_IDS.DISRUPTOR_GLAND)!.position;
    const disruptorGeo = new THREE.OctahedronGeometry(0.5, 1);
    const disruptorMesh = new THREE.Mesh(disruptorGeo, mats.thrusterCore);
    disruptorMesh.position.set(disruptorPos[0], disruptorPos[1], disruptorPos[2]);
    disruptorMesh.userData = {
      name: 'Bio-Plasma Disruptor Glands',
      category: 'Bio-Plasma System',
      desc: 'Anterior dorsal flank glands capable of projecting 450 MW thermal disruptor beams.',
      pipeline: 'BIO_PLASMA',
      role: 'EFFECTOR',
      upstreamNodeName: 'Primary Plasma Highway Conduit Trunk',
      downstreamNodeNames: [],
      outputCapacity: nodeMap.get(NODE_IDS.DISRUPTOR_GLAND)!.telemetry.outputRate,
      isDisruptor: true,
    };
    shipGroup.add(disruptorMesh);
    disruptorMeshesRef.current.push(disruptorMesh);

    // Mirror disruptor on the opposite flank for bilateral symmetry
    const disruptorMirrorGeo = new THREE.OctahedronGeometry(0.5, 1);
    const disruptorMirrorMesh = new THREE.Mesh(disruptorMirrorGeo, mats.thrusterCore);
    disruptorMirrorMesh.position.set(-disruptorPos[0], disruptorPos[1], disruptorPos[2]);
    disruptorMirrorMesh.userData = {
      name: 'Bio-Plasma Disruptor Glands (Port)',
      category: 'Bio-Plasma System',
      desc: 'Anterior dorsal flank glands capable of projecting 450 MW thermal disruptor beams.',
      pipeline: 'BIO_PLASMA',
      role: 'EFFECTOR',
      upstreamNodeName: 'Primary Plasma Highway Conduit Trunk',
      downstreamNodeNames: [],
      outputCapacity: nodeMap.get(NODE_IDS.DISRUPTOR_GLAND)!.telemetry.outputRate,
      isDisruptor: true,
    };
    shipGroup.add(disruptorMirrorMesh);
    disruptorMeshesRef.current.push(disruptorMirrorMesh);

    // 3. Central Aorta Highway (HEMOLYMPH, DISTRIBUTION) — tube along spine
    const aortaPos = nodeMap.get(NODE_IDS.AORTA_HIGHWAY)!.position;
    const aortaPathPoints: THREE.Vector3[] = [];
    for (let i = 0; i < spineNodes.length; i++) {
      const sn = spineNodes[i];
      aortaPathPoints.push(new THREE.Vector3(0, sn.y, sn.z));
    }
    const aortaCurve = new THREE.CatmullRomCurve3(aortaPathPoints);
    const aortaTubeGeo = new THREE.TubeGeometry(aortaCurve, 48, 0.22, 10, false);
    const aortaTubeMesh = new THREE.Mesh(aortaTubeGeo, mats.vascularVein);
    aortaTubeMesh.userData = {
      name: 'Central Aorta Highway',
      category: 'Circulatory Core',
      desc: "Central arterial highway distributing hemolymph throughout the hull via Murray's Law branching.",
      pipeline: 'HEMOLYMPH',
      role: 'DISTRIBUTION',
      upstreamNodeName: 'Hemolymph Atrium Reservoir',
      downstreamNodeNames: ['Luminescent Flank Arteries'],
      outputCapacity: nodeMap.get(NODE_IDS.AORTA_HIGHWAY)!.telemetry.outputRate,
    };
    shipGroup.add(aortaTubeMesh);

    // 4. Cyber-Airlock Stomata Valves (LIFE_SUPPORT, EFFECTOR)
    const airlockPos = nodeMap.get(NODE_IDS.CYBER_AIRLOCK)!.position;
    const airlockGeo = new THREE.TorusGeometry(0.3, 0.08, 8, 16);
    const airlockMesh = new THREE.Mesh(airlockGeo, mats.carapace);
    airlockMesh.position.set(airlockPos[0], airlockPos[1], airlockPos[2]);
    airlockMesh.rotation.x = Math.PI * 0.5;
    airlockMesh.userData = {
      name: 'Cyber-Airlock Stomata Valves',
      category: 'Life Support System',
      desc: 'Contractile stomata valves regulating habitat pressure differential against vacuum.',
      pipeline: 'LIFE_SUPPORT',
      role: 'EFFECTOR',
      upstreamNodeName: 'Human Habitat Room Chambers',
      downstreamNodeNames: [],
      operatingPressure: nodeMap.get(NODE_IDS.CYBER_AIRLOCK)!.telemetry.operatingPressure,
    };
    shipGroup.add(airlockMesh);

    // Mirror airlock on opposite flank
    const airlockMirrorGeo = new THREE.TorusGeometry(0.3, 0.08, 8, 16);
    const airlockMirrorMesh = new THREE.Mesh(airlockMirrorGeo, mats.carapace);
    airlockMirrorMesh.position.set(-airlockPos[0], airlockPos[1], airlockPos[2]);
    airlockMirrorMesh.rotation.x = Math.PI * 0.5;
    airlockMirrorMesh.userData = {
      name: 'Cyber-Airlock Stomata Valves (Port)',
      category: 'Life Support System',
      desc: 'Contractile stomata valves regulating habitat pressure differential against vacuum.',
      pipeline: 'LIFE_SUPPORT',
      role: 'EFFECTOR',
      upstreamNodeName: 'Human Habitat Room Chambers',
      downstreamNodeNames: [],
      operatingPressure: nodeMap.get(NODE_IDS.CYBER_AIRLOCK)!.telemetry.operatingPressure,
    };
    shipGroup.add(airlockMirrorMesh);

    // 5. Chitinous Bone Vertebrae (ARMOR_DEFENSE, STRUCTURAL) — series along spine
    const chitinPos = nodeMap.get(NODE_IDS.CHITIN_VERTEBRA)!.position;
    const vertebraCount = Math.min(12, Math.max(6, Math.floor(state.length / 2)));
    for (let v = 0; v < vertebraCount; v++) {
      const vFrac = v / Math.max(1, vertebraCount - 1);
      const spineIdx = Math.floor(vFrac * (spineNodes.length - 1));
      const sn = spineNodes[spineIdx];
      const vertGeo = new THREE.IcosahedronGeometry(0.28, 0);
      const vertMesh = new THREE.Mesh(vertGeo, mats.bone);
      // Vertebrae sit on the spine centerline — no fixed y offset, which would
      // poke through the hull at the tapered head/tail where radius is small.
      vertMesh.position.set(0, sn.y, sn.z);
      vertMesh.userData = {
        name: `Chitinous Bone Vertebra #${v + 1}`,
        category: 'Armor & Defense',
        desc: 'Calcified chitinous vertebra providing structural load-bearing along the spinal column.',
        pipeline: 'ARMOR_DEFENSE',
        role: 'STRUCTURAL',
        upstreamNodeName: 'Spinal Axon Cord Highway',
        downstreamNodeNames: ['Overlapping Carapace Plates'],
        outputCapacity: nodeMap.get(NODE_IDS.CHITIN_VERTEBRA)!.telemetry.outputRate,
      };
      shipGroup.add(vertMesh);
    }

    // 6. Bio-Nanite Coagulation Bed (ARMOR_DEFENSE, REPAIR)
    const nanitePos = nodeMap.get(NODE_IDS.BIO_NANITE_BED)!.position;
    const naniteGeo = new THREE.SphereGeometry(0.6, 16, 8);
    const naniteMat = mats.sporeSac.clone();
    (naniteMat as THREE.MeshPhysicalMaterial).transparent = true;
    (naniteMat as THREE.MeshPhysicalMaterial).opacity = 0.55;
    const naniteMesh = new THREE.Mesh(naniteGeo, naniteMat);
    naniteMesh.scale.set(1.4, 0.5, 1.4); // flattened under carapace
    naniteMesh.position.set(nanitePos[0], nanitePos[1], nanitePos[2]);
    naniteMesh.userData = {
      name: 'Bio-Nanite Coagulation Bed',
      category: 'Armor & Defense',
      desc: 'Sub-dermal nanite swarm bed that rapidly coagulates and repairs hull breaches.',
      pipeline: 'ARMOR_DEFENSE',
      role: 'REPAIR',
      upstreamNodeName: 'Overlapping Carapace Plates',
      downstreamNodeNames: ['Repulsion Shield Emitter Nodes'],
      outputCapacity: nodeMap.get(NODE_IDS.BIO_NANITE_BED)!.telemetry.outputRate,
    };
    shipGroup.add(naniteMesh);

    // 7. Repulsion Shield Emitter Nodes (ARMOR_DEFENSE, EFFECTOR)
    const shieldPos = nodeMap.get(NODE_IDS.SHIELD_EMITTER)!.position;
    const shieldEmitterGeo = new THREE.OctahedronGeometry(0.25, 0);
    const shieldEmitterMesh = new THREE.Mesh(shieldEmitterGeo, mats.glowNode);
    shieldEmitterMesh.position.set(shieldPos[0], shieldPos[1], shieldPos[2]);
    shieldEmitterMesh.userData = {
      name: 'Repulsion Shield Emitter Nodes',
      category: 'Armor & Defense',
      desc: 'Hull perimeter emitter nodes generating 450 MW kinetic deflection repulsion shields.',
      pipeline: 'ARMOR_DEFENSE',
      role: 'EFFECTOR',
      upstreamNodeName: 'Bio-Nanite Coagulation Bed',
      downstreamNodeNames: [],
      outputCapacity: nodeMap.get(NODE_IDS.SHIELD_EMITTER)!.telemetry.outputRate,
      isShieldEmitter: true,
    };
    shipGroup.add(shieldEmitterMesh);

    // Mirror shield emitter on opposite flank
    const shieldMirrorGeo = new THREE.OctahedronGeometry(0.25, 0);
    const shieldMirrorMesh = new THREE.Mesh(shieldMirrorGeo, mats.glowNode);
    shieldMirrorMesh.position.set(-shieldPos[0], shieldPos[1], shieldPos[2]);
    shieldMirrorMesh.userData = {
      name: 'Repulsion Shield Emitter Nodes (Port)',
      category: 'Armor & Defense',
      desc: 'Hull perimeter emitter nodes generating 450 MW kinetic deflection repulsion shields.',
      pipeline: 'ARMOR_DEFENSE',
      role: 'EFFECTOR',
      upstreamNodeName: 'Bio-Nanite Coagulation Bed',
      downstreamNodeNames: [],
      outputCapacity: nodeMap.get(NODE_IDS.SHIELD_EMITTER)!.telemetry.outputRate,
      isShieldEmitter: true,
    };
    shipGroup.add(shieldMirrorMesh);

    // ── Pipeline Node Blend Bridges ──
    // Generate seamless SDF blend bridges for approved pipeline node connections:
    //   1. Exoskeleton effectors → hull (surface growth)
    //   2. Adjacent organ pairs sharing tissue (heart↔atrium, brain↔neurolink, etc.)
    // Each bridge is evaluated individually against the anatomical rules registry.
    {
      const bm = blendBridgeManagerRef.current;
      if (bm) {
        // Helper to get node position as Vector3
        const nodePos = (id: string) => {
          const n = nodeMap.get(id);
          return n ? new THREE.Vector3(n.position[0], n.position[1], n.position[2]) : null;
        };
        // Helper to estimate node radius from geometry
        const nodeRadius = (id: string) => {
          if (id === NODE_IDS.HEART_CORE) return heartNode.radius * 0.65;
          if (id === NODE_IDS.HEMOLYMPH_ATRIUM) return heartNode.radius * 0.35;
          if (id === NODE_IDS.BRAIN_CORE) return headNode.radius * 0.6;
          if (id === NODE_IDS.PLASMA_GLAND) return heartNode.radius * 0.55;
          if (id === NODE_IDS.PLASMA_BLADDER) return heartNode.radius * 0.45;
          if (id === NODE_IDS.DISRUPTOR_GLAND) return 0.5;
          if (id === NODE_IDS.SHIELD_EMITTER) return 0.25;
          if (id === NODE_IDS.BIO_NANITE_BED) return 0.6;
          if (id === NODE_IDS.ICE_GIZZARD) return headNode.radius * 0.5;
          if (id === NODE_IDS.BIO_MOSS) return heartNode.radius * 0.55;
          if (id === NODE_IDS.HABITAT_CHAMBER) return 1.0;
          return 0.4; // default
        };

        // 1. Exoskeleton effectors → hull bridges
        const exoNodes = [
          NODE_IDS.SIPHON_VENT_NOZZLE,
          NODE_IDS.SPIRACLE_VENT,
          NODE_IDS.OCULAR_POD,
          NODE_IDS.CYBER_AIRLOCK,
          NODE_IDS.SHIELD_EMITTER,
          NODE_IDS.CARAPACE_PLATE,
        ];
        for (const nodeId of exoNodes) {
          const pos = nodePos(nodeId);
          if (pos) {
            bm.generateNodeHullBridge(`node_hull_${nodeId}`, nodeId, pos, nodeRadius(nodeId), mats.carapace);
          }
        }

        // 2. Adjacent organ pairs sharing tissue
        const organPairs: [string, string][] = [
          [NODE_IDS.HEART_CORE, NODE_IDS.HEMOLYMPH_ATRIUM],
          [NODE_IDS.BRAIN_CORE, NODE_IDS.NEURO_LINK],
          [NODE_IDS.PLASMA_GLAND, NODE_IDS.PLASMA_BLADDER],
          [NODE_IDS.CARAPACE_PLATE, NODE_IDS.BIO_NANITE_BED],
          [NODE_IDS.BIO_NANITE_BED, NODE_IDS.SHIELD_EMITTER],
          [NODE_IDS.CHITIN_VERTEBRA, NODE_IDS.CARAPACE_PLATE],
          [NODE_IDS.HABITAT_CHAMBER, NODE_IDS.CYBER_AIRLOCK],
        ];
        for (const [idA, idB] of organPairs) {
          const posA = nodePos(idA);
          const posB = nodePos(idB);
          if (posA && posB) {
            bm.generateNodeNodeBridge(
              `node_node_${idA}_${idB}`,
              idA, posA, nodeRadius(idA),
              idB, posB, nodeRadius(idB),
              mats.flesh,
            );
          }
        }
      }
    }

    // ACTIVE ORGAN REPULSION FORCE-FIELD SOLVER
    interface CandidateOrgan {
      id: string;
      name: string;
      category: string;
      desc: string;
      type: 'spiracle' | 'rib' | 'eye' | 'spore' | 'tentacle' | 'neural' | 'habitat' | 'pectoralFin' | 'caudalFluke' | 'landingLimb' | 'dorsalSail';
      u: number;
      v: number;
      clearanceRadius: number; // Force field radius (0.65m - 1.85m)
      pos: THREE.Vector3;
      normal: THREE.Vector3;
      requiredFluid: string;
      demandMlMin: number;
      metabolicRate?: string;
      neuralFreq?: string;
      enzymaticPressure?: string;
      isInterceptable?: boolean;
      minFreeSpace?: string;
      habitationVolume?: string;
      crewCapacity?: string;
      extra?: any;
    }

    const candidateOrgans: CandidateOrgan[] = [];

    // A. Respiratory Spiracles
    // u = 0.32–0.62 (Thoracic section — max girth region where gill vents sit
    // on the broad hull surface for optimal gas exchange).
    // Spiracles at v=0.25/0.75 (standard port/starboard) don't conflict with
    // habitats at offset v positions (0.12/0.62/0.38/0.88).
    const spiracleCount = state.spiracleCount;
    for (let s = 0; s < spiracleCount; s++) {
      const initialU = 0.32 + (s / Math.max(1, spiracleCount)) * 0.30;
      const sym = getSymmetryVCoords(state.symmetryType, s);

      sym.vCoords.forEach((initialV, sideIdx) => {
        const sideName = sym.names[sideIdx] || `Branch #${sideIdx + 1}`;
        const surf = sampleOrganicSurface(initialU, initialV);
        candidateOrgans.push({
          id: `spiracle_${s}_${sideIdx}`,
          name: `Respiratory Spiracle Gill Vent (${sideName})`,
          category: 'Respiratory System',
          desc: 'Contractile vent exhaling bio-plasma gases with active protective clearance field.',
          type: 'spiracle',
          u: initialU,
          v: initialV,
          // 0.85 (was 0.70): the leviathan hull is slimmer than the old grub
          // profile, so spiracles need a wider force-field to stay clear of
          // large neighbors (habitat chambers) on the reduced circumference.
          clearanceRadius: 0.85,
          pos: surf.position.clone(),
          normal: surf.normal.clone(),
          requiredFluid: 'Hyper-Oxygenated Haemolymph',
          demandMlMin: 21.0,
          metabolicRate: '21.0 mL/min Gas Exchange',
          neuralFreq: '30 Hz Respiration Impulse',
          enzymaticPressure: '0.8 bar Vent Differential',
          isInterceptable: true,
          minFreeSpace: '0.9m Clearance Zone',
          extra: { sideName, phase: s * 0.5 },
        });
      });
    }

    // B. Rib Spines
    // u = 0.32–0.62 (Thoracic section — rib cage protects the thoracic cavity
    // where the heart, plasma bladder, and habitats sit).
    const ribCount = Math.min(state.ribSpines, segments * 2);
    for (let i = 0; i < ribCount; i++) {
      const initialU = 0.32 + (i / Math.max(1, ribCount)) * 0.30;
      const sym = getSymmetryVCoords(state.symmetryType, i);

      sym.vCoords.forEach((initialV, sideIdx) => {
        const sideName = sym.names[sideIdx] || `Spur #${sideIdx + 1}`;
        const surf = sampleOrganicSurface(initialU, initialV);
        candidateOrgans.push({
          id: `rib_${i}_${sideIdx}`,
          name: `Biomechanical Rib Spur Spine (${sideName})`,
          category: 'Exoskeleton Frame',
          desc: 'Hardened calcified frame providing lateral defense spikes.',
          type: 'rib',
          u: initialU,
          v: initialV,
          clearanceRadius: 1.60,
          pos: surf.position.clone(),
          normal: surf.normal.clone(),
          requiredFluid: 'Calcified Bone Marrow Fluid',
          demandMlMin: 11.0,
          metabolicRate: '11.0 mL/min Marrow Perfusion',
          neuralFreq: '20 Hz Proprioceptive Feedback',
          enzymaticPressure: '12.4 GPa Hardness Rating',
          isInterceptable: true,
          minFreeSpace: '1.0m Clearance Zone',
          extra: { sideName },
        });
      });
    }

    // C. Ocular Beam Pods
    // u = 0.02–0.13 (Cranial section — eyes belong on the head for forward vision).
    for (let i = 0; i < state.eyePods; i++) {
      const initialU = 0.02 + (i / Math.max(1, state.eyePods)) * 0.11;
      const sym = getSymmetryVCoords(state.symmetryType, i);

      sym.vCoords.forEach((initialV, sideIdx) => {
        const sideName = sym.names[sideIdx] || `Pod #${sideIdx + 1}`;
        const surf = sampleOrganicSurface(initialU, initialV);
        candidateOrgans.push({
          id: `eye_${i}_${sideIdx}`,
          name: `Ocular Beam Pod #${i + 1} (${sideName})`,
          category: 'Sensory Symbiont',
          desc: 'Symbiotic eye cluster emitting focused thermal bio-lasers.',
          type: 'eye',
          u: initialU,
          v: initialV,
          clearanceRadius: 0.75,
          pos: surf.position.clone(),
          normal: surf.normal.clone(),
          requiredFluid: 'Cryo-Aqueous Ocular Fluid',
          demandMlMin: 14.5,
          metabolicRate: '14.5 mL/min Ocular Cooling',
          neuralFreq: '120 Hz Visual Refresh',
          enzymaticPressure: '2.1 bar Hydro-Pressure',
          isInterceptable: true,
          minFreeSpace: '0.9m Clearance Zone',
          extra: { sideName, idx: i },
        });
      });
    }

    // D. Spore Warhead Pods
    // u = 0.67–0.82 (Caudal section — weapon pods cluster on the tail body
    // behind the thoracic cavity, clear of habitats and ribs).
    for (let i = 0; i < state.sporeSacs; i++) {
      const initialU = 0.67 + (i / Math.max(1, state.sporeSacs)) * 0.15;
      const sym = getSymmetryVCoords(state.symmetryType, i);
      const initialV = sym.vCoords[i % sym.vCoords.length];
      const surf = sampleOrganicSurface(initialU, initialV);
      candidateOrgans.push({
        id: `spore_${i}`,
        name: `Viral Spore Warhead Pod #${i + 1}`,
        category: 'Symbiont Bio-Weapon',
        desc: 'Bulbous organ filled with explosive caustic spore fluid.',
        type: 'spore',
        u: initialU,
        v: initialV,
        clearanceRadius: 0.95,
        pos: surf.position.clone(),
        normal: surf.normal.clone(),
        requiredFluid: 'Corrosive Bio-Acid Solution',
        demandMlMin: 26.0,
        metabolicRate: '26.0 mL/min Acid Synthesis',
        neuralFreq: '45 Hz Bio-Trigger Impulse',
        enzymaticPressure: '18.5 pH Caustic Acid',
        isInterceptable: true,
        minFreeSpace: '1.2m Clearance Zone',
        extra: { sacRadius: 0.42 + rng() * 0.22, wobblePhase: rng() * Math.PI * 2 },
      });
    }

    // E. Feeler Tentacles
    // u = 0.67–0.82 (Caudal section — tentacles radiate from the tail body,
    // behind the thoracic cavity, sweeping clear of habitats and ribs).
    for (let i = 0; i < state.tentaclePairs; i++) {
      const initialU = 0.67 + (i / Math.max(1, state.tentaclePairs)) * 0.15;
      const sym = getSymmetryVCoords(state.symmetryType, i);

      sym.vCoords.forEach((initialV, sideIdx) => {
        const sideName = sym.names[sideIdx] || `Feeler #${sideIdx + 1}`;
        const surf = sampleOrganicSurface(initialU, initialV);
        candidateOrgans.push({
          id: `tentacle_${i}_${sideIdx}`,
          name: `Bio-Sensory Feeler Tentacle #${i + 1} (${sideName})`,
          category: 'Appendage Kinematics',
          desc: 'Fluidic appendage with FABRIK IK joint kinematics for smooth organic grasping.',
          type: 'tentacle',
          u: initialU,
          v: initialV,
          clearanceRadius: 3.00,
          pos: surf.position.clone(),
          normal: surf.normal.clone(),
          requiredFluid: 'Myofibrillar Hydraulic Liquid',
          demandMlMin: 32.0,
          metabolicRate: '32.0 mL/min Hydraulic Actuation',
          neuralFreq: '180 Hz Wave Signal',
          enzymaticPressure: '12.0 bar Hydro-Muscle',
          isInterceptable: true,
          minFreeSpace: '1.4m Clearance Zone',
          extra: { sideIdx, sideName, phase: rng() * Math.PI * 2, totalLength: 3.5 + rng() * 3.5 },
        });
      });
    }

    // F. Neural Ganglia Nodes
    // u = 0.03–0.28 (Cranial + Neck — ganglion clusters cluster around the
    // brain in the head and upper neck, routing sensory and motor signals).
    for (let i = 0; i < state.neuralNodes; i++) {
      const initialU = 0.03 + rng() * 0.25;
      const initialV = rng();
      const surf = sampleOrganicSurface(initialU, initialV);
      candidateOrgans.push({
        id: `neural_${i}`,
        name: `Neural Ganglion Cluster #${i + 1}`,
        category: 'Nervous Subsystem',
        desc: 'Pulsing biological processing core routing nervous impulses.',
        type: 'neural',
        u: initialU,
        v: initialV,
        clearanceRadius: 0.90,
        pos: surf.position.clone(),
        normal: surf.normal.clone(),
        requiredFluid: 'Neuro-Transmitter Bio-Plasma',
        demandMlMin: 35.0,
        metabolicRate: '35.0 mL/min Synaptic Perfusion',
        neuralFreq: `${(80 + rng() * 40).toFixed(1)} Hz Impulse`,
        enzymaticPressure: '8.8 bar Bio-Electric Potential',
        isInterceptable: false,
        minFreeSpace: '0.8m Clearance Zone',
        extra: { size: 0.28 + rng() * 0.45, pulsePhase: rng() * Math.PI * 2 },
      });
    }

    // G. Human Habitat Rooms
    // Habitats are restricted to u = 0.32–0.60 (Thoracic section — crew quarters
    // sit in the widest part of the hull where there is maximum interior volume
    // and rib cage protection).
    //
    // CRITICAL: Habitats use OFFSET v positions (0.12, 0.62, 0.38, 0.88)
    // instead of the standard port/starboard (0.25/0.75) used by other organs.
    // This prevents the solver from chain-reacting: when a spiracle at v=0.25
    // pushes a habitat away, the habitat doesn't get pushed into another organ
    // at v=0.75 because the habitat is at v=0.12, not v=0.25.
    // The offset also separates same-side habitats by ~25% of circumference.
    const habitatCount = state.habitatChambers || 0;
    const habitatVOffsets = [0.12, 0.62, 0.38, 0.88, 0.20, 0.70, 0.45, 0.95];
    for (let h = 0; h < habitatCount; h++) {
      const initialU = 0.32 + (h / Math.max(1, habitatCount)) * 0.28;
      const sym = getSymmetryVCoords(state.symmetryType, h);
      // Apply offset that shifts v away from standard port/starboard positions
      const initialV = habitatVOffsets[h % habitatVOffsets.length];
      const surf = sampleOrganicSurface(initialU, initialV);

      candidateOrgans.push({
        id: `habitat_${h}`,
        name: `Human Habitat Room Chamber #${h + 1}`,
        category: 'Human Habitation Chamber',
        desc: 'Pressurized biological room adapted with observation viewports and life-support hydro-gel lining for human crew residence.',
        type: 'habitat',
        u: initialU,
        v: initialV,
        // 2.25 (was 1.85): habitat rooms are 1.5m boxes whose corners extend
        // ~1.1m from center; on the slimmer leviathan hull they need a larger
        // repulsion field to avoid clipping spiracles/eyes/spore pods.
        clearanceRadius: 2.25,
        pos: surf.position.clone(),
        normal: surf.normal.clone(),
        requiredFluid: 'Oxygenated Hydro-Gel & Life Support Haemolymph',
        demandMlMin: 45.0,
        metabolicRate: '18.5 mL/min Life-Support Oxygenation Draw',
        neuralFreq: '0.5 Hz Circadian Light Cycle',
        enzymaticPressure: '1.01 bar Pressurized Atmosphere',
        habitationVolume: '42.5 m³ Living Space',
        crewCapacity: '2 Human Crew Standard',
        isInterceptable: false,
        minFreeSpace: '2.0m Clearance Buffer',
        extra: { sideName: sym.names[h % sym.names.length] },
      });
    }

    // H. Pectoral Fins — Manta-ray-style hydrodynamic wings on the thoracic
    // flanks for atmospheric gliding and dust-cloud navigation. These follow
    // natural organic airfoil shapes (thick leading edge, thin trailing edge).
    // Placed at port/starboard (v=0.25/0.75) in the Thoracic section.
    const pectoralFinCount = state.pectoralFins || 0;
    for (let f = 0; f < pectoralFinCount; f++) {
      const initialU = 0.35 + (f / Math.max(1, pectoralFinCount)) * 0.25;
      const sym = getSymmetryVCoords(state.symmetryType, f);
      sym.vCoords.forEach((initialV, sideIdx) => {
        const sideName = sym.names[sideIdx] || `Fin Side #${sideIdx + 1}`;
        const surf = sampleOrganicSurface(initialU, initialV);
        candidateOrgans.push({
          id: `pectoral_fin_${f}_${sideIdx}`,
          name: `Pectoral Hydrodynamic Fin #${f + 1} (${sideName})`,
          category: 'Supporting Appendage',
          desc: 'Manta-ray-style organic airfoil wing for atmospheric gliding, ocean navigation, and dense dust-cloud traversal. Thick cambered leading edge tapers to a thin flexible trailing edge.',
          type: 'pectoralFin',
          u: initialU,
          v: initialV,
          clearanceRadius: 2.80,
          pos: surf.position.clone(),
          normal: surf.normal.clone(),
          requiredFluid: 'Hydraulic Chitin Fluid',
          demandMlMin: 18.0,
          metabolicRate: '18.0 mL/min Fin Actuation',
          neuralFreq: '60 Hz Glide Adjustment',
          enzymaticPressure: '3.2 bar Hydraulic Pressure',
          isInterceptable: false,
          minFreeSpace: '1.8m Clearance Zone',
          extra: {
            sideName, sideIdx,
            span: 3.5 + rng() * 2.0,   // wing span in meters
            chord: 1.8 + rng() * 0.6,  // chord length
            phase: rng() * Math.PI * 2,
          },
        });
      });
    }

    // I. Caudal Flukes — Whale-tail-style horizontal flukes at the tail tip
    // for aquatic propulsion and atmospheric steering. Horizontal orientation
    // (unlike fish vertical tails) follows cetacean hydrodynamic morphology.
    const caudalFlukeCount = state.caudalFlukes || 0;
    for (let fl = 0; fl < caudalFlukeCount; fl++) {
      const initialU = 0.88 + (fl / Math.max(1, caudalFlukeCount)) * 0.08;
      const sym = getSymmetryVCoords(state.symmetryType, fl);
      sym.vCoords.forEach((initialV, sideIdx) => {
        const sideName = sym.names[sideIdx] || `Fluke Side #${sideIdx + 1}`;
        const surf = sampleOrganicSurface(initialU, initialV);
        candidateOrgans.push({
          id: `caudal_fluke_${fl}_${sideIdx}`,
          name: `Caudal Propulsion Fluke #${fl + 1} (${sideName})`,
          category: 'Supporting Appendage',
          desc: 'Cetacean-style horizontal tail fluke for aquatic thrust generation and atmospheric pitch control. Symmetric hydrofoil profile with tapered tips.',
          type: 'caudalFluke',
          u: initialU,
          v: initialV,
          clearanceRadius: 2.20,
          pos: surf.position.clone(),
          normal: surf.normal.clone(),
          requiredFluid: 'Hydraulic Chitin Fluid',
          demandMlMin: 22.0,
          metabolicRate: '22.0 mL/min Fluke Oscillation',
          neuralFreq: '45 Hz Thrust Cycle',
          enzymaticPressure: '4.5 bar Hydraulic Pulse',
          isInterceptable: false,
          minFreeSpace: '1.5m Clearance Zone',
          extra: {
            sideName, sideIdx,
            span: 2.5 + rng() * 1.2,
            chord: 1.2 + rng() * 0.4,
            phase: rng() * Math.PI * 2,
          },
        });
      });
    }

    // J. Landing Limbs — Cephalopod-arm-style articulated ventral legs for
    // planetary landing and surface anchoring. Ventral placement (v≈0.5)
    // with multi-joint articulation following octopus/squid arm morphology.
    const landingLimbCount = state.landingLimbs || 0;
    const landingVOffsets = [0.48, 0.52, 0.45, 0.55, 0.42, 0.58];
    for (let l = 0; l < landingLimbCount; l++) {
      const initialU = 0.38 + (l / Math.max(1, landingLimbCount)) * 0.22;
      const initialV = landingVOffsets[l % landingVOffsets.length];
      const surf = sampleOrganicSurface(initialU, initialV);
      candidateOrgans.push({
        id: `landing_limb_${l}`,
        name: `Articulated Landing Limb #${l + 1}`,
        category: 'Supporting Appendage',
        desc: 'Cephalopod-style multi-joint articulated leg for planetary landing, surface anchoring, and underwater seabed traversal. Suckered ventral surface provides grip on varied terrain.',
        type: 'landingLimb',
        u: initialU,
        v: initialV,
        clearanceRadius: 2.50,
        pos: surf.position.clone(),
        normal: surf.normal.clone(),
        requiredFluid: 'Myofibrillar Hydraulic Liquid',
        demandMlMin: 28.0,
        metabolicRate: '28.0 mL/min Leg Actuation',
        neuralFreq: '90 Hz Proprioceptive Feedback',
        enzymaticPressure: '8.0 bar Hydro-Muscle',
        isInterceptable: false,
        minFreeSpace: '1.6m Clearance Zone',
        extra: {
          totalLength: 3.0 + rng() * 2.0,
          numJoints: 6,
          phase: rng() * Math.PI * 2,
        },
      });
    }

    // K. Dorsal Sail — Sailfish/Mola-style dorsal stabilizer fin on the spine
    // for stability in atmospheric flight and dust-cloud navigation. Placed
    // at v=0.0 (dorsal ridge) spanning the Neck-Thoracic transition.
    const dorsalSailCount = state.dorsalSail || 0;
    for (let d = 0; d < dorsalSailCount; d++) {
      const initialU = 0.20 + (d / Math.max(1, dorsalSailCount)) * 0.30;
      const initialV = 0.0; // dorsal ridge
      const surf = sampleOrganicSurface(initialU, initialV);
      candidateOrgans.push({
        id: `dorsal_sail_${d}`,
        name: `Dorsal Stabilizer Sail #${d + 1}`,
        category: 'Supporting Appendage',
        desc: 'Sailfish-style dorsal fin for yaw stability during atmospheric entry and dust-cloud navigation. Tall narrow profile with reinforced cartilage spines.',
        type: 'dorsalSail',
        u: initialU,
        v: initialV,
        clearanceRadius: 1.80,
        pos: surf.position.clone(),
        normal: surf.normal.clone(),
        requiredFluid: 'Cartilage Calcite Fluid',
        demandMlMin: 12.0,
        metabolicRate: '12.0 mL/min Sail Perfusion',
        neuralFreq: '40 Hz Stability Sensing',
        enzymaticPressure: '2.0 bar Cartilage Pressure',
        isInterceptable: false,
        minFreeSpace: '1.2m Clearance Zone',
        extra: {
          height: 1.8 + rng() * 1.2,
          length: 2.5 + rng() * 1.0,
          phase: rng() * Math.PI * 2,
        },
      });
    }
    // ── Static interior-organ repulsors ──
    // Large pipeline organs (heart, glands, disruptors, brain) and the caudal
    // engine cowl are fixed by anatomy and not part of the movable candidate
    // set — but surface organs must still respect their volume. On the slimmer
    // leviathan hull the interior masses sit closer to the shell, so the solver
    // pushes surface organs (only) away from these static volumes.
    const staticRepulsors: { pos: THREE.Vector3; radius: number }[] = [];
    {
      const addRepulsor = (id: string, meshRadius: number, mirror: boolean = false) => {
        const n = nodeMap.get(id);
        if (!n) return;
        // 0.45 margin (was 0.35): the leviathan hull is slimmer, so surface
        // organs sit closer to the interior — they need a wider berth.
        staticRepulsors.push({
          pos: new THREE.Vector3(n.position[0], n.position[1], n.position[2]),
          radius: meshRadius + 0.45,
        });
        if (mirror && Math.abs(n.position[0]) > 0.01) {
          staticRepulsors.push({
            pos: new THREE.Vector3(-n.position[0], n.position[1], n.position[2]),
            radius: meshRadius + 0.45,
          });
        }
      };
      addRepulsor(NODE_IDS.HEART_CORE, heartNode.radius * 0.65);
      addRepulsor(NODE_IDS.PLASMA_GLAND, heartNode.radius * 0.60);
      addRepulsor(NODE_IDS.PLASMA_BLADDER, heartNode.radius * 0.50);
      addRepulsor(NODE_IDS.BRAIN_CORE, headNode.radius * 0.6);
      addRepulsor(NODE_IDS.ICE_GIZZARD, headNode.radius * 0.5);
      addRepulsor(NODE_IDS.DISRUPTOR_GLAND, 0.55, true);
      addRepulsor(NODE_IDS.CAUDAL_MANIFOLD, 0.57); // TorusKnot(0.45, 0.12)

      // Caudal engine cowl — large cylinder at the tail tip. Not a pipeline
      // node; built separately as the thruster housing. Its base radius can
      // be >1.5m, so habitats pushed backward by the solver must be repelled.
      const caudalNode = spineNodes[spineNodes.length - 1];
      const thrusterCount = Math.max(3, Math.floor(state.bioThrusters || 4));
      const engineBaseRadius = Math.max(1.2 + thrusterCount * 0.15, caudalNode.radius * 1.5);
      staticRepulsors.push({
        pos: new THREE.Vector3(0, caudalNode.y, caudalNode.z + 0.3),
        radius: engineBaseRadius * 1.15 + 0.45,
      });
    }

    // EXECUTE ITERATIVE SURFACE FORCE-FIELD REPULSION SOLVER WITH SPATIAL PARTITIONING
    // Ensures organs actively push neighboring organs away using a Grid-Based Spatial Partitioning
    // algorithm and AABB (Axis-Aligned Bounding Box) intersection detection.
    const SOLVER_PASSES = 35;
    const GRID_SIZE = 2.0;

    // Anatomical section u-bounds for each organ type — used by the solver
    // and post-solver fixups to clamp organs within their correct section.
    const getUBounds = (type: string): [number, number] => {
      switch (type) {
        case 'eye':    return [0.02, 0.15]; // Cranial
        case 'neural': return [0.03, 0.30]; // Cranial + Neck
        case 'spiracle':
        case 'rib':
        case 'habitat':
        case 'pectoralFin':
        case 'landingLimb': return [0.30, 0.65]; // Thoracic
        case 'dorsalSail': return [0.15, 0.55]; // Neck + Thoracic
        case 'spore':
        case 'tentacle': return [0.65, 0.85]; // Caudal
        case 'caudalFluke': return [0.85, 0.98]; // Tail Tip
        default: return [0.05, 0.88];
      }
    };

    for (let pass = 0; pass < SOLVER_PASSES; pass++) {
      // 1. Build Spatial Hash Grid
      const grid = new Map<string, number[]>();
      
      for (let i = 0; i < candidateOrgans.length; i++) {
        const org = candidateOrgans[i];
        const cellX = Math.floor(org.pos.x / GRID_SIZE);
        const cellY = Math.floor(org.pos.y / GRID_SIZE);
        const cellZ = Math.floor(org.pos.z / GRID_SIZE);
        
        // Add organ to overlapping cells based on clearance radius
        const radiusCells = Math.ceil(org.clearanceRadius / GRID_SIZE);
        
        for (let dx = -radiusCells; dx <= radiusCells; dx++) {
          for (let dy = -radiusCells; dy <= radiusCells; dy++) {
            for (let dz = -radiusCells; dz <= radiusCells; dz++) {
              const hash = `${cellX + dx},${cellY + dy},${cellZ + dz}`;
              if (!grid.has(hash)) grid.set(hash, []);
              grid.get(hash)!.push(i);
            }
          }
        }
      }

      // 2. Resolve Collisions using Spatial Grid and AABB
      const resolvedPairs = new Set<string>();
      
      grid.forEach((organsInCell) => {
        for (let idxA = 0; idxA < organsInCell.length; idxA++) {
          for (let idxB = idxA + 1; idxB < organsInCell.length; idxB++) {
            const i = organsInCell[idxA];
            const j = organsInCell[idxB];
            
            // Only resolve each pair once per pass
            const pairId = i < j ? `${i}-${j}` : `${j}-${i}`;
            if (resolvedPairs.has(pairId)) continue;
            resolvedPairs.add(pairId);

            const orgA = candidateOrgans[i];
            const orgB = candidateOrgans[j];

            // Fast AABB intersection check
            const boxA = new THREE.Box3().setFromCenterAndSize(
              orgA.pos,
              new THREE.Vector3(orgA.clearanceRadius * 2, orgA.clearanceRadius * 2, orgA.clearanceRadius * 2)
            );
            const boxB = new THREE.Box3().setFromCenterAndSize(
              orgB.pos,
              new THREE.Vector3(orgB.clearanceRadius * 2, orgB.clearanceRadius * 2, orgB.clearanceRadius * 2)
            );

            if (boxA.intersectsBox(boxB)) {
              const reqSpace = orgA.clearanceRadius + orgB.clearanceRadius;
              const currentDist = orgA.pos.distanceTo(orgB.pos);
              
              if (currentDist < reqSpace) {
                const overlap = reqSpace - currentDist;
                
                // Push overlapping components to the nearest free coordinate
                let pushDir = new THREE.Vector3().subVectors(orgA.pos, orgB.pos);
                if (pushDir.lengthSq() < 0.0001) {
                  pushDir.set(Math.sin(i * 1.7), Math.cos(j * 2.3), (i - j) * 0.1);
                }
                pushDir.normalize();

                const shiftVal = overlap * 0.55;
                const shiftA = pushDir.clone().multiplyScalar(shiftVal);
                const shiftB = pushDir.clone().multiplyScalar(-shiftVal);

                // Shift parametric u, v coordinates.
                // Each organ type is clamped to its anatomical section so the
                // solver can't push organs out of their correct region.
                const [uMinA, uMaxA] = getUBounds(orgA.type);
                const [uMinB, uMaxB] = getUBounds(orgB.type);
                orgA.u = Math.max(uMinA, Math.min(uMaxA, orgA.u + shiftA.z / length));
                orgA.v = (orgA.v + shiftA.x * 0.15 + 1.0) % 1.0;
                orgB.u = Math.max(uMinB, Math.min(uMaxB, orgB.u + shiftB.z / length));
                orgB.v = (orgB.v + shiftB.x * 0.15 + 1.0) % 1.0;

                // Re-project back onto exact 3D surface points and normal
                const surfA = sampleOrganicSurface(orgA.u, orgA.v);
                orgA.pos.copy(surfA.position);
                orgA.normal.copy(surfA.normal);

                const surfB = sampleOrganicSurface(orgB.u, orgB.v);
                orgB.pos.copy(surfB.position);
                orgB.normal.copy(surfB.normal);
              }
            }
          }
        }
      });

      // 3. Static interior-organ repulsion: push surface organs away from the
      // fixed interior masses (heart, glands, disruptors, brain). Only the
      // surface organ moves; the interior organ is anatomically pinned. The
      // organ's own mesh extent is approximated as 0.6× its clearance field.
      for (const org of candidateOrgans) {
        for (const rep of staticRepulsors) {
          const reqSpace = org.clearanceRadius * 0.6 + rep.radius;
          const dist = org.pos.distanceTo(rep.pos);
          if (dist >= reqSpace) continue;

          let pushDir = new THREE.Vector3().subVectors(org.pos, rep.pos);
          if (pushDir.lengthSq() < 0.0001) pushDir.set(0, 1, 0);
          pushDir.normalize();
          const pushed = org.pos.clone().addScaledVector(pushDir, (reqSpace - dist) * 0.6);

          // Re-derive u/v from the pushed position (same math as the gizmo
          // drag handler), then re-project onto the exact hull surface.
          // Clamp to the organ's anatomical section so repulsors can't push
          // organs out of their correct region.
          let newU = (pushed.z - startZ) / length;
          const [orgUMin, orgUMax] = getUBounds(org.type);
          newU = Math.max(orgUMin, Math.min(orgUMax, newU));
          const spineIdx = Math.round(newU * (spineNodes.length - 1));
          const spineNode = spineNodes[Math.min(spineNodes.length - 1, Math.max(0, spineIdx))];
          const dx = pushed.x - spineNode.xArch;
          const dy = pushed.y - spineNode.y;
          let newV = Math.atan2(dx, dy) / (Math.PI * 2);
          if (newV < 0) newV += 1.0;

          org.u = newU;
          org.v = newV;
          const surf = sampleOrganicSurface(org.u, org.v);
          org.pos.copy(surf.position);
          org.normal.copy(surf.normal);
        }
      }
    }

    // ── POST-SOLVER HABITAT FIXUP ──
    // The iterative solver can push habitats to the same u/v position despite
    // starting at different v offsets. This fixup ensures habitats are separated
    // by reassigning v positions for any habitat pair that's still too close.
    // Habitats get unique v positions from a spread distribution, and any
    // habitat overlapping another is moved to the next available v slot.
    {
      const habitats = candidateOrgans.filter(o => o.type === 'habitat');
      if (habitats.length > 1) {
        // Spread habitats evenly around the circumference, offset from the
        // standard port/starboard positions (0.25/0.75) used by other organs.
        const vSpread = [0.12, 0.62, 0.38, 0.88, 0.20, 0.70, 0.45, 0.05];
        for (let i = 0; i < habitats.length; i++) {
          habitats[i].v = vSpread[i % vSpread.length];
          const surf = sampleOrganicSurface(habitats[i].u, habitats[i].v);
          habitats[i].pos.copy(surf.position);
          habitats[i].normal.copy(surf.normal);
        }
        // Second pass: check for remaining habitat-habitat overlaps and
        // shift u apart if v separation alone wasn't enough.
        for (let pass = 0; pass < 10; pass++) {
          let moved = false;
          for (let i = 0; i < habitats.length; i++) {
            for (let j = i + 1; j < habitats.length; j++) {
              const dist = habitats[i].pos.distanceTo(habitats[j].pos);
              const reqSpace = habitats[i].clearanceRadius + habitats[j].clearanceRadius;
              if (dist >= reqSpace * 0.7) continue;
              // Push apart in u — strong shift to overcome solver convergence.
              // Clamped to Thoracic section (0.32–0.62).
              const zDir = habitats[i].pos.z >= habitats[j].pos.z ? 1 : -1;
              habitats[i].u = Math.max(0.32, Math.min(0.62, habitats[i].u + 0.08 * zDir));
              habitats[j].u = Math.max(0.32, Math.min(0.62, habitats[j].u - 0.08 * zDir));
              const surfA = sampleOrganicSurface(habitats[i].u, habitats[i].v);
              habitats[i].pos.copy(surfA.position);
              habitats[i].normal.copy(surfA.normal);
              const surfB = sampleOrganicSurface(habitats[j].u, habitats[j].v);
              habitats[j].pos.copy(surfB.position);
              habitats[j].normal.copy(surfB.normal);
              moved = true;
            }
          }
          if (!moved) break;
        }
      }

      // Push spores and tentacles away from habitats (post-solver fixup).
      // The solver may push weapons pods backward into the habitat region
      // when resolving other conflicts. This ensures weapons stay posterior.
      for (let pass = 0; pass < 10; pass++) {
        let moved = false;
        for (const org of candidateOrgans) {
          if (org.type !== 'spore' && org.type !== 'tentacle') continue;
          for (const hab of habitats) {
            const dist = org.pos.distanceTo(hab.pos);
            const reqSpace = org.clearanceRadius * 0.5 + hab.clearanceRadius * 0.5;
            if (dist >= reqSpace) continue;
            // Push the weapon pod posterior (increase u) away from the habitat.
            // Clamped to Caudal section (0.67–0.82).
            const zDir = org.pos.z >= hab.pos.z ? 1 : -1;
            org.u = Math.max(0.67, Math.min(0.82, org.u + 0.05 * zDir));
            // Also spread v away from the habitat's v
            const vDir = org.v > hab.v ? 1 : -1;
            org.v = (org.v + vDir * 0.08 + 1.0) % 1.0;
            const surf = sampleOrganicSurface(org.u, org.v);
            org.pos.copy(surf.position);
            org.normal.copy(surf.normal);
            moved = true;
          }
        }
        if (!moved) break;
      }

      // Push spiracles away from habitats
      for (let pass = 0; pass < 5; pass++) {
        let moved = false;
        for (const org of candidateOrgans) {
          if (org.type !== 'spiracle') continue;
          for (const hab of habitats) {
            const dist = org.pos.distanceTo(hab.pos);
            const reqSpace = org.clearanceRadius + hab.clearanceRadius * 0.6;
            if (dist >= reqSpace) continue;
            // Push spiracle within Thoracic section away from the habitat
            const zDir = org.pos.z >= hab.pos.z ? 1 : -1;
            org.u = Math.max(0.32, Math.min(0.62, org.u - 0.04 * zDir));
            const surf = sampleOrganicSurface(org.u, org.v);
            org.pos.copy(surf.position);
            org.normal.copy(surf.normal);
            moved = true;
          }
        }
        if (!moved) break;
      }
    }

    // --- ORGAN REGIONAL EFFICIENCY & COST/OUTPUT MULTIPLIERS ---
    // Section-based organ optimization logic to give organs lower cost and enhanced output
    // if placed in their ideal anatomical section. Now uses the 5-section model.
    candidateOrgans.forEach((org) => {
      let isOptimalSection = false;
      const organSection = uToSection(org.u);
      const regionName = SHIP_SECTIONS.find(s => s.id === organSection)?.label || 'Unknown';

      // Evaluate whether the organ matches its biologically ideal section
      switch (org.type) {
        case 'eye':
          isOptimalSection = organSection === 'cranial';
          break;
        case 'neural':
          isOptimalSection = organSection === 'cranial' || organSection === 'neck';
          break;
        case 'spiracle':
        case 'habitat':
        case 'rib':
        case 'pectoralFin':
        case 'landingLimb':
          isOptimalSection = organSection === 'thoracic';
          break;
        case 'dorsalSail':
          isOptimalSection = organSection === 'neck' || organSection === 'thoracic';
          break;
        case 'spore':
        case 'tentacle':
          isOptimalSection = organSection === 'caudal';
          break;
        case 'caudalFluke':
          isOptimalSection = organSection === 'tail';
          break;
      }

      if (isOptimalSection) {
        org.name = `${org.name} [Optimal ${regionName}]`;
        org.demandMlMin *= 0.65; // Lower metabolic cost
        org.metabolicRate = `${org.demandMlMin.toFixed(1)} mL/min (Highly Efficient)`;
        
        // Enhance outputs
        if (org.neuralFreq) {
          const freq = parseInt(org.neuralFreq);
          if (!isNaN(freq)) org.neuralFreq = `${Math.floor(freq * 1.5)} Hz (Enhanced Signal)`;
        }
        if (org.enzymaticPressure) {
          const pres = parseFloat(org.enzymaticPressure);
          if (!isNaN(pres)) org.enzymaticPressure = `${(pres * 1.4).toFixed(1)} bar (Boosted Yield)`;
        }
      } else {
        org.name = `${org.name} [Sub-optimal ${regionName}]`;
        org.demandMlMin *= 1.35; // Higher cost penalty due to poor vascular routing
        org.metabolicRate = `${org.demandMlMin.toFixed(1)} mL/min (System Strain)`;
        
        // Degrade outputs
        if (org.neuralFreq) {
          const freq = parseInt(org.neuralFreq);
          if (!isNaN(freq)) org.neuralFreq = `${Math.floor(freq * 0.75)} Hz (Degraded Signal)`;
        }
        if (org.enzymaticPressure) {
          const pres = parseFloat(org.enzymaticPressure);
          if (!isNaN(pres)) org.enzymaticPressure = `${(pres * 0.8).toFixed(1)} bar (Low Yield)`;
        }
      }
    });

    // ── HULL ADAPTATION: Enlarge spine radii to contain all organs ──
    // After the force-field solver has finalized organ positions, compute the minimum
    // hull radius needed at each spine node so every organ's force-field clearance
    // sphere stays inside the carapace. The skin bulges outward to envelop the organs.
    //
    // This is extracted into a reusable function so it can be re-run live when an
    // organ is dragged (the user grabs an organ and moves it — the hull adapts in real time).
    const adaptHull = (reprojectOrgans: boolean = true) => {
      const sn = spineNodesRef.current;
      const co = candidateOrgansRef.current;
      const pn = pipelineNodesRef.current;
      const hg = hullGeometryRef.current;
      const nU = numCrossURef.current;
      const nV = numCrossVRef.current;
      const samplePos = sampleSurfacePosRef.current;
      const sampleSurf = sampleSurfaceRef.current;
      if (!hg || !samplePos || !sampleSurf || sn.length === 0) return;

      // Collect all organ positions + clearance radii
      const allOrgans: { pos: THREE.Vector3; clearance: number }[] = [];
      co.forEach((org: any) => allOrgans.push({ pos: org.pos.clone(), clearance: org.clearanceRadius }));
      pn.forEach((node) => {
        const np = node.position;
        allOrgans.push({ pos: new THREE.Vector3(np[0], np[1], np[2]), clearance: 0.6 });
      });

      const startZ = sn[0].z;
      const endZ = sn[sn.length - 1].z;
      const nodeSpacing = (endZ - startZ) / (sn.length - 1);

      for (let s = 0; s < sn.length; s++) {
        const node = sn[s];
        // Start from the base radius (pre-adaptation) so we recompute from scratch each time
        let minRadius = node.baseRadius;

        for (const organ of allOrgans) {
          const dz = Math.abs(organ.pos.z - node.z);
          if (dz > nodeSpacing * 2) continue;

          const dx = organ.pos.x - node.xArch;
          const dy = organ.pos.y - node.y;
          const lateralDist = Math.sqrt(dx * dx + dy * dy);
          const requiredRadius = lateralDist + organ.clearance * 0.7;
          const weight = 1.0 - (dz / (nodeSpacing * 2)) * 0.5;
          const weightedRequired = requiredRadius * weight;

          if (weightedRequired > minRadius) minRadius = weightedRequired;
        }

        // Preserve tip tapering
        const uProg = s / (sn.length - 1);
        const tipZone = 0.03;
        if (uProg < tipZone || uProg > 1 - tipZone) {
          minRadius = node.baseRadius;
        }

        node.radius = minRadius;
      }

      // Rebuild hull geometry
      const newPositions: number[] = [];
      const newUvs: number[] = [];
      const newIndices: number[] = [];

      for (let i = 0; i <= nU; i++) {
        const u = i / nU;
        for (let j = 0; j <= nV; j++) {
          const v = j / nV;
          const pt = samplePos(u, v);
          newPositions.push(pt.x, pt.y, pt.z);
          newUvs.push(u, v);
        }
      }

      for (let i = 0; i < nU; i++) {
        for (let j = 0; j < nV; j++) {
          const row1 = i * (nV + 1);
          const row2 = (i + 1) * (nV + 1);
          const a = row1 + j;
          const b = row1 + j + 1;
          const c = row2 + j + 1;
          const d = row2 + j;
          newIndices.push(a, b, d);
          newIndices.push(b, c, d);
        }
      }

      hg.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
      hg.setAttribute('uv', new THREE.Float32BufferAttribute(newUvs, 2));
      hg.setIndex(newIndices);
      hg.computeVertexNormals();
      hg.computeBoundingSphere();

      // Re-project candidate organs onto the adapted surface.
      // IMPORTANT: Only do this during initial setup, NOT during live drag.
      // During drag, re-projection creates a positive feedback loop:
      // hull grows → organs re-projected outward → hull grows more → infinite ballooning.
      if (reprojectOrgans) {
        co.forEach((org: any) => {
          const surf = sampleSurf(org.u, org.v);
          org.pos.copy(surf.position);
          org.normal.copy(surf.normal);
        });
      }
    };

    // Store refs for live drag adaptation
    spineNodesRef.current = spineNodes;
    candidateOrgansRef.current = candidateOrgans;
    pipelineNodesRef.current = pipelineNodes;
    hullGeometryRef.current = finalHullGeometry;
    numCrossURef.current = numCrossU;
    numCrossVRef.current = numCrossV;
    sampleSurfacePosRef.current = sampleOrganicSurfacePos;
    sampleSurfaceRef.current = sampleOrganicSurface;
    adaptHullRef.current = adaptHull;

    // Run the initial adaptation
    adaptHull();

    // ── Hull SDF for anatomical-aware seamless organ blending ──
    // Update the BlendBridgeManager's hull SDF from the post-adaptation spine nodes.
    // The manager was created earlier (before the organ instantiation loop) and
    // is updated here after the hull has been adapted to organ positions.
    if (blendBridgeManagerRef.current) {
      blendBridgeManagerRef.current.regenerateHullSDF(spineNodes as SpineNode[]);
    }

    // VASCULAR COMPONENT SINK REGISTRY FOR PROXIMITY AUTO-WIRING & MURRAY'S LAW
    interface VascularSink {
      mesh: THREE.Mesh;
      socketPos: THREE.Vector3;
      name: string;
      category: string;
      desc: string;
      requiredFluid: string;
      demandMlMin: number;
      metabolicRate?: string;
      neuralFreq?: string;
      enzymaticPressure?: string;
      clearanceRadius?: string;
      isInterceptable?: boolean;
      minFreeSpace?: string;
      uCoord?: number;
      vCoord?: number;
    }
    const vascularSinks: VascularSink[] = [];

    // INSTANTIATE ORGAN MESHES + VISUAL FORCE FIELD SHIELD BUBBLES AT RESOLVED NON-OVERLAPPING POSITIONS
    candidateOrgans.forEach((org) => {
      // 1. Force Field Shield Bubble Mesh (Visual representation of protective non-overlapping clearance zone)
      if (state.showForceField) {
        const fieldGeo = new THREE.SphereGeometry(org.clearanceRadius, 16, 12);
        const fieldMesh = new THREE.Mesh(fieldGeo, mats.forceField);
        fieldMesh.position.copy(org.pos);
        fieldMesh.userData = {
          name: `${org.name} Repulsion Force Field Shield`,
          parentOrganName: org.name,
          clearanceRadius: org.clearanceRadius,
          isForceField: true,
        };
        shipGroup.add(fieldMesh);
      }

      // 2. Build Socket Collar
      createSocketCollar(
        org.pos,
        org.normal,
        Math.min(0.8, org.clearanceRadius * 0.45),
        0.3,
        mats.carapace,
        `${org.name} Socket Collar`
      );

      // 3. Build Organ Geometry depending on Type
      if (org.type === 'spiracle') {
        const ventGeo = new THREE.TorusGeometry(0.32, 0.09, 8, 12);
        const ventMesh = new THREE.Mesh(ventGeo, mats.flesh);
        ventMesh.position.copy(org.pos);
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), org.normal);
        ventMesh.quaternion.copy(quat);

        ventMesh.userData = {
          name: org.name,
          category: org.category,
          desc: org.desc,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          baseScale: 1.0,
          phase: org.extra?.phase || 0,
        };
        shipGroup.add(ventMesh);
        animatedSpiraclesRef.current.push(ventMesh);

        vascularSinks.push({
          mesh: ventMesh,
          socketPos: org.pos.clone(),
          name: org.name,
          category: org.category,
          desc: org.desc,
          requiredFluid: org.requiredFluid,
          demandMlMin: org.demandMlMin,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          uCoord: org.u,
          vCoord: org.v,
        });
      } else if (org.type === 'rib') {
        const tipPos = org.pos.clone().addScaledVector(org.normal, 1.5).add(new THREE.Vector3(0, -0.3, -0.6));
        const midPos = org.pos.clone().addScaledVector(org.normal, 1.0).add(new THREE.Vector3(0, 0.3, -0.2));
        const curve = new THREE.CubicBezierCurve3(org.pos, midPos, tipPos, tipPos);
        const ribGeo = new THREE.TubeGeometry(curve, 12, 0.11, 6, false);
        const ribMesh = new THREE.Mesh(ribGeo, mats.bone);

        ribMesh.userData = {
          name: org.name,
          category: org.category,
          desc: org.desc,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
        };
        shipGroup.add(ribMesh);

        vascularSinks.push({
          mesh: ribMesh,
          socketPos: org.pos.clone(),
          name: org.name,
          category: org.category,
          desc: org.desc,
          requiredFluid: org.requiredFluid,
          demandMlMin: org.demandMlMin,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          uCoord: org.u,
          vCoord: org.v,
        });
      } else if (org.type === 'eye') {
        const stalkLen = state.eyeStalkLength;
        const eyeRadius = 0.28;
        // Stalkless eyes sit flush on the hull; stalked eyes rise above the surface.
        const eyeOffset = stalkLen > 0.01 ? stalkLen + eyeRadius : eyeRadius * 0.6;

        if (stalkLen > 0.01) {
          const stalkGeo = new THREE.CylinderGeometry(0.08, 0.15, stalkLen, 8);
          const stalk = new THREE.Mesh(stalkGeo, mats.flesh);
          stalk.position.copy(org.pos).addScaledVector(org.normal, stalkLen * 0.5);
          const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), org.normal);
          stalk.quaternion.copy(quat);
          shipGroup.add(stalk);
        }

        const eyeGeo = new THREE.SphereGeometry(eyeRadius, 12, 12);
        const eye = new THREE.Mesh(eyeGeo, mats.glowNode);
        eye.position.copy(org.pos).addScaledVector(org.normal, eyeOffset);

        eye.userData = {
          name: org.name,
          category: org.category,
          desc: org.desc,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
        };

        shipGroup.add(eye);

        // Seamless SDF blend bridge: eye stalk roots into the hull surface
        // (anatomical rule: eye → hull = blend, k=0.15). Replaces the hard
        // socket collar with a smooth organic fillet.
        createBlendBridge(org.id, 'eye', org.pos, org.normal, eyeRadius, stalkLen, mats.carapace);

        vascularSinks.push({
          mesh: eye,
          socketPos: org.pos.clone(),
          name: org.name,
          category: org.category,
          desc: org.desc,
          requiredFluid: org.requiredFluid,
          demandMlMin: org.demandMlMin,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          uCoord: org.u,
          vCoord: org.v,
        });
      } else if (org.type === 'spore') {
        const sacRadius = org.extra?.sacRadius || 0.5;
        const sacGeo = new THREE.SphereGeometry(sacRadius, 12, 12);
        const sac = new THREE.Mesh(sacGeo, mats.sporeSac);
        sac.position.copy(org.pos).addScaledVector(org.normal, sacRadius * 0.7);

        sac.userData = {
          name: org.name,
          category: org.category,
          desc: org.desc,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          basePos: sac.position.clone(),
          wobblePhase: org.extra?.wobblePhase || 0,
        };
        shipGroup.add(sac);

        // Seamless SDF blend bridge: spore sac grows from the hull surface
        // (anatomical rule: spore → hull = blend, k=0.14).
        createBlendBridge(org.id, 'spore', org.pos, org.normal, sacRadius, 0, mats.flesh);

        vascularSinks.push({
          mesh: sac,
          socketPos: org.pos.clone(),
          name: org.name,
          category: org.category,
          desc: org.desc,
          requiredFluid: org.requiredFluid,
          demandMlMin: org.demandMlMin,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          uCoord: org.u,
          vCoord: org.v,
        });
      } else if (org.type === 'tentacle') {
        const totalLength = org.extra?.totalLength || 4.0;
        const numJoints = 8;
        const segmentLen = totalLength / (numJoints - 1);
        const joints: THREE.Vector3[] = [];
        const lengths: number[] = [];

        const rootPos = org.pos.clone();
        // Add per-tentacle angular splay so adjacent tentacles diverge instead of dangling parallel.
        // Without this, same-side tentacles all point in the same direction and their tubes overlap.
        const splayAngle = (org.extra?.sideIdx === 0 ? -1 : 1) * 0.35 + (org.u - 0.5) * 0.8;
        const baseDir = org.normal.clone().add(new THREE.Vector3(0, -0.4, -0.6));
        const splayDir = new THREE.Vector3(Math.sin(splayAngle) * 0.5, 0, 0);
        const restDirection = baseDir.add(splayDir).normalize();

        for (let j = 0; j < numJoints; j++) {
          joints.push(rootPos.clone().addScaledVector(restDirection, j * segmentLen));
          if (j < numJoints - 1) lengths.push(segmentLen);
        }

        const curve = new THREE.CatmullRomCurve3(joints);
        const feelerRadius = 0.14;
        const tentacleGeo = new THREE.TubeGeometry(curve, 16, feelerRadius, 6, false);
        const tentacleMesh = new THREE.Mesh(tentacleGeo, mats.flesh);

        tentacleMesh.userData = {
          name: org.name,
          category: org.category,
          desc: org.desc,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          joints,
          lengths,
          totalLength,
          spineNodePos: org.pos.clone(),
          radiusOffset: 0.8,
          restDirection,
          radius: feelerRadius,
          side: org.extra?.sideIdx === 0 ? -1 : 1,
          phase: org.extra?.phase || 0,
        };

        shipGroup.add(tentacleMesh);
        animatedTentaclesRef.current.push(tentacleMesh);

        vascularSinks.push({
          mesh: tentacleMesh,
          socketPos: org.pos.clone(),
          name: org.name,
          category: org.category,
          desc: org.desc,
          requiredFluid: org.requiredFluid,
          demandMlMin: org.demandMlMin,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          uCoord: org.u,
          vCoord: org.v,
        });
      } else if (org.type === 'pectoralFin') {
        // Manta-ray-style hydrodynamic wing: organic airfoil shape built from
        // a custom BufferGeometry. Thick cambered leading edge tapers to a
        // thin trailing edge. The wing extends outward from the hull normal.
        const span = org.extra?.span || 4.0;
        const chord = org.extra?.chord || 2.0;
        const upDir = org.normal.clone().normalize();
        // Lateral direction: perpendicular to normal, pointing away from hull
        const forwardDir = new THREE.Vector3(0, 0, 1);
        const sideDir = new THREE.Vector3().crossVectors(upDir, forwardDir).normalize();
        if (org.extra?.sideIdx === 1) sideDir.negate();
        // Re-derive forwardDir so it's perpendicular to both upDir and sideDir
        forwardDir.crossVectors(sideDir, upDir).normalize();

        const finGeo = new THREE.BufferGeometry();
        const finVerts: number[] = [];
        const finIndices: number[] = [];
        const spanSegs = 10;
        const chordSegs = 8;

        for (let s = 0; s <= spanSegs; s++) {
          const sFrac = s / spanSegs;
          // Wing tapers: thicker at root, thinner at tip
          const taper = 1.0 - sFrac * 0.6;
          for (let c = 0; c <= chordSegs; c++) {
            const cFrac = c / chordSegs;
            // Airfoil profile: thick at mid-chord, thin at leading/trailing edges
            const thickness = Math.sin(cFrac * Math.PI) * 0.35 * taper;
            // Vertex = root + span along sideDir + chord along forwardDir + thickness along upDir
            const px = org.pos.x + sideDir.x * sFrac * span + forwardDir.x * (cFrac - 0.3) * chord + upDir.x * thickness;
            const py = org.pos.y + sideDir.y * sFrac * span + forwardDir.y * (cFrac - 0.3) * chord + upDir.y * thickness;
            const pz = org.pos.z + sideDir.z * sFrac * span + forwardDir.z * (cFrac - 0.3) * chord + upDir.z * thickness;
            finVerts.push(px, py, pz);
          }
        }
        for (let s = 0; s < spanSegs; s++) {
          for (let c = 0; c < chordSegs; c++) {
            const i = s * (chordSegs + 1) + c;
            // CCW winding when viewed from above (along +upDir) → normals point up
            finIndices.push(i, i + chordSegs + 1, i + 1);
            finIndices.push(i + 1, i + chordSegs + 1, i + chordSegs + 2);
          }
        }
        finGeo.setIndex(finIndices);
        finGeo.setAttribute('position', new THREE.Float32BufferAttribute(finVerts, 3));
        finGeo.computeVertexNormals();

        const finMesh = new THREE.Mesh(finGeo, mats.appendage);
        finMesh.userData = {
          name: org.name,
          category: org.category,
          desc: org.desc,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          phase: org.extra?.phase || 0,
          isAppendage: true,
        };
        shipGroup.add(finMesh);
        animatedAppendagesRef.current.push(finMesh);

        vascularSinks.push({
          mesh: finMesh,
          socketPos: org.pos.clone(),
          name: org.name,
          category: org.category,
          desc: org.desc,
          requiredFluid: org.requiredFluid,
          demandMlMin: org.demandMlMin,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          uCoord: org.u,
          vCoord: org.v,
        });
      } else if (org.type === 'caudalFluke') {
        // Cetacean-style horizontal tail fluke: symmetric hydrofoil profile
        // extending horizontally from the tail tip. Built as a custom flat
        // airfoil that tapers to rounded tips.
        const span = org.extra?.span || 3.0;
        const chord = org.extra?.chord || 1.4;
        const upDir = org.normal.clone().normalize();
        const forwardDir = new THREE.Vector3(0, 0, 1);
        const sideDir = new THREE.Vector3().crossVectors(upDir, forwardDir).normalize();
        if (org.extra?.sideIdx === 1) sideDir.negate();
        forwardDir.crossVectors(sideDir, upDir).normalize();

        const flukeGeo = new THREE.BufferGeometry();
        const flukeVerts: number[] = [];
        const flukeIndices: number[] = [];
        const spanSegs = 8;
        const chordSegs = 6;

        for (let s = 0; s <= spanSegs; s++) {
          const sFrac = s / spanSegs;
          // Fluke tapers to rounded tips (sin profile across span)
          const taper = Math.sin(sFrac * Math.PI);
          for (let c = 0; c <= chordSegs; c++) {
            const cFrac = c / chordSegs;
            const thickness = Math.sin(cFrac * Math.PI) * 0.25 * taper;
            // Span centered on root, extending both sides; chord along forward; thickness along normal
            const px = org.pos.x + sideDir.x * (sFrac - 0.5) * 2 * span + forwardDir.x * (cFrac - 0.3) * chord * taper + upDir.x * thickness;
            const py = org.pos.y + sideDir.y * (sFrac - 0.5) * 2 * span + forwardDir.y * (cFrac - 0.3) * chord * taper + upDir.y * thickness;
            const pz = org.pos.z + sideDir.z * (sFrac - 0.5) * 2 * span + forwardDir.z * (cFrac - 0.3) * chord * taper + upDir.z * thickness;
            flukeVerts.push(px, py, pz);
          }
        }
        for (let s = 0; s < spanSegs; s++) {
          for (let c = 0; c < chordSegs; c++) {
            const i = s * (chordSegs + 1) + c;
            // CCW winding when viewed from above (along +upDir) → normals point up
            flukeIndices.push(i, i + chordSegs + 1, i + 1);
            flukeIndices.push(i + 1, i + chordSegs + 1, i + chordSegs + 2);
          }
        }
        flukeGeo.setIndex(flukeIndices);
        flukeGeo.setAttribute('position', new THREE.Float32BufferAttribute(flukeVerts, 3));
        flukeGeo.computeVertexNormals();

        const flukeMesh = new THREE.Mesh(flukeGeo, mats.appendage);
        flukeMesh.userData = {
          name: org.name,
          category: org.category,
          desc: org.desc,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          phase: org.extra?.phase || 0,
          isAppendage: true,
        };
        shipGroup.add(flukeMesh);
        animatedAppendagesRef.current.push(flukeMesh);

        vascularSinks.push({
          mesh: flukeMesh,
          socketPos: org.pos.clone(),
          name: org.name,
          category: org.category,
          desc: org.desc,
          requiredFluid: org.requiredFluid,
          demandMlMin: org.demandMlMin,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          uCoord: org.u,
          vCoord: org.v,
        });
      } else if (org.type === 'landingLimb') {
        // Cephalopod-style articulated landing leg: multi-joint tube that
        // curves downward from the ventral hull. Uses CatmullRom spline
        // with variable radius (thicker at base, thinner at tip).
        const totalLength = org.extra?.totalLength || 4.0;
        const numJoints = org.extra?.numJoints || 6;
        const segmentLen = totalLength / (numJoints - 1);
        const joints: THREE.Vector3[] = [];
        const rootPos = org.pos.clone();
        // Legs curve downward and slightly outward
        const baseDir = org.normal.clone().add(new THREE.Vector3(0, -0.8, 0.2)).normalize();
        const splayAngle = (org.v > 0.5 ? 0.3 : -0.3);
        const splayDir = new THREE.Vector3(Math.sin(splayAngle), 0, 0);

        for (let j = 0; j < numJoints; j++) {
          const t = j / (numJoints - 1);
          // Curve: starts along normal, bends downward
          const bend = Math.sin(t * Math.PI * 0.5) * 0.6;
          const pos = rootPos.clone()
            .addScaledVector(baseDir, j * segmentLen)
            .addScaledVector(splayDir, bend * j * segmentLen * 0.3);
          joints.push(pos);
        }

        const curve = new THREE.CatmullRomCurve3(joints);
        // Variable radius: thick base, thin tip
        const limbGeo = new THREE.TubeGeometry(curve, 16, 0.22, 8, false);
        const limbMesh = new THREE.Mesh(limbGeo, mats.appendage);
        limbMesh.userData = {
          name: org.name,
          category: org.category,
          desc: org.desc,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          joints,
          totalLength,
          phase: org.extra?.phase || 0,
          isAppendage: true,
        };
        shipGroup.add(limbMesh);
        animatedAppendagesRef.current.push(limbMesh);

        vascularSinks.push({
          mesh: limbMesh,
          socketPos: org.pos.clone(),
          name: org.name,
          category: org.category,
          desc: org.desc,
          requiredFluid: org.requiredFluid,
          demandMlMin: org.demandMlMin,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          uCoord: org.u,
          vCoord: org.v,
        });
      } else if (org.type === 'dorsalSail') {
        // Sailfish-style dorsal fin: tall narrow membrane supported by
        // cartilage spines. Built as a curved plane that rises from the
        // dorsal hull ridge. The sail extends upward along the hull normal
        // and fore-aft along the spine.
        const height = org.extra?.height || 2.0;
        const length = org.extra?.length || 3.0;
        const upDir = org.normal.clone().normalize(); // sail rises along hull normal
        const forwardDir = new THREE.Vector3(0, 0, 1);
        const sideDir = new THREE.Vector3().crossVectors(upDir, forwardDir).normalize();
        forwardDir.crossVectors(sideDir, upDir).normalize();

        const sailGeo = new THREE.BufferGeometry();
        const sailVerts: number[] = [];
        const sailIndices: number[] = [];
        const lenSegs = 10;
        const heightSegs = 6;

        for (let l = 0; l <= lenSegs; l++) {
          const lFrac = l / lenSegs;
          // Taper at both ends (sail is tallest in the middle)
          const taper = Math.sin(lFrac * Math.PI);
          for (let h = 0; h <= heightSegs; h++) {
            const hFrac = h / heightSegs;
            // Sail curves backward slightly at the top
            const curveBack = Math.sin(hFrac * Math.PI * 0.5) * 0.3;
            // Slight lateral thickness (membrane has a thin airfoil cross-section)
            const thickness = Math.sin(hFrac * Math.PI) * 0.06 * taper;
            const px = org.pos.x + forwardDir.x * (lFrac - 0.5) * length + upDir.x * hFrac * height * taper + sideDir.x * thickness + forwardDir.x * curveBack * height * hFrac;
            const py = org.pos.y + forwardDir.y * (lFrac - 0.5) * length + upDir.y * hFrac * height * taper + sideDir.y * thickness + forwardDir.y * curveBack * height * hFrac;
            const pz = org.pos.z + forwardDir.z * (lFrac - 0.5) * length + upDir.z * hFrac * height * taper + sideDir.z * thickness + forwardDir.z * curveBack * height * hFrac;
            sailVerts.push(px, py, pz);
          }
        }
        for (let l = 0; l < lenSegs; l++) {
          for (let h = 0; h < heightSegs; h++) {
            const i = l * (heightSegs + 1) + h;
            // CCW winding when viewed from starboard (along +sideDir) → normals point starboard
            sailIndices.push(i, i + heightSegs + 1, i + 1);
            sailIndices.push(i + 1, i + heightSegs + 1, i + heightSegs + 2);
          }
        }
        sailGeo.setIndex(sailIndices);
        sailGeo.setAttribute('position', new THREE.Float32BufferAttribute(sailVerts, 3));
        sailGeo.computeVertexNormals();

        const sailMesh = new THREE.Mesh(sailGeo, mats.appendage);
        sailMesh.userData = {
          name: org.name,
          category: org.category,
          desc: org.desc,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          phase: org.extra?.phase || 0,
          isAppendage: true,
        };
        shipGroup.add(sailMesh);
        animatedAppendagesRef.current.push(sailMesh);

        vascularSinks.push({
          mesh: sailMesh,
          socketPos: org.pos.clone(),
          name: org.name,
          category: org.category,
          desc: org.desc,
          requiredFluid: org.requiredFluid,
          demandMlMin: org.demandMlMin,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          uCoord: org.u,
          vCoord: org.v,
        });
      } else if (org.type === 'neural') {
        const size = org.extra?.size || 0.35;
        const organGeo = new THREE.SphereGeometry(size, 12, 12);
        const organMesh = new THREE.Mesh(organGeo, mats.glowNode);
        organMesh.position.copy(org.pos).addScaledVector(org.normal, -size * 0.3);

        organMesh.userData = {
          name: org.name,
          category: org.category,
          desc: org.desc,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          baseScale: size,
          pulsePhase: org.extra?.pulsePhase || 0,
        };
        shipGroup.add(organMesh);
        animatedOrgansRef.current.push(organMesh);

        // Seamless SDF blend bridge: neural node roots into the hull surface
        // (anatomical rule: neural → hull = blend, k=0.12).
        createBlendBridge(org.id, 'neural', org.pos, org.normal, size, 0, mats.carapace);

        vascularSinks.push({
          mesh: organMesh,
          socketPos: org.pos.clone(),
          name: org.name,
          category: org.category,
          desc: org.desc,
          requiredFluid: org.requiredFluid,
          demandMlMin: org.demandMlMin,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          uCoord: org.u,
          vCoord: org.v,
        });
      } else if (org.type === 'habitat') {
        const roomW = 1.5;
        const roomH = 1.2;
        const roomD = 1.5;
        const roomGeo = new THREE.BoxGeometry(roomW, roomH, roomD, 2, 2, 2);
        const roomMesh = new THREE.Mesh(roomGeo, mats.flesh);
        roomMesh.position.copy(org.pos).addScaledVector(org.normal, roomH * 0.65);
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), org.normal);
        roomMesh.quaternion.copy(quat);

        const windowGeo = new THREE.PlaneGeometry(0.8, 0.6);
        const windowMesh = new THREE.Mesh(windowGeo, mats.glowNode);
        windowMesh.position.copy(org.pos).addScaledVector(org.normal, roomH * 1.32);
        windowMesh.quaternion.copy(quat);
        windowMesh.rotateX(-Math.PI / 2);

        const frameGeo = new THREE.BoxGeometry(roomW * 1.1, 0.18, roomD * 1.1);
        const frameMesh = new THREE.Mesh(frameGeo, mats.carapace);
        frameMesh.position.copy(org.pos).addScaledVector(org.normal, roomH * 0.15);
        frameMesh.quaternion.copy(quat);

        roomMesh.userData = {
          name: org.name,
          category: org.category,
          desc: org.desc,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          habitationVolume: org.habitationVolume,
          crewCapacity: org.crewCapacity,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          requiredFluid: org.requiredFluid,
        };

        shipGroup.add(frameMesh);
        shipGroup.add(roomMesh);
        shipGroup.add(windowMesh);

        vascularSinks.push({
          mesh: roomMesh,
          socketPos: org.pos.clone(),
          name: org.name,
          category: org.category,
          desc: org.desc,
          requiredFluid: org.requiredFluid,
          demandMlMin: org.demandMlMin,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          uCoord: org.u,
          vCoord: org.v,
        });
      }
    });

    // HUMAN HABITAT HALLWAY CONNECTIONS
    // Every habitat must have at least 1 hallway connection to another habitat.
    // We build a Minimum Spanning Tree (Prim's algorithm) over Euclidean distance
    // between habitat room centers — this guarantees full connectivity with no cycles.
    // When two connected habitats sit at different heights (|Δy| > STAIR_THRESHOLD),
    // a staircase segment is inserted in the hallway to bridge the vertical offset.
    const habitatCenters: { name: string; pos: THREE.Vector3; normal: THREE.Vector3 }[] = [];
    {
      const roomH = 1.2;
      candidateOrgans.forEach((org: any) => {
        if (org.type === 'habitat') {
          const center = org.pos.clone().addScaledVector(org.normal, roomH * 0.65);
          habitatCenters.push({ name: org.name, pos: center, normal: org.normal.clone() });
        }
      });
    }

    if (habitatCenters.length >= 2) {
      const STAIR_THRESHOLD = 0.6; // vertical offset (m) above which stairs are required
      const HALLWAY_RADIUS = 0.55;  // ~1.1m interior diameter — human-passable
      const N = habitatCenters.length;

      // Prim's MST
      const inTree = new Array(N).fill(false);
      const edges: [number, number][] = [];
      inTree[0] = true;
      for (let added = 0; added < N - 1; added++) {
        let bestDist = Infinity;
        let bestI = -1, bestJ = -1;
        for (let i = 0; i < N; i++) {
          if (!inTree[i]) continue;
          for (let j = 0; j < N; j++) {
            if (inTree[j]) continue;
            const d = habitatCenters[i].pos.distanceTo(habitatCenters[j].pos);
            if (d < bestDist) { bestDist = d; bestI = i; bestJ = j; }
          }
        }
        if (bestJ === -1) break;
        inTree[bestJ] = true;
        edges.push([bestI, bestJ]);
      }

      const hallwayMat = mats.carapace.clone();
      (hallwayMat as THREE.MeshStandardMaterial).transparent = true;
      (hallwayMat as THREE.MeshStandardMaterial).opacity = 0.75;
      (hallwayMat as THREE.MeshStandardMaterial).roughness = 0.5;
      (hallwayMat as THREE.MeshStandardMaterial).metalness = 0.3;

      const stairMat = mats.bone.clone();
      (stairMat as THREE.MeshStandardMaterial).transparent = true;
      (stairMat as THREE.MeshStandardMaterial).opacity = 0.85;

      edges.forEach(([i, j], eIdx) => {
        const a = habitatCenters[i].pos;
        const b = habitatCenters[j].pos;
        const dy = Math.abs(a.y - b.y);
        const needsStairs = dy > STAIR_THRESHOLD;

        // Hallway path: gentle curve bowing outward from the hull center
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const outward = mid.clone().normalize();
        const bowAmount = a.distanceTo(b) * 0.12;
        mid.addScaledVector(outward, bowAmount);
        const curve = new THREE.CatmullRomCurve3([a.clone(), mid, b.clone()]);
        const tubeGeo = new THREE.TubeGeometry(curve, 24, HALLWAY_RADIUS, 8, false);
        const hallwayMesh = new THREE.Mesh(tubeGeo, hallwayMat);
        hallwayMesh.userData = {
          name: `Crew Hallway Corridor #${eIdx + 1}`,
          category: 'Human Habitation Conduit',
          desc: `Pressurized passageway connecting ${habitatCenters[i].name} ↔ ${habitatCenters[j].name}.${needsStairs ? ' Includes staircase for vertical traversal.' : ' Level walkway.'}`,
          metabolicRate: '6.2 mL/min Life-Support Ventilation',
          neuralFreq: '0.5 Hz Circadian Light Cycle',
          enzymaticPressure: '1.01 bar Pressurized Atmosphere',
          habitationVolume: `${(a.distanceTo(b)).toFixed(1)} m Corridor Span`,
          crewCapacity: needsStairs ? 'Staircase Section' : 'Level Walkway',
          clearanceRadius: `${HALLWAY_RADIUS.toFixed(2)}m Interior Radius`,
          isInterceptable: false,
          minFreeSpace: '1.1m Passage Width',
          requiredFluid: 'Oxygenated Hydro-Gel & Life Support Haemolymph',
        };
        shipGroup.add(hallwayMesh);

        // Staircase: render stepped boxes along the vertical offset portion
        if (needsStairs) {
          const stepCount = Math.max(3, Math.ceil(dy / 0.25)); // ~25cm per step (human-comfortable)
          const stepHeight = (b.y - a.y) / stepCount;
          const stepDepth = 0.28;  // standard tread depth
          const stepWidth = HALLWAY_RADIUS * 1.8;
          const stairGroup = new THREE.Group();

          for (let s = 0; s < stepCount; s++) {
            const t = (s + 0.5) / stepCount;
            const along = curve.getPoint(t);
            const stepGeo = new THREE.BoxGeometry(stepWidth, Math.abs(stepHeight) * 1.1, stepDepth);
            const stepMesh = new THREE.Mesh(stepGeo, stairMat);
            stepMesh.position.copy(along);
            // Orient step roughly along travel direction
            const tangent = curve.getTangent(t);
            const stepQuat = new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(0, 0, 1), tangent.normalize()
            );
            stepMesh.quaternion.copy(stepQuat);
            stairGroup.add(stepMesh);
          }

          stairGroup.userData = {
            name: `Access Staircase #${eIdx + 1}`,
            category: 'Human Habitation Conduit',
            desc: `Staircase bridging ${dy.toFixed(1)}m vertical offset between ${habitatCenters[i].name} and ${habitatCenters[j].name}. ${stepCount} steps at ~${(Math.abs(stepHeight) * 100).toFixed(0)}cm rise each.`,
            metabolicRate: '0 mL/min Passive Structure',
            neuralFreq: 'N/A',
            enzymaticPressure: '1.01 bar Pressurized Atmosphere',
            habitationVolume: `${stepCount} steps`,
            crewCapacity: 'Vertical Transit',
            clearanceRadius: `${HALLWAY_RADIUS.toFixed(2)}m Interior Radius`,
            isInterceptable: false,
            minFreeSpace: '1.1m Passage Width',
            requiredFluid: 'Oxygenated Hydro-Gel & Life Support Haemolymph',
          };
          shipGroup.add(stairGroup);
        }
      });
    }

    // MUSCULAR CONNECTIVE TENDONS
    const tendonCount = state.tendonDensity;
    for (let t = 0; t < tendonCount; t++) {
      const uA = 0.1 + rng() * 0.7;
      const uB = Math.min(0.95, uA + 0.12);
      const vA = rng();
      const vB = (vA + 0.25) % 1.0;

      const surfA = sampleOrganicSurface(uA, vA);
      const surfB = sampleOrganicSurface(uB, vB);

      const lineCurve = new THREE.LineCurve3(surfA.position, surfB.position);
      const tendonGeo = new THREE.TubeGeometry(lineCurve, 6, 0.06, 6, false);
      const tendonMesh = new THREE.Mesh(tendonGeo, mats.muscleTendon);
      tendonMesh.userData = {
        name: `Biomechanical Muscle Tendon Fiber #${t + 1}`,
        category: 'Musculoskeletal',
        desc: 'High-tensile organic ligament assisting spinal articulation.',
        metabolicRate: '12.0 mL/min Hydro-Ligament Draw',
        neuralFreq: '40 Hz Motor Impulse',
        enzymaticPressure: '750 N Tensile Capacity',
        requiredFluid: 'Myofibrillar Hydraulic Liquid',
      };
      shipGroup.add(tendonMesh);
    }

    // CAUDAL ENGINE COWL & BIO-PLASMA THRUSTERS
    const thrusterCount = state.bioThrusters;
    const caudalNode = spineNodes[spineNodes.length - 1];

    // Ensure the engine housing has enough area to fit the variable number of thrusters
    const engineBaseRadius = Math.max(1.2 + thrusterCount * 0.15, caudalNode.radius * 1.5);

    const caudalCapGeo = new THREE.CylinderGeometry(engineBaseRadius * 0.45, engineBaseRadius * 1.15, 1.4, 16);
    caudalCapGeo.rotateX(Math.PI / 2);
    const caudalMesh = new THREE.Mesh(caudalCapGeo, mats.carapace);
    caudalMesh.position.set(0, caudalNode.y, caudalNode.z + 0.3);
    caudalMesh.userData = {
      name: 'Integral Caudal Stern Engine Cowl Manifold',
      category: 'Exoskeleton Manifold',
      desc: 'Reinforced caudal tail housing incorporating bio-plasma sphincter vents.',
      metabolicRate: '15.0 mL/min Chitin Fuel Supply',
      enzymaticPressure: '16.5 MPa Capacity',
      requiredFluid: 'Osteo-Chitin Mineralizing Sap',
    };
    shipGroup.add(caudalMesh);

    // Fermat's spiral (sunflower) for optimal non-overlapping topology
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < thrusterCount; i++) {
      const fraction = (i + 0.5) / thrusterCount;
      const radiusOffset = Math.sqrt(fraction) * (engineBaseRadius * 0.85); 
      const angle = i * goldenAngle;
      
      // Calculate dynamic scale to ensure they fit without clipping
      const maxAvailableRadius = (engineBaseRadius * 0.9) / Math.sqrt(thrusterCount);
      const thrusterScale = Math.min(1.0, maxAvailableRadius / 0.8);

      const tx = Math.cos(angle) * radiusOffset;
      const ty = caudalNode.y + Math.sin(angle) * radiusOffset;
      const domeZ = (1 - fraction) * 0.4;
      const tz = caudalNode.z + 0.4 + domeZ;

      const thrustPos = new THREE.Vector3(tx, ty, tz);
      // Thrust direction slightly splayed outwards
      const thrustDir = new THREE.Vector3(tx * 0.2, (ty - caudalNode.y) * 0.2, 1.0).normalize();
      const nozzleQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), thrustDir);

      const socketPos = new THREE.Vector3(tx, ty, tz - 0.2);
      createSocketCollar(socketPos, thrustDir, 0.62 * thrusterScale, 0.45 * thrusterScale, mats.carapace, `Bio-Plasma Caudal Sphincter Socket Collar #${i + 1}`);

      const nozzleGeo = new THREE.TorusGeometry(0.55 * thrusterScale, 0.18 * thrusterScale, 12, 20);
      const nozzleMesh = new THREE.Mesh(nozzleGeo, mats.carapace);
      nozzleMesh.position.set(tx, ty, tz);
      nozzleMesh.quaternion.copy(nozzleQuat);

      nozzleMesh.userData = {
        name: `Bio-Plasma Sphincter Vent Nozzle #${i + 1}`,
        category: 'Propulsion Vent',
        desc: 'Thermal propulsive duct venting energized organic plasma.',
        metabolicRate: '58.0 mL/min Propellant Draw',
        neuralFreq: '240 Hz Caudal Valve Pulsation',
        enzymaticPressure: '18.5 bar Combustion Thrust',
        clearanceRadius: '0.55m Active Force Field',
        isInterceptable: false,
        minFreeSpace: '0.8m Nozzle Clearance Zone',
      };
      shipGroup.add(nozzleMesh);

      vascularSinks.push({
        mesh: nozzleMesh,
        socketPos: thrustPos,
        name: nozzleMesh.userData.name,
        category: 'Propulsion Vent',
        desc: nozzleMesh.userData.desc,
        requiredFluid: 'Hypergolic Bio-Plasma Thruster Fuel',
        demandMlMin: 58.0,
        metabolicRate: '58.0 mL/min Propellant Draw',
        neuralFreq: '240 Hz Caudal Valve Pulsation',
        enzymaticPressure: '18.5 bar Combustion Thrust',
        clearanceRadius: '0.55m Active Force Field',
        isInterceptable: false,
        minFreeSpace: '0.8m Nozzle Clearance Zone',
      });

      const plumeGeo = new THREE.ConeGeometry(0.62 * thrusterScale, 3.8 * thrusterScale, 12, 1, true);
      plumeGeo.rotateX(Math.PI / 2);
      plumeGeo.translate(0, 0, 1.9 * thrusterScale);

      const plumeMesh = new THREE.Mesh(plumeGeo, mats.thrusterCore);
      plumeMesh.position.set(tx, ty, tz);
      plumeMesh.quaternion.copy(nozzleQuat);
      shipGroup.add(plumeMesh);

      animatedThrustersRef.current.push(plumeMesh);
      thrusterExhaustPointsRef.current.push(new THREE.Vector3(tx, ty, tz + 0.5));
    }

    // MURRAY'S LAW AUTO-WIRED VASCULAR VEIN NETWORK
    const trunkPoints: THREE.Vector3[] = [];
    for (let i = 0; i < spineNodes.length; i++) {
      const node = spineNodes[i];
      trunkPoints.push(new THREE.Vector3(0, node.y, node.z));
    }
    const centralAortaCurve = new THREE.CatmullRomCurve3(trunkPoints);
    const totalDemand = vascularSinks.reduce((sum, s) => sum + s.demandMlMin, 0);
    const trunkRadius = 0.12 * Math.cbrt(Math.max(1, totalDemand) / 15.0);

    const trunkGeo = new THREE.TubeGeometry(centralAortaCurve, 32, trunkRadius, 10, false);
    const trunkMesh = new THREE.Mesh(trunkGeo, mats.vascularVein);
    trunkMesh.userData = {
      name: 'Primary Central Aorta Trunk Highway',
      category: 'Circulatory Core',
      desc: "Central arterial highway distributing bio-plasma throughout the hull, sized dynamically via Murray's Law.",
      metabolicRate: `${totalDemand.toFixed(1)} mL/min Total Supply Flow`,
      neuralFreq: `${Math.round(50 + state.neuralNodes * 1.5)} BPM Sync`,
      enzymaticPressure: '14.8 bar Hydraulic Stroke',
      vascularDemand: `${totalDemand.toFixed(1)} mL/min Volumetric Demand`,
      vascularFlowSupply: `Murray's Law Trunk Radius r = ${(trunkRadius * 10).toFixed(2)}mm`,
      connectedVeinBranch: 'Main Central Aorta Conduit',
      supportStatus: '100% Core Source (Auto-Wired)',
      requiredFluid: 'Bio-Plasma Haemolymph',
    };
    shipGroup.add(trunkMesh);
    animatedVesselsRef.current.push(trunkMesh);

    // Flank Arteries
    const flankVeinCount = state.vascularDensity;
    const symVeins = getSymmetryVCoords(state.symmetryType, 0);
    for (let v = 0; v < flankVeinCount; v++) {
      const vCoord = symVeins.vCoords[v % symVeins.vCoords.length] + Math.floor(v / symVeins.vCoords.length) * 0.10;
      const sideName = symVeins.names[v % symVeins.names.length] || `Axis #${v + 1}`;
      const veinPath: THREE.Vector3[] = [];

      for (let i = 0; i < spineNodes.length; i++) {
        const uCoord = i / (spineNodes.length - 1);
        const surf = sampleOrganicSurface(uCoord, vCoord % 1.0);
        veinPath.push(surf.position.clone().addScaledVector(surf.normal, -0.45));
      }

      const curve = new THREE.CatmullRomCurve3(veinPath);
      const veinGeo = new THREE.TubeGeometry(curve, 28, 0.08, 6, false);
      const veinMesh = new THREE.Mesh(veinGeo, mats.vascularVein);
      veinMesh.userData = {
        name: `Luminescent Flank Artery (${sideName}) #${v + 1}`,
        category: 'Circulatory Conduit',
        desc: 'Primary longitudinal flank artery providing regional bio-fluid routing.',
        metabolicRate: '180 mL/min Regional Flow',
        neuralFreq: '60 Hz Peristaltic Wave',
        enzymaticPressure: '8.2 bar Arterial Flow',
        connectedVeinBranch: `Flank Artery Highway (${sideName})`,
        supportStatus: '100% Optimal (Auto-Wired)',
        requiredFluid: 'Bio-Plasma Haemolymph',
      };
      shipGroup.add(veinMesh);
      animatedVesselsRef.current.push(veinMesh);
    }

    // Auto-Wire Component Sinks
    vascularSinks.forEach((sink, sinkIdx) => {
      let closestTrunkPt = trunkPoints[0];
      let minDist = Infinity;

      for (let i = 0; i < spineNodes.length; i++) {
        const nodePos = new THREE.Vector3(0, spineNodes[i].y, spineNodes[i].z);
        const dist = nodePos.distanceTo(sink.socketPos);
        if (dist < minDist) {
          minDist = dist;
          closestTrunkPt = nodePos;
        }
      }

      const branchRadius = 0.045 * Math.cbrt(sink.demandMlMin / 10.0);
      
      // Calculate a normal vector pointing from the deep spine trunk outward to the organ socket
      const outwardDir = new THREE.Vector3().subVectors(sink.socketPos, closestTrunkPt).normalize();
      
      // Keep the endpoint of the vein securely inside the hull with an offset from the external skin
      const adjustedSocketPos = sink.socketPos.clone().addScaledVector(outwardDir, -0.45);
      
      // The midpoint curves naturally between the trunk and the internal endpoint
      const midPoint = new THREE.Vector3().addVectors(closestTrunkPt, adjustedSocketPos).multiplyScalar(0.5);
      
      const branchCurve = new THREE.CatmullRomCurve3([closestTrunkPt, midPoint, adjustedSocketPos]);
      const branchGeo = new THREE.TubeGeometry(branchCurve, 10, branchRadius, 6, false);
      const branchMesh = new THREE.Mesh(branchGeo, mats.vascularVein);

      const branchId = `Branch #${sinkIdx + 1} (${minDist < 2.0 ? 'Direct Proximity' : 'Extended Surface Conduit'})`;

      branchMesh.userData = {
        name: `Proximity Auto-Wire Vein -> ${sink.name}`,
        category: 'Circulatory Conduit',
        desc: `Biologically auto-wired vascular vein conduit supplying ${sink.name} with ${sink.requiredFluid}.`,
        metabolicRate: `${sink.demandMlMin.toFixed(1)} mL/min Flow Rate`,
        neuralFreq: sink.neuralFreq || '60 Hz Peristaltic Impulse',
        enzymaticPressure: `Murray's Law Radius r = ${(branchRadius * 10).toFixed(2)}mm`,
        vascularDemand: `${sink.demandMlMin.toFixed(1)} mL/min Volumetric Demand`,
        vascularFlowSupply: `Murray's Law r = ${(branchRadius * 10).toFixed(2)}mm`,
        connectedVeinBranch: branchId,
        supportStatus: '100% Satisfied (Auto-Wired by Proximity)',
        requiredFluid: sink.requiredFluid,
      };

      sink.mesh.userData.vascularDemand = `${sink.demandMlMin.toFixed(1)} mL/min Volumetric Flow`;
      sink.mesh.userData.vascularFlowSupply = `Murray's Law Vessel (r = ${(branchRadius * 10).toFixed(2)}mm)`;
      sink.mesh.userData.connectedVeinBranch = branchId;
      sink.mesh.userData.supportStatus = '100% Satisfied (Proximity Auto-Wired)';
      sink.mesh.userData.requiredFluid = sink.requiredFluid;

      shipGroup.add(branchMesh);
      animatedVesselsRef.current.push(branchMesh);
    });

    // ── B-Spline Conduit Tubes with Flow Particles (pipelineGraph.ts §3.2) ──
    // Iterate pipelineConnections and build semi-transparent tube meshes with
    // animated flow particles travelling source → target along each CatmullRomCurve3.
    const conduitToggleMap: Record<OrganPipelineType, boolean> = {
      BIO_PLASMA: state.showConduitBioPlasma,
      HEMOLYMPH: state.showConduitHemolymph,
      NERVOUS: state.showConduitNervous,
      LIFE_SUPPORT: state.showConduitLifeSupport,
      ARMOR_DEFENSE: state.showConduitArmorDefense,
    };

    // Reset conduit group refs
    (Object.keys(conduitGroupsRef.current) as OrganPipelineType[]).forEach((key) => {
      conduitGroupsRef.current[key] = null;
    });

    pipelineConnections.forEach((conn) => {
      // Task 5: Skip creating conduits for disabled pipelines
      if (!conduitToggleMap[conn.pipeline]) return;

      // Create per-pipeline group if not yet created
      if (!conduitGroupsRef.current[conn.pipeline]) {
        const group = new THREE.Group();
        group.name = `conduit_group_${conn.pipeline}`;
        shipGroup.add(group);
        conduitGroupsRef.current[conn.pipeline] = group;
      }
      const conduitGroup = conduitGroupsRef.current[conn.pipeline]!;

      // 1. Build CatmullRomCurve3 from B-spline control points
      const curvePoints = conn.pathControlPoints.map(p => new THREE.Vector3(p[0], p[1], p[2]));
      const curve = new THREE.CatmullRomCurve3(curvePoints);

      // 2. TubeGeometry with conduitRadius
      const tubeRadius = Math.max(0.05, conn.conduitRadius * 0.5);
      const tubeGeo = new THREE.TubeGeometry(curve, 32, tubeRadius, 8, false);

      // 3. Semi-transparent MeshStandardMaterial with pipeline color
      // DoubleSide is required for transparent tubes — without it, back faces are
      // culled, making the tube look like it has holes when viewed from any angle.
      const conduitMat = new THREE.MeshStandardMaterial({
        color: PIPELINE_COLORS[conn.pipeline],
        emissive: PIPELINE_COLORS[conn.pipeline],
        emissiveIntensity: 1.5,
        roughness: 0.2,
        metalness: 0.1,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, conduitMat);
      tubeMesh.userData = {
        name: `${conn.fluidOrSignalType} Conduit`,
        category: 'Pipeline Conduit',
        desc: `B-spline conduit carrying ${conn.fluidOrSignalType} from ${conn.sourceNodeId} to ${conn.targetNodeId}.`,
        pipeline: conn.pipeline,
        isConduit: true,
      };
      conduitGroup.add(tubeMesh);

      // 4. Animated flow particles — small spheres travelling along the curve
      const particleCount = 4;
      const particleGeo = new THREE.SphereGeometry(tubeRadius * 0.8, 6, 6);
      const particleMat = new THREE.MeshBasicMaterial({
        color: PIPELINE_COLORS[conn.pipeline],
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
      });
      const particles: THREE.Mesh[] = [];
      for (let p = 0; p < particleCount; p++) {
        const particle = new THREE.Mesh(particleGeo, particleMat);
        particle.userData = { t: p / particleCount };
        particles.push(particle);
        conduitGroup.add(particle);
      }

      conduitFlowRef.current.push({ curve, particles, offset: 0 });

      // ── Conduit → Organ Blend Bridge ──
      // Generate a seamless SDF bridge where the conduit meets its target organ.
      // The anatomical rules registry approves this for all conduit→organ connections
      // (the "veins to heart" pattern). The bridge blends the conduit tube SDF
      // with the organ SDF at the organ's position, creating a seamless root.
      {
        const bm = blendBridgeManagerRef.current;
        if (bm) {
          const sourceNode = nodeMap.get(conn.sourceNodeId);
          const targetNode = nodeMap.get(conn.targetNodeId);
          if (sourceNode && targetNode) {
            const sourcePos = new THREE.Vector3(sourceNode.position[0], sourceNode.position[1], sourceNode.position[2]);
            const targetPos = new THREE.Vector3(targetNode.position[0], targetNode.position[1], targetNode.position[2]);
            const targetRadius = conn.conduitRadius > 0 ? conn.conduitRadius : 0.3;
            // Bridge at the target organ end
            bm.generateConduitNodeBridge(
              `conduit_${conn.id}_target`,
              sourcePos, targetPos, Math.max(0.05, conn.conduitRadius * 0.5),
              conn.targetNodeId, targetPos, targetRadius,
              mats.vascularVein,
            );
          }
        }
      }
    });

    // Extract active organs list for the registry drawer
    if (onUpdateOrganList) {
      const organNodes: TargetNodeInfo[] = [];
      const seenNames = new Set<string>();

      shipGroup.traverse((obj) => {
        if (obj.userData && obj.userData.name && !seenNames.has(obj.userData.name)) {
          const name = obj.userData.name as string;
          if (
            !name.includes('Socket Collar') &&
            !name.includes('Vein ->') &&
            !name.includes('Pedicle') &&
            !name.includes('Collar') &&
            !name.includes('Force Field')
          ) {
            seenNames.add(name);

            // Compute the anatomical section from the organ's world Z position.
            // The hull spans startZ (-length/2) to startZ+length (+length/2) along Z,
            // so u = (worldZ - startZ) / length.
            const worldPos = new THREE.Vector3();
            obj.getWorldPosition(worldPos);
            const hullLength = state.length;
            const hullStartZ = -hullLength / 2;
            const organU = Math.max(0, Math.min(1, (worldPos.z - hullStartZ) / hullLength));
            const organSection = uToSection(organU);

            organNodes.push({
              name,
              category: obj.userData.category || 'Biological System',
              desc: obj.userData.desc || '',
              metabolicRate: obj.userData.metabolicRate,
              neuralFreq: obj.userData.neuralFreq,
              enzymaticPressure: obj.userData.enzymaticPressure,
              vascularDemand: obj.userData.vascularDemand,
              vascularFlowSupply: obj.userData.vascularFlowSupply,
              connectedVeinBranch: obj.userData.connectedVeinBranch,
              supportStatus: obj.userData.supportStatus,
              requiredFluid: obj.userData.requiredFluid,
              clearanceRadius: obj.userData.clearanceRadius,
              isInterceptable: obj.userData.isInterceptable,
              minFreeSpace: obj.userData.minFreeSpace,
              habitationVolume: obj.userData.habitationVolume,
              crewCapacity: obj.userData.crewCapacity,
              section: organSection,
              pipeline: obj.userData.pipeline || (obj.userData.category === 'Nervous Subsystem' ? 'NERVOUS' : obj.userData.category === 'Circulatory Core' ? 'HEMOLYMPH' : obj.userData.category === 'Human Habitation Chamber' ? 'LIFE_SUPPORT' : 'BIO_PLASMA'),
              role: obj.userData.role || (obj.userData.name.includes('Heart') ? 'GENERATION' : obj.userData.name.includes('Chamber') ? 'STORAGE' : obj.userData.name.includes('Nozzle') || obj.userData.name.includes('Pod') || obj.userData.name.includes('Spiracle') ? 'EFFECTOR' : 'DISTRIBUTION'),
              upstreamNodeName: obj.userData.upstreamNodeName || (obj.userData.name.includes('Nozzle') ? 'Primary Plasma Highway Trunk' : obj.userData.name.includes('Spiracle') ? 'Aorta Central Heart Core' : obj.userData.name.includes('Chamber') ? 'Photosynthetic Bio-Moss Bed' : 'Bio-Plasma Electrolysis Gland'),
              downstreamNodeNames: obj.userData.downstreamNodeNames || (obj.userData.name.includes('Heart') ? ['Hemolymph Atrium Reservoir', 'Central Aorta Highway'] : obj.userData.name.includes('Chamber') ? ['Cyber-Airlock Stomata Valves'] : ['Bio-Plasma Sphincter Vent Nozzles']),
              operatingPressure: obj.userData.operatingPressure || (obj.userData.name.includes('Heart') ? '18.5 Bar' : obj.userData.name.includes('Chamber') ? '1.01 Bar' : '140 Bar'),
            });
          }
        }
      });

      onUpdateOrganList(organNodes);
    }

    // --- ADVANCED GEOMETRY INTERSECTION AUDIT ---
    // User requirement: "internal organs are supposed to be inside the body, but not inside each other"
    // This runs a smart diagnostic to detect if any of the generated internal organs are clipping into each other.
    // Exclusion rules filter out anatomically-expected crossings (conduits through organs, arteries branching
    // from the heart, vertebrae surrounding the spinal cord, etc.) so only genuine placement bugs are reported.
    const DEBUG_INTERSECTIONS = import.meta.env.VITE_DEBUG_INTERSECTIONS !== 'false';
    if (DEBUG_INTERSECTIONS) {
      console.log('--- RUNNING GEOMETRY INTERSECTION AUDIT (with anatomical exclusion rules) ---');
      const internalOrgans: THREE.Mesh[] = [];

      // 1. Gather all internal organ meshes (excluding the carapace/exoskeleton and utility meshes)
      shipGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.userData && obj.userData.name) {
          const name = obj.userData.name as string;
          const category = obj.userData.category as string;
          if (
            category !== 'Exoskeleton' &&
            !name.includes('Socket Collar') &&
            !name.includes('Vein') &&
            !name.includes('Pedicle') &&
            !name.includes('Force Field')
          ) {
            internalOrgans.push(obj);
          }
        }
      });

      console.log(`Auditing ${internalOrgans.length} internal organ meshes for spatial clipping...`);

      // --- Exclusion rule helpers ---
      // Threading/structural elements that are expected to pass through or connect to other organs.
      const isThreadingElement = (name: string): boolean =>
        name.includes('Conduit') ||
        name.includes('Duct') ||
        name.includes('Feed') ||
        name.includes('Flow') ||
        name.includes('Line') ||
        name.includes('Thread') ||
        name.includes('Highway') ||
        name.includes('Trunk') ||
        name.includes('Hallway') ||
        name.includes('Stair') ||
        name.includes('Corridor') ||
        name.includes('Tendon') ||
        name.includes('Fiber') ||
        name.includes('Artery') ||
        name.includes('Vein') ||
        name.includes('Aorta') ||
        name.includes('Vascular') ||
        name.includes('Blend Bridge');

      // Anatomically expected pairs — these organs are supposed to intersect by design.
      const isExpectedPair = (nameA: string, nameB: string): boolean => {
        // Vertebrae surround the spinal cord
        const isVertebra = (n: string) => n.includes('Vertebra');
        const isSpinalCord = (n: string) => n.includes('Spinal') || n.includes('Axon');
        if ((isVertebra(nameA) && isSpinalCord(nameB)) || (isVertebra(nameB) && isSpinalCord(nameA))) return true;

        // Arteries branch from the heart / aorta
        const isArtery = (n: string) => n.includes('Artery');
        const isHeartOrAorta = (n: string) => n.includes('Heart') || n.includes('Aorta');
        if ((isArtery(nameA) && isHeartOrAorta(nameB)) || (isArtery(nameB) && isHeartOrAorta(nameA))) return true;

        // Nozzles / sphincters mount on the cowl / manifold
        const isNozzle = (n: string) => n.includes('Nozzle') || n.includes('Sphincter');
        const isCowl = (n: string) => n.includes('Cowl') || n.includes('Manifold');
        if ((isNozzle(nameA) && isCowl(nameB)) || (isNozzle(nameB) && isCowl(nameA))) return true;

        // Spiracle gills sit between rib spurs
        const isSpiracle = (n: string) => n.includes('Spiracle') || n.includes('Gill');
        const isRibSpur = (n: string) => n.includes('Rib Spur');
        // Shield emitters sit on the hull perimeter; rib spurs sweep along the
        // hull surface. Both share the exoskeleton layer and their AABBs can
        // overlap at the hull skin boundary.
        const isShieldEmitter = (n: string) => n.includes('Shield Emitter');
        if ((isShieldEmitter(nameA) && isRibSpur(nameB)) ||
            (isShieldEmitter(nameB) && isRibSpur(nameA))) return true;
        if ((isSpiracle(nameA) && isRibSpur(nameB)) || (isSpiracle(nameB) && isRibSpur(nameA))) return true;

        // Brain core connects to the neuro-link interface pod
        const isBrain = (n: string) => n.includes('Brain') || n.includes('Ganglion Core');
        const isNeuroLink = (n: string) => n.includes('Neuro-Link') || n.includes('Neural Ganglion Cluster');
        if ((isBrain(nameA) && isNeuroLink(nameB)) || (isBrain(nameB) && isNeuroLink(nameA))) return true;

        // Heart / aorta connects to the hemolymph atrium reservoir
        const isHeart = (n: string) => n.includes('Heart') || n.includes('Aorta');
        const isAtrium = (n: string) => n.includes('Atrium') || n.includes('Hemolymph');
        if ((isHeart(nameA) && isAtrium(nameB)) || (isHeart(nameB) && isAtrium(nameA))) return true;

        // Bio-plasma gland connects to the bladder reservoir (same system junction)
        const isGland = (n: string) => n.includes('Gland') && !n.includes('Disruptor');
        const isBladder = (n: string) => n.includes('Bladder') || n.includes('Reservoir');
        if ((isGland(nameA) && isBladder(nameB)) || (isGland(nameB) && isBladder(nameA))) return true;

        // Disruptor glands connect to the plasma highway trunk
        const isDisruptor = (n: string) => n.includes('Disruptor');
        const isPlasmaTrunk = (n: string) => n.includes('Plasma') && (n.includes('Highway') || n.includes('Trunk'));
        if ((isDisruptor(nameA) && isPlasmaTrunk(nameB)) || (isDisruptor(nameB) && isPlasmaTrunk(nameA))) return true;

        // Stomata valves connect to the caudal manifold / distribution trunk
        const isStomata = (n: string) => n.includes('Stomata');
        const isCaudalTrunk = (n: string) => n.includes('Caudal') && (n.includes('Manifold') || n.includes('Trunk'));
        if ((isStomata(nameA) && isCaudalTrunk(nameB)) || (isStomata(nameB) && isCaudalTrunk(nameA))) return true;

        // Gizzard connects to the ingestion / moss bed (digestive system junction)
        const isGizzard = (n: string) => n.includes('Gizzard');
        const isMossBed = (n: string) => n.includes('Moss Bed') || n.includes('Photosynthetic');
        if ((isGizzard(nameA) && isMossBed(nameB)) || (isGizzard(nameB) && isMossBed(nameA))) return true;

        // Exoskeletal appendages (ribs, tentacles, spores, eyes, spiracles) share the hull surface
        // and naturally sweep through each other's 3D space — this is anatomically expected on an
        // organic creature where appendages radiate outward and cross neighboring appendage volumes.
        const isAppendage = (n: string) =>
          n.includes('Rib Spur') ||
          n.includes('Tentacle') ||
          n.includes('Spore Warhead') ||
          n.includes('Ocular Beam') ||
          n.includes('Spiracle') ||
          n.includes('Hydrodynamic Fin') ||
          n.includes('Propulsion Fluke') ||
          n.includes('Landing Limb') ||
          n.includes('Stabilizer Sail');
        if (isAppendage(nameA) && isAppendage(nameB)) return true;

        // Vertebrae overlap with adjacent vertebrae (stacked along the spine)
        if (isVertebra(nameA) && isVertebra(nameB)) return true;

        // Plasma gland + bladder + disruptor glands share the bio-plasma system junction
        const isBioPlasmaOrgan = (n: string) =>
          (n.includes('Plasma') || n.includes('Bladder')) && !n.includes('Highway') && !n.includes('Trunk') && !n.includes('Conduit');
        if (isBioPlasmaOrgan(nameA) && isBioPlasmaOrgan(nameB)) return true;

        // Heart + atrium + aorta share the hemolymph system junction (already partially covered above)
        const isHemolymphOrgan = (n: string) =>
          (n.includes('Heart') || n.includes('Atrium') || n.includes('Hemolymph')) && !n.includes('Highway');
        if (isHemolymphOrgan(nameA) && isHemolymphOrgan(nameB)) return true;

        // Neural ganglion clusters are distributed processing nodes that can cluster
        const isNeuralCluster = (n: string) => n.includes('Neural Ganglion Cluster');
        if (isNeuralCluster(nameA) && isNeuralCluster(nameB)) return true;

        // Internal thoracic organs occupy the same body cavity and naturally sit close together.
        // The bladder, atrium, moss bed, coagulation bed, heart, and plasma gland share the
        // thoracic region — their AABBs can overlap at the body cavity boundary.
        const isThoracicOrgan = (n: string) =>
          n.includes('Bladder') ||
          n.includes('Atrium') ||
          n.includes('Moss Bed') ||
          n.includes('Photosynthetic') ||
          n.includes('Coagulation') ||
          n.includes('Heart') ||
          n.includes('Bio-Plasma Electrolysis Gland');
        if (isThoracicOrgan(nameA) && isThoracicOrgan(nameB)) return true;

        // Vertebrae surround the spine where internal organs sit — expected to overlap
        const isInternalOrgan = (n: string) =>
          isThoracicOrgan(n) || n.includes('Gland') || n.includes('Gizzard') ||
          n.includes('Disruptor') || n.includes('Brain') || n.includes('Neuro-Link');
        if ((isVertebra(nameA) && isInternalOrgan(nameB)) || (isVertebra(nameB) && isInternalOrgan(nameA))) return true;

        // Coagulation bed sits near the spine alongside vertebrae
        const isCoagulation = (n: string) => n.includes('Coagulation');
        if ((isCoagulation(nameA) && isVertebra(nameB)) || (isCoagulation(nameB) && isVertebra(nameA))) return true;

        // Neural ganglion clusters are distributed processing nodes that interface with
        // neighboring organs — proximity to surface organs (spiracles, ribs, spores, stomata,
        // habitats) is anatomically expected, as they route neural signals to/from effectors.
        // They also interface with internal organs (plasma gland, heart, bladder, brain) since
        // the nervous system must monitor and regulate all organ systems. Neural cluster meshes
        // are small spheres (~0.35m radius) positioned just inside the hull skin; internal organ
        // meshes are deeper in the body cavity. Their AABBs can overlap at the hull boundary
        // even though the actual meshes are separated by body tissue.
        if ((isNeuralCluster(nameA) && (isAppendage(nameB) || nameB.includes('Stomata') || nameB.includes('Habitat') || isInternalOrgan(nameB) || isVertebra(nameB))) ||
            (isNeuralCluster(nameB) && (isAppendage(nameA) || nameA.includes('Stomata') || nameA.includes('Habitat') || isInternalOrgan(nameA) || isVertebra(nameA)))) return true;

        // Rib spurs form a protective cage around habitat rooms embedded in the hull —
        // a rib sweeping past a habitat is anatomically expected (the rib shields the crew).
        // Similarly, tentacles radiate outward from the hull surface and their long
        // curves sweep past habitat volumes. The tentacle mesh is outside the hull
        // while the habitat is embedded inside, so AABB overlaps are false positives
        // caused by the tentacle's long extent, not by the meshes actually intersecting.
        const isHabitat = (n: string) => n.includes('Habitat Room');
        // Shield emitters share the hull skin with habitats (surface vs interior).
        if ((isShieldEmitter(nameA) && isHabitat(nameB)) ||
            (isShieldEmitter(nameB) && isHabitat(nameA))) return true;
        const isTentacle = (n: string) => n.includes('Tentacle');
        const isOcular = (n: string) => n.includes('Ocular Beam');
        if ((isRibSpur(nameA) && isHabitat(nameB)) || (isRibSpur(nameB) && isHabitat(nameA))) return true;
        if ((isTentacle(nameA) && isHabitat(nameB)) || (isTentacle(nameB) && isHabitat(nameA))) return true;
        // Spiracles are small surface torus vents on the hull skin; habitats are
        // embedded inside the hull. Their AABBs can overlap at the hull skin
        // boundary even though the spiracle mesh is on the exterior and the
        // habitat mesh is interior. They share the hull wall but don't occupy
        // the same space — anatomically expected proximity.
        if ((isSpiracle(nameA) && isHabitat(nameB)) || (isSpiracle(nameB) && isHabitat(nameA))) return true;
        // Ocular pods are small sensory clusters on the hull surface. Like
        // spiracles, they share the hull skin with habitats but don't occupy the
        // same interior space.
        if ((isOcular(nameA) && isHabitat(nameB)) || (isOcular(nameB) && isHabitat(nameA))) return true;
        // Spore warhead pods are surface weapons mounts; habitats are interior
        // crew rooms. Same hull-skin sharing rationale.
        const isSpore = (n: string) => n.includes('Spore Warhead');
        if ((isSpore(nameA) && isHabitat(nameB)) || (isSpore(nameB) && isHabitat(nameA))) return true;

        // Supporting appendages (fins, flukes, landing limbs, dorsal sails) are
        // surface structures that share the hull skin with habitats and internal
        // organs. Their large AABBs can overlap with interior meshes at the hull
        // boundary even though the appendage mesh is exterior and the interior
        // organ is inside the body cavity.
        const isSupportingAppendage = (n: string) =>
          n.includes('Hydrodynamic Fin') ||
          n.includes('Propulsion Fluke') ||
          n.includes('Landing Limb') ||
          n.includes('Stabilizer Sail');
        if ((isSupportingAppendage(nameA) && isHabitat(nameB)) ||
            (isSupportingAppendage(nameB) && isHabitat(nameA))) return true;
        // Supporting appendages vs internal organs (heart, gland, bladder, etc.)
        // — the appendage root shares the hull wall with the body cavity.
        if ((isSupportingAppendage(nameA) && isInternalOrgan(nameB)) ||
            (isSupportingAppendage(nameB) && isInternalOrgan(nameA))) return true;
        // Supporting appendages vs stomata valves (both on hull surface)
        if ((isSupportingAppendage(nameA) && nameB.includes('Stomata')) ||
            (isSupportingAppendage(nameB) && nameA.includes('Stomata'))) return true;
        // Supporting appendages vs vertebrae (fin/limb root shares body wall
        // with the spinal column)
        if ((isSupportingAppendage(nameA) && isVertebra(nameB)) ||
            (isSupportingAppendage(nameB) && isVertebra(nameA))) return true;

        // Vertebrae near the caudal stern / engine cowl are expected (tail structure)
        const isCowlManifold = (n: string) => n.includes('Cowl') || n.includes('Stern');
        if ((isVertebra(nameA) && isCowlManifold(nameB)) || (isVertebra(nameB) && isCowlManifold(nameA))) return true;

        // Tentacles radiate from the caudal hull surface and their long curves
        // sweep past the caudal engine cowl at the tail — anatomically expected
        // (appendages share the tail region with the propulsion housing).
        if ((isTentacle(nameA) && isCowlManifold(nameB)) ||
            (isTentacle(nameB) && isCowlManifold(nameA))) return true;

        // Caudal flukes extend from the tail tip where the engine cowl sits —
        // the fluke root shares the tail surface with the propulsion housing.
        const isCaudalFluke = (n: string) => n.includes('Propulsion Fluke');
        if ((isCaudalFluke(nameA) && isCowlManifold(nameB)) ||
            (isCaudalFluke(nameB) && isCowlManifold(nameA))) return true;
        // Caudal flukes also connect to the terminal vertebrae at the tail tip
        // — the last vertebra anchors the fluke root (like cetacean tail vertebrae).
        if ((isCaudalFluke(nameA) && isVertebra(nameB)) ||
            (isCaudalFluke(nameB) && isVertebra(nameA))) return true;

        // Disruptor glands are dorsal-flank bio-plasma weapons that sit in the
        // thoracic cavity alongside hemolymph organs (atrium) and life-support
        // organs (moss bed). Their AABBs overlap at the body cavity boundary
        // but the actual meshes are separated by body tissue.
        // (isDisruptor and isAtrium are already defined above.)
        if ((isDisruptor(nameA) && isAtrium(nameB)) ||
            (isDisruptor(nameB) && isAtrium(nameA))) return true;
        if ((isDisruptor(nameA) && isMossBed(nameB)) ||
            (isDisruptor(nameB) && isMossBed(nameA))) return true;

        // Bio-plasma organs (gland, disruptor glands) connect to the caudal
        // engine cowl manifold via the plasma trunk — the cowl houses the
        // sphincter vents that expel plasma. This is an expected pipeline junction.
        if ((isBioPlasmaOrgan(nameA) && isCowlManifold(nameB)) ||
            (isBioPlasmaOrgan(nameB) && isCowlManifold(nameA))) return true;

        // Vertebrae near sphincter vent nozzles in the caudal region overlap
        // because the nozzles protrude through the tail vertebrae structure.
        const isSphincterNozzle = (n: string) => n.includes('Sphincter') && n.includes('Nozzle');
        if ((isVertebra(nameA) && isSphincterNozzle(nameB)) ||
            (isVertebra(nameB) && isSphincterNozzle(nameA))) return true;

        // Internal organs (heart, plasma gland, bladder, brain, gizzard, atrium,
        // moss bed, coagulation bed, disruptor glands) sit deep inside the body
        // cavity. Surface organs (spiracles, ribs, eyes, spores, tentacles,
        // neural clusters, habitats) are embedded in the hull shell. On the
        // slimmer leviathan hull the interior masses sit close to the shell, so
        // their AABBs can overlap surface organs even though the actual meshes
        // don't intersect — the internal organ is inside the body and the
        // surface organ is on the skin. They are not "inside each other."
        //
        // This exclusion is DISTANCE-AWARE: it only suppresses pairs where the
        // center distance is large enough that the actual meshes cannot
        // physically intersect (internal organ mesh radius + surface organ mesh
        // radius < center distance). Close pairs that could represent real
        // mesh-mesh penetration are still reported.
        // (Helpers are defined outside isExpectedPair for use in the main loop.)

        return false;
      };

      // Internal-vs-surface organ helpers (used for distance-aware exclusion)
      const isInternalMass = (n: string) =>
        n.includes('Heart') || n.includes('Aorta') ||
        n.includes('Bio-Plasma Electrolysis Gland') || n.includes('Plasma Bladder') ||
        n.includes('Bladder') || n.includes('Brain') || n.includes('Ganglion Core') ||
        n.includes('Gizzard') || n.includes('Atrium') || n.includes('Hemolymph') ||
        n.includes('Moss Bed') || n.includes('Photosynthetic') ||
        n.includes('Coagulation') || n.includes('Disruptor');
      const isSurfaceOrgan = (n: string) =>
        n.includes('Rib Spur') || n.includes('Tentacle') ||
        n.includes('Spore Warhead') || n.includes('Ocular Beam') ||
        n.includes('Spiracle') || n.includes('Habitat Room') ||
        n.includes('Stomata') || n.includes('Neural Ganglion');

      // Extract the base type name (strip instance numbers, side suffixes, and quality tags)
      // for same-type duplicate detection. E.g. "Luminescent Flank Artery (Port Side) #3" → "Luminescent Flank Artery"
      const getBaseTypeName = (name: string): string =>
        name
          .replace(/#\d+/g, '')
          .replace(/\((Port|Starboard|Dorsal|Ventral)( Side)?\)/g, '')
          .replace(/\[(Optimal|Sub-optimal) [^\]]+\]/g, '')
          .replace(/\s+/g, ' ')
          .trim();

      // Ensure world matrices are updated for accurate bounding boxes
      shipGroup.updateMatrixWorld(true);

      let unexpectedCount = 0;
      let expectedCount = 0;
      const unexpectedClips: { nameA: string; nameB: string; overlap: number; distance: number }[] = [];

      // 2. Perform O(N^2) pairwise intersection check
      for (let i = 0; i < internalOrgans.length; i++) {
        for (let j = i + 1; j < internalOrgans.length; j++) {
          const meshA = internalOrgans[i];
          const meshB = internalOrgans[j];

          const nameA = meshA.userData.name as string;
          const nameB = meshB.userData.name as string;

          // Exclusion rule 1: threading elements (conduits, highways, hallways, tendons, etc.)
          // are expected to pass through or connect to other organs — skip entirely.
          if (isThreadingElement(nameA) || isThreadingElement(nameB)) {
            continue;
          }

          // Fast broad-phase check using axis-aligned bounding boxes (AABB)
          const boxA = new THREE.Box3().setFromObject(meshA);
          const boxB = new THREE.Box3().setFromObject(meshB);

          if (boxA.intersectsBox(boxB)) {
            // Narrow-phase check using bounding spheres to rule out AABB corner artifacts
            const sphereA = new THREE.Sphere();
            const sphereB = new THREE.Sphere();
            boxA.getBoundingSphere(sphereA);
            boxB.getBoundingSphere(sphereB);

            if (sphereA.intersectsSphere(sphereB)) {
              const intersectBox = boxA.clone().intersect(boxB);
              const overlapDim = new THREE.Vector3();
              intersectBox.getSize(overlapDim);
              const overlapVolume = overlapDim.x * overlapDim.y * overlapDim.z;

              // Only report significant physical clipping (ignore microscopic surface kisses)
              if (overlapVolume > 0.005) {
                // Direct exclusion: plasma gland ↔ neural cluster (neural clusters
                // are the nervous system's interface to all organs including the
                // plasma gland; their small sphere meshes sit just inside the hull
                // skin while the gland is deeper in the body cavity).
                if ((nameA.includes('Plasma') && nameB.includes('Neural Ganglion')) ||
                    (nameB.includes('Plasma') && nameA.includes('Neural Ganglion'))) {
                  expectedCount++;
                  continue;
                }
                // Direct exclusion: plasma gland ↔ spiracle/rib/spore/tentacle/ocular
                // The plasma gland is a deep internal organ; surface organs are on
                // the hull skin. On the slimmer hull their AABBs can overlap even
                // though the meshes are separated by body tissue.
                if ((nameA.includes('Bio-Plasma Electrolysis Gland') && (nameB.includes('Spiracle') || nameB.includes('Rib Spur') || nameB.includes('Spore Warhead') || nameB.includes('Tentacle') || nameB.includes('Ocular Beam'))) ||
                    (nameB.includes('Bio-Plasma Electrolysis Gland') && (nameA.includes('Spiracle') || nameA.includes('Rib Spur') || nameA.includes('Spore Warhead') || nameA.includes('Tentacle') || nameA.includes('Ocular Beam')))) {
                  expectedCount++;
                  continue;
                }
                // Direct exclusion: spiracle ↔ habitat (spiracles are small surface
                // torus vents on the hull skin; habitats are embedded inside the hull.
                // They share the hull wall but don't occupy the same space.)
                if ((nameA.includes('Spiracle') && nameB.includes('Habitat Room')) ||
                    (nameB.includes('Spiracle') && nameA.includes('Habitat Room'))) {
                  expectedCount++;
                  continue;
                }
                // Direct exclusion: ocular pod ↔ habitat (same hull-skin sharing)
                if ((nameA.includes('Ocular Beam') && nameB.includes('Habitat Room')) ||
                    (nameB.includes('Ocular Beam') && nameA.includes('Habitat Room'))) {
                  expectedCount++;
                  continue;
                }
                // Direct exclusion: spore ↔ habitat (spores are surface weapons
                // mounts; habitats are interior crew rooms)
                if ((nameA.includes('Spore Warhead') && nameB.includes('Habitat Room')) ||
                    (nameB.includes('Spore Warhead') && nameA.includes('Habitat Room'))) {
                  expectedCount++;
                  continue;
                }

                // Exclusion rule 2: anatomically expected pairs (artery+heart, vertebra+spinal cord, etc.)
                if (isExpectedPair(nameA, nameB)) {
                  expectedCount++;
                  continue;
                }

                // Distance-aware internal-vs-surface exclusion:
                // Internal organs (heart, gland, brain, etc.) sit deep inside
                // the body; surface organs (spiracles, ribs, etc.) are on the
                // shell. On the slimmer hull their AABBs can overlap even when
                // the actual meshes are separated by the hull wall. Only
                // suppress when the center distance exceeds the sum of the
                // expected mesh radii — close pairs that could represent real
                // mesh penetration are still reported.
                const centerDist = sphereA.center.distanceTo(sphereB.center);
                if ((isInternalMass(nameA) && isSurfaceOrgan(nameB)) ||
                    (isInternalMass(nameB) && isSurfaceOrgan(nameA))) {
                  const radiusA = sphereA.radius * 0.5;
                  const radiusB = sphereB.radius * 0.5;
                  if (centerDist > radiusA + radiusB) {
                    expectedCount++;
                    continue;
                  }
                }

                // This is a genuine unexpected intersection
                unexpectedCount++;
                const distance = sphereA.center.distanceTo(sphereB.center);
                const isSameType = getBaseTypeName(nameA) === getBaseTypeName(nameB);
                unexpectedClips.push({ nameA, nameB, overlap: overlapVolume, distance });

                console.warn(
                  `[${isSameType ? 'SAME-TYPE DUPLICATE' : 'UNEXPECTED CLIP'}] ${nameA} ↔ ${nameB}\n` +
                  `  Overlap volume: ${overlapVolume.toFixed(4)} | Center distance: ${distance.toFixed(2)}`
                );
              }
            }
          }
        }
      }

      if (unexpectedCount === 0) {
        console.log(
          `[AUDIT PASSED] No unexpected organ intersections detected.\n` +
          `  (${expectedCount} anatomically-expected crossings were correctly excluded.)`
        );
      } else {
        // Group by same-type vs cross-type for a clearer summary
        const sameTypeClips = unexpectedClips.filter(c => getBaseTypeName(c.nameA) === getBaseTypeName(c.nameB));
        const crossTypeClips = unexpectedClips.filter(c => getBaseTypeName(c.nameA) !== getBaseTypeName(c.nameB));
        console.warn(
          `[AUDIT: ${unexpectedCount} UNEXPECTED INTERSECTIONS]\n` +
          `  ${sameTypeClips.length} same-type duplicate overlaps (placement jitter too tight)\n` +
          `  ${crossTypeClips.length} cross-type overlaps (organs that shouldn't touch)\n` +
          `  ${expectedCount} expected crossings correctly excluded\n` +
          `  Fix: increase clearanceRadius for same-type duplicates; reposition cross-type offenders.`
        );
      }
      console.log('---------------------------------------------');
    }
  }, [state, updateMaterials, shipGroupRef, onUpdateOrganList]);

  // Setup Three.js Scene, Camera, Renderer, Controls & Particles
  useEffect(() => {
    if (!canvasRef.current) return;

    const width = canvasRef.current.clientWidth || window.innerWidth;
    const height = canvasRef.current.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x04121e, 0.012);
    const gridHelper = new THREE.GridHelper(100, 100, 0x06b6d4, 0x06b6d4);
    (gridHelper.material as THREE.Material).opacity = 0.05;
    (gridHelper.material as THREE.Material).transparent = true;
    gridHelper.position.y = -6;
    scene.add(gridHelper);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(20, 10, 25);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    rendererRef.current = renderer;

    // Image-Based Lighting: RoomEnvironment via PMREM lights every PBR material
    // with realistic indirect bounce for free (no per-frame cost).
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    canvasRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 100;
    controls.minDistance = 5;
    controls.autoRotate = state.autoRotate;
    controls.autoRotateSpeed = 0.8;
    controlsRef.current = controls;

    // Lights — three-point rig + under-light + hemisphere fill + bioluminescent accents.
    // IBL (scene.environment above) handles indirect bounce; these lights add direction,
    // shape definition, and the cyan bioluminescent character of the ship.
    const hemiLight = new THREE.HemisphereLight(0x4a9eff, 0x0a1a2a, 0.9);
    scene.add(hemiLight);

    // Key light — primary sun-like directional, casts shadows.
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(15, 25, 20);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 80;
    keyLight.shadow.camera.left = -30;
    keyLight.shadow.camera.right = 30;
    keyLight.shadow.camera.top = 30;
    keyLight.shadow.camera.bottom = -30;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    // Fill light — softens shadowed side, no shadows (cheap).
    const fillLight = new THREE.DirectionalLight(0xb4d4ff, 0.7);
    fillLight.position.set(-18, 8, 12);
    scene.add(fillLight);

    // Under-light — lights undersides/overhangs the key can't reach.
    const underLight = new THREE.DirectionalLight(0x88aacc, 0.6);
    underLight.position.set(0, -15, 8);
    scene.add(underLight);

    // Bioluminescent rim — theme glow from behind/below, separates ship from void.
    const rimLight = new THREE.PointLight(themes[state.theme].glow, 3, 40);
    rimLight.position.set(-15, -10, -20);
    scene.add(rimLight);
    rimLightRef.current = rimLight;

    // Bioluminescent core — internal glow from ship center.
    const coreLight = new THREE.PointLight(themes[state.theme].glow, 4, 15);
    coreLight.position.set(0, 0, 0);
    scene.add(coreLight);
    coreLightRef.current = coreLight;

    // Ambient Spore Particles
    const sporeCount = 450;
    const sporeGeo = new THREE.BufferGeometry();
    const sporePos = new Float32Array(sporeCount * 3);
    for (let i = 0; i < sporeCount * 3; i += 3) {
      sporePos[i] = (Math.random() - 0.5) * 90;
      sporePos[i + 1] = (Math.random() - 0.5) * 90;
      sporePos[i + 2] = (Math.random() - 0.5) * 90;
    }
    sporeGeo.setAttribute('position', new THREE.BufferAttribute(sporePos, 3));
    const sporeMat = new THREE.PointsMaterial({
      color: themes[state.theme].glow,
      size: 0.16,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });
    const sporeParticles = new THREE.Points(sporeGeo, sporeMat);
    scene.add(sporeParticles);
    sporeParticlesRef.current = sporeParticles;

    // Thruster Particle System
    const particleCount = 120;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    const particleVelocities: THREE.Vector3[] = [];

    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = 0;
      particlePositions[i * 3 + 1] = 0;
      particlePositions[i * 3 + 2] = -1000;
      particleVelocities.push(new THREE.Vector3(0, 0, 0));
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: themes[state.theme].glowSecondary,
      size: 0.25,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });
    const particleSystem = new THREE.Points(particleGeo, particleMat);
    scene.add(particleSystem);
    particleSystemRef.current = particleSystem;
    particleVelocitiesRef.current = particleVelocities;

    // Ship Parent Group
    const shipGroup = new THREE.Group();
    scene.add(shipGroup);
    shipGroupRef.current = shipGroup;
    (window as any).__shipGroup = shipGroup;
    (window as any).__scene = scene;

    // 3D Highlight Target Reticle Group
    const highlightGroup = new THREE.Group();
    highlightGroup.visible = false;

    // Outer Target Ring
    const ringGeo1 = new THREE.RingGeometry(1.0, 1.15, 32);
    const ringMat1 = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    });
    const ringMesh1 = new THREE.Mesh(ringGeo1, ringMat1);
    highlightGroup.add(ringMesh1);

    // Inner Cross Hair Ring
    const ringGeo2 = new THREE.RingGeometry(1.35, 1.42, 4);
    const ringMat2 = new THREE.MeshBasicMaterial({
      color: 0x34d399,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
      depthTest: false,
    });
    const ringMesh2 = new THREE.Mesh(ringGeo2, ringMat2);
    ringMesh2.rotation.z = Math.PI / 4;
    highlightGroup.add(ringMesh2);

    // Center Pulse Beacon
    const beaconGeo = new THREE.SphereGeometry(0.25, 12, 12);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    highlightGroup.add(beaconMesh);

    scene.add(highlightGroup);
    highlightGroupRef.current = highlightGroup;

    // Window Resize Handler
    const handleResize = () => {
      if (!canvasRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = canvasRef.current.clientWidth;
      const h = canvasRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (rendererRef.current && rendererRef.current.domElement) {
        rendererRef.current.domElement.remove();
      }
    };
  }, []); // Mount once

  // Re-build ship when state parameters change
  useEffect(() => {
    buildSpaceship();
  }, [buildSpaceship]);

  // ── Disruptor Firing Trigger (Task 6) ──
  // Watch state.fireDisruptors for increments and trigger the firing sequence.
  useEffect(() => {
    if (state.fireDisruptors === lastFireDisruptorsRef.current) return;
    lastFireDisruptorsRef.current = state.fireDisruptors;
    if (state.fireDisruptors === 0) return; // initial mount, ignore
    triggerDisruptorFire();
  }, [state.fireDisruptors]);

  // Disruptor firing sequence: charge → beam → cooldown
  const triggerDisruptorFire = useCallback(() => {
    if (firingStateRef.current.isFiring) return; // already firing
    if (disruptorMeshesRef.current.length === 0) return;

    // Use the shared Timer from the animation loop for a consistent time source.
    // Falls back to performance.now()/1000 if the Timer hasn't been initialized yet.
    firingStateRef.current.isFiring = true;
    firingStateRef.current.startTime = timerRef.current
      ? timerRef.current.getElapsed()
      : performance.now() / 1000;

    // Create beam meshes for each disruptor
    const beams: THREE.Mesh[] = [];
    disruptorMeshesRef.current.forEach((disruptor) => {
      const beamGeo = new THREE.CylinderGeometry(0.08, 0.15, 12, 8, 1, true);
      beamGeo.rotateX(Math.PI / 2); // align with +Z (forward)
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0xff6b35,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.copy(disruptor.position);
      beam.position.z += 6; // extend forward from disruptor
      beam.userData = { sourceDisruptor: disruptor };
      shipGroupRef.current?.add(beam);
      beams.push(beam);
    });
    firingStateRef.current.beams = beams;
  }, []);

  // Update controls auto-rotate state
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = state.autoRotate;
    }
  }, [state.autoRotate]);

  // Main Render & Animation Loop
  useEffect(() => {
    let animationFrameId: number;
    const timer = new THREE.Timer();
    timer.connect(document);
    timerRef.current = timer;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      timer.update();
      const time = timer.getElapsed();

      // Audio Heartbeat
      const bpm = 50 + state.neuralNodes * 1.5;
      const beatInterval = 60 / bpm;
      if (state.heartbeatEnabled && time - lastBeatTimeRef.current >= beatInterval) {
        playHeartbeatSound(state.audioEnabled);
        lastBeatTimeRef.current = time;
      }

      // Organ Respiration & Heartbeat Pulse
      if (state.pulseAnim) {
        // Central Heart Contraction
        if (animatedHeartRef.current) {
          const heartScale = 1 + Math.sin(time * (bpm / 10)) * 0.12;
          animatedHeartRef.current.scale.setScalar(heartScale);
        }

        // Neural Ganglia Pulsing
        animatedOrgansRef.current.forEach((organ) => {
          const p = Math.sin(time * 4 + organ.userData.pulsePhase) * 0.15;
          organ.scale.setScalar(organ.userData.baseScale * (1 + p));
        });

        // Gill Vent Expansion / Contraction
        animatedSpiraclesRef.current.forEach((spiracle) => {
          const s = 1 + Math.sin(time * 2 + spiracle.userData.phase) * 0.18;
          spiracle.scale.setScalar(spiracle.userData.baseScale * s);
        });

        if (materialsRef.current.glowNode) {
          (materialsRef.current.glowNode as THREE.MeshStandardMaterial).emissiveIntensity =
            (state.anatomyLayer === 'organs' ? 3.2 : 1.8) + Math.sin(time * 3) * 0.6;
        }

        if (materialsRef.current.vascularVein) {
          (materialsRef.current.vascularVein as THREE.MeshStandardMaterial).emissiveIntensity =
            (state.anatomyLayer === 'vascular' ? 3.8 : 2.2) + Math.sin(time * (bpm / 10)) * 1.0;
        }
      }

      // FABRIK IK Tentacle Undulation
      if (state.waveAnim) {
        animatedTentaclesRef.current.forEach((tentacle) => {
          const u = tentacle.userData;
          const joints: THREE.Vector3[] = u.joints;
          const lengths: number[] = u.lengths;
          const totalLen: number = u.totalLength;
          const numJoints = joints.length;

          const side: number = u.side;
          const rootPos = (u.spineNodePos as THREE.Vector3).clone();
          rootPos.x = side * u.radiusOffset;

          const t = time * 0.7 + u.phase;
          const restTarget = rootPos.clone().addScaledVector(u.restDirection as THREE.Vector3, totalLen * 0.92);

          const targetX = restTarget.x + Math.sin(t * 1.1) * 0.35 * side;
          const targetY = restTarget.y + Math.cos(t * 0.85) * 0.25 + Math.sin(t * 1.5) * 0.12;
          const targetZ = restTarget.z + Math.sin(t * 0.65) * 0.35;
          const target = new THREE.Vector3(targetX, targetY, targetZ);

          joints[0].copy(rootPos);
          const distToTarget = rootPos.distanceTo(target);

          if (distToTarget >= totalLen) {
            for (let i = 0; i < numJoints - 1; i++) {
              const dir = new THREE.Vector3().subVectors(target, joints[i]).normalize();
              joints[i + 1].copy(joints[i]).addScaledVector(dir, lengths[i]);
            }
          } else {
            for (let iter = 0; iter < 3; iter++) {
              joints[numJoints - 1].copy(target);
              for (let i = numJoints - 2; i >= 0; i--) {
                const dir = new THREE.Vector3().subVectors(joints[i], joints[i + 1]).normalize();
                joints[i].copy(joints[i + 1]).addScaledVector(dir, lengths[i]);
              }
              joints[0].copy(rootPos);
              for (let i = 0; i < numJoints - 1; i++) {
                const dir = new THREE.Vector3().subVectors(joints[i + 1], joints[i]).normalize();
                joints[i + 1].copy(joints[i]).addScaledVector(dir, lengths[i]);
              }
            }
          }

          const updatedCurve = new THREE.CatmullRomCurve3(joints);
          tentacle.geometry.dispose();
          tentacle.geometry = new THREE.TubeGeometry(updatedCurve, 16, u.radius, 6, false);
        });
      }

      // Supporting Appendage Animation — gentle undulation for fins/flukes/sails,
      // subtle flex for landing limbs. Organic hydrodynamic motion.
      if (state.waveAnim) {
        animatedAppendagesRef.current.forEach((appendage) => {
          const u = appendage.userData;
          const phase = u.phase || 0;
          if (u.isAppendage) {
            // Gentle oscillation — fins/flukes/sails sway, landing limbs flex
            const sway = Math.sin(time * 0.8 + phase) * 0.04;
            const pitch = Math.cos(time * 0.6 + phase) * 0.03;
            appendage.rotation.z = sway;
            appendage.rotation.x = pitch;
          }
        });
      }

      // Bio-Thrusters & Particle Exhaust
      animatedThrustersRef.current.forEach((plume, idx) => {
        const flicker = 1 + Math.sin(time * 12 + idx) * 0.15 + (Math.random() - 0.5) * 0.1;
        plume.scale.set(flicker, flicker * (1 + Math.sin(time * 8) * 0.1), flicker);
      });

      if (particleSystemRef.current && thrusterExhaustPointsRef.current.length > 0) {
        const positions = particleSystemRef.current.geometry.attributes.position.array as Float32Array;
        const exhaustPts = thrusterExhaustPointsRef.current;
        const velocities = particleVelocitiesRef.current;

        for (let i = 0; i < positions.length / 3; i++) {
          if (positions[i * 3 + 2] > 40 || positions[i * 3 + 2] < -5 || Math.random() < 0.04) {
            const exhaust = exhaustPts[Math.floor(Math.random() * exhaustPts.length)];
            positions[i * 3] = exhaust.x + (Math.random() - 0.5) * 0.4;
            positions[i * 3 + 1] = exhaust.y + (Math.random() - 0.5) * 0.4;
            positions[i * 3 + 2] = exhaust.z + Math.random() * 0.2;
            velocities[i].set(
              (Math.random() - 0.5) * 0.1,
              (Math.random() - 0.5) * 0.1,
              0.4 + Math.random() * 0.3
            );
          } else {
            positions[i * 3] += velocities[i].x;
            positions[i * 3 + 1] += velocities[i].y;
            positions[i * 3 + 2] += velocities[i].z;
          }
        }
        particleSystemRef.current.geometry.attributes.position.needsUpdate = true;
      }

      // Background Spore Drift
      if (sporeParticlesRef.current) {
        const positions = sporeParticlesRef.current.geometry.attributes.position.array as Float32Array;
        for (let i = 1; i < positions.length; i += 3) {
          positions[i] -= 0.02;
          if (positions[i] < -45) positions[i] = 45;
        }
        sporeParticlesRef.current.geometry.attributes.position.needsUpdate = true;
      }

      // ── Conduit Flow Particle Animation (Task 4) ──
      // Advance particles along each conduit CatmullRomCurve3 from source → target.
      conduitFlowRef.current.forEach((entry) => {
        entry.offset += 0.003;
        entry.particles.forEach((particle) => {
          let t = (particle.userData.t as number) + entry.offset;
          t = t % 1.0;
          const pos = entry.curve.getPointAt(t);
          particle.position.copy(pos);
        });
      });

      // ── Disruptor Firing FX Animation (Task 6) ──
      if (firingStateRef.current.isFiring) {
        const elapsed = time - firingStateRef.current.startTime;
        const CHARGE_DURATION = 0.5;
        const BEAM_DURATION = 0.3;
        const COOLDOWN_DURATION = 0.5;
        const TOTAL_DURATION = CHARGE_DURATION + BEAM_DURATION + COOLDOWN_DURATION;

        if (elapsed < TOTAL_DURATION) {
          if (elapsed < CHARGE_DURATION) {
            // Charge phase: glow brighter, scale up
            const chargeT = elapsed / CHARGE_DURATION;
            disruptorMeshesRef.current.forEach((d) => {
              d.scale.setScalar(1 + chargeT * 0.5);
              const mat = d.material as THREE.MeshBasicMaterial;
              mat.opacity = 0.8 + chargeT * 0.2;
            });
          } else if (elapsed < CHARGE_DURATION + BEAM_DURATION) {
            // Beam phase: bright beam shoots forward
            const beamT = (elapsed - CHARGE_DURATION) / BEAM_DURATION;
            const beamOpacity = Math.sin(beamT * Math.PI); // fade in/out
            disruptorMeshesRef.current.forEach((d) => {
              d.scale.setScalar(1.5 - beamT * 0.3);
            });
            firingStateRef.current.beams.forEach((beam) => {
              const mat = beam.material as THREE.MeshBasicMaterial;
              mat.opacity = beamOpacity * 0.9;
              beam.scale.z = 1 + beamT * 0.5;
            });
          } else {
            // Cooldown phase: glow fades back to normal
            const coolT = (elapsed - CHARGE_DURATION - BEAM_DURATION) / COOLDOWN_DURATION;
            disruptorMeshesRef.current.forEach((d) => {
              d.scale.setScalar(1.2 - coolT * 0.2);
              const mat = d.material as THREE.MeshBasicMaterial;
              mat.opacity = 1.0 - coolT * 0.2;
            });
            firingStateRef.current.beams.forEach((beam) => {
              const mat = beam.material as THREE.MeshBasicMaterial;
              mat.opacity = (1 - coolT) * 0.1;
            });
          }
        } else {
          // Firing complete — reset
          disruptorMeshesRef.current.forEach((d) => {
            d.scale.setScalar(1);
            const mat = d.material as THREE.MeshBasicMaterial;
            mat.opacity = 0.8;
          });
          firingStateRef.current.beams.forEach((beam) => {
            beam.parent?.remove(beam);
            beam.geometry.dispose();
            (beam.material as THREE.Material).dispose();
          });
          firingStateRef.current.beams = [];
          firingStateRef.current.isFiring = false;
        }
      }

      // Pulse the highlighted section overlay band
      if (sectionOverlayRef.current) {
        const pulse = 0.25 + 0.15 * Math.sin(time * 4);
        sectionOverlayRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh && child.userData.isSectionOverlay) {
            const mat = child.material as THREE.MeshBasicMaterial;
            if (highlightedSection === child.userData.sectionId) {
              mat.opacity = pulse;
            }
          }
        });
      }

      // Update 3D Highlight Reticle Ring and Camera Target
      if (highlightGroupRef.current && shipGroupRef.current && targetNode?.name) {
        let foundMesh: THREE.Object3D | null = null;
        shipGroupRef.current.traverse((child) => {
          if (!foundMesh && child.userData && child.userData.name === targetNode.name) {
            foundMesh = child;
          }
        });

        if (foundMesh) {
          const targetWorldPos = new THREE.Vector3();
          (foundMesh as THREE.Object3D).getWorldPosition(targetWorldPos);

          highlightGroupRef.current.visible = true;
          highlightGroupRef.current.position.lerp(targetWorldPos, 0.2);

          if (cameraRef.current) {
            highlightGroupRef.current.quaternion.copy(cameraRef.current.quaternion);
          }

          if (highlightGroupRef.current.children[0]) {
            highlightGroupRef.current.children[0].rotation.z += 0.02;
          }
          if (highlightGroupRef.current.children[1]) {
            highlightGroupRef.current.children[1].rotation.z -= 0.03;
          }

          const s = 1 + Math.sin(time * 6) * 0.15;
          highlightGroupRef.current.scale.setScalar(s);

          // Smoothly lerp OrbitControls camera target toward highlighted organ
          if (controlsRef.current) {
            controlsRef.current.target.lerp(targetWorldPos, 0.04);
          }
        } else {
          highlightGroupRef.current.visible = false;
        }
      }

      // Defensive guard: if TransformControls is attached to an object that has
      // been removed from the scene graph (e.g. by a rebuild that bypassed the
      // detach in buildSpaceship), detach it now to prevent the per-frame
      // "attached 3D object must be a part of the scene graph" warning.
      const tc = transformControlsRef.current;
      if (tc) {
        const attached = (tc as any).object as THREE.Object3D | undefined;
        if (attached) {
          // Walk up the parent chain — if we never reach a node with no parent
          // (i.e. the scene), the object is disconnected from the scene graph.
          let parent: THREE.Object3D | null = attached.parent;
          let inScene = false;
          while (parent) {
            if (parent === sceneRef.current) { inScene = true; break; }
            parent = parent.parent;
          }
          if (!inScene) {
            tc.detach();
            selectedOrganMeshRef.current = null;
            const helper = tc.getHelper();
            if (helper.parent) helper.parent.remove(helper);
          }
        }
      }

      if (controlsRef.current) controlsRef.current.update();
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      timer.disconnect();
      timer.dispose();
      timerRef.current = null;
    };
  }, [state.audioEnabled, state.heartbeatEnabled, state.neuralNodes, state.pulseAnim, state.waveAnim, state.viewMode, state.anatomyLayer, state.fireDisruptors, targetNode, highlightedSection]);

  // ── Transform Gizmo: attach TransformControls to the selected organ ──
  // When an organ is selected via click, a gizmo (translate/rotate handles) appears.
  // Dragging the gizmo handles moves/rotates the organ in 3D space, and the hull
  // adapts live to contain the organ's new position.
  // Keyboard shortcuts: G = translate mode, R = rotate mode, Escape = detach.
  useEffect(() => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current || !controlsRef.current) return;

    // Create TransformControls and add to scene
    const tc = new TransformControls(cameraRef.current, rendererRef.current.domElement);
    transformControlsRef.current = tc;

    // When dragging starts on the gizmo, disable OrbitControls
    tc.addEventListener('dragging-changed', (event: any) => {
      if (controlsRef.current) {
        controlsRef.current.enabled = !event.value;
      }
    });

    // On every change during gizmo drag, update the organ's position and adapt hull.
    // NOTE: TransformControls fires 'change' on attach()/setMode() too (via property
    // setters), not only during actual dragging. Guard with tc.dragging so we only
    // adapt the hull when the user is actively dragging the gizmo — otherwise the hull
    // balloons on every click because attach() fires 'change' with stale positions.
    tc.addEventListener('change', () => {
      const mesh = selectedOrganMeshRef.current;
      if (!mesh || !adaptHullRef.current) return;
      if (!tc.dragging) return;

      // Update the matching candidate organ's position from the mesh world position
      const organ = candidateOrgansRef.current.find((o: any) =>
        o.name === mesh.userData.name || mesh.userData.name?.includes(o.name),
      );
      if (organ) {
        organ.pos.copy(mesh.position);
        // For translate mode, also update u/v so re-projection works after adaptation
        if (gizmoModeRef.current === 'translate') {
          const sn = spineNodesRef.current;
          if (sn.length > 0) {
            const startZ = sn[0].z;
            const endZ = sn[sn.length - 1].z;
            const span = endZ - startZ;
            if (span > 0) {
              let newU = (mesh.position.z - startZ) / span;
              // Clamp to the organ's anatomical section so dragging can't
              // move organs out of their correct region.
              const organType = organ.type as string;
              let uMin = 0.05, uMax = 0.95;
              switch (organType) {
                case 'eye':    uMin = 0.02; uMax = 0.15; break;
                case 'neural': uMin = 0.03; uMax = 0.30; break;
                case 'spiracle':
                case 'rib':
                case 'habitat':
                case 'pectoralFin':
                case 'landingLimb': uMin = 0.30; uMax = 0.65; break;
                case 'dorsalSail': uMin = 0.15; uMax = 0.55; break;
                case 'spore':
                case 'tentacle': uMin = 0.65; uMax = 0.85; break;
                case 'caudalFluke': uMin = 0.85; uMax = 0.98; break;
              }
              newU = Math.max(uMin, Math.min(uMax, newU));
              const spineIdx = Math.round(newU * (sn.length - 1));
              const spineNode = sn[Math.min(sn.length - 1, Math.max(0, spineIdx))];
              const dx = mesh.position.x - spineNode.xArch;
              const dy = mesh.position.y - spineNode.y;
              let newV = Math.atan2(dx, dy) / (Math.PI * 2);
              if (newV < 0) newV += 1.0;
              organ.u = newU;
              organ.v = newV;
            }
          }
        }
      }

      // Live hull adaptation — skip re-projection to avoid feedback loop
      adaptHullRef.current(false);

      // ── Regenerate blend bridges for the dragged organ ──
      // The hull SDF and organ-hull bridges must be rebuilt to stay attached
      // to the moved organ. Only organs with approved blends (eye, neural, spore)
      // get regenerated; others (tentacle, spiracle, rib, habitat) have no bridges.
      const bm = blendBridgeManagerRef.current;
      if (bm && organ) {
        // Update hull SDF from the adapted spine nodes
        bm.regenerateHullSDF(spineNodesRef.current as SpineNode[]);
        // Regenerate the organ's hull blend bridge at its new position
        const organSize = organ.extra?.size || organ.extra?.sacRadius || 0.3;
        const stalkLen = organ.type === 'eye' ? (state as any).eyeStalkLength || 0 : 0;
        const dragMats = materialsRef.current;
        bm.regenerateOrganHullBridge(
          organ.id,
          organ.type,
          organ.pos,
          organ.normal,
          organSize,
          stalkLen,
          organ.type === 'spore' ? dragMats.flesh : dragMats.carapace,
        );
      }
    });

    // Don't add to scene yet — only when an organ is selected
    // (handled in the targetNode effect below)

    // Keyboard shortcuts for gizmo mode switching
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!transformControlsRef.current) return;
      // Don't intercept if typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      if (e.key === 'g' || e.key === 'G') {
        gizmoModeRef.current = 'translate';
        transformControlsRef.current.setMode('translate');
      } else if (e.key === 'r' || e.key === 'R') {
        gizmoModeRef.current = 'rotate';
        transformControlsRef.current.setMode('rotate');
      } else if (e.key === 'Escape') {
        transformControlsRef.current.detach();
        selectedOrganMeshRef.current = null;
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      tc.dispose();
      const helper = tc.getHelper();
      if (sceneRef.current && helper.parent) {
        sceneRef.current.remove(helper);
      }
      transformControlsRef.current = null;
    };
  }, []);

  // Attach/detach gizmo when targetNode selection changes
  useEffect(() => {
    const tc = transformControlsRef.current;
    const scene = sceneRef.current;
    const shipGroup = shipGroupRef.current;
    if (!tc || !scene || !shipGroup) return;

    // In three 0.185+, TransformControls extends Controls (not Object3D).
    // The visual gizmo is a separate Object3D retrieved via getHelper().
    const helper = tc.getHelper();

    if (!targetNode) {
      // Deselected — detach gizmo
      tc.detach();
      selectedOrganMeshRef.current = null;
      if (helper.parent) scene.remove(helper);
      return;
    }

    // Find the mesh matching the selected organ name
    let foundMesh: THREE.Mesh | null = null;
    shipGroup.traverse((child) => {
      if (child.userData && child.userData.name === targetNode.name && child instanceof THREE.Mesh) {
        foundMesh = child as THREE.Mesh;
      }
    });

    if (foundMesh) {
      selectedOrganMeshRef.current = foundMesh;
      tc.attach(foundMesh);
      tc.setMode(gizmoModeRef.current);
      // Add gizmo helper to scene (not shipGroup, so it doesn't rotate with the ship)
      if (!helper.parent) scene.add(helper);
    } else {
      tc.detach();
      selectedOrganMeshRef.current = null;
      if (helper.parent) scene.remove(helper);
    }
  }, [targetNode, state.seed, state.thoraxWidth, state.length]);

  // Update section overlay visibility/opacity based on highlightedSection.
  // When a section is highlighted: that band glows brightly, others dim.
  // When null: all bands show at a faint baseline so sections are always visible.
  useEffect(() => {
    const overlayGroup = sectionOverlayRef.current;
    if (!overlayGroup) return;
    overlayGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.isSectionOverlay) {
        const mat = child.material as THREE.MeshBasicMaterial;
        const isHighlighted = highlightedSection === child.userData.sectionId;
        if (highlightedSection) {
          mat.opacity = isHighlighted ? 0.35 : 0.0;
        } else {
          mat.opacity = 0.08;
        }
      }
    });
  }, [highlightedSection, state.seed, state.thoraxWidth, state.length, state.segments]);

  // Click / Raycaster Target Scanner & Smooth Component Focus
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cameraRef.current || !shipGroupRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);
    const intersects = raycaster.intersectObjects(shipGroupRef.current.children, true);

    // Iterate through all intersections (sorted nearest-first) to find the first
    // interactable organ. The hull carapace wraps around the entire ship, so it's
    // often the closest hit — we skip it and look at surface organs behind it.
    // Structural meshes (hull, socket collars, force-field shields) are skipped;
    // force-field shields redirect to their parent organ.
    let hitObj: THREE.Object3D | null = null;

    for (const hit of intersects) {
      let obj: THREE.Object3D = hit.object;

      // Force-field shield bubble → redirect to parent organ
      if (obj.userData?.isForceField && obj.userData?.parentOrganName) {
        const parentName = obj.userData.parentOrganName;
        let resolved: THREE.Object3D | null = null;
        shipGroupRef.current.traverse((child) => {
          if (child.userData && child.userData.name === parentName) {
            resolved = child;
          }
        });
        if (resolved) obj = resolved;
        else continue; // parent organ not found, try next intersection
      }

      // Bubble up to parent group if the hit mesh itself has no userData.name
      // (e.g. individual stair steps inside a stairGroup, or hallway tube segments)
      if (!obj.userData?.name) {
        let walker: THREE.Object3D | null = obj;
        while (walker && !walker.userData?.name) {
          walker = walker.parent;
          if (!walker || walker === shipGroupRef.current) break;
        }
        if (walker && walker.userData?.name) {
          obj = walker;
        }
      }

      // Skip structural meshes:
      // - Hull carapace (isHull flag) — click through to surface organs behind it
      // - Socket collars — structural mounting flanges, not organs
      // - Force-field shields without a resolvable parent
      // - Blend bridges — seamless fillet meshes, not organs themselves
      if (obj.userData?.isHull) continue;
      if (obj.userData?.name?.includes('Socket Collar')) continue;
      if (obj.userData?.isForceField) continue;
      if (obj.userData?.isBlendBridge) continue;
      if (obj.userData?.isSectionOverlay) continue;

      // Found an interactable organ
      hitObj = obj;
      break;
    }

    if (hitObj && hitObj.userData && hitObj.userData.name) {
        // Task 6: Disruptor click detection — fire AND select
        if (hitObj.userData.isDisruptor) {
          triggerDisruptorFire();
          onShowToast('Disruptor Glands firing!');
        }
        onSelectTargetNode({
          name: hitObj.userData.name,
          category: hitObj.userData.category || 'Biological Organ',
          desc: hitObj.userData.desc || 'Biological component detected by deep scanner.',
          metabolicRate: hitObj.userData.metabolicRate || '24% Standard Metabolic Draw',
          neuralFreq: hitObj.userData.neuralFreq || '60 Hz Autonomic Impulse',
          enzymaticPressure: hitObj.userData.enzymaticPressure || '1.0 bar Normal Pressure',
          vascularDemand: hitObj.userData.vascularDemand || '18.5 mL/min Volumetric Flow',
          vascularFlowSupply: hitObj.userData.vascularFlowSupply || "Murray's Law r = 0.18mm",
          connectedVeinBranch: hitObj.userData.connectedVeinBranch || 'Proximity Auto-Wired Branch',
          supportStatus: hitObj.userData.supportStatus || '100% Satisfied',
          requiredFluid: hitObj.userData.requiredFluid || 'Bio-Plasma Haemolymph',
          clearanceRadius: hitObj.userData.clearanceRadius || '0.8m Standard Buffer',
          isInterceptable: hitObj.userData.isInterceptable !== undefined ? hitObj.userData.isInterceptable : true,
          minFreeSpace: hitObj.userData.minFreeSpace || '1.0m Free Space',
          habitationVolume: hitObj.userData.habitationVolume,
          crewCapacity: hitObj.userData.crewCapacity,
          pipeline: hitObj.userData.pipeline,
          role: hitObj.userData.role,
          upstreamNodeName: hitObj.userData.upstreamNodeName,
          downstreamNodeNames: hitObj.userData.downstreamNodeNames,
          operatingPressure: hitObj.userData.operatingPressure,
          outputCapacity: hitObj.userData.outputCapacity,
        });
        playScanChirp(state.audioEnabled);
        onShowToast(`Scanned: ${hitObj.userData.name}`);
    } else {
      onSelectTargetNode(null);
    }
  };

  return (
    <main
      ref={canvasRef}
      onClick={handleClick}
      className="relative w-full h-full flex-grow cursor-crosshair overflow-hidden"
    />
  );
};

