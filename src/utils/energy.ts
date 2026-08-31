import { AppState, TargetNodeInfo } from '../types';

export type EnergyStatus = 'OPTIMAL' | 'SUB_OPTIMAL' | 'FAILING' | 'OFFLINE';

export function calculateEnergyGeneration(state: AppState): number {
  const INTAKE_MULTIPLIERS: Record<string, number> = {
    'baleen-ram': 1.5,           // Leviathan — massive ram-scoop, highest passive intake
    'crushing-mandibles': 1.2,   // Harvester — active ore crushing, moderate generation
    'lamprey-siphon': 1.0,       // Frigate — parasitic siphon, baseline
    'stealth-slit': 0.7,         // Interceptor — low-profile intake, sacrifices generation for stealth
    'spore-filter': 1.1,         // Carrier — ambient spore filtration, steady low generation
  };
  const multiplier = INTAKE_MULTIPLIERS[state.intakeType] ?? 1.0;
  return (state.length * 15 + state.habitatChambers * 12 + state.sporeSacs * 8) * multiplier;
}

export function calculateEnergyConsumption(nodes: TargetNodeInfo[]): number {
  let totalCost = 0;
  for (const node of nodes) {
    if (node.baseEnergyCost) {
      totalCost += node.baseEnergyCost;
    }
  }
  return totalCost;
}

export function evaluateEnergyStatus(generation: number, consumption: number): EnergyStatus {
  if (generation >= consumption) return 'OPTIMAL';
  if (generation >= consumption * 0.75) return 'SUB_OPTIMAL';
  if (generation >= consumption * 0.4) return 'FAILING';
  return 'OFFLINE';
}

export function getOrganEnergyStatus(node: TargetNodeInfo, globalStatus: EnergyStatus): EnergyStatus {
  if (globalStatus === 'OPTIMAL') return 'OPTIMAL';

  const role = node.role;
  const isWeapon = node.name.includes('Disruptor') || node.name.includes('Shield');

  if (globalStatus === 'SUB_OPTIMAL') {
    if (isWeapon) return 'FAILING';
    if (role === 'EFFECTOR') return 'SUB_OPTIMAL';
    return 'OPTIMAL';
  }

  if (globalStatus === 'FAILING') {
    if (isWeapon) return 'OFFLINE';
    if (role === 'EFFECTOR') return 'OFFLINE';
    if (role === 'GENERATION') return 'SUB_OPTIMAL';
    return 'FAILING';
  }

  return 'OFFLINE';
}
