export type LoftProfile = 'trilobed' | 'spine' | 'circular' | 'star';
export type SymmetryType = 'bilateral' | 'radial-5' | 'radial-3' | 'biradial' | 'spherical' | 'asymmetrical';
export type ViewMode = 'organic' | 'wireframe' | 'xray';
export type AnatomyLayer = 'full' | 'exoskeleton' | 'vascular' | 'organs' | 'muscular';
export type ThemeKey = 'acid' | 'void' | 'blood' | 'abyssal';

export interface AppState {
  seed: number;
  length: number;
  segments: number;
  thoraxWidth: number;
  plateCoverage: number;
  tentaclePairs: number;
  ribSpines: number;
  eyePods: number;
  sporeSacs: number;
  bioThrusters: number;
  habitatChambers: number;   // Square-ish human living rooms/habitat sacs (0 to 8)
  neuralNodes: number;
  
  // Biological Symmetry & Morphology
  symmetryType: SymmetryType;

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

  theme: ThemeKey;
  pulseAnim: boolean;
  waveAnim: boolean;
  autoRotate: boolean;
  viewMode: ViewMode;
  anatomyLayer: AnatomyLayer;
  audioEnabled: boolean;
  
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

