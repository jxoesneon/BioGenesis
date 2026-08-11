/**
 * Reaction-Diffusion Module — Gray-Scott Model
 *
 * Implements the Gray-Scott reaction-diffusion model for generating
 * bioluminescent surface patterns on the hull and organs, as recommended
 * in docs/research/PROCEDURAL_MESH_GENERATION_RESEARCH.md §4.1.
 *
 * The Gray-Scott model produces organic patterns (spots, stripes, mazes,
 * bubbles) that match the alien aesthetic described in LORE.md.
 *
 * Equations:
 *   ∂A/∂t = D_A ∇²A - AB² + f(1-A)
 *   ∂B/∂t = D_B ∇²B + AB² - (k+f)B
 *
 * Where:
 *   A = reactant concentration (high everywhere, depleted by reaction)
 *   B = catalyst concentration (low everywhere, grows where reaction occurs)
 *   D_A, D_B = diffusion rates
 *   f = feed rate (replenishes A)
 *   k = kill rate (removes B)
 *
 * Pattern types controlled by f and k:
 *   - Spots:     f=0.0367, k=0.0649
 *   - Stripes:   f=0.014,  k=0.045
 *   - Maze:      f=0.029,  k=0.057
 *   - Bubbles:   f=0.020,  k=0.049
 *   - Coral:     f=0.0545, k=0.062
 *   - Worms:     f=0.078,  k=0.061
 *
 * References:
 *   - Turing: "The Chemical Basis of Morphogenesis" (1952)
 *   - Gray & Scott: "Autocatalytic reactions in the isothermal" (1985)
 *   - Pearson: "Complex Patterns in a Simple System" (Science 1993)
 *   - Karlssof: "Reaction-Diffusion Textures" (1992)
 */

import * as THREE from 'three';

// ── Pattern Presets ──

export interface GrayScottParams {
  /** Feed rate — replenishes reactant A. */
  feed: number;
  /** Kill rate — removes catalyst B. */
  kill: number;
  /** Diffusion rate for A. */
  diffusionA: number;
  /** Diffusion rate for B. */
  diffusionB: number;
}

/**
 * Preset parameter sets for different pattern types.
 * These produce the characteristic organic patterns seen in nature.
 */
export const PATTERN_PRESETS: Record<string, GrayScottParams> = {
  spots:     { feed: 0.0367, kill: 0.0649, diffusionA: 1.0, diffusionB: 0.5 },
  stripes:   { feed: 0.014,  kill: 0.045,  diffusionA: 1.0, diffusionB: 0.5 },
  maze:      { feed: 0.029,  kill: 0.057,  diffusionA: 1.0, diffusionB: 0.5 },
  bubbles:   { feed: 0.020,  kill: 0.049,  diffusionA: 1.0, diffusionB: 0.5 },
  coral:     { feed: 0.0545, kill: 0.062,  diffusionA: 1.0, diffusionB: 0.5 },
  worms:     { feed: 0.078,  kill: 0.061,  diffusionA: 1.0, diffusionB: 0.5 },
  fingerprint: { feed: 0.034, kill: 0.061, diffusionA: 1.0, diffusionB: 0.5 },
  oscillating: { feed: 0.025, kill: 0.060, diffusionA: 1.0, diffusionB: 0.5 },
  // Bioluminescent presets for BioGenesis
  bioluminescent_veins: { feed: 0.022, kill: 0.051, diffusionA: 1.0, diffusionB: 0.5 },
  void_fauna_maze:      { feed: 0.028, kill: 0.055, diffusionA: 1.0, diffusionB: 0.5 },
  abyssal_spots:        { feed: 0.040, kill: 0.070, diffusionA: 1.0, diffusionB: 0.5 },
  acid_bubbles:         { feed: 0.018, kill: 0.047, diffusionA: 1.0, diffusionB: 0.5 },
};

// ── 2D Gray-Scott Simulation ──

/**
 * 2D Gray-Scott reaction-diffusion simulator.
 *
 * Runs on a regular 2D grid. The output can be used as a texture
 * for bioluminescent surface patterns on the hull.
 */
export class GrayScott2D {
  private width: number;
  private height: number;
  private a: Float32Array;
  private b: Float32Array;
  private nextA: Float32Array;
  private nextB: Float32Array;
  private params: GrayScottParams;

  constructor(width: number, height: number, params: GrayScottParams) {
    this.width = width;
    this.height = height;
    this.params = params;
    const size = width * height;
    this.a = new Float32Array(size).fill(1.0);
    this.b = new Float32Array(size).fill(0.0);
    this.nextA = new Float32Array(size);
    this.nextB = new Float32Array(size);
  }

  /**
   * Seed the simulation with catalyst B at specific locations.
   * @param x Center X coordinate.
   * @param y Center Y coordinate.
   * @param radius Seed radius.
   * @param amount Initial B concentration.
   */
  seed(x: number, y: number, radius: number = 5, amount: number = 1.0): void {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (px >= 0 && px < this.width && py >= 0 && py < this.height) {
          if (dx * dx + dy * dy <= radius * radius) {
            this.b[py * this.width + px] = amount;
          }
        }
      }
    }
  }

  /**
   * Seed with random noise across the grid.
   * @param count Number of random seed points.
   * @param radius Seed radius.
   * @param rng Optional random number generator.
   */
  seedRandom(count: number, radius: number = 3, rng?: () => number): void {
    const rand = rng ?? Math.random;
    for (let i = 0; i < count; i++) {
      const x = Math.floor(rand() * this.width);
      const y = Math.floor(rand() * this.height);
      this.seed(x, y, radius, 1.0);
    }
  }

  /**
   * Run one simulation step.
   * Uses a 9-point Laplacian stencil for diffusion.
   *
   * Laplacian weights:
   *   0.05  0.20  0.05
   *   0.20 -1.00  0.20
   *   0.05  0.20  0.05
   */
  step(dt: number = 1.0): void {
    const { feed, kill, diffusionA, diffusionB } = this.params;
    const w = this.width;
    const h = this.height;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;

        // 9-point Laplacian for A
        const xL = (x - 1 + w) % w;
        const xR = (x + 1) % w;
        const yU = (y - 1 + h) % h;
        const yD = (y + 1) % h;

        const lapA =
          0.05 * this.a[yU * w + xL] +
          0.20 * this.a[yU * w + x] +
          0.05 * this.a[yU * w + xR] +
          0.20 * this.a[y * w + xL] -
          1.00 * this.a[idx] +
          0.20 * this.a[y * w + xR] +
          0.05 * this.a[yD * w + xL] +
          0.20 * this.a[yD * w + x] +
          0.05 * this.a[yD * w + xR];

        const lapB =
          0.05 * this.b[yU * w + xL] +
          0.20 * this.b[yU * w + x] +
          0.05 * this.b[yU * w + xR] +
          0.20 * this.b[y * w + xL] -
          1.00 * this.b[idx] +
          0.20 * this.b[y * w + xR] +
          0.05 * this.b[yD * w + xL] +
          0.20 * this.b[yD * w + x] +
          0.05 * this.b[yD * w + xR];

        const aVal = this.a[idx];
        const bVal = this.b[idx];
        const reaction = aVal * bVal * bVal;

        this.nextA[idx] = aVal + (diffusionA * lapA - reaction + feed * (1 - aVal)) * dt;
        this.nextB[idx] = bVal + (diffusionB * lapB + reaction - (kill + feed) * bVal) * dt;

        // Clamp to valid range
        this.nextA[idx] = Math.max(0, Math.min(1, this.nextA[idx]));
        this.nextB[idx] = Math.max(0, Math.min(1, this.nextB[idx]));
      }
    }

    // Swap buffers
    [this.a, this.nextA] = [this.nextA, this.a];
    [this.b, this.nextB] = [this.nextB, this.b];
  }

  /**
   * Run multiple simulation steps.
   */
  run(steps: number, dt: number = 1.0): void {
    for (let i = 0; i < steps; i++) {
      this.step(dt);
    }
  }

  /**
   * Get the B concentration as a Float32Array.
   * B > 0.5 indicates pattern presence (bioluminescent glow).
   */
  getB(): Float32Array {
    return this.b;
  }

  /**
   * Get the A concentration as a Float32Array.
   */
  getA(): Float32Array {
    return this.a;
  }

  /**
   * Generate a THREE.DataTexture from the B concentration field.
   * The texture can be used as a bioluminescent pattern map on materials.
   *
   * @param glowColor Color for high-B areas (bioluminescent glow).
   * @param baseColor Color for low-B areas (base hull color).
   * @returns THREE.DataTexture ready for use as a material map.
   */
  toTexture(
    glowColor: THREE.Color = new THREE.Color(0x00ffaa),
    baseColor: THREE.Color = new THREE.Color(0x1a0a2e),
  ): THREE.DataTexture {
    const data = new Uint8Array(this.width * this.height * 4);
    for (let i = 0; i < this.width * this.height; i++) {
      const b = this.b[i];
      const a = this.a[i];
      // Blend between base and glow based on B concentration
      const t = Math.min(1, b * 2);
      const r = Math.round(baseColor.r * 255 * (1 - t) + glowColor.r * 255 * t);
      const g = Math.round(baseColor.g * 255 * (1 - t) + glowColor.g * 255 * t);
      const bl = Math.round(baseColor.b * 255 * (1 - t) + glowColor.b * 255 * t);
      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = bl;
      data[i * 4 + 3] = 255;
    }

    const texture = new THREE.DataTexture(data, this.width, this.height, THREE.RGBAFormat);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  /**
   * Generate an emissive map from the B concentration.
   * Only high-B areas emit light, creating the bioluminescent vein effect.
   */
  toEmissiveTexture(
    glowColor: THREE.Color = new THREE.Color(0x00ffaa),
    intensity: number = 2.0,
  ): THREE.DataTexture {
    const data = new Uint8Array(this.width * this.height * 4);
    for (let i = 0; i < this.width * this.height; i++) {
      const b = this.b[i];
      const t = Math.max(0, (b - 0.3) * intensity);
      const clamped = Math.min(1, t);
      data[i * 4] = Math.round(glowColor.r * 255 * clamped);
      data[i * 4 + 1] = Math.round(glowColor.g * 255 * clamped);
      data[i * 4 + 2] = Math.round(glowColor.b * 255 * clamped);
      data[i * 4 + 3] = 255;
    }

    const texture = new THREE.DataTexture(data, this.width, this.height, THREE.RGBAFormat);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }
}

// ── High-Level: Generate Bioluminescent Pattern Texture ──

/**
 * Generate a bioluminescent pattern texture for the hull or organs.
 *
 * This is the primary entry point for creating the organic, alien-looking
 * surface patterns described in LORE.md.
 *
 * @param width Texture width.
 * @param height Texture height.
 * @param preset Pattern preset name (see PATTERN_PRESETS).
 * @param options Generation options.
 * @returns Object with diffuse and emissive textures.
 *
 * @example
 * const { diffuse, emissive } = generateBioluminescentPattern(256, 256, 'void_fauna_maze', {
 *   glowColor: new THREE.Color(0x00ffaa),
 *   baseColor: new THREE.Color(0x1a0a2e),
 *   steps: 5000,
 * });
 */
export function generateBioluminescentPattern(
  width: number,
  height: number,
  preset: string = 'void_fauna_maze',
  options: {
    glowColor?: THREE.Color;
    baseColor?: THREE.Color;
    steps?: number;
    seedPoints?: number;
    seed?: number;
    intensity?: number;
  } = {},
): { diffuse: THREE.DataTexture; emissive: THREE.DataTexture } {
  const params = PATTERN_PRESETS[preset] ?? PATTERN_PRESETS.void_fauna_maze;
  const steps = options.steps ?? 5000;
  const seedPoints = options.seedPoints ?? 20;
  const intensity = options.intensity ?? 2.0;

  const sim = new GrayScott2D(width, height, params);

  // Seed with random points
  let s = options.seed ?? 42;
  const rng = () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) / 4294967296);
  };
  sim.seedRandom(seedPoints, 3, rng);

  // Run simulation
  sim.run(steps);

  // Generate textures
  const glowColor = options.glowColor ?? new THREE.Color(0x00ffaa);
  const baseColor = options.baseColor ?? new THREE.Color(0x1a0a2e);

  return {
    diffuse: sim.toTexture(glowColor, baseColor),
    emissive: sim.toEmissiveTexture(glowColor, intensity),
  };
}
