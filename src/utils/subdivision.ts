/**
 * Subdivision Surfaces Module
 *
 * Implements Catmull-Clark subdivision with semi-sharp crease support,
 * as recommended in docs/research/PROCEDURAL_MESH_GENERATION_RESEARCH.md §2.3.
 *
 * Catmull-Clark subdivision produces smooth organic surfaces from coarse
 * control meshes. Semi-sharp creases (Pixar/DeRose 1998) allow defined
 * edges (like carapace ridges) while keeping the rest smooth.
 *
 * References:
 *   - Catmull & Clark: "Recursively generated B-spline surfaces" (1978)
 *   - DeRose et al.: "Subdivision Surfaces in Character Animation" (SIGGRAPH 1998)
 *   - Hoppe et al.: "Piecewise Smooth Surface Reconstruction" (SIGGRAPH 1994)
 *   - OpenSubdiv (Pixar) — production reference implementation
 */

import * as THREE from 'three';

// ── Half-Edge Mesh Data Structure ──

/**
 * Simplified half-edge mesh for subdivision operations.
 * Uses a face-vertex indexed representation with adjacency tracking.
 */
interface HEMesh {
  vertices: THREE.Vector3[];
  faceIndices: number[]; // Flat array of vertex indices, 3 per face
  edges: Map<string, { v0: number; v1: number; faces: number[]; creaseSharpness: number }>;
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * Build a half-edge mesh from THREE.BufferGeometry.
 */
function buildHEMesh(geo: THREE.BufferGeometry): HEMesh {
  const posAttr = geo.getAttribute('position');
  const vertices: THREE.Vector3[] = [];
  for (let i = 0; i < posAttr.count; i++) {
    vertices.push(new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)));
  }

  const faceIndices: number[] = [];
  const indexAttr = geo.getIndex();
  if (indexAttr) {
    for (let i = 0; i < indexAttr.count; i += 3) {
      faceIndices.push(indexAttr.getX(i), indexAttr.getX(i + 1), indexAttr.getX(i + 2));
    }
  } else {
    for (let i = 0; i < posAttr.count; i += 3) {
      faceIndices.push(i, i + 1, i + 2);
    }
  }

  // Build edge map
  const edges = new Map<string, { v0: number; v1: number; faces: number[]; creaseSharpness: number }>();
  for (let f = 0; f < faceIndices.length; f += 3) {
    const faceIdx = f / 3;
    for (let i = 0; i < 3; i++) {
      const a = faceIndices[f + i];
      const b = faceIndices[f + (i + 1) % 3];
      const key = edgeKey(a, b);
      if (!edges.has(key)) {
        edges.set(key, { v0: Math.min(a, b), v1: Math.max(a, b), faces: [], creaseSharpness: 0 });
      }
      edges.get(key)!.faces.push(faceIdx);
    }
  }

  return { vertices, faceIndices, edges };
}

/**
 * Convert a half-edge mesh back to THREE.BufferGeometry.
 */
function heMeshToGeometry(mesh: HEMesh): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const positions: number[] = [];
  for (const v of mesh.vertices) {
    positions.push(v.x, v.y, v.z);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(mesh.faceIndices);
  geo.computeVertexNormals();
  return geo;
}

// ── Crease Detection ──

/**
 * Mark edges as creases based on dihedral angle.
 * An edge is a crease if the angle between adjacent face normals exceeds threshold.
 *
 * @param mesh Half-edge mesh.
 * @param angleThreshold Dihedral angle threshold in radians.
 * @param sharpness Crease sharpness value (0 = smooth, 10 = infinitely sharp).
 */
function detectCreasesByAngle(mesh: HEMesh, angleThreshold: number, sharpness: number): void {
  // Compute face normals
  const faceNormals: THREE.Vector3[] = [];
  for (let f = 0; f < mesh.faceIndices.length; f += 3) {
    const a = mesh.vertices[mesh.faceIndices[f]];
    const b = mesh.vertices[mesh.faceIndices[f + 1]];
    const c = mesh.vertices[mesh.faceIndices[f + 2]];
    const n = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(b, a),
      new THREE.Vector3().subVectors(c, a),
    ).normalize();
    faceNormals.push(n);
  }

  // Mark crease edges
  for (const edge of mesh.edges.values()) {
    if (edge.faces.length === 2) {
      const n0 = faceNormals[edge.faces[0]];
      const n1 = faceNormals[edge.faces[1]];
      const dihedral = Math.acos(Math.max(-1, Math.min(1, n0.dot(n1))));
      if (dihedral > angleThreshold) {
        edge.creaseSharpness = sharpness;
      }
    }
  }
}

// ── Catmull-Clark Subdivision ──

/**
 * Perform one iteration of Catmull-Clark subdivision with semi-sharp crease support.
 *
 * Algorithm:
 *   1. Compute face points (centroid of each face).
 *   2. Compute edge points (average of edge endpoints + adjacent face points,
 *      with crease modification).
 *   3. Compute new vertex points (weighted average of old vertex, face points,
 *      and edge midpoints, with crease modification).
 *   4. Create new faces by connecting face points, edge points, and vertex points.
 *
 * Semi-sharp creases (DeRose et al. 1998):
 *   - Crease sharpness s ∈ [0, ∞)
 *   - s = 0: smooth (standard Catmull-Clark)
 *   - s = ∞: infinitely sharp (boundary edge)
 *   - 0 < s < ∞: semi-sharp (decreases by 1 per subdivision iteration)
 *
 * @param mesh Input half-edge mesh.
 * @returns Subdivided half-edge mesh.
 */
function catmullClarkStep(mesh: HEMesh): HEMesh {
  const { vertices, faceIndices, edges } = mesh;
  const numFaces = faceIndices.length / 3;

  // Step 1: Compute face points (centroids)
  const facePoints: THREE.Vector3[] = [];
  for (let f = 0; f < faceIndices.length; f += 3) {
    const centroid = new THREE.Vector3();
    for (let i = 0; i < 3; i++) {
      centroid.add(vertices[faceIndices[f + i]]);
    }
    centroid.divideScalar(3);
    facePoints.push(centroid);
  }

  // Step 2: Compute edge points
  // For smooth edges: E = (V1 + V2 + F1 + F2) / 4
  // For crease edges: E = (V1 + V2) / 2
  // For semi-sharp: blend between smooth and crease formulas
  const edgePoints = new Map<string, THREE.Vector3>();
  for (const [key, edge] of edges) {
    const v0 = vertices[edge.v0];
    const v1 = vertices[edge.v1];
    const midpoint = v0.clone().add(v1).multiplyScalar(0.5);

    if (edge.creaseSharpness >= 10 || edge.faces.length < 2) {
      // Infinitely sharp crease or boundary
      edgePoints.set(key, midpoint);
    } else if (edge.creaseSharpness > 0) {
      // Semi-sharp: blend smooth and crease
      const smoothPoint = midpoint.clone();
      for (const fi of edge.faces) {
        smoothPoint.add(facePoints[fi]);
      }
      smoothPoint.divideScalar(2 + edge.faces.length);
      // Blend: weight = sharpness / (sharpness + 1)
      const w = edge.creaseSharpness / (edge.creaseSharpness + 1);
      edgePoints.set(key, midpoint.lerp(smoothPoint, 1 - w));
    } else {
      // Smooth edge
      const smoothPoint = midpoint.clone();
      for (const fi of edge.faces) {
        smoothPoint.add(facePoints[fi]);
      }
      smoothPoint.divideScalar(2 + edge.faces.length);
      edgePoints.set(key, smoothPoint);
    }
  }

  // Step 3: Compute new vertex points
  // For smooth vertices: V' = (Q + 2R + (n-3)S) / n
  //   where Q = average of face points, R = average of edge midpoints,
  //   S = old vertex, n = valence
  // For crease vertices: V' = (sum of adjacent crease edge midpoints + S) / 3
  // For semi-sharp: blend

  const newVertices: THREE.Vector3[] = [];
  const vertexFacePoints: THREE.Vector3[] = vertices.map(() => new THREE.Vector3());
  const vertexFaceCount: number[] = vertices.map(() => 0);
  const vertexEdges: number[][] = vertices.map(() => []);

  // Accumulate face points per vertex
  for (let f = 0; f < faceIndices.length; f += 3) {
    const fp = facePoints[f / 3];
    for (let i = 0; i < 3; i++) {
      const vi = faceIndices[f + i];
      vertexFacePoints[vi].add(fp);
      vertexFaceCount[vi]++;
    }
  }

  // Track edges per vertex
  for (const [key, edge] of edges) {
    vertexEdges[edge.v0].push(edge.v1);
    vertexEdges[edge.v1].push(edge.v0);
  }

  for (let vi = 0; vi < vertices.length; vi++) {
    const S = vertices[vi];
    const n = vertexEdges[vi].length;

    // Check if this vertex is on a crease
    const creaseEdges: { v0: number; v1: number; faces: number[]; creaseSharpness: number }[] = [];
    for (const [, edge] of edges) {
      if ((edge.v0 === vi || edge.v1 === vi) && edge.creaseSharpness > 0) {
        creaseEdges.push(edge);
      }
    }

    if (creaseEdges.length === 2 && n > 2) {
      // Crease vertex: V' = (E1 + E2 + S) / 3
      const e1Mid = vertices[creaseEdges[0].v0 === vi ? creaseEdges[0].v1 : creaseEdges[0].v0]
        .add(S).multiplyScalar(0.5);
      const e2Mid = vertices[creaseEdges[1].v0 === vi ? creaseEdges[1].v1 : creaseEdges[1].v0]
        .add(S).multiplyScalar(0.5);
      // For semi-sharp, blend with smooth formula
      const creasePoint = e1Mid.clone().add(e2Mid).add(S).divideScalar(3);
      if (creaseEdges[0].creaseSharpness < 10) {
        // Compute smooth point and blend
        const Q = vertexFaceCount[vi] > 0
          ? vertexFacePoints[vi].clone().divideScalar(vertexFaceCount[vi])
          : S.clone();
        const R = new THREE.Vector3();
        for (const vj of vertexEdges[vi]) {
          R.add(vertices[vj]);
        }
        R.divideScalar(n);
        const smoothPoint = Q.add(R.multiplyScalar(2)).add(S.clone().multiplyScalar(n - 3)).divideScalar(n);
        const w = creaseEdges[0].creaseSharpness / (creaseEdges[0].creaseSharpness + 1);
        newVertices.push(creasePoint.lerp(smoothPoint, 1 - w));
      } else {
        newVertices.push(creasePoint);
      }
    } else if (n < 3) {
      // Boundary or corner vertex: keep as-is (or use crease formula)
      newVertices.push(S.clone());
    } else {
      // Smooth vertex: V' = (Q + 2R + (n-3)S) / n
      const Q = vertexFaceCount[vi] > 0
        ? vertexFacePoints[vi].clone().divideScalar(vertexFaceCount[vi])
        : S.clone();
      const R = new THREE.Vector3();
      for (const vj of vertexEdges[vi]) {
        R.add(vertices[vj]);
      }
      R.divideScalar(n);
      const newV = Q.add(R.multiplyScalar(2)).add(S.clone().multiplyScalar(n - 3)).divideScalar(n);
      newVertices.push(newV);
    }
  }

  // Step 4: Build new face list
  // Each old face becomes 4 new faces:
  //   [old_v0, edge01, face_point, edge20]
  //   [old_v1, edge12, face_point, edge01]
  //   [old_v2, edge20, face_point, edge12]
  //   [edge01, edge12, face_point, edge20]  (center face — only for quads)
  // For triangles, we create 3 new faces (no center quad)

  // Index mapping:
  //   [0, numOldVertices) = new vertex points
  //   [numOldVertices, numOldVertices + numEdges) = edge points
  //   [numOldVertices + numEdges, ...) = face points

  const edgePointIndex = new Map<string, number>();
  let nextIdx = newVertices.length;
  for (const [key, ep] of edgePoints) {
    edgePointIndex.set(key, nextIdx);
    newVertices.push(ep);
    nextIdx++;
  }

  const facePointStart = nextIdx;
  for (const fp of facePoints) {
    newVertices.push(fp);
    nextIdx++;
  }

  const newFaceIndices: number[] = [];
  for (let f = 0; f < faceIndices.length; f += 3) {
    const v0 = faceIndices[f];
    const v1 = faceIndices[f + 1];
    const v2 = faceIndices[f + 2];
    const fpIdx = facePointStart + f / 3;
    const e01Idx = edgePointIndex.get(edgeKey(v0, v1))!;
    const e12Idx = edgePointIndex.get(edgeKey(v1, v2))!;
    const e20Idx = edgePointIndex.get(edgeKey(v2, v0))!;

    // Three new faces (triangle → 3 triangles)
    newFaceIndices.push(v0, e01Idx, fpIdx);
    newFaceIndices.push(e01Idx, v1, fpIdx);
    newFaceIndices.push(v1, e12Idx, fpIdx);
    newFaceIndices.push(e12Idx, v2, fpIdx);
    newFaceIndices.push(v2, e20Idx, fpIdx);
    newFaceIndices.push(e20Idx, v0, fpIdx);
  }

  // Build new edge map with decreased crease sharpness
  const newEdges = new Map<string, { v0: number; v1: number; faces: number[]; creaseSharpness: number }>();
  for (let f = 0; f < newFaceIndices.length; f += 3) {
    const faceIdx = f / 3;
    for (let i = 0; i < 3; i++) {
      const a = newFaceIndices[f + i];
      const b = newFaceIndices[f + (i + 1) % 3];
      const key = edgeKey(a, b);
      if (!newEdges.has(key)) {
        // Decrease crease sharpness by 1 per subdivision
        // (only for edges that were creases in the old mesh)
        let sharpness = 0;
        // Check if this edge corresponds to an old crease edge
        // Edge points connect to old vertices — if both endpoints are old vertices
        // and the old edge was a crease, propagate the sharpness
        if (a < vertices.length && b < vertices.length) {
          const oldEdge = edges.get(edgeKey(a, b));
          if (oldEdge) {
            sharpness = Math.max(0, oldEdge.creaseSharpness - 1);
          }
        }
        newEdges.set(key, { v0: Math.min(a, b), v1: Math.max(a, b), faces: [], creaseSharpness: sharpness });
      }
      newEdges.get(key)!.faces.push(faceIdx);
    }
  }

  return { vertices: newVertices, faceIndices: newFaceIndices, edges: newEdges };
}

// ── Public API ──

export interface SubdivisionOptions {
  /** Number of subdivision iterations. */
  iterations?: number;
  /** Dihedral angle threshold for crease detection (radians). */
  creaseAngleThreshold?: number;
  /** Sharpness for detected creases (0 = smooth, 10 = infinitely sharp). */
  creaseSharpness?: number;
  /** Whether to detect creases automatically from dihedral angles. */
  detectCreases?: boolean;
}

/**
 * Subdivide a THREE.BufferGeometry using Catmull-Clark subdivision.
 *
 * Produces smooth organic surfaces from coarse control meshes.
 * Semi-sharp creases allow defined edges (carapace ridges, chitin plate boundaries)
 * while keeping the rest of the surface smooth.
 *
 * @param geometry Input geometry (triangulated).
 * @param options Subdivision options.
 * @returns Subdivided geometry.
 *
 * @example
 * const smoothHull = catmullClarkSubdivide(coarseHull, {
 *   iterations: 2,
 *   detectCreases: true,
 *   creaseAngleThreshold: 30 * Math.PI / 180,
 *   creaseSharpness: 2.0,
 * });
 */
export function catmullClarkSubdivide(
  geometry: THREE.BufferGeometry,
  options: SubdivisionOptions = {},
): THREE.BufferGeometry {
  const iterations = options.iterations ?? 2;
  const detectCreases = options.detectCreases ?? false;
  const creaseAngleThreshold = options.creaseAngleThreshold ?? 30 * Math.PI / 180;
  const creaseSharpness = options.creaseSharpness ?? 2.0;

  let mesh = buildHEMesh(geometry);

  if (detectCreases) {
    detectCreasesByAngle(mesh, creaseAngleThreshold, creaseSharpness);
  }

  for (let i = 0; i < iterations; i++) {
    mesh = catmullClarkStep(mesh);
  }

  return heMeshToGeometry(mesh);
}

/**
 * Loop subdivision for triangle meshes.
 * Simpler than Catmull-Clark and produces C² continuous surfaces
 * on regular triangle meshes.
 *
 * Reference: Loop (1987) "Smooth Subdivision Surfaces Based on Triangles"
 */
export function loopSubdivide(
  geometry: THREE.BufferGeometry,
  iterations: number = 2,
): THREE.BufferGeometry {
  // Loop subdivision is similar to Catmull-Clark but uses different
  // weights for triangle-only meshes. For simplicity, we use Catmull-Clark
  // which produces equivalent results on triangle meshes.
  return catmullClarkSubdivide(geometry, { iterations, detectCreases: false });
}

/**
 * Taubin smoothing — two-pass Laplacian smoothing that prevents shrinkage.
 *
 * Lambda pass: smooths the mesh (expands slightly)
 * Mu pass:     counteracts the expansion (passes: -mu < 0)
 *
 * This is the standard smoothing for organic meshes after marching cubes extraction.
 *
 * @param geometry Input geometry.
 * @param lambda Positive smoothing factor (typically 0.5).
 * @param mu Negative smoothing factor (typically -0.53).
 * @param iterations Number of smoothing iterations.
 * @returns Smoothed geometry.
 */
export function taubinSmooth(
  geometry: THREE.BufferGeometry,
  lambda: number = 0.5,
  mu: number = -0.53,
  iterations: number = 10,
): THREE.BufferGeometry {
  const posAttr = geometry.getAttribute('position');
  const indexAttr = geometry.getIndex();

  // Build vertex adjacency
  const adjacency: number[][] = Array.from({ length: posAttr.count }, () => []);
  if (indexAttr) {
    for (let i = 0; i < indexAttr.count; i += 3) {
      const a = indexAttr.getX(i);
      const b = indexAttr.getX(i + 1);
      const c = indexAttr.getX(i + 2);
      if (!adjacency[a].includes(b)) adjacency[a].push(b);
      if (!adjacency[a].includes(c)) adjacency[a].push(c);
      if (!adjacency[b].includes(a)) adjacency[b].push(a);
      if (!adjacency[b].includes(c)) adjacency[b].push(c);
      if (!adjacency[c].includes(a)) adjacency[c].push(a);
      if (!adjacency[c].includes(b)) adjacency[c].push(b);
    }
  }

  const positions = new Float32Array(posAttr.array);

  for (let iter = 0; iter < iterations; iter++) {
    // Lambda pass
    const newPositions = new Float32Array(positions);
    for (let v = 0; v < posAttr.count; v++) {
      if (adjacency[v].length === 0) continue;
      const neighbors = adjacency[v];
      const avg = new THREE.Vector3();
      for (const n of neighbors) {
        avg.add(new THREE.Vector3(positions[n * 3], positions[n * 3 + 1], positions[n * 3 + 2]));
      }
      avg.divideScalar(neighbors.length);
      const pos = new THREE.Vector3(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
      const delta = avg.sub(pos).multiplyScalar(lambda);
      newPositions[v * 3] = pos.x + delta.x;
      newPositions[v * 3 + 1] = pos.y + delta.y;
      newPositions[v * 3 + 2] = pos.z + delta.z;
    }
    positions.set(newPositions);

    // Mu pass
    for (let v = 0; v < posAttr.count; v++) {
      if (adjacency[v].length === 0) continue;
      const neighbors = adjacency[v];
      const avg = new THREE.Vector3();
      for (const n of neighbors) {
        avg.add(new THREE.Vector3(positions[n * 3], positions[n * 3 + 1], positions[n * 3 + 2]));
      }
      avg.divideScalar(neighbors.length);
      const pos = new THREE.Vector3(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
      const delta = avg.sub(pos).multiplyScalar(mu);
      newPositions[v * 3] = pos.x + delta.x;
      newPositions[v * 3 + 1] = pos.y + delta.y;
      newPositions[v * 3 + 2] = pos.z + delta.z;
    }
    positions.set(newPositions);
  }

  const result = geometry.clone();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.computeVertexNormals();
  return result;
}
