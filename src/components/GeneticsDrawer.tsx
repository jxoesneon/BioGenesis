import React from 'react';
import { Sliders, Eye, EyeOff, Bone, Dna, Palette, Bookmark, FlaskConical, Spline, Activity, Compass, X } from 'lucide-react';
import { AppState, LoftProfile, SymmetryType, ThemeKey } from '../types';

interface GeneticsDrawerProps {
  state: AppState;
  onUpdateState: (updates: Partial<AppState>) => void;
  onSaveDNA_A: () => void;
  onSaveDNA_B: () => void;
  onSpliceDNA: () => void;
  onSetTheme: (theme: ThemeKey) => void;
  mobilePanel: 'genetics' | 'telemetry' | 'none';
  setMobilePanel: (panel: 'genetics' | 'telemetry' | 'none') => void;
}

export const GeneticsDrawer: React.FC<GeneticsDrawerProps> = ({
  state,
  onUpdateState,
  onSaveDNA_A,
  onSaveDNA_B,
  onSpliceDNA,
  onSetTheme,
  mobilePanel,
  setMobilePanel,
}) => {
  return (
    <aside className={`absolute top-24 lg:top-20 left-4 lg:left-6 bottom-28 lg:bottom-8 w-[calc(100%-2rem)] md:w-88 lg:w-88 z-20 bio-panel rounded-xl p-4 flex-col space-y-4 overflow-y-auto ${mobilePanel === 'genetics' ? 'flex' : 'hidden lg:flex'}`}>
      <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
        <h2 className="text-sm font-bold tracking-wider text-emerald-400 uppercase flex items-center gap-2">
          <Sliders className="w-4 h-4" /> Genetics & Surface Splines
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-emerald-500/80 hidden sm:inline">SEED: {state.seed}</span>
          <button className="lg:hidden p-1 rounded-md text-emerald-400 hover:bg-emerald-950/50" onClick={() => setMobilePanel('none')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* NURBS Engine Parameters */}
      <div className="space-y-3 bg-emerald-950/20 p-3 rounded-lg border border-emerald-500/20">
        <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Spline className="w-3.5 h-3.5 mr-1" /> Procedural NURBS Engine
          </span>
          <span className="font-mono text-emerald-300">Degree {state.nurbsDegree} ({state.nurbsDegree === 1 ? 'Linear' : state.nurbsDegree === 2 ? 'Quadratic' : state.nurbsDegree === 3 ? 'Cubic' : 'Quartic'})</span>
        </h3>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <label htmlFor="paramNurbsDegree">Spline Degree (p)</label>
            <span className="text-[10px] font-mono text-slate-500">Polynomial Order</span>
          </div>
          <input
            type="range"
            id="paramNurbsDegree"
            min="1"
            max="4"
            step="1"
            value={state.nurbsDegree}
            onChange={(e) => onUpdateState({ nurbsDegree: parseInt(e.target.value) })}
            className="w-full cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <label htmlFor="paramSymmetryType" className="flex items-center gap-1 font-bold text-emerald-300">
              <Compass className="w-3.5 h-3.5 text-emerald-400" /> Natural Symmetry Axis
            </label>
          </div>
          <select
            id="paramSymmetryType"
            value={state.symmetryType}
            onChange={(e) => onUpdateState({ symmetryType: e.target.value as SymmetryType })}
            className="w-full bg-slate-900 text-emerald-300 text-xs font-mono rounded p-1.5 border border-emerald-500/40 focus:outline-none cursor-pointer"
          >
            <option value="bilateral">1. Bilateral Mirror (Vertebrates / Arthropods)</option>
            <option value="radial-5">2. Pentamerous Radial 5-Fold (Echinoderm / Starfish)</option>
            <option value="radial-3">3. Trimerous Radial 3-Fold (Cnidarian / Corals)</option>
            <option value="biradial">4. Biradial Quad-Orthogonal (Ctenophore / Comb Jelly)</option>
            <option value="spherical">5. Spherical Omnidirectional (Radiolarian / Volvox)</option>
            <option value="asymmetrical">6. Chiral Spiral / Fibonacci (Gastropod / Snail / Sponge)</option>
          </select>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <label htmlFor="paramLoftProfile">Loft Cross-Section Profile</label>
          </div>
          <select
            id="paramLoftProfile"
            value={state.loftProfile}
            onChange={(e) => onUpdateState({ loftProfile: e.target.value as LoftProfile })}
            className="w-full bg-slate-900 text-emerald-300 text-xs font-mono rounded p-1.5 border border-emerald-500/30 focus:outline-none cursor-pointer"
          >
            <option value="trilobed">Trilobed Alien Carapace</option>
            <option value="spine">Dorsal Spined Ridge</option>
            <option value="circular">Circular Bio-Tube</option>
            <option value="star">Star-Flanged Chitin Shell</option>
          </select>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <label htmlFor="paramRationalWeight">Rational Control Weight Bias (w)</label>
            <span className="font-mono text-emerald-400">{state.rationalWeight}</span>
          </div>
          <input
            type="range"
            id="paramRationalWeight"
            min="0.5"
            max="4.0"
            step="0.1"
            value={state.rationalWeight}
            onChange={(e) => onUpdateState({ rationalWeight: parseFloat(e.target.value) })}
            className="w-full cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <label htmlFor="paramGridResolution">U x V Surface Resolution Grid</label>
            <span className="font-mono text-emerald-400">{state.gridResolution}x{state.gridResolution}</span>
          </div>
          <input
            type="range"
            id="paramGridResolution"
            min="12"
            max="48"
            step="4"
            value={state.gridResolution}
            onChange={(e) => onUpdateState({ gridResolution: parseInt(e.target.value) })}
            className="w-full cursor-pointer"
          />
        </div>

        <div className="flex items-center justify-between text-xs pt-1">
          <span className="text-slate-300 font-mono">Show 3D Control Net Grid:</span>
          <button
            onClick={() => onUpdateState({ showControlNet: !state.showControlNet })}
            className={`px-2 py-1 rounded text-[11px] font-mono flex items-center gap-1 cursor-pointer transition-all ${
              state.showControlNet ? 'bio-panel bio-panel-active text-emerald-300' : 'bio-panel text-slate-400'
            }`}
          >
            {state.showControlNet ? <Eye className="w-3 h-3 mr-1" /> : <EyeOff className="w-3 h-3 mr-1" />}
            CONTROL NET
          </button>
        </div>
      </div>

      {/* Spine & Hull Morphing */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-widest flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Bone className="w-3.5 h-3.5 text-emerald-500/70 mr-1" /> Carapace & Spine
          </span>
          <span className="font-mono text-emerald-400">{state.length}m</span>
        </h3>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <label htmlFor="paramLength">Backbone Length</label>
          </div>
          <input
            type="range"
            id="paramLength"
            min="6"
            max="25"
            step="1"
            value={state.length}
            onChange={(e) => onUpdateState({ length: parseInt(e.target.value) })}
            className="w-full cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <label htmlFor="paramSegments">Vertebral Segments</label>
            <span className="font-mono text-emerald-400">{state.segments}</span>
          </div>
          <input
            type="range"
            id="paramSegments"
            min="4"
            max="20"
            step="1"
            value={state.segments}
            onChange={(e) => onUpdateState({ segments: parseInt(e.target.value) })}
            className="w-full cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <label htmlFor="paramThoraxWidth">Thorax Girth</label>
            <span className="font-mono text-emerald-400">{state.thoraxWidth}</span>
          </div>
          <input
            type="range"
            id="paramThoraxWidth"
            min="0.8"
            max="4.5"
            step="0.1"
            value={state.thoraxWidth}
            onChange={(e) => onUpdateState({ thoraxWidth: parseFloat(e.target.value) })}
            className="w-full cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <label htmlFor="paramPlateCoverage">Chitin Armor Shells</label>
            <span className="font-mono text-emerald-400">{state.plateCoverage}%</span>
          </div>
          <input
            type="range"
            id="paramPlateCoverage"
            min="0"
            max="100"
            step="5"
            value={state.plateCoverage}
            onChange={(e) => onUpdateState({ plateCoverage: parseInt(e.target.value) })}
            className="w-full cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <label htmlFor="paramSpinalArch">Spinal Flex Arch / Caudal Curve</label>
            <span className="font-mono text-emerald-400">{state.spinalArch > 0 ? `+${state.spinalArch}` : state.spinalArch}m</span>
          </div>
          <input
            type="range"
            id="paramSpinalArch"
            min="-3"
            max="4"
            step="0.5"
            value={state.spinalArch}
            onChange={(e) => onUpdateState({ spinalArch: parseFloat(e.target.value) })}
            className="w-full cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <label htmlFor="paramPlateOverlap">Overlapping Chitin Scales</label>
            <span className="font-mono text-emerald-400">{state.plateOverlap}</span>
          </div>
          <input
            type="range"
            id="paramPlateOverlap"
            min="0"
            max="16"
            step="1"
            value={state.plateOverlap}
            onChange={(e) => onUpdateState({ plateOverlap: parseInt(e.target.value) })}
            className="w-full cursor-pointer"
          />
        </div>
      </div>

      <hr className="border-emerald-500/20" />

      {/* Internal Systems & Respiration */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-widest flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Activity className="w-3.5 h-3.5 text-emerald-500/70 mr-1" /> Vascular & Respiration
          </span>
        </h3>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <label htmlFor="paramVascularDensity">Vascular Artery Conduits</label>
            <span className="font-mono text-emerald-400">{state.vascularDensity}</span>
          </div>
          <input
            type="range"
            id="paramVascularDensity"
            min="0"
            max="12"
            step="1"
            value={state.vascularDensity}
            onChange={(e) => onUpdateState({ vascularDensity: parseInt(e.target.value) })}
            className="w-full cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <label htmlFor="paramSpiracleCount">Respiratory Spiracle Gill Vents</label>
            <span className="font-mono text-emerald-400">{state.spiracleCount}</span>
          </div>
          <input
            type="range"
            id="paramSpiracleCount"
            min="0"
            max="16"
            step="2"
            value={state.spiracleCount}
            onChange={(e) => onUpdateState({ spiracleCount: parseInt(e.target.value) })}
            className="w-full cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <label htmlFor="paramTendonDensity">Muscular Ligament Fibers</label>
            <span className="font-mono text-emerald-400">{state.tendonDensity}</span>
          </div>
          <input
            type="range"
            id="paramTendonDensity"
            min="0"
            max="20"
            step="2"
            value={state.tendonDensity}
            onChange={(e) => onUpdateState({ tendonDensity: parseInt(e.target.value) })}
            className="w-full cursor-pointer"
          />
        </div>
      </div>


      <hr className="border-emerald-500/20" />

      {/* Organic Extremities & Symbionts */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-widest flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Dna className="w-3.5 h-3.5 text-emerald-500/70 mr-1" /> Appendages & Symbionts
          </span>
        </h3>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <label htmlFor="paramTentacles">IK Feeler Appendages</label>
            <span className="font-mono text-emerald-400">{state.tentaclePairs}</span>
          </div>
          <input
            type="range"
            id="paramTentacles"
            min="0"
            max="12"
            step="2"
            value={state.tentaclePairs}
            onChange={(e) => onUpdateState({ tentaclePairs: parseInt(e.target.value) })}
            className="w-full cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <label htmlFor="paramRibSpines">External Rib Spines</label>
            <span className="font-mono text-emerald-400">{state.ribSpines}</span>
          </div>
          <input
            type="range"
            id="paramRibSpines"
            min="0"
            max="32"
            step="2"
            value={state.ribSpines}
            onChange={(e) => onUpdateState({ ribSpines: parseInt(e.target.value) })}
            className="w-full cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <label htmlFor="paramEyePods">Ocular Beam Stalks</label>
            <span className="font-mono text-emerald-400">{state.eyePods}</span>
          </div>
          <input
            type="range"
            id="paramEyePods"
            min="0"
            max="8"
            step="2"
            value={state.eyePods}
            onChange={(e) => onUpdateState({ eyePods: parseInt(e.target.value) })}
            className="w-full cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <label htmlFor="paramSporeSacs">Spore Warhead Sacs</label>
            <span className="font-mono text-emerald-400">{state.sporeSacs}</span>
          </div>
          <input
            type="range"
            id="paramSporeSacs"
            min="0"
            max="12"
            step="2"
            value={state.sporeSacs}
            onChange={(e) => onUpdateState({ sporeSacs: parseInt(e.target.value) })}
            className="w-full cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <label htmlFor="paramBioThrusters">Plasma Vent Thruster Nozzles</label>
            <span className="font-mono text-emerald-400">{state.bioThrusters}</span>
          </div>
          <input
            type="range"
            id="paramBioThrusters"
            min="1"
            max="12"
            step="1"
            value={state.bioThrusters}
            onChange={(e) => onUpdateState({ bioThrusters: parseInt(e.target.value) })}
            className="w-full cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <label htmlFor="paramHabitatChambers" className="text-cyan-300 font-semibold">Human Habitat Living Sacs</label>
            <span className="font-mono text-cyan-400">{state.habitatChambers} Chambers</span>
          </div>
          <input
            type="range"
            id="paramHabitatChambers"
            min="0"
            max="8"
            step="1"
            value={state.habitatChambers}
            onChange={(e) => onUpdateState({ habitatChambers: parseInt(e.target.value) })}
            className="w-full cursor-pointer accent-cyan-400"
          />
        </div>
      </div>

      <hr className="border-emerald-500/20" />

      {/* DNA Vault & Genetic Splicing */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-widest flex items-center justify-between">
          <span className="flex items-center gap-1">
            <FlaskConical className="w-3.5 h-3.5 text-emerald-500/70 mr-1" /> DNA Splicing Vault
          </span>
        </h3>

        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <button
            onClick={onSaveDNA_A}
            className="bio-panel hover:border-emerald-400 p-2 rounded text-emerald-300 text-center flex items-center justify-center gap-1 cursor-pointer transition-all"
          >
            <Bookmark className="w-3 h-3" /> Store Genome A
          </button>
          <button
            onClick={onSaveDNA_B}
            className="bio-panel hover:border-emerald-400 p-2 rounded text-emerald-300 text-center flex items-center justify-center gap-1 cursor-pointer transition-all"
          >
            <Bookmark className="w-3 h-3" /> Store Genome B
          </button>
        </div>
        <button
          onClick={onSpliceDNA}
          className="w-full bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/50 py-2 rounded text-xs font-bold font-mono text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)] flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95"
        >
          <FlaskConical className="w-3.5 h-3.5 text-emerald-400 mr-1" /> SPLICE HYBRID OFFSPRING
        </button>
      </div>

      <hr className="border-emerald-500/20" />

      {/* Themes */}
      <div className="space-y-3 pb-2">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-widest flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Palette className="w-3.5 h-3.5 text-emerald-500/70 mr-1" /> Pigment Mode
          </span>
        </h3>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onSetTheme('acid')}
            className={`bio-panel p-2 rounded text-xs flex items-center gap-2 transition-all cursor-pointer ${
              state.theme === 'acid' ? 'bio-panel-active text-emerald-300' : 'hover:border-emerald-400 text-slate-300'
            }`}
          >
            <span className="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]"></span> Acid Emerald
          </button>
          <button
            onClick={() => onSetTheme('void')}
            className={`bio-panel p-2 rounded text-xs flex items-center gap-2 transition-all cursor-pointer ${
              state.theme === 'void' ? 'bio-panel-active text-violet-300' : 'hover:border-violet-400 text-slate-300'
            }`}
          >
            <span className="w-3 h-3 rounded-full bg-violet-400 shadow-[0_0_8px_#c084fc]"></span> Void Biolum
          </button>
          <button
            onClick={() => onSetTheme('blood')}
            className={`bio-panel p-2 rounded text-xs flex items-center gap-2 transition-all cursor-pointer ${
              state.theme === 'blood' ? 'bio-panel-active text-rose-300' : 'hover:border-rose-400 text-slate-300'
            }`}
          >
            <span className="w-3 h-3 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]"></span> Crimson Gore
          </button>
          <button
            onClick={() => onSetTheme('abyssal')}
            className={`bio-panel p-2 rounded text-xs flex items-center gap-2 transition-all cursor-pointer ${
              state.theme === 'abyssal' ? 'bio-panel-active text-cyan-300' : 'hover:border-cyan-400 text-slate-300'
            }`}
          >
            <span className="w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]"></span> Deep Cyan
          </button>
        </div>
      </div>
    </aside>
  );
};
