/**
 * Dual Contouring — Sharp Feature Isosurface Extraction
 *
 * Implements dual contouring for extracting meshes from SDF fields
 * with sharp feature preservation, as recommended in
 * docs/research/PROCEDURAL_MESH_GENERATION_RESEARCH.md §2.4.
 *
 * Unlike marching cubes (which places vertices on edge crossings),
 * dual contouring places a single vertex *inside* each cell that
 * the surface crosses, positioned using a Quadratic Error Function (QEF).
 * This preserves sharp features (edges, corners) that marching cubes
 * would smooth away.
 *
 * Best for: chitin plates, crystalline organs, carapace segments —
 * any organ that needs defined edges rather than smooth organic blending.
 *
 * References:
 *   - Ju et al.: "Dual Contouring of Hermite Data" (SIGGRAPH 2002)
 *   - Schaefer & Warren: "Dual Marching Cubes" (2004)
 *   - Zhang et al.: "Manifold Dual Contouring" (2007)
 */

import * as THREE from 'three';
import { SDF, sampleSDFGrid, releaseSDFGridBuffer } from './sdf';

// ── QEF (Quadratic Error Function) Minimization ──

/**
 * A QEF accumulates the error from multiple surface intersection points
 * and their normals. The optimal vertex position minimizes the sum of
 * squared distances to all the tangent planes defined by the intersections.
 *
 * QEF matrix: A = Σ n_i n_i^T  (3x3 matrix from normals)
 * QEF vector: b = Σ (n_i · p_i) n_i
 * Optimal position: x = A^{-1} b
 */
class QEF {
  private ata: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0]; // 3x3 symmetric
  private atb: number[] = [0, 0, 0];
  private pointCount: number = 0;
  private massPoint: THREE.Vector3 = new THREE.Vector3();

  /** Add a surface intersection with its position and normal. */
  add(position: THREE.Vector3, normal: THREE.Vector3): void {
    const n = normal;
    const p = position;
    // A += n * n^T
    this.ata[0] += n.x * n.x; this.ata[1] += n.x * n.y; this.ata[2] += n.x * n.z;
    this.ata[3] += n.y * n.x; this.ata[4] += n.y * n.y; this.ata[5] += n.y * n.z;
    this.ata[6] += n.z * n.x; this.ata[7] += n.z * n.y; this.ata[8] += n.z * n.z;
    // b += (n · p) * n
    const np = n.x * p.x + n.y * p.y + n.z * p.z;
    this.atb[0] += np * n.x;
    this.atb[1] += np * n.y;
    this.atb[2] += np * n.z;
    this.massPoint.add(p);
    this.pointCount++;
  }

  /** Solve the QEF and return the optimal vertex position. */
  solve(): THREE.Vector3 {
    if (this.pointCount === 0) return new THREE.Vector3();

    // Use mass point as fallback
    const mp = this.massPoint.clone().divideScalar(this.pointCount);

    if (this.pointCount === 1) return mp;

    // Solve A * x = b using Gaussian elimination
    // Augmented matrix [A | b]
    const m = [
      [this.ata[0], this.ata[1], this.ata[2], this.atb[0]],
      [this.ata[3], this.ata[4], this.ata[5], this.atb[1]],
      [this.ata[6], this.ata[7], this.ata[8], this.atb[2]],
    ];

    // Add regularization for stability
    const reg = 0.001;
    m[0][0] += reg; m[1][1] += reg; m[2][2] += reg;

    // Gaussian elimination with partial pivoting
    for (let col = 0; col < 3; col++) {
      // Find pivot
      let maxRow = col;
      let maxVal = Math.abs(m[col][col]);
      for (let row = col + 1; row < 3; row++) {
        if (Math.abs(m[row][col]) > maxVal) {
          maxVal = Math.abs(m[row][col]);
          maxRow = row;
        }
      }
      // Swap rows
      if (maxRow !== col) {
        [m[col], m[maxRow]] = [m[maxRow], m[col]];
      }
      // Skip if pivot is too small
      if (Math.abs(m[col][col]) < 1e-10) continue;
      // Eliminate
      for (let row = col + 1; row < 3; row++) {
        const factor = m[row][col] / m[col][col];
        for (let j = col; j < 4; j++) {
          m[row][j] -= factor * m[col][j];
        }
      }
    }

    // Back-substitution
    const x = [0, 0, 0];
    for (let i = 2; i >= 0; i--) {
      x[i] = m[i][3];
      for (let j = i + 1; j < 3; j++) {
        x[i] -= m[i][j] * x[j];
      }
      if (Math.abs(m[i][i]) > 1e-10) {
        x[i] /= m[i][i];
      } else {
        // Degenerate — use mass point coordinate
        x[i] = i === 0 ? mp.x : i === 1 ? mp.y : mp.z;
      }
    }

    const result = new THREE.Vector3(x[0], x[1], x[2]);

    // Clamp to cell bounds to prevent wild vertices
    // (The QEF can produce vertices far outside the cell if normals are nearly parallel)
    // We blend toward the mass point if the solution is too far away
    const dist = result.distanceTo(mp);
    if (dist > 2.0) {
      // Blend back toward mass point
      const t = 2.0 / dist;
      result.lerp(mp, 1 - t);
    }

    return result;
  }
}

// ── SDF Gradient (Normal) Computation ──

/**
 * Compute the gradient (normal) of an SDF at a point using finite differences.
 * The gradient of an SDF points outward from the surface.
 */
function sdfGradient(sdf: SDF, p: THREE.Vector3, eps: number = 0.01): THREE.Vector3 {
  const dx = sdf(new THREE.Vector3(p.x + eps, p.y, p.z)) - sdf(new THREE.Vector3(p.x - eps, p.y, p.z));
  const dy = sdf(new THREE.Vector3(p.x, p.y + eps, p.z)) - sdf(new THREE.Vector3(p.x, p.y - eps, p.z));
  const dz = sdf(new THREE.Vector3(p.x, p.y, p.z + eps)) - sdf(new THREE.Vector3(p.x, p.y, p.z - eps));
  return new THREE.Vector3(dx, dy, dz).normalize();
}

// ── Dual Contouring Implementation ──

// Corner offsets and edge definitions (same as marching cubes)
const CORNER_OFFSETS: [number, number, number][] = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];

const EDGE_VERTICES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

// Sign change lookup for each edge
const EDGE_TABLE = new Uint32Array([
  0x0, 0x109, 0x203, 0x30a, 0x406, 0x50f, 0x605, 0x70c,
  0x80c, 0x905, 0xa0f, 0xb06, 0xc0a, 0xd03, 0xe09, 0xf00,
  0x190, 0x99, 0x393, 0x29a, 0x596, 0x49f, 0x795, 0x69c,
  0x99c, 0x895, 0xb9f, 0xa96, 0xd9a, 0xc93, 0xf99, 0xe90,
  0x230, 0x339, 0x33, 0x13a, 0x636, 0x73f, 0x435, 0x53c,
  0xa3c, 0xb35, 0x83f, 0x936, 0xe3a, 0xf33, 0xc39, 0xd30,
  0x3a0, 0x2a9, 0x1a3, 0xaa, 0x7a6, 0x6af, 0x5a5, 0x4ac,
  0xbac, 0xaa5, 0x9af, 0x8a6, 0xfaa, 0xea3, 0xda9, 0xca0,
  0x460, 0x569, 0x663, 0x76a, 0x66, 0x16f, 0x265, 0x36c,
  0xc6c, 0xd65, 0xe6f, 0xf66, 0x86a, 0x963, 0xa69, 0xb60,
  0x5f0, 0x4f9, 0x7f3, 0x6fa, 0x1f6, 0xff, 0x3f5, 0x2fc,
  0xdfc, 0xcf5, 0xfff, 0xef6, 0x9fa, 0x8f3, 0xbf9, 0xaf0,
  0x650, 0x759, 0x453, 0x55a, 0x256, 0x35f, 0x55, 0x15c,
  0xe5c, 0xf55, 0xc5f, 0xd56, 0xa5a, 0xb53, 0x859, 0x950,
  0x7c0, 0x6c9, 0x5c3, 0x4ca, 0x3c6, 0x2cf, 0x1c5, 0xcc,
  0xfcc, 0xec5, 0xdcf, 0xcc6, 0xbca, 0xac3, 0x9c9, 0x8c0,
  0x8c0, 0x9c9, 0xac3, 0xbca, 0xcc6, 0xdcf, 0xec5, 0xfcc,
  0xcc, 0x1c5, 0x2cf, 0x3c6, 0x4ca, 0x5c3, 0x6c9, 0x7c0,
  0x950, 0x859, 0xb53, 0xa5a, 0xd56, 0xc5f, 0xf55, 0xe5c,
  0x15c, 0x55, 0x35f, 0x256, 0x55a, 0x453, 0x759, 0x650,
  0xaf0, 0xbf9, 0x8f3, 0x9fa, 0xef6, 0xfff, 0xcf5, 0xdfc,
  0x2fc, 0x3f5, 0xff, 0x1f6, 0x6fa, 0x7f3, 0x4f9, 0x5f0,
  0xb60, 0xa69, 0x963, 0x86a, 0xf66, 0xe6f, 0xd65, 0xc6c,
  0x36c, 0x265, 0x16f, 0x66, 0x76a, 0x663, 0x569, 0x460,
  0xca0, 0xda9, 0xea3, 0xfaa, 0x8a6, 0x9af, 0xaa5, 0xbac,
  0x4ac, 0x5a5, 0x6af, 0x7a6, 0xaa, 0x1a3, 0x2a9, 0x3a0,
  0xd30, 0xc39, 0xf33, 0xe3a, 0x936, 0x83f, 0xb35, 0xa3c,
  0x53c, 0x435, 0x73f, 0x636, 0x13a, 0x33, 0x339, 0x230,
  0xe90, 0xf99, 0xc93, 0xd9a, 0xa96, 0xb9f, 0x895, 0x99c,
  0x69c, 0x795, 0x49f, 0x596, 0x29a, 0x393, 0x99, 0x190,
  0xf00, 0xe09, 0xd03, 0xc0a, 0xb06, 0xa0f, 0x905, 0x80c,
  0x70c, 0x605, 0x50f, 0x406, 0x30a, 0x203, 0x109, 0x0,
]);

/**
 * Extract a mesh from an SDF using Dual Contouring.
 *
 * Places a vertex inside each cell that the surface crosses, positioned
 * using a QEF that minimizes the distance to all tangent planes at
 * edge intersections. This preserves sharp features.
 *
 * @param sdf The signed distance function.
 * @param bounds Bounding box to sample within.
 * @param resolution Grid resolution.
 * @returns THREE.BufferGeometry with sharp-feature-preserving vertices.
 */
export function dualContouring(
  sdf: SDF,
  bounds: THREE.Box3,
  resolution: number = 32,
): THREE.BufferGeometry {
  const size = resolution + 1;
  const values = sampleSDFGrid(sdf, bounds, resolution);

  const min = bounds.min;
  const max = bounds.max;
  const step = new THREE.Vector3(
    (max.x - min.x) / resolution,
    (max.y - min.y) / resolution,
    (max.z - min.z) / resolution,
  );

  const getValue = (i: number, j: number, k: number): number => {
    return values[(i * size + j) * size + k];
  };

  const getWorldPos = (i: number, j: number, k: number): THREE.Vector3 => {
    return new THREE.Vector3(
      min.x + i * step.x,
      min.y + j * step.y,
      min.z + k * step.z,
    );
  };

  // For each cell that the surface crosses, compute a QEF vertex
  const cellVertices = new Map<number, number>(); // cell index → vertex index
  const positions: number[] = [];

  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution; j++) {
      for (let k = 0; k < resolution; k++) {
        // Compute cube index
        let cubeIndex = 0;
        for (let c = 0; c < 8; c++) {
          const [di, dj, dk] = CORNER_OFFSETS[c];
          if (getValue(i + di, j + dj, k + dk) < 0) cubeIndex |= (1 << c);
        }

        if (cubeIndex === 0 || cubeIndex === 255) continue;

        // Compute edge intersections and accumulate QEF
        const qef = new QEF();
        const edges = EDGE_TABLE[cubeIndex];

        for (let e = 0; e < 12; e++) {
          if (edges & (1 << e)) {
            const [c1, c2] = EDGE_VERTICES[e];
            const [i1, j1, k1] = CORNER_OFFSETS[c1];
            const [i2, j2, k2] = CORNER_OFFSETS[c2];
            const v1 = getValue(i + i1, j + j1, k + k1);
            const v2 = getValue(i + i2, j + j2, k + k2);
            const t = -v1 / (v2 - v1);
            const intersection = new THREE.Vector3(
              min.x + (i + i1 + t * (i2 - i1)) * step.x,
              min.y + (j + j1 + t * (j2 - j1)) * step.y,
              min.z + (k + k1 + t * (k2 - k1)) * step.z,
            );
            const normal = sdfGradient(sdf, intersection, Math.min(step.x, step.y, step.z) * 0.5);
            qef.add(intersection, normal);
          }
        }

        // Solve QEF for vertex position
        const vertex = qef.solve();
        const cellIdx = (i * size + j) * size + k;
        cellVertices.set(cellIdx, positions.length / 3);
        positions.push(vertex.x, vertex.y, vertex.z);
      }
    }
  }

  // Generate faces by connecting adjacent cell vertices
  // For each edge that crosses the surface, create a quad from the
  // 4 adjacent cell vertices
  const indices: number[] = [];
  const cellIdx = (i: number, j: number, k: number) => (i * size + j) * size + k;

  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution; j++) {
      for (let k = 0; k < resolution; k++) {
        // Check X-edges (between (i,j,k) and (i+1,j,k))
        if (i + 1 < resolution) {
          const v1 = getValue(i, j, k);
          const v2 = getValue(i + 1, j, k);
          if ((v1 < 0) !== (v2 < 0)) {
            // Surface crosses this X-edge
            // The quad connects 4 cells around this edge:
            // (i, j-1, k-1), (i, j, k-1), (i, j, k), (i, j-1, k)
            // and their +X neighbors
            const cells = [
              [i, j, k], [i, j - 1, k], [i, j - 1, k - 1], [i, j, k - 1],
            ];
            const verts = cells.map(([ci, cj, ck]) => {
              if (ci < 0 || cj < 0 || ck < 0 || ci >= resolution || cj >= resolution || ck >= resolution) return -1;
              return cellVertices.get(cellIdx(ci, cj, ck)) ?? -1;
            });
            if (verts.every(v => v >= 0)) {
              // Determine winding from sign change direction
              if (v1 < 0) {
                indices.push(verts[0], verts[1], verts[2]);
                indices.push(verts[0], verts[2], verts[3]);
              } else {
                indices.push(verts[0], verts[2], verts[1]);
                indices.push(verts[0], verts[3], verts[2]);
              }
            }
          }
        }

        // Check Y-edges
        if (j + 1 < resolution) {
          const v1 = getValue(i, j, k);
          const v2 = getValue(i, j + 1, k);
          if ((v1 < 0) !== (v2 < 0)) {
            const cells = [
              [i, j, k], [i - 1, j, k], [i - 1, j, k - 1], [i, j, k - 1],
            ];
            const verts = cells.map(([ci, cj, ck]) => {
              if (ci < 0 || cj < 0 || ck < 0 || ci >= resolution || cj >= resolution || ck >= resolution) return -1;
              return cellVertices.get(cellIdx(ci, cj, ck)) ?? -1;
            });
            if (verts.every(v => v >= 0)) {
              if (v1 < 0) {
                indices.push(verts[0], verts[1], verts[2]);
                indices.push(verts[0], verts[2], verts[3]);
              } else {
                indices.push(verts[0], verts[2], verts[1]);
                indices.push(verts[0], verts[3], verts[2]);
              }
            }
          }
        }

        // Check Z-edges
        if (k + 1 < resolution) {
          const v1 = getValue(i, j, k);
          const v2 = getValue(i, j, k + 1);
          if ((v1 < 0) !== (v2 < 0)) {
            const cells = [
              [i, j, k], [i, j - 1, k], [i - 1, j - 1, k], [i - 1, j, k],
            ];
            const verts = cells.map(([ci, cj, ck]) => {
              if (ci < 0 || cj < 0 || ck < 0 || ci >= resolution || cj >= resolution || ck >= resolution) return -1;
              return cellVertices.get(cellIdx(ci, cj, ck)) ?? -1;
            });
            if (verts.every(v => v >= 0)) {
              if (v1 < 0) {
                indices.push(verts[0], verts[1], verts[2]);
                indices.push(verts[0], verts[2], verts[3]);
              } else {
                indices.push(verts[0], verts[2], verts[1]);
                indices.push(verts[0], verts[3], verts[2]);
              }
            }
          }
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  releaseSDFGridBuffer(values);
  return geo;
}
