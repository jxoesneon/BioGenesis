// Nerve Branching Utility — Nerve branch generation, Murray's law, cost calculation
// Spec: docs/research/NEURAL_COMPUTE_ARCHITECTURE.md §2.2, §4.4
//
// Generates organic nerve branch geometry (CatmullRomCurve3 + TubeGeometry)
// connecting ganglia to their assigned target organs, following Murray's law
// for diameter scaling at branch points.

import * as THREE from 'three';
import { BASE_NERVE_RADIUS, MAX_BRANCH_LENGTH_RATIO } from './neuralCompute';

/**
 * Generate a nerve branch as a TubeGeometry from one position to another.
 * Uses a CatmullRomCurve3 with a slight organic curve (control points offset
 * perpendicular to the direct path) so the nerve looks biological rather than
 * a straight line.
 *
 * @param fromPos - ganglion position (THREE.Vector3)
 * @param toPos - target organ position (THREE.Vector3)
 * @param nerveRadius - radius of the nerve tube (meters)
 * @returns THREE.TubeGeometry representing the organic nerve branch
 */
export function generateNerveBranch(
  fromPos: THREE.Vector3,
  toPos: THREE.Vector3,
  nerveRadius: number,
): THREE.TubeGeometry {
  const direction = new THREE.Vector3().subVectors(toPos, fromPos);
  const length = direction.length();
  if (length < 1e-6) {
    // Degenerate case — return a tiny tube
    const curve = new THREE.CatmullRomCurve3([fromPos.clone(), toPos.clone()]);
    return new THREE.TubeGeometry(curve, 8, Math.max(0.005, nerveRadius), 6, false);
  }

  // Midpoint with a slight perpendicular offset for organic curvature.
  // Pick a perpendicular axis that is not parallel to the direction.
  const up = Math.abs(direction.y) < 0.9 * length
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const perp = new THREE.Vector3().crossVectors(direction, up).normalize();

  // Organic sag: ~8% of branch length, deterministic from positions to avoid
  // jitter on regeneration.
  const sagSeed = Math.abs(fromPos.x + toPos.z) * 0.01;
  const sagAmount = length * 0.08 * (0.5 + (sagSeed % 1.0));

  const mid = new THREE.Vector3().addVectors(fromPos, toPos).multiplyScalar(0.5);
  mid.addScaledVector(perp, sagAmount);

  // Two intermediate points for a smoother Catmull-Rom curve
  const q1 = new THREE.Vector3().lerpVectors(fromPos, mid, 0.33);
  q1.addScaledVector(perp, sagAmount * 0.5);
  const q2 = new THREE.Vector3().lerpVectors(mid, toPos, 0.67);
  q2.addScaledVector(perp, sagAmount * 0.5);

  const curve = new THREE.CatmullRomCurve3([fromPos.clone(), q1, mid, q2, toPos.clone()]);
  // Tubular segments scale with length for smoothness without excessive geometry
  const tubularSegments = Math.max(8, Math.min(48, Math.round(length * 8)));
  const radialSegments = 6;
  const radius = Math.max(0.005, nerveRadius);
  return new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
}

/**
 * Calculate daughter branch radius using Murray's law.
 * d0^2 = n * d1^2  =>  d1 = d0 / sqrt(n)
 *
 * @param parentRadius - parent nerve radius (meters)
 * @param daughterCount - number of daughter branches
 * @returns radius of each daughter branch (meters)
 */
export function calculateMurrayBranchRadius(parentRadius: number, daughterCount: number): number {
  if (daughterCount <= 0) return parentRadius;
  return parentRadius / Math.sqrt(daughterCount);
}

/**
 * Interface for an organ candidate used by findNearestOrgans.
 * Matches the CandidateOrgan shape used in Canvas3D (pos + type fields).
 */
export interface OrganCandidate {
  id: string;
  type: string;
  pos: THREE.Vector3;
  [key: string]: any;
}

/**
 * Find organs within maxDistance of a ganglion position.
 * Returns organs sorted by distance (nearest first).
 *
 * @param ganglionPos - position of the ganglion (THREE.Vector3)
 * @param organs - array of organ candidates with pos and type fields
 * @param maxDistance - maximum branch length (meters)
 * @returns array of organs within range, sorted nearest-first
 */
export function findNearestOrgans(
  ganglionPos: THREE.Vector3,
  organs: OrganCandidate[],
  maxDistance: number,
): OrganCandidate[] {
  const within: { organ: OrganCandidate; dist: number }[] = [];
  for (const organ of organs) {
    if (!organ.pos) continue;
    // Skip neural ganglia themselves — nerves connect to non-neural organs
    if (organ.type === 'neural') continue;
    const dist = ganglionPos.distanceTo(organ.pos);
    if (dist <= maxDistance) {
      within.push({ organ, dist });
    }
  }
  within.sort((a, b) => a.dist - b.dist);
  return within.map((w) => w.organ);
}

/**
 * Calculate nerve radius for an organ based on its compute demand,
 * following the spec: nerveRadius = baseNerveRadius * sqrt(demand / maxDemand).
 *
 * @param organDemand - relative compute demand of the target organ
 * @param maxDemand - maximum demand among all assigned organs (for normalization)
 * @returns nerve radius in meters
 */
export function calculateOrganNerveRadius(organDemand: number, maxDemand: number): number {
  if (maxDemand <= 0) return BASE_NERVE_RADIUS;
  const ratio = Math.max(0.1, organDemand / maxDemand);
  return BASE_NERVE_RADIUS * Math.sqrt(ratio);
}

/**
 * Calculate the maximum branch length for a given ship length.
 * maxBranchLength = shipLength * MAX_BRANCH_LENGTH_RATIO (15%)
 */
export function calculateMaxBranchLengthForShip(shipLength: number): number {
  return shipLength * MAX_BRANCH_LENGTH_RATIO;
}
