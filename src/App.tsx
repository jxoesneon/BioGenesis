import { useState, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AppState, TargetNodeInfo, ViewMode, ThemeKey, AnatomyLayer, ShipSection } from './types';
import { presets } from './utils/theme';
import { playMutationSquelch } from './utils/audio';
import { exportToOBJ } from './utils/exporter';
import { Header } from './components/Header';
import { GeneticsDrawer } from './components/GeneticsDrawer';
import { TelemetryPanel } from './components/TelemetryPanel';
import { ActionFooter } from './components/ActionFooter';
import { Canvas3D } from './components/Canvas3D';
import { CheckCircle2 } from 'lucide-react';

export default function App() {
  const [state, setState] = useState<AppState>({
    seed: 849201,
    length: 14,
    segments: 10,
    thoraxWidth: 2.4,
    plateCoverage: 80,
    tentaclePairs: 6,
    ribSpines: 16,
    eyePods: 4,
    eyeStalkLength: 0.6,
    sporeSacs: 6,
    bioThrusters: 3,
    habitatChambers: 3,
    neuralNodes: 12,

    pectoralFins: 2,
    appendageScale: 1.0,
    caudalFlukes: 1,
    landingLimbs: 4,
    dorsalSail: 1,

    symmetryType: 'bilateral',
    intakeType: 'lamprey-siphon',

    spinalArch: 1.0,
    plateOverlap: 8,
    vascularDensity: 6,
    spiracleCount: 8,
    tendonDensity: 12,
    fluidWobble: 1.5,

    nurbsDegree: 3,
    loftProfile: 'trilobed',
    rationalWeight: 1.8,
    gridResolution: 28,
    showControlNet: true,
    showForceField: false,
    showConduitBioPlasma: true,
    showConduitHemolymph: true,
    showConduitNervous: true,
    showConduitLifeSupport: true,
    showConduitArmorDefense: true,
    fireDisruptors: 0,

    theme: 'abyssal',
    pulseAnim: true,
    waveAnim: true,
    autoRotate: false,
    viewMode: 'organic',
    anatomyLayer: 'full',
    audioEnabled: true,
    heartbeatEnabled: false,

    genomeA: null,
    genomeB: null,
  });

  const [targetNode, setTargetNode] = useState<TargetNodeInfo>({
    name: 'Primary Ganglion Core',
    category: 'Circulatory Core',
    desc: 'Central biological command cluster driving autonomous life support and thrust coordination.',
    metabolicRate: '98% Primary Energy Flux',
    neuralFreq: '68 BPM Sync',
    enzymaticPressure: '14.8 bar Hydraulic Stroke',
  });

  const [organList, setOrganList] = useState<TargetNodeInfo[]>([]);
  const [highlightedSection, setHighlightedSection] = useState<ShipSection | null>(null);

  const [toastMsg, setToastMsg] = useState<string>('');
  const [toastVisible, setToastVisible] = useState<boolean>(false);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [mobilePanel, setMobilePanel] = useState<'genetics' | 'telemetry' | 'none'>('none');

  // Canvas & Three.js Refs
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const shipGroupRef = useRef<THREE.Group | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastVisible(false);
    }, 2500);
  }, []);

  const updateState = useCallback((updates: Partial<AppState>) => {
    setState((prev) => {
      const next = { ...prev, ...updates };
      playMutationSquelch(next.audioEnabled);
      return next;
    });
  }, []);

  const handleMutateSeed = useCallback(() => {
    const newSeed = Math.floor(Math.random() * 899999) + 100000;
    updateState({ seed: newSeed });
    showToast('Genetics Mutated!');
  }, [updateState, showToast]);

  const handleSelectPreset = useCallback((presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (preset) {
      updateState({ ...preset.config });
      showToast(`Loaded Preset: ${preset.name}`);
    }
  }, [updateState, showToast]);

  const handleSaveDNA_A = useCallback(() => {
    setState((prev) => ({ ...prev, genomeA: { ...prev } }));
    showToast('Genome A Stored in Vault');
  }, [showToast]);

  const handleSaveDNA_B = useCallback(() => {
    setState((prev) => ({ ...prev, genomeB: { ...prev } }));
    showToast('Genome B Stored in Vault');
  }, [showToast]);

  const handleSpliceDNA = useCallback(() => {
    if (!state.genomeA || !state.genomeB) {
      showToast('Store both Genome A & B first!');
      return;
    }

    const avgLength = Math.round((state.genomeA.length + state.genomeB.length) / 2);
    const avgSegments = Math.round((state.genomeA.segments + state.genomeB.segments) / 2);
    const avgThorax = parseFloat(((state.genomeA.thoraxWidth + state.genomeB.thoraxWidth) / 2).toFixed(1));
    const avgPlate = Math.round((state.genomeA.plateCoverage + state.genomeB.plateCoverage) / 2);
    const avgTentacles = Math.round((state.genomeA.tentaclePairs + state.genomeB.tentaclePairs) / 2);
    const hybridSeed = Math.floor((state.genomeA.seed + state.genomeB.seed) / 2);

    updateState({
      length: avgLength,
      segments: avgSegments,
      thoraxWidth: avgThorax,
      plateCoverage: avgPlate,
      tentaclePairs: avgTentacles,
      seed: hybridSeed,
    });

    showToast('Hybrid Organism Spliced!');
  }, [state.genomeA, state.genomeB, updateState, showToast]);

  const handleSetTheme = useCallback((theme: ThemeKey) => {
    updateState({ theme });
    showToast(`Pigment Mode: ${theme.toUpperCase()}`);
  }, [updateState, showToast]);

  const handleSetViewMode = useCallback((viewMode: ViewMode) => {
    updateState({ viewMode });
  }, [updateState]);

  const handleSetAnatomyLayer = useCallback((anatomyLayer: AnatomyLayer) => {
    updateState({ anatomyLayer });
    showToast(`Anatomy Layer: ${anatomyLayer.toUpperCase()}`);
  }, [updateState, showToast]);

  const handleResetView = useCallback(() => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(20, 10, 25);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  }, []);

  const handleToggleAutoRotate = useCallback(() => {
    setState((prev) => {
      const nextRotate = !prev.autoRotate;
      showToast(`Auto-Rotate: ${nextRotate ? 'ENABLED' : 'DISABLED'}`);
      return { ...prev, autoRotate: nextRotate };
    });
  }, [showToast]);

  const handleTakeSnapshot = useCallback(() => {
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
      const link = document.createElement('a');
      link.download = `biopunk_nurbs_ship_${state.seed}.png`;
      link.href = rendererRef.current.domElement.toDataURL('image/png');
      link.click();
      showToast('Snapshot Saved!');
    }
  }, [state.seed, showToast]);

  const handleExportOBJ = useCallback(() => {
    if (shipGroupRef.current) {
      exportToOBJ(shipGroupRef.current, state.seed);
      showToast('OBJ 3D Model Exported!');
    }
  }, [state.seed, showToast]);

  return (
    <div className="relative h-screen w-screen flex flex-col bg-[#04121e] text-cyan-100 select-none overflow-hidden font-sans">
      <Header
        state={state}
        onUpdateState={updateState}
        onMutateSeed={handleMutateSeed}
        onExportOBJ={handleExportOBJ}
        onSelectPreset={handleSelectPreset}
      />

      <Canvas3D
        state={state}
        targetNode={targetNode}
        onSelectTargetNode={setTargetNode}
        onShowToast={showToast}
        onUpdateOrganList={setOrganList}
        canvasRef={canvasRef}
        sceneRef={sceneRef}
        cameraRef={cameraRef}
        rendererRef={rendererRef}
        controlsRef={controlsRef}
        shipGroupRef={shipGroupRef}
        highlightedSection={highlightedSection}
      />

      <GeneticsDrawer
        state={state}
        onUpdateState={updateState}
        onSaveDNA_A={handleSaveDNA_A}
        onSaveDNA_B={handleSaveDNA_B}
        onSpliceDNA={handleSpliceDNA}
        onSetTheme={handleSetTheme}
        mobilePanel={mobilePanel}
        setMobilePanel={setMobilePanel}
      />

      <TelemetryPanel
        state={state}
        targetNode={targetNode}
        organList={organList}
        onSetViewMode={handleSetViewMode}
        onSetAnatomyLayer={handleSetAnatomyLayer}
        onSelectTargetNode={setTargetNode}
        onShowToast={showToast}
        mobilePanel={mobilePanel}
        setMobilePanel={setMobilePanel}
        highlightedSection={highlightedSection}
        onSetHighlightedSection={setHighlightedSection}
      />

      <ActionFooter
        state={state}
        onResetView={handleResetView}
        onToggleAutoRotate={handleToggleAutoRotate}
        onTakeSnapshot={handleTakeSnapshot}
        mobilePanel={mobilePanel}
        setMobilePanel={setMobilePanel}
      />

      {/* Notification Toast */}
      <div
        className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-30 bio-panel px-4 py-2 rounded-lg border border-cyan-400/50 text-cyan-300 text-sm font-mono shadow-2xl transition-opacity duration-300 pointer-events-none flex items-center gap-2 ${
          toastVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <CheckCircle2 className="w-4 h-4 text-cyan-400" />
        <span>{toastMsg}</span>
      </div>
    </div>
  );
}

