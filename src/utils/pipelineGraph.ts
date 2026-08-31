/**
 * Pipeline Graph — Single source of truth for the 5 closed-loop organ system
 * pipelines defined in ORGAN_SYSTEMS.md §2.
 *
 * Every organ node and every conduit connection is declared here as data.
 * Canvas3D.tsx reads from this module to place organs and build conduit tubes.
 *
 * Mathematical models:
 *   §3.1 Murray's Law  — r_parent³ = r_child₁³ + r_child₂³  (vascular branching)
 *   §3.2 B-spline (p=3) — cubic B-spline with spine-normal offset control points
 */

import * as THREE from 'three';
import {
  OrganPipelineType,
  OrganPipelineRole,
  OrganPipelineNode,
  OrganConnectionLink,
} from '../types';

// ── Ship geometry context (computed by Canvas3D from spine nodes) ──

export interface ShipGeometryContext {
  /** Head/anterior spine node (z = +length/2) */
  headPos: THREE.Vector3;
  headRadius: number;
  /** Heart/mid spine node */
  heartPos: THREE.Vector3;
  heartRadius: number;
  /** Tail/posterior spine node (z = -length/2) */
  tailPos: THREE.Vector3;
  tailRadius: number;
  /** Local spine normal at the mid-point (approx up vector) */
  spineNormal: THREE.Vector3;
  /** Thorax width from state */
  thoraxWidth: number;
  /** Ship length from state */
  length: number;
  /** Sample the hull radius at a given z-position (interpolated from spine nodes). */
  sampleRadiusAtZ: (z: number) => number;
  /** Sample the spine y-arch at a given z-position (interpolated from spine nodes). */
  sampleSpineYAtZ: (z: number) => number;
}

// ── Node ID constants ──

export const NODE_IDS = {
  // Pipeline 1: Bio-Plasma
  PLASMA_GLAND: 'plasma_gland',
  PLASMA_BLADDER: 'plasma_bladder',
  PLASMA_TRUNK: 'plasma_trunk',
  CAUDAL_MANIFOLD: 'caudal_manifold',
  SIPHON_VENT_NOZZLE: 'siphon_vent_nozzle',
  DISRUPTOR_GLAND: 'disruptor_gland',
  // Pipeline 2: Hemolymph
  HEART_CORE: 'heart_core',
  HEMOLYMPH_ATRIUM: 'hemolymph_atrium',
  AORTA_HIGHWAY: 'aorta_highway',
  FLANK_ARTERY: 'flank_artery',
  SPIRACLE_VENT: 'spiracle_vent',
  // Pipeline 3: Nervous
  BRAIN_CORE: 'brain_core',
  NEURO_LINK: 'neuro_link',
  AXON_CORD: 'axon_cord',
  OCULAR_POD: 'ocular_pod',
  MUSCLE_TENDON: 'muscle_tendon',
  // Pipeline 4: Life Support
  ICE_GIZZARD: 'ice_gizzard',
  BIO_MOSS: 'bio_moss',
  HABITAT_CHAMBER: 'habitat_chamber',
  CYBER_AIRLOCK: 'cyber_airlock',
  // Pipeline 5: Armor & Defense
  CHITIN_VERTEBRA: 'chitin_vertebra',
  CARAPACE_PLATE: 'carapace_plate',
  BIO_NANITE_BED: 'bio_nanite_bed',
  SHIELD_EMITTER: 'shield_emitter',
} as const;

// ── Node definitions ──
// Positions are computed relative to ship geometry in `buildPipelineNodes()`.
// The `positionFn` receives the geometry context and returns a world-space [x, y, z].

interface NodeDef {
  id: string;
  name: string;
  pipeline: OrganPipelineType;
  role: OrganPipelineRole;
  anatomicalLayer: 'full' | 'exoskeleton' | 'vascular' | 'organs' | 'muscular';
  positionFn: (ctx: ShipGeometryContext) => [number, number, number];
  downstreamNodeIds: string[];
  telemetry: {
    outputRate?: string;
    operatingPressure?: string;
    efficiencyCoherence?: string;
    baseEnergyCost?: number;
  };
}

const NODE_DEFS: NodeDef[] = [
  // ── Pipeline 1: Bio-Plasma Power & Propulsion (§2.1) ──
  // Internal organs use localHullR (a fraction of the hull radius at their z) to stay inside.
  // Exoskeleton effectors use localHullR * 1.05 to sit on the surface.
  {
    id: NODE_IDS.PLASMA_GLAND,
    name: 'Bio-Plasma Electrolysis Gland',
    pipeline: 'BIO_PLASMA',
    role: 'GENERATION',
    anatomicalLayer: 'organs',
    positionFn: (ctx) => {
      const z = ctx.heartPos.z - 1.0;
      const r = ctx.sampleRadiusAtZ(z);
      const sy = ctx.sampleSpineYAtZ(z);
      return [0, sy - r * 0.35, z]; // ventral interior, thoracic
    },
    downstreamNodeIds: [NODE_IDS.PLASMA_BLADDER],
    telemetry: { outputRate: '850 kW Electrolysis', operatingPressure: '140 Bar' , baseEnergyCost: 50 },
  },
  {
    id: NODE_IDS.PLASMA_BLADDER,
    name: 'Muscular Plasma Bladder Reservoir',
    pipeline: 'BIO_PLASMA',
    role: 'STORAGE',
    anatomicalLayer: 'organs',
    positionFn: (ctx) => {
      const z = ctx.heartPos.z + 1.5;
      const r = ctx.sampleRadiusAtZ(z);
      const sy = ctx.sampleSpineYAtZ(z);
      return [0, sy - r * 0.25, z]; // ventral interior
    },
    downstreamNodeIds: [NODE_IDS.PLASMA_TRUNK],
    telemetry: { operatingPressure: '140 Bar Fuel Buffer' , baseEnergyCost: 5 },
  },
  {
    id: NODE_IDS.PLASMA_TRUNK,
    name: 'Primary Plasma Trunk Highway',
    pipeline: 'BIO_PLASMA',
    role: 'DISTRIBUTION',
    anatomicalLayer: 'vascular',
    positionFn: (ctx) => {
      const z = ctx.heartPos.z - 2.0;
      const r = ctx.sampleRadiusAtZ(z);
      const sy = ctx.sampleSpineYAtZ(z);
      return [0, sy - r * 0.15, z]; // near spine, ventral
    },
    downstreamNodeIds: [NODE_IDS.CAUDAL_MANIFOLD, NODE_IDS.DISRUPTOR_GLAND],
    telemetry: { outputRate: '2,400 L/min Flow' , baseEnergyCost: 2 },
  },
  {
    id: NODE_IDS.CAUDAL_MANIFOLD,
    name: 'Caudal Manifold Distribution Trunk',
    pipeline: 'BIO_PLASMA',
    role: 'DISTRIBUTION',
    anatomicalLayer: 'vascular',
    positionFn: (ctx) => {
      const z = ctx.tailPos.z + 0.5;
      const r = ctx.sampleRadiusAtZ(z);
      const sy = ctx.sampleSpineYAtZ(z);
      return [0, sy, z]; // centered on spine at stern
    },
    downstreamNodeIds: [NODE_IDS.SIPHON_VENT_NOZZLE],
    telemetry: { outputRate: 'Hydrodynamic Splitting' , baseEnergyCost: 2 },
  },
  {
    id: NODE_IDS.SIPHON_VENT_NOZZLE,
    name: 'Bio-Plasma Vent Nozzles',
    pipeline: 'BIO_PLASMA',
    role: 'EFFECTOR',
    anatomicalLayer: 'exoskeleton',
    positionFn: (ctx) => {
      const z = ctx.tailPos.z - 1.0;
      const r = ctx.sampleRadiusAtZ(z);
      const sy = ctx.sampleSpineYAtZ(z);
      return [0, sy - r * 0.4, z]; // posterior ventral exhaust
    },
    downstreamNodeIds: [],
    telemetry: { outputRate: '1,700 kN Hydro-Pulse' , baseEnergyCost: 120 },
  },
  {
    id: NODE_IDS.DISRUPTOR_GLAND,
    name: 'Bio-Plasma Disruptor Glands',
    pipeline: 'BIO_PLASMA',
    role: 'EFFECTOR',
    anatomicalLayer: 'organs',
    positionFn: (ctx) => {
      const z = ctx.heartPos.z + 1.5;
      const r = ctx.sampleRadiusAtZ(z);
      const sy = ctx.sampleSpineYAtZ(z);
      // Dorsal flank, just inside the hull (thoracic)
      return [r * 0.5, sy + r * 0.35, z];
    },
    downstreamNodeIds: [],
    telemetry: { outputRate: '450 MW Thermal Burst' , baseEnergyCost: 200 },
  },

  // ── Pipeline 2: Hemolymph Circulation & Thermal Regulation (§2.2) ──
  {
    id: NODE_IDS.HEART_CORE,
    name: 'Aorta Bioluminescent Central Engine (Heart)',
    pipeline: 'HEMOLYMPH',
    role: 'GENERATION',
    anatomicalLayer: 'vascular',
    positionFn: (ctx) => {
      const z = ctx.heartPos.z + 0.5;
      const r = ctx.sampleRadiusAtZ(z);
      const sy = ctx.sampleSpineYAtZ(z);
      return [0, sy + r * 0.05, z]; // centered, slightly dorsal
    },
    downstreamNodeIds: [NODE_IDS.HEMOLYMPH_ATRIUM],
    telemetry: { outputRate: '68 BPM Systolic Stroke' , baseEnergyCost: 40 },
  },
  {
    id: NODE_IDS.HEMOLYMPH_ATRIUM,
    name: 'Hemolymph Atrium Reservoir',
    pipeline: 'HEMOLYMPH',
    role: 'STORAGE',
    anatomicalLayer: 'vascular',
    positionFn: (ctx) => {
      const z = ctx.heartPos.z + 0.3;
      const r = ctx.sampleRadiusAtZ(z);
      const sy = ctx.sampleSpineYAtZ(z);
      return [0, sy + r * 0.2, z]; // dorsal interior, close to heart
    },
    downstreamNodeIds: [NODE_IDS.AORTA_HIGHWAY],
    telemetry: { operatingPressure: '18.5 Bar Antifreeze Buffer' , baseEnergyCost: 5 },
  },
  {
    id: NODE_IDS.AORTA_HIGHWAY,
    name: 'Central Aorta Highway',
    pipeline: 'HEMOLYMPH',
    role: 'DISTRIBUTION',
    anatomicalLayer: 'vascular',
    positionFn: (ctx) => {
      const z = ctx.heartPos.z - 1.0;
      const r = ctx.sampleRadiusAtZ(z);
      const sy = ctx.sampleSpineYAtZ(z);
      return [0, sy, z]; // on spine center
    },
    downstreamNodeIds: [NODE_IDS.FLANK_ARTERY],
    telemetry: { outputRate: "Murray's Law Branching" },
  },
  {
    id: NODE_IDS.FLANK_ARTERY,
    name: 'Luminescent Flank Arteries',
    pipeline: 'HEMOLYMPH',
    role: 'DISTRIBUTION',
    anatomicalLayer: 'vascular',
    positionFn: (ctx) => {
      const z = ctx.heartPos.z - 2.0;
      const r = ctx.sampleRadiusAtZ(z);
      const sy = ctx.sampleSpineYAtZ(z);
      return [r * 0.5, sy, z]; // lateral interior
    },
    downstreamNodeIds: [NODE_IDS.SPIRACLE_VENT],
    telemetry: { outputRate: 'Capillary Delivery' , baseEnergyCost: 2 },
  },
  {
    id: NODE_IDS.SPIRACLE_VENT,
    name: 'Respiratory Spiracle Gill Vents',
    pipeline: 'HEMOLYMPH',
    role: 'EFFECTOR',
    anatomicalLayer: 'exoskeleton',
    positionFn: (ctx) => {
      const z = ctx.heartPos.z - 1.5;
      const r = ctx.sampleRadiusAtZ(z);
      const sy = ctx.sampleSpineYAtZ(z);
      return [r * 0.85, sy + r * 0.4, z]; // dorsal flank, on surface (thoracic)
    },
    downstreamNodeIds: [],
    telemetry: { outputRate: '820 W/m² IR Radiation' , baseEnergyCost: 15 },
  },

  // ── Pipeline 3: Nervous & Cybernetic Synaptic System (§2.3) ──
  //
  // Anatomical placement (living-ship layout):
  //
  //   [Window/Front] → [Command Room] → [Back Wall] → [Hallway] → [rest of ship]
  //                                                        ↑
  //                                                     [Brain above]
  //
  // The brain sits posterior to the command room's back wall, above the
  // connection hallway. The neuro-link pod is at the back wall — the pilot
  // faces forward (toward the window), and the neuro-link is at the back of
  // their head, interfacing with the biological brain behind the wall.
  //
  // The command room is at cranialU = 0.08 (Canvas3D.tsx command room block).
  // The back wall is at cranialZ + roomSide/2. We approximate roomSide as
  // hullRadius * 0.8 (the room fits inside the cranial hull, slightly smaller
  // than the hull diameter). The brain is placed behind the back wall with
  // clearance, in the Neck section (U ≈ 0.18–0.22).
  {
    id: NODE_IDS.BRAIN_CORE,
    name: 'Primary Ganglion Brain Core',
    pipeline: 'NERVOUS',
    role: 'GENERATION',
    anatomicalLayer: 'organs',
    positionFn: (ctx) => {
      const shipLength = ctx.tailPos.z - ctx.headPos.z;
      const cranialU = 0.08; // matches Canvas3D.tsx command room placement
      const cranialZ = ctx.headPos.z + cranialU * shipLength;
      const hullR = ctx.sampleRadiusAtZ(cranialZ);
      // Approximate back wall: cranialZ + roomSide/2
      // roomSide ≈ hullR * 1.4 (maxRoomSide in Canvas3D.tsx), so half = hullR * 0.7
      const backWallZ = cranialZ + hullR * 0.7;
      // Brain sits behind the back wall, above the hallway
      const z = backWallZ + 0.5; // clearance behind back wall
      const r = ctx.sampleRadiusAtZ(z);
      const sy = ctx.sampleSpineYAtZ(z);
      // Dorsal offset: brain is above the hallway (which runs at spine level)
      return [0, sy + r * 0.35, z]; // dorsal, above hallway
    },
    downstreamNodeIds: [NODE_IDS.NEURO_LINK, NODE_IDS.OCULAR_POD],
    telemetry: { efficiencyCoherence: '98.4% Synaptic Coherence' , baseEnergyCost: 80 },
  },
  {
    id: NODE_IDS.NEURO_LINK,
    name: 'Human Neuro-Link Interface Pod',
    pipeline: 'NERVOUS',
    role: 'INTERFACE',
    anatomicalLayer: 'organs',
    positionFn: (ctx) => {
      const shipLength = ctx.tailPos.z - ctx.headPos.z;
      const cranialU = 0.08;
      const cranialZ = ctx.headPos.z + cranialU * shipLength;
      const hullR = ctx.sampleRadiusAtZ(cranialZ);
      // Neuro-link at the back wall of the command room
      // (pilot sits facing the window, neuro-link is at the back of their head)
      const backWallZ = cranialZ + hullR * 0.7;
      const z = backWallZ;
      const r = ctx.sampleRadiusAtZ(z);
      const sy = ctx.sampleSpineYAtZ(z);
      // Slightly above spine — pilot head height when seated
      return [0, sy + r * 0.15, z];
    },
    downstreamNodeIds: [NODE_IDS.AXON_CORD],
    telemetry: { efficiencyCoherence: 'Graphene Fiber Plug' , baseEnergyCost: 30 },
  },
  {
    id: NODE_IDS.AXON_CORD,
    name: 'Spinal Axon Cord Highway',
    pipeline: 'NERVOUS',
    role: 'DISTRIBUTION',
    anatomicalLayer: 'muscular',
    positionFn: (ctx) => {
      const z = ctx.heartPos.z;
      const r = ctx.sampleRadiusAtZ(z);
      const sy = ctx.sampleSpineYAtZ(z);
      return [0, sy + r * 0.15, z]; // just dorsal of spine center
    },
    downstreamNodeIds: [NODE_IDS.MUSCLE_TENDON],
    telemetry: { efficiencyCoherence: '120 m/s Nerve Impulse' , baseEnergyCost: 10 },
  },
  {
    id: NODE_IDS.OCULAR_POD,
    name: 'Ocular Beam Stalk Pods',
    pipeline: 'NERVOUS',
    role: 'EFFECTOR',
    anatomicalLayer: 'exoskeleton',
    positionFn: (ctx) => {
      const z = ctx.headPos.z + 0.7;
      const r = ctx.sampleRadiusAtZ(z);
      const sy = ctx.sampleSpineYAtZ(z);
      return [r * 0.6, sy + r * 0.3, z]; // anterior dorsal flank, on surface
    },
    downstreamNodeIds: [],
    telemetry: { efficiencyCoherence: 'Multispectral Vision' , baseEnergyCost: 20 },
  },
  {
    id: NODE_IDS.MUSCLE_TENDON,
    name: 'Biomechanical Muscle Tendons',
    pipeline: 'NERVOUS',
    role: 'EFFECTOR',
    anatomicalLayer: 'muscular',
    positionFn: (ctx) => {
      const z = ctx.heartPos.z - 1.5;
      const r = ctx.sampleRadiusAtZ(z);
      const sy = ctx.sampleSpineYAtZ(z);
      return [r * 0.4, sy - r * 0.1, z]; // lateral, slightly ventral
    },
    downstreamNodeIds: [],
    telemetry: { efficiencyCoherence: 'FABRIK IK Actuation' , baseEnergyCost: 60 },
  },

  // ── Pipeline 4: Endosymbiotic Life Support & Metabolism (§2.4) ──
  {
    id: NODE_IDS.ICE_GIZZARD,
    name: 'Comet Ice Ingestion Gizzard',
    pipeline: 'LIFE_SUPPORT',
    role: 'GENERATION',
    anatomicalLayer: 'organs',
    positionFn: (ctx) => {
      const z = ctx.headPos.z + 0.5;
      const r = ctx.sampleRadiusAtZ(z);
      const sy = ctx.sampleSpineYAtZ(z);
      return [0, sy - r * 0.35, z]; // ventral mouth interior
    },
    downstreamNodeIds: [NODE_IDS.BIO_MOSS],
    telemetry: { outputRate: '12.5 kg/min Mineral Ore' , baseEnergyCost: 45 },
  },
  {
    id: NODE_IDS.BIO_MOSS,
    name: 'Photosynthetic Bio-Moss Bed',
    pipeline: 'LIFE_SUPPORT',
    role: 'STORAGE',
    anatomicalLayer: 'organs',
    positionFn: (ctx) => {
      const z = ctx.heartPos.z;
      const r = ctx.sampleRadiusAtZ(z);
      const sy = ctx.sampleSpineYAtZ(z);
      return [0, sy, z]; // centered in body
    },
    downstreamNodeIds: [NODE_IDS.HABITAT_CHAMBER],
    telemetry: { outputRate: '420 L/min O₂ Output' , baseEnergyCost: 10 },
  },
  {
    id: NODE_IDS.HABITAT_CHAMBER,
    name: 'Human Habitat Room Chambers',
    pipeline: 'LIFE_SUPPORT',
    role: 'STORAGE',
    anatomicalLayer: 'organs',
    positionFn: (ctx) => {
      const z = ctx.heartPos.z - 1.5;
      const r = ctx.sampleRadiusAtZ(z);
      const sy = ctx.sampleSpineYAtZ(z);
      return [r * 0.3, sy, z]; // lateral interior (thoracic)
    },
    downstreamNodeIds: [NODE_IDS.CYBER_AIRLOCK],
    telemetry: { operatingPressure: '1.0 atm / 12 Crew' , baseEnergyCost: 25 },
  },
  {
    id: NODE_IDS.CYBER_AIRLOCK,
    name: 'Cyber-Airlock Stomata Valves',
    pipeline: 'LIFE_SUPPORT',
    role: 'EFFECTOR',
    anatomicalLayer: 'exoskeleton',
    positionFn: (ctx) => {
      const z = ctx.heartPos.z - 2.0;
      const r = ctx.sampleRadiusAtZ(z);
      const sy = ctx.sampleSpineYAtZ(z);
      return [r * 0.8, sy + r * 0.05, z]; // flank, on surface (thoracic)
    },
    downstreamNodeIds: [],
    telemetry: { operatingPressure: 'Pressure Seal (0-1 atm)' },
  },

  // ── Pipeline 5: Exoskeleton, Armor & Shield Defense (§2.5) ──
  {
    id: NODE_IDS.CHITIN_VERTEBRA,
    name: 'Chitinous Bone Vertebrae Column',
    pipeline: 'ARMOR_DEFENSE',
    role: 'STRUCTURAL',
    anatomicalLayer: 'exoskeleton',
    positionFn: (ctx) => {
      const z = ctx.heartPos.z;
      const r = ctx.sampleRadiusAtZ(z);
      const sy = ctx.sampleSpineYAtZ(z);
      return [0, sy, z]; // on spine center
    },
    downstreamNodeIds: [NODE_IDS.CARAPACE_PLATE],
    telemetry: { outputRate: 'C3 NURBS Structural Load' , baseEnergyCost: 1 },
  },
  {
    id: NODE_IDS.CARAPACE_PLATE,
    name: 'Overlapping Carapace Plates',
    pipeline: 'ARMOR_DEFENSE',
    role: 'DEFENSE',
    anatomicalLayer: 'exoskeleton',
    positionFn: (ctx) => {
      const z = ctx.heartPos.z;
      const r = ctx.sampleRadiusAtZ(z);
      const sy = ctx.sampleSpineYAtZ(z);
      return [0, sy + r * 0.9, z]; // dorsal surface
    },
    downstreamNodeIds: [NODE_IDS.BIO_NANITE_BED],
    telemetry: { outputRate: '85 Gy/hr Gamma Shield' , baseEnergyCost: 5 },
  },
  {
    id: NODE_IDS.BIO_NANITE_BED,
    name: 'Bio-Nanite Coagulation Bed',
    pipeline: 'ARMOR_DEFENSE',
    role: 'REPAIR',
    anatomicalLayer: 'vascular',
    positionFn: (ctx) => {
      const z = ctx.heartPos.z;
      const r = ctx.sampleRadiusAtZ(z);
      const sy = ctx.sampleSpineYAtZ(z);
      return [0, sy - r * 0.3, z]; // sub-dermal, ventral of center
    },
    downstreamNodeIds: [NODE_IDS.SHIELD_EMITTER],
    telemetry: { outputRate: '1.2 m³/s Breach Clotting' , baseEnergyCost: 90 },
  },
  {
    id: NODE_IDS.SHIELD_EMITTER,
    name: 'Repulsion Shield Emitter Nodes',
    pipeline: 'ARMOR_DEFENSE',
    role: 'EFFECTOR',
    anatomicalLayer: 'exoskeleton',
    positionFn: (ctx) => {
      const z = ctx.heartPos.z;
      const r = ctx.sampleRadiusAtZ(z);
      const sy = ctx.sampleSpineYAtZ(z);
      return [r * 0.9, sy, z]; // hull perimeter, on surface
    },
    downstreamNodeIds: [],
    telemetry: { outputRate: '450 MW Kinetic Deflection' , baseEnergyCost: 250 },
  },
];

// ── Connection (conduit) definitions ──

interface ConduitDef {
  id: string;
  pipeline: OrganPipelineType;
  sourceNodeId: string;
  targetNodeId: string;
  conduitRadius: number;
  fluidOrSignalType: string;
}

const CONDUIT_DEFS: ConduitDef[] = [
  // Pipeline 1: Bio-Plasma
  { id: 'c_plasma_1', pipeline: 'BIO_PLASMA', sourceNodeId: NODE_IDS.PLASMA_GLAND, targetNodeId: NODE_IDS.PLASMA_BLADDER, conduitRadius: 0.45, fluidOrSignalType: 'Plasma Feed Duct' },
  { id: 'c_plasma_2', pipeline: 'BIO_PLASMA', sourceNodeId: NODE_IDS.PLASMA_BLADDER, targetNodeId: NODE_IDS.PLASMA_TRUNK, conduitRadius: 0.85, fluidOrSignalType: 'Primary Plasma Trunk' },
  { id: 'c_plasma_3', pipeline: 'BIO_PLASMA', sourceNodeId: NODE_IDS.PLASMA_TRUNK, targetNodeId: NODE_IDS.CAUDAL_MANIFOLD, conduitRadius: 0.6, fluidOrSignalType: 'Plasma Flow' },
  { id: 'c_plasma_4', pipeline: 'BIO_PLASMA', sourceNodeId: NODE_IDS.CAUDAL_MANIFOLD, targetNodeId: NODE_IDS.SIPHON_VENT_NOZZLE, conduitRadius: 0.4, fluidOrSignalType: 'Nozzle Feed' },
  { id: 'c_plasma_5', pipeline: 'BIO_PLASMA', sourceNodeId: NODE_IDS.PLASMA_TRUNK, targetNodeId: NODE_IDS.DISRUPTOR_GLAND, conduitRadius: 0.35, fluidOrSignalType: 'Disruptor Feed' },

  // Pipeline 2: Hemolymph
  { id: 'c_hemo_1', pipeline: 'HEMOLYMPH', sourceNodeId: NODE_IDS.HEART_CORE, targetNodeId: NODE_IDS.HEMOLYMPH_ATRIUM, conduitRadius: 0.35, fluidOrSignalType: 'Systolic Ejection Duct' },
  { id: 'c_hemo_2', pipeline: 'HEMOLYMPH', sourceNodeId: NODE_IDS.HEMOLYMPH_ATRIUM, targetNodeId: NODE_IDS.AORTA_HIGHWAY, conduitRadius: 0.6, fluidOrSignalType: 'Central Aorta Highway' },
  { id: 'c_hemo_3', pipeline: 'HEMOLYMPH', sourceNodeId: NODE_IDS.AORTA_HIGHWAY, targetNodeId: NODE_IDS.FLANK_ARTERY, conduitRadius: 0, fluidOrSignalType: "Murray's Law Branch" }, // radius computed at runtime
  { id: 'c_hemo_4', pipeline: 'HEMOLYMPH', sourceNodeId: NODE_IDS.FLANK_ARTERY, targetNodeId: NODE_IDS.SPIRACLE_VENT, conduitRadius: 0.25, fluidOrSignalType: 'Venous Return' },

  // Pipeline 3: Nervous
  // c_nerv_1: Brain → Neuro-Link (graphene synapse thread)
  // c_nerv_2: REMOVED — the explicit Spinal Axon Cord Highway TubeGeometry mesh
  //   (Canvas3D.tsx) already runs from brain → neuro-link → full spine → tail,
  //   so a duplicate conduit tube from neuro-link to mid-spine was redundant and
  //   produced an unnecessary SDF blend bridge fillet at the axon_cord node.
  // c_nerv_3: Optic nerve connects to the BRAIN (not the spinal cord) — eyes are
  //   cranial organs and optic nerves route directly to the brain per anatomy.
  //   If an eye is placed far from the brain, the nerve-branching system
  //   (nerveBranching.ts) routes it through the nearest cranial ganglion instead.
  // c_nerv_4: Motor nerve from spinal cord to muscles (anatomically correct —
  //   motor nerves originate from the spinal cord, not the brain).
  { id: 'c_nerv_1', pipeline: 'NERVOUS', sourceNodeId: NODE_IDS.BRAIN_CORE, targetNodeId: NODE_IDS.NEURO_LINK, conduitRadius: 0.15, fluidOrSignalType: 'Graphene Synapse Thread' },
  { id: 'c_nerv_3', pipeline: 'NERVOUS', sourceNodeId: NODE_IDS.BRAIN_CORE, targetNodeId: NODE_IDS.OCULAR_POD, conduitRadius: 0.12, fluidOrSignalType: 'Optic Nerve' },
  { id: 'c_nerv_4', pipeline: 'NERVOUS', sourceNodeId: NODE_IDS.AXON_CORD, targetNodeId: NODE_IDS.MUSCLE_TENDON, conduitRadius: 0.1, fluidOrSignalType: 'Motor Nerve' },

  // Pipeline 4: Life Support
  { id: 'c_life_1', pipeline: 'LIFE_SUPPORT', sourceNodeId: NODE_IDS.ICE_GIZZARD, targetNodeId: NODE_IDS.BIO_MOSS, conduitRadius: 0.3, fluidOrSignalType: 'Nutrient Feed Duct' },
  { id: 'c_life_2', pipeline: 'LIFE_SUPPORT', sourceNodeId: NODE_IDS.BIO_MOSS, targetNodeId: NODE_IDS.HABITAT_CHAMBER, conduitRadius: 0.25, fluidOrSignalType: 'Pressurized Air Line' },
  { id: 'c_life_3', pipeline: 'LIFE_SUPPORT', sourceNodeId: NODE_IDS.HABITAT_CHAMBER, targetNodeId: NODE_IDS.CYBER_AIRLOCK, conduitRadius: 0.2, fluidOrSignalType: 'Stomata Exhaust' },

  // Pipeline 5: Armor & Defense
  { id: 'c_armor_1', pipeline: 'ARMOR_DEFENSE', sourceNodeId: NODE_IDS.CHITIN_VERTEBRA, targetNodeId: NODE_IDS.CARAPACE_PLATE, conduitRadius: 0.2, fluidOrSignalType: 'Connective Cartilage' },
  { id: 'c_armor_2', pipeline: 'ARMOR_DEFENSE', sourceNodeId: NODE_IDS.CARAPACE_PLATE, targetNodeId: NODE_IDS.BIO_NANITE_BED, conduitRadius: 0.15, fluidOrSignalType: 'Sub-Dermal Hemolymph Bed' },
  { id: 'c_armor_3', pipeline: 'ARMOR_DEFENSE', sourceNodeId: NODE_IDS.BIO_NANITE_BED, targetNodeId: NODE_IDS.SHIELD_EMITTER, conduitRadius: 0.12, fluidOrSignalType: 'Capacitor Feed' },
];

// ── Murray's Law branching (§3.1) ──
// r_parent³ = r_child₁³ + r_child₂³
// The Central Aorta Highway (r = 0.60m) branches into two Flank Arteries.
// We compute the child radius assuming symmetric bifurcation: r_child = r_parent / 2^(1/3)

export function murraysLawChildRadius(parentRadius: number, numChildren: number = 2): number {
  return parentRadius / Math.cbrt(numChildren);
}

// ── Cubic B-spline (p=3) control point generation (§3.2) ──
// For upstream P_up and downstream P_down, generates intermediate control points:
//   C1 = P_up + 1/3*(P_down - P_up) + n * δ
//   C2 = P_up + 2/3*(P_down - P_up) + n * δ
// where n is the local spine normal and δ is the clearance offset.

export function generateBSplineControlPoints(
  pUp: THREE.Vector3,
  pDown: THREE.Vector3,
  spineNormal: THREE.Vector3,
  clearanceOffset: number = 0.3,
): [number, number, number][] {
  const delta = new THREE.Vector3().subVectors(pDown, pUp);
  const offset = spineNormal.clone().multiplyScalar(clearanceOffset);

  const c1 = new THREE.Vector3().copy(pUp).addScaledVector(delta, 1 / 3).add(offset);
  const c2 = new THREE.Vector3().copy(pUp).addScaledVector(delta, 2 / 3).add(offset);

  return [
    [pUp.x, pUp.y, pUp.z],
    [c1.x, c1.y, c1.z],
    [c2.x, c2.y, c2.z],
    [pDown.x, pDown.y, pDown.z],
  ];
}

// ── Build functions ──

export function buildPipelineNodes(ctx: ShipGeometryContext): OrganPipelineNode[] {
  return NODE_DEFS.map((def) => ({
    id: def.id,
    name: def.name,
    pipeline: def.pipeline,
    role: def.role,
    anatomicalLayer: def.anatomicalLayer,
    position: def.positionFn(ctx),
    downstreamNodeIds: def.downstreamNodeIds,
    telemetry: { ...def.telemetry },
  }));
}

export function buildPipelineConnections(
  nodes: OrganPipelineNode[],
  ctx: ShipGeometryContext,
): OrganConnectionLink[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return CONDUIT_DEFS.map((def) => {
    const source = nodeMap.get(def.sourceNodeId);
    const target = nodeMap.get(def.targetNodeId);
    if (!source || !target) throw new Error(`Conduit ${def.id}: missing node`);

    // Apply Murray's Law to the Aorta → Flank Artery branch
    let radius = def.conduitRadius;
    if (def.id === 'c_hemo_3') {
      const aortaRadius = 0.6; // Central Aorta Highway radius per §2.2
      radius = murraysLawChildRadius(aortaRadius, 2);
    }

    const pUp = new THREE.Vector3(...source.position);
    const pDown = new THREE.Vector3(...target.position);
    const controlPoints = generateBSplineControlPoints(pUp, pDown, ctx.spineNormal);

    return {
      id: def.id,
      pipeline: def.pipeline,
      sourceNodeId: def.sourceNodeId,
      targetNodeId: def.targetNodeId,
      conduitRadius: Math.max(0.08, radius),
      fluidOrSignalType: def.fluidOrSignalType,
      pathControlPoints: controlPoints,
    };
  });
}

// ── Pipeline color mapping (for conduit materials) ──

export const PIPELINE_COLORS: Record<OrganPipelineType, number> = {
  BIO_PLASMA: 0xff6b35,    // orange-red — plasma/thermal
  HEMOLYMPH: 0xf43f5e,     // rose — blood/circulatory
  NERVOUS: 0xa855f7,       // purple — neural/synaptic
  LIFE_SUPPORT: 0x10b981,  // emerald — photosynthetic/oxygen
  ARMOR_DEFENSE: 0x38bdf8, // sky blue — shield/defensive
};

// ── Pipeline display names (for UI toggles) ──

export const PIPELINE_NAMES: Record<OrganPipelineType, string> = {
  BIO_PLASMA: 'Bio-Plasma Propulsion',
  HEMOLYMPH: 'Hemolymph Circulation',
  NERVOUS: 'Nervous Cyber-Synaptic',
  LIFE_SUPPORT: 'Life Support Metabolism',
  ARMOR_DEFENSE: 'Armor & Shield Defense',
};
