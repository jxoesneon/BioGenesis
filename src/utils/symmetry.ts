/**
 * Symmetry utility — bilateral mirror verification and V-coordinate mapping.
 *
 * Extracted from Canvas3D.tsx so it can be unit-tested independently.
 * The V-to-3D mapping mirrors the hull surface sampling math:
 *   angle = V × 2π
 *   X = cos(angle) × r   (red axis — starboard/port)
 *   Y = sin(angle) × r   (green axis — dorsal/ventral)
 *   Z = spine position   (blue axis — anterior/posterior)
 *
 * Bilateral mirror across X=0 plane:
 *   V_mirror = (0.5 - V + 1) % 1
 *   This produces: same Y, opposite X.
 */

import type { SymmetryType } from '../types';

// ── V-coordinate distribution per symmetry type ──

export function getSymmetryVCoords(
  symmetry: SymmetryType,
  stepIdx: number = 0,
): { vCoords: number[]; names: string[] } {
  switch (symmetry) {
    case 'radial-5':
      return {
        vCoords: [0.0, 0.2, 0.4, 0.6, 0.8],
        names: ['Dorsal Ray I', 'Dorsal-Right Ray II', 'Ventral-Right Ray III', 'Ventral-Left Ray IV', 'Dorsal-Left Ray V'],
      };
    case 'radial-3':
      return {
        vCoords: [0.0, 0.333, 0.667],
        names: ['Dorsal Branch I', 'Right Ventral Branch II', 'Left Ventral Branch III'],
      };
    case 'biradial':
      return {
        vCoords: [0.0, 0.25, 0.5, 0.75],
        names: ['Dorsal Plane', 'Starboard Plane', 'Ventral Plane', 'Port Plane'],
      };
    case 'spherical':
      return {
        vCoords: [0.0, 0.166, 0.333, 0.5, 0.666, 0.833],
        names: ['Anterior Zenith', 'Dorsal Equatorial', 'Ventral Equatorial', 'Posterior Nadir', 'Port Lateral', 'Starboard Lateral'],
      };
    case 'asymmetrical': {
      const phi = 0.618033988749895;
      const v1 = (stepIdx * phi) % 1.0;
      const v2 = (v1 + 0.382) % 1.0;
      return {
        vCoords: [v1, v2],
        names: [`Chiral Spiral Node #${stepIdx + 1}-A`, `Chiral Spiral Node #${stepIdx + 1}-B`],
      };
    }
    case 'bilateral':
    default:
      // V=0.0 → X=+r (starboard), V=0.5 → X=-r (port), both at Y=0.
      return {
        vCoords: [0.0, 0.5],
        names: ['Starboard Side', 'Port Side'],
      };
  }
}

// ── V-to-3D position mapping (mirrors sampleOrganicSurfacePos math) ──

export interface SurfacePoint {
  x: number;
  y: number;
  z: number;
}

/**
 * Map a V coordinate to its 3D X/Y position on a circular cross-section.
 * This is the pure math behind the hull surface sampling — no Three.js needed.
 *
 * @param v Circumferential parameter [0, 1)
 * @param radius Cross-section radius at this U position
 * @param xArch Spine X offset (0 for bilateral, nonzero for asymmetrical)
 * @param yArch Spine Y arch offset
 * @returns {x, y} position on the hull surface
 */
export function vToXY(v: number, radius: number, xArch = 0, yArch = 0): { x: number; y: number } {
  const angle = v * Math.PI * 2;
  return {
    x: xArch + Math.cos(angle) * radius,
    y: yArch + Math.sin(angle) * radius,
  };
}

// ── Bilateral mirror helpers ──

/**
 * Compute the X-mirror of a V coordinate.
 * For bilateral symmetry across X=0: V_mirror = (0.5 - V + 1) % 1
 * This ensures: cos(V_mirror × 2π) = -cos(V × 2π), sin(V_mirror × 2π) = sin(V × 2π)
 * i.e., same Y, opposite X.
 */
export function bilateralMirrorV(v: number): number {
  return ((0.5 - v) + 1) % 1;
}

/**
 * Check if two V coordinates are bilateral X-mirror pairs.
 */
export function areBilateralMirrors(v1: number, v2: number, tolerance = 1e-6): boolean {
  const mirror = bilateralMirrorV(v1);
  return Math.abs(mirror - v2) < tolerance || Math.abs(mirror - v2 - 1) < tolerance || Math.abs(mirror - v2 + 1) < tolerance;
}

/**
 * Check if a V coordinate is on the midline (X=0 plane).
 * Midline V values: 0.25 (dorsal) and 0.75 (ventral).
 */
export function isOnMidline(v: number, tolerance = 1e-6): boolean {
  const angle = v * Math.PI * 2;
  return Math.abs(Math.cos(angle)) < tolerance;
}

// ── Bounding box / symmetry box test ──

export interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface OrganPlacement {
  id: string;
  type: string;
  pos: { x: number; y: number; z: number };
  clearanceRadius: number;
}

export interface SymmetryTestResult {
  passed: boolean;
  totalOrgans: number;
  starboardCount: number;
  portCount: number;
  midlineCount: number;
  starboardOrgans: OrganPlacement[];
  portOrgans: OrganPlacement[];
  midlineOrgans: OrganPlacement[];
  unmatched: OrganPlacement[];
  boundingBox: BoundingBox;
  centerLine: number;
  errors: string[];
}

/**
 * Bounding-box bilateral symmetry test.
 *
 * Creates a bounding box around all organs, divides it at the X=0 center plane,
 * and verifies that both halves (starboard X>0 and port X<0) contain the same
 * number of organs. Midline organs (X≈0) are counted separately.
 *
 * @param organs Array of placed organs with 3D positions
 * @param midlineTolerance Distance from X=0 to consider "on midline" (default 0.1)
 * @returns Symmetry test result with counts and per-side organ lists
 */
export function testBilateralSymmetry(
  organs: OrganPlacement[],
  midlineTolerance = 0.1,
): SymmetryTestResult {
  if (organs.length === 0) {
    return {
      passed: true,
      totalOrgans: 0,
      starboardCount: 0,
      portCount: 0,
      midlineCount: 0,
      starboardOrgans: [],
      portOrgans: [],
      midlineOrgans: [],
      unmatched: [],
      boundingBox: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
      centerLine: 0,
      errors: [],
    };
  }

  // Compute bounding box
  const boundingBox: BoundingBox = {
    minX: Infinity, maxX: -Infinity,
    minY: Infinity, maxY: -Infinity,
    minZ: Infinity, maxZ: -Infinity,
  };
  for (const organ of organs) {
    boundingBox.minX = Math.min(boundingBox.minX, organ.pos.x);
    boundingBox.maxX = Math.max(boundingBox.maxX, organ.pos.x);
    boundingBox.minY = Math.min(boundingBox.minY, organ.pos.y);
    boundingBox.maxY = Math.max(boundingBox.maxY, organ.pos.y);
    boundingBox.minZ = Math.min(boundingBox.minZ, organ.pos.z);
    boundingBox.maxZ = Math.max(boundingBox.maxZ, organ.pos.z);
  }

  const centerLine = 0; // X=0 is the bilateral mirror plane

  // Classify organs by side
  const starboardOrgans: OrganPlacement[] = [];
  const portOrgans: OrganPlacement[] = [];
  const midlineOrgans: OrganPlacement[] = [];
  const errors: string[] = [];

  for (const organ of organs) {
    if (Math.abs(organ.pos.x - centerLine) < midlineTolerance) {
      midlineOrgans.push(organ);
    } else if (organ.pos.x > centerLine) {
      starboardOrgans.push(organ);
    } else {
      portOrgans.push(organ);
    }
  }

  // Check: starboard and port counts must match for bilateral symmetry
  const countMismatch = starboardOrgans.length !== portOrgans.length;
  if (countMismatch) {
    errors.push(
      `Organ count mismatch: starboard=${starboardOrgans.length}, port=${portOrgans.length}, midline=${midlineOrgans.length}`,
    );
  }

  // Check: for each starboard organ, there should be a port organ at mirrored X
  const unmatched: OrganPlacement[] = [];
  const matchTolerance = 0.5; // meters — allows for solver displacement

  for (const sb of starboardOrgans) {
    const expectedMirrorX = -sb.pos.x;
    const match = portOrgans.find(p =>
      p.type === sb.type &&
      Math.abs(p.pos.x - expectedMirrorX) < matchTolerance &&
      Math.abs(p.pos.y - sb.pos.y) < matchTolerance &&
      Math.abs(p.pos.z - sb.pos.z) < matchTolerance,
    );
    if (!match) {
      unmatched.push(sb);
    }
  }

  if (unmatched.length > 0) {
    errors.push(
      `${unmatched.length} starboard organs have no port mirror: ${unmatched.slice(0, 5).map(o => `${o.type}@(${o.pos.x.toFixed(1)},${o.pos.y.toFixed(1)},${o.pos.z.toFixed(1)})`).join(', ')}`,
    );
  }

  return {
    passed: errors.length === 0,
    totalOrgans: organs.length,
    starboardCount: starboardOrgans.length,
    portCount: portOrgans.length,
    midlineCount: midlineOrgans.length,
    starboardOrgans,
    portOrgans,
    midlineOrgans,
    unmatched,
    boundingBox,
    centerLine,
    errors,
  };
}

// ── Symmetry enforcement: re-project organs to symmetry-correct V positions ──

/**
 * Compute the symmetry-correct V for a given side index, based on the primary
 * organ's V and the symmetry type.
 *
 * For bilateral: V_side1 = (0.5 - V_primary + 1) % 1  (X-mirror)
 * For radial-n:  V_sideK = (V_primary + K/n) % 1       (rotation by K/n turn)
 * For biradial:  V_sideK = (V_primary + K×0.25) % 1    (90° rotation)
 * For spherical: V_sideK = (V_primary + K×0.166) % 1   (60° rotation)
 * For asymmetrical: V_sideK = V_primary (no constraint)
 *
 * @param symmetry The symmetry type
 * @param primaryV The V of the primary organ (side 0)
 * @param sideIdx The side index of the partner organ
 * @returns The symmetry-correct V for the partner
 */
export function symmetryCorrectV(symmetry: SymmetryType, primaryV: number, sideIdx: number): number {
  if (sideIdx === 0) return primaryV;

  switch (symmetry) {
    case 'bilateral': {
      // Side 1 = X-mirror: V = (0.5 - V_primary + 1) % 1
      return bilateralMirrorV(primaryV);
    }
    case 'radial-5': {
      // 5-fold rotational: each side is 1/5 turn apart
      return (primaryV + sideIdx * 0.2) % 1;
    }
    case 'radial-3': {
      // 3-fold rotational: each side is 1/3 turn apart
      return (primaryV + sideIdx * (1 / 3)) % 1;
    }
    case 'biradial': {
      // 4-fold: 90° rotation per side
      return (primaryV + sideIdx * 0.25) % 1;
    }
    case 'spherical': {
      // 6-fold: 60° rotation per side
      return (primaryV + sideIdx * (1 / 6)) % 1;
    }
    case 'asymmetrical':
    default:
      return primaryV;
  }
}

/**
 * Get the number of symmetry partners per group for each symmetry type.
 */
export function symmetryGroupSize(symmetry: SymmetryType): number {
  switch (symmetry) {
    case 'bilateral': return 2;
    case 'radial-5': return 5;
    case 'radial-3': return 3;
    case 'biradial': return 4;
    case 'spherical': return 6;
    case 'asymmetrical': return 1;
    default: return 1;
  }
}

// ── Multi-mode symmetry test ──

export interface MultiModeSymmetryResult {
  passed: boolean;
  symmetryType: SymmetryType;
  totalOrgans: number;
  /** Sector counts — for bilateral: [starboard, port], for radial-n: n sectors */
  sectorCounts: number[];
  /** Midline organs (on the symmetry plane) */
  midlineCount: number;
  /** Organs without a symmetry partner */
  unmatched: number;
  boundingBox: BoundingBox;
  errors: string[];
}

/**
 * Multi-mode symmetry test.
 *
 * For each symmetry type, divides the bounding box into sectors and verifies
 * equal organ counts per sector:
 * - bilateral: 2 sectors (starboard X>0, port X<0) + midline
 * - radial-5: 5 sectors of 72° each
 * - radial-3: 3 sectors of 120° each
 * - biradial: 4 quadrants (X±, Y±)
 * - spherical: 6 sectors of 60° each
 * - asymmetrical: no constraint (always passes)
 *
 * @param organs Array of placed organs
 * @param symmetry The symmetry type to test
 * @param midlineTolerance Distance from symmetry plane to count as midline
 */
export function testSymmetry(
  organs: OrganPlacement[],
  symmetry: SymmetryType,
  midlineTolerance = 0.3,
): MultiModeSymmetryResult {
  if (organs.length === 0) {
    return {
      passed: true,
      symmetryType: symmetry,
      totalOrgans: 0,
      sectorCounts: [],
      midlineCount: 0,
      unmatched: 0,
      boundingBox: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
      errors: [],
    };
  }

  // Compute bounding box
  const bb: BoundingBox = {
    minX: Infinity, maxX: -Infinity,
    minY: Infinity, maxY: -Infinity,
    minZ: Infinity, maxZ: -Infinity,
  };
  for (const o of organs) {
    bb.minX = Math.min(bb.minX, o.pos.x);
    bb.maxX = Math.max(bb.maxX, o.pos.x);
    bb.minY = Math.min(bb.minY, o.pos.y);
    bb.maxY = Math.max(bb.maxY, o.pos.y);
    bb.minZ = Math.min(bb.minZ, o.pos.z);
    bb.maxZ = Math.max(bb.maxZ, o.pos.z);
  }

  const errors: string[] = [];
  let midlineCount = 0;
  let unmatched = 0;

  if (symmetry === 'asymmetrical') {
    return {
      passed: true,
      symmetryType: symmetry,
      totalOrgans: organs.length,
      sectorCounts: [organs.length],
      midlineCount: 0,
      unmatched: 0,
      boundingBox: bb,
      errors: [],
    };
  }

  const groupSize = symmetryGroupSize(symmetry);
  const sectorCounts = new Array(groupSize).fill(0);

  // Classify each organ into a sector
  for (const o of organs) {
    if (symmetry === 'bilateral') {
      // 2 sectors: starboard (X>0) and port (X<0), midline at X=0
      if (Math.abs(o.pos.x) < midlineTolerance) {
        midlineCount++;
      } else if (o.pos.x > 0) {
        sectorCounts[0]++;
      } else {
        sectorCounts[1]++;
      }
    } else {
      // Radial symmetry: classify by angle around the Z axis
      // angle = atan2(Y, X), mapped to [0, 2π)
      const angle = Math.atan2(o.pos.y, o.pos.x);
      const normalized = (angle + Math.PI * 2) % (Math.PI * 2); // [0, 2π)
      const sectorAngle = (Math.PI * 2) / groupSize;
      const sector = Math.floor(normalized / sectorAngle);

      // Check if on a symmetry plane (angle close to sector boundary)
      const angleInSector = normalized % sectorAngle;
      const distToBoundary = Math.min(angleInSector, sectorAngle - angleInSector);
      const boundaryTolerance = 0.05; // radians (~3°)

      if (distToBoundary < boundaryTolerance) {
        midlineCount++;
      } else {
        sectorCounts[sector]++;
      }
    }
  }

  // Check: all non-midline sectors must have equal counts
  const nonZeroSectors = sectorCounts.filter(c => c > 0);
  if (nonZeroSectors.length > 0) {
    const expected = nonZeroSectors[0];
    for (let i = 0; i < sectorCounts.length; i++) {
      if (sectorCounts[i] !== expected) {
        errors.push(
          `Sector ${i} has ${sectorCounts[i]} organs, expected ${expected} (sectors: [${sectorCounts.join(', ')}], midline: ${midlineCount})`,
        );
        break;
      }
    }
  }

  // Check for unmatched organs (organs without a symmetry partner)
  // Group organs by type+Z (approximate symmetry group) and check each group has groupSize members
  const groups = new Map<string, OrganPlacement[]>();
  for (const o of organs) {
    const zKey = Math.round(o.pos.z * 2) / 2; // 0.5m Z buckets
    const key = `${o.type}_${zKey}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(o);
  }
  for (const [key, groupOrgans] of groups) {
    if (groupOrgans.length < groupSize && groupOrgans.length > 0) {
      // Could be a midline organ (expected to be alone or on a plane)
      const allMidline = groupOrgans.every(o => {
        if (symmetry === 'bilateral') return Math.abs(o.pos.x) < midlineTolerance;
        const angle = Math.atan2(o.pos.y, o.pos.x);
        const sectorAngle = (Math.PI * 2) / groupSize;
        const angleInSector = ((angle + Math.PI * 2) % (Math.PI * 2)) % sectorAngle;
        const distToBoundary = Math.min(angleInSector, sectorAngle - angleInSector);
        return distToBoundary < 0.05;
      });
      if (!allMidline) {
        unmatched += groupOrgans.length;
      }
    }
  }

  if (unmatched > 0) {
    errors.push(`${unmatched} organs without symmetry partners`);
  }

  return {
    passed: errors.length === 0,
    symmetryType: symmetry,
    totalOrgans: organs.length,
    sectorCounts,
    midlineCount,
    unmatched,
    boundingBox: bb,
    errors,
  };
}
