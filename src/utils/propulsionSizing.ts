/**
 * Propulsion Sizing — Dynamic Engine Scaling Model
 *
 * Implements allometric scaling of engine organs based on ship mass, energy
 * generation, and propulsion media type. Derived from research in:
 * - Biological allometric scaling (Kleiber's law, M^0.75 metabolic scaling)
 * - Squid jet propulsion (mantle diameter ∝ M^0.33, orifice area ∝ M^0.67)
 * - Rocket nozzle scaling (thrust ∝ throat area ∝ diameter²)
 * - Plasma propulsion (thrust-to-power ratio 0.01-0.1 N/kW)
 *
 * See: docs/research/PROPULSION_SCALING_RESEARCH.md
 */

import { AppState, IntakeType } from '../types';

// ── Biological tissue density (kg/m³) — average for wet biological tissue ──
const TISSUE_DENSITY = 1050;

// ── Hull fill factor — hull is not solid tissue; ~60% is organ/vascular/void ──
const HULL_FILL_FACTOR = 0.6;

// ── Cruise acceleration target (m/s²) — 0.01g for sustained interstellar cruise ──
const CRUISE_ACCELERATION = 0.098;

// ── Propulsion media characteristics per intake type ──
// Each intake type implies a different propulsion energy profile.
// Values derived from plasma/bio-plasma research:
// - Plasma thrust-to-power: 0.01-0.1 N/kW
// - Bioelectrogenesis: 10-400 W/kg tissue
// - Intake multiplier reflects energy availability for propulsion
interface PropulsionProfile {
  /** Energy-to-thrust conversion efficiency (N per kW of available power) */
  thrustPerPower: number;
  /** Exhaust velocity equivalent (m/s) — affects plume visual length */
  exhaustVelocity: number;
  /** Plume color temperature (K) — affects visual color */
  plumeTemperature: number;
  /** Relative engine mass fraction (engine mass / ship mass) */
  engineMassFraction: number;
}

const PROPULSION_PROFILES: Record<IntakeType, PropulsionProfile> = {
  'baleen-ram': {
    thrustPerPower: 0.08,       // High efficiency ram-scoop
    exhaustVelocity: 45000,     // High-velocity plasma exhaust
    plumeTemperature: 12000,    // Hot blue-white plasma
    engineMassFraction: 0.12,   // Large intake structures
  },
  'crushing-mandibles': {
    thrustPerPower: 0.06,       // Moderate — ore processing overhead
    exhaustVelocity: 35000,
    plumeTemperature: 9000,     // Amber-orange
    engineMassFraction: 0.15,   // Heavy mandible structures
  },
  'lamprey-siphon': {
    thrustPerPower: 0.05,       // Lower — parasitic drain
    exhaustVelocity: 30000,
    plumeTemperature: 8000,     // Warm amber
    engineMassFraction: 0.10,   // Lean siphon
  },
  'stealth-slit': {
    thrustPerPower: 0.04,       // Low — stealth sacrifices power
    exhaustVelocity: 25000,
    plumeTemperature: 6000,     // Dim red (low-profile)
    engineMassFraction: 0.08,   // Minimal engine profile
  },
  'spore-filter': {
    thrustPerPower: 0.07,       // Good — steady ambient collection
    exhaustVelocity: 40000,
    plumeTemperature: 10000,    // Cyan-green
    engineMassFraction: 0.11,   // Moderate filter structures
  },
};

/**
 * Estimate ship mass from hull geometry parameters.
 *
 * Uses the hull volume approximation:
 *   V_hull ≈ π × (thoraxWidth × 0.5)² × length × HULL_FILL_FACTOR
 *
 * Mass = V_hull × TISSUE_DENSITY + organ mass estimates
 *
 * This is a display/gameplay approximation, not a physics simulation.
 */
export function estimateShipMass(state: AppState): number {
  // Hull volume: approximate as a prolate spheroid truncated by the teardrop profile
  const maxRadius = state.thoraxWidth * 0.5;
  const hullVolume = Math.PI * maxRadius * maxRadius * state.length * HULL_FILL_FACTOR;

  // Organ mass: each organ type contributes mass
  const organMass =
    state.habitatChambers * 1500 +   // Habitat chambers: 1.5 tons each
    state.sporeSacs * 200 +          // Spore sacs: 200 kg each
    state.tentaclePairs * 300 +      // Tentacle pairs: 300 kg each
    state.ribSpines * 50 +           // Rib spines: 50 kg each
    state.bioThrusters * 500 +       // Thrusters: 500 kg each
    state.pectoralFins * 200 +       // Fins: 200 kg each
    state.caudalFlukes * 250 +       // Flukes: 250 kg each
    state.landingLimbs * 400 +       // Landing limbs: 400 kg each
    state.dorsalSail * 150 +         // Sails: 150 kg each
    state.neuralNodes * 30;          // Neural nodes: 30 kg each

  return hullVolume * TISSUE_DENSITY + organMass;
}

/**
 * Compute the propulsion profile for the ship's intake type.
 */
export function getPropulsionProfile(intakeType: IntakeType): PropulsionProfile {
  return PROPULSION_PROFILES[intakeType] ?? PROPULSION_PROFILES['lamprey-siphon'];
}

/**
 * Required thrust for cruise acceleration.
 *
 * F = m × a (Newton's second law)
 *
 * @param mass Ship mass in kg
 * @returns Required thrust in Newtons
 */
export function requiredThrust(mass: number): number {
  return mass * CRUISE_ACCELERATION;
}

/**
 * Available thrust from energy generation.
 *
 * F_available = power × thrustPerPower
 *
 * @param energyGeneration Available energy in "MW" (game units)
 * @param profile Propulsion profile
 * @returns Available thrust in arbitrary game units
 */
export function availableThrust(energyGeneration: number, profile: PropulsionProfile): number {
  // Convert game energy units to kW (1 game unit ≈ 100 kW)
  const powerKW = energyGeneration * 100;
  return powerKW * profile.thrustPerPower;
}

/**
 * Thrust-to-weight ratio.
 *
 * TWR = F_thrust / (m × g)
 *
 * A TWR > 1.0 means the ship can accelerate at >1g (very powerful).
 * For cruise, TWR ~0.01 is sufficient (0.01g sustained).
 */
export function thrustToWeightRatio(thrust: number, mass: number): number {
  return thrust / (mass * 9.81);
}

// ── Engine Geometry Sizing ──

export interface EngineGeometryParams {
  /** Cowl outer radius (m) — the engine housing radius */
  cowlRadius: number;
  /** Cowl inner radius (m) — the intake/aperture radius */
  cowlApertureRadius: number;
  /** Cowl height/depth (m) — how far the engine housing extends aft */
  cowlHeight: number;
  /** Caudal manifold radius (m) — the torus knot distribution manifold */
  manifoldRadius: number;
  /** Caudal manifold tube radius (m) */
  manifoldTubeRadius: number;
  /** Individual thruster scale factor (relative to base 1.0) */
  thrusterScale: number;
  /** Thruster nozzle major radius (m) */
  nozzleRadius: number;
  /** Thruster nozzle tube radius (m) */
  nozzleTubeRadius: number;
  /** Thruster plume length (m) — exhaust cone height */
  plumeLength: number;
  /** Thruster plume base radius (m) */
  plumeRadius: number;
  /** Socket collar radius (m) */
  socketRadius: number;
  /** Socket collar height (m) */
  socketHeight: number;
  /** Plume intensity multiplier (0.05-1.0, based on energy status) */
  plumeIntensity: number;
  /** Computed ship mass (kg) */
  shipMass: number;
  /** Required thrust (N) */
  requiredThrust: number;
  /** Available thrust (game units) */
  availableThrust: number;
  /** Thrust-to-weight ratio */
  twr: number;
}

/**
 * Compute all engine geometry parameters from ship state and energy.
 *
 * Scaling model (from research):
 * - Cowl radius ∝ M^0.33 (isometric diameter, from squid mantle scaling)
 * - Cowl height ∝ cowlRadius × 0.8 (squid mantle aspect ratio)
 * - Thruster scale ∝ √(cowlArea / thrusterCount) (thrust ∝ area)
 * - Manifold ∝ cowlRadius (proportional to engine)
 * - Plume length ∝ √(energy / thrusterCount) × exhaustVelocity factor
 *
 * @param state Application state
 * @param tailRadius Hull radius at the tail node
 * @param energyGeneration Available energy (game units)
 * @param energyLoad Total energy consumption (game units)
 * @returns Complete engine geometry parameter set
 */
export function computeEngineGeometry(
  state: AppState,
  tailRadius: number,
  energyGeneration: number,
  energyLoad: number,
): EngineGeometryParams {
  const mass = estimateShipMass(state);
  const profile = getPropulsionProfile(state.intakeType);
  const reqThrust = requiredThrust(mass);
  const availThrust = availableThrust(energyGeneration, profile);
  const twr = thrustToWeightRatio(availThrust, mass);

  const thrusterCount = Math.max(1, state.bioThrusters);

  // ── Cowl radius: allometric scaling ──
  // Cowl radius scales as M^0.33 (isometric diameter from squid mantle scaling)
  // but is clamped to be at least 1.4× the tail radius so the engine always
  // protrudes visibly from the stern.
  const massScale = Math.pow(mass / 1000, 0.33); // normalized to 1000 kg reference
  const allometricRadius = massScale * 0.6; // 0.6m per unit massScale
  const cowlRadius = Math.max(tailRadius * 1.4, allometricRadius);

  // ── Cowl aperture: squid orifice ratio ──
  // Squid orifice ratio Ω = d_orifice / d_body ≈ 0.10-0.24
  // We use 0.45 (larger than squid — this is a propulsion exhaust, not a jet)
  const cowlApertureRadius = cowlRadius * 0.45;

  // ── Cowl height: squid mantle aspect ratio ──
  // Mantle length ≈ 0.8× mantle diameter for efficient jet propulsion
  const cowlHeight = cowlRadius * 0.8;

  // ── Caudal manifold: proportional to engine ──
  const manifoldRadius = cowlRadius * 0.35;
  const manifoldTubeRadius = cowlRadius * 0.08;

  // ── Thruster sizing: thrust ∝ area, area shared among thrusters ──
  // Each thruster gets a proportional share of the cowl face area
  const cowlArea = Math.PI * cowlRadius * cowlRadius;
  const thrusterArea = cowlArea / thrusterCount;
  const thrusterBaseRadius = Math.sqrt(thrusterArea / Math.PI) * 0.6; // 60% packing efficiency

  // Thruster scale relative to the old hardcoded 0.8 reference
  const thrusterScale = Math.min(2.5, Math.max(0.3, thrusterBaseRadius / 0.8));

  // ── Component sizes derived from thrusterScale ──
  const nozzleRadius = 0.55 * thrusterScale;
  const nozzleTubeRadius = 0.18 * thrusterScale;
  const socketRadius = 0.62 * thrusterScale;
  const socketHeight = 0.45 * thrusterScale;
  const plumeRadius = 0.62 * thrusterScale;

  // ── Plume length: energy-coupled ──
  // Plume length scales with √(energy ratio) × exhaust velocity factor
  // Longer plume = more energy being expelled = more thrust visually
  const energyRatio = energyLoad > 0 ? energyGeneration / energyLoad : 1.0;
  const exhaustFactor = profile.exhaustVelocity / 30000; // normalized to baseline
  const plumeLength = 3.8 * thrusterScale * Math.sqrt(Math.min(2.0, energyRatio)) * exhaustFactor;

  // ── Plume intensity: energy status ──
  // OPTIMAL = full intensity, SUB_OPTIMAL = 60%, FAILING = flickering 20%, OFFLINE = 5%
  let plumeIntensity = 1.0;
  if (energyRatio < 0.4) plumeIntensity = 0.05;
  else if (energyRatio < 0.75) plumeIntensity = 0.2 + Math.random() * 0.2;
  else if (energyRatio < 1.0) plumeIntensity = 0.6;

  return {
    cowlRadius,
    cowlApertureRadius,
    cowlHeight,
    manifoldRadius,
    manifoldTubeRadius,
    thrusterScale,
    nozzleRadius,
    nozzleTubeRadius,
    socketRadius,
    socketHeight,
    plumeLength,
    plumeRadius,
    plumeIntensity,
    shipMass: mass,
    requiredThrust: reqThrust,
    availableThrust: availThrust,
    twr,
  };
}
