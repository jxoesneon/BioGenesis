import React from 'react';
import { Volume2, VolumeX, Dices, Download, Spline } from 'lucide-react';
import { AppState } from '../types';
import { presets } from '../utils/theme';

interface HeaderProps {
  state: AppState;
  onUpdateState: (updates: Partial<AppState>) => void;
  onMutateSeed: () => void;
  onExportOBJ: () => void;
  onSelectPreset: (presetId: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  state,
  onUpdateState,
  onMutateSeed,
  onExportOBJ,
  onSelectPreset,
}) => {
  return (
    <header className="absolute top-0 left-0 right-0 z-20 flex flex-col md:flex-row items-center md:justify-between px-4 sm:px-6 py-2 sm:py-4 pointer-events-none gap-2 sm:gap-4 bg-gradient-to-b from-slate-950/80 to-transparent">
      <div className="flex items-center space-x-3 pointer-events-auto mt-2 md:mt-0">
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-emerald-950/80 border border-emerald-500/50 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)] shrink-0">
          <Spline className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
        </div>
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-wider text-emerald-400 glow-text-emerald uppercase flex items-center gap-2 flex-wrap">
            GENESIS-X <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded bg-emerald-950 border border-emerald-500/30 text-emerald-300 font-mono">NURBS BIO ENGINE v5.0</span>
          </h1>
          <p className="text-[9px] sm:text-xs text-slate-400 font-mono hidden sm:block">COX-DE BOOR LOFTING // PARAMETRIC CARAPACE GENERATOR</p>
        </div>
      </div>

      {/* Presets & Quick Actions */}
      <div className="flex items-center justify-center flex-wrap gap-2 pointer-events-auto">
        <button
          onClick={() => onUpdateState({ audioEnabled: !state.audioEnabled })}
          className="bio-panel hover:bio-panel-active text-emerald-400 p-2 sm:px-3 sm:py-2 rounded-lg text-sm flex items-center gap-2 transition-all cursor-pointer"
          title="Toggle Web Audio Synthesizer"
        >
          {state.audioEnabled ? (
            <>
              <Volume2 className="w-4 h-4" /> <span className="text-[10px] sm:text-xs font-mono hidden sm:inline">AUDIO ON</span>
            </>
          ) : (
            <>
              <VolumeX className="w-4 h-4 text-slate-400" /> <span className="text-[10px] sm:text-xs font-mono text-slate-400 hidden sm:inline">MUTED</span>
            </>
          )}
        </button>

        <div className="bio-panel px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg flex items-center gap-2">
          <span className="text-[10px] sm:text-xs font-mono text-slate-400 uppercase hidden lg:inline">Organism Archetype:</span>
          <select
            onChange={(e) => onSelectPreset(e.target.value)}
            defaultValue="leviathan"
            className="bg-slate-900 text-emerald-300 text-[10px] sm:text-sm font-semibold rounded px-1 py-1 border border-emerald-500/30 focus:outline-none focus:border-emerald-400 cursor-pointer max-w-[120px] sm:max-w-none"
          >
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={onMutateSeed}
          className="bio-panel hover:bio-panel-active text-emerald-400 hover:text-emerald-300 p-2 sm:px-4 sm:py-2 rounded-lg font-semibold text-sm flex items-center gap-1 sm:gap-2 transition-all active:scale-95 cursor-pointer"
        >
          <Dices className="w-4 h-4 text-emerald-400" /> <span className="text-[10px] sm:text-sm hidden sm:inline">Mutate Seed</span>
        </button>

        <button
          onClick={onExportOBJ}
          className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold p-2 sm:px-4 sm:py-2 rounded-lg text-sm flex items-center gap-1 sm:gap-2 shadow-[0_0_15px_rgba(16,185,129,0.4)] transition-all active:scale-95 cursor-pointer"
        >
          <Download className="w-4 h-4" /> <span className="text-[10px] sm:text-sm hidden sm:inline">Export OBJ</span>
        </button>
      </div>
    </header>
  );
};
