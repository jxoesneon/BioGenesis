import * as THREE from 'three';

/**
 * Cox-de Boor Basis Function Evaluator
 */
export function nurbsBasis(i: number, p: number, u: number, knots: Float32Array): number {
  if (p === 0) {
    return (u >= knots[i] && u < knots[i + 1]) ||
      (u === knots[knots.length - 1] && u <= knots[i + 1] && knots[i] < knots[i + 1]) ? 1.0 : 0.0;
  }

  let left = 0.0;
  const denom1 = knots[i + p] - knots[i];
  if (denom1 > 0) {
    left = ((u - knots[i]) / denom1) * nurbsBasis(i, p - 1, u, knots);
  }

  let right = 0.0;
  const denom2 = knots[i + p + 1] - knots[i + 1];
  if (denom2 > 0) {
    right = ((knots[i + p + 1] - u) / denom2) * nurbsBasis(i + 1, p - 1, u, knots);
  }

  return left + right;
}

/**
 * Generate Clamped Uniform Knot Vector
 */
export function generateClampedKnots(n: number, p: number): Float32Array {
  const m = n + p + 1;
  const knots = new Float32Array(m + 1);
  for (let i = 0; i <= p; i++) knots[i] = 0.0;
  for (let i = p + 1; i < m - p; i++) {
    knots[i] = (i - p) / (n - p + 1);
  }
  for (let i = m - p; i <= m; i++) knots[i] = 1.0;
  return knots;
}

/**
 * Evaluate 3D Point S(u, v) on Rational B-Spline (NURBS) Surface
 */
export function evaluateNurbsPoint(
  u: number,
  v: number,
  ctrlPoints: THREE.Vector3[][],
  weights: number[][],
  pU: number,
  pV: number,
  knotsU: Float32Array,
  knotsV: Float32Array
): THREE.Vector3 {
  const numU = ctrlPoints.length;
  const numV = ctrlPoints[0].length;

  const S = new THREE.Vector3(0, 0, 0);
  let denom = 0.0;

  for (let i = 0; i < numU; i++) {
    const N_u = nurbsBasis(i, pU, u, knotsU);
    if (N_u === 0) continue;

    for (let j = 0; j < numV; j++) {
      const N_v = nurbsBasis(j, pV, v, knotsV);
      if (N_v === 0) continue;

      const w = weights[i][j];
      const N_uv_w = N_u * N_v * w;

      S.x += N_uv_w * ctrlPoints[i][j].x;
      S.y += N_uv_w * ctrlPoints[i][j].y;
      S.z += N_uv_w * ctrlPoints[i][j].z;
      denom += N_uv_w;
    }
  }

  if (denom > 0) {
    S.divideScalar(denom);
  }
  return S;
}

/**
 * Build THREE.BufferGeometry from NURBS Surface Grid Matrix
 */
export function buildNurbsSurfaceGeometry(
  ctrlPoints: THREE.Vector3[][],
  weights: number[][],
  degree: number,
  resU: number,
  resV: number
): THREE.BufferGeometry {
  const numU = ctrlPoints.length;
  const numV = ctrlPoints[0].length;

  const pU = Math.min(degree, numU - 1);
  const pV = Math.min(degree, numV - 1);

  const knotsU = generateClampedKnots(numU - 1, pU);
  const knotsV = generateClampedKnots(numV - 1, pV);

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Evaluate Grid Mesh Vertices
  for (let iu = 0; iu <= resU; iu++) {
    const u = iu / resU;
    for (let iv = 0; iv <= resV; iv++) {
      const v = iv / resV;
      const pt = evaluateNurbsPoint(u, v, ctrlPoints, weights, pU, pV, knotsU, knotsV);
      positions.push(pt.x, pt.y, pt.z);
      uvs.push(u, v);
    }
  }

  // Generate Quad Triangles
  const stride = resV + 1;
  for (let iu = 0; iu < resU; iu++) {
    for (let iv = 0; iv < resV; iv++) {
      const a = iu * stride + iv;
      const b = a + 1;
      const c = (iu + 1) * stride + iv;
      const d = c + 1;

      indices.push(a, b, d);
      indices.push(a, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Linear Congruential Generator for reproducible pseudo-random numbers
 */
export function LCG(seed: number) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
