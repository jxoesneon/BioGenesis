/**
 * Procedural Noise Module
 *
 * Implements noise functions for organic surface displacement and pattern
 * generation, as recommended in
 * docs/research/PROCEDURAL_MESH_GENERATION_RESEARCH.md §2.2.
 *
 * Includes:
 *   - Simplex noise (2D, 3D) — Gustavson 2005
 *   - Worley/cellular noise (2D, 3D) — Worley 1996
 *   - Fractal Brownian Motion (fBm)
 *   - Domain warping
 *   - Multifractures (ridged, turbulence)
 *
 * References:
 *   - Stefan Gustavson: "Simplex noise demystified" (2005)
 *   - Steven Worley: "A Cellular Texture Basis Function" (SIGGRAPH 1996)
 *   - Inigo Quilez: "fbm" and "domain warping" articles
 *   - Ken Perlin: "Improving Noise" (SIGGRAPH 2002)
 */

// ── Simplex Noise (3D) ──
// Based on Stefan Gustavson's implementation.

const grad3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

const perm = new Uint8Array(512);
const permMod12 = new Uint8Array(512);

function seedPermutation(seed: number): void {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;

  // Fisher-Yates shuffle with seeded PRNG
  let s = seed | 0;
  const next = () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) / 4294967296);
  };

  for (let i = 255; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }

  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }
}

// Initialize with default seed
seedPermutation(0);

/**
 * Re-seed the noise permutation table.
 * Call this at startup with the ship's seed for deterministic variation.
 */
export function reseedNoise(seed: number): void {
  seedPermutation(seed);
}

// Simplex 3D skew/unskew factors
const F3 = 1.0 / 3.0;
const G3 = 1.0 / 6.0;

/**
 * 3D Simplex noise. Returns value in range [-1, 1].
 * O(n²) complexity — preferred over Perlin for 3D.
 */
export function simplex3D(x: number, y: number, z: number): number {
  const s = (x + y + z) * F3;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const k = Math.floor(z + s);

  const t = (i + j + k) * G3;
  const X0 = i - t;
  const Y0 = j - t;
  const Z0 = k - t;
  const x0 = x - X0;
  const y0 = y - Y0;
  const z0 = z - Z0;

  // Determine which simplex cell we're in
  let i1, j1, k1;
  let i2, j2, k2;
  if (x0 >= y0) {
    if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
    else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
  } else {
    if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
    else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
    else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
  }

  const x1 = x0 - i1 + G3;
  const y1 = y0 - j1 + G3;
  const z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2 * G3;
  const y2 = y0 - j2 + 2 * G3;
  const z2 = z0 - k2 + 2 * G3;
  const x3 = x0 - 1 + 3 * G3;
  const y3 = y0 - 1 + 3 * G3;
  const z3 = z0 - 1 + 3 * G3;

  const ii = i & 255;
  const jj = j & 255;
  const kk = k & 255;
  const gi0 = permMod12[ii + perm[jj + perm[kk]]] * 3;
  const gi1 = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
  const gi2 = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
  const gi3 = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;

  let n0 = 0, n1 = 0, n2 = 0, n3 = 0;
  let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
  if (t0 >= 0) {
    t0 *= t0;
    n0 = t0 * t0 * (grad3[gi0] * x0 + grad3[gi0 + 1] * y0 + grad3[gi0 + 2] * z0);
  }
  let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
  if (t1 >= 0) {
    t1 *= t1;
    n1 = t1 * t1 * (grad3[gi1] * x1 + grad3[gi1 + 1] * y1 + grad3[gi1 + 2] * z1);
  }
  let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
  if (t2 >= 0) {
    t2 *= t2;
    n2 = t2 * t2 * (grad3[gi2] * x2 + grad3[gi2 + 1] * y2 + grad3[gi2 + 2] * z2);
  }
  let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
  if (t3 >= 0) {
    t3 *= t3;
    n3 = t3 * t3 * (grad3[gi3] * x3 + grad3[gi3 + 1] * y3 + grad3[gi3 + 2] * z3);
  }

  return 32.0 * (n0 + n1 + n2 + n3);
}

/**
 * 2D Simplex noise. Returns value in range [-1, 1].
 */
export function simplex2D(x: number, y: number): number {
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * G2;
  const X0 = i - t;
  const Y0 = j - t;
  const x0 = x - X0;
  const y0 = y - Y0;
  let i1, j1;
  if (x0 > y0) { i1 = 1; j1 = 0; }
  else { i1 = 0; j1 = 1; }
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;
  const ii = i & 255;
  const jj = j & 255;
  const gi0 = permMod12[ii + perm[jj]] * 3;
  const gi1 = permMod12[ii + i1 + perm[jj + j1]] * 3;
  const gi2 = permMod12[ii + 1 + perm[jj + 1]] * 3;
  let n0 = 0, n1 = 0, n2 = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 >= 0) {
    t0 *= t0;
    n0 = t0 * t0 * (grad3[gi0] * x0 + grad3[gi0 + 1] * y0);
  }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 >= 0) {
    t1 *= t1;
    n1 = t1 * t1 * (grad3[gi1] * x1 + grad3[gi1 + 1] * y1);
  }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 >= 0) {
    t2 *= t2;
    n2 = t2 * t2 * (grad3[gi2] * x2 + grad3[gi2 + 1] * y2);
  }
  return 70.0 * (n0 + n1 + n2);
}

// ── Worley / Cellular Noise (3D) ──

/**
 * 3D Worley noise (F1 — distance to nearest feature point).
 * Returns value in range [0, ~1.5].
 *
 * Generates cellular patterns useful for crusty organic textures
 * (chitin, carapace, barnacle-like surfaces).
 */
export function worley3D(x: number, y: number, z: number, density: number = 1.0): number {
  const cellSize = 1.0 / density;
  const ix = Math.floor(x * density);
  const iy = Math.floor(y * density);
  const iz = Math.floor(z * density);

  let minDist = Infinity;

  // Check 3x3x3 neighborhood of cells
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx;
        const cy = iy + dy;
        const cz = iz + dz;

        // Hash to get a deterministic feature point within the cell
        const h = hash3D(cx, cy, cz);
        const fx = (cx + h.x) / density;
        const fy = (cy + h.y) / density;
        const fz = (cz + h.z) / density;

        const d = (fx - x) ** 2 + (fy - y) ** 2 + (fz - z) ** 2;
        if (d < minDist) minDist = d;
      }
    }
  }

  return Math.sqrt(minDist) * density;
}

/**
 * 3D Worley noise F2 — distance to second-nearest feature point.
 * F2-F1 gives a "cell boundary" pattern.
 */
export function worley3DF2(x: number, y: number, z: number, density: number = 1.0): number {
  const cellSize = 1.0 / density;
  const ix = Math.floor(x * density);
  const iy = Math.floor(y * density);
  const iz = Math.floor(z * density);

  let d1 = Infinity;
  let d2 = Infinity;

  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx;
        const cy = iy + dy;
        const cz = iz + dz;
        const h = hash3D(cx, cy, cz);
        const fx = (cx + h.x) / density;
        const fy = (cy + h.y) / density;
        const fz = (cz + h.z) / density;
        const d = (fx - x) ** 2 + (fy - y) ** 2 + (fz - z) ** 2;
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) {
          d2 = d;
        }
      }
    }
  }

  return Math.sqrt(d2) * density;
}

/** Hash function for Worley noise — returns a 3D point in [0,1) for each cell. */
function hash3D(x: number, y: number, z: number): { x: number; y: number; z: number } {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  const hx = (h & 0xFFFF) / 65536;
  h = (h * 374761393 + 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  const hy = (h & 0xFFFF) / 65536;
  h = (h * 374761393 + 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  const hz = (h & 0xFFFF) / 65536;
  return { x: hx, y: hy, z: hz };
}

// ── Fractal Brownian Motion (fBm) ──

export interface FBmOptions {
  /** Number of octaves (4-8 for real-time, up to 12 for offline). */
  octaves?: number;
  /** Frequency multiplier per octave (typically 2.0). */
  lacunarity?: number;
  /** Amplitude multiplier per octave (typically 0.5). */
  persistence?: number;
  /** Base frequency (scale of the noise). */
  frequency?: number;
  /** Base amplitude. */
  amplitude?: number;
}

/**
 * Fractal Brownian Motion — sums multiple octaves of Simplex noise.
 * Returns value in range [-amplitude, amplitude] (approximately).
 *
 * Formula: Σ amplitude_i * noise(frequency_i * p)
 *
 * @example
 * const h = fbm3D(x, y, z, { octaves: 6, lacunarity: 2.0, persistence: 0.5 });
 */
export function fbm3D(x: number, y: number, z: number, opts: FBmOptions = {}): number {
  const octaves = opts.octaves ?? 6;
  const lacunarity = opts.lacunarity ?? 2.0;
  const persistence = opts.persistence ?? 0.5;
  const baseFreq = opts.frequency ?? 1.0;
  const baseAmp = opts.amplitude ?? 1.0;

  let value = 0;
  let freq = baseFreq;
  let amp = baseAmp;
  let maxAmp = 0;

  for (let i = 0; i < octaves; i++) {
    value += amp * simplex3D(x * freq, y * freq, z * freq);
    maxAmp += amp;
    freq *= lacunarity;
    amp *= persistence;
  }

  return value / maxAmp;
}

/**
 * 2D fBm for surface texture generation.
 */
export function fbm2D(x: number, y: number, opts: FBmOptions = {}): number {
  const octaves = opts.octaves ?? 6;
  const lacunarity = opts.lacunarity ?? 2.0;
  const persistence = opts.persistence ?? 0.5;
  const baseFreq = opts.frequency ?? 1.0;
  const baseAmp = opts.amplitude ?? 1.0;

  let value = 0;
  let freq = baseFreq;
  let amp = baseAmp;
  let maxAmp = 0;

  for (let i = 0; i < octaves; i++) {
    value += amp * simplex2D(x * freq, y * freq);
    maxAmp += amp;
    freq *= lacunarity;
    amp *= persistence;
  }

  return value / maxAmp;
}

// ── Ridged Multifractal ──

/**
 * Ridged multifractal noise — creates ridge-like patterns.
 * Useful for mountain-like organic protrusions and spine ridges.
 *
 * Formula: Σ amp * (1 - |noise|)² per octave
 */
export function ridged3D(x: number, y: number, z: number, opts: FBmOptions = {}): number {
  const octaves = opts.octaves ?? 6;
  const lacunarity = opts.lacunarity ?? 2.0;
  const persistence = opts.persistence ?? 0.5;
  const baseFreq = opts.frequency ?? 1.0;
  const baseAmp = opts.amplitude ?? 1.0;

  let value = 0;
  let freq = baseFreq;
  let amp = baseAmp;
  let maxAmp = 0;

  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(simplex3D(x * freq, y * freq, z * freq));
    value += amp * n * n;
    maxAmp += amp;
    freq *= lacunarity;
    amp *= persistence;
  }

  return value / maxAmp;
}

// ── Turbulence ──

/**
 * Turbulence noise — sum of absolute values of noise octaves.
 * Creates chaotic, swirling patterns useful for fluid-like textures.
 */
export function turbulence3D(x: number, y: number, z: number, opts: FBmOptions = {}): number {
  const octaves = opts.octaves ?? 6;
  const lacunarity = opts.lacunarity ?? 2.0;
  const persistence = opts.persistence ?? 0.5;
  const baseFreq = opts.frequency ?? 1.0;
  const baseAmp = opts.amplitude ?? 1.0;

  let value = 0;
  let freq = baseFreq;
  let amp = baseAmp;
  let maxAmp = 0;

  for (let i = 0; i < octaves; i++) {
    value += amp * Math.abs(simplex3D(x * freq, y * freq, z * freq));
    maxAmp += amp;
    freq *= lacunarity;
    amp *= persistence;
  }

  return value / maxAmp;
}

// ── Domain Warping ──

/**
 * Domain warping — distorts the input domain before sampling noise.
 * Creates organic, swirling patterns ideal for bioluminescent surface modulation.
 *
 * Formula: f(p + fbm(p + fbm(p)))
 *
 * @example
 * const w = domainWarp3D(x, y, z, { warpStrength: 0.5 });
 */
export function domainWarp3D(
  x: number,
  y: number,
  z: number,
  opts: FBmOptions & { warpStrength?: number } = {},
): number {
  const warpStrength = opts.warpStrength ?? 0.5;
  const warpFreq = opts.frequency ?? 1.0;

  // First warp pass
  const wx = fbm3D(x * warpFreq + 5.2, y * warpFreq + 1.3, z * warpFreq, { octaves: 3, frequency: warpFreq });
  const wy = fbm3D(x * warpFreq + 8.3, y * warpFreq + 2.8, z * warpFreq, { octaves: 3, frequency: warpFreq });
  const wz = fbm3D(x * warpFreq + 3.7, y * warpFreq + 6.1, z * warpFreq, { octaves: 3, frequency: warpFreq });

  // Second warp pass (nested)
  const wx2 = fbm3D(x * warpFreq + wx * warpStrength + 9.2, y * warpFreq + wy * warpStrength + 4.3, z * warpFreq + wz * warpStrength, { octaves: 3, frequency: warpFreq * 2 });

  // Final noise sample with warped domain
  return fbm3D(
    x + warpStrength * wx,
    y + warpStrength * wy,
    z + warpStrength * wz + warpStrength * wx2,
    opts,
  );
}

// ── Three.js Vector Adapters ──

/**
 * Simplex noise sampled at a THREE.Vector3 position.
 * Convenience wrapper for use with SDF displacement functions.
 */
export function noise3D(pos: { x: number; y: number; z: number }, frequency: number = 1.0): number {
  return simplex3D(pos.x * frequency, pos.y * frequency, pos.z * frequency);
}

/**
 * fBm noise sampled at a THREE.Vector3 position.
 * Returns a displacement function suitable for opDisplace().
 */
export function fbmDisplacement(
  frequency: number = 1.0,
  amplitude: number = 0.1,
  octaves: number = 6,
): (p: { x: number; y: number; z: number }) => number {
  return (p) => amplitude * fbm3D(p.x * frequency, p.y * frequency, p.z * frequency, { octaves });
}

/**
 * Worley noise displacement for crusty organic surfaces.
 */
export function worleyDisplacement(
  frequency: number = 1.0,
  amplitude: number = 0.1,
  density: number = 1.0,
): (p: { x: number; y: number; z: number }) => number {
  return (p) => amplitude * (worley3D(p.x * frequency, p.y * frequency, p.z * frequency, density) - 0.5);
}

/**
 * Domain-warped fBm displacement for bioluminescent organic patterns.
 */
export function warpedFbmDisplacement(
  frequency: number = 1.0,
  amplitude: number = 0.1,
  warpStrength: number = 0.5,
): (p: { x: number; y: number; z: number }) => number {
  return (p) => amplitude * domainWarp3D(p.x * frequency, p.y * frequency, p.z * frequency, { warpStrength, octaves: 4 });
}
