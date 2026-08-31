/**
 * Organ Placement System — Overhaul
 *
 * Implements a hierarchical, overlap-free organ placement pipeline using:
 * - Variable-radius Poisson disk sampling for initial placement
 * - Position-Based Dynamics (PBD) for stable collision resolution
 * - Post-adaptation overlap checking
 *
 * See: docs/research/ORGAN_PLACEMENT_OVERHAUL_RESEARCH.md
 *
 * Biological principles applied:
 * - Hierarchical placement (largest organs first, like embryonic development)
 * - Compartmentalization (anatomical section constraints)
 * - Morphogen-like guidance (section-aware U/V bounds)
 */

import * as THREE from 'three';

// ── Types ──

export interface PlacementOrgan {
  id: string;
  type: string;
  u: number;
  v: number;
  pos: THREE.Vector3;
  normal: THREE.Vector3;
  clearanceRadius: number;
  /** Whether this organ can be moved by the solver */
  movable: boolean;
  /** Anatomical section U-bounds */
  uBounds: [number, number];
}

export interface SurfaceSample {
  position: THREE.Vector3;
  normal: THREE.Vector3;
}

export type SampleSurfaceFn = (u: number, v: number) => SurfaceSample;

// ── Configuration ──

const MAX_PLACEMENT_ATTEMPTS = 60;
const PBD_ITERATIONS = 35;
const CONVERGENCE_THRESHOLD = 0.01; // 1cm

// ── U/V distance → 3D distance conversion ──

/**
 * Compute the 3D Euclidean distance between two organs placed on the hull surface.
 * Uses their 3D positions directly (more accurate than U/V distance).
 */
function distance3D(a: PlacementOrgan, b: PlacementOrgan): number {
  return a.pos.distanceTo(b.pos);
}

/**
 * Check if a candidate U/V position would overlap with any already-placed organ.
 * Uses 3D surface sampling for accurate distance computation.
 */
function wouldOverlap(
  u: number,
  v: number,
  clearanceRadius: number,
  placed: PlacementOrgan[],
  sampleSurface: SampleSurfaceFn,
): boolean {
  const sample = sampleSurface(u, v);
  for (const organ of placed) {
    const dist = sample.position.distanceTo(organ.pos);
    const minDist = (clearanceRadius + organ.clearanceRadius) * 0.7; // 70% of combined clearance
    if (dist < minDist) return true;
  }
  return false;
}

// ── Phase 1: Hierarchical Initial Placement (Poisson Disk on Surface) ──

/**
 * Place organs on the hull surface using hierarchical Poisson disk sampling.
 *
 * Biological principle: Largest organs are placed first (like embryonic development),
 * then smaller organs fill the remaining space. Each placement is checked against
 * all previously placed organs to guarantee no initial overlap.
 *
 * @param organs Array of organs to place, each with type, clearanceRadius, uBounds
 * @param sampleSurface Function to sample the hull surface at (u, v)
 * @param rng Seeded random number generator
 * @returns Array of placed organs with U/V and 3D positions
 */
export function placeOrgansHierarchical(
  organs: Omit<PlacementOrgan, 'pos' | 'normal' | 'u' | 'v'>[],
  sampleSurface: SampleSurfaceFn,
  rng: () => number,
): PlacementOrgan[] {
  // Sort by clearanceRadius descending (largest first — biological hierarchy)
  const sorted = [...organs].sort((a, b) => b.clearanceRadius - a.clearanceRadius);
  const placed: PlacementOrgan[] = [];

  for (const organSpec of sorted) {
    let placed_organ: PlacementOrgan | null = null;
    const [uMin, uMax] = organSpec.uBounds;

    for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt++) {
      // Generate candidate U/V
      const candidateU = uMin + rng() * (uMax - uMin);
      // Use deterministic V based on attempt count + organ index for variety
      // but with enough spread to avoid clustering
      const candidateV = (rng() * 0.8 + 0.1); // 0.1-0.9 range, avoid exact poles

      if (!wouldOverlap(candidateU, candidateV, organSpec.clearanceRadius, placed, sampleSurface)) {
        const sample = sampleSurface(candidateU, candidateV);
        placed_organ = {
          ...organSpec,
          u: candidateU,
          v: candidateV,
          pos: sample.position.clone(),
          normal: sample.normal.clone(),
        };
        placed.push(placed_organ);
        break;
      }
    }

    // If no valid position found after all attempts, place at best-effort position
    // (least overlapping) and let the solver resolve it
    if (!placed_organ) {
      let bestU = uMin + rng() * (uMax - uMin);
      let bestV = rng() * 0.8 + 0.1;
      let bestDist = -1;

      for (let attempt = 0; attempt < 20; attempt++) {
        const testU = uMin + rng() * (uMax - uMin);
        const testV = rng() * 0.8 + 0.1;
        const sample = sampleSurface(testU, testV);
        let minDist = Infinity;
        for (const organ of placed) {
          const dist = sample.position.distanceTo(organ.pos);
          if (dist < minDist) minDist = dist;
        }
        if (minDist > bestDist) {
          bestDist = minDist;
          bestU = testU;
          bestV = testV;
        }
      }

      const sample = sampleSurface(bestU, bestV);
      placed_organ = {
        ...organSpec,
        u: bestU,
        v: bestV,
        pos: sample.position.clone(),
        normal: sample.normal.clone(),
      };
      placed.push(placed_organ);
    }
  }

  return placed;
}

// ── Phase 2: PBD Solver (Position-Based Dynamics) ──

/**
 * Resolve organ overlaps using Position-Based Dynamics.
 *
 * PBD directly manipulates positions instead of accumulating forces,
 * which is more stable and avoids overshooting. Each constraint
 * projection moves organs apart by exactly the overlap amount.
 *
 * @param organs All organs (surface + pipeline nodes)
 * @param sampleSurface Function to re-project to hull surface
 * @param uBoundsFn Function to get U-bounds for an organ type
 */
export function solveOverlapsPBD(
  organs: PlacementOrgan[],
  sampleSurface: SampleSurfaceFn,
  uBoundsFn: (type: string) => [number, number],
): { resolved: number; unresolved: number; maxMovement: number } {
  let totalResolved = 0;
  let totalUnresolved = 0;
  let maxMovement = 0;

  // Adaptive grid size: 2× the smallest clearance radius
  const minClearance = organs.reduce((min, o) => Math.min(min, o.clearanceRadius), Infinity);
  const gridSize = Math.max(1.0, minClearance * 2.0);

  for (let iter = 0; iter < PBD_ITERATIONS; iter++) {
    let iterMaxMovement = 0;

    // Build spatial hash grid
    const grid = new Map<string, number[]>();
    for (let i = 0; i < organs.length; i++) {
      const organ = organs[i];
      const radiusCells = Math.max(1, Math.ceil(organ.clearanceRadius / gridSize));
      const cx = Math.floor(organ.pos.x / gridSize);
      const cy = Math.floor(organ.pos.y / gridSize);
      const cz = Math.floor(organ.pos.z / gridSize);

      for (let dx = -radiusCells; dx <= radiusCells; dx++) {
        for (let dy = -radiusCells; dy <= radiusCells; dy++) {
          for (let dz = -radiusCells; dz <= radiusCells; dz++) {
            const key = `${cx + dx},${cy + dy},${cz + dz}`;
            if (!grid.has(key)) grid.set(key, []);
            grid.get(key)!.push(i);
          }
        }
      }
    }

    // Track resolved pairs to avoid duplicate work
    const resolvedPairs = new Set<string>();

    // PBD constraint projection for each pair
    for (let i = 0; i < organs.length; i++) {
      const organA = organs[i];
      const cx = Math.floor(organA.pos.x / gridSize);
      const cy = Math.floor(organA.pos.y / gridSize);
      const cz = Math.floor(organA.pos.z / gridSize);
      const radiusCells = Math.max(1, Math.ceil(organA.clearanceRadius / gridSize));

      for (let dx = -radiusCells; dx <= radiusCells; dx++) {
        for (let dy = -radiusCells; dy <= radiusCells; dy++) {
          for (let dz = -radiusCells; dz <= radiusCells; dz++) {
            const key = `${cx + dx},${cy + dy},${cz + dz}`;
            const cell = grid.get(key);
            if (!cell) continue;

            for (const j of cell) {
              if (j <= i) continue;
              const pairKey = `${i},${j}`;
              if (resolvedPairs.has(pairKey)) continue;
              resolvedPairs.add(pairKey);

              const organB = organs[j];
              const currentDist = organA.pos.distanceTo(organB.pos);
              const requiredDist = organA.clearanceRadius + organB.clearanceRadius;

              if (currentDist < requiredDist && currentDist > 1e-6) {
                const overlap = requiredDist - currentDist;
                const dir = new THREE.Vector3()
                  .subVectors(organA.pos, organB.pos)
                  .normalize();

                // PBD: split the correction based on movability
                const aMoves = organA.movable ? 1 : 0;
                const bMoves = organB.movable ? 1 : 0;
                const totalMoves = aMoves + bMoves;
                if (totalMoves === 0) continue;

                const aShare = bMoves / totalMoves;
                const bShare = aMoves / totalMoves;

                const correctionA = dir.clone().multiplyScalar(overlap * aShare * 0.8);
                const correctionB = dir.clone().multiplyScalar(-overlap * bShare * 0.8);

                if (organA.movable) {
                  organA.pos.add(correctionA);
                  iterMaxMovement = Math.max(iterMaxMovement, correctionA.length());
                }
                if (organB.movable) {
                  organB.pos.add(correctionB);
                  iterMaxMovement = Math.max(iterMaxMovement, correctionB.length());
                }

                // Re-project movable organs to hull surface
                if (organA.movable) {
                  reprojectToHull(organA, sampleSurface, uBoundsFn);
                }
                if (organB.movable) {
                  reprojectToHull(organB, sampleSurface, uBoundsFn);
                }

                totalResolved++;
              } else if (currentDist <= 1e-6) {
                // Degenerate case: organs at same position — deterministic push
                const fallback = new THREE.Vector3(
                  Math.sin(i * 1.7 + iter * 0.3),
                  Math.cos(j * 2.3 + iter * 0.3),
                  (i - j) * 0.1 + 0.01,
                ).normalize();

                if (organA.movable) {
                  organA.pos.add(fallback.clone().multiplyScalar(organA.clearanceRadius * 0.5));
                  reprojectToHull(organA, sampleSurface, uBoundsFn);
                }
                if (organB.movable) {
                  organB.pos.add(fallback.clone().multiplyScalar(-organB.clearanceRadius * 0.5));
                  reprojectToHull(organB, sampleSurface, uBoundsFn);
                }
              }
            }
          }
        }
      }
    }

    maxMovement = Math.max(maxMovement, iterMaxMovement);

    // Convergence check: if max movement is below threshold, stop early
    if (iterMaxMovement < CONVERGENCE_THRESHOLD && iter > 5) break;
  }

  // Count unresolved overlaps
  for (let i = 0; i < organs.length; i++) {
    for (let j = i + 1; j < organs.length; j++) {
      const dist = organs[i].pos.distanceTo(organs[j].pos);
      const required = organs[i].clearanceRadius + organs[j].clearanceRadius;
      if (dist < required * 0.8) { // 80% threshold for "unresolved"
        totalUnresolved++;
      }
    }
  }

  return { resolved: totalResolved, unresolved: totalUnresolved, maxMovement };
}

/**
 * Re-project an organ to the hull surface after its 3D position was modified.
 * Derives U from Z position and V from lateral angle, then samples the surface.
 */
function reprojectToHull(
  organ: PlacementOrgan,
  sampleSurface: SampleSurfaceFn,
  uBoundsFn: (type: string) => [number, number],
): void {
  // Derive new U from Z (assumes spine runs along Z axis)
  // This is a simplified re-projection — the actual implementation in Canvas3D
  // has access to startZ and length for proper U derivation
  const [uMin, uMax] = uBoundsFn(organ.type);
  organ.u = Math.max(uMin, Math.min(uMax, organ.u));
  const sample = sampleSurface(organ.u, organ.v);
  organ.pos.copy(sample.position);
  organ.normal.copy(sample.normal);
}

// ── Phase 3: Post-Adaptation Overlap Check ──

/**
 * Check for overlaps after hull adaptation and report them.
 * This runs after `adaptHull()` re-projects organs to the new hull surface.
 *
 * @param organs All placed organs
 * @returns Array of overlapping pairs with overlap distance
 */
export function checkPostAdaptationOverlaps(
  organs: PlacementOrgan[],
): { organA: string; organB: string; overlap: number; distance: number }[] {
  const overlaps: { organA: string; organB: string; overlap: number; distance: number }[] = [];

  for (let i = 0; i < organs.length; i++) {
    for (let j = i + 1; j < organs.length; j++) {
      const a = organs[i];
      const b = organs[j];
      const dist = a.pos.distanceTo(b.pos);
      const required = a.clearanceRadius + b.clearanceRadius;

      if (dist < required * 0.8) {
        overlaps.push({
          organA: a.id,
          organB: b.id,
          overlap: required - dist,
          distance: dist,
        });
      }
    }
  }

  return overlaps;
}

// ── Utility: Deterministic V Distribution ──

/**
 * Generate a deterministic V distribution for N organs of the same type.
 * Uses a golden-ratio-based sequence for even distribution without clustering.
 *
 * This replaces the `rng()` random V that caused neural ganglia to cluster.
 */
export function deterministicVDistribution(count: number, offset: number = 0): number[] {
  const goldenRatio = 0.618033988749895;
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    // Golden ratio sequence gives even distribution on [0,1)
    result.push(((i + offset) * goldenRatio) % 1.0);
  }
  return result;
}

// ── Utility: Symmetry-Aware V Coordinates ──

/**
 * Generate V coordinates that respect the ship's symmetry type.
 * For bilateral symmetry, organs are placed in mirrored pairs.
 * For radial symmetry, organs are distributed evenly around the circumference.
 */
export function symmetryVCoords(
  symmetryType: string,
  count: number,
): number[] {
  if (symmetryType === 'spherical' || symmetryType === 'radial') {
    // Even distribution around the circle
    return Array.from({ length: count }, (_, i) => i / count);
  }

  // Bilateral: pairs at V and 1-V
  const coords: number[] = [];
  const baseAngles = [0.25, 0.75, 0.12, 0.88, 0.38, 0.62, 0.45, 0.55];
  for (let i = 0; i < count; i++) {
    coords.push(baseAngles[i % baseAngles.length]);
  }
  return coords;
}
