import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AppState, TargetNodeInfo, SymmetryType } from '../types';
import { LCG } from '../utils/nurbs';
import { themes, generateBioSkinTexture } from '../utils/theme';
import { playHeartbeatSound, playScanChirp } from '../utils/audio';

interface Canvas3DProps {
  state: AppState;
  targetNode: TargetNodeInfo | null;
  onSelectTargetNode: (nodeInfo: TargetNodeInfo | null) => void;
  onShowToast: (msg: string) => void;
  onUpdateOrganList?: (organs: TargetNodeInfo[]) => void;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>;
  controlsRef: React.MutableRefObject<OrbitControls | null>;
  shipGroupRef: React.MutableRefObject<THREE.Group | null>;
}

// Helper function resolving natural biological symmetry coordinate distribution across hull parameter V [0..1]
const getSymmetryVCoords = (symmetry: SymmetryType, stepIdx: number = 0): { vCoords: number[]; names: string[] } => {
  switch (symmetry) {
    case 'radial-5':
      return {
        vCoords: [0.0, 0.2, 0.4, 0.6, 0.8],
        names: ['Dorsal Ray I', 'Dorsal-Right Ray II', 'Ventral-Right Ray III', 'Ventral-Left Ray IV', 'Dorsal-Left Ray V']
      };
    case 'radial-3':
      return {
        vCoords: [0.0, 0.333, 0.667],
        names: ['Dorsal Branch I', 'Right Ventral Branch II', 'Left Ventral Branch III']
      };
    case 'biradial':
      return {
        vCoords: [0.0, 0.25, 0.5, 0.75],
        names: ['Dorsal Plane', 'Starboard Plane', 'Ventral Plane', 'Port Plane']
      };
    case 'spherical':
      return {
        vCoords: [0.0, 0.166, 0.333, 0.5, 0.666, 0.833],
        names: ['Anterior Zenith', 'Dorsal Equatorial', 'Ventral Equatorial', 'Posterior Nadir', 'Port Lateral', 'Starboard Lateral']
      };
    case 'asymmetrical': {
      const phi = 0.618033988749895; // Golden ratio conjugate
      const v1 = (stepIdx * phi) % 1.0;
      const v2 = (v1 + 0.382) % 1.0;
      return {
        vCoords: [v1, v2],
        names: [`Chiral Spiral Node #${stepIdx + 1}-A`, `Chiral Spiral Node #${stepIdx + 1}-B`]
      };
    }
    case 'bilateral':
    default:
      return {
        vCoords: [0.18, 0.68],
        names: ['Port Side', 'Starboard Side']
      };
  }
};

export const Canvas3D: React.FC<Canvas3DProps> = ({
  state,
  targetNode,
  onSelectTargetNode,
  onShowToast,
  onUpdateOrganList,
  canvasRef,
  sceneRef,
  cameraRef,
  rendererRef,
  controlsRef,
  shipGroupRef,
}) => {
  const highlightGroupRef = useRef<THREE.Group | null>(null);
  const animatedTentaclesRef = useRef<THREE.Mesh[]>([]);
  const animatedOrgansRef = useRef<THREE.Mesh[]>([]);
  const animatedHeartRef = useRef<THREE.Mesh | null>(null);
  const animatedSpiraclesRef = useRef<THREE.Mesh[]>([]);
  const animatedVesselsRef = useRef<THREE.Mesh[]>([]);
  const animatedThrustersRef = useRef<THREE.Mesh[]>([]);
  const thrusterExhaustPointsRef = useRef<THREE.Vector3[]>([]);
  const materialsRef = useRef<Record<string, THREE.Material>>({});
  const sporeParticlesRef = useRef<THREE.Points | null>(null);
  const particleSystemRef = useRef<THREE.Points | null>(null);
  const particleVelocitiesRef = useRef<THREE.Vector3[]>([]);
  const lastBeatTimeRef = useRef<number>(0);
  const rimLightRef = useRef<THREE.PointLight | null>(null);
  const coreLightRef = useRef<THREE.PointLight | null>(null);

  // Update Material colors & modes according to Anatomy Layer & View Mode
  const updateMaterials = useCallback(() => {
    const currentTheme = themes[state.theme];
    const texture = generateBioSkinTexture(state.seed);

    const isWire = state.viewMode === 'wireframe';
    const isXray = state.viewMode === 'xray';
    const layer = state.anatomyLayer;

    // Helper opacity calculator based on active anatomy layer
    const getLayerOpacity = (type: 'shell' | 'bone' | 'organ' | 'vein' | 'muscle') => {
      if (isXray) {
        if (type === 'shell') return 0.15;
        if (type === 'organ' || type === 'vein') return 0.9;
        return 0.3;
      }
      if (layer === 'full') return 1.0;
      if (layer === 'exoskeleton') {
        if (type === 'shell' || type === 'bone') return 1.0;
        return 0.15;
      }
      if (layer === 'vascular') {
        if (type === 'vein' || type === 'organ') return 1.0;
        return 0.12;
      }
      if (layer === 'organs') {
        if (type === 'organ') return 1.0;
        return 0.18;
      }
      if (layer === 'muscular') {
        if (type === 'muscle') return 1.0;
        return 0.2;
      }
      return 1.0;
    };

    const mats: Record<string, THREE.Material> = {};

    const carapaceOp = getLayerOpacity('shell');
    mats.carapace = new THREE.MeshStandardMaterial({
      color: currentTheme.carapace,
      roughness: 0.35,
      metalness: 0.6,
      bumpMap: texture,
      bumpScale: 0.08,
      wireframe: isWire,
      transparent: carapaceOp < 1.0,
      opacity: carapaceOp,
    });

    const fleshOp = getLayerOpacity('organ');
    mats.flesh = new THREE.MeshStandardMaterial({
      color: currentTheme.flesh,
      roughness: 0.2,
      metalness: 0.1,
      bumpMap: texture,
      bumpScale: 0.12,
      wireframe: isWire,
      transparent: fleshOp < 1.0,
      opacity: fleshOp,
    });

    const boneOp = getLayerOpacity('bone');
    mats.bone = new THREE.MeshStandardMaterial({
      color: currentTheme.bone,
      roughness: 0.6,
      metalness: 0.1,
      wireframe: isWire,
      transparent: boneOp < 1.0,
      opacity: boneOp,
    });

    const muscleOp = getLayerOpacity('muscle');
    mats.muscleTendon = new THREE.MeshStandardMaterial({
      color: currentTheme.flesh,
      roughness: 0.4,
      metalness: 0.2,
      wireframe: isWire,
      transparent: muscleOp < 1.0,
      opacity: muscleOp,
    });

    mats.glowNode = new THREE.MeshStandardMaterial({
      color: currentTheme.glow,
      emissive: currentTheme.glow,
      emissiveIntensity: layer === 'organs' || layer === 'vascular' || isXray ? 3.2 : 1.8,
      roughness: 0.1,
      wireframe: isWire,
    });

    mats.vascularVein = new THREE.MeshStandardMaterial({
      color: currentTheme.blood,
      emissive: currentTheme.blood,
      emissiveIntensity: layer === 'vascular' ? 3.5 : 2.0,
      roughness: 0.1,
      wireframe: isWire,
    });

    mats.heartCore = new THREE.MeshStandardMaterial({
      color: currentTheme.blood,
      emissive: currentTheme.glow,
      emissiveIntensity: 2.8,
      roughness: 0.2,
      wireframe: isWire,
    });

    mats.thrusterCore = new THREE.MeshBasicMaterial({
      color: currentTheme.glowSecondary,
      wireframe: isWire,
    });

    mats.sporeSac = new THREE.MeshPhysicalMaterial({
      color: currentTheme.glow,
      emissive: currentTheme.glow,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: layer === 'organs' ? 0.95 : 0.65,
      roughness: 0.1,
      transmission: 0.6,
    });

    mats.controlNetLine = new THREE.LineBasicMaterial({
      color: currentTheme.glowSecondary,
      transparent: true,
      opacity: 0.6,
    });

    mats.controlNodeMarker = new THREE.MeshBasicMaterial({
      color: currentTheme.glow,
    });

    mats.forceField = new THREE.MeshBasicMaterial({
      color: currentTheme.glowSecondary,
      transparent: true,
      opacity: 0.18,
      wireframe: true,
      depthWrite: false,
    });

    materialsRef.current = mats;

    if (rimLightRef.current) rimLightRef.current.color.setHex(currentTheme.glow);
    if (coreLightRef.current) coreLightRef.current.color.setHex(currentTheme.glow);
  }, [state.theme, state.seed, state.viewMode, state.anatomyLayer]);

  // Build the Procedural Spaceship Geometry
  const buildSpaceship = useCallback(() => {
    const shipGroup = shipGroupRef.current;
    if (!shipGroup) return;

    // Clear existing children
    while (shipGroup.children.length > 0) {
      shipGroup.remove(shipGroup.children[0]);
    }

    animatedTentaclesRef.current = [];
    animatedOrgansRef.current = [];
    animatedSpiraclesRef.current = [];
    animatedVesselsRef.current = [];
    animatedThrustersRef.current = [];
    animatedHeartRef.current = null;
    thrusterExhaustPointsRef.current = [];

    const rng = LCG(state.seed);
    updateMaterials();
    const mats = materialsRef.current;

    const length = state.length;
    const segments = state.segments;
    const startZ = -length / 2;

    // 1. PROCEDURAL REGULAR 3D SMOOTH ORGANIC CARAPACE HULL
    const numCrossU = Math.max(16, segments * 3); // Longitudinal mesh resolution
    const numCrossV = 28;                        // Cross-sectional ring resolution

    const spineNodes: { z: number; y: number; xArch: number; radius: number }[] = [];

    for (let i = 0; i <= numCrossU; i++) {
      const uProg = i / numCrossU;
      const z = startZ + uProg * length;

      let yArch = Math.sin(uProg * Math.PI) * state.spinalArch;
      let xArch = 0;
      if (state.symmetryType === 'asymmetrical') {
        xArch = Math.cos(uProg * Math.PI * 3) * 0.7;
        yArch += Math.sin(uProg * Math.PI * 3) * 0.7;
      }

      let r = Math.sin(uProg * Math.PI) * state.thoraxWidth;
      if (state.symmetryType === 'spherical') {
        r = Math.sin(uProg * Math.PI) * state.thoraxWidth * 1.5 + 0.4;
      } else if (uProg < 0.2) {
        r = Math.sin((uProg / 0.2) * (Math.PI / 2)) * state.thoraxWidth * 0.9 + 0.3;
      } else if (uProg > 0.7) {
        r = Math.cos(((uProg - 0.7) / 0.3) * (Math.PI / 2)) * state.thoraxWidth;
      }
      r = Math.max(0.35, r);

      spineNodes.push({ z, y: yArch, xArch, radius: r });
    }

    // Mathematical Surface Sampling Function for Regular Organic 3D Hull
    const sampleOrganicSurfacePos = (u: number, v: number): THREE.Vector3 => {
      const clampedU = Math.max(0, Math.min(1, u));
      const clampedV = (v % 1.0 + 1.0) % 1.0;

      const floatIdx = clampedU * (spineNodes.length - 1);
      const idx = Math.floor(floatIdx);
      const alpha = floatIdx - idx;
      const n0 = spineNodes[idx];
      const n1 = spineNodes[Math.min(spineNodes.length - 1, idx + 1)];

      const z = THREE.MathUtils.lerp(n0.z, n1.z, alpha);
      const yArch = THREE.MathUtils.lerp(n0.y, n1.y, alpha);
      const xArch = THREE.MathUtils.lerp(n0.xArch, n1.xArch, alpha);
      const r = THREE.MathUtils.lerp(n0.radius, n1.radius, alpha);

      const angle = clampedV * Math.PI * 2;
      let radMod = 1.0;

      if (state.symmetryType === 'radial-5') {
        radMod *= (1.0 + 0.35 * Math.cos(5 * angle));
      } else if (state.symmetryType === 'radial-3') {
        radMod *= (1.0 + 0.38 * Math.cos(3 * angle));
      } else if (state.symmetryType === 'biradial') {
        radMod *= (1.0 + 0.30 * Math.cos(4 * angle));
      } else if (state.symmetryType === 'spherical') {
        radMod *= (1.0 + 0.12 * Math.cos(2 * angle));
      } else if (state.symmetryType === 'asymmetrical') {
        radMod *= (1.0 + 0.30 * Math.sin(angle * 2 + clampedU * Math.PI * 4));
      }

      if (state.loftProfile === 'trilobed') {
        radMod *= (1.0 + 0.2 * Math.cos(3 * angle));
      } else if (state.loftProfile === 'spine') {
        if (Math.abs(angle - Math.PI / 2) < 0.6) radMod *= 1.4;
      } else if (state.loftProfile === 'star') {
        radMod *= (1.0 + 0.25 * Math.cos(5 * angle));
      }

      return new THREE.Vector3(
        xArch + Math.cos(angle) * r * radMod,
        yArch + Math.sin(angle) * r * radMod,
        z
      );
    };

    const sampleOrganicSurface = (u: number, v: number) => {
      const clampedU = Math.max(0, Math.min(1, u));
      const clampedV = (v % 1.0 + 1.0) % 1.0;
      const pos = sampleOrganicSurfacePos(clampedU, clampedV);

      const eps = 0.005;
      const pU1 = sampleOrganicSurfacePos(Math.min(1, clampedU + eps), clampedV);
      const pU0 = sampleOrganicSurfacePos(Math.max(0, clampedU - eps), clampedV);
      const pV1 = sampleOrganicSurfacePos(clampedU, clampedV + eps);
      const pV0 = sampleOrganicSurfacePos(clampedU, clampedV - eps);

      const Tu = new THREE.Vector3().subVectors(pU1, pU0).normalize();
      const Tv = new THREE.Vector3().subVectors(pV1, pV0).normalize();
      const normal = new THREE.Vector3().crossVectors(Tu, Tv).normalize();
      if (normal.lengthSq() < 0.0001) normal.set(0, 1, 0);

      return { position: pos, normal, Tu, Tv, u: clampedU, v: clampedV };
    };

    // Build standard high-precision 3D BufferGeometry for Organic Carapace
    const hullGeometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= numCrossU; i++) {
      const u = i / numCrossU;
      for (let j = 0; j <= numCrossV; j++) {
        const v = j / numCrossV;
        const pt = sampleOrganicSurfacePos(u, v);
        positions.push(pt.x, pt.y, pt.z);
        uvs.push(u, v);
      }
    }

    for (let i = 0; i < numCrossU; i++) {
      for (let j = 0; j < numCrossV; j++) {
        const row1 = i * (numCrossV + 1);
        const row2 = (i + 1) * (numCrossV + 1);

        const a = row1 + j;
        const b = row1 + j + 1;
        const c = row2 + j + 1;
        const d = row2 + j;

        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    hullGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    hullGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    hullGeometry.setIndex(indices);
    hullGeometry.computeVertexNormals();

    const carapaceMesh = new THREE.Mesh(hullGeometry, mats.carapace);
    carapaceMesh.userData = {
      name: 'Regular 3D Smooth Organic Carapace',
      category: 'Exoskeleton',
      desc: 'High-precision smooth 3D parametric organic chitin hull with zero surface artifacts.',
      metabolicRate: '12% Passive Armor Synthesis',
      neuralFreq: 'N/A (Structural Chitin)',
      enzymaticPressure: '1.2 MPa Shell Integrity',
    };
    shipGroup.add(carapaceMesh);

    // Helper: Create Flanged Organic Socket Collar to guarantee zero mesh discontinuity
    const createSocketCollar = (
      pos: THREE.Vector3,
      normal: THREE.Vector3,
      innerRadius: number,
      height: number = 0.35,
      material: THREE.Material = mats.carapace,
      name: string = 'Organic Socket Flange Collar'
    ) => {
      const collarGeo = new THREE.CylinderGeometry(innerRadius * 0.9, innerRadius * 1.5, height, 12);
      const collar = new THREE.Mesh(collarGeo, material);
      collar.position.copy(pos).addScaledVector(normal, -height * 0.2);
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      collar.quaternion.copy(quat);

      collar.userData = {
        name,
        category: 'Anatomical Joint Socket',
        desc: 'Flanged tissue socket collar providing seamless structural blending into the carapace hull.',
      };
      shipGroup.add(collar);
      return collar;
    };

    // 2. OVERLAPPING CHITIN ARMOR PLATES
    if (state.plateOverlap > 0) {
      const plateCount = Math.min(state.plateOverlap, segments);
      for (let p = 0; p < plateCount; p++) {
        const uProg = 0.15 + (p / (plateCount + 1)) * 0.7;
        const surf = sampleOrganicSurface(uProg, 0.25);
        const node = spineNodes[Math.floor(uProg * (spineNodes.length - 1))];
        if (!node) continue;

        const plateRadius = node.radius * 1.15;
        const plateGeo = new THREE.CylinderGeometry(plateRadius * 0.88, plateRadius, 0.75, 12, 1, true, -Math.PI * 0.42, Math.PI * 0.84);
        plateGeo.rotateX(Math.PI / 2);
        const plateMesh = new THREE.Mesh(plateGeo, mats.carapace);

        plateMesh.position.copy(surf.position);
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), surf.normal);
        plateMesh.quaternion.copy(quat);

        plateMesh.userData = {
          name: `Overlapping Dorsal Chitin Plate #${p + 1}`,
          category: 'Exoskeleton',
          desc: 'Layered articulated armor scale mitigating directional kinetic force.',
          metabolicRate: '5% Chitin Regeneration',
          enzymaticPressure: '3.4 MPa Impact Capacity',
        };
        shipGroup.add(plateMesh);
      }
    }

    // 3. CENTRAL PULSATING BIO-HEART ENGINE
    const midIdx = Math.floor(spineNodes.length / 2);
    const heartNode = spineNodes[midIdx] || spineNodes[0];
    const heartGeo = new THREE.IcosahedronGeometry(heartNode.radius * 0.65, 2);
    const heartMesh = new THREE.Mesh(heartGeo, mats.heartCore);
    heartMesh.position.set(0, heartNode.y, heartNode.z);
    heartMesh.userData = {
      name: 'Aorta Bioluminescent Central Engine (Heart)',
      category: 'Circulatory Core',
      desc: 'Triple-chambered central hydraulic pump generating bio-plasma fluid pressure.',
      metabolicRate: '98% Primary Energy Flux',
      neuralFreq: `${Math.round(50 + state.neuralNodes * 1.5)} BPM Sync`,
      enzymaticPressure: '14.8 bar Hydraulic Stroke',
      vascularDemand: '840 mL/min Central Output',
      vascularFlowSupply: 'Aorta Primary Pump Core',
      connectedVeinBranch: 'Heart Chamber Zero',
      supportStatus: '100% Core Source',
      requiredFluid: 'Bio-Plasma Haemolymph',
    };
    shipGroup.add(heartMesh);
    animatedHeartRef.current = heartMesh;

    // ACTIVE ORGAN REPULSION FORCE-FIELD SOLVER
    interface CandidateOrgan {
      id: string;
      name: string;
      category: string;
      desc: string;
      type: 'spiracle' | 'rib' | 'eye' | 'spore' | 'tentacle' | 'neural' | 'habitat';
      u: number;
      v: number;
      clearanceRadius: number; // Force field radius (0.65m - 1.85m)
      pos: THREE.Vector3;
      normal: THREE.Vector3;
      requiredFluid: string;
      demandMlMin: number;
      metabolicRate?: string;
      neuralFreq?: string;
      enzymaticPressure?: string;
      isInterceptable?: boolean;
      minFreeSpace?: string;
      habitationVolume?: string;
      crewCapacity?: string;
      extra?: any;
    }

    const candidateOrgans: CandidateOrgan[] = [];

    // A. Respiratory Spiracles
    const spiracleCount = state.spiracleCount;
    for (let s = 0; s < spiracleCount; s++) {
      const initialU = 0.2 + (s / Math.max(1, spiracleCount)) * 0.6;
      const sym = getSymmetryVCoords(state.symmetryType, s);

      sym.vCoords.forEach((initialV, sideIdx) => {
        const sideName = sym.names[sideIdx] || `Branch #${sideIdx + 1}`;
        const surf = sampleOrganicSurface(initialU, initialV);
        candidateOrgans.push({
          id: `spiracle_${s}_${sideIdx}`,
          name: `Respiratory Spiracle Gill Vent (${sideName})`,
          category: 'Respiratory System',
          desc: 'Contractile vent exhaling bio-plasma gases with active protective clearance field.',
          type: 'spiracle',
          u: initialU,
          v: initialV,
          clearanceRadius: 0.70,
          pos: surf.position.clone(),
          normal: surf.normal.clone(),
          requiredFluid: 'Hyper-Oxygenated Haemolymph',
          demandMlMin: 21.0,
          metabolicRate: '21.0 mL/min Gas Exchange',
          neuralFreq: '30 Hz Respiration Impulse',
          enzymaticPressure: '0.8 bar Vent Differential',
          isInterceptable: true,
          minFreeSpace: '0.9m Clearance Zone',
          extra: { sideName, phase: s * 0.5 },
        });
      });
    }

    // B. Rib Spines
    const ribCount = Math.min(state.ribSpines, segments * 2);
    for (let i = 0; i < ribCount; i++) {
      const initialU = 0.15 + (i / Math.max(1, ribCount)) * 0.65;
      const sym = getSymmetryVCoords(state.symmetryType, i);

      sym.vCoords.forEach((initialV, sideIdx) => {
        const sideName = sym.names[sideIdx] || `Spur #${sideIdx + 1}`;
        const surf = sampleOrganicSurface(initialU, initialV);
        candidateOrgans.push({
          id: `rib_${i}_${sideIdx}`,
          name: `Biomechanical Rib Spur Spine (${sideName})`,
          category: 'Exoskeleton Frame',
          desc: 'Hardened calcified frame providing lateral defense spikes.',
          type: 'rib',
          u: initialU,
          v: initialV,
          clearanceRadius: 0.85,
          pos: surf.position.clone(),
          normal: surf.normal.clone(),
          requiredFluid: 'Calcified Bone Marrow Fluid',
          demandMlMin: 11.0,
          metabolicRate: '11.0 mL/min Marrow Perfusion',
          neuralFreq: '20 Hz Proprioceptive Feedback',
          enzymaticPressure: '12.4 GPa Hardness Rating',
          isInterceptable: true,
          minFreeSpace: '1.0m Clearance Zone',
          extra: { sideName },
        });
      });
    }

    // C. Ocular Beam Pods
    for (let i = 0; i < state.eyePods; i++) {
      const initialU = 0.05 + (i / Math.max(1, state.eyePods)) * 0.22;
      const sym = getSymmetryVCoords(state.symmetryType, i);

      sym.vCoords.forEach((initialV, sideIdx) => {
        const sideName = sym.names[sideIdx] || `Pod #${sideIdx + 1}`;
        const surf = sampleOrganicSurface(initialU, initialV);
        candidateOrgans.push({
          id: `eye_${i}_${sideIdx}`,
          name: `Ocular Beam Stalk Pod #${i + 1} (${sideName})`,
          category: 'Sensory Symbiont',
          desc: 'Symbiotic eye cluster emitting focused thermal bio-lasers.',
          type: 'eye',
          u: initialU,
          v: initialV,
          clearanceRadius: 0.75,
          pos: surf.position.clone(),
          normal: surf.normal.clone(),
          requiredFluid: 'Cryo-Aqueous Ocular Fluid',
          demandMlMin: 14.5,
          metabolicRate: '14.5 mL/min Ocular Cooling',
          neuralFreq: '120 Hz Visual Refresh',
          enzymaticPressure: '2.1 bar Hydro-Pressure',
          isInterceptable: true,
          minFreeSpace: '0.9m Clearance Zone',
          extra: { sideName, idx: i },
        });
      });
    }

    // D. Spore Warhead Pods
    for (let i = 0; i < state.sporeSacs; i++) {
      const initialU = 0.2 + (i / Math.max(1, state.sporeSacs)) * 0.55;
      const sym = getSymmetryVCoords(state.symmetryType, i);
      const initialV = sym.vCoords[i % sym.vCoords.length];
      const surf = sampleOrganicSurface(initialU, initialV);
      candidateOrgans.push({
        id: `spore_${i}`,
        name: `Viral Spore Warhead Pod #${i + 1}`,
        category: 'Symbiont Bio-Weapon',
        desc: 'Bulbous organ filled with explosive caustic spore fluid.',
        type: 'spore',
        u: initialU,
        v: initialV,
        clearanceRadius: 0.95,
        pos: surf.position.clone(),
        normal: surf.normal.clone(),
        requiredFluid: 'Corrosive Bio-Acid Solution',
        demandMlMin: 26.0,
        metabolicRate: '26.0 mL/min Acid Synthesis',
        neuralFreq: '45 Hz Bio-Trigger Impulse',
        enzymaticPressure: '18.5 pH Caustic Acid',
        isInterceptable: true,
        minFreeSpace: '1.2m Clearance Zone',
        extra: { sacRadius: 0.42 + rng() * 0.22, wobblePhase: rng() * Math.PI * 2 },
      });
    }

    // E. Feeler Tentacles
    for (let i = 0; i < state.tentaclePairs; i++) {
      const initialU = 0.25 + (i / Math.max(1, state.tentaclePairs)) * 0.55;
      const sym = getSymmetryVCoords(state.symmetryType, i);

      sym.vCoords.forEach((initialV, sideIdx) => {
        const sideName = sym.names[sideIdx] || `Feeler #${sideIdx + 1}`;
        const surf = sampleOrganicSurface(initialU, initialV);
        candidateOrgans.push({
          id: `tentacle_${i}_${sideIdx}`,
          name: `Bio-Sensory Feeler Tentacle (${sideName})`,
          category: 'Appendage Kinematics',
          desc: 'Fluidic appendage with FABRIK IK joint kinematics for smooth organic grasping.',
          type: 'tentacle',
          u: initialU,
          v: initialV,
          clearanceRadius: 1.10,
          pos: surf.position.clone(),
          normal: surf.normal.clone(),
          requiredFluid: 'Myofibrillar Hydraulic Liquid',
          demandMlMin: 32.0,
          metabolicRate: '32.0 mL/min Hydraulic Actuation',
          neuralFreq: '180 Hz Wave Signal',
          enzymaticPressure: '12.0 bar Hydro-Muscle',
          isInterceptable: true,
          minFreeSpace: '1.4m Clearance Zone',
          extra: { sideIdx, sideName, phase: rng() * Math.PI * 2, totalLength: 3.5 + rng() * 3.5 },
        });
      });
    }

    // F. Neural Ganglia Nodes
    for (let i = 0; i < state.neuralNodes; i++) {
      const initialU = 0.12 + rng() * 0.76;
      const initialV = rng();
      const surf = sampleOrganicSurface(initialU, initialV);
      candidateOrgans.push({
        id: `neural_${i}`,
        name: `Neural Ganglion Cluster #${i + 1}`,
        category: 'Nervous Subsystem',
        desc: 'Pulsing biological processing core routing nervous impulses.',
        type: 'neural',
        u: initialU,
        v: initialV,
        clearanceRadius: 0.65,
        pos: surf.position.clone(),
        normal: surf.normal.clone(),
        requiredFluid: 'Neuro-Transmitter Bio-Plasma',
        demandMlMin: 35.0,
        metabolicRate: '35.0 mL/min Synaptic Perfusion',
        neuralFreq: `${(80 + rng() * 40).toFixed(1)} Hz Impulse`,
        enzymaticPressure: '8.8 bar Bio-Electric Potential',
        isInterceptable: false,
        minFreeSpace: '0.8m Clearance Zone',
        extra: { size: 0.28 + rng() * 0.45, pulsePhase: rng() * Math.PI * 2 },
      });
    }

    // G. Human Habitat Rooms
    const habitatCount = state.habitatChambers || 0;
    for (let h = 0; h < habitatCount; h++) {
      const initialU = 0.2 + (h / Math.max(1, habitatCount)) * 0.5;
      const sym = getSymmetryVCoords(state.symmetryType, h);
      const initialV = sym.vCoords[h % sym.vCoords.length];
      const surf = sampleOrganicSurface(initialU, initialV);

      candidateOrgans.push({
        id: `habitat_${h}`,
        name: `Human Habitat Room Chamber #${h + 1}`,
        category: 'Human Habitation Chamber',
        desc: 'Pressurized biological room adapted with observation viewports and life-support hydro-gel lining for human crew residence.',
        type: 'habitat',
        u: initialU,
        v: initialV,
        clearanceRadius: 1.85,
        pos: surf.position.clone(),
        normal: surf.normal.clone(),
        requiredFluid: 'Oxygenated Hydro-Gel & Life Support Haemolymph',
        demandMlMin: 45.0,
        metabolicRate: '18.5 mL/min Life-Support Oxygenation Draw',
        neuralFreq: '0.5 Hz Circadian Light Cycle',
        enzymaticPressure: '1.01 bar Pressurized Atmosphere',
        habitationVolume: '42.5 m³ Living Space',
        crewCapacity: '2 Human Crew Standard',
        isInterceptable: false,
        minFreeSpace: '2.0m Clearance Buffer',
        extra: { sideName: sym.names[h % sym.names.length] },
      });
    }
    // EXECUTE ITERATIVE SURFACE FORCE-FIELD REPULSION SOLVER WITH SPATIAL PARTITIONING
    // Ensures organs actively push neighboring organs away using a Grid-Based Spatial Partitioning
    // algorithm and AABB (Axis-Aligned Bounding Box) intersection detection.
    const SOLVER_PASSES = 25;
    const GRID_SIZE = 2.0;

    for (let pass = 0; pass < SOLVER_PASSES; pass++) {
      // 1. Build Spatial Hash Grid
      const grid = new Map<string, number[]>();
      
      for (let i = 0; i < candidateOrgans.length; i++) {
        const org = candidateOrgans[i];
        const cellX = Math.floor(org.pos.x / GRID_SIZE);
        const cellY = Math.floor(org.pos.y / GRID_SIZE);
        const cellZ = Math.floor(org.pos.z / GRID_SIZE);
        
        // Add organ to overlapping cells based on clearance radius
        const radiusCells = Math.ceil(org.clearanceRadius / GRID_SIZE);
        
        for (let dx = -radiusCells; dx <= radiusCells; dx++) {
          for (let dy = -radiusCells; dy <= radiusCells; dy++) {
            for (let dz = -radiusCells; dz <= radiusCells; dz++) {
              const hash = `${cellX + dx},${cellY + dy},${cellZ + dz}`;
              if (!grid.has(hash)) grid.set(hash, []);
              grid.get(hash)!.push(i);
            }
          }
        }
      }

      // 2. Resolve Collisions using Spatial Grid and AABB
      const resolvedPairs = new Set<string>();
      
      grid.forEach((organsInCell) => {
        for (let idxA = 0; idxA < organsInCell.length; idxA++) {
          for (let idxB = idxA + 1; idxB < organsInCell.length; idxB++) {
            const i = organsInCell[idxA];
            const j = organsInCell[idxB];
            
            // Only resolve each pair once per pass
            const pairId = i < j ? `${i}-${j}` : `${j}-${i}`;
            if (resolvedPairs.has(pairId)) continue;
            resolvedPairs.add(pairId);

            const orgA = candidateOrgans[i];
            const orgB = candidateOrgans[j];

            // Fast AABB intersection check
            const boxA = new THREE.Box3().setFromCenterAndSize(
              orgA.pos,
              new THREE.Vector3(orgA.clearanceRadius * 2, orgA.clearanceRadius * 2, orgA.clearanceRadius * 2)
            );
            const boxB = new THREE.Box3().setFromCenterAndSize(
              orgB.pos,
              new THREE.Vector3(orgB.clearanceRadius * 2, orgB.clearanceRadius * 2, orgB.clearanceRadius * 2)
            );

            if (boxA.intersectsBox(boxB)) {
              const reqSpace = orgA.clearanceRadius + orgB.clearanceRadius;
              const currentDist = orgA.pos.distanceTo(orgB.pos);
              
              if (currentDist < reqSpace) {
                const overlap = reqSpace - currentDist;
                
                // Push overlapping components to the nearest free coordinate
                let pushDir = new THREE.Vector3().subVectors(orgA.pos, orgB.pos);
                if (pushDir.lengthSq() < 0.0001) {
                  pushDir.set(Math.sin(i * 1.7), Math.cos(j * 2.3), (i - j) * 0.1);
                }
                pushDir.normalize();

                const shiftVal = overlap * 0.45;
                const shiftA = pushDir.clone().multiplyScalar(shiftVal);
                const shiftB = pushDir.clone().multiplyScalar(-shiftVal);

                // Shift parametric u, v coordinates
                orgA.u = Math.max(0.08, Math.min(0.88, orgA.u + shiftA.z / length));
                orgA.v = (orgA.v + shiftA.x * 0.08 + 1.0) % 1.0;
                orgB.u = Math.max(0.08, Math.min(0.88, orgB.u + shiftB.z / length));
                orgB.v = (orgB.v + shiftB.x * 0.08 + 1.0) % 1.0;

                // Re-project back onto exact 3D surface points and normal
                const surfA = sampleOrganicSurface(orgA.u, orgA.v);
                orgA.pos.copy(surfA.position);
                orgA.normal.copy(surfA.normal);

                const surfB = sampleOrganicSurface(orgB.u, orgB.v);
                orgB.pos.copy(surfB.position);
                orgB.normal.copy(surfB.normal);
              }
            }
          }
        }
      });
    }

    // --- ORGAN REGIONAL EFFICIENCY & COST/OUTPUT MULTIPLIERS ---
    // Section-based organ optimization logic to give organs lower cost and enhanced output 
    // if placed in their ideal anatomical section.
    candidateOrgans.forEach((org) => {
      let isOptimalSection = false;
      let regionName = "Unknown Section";
      
      // Determine physical region based on resolved u parameter (0 to 1 length)
      if (org.u <= 0.35) regionName = "Anterior";
      else if (org.u > 0.35 && org.u <= 0.65) regionName = "Thoracic";
      else regionName = "Posterior";

      // Evaluate whether the organ matches its biologically ideal section
      switch (org.type) {
        case 'eye':
        case 'neural':
          isOptimalSection = regionName === "Anterior";
          break;
        case 'spiracle':
        case 'habitat':
        case 'rib':
          isOptimalSection = regionName === "Thoracic";
          break;
        case 'spore':
        case 'tentacle':
          isOptimalSection = regionName === "Posterior";
          break;
      }

      if (isOptimalSection) {
        org.name = `${org.name} [Optimal ${regionName}]`;
        org.demandMlMin *= 0.65; // Lower metabolic cost
        org.metabolicRate = `${org.demandMlMin.toFixed(1)} mL/min (Highly Efficient)`;
        
        // Enhance outputs
        if (org.neuralFreq) {
          const freq = parseInt(org.neuralFreq);
          if (!isNaN(freq)) org.neuralFreq = `${Math.floor(freq * 1.5)} Hz (Enhanced Signal)`;
        }
        if (org.enzymaticPressure) {
          const pres = parseFloat(org.enzymaticPressure);
          if (!isNaN(pres)) org.enzymaticPressure = `${(pres * 1.4).toFixed(1)} bar (Boosted Yield)`;
        }
      } else {
        org.name = `${org.name} [Sub-optimal ${regionName}]`;
        org.demandMlMin *= 1.35; // Higher cost penalty due to poor vascular routing
        org.metabolicRate = `${org.demandMlMin.toFixed(1)} mL/min (System Strain)`;
        
        // Degrade outputs
        if (org.neuralFreq) {
          const freq = parseInt(org.neuralFreq);
          if (!isNaN(freq)) org.neuralFreq = `${Math.floor(freq * 0.75)} Hz (Degraded Signal)`;
        }
        if (org.enzymaticPressure) {
          const pres = parseFloat(org.enzymaticPressure);
          if (!isNaN(pres)) org.enzymaticPressure = `${(pres * 0.8).toFixed(1)} bar (Low Yield)`;
        }
      }
    });

    // VASCULAR COMPONENT SINK REGISTRY FOR PROXIMITY AUTO-WIRING & MURRAY'S LAW
    interface VascularSink {
      mesh: THREE.Mesh;
      socketPos: THREE.Vector3;
      name: string;
      category: string;
      desc: string;
      requiredFluid: string;
      demandMlMin: number;
      metabolicRate?: string;
      neuralFreq?: string;
      enzymaticPressure?: string;
      clearanceRadius?: string;
      isInterceptable?: boolean;
      minFreeSpace?: string;
      uCoord?: number;
      vCoord?: number;
    }
    const vascularSinks: VascularSink[] = [];

    // INSTANTIATE ORGAN MESHES + VISUAL FORCE FIELD SHIELD BUBBLES AT RESOLVED NON-OVERLAPPING POSITIONS
    candidateOrgans.forEach((org) => {
      // 1. Force Field Shield Bubble Mesh (Visual representation of protective non-overlapping clearance zone)
      const fieldGeo = new THREE.SphereGeometry(org.clearanceRadius, 16, 12);
      const fieldMesh = new THREE.Mesh(fieldGeo, mats.forceField);
      fieldMesh.position.copy(org.pos);
      fieldMesh.userData = {
        name: `${org.name} Repulsion Force Field Shield`,
        parentOrganName: org.name,
        clearanceRadius: org.clearanceRadius,
        isForceField: true,
      };
      shipGroup.add(fieldMesh);

      // 2. Build Socket Collar
      createSocketCollar(
        org.pos,
        org.normal,
        Math.min(0.8, org.clearanceRadius * 0.45),
        0.3,
        mats.carapace,
        `${org.name} Socket Collar`
      );

      // 3. Build Organ Geometry depending on Type
      if (org.type === 'spiracle') {
        const ventGeo = new THREE.TorusGeometry(0.32, 0.09, 8, 12);
        const ventMesh = new THREE.Mesh(ventGeo, mats.flesh);
        ventMesh.position.copy(org.pos);
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), org.normal);
        ventMesh.quaternion.copy(quat);

        ventMesh.userData = {
          name: org.name,
          category: org.category,
          desc: org.desc,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          baseScale: 1.0,
          phase: org.extra?.phase || 0,
        };
        shipGroup.add(ventMesh);
        animatedSpiraclesRef.current.push(ventMesh);

        vascularSinks.push({
          mesh: ventMesh,
          socketPos: org.pos.clone(),
          name: org.name,
          category: org.category,
          desc: org.desc,
          requiredFluid: org.requiredFluid,
          demandMlMin: org.demandMlMin,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          uCoord: org.u,
          vCoord: org.v,
        });
      } else if (org.type === 'rib') {
        const tipPos = org.pos.clone().addScaledVector(org.normal, 2.2).add(new THREE.Vector3(0, -0.6, -1.2));
        const midPos = org.pos.clone().addScaledVector(org.normal, 1.4).add(new THREE.Vector3(0, 0.5, -0.4));
        const curve = new THREE.CubicBezierCurve3(org.pos, midPos, tipPos, tipPos);
        const ribGeo = new THREE.TubeGeometry(curve, 12, 0.11, 6, false);
        const ribMesh = new THREE.Mesh(ribGeo, mats.bone);

        ribMesh.userData = {
          name: org.name,
          category: org.category,
          desc: org.desc,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
        };
        shipGroup.add(ribMesh);

        vascularSinks.push({
          mesh: ribMesh,
          socketPos: org.pos.clone(),
          name: org.name,
          category: org.category,
          desc: org.desc,
          requiredFluid: org.requiredFluid,
          demandMlMin: org.demandMlMin,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          uCoord: org.u,
          vCoord: org.v,
        });
      } else if (org.type === 'eye') {
        const stalkGeo = new THREE.CylinderGeometry(0.08, 0.15, 1.2, 8);
        const stalk = new THREE.Mesh(stalkGeo, mats.flesh);
        stalk.position.copy(org.pos).addScaledVector(org.normal, 0.6);
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), org.normal);
        stalk.quaternion.copy(quat);

        const eyeGeo = new THREE.SphereGeometry(0.28, 12, 12);
        const eye = new THREE.Mesh(eyeGeo, mats.glowNode);
        eye.position.copy(org.pos).addScaledVector(org.normal, 1.25);

        eye.userData = {
          name: org.name,
          category: org.category,
          desc: org.desc,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
        };

        shipGroup.add(stalk);
        shipGroup.add(eye);

        vascularSinks.push({
          mesh: eye,
          socketPos: org.pos.clone(),
          name: org.name,
          category: org.category,
          desc: org.desc,
          requiredFluid: org.requiredFluid,
          demandMlMin: org.demandMlMin,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          uCoord: org.u,
          vCoord: org.v,
        });
      } else if (org.type === 'spore') {
        const sacRadius = org.extra?.sacRadius || 0.5;
        const sacGeo = new THREE.SphereGeometry(sacRadius, 12, 12);
        const sac = new THREE.Mesh(sacGeo, mats.sporeSac);
        sac.position.copy(org.pos).addScaledVector(org.normal, sacRadius * 0.7);

        sac.userData = {
          name: org.name,
          category: org.category,
          desc: org.desc,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          basePos: sac.position.clone(),
          wobblePhase: org.extra?.wobblePhase || 0,
        };
        shipGroup.add(sac);

        vascularSinks.push({
          mesh: sac,
          socketPos: org.pos.clone(),
          name: org.name,
          category: org.category,
          desc: org.desc,
          requiredFluid: org.requiredFluid,
          demandMlMin: org.demandMlMin,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          uCoord: org.u,
          vCoord: org.v,
        });
      } else if (org.type === 'tentacle') {
        const totalLength = org.extra?.totalLength || 4.0;
        const numJoints = 8;
        const segmentLen = totalLength / (numJoints - 1);
        const joints: THREE.Vector3[] = [];
        const lengths: number[] = [];

        const rootPos = org.pos.clone();
        const restDirection = org.normal.clone().add(new THREE.Vector3(0, -0.4, -0.6)).normalize();

        for (let j = 0; j < numJoints; j++) {
          joints.push(rootPos.clone().addScaledVector(restDirection, j * segmentLen));
          if (j < numJoints - 1) lengths.push(segmentLen);
        }

        const curve = new THREE.CatmullRomCurve3(joints);
        const feelerRadius = 0.14;
        const tentacleGeo = new THREE.TubeGeometry(curve, 16, feelerRadius, 6, false);
        const tentacleMesh = new THREE.Mesh(tentacleGeo, mats.flesh);

        tentacleMesh.userData = {
          name: org.name,
          category: org.category,
          desc: org.desc,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          joints,
          lengths,
          totalLength,
          spineNodePos: org.pos.clone(),
          radiusOffset: 0.8,
          restDirection,
          radius: feelerRadius,
          side: org.extra?.sideIdx === 0 ? -1 : 1,
          phase: org.extra?.phase || 0,
        };

        shipGroup.add(tentacleMesh);
        animatedTentaclesRef.current.push(tentacleMesh);

        vascularSinks.push({
          mesh: tentacleMesh,
          socketPos: org.pos.clone(),
          name: org.name,
          category: org.category,
          desc: org.desc,
          requiredFluid: org.requiredFluid,
          demandMlMin: org.demandMlMin,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          uCoord: org.u,
          vCoord: org.v,
        });
      } else if (org.type === 'neural') {
        const size = org.extra?.size || 0.35;
        const organGeo = new THREE.SphereGeometry(size, 12, 12);
        const organMesh = new THREE.Mesh(organGeo, mats.glowNode);
        organMesh.position.copy(org.pos).addScaledVector(org.normal, -size * 0.3);

        organMesh.userData = {
          name: org.name,
          category: org.category,
          desc: org.desc,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          baseScale: size,
          pulsePhase: org.extra?.pulsePhase || 0,
        };
        shipGroup.add(organMesh);
        animatedOrgansRef.current.push(organMesh);

        vascularSinks.push({
          mesh: organMesh,
          socketPos: org.pos.clone(),
          name: org.name,
          category: org.category,
          desc: org.desc,
          requiredFluid: org.requiredFluid,
          demandMlMin: org.demandMlMin,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          uCoord: org.u,
          vCoord: org.v,
        });
      } else if (org.type === 'habitat') {
        const roomW = 1.5;
        const roomH = 1.2;
        const roomD = 1.5;
        const roomGeo = new THREE.BoxGeometry(roomW, roomH, roomD, 2, 2, 2);
        const roomMesh = new THREE.Mesh(roomGeo, mats.flesh);
        roomMesh.position.copy(org.pos).addScaledVector(org.normal, roomH * 0.65);
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), org.normal);
        roomMesh.quaternion.copy(quat);

        const windowGeo = new THREE.PlaneGeometry(0.8, 0.6);
        const windowMesh = new THREE.Mesh(windowGeo, mats.glowNode);
        windowMesh.position.copy(org.pos).addScaledVector(org.normal, roomH * 1.32);
        windowMesh.quaternion.copy(quat);
        windowMesh.rotateX(-Math.PI / 2);

        const frameGeo = new THREE.BoxGeometry(roomW * 1.1, 0.18, roomD * 1.1);
        const frameMesh = new THREE.Mesh(frameGeo, mats.carapace);
        frameMesh.position.copy(org.pos).addScaledVector(org.normal, roomH * 0.15);
        frameMesh.quaternion.copy(quat);

        roomMesh.userData = {
          name: org.name,
          category: org.category,
          desc: org.desc,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          habitationVolume: org.habitationVolume,
          crewCapacity: org.crewCapacity,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          requiredFluid: org.requiredFluid,
        };

        shipGroup.add(frameMesh);
        shipGroup.add(roomMesh);
        shipGroup.add(windowMesh);

        vascularSinks.push({
          mesh: roomMesh,
          socketPos: org.pos.clone(),
          name: org.name,
          category: org.category,
          desc: org.desc,
          requiredFluid: org.requiredFluid,
          demandMlMin: org.demandMlMin,
          metabolicRate: org.metabolicRate,
          neuralFreq: org.neuralFreq,
          enzymaticPressure: org.enzymaticPressure,
          clearanceRadius: `${org.clearanceRadius.toFixed(2)}m Active Force Field`,
          isInterceptable: org.isInterceptable,
          minFreeSpace: org.minFreeSpace,
          uCoord: org.u,
          vCoord: org.v,
        });
      }
    });

    // MUSCULAR CONNECTIVE TENDONS
    const tendonCount = state.tendonDensity;
    for (let t = 0; t < tendonCount; t++) {
      const uA = 0.1 + rng() * 0.7;
      const uB = Math.min(0.95, uA + 0.12);
      const vA = rng();
      const vB = (vA + 0.25) % 1.0;

      const surfA = sampleOrganicSurface(uA, vA);
      const surfB = sampleOrganicSurface(uB, vB);

      const lineCurve = new THREE.LineCurve3(surfA.position, surfB.position);
      const tendonGeo = new THREE.TubeGeometry(lineCurve, 6, 0.06, 6, false);
      const tendonMesh = new THREE.Mesh(tendonGeo, mats.muscleTendon);
      tendonMesh.userData = {
        name: `Biomechanical Muscle Tendon Fiber #${t + 1}`,
        category: 'Musculoskeletal',
        desc: 'High-tensile organic ligament assisting spinal articulation.',
        metabolicRate: '12.0 mL/min Hydro-Ligament Draw',
        neuralFreq: '40 Hz Motor Impulse',
        enzymaticPressure: '750 N Tensile Capacity',
        requiredFluid: 'Myofibrillar Hydraulic Liquid',
      };
      shipGroup.add(tendonMesh);
    }

    // CAUDAL ENGINE COWL & BIO-PLASMA THRUSTERS
    const thrusterCount = state.bioThrusters;
    const caudalNode = spineNodes[spineNodes.length - 1];

    // Ensure the engine housing has enough area to fit the variable number of thrusters
    const engineBaseRadius = Math.max(1.2 + thrusterCount * 0.15, caudalNode.radius * 1.5);

    const caudalCapGeo = new THREE.CylinderGeometry(engineBaseRadius * 0.45, engineBaseRadius * 1.15, 1.4, 16);
    caudalCapGeo.rotateX(Math.PI / 2);
    const caudalMesh = new THREE.Mesh(caudalCapGeo, mats.carapace);
    caudalMesh.position.set(0, caudalNode.y, caudalNode.z + 0.3);
    caudalMesh.userData = {
      name: 'Integral Caudal Stern Engine Cowl Manifold',
      category: 'Exoskeleton Manifold',
      desc: 'Reinforced caudal tail housing incorporating bio-plasma sphincter vents.',
      metabolicRate: '15.0 mL/min Chitin Fuel Supply',
      enzymaticPressure: '16.5 MPa Capacity',
      requiredFluid: 'Osteo-Chitin Mineralizing Sap',
    };
    shipGroup.add(caudalMesh);

    // Fermat's spiral (sunflower) for optimal non-overlapping topology
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < thrusterCount; i++) {
      const fraction = (i + 0.5) / thrusterCount;
      const radiusOffset = Math.sqrt(fraction) * (engineBaseRadius * 0.85); 
      const angle = i * goldenAngle;
      
      // Calculate dynamic scale to ensure they fit without clipping
      const maxAvailableRadius = (engineBaseRadius * 0.9) / Math.sqrt(thrusterCount);
      const thrusterScale = Math.min(1.0, maxAvailableRadius / 0.8);

      const tx = Math.cos(angle) * radiusOffset;
      const ty = caudalNode.y + Math.sin(angle) * radiusOffset;
      const domeZ = (1 - fraction) * 0.4;
      const tz = caudalNode.z + 0.4 + domeZ;

      const thrustPos = new THREE.Vector3(tx, ty, tz);
      // Thrust direction slightly splayed outwards
      const thrustDir = new THREE.Vector3(tx * 0.2, (ty - caudalNode.y) * 0.2, 1.0).normalize();
      const nozzleQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), thrustDir);

      const socketPos = new THREE.Vector3(tx, ty, tz - 0.2);
      createSocketCollar(socketPos, thrustDir, 0.62 * thrusterScale, 0.45 * thrusterScale, mats.carapace, `Bio-Plasma Caudal Sphincter Socket Collar #${i + 1}`);

      const nozzleGeo = new THREE.TorusGeometry(0.55 * thrusterScale, 0.18 * thrusterScale, 12, 20);
      const nozzleMesh = new THREE.Mesh(nozzleGeo, mats.carapace);
      nozzleMesh.position.set(tx, ty, tz);
      nozzleMesh.quaternion.copy(nozzleQuat);

      nozzleMesh.userData = {
        name: `Bio-Plasma Sphincter Vent Nozzle #${i + 1}`,
        category: 'Propulsion Vent',
        desc: 'Thermal propulsive duct venting energized organic plasma.',
        metabolicRate: '58.0 mL/min Propellant Draw',
        neuralFreq: '240 Hz Caudal Valve Pulsation',
        enzymaticPressure: '18.5 bar Combustion Thrust',
        clearanceRadius: '0.55m Active Force Field',
        isInterceptable: false,
        minFreeSpace: '0.8m Nozzle Clearance Zone',
      };
      shipGroup.add(nozzleMesh);

      vascularSinks.push({
        mesh: nozzleMesh,
        socketPos: thrustPos,
        name: nozzleMesh.userData.name,
        category: 'Propulsion Vent',
        desc: nozzleMesh.userData.desc,
        requiredFluid: 'Hypergolic Bio-Plasma Thruster Fuel',
        demandMlMin: 58.0,
        metabolicRate: '58.0 mL/min Propellant Draw',
        neuralFreq: '240 Hz Caudal Valve Pulsation',
        enzymaticPressure: '18.5 bar Combustion Thrust',
        clearanceRadius: '0.55m Active Force Field',
        isInterceptable: false,
        minFreeSpace: '0.8m Nozzle Clearance Zone',
      });

      const plumeGeo = new THREE.ConeGeometry(0.62 * thrusterScale, 3.8 * thrusterScale, 12, 1, true);
      plumeGeo.rotateX(Math.PI / 2);
      plumeGeo.translate(0, 0, 1.9 * thrusterScale);

      const plumeMesh = new THREE.Mesh(plumeGeo, mats.thrusterCore);
      plumeMesh.position.set(tx, ty, tz);
      plumeMesh.quaternion.copy(nozzleQuat);
      shipGroup.add(plumeMesh);

      animatedThrustersRef.current.push(plumeMesh);
      thrusterExhaustPointsRef.current.push(new THREE.Vector3(tx, ty, tz + 0.5));
    }

    // MURRAY'S LAW AUTO-WIRED VASCULAR VEIN NETWORK
    const trunkPoints: THREE.Vector3[] = [];
    for (let i = 0; i < spineNodes.length; i++) {
      const node = spineNodes[i];
      trunkPoints.push(new THREE.Vector3(0, node.y, node.z));
    }
    const centralAortaCurve = new THREE.CatmullRomCurve3(trunkPoints);
    const totalDemand = vascularSinks.reduce((sum, s) => sum + s.demandMlMin, 0);
    const trunkRadius = 0.12 * Math.cbrt(Math.max(1, totalDemand) / 15.0);

    const trunkGeo = new THREE.TubeGeometry(centralAortaCurve, 32, trunkRadius, 10, false);
    const trunkMesh = new THREE.Mesh(trunkGeo, mats.vascularVein);
    trunkMesh.userData = {
      name: 'Primary Central Aorta Trunk Highway',
      category: 'Circulatory Core',
      desc: "Central arterial highway distributing bio-plasma throughout the hull, sized dynamically via Murray's Law.",
      metabolicRate: `${totalDemand.toFixed(1)} mL/min Total Supply Flow`,
      neuralFreq: `${Math.round(50 + state.neuralNodes * 1.5)} BPM Sync`,
      enzymaticPressure: '14.8 bar Hydraulic Stroke',
      vascularDemand: `${totalDemand.toFixed(1)} mL/min Volumetric Demand`,
      vascularFlowSupply: `Murray's Law Trunk Radius r = ${(trunkRadius * 10).toFixed(2)}mm`,
      connectedVeinBranch: 'Main Central Aorta Conduit',
      supportStatus: '100% Core Source (Auto-Wired)',
      requiredFluid: 'Bio-Plasma Haemolymph',
    };
    shipGroup.add(trunkMesh);
    animatedVesselsRef.current.push(trunkMesh);

    // Flank Arteries
    const flankVeinCount = state.vascularDensity;
    const symVeins = getSymmetryVCoords(state.symmetryType, 0);
    for (let v = 0; v < flankVeinCount; v++) {
      const vCoord = symVeins.vCoords[v % symVeins.vCoords.length] + Math.floor(v / symVeins.vCoords.length) * 0.04;
      const sideName = symVeins.names[v % symVeins.names.length] || `Axis #${v + 1}`;
      const veinPath: THREE.Vector3[] = [];

      for (let i = 0; i < spineNodes.length; i++) {
        const uCoord = i / (spineNodes.length - 1);
        const surf = sampleOrganicSurface(uCoord, vCoord % 1.0);
        veinPath.push(surf.position.clone().addScaledVector(surf.normal, -0.45));
      }

      const curve = new THREE.CatmullRomCurve3(veinPath);
      const veinGeo = new THREE.TubeGeometry(curve, 28, 0.08, 6, false);
      const veinMesh = new THREE.Mesh(veinGeo, mats.vascularVein);
      veinMesh.userData = {
        name: `Luminescent Flank Artery (${sideName}) #${v + 1}`,
        category: 'Circulatory Conduit',
        desc: 'Primary longitudinal flank artery providing regional bio-fluid routing.',
        metabolicRate: '180 mL/min Regional Flow',
        neuralFreq: '60 Hz Peristaltic Wave',
        enzymaticPressure: '8.2 bar Arterial Flow',
        connectedVeinBranch: `Flank Artery Highway (${sideName})`,
        supportStatus: '100% Optimal (Auto-Wired)',
        requiredFluid: 'Bio-Plasma Haemolymph',
      };
      shipGroup.add(veinMesh);
      animatedVesselsRef.current.push(veinMesh);
    }

    // Auto-Wire Component Sinks
    vascularSinks.forEach((sink, sinkIdx) => {
      let closestTrunkPt = trunkPoints[0];
      let minDist = Infinity;

      for (let i = 0; i < spineNodes.length; i++) {
        const nodePos = new THREE.Vector3(0, spineNodes[i].y, spineNodes[i].z);
        const dist = nodePos.distanceTo(sink.socketPos);
        if (dist < minDist) {
          minDist = dist;
          closestTrunkPt = nodePos;
        }
      }

      const branchRadius = 0.045 * Math.cbrt(sink.demandMlMin / 10.0);
      
      // Calculate a normal vector pointing from the deep spine trunk outward to the organ socket
      const outwardDir = new THREE.Vector3().subVectors(sink.socketPos, closestTrunkPt).normalize();
      
      // Keep the endpoint of the vein securely inside the hull with an offset from the external skin
      const adjustedSocketPos = sink.socketPos.clone().addScaledVector(outwardDir, -0.45);
      
      // The midpoint curves naturally between the trunk and the internal endpoint
      const midPoint = new THREE.Vector3().addVectors(closestTrunkPt, adjustedSocketPos).multiplyScalar(0.5);
      
      const branchCurve = new THREE.CatmullRomCurve3([closestTrunkPt, midPoint, adjustedSocketPos]);
      const branchGeo = new THREE.TubeGeometry(branchCurve, 10, branchRadius, 6, false);
      const branchMesh = new THREE.Mesh(branchGeo, mats.vascularVein);

      const branchId = `Branch #${sinkIdx + 1} (${minDist < 2.0 ? 'Direct Proximity' : 'Extended Surface Conduit'})`;

      branchMesh.userData = {
        name: `Proximity Auto-Wire Vein -> ${sink.name}`,
        category: 'Circulatory Conduit',
        desc: `Biologically auto-wired vascular vein conduit supplying ${sink.name} with ${sink.requiredFluid}.`,
        metabolicRate: `${sink.demandMlMin.toFixed(1)} mL/min Flow Rate`,
        neuralFreq: sink.neuralFreq || '60 Hz Peristaltic Impulse',
        enzymaticPressure: `Murray's Law Radius r = ${(branchRadius * 10).toFixed(2)}mm`,
        vascularDemand: `${sink.demandMlMin.toFixed(1)} mL/min Volumetric Demand`,
        vascularFlowSupply: `Murray's Law r = ${(branchRadius * 10).toFixed(2)}mm`,
        connectedVeinBranch: branchId,
        supportStatus: '100% Satisfied (Auto-Wired by Proximity)',
        requiredFluid: sink.requiredFluid,
      };

      sink.mesh.userData.vascularDemand = `${sink.demandMlMin.toFixed(1)} mL/min Volumetric Flow`;
      sink.mesh.userData.vascularFlowSupply = `Murray's Law Vessel (r = ${(branchRadius * 10).toFixed(2)}mm)`;
      sink.mesh.userData.connectedVeinBranch = branchId;
      sink.mesh.userData.supportStatus = '100% Satisfied (Proximity Auto-Wired)';
      sink.mesh.userData.requiredFluid = sink.requiredFluid;

      shipGroup.add(branchMesh);
      animatedVesselsRef.current.push(branchMesh);
    });

    // Extract active organs list for the registry drawer
    if (onUpdateOrganList) {
      const organNodes: TargetNodeInfo[] = [];
      const seenNames = new Set<string>();

      shipGroup.traverse((obj) => {
        if (obj.userData && obj.userData.name && !seenNames.has(obj.userData.name)) {
          const name = obj.userData.name as string;
          if (
            !name.includes('Socket Collar') &&
            !name.includes('Vein ->') &&
            !name.includes('Pedicle') &&
            !name.includes('Collar') &&
            !name.includes('Force Field')
          ) {
            seenNames.add(name);
            organNodes.push({
              name,
              category: obj.userData.category || 'Biological System',
              desc: obj.userData.desc || '',
              metabolicRate: obj.userData.metabolicRate,
              neuralFreq: obj.userData.neuralFreq,
              enzymaticPressure: obj.userData.enzymaticPressure,
              vascularDemand: obj.userData.vascularDemand,
              vascularFlowSupply: obj.userData.vascularFlowSupply,
              connectedVeinBranch: obj.userData.connectedVeinBranch,
              supportStatus: obj.userData.supportStatus,
              requiredFluid: obj.userData.requiredFluid,
              clearanceRadius: obj.userData.clearanceRadius,
              isInterceptable: obj.userData.isInterceptable,
              minFreeSpace: obj.userData.minFreeSpace,
              habitationVolume: obj.userData.habitationVolume,
              crewCapacity: obj.userData.crewCapacity,
            });
          }
        }
      });

      onUpdateOrganList(organNodes);
    }

    // --- ADVANCED GEOMETRY INTERSECTION AUDIT ---
    // User requirement: "internal organs are supposed to be inside the body, but not inside each other"
    // This runs a smart diagnostic to detect if any of the generated internal organs are clipping into each other.
    const DEBUG_INTERSECTIONS = import.meta.env.VITE_DEBUG_INTERSECTIONS !== 'false';
    if (DEBUG_INTERSECTIONS) {
      console.log('--- RUNNING GEOMETRY INTERSECTION AUDIT ---');
      const internalOrgans: THREE.Mesh[] = [];
      
      // 1. Gather all internal organ meshes (excluding the carapace/exoskeleton and utility meshes)
      shipGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.userData && obj.userData.name) {
          const name = obj.userData.name as string;
          const category = obj.userData.category as string;
          if (
            category !== 'Exoskeleton' &&
            !name.includes('Socket Collar') &&
            !name.includes('Vein') &&
            !name.includes('Pedicle') &&
            !name.includes('Force Field')
          ) {
            internalOrgans.push(obj);
          }
        }
      });

      console.log(`Auditing ${internalOrgans.length} internal organ meshes for spatial clipping...`);
      let intersectionCount = 0;

      // Ensure world matrices are updated for accurate bounding boxes
      shipGroup.updateMatrixWorld(true);

      // 2. Perform O(N^2) pairwise intersection check
      for (let i = 0; i < internalOrgans.length; i++) {
        for (let j = i + 1; j < internalOrgans.length; j++) {
          const meshA = internalOrgans[i];
          const meshB = internalOrgans[j];
          
          // Fast broad-phase check using axis-aligned bounding boxes (AABB)
          const boxA = new THREE.Box3().setFromObject(meshA);
          const boxB = new THREE.Box3().setFromObject(meshB);
          
          if (boxA.intersectsBox(boxB)) {
            // Broad-phase collision detected! 
            // Now perform a smarter narrow-phase check using bounding spheres to rule out AABB corner artifacts
            const sphereA = new THREE.Sphere();
            const sphereB = new THREE.Sphere();
            boxA.getBoundingSphere(sphereA);
            boxB.getBoundingSphere(sphereB);
            
            // If bounding spheres also intersect, there is a very high probability of true mesh clipping
            if (sphereA.intersectsSphere(sphereB)) {
              // Calculate overlap volume proxy for severity reporting
              const intersectBox = boxA.clone().intersect(boxB);
              const overlapDim = new THREE.Vector3();
              intersectBox.getSize(overlapDim);
              const overlapVolume = overlapDim.x * overlapDim.y * overlapDim.z;
              
              // Only report significant physical clipping (ignore microscopic surface kisses)
              if (overlapVolume > 0.005) {
                intersectionCount++;
                console.warn(
                  `[GEOMETRY CLIP DETECTED] ${meshA.userData.name} is intersecting with ${meshB.userData.name}!\n` +
                  `-> Severity (Overlap Volume): ${overlapVolume.toFixed(4)}\n` +
                  `-> Distance between centers: ${sphereA.center.distanceTo(sphereB.center).toFixed(2)}`
                );
              }
            }
          }
        }
      }
      
      if (intersectionCount === 0) {
        console.log('[AUDIT PASSED] No internal organ intersections detected. Force-field solver was successful.');
      } else {
        console.warn(`[AUDIT FAILED] Found ${intersectionCount} severe organ intersections. Consider increasing SOLVER_PASSES or clearanceRadius.`);
      }
      console.log('---------------------------------------------');
    }
  }, [state, updateMaterials, shipGroupRef, onUpdateOrganList]);

  // Setup Three.js Scene, Camera, Renderer, Controls & Particles
  useEffect(() => {
    if (!canvasRef.current) return;

    const width = canvasRef.current.clientWidth || window.innerWidth;
    const height = canvasRef.current.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x04121e, 0.022);
    const gridHelper = new THREE.GridHelper(100, 100, 0x06b6d4, 0x06b6d4);
    (gridHelper.material as THREE.Material).opacity = 0.05;
    (gridHelper.material as THREE.Material).transparent = true;
    gridHelper.position.y = -6;
    scene.add(gridHelper);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(20, 10, 25);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    rendererRef.current = renderer;

    canvasRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 100;
    controls.minDistance = 5;
    controls.autoRotate = state.autoRotate;
    controls.autoRotateSpeed = 0.8;
    controlsRef.current = controls;

    // Lights
    const ambientLight = new THREE.AmbientLight(0x1e293b, 1.2);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(15, 25, 20);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(themes[state.theme].glow, 3, 40);
    rimLight.position.set(-15, -10, -20);
    scene.add(rimLight);
    rimLightRef.current = rimLight;

    const coreLight = new THREE.PointLight(themes[state.theme].glow, 4, 15);
    coreLight.position.set(0, 0, 0);
    scene.add(coreLight);
    coreLightRef.current = coreLight;

    // Ambient Spore Particles
    const sporeCount = 450;
    const sporeGeo = new THREE.BufferGeometry();
    const sporePos = new Float32Array(sporeCount * 3);
    for (let i = 0; i < sporeCount * 3; i += 3) {
      sporePos[i] = (Math.random() - 0.5) * 90;
      sporePos[i + 1] = (Math.random() - 0.5) * 90;
      sporePos[i + 2] = (Math.random() - 0.5) * 90;
    }
    sporeGeo.setAttribute('position', new THREE.BufferAttribute(sporePos, 3));
    const sporeMat = new THREE.PointsMaterial({
      color: themes[state.theme].glow,
      size: 0.16,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });
    const sporeParticles = new THREE.Points(sporeGeo, sporeMat);
    scene.add(sporeParticles);
    sporeParticlesRef.current = sporeParticles;

    // Thruster Particle System
    const particleCount = 120;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    const particleVelocities: THREE.Vector3[] = [];

    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = 0;
      particlePositions[i * 3 + 1] = 0;
      particlePositions[i * 3 + 2] = -1000;
      particleVelocities.push(new THREE.Vector3(0, 0, 0));
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: themes[state.theme].glowSecondary,
      size: 0.25,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });
    const particleSystem = new THREE.Points(particleGeo, particleMat);
    scene.add(particleSystem);
    particleSystemRef.current = particleSystem;
    particleVelocitiesRef.current = particleVelocities;

    // Ship Parent Group
    const shipGroup = new THREE.Group();
    scene.add(shipGroup);
    shipGroupRef.current = shipGroup;

    // 3D Highlight Target Reticle Group
    const highlightGroup = new THREE.Group();
    highlightGroup.visible = false;

    // Outer Target Ring
    const ringGeo1 = new THREE.RingGeometry(1.0, 1.15, 32);
    const ringMat1 = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    });
    const ringMesh1 = new THREE.Mesh(ringGeo1, ringMat1);
    highlightGroup.add(ringMesh1);

    // Inner Cross Hair Ring
    const ringGeo2 = new THREE.RingGeometry(1.35, 1.42, 4);
    const ringMat2 = new THREE.MeshBasicMaterial({
      color: 0x34d399,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
      depthTest: false,
    });
    const ringMesh2 = new THREE.Mesh(ringGeo2, ringMat2);
    ringMesh2.rotation.z = Math.PI / 4;
    highlightGroup.add(ringMesh2);

    // Center Pulse Beacon
    const beaconGeo = new THREE.SphereGeometry(0.25, 12, 12);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    highlightGroup.add(beaconMesh);

    scene.add(highlightGroup);
    highlightGroupRef.current = highlightGroup;

    // Window Resize Handler
    const handleResize = () => {
      if (!canvasRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = canvasRef.current.clientWidth;
      const h = canvasRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (rendererRef.current && rendererRef.current.domElement) {
        rendererRef.current.domElement.remove();
      }
    };
  }, []); // Mount once

  // Re-build ship when state parameters change
  useEffect(() => {
    buildSpaceship();
  }, [buildSpaceship]);

  // Update controls auto-rotate state
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = state.autoRotate;
    }
  }, [state.autoRotate]);

  // Main Render & Animation Loop
  useEffect(() => {
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const time = clock.getElapsedTime();

      // Audio Heartbeat
      const bpm = 50 + state.neuralNodes * 1.5;
      const beatInterval = 60 / bpm;
      if (time - lastBeatTimeRef.current >= beatInterval) {
        playHeartbeatSound(state.audioEnabled);
        lastBeatTimeRef.current = time;
      }

      // Organ Respiration & Heartbeat Pulse
      if (state.pulseAnim) {
        // Central Heart Contraction
        if (animatedHeartRef.current) {
          const heartScale = 1 + Math.sin(time * (bpm / 10)) * 0.12;
          animatedHeartRef.current.scale.setScalar(heartScale);
        }

        // Neural Ganglia Pulsing
        animatedOrgansRef.current.forEach((organ) => {
          const p = Math.sin(time * 4 + organ.userData.pulsePhase) * 0.15;
          organ.scale.setScalar(organ.userData.baseScale * (1 + p));
        });

        // Gill Vent Expansion / Contraction
        animatedSpiraclesRef.current.forEach((spiracle) => {
          const s = 1 + Math.sin(time * 2 + spiracle.userData.phase) * 0.18;
          spiracle.scale.setScalar(spiracle.userData.baseScale * s);
        });

        if (materialsRef.current.glowNode) {
          (materialsRef.current.glowNode as THREE.MeshStandardMaterial).emissiveIntensity =
            (state.anatomyLayer === 'organs' ? 3.2 : 1.8) + Math.sin(time * 3) * 0.6;
        }
      }

      // FABRIK IK Tentacle Undulation
      if (state.waveAnim) {
        animatedTentaclesRef.current.forEach((tentacle) => {
          const u = tentacle.userData;
          const joints: THREE.Vector3[] = u.joints;
          const lengths: number[] = u.lengths;
          const totalLen: number = u.totalLength;
          const numJoints = joints.length;

          const side: number = u.side;
          const rootPos = (u.spineNodePos as THREE.Vector3).clone();
          rootPos.x = side * u.radiusOffset;

          const t = time * 0.7 + u.phase;
          const restTarget = rootPos.clone().addScaledVector(u.restDirection as THREE.Vector3, totalLen * 0.92);

          const targetX = restTarget.x + Math.sin(t * 1.1) * 0.35 * side;
          const targetY = restTarget.y + Math.cos(t * 0.85) * 0.25 + Math.sin(t * 1.5) * 0.12;
          const targetZ = restTarget.z + Math.sin(t * 0.65) * 0.35;
          const target = new THREE.Vector3(targetX, targetY, targetZ);

          joints[0].copy(rootPos);
          const distToTarget = rootPos.distanceTo(target);

          if (distToTarget >= totalLen) {
            for (let i = 0; i < numJoints - 1; i++) {
              const dir = new THREE.Vector3().subVectors(target, joints[i]).normalize();
              joints[i + 1].copy(joints[i]).addScaledVector(dir, lengths[i]);
            }
          } else {
            for (let iter = 0; iter < 3; iter++) {
              joints[numJoints - 1].copy(target);
              for (let i = numJoints - 2; i >= 0; i--) {
                const dir = new THREE.Vector3().subVectors(joints[i], joints[i + 1]).normalize();
                joints[i].copy(joints[i + 1]).addScaledVector(dir, lengths[i]);
              }
              joints[0].copy(rootPos);
              for (let i = 0; i < numJoints - 1; i++) {
                const dir = new THREE.Vector3().subVectors(joints[i + 1], joints[i]).normalize();
                joints[i + 1].copy(joints[i]).addScaledVector(dir, lengths[i]);
              }
            }
          }

          const updatedCurve = new THREE.CatmullRomCurve3(joints);
          tentacle.geometry.dispose();
          tentacle.geometry = new THREE.TubeGeometry(updatedCurve, 16, u.radius, 6, false);
        });
      }

      // Bio-Thrusters & Particle Exhaust
      animatedThrustersRef.current.forEach((plume, idx) => {
        const flicker = 1 + Math.sin(time * 12 + idx) * 0.15 + (Math.random() - 0.5) * 0.1;
        plume.scale.set(flicker, flicker * (1 + Math.sin(time * 8) * 0.1), flicker);
      });

      if (particleSystemRef.current && thrusterExhaustPointsRef.current.length > 0) {
        const positions = particleSystemRef.current.geometry.attributes.position.array as Float32Array;
        const exhaustPts = thrusterExhaustPointsRef.current;
        const velocities = particleVelocitiesRef.current;

        for (let i = 0; i < positions.length / 3; i++) {
          if (positions[i * 3 + 2] > 40 || positions[i * 3 + 2] < -5 || Math.random() < 0.04) {
            const exhaust = exhaustPts[Math.floor(Math.random() * exhaustPts.length)];
            positions[i * 3] = exhaust.x + (Math.random() - 0.5) * 0.4;
            positions[i * 3 + 1] = exhaust.y + (Math.random() - 0.5) * 0.4;
            positions[i * 3 + 2] = exhaust.z + Math.random() * 0.2;
            velocities[i].set(
              (Math.random() - 0.5) * 0.1,
              (Math.random() - 0.5) * 0.1,
              0.4 + Math.random() * 0.3
            );
          } else {
            positions[i * 3] += velocities[i].x;
            positions[i * 3 + 1] += velocities[i].y;
            positions[i * 3 + 2] += velocities[i].z;
          }
        }
        particleSystemRef.current.geometry.attributes.position.needsUpdate = true;
      }

      // Background Spore Drift
      if (sporeParticlesRef.current) {
        const positions = sporeParticlesRef.current.geometry.attributes.position.array as Float32Array;
        for (let i = 1; i < positions.length; i += 3) {
          positions[i] -= 0.02;
          if (positions[i] < -45) positions[i] = 45;
        }
        sporeParticlesRef.current.geometry.attributes.position.needsUpdate = true;
      }

      // Update 3D Highlight Reticle Ring and Camera Target
      if (highlightGroupRef.current && shipGroupRef.current && targetNode?.name) {
        let foundMesh: THREE.Object3D | null = null;
        shipGroupRef.current.traverse((child) => {
          if (!foundMesh && child.userData && child.userData.name === targetNode.name) {
            foundMesh = child;
          }
        });

        if (foundMesh) {
          const targetWorldPos = new THREE.Vector3();
          (foundMesh as THREE.Object3D).getWorldPosition(targetWorldPos);

          highlightGroupRef.current.visible = true;
          highlightGroupRef.current.position.lerp(targetWorldPos, 0.2);

          if (cameraRef.current) {
            highlightGroupRef.current.quaternion.copy(cameraRef.current.quaternion);
          }

          if (highlightGroupRef.current.children[0]) {
            highlightGroupRef.current.children[0].rotation.z += 0.02;
          }
          if (highlightGroupRef.current.children[1]) {
            highlightGroupRef.current.children[1].rotation.z -= 0.03;
          }

          const s = 1 + Math.sin(time * 6) * 0.15;
          highlightGroupRef.current.scale.setScalar(s);

          // Smoothly lerp OrbitControls camera target toward highlighted organ
          if (controlsRef.current) {
            controlsRef.current.target.lerp(targetWorldPos, 0.04);
          }
        } else {
          highlightGroupRef.current.visible = false;
        }
      }

      if (controlsRef.current) controlsRef.current.update();
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [state.audioEnabled, state.neuralNodes, state.pulseAnim, state.waveAnim, state.viewMode, state.anatomyLayer, targetNode]);

  // Click / Raycaster Target Scanner & Smooth Component Focus
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cameraRef.current || !shipGroupRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);
    const intersects = raycaster.intersectObjects(shipGroupRef.current.children, true);

    if (intersects.length > 0) {
      let hitObj = intersects[0].object;
      if (hitObj.userData?.isForceField && hitObj.userData?.parentOrganName) {
        const parentName = hitObj.userData.parentOrganName;
        shipGroupRef.current.traverse((child) => {
          if (child.userData && child.userData.name === parentName) {
            hitObj = child;
          }
        });
      }

      if (hitObj.userData && hitObj.userData.name) {
        onSelectTargetNode({
          name: hitObj.userData.name,
          category: hitObj.userData.category || 'Biological Organ',
          desc: hitObj.userData.desc || 'Biological component detected by deep scanner.',
          metabolicRate: hitObj.userData.metabolicRate || '24% Standard Metabolic Draw',
          neuralFreq: hitObj.userData.neuralFreq || '60 Hz Autonomic Impulse',
          enzymaticPressure: hitObj.userData.enzymaticPressure || '1.0 bar Normal Pressure',
          vascularDemand: hitObj.userData.vascularDemand || '18.5 mL/min Volumetric Flow',
          vascularFlowSupply: hitObj.userData.vascularFlowSupply || "Murray's Law r = 0.18mm",
          connectedVeinBranch: hitObj.userData.connectedVeinBranch || 'Proximity Auto-Wired Branch',
          supportStatus: hitObj.userData.supportStatus || '100% Satisfied',
          requiredFluid: hitObj.userData.requiredFluid || 'Bio-Plasma Haemolymph',
          clearanceRadius: hitObj.userData.clearanceRadius || '0.8m Standard Buffer',
          isInterceptable: hitObj.userData.isInterceptable !== undefined ? hitObj.userData.isInterceptable : true,
          minFreeSpace: hitObj.userData.minFreeSpace || '1.0m Free Space',
          habitationVolume: hitObj.userData.habitationVolume,
          crewCapacity: hitObj.userData.crewCapacity,
        });
        playScanChirp(state.audioEnabled);
        onShowToast(`Scanned: ${hitObj.userData.name}`);
      } else {
        onSelectTargetNode(null);
      }
    } else {
      onSelectTargetNode(null);
    }
  };

  return (
    <main
      ref={canvasRef}
      onClick={handleClick}
      className="relative w-full h-full flex-grow cursor-crosshair overflow-hidden"
    />
  );
};

