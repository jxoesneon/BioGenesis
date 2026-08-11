import React from 'react';
import { Volume2, VolumeX, Dices, Download, Spline, HeartPulse, Crosshair } from 'lucide-react';
import { AppState } from '../types';
import { presets } from '../utils/theme';

interface HeaderProps {
  state: AppState;
  onUpdateState: (updates: Partial<AppState>) => void;
  onMutateSeed: () => void;
  onExportOBJ: () => void;
  onSelectPreset: (presetId: string) => void;
}

export const Header: React.FC<HeaderProps> = React.memo(({
  state,
  onUpdateState,
  onMutateSeed,
  onExportOBJ,
  onSelectPreset,
}) => {
  return (
    <header className="absolute top-0 left-0 right-0 z-20 flex flex-col md:flex-row items-center md:justify-between px-4 sm:px-6 py-2 sm:py-4 pointer-events-none gap-2 sm:gap-4 bg-gradient-to-b from-slate-950/80 to-transparent">
      <div className="flex items-center space-x-3 pointer-events-auto mt-2 md:mt-0">
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)] shrink-0">
          <Spline className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
        </div>
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-wider text-cyan-400 glow-text-cyan uppercase flex items-center gap-2 flex-wrap">
            GENESIS-X <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/30 text-cyan-300 font-mono">NURBS BIO ENGINE v5.0</span>
          </h1>
          <p className="text-[9px] sm:text-xs text-cyan-400 font-mono hidden sm:block">COX-DE BOOR LOFTING // PARAMETRIC CARAPACE GENERATOR</p>
        </div>
      </div>

      {/* Presets & Quick Actions */}
      <div className="flex items-center justify-center flex-wrap gap-2 pointer-events-auto">
        <button
          onClick={() => onUpdateState({ audioEnabled: !state.audioEnabled })}
          className="bio-panel hover:bio-panel-active text-cyan-400 p-2 sm:px-3 sm:py-2 rounded-lg text-sm flex items-center gap-2 transition-all cursor-pointer"
          title="Toggle Web Audio Synthesizer"
        >
          {state.audioEnabled ? (
            <>
              <Volume2 className="w-4 h-4" /> <span className="text-[10px] sm:text-xs font-mono hidden sm:inline">AUDIO ON</span>
            </>
          ) : (
            <>
              <VolumeX className="w-4 h-4 text-cyan-400" /> <span className="text-[10px] sm:text-xs font-mono text-cyan-400 hidden sm:inline">MUTED</span>
            </>
          )}
        </button>

        <button
          onClick={() => onUpdateState({ heartbeatEnabled: !state.heartbeatEnabled })}
          className={`p-2 sm:px-3 sm:py-2 rounded-lg text-sm flex items-center gap-2 transition-all cursor-pointer ${
            state.heartbeatEnabled ? 'bio-panel bio-panel-active text-rose-400' : 'bio-panel text-cyan-400'
          }`}
          title="Toggle Heartbeat Sound"
        >
          <HeartPulse className={`w-4 h-4 ${state.heartbeatEnabled ? 'animate-pulse' : ''}`} />
          <span className="text-[10px] sm:text-xs font-mono hidden sm:inline">
            {state.heartbeatEnabled ? 'HEART ON' : 'HEART OFF'}
          </span>
        </button>

        <button
          onClick={() => onUpdateState({ fireDisruptors: state.fireDisruptors + 1 })}
          className="bg-rose-600/80 hover:bg-rose-500 text-rose-50 p-2 sm:px-3 sm:py-2 rounded-lg text-sm flex items-center gap-2 transition-all cursor-pointer hover:animate-pulse shadow-[0_0_15px_rgba(244,63,94,0.4)] active:scale-95"
          title="Fire Bio-Plasma Disruptor Glands"
        >
          <Crosshair className="w-4 h-4" />
          <span className="text-[10px] sm:text-xs font-mono hidden sm:inline">FIRE DISRUPTORS</span>
        </button>

        <div className="bio-panel px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg flex items-center gap-2">
          <span className="text-[10px] sm:text-xs font-mono text-cyan-400 uppercase hidden lg:inline">Organism Archetype:</span>
          <select
            onChange={(e) => onSelectPreset(e.target.value)}
            defaultValue="leviathan"
            className="bg-cyan-950/40 text-cyan-300 text-[10px] sm:text-sm font-semibold rounded px-1 py-1 border border-cyan-500/30 focus:outline-none focus:border-cyan-400 cursor-pointer max-w-[120px] sm:max-w-none"
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
          className="bio-panel hover:bio-panel-active text-cyan-400 hover:text-cyan-300 p-2 sm:px-4 sm:py-2 rounded-lg font-semibold text-sm flex items-center gap-1 sm:gap-2 transition-all active:scale-95 cursor-pointer"
        >
          <Dices className="w-4 h-4 text-cyan-400" /> <span className="text-[10px] sm:text-sm hidden sm:inline">Mutate Seed</span>
        </button>

        <button
          onClick={onExportOBJ}
          className="bg-cyan-600 hover:bg-cyan-500 text-cyan-950 font-bold p-2 sm:px-4 sm:py-2 rounded-lg text-sm flex items-center gap-1 sm:gap-2 shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all active:scale-95 cursor-pointer"
        >
          <Download className="w-4 h-4" /> <span className="text-[10px] sm:text-sm hidden sm:inline">Export OBJ</span>
        </button>
      </div>
    </header>
  );
});
