import * as THREE from 'three';
import { ThemeColors, ThemeKey, PresetOption } from '../types';
import { LCG } from './nurbs';

export const themes: Record<ThemeKey, ThemeColors> = {
  acid: { carapace: 0x121e1a, flesh: 0x3d0c24, glow: 0x10b981, glowSecondary: 0x34d399, bone: 0xc8d6af, blood: 0x10b981 },
  void: { carapace: 0x161026, flesh: 0x270b33, glow: 0xa855f7, glowSecondary: 0xc084fc, bone: 0xbfb5d6, blood: 0xc084fc },
  blood: { carapace: 0x260a0a, flesh: 0x4a0e0e, glow: 0xf43f5e, glowSecondary: 0xfb7185, bone: 0xe6cbab, blood: 0xf43f5e },
  abyssal: { carapace: 0x081b26, flesh: 0x072d3b, glow: 0x06b6d4, glowSecondary: 0x38bdf8, bone: 0xaecbd6, blood: 0x38bdf8 }
};

export const presets: PresetOption[] = [
  {
    id: 'leviathan',
    name: 'Apex Hive Leviathan',
    speciesClass: 'Abyssocetus apex',
    lore: 'Titan-class habitat carrier housing multi-tiered crew chambers lined with photosynthetic bio-moss. Fueled by heavy copper-hemocyanin peristaltic hearts.',
    config: {
      length: 22, segments: 16, thoraxWidth: 3.8, plateCoverage: 90,
      tentaclePairs: 10, ribSpines: 28, eyePods: 6, eyeStalkLength: 0.8, sporeSacs: 10, bioThrusters: 5,
      pectoralFins: 2, caudalFlukes: 1, landingLimbs: 4, dorsalSail: 1,
      spinalArch: 1.5, plateOverlap: 12, vascularDensity: 8, spiracleCount: 12,
      tendonDensity: 16, fluidWobble: 1.8, loftProfile: 'trilobed'
    }
  },
  {
    id: 'interceptor',
    name: 'Neuro-Spore Interceptor',
    speciesClass: 'Neuro-Spore interceptor',
    lore: 'Vanguard-class strike symbiont linked to a single pilot via graphene neural thread plugs. Ultra-fast reflex vectoring with exothermal gas jet siphons.',
    config: {
      length: 8, segments: 6, thoraxWidth: 1.4, plateCoverage: 60,
      tentaclePairs: 2, ribSpines: 8, eyePods: 2, eyeStalkLength: 0.2, sporeSacs: 2, bioThrusters: 2,
      pectoralFins: 2, caudalFlukes: 1, landingLimbs: 2, dorsalSail: 0,
      spinalArch: 2.8, plateOverlap: 4, vascularDensity: 4, spiracleCount: 4,
      tendonDensity: 6, fluidWobble: 2.5, loftProfile: 'spine'
    }
  },
  {
    id: 'dreadnought',
    name: 'Chitinous Void Harvester',
    speciesClass: 'Harvester chitinous',
    lore: 'Mining dreadnought engineered with mineral-accumulated chitin armor plates. Grazes on asteroid belts to refine heavy metals for fleet shell synthesis.',
    config: {
      length: 18, segments: 14, thoraxWidth: 4.2, plateCoverage: 100,
      tentaclePairs: 4, ribSpines: 32, eyePods: 8, eyeStalkLength: 0.5, sporeSacs: 12, bioThrusters: 6,
      pectoralFins: 0, caudalFlukes: 0, landingLimbs: 6, dorsalSail: 2,
      spinalArch: -1.0, plateOverlap: 16, vascularDensity: 10, spiracleCount: 14,
      tendonDensity: 20, fluidWobble: 1.2, loftProfile: 'star'
    }
  },
  {
    id: 'parasite',
    name: 'Abyssal Symbiont Frigate',
    speciesClass: 'Symbiont abyssalis',
    lore: 'Deep-space stealth frigate equipped with active chromatophore skin and thermal spiracle dampening to blend into cosmic microwave background radiation.',
    config: {
      length: 11, segments: 8, thoraxWidth: 1.8, plateCoverage: 40,
      tentaclePairs: 12, ribSpines: 12, eyePods: 4, eyeStalkLength: 1.0, sporeSacs: 8, bioThrusters: 1,
      pectoralFins: 4, caudalFlukes: 1, landingLimbs: 0, dorsalSail: 1,
      spinalArch: 3.5, plateOverlap: 2, vascularDensity: 6, spiracleCount: 6,
      tendonDensity: 10, fluidWobble: 2.8, loftProfile: 'trilobed'
    }
  },
  {
    id: 'spore',
    name: 'Viral Colony Carrier',
    speciesClass: 'Colony carrier-spore',
    lore: 'Fleet brood mother dispensing repair bio-nanites and defensive spore screens. Houses high-capacity bio-moss oxygenating chambers.',
    config: {
      length: 15, segments: 12, thoraxWidth: 3.0, plateCoverage: 75,
      tentaclePairs: 8, ribSpines: 20, eyePods: 4, eyeStalkLength: 0.4, sporeSacs: 12, bioThrusters: 4,
      pectoralFins: 2, caudalFlukes: 1, landingLimbs: 4, dorsalSail: 1,
      spinalArch: 0, plateOverlap: 8, vascularDensity: 6, spiracleCount: 10,
      tendonDensity: 12, fluidWobble: 1.5, loftProfile: 'circular'
    }
  }
];

export function generateBioSkinTexture(seed: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const localRng = LCG(seed);

  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, 512, 512);

  // Bio-vein pathways in texture
  ctx.strokeStyle = '#374151';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 40; i++) {
    ctx.beginPath();
    let x = localRng() * 512;
    let y = localRng() * 512;
    ctx.moveTo(x, y);
    for (let j = 0; j < 6; j++) {
      x += (localRng() - 0.5) * 80;
      y += (localRng() - 0.5) * 80;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Micro-chitin pores and cellular clusters
  for (let i = 0; i < 300; i++) {
    const x = localRng() * 512;
    const y = localRng() * 512;
    const r = localRng() * 3 + 1;
    ctx.fillStyle = localRng() > 0.5 ? '#1f2937' : '#030712';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  return texture;
}

