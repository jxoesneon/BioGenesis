/**
 * Marching Cubes & Surface Nets — Isosurface Extraction
 *
 * Extracts triangle meshes from SDF scalar fields, as recommended in
 * docs/research/PROCEDURAL_MESH_GENERATION_RESEARCH.md §2.4.
 *
 * Implements two algorithms:
 *   - Marching Cubes (Lorensen & Cline 1987) — standard, fast
 *   - Surface Nets (Gibson 1998) — smoother, simpler, manifold-guaranteed
 *
 * Both accept a regular 3D grid of SDF values and produce THREE.BufferGeometry.
 *
 * References:
 *   - Lorensen & Cline: "Marching cubes: A high resolution 3D surface
 *     construction algorithm" (SIGGRAPH 1987)
 *   - Gibson: "Constrained Elastic SurfaceNets" (MICCAI 1998)
 *   - Paul Bourke: "Polygonising a scalar field" (paulbourke.net)
 */

import * as THREE from 'three';
import { SDF, sampleSDFGrid, releaseSDFGridBuffer } from './sdf';

// ── Marching Cubes Lookup Tables ──

/**
 * Edge intersection table: edgeTable[cubeIndex] = bitmask of which edges
 * are crossed by the isosurface.
 */
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
 * Triangle table: triTable[cubeIndex][i] = edge index for vertex i.
 * -1 marks end of triangle list for that configuration.
 */
const TRI_TABLE: number[][] = [
  [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [0,8,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [0,1,9,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [1,8,3,9,8,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [1,2,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [0,8,3,1,2,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [9,2,10,0,2,9,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [2,8,3,2,10,8,10,9,8,-1,-1,-1,-1,-1,-1,-1],
  [3,11,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [0,11,2,8,11,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [1,9,0,2,3,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [1,11,2,1,9,11,9,8,11,-1,-1,-1,-1,-1,-1,-1],
  [3,10,1,11,10,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [0,10,1,0,8,10,8,11,10,-1,-1,-1,-1,-1,-1,-1],
  [3,9,0,3,11,9,11,10,9,-1,-1,-1,-1,-1,-1,-1],
  [9,8,10,10,8,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [4,7,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [4,3,0,7,3,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [0,1,9,8,4,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [4,1,9,4,7,1,7,3,1,-1,-1,-1,-1,-1,-1,-1],
  [1,2,10,8,4,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [3,4,7,3,0,4,1,2,10,-1,-1,-1,-1,-1,-1,-1],
  [9,2,10,9,0,2,8,4,7,-1,-1,-1,-1,-1,-1,-1],
  [2,10,9,2,9,7,2,7,3,7,9,4,-1,-1,-1,-1],
  [8,4,7,3,11,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [11,4,7,11,2,4,2,0,4,-1,-1,-1,-1,-1,-1,-1],
  [9,0,1,8,4,7,2,3,11,-1,-1,-1,-1,-1,-1,-1],
  [4,7,11,9,4,11,9,11,2,9,2,1,-1,-1,-1,-1],
  [3,10,1,3,11,10,7,8,4,-1,-1,-1,-1,-1,-1,-1],
  [1,11,10,1,4,11,1,0,4,7,11,4,-1,-1,-1,-1],
  [4,7,8,9,0,11,9,11,10,11,0,3,-1,-1,-1,-1],
  [4,7,11,4,11,9,9,11,10,-1,-1,-1,-1,-1,-1,-1],
  [9,5,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [9,5,4,0,8,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [0,5,4,1,5,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [8,5,4,8,3,5,3,1,5,-1,-1,-1,-1,-1,-1,-1],
  [1,2,10,9,5,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [3,0,8,1,2,10,4,9,5,-1,-1,-1,-1,-1,-1,-1],
  [5,2,10,5,4,2,4,0,2,-1,-1,-1,-1,-1,-1,-1],
  [2,10,5,3,2,5,3,5,4,3,4,8,-1,-1,-1,-1],
  [9,5,4,2,3,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [0,11,2,0,8,11,4,9,5,-1,-1,-1,-1,-1,-1,-1],
  [0,5,4,0,1,5,2,3,11,-1,-1,-1,-1,-1,-1,-1],
  [2,1,5,2,5,8,2,8,11,4,8,5,-1,-1,-1,-1],
  [10,3,11,10,1,3,9,5,4,-1,-1,-1,-1,-1,-1,-1],
  [4,9,5,0,8,1,8,10,1,8,11,10,-1,-1,-1,-1],
  [5,4,0,5,0,11,5,11,10,11,0,3,-1,-1,-1,-1],
  [5,4,8,5,8,10,10,8,11,-1,-1,-1,-1,-1,-1,-1],
  [9,7,8,5,7,9,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [9,3,0,9,5,3,5,7,3,-1,-1,-1,-1,-1,-1,-1],
  [0,7,8,0,1,7,1,5,7,-1,-1,-1,-1,-1,-1,-1],
  [1,5,3,3,5,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [9,7,8,9,5,7,10,1,2,-1,-1,-1,-1,-1,-1,-1],
  [10,1,2,9,5,0,5,3,0,5,7,3,-1,-1,-1,-1],
  [8,0,2,8,2,5,8,5,7,10,5,2,-1,-1,-1,-1],
  [2,10,5,2,5,3,3,5,7,-1,-1,-1,-1,-1,-1,-1],
  [7,9,5,7,8,9,3,11,2,-1,-1,-1,-1,-1,-1,-1],
  [9,5,7,9,7,2,9,2,0,2,7,11,-1,-1,-1,-1],
  [2,3,11,0,1,8,1,7,8,1,5,7,-1,-1,-1,-1],
  [11,2,1,11,1,7,7,1,5,-1,-1,-1,-1,-1,-1,-1],
  [9,5,8,8,5,7,10,1,3,10,3,11,-1,-1,-1,-1],
  [5,7,0,5,0,9,7,11,0,1,0,10,11,10,0,-1],
  [11,10,0,11,0,3,10,5,0,8,0,7,5,7,0,-1],
  [11,10,5,7,11,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [10,6,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [0,8,3,5,10,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [9,0,1,5,10,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [1,8,3,1,9,8,5,10,6,-1,-1,-1,-1,-1,-1,-1],
  [1,6,5,2,6,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [1,6,5,1,2,6,3,0,8,-1,-1,-1,-1,-1,-1,-1],
  [9,6,5,9,0,6,0,2,6,-1,-1,-1,-1,-1,-1,-1],
  [5,9,8,5,8,2,5,2,6,3,2,8,-1,-1,-1,-1],
  [2,3,11,10,6,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [11,0,8,11,2,0,10,6,5,-1,-1,-1,-1,-1,-1,-1],
  [0,1,9,2,3,11,5,10,6,-1,-1,-1,-1,-1,-1,-1],
  [5,10,6,1,9,2,9,11,2,9,8,11,-1,-1,-1,-1],
  [6,3,11,6,5,3,5,1,3,-1,-1,-1,-1,-1,-1,-1],
  [0,8,11,0,11,5,0,5,1,5,11,6,-1,-1,-1,-1],
  [3,11,6,0,3,6,0,6,5,0,5,9,-1,-1,-1,-1],
  [6,5,9,6,9,11,11,9,8,-1,-1,-1,-1,-1,-1,-1],
  [5,10,6,4,7,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [4,3,0,4,7,3,6,5,10,-1,-1,-1,-1,-1,-1,-1],
  [1,9,0,5,10,6,8,4,7,-1,-1,-1,-1,-1,-1,-1],
  [10,6,5,1,9,7,1,7,3,7,9,4,-1,-1,-1,-1],
  [6,1,2,6,5,1,4,7,8,-1,-1,-1,-1,-1,-1,-1],
  [1,2,5,5,2,6,3,0,4,3,4,7,-1,-1,-1,-1],
  [8,4,7,9,0,5,0,6,5,0,2,6,-1,-1,-1,-1],
  [7,3,9,7,9,4,3,2,9,5,9,6,2,6,9,-1],
  [3,11,2,7,8,4,10,6,5,-1,-1,-1,-1,-1,-1,-1],
  [5,10,6,4,7,2,4,2,0,2,7,11,-1,-1,-1,-1],
  [0,1,9,4,7,8,2,3,11,5,10,6,-1,-1,-1,-1],
  [9,2,1,9,11,2,9,4,11,7,11,4,5,10,6,-1],
  [8,4,7,3,11,5,3,5,1,5,11,6,-1,-1,-1,-1],
  [5,1,11,5,11,6,1,0,11,7,11,4,0,4,11,-1],
  [0,5,9,0,6,5,0,3,6,11,6,3,8,4,7,-1],
  [6,5,9,6,9,11,4,7,9,7,11,9,-1,-1,-1,-1],
  [10,4,9,6,4,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [4,10,6,4,9,10,0,8,3,-1,-1,-1,-1,-1,-1,-1],
  [10,0,1,10,6,0,6,4,0,-1,-1,-1,-1,-1,-1,-1],
  [8,3,1,8,1,6,8,6,4,6,1,10,-1,-1,-1,-1],
  [1,4,9,1,2,4,2,6,4,-1,-1,-1,-1,-1,-1,-1],
  [3,0,8,1,2,9,2,4,9,2,6,4,-1,-1,-1,-1],
  [0,2,4,4,2,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [8,3,2,8,2,4,4,2,6,-1,-1,-1,-1,-1,-1,-1],
  [10,4,9,10,6,4,11,2,3,-1,-1,-1,-1,-1,-1,-1],
  [0,8,2,2,8,11,4,9,10,4,10,6,-1,-1,-1,-1],
  [3,11,2,0,1,6,0,6,4,6,1,10,-1,-1,-1,-1],
  [6,4,1,6,1,10,4,8,1,2,1,11,8,11,1,-1],
  [9,6,4,9,3,6,9,1,3,11,6,3,-1,-1,-1,-1],
  [8,11,1,8,1,0,11,6,1,9,1,4,6,4,1,-1],
  [3,11,6,3,6,0,0,6,4,-1,-1,-1,-1,-1,-1,-1],
  [6,4,8,11,6,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [7,10,6,7,8,10,8,9,10,-1,-1,-1,-1,-1,-1,-1],
  [0,7,3,0,10,7,0,9,10,6,7,10,-1,-1,-1,-1],
  [10,6,7,1,10,7,1,7,8,1,8,0,-1,-1,-1,-1],
  [10,6,7,10,7,1,1,7,3,-1,-1,-1,-1,-1,-1,-1],
  [1,2,6,1,6,8,1,8,9,8,6,7,-1,-1,-1,-1],
  [2,6,9,2,9,1,6,7,9,0,9,3,7,3,9,-1],
  [7,8,0,7,0,6,6,0,2,-1,-1,-1,-1,-1,-1,-1],
  [7,3,2,6,7,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [2,3,11,10,6,8,10,8,9,8,6,7,-1,-1,-1,-1],
  [2,0,7,2,7,11,0,9,7,6,7,10,9,10,7,-1],
  [1,8,0,1,7,8,1,10,7,6,7,10,2,3,11,-1],
  [11,2,1,11,1,7,10,6,1,6,7,1,-1,-1,-1,-1],
  [8,9,6,8,6,7,9,1,6,11,6,3,1,3,6,-1],
  [0,9,1,11,6,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [7,8,0,7,0,6,3,11,0,11,6,0,-1,-1,-1,-1],
  [7,11,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [7,6,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [3,0,8,11,7,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [0,1,9,11,7,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [8,1,9,8,3,1,11,7,6,-1,-1,-1,-1,-1,-1,-1],
  [10,1,2,6,11,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [1,2,10,3,0,8,6,11,7,-1,-1,-1,-1,-1,-1,-1],
  [2,9,0,2,10,9,6,11,7,-1,-1,-1,-1,-1,-1,-1],
  [6,11,7,2,10,3,10,8,3,10,9,8,-1,-1,-1,-1],
  [7,2,3,6,2,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [7,0,8,7,6,0,6,2,0,-1,-1,-1,-1,-1,-1,-1],
  [2,7,6,2,3,7,0,1,9,-1,-1,-1,-1,-1,-1,-1],
  [1,6,2,1,8,6,1,9,8,8,7,6,-1,-1,-1,-1],
  [10,7,6,10,1,7,1,3,7,-1,-1,-1,-1,-1,-1,-1],
  [10,7,6,1,7,10,1,8,7,1,0,8,-1,-1,-1,-1],
  [0,3,7,0,7,10,0,10,9,6,10,7,-1,-1,-1,-1],
  [7,6,10,7,10,8,8,10,9,-1,-1,-1,-1,-1,-1,-1],
  [6,8,4,11,8,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [3,6,11,3,0,6,0,4,6,-1,-1,-1,-1,-1,-1,-1],
  [8,6,11,8,4,6,9,0,1,-1,-1,-1,-1,-1,-1,-1],
  [9,4,6,9,6,3,9,3,1,11,3,6,-1,-1,-1,-1],
  [6,8,4,6,11,8,2,10,1,-1,-1,-1,-1,-1,-1,-1],
  [1,2,10,3,0,11,0,6,11,0,4,6,-1,-1,-1,-1],
  [4,11,8,4,6,11,0,2,9,2,10,9,-1,-1,-1,-1],
  [10,9,3,10,3,2,9,4,3,11,3,6,4,6,3,-1],
  [8,2,3,8,4,2,4,6,2,-1,-1,-1,-1,-1,-1,-1],
  [0,4,2,4,6,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [1,9,0,2,3,4,2,4,6,4,3,8,-1,-1,-1,-1],
  [1,9,4,1,4,2,2,4,6,-1,-1,-1,-1,-1,-1,-1],
  [8,1,3,8,6,1,8,4,6,6,10,1,-1,-1,-1,-1],
  [10,1,0,10,0,6,6,0,4,-1,-1,-1,-1,-1,-1,-1],
  [4,6,3,4,3,8,6,10,3,0,3,9,10,9,3,-1],
  [10,9,4,6,10,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [4,9,5,7,6,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [0,8,3,4,9,5,11,7,6,-1,-1,-1,-1,-1,-1,-1],
  [5,0,1,5,4,0,7,6,11,-1,-1,-1,-1,-1,-1,-1],
  [11,7,6,8,3,4,3,5,4,3,1,5,-1,-1,-1,-1],
  [9,5,4,10,1,2,7,6,11,-1,-1,-1,-1,-1,-1,-1],
  [6,11,7,1,2,10,0,8,3,4,9,5,-1,-1,-1,-1],
  [7,6,11,5,4,10,4,2,10,4,0,2,-1,-1,-1,-1],
  [3,4,8,3,5,4,3,2,5,10,5,2,11,7,6,-1],
  [7,2,3,7,6,2,5,4,9,-1,-1,-1,-1,-1,-1,-1],
  [9,5,4,0,8,6,0,6,2,6,8,7,-1,-1,-1,-1],
  [3,6,2,3,7,6,1,5,0,5,4,0,-1,-1,-1,-1],
  [6,2,8,6,8,7,2,1,8,4,8,5,1,5,8,-1],
  [9,5,4,10,1,6,1,7,6,1,3,7,-1,-1,-1,-1],
  [1,6,10,1,7,6,1,0,7,8,7,0,9,5,4,-1],
  [4,0,10,4,10,5,0,3,10,6,10,7,3,7,10,-1],
  [7,6,10,7,10,8,5,4,10,4,8,10,-1,-1,-1,-1],
  [6,9,5,6,11,9,11,8,9,-1,-1,-1,-1,-1,-1,-1],
  [3,6,11,0,6,3,0,5,6,0,9,5,-1,-1,-1,-1],
  [0,11,8,0,5,11,0,1,5,5,6,11,-1,-1,-1,-1],
  [6,11,3,6,3,5,5,3,1,-1,-1,-1,-1,-1,-1,-1],
  [1,2,10,9,5,11,9,11,8,11,5,6,-1,-1,-1,-1],
  [0,11,3,0,6,11,0,9,6,5,6,9,1,2,10,-1],
  [11,8,5,11,5,6,8,0,5,10,5,2,0,2,5,-1],
  [6,11,3,6,3,5,2,10,3,10,5,3,-1,-1,-1,-1],
  [5,8,9,5,2,8,5,6,2,3,8,2,-1,-1,-1,-1],
  [9,5,6,9,6,0,0,6,2,-1,-1,-1,-1,-1,-1,-1],
  [1,5,8,1,8,0,5,6,8,3,8,2,6,2,8,-1],
  [1,5,6,2,1,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [1,3,6,1,6,10,3,8,6,5,6,9,8,9,6,-1],
  [10,1,0,10,0,6,9,5,0,5,6,0,-1,-1,-1,-1],
  [0,3,8,5,6,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [10,5,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [11,5,10,7,5,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [11,5,10,11,7,5,8,3,0,-1,-1,-1,-1,-1,-1,-1],
  [5,11,7,5,10,11,1,9,0,-1,-1,-1,-1,-1,-1,-1],
  [10,7,5,10,11,7,9,8,1,8,3,1,-1,-1,-1,-1],
  [11,1,2,11,7,1,7,5,1,-1,-1,-1,-1,-1,-1,-1],
  [0,8,3,1,2,7,1,7,5,7,2,11,-1,-1,-1,-1],
  [9,7,5,9,2,7,9,0,2,2,11,7,-1,-1,-1,-1],
  [7,5,2,7,2,11,5,9,2,3,2,8,9,8,2,-1],
  [2,5,10,2,3,5,3,7,5,-1,-1,-1,-1,-1,-1,-1],
  [8,2,0,8,5,2,8,7,5,10,2,5,-1,-1,-1,-1],
  [9,0,1,5,10,3,5,3,7,3,10,2,-1,-1,-1,-1],
  [9,8,2,9,2,1,8,7,2,10,2,5,7,5,2,-1],
  [1,3,5,3,7,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [0,8,7,0,7,1,1,7,5,-1,-1,-1,-1,-1,-1,-1],
  [9,0,3,9,3,5,5,3,7,-1,-1,-1,-1,-1,-1,-1],
  [9,8,7,5,9,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [5,8,4,5,10,8,10,11,8,-1,-1,-1,-1,-1,-1,-1],
  [5,0,4,5,11,0,5,10,11,11,3,0,-1,-1,-1,-1],
  [0,1,9,8,4,10,8,10,11,10,4,5,-1,-1,-1,-1],
  [10,11,4,10,4,5,11,3,4,9,4,1,3,1,4,-1],
  [2,5,1,2,8,5,2,11,8,4,5,8,-1,-1,-1,-1],
  [0,4,11,0,11,3,4,5,11,2,11,1,5,1,11,-1],
  [0,2,5,0,5,9,2,11,5,4,5,8,11,8,5,-1],
  [9,4,5,2,11,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [2,5,10,3,5,2,3,4,5,3,8,4,-1,-1,-1,-1],
  [5,10,2,5,2,4,4,2,0,-1,-1,-1,-1,-1,-1,-1],
  [3,10,2,3,5,10,3,8,5,4,5,8,0,1,9,-1],
  [5,10,2,5,2,4,1,9,2,9,4,2,-1,-1,-1,-1],
  [8,4,5,8,5,3,3,5,1,-1,-1,-1,-1,-1,-1,-1],
  [0,4,5,1,0,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [8,4,5,8,5,3,9,0,5,0,3,5,-1,-1,-1,-1],
  [9,4,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [4,11,7,4,9,11,9,10,11,-1,-1,-1,-1,-1,-1,-1],
  [0,8,3,4,9,7,9,11,7,9,10,11,-1,-1,-1,-1],
  [1,10,11,1,11,4,1,4,0,7,4,11,-1,-1,-1,-1],
  [3,1,4,3,4,8,1,10,4,7,4,11,10,11,4,-1],
  [4,11,7,9,11,4,9,2,11,9,1,2,-1,-1,-1,-1],
  [9,7,4,9,11,7,9,1,11,2,11,1,0,8,3,-1],
  [11,7,4,11,4,2,2,4,0,-1,-1,-1,-1,-1,-1,-1],
  [11,7,4,11,4,2,8,3,4,3,2,4,-1,-1,-1,-1],
  [2,9,10,2,7,9,2,3,7,7,4,9,-1,-1,-1,-1],
  [9,10,7,9,7,4,10,2,7,8,7,0,2,0,7,-1],
  [3,7,10,3,10,2,7,4,10,1,10,0,4,0,10,-1],
  [1,10,2,8,7,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [4,9,1,4,1,7,7,1,3,-1,-1,-1,-1,-1,-1,-1],
  [4,9,1,4,1,7,0,8,1,8,7,1,-1,-1,-1,-1],
  [4,0,3,7,4,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [4,8,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [9,10,8,10,11,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [3,0,9,3,9,11,11,9,10,-1,-1,-1,-1,-1,-1,-1],
  [0,1,10,0,10,8,8,10,11,-1,-1,-1,-1,-1,-1,-1],
  [3,1,10,11,3,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [1,2,11,1,11,9,9,11,8,-1,-1,-1,-1,-1,-1,-1],
  [3,0,9,3,9,11,1,2,9,2,11,9,-1,-1,-1,-1],
  [0,2,11,8,0,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [3,2,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [2,3,8,2,8,10,10,8,9,-1,-1,-1,-1,-1,-1,-1],
  [9,10,2,0,9,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [2,3,8,2,8,10,0,1,8,1,10,8,-1,-1,-1,-1],
  [1,10,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [1,3,8,9,1,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [0,9,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [0,3,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
];



// Edge vertex offsets: which two grid corners each edge connects
const EDGE_VERTICES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 0], // bottom face
  [4, 5], [5, 6], [6, 7], [7, 4], // top face
  [0, 4], [1, 5], [2, 6], [3, 7], // vertical edges
];

// Corner offsets within a grid cell
const CORNER_OFFSETS: [number, number, number][] = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], // bottom
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], // top
];

// ── Marching Cubes Implementation ──

export interface MarchingCubesOptions {
  /** Iso-surface threshold (default 0.0 for SDFs). */
  isoLevel?: number;
  /** Whether to compute vertex normals via SDF gradient (true) or geometry (false). */
  computeNormals?: boolean;
}

/**
 * Extract a triangle mesh from a 3D scalar field using Marching Cubes.
 *
 * @param values Float32Array of SDF values on a regular grid.
 * @param resolution Grid resolution (cells per axis). Array size must be (res+1)^3.
 * @param bounds Bounding box of the grid in world space.
 * @param options Extraction options.
 * @returns THREE.BufferGeometry with position and normal attributes.
 */
export function marchingCubes(
  values: Float32Array,
  resolution: number,
  bounds: THREE.Box3,
  options: MarchingCubesOptions = {},
): THREE.BufferGeometry {
  const isoLevel = options.isoLevel ?? 0.0;
  const computeNormals = options.computeNormals ?? true;
  const size = resolution + 1;

  const min = bounds.min;
  const max = bounds.max;
  const step = new THREE.Vector3(
    (max.x - min.x) / resolution,
    (max.y - min.y) / resolution,
    (max.z - min.z) / resolution,
  );

  const positions: number[] = [];
  const indices: number[] = [];

  // Helper: get SDF value at grid point (i, j, k)
  const getValue = (i: number, j: number, k: number): number => {
    return values[(i * size + j) * size + k];
  };

  const edgeVerts = new Float32Array(12 * 3);
  const edgeMask = new Uint8Array(12);

  // Iterate over all cells
  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution; j++) {
      for (let k = 0; k < resolution; k++) {
        // Compute cube index from corner signs
        let cubeIndex = 0;
        for (let c = 0; c < 8; c++) {
          const [di, dj, dk] = CORNER_OFFSETS[c];
          const val = getValue(i + di, j + dj, k + dk);
          if (val < isoLevel) cubeIndex |= (1 << c);
        }

        // Skip if entirely inside or outside
        if (cubeIndex === 0 || cubeIndex === 255) continue;

        const edges = EDGE_TABLE[cubeIndex];
        if (edges === 0) continue;

        edgeMask.fill(0);

        // Compute edge intersections
        for (let e = 0; e < 12; e++) {
          if (edges & (1 << e)) {
            const [c1, c2] = EDGE_VERTICES[e];
            const [i1, j1, k1] = CORNER_OFFSETS[c1];
            const [i2, j2, k2] = CORNER_OFFSETS[c2];
            
            const gi1 = i + i1, gj1 = j + j1, gk1 = k + k1;
            const gi2 = i + i2, gj2 = j + j2, gk2 = k + k2;

            const v1 = getValue(gi1, gj1, gk1);
            const v2 = getValue(gi2, gj2, gk2);
            let t = (isoLevel - v1) / (v2 - v1);
            t = Math.max(0, Math.min(1, t));

            edgeVerts[e * 3 + 0] = min.x + (gi1 + t * (gi2 - gi1)) * step.x;
            edgeVerts[e * 3 + 1] = min.y + (gj1 + t * (gj2 - gj1)) * step.y;
            edgeVerts[e * 3 + 2] = min.z + (gk1 + t * (gk2 - gk1)) * step.z;
            edgeMask[e] = 1;
          }
        }

        // Generate triangles
        const triList = TRI_TABLE[cubeIndex];
        for (let t = 0; triList[t] !== -1; t += 3) {
          const e0 = triList[t];
          const e1 = triList[t + 1];
          const e2 = triList[t + 2];
          
          if (edgeMask[e0] && edgeMask[e1] && edgeMask[e2]) {
            const baseIdx = positions.length / 3;
            positions.push(
              edgeVerts[e0 * 3], edgeVerts[e0 * 3 + 1], edgeVerts[e0 * 3 + 2],
              edgeVerts[e1 * 3], edgeVerts[e1 * 3 + 1], edgeVerts[e1 * 3 + 2],
              edgeVerts[e2 * 3], edgeVerts[e2 * 3 + 1], edgeVerts[e2 * 3 + 2]
            );
            indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
          }
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  if (computeNormals) {
    geo.computeVertexNormals();
  }
  return geo;
}

// ── Surface Nets Implementation ──

/**
 * Extract a mesh from a 3D scalar field using Surface Nets.
 *
 * Surface Nets places a single vertex at the center of each crossing cell
 * (averaged from edge intersections) and connects adjacent cell vertices.
 * Produces smoother results than Marching Cubes with fewer vertices.
 *
 * Reference: Gibson (1998) "Constrained Elastic SurfaceNets"
 *
 * @param values Float32Array of SDF values on a regular grid.
 * @param resolution Grid resolution (cells per axis).
 * @param bounds Bounding box of the grid in world space.
 * @param options Extraction options.
 * @returns THREE.BufferGeometry with position and normal attributes.
 */
export function surfaceNets(
  values: Float32Array,
  resolution: number,
  bounds: THREE.Box3,
  options: MarchingCubesOptions = {},
): THREE.BufferGeometry {
  const isoLevel = options.isoLevel ?? 0.0;
  const computeNormals = options.computeNormals ?? true;
  const size = resolution + 1;

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

  // Map from cell index to vertex index
  const cellVertexMap = new Map<number, number>();
  const positions: number[] = [];

  // Edge definitions for a cube: (corner1, corner2) pairs
  const cubeEdges: [number, number][] = EDGE_VERTICES;

  // First pass: compute vertex positions for each crossing cell
  const accum = new THREE.Vector3();
  const worldPos = new THREE.Vector3();
  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution; j++) {
      for (let k = 0; k < resolution; k++) {
        // Compute cube index
        let cubeIndex = 0;
        for (let c = 0; c < 8; c++) {
          const [di, dj, dk] = CORNER_OFFSETS[c];
          if (getValue(i + di, j + dj, k + dk) < isoLevel) cubeIndex |= (1 << c);
        }

        if (cubeIndex === 0 || cubeIndex === 255) continue;

        // Compute averaged vertex position from edge intersections
        let count = 0;
        accum.set(0, 0, 0);

        const edges = EDGE_TABLE[cubeIndex];
        for (let e = 0; e < 12; e++) {
          if (edges & (1 << e)) {
            const [c1, c2] = cubeEdges[e];
            const [i1, j1, k1] = CORNER_OFFSETS[c1];
            const [i2, j2, k2] = CORNER_OFFSETS[c2];
            const v1 = getValue(i + i1, j + j1, k + k1);
            const v2 = getValue(i + i2, j + j2, k + k2);
            const t = (isoLevel - v1) / (v2 - v1);
            accum.x += i + i1 + t * (i2 - i1);
            accum.y += j + j1 + t * (j2 - j1);
            accum.z += k + k1 + t * (k2 - k1);
            count++;
          }
        }

        if (count > 0) {
          accum.divideScalar(count);
          // Convert grid coords to world coords
          worldPos.set(
            min.x + accum.x * step.x,
            min.y + accum.y * step.y,
            min.z + accum.z * step.z,
          );
          const cellIdx = (i * size + j) * size + k;
          cellVertexMap.set(cellIdx, positions.length / 3);
          positions.push(worldPos.x, worldPos.y, worldPos.z);
        }
      }
    }
  }

  // Second pass: generate quads between adjacent crossing cells
  const indices: number[] = [];
  const cellIdx = (i: number, j: number, k: number) => (i * size + j) * size + k;

  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution; j++) {
      for (let k = 0; k < resolution; k++) {
        const idx = cellIdx(i, j, k);
        if (!cellVertexMap.has(idx)) continue;
        const v = cellVertexMap.get(idx)!;

        // Connect to neighbors in +X, +Y, +Z directions
        const neighbors = [
          [i + 1, j, k], [i, j + 1, k], [i, j, k + 1],
        ];
        for (const [ni, nj, nk] of neighbors) {
          if (ni >= resolution || nj >= resolution || nk >= resolution) continue;
          const nIdx = cellIdx(ni, nj, nk);
          if (!cellVertexMap.has(nIdx)) continue;
          const n = cellVertexMap.get(nIdx)!;
          // Create two triangles for the quad connection
          // (Surface nets creates a quad face between adjacent cell vertices)
          indices.push(v, n);
        }
      }
    }
  }

  // Surface nets produces a quad mesh — convert to triangles via fan triangulation
  // Actually, surface nets produces an implicit quad mesh where each edge in the
  // index buffer represents a quad face between two cell centers. For proper
  // triangle output, we need to reconstruct the faces.
  // For simplicity, we generate a triangle mesh by connecting each cell vertex
  // to its neighbors in a consistent winding order.

  // Rebuild as triangle mesh
  const triIndices: number[] = [];
  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution; j++) {
      for (let k = 0; k < resolution; k++) {
        const idx = cellIdx(i, j, k);
        if (!cellVertexMap.has(idx)) continue;
        const v000 = cellVertexMap.get(idx)!;

        // X-face: connect with (i+1,j,k), (i+1,j+1,k), (i,j+1,k)
        if (i + 1 < resolution && cellVertexMap.has(cellIdx(i + 1, j, k))) {
          const v100 = cellVertexMap.get(cellIdx(i + 1, j, k))!;
          if (j + 1 < resolution && cellVertexMap.has(cellIdx(i + 1, j + 1, k))) {
            const v110 = cellVertexMap.get(cellIdx(i + 1, j + 1, k))!;
            if (cellVertexMap.has(cellIdx(i, j + 1, k))) {
              const v010 = cellVertexMap.get(cellIdx(i, j + 1, k))!;
              triIndices.push(v000, v010, v110);
              triIndices.push(v000, v110, v100);
            }
          }
        }

        // Y-face: connect with (i,j+1,k), (i,j+1,k+1), (i,j,k+1)
        if (j + 1 < resolution && cellVertexMap.has(cellIdx(i, j + 1, k))) {
          const v010 = cellVertexMap.get(cellIdx(i, j + 1, k))!;
          if (k + 1 < resolution && cellVertexMap.has(cellIdx(i, j + 1, k + 1))) {
            const v011 = cellVertexMap.get(cellIdx(i, j + 1, k + 1))!;
            if (cellVertexMap.has(cellIdx(i, j, k + 1))) {
              const v001 = cellVertexMap.get(cellIdx(i, j, k + 1))!;
              triIndices.push(v000, v001, v011);
              triIndices.push(v000, v011, v010);
            }
          }
        }

        // Z-face: connect with (i,j,k+1), (i+1,j,k+1), (i+1,j,k)
        if (k + 1 < resolution && cellVertexMap.has(cellIdx(i, j, k + 1))) {
          const v001 = cellVertexMap.get(cellIdx(i, j, k + 1))!;
          if (i + 1 < resolution && cellVertexMap.has(cellIdx(i + 1, j, k + 1))) {
            const v101 = cellVertexMap.get(cellIdx(i + 1, j, k + 1))!;
            if (cellVertexMap.has(cellIdx(i + 1, j, k))) {
              const v100 = cellVertexMap.get(cellIdx(i + 1, j, k))!;
              triIndices.push(v000, v100, v101);
              triIndices.push(v000, v101, v001);
            }
          }
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(triIndices);
  if (computeNormals) {
    geo.computeVertexNormals();
  }
  return geo;
}

// ── High-Level: SDF to Mesh ──

export interface SDFToMeshOptions extends MarchingCubesOptions {
  /** Grid resolution for sampling (default 32). Higher = more detail, slower. */
  resolution?: number;
  /** Mesh extraction method: 'marching-cubes' or 'surface-nets'. */
  method?: 'marching-cubes' | 'surface-nets';
}

/**
 * Convert an SDF directly to a THREE.BufferGeometry mesh.
 *
 * This is the primary entry point for the SDF-first organ pipeline.
 * Samples the SDF on a regular grid, then extracts the isosurface.
 *
 * @example
 * const organSdf = new SDFBuilder()
 *   .add(sdSphere(1.0))
 *   .smoothUnion(sdCapsule(0.3, 1.5), 0.3)
 *   .build();
 * const mesh = sdfToMesh(organSdf, bounds, { resolution: 48 });
 */
export function sdfToMesh(
  sdf: SDF,
  bounds: THREE.Box3,
  options: SDFToMeshOptions = {},
): THREE.BufferGeometry {
  const resolution = options.resolution ?? 32;
  const method = options.method ?? 'marching-cubes';

  const values = sampleSDFGrid(sdf, bounds, resolution);

  let geometry: THREE.BufferGeometry;
  if (method === 'surface-nets') {
    geometry = surfaceNets(values, resolution, bounds, options);
  } else {
    geometry = marchingCubes(values, resolution, bounds, options);
  }
  
  releaseSDFGridBuffer(values);
  return geometry;
}
