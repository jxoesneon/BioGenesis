/**
 * Organ SDF Registry
 *
 * Maps each organ type in the BioGenesis organ pipeline to its SDF composition,
 * implementing the organ type → technique mapping from
 * docs/research/PROCEDURAL_MESH_GENERATION_RESEARCH.md §5.3.
 *
 * This registry is the bridge between the pipeline graph (pipelineGraph.ts)
 * and the SDF-first mesh generation pipeline. Each organ type has:
 *   - An SDF builder function that composes primitives with smooth blending
 *   - A mesh extraction method (marching cubes, surface nets, or dual contouring)
 *   - Default parameters (resolution, blend radius, etc.)
 *
 * Usage:
 *   const def = getOrganSDFDefinition('plasma_bladder', state);
 *   const mesh = sdfToMesh(def.sdf, def.bounds, def.meshOptions);
 */

import * as THREE from 'three';
import {
  SDF, SDFBuilder,
  sdSphere, sdCapsule, sdBox, sdTorus, sdCone, sdCylinder, sdEllipsoid,
  opSmoothUnion, opSmoothSubtraction, opTranslate, opScale, opTwist, opDisplace,
} from './sdf';
import { sdfToMesh } from './marchingCubes';
import { dualContouring } from './dualContouring';
import { fbmDisplacement, warpedFbmDisplacement, worleyDisplacement } from './noise';
import { NODE_IDS } from './pipelineGraph';
import { AppState } from '../types';

// ── Organ SDF Definition ──

export interface OrganSDFDefinition {
  /** The composed SDF function. */
  sdf: SDF;
  /** Bounding box for mesh extraction. */
  bounds: THREE.Box3;
  /** Mesh extraction options. */
  meshOptions: {
    resolution: number;
    method: 'marching-cubes' | 'surface-nets' | 'dual-contouring';
  };
  /** Display name for the organ. */
  name: string;
  /** Organ category for material assignment. */
  category: 'storage' | 'generation' | 'distribution' | 'effector' | 'structural' | 'defense';
}

// ── Organ SDF Builders ──

/**
 * Build a plasma bladder SDF — a smooth organic storage mass
 * with internal cavity subtraction.
 *
 * Technique: Metaball SDF + smin blending - cavity sphere
 */
function buildPlasmaBladderSDF(center: THREE.Vector3, radius: number, state: AppState): OrganSDFDefinition {
  const builder = new SDFBuilder()
    .add(sdEllipsoid(new THREE.Vector3(radius, radius * 0.8, radius * 1.2)))
    .smoothUnion(sdSphere(radius * 0.6), 0.3 * radius)
    .smoothSubtract(sdSphere(radius * 0.4), 0.15 * radius)
    .translate(center)
    .displace(warpedFbmDisplacement(2.0 / radius, 0.05 * radius, 0.3 * radius));

  const sdf = builder.build();
  const bounds = new THREE.Box3(
    center.clone().subScalar(radius * 1.5),
    center.clone().addScalar(radius * 1.5),
  );

  return {
    sdf,
    bounds,
    meshOptions: { resolution: 32, method: 'marching-cubes' },
    name: 'Muscular Plasma Bladder',
    category: 'storage',
  };
}

/**
 * Build a hemolymph atrium SDF — a pulsating organic chamber.
 *
 * Technique: Ellipsoid SDF + smin + noise displacement
 */
function buildHemolymphAtriumSDF(center: THREE.Vector3, radius: number, state: AppState): OrganSDFDefinition {
  const builder = new SDFBuilder()
    .add(sdEllipsoid(new THREE.Vector3(radius, radius * 1.1, radius * 0.9)))
    .smoothUnion(sdSphere(radius * 0.5), 0.2 * radius)
    .translate(center)
    .displace(fbmDisplacement(3.0 / radius, 0.03 * radius, 5));

  const sdf = builder.build();
  const bounds = new THREE.Box3(
    center.clone().subScalar(radius * 1.5),
    center.clone().addScalar(radius * 1.5),
  );

  return {
    sdf,
    bounds,
    meshOptions: { resolution: 32, method: 'marching-cubes' },
    name: 'Hemolymph Atrium',
    category: 'storage',
  };
}

/**
 * Build a heart core SDF — a muscular pumping organ with four chambers.
 *
 * Technique: Multi-lobe SDF with smooth blending
 */
function buildHeartCoreSDF(center: THREE.Vector3, radius: number, state: AppState): OrganSDFDefinition {
  const builder = new SDFBuilder()
    .add(sdEllipsoid(new THREE.Vector3(radius, radius * 0.7, radius * 0.8)))
    .smoothUnion(sdSphere(radius * 0.5), 0.25 * radius)
    .smoothUnion(
      opTranslate(sdSphere(radius * 0.4), new THREE.Vector3(radius * 0.3, -radius * 0.2, 0)),
      0.2 * radius,
    )
    .translate(center)
    .displace(fbmDisplacement(4.0 / radius, 0.02 * radius, 4));

  const sdf = builder.build();
  const bounds = new THREE.Box3(
    center.clone().subScalar(radius * 1.5),
    center.clone().addScalar(radius * 1.5),
  );

  return {
    sdf,
    bounds,
    meshOptions: { resolution: 36, method: 'marching-cubes' },
    name: 'Heart Core',
    category: 'generation',
  };
}

/**
 * Build a brain core SDF — a folded neural mass.
 *
 * Technique: Sphere SDF + high-frequency noise displacement (cortical folds)
 */
function buildBrainCoreSDF(center: THREE.Vector3, radius: number, state: AppState): OrganSDFDefinition {
  const builder = new SDFBuilder()
    .add(sdEllipsoid(new THREE.Vector3(radius, radius * 0.8, radius * 0.9)))
    .smoothUnion(sdSphere(radius * 0.6), 0.15 * radius)
    .translate(center)
    .displace(fbmDisplacement(8.0 / radius, 0.06 * radius, 6));

  const sdf = builder.build();
  const bounds = new THREE.Box3(
    center.clone().subScalar(radius * 1.3),
    center.clone().addScalar(radius * 1.3),
  );

  return {
    sdf,
    bounds,
    meshOptions: { resolution: 40, method: 'marching-cubes' },
    name: 'Brain Core',
    category: 'generation',
  };
}

/**
 * Build a plasma gland SDF — an electrolysis generation organ.
 *
 * Technique: Cone + sphere blend for glandular shape
 */
function buildPlasmaGlandSDF(center: THREE.Vector3, radius: number, state: AppState): OrganSDFDefinition {
  const builder = new SDFBuilder()
    .add(sdCone(radius * 0.6, radius * 1.2))
    .smoothUnion(sdSphere(radius * 0.5), 0.2 * radius)
    .translate(center)
    .displace(worleyDisplacement(3.0 / radius, 0.04 * radius, 2.0));

  const sdf = builder.build();
  const bounds = new THREE.Box3(
    center.clone().subScalar(radius * 1.5),
    center.clone().addScalar(radius * 1.5),
  );

  return {
    sdf,
    bounds,
    meshOptions: { resolution: 32, method: 'marching-cubes' },
    name: 'Bio-Plasma Electrolysis Gland',
    category: 'generation',
  };
}

/**
 * Build a disruptor gland SDF — a crystalline weapon organ.
 *
 * Technique: Dual contouring for sharp crystalline features
 */
function buildDisruptorGlandSDF(center: THREE.Vector3, radius: number, state: AppState): OrganSDFDefinition {
  const builder = new SDFBuilder()
    .add(sdCone(radius * 0.5, radius * 1.5))
    .smoothUnion(sdBox(new THREE.Vector3(radius * 0.3, radius * 0.3, radius * 0.3)), 0.1 * radius)
    .translate(center)
    .twist(0.5 / radius);

  const sdf = builder.build();
  const bounds = new THREE.Box3(
    center.clone().subScalar(radius * 1.8),
    center.clone().addScalar(radius * 1.8),
  );

  return {
    sdf,
    bounds,
    meshOptions: { resolution: 32, method: 'dual-contouring' },
    name: 'Bio-Plasma Disruptor Gland',
    category: 'effector',
  };
}

/**
 * Build a chitin vertebra SDF — a structural armor segment.
 *
 * Technique: Box + torus for vertebra shape, dual contouring for sharp edges
 */
function buildChitinVertebraSDF(center: THREE.Vector3, radius: number, state: AppState): OrganSDFDefinition {
  const builder = new SDFBuilder()
    .add(sdBox(new THREE.Vector3(radius * 0.8, radius * 0.3, radius * 0.8)))
    .smoothUnion(sdTorus(radius * 0.6, radius * 0.15), 0.05 * radius)
    .translate(center);

  const sdf = builder.build();
  const bounds = new THREE.Box3(
    center.clone().subScalar(radius * 1.2),
    center.clone().addScalar(radius * 1.2),
  );

  return {
    sdf,
    bounds,
    meshOptions: { resolution: 24, method: 'dual-contouring' },
    name: 'Chitin Vertebra',
    category: 'structural',
  };
}

/**
 * Build a carapace plate SDF — a flat armor plate.
 *
 * Technique: Thin box with slight curvature, dual contouring for edges
 */
function buildCarapacePlateSDF(center: THREE.Vector3, radius: number, state: AppState): OrganSDFDefinition {
  const builder = new SDFBuilder()
    .add(sdBox(new THREE.Vector3(radius, radius * 0.15, radius * 0.8)))
    .translate(center)
    .displace(fbmDisplacement(2.0 / radius, 0.02 * radius, 4));

  const sdf = builder.build();
  const bounds = new THREE.Box3(
    center.clone().sub(new THREE.Vector3(radius * 1.2, radius * 0.5, radius)),
    center.clone().add(new THREE.Vector3(radius * 1.2, radius * 0.5, radius)),
  );

  return {
    sdf,
    bounds,
    meshOptions: { resolution: 24, method: 'dual-contouring' },
    name: 'Carapace Plate',
    category: 'defense',
  };
}

/**
 * Build a bio-nanite bed SDF — a repair organ with porous structure.
 *
 * Technique: Sphere with Worley noise displacement for porous surface
 */
function buildBioNaniteBedSDF(center: THREE.Vector3, radius: number, state: AppState): OrganSDFDefinition {
  const builder = new SDFBuilder()
    .add(sdSphere(radius))
    .smoothSubtract(sdSphere(radius * 0.3), 0.1 * radius)
    .translate(center)
    .displace(worleyDisplacement(4.0 / radius, 0.08 * radius, 3.0));

  const sdf = builder.build();
  const bounds = new THREE.Box3(
    center.clone().subScalar(radius * 1.3),
    center.clone().addScalar(radius * 1.3),
  );

  return {
    sdf,
    bounds,
    meshOptions: { resolution: 32, method: 'marching-cubes' },
    name: 'Bio-Nanite Bed',
    category: 'defense',
  };
}

/**
 * Build a shield emitter SDF — a crystalline defense organ.
 *
 * Technique: Octahedron-like shape via box intersection, dual contouring
 */
function buildShieldEmitterSDF(center: THREE.Vector3, radius: number, state: AppState): OrganSDFDefinition {
  const r = radius;
  const builder = new SDFBuilder()
    .add((p: THREE.Vector3) => {
      // Octahedron SDF: |x|+|y|+|z| - r
      return Math.abs(p.x) + Math.abs(p.y) + Math.abs(p.z) - r;
    })
    .translate(center);

  const sdf = builder.build();
  const bounds = new THREE.Box3(
    center.clone().subScalar(radius * 1.3),
    center.clone().addScalar(radius * 1.3),
  );

  return {
    sdf,
    bounds,
    meshOptions: { resolution: 24, method: 'dual-contouring' },
    name: 'Shield Emitter',
    category: 'defense',
  };
}

/**
 * Build an ice gizzard SDF — a metabolic organ with crystalline structure.
 */
function buildIceGizzardSDF(center: THREE.Vector3, radius: number, state: AppState): OrganSDFDefinition {
  const builder = new SDFBuilder()
    .add(sdEllipsoid(new THREE.Vector3(radius, radius * 0.9, radius * 1.1)))
    .smoothUnion(sdSphere(radius * 0.4), 0.15 * radius)
    .translate(center)
    .displace(worleyDisplacement(5.0 / radius, 0.05 * radius, 2.5));

  const sdf = builder.build();
  const bounds = new THREE.Box3(
    center.clone().subScalar(radius * 1.3),
    center.clone().addScalar(radius * 1.3),
  );

  return {
    sdf,
    bounds,
    meshOptions: { resolution: 32, method: 'marching-cubes' },
    name: 'Ice Gizzard',
    category: 'generation',
  };
}

/**
 * Build a bio-moss SDF — a photosynthetic organ with organic surface.
 */
function buildBioMossSDF(center: THREE.Vector3, radius: number, state: AppState): OrganSDFDefinition {
  const builder = new SDFBuilder()
    .add(sdSphere(radius))
    .translate(center)
    .displace(warpedFbmDisplacement(6.0 / radius, 0.1 * radius, 0.4 * radius));

  const sdf = builder.build();
  const bounds = new THREE.Box3(
    center.clone().subScalar(radius * 1.4),
    center.clone().addScalar(radius * 1.4),
  );

  return {
    sdf,
    bounds,
    meshOptions: { resolution: 32, method: 'marching-cubes' },
    name: 'Bio-Moss',
    category: 'generation',
  };
}

/**
 * Build a habitat chamber SDF — a large spherical living space.
 */
function buildHabitatChamberSDF(center: THREE.Vector3, radius: number, state: AppState): OrganSDFDefinition {
  const builder = new SDFBuilder()
    .add(sdSphere(radius))
    .smoothSubtract(sdSphere(radius * 0.85), 0.05 * radius)
    .translate(center)
    .displace(fbmDisplacement(1.5 / radius, 0.02 * radius, 4));

  const sdf = builder.build();
  const bounds = new THREE.Box3(
    center.clone().subScalar(radius * 1.2),
    center.clone().addScalar(radius * 1.2),
  );

  return {
    sdf,
    bounds,
    meshOptions: { resolution: 28, method: 'marching-cubes' },
    name: 'Habitat Chamber',
    category: 'storage',
  };
}

/**
 * Build a siphon vent nozzle SDF — a thrust effector.
 */
function buildSiphonVentSDF(center: THREE.Vector3, radius: number, state: AppState): OrganSDFDefinition {
  const builder = new SDFBuilder()
    .add(sdCone(radius * 0.4, radius * 1.5))
    .smoothUnion(sdCylinder(radius * 0.3, radius * 0.3), 0.1 * radius)
    .translate(center);

  const sdf = builder.build();
  const bounds = new THREE.Box3(
    center.clone().subScalar(radius * 1.8),
    center.clone().addScalar(radius * 1.8),
  );

  return {
    sdf,
    bounds,
    meshOptions: { resolution: 28, method: 'dual-contouring' },
    name: 'Siphon Vent Nozzle',
    category: 'effector',
  };
}

/**
 * Build an ocular pod SDF — a sensory organ.
 */
function buildOcularPodSDF(center: THREE.Vector3, radius: number, state: AppState): OrganSDFDefinition {
  const builder = new SDFBuilder()
    .add(sdSphere(radius))
    .smoothUnion(sdCapsule(radius * 0.2, radius * 0.3), 0.15 * radius)
    .translate(center);

  const sdf = builder.build();
  const bounds = new THREE.Box3(
    center.clone().subScalar(radius * 1.3),
    center.clone().addScalar(radius * 1.3),
  );

  return {
    sdf,
    bounds,
    meshOptions: { resolution: 28, method: 'marching-cubes' },
    name: 'Ocular Pod',
    category: 'effector',
  };
}

// ── Registry ──

type OrganSDFBuilder = (center: THREE.Vector3, radius: number, state: AppState) => OrganSDFDefinition;

/**
 * Registry mapping organ node IDs to their SDF builder functions.
 * This implements the organ type → technique mapping from the research document.
 */
const ORGAN_SDF_REGISTRY: Record<string, OrganSDFBuilder> = {
  // Bio-Plasma pipeline
  [NODE_IDS.PLASMA_GLAND]: buildPlasmaGlandSDF,
  [NODE_IDS.PLASMA_BLADDER]: buildPlasmaBladderSDF,
  [NODE_IDS.SIPHON_VENT_NOZZLE]: buildSiphonVentSDF,
  [NODE_IDS.DISRUPTOR_GLAND]: buildDisruptorGlandSDF,
  // Hemolymph pipeline
  [NODE_IDS.HEART_CORE]: buildHeartCoreSDF,
  [NODE_IDS.HEMOLYMPH_ATRIUM]: buildHemolymphAtriumSDF,
  // Nervous pipeline
  [NODE_IDS.BRAIN_CORE]: buildBrainCoreSDF,
  [NODE_IDS.OCULAR_POD]: buildOcularPodSDF,
  // Life Support pipeline
  [NODE_IDS.ICE_GIZZARD]: buildIceGizzardSDF,
  [NODE_IDS.BIO_MOSS]: buildBioMossSDF,
  [NODE_IDS.HABITAT_CHAMBER]: buildHabitatChamberSDF,
  // Armor & Defense pipeline
  [NODE_IDS.CHITIN_VERTEBRA]: buildChitinVertebraSDF,
  [NODE_IDS.CARAPACE_PLATE]: buildCarapacePlateSDF,
  [NODE_IDS.BIO_NANITE_BED]: buildBioNaniteBedSDF,
  [NODE_IDS.SHIELD_EMITTER]: buildShieldEmitterSDF,
};

/**
 * Get the SDF definition for an organ type.
 *
 * @param nodeId The organ node ID (from NODE_IDS).
 * @param center Center position for the organ.
 * @param radius Base radius for the organ.
 * @param state Application state (for parameter access).
 * @returns Organ SDF definition, or null if the organ type is not registered.
 */
export function getOrganSDFDefinition(
  nodeId: string,
  center: THREE.Vector3,
  radius: number,
  state: AppState,
): OrganSDFDefinition | null {
  const builder = ORGAN_SDF_REGISTRY[nodeId];
  if (!builder) return null;
  return builder(center, radius, state);
}

/**
 * Generate a mesh for an organ from its SDF definition.
 *
 * @param def The organ SDF definition.
 * @returns THREE.BufferGeometry of the organ mesh.
 */
export function generateOrganMesh(def: OrganSDFDefinition): THREE.BufferGeometry {
  if (def.meshOptions.method === 'dual-contouring') {
    return dualContouring(def.sdf, def.bounds, def.meshOptions.resolution);
  }
  // For marching-cubes and surface-nets, use sdfToMesh with compatible options
  const { resolution, method } = def.meshOptions;
  return sdfToMesh(def.sdf, def.bounds, { resolution, method: method as 'marching-cubes' | 'surface-nets' });
}

/**
 * List all registered organ types.
 */
export function getRegisteredOrganTypes(): string[] {
  return Object.keys(ORGAN_SDF_REGISTRY);
}

/**
 * Check if an organ type has an SDF definition registered.
 */
export function hasOrganSDFDefinition(nodeId: string): boolean {
  return nodeId in ORGAN_SDF_REGISTRY;
}
