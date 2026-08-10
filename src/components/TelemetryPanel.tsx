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
} from 'lucide-react';
import { AppState, TargetNodeInfo, ViewMode, AnatomyLayer } from '../types';
import { LCG } from '../utils/nurbs';
import { playScanChirp } from '../utils/audio';

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
}

type CategoryTab = 'ALL' | 'HABITATION' | 'CIRCULATORY' | 'PROPULSION' | 'SENSORY' | 'RESPIRATION' | 'WEAPONS';

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({
  state,
  targetNode,
  organList,
  onSetViewMode,
  onSetAnatomyLayer,
  onSelectTargetNode,
  onShowToast,
  mobilePanel,
  setMobilePanel,
}) => {
  const [drawerOpen, setDrawerOpen] = useState<boolean>(true);
  const [selectedTab, setSelectedTab] = useState<CategoryTab>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const mass = Math.round(state.length * state.segments * state.thoraxWidth * 85);
  const bpm = Math.round(50 + state.neuralNodes * 1.5);
  const thrust = state.bioThrusters * 340;

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
    if (cat.includes('Weapon') || cat.includes('Appendage') || cat.includes('Exoskeleton') || cat.includes('Frame')) return 'WEAPONS';
    return 'ALL';
  };

  const getCategoryIcon = (tab: CategoryTab) => {
    switch (tab) {
      case 'HABITATION': return <Home className="w-3 h-3 text-cyan-400" />;
      case 'CIRCULATORY': return <HeartPulse className="w-3 h-3 text-rose-400" />;
      case 'PROPULSION': return <Flame className="w-3 h-3 text-amber-400" />;
      case 'SENSORY': return <Eye className="w-3 h-3 text-emerald-400" />;
      case 'RESPIRATION': return <Wind className="w-3 h-3 text-blue-400" />;
      case 'WEAPONS': return <Shield className="w-3 h-3 text-violet-400" />;
      default: return <Activity className="w-3 h-3 text-emerald-400" />;
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
      <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
        <h2 className="text-sm font-bold tracking-wider text-emerald-400 uppercase flex items-center gap-2">
          <HeartPulse className="w-4 h-4" /> Bio Telemetry & Dissection
        </h2>
        <div className="flex items-center gap-3">
          <span className="flex h-2 w-2 relative hidden sm:flex">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <button className="lg:hidden p-1 rounded-md text-emerald-400 hover:bg-emerald-950/50" onClick={() => setMobilePanel('none')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="bg-slate-900/60 p-2 rounded border border-emerald-500/10">
          <span className="text-[10px] text-slate-400 block uppercase">Organism Mass</span>
          <span className="text-sm font-mono font-bold text-emerald-300">{mass.toLocaleString()} MT</span>
        </div>
        <div className="bg-slate-900/60 p-2 rounded border border-emerald-500/10">
          <span className="text-[10px] text-slate-400 block uppercase">Heart Rate</span>
          <span className="text-sm font-mono font-bold text-emerald-300">{bpm} BPM</span>
        </div>
        <div className="bg-slate-900/60 p-2 rounded border border-emerald-500/10">
          <span className="text-[10px] text-slate-400 block uppercase">Bio-Thrust Power</span>
          <span className="text-sm font-mono font-bold text-emerald-300">{thrust} kN</span>
        </div>
        <div className="bg-slate-900/60 p-2 rounded border border-emerald-500/10">
          <span className="text-[10px] text-slate-400 block uppercase">Spline Continuity</span>
          <span className="text-sm font-mono font-bold text-emerald-300">C{state.nurbsDegree - 1} Continuous</span>
        </div>
      </div>

      {/* Anatomy Layer Dissection View Selector */}
      <div className="space-y-1.5 bg-slate-900/80 p-2.5 rounded-lg border border-emerald-500/20">
        <span className="text-[10px] text-emerald-400 font-mono uppercase tracking-widest flex items-center gap-1">
          <Layers className="w-3 h-3" /> Anatomy Dissection Filter
        </span>
        <div className="grid grid-cols-5 gap-1 pt-1">
          {(['full', 'exoskeleton', 'vascular', 'organs', 'muscular'] as AnatomyLayer[]).map((layer) => (
            <button
              key={layer}
              onClick={() => onSetAnatomyLayer(layer)}
              className={`text-[10px] py-1 rounded text-center font-mono cursor-pointer transition-all ${
                state.anatomyLayer === layer
                  ? 'bio-panel bio-panel-active text-emerald-300 border-emerald-400'
                  : 'bio-panel text-slate-400 hover:text-emerald-300'
              }`}
              title={`Isolate ${layer} layer`}
            >
              {layer.substring(0, 4).toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Node Inspector Info */}
      <div className="bg-slate-900/80 rounded-lg p-3 border border-emerald-500/20 space-y-1.5 min-h-[220px]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-emerald-400 font-mono uppercase tracking-widest flex items-center gap-1">
            <Crosshair className="w-3 h-3" /> Deep Component Scan
          </span>
          {targetNode && targetNode.category && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">
              {targetNode.category}
            </span>
          )}
        </div>
        
        {targetNode ? (
          <>
            <div className="text-sm font-bold text-slate-100">{targetNode.name}</div>
            <p className="text-xs text-slate-400 leading-relaxed">{targetNode.desc}</p>
            
            <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono text-slate-300 pt-1 border-t border-emerald-500/10">
              <div>
                <span className="text-slate-500 block">Metabolic Output:</span>
                <span className="text-emerald-400">{targetNode.metabolicRate || '24% Normal'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Neural Impulse:</span>
                <span className="text-emerald-400">{targetNode.neuralFreq || '60 Hz'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Clearance Buffer:</span>
                <span className="text-cyan-300 font-semibold">{targetNode.clearanceRadius || '0.8m Buffer'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Interceptable:</span>
                <span className={targetNode.isInterceptable ? "text-amber-400 font-semibold" : "text-emerald-400 font-semibold"}>
                  {targetNode.isInterceptable ? 'Yes (Exposed)' : 'No (Shielded Hull)'}
                </span>
              </div>
            </div>

        {/* Human Habitation Sac Details (if applicable) */}
        {(targetNode.habitationVolume || targetNode.crewCapacity) && (
          <div className="mt-2 p-2 bg-cyan-950/40 rounded border border-cyan-500/30 space-y-1 text-[10px] font-mono">
            <span className="text-cyan-300 uppercase font-bold text-[9px] block flex items-center gap-1">
              <Home className="w-3 h-3 text-cyan-400" /> Human Crew Habitation Specs
            </span>
            <div className="flex justify-between">
              <span className="text-slate-400">Habitation Volume:</span>
              <span className="text-cyan-300 font-semibold">{targetNode.habitationVolume}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Crew Capacity:</span>
              <span className="text-cyan-300 font-semibold">{targetNode.crewCapacity}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Min Free Clearance:</span>
              <span className="text-cyan-300 font-semibold">{targetNode.minFreeSpace || '2.0m Zone'}</span>
            </div>
          </div>
        )}

        {/* Proximity Auto-Wired Vascular Network Section */}
        <div className="mt-2 pt-2 border-t border-emerald-500/10 space-y-1 text-[10px] font-mono">
          <div className="flex justify-between items-center text-emerald-300">
            <span className="uppercase text-[9px] text-emerald-400/80 font-bold">Vascular Auto-Wire Status:</span>
            <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30">
              {targetNode.connectedVeinBranch || 'Auto-Wired Proximity Branch'}
            </span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-500">Fluid Requirement:</span>
            <span className="text-emerald-300 font-semibold">{targetNode.requiredFluid || 'Bio-Plasma Haemolymph'}</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-500">Volumetric Demand:</span>
            <span className="text-emerald-400">{targetNode.vascularDemand || '18.5 mL/min'}</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-500">Murray's Law Vessel:</span>
            <span className="text-emerald-400">{targetNode.vascularFlowSupply || 'r = 0.18mm (Optimum Flow)'}</span>
          </div>
        </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-slate-500 font-mono text-xs text-center opacity-80 h-full min-h-[160px]">
            <Crosshair className="w-8 h-8 mb-2 opacity-50 text-emerald-900" />
            <p>NO COMPONENT SELECTED</p>
            <p className="opacity-70 mt-1">Select an organ in the viewport</p>
          </div>
        )}
      </div>

      {/* NURBS Math HUD Telemetry */}
      <div className="bg-slate-900/80 rounded-lg p-2.5 border border-emerald-500/20 space-y-1">
        <span className="text-[10px] text-emerald-400 font-mono uppercase tracking-widest flex items-center gap-1">
          <Calculator className="w-3 h-3" /> NURBS Surface Evaluation
        </span>
        <div className="text-[11px] font-mono text-slate-300 space-y-0.5">
          <div className="flex justify-between">
            <span>Control Mesh Nodes:</span>
            <span className="text-emerald-400">{numCrossU} x {numCrossV} Matrix</span>
          </div>
          <div className="flex justify-between">
            <span>Evaluated Polygon Patches:</span>
            <span className="text-emerald-400">{resGrid * resGrid * 2} Triangles</span>
          </div>
          <div className="flex justify-between">
            <span>Knot Vector Type:</span>
            <span className="text-emerald-400">Clamped Uniform</span>
          </div>
        </div>
      </div>

      {/* Genetic Code Sequence HUD */}
      <div className="bg-slate-900/80 rounded-lg p-2.5 border border-emerald-500/20 space-y-1">
        <span className="text-[10px] text-emerald-400 font-mono uppercase tracking-widest flex items-center gap-1">
          <Dna className="w-3 h-3" /> Genomic Sequence
        </span>
        <div className="text-xs font-mono text-emerald-300 break-all bg-slate-950/60 p-1.5 rounded border border-emerald-500/10">
          {dnaStr}
        </div>
      </div>

      {/* Render Modes */}
      <div className="space-y-1.5 pt-1">
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-widest block">Shading View Mode</span>
        <div className="grid grid-cols-3 gap-1.5">
          {(['organic', 'wireframe', 'xray'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => onSetViewMode(mode)}
              className={`text-xs py-1.5 rounded text-center font-mono cursor-pointer transition-all ${
                state.viewMode === mode
                  ? 'bio-panel bio-panel-active text-emerald-300'
                  : 'bio-panel text-slate-400 hover:text-emerald-300'
              }`}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* TABBED GROUPED DRAWER FOR ORGANS & SYSTEMS (BELOW SHADING VIEW MODE) */}
      <div className="space-y-2 pt-3 border-t border-emerald-500/20">
        <button
          onClick={() => setDrawerOpen(!drawerOpen)}
          className="w-full flex items-center justify-between text-xs font-bold text-emerald-400 uppercase tracking-wider bg-emerald-950/50 hover:bg-emerald-900/60 p-2 rounded border border-emerald-500/30 transition-all cursor-pointer shadow-[0_0_10px_rgba(16,185,129,0.1)]"
        >
          <span className="flex items-center gap-1.5">
            <Dna className="w-4 h-4 text-emerald-400" />
            Organ & System Registry
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-900 text-emerald-300 border border-emerald-500/40 ml-1">
              {organList.length} Items
            </span>
          </span>
          {drawerOpen ? <ChevronUp className="w-4 h-4 text-emerald-400" /> : <ChevronDown className="w-4 h-4 text-emerald-400" />}
        </button>

        {drawerOpen && (
          <div className="space-y-2 bg-slate-900/90 p-2.5 rounded-lg border border-emerald-500/30 shadow-2xl">
            {/* Search Filter Bar */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search organs, chambers, vents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 text-xs text-emerald-300 pl-8 pr-3 py-1.5 rounded border border-emerald-500/30 focus:outline-none focus:border-emerald-400 font-mono placeholder:text-slate-500"
              />
            </div>

            {/* Tabbed Group Filters */}
            <div className="flex flex-wrap gap-1 border-b border-emerald-500/20 pb-2">
              {(['ALL', 'HABITATION', 'CIRCULATORY', 'PROPULSION', 'SENSORY', 'RESPIRATION', 'WEAPONS'] as CategoryTab[]).map((tab) => {
                const count = tab === 'ALL'
                  ? organList.length
                  : organList.filter((o) => getCategoryGroup(o.category) === tab).length;

                return (
                  <button
                    key={tab}
                    onClick={() => setSelectedTab(tab)}
                    className={`text-[9px] px-2 py-1 rounded font-mono flex items-center gap-1 transition-all cursor-pointer ${
                      selectedTab === tab
                        ? 'bg-emerald-500 text-slate-950 font-bold shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                        : 'bg-slate-950/80 text-slate-400 hover:text-emerald-300 border border-emerald-500/20'
                    }`}
                  >
                    {getCategoryIcon(tab)}
                    <span>{tab}</span>
                    <span className={`text-[8px] px-1 rounded ${selectedTab === tab ? 'bg-slate-950 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Scrollable Organ List */}
            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
              {filteredOrgans.length === 0 ? (
                <div className="text-[11px] text-slate-500 text-center py-4 font-mono">
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
                          ? 'bg-emerald-950/90 border-emerald-400 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                          : 'bg-slate-950/60 border-emerald-500/20 hover:border-emerald-400/50 hover:bg-slate-900/80 text-slate-300'
                      }`}
                    >
                      <div className="space-y-0.5 flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {getCategoryIcon(catGroup)}
                          <span className="font-bold text-emerald-300 truncate">{organ.name}</span>
                          {isSelected && (
                            <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-emerald-400 text-slate-950 flex items-center gap-0.5 animate-pulse">
                              <CheckCircle2 className="w-2.5 h-2.5" /> 3D HIGHLIGHTED
                            </span>
                          )}
                        </div>

                        <div className="text-[10px] text-slate-400 flex items-center gap-2">
                          <span className="text-emerald-500/80">{organ.category}</span>
                          {organ.habitationVolume && (
                            <span className="text-cyan-300 font-semibold">{organ.habitationVolume}</span>
                          )}
                          {organ.metabolicRate && !organ.habitationVolume && (
                            <span className="text-slate-400">{organ.metabolicRate}</span>
                          )}
                        </div>
                      </div>

                      {/* Clearance / Status Badge */}
                      <div className="text-[9px] text-right shrink-0">
                        <span className="text-slate-400 block">Clearance:</span>
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
};

