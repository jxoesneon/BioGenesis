/**
 * Ship Requirements Validation Engine
 *
 * Evaluates all placed organs and connections against the biological
 * requirements defined in ORGAN_SYSTEMS.md, LORE.md, and the pipeline graph.
 *
 * Each requirement check produces a `RequirementIssue` with a severity
 * (critical / warning / info), the affected organ(s), and a human-readable
 * description of what is unmet and how to fix it.
 *
 * Requirement categories:
 *   1. Energy        — generation vs consumption balance (incl. brain metabolic cost)
 *   2. Compute       — neural processing capacity vs organ demand (ALL organs)
 *   3. Pipeline      — upstream/downstream connectivity per organ (intra-pipeline)
 *   4. Vascular      — hemolymph supply chain (heart → aorta → arteries → ALL organs)
 *   5. Life Support  — oxygen, water, and habitat requirements
 *   6. Structural    — spine, armor, and defense integrity
 *   7. Symmetry      — bilateral mirror completeness
 *   8. Cross-Pipeline — inter-pipeline resource dependencies
 *   9. Command       — neuro-link, sensors, propulsion (ship operability)
 *
 * Cross-pipeline dependencies (from ORGAN_SYSTEMS.md + LORE.md):
 *   - Ice Gizzard → Plasma Gland (water for electrolysis)
 *   - Ice Gizzard → Bio-Moss (minerals for photosynthesis)
 *   - Bio-Moss → Heart (oxygen for circulatory fluid)
 *   - Bio-Moss → Brain (oxygen for neural tissue, 22x metabolic rate)
 *   - Brain → ALL organs (neural control)
 *   - Heart → ALL organs (hemolymph supply)
 *   - Axon Cord → Muscle Tendon (motor nerve pathway)
 *   - Neuro-Link → Axon Cord (pilot command pathway)
 */

import { OrganPipelineType } from '../types';

// ── Types ──────────────────────────────────────────────────────────────────

export type RequirementSeverity = 'critical' | 'warning' | 'info';

export type RequirementCategory =
  | 'energy'
  | 'compute'
  | 'pipeline'
  | 'vascular'
  | 'life-support'
  | 'structural'
  | 'symmetry'
  | 'cross-pipeline'
  | 'command';

export interface RequirementIssue {
  id: string;
  category: RequirementCategory;
  severity: RequirementSeverity;
  title: string;
  description: string;
  organIds?: string[];      // IDs of affected placed organs
  organNames?: string[];    // Display names
  fixHint?: string;         // How to resolve
}

export interface ShipValidationResult {
  issues: RequirementIssue[];
  summary: {
    total: number;
    critical: number;
    warning: number;
    info: number;
    met: number;            // Count of satisfied requirement categories
  };
}

// ── Input shape (from EngineeringView placed organs + connections) ──────────

export interface PlacedOrganInfo {
  id: string;
  pipeline: OrganPipelineType;
  name: string;
  nodeId: string;           // catalog nodeId (e.g. 'plasma_gland')
  wx: number;
  wz: number;
  mirrorId?: string | null;
  isMirror?: boolean;
}

export interface PlacedConnectionInfo {
  id: string;
  fromId: string;
  toId: string;
}

export interface ShipRequirementsInput {
  organs: PlacedOrganInfo[];
  connections: PlacedConnectionInfo[];
  shipLength: number;
  shipVolume: number;       // m³ — used for brain compute capacity
  mirrorX: boolean;
  mirrorZ: boolean;
}

// ── Node metadata (mirrors pipelineGraph NODE_DEFS but lightweight) ─────────

interface NodeMeta {
  id: string;
  pipeline: OrganPipelineType;
  role: string;
  baseEnergyCost: number;
  downstream: string[];
  computeDemand: number;    // from ORGAN_COMPUTE_DEMAND mapping
  anatomicalLayer: 'full' | 'exoskeleton' | 'vascular' | 'organs' | 'muscular';
}

// Compute demand per organ type (from neuralCompute.ts ORGAN_COMPUTE_DEMAND)
const COMPUTE_DEMAND: Record<string, number> = {
  plasma_gland: 1.5,
  plasma_bladder: 0.3,
  plasma_trunk: 0.2,
  caudal_manifold: 0.2,
  siphon_vent_nozzle: 0.8,
  disruptor_gland: 1.5,
  heart_core: 1.0,
  hemolymph_atrium: 0.3,
  aorta_highway: 0.2,
  flank_artery: 0.2,
  spiracle_vent: 0.5,
  brain_core: 0,            // brain is the provider
  neuro_link: 0.5,
  axon_cord: 0.2,
  ocular_pod: 2.0,
  muscle_tendon: 1.8,
  ice_gizzard: 0.5,
  bio_moss: 0.3,
  habitat_chamber: 0.8,
  cyber_airlock: 0.2,
  chitin_vertebra: 0.3,
  carapace_plate: 0.2,
  bio_nanite_bed: 1.0,
  shield_emitter: 1.5,
};

// Node definitions: id → metadata
const NODE_META: Record<string, NodeMeta> = {
  // Bio-Plasma
  plasma_gland:        { id: 'plasma_gland',        pipeline: 'BIO_PLASMA',    role: 'GENERATION',    baseEnergyCost: 50,  downstream: ['plasma_bladder'],                              computeDemand: 1.5, anatomicalLayer: 'organs' },
  plasma_bladder:      { id: 'plasma_bladder',      pipeline: 'BIO_PLASMA',    role: 'STORAGE',       baseEnergyCost: 5,   downstream: ['plasma_trunk'],                                computeDemand: 0.3, anatomicalLayer: 'organs' },
  plasma_trunk:        { id: 'plasma_trunk',        pipeline: 'BIO_PLASMA',    role: 'DISTRIBUTION',  baseEnergyCost: 2,   downstream: ['caudal_manifold', 'disruptor_gland'],          computeDemand: 0.2, anatomicalLayer: 'vascular' },
  caudal_manifold:     { id: 'caudal_manifold',     pipeline: 'BIO_PLASMA',    role: 'DISTRIBUTION',  baseEnergyCost: 2,   downstream: ['siphon_vent_nozzle'],                          computeDemand: 0.2, anatomicalLayer: 'vascular' },
  siphon_vent_nozzle:  { id: 'siphon_vent_nozzle',  pipeline: 'BIO_PLASMA',    role: 'EFFECTOR',      baseEnergyCost: 120, downstream: [],                                              computeDemand: 0.8, anatomicalLayer: 'exoskeleton' },
  disruptor_gland:     { id: 'disruptor_gland',     pipeline: 'BIO_PLASMA',    role: 'EFFECTOR',      baseEnergyCost: 200, downstream: [],                                              computeDemand: 1.5, anatomicalLayer: 'organs' },
  // Hemolymph
  heart_core:          { id: 'heart_core',          pipeline: 'HEMOLYMPH',     role: 'GENERATION',    baseEnergyCost: 40,  downstream: ['hemolymph_atrium'],                            computeDemand: 1.0, anatomicalLayer: 'vascular' },
  hemolymph_atrium:    { id: 'hemolymph_atrium',    pipeline: 'HEMOLYMPH',     role: 'STORAGE',       baseEnergyCost: 5,   downstream: ['aorta_highway'],                               computeDemand: 0.3, anatomicalLayer: 'vascular' },
  aorta_highway:       { id: 'aorta_highway',       pipeline: 'HEMOLYMPH',     role: 'DISTRIBUTION',  baseEnergyCost: 0,   downstream: ['flank_artery'],                                computeDemand: 0.2, anatomicalLayer: 'vascular' },
  flank_artery:        { id: 'flank_artery',        pipeline: 'HEMOLYMPH',     role: 'DISTRIBUTION',  baseEnergyCost: 2,   downstream: ['spiracle_vent'],                               computeDemand: 0.2, anatomicalLayer: 'vascular' },
  spiracle_vent:       { id: 'spiracle_vent',       pipeline: 'HEMOLYMPH',     role: 'EFFECTOR',      baseEnergyCost: 15,  downstream: [],                                              computeDemand: 0.5, anatomicalLayer: 'exoskeleton' },
  // Nervous
  brain_core:          { id: 'brain_core',          pipeline: 'NERVOUS',       role: 'GENERATION',    baseEnergyCost: 80,  downstream: ['neuro_link', 'ocular_pod'],                    computeDemand: 0,   anatomicalLayer: 'organs' },
  neuro_link:          { id: 'neuro_link',          pipeline: 'NERVOUS',       role: 'INTERFACE',     baseEnergyCost: 30,  downstream: ['axon_cord'],                                   computeDemand: 0.5, anatomicalLayer: 'organs' },
  axon_cord:           { id: 'axon_cord',           pipeline: 'NERVOUS',       role: 'DISTRIBUTION',  baseEnergyCost: 10,  downstream: ['muscle_tendon'],                               computeDemand: 0.2, anatomicalLayer: 'muscular' },
  ocular_pod:          { id: 'ocular_pod',          pipeline: 'NERVOUS',       role: 'EFFECTOR',      baseEnergyCost: 20,  downstream: [],                                              computeDemand: 2.0, anatomicalLayer: 'exoskeleton' },
  muscle_tendon:       { id: 'muscle_tendon',       pipeline: 'NERVOUS',       role: 'EFFECTOR',      baseEnergyCost: 60,  downstream: [],                                              computeDemand: 1.8, anatomicalLayer: 'muscular' },
  // Life Support
  ice_gizzard:         { id: 'ice_gizzard',         pipeline: 'LIFE_SUPPORT',  role: 'GENERATION',    baseEnergyCost: 45,  downstream: ['bio_moss'],                                    computeDemand: 0.5, anatomicalLayer: 'organs' },
  bio_moss:            { id: 'bio_moss',            pipeline: 'LIFE_SUPPORT',  role: 'STORAGE',       baseEnergyCost: 10,  downstream: ['habitat_chamber'],                             computeDemand: 0.3, anatomicalLayer: 'organs' },
  habitat_chamber:     { id: 'habitat_chamber',     pipeline: 'LIFE_SUPPORT',  role: 'STORAGE',       baseEnergyCost: 25,  downstream: ['cyber_airlock'],                               computeDemand: 0.8, anatomicalLayer: 'organs' },
  cyber_airlock:       { id: 'cyber_airlock',       pipeline: 'LIFE_SUPPORT',  role: 'EFFECTOR',      baseEnergyCost: 0,   downstream: [],                                              computeDemand: 0.2, anatomicalLayer: 'exoskeleton' },
  // Armor & Defense
  chitin_vertebra:     { id: 'chitin_vertebra',     pipeline: 'ARMOR_DEFENSE', role: 'STRUCTURAL',    baseEnergyCost: 1,   downstream: ['carapace_plate'],                              computeDemand: 0.3, anatomicalLayer: 'muscular' },
  carapace_plate:      { id: 'carapace_plate',      pipeline: 'ARMOR_DEFENSE', role: 'DEFENSE',       baseEnergyCost: 5,   downstream: ['bio_nanite_bed'],                              computeDemand: 0.2, anatomicalLayer: 'exoskeleton' },
  bio_nanite_bed:      { id: 'bio_nanite_bed',      pipeline: 'ARMOR_DEFENSE', role: 'REPAIR',        baseEnergyCost: 90,  downstream: ['shield_emitter'],                              computeDemand: 1.0, anatomicalLayer: 'vascular' },
  shield_emitter:      { id: 'shield_emitter',      pipeline: 'ARMOR_DEFENSE', role: 'EFFECTOR',      baseEnergyCost: 250, downstream: [],                                              computeDemand: 1.5, anatomicalLayer: 'exoskeleton' },
};

// Pipeline display names
const PIPELINE_NAMES: Record<OrganPipelineType, string> = {
  BIO_PLASMA: 'Bio-Plasma',
  HEMOLYMPH: 'Hemolymph',
  NERVOUS: 'Nervous',
  LIFE_SUPPORT: 'Life Support',
  ARMOR_DEFENSE: 'Armor & Defense',
};

// Brain metabolic multiplier (from neuralCompute.ts BRAIN_METABOLIC_MULTIPLIER)
const BRAIN_METABOLIC_MULTIPLIER = 22;

// ── Helpers ─────────────────────────────────────────────────────────────────

function hasOrgan(organs: PlacedOrganInfo[], nodeId: string): boolean {
  return organs.some((o) => o.nodeId === nodeId);
}

function getOrgansByNodeId(organs: PlacedOrganInfo[], nodeId: string): PlacedOrganInfo[] {
  return organs.filter((o) => o.nodeId === nodeId);
}

function prettyName(nodeId: string): string {
  return nodeId.replace(/_/g, ' ');
}

/**
 * Check if two organs are connected (directly or transitively).
 */
function areConnected(
  connections: PlacedConnectionInfo[],
  fromId: string,
  toId: string,
): boolean {
  const adj = new Map<string, Set<string>>();
  for (const conn of connections) {
    if (!adj.has(conn.fromId)) adj.set(conn.fromId, new Set());
    if (!adj.has(conn.toId)) adj.set(conn.toId, new Set());
    adj.get(conn.fromId)!.add(conn.toId);
    adj.get(conn.toId)!.add(conn.fromId);
  }
  const visited = new Set<string>();
  const queue = [fromId];
  visited.add(fromId);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === toId) return true;
    const neighbors = adj.get(cur);
    if (!neighbors) continue;
    for (const n of neighbors) {
      if (!visited.has(n)) {
        visited.add(n);
        queue.push(n);
      }
    }
  }
  return false;
}

// ── Brain compute capacity (simplified from neuralCompute.ts) ───────────────

function estimateBrainCompute(shipVolume: number): number {
  const eq = 5.0;
  const k = 0.12;
  const beta = 0.67;
  const brainMass = k * Math.pow(shipVolume, beta) * eq;
  const neuronDensity = 86e9;
  const bitsPerNeuron = 5;
  return brainMass * neuronDensity * bitsPerNeuron;
}

// ── Validation checks ───────────────────────────────────────────────────────

// 1. ENERGY — generation vs consumption, including brain metabolic overhead
function checkEnergy(input: ShipRequirementsInput): RequirementIssue[] {
  const issues: RequirementIssue[] = [];
  const { organs } = input;

  const hasPlasmaGland = hasOrgan(organs, 'plasma_gland');
  const baseConsumption = organs.reduce((sum, o) => {
    const meta = NODE_META[o.nodeId];
    return sum + (meta?.baseEnergyCost ?? 0);
  }, 0);

  // Brain metabolic overhead: brain tissue uses 22x more energy per unit mass
  // than muscle. The brain_core's baseEnergyCost (80) already accounts for
  // baseline, but the metabolic multiplier means the real cost is higher
  // when the brain is actually processing. Add 22x of brain's base cost as
  // active metabolic overhead.
  const brainOrgans = getOrgansByNodeId(organs, 'brain_core');
  const brainMetabolicOverhead = brainOrgans.reduce((sum, b) => {
    const meta = NODE_META[b.nodeId];
    return sum + (meta?.baseEnergyCost ?? 0) * (BRAIN_METABOLIC_MULTIPLIER - 1);
  }, 0);
  const totalConsumption = baseConsumption + brainMetabolicOverhead;

  // Generation: plasma gland produces ~850 kW → map to ~500 energy units
  const plasmaGlands = getOrgansByNodeId(organs, 'plasma_gland');
  const generation = plasmaGlands.length * 500;

  if (!hasPlasmaGland) {
    issues.push({
      id: 'energy-no-generator',
      category: 'energy',
      severity: 'critical',
      title: 'No energy generator',
      description: 'No Plasma Gland placed — the ship cannot generate bio-plasma energy. All organs will be offline.',
      fixHint: 'Place a Plasma Gland (Bio-Plasma pipeline) to start generating energy.',
    });
  }

  if (hasPlasmaGland && generation < totalConsumption) {
    const deficit = totalConsumption - generation;
    const ratio = generation / totalConsumption;
    const brainNote = brainMetabolicOverhead > 0
      ? ` (includes brain metabolic overhead: ${brainMetabolicOverhead} units from ${brainOrgans.length} brain(s) at ${BRAIN_METABOLIC_MULTIPLIER}x metabolic rate)`
      : '';
    issues.push({
      id: 'energy-deficit',
      category: 'energy',
      severity: ratio < 0.4 ? 'critical' : ratio < 0.75 ? 'warning' : 'info',
      title: 'Energy deficit',
      description: `Energy generation (${generation}) is less than total consumption (${totalConsumption}).${brainNote} Deficit: ${deficit} units. ${ratio < 0.4 ? 'Most systems will be offline.' : ratio < 0.75 ? 'Non-essential systems will be impaired.' : 'Minor shortfall — weapons may fail under load.'}`,
      fixHint: 'Add more Plasma Glands or remove high-cost organs (Shield Emitters: 250, Disruptor Glands: 200, Brain metabolic overhead: 22x).',
    });
  }

  return issues;
}

// 2. COMPUTE — brain capacity vs ALL organ demand + neural connectivity
function checkCompute(input: ShipRequirementsInput): RequirementIssue[] {
  const issues: RequirementIssue[] = [];
  const { organs, shipVolume, connections } = input;

  const hasBrain = hasOrgan(organs, 'brain_core');
  const totalComputeDemand = organs.reduce((sum, o) => {
    const meta = NODE_META[o.nodeId];
    return sum + (meta?.computeDemand ?? 0);
  }, 0);

  if (!hasBrain) {
    issues.push({
      id: 'compute-no-brain',
      category: 'compute',
      severity: 'critical',
      title: 'No neural compute source',
      description: 'No Brain Core placed — organs have no neural processing capacity. Sensors, weapons, and motor control will be non-functional.',
      fixHint: 'Place a Brain Core (Nervous pipeline) to provide compute capacity.',
    });
  }

  if (hasBrain) {
    const brainCompute = estimateBrainCompute(shipVolume);
    const scaledDemand = totalComputeDemand * 1e12;
    if (scaledDemand > brainCompute) {
      issues.push({
        id: 'compute-deficit',
        category: 'compute',
        severity: 'warning',
        title: 'Neural compute overload',
        description: `Total organ compute demand (${totalComputeDemand.toFixed(1)} units) exceeds brain processing capacity. Organs will experience neural lag and reduced efficiency.`,
        fixHint: 'Increase ship volume (larger brain) or reduce high-compute organs (Ocular Pods: 2.0, Muscle Tendons: 1.8, Disruptor Glands: 1.5).',
      });
    }
  }

  // Check that ALL organs (not just NERVOUS pipeline) have a neural
  // connection path to the brain. Every organ needs neural control.
  const brainOrgans = getOrgansByNodeId(organs, 'brain_core');
  if (brainOrgans.length > 0 && connections.length > 0) {
    const organsNeedingNeuralControl = organs.filter((o) =>
      o.nodeId !== 'brain_core' // brain doesn't need to connect to itself
    );
    for (const organ of organsNeedingNeuralControl) {
      const connectedToBrain = brainOrgans.some((b) =>
        areConnected(connections, organ.id, b.id),
      );
      if (!connectedToBrain) {
        const meta = NODE_META[organ.nodeId];
        const isNervous = organ.pipeline === 'NERVOUS';
        issues.push({
          id: `compute-disconnected-${organ.id}`,
          category: 'compute',
          severity: isNervous ? 'warning' : 'info',
          title: `${organ.name} disconnected from brain`,
          description: `${organ.name} has no neural connection path to the Brain Core. ${isNervous ? 'It cannot receive or process neural signals.' : 'It lacks neural control — autonomic functions may continue but conscious control is lost.'}`,
          organIds: [organ.id],
          organNames: [organ.name],
          fixHint: `Use the Connect tool to draw a neural connection from the Brain Core (or Axon Cord) to ${organ.name}.`,
        });
      }
    }
  }

  return issues;
}

// 3. PIPELINE — intra-pipeline upstream/downstream completeness + connectivity
function checkPipeline(input: ShipRequirementsInput): RequirementIssue[] {
  const issues: RequirementIssue[] = [];
  const { organs, connections } = input;

  for (const organ of organs) {
    const meta = NODE_META[organ.nodeId];
    if (!meta) continue;

    // Check downstream: if this organ has downstream nodes, at least one
    // downstream organ should be placed (pipeline completeness)
    for (const downstreamId of meta.downstream) {
      const hasDownstream = hasOrgan(organs, downstreamId);
      if (!hasDownstream) {
        issues.push({
          id: `pipeline-missing-downstream-${organ.id}-${downstreamId}`,
          category: 'pipeline',
          severity: 'info',
          title: `Missing ${prettyName(downstreamId)}`,
          description: `${organ.name} has no downstream ${prettyName(downstreamId)} placed. The ${PIPELINE_NAMES[meta.pipeline]} pipeline is incomplete at this stage.`,
          organIds: [organ.id],
          organNames: [organ.name],
          fixHint: `Place a ${prettyName(downstreamId)} to continue the ${PIPELINE_NAMES[meta.pipeline]} pipeline.`,
        });
      }
    }

    // Check upstream connection: if the upstream organ exists, are they connected?
    // Always check (not just when connections exist) — if both organs are placed
    // but no connection links them, that's a pipeline gap.
    const upstreamNodeIds = Object.values(NODE_META)
      .filter((m) => m.downstream.includes(organ.nodeId))
      .map((m) => m.id);
    for (const upstreamId of upstreamNodeIds) {
      if (hasOrgan(organs, upstreamId)) {
        const upstreamOrgans = getOrgansByNodeId(organs, upstreamId);
        const connectedToUpstream = upstreamOrgans.some((u) =>
          areConnected(connections, organ.id, u.id),
        );
        if (!connectedToUpstream) {
          issues.push({
            id: `pipeline-disconnected-${organ.id}-${upstreamId}`,
            category: 'pipeline',
            severity: 'warning',
            title: `${organ.name} not connected to upstream`,
            description: `${organ.name} is placed but not connected to its upstream ${prettyName(upstreamId)}. Resources cannot flow through the pipeline.`,
            organIds: [organ.id],
            organNames: [organ.name],
            fixHint: `Use the Connect tool to link the ${prettyName(upstreamId)} to ${organ.name}.`,
          });
        }
      }
    }
  }

  return issues;
}

// 4. VASCULAR — hemolymph supply chain to ALL organs (including brain)
function checkVascular(input: ShipRequirementsInput): RequirementIssue[] {
  const issues: RequirementIssue[] = [];
  const { organs, connections } = input;

  const hasHeart = hasOrgan(organs, 'heart_core');
  const hasAorta = hasOrgan(organs, 'aorta_highway');

  if (!hasHeart) {
    issues.push({
      id: 'vascular-no-heart',
      category: 'vascular',
      severity: 'critical',
      title: 'No hemolymph pump',
      description: 'No Heart Core placed — the ship has no hemolymph circulation. All organs will suffer oxygen/nutrient deprivation.',
      fixHint: 'Place a Heart Core (Hemolymph pipeline) to circulate life-sustaining fluid.',
    });
  }

  if (hasHeart && !hasAorta) {
    issues.push({
      id: 'vascular-no-aorta',
      category: 'vascular',
      severity: 'warning',
      title: 'No aorta distribution',
      description: 'Heart Core is placed but no Aorta Highway exists. Hemolymph cannot reach distant organs.',
      fixHint: 'Place an Aorta Highway (Hemolymph pipeline) downstream of the Heart.',
    });
  }

  // Check that ALL non-heart organs have a connection path to the heart.
  // The brain ALSO needs hemolymph — it uses 22x more energy per unit mass
  // than muscle and requires oxygen delivery. No organ is exempt.
  if (hasHeart && connections.length > 0) {
    const heartOrgans = getOrgansByNodeId(organs, 'heart_core');
    const organsNeedingSupply = organs.filter((o) =>
      o.nodeId !== 'heart_core' // heart doesn't supply itself
    );
    for (const organ of organsNeedingSupply) {
      const connectedToHeart = heartOrgans.some((h) =>
        areConnected(connections, organ.id, h.id),
      );
      if (!connectedToHeart) {
        const isBrain = organ.nodeId === 'brain_core';
        issues.push({
          id: `vascular-disconnected-${organ.id}`,
          category: 'vascular',
          severity: isBrain ? 'critical' : 'warning',
          title: `${organ.name} has no vascular supply`,
          description: `${organ.name} is not connected to the Heart Core's vascular network. ${isBrain ? 'The brain uses 22x more energy per unit mass than muscle — without hemolymph, neural tissue dies rapidly.' : 'It will not receive hemolymph (oxygen, nutrients).'}`,
          organIds: [organ.id],
          organNames: [organ.name],
          fixHint: `Connect ${organ.name} to the hemolymph network via the Connect tool.`,
        });
      }
    }
  }

  return issues;
}

// 5. LIFE SUPPORT — oxygen, water, habitat requirements
function checkLifeSupport(input: ShipRequirementsInput): RequirementIssue[] {
  const issues: RequirementIssue[] = [];
  const { organs } = input;

  const hasHabitat = hasOrgan(organs, 'habitat_chamber');
  const hasBioMoss = hasOrgan(organs, 'bio_moss');
  const hasIceGizzard = hasOrgan(organs, 'ice_gizzard');

  if (hasHabitat && !hasBioMoss) {
    issues.push({
      id: 'lifesupport-no-oxygen',
      category: 'life-support',
      severity: 'critical',
      title: 'Habitat has no oxygen source',
      description: 'Habitat Chambers are placed but no Bio-Moss Bed exists. Crew will suffocate without oxygen generation.',
      fixHint: 'Place a Bio-Moss Bed (Life Support pipeline) to generate oxygen.',
    });
  }

  if (hasBioMoss && !hasIceGizzard) {
    issues.push({
      id: 'lifesupport-no-water',
      category: 'life-support',
      severity: 'warning',
      title: 'Bio-Moss has no water/mineral input',
      description: 'Bio-Moss Bed is placed but no Ice Gizzard exists. The moss needs water and minerals from ice ingestion to produce oxygen.',
      fixHint: 'Place an Ice Gizzard (Life Support pipeline) upstream of the Bio-Moss Bed.',
    });
  }

  if (hasHabitat && !hasOrgan(organs, 'cyber_airlock')) {
    issues.push({
      id: 'lifesupport-no-airlock',
      category: 'life-support',
      severity: 'info',
      title: 'No airlock for EVA',
      description: 'Habitat Chambers are placed but no Cyber-Airlock exists. Crew cannot perform extravehicular activity.',
      fixHint: 'Place a Cyber-Airlock (Life Support pipeline) for pressure-sealed EVA access.',
    });
  }

  // Oxygen dependency: a functional ship needs oxygen generation
  if (!hasBioMoss) {
    issues.push({
      id: 'lifesupport-no-oxygen-any',
      category: 'life-support',
      severity: 'warning',
      title: 'No oxygen generation',
      description: 'No Bio-Moss Bed placed. The ship has no oxygen generation capability. Brain tissue (22x metabolic rate) and crew will suffocate.',
      fixHint: 'Place a Bio-Moss Bed (Life Support pipeline) — it produces 420 L/min O₂ from CO₂.',
    });
  }

  return issues;
}

// 6. STRUCTURAL — spine, armor, defense integrity
function checkStructural(input: ShipRequirementsInput): RequirementIssue[] {
  const issues: RequirementIssue[] = [];
  const { organs } = input;

  const hasVertebra = hasOrgan(organs, 'chitin_vertebra');
  const hasCarapace = hasOrgan(organs, 'carapace_plate');
  const hasNanite = hasOrgan(organs, 'bio_nanite_bed');

  if (!hasVertebra) {
    issues.push({
      id: 'structural-no-spine',
      category: 'structural',
      severity: 'warning',
      title: 'No spinal column',
      description: 'No Chitin Vertebrae Column placed. The ship lacks structural spine support — organs are unsupported and the axon cord has no protective channel.',
      fixHint: 'Place a Vertebrae Column (Armor & Defense pipeline) for structural integrity.',
    });
  }

  if (hasVertebra && !hasCarapace) {
    issues.push({
      id: 'structural-no-armor',
      category: 'structural',
      severity: 'info',
      title: 'No carapace armor',
      description: 'Vertebrae Column is placed but no Carapace Plates exist. The ship has no external armor plating.',
      fixHint: 'Place Carapace Plates (Armor & Defense pipeline) for hull protection.',
    });
  }

  if (hasNanite && !hasOrgan(organs, 'shield_emitter')) {
    issues.push({
      id: 'structural-no-shields',
      category: 'structural',
      severity: 'info',
      title: 'Nanite bed has no shield emitters',
      description: 'Bio-Nanite Coagulation Bed is placed but no Shield Emitters exist. Repair capability exists but active defense is missing.',
      fixHint: 'Place Shield Emitters (Armor & Defense pipeline) for active kinetic deflection.',
    });
  }

  // Vertebra protects the axon cord — if axon_cord exists but no vertebra,
  // the spinal cord is unprotected
  if (hasOrgan(organs, 'axon_cord') && !hasVertebra) {
    issues.push({
      id: 'structural-spine-unprotected',
      category: 'structural',
      severity: 'warning',
      title: 'Spinal cord unprotected',
      description: 'Axon Cord is placed but no Chitin Vertebrae Column exists. The spinal cord is exposed and vulnerable to damage.',
      fixHint: 'Place a Vertebrae Column (Armor & Defense pipeline) to protect the spinal cord.',
    });
  }

  return issues;
}

// 7. SYMMETRY — bilateral mirror completeness
function checkSymmetry(input: ShipRequirementsInput): RequirementIssue[] {
  const issues: RequirementIssue[] = [];
  const { organs, mirrorX } = input;

  if (!mirrorX || organs.length === 0) return issues;

  for (const organ of organs) {
    if (organ.isMirror) continue;
    if (Math.abs(organ.wx) < 0.1) continue; // on the midline
    if (organ.mirrorId) continue;

    const hasMirror = organs.some((o) =>
      o.nodeId === organ.nodeId &&
      o.id !== organ.id &&
      Math.abs(o.wx + organ.wx) < 0.5
    );
    if (!hasMirror) {
      issues.push({
        id: `symmetry-${organ.id}`,
        category: 'symmetry',
        severity: 'info',
        title: `${organ.name} lacks bilateral mirror`,
        description: `${organ.name} at x=${organ.wx.toFixed(1)}m has no mirrored counterpart. The ship will be asymmetric.`,
        organIds: [organ.id],
        organNames: [organ.name],
        fixHint: 'Enable X-mirror before placing organs, or place a matching organ on the opposite side.',
      });
    }
  }

  return issues;
}

// 8. CROSS-PIPELINE — inter-pipeline resource dependencies
function checkCrossPipeline(input: ShipRequirementsInput): RequirementIssue[] {
  const issues: RequirementIssue[] = [];
  const { organs } = input;

  // Ice Gizzard → Plasma Gland: water for electrolysis
  // (ORGAN_SYSTEMS.md: "Ingestion Gizzard → Electrolysis Gland")
  if (hasOrgan(organs, 'plasma_gland') && !hasOrgan(organs, 'ice_gizzard')) {
    issues.push({
      id: 'crosspipeline-plasma-no-water',
      category: 'cross-pipeline',
      severity: 'warning',
      title: 'Plasma Gland has no water source',
      description: 'Plasma Gland performs electrolysis (splitting water into hydrogen/oxygen for bio-plasma) but no Ice Gizzard is placed. Without ice ingestion providing water, the plasma pipeline will run dry.',
      fixHint: 'Place an Ice Gizzard (Life Support pipeline) — it feeds both the Bio-Moss and the Plasma Gland.',
    });
  }

  // Bio-Moss → Heart: oxygen for circulatory fluid
  // (Hemolymph carries oxygen; without bio-moss, hemolymph has no oxygen to deliver)
  if (hasOrgan(organs, 'heart_core') && !hasOrgan(organs, 'bio_moss')) {
    issues.push({
      id: 'crosspipeline-heart-no-oxygen',
      category: 'cross-pipeline',
      severity: 'warning',
      title: 'Heart has no oxygen source',
      description: 'Heart Core circulates hemolymph, but no Bio-Moss Bed is placed to oxygenate it. The heart will pump deoxygenated fluid — organs receive no oxygen.',
      fixHint: 'Place a Bio-Moss Bed (Life Support pipeline) to oxygenate the hemolymph.',
    });
  }

  // Bio-Moss → Brain: oxygen for neural tissue (22x metabolic rate)
  // (Brain tissue is the most oxygen-hungry tissue in the body)
  if (hasOrgan(organs, 'brain_core') && !hasOrgan(organs, 'bio_moss')) {
    issues.push({
      id: 'crosspipeline-brain-no-oxygen',
      category: 'cross-pipeline',
      severity: 'critical',
      title: 'Brain has no oxygen source',
      description: 'Brain Core is placed but no Bio-Moss Bed exists. Neural tissue uses 22x more energy per unit mass than muscle — without oxygen, the brain will shut down within seconds.',
      fixHint: 'Place a Bio-Moss Bed (Life Support pipeline) — the brain is the most oxygen-dependent organ.',
    });
  }

  // Ice Gizzard → Bio-Moss: minerals for photosynthesis
  // (Already checked in life-support, but also a cross-pipeline dependency
  // since ice_gizzard is LIFE_SUPPORT feeding bio_moss which is also LIFE_SUPPORT —
  // this is intra-pipeline, already covered)

  return issues;
}

// 9. COMMAND — ship operability requirements (pilot interface, sensors, propulsion)
function checkCommand(input: ShipRequirementsInput): RequirementIssue[] {
  const issues: RequirementIssue[] = [];
  const { organs, connections } = input;

  // Neuro-Link: human pilot interface — required for pilot control
  if (hasOrgan(organs, 'brain_core') && !hasOrgan(organs, 'neuro_link')) {
    issues.push({
      id: 'command-no-neurolink',
      category: 'command',
      severity: 'critical',
      title: 'No pilot interface',
      description: 'Brain Core is placed but no Neuro-Link Interface Pod exists. The pilot cannot connect to the ship\'s nervous system — the ship is uncontrollable.',
      fixHint: 'Place a Neuro-Link Pod (Nervous pipeline) — it provides the graphene fiber plug interface for human pilot control.',
    });
  }

  // Neuro-Link → Axon Cord: pilot commands must reach the spinal cord
  if (hasOrgan(organs, 'neuro_link') && hasOrgan(organs, 'axon_cord')) {
    const neuroLinkOrgans = getOrgansByNodeId(organs, 'neuro_link');
    const axonCordOrgans = getOrgansByNodeId(organs, 'axon_cord');
    const connected = neuroLinkOrgans.some((nl) =>
      axonCordOrgans.some((ac) => areConnected(connections, nl.id, ac.id)),
    );
    if (!connected && connections.length > 0) {
      issues.push({
        id: 'command-neurolink-disconnected',
        category: 'command',
        severity: 'warning',
        title: 'Pilot interface disconnected from spinal cord',
        description: 'Neuro-Link Pod and Axon Cord are both placed but not connected. Pilot commands cannot reach the muscle tendons for locomotion.',
        fixHint: 'Connect the Neuro-Link Pod to the Axon Cord using the Connect tool.',
      });
    }
  }

  // Axon Cord → Muscle Tendon: motor nerve pathway
  if (hasOrgan(organs, 'muscle_tendon') && !hasOrgan(organs, 'axon_cord')) {
    issues.push({
      id: 'command-no-spinal-cord',
      category: 'command',
      severity: 'warning',
      title: 'Muscle tendons have no spinal cord',
      description: 'Muscle Tendons are placed but no Axon Cord exists. Motor nerve signals from the brain cannot reach the muscles — the ship cannot move.',
      fixHint: 'Place an Axon Cord (Nervous pipeline) between the Neuro-Link and Muscle Tendons.',
    });
  }

  // Propulsion: siphon vent nozzles for movement
  if (!hasOrgan(organs, 'siphon_vent_nozzle')) {
    issues.push({
      id: 'command-no-propulsion',
      category: 'command',
      severity: 'warning',
      title: 'No propulsion system',
      description: 'No Bio-Plasma Vent Nozzles placed. The ship cannot generate thrust — it is adrift.',
      fixHint: 'Place Vent Nozzles (Bio-Plasma pipeline) at the tail for hydro-pulse propulsion (1,700 kN).',
    });
  }

  // Sensors: ocular pods for vision
  if (!hasOrgan(organs, 'ocular_pod')) {
    issues.push({
      id: 'command-no-sensors',
      category: 'command',
      severity: 'info',
      title: 'No sensor organs',
      description: 'No Ocular Beam Stalk Pods placed. The ship is blind — it cannot see its environment for navigation or targeting.',
      fixHint: 'Place Ocular Pods (Nervous pipeline) on the cranial region for multispectral vision.',
    });
  }

  // Brain → Ocular Pod: optic nerve direct connection
  // (Anatomical note: optic nerves route directly to brain, not spinal cord)
  if (hasOrgan(organs, 'brain_core') && hasOrgan(organs, 'ocular_pod')) {
    const brainOrgans = getOrgansByNodeId(organs, 'brain_core');
    const ocularOrgans = getOrgansByNodeId(organs, 'ocular_pod');
    const connected = brainOrgans.some((b) =>
      ocularOrgans.some((o) => areConnected(connections, b.id, o.id)),
    );
    if (!connected && connections.length > 0) {
      issues.push({
        id: 'command-ocular-disconnected',
        category: 'command',
        severity: 'warning',
        title: 'Ocular pods disconnected from brain',
        description: 'Ocular Pods and Brain Core are both placed but not connected. Visual data cannot reach the brain — the ship is functionally blind.',
        fixHint: 'Connect the Ocular Pods directly to the Brain Core (optic nerve — does not route through the spinal cord).',
      });
    }
  }

  return issues;
}

// ── Main validation function ────────────────────────────────────────────────

export function validateShipRequirements(input: ShipRequirementsInput): ShipValidationResult {
  const allIssues: RequirementIssue[] = [
    ...checkEnergy(input),
    ...checkCompute(input),
    ...checkPipeline(input),
    ...checkVascular(input),
    ...checkLifeSupport(input),
    ...checkStructural(input),
    ...checkSymmetry(input),
    ...checkCrossPipeline(input),
    ...checkCommand(input),
  ];

  // Deduplicate by id
  const seen = new Set<string>();
  const issues = allIssues.filter((issue) => {
    if (seen.has(issue.id)) return false;
    seen.add(issue.id);
    return true;
  });

  // Count met requirement categories
  const totalCategories = 9; // 9 categories
  const unmetCategories = new Set(issues.map((i) => i.category));
  const metCount = totalCategories - unmetCategories.size + (issues.length === 0 ? totalCategories : 0);

  return {
    issues,
    summary: {
      total: issues.length,
      critical: issues.filter((i) => i.severity === 'critical').length,
      warning: issues.filter((i) => i.severity === 'warning').length,
      info: issues.filter((i) => i.severity === 'info').length,
      met: issues.length === 0 ? totalCategories : metCount,
    },
  };
}

// ── Category metadata for UI ────────────────────────────────────────────────

export const CATEGORY_META: Record<RequirementCategory, { label: string; color: string; icon: string }> = {
  energy:          { label: 'Energy',         color: 'amber',   icon: 'zap' },
  compute:         { label: 'Neural Compute',  color: 'violet',  icon: 'brain' },
  pipeline:        { label: 'Pipeline',        color: 'cyan',    icon: 'git-branch' },
  vascular:        { label: 'Vascular',        color: 'rose',    icon: 'heart' },
  'life-support':  { label: 'Life Support',    color: 'emerald', icon: 'leaf' },
  structural:      { label: 'Structural',      color: 'orange',  icon: 'shield' },
  symmetry:        { label: 'Symmetry',        color: 'blue',    icon: 'flip-horizontal' },
  'cross-pipeline':{ label: 'Cross-Pipeline',  color: 'fuchsia', icon: 'git-merge' },
  command:         { label: 'Command',         color: 'yellow',  icon: 'radio' },
};

export const SEVERITY_META: Record<RequirementSeverity, { label: string; color: string; bg: string }> = {
  critical: { label: 'Critical', color: 'text-red-400',    bg: 'bg-red-500/10' },
  warning:  { label: 'Warning',  color: 'text-amber-400',   bg: 'bg-amber-500/10' },
  info:     { label: 'Info',     color: 'text-cyan-400',    bg: 'bg-cyan-500/10' },
};
