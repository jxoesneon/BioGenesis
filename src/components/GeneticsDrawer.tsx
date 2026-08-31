import React from 'react';
import { Sliders, Eye, EyeOff, Bone, Dna, Palette, Bookmark, FlaskConical, Spline, Activity, Compass, X } from 'lucide-react';
import { AppState, LoftProfile, SymmetryType, IntakeType, ThemeKey, OrganPipelineType } from '../types';
import { PIPELINE_NAMES, PIPELINE_COLORS } from '../utils/pipelineGraph';

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

export const GeneticsDrawer: React.FC<GeneticsDrawerProps> = React.memo(({
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
      <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
        <h2 className="text-sm font-bold tracking-wider text-cyan-400 uppercase flex items-center gap-2">
          <Sliders className="w-4 h-4" /> Genetics & Surface Splines
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-cyan-500/80 hidden sm:inline">SEED: {state.seed}</span>
          <button className="lg:hidden p-1 rounded-md text-cyan-400 hover:bg-cyan-950/50" onClick={() => setMobilePanel('none')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* NURBS Engine Parameters */}
      <div className="space-y-3 bg-cyan-950/20 p-3 rounded-lg border border-cyan-500/20">
        <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-widest flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Spline className="w-3.5 h-3.5 mr-1" /> Procedural NURBS Engine
          </span>
          <span className="font-mono text-cyan-300">Degree {state.nurbsDegree} ({state.nurbsDegree === 1 ? 'Linear' : state.nurbsDegree === 2 ? 'Quadratic' : state.nurbsDegree === 3 ? 'Cubic' : 'Quartic'})</span>
        </h3>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-cyan-400">
            <label htmlFor="paramNurbsDegree">Spline Degree (p)</label>
            <span className="text-[10px] font-mono text-cyan-500">Polynomial Order</span>
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
          <div className="flex justify-between text-xs text-cyan-400">
            <label htmlFor="paramSymmetryType" className="flex items-center gap-1 font-bold text-cyan-300">
              <Compass className="w-3.5 h-3.5 text-cyan-400" /> Natural Symmetry Axis
            </label>
          </div>
          <select
            id="paramSymmetryType"
            value={state.symmetryType}
            onChange={(e) => onUpdateState({ symmetryType: e.target.value as SymmetryType })}
            className="w-full bg-cyan-950/40 text-cyan-300 text-xs font-mono rounded p-1.5 border border-cyan-500/40 focus:outline-none cursor-pointer"
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
          <div className="flex justify-between text-xs text-cyan-400">
            <label htmlFor="paramIntakeType" className="flex items-center gap-1 font-bold text-cyan-300">
              <Compass className="w-3.5 h-3.5 text-cyan-400" /> Energy Intake Maw
            </label>
          </div>
          <select
            id="paramIntakeType"
            value={state.intakeType}
            onChange={(e) => onUpdateState({ intakeType: e.target.value as IntakeType })}
            className="w-full bg-cyan-950/40 text-cyan-300 text-xs font-mono rounded p-1.5 border border-cyan-500/40 focus:outline-none cursor-pointer"
          >
            <option value="baleen-ram">1. Baleen Ram-Scoop (Leviathan)</option>
            <option value="crushing-mandibles">2. Crushing Mandibles (Harvester)</option>
            <option value="lamprey-siphon">3. Lamprey Siphon (Frigate)</option>
            <option value="stealth-slit">4. Stealth Slit (Interceptor)</option>
            <option value="spore-filter">5. Spore Filter-Web (Carrier)</option>
          </select>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-cyan-400">
            <label htmlFor="paramLoftProfile">Loft Cross-Section Profile</label>
          </div>
          <select
            id="paramLoftProfile"
            value={state.loftProfile}
            onChange={(e) => onUpdateState({ loftProfile: e.target.value as LoftProfile })}
            className="w-full bg-cyan-950/40 text-cyan-300 text-xs font-mono rounded p-1.5 border border-cyan-500/30 focus:outline-none cursor-pointer"
          >
            <option value="trilobed">Trilobed Alien Carapace</option>
            <option value="spine">Dorsal Spined Ridge</option>
            <option value="circular">Circular Bio-Tube</option>
            <option value="star">Star-Flanged Chitin Shell</option>
          </select>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-cyan-400">
            <label htmlFor="paramRationalWeight">Rational Control Weight Bias (w)</label>
            <span className="font-mono text-cyan-400">{state.rationalWeight}</span>
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
          <div className="flex justify-between text-xs text-cyan-400">
            <label htmlFor="paramGridResolution">U x V Surface Resolution Grid</label>
            <span className="font-mono text-cyan-400">{state.gridResolution}x{state.gridResolution}</span>
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
          <span className="text-cyan-300 font-mono">Show 3D Control Net Grid:</span>
          <button
            onClick={() => onUpdateState({ showControlNet: !state.showControlNet })}
            className={`px-2 py-1 rounded text-[11px] font-mono flex items-center gap-1 cursor-pointer transition-all ${
              state.showControlNet ? 'bio-panel bio-panel-active text-cyan-300' : 'bio-panel text-cyan-400'
            }`}
          >
            {state.showControlNet ? <Eye className="w-3 h-3 mr-1" /> : <EyeOff className="w-3 h-3 mr-1" />}
            CONTROL NET
          </button>
        </div>

        <div className="flex items-center justify-between text-xs pt-1">
          <span className="text-cyan-300 font-mono">Show Organ Force Fields:</span>
          <button
            onClick={() => onUpdateState({ showForceField: !state.showForceField })}
            className={`px-2 py-1 rounded text-[11px] font-mono flex items-center gap-1 cursor-pointer transition-all ${
              state.showForceField ? 'bio-panel bio-panel-active text-cyan-300' : 'bio-panel text-cyan-400'
            }`}
          >
            {state.showForceField ? <Eye className="w-3 h-3 mr-1" /> : <EyeOff className="w-3 h-3 mr-1" />}
            FORCE FIELD
          </button>
        </div>
      </div>

      {/* Pipeline Conduit Visibility */}
      <div className="space-y-2 bg-cyan-950/20 p-3 rounded-lg border border-cyan-500/20">
        <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-1">
          <Activity className="w-3.5 h-3.5 mr-1" /> Pipeline Conduit Visibility
        </h3>
        {([
          { key: 'BIO_PLASMA' as OrganPipelineType, field: 'showConduitBioPlasma' as const },
          { key: 'HEMOLYMPH' as OrganPipelineType, field: 'showConduitHemolymph' as const },
          { key: 'NERVOUS' as OrganPipelineType, field: 'showConduitNervous' as const },
          { key: 'LIFE_SUPPORT' as OrganPipelineType, field: 'showConduitLifeSupport' as const },
          { key: 'ARMOR_DEFENSE' as OrganPipelineType, field: 'showConduitArmorDefense' as const },
        ]).map(({ key, field }) => {
          const visible = state[field];
          const color = PIPELINE_COLORS[key];
          const cssColor = `#${color.toString(16).padStart(6, '0')}`;
          return (
            <div key={key} className="flex items-center justify-between text-xs">
              <span className="text-cyan-300 font-mono flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: cssColor, boxShadow: `0 0 6px ${cssColor}` }}
                />
                {PIPELINE_NAMES[key]}
              </span>
              <button
                onClick={() => onUpdateState({ [field]: !visible } as Partial<AppState>)}
                className={`px-2 py-1 rounded text-[11px] font-mono flex items-center gap-1 cursor-pointer transition-all ${
                  visible ? 'bio-panel bio-panel-active text-cyan-300' : 'bio-panel text-cyan-400'
                }`}
              >
                {visible ? <Eye className="w-3 h-3 mr-1" /> : <EyeOff className="w-3 h-3 mr-1" />}
                {visible ? 'VISIBLE' : 'HIDDEN'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Biological System Debug Visibility */}
      <div className="space-y-2 bg-amber-950/20 p-3 rounded-lg border border-amber-500/20">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1">
            <FlaskConical className="w-3.5 h-3.5 mr-1" /> System Debug Visibility
          </h3>
          <button
            onClick={() => {
              const systemKeys = [
                'showSystemHull', 'showSystemSkeletal', 'showSystemMuscular', 'showSystemVascular',
                'showSystemNeural', 'showSystemNeuralVentral', 'showNerveBranches',
                'showSystemRespiratory', 'showSystemCirculatory', 'showSystemBioPlasma',
                'showSystemPropulsion', 'showSystemLifeSupport', 'showCommandRoom',
                'showSystemArmorDefense', 'showSystemSurfaceOrgans',
                'showSystemAppendages', 'showSystemLighting', 'showSystemParticles', 'showSystemOverlays', 'showSystemDebug',
              ] as const;
              const allVisible = systemKeys.every((k) => state[k]);
              const updates = Object.fromEntries(systemKeys.map((k) => [k, !allVisible]));
              onUpdateState(updates as Partial<AppState>);
            }}
            className="px-2 py-1 rounded text-[11px] font-mono flex items-center gap-1 cursor-pointer transition-all bio-panel text-amber-400 hover:text-amber-300"
          >
            <Eye className="w-3 h-3" /> Show/Hide All
          </button>
        </div>
        {([
          { field: 'showSystemHull' as const,          label: 'Hull (Carapace Surface)',       icon: 'bone' },
          { field: 'showSystemSkeletal' as const,      label: 'Skeletal (Vertebrae + Plates)', icon: 'bone' },
          { field: 'showSystemMuscular' as const,      label: 'Muscular (Tendon Fibers)',      icon: 'activity' },
          { field: 'showSystemVascular' as const,      label: 'Vascular (Arteries + Veins)',   icon: 'activity' },
          { field: 'showSystemNeural' as const,        label: 'Neural (Brain + Cord)',         icon: 'activity' },
          { field: 'showSystemNeuralVentral' as const, label: 'Neural Ventral (VNC Chain)',    icon: 'activity' },
          { field: 'showNerveBranches' as const,       label: 'Nerve Branches (Ganglion→Organ)', icon: 'activity' },
          { field: 'showSystemRespiratory' as const,   label: 'Respiratory (Spiracles)',       icon: 'activity' },
          { field: 'showSystemCirculatory' as const,   label: 'Circulatory (Heart)',           icon: 'activity' },
          { field: 'showSystemBioPlasma' as const,     label: 'Bio-Plasma (Glands + Trunk)',   icon: 'activity' },
          { field: 'showSystemPropulsion' as const,    label: 'Propulsion (Cowl + Nozzles)',   icon: 'activity' },
          { field: 'showSystemLifeSupport' as const,   label: 'Life Support (Intake + Hab)',   icon: 'activity' },
          { field: 'showCommandRoom' as const,         label: 'Command Room (Bridge + Crew)',  icon: 'bone' },
          { field: 'showSystemArmorDefense' as const,  label: 'Armor Defense (Shields)',       icon: 'activity' },
          { field: 'showSystemSurfaceOrgans' as const, label: 'Surface (Ribs + Eyes + Spores)',icon: 'activity' },
          { field: 'showSystemAppendages' as const,    label: 'Appendages (Fins + Limbs)',     icon: 'activity' },
          { field: 'showSystemLighting' as const,      label: 'Lighting (Scene Lights)',       icon: 'activity' },
          { field: 'showSystemParticles' as const,     label: 'Particles (Spores + Thrust)',   icon: 'activity' },
          { field: 'showSystemOverlays' as const,      label: 'Overlays (Section Bands)',      icon: 'activity' },
          { field: 'showSystemDebug' as const,         label: 'Debug (Grid + Sym Box)',        icon: 'activity' },
        ]).map(({ field, label, icon }) => {
          const visible = state[field];
          return (
            <div key={field} className="flex items-center justify-between text-xs">
              <span className="text-amber-300 font-mono flex items-center gap-1.5">
                {icon === 'bone' && <Bone className="w-3 h-3 shrink-0" />}
                {icon === 'activity' && <Activity className="w-3 h-3 shrink-0" />}
                {label}
              </span>
              <button
                onClick={() => onUpdateState({ [field]: !visible } as Partial<AppState>)}
                className={`px-2 py-1 rounded text-[11px] font-mono flex items-center gap-1 cursor-pointer transition-all ${
                  visible ? 'bio-panel bio-panel-active text-amber-300' : 'bio-panel text-amber-400'
                }`}
              >
                {visible ? <Eye className="w-3 h-3 mr-1" /> : <EyeOff className="w-3 h-3 mr-1" />}
                {visible ? 'VISIBLE' : 'HIDDEN'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Spine & Hull Morphing */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-cyan-300 uppercase tracking-widest flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Bone className="w-3.5 h-3.5 text-cyan-500/70 mr-1" /> Carapace & Spine
          </span>
          <span className="font-mono text-cyan-400">{state.length}m</span>
        </h3>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-cyan-400">
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
          <div className="flex justify-between text-xs text-cyan-400">
            <label htmlFor="paramSegments">Vertebral Segments</label>
            <span className="font-mono text-cyan-400">{state.segments}</span>
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
          <div className="flex justify-between text-xs text-cyan-400">
            <label htmlFor="paramThoraxWidth">Thorax Girth</label>
            <span className="font-mono text-cyan-400">{state.thoraxWidth}</span>
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
          <div className="flex justify-between text-xs text-cyan-400">
            <label htmlFor="paramPlateCoverage">Chitin Armor Shells</label>
            <span className="font-mono text-cyan-400">{state.plateCoverage}%</span>
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
          <div className="flex justify-between text-xs text-cyan-400">
            <label htmlFor="paramSpinalArch">Spinal Flex Arch / Caudal Curve</label>
            <span className="font-mono text-cyan-400">{state.spinalArch > 0 ? `+${state.spinalArch}` : state.spinalArch}m</span>
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
          <div className="flex justify-between text-xs text-cyan-400">
            <label htmlFor="paramPlateOverlap">Overlapping Chitin Scales</label>
            <span className="font-mono text-cyan-400">{state.plateOverlap}</span>
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

      <hr className="border-cyan-500/20" />

      {/* Internal Systems & Respiration */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-cyan-300 uppercase tracking-widest flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Activity className="w-3.5 h-3.5 text-cyan-500/70 mr-1" /> Vascular & Respiration
          </span>
        </h3>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-cyan-400">
            <label htmlFor="paramVascularDensity">Vascular Artery Conduits</label>
            <span className="font-mono text-cyan-400">{state.vascularDensity}</span>
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
          <div className="flex justify-between text-xs text-cyan-400">
            <label htmlFor="paramSpiracleCount">Respiratory Spiracle Gill Vents</label>
            <span className="font-mono text-cyan-400">{state.spiracleCount}</span>
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
          <div className="flex justify-between text-xs text-cyan-400">
            <label htmlFor="paramTendonDensity">Muscular Ligament Fibers</label>
            <span className="font-mono text-cyan-400">{state.tendonDensity}</span>
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


      <hr className="border-cyan-500/20" />

      {/* Organic Extremities & Symbionts */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-cyan-300 uppercase tracking-widest flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Dna className="w-3.5 h-3.5 text-cyan-500/70 mr-1" /> Appendages & Symbionts
          </span>
        </h3>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-cyan-400">
            <label htmlFor="paramTentacles">IK Feeler Appendages</label>
            <span className="font-mono text-cyan-400">{state.tentaclePairs}</span>
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
          <div className="flex justify-between text-xs text-cyan-400">
            <label htmlFor="paramRibSpines">External Rib Spines</label>
            <span className="font-mono text-cyan-400">{state.ribSpines}</span>
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
          <div className="flex justify-between text-xs text-cyan-400">
            <label htmlFor="paramEyePods">Ocular Beam Pods</label>
            <span className="font-mono text-cyan-400">{state.eyePods}</span>
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
          <div className="flex justify-between text-xs text-cyan-400">
            <label htmlFor="paramEyeStalkLength">Eye Stalk Length</label>
            <span className="font-mono text-cyan-400">{state.eyeStalkLength.toFixed(1)}m</span>
          </div>
          <input
            type="range"
            id="paramEyeStalkLength"
            min="0"
            max="2"
            step="0.1"
            value={state.eyeStalkLength}
            onChange={(e) => onUpdateState({ eyeStalkLength: parseFloat(e.target.value) })}
            className="w-full cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-cyan-400">
            <label htmlFor="paramSporeSacs">Spore Warhead Sacs</label>
            <span className="font-mono text-cyan-400">{state.sporeSacs}</span>
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
          <div className="flex justify-between text-xs text-cyan-400">
            <label htmlFor="paramBioThrusters">Plasma Vent Thruster Nozzles</label>
            <span className="font-mono text-cyan-400">{state.bioThrusters}</span>
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
          <div className="flex justify-between text-xs text-cyan-400">
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

      <hr className="border-cyan-500/20" />

      {/* Supporting Appendages — Hydrodynamic/Aerodynamic */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-cyan-300 uppercase tracking-widest flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Dna className="w-3.5 h-3.5 text-cyan-500/70 mr-1" /> Supporting Appendages
          </span>
          <span className="text-[9px] text-cyan-500/60 normal-case">Hydro/Aero Surfaces</span>
        </h3>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-cyan-400">
            <label htmlFor="paramAppendageScale">Appendage Base Scale</label>
            <span className="font-mono text-cyan-400">{state.appendageScale.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            id="paramAppendageScale"
            min="0.5"
            max="3.0"
            step="0.1"
            value={state.appendageScale}
            onChange={(e) => onUpdateState({ appendageScale: parseFloat(e.target.value) })}
            className="w-full accent-cyan-500 bg-cyan-950/50"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-cyan-400">
            <label htmlFor="paramPectoralFins">Pectoral Hydrodynamic Fins</label>
            <span className="font-mono text-cyan-400">{state.pectoralFins}</span>
          </div>
          <input
            type="range"
            id="paramPectoralFins"
            min="0"
            max="4"
            step="1"
            value={state.pectoralFins}
            onChange={(e) => onUpdateState({ pectoralFins: parseInt(e.target.value) })}
            className="w-full cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-cyan-400">
            <label htmlFor="paramCaudalFlukes">Caudal Propulsion Flukes</label>
            <span className="font-mono text-cyan-400">{state.caudalFlukes}</span>
          </div>
          <input
            type="range"
            id="paramCaudalFlukes"
            min="0"
            max="2"
            step="1"
            value={state.caudalFlukes}
            onChange={(e) => onUpdateState({ caudalFlukes: parseInt(e.target.value) })}
            className="w-full cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-cyan-400">
            <label htmlFor="paramLandingLimbs">Articulated Landing Limbs</label>
            <span className="font-mono text-cyan-400">{state.landingLimbs}</span>
          </div>
          <input
            type="range"
            id="paramLandingLimbs"
            min="0"
            max="6"
            step="1"
            value={state.landingLimbs}
            onChange={(e) => onUpdateState({ landingLimbs: parseInt(e.target.value) })}
            className="w-full cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-cyan-400">
            <label htmlFor="paramDorsalSail">Dorsal Stabilizer Sails</label>
            <span className="font-mono text-cyan-400">{state.dorsalSail}</span>
          </div>
          <input
            type="range"
            id="paramDorsalSail"
            min="0"
            max="3"
            step="1"
            value={state.dorsalSail}
            onChange={(e) => onUpdateState({ dorsalSail: parseInt(e.target.value) })}
            className="w-full cursor-pointer"
          />
        </div>
      </div>

      <hr className="border-cyan-500/20" />

      {/* DNA Vault & Genetic Splicing */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-cyan-300 uppercase tracking-widest flex items-center justify-between">
          <span className="flex items-center gap-1">
            <FlaskConical className="w-3.5 h-3.5 text-cyan-500/70 mr-1" /> DNA Splicing Vault
          </span>
        </h3>

        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <button
            onClick={onSaveDNA_A}
            className="bio-panel hover:border-cyan-400 p-2 rounded text-cyan-300 text-center flex items-center justify-center gap-1 cursor-pointer transition-all"
          >
            <Bookmark className="w-3 h-3" /> Store Genome A
          </button>
          <button
            onClick={onSaveDNA_B}
            className="bio-panel hover:border-cyan-400 p-2 rounded text-cyan-300 text-center flex items-center justify-center gap-1 cursor-pointer transition-all"
          >
            <Bookmark className="w-3 h-3" /> Store Genome B
          </button>
        </div>
        <button
          onClick={onSpliceDNA}
          className="w-full bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/50 py-2 rounded text-xs font-bold font-mono text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.2)] flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95"
        >
          <FlaskConical className="w-3.5 h-3.5 text-cyan-400 mr-1" /> SPLICE HYBRID OFFSPRING
        </button>
      </div>

      <hr className="border-cyan-500/20" />

      {/* Themes */}
      <div className="space-y-3 pb-2">
        <h3 className="text-xs font-semibold text-cyan-300 uppercase tracking-widest flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Palette className="w-3.5 h-3.5 text-cyan-500/70 mr-1" /> Pigment Mode
          </span>
        </h3>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onSetTheme('acid')}
            className={`bio-panel p-2 rounded text-xs flex items-center gap-2 transition-all cursor-pointer ${
              state.theme === 'acid' ? 'bio-panel-active text-cyan-300' : 'hover:border-cyan-400 text-cyan-300'
            }`}
          >
            <span className="w-3 h-3 rounded-full bg-[#10b981] shadow-[0_0_8px_#34d399]"></span> Acid Emerald
          </button>
          <button
            onClick={() => onSetTheme('void')}
            className={`bio-panel p-2 rounded text-xs flex items-center gap-2 transition-all cursor-pointer ${
              state.theme === 'void' ? 'bio-panel-active text-violet-300' : 'hover:border-violet-400 text-cyan-300'
            }`}
          >
            <span className="w-3 h-3 rounded-full bg-violet-400 shadow-[0_0_8px_#c084fc]"></span> Void Biolum
          </button>
          <button
            onClick={() => onSetTheme('blood')}
            className={`bio-panel p-2 rounded text-xs flex items-center gap-2 transition-all cursor-pointer ${
              state.theme === 'blood' ? 'bio-panel-active text-rose-300' : 'hover:border-rose-400 text-cyan-300'
            }`}
          >
            <span className="w-3 h-3 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]"></span> Crimson Gore
          </button>
          <button
            onClick={() => onSetTheme('abyssal')}
            className={`bio-panel p-2 rounded text-xs flex items-center gap-2 transition-all cursor-pointer ${
              state.theme === 'abyssal' ? 'bio-panel-active text-cyan-300' : 'hover:border-cyan-400 text-cyan-300'
            }`}
          >
            <span className="w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]"></span> Deep Cyan
          </button>
        </div>
      </div>
    </aside>
  );
});
