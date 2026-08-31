export type LoftProfile = 'trilobed' | 'spine' | 'circular' | 'star';
export type IntakeType = 'baleen-ram' | 'crushing-mandibles' | 'lamprey-siphon' | 'stealth-slit' | 'spore-filter';
export type SymmetryType = 'bilateral' | 'radial-5' | 'radial-3' | 'biradial' | 'spherical' | 'asymmetrical';
export type ViewMode = 'organic' | 'wireframe' | 'xray';
export type AnatomyLayer = 'full' | 'exoskeleton' | 'vascular' | 'organs' | 'muscular';
export type ThemeKey = 'acid' | 'void' | 'blood' | 'abyssal';

// ── Anatomical ship sections (longitudinal hull regions) ──
// Sections are defined by u-parameter ranges along the spine (0 = nose, 1 = tail tip).
// peakU (max girth) is typically ~0.30, so Thoracic spans the widest region.
export type ShipSection = 'cranial' | 'neck' | 'thoracic' | 'caudal' | 'tail';

export interface ShipSectionDef {
  id: ShipSection;
  label: string;
  uMin: number;
  uMax: number;
  color: number;      // 0xRRGGBB highlight color
  description: string;
}

export const SHIP_SECTIONS: ShipSectionDef[] = [
  { id: 'cranial',  label: 'Cranial',  uMin: 0.00, uMax: 0.15, color: 0x60a5fa, description: 'Domed head region — cranium, ocular pods, neural ganglion clusters.' },
  { id: 'neck',     label: 'Neck',     uMin: 0.15, uMax: 0.30, color: 0xfbbf24, description: 'Waist behind the head — transition from cranium to thoracic mass.' },
  { id: 'thoracic', label: 'Thoracic', uMin: 0.30, uMax: 0.65, color: 0x34d399, description: 'Maximum girth region — habitats, ribs, spiracles, heart, plasma glands.' },
  { id: 'caudal',   label: 'Caudal',   uMin: 0.65, uMax: 0.85, color: 0xf472b6, description: 'Tail body — spore sacs, tentacles, propulsion cowl.' },
  { id: 'tail',     label: 'Tail Tip', uMin: 0.85, uMax: 1.00, color: 0xa78bfa, description: 'Fine tail taper — thruster nozzles, caudal trunk terminus.' },
];

// Map a u-parameter (0 = nose, 1 = tail tip) to its ship section.
export function uToSection(u: number): ShipSection {
  for (const sec of SHIP_SECTIONS) {
    if (u >= sec.uMin && u < sec.uMax) return sec.id;
  }
  // u === 1.0 falls into the tail tip
  return 'tail';
}

export interface AppState {
  seed: number;
  length: number;
  segments: number;
  thoraxWidth: number;
  plateCoverage: number;
  tentaclePairs: number;
  ribSpines: number;
  eyePods: number;
  eyeStalkLength: number;   // Ocular stalk length in meters (0 = stalkless eyes flush on hull)
  sporeSacs: number;
  bioThrusters: number;
  habitatChambers: number;   // Square-ish human living rooms/habitat sacs (0 to 8)
  neuralNodes: number;

  // Supporting Appendages — hydrodynamic/aerodynamic organic shapes for
  // planetary landing, ocean navigation, and dense dust cloud traversal.
  pectoralFins: number;      // Manta-ray wings on thoracic flanks (0 to 4)
  caudalFlukes: number;      // Whale-tail horizontal flukes at tail tip (0 to 2)
  landingLimbs: number;      // Cephalopod-articulated ventral landing legs (0 to 6)
  appendageScale: number;    // Proportional scale multiplier for appendages
  dorsalSail: number;        // Sailfish-style dorsal stabilizer fin (0 to 3)
  
  // Biological Symmetry & Morphology
  symmetryType: SymmetryType;
  intakeType: IntakeType;

  // Biological Spine & Armor Features
  spinalArch: number;         // Spine vertical curvature (-5 to 5)
  plateOverlap: number;       // Overlapping chitin scale armor density
  vascularDensity: number;    // Glowing vein network conduits (0 to 12)
  spiracleCount: number;      // Respiratory flank vents (0 to 16)
  tendonDensity: number;      // Muscular connective fibers (0 to 20)
  fluidWobble: number;        // Bio-fluid agitation rate (0.5 to 3.0)

  // NURBS Engine
  nurbsDegree: number;
  loftProfile: LoftProfile;
  rationalWeight: number;
  gridResolution: number;
  showControlNet: boolean;
  showForceField: boolean;

  // Per-pipeline conduit visibility toggles (ORGAN_SYSTEMS.md §2)
  showConduitBioPlasma: boolean;
  showConduitHemolymph: boolean;
  showConduitNervous: boolean;
  showConduitLifeSupport: boolean;
  showConduitArmorDefense: boolean;

  // ── Biological System Debug Visibility ──
  // Individual toggles for each biological system's meshes. When off, that
  // system's organs, conduits, and appendages are not rendered. Used for
  // debugging symmetry, placement, and anatomical relationships per-system.
  showSystemHull: boolean;          // Main carapace NURBS surface mesh
  showSystemSkeletal: boolean;      // Vertebrae + chitin carapace plates
  showSystemVascular: boolean;      // Arteries, veins, aorta, vascular networks
  showSystemNeural: boolean;        // Brain, spinal cord, ganglia, neuro-link
  showSystemRespiratory: boolean;   // Spiracle gill vents
  showSystemCirculatory: boolean;   // Heart, hemolymph atrium
  showSystemBioPlasma: boolean;     // Plasma gland, bladder, trunk, disruptors
  showSystemLifeSupport: boolean;   // Intake maw, moss bed, habitats, stomata, hallways
  showSystemArmorDefense: boolean;  // Shield emitters, coagulation bed, caudal manifold
  showSystemSurfaceOrgans: boolean; // Ribs, eyes, spores, tentacles
  showSystemAppendages: boolean;    // Fins, flukes, landing limbs, dorsal sail
  showSystemPropulsion: boolean;    // Engine cowl, thruster nozzles, exhaust plumes
  showSystemMuscular: boolean;      // Biomechanical muscle tendon fibers
  showSystemLighting: boolean;      // Scene lights (key, fill, under, rim, core, hemi)
  showSystemParticles: boolean;     // Ambient spore + thruster particle systems
  showSystemOverlays: boolean;      // Anatomical section overlay bands
  showSystemDebug: boolean;         // Grid helper, symmetry bounding box, target reticle

  // ── Neural Compute Architecture toggles ──
  showSystemNeuralVentral: boolean; // Ventral nerve chain toggle (second cord at v=0.75)
  showCommandRoom: boolean;         // Command room toggle (pilot interface chamber)
  showNerveBranches: boolean;       // Nerve branch visibility toggle (ganglia -> organs)

  // Disruptor firing trigger
  fireDisruptors: number; // increment to trigger a firing event

  theme: ThemeKey;
  pulseAnim: boolean;
  waveAnim: boolean;
  autoRotate: boolean;
  viewMode: ViewMode;
  anatomyLayer: AnatomyLayer;
  audioEnabled: boolean;
  heartbeatEnabled: boolean;
  
  genomeA: AppState | null;
  genomeB: AppState | null;
}

export interface ThemeColors {
  carapace: number;
  flesh: number;
  glow: number;
  glowSecondary: number;
  bone: number;
  blood: number;
}

export type OrganPipelineType = 'BIO_PLASMA' | 'HEMOLYMPH' | 'NERVOUS' | 'LIFE_SUPPORT' | 'ARMOR_DEFENSE';
export type OrganPipelineRole = 'GENERATION' | 'STORAGE' | 'DISTRIBUTION' | 'EFFECTOR' | 'INTERFACE' | 'STRUCTURAL' | 'DEFENSE' | 'REPAIR';

// ── Organ Pipeline Graph Data Model (ORGAN_SYSTEMS.md §4) ──

export interface OrganPipelineNode {
  id: string;
  name: string;
  pipeline: OrganPipelineType;
  role: OrganPipelineRole;
  anatomicalLayer: AnatomyLayer;
  position: [number, number, number];
  upstreamNodeId?: string;
  downstreamNodeIds: string[];
  telemetry: {
    outputRate?: string;
    operatingPressure?: string;
    efficiencyCoherence?: string;
    baseEnergyCost?: number;
  };
}

export interface OrganConnectionLink {
  id: string;
  pipeline: OrganPipelineType;
  sourceNodeId: string;
  targetNodeId: string;
  conduitRadius: number;
  fluidOrSignalType: string;
  pathControlPoints: [number, number, number][];
}

export interface TargetNodeInfo {
  name: string;
  category?: string;
  desc: string;
  metabolicRate?: string;
  neuralFreq?: string;
  enzymaticPressure?: string;
  vascularDemand?: string;
  vascularFlowSupply?: string;
  connectedVeinBranch?: string;
  supportStatus?: string;
  requiredFluid?: string;
  clearanceRadius?: string;
  isInterceptable?: boolean;
  minFreeSpace?: string;
  habitationVolume?: string;
  crewCapacity?: string;

  // Anatomical section this organ belongs to (derived from its u-position)
  section?: ShipSection;

  baseEnergyCost?: number;
  energyStatus?: string;
  
  // Cyber-Organic Bio-Telemetry Extensions
  speciesClass?: string;
  neuralSyncCoherence?: string;
  hemolymphStrokePressure?: string;
  photosyntheticO2Yield?: string;
  naniteCoagulationVelocity?: string;
  radiotrophicAbsorption?: string;
  siphonThrustImpulse?: string;
  biomechanicalLore?: string;

  // Closed-Loop Organ Pipeline Graph Fields
  pipeline?: OrganPipelineType;
  role?: OrganPipelineRole;
  upstreamNodeName?: string;
  downstreamNodeNames?: string[];
  operatingPressure?: string;
  outputCapacity?: string;
}

export interface PresetOption {
  id: string;
  name: string;
  speciesClass: string;
  lore: string;
  config: Partial<AppState>;
}

