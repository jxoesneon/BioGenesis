/**
 * As-Rigid-As-Possible (ARAP) Mesh Deformation
 *
 * Implements ARAP deformation for organic shape morphing during
 * genetics-driven mutation, as recommended in
 * docs/research/PROCEDURAL_MESH_GENERATION_RESEARCH.md §4.5.
 *
 * ARAP preserves local detail while allowing global shape changes.
 * It minimizes an energy function that measures how much each
 * vertex's local neighborhood deviates from a rigid transformation.
 *
 * Energy: E = Σ_i Σ_{j∈N(i)} w_ij ||(p'_i - p'_j) - R_i(p_i - p_j)||²
 *
 * Where:
 *   p_i, p'_i = original and deformed vertex positions
 *   R_i = rotation matrix for vertex i's local neighborhood
 *   w_ij = cotangent weights
 *
 * The optimization alternates between:
 *   1. Local step: compute best-fit rotation R_i for each vertex
 *   2. Global step: solve linear system for new positions p'_i
 *
 * References:
 *   - Sorkine & Alexa: "As-Rigid-As-Possible Surface Modeling" (SGP 2007)
 *   - libigl ARAP implementation
 *   - Open3D ARAP deformation
 */

import * as THREE from 'three';

// ── Cotangent Weight Computation ──

/**
 * Compute cotangent weights for a triangle mesh.
 * Cotangent weights provide a discretization of the Laplace-Beltrami operator
 * that is rotation-invariant and preserves geometric detail.
 *
 * For edge (i, j) shared by triangles with opposite vertices α and β:
 *   w_ij = (cot(α) + cot(β)) / 2
 */
function computeCotangentWeights(
  positions: Float32Array,
  indices: ArrayLike<number>,
): Map<string, number> {
  const weights = new Map<string, number>();
  const getPos = (idx: number) => new THREE.Vector3(
    positions[idx * 3], positions[idx * 3 + 1], positions[idx * 3 + 2]
  );

  const addWeight = (i: number, j: number, w: number) => {
    const key = i < j ? `${i}-${j}` : `${j}-${i}`;
    weights.set(key, (weights.get(key) ?? 0) + w);
  };

  for (let f = 0; f < indices.length; f += 3) {
    const a = indices[f];
    const b = indices[f + 1];
    const c = indices[f + 2];
    const pa = getPos(a);
    const pb = getPos(b);
    const pc = getPos(c);

    // Cotangent at vertex a (opposite to edge bc)
    const cotA = computeCotangent(
      new THREE.Vector3().subVectors(pb, pa),
      new THREE.Vector3().subVectors(pc, pa),
    );
    addWeight(b, c, cotA / 2);

    // Cotangent at vertex b (opposite to edge ac)
    const cotB = computeCotangent(
      new THREE.Vector3().subVectors(pa, pb),
      new THREE.Vector3().subVectors(pc, pb),
    );
    addWeight(a, c, cotB / 2);

    // Cotangent at vertex c (opposite to edge ab)
    const cotC = computeCotangent(
      new THREE.Vector3().subVectors(pa, pc),
      new THREE.Vector3().subVectors(pb, pc),
    );
    addWeight(a, b, cotC / 2);
  }

  return weights;
}

/**
 * Compute cotangent of the angle between vectors u and v.
 */
function computeCotangent(u: THREE.Vector3, v: THREE.Vector3): number {
  const dot = u.dot(v);
  const cross = new THREE.Vector3().crossVectors(u, v);
  const crossLen = cross.length();
  if (crossLen < 1e-10) return 0;
  return dot / crossLen;
}

// ── ARAP Solver ──

export interface ARAPConstraint {
  /** Vertex index to constrain. */
  vertexIndex: number;
  /** Target position for this vertex. */
  targetPosition: THREE.Vector3;
  /** Constraint weight (higher = stiffer). */
  weight?: number;
}

export interface ARAPOptions {
  /** Number of optimization iterations. */
  iterations?: number;
  /** Number of local-global iterations per step. */
  innerIterations?: number;
  /** Constraint weight multiplier. */
  constraintWeight?: number;
}

/**
 * Apply ARAP deformation to a mesh.
 *
 * Given a mesh and a set of handle constraints (vertices that should
 * move to specific positions), this function deforms the mesh while
 * preserving local detail.
 *
 * @param geometry Input geometry to deform.
 * @param constraints Array of vertex constraints (handles + fixed points).
 * @param options Solver options.
 * @returns Deformed geometry.
 *
 * @example
 * // Pin the base and move the tip
 * const deformed = arapDeform(organGeo, [
 *   { vertexIndex: 0, targetPosition: basePos },  // fixed base
 *   { vertexIndex: lastVertex, targetPosition: newTipPos },  // moved tip
 * ]);
 */
export function arapDeform(
  geometry: THREE.BufferGeometry,
  constraints: ARAPConstraint[],
  options: ARAPOptions = {},
): THREE.BufferGeometry {
  const iterations = options.iterations ?? 5;
  const innerIterations = options.innerIterations ?? 10;
  const constraintWeight = options.constraintWeight ?? 1000.0;

  const posAttr = geometry.getAttribute('position');
  const indexAttr = geometry.getIndex();
  if (!indexAttr) {
    // Cannot do ARAP without indices
    return geometry.clone();
  }

  const n = posAttr.count;
  const positions = new Float32Array(posAttr.array);
  const indices = indexAttr.array;

  // Compute cotangent weights
  const weights = computeCotangentWeights(positions, indices);

  // Build adjacency list
  const adjacency: Map<number, number[]> = new Map();
  for (const [key] of weights) {
    const [i, j] = key.split('-').map(Number);
    if (!adjacency.has(i)) adjacency.set(i, []);
    if (!adjacency.has(j)) adjacency.set(j, []);
    adjacency.get(i)!.push(j);
    adjacency.get(j)!.push(i);
  }

  // Initialize deformed positions as copy of original
  const deformed = new Float32Array(positions);

  // Build constraint map
  const constraintMap = new Map<number, { pos: THREE.Vector3; weight: number }>();
  for (const c of constraints) {
    constraintMap.set(c.vertexIndex, {
      pos: c.targetPosition.clone(),
      weight: c.weight ?? constraintWeight,
    });
  }

  // Get weight between i and j
  const getWeight = (i: number, j: number): number => {
    const key = i < j ? `${i}-${j}` : `${j}-${i}`;
    return weights.get(key) ?? 0;
  };

  // ARAP optimization
  for (let iter = 0; iter < iterations; iter++) {
    // Apply constraints to deformed positions
    for (const [vi, c] of constraintMap) {
      deformed[vi * 3] = c.pos.x;
      deformed[vi * 3 + 1] = c.pos.y;
      deformed[vi * 3 + 2] = c.pos.z;
    }

    // Local-Global iterations
    for (let inner = 0; inner < innerIterations; inner++) {
      // LOCAL STEP: Compute best-fit rotation for each vertex
      const rotations: THREE.Matrix3[] = [];
      for (let i = 0; i < n; i++) {
        const neighbors = adjacency.get(i) ?? [];
        if (neighbors.length === 0) {
          rotations.push(new THREE.Matrix3());
          continue;
        }

        // Compute covariance matrix S = Σ w_ij * e_ij * e'_ij^T
        // where e_ij = p_i - p_j, e'_ij = p'_i - p'_j
        const pi = new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        const pi2 = new THREE.Vector3(deformed[i * 3], deformed[i * 3 + 1], deformed[i * 3 + 2]);
        const S = new THREE.Matrix3();

        for (const j of neighbors) {
          const w = getWeight(i, j);
          if (w === 0) continue;
          const pj = new THREE.Vector3(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]);
          const pj2 = new THREE.Vector3(deformed[j * 3], deformed[j * 3 + 1], deformed[j * 3 + 2]);
          const e = new THREE.Vector3().subVectors(pi, pj);
          const e2 = new THREE.Vector3().subVectors(pi2, pj2);
          // S += w * outer(e, e2)
          S.elements[0] += w * e.x * e2.x; S.elements[1] += w * e.y * e2.x; S.elements[2] += w * e.z * e2.x;
          S.elements[3] += w * e.x * e2.y; S.elements[4] += w * e.y * e2.y; S.elements[5] += w * e.z * e2.y;
          S.elements[6] += w * e.x * e2.z; S.elements[7] += w * e.y * e2.z; S.elements[8] += w * e.z * e2.z;
        }

        // Compute rotation via SVD: R = V * U^T where S = U Σ V^T
        const R = svdRotation(S);
        rotations.push(R);
      }

      // GLOBAL STEP: Solve linear system L * p' = b
      // L is the Laplacian matrix with cotangent weights
      // b_i = Σ w_ij * R_i * (p_i - p_j) / 2 + Σ w_ij * R_j * (p_j - p_i) / 2
      // For constrained vertices, add constraint terms

      // Simple Jacobi iteration for the global step
      const newDeformed = new Float32Array(deformed);
      for (let i = 0; i < n; i++) {
        if (constraintMap.has(i)) continue;
        const neighbors = adjacency.get(i) ?? [];
        if (neighbors.length === 0) continue;

        const Ri = rotations[i];
        const pi = new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);

        let numerator = new THREE.Vector3();
        let denominator = 0;

        for (const j of neighbors) {
          const w = getWeight(i, j);
          if (w === 0) continue;
          const pj = new THREE.Vector3(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]);
          const e = new THREE.Vector3().subVectors(pi, pj);

          // R_i * e / 2 + R_j * (-e) / 2
          const Ri_e = e.clone().applyMatrix3(Ri);
          const Rj_me = e.clone().negate().applyMatrix3(rotations[j]);
          const rhs = Ri_e.add(Rj_me).multiplyScalar(w * 0.5);

          // Add deformed neighbor position
          const pj2 = new THREE.Vector3(deformed[j * 3], deformed[j * 3 + 1], deformed[j * 3 + 2]);
          numerator.add(rhs).add(pj2.clone().multiplyScalar(w));
          denominator += w;
        }

        if (denominator > 0) {
          newDeformed[i * 3] = numerator.x / denominator;
          newDeformed[i * 3 + 1] = numerator.y / denominator;
          newDeformed[i * 3 + 2] = numerator.z / denominator;
        }
      }

      deformed.set(newDeformed);
    }
  }

  // Apply final constraints
  for (const [vi, c] of constraintMap) {
    deformed[vi * 3] = c.pos.x;
    deformed[vi * 3 + 1] = c.pos.y;
    deformed[vi * 3 + 2] = c.pos.z;
  }

  const result = geometry.clone();
  result.setAttribute('position', new THREE.Float32BufferAttribute(deformed, 3));
  result.computeVertexNormals();
  return result;
}

/**
 * Compute rotation matrix from a 3x3 matrix via SVD.
 * R = V * U^T (with determinant correction to ensure proper rotation).
 *
 * This is a simplified SVD for 3x3 matrices using Jacobi iteration.
 */
function svdRotation(m: THREE.Matrix3): THREE.Matrix3 {
  // Extract elements (column-major in THREE.js)
  const a = m.elements;
  const mat = [
    [a[0], a[3], a[6]],
    [a[1], a[4], a[7]],
    [a[2], a[5], a[8]],
  ];

  // Simple Jacobi SVD for 3x3
  // U and V are rotation matrices, σ are singular values
  const U: number[][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const V: number[][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const A: number[][] = mat.map(row => [...row]);

  const maxIter = 20;
  for (let iter = 0; iter < maxIter; iter++) {
    // Find largest off-diagonal element
    let maxOff = 0;
    let p = 0, q = 0;
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        if (Math.abs(A[i][j]) > maxOff) {
          maxOff = Math.abs(A[i][j]);
          p = i; q = j;
        }
      }
    }
    if (maxOff < 1e-10) break;

    // Compute rotation angle
    const app = A[p][p];
    const aqq = A[q][q];
    const apq = A[p][q];
    const theta = 0.5 * Math.atan2(2 * apq, app - aqq);
    const c = Math.cos(theta);
    const s = Math.sin(theta);

    // Apply rotation to A
    for (let i = 0; i < 3; i++) {
      const tmp = A[i][p];
      A[i][p] = c * tmp + s * A[i][q];
      A[i][q] = -s * tmp + c * A[i][q];
    }
    for (let i = 0; i < 3; i++) {
      const tmp = A[p][i];
      A[p][i] = c * tmp + s * A[q][i];
      A[q][i] = -s * tmp + c * A[q][i];
    }
    // Apply rotation to V
    for (let i = 0; i < 3; i++) {
      const tmp = V[i][p];
      V[i][p] = c * tmp + s * V[i][q];
      V[i][q] = -s * tmp + c * V[i][q];
    }
  }

  // Compute U = A * V^{-1} (since A = U Σ V^T, U = A V Σ^{-1})
  // For rotation extraction, we just need R = V * U^T
  // Since we only computed V, we compute U from A and V
  // U_i = A_i / |A_i| for each column (approximate)
  const Umat: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let j = 0; j < 3; j++) {
    const len = Math.sqrt(A[0][j] ** 2 + A[1][j] ** 2 + A[2][j] ** 2);
    if (len > 1e-10) {
      for (let i = 0; i < 3; i++) {
        Umat[i][j] = A[i][j] / len;
      }
    }
  }

  // R = V * U^T
  const R = new THREE.Matrix3();
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        sum += V[i][k] * Umat[j][k];
      }
      R.elements[j * 3 + i] = sum; // column-major
    }
  }

  // Ensure proper rotation (det = +1)
  const det = R.elements[0] * (R.elements[4] * R.elements[8] - R.elements[5] * R.elements[7])
            - R.elements[3] * (R.elements[1] * R.elements[8] - R.elements[2] * R.elements[7])
            + R.elements[6] * (R.elements[1] * R.elements[5] - R.elements[2] * R.elements[4]);
  if (det < 0) {
    // Flip last column
    R.elements[6] = -R.elements[6];
    R.elements[7] = -R.elements[7];
    R.elements[8] = -R.elements[8];
  }

  return R;
}

// ── Simplified ARAP: Laplacian Deformation ──

/**
 * Simplified Laplacian deformation — a faster approximation of ARAP
 * that uses uniform weights instead of cotangent weights.
 *
 * Less accurate than full ARAP but much faster and simpler.
 * Good for real-time preview during gizmo dragging.
 *
 * @param geometry Input geometry.
 * @param constraints Handle constraints.
 * @param iterations Number of smoothing iterations.
 * @returns Deformed geometry.
 */
export function laplacianDeform(
  geometry: THREE.BufferGeometry,
  constraints: ARAPConstraint[],
  iterations: number = 20,
): THREE.BufferGeometry {
  const posAttr = geometry.getAttribute('position');
  const indexAttr = geometry.getIndex();
  if (!indexAttr) return geometry.clone();

  const n = posAttr.count;
  const positions = new Float32Array(posAttr.array);
  const indices = indexAttr.array;

  // Build adjacency
  const adjacency: Map<number, Set<number>> = new Map();
  for (let i = 0; i < n; i++) adjacency.set(i, new Set());
  for (let f = 0; f < indices.length; f += 3) {
    const a = indices[f], b = indices[f + 1], c = indices[f + 2];
    adjacency.get(a)!.add(b); adjacency.get(a)!.add(c);
    adjacency.get(b)!.add(a); adjacency.get(b)!.add(c);
    adjacency.get(c)!.add(a); adjacency.get(c)!.add(b);
  }

  // Build constraint map
  const constraintMap = new Map<number, THREE.Vector3>();
  for (const c of constraints) {
    constraintMap.set(c.vertexIndex, c.targetPosition.clone());
  }

  // Compute initial deltas (Laplacian coordinates)
  const deltas: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const neighbors = Array.from(adjacency.get(i)!);
    const pi = new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    const avg = new THREE.Vector3();
    for (const j of neighbors) {
      avg.add(new THREE.Vector3(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]));
    }
    if (neighbors.length > 0) avg.divideScalar(neighbors.length);
    deltas.push(new THREE.Vector3().subVectors(pi, avg));
  }

  // Iterative solve
  const deformed = new Float32Array(positions);
  for (let iter = 0; iter < iterations; iter++) {
    // Apply constraints
    for (const [vi, pos] of constraintMap) {
      deformed[vi * 3] = pos.x;
      deformed[vi * 3 + 1] = pos.y;
      deformed[vi * 3 + 2] = pos.z;
    }

    // Smooth: each vertex moves toward (average of neighbors + delta)
    const newDeformed = new Float32Array(deformed);
    for (let i = 0; i < n; i++) {
      if (constraintMap.has(i)) continue;
      const neighbors = Array.from(adjacency.get(i)!);
      if (neighbors.length === 0) continue;
      const avg = new THREE.Vector3();
      for (const j of neighbors) {
        avg.add(new THREE.Vector3(deformed[j * 3], deformed[j * 3 + 1], deformed[j * 3 + 2]));
      }
      avg.divideScalar(neighbors.length);
      const target = avg.add(deltas[i]);
      newDeformed[i * 3] = target.x;
      newDeformed[i * 3 + 1] = target.y;
      newDeformed[i * 3 + 2] = target.z;
    }
    deformed.set(newDeformed);
  }

  // Final constraint application
  for (const [vi, pos] of constraintMap) {
    deformed[vi * 3] = pos.x;
    deformed[vi * 3 + 1] = pos.y;
    deformed[vi * 3 + 2] = pos.z;
  }

  const result = geometry.clone();
  result.setAttribute('position', new THREE.Float32BufferAttribute(deformed, 3));
  result.computeVertexNormals();
  return result;
}
