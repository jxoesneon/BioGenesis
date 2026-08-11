/**
 * Procedural Mesh Generation Pipeline
 *
 * Unified entry point for the SDF-first organ generation pipeline,
 * integrating all the research-recommended techniques from
 * docs/research/PROCEDURAL_MESH_GENERATION_RESEARCH.md.
 *
 * This module provides high-level functions that compose the individual
 * technique modules (SDF, marching cubes, tube geometry, L-systems,
 * subdivision, reaction-diffusion, ARAP) into a complete generation pipeline.
 *
 * Pipeline stages:
 *   1. SDF composition — build organ SDFs from primitives + smooth blending
 *   2. Mesh extraction — marching cubes or dual contouring from SDF
 *   3. Post-processing — Taubin smoothing, subdivision (optional)
 *   4. Texture generation — reaction-diffusion bioluminescent patterns
 *   5. Deformation — ARAP for genetics-driven mutation
 */

import * as THREE from 'three';
import { AppState } from '../types';
import { reseedNoise } from './noise';
import {
  getOrganSDFDefinition,
  generateOrganMesh,
  OrganSDFDefinition,
} from './organSDFRegistry';
import { buildOrganicTube, buildTentacle, buildBranchingTubeNetwork, RadiusFunction } from './tubeGeometry';
import {
  generateVascularNetwork,
  colonizationToSegments,
  segmentsToTubeGeometries,
} from './lsystem';
import { generateOrganicMass } from './metaballs';
import { catmullClarkSubdivide, taubinSmooth, SubdivisionOptions } from './subdivision';
import { generateBioluminescentPattern } from './reactionDiffusion';
import { arapDeform, laplacianDeform, ARAPConstraint } from './arap';
import { NODE_IDS } from './pipelineGraph';

// ── Pipeline Configuration ──

export interface PipelineConfig {
  /** Whether to use SDF-based organ generation (vs. legacy parametric). */
  useSDFGeneration: boolean;
  /** Whether to apply Taubin smoothing after mesh extraction. */
  enableSmoothing: boolean;
  /** Whether to apply Catmull-Clark subdivision to the hull. */
  enableSubdivision: boolean;
  /** Whether to generate bioluminescent textures via reaction-diffusion. */
  enableBioluminescentTextures: boolean;
  /** Whether to use Bishop frame for tube-based organs. */
  useBishopFrame: boolean;
  /** Whether to use space colonization for vascular networks. */
  useSpaceColonization: boolean;
  /** Mesh resolution for SDF-based organs. */
  sdfResolution: number;
  /** Smoothing iterations for Taubin filter. */
  smoothingIterations: number;
  /** Subdivision iterations for hull. */
  subdivisionIterations: number;
  /** Reaction-diffusion pattern preset. */
  bioluminescentPreset: string;
}

/**
 * Default pipeline configuration.
 */
export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  useSDFGeneration: true,
  enableSmoothing: true,
  enableSubdivision: false,
  enableBioluminescentTextures: true,
  useBishopFrame: true,
  useSpaceColonization: true,
  sdfResolution: 32,
  smoothingIterations: 5,
  subdivisionIterations: 2,
  bioluminescentPreset: 'void_fauna_maze',
};

// ── Organ Generation ──

export interface GeneratedOrgan {
  geometry: THREE.BufferGeometry;
  name: string;
  category: string;
  nodeId: string;
  position: THREE.Vector3;
}

/**
 * Generate an organ mesh using the SDF-first pipeline.
 *
 * @param nodeId Organ node ID (from NODE_IDS).
 * @param center Center position.
 * @param radius Base radius.
 * @param state Application state.
 * @param config Pipeline configuration.
 * @returns Generated organ, or null if the type is not registered.
 */
export function generateOrgan(
  nodeId: string,
  center: THREE.Vector3,
  radius: number,
  state: AppState,
  config: PipelineConfig = DEFAULT_PIPELINE_CONFIG,
): GeneratedOrgan | null {
  const def = getOrganSDFDefinition(nodeId, center, radius, state);
  if (!def) return null;

  let geometry = generateOrganMesh(def);

  // Post-processing: Taubin smoothing for organic surfaces
  if (config.enableSmoothing && def.meshOptions.method === 'marching-cubes') {
    geometry = taubinSmooth(geometry, 0.5, -0.53, config.smoothingIterations);
  }

  return {
    geometry,
    name: def.name,
    category: def.category,
    nodeId,
    position: center.clone(),
  };
}

// ── Vascular Network Generation ──

export interface GeneratedVascularNetwork {
  geometries: THREE.BufferGeometry[];
  rootPosition: THREE.Vector3;
}

/**
 * Generate a vascular network using space colonization.
 *
 * @param rootPosition Starting position (e.g., heart).
 * @param targetVolume Bounding box of the volume to fill.
 * @param config Pipeline configuration.
 * @returns Array of tube geometries for the vascular branches.
 */
export function generateVascularNetworkMesh(
  rootPosition: THREE.Vector3,
  targetVolume: THREE.Box3,
  config: PipelineConfig = DEFAULT_PIPELINE_CONFIG,
): GeneratedVascularNetwork {
  const tree = generateVascularNetwork(rootPosition, targetVolume, {
    pointCount: 150,
    influenceRadius: targetVolume.getSize(new THREE.Vector3()).length() * 0.15,
    killDistance: targetVolume.getSize(new THREE.Vector3()).length() * 0.03,
    segmentLength: targetVolume.getSize(new THREE.Vector3()).length() * 0.02,
    seed: 42,
  });

  const segments = colonizationToSegments(tree);
  const geometries = segmentsToTubeGeometries(segments, 8);

  return { geometries, rootPosition: rootPosition.clone() };
}

// ── Tentacle Generation ──

/**
 * Generate a tentacle mesh.
 *
 * @param basePosition Root position.
 * @param direction Growth direction.
 * @param length Tentacle length.
 * @param baseRadius Base radius.
 * @param curlAmount Curl intensity (0 = straight, 1 = highly curled).
 * @returns Tentacle geometry.
 */
export function generateTentacle(
  basePosition: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  baseRadius: number,
  curlAmount: number = 0.5,
): THREE.BufferGeometry {
  return buildTentacle(basePosition, direction, length, baseRadius, {
    segments: 48,
    radialSegments: 12,
    curlAmount,
    curlFrequency: 2.0,
    taperEnd: 0.1,
    noiseAmplitude: 0.02,
  });
}

// ── Conduit Tube Generation ──

/**
 * Generate a conduit tube between two points using the Bishop frame.
 *
 * @param start Start position.
 * @param end End position.
 * @param radius Tube radius.
 * @param options Generation options.
 * @returns Tube geometry.
 */
export function generateConduitTube(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  options: {
    tubularSegments?: number;
    radialSegments?: number;
    radiusFunction?: RadiusFunction;
  } = {},
): THREE.BufferGeometry {
  // Create control points with a slight curve for organic look
  const mid = start.clone().lerp(end, 0.5);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const perp = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
  if (perp.lengthSq() < 0.01) perp.set(1, 0, 0);
  mid.add(perp.multiplyScalar(length * 0.05));

  const controlPoints = [start, mid, end];
  return buildOrganicTube(controlPoints, {
    tubularSegments: options.tubularSegments ?? 32,
    radialSegments: options.radialSegments ?? 12,
    radius: options.radiusFunction ? undefined : radius,
    radiusFunction: options.radiusFunction,
    capped: false,
  });
}

// ── Bioluminescent Texture Generation ──

export interface BioluminescentTextures {
  diffuse: THREE.DataTexture;
  emissive: THREE.DataTexture;
}

/**
 * Generate bioluminescent pattern textures for the hull.
 *
 * @param config Pipeline configuration.
 * @param glowColor Bioluminescent glow color.
 * @param baseColor Base hull color.
 * @returns Diffuse and emissive textures.
 */
export function generateBioluminescentTextures(
  config: PipelineConfig = DEFAULT_PIPELINE_CONFIG,
  glowColor?: THREE.Color,
  baseColor?: THREE.Color,
): BioluminescentTextures {
  const { diffuse, emissive } = generateBioluminescentPattern(
    256,
    256,
    config.bioluminescentPreset,
    {
      glowColor,
      baseColor,
      steps: 3000,
      seedPoints: 15,
      seed: 42,
      intensity: 2.0,
    },
  );
  return { diffuse, emissive };
}

// ── Hull Subdivision ──

/**
 * Apply Catmull-Clark subdivision to the hull mesh for smoother surfaces.
 *
 * @param hullGeometry Original hull geometry.
 * @param config Pipeline configuration.
 * @returns Subdivided hull geometry.
 */
export function subdivideHull(
  hullGeometry: THREE.BufferGeometry,
  config: PipelineConfig = DEFAULT_PIPELINE_CONFIG,
): THREE.BufferGeometry {
  if (!config.enableSubdivision) return hullGeometry;
  return catmullClarkSubdivide(hullGeometry, {
    iterations: config.subdivisionIterations,
    detectCreases: true,
    creaseAngleThreshold: 30 * Math.PI / 180,
    creaseSharpness: 2.0,
  });
}

// ── Organ Deformation (Mutation) ──

/**
 * Deform an organ mesh using ARAP, preserving local detail.
 *
 * @param geometry Original organ geometry.
 * @param constraints Handle constraints (vertices to move/pin).
 * @param options Deformation options.
 * @returns Deformed geometry.
 */
export function deformOrgan(
  geometry: THREE.BufferGeometry,
  constraints: ARAPConstraint[],
  options: {
    useFullARAP?: boolean;
    iterations?: number;
  } = {},
): THREE.BufferGeometry {
  if (options.useFullARAP ?? false) {
    return arapDeform(geometry, constraints, { iterations: options.iterations ?? 5 });
  }
  return laplacianDeform(geometry, constraints, options.iterations ?? 20);
}

// ── Pipeline Initialization ──

/**
 * Initialize the procedural mesh generation pipeline.
 * Seeds the noise functions with the ship's seed for deterministic output.
 *
 * @param state Application state.
 * @param config Pipeline configuration.
 */
export function initPipeline(state: AppState, config: PipelineConfig = DEFAULT_PIPELINE_CONFIG): void {
  reseedNoise(state.seed);
}

// ── Organic Mass Generation ──

/**
 * Generate an organic mass (e.g., for blobby organs not in the registry).
 *
 * @param center Center of the mass.
 * @param baseRadius Overall radius.
 * @param blobCount Number of metaballs.
 * @param options Generation options.
 * @returns Organic mass geometry.
 */
export function generateOrganicMassMesh(
  center: THREE.Vector3,
  baseRadius: number,
  blobCount: number = 5,
  options: {
    resolution?: number;
    irregularity?: number;
    seed?: number;
  } = {},
): THREE.BufferGeometry {
  return generateOrganicMass(center, baseRadius, blobCount, options);
}

// ── Utility: Merge Geometries ──

/**
 * Merge an array of geometries into a single geometry.
 * Useful for combining vascular network branches into one mesh.
 *
 * @param geometries Array of geometries to merge.
 * @returns Merged geometry.
 */
export function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  for (const geo of geometries) {
    const posAttr = geo.getAttribute('position');
    const normAttr = geo.getAttribute('normal');
    const indexAttr = geo.getIndex();

    for (let i = 0; i < posAttr.count; i++) {
      positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      if (normAttr) {
        normals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
      }
    }

    if (indexAttr) {
      for (let i = 0; i < indexAttr.count; i++) {
        indices.push(indexAttr.getX(i) + vertexOffset);
      }
    } else {
      for (let i = 0; i < posAttr.count; i++) {
        indices.push(i + vertexOffset);
      }
    }

    vertexOffset += posAttr.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length > 0) {
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  }
  merged.setIndex(indices);
  if (normals.length === 0) {
    merged.computeVertexNormals();
  }
  return merged;
}
