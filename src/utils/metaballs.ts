/**
 * Metaballs & Implicit Surface Module
 *
 * Implements metaball field functions for organic blobby masses, as recommended
 * in docs/research/PROCEDURAL_MESH_GENERATION_RESEARCH.md §4.1.
 *
 * Metaballs are ideal for blobby organic masses like plasma bladders,
 * hemolymph atria, and other fluid-filled organs that need smooth
 * blending between adjacent blobs.
 *
 * Three field functions are supported:
 *   - Blobby (Blinn 1982): a·e^(-br²) — Gaussian falloff
 *   - Meta Balls: piecewise polynomial — fast, common in 3D software
 *   - Soft Objects (Wyvill 1996): smooth cubic — no singularities
 *
 * References:
 *   - Blinn: "A Generalization of Algebraic Surface Drawing" (1982)
 *   - Wyvill et al.: "Soft Objects" (1996)
 *   - Inigo Quilez: "metaballs" — iquilezles.org
 */

import * as THREE from 'three';
import { SDF } from './sdf';
import { sdfToMesh } from './marchingCubes';

// ── Metaball Definition ──

export interface Metaball {
  /** Center position of the metaball. */
  center: THREE.Vector3;
  /** Radius of influence. */
  radius: number;
  /** Strength multiplier (controls how much this ball contributes). */
  strength: number;
  /** Field function type. */
  fieldFunction?: 'blobby' | 'meta' | 'soft';
}

// ── Field Functions ──

/**
 * Blobby (Blinn) field function: a·e^(-br²)
 * Gaussian falloff — smooth, but never reaches exactly zero.
 */
function blobbyField(r: number, radius: number, strength: number): number {
  const normalizedR = r / radius;
  return strength * Math.exp(-normalizedR * normalizedR * 2.0);
}

/**
 * Meta Balls field function: piecewise polynomial.
 * Fast and commonly used in 3D modeling software.
 */
function metaField(r: number, radius: number, strength: number): number {
  const t = r / radius;
  if (t >= 1) return 0;
  if (t < 1 / 3) return strength * (3 * t * t - 3 * t + 1);
  return strength * (3 * (1 - t) * (1 - t) - 3 * (1 - t) + 1) * 0.5;
}

/**
 * Soft Objects (Wyvill) field function: smooth cubic.
 * No singularities, smooth derivative everywhere.
 */
function softField(r: number, radius: number, strength: number): number {
  const t = r / radius;
  if (t >= 1) return 0;
  const t2 = t * t;
  const t4 = t2 * t2;
  const t6 = t4 * t2;
  return strength * (1 - (4 / 9) * t6 + (17 / 9) * t4 - (22 / 9) * t2);
}

// ── Metaball Field Evaluation ──

/**
 * Evaluate the total metaball field at a point.
 * The field is the sum of all individual metaball contributions.
 *
 * @param balls Array of metaballs.
 * @param point The query point.
 * @param threshold Isosurface threshold (default 1.0).
 * @returns Field value at the point. Surface is where value = threshold.
 */
export function evaluateMetaballField(
  balls: Metaball[],
  point: THREE.Vector3,
): number {
  let total = 0;
  for (const ball of balls) {
    const r = point.distanceTo(ball.center);
    const fn = ball.fieldFunction ?? 'soft';
    const fieldFn = fn === 'blobby' ? blobbyField : fn === 'meta' ? metaField : softField;
    total += fieldFn(r, ball.radius, ball.strength);
  }
  return total;
}

/**
 * Convert a metaball field to an SDF-compatible function.
 * The SDF is approximated as (threshold - fieldValue) so that the
 * isosurface at value=threshold corresponds to SDF=0.
 *
 * This is a pseudo-SDF (not exact distance), but works with marching cubes.
 *
 * @param balls Array of metaballs.
 * @param threshold Isosurface threshold (default 1.0).
 * @returns SDF function for use with marching cubes.
 */
export function metaballsToSDF(
  balls: Metaball[],
  threshold: number = 1.0,
): SDF {
  return (p: THREE.Vector3) => threshold - evaluateMetaballField(balls, p);
}

// ── Metaball Mesh Generation ──

/**
 * Generate a triangle mesh from a set of metaballs.
 *
 * Samples the metaball field on a regular grid and extracts the isosurface
 * via marching cubes.
 *
 * @param balls Array of metaballs.
 * @param options Generation options.
 * @returns THREE.BufferGeometry with the metaball surface.
 *
 * @example
 * const mesh = generateMetaballMesh([
 *   { center: new THREE.Vector3(0, 0, 0), radius: 1.0, strength: 1.0 },
 *   { center: new THREE.Vector3(1, 0, 0), radius: 0.8, strength: 1.0 },
 * ], { resolution: 32, threshold: 1.0 });
 */
export function generateMetaballMesh(
  balls: Metaball[],
  options: {
    /** Grid resolution for marching cubes. */
    resolution?: number;
    /** Isosurface threshold. */
    threshold?: number;
    /** Padding around the metaball bounds (in radii units). */
    padding?: number;
  } = {},
): THREE.BufferGeometry {
  const resolution = options.resolution ?? 32;
  const threshold = options.threshold ?? 1.0;
  const padding = options.padding ?? 1.5;

  // Compute bounding box from all metaballs
  const box = new THREE.Box3();
  for (const ball of balls) {
    box.expandByPoint(ball.center);
  }
  // Expand by max radius + padding
  let maxRadius = 0;
  for (const ball of balls) {
    maxRadius = Math.max(maxRadius, ball.radius);
  }
  box.expandByScalar(maxRadius * padding);

  const sdf = metaballsToSDF(balls, threshold);
  return sdfToMesh(sdf, box, { resolution, method: 'marching-cubes' });
}

// ── Animated Metaballs ──

/**
 * Update metaball positions for animation.
 * Each ball can have a velocity and optional orbital motion.
 */
export interface AnimatedMetaball extends Metaball {
  velocity: THREE.Vector3;
  /** Optional orbital center for circular motion. */
  orbitCenter?: THREE.Vector3;
  /** Orbital speed (radians per second). */
  orbitSpeed?: number;
  /** Orbital radius. */
  orbitRadius?: number;
}

/**
 * Step animated metaballs forward in time.
 * Updates positions based on velocity and orbital parameters.
 * Balls bounce within the given bounds.
 *
 * @param balls Array of animated metaballs (mutated in place).
 * @param dt Time step in seconds.
 * @param bounds Bounding box for bouncing.
 */
export function stepAnimatedMetaballs(
  balls: AnimatedMetaball[],
  dt: number,
  bounds: THREE.Box3,
): void {
  for (const ball of balls) {
    if (ball.orbitCenter && ball.orbitSpeed && ball.orbitRadius) {
      // Orbital motion
      const angle = performance.now() * 0.001 * ball.orbitSpeed;
      ball.center.x = ball.orbitCenter.x + Math.cos(angle) * ball.orbitRadius;
      ball.center.y = ball.orbitCenter.y + Math.sin(angle * 0.7) * ball.orbitRadius * 0.5;
      ball.center.z = ball.orbitCenter.z + Math.sin(angle) * ball.orbitRadius;
    } else {
      // Linear motion with bouncing
      ball.center.add(ball.velocity.clone().multiplyScalar(dt));
      // Bounce off bounds
      if (ball.center.x < bounds.min.x || ball.center.x > bounds.max.x) {
        ball.velocity.x *= -1;
        ball.center.x = Math.max(bounds.min.x, Math.min(bounds.max.x, ball.center.x));
      }
      if (ball.center.y < bounds.min.y || ball.center.y > bounds.max.y) {
        ball.velocity.y *= -1;
        ball.center.y = Math.max(bounds.min.y, Math.min(bounds.max.y, ball.center.y));
      }
      if (ball.center.z < bounds.min.z || ball.center.z > bounds.max.z) {
        ball.velocity.z *= -1;
        ball.center.z = Math.max(bounds.min.z, Math.min(bounds.max.z, ball.center.z));
      }
    }
  }
}

// ── Organic Mass Generator ──

/**
 * Generate an organic mass (e.g., plasma bladder, hemolymph atrium) from
 * a cluster of metaballs with smooth blending.
 *
 * @param center Center of the organic mass.
 * @param baseRadius Overall radius of the mass.
 * @param blobCount Number of metaballs to use.
 * @param options Generation options.
 * @returns THREE.BufferGeometry of the organic mass surface.
 */
export function generateOrganicMass(
  center: THREE.Vector3,
  baseRadius: number,
  blobCount: number = 5,
  options: {
    resolution?: number;
    irregularity?: number;
    seed?: number;
  } = {},
): THREE.BufferGeometry {
  const irregularity = options.irregularity ?? 0.3;
  const seed = options.seed ?? 42;

  // Seeded PRNG
  let s = seed;
  const next = () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) / 4294967296);
  };

  // Generate cluster of metaballs
  const balls: Metaball[] = [];
  for (let i = 0; i < blobCount; i++) {
    const angle = (i / blobCount) * Math.PI * 2 + next() * 0.5;
    const dist = baseRadius * 0.4 * (1 - irregularity + next() * irregularity);
    const offset = new THREE.Vector3(
      Math.cos(angle) * dist,
      (next() - 0.5) * baseRadius * 0.5 * irregularity,
      Math.sin(angle) * dist,
    );
    balls.push({
      center: center.clone().add(offset),
      radius: baseRadius * (0.5 + next() * 0.5),
      strength: 1.0,
      fieldFunction: 'soft',
    });
  }

  return generateMetaballMesh(balls, {
    resolution: options.resolution ?? 32,
    threshold: 1.0,
  });
}
