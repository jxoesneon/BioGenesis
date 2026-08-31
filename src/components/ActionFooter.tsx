import React from 'react';
import { Video, RotateCw, Camera, Sliders, HeartPulse, X } from 'lucide-react';
import { AppState } from '../types';

interface ActionFooterProps {
  state: AppState;
  onResetView: () => void;
  onToggleAutoRotate: () => void;
  onTakeSnapshot: () => void;
  mobilePanel: 'genetics' | 'telemetry' | 'none';
  setMobilePanel: (panel: 'genetics' | 'telemetry' | 'none') => void;
  showSceneControls?: boolean;
}

export const ActionFooter: React.FC<ActionFooterProps> = React.memo(({
  state,
  onResetView,
  onToggleAutoRotate,
  onTakeSnapshot,
  mobilePanel,
  setMobilePanel,
  showSceneControls = true,
}) => {
  return (
    <footer className="absolute bottom-4 lg:bottom-6 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 pointer-events-auto w-[95%] lg:w-auto">
      {/* Mobile Toggle Controls (Hidden on large screens) */}
      <div className="flex lg:hidden items-center justify-center gap-2 w-full">
        <button
          onClick={() => setMobilePanel(mobilePanel === 'genetics' ? 'none' : 'genetics')}
          className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex justify-center items-center gap-2 transition-all ${
            mobilePanel === 'genetics' ? 'bg-cyan-600 text-cyan-950' : 'bio-panel text-cyan-400'
          }`}
        >
          {mobilePanel === 'genetics' ? <X className="w-4 h-4" /> : <Sliders className="w-4 h-4" />}
          GENETICS
        </button>
        <button
          onClick={() => setMobilePanel(mobilePanel === 'telemetry' ? 'none' : 'telemetry')}
          className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex justify-center items-center gap-2 transition-all ${
            mobilePanel === 'telemetry' ? 'bg-rose-600 text-cyan-950' : 'bio-panel text-rose-400'
          }`}
        >
          {mobilePanel === 'telemetry' ? <X className="w-4 h-4" /> : <HeartPulse className="w-4 h-4" />}
          TELEMETRY
        </button>
      </div>

      {/* Main Action Buttons (3D scene controls — hidden in engineering view) */}
      {showSceneControls && (
        <div className="flex items-center justify-center gap-2 w-full flex-wrap lg:flex-nowrap">
          <button
            onClick={onResetView}
            className="bio-panel hover:bio-panel-active text-cyan-200 px-3 py-2 rounded-lg text-xs font-mono flex items-center gap-2 cursor-pointer transition-all active:scale-95 whitespace-nowrap"
          >
            <Video className="w-4 h-4 hidden sm:block" /> Reset
          </button>
          <button
            onClick={onToggleAutoRotate}
            className={`px-3 py-2 rounded-lg text-xs font-mono flex items-center gap-2 cursor-pointer transition-all active:scale-95 whitespace-nowrap ${
              state.autoRotate ? 'bio-panel bio-panel-active text-cyan-400' : 'bio-panel text-cyan-400'
            }`}
          >
            <RotateCw className={`w-4 h-4 hidden sm:block ${state.autoRotate ? 'animate-spin' : ''}`} /> Auto-Rotate
          </button>
          <button
            onClick={onTakeSnapshot}
            className="bio-panel hover:bio-panel-active text-cyan-200 px-3 py-2 rounded-lg text-xs font-mono flex items-center gap-2 cursor-pointer transition-all active:scale-95 whitespace-nowrap"
          >
            <Camera className="w-4 h-4 hidden sm:block" /> Snapshot
          </button>
        </div>
      )}
    </footer>
  );
});
