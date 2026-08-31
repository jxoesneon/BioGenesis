import React, { useState, useMemo } from 'react';
import {
  HeartPulse,
  Calculator,
  Dna,
  Crosshair,
  Layers,
  Search,
  ChevronDown,
  ChevronUp,
  Activity,
  Flame,
  Eye,
  Wind,
  Shield,
  Home,
  CheckCircle2,
  X,
  Waves,
  Brain,
  Users,
} from 'lucide-react';
import { AppState, TargetNodeInfo, ViewMode, AnatomyLayer, ShipSection, SHIP_SECTIONS } from '../types';
import { LCG } from '../utils/nurbs';
import { playScanChirp } from '../utils/audio';
import { PIPELINE_NAMES } from '../utils/pipelineGraph';
import { calculateEnergyGeneration, calculateEnergyConsumption, evaluateEnergyStatus, getOrganEnergyStatus } from '../utils/energy';
import { computeEngineGeometry } from '../utils/propulsionSizing';

// ── Neural compute telemetry helpers ──
// EQ (encephalization quotient) follows Haller's rule + Jerison allometry.
// Small ships carry proportionally larger brains and are metabolically strained;
// large ships are autonomous but value human direction.
// Reference: docs/research/NEURAL_COMPUTE_ARCHITECTURE.md
const NEURAL_REFERENCE_VOLUME = 108.6;

function computeShipVolume(length: number, thoraxWidth: number): number {
  // Approximate hull volume as an ellipsoidal capsule: length × thoraxWidth² × π × 0.8
  return length * thoraxWidth * thoraxWidth * Math.PI * 0.8;
}

function computeBrainEQ(length: number, thoraxWidth: number): number {
  const shipVolume = computeShipVolume(length, thoraxWidth);
  // EQ = clamp(7 × (referenceVolume / shipVolume)^(1/3), 3, 7)
  const ratio = Math.pow(NEURAL_REFERENCE_VOLUME / Math.max(shipVolume, 1), 1 / 3);
  return Math.min(7, Math.max(3, 7 * ratio));
}

function computeBrainEnergyPct(eq: number): number {
  // Brain energy budget: 20% at EQ 7 (smallest) down to 8% at EQ 3 (largest).
  // Linear interpolation: pct = 8 + (eq - 3) / (7 - 3) * (20 - 8)
  return 8 + ((eq - 3) / 4) * 12;
}

function computeNeuralStatus(eq: number): 'Metabolically Strained' | 'Normal' | 'Underinvested' {
  if (eq >= 6) return 'Metabolically Strained';
  if (eq >= 4) return 'Normal';
  return 'Underinvested';
}

// ── Crew complement helpers ──
// Crew capacity scales on integers (1-5) based on ship length.
// Reference: docs/research/COMMAND_ROOM_SPEC.md §2.1
function crewCapacity(shipLength: number): number {
  if (shipLength <= 7) return 1;
  if (shipLength <= 12) return 2;
  if (shipLength <= 17) return 3;
  if (shipLength <= 25) return 4;
  return 5;
}

const CREW_ROLES: string[] = [
  'Commander',
  'Helm',
  'Bio-Systems Officer',
  'Tactical',
  'Science/Sensors',
];

interface TelemetryPanelProps {
  state: AppState;
  targetNode: TargetNodeInfo | null;
  organList: TargetNodeInfo[];
  onSetViewMode: (mode: ViewMode) => void;
  onSetAnatomyLayer: (layer: AnatomyLayer) => void;
  onSelectTargetNode: (node: TargetNodeInfo | null) => void;
  onShowToast: (msg: string) => void;
  mobilePanel: 'genetics' | 'telemetry' | 'none';
  setMobilePanel: (panel: 'genetics' | 'telemetry' | 'none') => void;
  highlightedSection: ShipSection | null;
  onSetHighlightedSection: (section: ShipSection | null) => void;
}

type CategoryTab = 'ALL' | 'SECTIONS' | 'HABITATION' | 'CIRCULATORY' | 'PROPULSION' | 'SENSORY' | 'RESPIRATION' | 'WEAPONS' | 'APPENDAGES';

export const TelemetryPanel: React.FC<TelemetryPanelProps> = React.memo(({
  state,
  targetNode,
  organList,
  onSetViewMode,
  onSetAnatomyLayer,
  onSelectTargetNode,
  onShowToast,
  mobilePanel,
  setMobilePanel,
  highlightedSection,
  onSetHighlightedSection,
}) => {
  const [drawerOpen, setDrawerOpen] = useState<boolean>(true);
  const [selectedTab, setSelectedTab] = useState<CategoryTab>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const mass = Math.round(state.length * state.segments * state.thoraxWidth * 85);
  const bpm = Math.round(50 + state.neuralNodes * 1.5);
  const thrust = state.bioThrusters * 340;
  const neuralSync = Math.min(99.9, 92.0 + state.neuralNodes * 0.55).toFixed(1);
  const hemolymphPress = (11.5 + state.vascularDensity * 0.65).toFixed(1);
  const o2Yield = Math.round(state.habitatChambers * 95 + state.spiracleCount * 15);
  const naniteRepair = (0.75 + state.plateOverlap * 0.12).toFixed(2);
  const gammaAbs = Math.round(state.plateCoverage * 0.65 + 15);

  const energyGeneration = calculateEnergyGeneration(state);
  const energyConsumption = calculateEnergyConsumption(organList);
  const globalEnergyStatus = evaluateEnergyStatus(energyGeneration, energyConsumption);

  // Dynamic propulsion metrics from allometric scaling model
  const propulsionData = computeEngineGeometry(state, state.thoraxWidth * 0.5, energyGeneration, energyConsumption);
  const shipMassKg = Math.round(propulsionData.shipMass);
  const requiredThrustN = Math.round(propulsionData.requiredThrust);
  const twr = propulsionData.twr.toFixed(3);
  const cowlDiameter = (propulsionData.cowlRadius * 2).toFixed(1);
  const plumeIntensityPct = Math.round(propulsionData.plumeIntensity * 100);

  // Neural compute telemetry — brain EQ, energy budget, ganglion/nerve counts
  const brainEQ = computeBrainEQ(state.length, state.thoraxWidth);
  const brainEnergyPct = computeBrainEnergyPct(brainEQ);
  const neuralStatus = computeNeuralStatus(brainEQ);
  // Ganglion count tracks neural nodes (each node cluster hosts a ganglion)
  const ganglionCount = state.neuralNodes;
  // Nerve branches scale with ganglia and organ count (each ganglion branches to nearby organs)
  const nerveBranchCount = state.neuralNodes * 2 + Math.round(state.habitatChambers * 1.5);

  // Crew complement — scales 1-5 based on ship length
  const crewCount = crewCapacity(state.length);

  const numCrossU = state.segments + 1;
  const numCrossV = 8;
  const resGrid = state.gridResolution;

  // Procedural DNA sequence preview
  const bases = ['A', 'T', 'C', 'G'];
  let dnaStr = '';
  const tempRng = LCG(state.seed);
  for (let i = 0; i < 20; i++) {
    if (i > 0 && i % 4 === 0) dnaStr += '-';
    dnaStr += bases[Math.floor(tempRng() * 4)];
  }

  const getCategoryGroup = (cat?: string): CategoryTab => {
    if (!cat) return 'ALL';
    if (cat.includes('Habitation')) return 'HABITATION';
    if (cat.includes('Circulatory')) return 'CIRCULATORY';
    if (cat.includes('Propulsion')) return 'PROPULSION';
    if (cat.includes('Sensory') || cat.includes('Nervous')) return 'SENSORY';
    if (cat.includes('Respiratory')) return 'RESPIRATION';
    if (cat.includes('Supporting Appendage')) return 'APPENDAGES';
    if (cat.includes('Weapon') || cat.includes('Appendage') || cat.includes('Exoskeleton') || cat.includes('Frame')) return 'WEAPONS';
    return 'ALL';
  };

  const getCategoryIcon = (tab: CategoryTab) => {
    switch (tab) {
      case 'HABITATION': return <Home className="w-3 h-3 text-cyan-400" />;
      case 'CIRCULATORY': return <HeartPulse className="w-3 h-3 text-rose-400" />;
      case 'PROPULSION': return <Flame className="w-3 h-3 text-amber-400" />;
      case 'SENSORY': return <Eye className="w-3 h-3 text-cyan-400" />;
      case 'RESPIRATION': return <Wind className="w-3 h-3 text-blue-400" />;
      case 'WEAPONS': return <Shield className="w-3 h-3 text-violet-400" />;
      case 'APPENDAGES': return <Waves className="w-3 h-3 text-teal-400" />;
      case 'SECTIONS': return <Layers className="w-3 h-3 text-amber-400" />;
      default: return <Activity className="w-3 h-3 text-cyan-400" />;
    }
  };

  const filteredOrgans = useMemo(() => {
    return organList.filter((organ) => {
      const group = getCategoryGroup(organ.category);
      const matchesTab = selectedTab === 'ALL' || group === selectedTab;
      const matchesQuery =
        !searchQuery.trim() ||
        organ.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (organ.category && organ.category.toLowerCase().includes(searchQuery.toLowerCase())) ||
        organ.desc.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesTab && matchesQuery;
    });
  }, [organList, selectedTab, searchQuery]);

  const handleSelectOrgan = (organ: TargetNodeInfo) => {
    onSelectTargetNode(organ);
    playScanChirp(state.audioEnabled);
    onShowToast(`Highlighted on 3D: ${organ.name}`);
    if (window.innerWidth < 1024) {
      setMobilePanel('none');
    }
  };

  return (
    <aside id="inspectorPanel" className={`absolute top-24 lg:top-20 right-4 lg:right-6 bottom-28 lg:bottom-auto w-[calc(100%-2rem)] md:w-88 lg:w-88 z-20 bio-panel rounded-xl p-4 flex-col space-y-3 pointer-events-auto transition-opacity duration-300 overflow-y-auto lg:max-h-[calc(100vh-7rem)] ${mobilePanel === 'telemetry' ? 'flex' : 'hidden lg:flex'}`}>
      <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
        <h2 className="text-sm font-bold tracking-wider text-cyan-400 uppercase flex items-center gap-2">
          <HeartPulse className="w-4 h-4" /> Bio Telemetry & Dissection
        </h2>
        <div className="flex items-center gap-3">
          <span className="flex h-2 w-2 relative hidden sm:flex">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
          </span>
          <button className="lg:hidden p-1 rounded-md text-cyan-400 hover:bg-cyan-950/50" onClick={() => setMobilePanel('none')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="col-span-2 bg-cyan-950/40 p-2 rounded border border-cyan-500/10 flex flex-col gap-1">
          <div className="flex justify-between items-center px-1">
            <span className="text-[10px] text-cyan-400 uppercase">Energy Grid (MW)</span>
            <span className={`text-[10px] uppercase font-bold ${
              globalEnergyStatus === 'OPTIMAL' ? 'text-green-400' :
              globalEnergyStatus === 'SUB_OPTIMAL' ? 'text-yellow-400' :
              globalEnergyStatus === 'FAILING' ? 'text-orange-500' : 'text-red-500'
            }`}>{globalEnergyStatus.replace('_', ' ')}</span>
          </div>
          <div className="flex justify-between font-mono text-sm px-1">
            <span className="text-cyan-300">GEN: {energyGeneration.toFixed(1)}</span>
            <span className="text-cyan-300">/</span>
            <span className="text-cyan-300">LOAD: {energyConsumption.toFixed(1)}</span>
          </div>
        </div>
        <div className="bg-cyan-950/40 p-2 rounded border border-cyan-500/10">
          <span className="text-[10px] text-cyan-400 block uppercase">Neuro-Sync Coherence</span>
          <span className="text-sm font-mono font-bold text-cyan-300">{neuralSync}%</span>
        </div>
        <div className="bg-cyan-950/40 p-2 rounded border border-cyan-500/10">
          <span className="text-[10px] text-cyan-400 block uppercase">Hemolymph Stroke</span>
          <span className="text-sm font-mono font-bold text-cyan-300">{hemolymphPress} Bar</span>
        </div>
        <div className="bg-cyan-950/40 p-2 rounded border border-cyan-500/10">
          <span className="text-[10px] text-cyan-400 block uppercase">Bio-Moss O₂ Production</span>
          <span className="text-sm font-mono font-bold text-cyan-300">{o2Yield} L/min</span>
        </div>
        <div className="bg-cyan-950/40 p-2 rounded border border-cyan-500/10">
          <span className="text-[10px] text-cyan-400 block uppercase">Nanite Coagulation</span>
          <span className="text-sm font-mono font-bold text-cyan-300">{naniteRepair} m³/s</span>
        </div>
        <div className="bg-cyan-950/40 p-2 rounded border border-cyan-500/10">
          <span className="text-[10px] text-cyan-400 block uppercase">Radiotrophic Gamma Abs</span>
          <span className="text-sm font-mono font-bold text-cyan-300">{gammaAbs} Gy/hr</span>
        </div>
        <div className="bg-cyan-950/40 p-2 rounded border border-cyan-500/10">
          <span className="text-[10px] text-cyan-400 block uppercase">Hydro-Pulse Thrust</span>
          <span className="text-sm font-mono font-bold text-cyan-300">{thrust} kN</span>
        </div>
        {/* Dynamic propulsion metrics — allometric scaling from ship mass & energy */}
        <div className="bg-cyan-950/40 p-2 rounded border border-cyan-500/10">
          <span className="text-[10px] text-cyan-400 block uppercase">Ship Mass (Allometric)</span>
          <span className="text-sm font-mono font-bold text-cyan-300">{shipMassKg.toLocaleString()} kg</span>
        </div>
        <div className="bg-cyan-950/40 p-2 rounded border border-cyan-500/10">
          <span className="text-[10px] text-cyan-400 block uppercase">Req. Cruise Thrust</span>
          <span className="text-sm font-mono font-bold text-cyan-300">{requiredThrustN.toLocaleString()} N</span>
        </div>
        <div className="bg-cyan-950/40 p-2 rounded border border-cyan-500/10">
          <span className="text-[10px] text-cyan-400 block uppercase">Thrust-to-Weight</span>
          <span className="text-sm font-mono font-bold text-cyan-300">{twr}</span>
        </div>
        <div className="bg-cyan-950/40 p-2 rounded border border-cyan-500/10">
          <span className="text-[10px] text-cyan-400 block uppercase">Engine Cowl Ø</span>
          <span className="text-sm font-mono font-bold text-cyan-300">{cowlDiameter} m</span>
        </div>
        <div className="bg-cyan-950/40 p-2 rounded border border-cyan-500/10">
          <span className="text-[10px] text-cyan-400 block uppercase">Plume Output</span>
          <span className="text-sm font-mono font-bold text-cyan-300">{plumeIntensityPct}%</span>
        </div>
      </div>

      {/* Neural Compute Telemetry — brain EQ, energy budget, ganglion/nerve topology */}
      <div className="bg-cyan-950/60 rounded-lg p-2.5 border border-cyan-500/20 space-y-1.5">
        <span className="text-[10px] text-cyan-400 font-mono uppercase tracking-widest flex items-center gap-1">
          <Brain className="w-3 h-3" /> Neural Compute
        </span>
        <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
          <div className="bg-cyan-950/40 p-1.5 rounded border border-cyan-500/10">
            <span className="text-cyan-500 block uppercase text-[9px]">Brain EQ</span>
            <span className="text-cyan-300 font-bold text-sm">{brainEQ.toFixed(2)}</span>
          </div>
          <div className="bg-cyan-950/40 p-1.5 rounded border border-cyan-500/10">
            <span className="text-cyan-500 block uppercase text-[9px]">Brain Energy</span>
            <span className="text-cyan-300 font-bold text-sm">{brainEnergyPct.toFixed(1)}%</span>
          </div>
          <div className="bg-cyan-950/40 p-1.5 rounded border border-cyan-500/10">
            <span className="text-cyan-500 block uppercase text-[9px]">Ganglia</span>
            <span className="text-cyan-300 font-bold text-sm">{ganglionCount}</span>
          </div>
          <div className="bg-cyan-950/40 p-1.5 rounded border border-cyan-500/10">
            <span className="text-cyan-500 block uppercase text-[9px]">Nerve Branches</span>
            <span className="text-cyan-300 font-bold text-sm">{nerveBranchCount}</span>
          </div>
        </div>
        <div className="flex justify-between items-center text-[10px] font-mono pt-0.5">
          <span className="text-cyan-500 uppercase text-[9px]">Neural Status:</span>
          <span className={`font-bold ${
            neuralStatus === 'Metabolically Strained' ? 'text-orange-400' :
            neuralStatus === 'Normal' ? 'text-green-400' : 'text-yellow-400'
          }`}>{neuralStatus}</span>
        </div>
      </div>

      {/* Crew Complement — command room station roster (1-5 based on ship length) */}
      <div className="bg-cyan-950/60 rounded-lg p-2.5 border border-cyan-500/20 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-cyan-400 font-mono uppercase tracking-widest flex items-center gap-1">
            <Users className="w-3 h-3" /> Crew Complement
          </span>
          <span className="text-[10px] font-mono text-cyan-300 font-bold">{crewCount} / 5</span>
        </div>
        <div className="space-y-0.5">
          {CREW_ROLES.map((role, idx) => {
            const active = idx < crewCount;
            return (
              <div key={role} className="flex items-center justify-between text-[10px] font-mono">
                <span className={`flex items-center gap-1.5 ${active ? 'text-cyan-300' : 'text-cyan-600/60'}`}>
                  <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-green-400' : 'bg-cyan-800'}`} style={active ? { boxShadow: '0 0 4px #4ade80' } : undefined} />
                  {role}
                </span>
                <span className={`text-[9px] uppercase font-bold ${active ? 'text-green-400' : 'text-cyan-700'}`}>
                  {active ? 'Active' : 'Inactive'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Anatomy Layer Dissection View Selector */}
      <div className="space-y-1.5 bg-cyan-950/60 p-2.5 rounded-lg border border-cyan-500/20">
        <span className="text-[10px] text-cyan-400 font-mono uppercase tracking-widest flex items-center gap-1">
          <Layers className="w-3 h-3" /> Anatomy Dissection Filter
        </span>
        <div className="grid grid-cols-5 gap-1 pt-1">
          {(['full', 'exoskeleton', 'vascular', 'organs', 'muscular'] as AnatomyLayer[]).map((layer) => (
            <button
              key={layer}
              onClick={() => onSetAnatomyLayer(layer)}
              className={`text-[10px] py-1 rounded text-center font-mono cursor-pointer transition-all ${
                state.anatomyLayer === layer
                  ? 'bio-panel bio-panel-active text-cyan-300 border-cyan-400'
                  : 'bio-panel text-cyan-400 hover:text-cyan-300'
              }`}
              title={`Isolate ${layer} layer`}
            >
              {layer.substring(0, 4).toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Node Inspector Info */}
      <div className="bg-cyan-950/60 rounded-lg p-3 border border-cyan-500/20 space-y-1.5 min-h-[220px]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-cyan-400 font-mono uppercase tracking-widest flex items-center gap-1">
            <Crosshair className="w-3 h-3" /> Deep Component Scan
          </span>
          {targetNode && targetNode.category && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-500/30">
              {targetNode.category}
            </span>
          )}
        </div>
        
        {targetNode ? (
          <>
            <div className="text-sm font-bold text-cyan-100">{targetNode.name}</div>
            <p className="text-xs text-cyan-400 leading-relaxed">{targetNode.desc}</p>
            
            <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono text-cyan-300 pt-1 border-t border-cyan-500/10">
              <div>
                <span className="text-cyan-500 block">Energy Load:</span>
                <span className="text-cyan-400 font-bold">{targetNode.baseEnergyCost ? targetNode.baseEnergyCost.toFixed(1) + ' MW' : 'Passive'}</span>
              </div>
              <div>
                <span className="text-cyan-500 block">Status:</span>
                <span className={`font-bold ${
                  getOrganEnergyStatus(targetNode, globalEnergyStatus) === 'OPTIMAL' ? 'text-green-400' :
                  getOrganEnergyStatus(targetNode, globalEnergyStatus) === 'SUB_OPTIMAL' ? 'text-yellow-400' :
                  getOrganEnergyStatus(targetNode, globalEnergyStatus) === 'FAILING' ? 'text-orange-500' : 'text-red-500'
                }`}>{getOrganEnergyStatus(targetNode, globalEnergyStatus).replace('_', ' ')}</span>
              </div>
              <div>
                <span className="text-cyan-500 block">Metabolic Output:</span>
                <span className="text-cyan-400">{targetNode.metabolicRate || '24% Normal'}</span>
              </div>
              <div>
                <span className="text-cyan-500 block">Neural Impulse:</span>
                <span className="text-cyan-400">{targetNode.neuralFreq || '60 Hz'}</span>
              </div>
              <div>
                <span className="text-cyan-500 block">Clearance Buffer:</span>
                <span className="text-cyan-300 font-semibold">{targetNode.clearanceRadius || '0.8m Buffer'}</span>
              </div>
              <div>
                <span className="text-cyan-500 block">Interceptable:</span>
                <span className={targetNode.isInterceptable ? "text-amber-400 font-semibold" : "text-cyan-400 font-semibold"}>
                  {targetNode.isInterceptable ? 'Yes (Exposed)' : 'No (Shielded Hull)'}
                </span>
              </div>
            </div>

        {/* Closed-Loop Organ Pipeline Graph Inspector */}
        {targetNode.pipeline && (
          <div className="mt-2 p-2 bg-cyan-950/60 rounded border border-cyan-500/40 space-y-1.5 text-[10px] font-mono shadow-[0_0_10px_rgba(6,182,212,0.15)]">
            <div className="flex justify-between items-center">
              <span className="text-cyan-300 uppercase font-bold text-[9px] flex items-center gap-1">
                <Activity className="w-3.5 h-3.5 text-cyan-400" /> Pipeline: {PIPELINE_NAMES[targetNode.pipeline]}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-cyan-900/80 text-cyan-200 text-[8px] font-bold uppercase border border-cyan-400/40">
                Role: {targetNode.role}
              </span>
            </div>
            {targetNode.upstreamNodeName && (
              <div className="flex justify-between text-cyan-300">
                <span className="text-cyan-500">Upstream Source:</span>
                <span className="text-cyan-300 font-semibold">{targetNode.upstreamNodeName}</span>
              </div>
            )}
            {targetNode.downstreamNodeNames && targetNode.downstreamNodeNames.length > 0 && (
              <div className="flex justify-between text-cyan-300">
                <span className="text-cyan-500">Downstream Targets:</span>
                <span className="text-cyan-300 font-semibold">{targetNode.downstreamNodeNames.join(', ')}</span>
              </div>
            )}
            {targetNode.operatingPressure && (
              <div className="flex justify-between text-cyan-300">
                <span className="text-cyan-500">Operating Pressure:</span>
                <span className="text-cyan-300 font-semibold">{targetNode.operatingPressure}</span>
              </div>
            )}
            {targetNode.outputCapacity && (
              <div className="flex justify-between text-cyan-300">
                <span className="text-cyan-500">Output Capacity:</span>
                <span className="text-cyan-300 font-semibold">{targetNode.outputCapacity}</span>
              </div>
            )}
          </div>
        )}

        {/* Human Habitation Sac Details (if applicable) */}
        {(targetNode.habitationVolume || targetNode.crewCapacity) && (
          <div className="mt-2 p-2 bg-cyan-950/40 rounded border border-cyan-500/30 space-y-1 text-[10px] font-mono">
            <span className="text-cyan-300 uppercase font-bold text-[9px] block flex items-center gap-1">
              <Home className="w-3 h-3 text-cyan-400" /> Human Crew Habitation Specs
            </span>
            <div className="flex justify-between">
              <span className="text-cyan-400">Habitation Volume:</span>
              <span className="text-cyan-300 font-semibold">{targetNode.habitationVolume}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-cyan-400">Crew Capacity:</span>
              <span className="text-cyan-300 font-semibold">{targetNode.crewCapacity}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-cyan-400">Min Free Clearance:</span>
              <span className="text-cyan-300 font-semibold">{targetNode.minFreeSpace || '2.0m Zone'}</span>
            </div>
          </div>
        )}

        {/* Proximity Auto-Wired Vascular Network Section */}
        <div className="mt-2 pt-2 border-t border-cyan-500/10 space-y-1 text-[10px] font-mono">
          <div className="flex justify-between items-center text-cyan-300">
            <span className="uppercase text-[9px] text-cyan-400/80 font-bold">Vascular Auto-Wire Status:</span>
            <span className="px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30">
              {targetNode.connectedVeinBranch || 'Auto-Wired Proximity Branch'}
            </span>
          </div>
          <div className="flex justify-between text-cyan-300">
            <span className="text-cyan-500">Fluid Requirement:</span>
            <span className="text-cyan-300 font-semibold">{targetNode.requiredFluid || 'Bio-Plasma Haemolymph'}</span>
          </div>
          <div className="flex justify-between text-cyan-300">
            <span className="text-cyan-500">Volumetric Demand:</span>
            <span className="text-cyan-400">{targetNode.vascularDemand || '18.5 mL/min'}</span>
          </div>
          <div className="flex justify-between text-cyan-300">
            <span className="text-cyan-500">Murray's Law Vessel:</span>
            <span className="text-cyan-400">{targetNode.vascularFlowSupply || 'r = 0.18mm (Optimum Flow)'}</span>
          </div>
        </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-cyan-500 font-mono text-xs text-center opacity-80 h-full min-h-[160px]">
            <Crosshair className="w-8 h-8 mb-2 opacity-50 text-cyan-900" />
            <p>NO COMPONENT SELECTED</p>
            <p className="opacity-70 mt-1">Select an organ in the viewport</p>
          </div>
        )}
      </div>

      {/* NURBS Math HUD Telemetry */}
      <div className="bg-cyan-950/60 rounded-lg p-2.5 border border-cyan-500/20 space-y-1">
        <span className="text-[10px] text-cyan-400 font-mono uppercase tracking-widest flex items-center gap-1">
          <Calculator className="w-3 h-3" /> NURBS Surface Evaluation
        </span>
        <div className="text-[11px] font-mono text-cyan-300 space-y-0.5">
          <div className="flex justify-between">
            <span>Control Mesh Nodes:</span>
            <span className="text-cyan-400">{numCrossU} x {numCrossV} Matrix</span>
          </div>
          <div className="flex justify-between">
            <span>Evaluated Polygon Patches:</span>
            <span className="text-cyan-400">{resGrid * resGrid * 2} Triangles</span>
          </div>
          <div className="flex justify-between">
            <span>Knot Vector Type:</span>
            <span className="text-cyan-400">Clamped Uniform</span>
          </div>
        </div>
      </div>

      {/* Genetic Code Sequence HUD */}
      <div className="bg-cyan-950/60 rounded-lg p-2.5 border border-cyan-500/20 space-y-1">
        <span className="text-[10px] text-cyan-400 font-mono uppercase tracking-widest flex items-center gap-1">
          <Dna className="w-3 h-3" /> Genomic Sequence
        </span>
        <div className="text-xs font-mono text-cyan-300 break-all bg-[#04121e]/80 p-1.5 rounded border border-cyan-500/10">
          {dnaStr}
        </div>
      </div>

      {/* Render Modes */}
      <div className="space-y-1.5 pt-1">
        <span className="text-xs font-semibold text-cyan-300 uppercase tracking-widest block">Shading View Mode</span>
        <div className="grid grid-cols-3 gap-1.5">
          {(['organic', 'wireframe', 'xray'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => onSetViewMode(mode)}
              className={`text-xs py-1.5 rounded text-center font-mono cursor-pointer transition-all ${
                state.viewMode === mode
                  ? 'bio-panel bio-panel-active text-cyan-300'
                  : 'bio-panel text-cyan-400 hover:text-cyan-300'
              }`}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* TABBED GROUPED DRAWER FOR ORGANS & SYSTEMS (BELOW SHADING VIEW MODE) */}
      <div className="space-y-2 pt-3 border-t border-cyan-500/20">
        <button
          onClick={() => setDrawerOpen(!drawerOpen)}
          className="w-full flex items-center justify-between text-xs font-bold text-cyan-400 uppercase tracking-wider bg-cyan-950/50 hover:bg-cyan-900/60 p-2 rounded border border-cyan-500/30 transition-all cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.1)]"
        >
          <span className="flex items-center gap-1.5">
            <Dna className="w-4 h-4 text-cyan-400" />
            Organ & System Registry
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-900 text-cyan-300 border border-cyan-500/40 ml-1">
              {organList.length} Items
            </span>
          </span>
          {drawerOpen ? <ChevronUp className="w-4 h-4 text-cyan-400" /> : <ChevronDown className="w-4 h-4 text-cyan-400" />}
        </button>

        {drawerOpen && (
          <div className="space-y-2 bg-cyan-950/80 p-2.5 rounded-lg border border-cyan-500/30 shadow-2xl">
            {/* Search Filter Bar */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search organs, chambers, vents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#04121e]/80 text-xs text-cyan-300 pl-8 pr-3 py-1.5 rounded border border-cyan-500/30 focus:outline-none focus:border-cyan-400 font-mono placeholder:text-cyan-500"
              />
            </div>

            {/* Tabbed Group Filters */}
            <div className="flex flex-wrap gap-1 border-b border-cyan-500/20 pb-2">
              {(['ALL', 'SECTIONS', 'HABITATION', 'CIRCULATORY', 'PROPULSION', 'SENSORY', 'RESPIRATION', 'WEAPONS', 'APPENDAGES'] as CategoryTab[]).map((tab) => {
                const count = tab === 'ALL'
                  ? organList.length
                  : tab === 'SECTIONS'
                    ? SHIP_SECTIONS.length
                    : organList.filter((o) => getCategoryGroup(o.category) === tab).length;

                return (
                  <button
                    key={tab}
                    onClick={() => setSelectedTab(tab)}
                    className={`text-[9px] px-2 py-1 rounded font-mono flex items-center gap-1 transition-all cursor-pointer ${
                      selectedTab === tab
                        ? 'bg-cyan-500 text-cyan-950 font-bold shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                        : 'bg-[#04121e]/80/80 text-cyan-400 hover:text-cyan-300 border border-cyan-500/20'
                    }`}
                  >
                    {getCategoryIcon(tab)}
                    <span>{tab}</span>
                    <span className={`text-[8px] px-1 rounded ${selectedTab === tab ? 'bg-[#04121e]/80 text-cyan-300' : 'bg-slate-800 text-cyan-400'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Scrollable Organ List / Section List */}
            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
              {selectedTab === 'SECTIONS' ? (
                <>
                  {/* Section list — each section shows its organs */}
                  {SHIP_SECTIONS.map((sec) => {
                    const isActive = highlightedSection === sec.id;
                    const colorHex = '#' + sec.color.toString(16).padStart(6, '0');
                    const sectionOrgans = organList.filter((o) => o.section === sec.id);

                    return (
                      <div key={sec.id} className="space-y-1">
                        {/* Section header */}
                        <div
                          onClick={() => {
                            onSetHighlightedSection(isActive ? null : sec.id);
                            playScanChirp(state.audioEnabled);
                            onShowToast(isActive ? `Section highlight cleared` : `Highlighted: ${sec.label}`);
                          }}
                          className={`p-2 rounded border transition-all cursor-pointer text-xs font-mono ${
                            isActive
                              ? 'bg-cyan-950/90 border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                              : 'bg-[#04121e]/80 border-cyan-500/20 hover:border-cyan-400/50 hover:bg-cyan-950/60 text-cyan-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className="inline-block w-2.5 h-2.5 rounded-full shrink-0 border border-white/20"
                                style={{ backgroundColor: colorHex, boxShadow: `0 0 6px ${colorHex}` }}
                              />
                              <span className="font-bold text-cyan-300">{sec.label}</span>
                              {isActive && (
                                <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-cyan-400 text-cyan-950 flex items-center gap-0.5 animate-pulse">
                                  <CheckCircle2 className="w-2.5 h-2.5" /> HIGHLIGHTED
                                </span>
                              )}
                            </div>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded ${isActive ? 'bg-cyan-400 text-cyan-950' : 'bg-slate-800 text-cyan-400'}`}>
                              {sectionOrgans.length} organs
                            </span>
                          </div>
                          <div className="text-[10px] text-cyan-400 leading-snug mt-1">{sec.description}</div>
                          <div className="text-[9px] text-cyan-500/70">
                            U: {sec.uMin.toFixed(2)}–{sec.uMax.toFixed(2)}
                          </div>
                        </div>

                        {/* Organ list inside this section — shown when section is highlighted */}
                        {isActive && (
                          <div className="space-y-1 pl-3 border-l-2 border-cyan-400/30 ml-2">
                            {sectionOrgans.length === 0 ? (
                              <div className="text-[10px] text-cyan-500 italic py-1 font-mono">
                                No organs in this section.
                              </div>
                            ) : (
                              sectionOrgans.map((organ) => {
                                const isSelected = targetNode?.name === organ.name;
                                const catGroup = getCategoryGroup(organ.category);
                                return (
                                  <div
                                    key={organ.name}
                                    onClick={() => handleSelectOrgan(organ)}
                                    className={`p-1.5 rounded border transition-all cursor-pointer text-[11px] font-mono flex items-start justify-between gap-2 ${
                                      isSelected
                                        ? 'bg-cyan-950/90 border-cyan-400 text-cyan-200 shadow-[0_0_8px_rgba(6,182,212,0.3)]'
                                        : 'bg-[#04121e]/60 border-cyan-500/15 hover:border-cyan-400/40 hover:bg-cyan-950/50 text-cyan-300'
                                    }`}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1 flex-wrap">
                                        {getCategoryIcon(catGroup)}
                                        <span className="font-bold text-cyan-300 truncate">{organ.name}</span>
                                      </div>
                                      <div className="text-[9px] text-cyan-500/80 mt-0.5">{organ.category}</div>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {highlightedSection && (
                    <button
                      onClick={() => {
                        onSetHighlightedSection(null);
                        onShowToast('Section highlight cleared');
                      }}
                      className="w-full text-[10px] font-mono text-cyan-400 hover:text-cyan-300 bg-[#04121e]/80 hover:bg-cyan-950/60 border border-cyan-500/20 rounded py-1.5 transition-all cursor-pointer flex items-center justify-center gap-1"
                    >
                      <X className="w-3 h-3" /> Clear Highlight
                    </button>
                  )}
                </>
              ) : filteredOrgans.length === 0 ? (
                <div className="text-[11px] text-cyan-500 text-center py-4 font-mono">
                  No matching organs or components found.
                </div>
              ) : (
                filteredOrgans.map((organ) => {
                  const isSelected = targetNode?.name === organ.name;
                  const catGroup = getCategoryGroup(organ.category);

                  return (
                    <div
                      key={organ.name}
                      onClick={() => handleSelectOrgan(organ)}
                      className={`p-2 rounded border transition-all cursor-pointer text-xs font-mono flex items-start justify-between gap-2 ${
                        isSelected
                          ? 'bg-cyan-950/90 border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                          : 'bg-[#04121e]/80 border-cyan-500/20 hover:border-cyan-400/50 hover:bg-cyan-950/60 text-cyan-300'
                      }`}
                    >
                      <div className="space-y-0.5 flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {getCategoryIcon(catGroup)}
                          <span className="font-bold text-cyan-300 truncate">{organ.name}</span>
                          {isSelected && (
                            <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-cyan-400 text-cyan-950 flex items-center gap-0.5 animate-pulse">
                              <CheckCircle2 className="w-2.5 h-2.5" /> 3D HIGHLIGHTED
                            </span>
                          )}
                        </div>

                        <div className="text-[10px] text-cyan-400 flex items-center gap-2">
                          <span className="text-cyan-500/80">{organ.category}</span>
                          {organ.habitationVolume && (
                            <span className="text-cyan-300 font-semibold">{organ.habitationVolume}</span>
                          )}
                          {organ.metabolicRate && !organ.habitationVolume && (
                            <span className="text-cyan-400">{organ.metabolicRate}</span>
                          )}
                        </div>
                      </div>

                      {/* Clearance / Status Badge */}
                      <div className="text-[9px] text-right shrink-0">
                        <span className="text-cyan-400 block">Clearance:</span>
                        <span className="text-cyan-300 font-semibold">{organ.clearanceRadius || '0.8m'}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
});

