// Neural Compute Architecture — Brain scaling, compute pipeline, efficiency curve
// Spec: docs/research/NEURAL_COMPUTE_ARCHITECTURE.md
//
// Implements Haller's Rule + Jerison allometry for brain sizing, ganglion
// compute generation, nerve bandwidth/delay/cost, and the Yerkes-Dodson
// inverted-U efficiency curve.

// ── Brain scaling constants ──
export const REFERENCE_SHIP_VOLUME = 108.6;     // smallest ship (6m x 2.4m x 2.4m x pi)
export const MAX_EQ = 7.0;
export const MIN_EQ = 3.0;
export const JERISON_K = 0.12;
export const JERISON_BETA = 0.67;
export const NEURON_DENSITY = 86e9;             // neurons per m^3 (human brain density)
export const BITS_PER_NEURON = 5;               // bits/s per neuron (conservative)
export const MIN_BRAIN_RADIUS = 0.3;            // minimum visible radius (meters)
export const GANGLION_EFFICIENCY_FACTOR = 0.10; // ganglia produce 10% of brain per-volume

// ── Nerve properties ──
export const AXON_DENSITY = 1e6;                // axons per mm^2
export const CONDUCTION_VELOCITY = 120;         // m/s (myelinated equivalent)
export const MAX_BRANCH_LENGTH_RATIO = 0.15;    // 15% of ship length
export const BRANCHING_ANGLE = 83;              // degrees (biological optimum)
export const BASE_NERVE_RADIUS = 0.04;          // meters

// ── Efficiency curve thresholds ──
export const SHUTDOWN_THRESHOLD = 0.25;
export const HEAVY_LOSS_THRESHOLD = 0.50;
export const NORMAL_THRESHOLD = 1.00;
export const ENHANCED_THRESHOLD = 1.20;
export const OVERSTIMULATION_FLOOR = 0.50;

// ── Metabolic constants ──
export const BRAIN_METABOLIC_MULTIPLIER = 22;   // x muscle metabolic rate
export const METABOLIC_STRAIN_THRESHOLD = 0.25; // 25% of energy budget
export const METABOLIC_UNDERINVESTMENT_THRESHOLD = 0.10; // 10%

// ── Aggregated constants object (spec requirement) ──
export const NEURAL_CONSTANTS = {
  REFERENCE_SHIP_VOLUME,
  MAX_EQ,
  MIN_EQ,
  JERISON_K,
  JERISON_BETA,
  NEURON_DENSITY,
  BITS_PER_NEURON,
  MIN_BRAIN_RADIUS,
  GANGLION_EFFICIENCY_FACTOR,
  AXON_DENSITY,
  CONDUCTION_VELOCITY,
  MAX_BRANCH_LENGTH_RATIO,
  BRANCHING_ANGLE,
  BASE_NERVE_RADIUS,
  SHUTDOWN_THRESHOLD,
  HEAVY_LOSS_THRESHOLD,
  NORMAL_THRESHOLD,
  ENHANCED_THRESHOLD,
  OVERSTIMULATION_FLOOR,
  BRAIN_METABOLIC_MULTIPLIER,
  METABOLIC_STRAIN_THRESHOLD,
  METABOLIC_UNDERINVESTMENT_THRESHOLD,
} as const;

// ── Organ compute demand (relative units, from spec table §2.4) ──
export const ORGAN_COMPUTE_DEMAND: Record<string, number> = {
  eye: 2.0,          // High — visual processing, targeting
  spiracle: 0.5,     // Low — rhythmic autonomic control
  rib: 0.3,          // Low — proprioceptive feedback
  spore: 1.5,        // Medium-high — weapon timing, targeting
  tentacle: 1.8,     // High — FABRIK IK, motor control
  habitat: 0.8,      // Medium — life support monitoring
  pectoralFin: 1.2,  // Medium — flight control
  caudalFluke: 1.0,  // Medium — propulsion timing
  landingLimb: 1.0,  // Medium — locomotion
  dorsalSail: 0.6,   // Low-medium — stability adjustment
  heart: 1.0,        // Medium — circulatory regulation
  plasmaGland: 1.5,  // Medium-high — energy regulation
};

// ── Brain Scaling (Haller's Rule + Jerison Allometry) ──

/**
 * Calculate Encephalization Quotient (EQ) using Haller's Rule.
 * Smaller ships have proportionally larger brains (EQ clamped to [3, 7]).
 * EQ = clamp(7 * (referenceVolume / shipVolume)^(1/3), 3, 7)
 */
export function calculateBrainEQ(shipVolume: number): number {
  const eq = MAX_EQ * Math.pow(REFERENCE_SHIP_VOLUME / Math.max(shipVolume, REFERENCE_SHIP_VOLUME), 1 / 3);
  return Math.max(MIN_EQ, Math.min(MAX_EQ, eq));
}

/**
 * Calculate brain mass via Jerison's allometric power law.
 * brainMass = k * shipVolume^beta * EQ
 */
export function calculateBrainMass(shipVolume: number, eq: number): number {
  return JERISON_K * Math.pow(shipVolume, JERISON_BETA) * eq;
}

/**
 * Calculate brain radius from brain mass, assuming spherical brain with
 * neural density ~86B neurons/m^3. Minimum visible radius of 0.3m.
 * brainRadius = cbrt(brainMass / (4/3 * pi * neuralDensity))
 */
export function calculateBrainRadius(brainMass: number): number {
  const volume = brainMass / ((4 / 3) * Math.PI * NEURON_DENSITY);
  const radius = Math.cbrt(volume);
  return Math.max(MIN_BRAIN_RADIUS, radius);
}

/**
 * Calculate brain compute generation capacity (bits/s).
 * neuronCount = brainMass * neuronDensity
 * brainCompute = neuronCount * bitsPerNeuron
 */
export function calculateBrainCompute(brainMass: number): number {
  const neuronCount = brainMass * NEURON_DENSITY;
  return neuronCount * BITS_PER_NEURON;
}

/**
 * Calculate brain energy cost as a percentage of total energy budget.
 * Brain tissue uses 22x more energy per unit mass than muscle.
 * Expressed as a percentage of the total ship energy budget.
 */
export function calculateBrainEnergyCost(brainMass: number, totalEnergyBudget: number): number {
  if (totalEnergyBudget <= 0) return 0;
  // brainMass * metabolicMultiplier gives relative energy units;
  // normalize against the total budget and express as percentage.
  const brainEnergy = brainMass * BRAIN_METABOLIC_MULTIPLIER;
  return (brainEnergy / totalEnergyBudget) * 100;
}

// ── Ganglion Compute (Small Self-Generation) ──

/**
 * Calculate ganglion compute generation (bits/s).
 * Ganglia produce 10% of what the brain generates per equivalent volume
 * (ganglionEfficiencyFactor = 0.10).
 * ganglionCompute = ganglionVolume * neuronDensity * bitsPerNeuron * efficiencyFactor
 */
export function calculateGanglionCompute(ganglionVolume: number): number {
  const neuronCount = ganglionVolume * NEURON_DENSITY;
  return neuronCount * BITS_PER_NEURON * GANGLION_EFFICIENCY_FACTOR;
}

// ── Nerve Physical Properties ──

/**
 * Calculate nerve bandwidth (Shannon channel capacity, bits/s).
 * nerveBandwidth = nerveCrossSection * axonDensity * bitsPerAxon
 * where nerveCrossSection = pi * nerveRadius^2 (in mm^2)
 * nerveRadius is in meters; convert to mm for axon density.
 */
export function calculateNerveBandwidth(nerveRadius: number): number {
  const radiusMm = nerveRadius * 1000; // m -> mm
  const crossSectionMm2 = Math.PI * radiusMm * radiusMm;
  return crossSectionMm2 * AXON_DENSITY * BITS_PER_NEURON;
}

/**
 * Calculate nerve conduction delay (seconds).
 * nerveDelay = nerveLength / conductionVelocity
 */
export function calculateNerveDelay(nerveLength: number): number {
  return nerveLength / CONDUCTION_VELOCITY;
}

/**
 * Calculate nerve wire cost (Chklovskii model).
 * wireCost = nerveLength^2 * nerveDiameter^2
 */
export function calculateNerveCost(nerveLength: number, nerveDiameter: number): number {
  return nerveLength * nerveLength * nerveDiameter * nerveDiameter;
}

/**
 * Calculate maximum nerve branch length (15% of ship length).
 * Derived from 120 m/s * 50ms reflex = 6m on a 14m ship; scales proportionally.
 */
export function calculateMaxBranchLength(shipLength: number): number {
  return shipLength * MAX_BRANCH_LENGTH_RATIO;
}

// ── Efficiency Curve (Yerkes-Dodson Inverted-U) ──

/**
 * Calculate organ efficiency from supply ratio using the Yerkes-Dodson
 * inverted-U curve (spec §3.4).
 *
 *   r < 0.25         -> 0%   (organ shutdown — non-functional)
 *   0.25 <= r < 0.50 -> linear 20% -> 50%   (heavy loss)
 *   0.50 <= r < 1.00 -> linear 50% -> 100%  (normal ramp)
 *   r = 1.00         -> 100%  (normal, default state)
 *   1.00 < r <= 1.20 -> linear 100% -> 120% (enhanced — overclocked)
 *   r > 1.20         -> declining from 120% -> 80% -> 50% (overstimulated)
 */
export function organEfficiency(supplyRatio: number): number {
  if (supplyRatio < SHUTDOWN_THRESHOLD) return 0; // shutdown
  if (supplyRatio < HEAVY_LOSS_THRESHOLD) {
    // 20% -> 50%
    return 0.20 + 0.60 * (supplyRatio - SHUTDOWN_THRESHOLD) / (HEAVY_LOSS_THRESHOLD - SHUTDOWN_THRESHOLD);
  }
  if (supplyRatio < NORMAL_THRESHOLD) {
    // 50% -> 100%
    return 0.50 + 0.50 * (supplyRatio - HEAVY_LOSS_THRESHOLD) / (NORMAL_THRESHOLD - HEAVY_LOSS_THRESHOLD);
  }
  if (supplyRatio <= ENHANCED_THRESHOLD) {
    // 100% -> 120%
    return 1.00 + 1.00 * (supplyRatio - NORMAL_THRESHOLD) / (ENHANCED_THRESHOLD - NORMAL_THRESHOLD);
  }
  // Overstimulation: decline from 120% at r=1.2 to 50% at r=2.0
  const over = (supplyRatio - ENHANCED_THRESHOLD) / 0.80;
  return Math.max(OVERSTIMULATION_FLOOR, 1.20 - 0.70 * over);
}
