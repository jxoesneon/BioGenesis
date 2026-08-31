/**
 * Symmetry Test — Bounding Box Verification (All Symmetry Modes)
 *
 * Creates a bounding box around the whole ship, divides it into sectors
 * based on the active symmetry type, and verifies equal organ counts.
 *
 * Symmetry modes tested:
 * - bilateral: 2 sectors (starboard/port) divided at X=0
 * - radial-5: 5 sectors of 72° each
 * - radial-3: 3 sectors of 120° each
 * - biradial: 4 quadrants divided at X=0 and Y=0
 * - spherical: 6 sectors of 60° each
 * - asymmetrical: no constraint (always passes)
 *
 * Run with: npx tsx src/tests/symmetryTest.ts
 */

import {
  getSymmetryVCoords,
  vToXY,
  bilateralMirrorV,
  areBilateralMirrors,
  isOnMidline,
  testBilateralSymmetry,
  testSymmetry,
  symmetryCorrectV,
  symmetryGroupSize,
  type OrganPlacement,
} from '../utils/symmetry';
import type { SymmetryType } from '../types';

// ── Test framework ──

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.log(`  ✗ ${message}`);
  }
}

function assertApprox(actual: number, expected: number, tolerance: number, message: string): void {
  const diff = Math.abs(actual - expected);
  assert(diff < tolerance, `${message} (expected ${expected}, got ${actual}, diff ${diff.toFixed(6)})`);
}

// ── Tests ──

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  BILATERAL SYMMETRY TEST — Bounding Box Verification');
console.log('═══════════════════════════════════════════════════════════\n');

// ── Test 1: V-to-3D mapping correctness ──
console.log('Test 1: V-to-3D position mapping');
{
  const r = 5.0; // 5m radius cross-section

  // V=0.0 → starboard (X=+r, Y=0)
  const starboard = vToXY(0.0, r);
  assertApprox(starboard.x, r, 1e-6, 'V=0.0 → X=+r (starboard)');
  assertApprox(starboard.y, 0, 1e-6, 'V=0.0 → Y=0');

  // V=0.5 → port (X=-r, Y=0)
  const port = vToXY(0.5, r);
  assertApprox(port.x, -r, 1e-6, 'V=0.5 → X=-r (port)');
  assertApprox(port.y, 0, 1e-6, 'V=0.5 → Y=0');

  // V=0.25 → dorsal (X=0, Y=+r)
  const dorsal = vToXY(0.25, r);
  assertApprox(dorsal.x, 0, 1e-6, 'V=0.25 → X=0 (dorsal midline)');
  assertApprox(dorsal.y, r, 1e-6, 'V=0.25 → Y=+r (dorsal)');

  // V=0.75 → ventral (X=0, Y=-r)
  const ventral = vToXY(0.75, r);
  assertApprox(ventral.x, 0, 1e-6, 'V=0.75 → X=0 (ventral midline)');
  assertApprox(ventral.y, -r, 1e-6, 'V=0.75 → Y=-r (ventral)');
}
console.log();

// ── Test 2: Bilateral V coordinates produce true X-mirror pairs ──
console.log('Test 2: Bilateral V coordinates are X-mirror pairs');
{
  const sym = getSymmetryVCoords('bilateral');
  assert(sym.vCoords.length === 2, 'Bilateral produces exactly 2 V coordinates');

  const [vStarboard, vPort] = sym.vCoords;
  const r = 5.0;
  const starboardPos = vToXY(vStarboard, r);
  const portPos = vToXY(vPort, r);

  // X must be opposite
  assertApprox(starboardPos.x, -portPos.x, 1e-6, 'Starboard X = -Port X (mirrored)');

  // Y must be the same
  assertApprox(starboardPos.y, portPos.y, 1e-6, 'Starboard Y = Port Y (same height)');

  // Verify using areBilateralMirrors helper
  assert(areBilateralMirrors(vStarboard, vPort), 'areBilateralMirrors confirms the pair');
}
console.log();

// ── Test 3: Old [0.18, 0.68] was NOT a mirror pair ──
console.log('Test 3: Old [0.18, 0.68] was diagonal, not bilateral');
{
  const r = 5.0;
  const old1 = vToXY(0.18, r);
  const old2 = vToXY(0.68, r);

  // X is opposite (good)
  assertApprox(old1.x, -old2.x, 1e-6, 'Old pair: X is opposite');

  // Y is ALSO opposite (bad — diagonal, not mirror)
  assertApprox(old1.y, -old2.y, 1e-6, 'Old pair: Y is also opposite (diagonal, NOT bilateral)');

  // areBilateralMirrors should reject this
  assert(!areBilateralMirrors(0.18, 0.68), 'areBilateralMirrors rejects [0.18, 0.68]');
}
console.log();

// ── Test 4: bilateralMirrorV produces correct mirrors ──
console.log('Test 4: bilateralMirrorV formula');
{
  const cases: [number, number][] = [
    [0.0, 0.5],   // starboard ↔ port
    [0.1, 0.4],   // upper-starboard ↔ upper-port
    [0.25, 0.25], // dorsal midline (self-mirror)
    [0.75, 0.75], // ventral midline (self-mirror)
    [0.8, 0.7],   // ventral-starboard ↔ ventral-port
  ];

  for (const [v, expected] of cases) {
    const mirror = bilateralMirrorV(v);
    assertApprox(mirror, expected, 1e-6, `bilateralMirrorV(${v}) = ${expected}`);
  }
}
console.log();

// ── Test 5: isOnMidline ──
console.log('Test 5: Midline detection');
{
  assert(isOnMidline(0.25), 'V=0.25 is on midline (dorsal)');
  assert(isOnMidline(0.75), 'V=0.75 is on midline (ventral)');
  assert(!isOnMidline(0.0), 'V=0.0 is NOT on midline (starboard)');
  assert(!isOnMidline(0.5), 'V=0.5 is NOT on midline (port)');
  assert(!isOnMidline(0.1), 'V=0.1 is NOT on midline');
}
console.log();

// ── Test 6: Bounding box symmetry test with synthetic organs ──
console.log('Test 6: Bounding box bilateral symmetry — synthetic organs');
{
  const r = 5.0;
  const organs: OrganPlacement[] = [];

  // Create 4 pairs of mirrored organs + 2 midline organs
  const pairs: [number, number, number][] = [
    // [U, V_starboard, type_index]
    [0.4, 0.0, 1],   // spiracle pair at equator
    [0.5, 0.1, 2],   // rib pair upper
    [0.1, 0.05, 3],  // eye pair
    [0.7, 0.15, 4],  // tentacle pair
  ];

  for (const [u, vSb, typeIdx] of pairs) {
    const sbPos = vToXY(vSb, r);
    const vPort = bilateralMirrorV(vSb);
    const portPos = vToXY(vPort, r);
    const z = u * 20; // mock Z from U

    organs.push({
      id: `organ_${typeIdx}_sb`,
      type: `type${typeIdx}`,
      pos: { x: sbPos.x, y: sbPos.y, z },
      clearanceRadius: 2.0,
    });
    organs.push({
      id: `organ_${typeIdx}_port`,
      type: `type${typeIdx}`,
      pos: { x: portPos.x, y: portPos.y, z },
      clearanceRadius: 2.0,
    });
  }

  // Add 2 midline organs (dorsal sail)
  organs.push({
    id: 'midline_1',
    type: 'dorsalSail',
    pos: { x: 0, y: r, z: 8 },
    clearanceRadius: 2.0,
  });
  organs.push({
    id: 'midline_2',
    type: 'dorsalSail',
    pos: { x: 0, y: r, z: 12 },
    clearanceRadius: 2.0,
  });

  const result = testBilateralSymmetry(organs);

  console.log(`  Bounding box: X=[${result.boundingBox.minX.toFixed(1)}, ${result.boundingBox.maxX.toFixed(1)}], Y=[${result.boundingBox.minY.toFixed(1)}, ${result.boundingBox.maxY.toFixed(1)}], Z=[${result.boundingBox.minZ.toFixed(1)}, ${result.boundingBox.maxZ.toFixed(1)}]`);
  console.log(`  Center line: X=${result.centerLine}`);
  console.log(`  Starboard: ${result.starboardCount} organs, Port: ${result.portCount} organs, Midline: ${result.midlineCount} organs`);

  assert(result.passed, 'Symmetry test passes for perfectly mirrored organs');
  assert(result.starboardCount === 4, '4 starboard organs');
  assert(result.portCount === 4, '4 port organs');
  assert(result.midlineCount === 2, '2 midline organs');
  assert(result.unmatched.length === 0, '0 unmatched organs');
}
console.log();

// ── Test 7: Bounding box detects asymmetry ──
console.log('Test 7: Bounding box detects asymmetric placement');
{
  const organs: OrganPlacement[] = [
    { id: 'a_sb', type: 'spiracle', pos: { x: 5, y: 0, z: 10 }, clearanceRadius: 2 },
    { id: 'a_port', type: 'spiracle', pos: { x: -5, y: 0, z: 10 }, clearanceRadius: 2 },
    { id: 'b_sb', type: 'rib', pos: { x: 4, y: 3, z: 12 }, clearanceRadius: 2 },
    // Missing port mirror for b_sb!
  ];

  const result = testBilateralSymmetry(organs);
  assert(!result.passed, 'Asymmetric placement fails the test');
  assert(result.starboardCount === 2, '2 starboard organs');
  assert(result.portCount === 1, '1 port organ (missing mirror)');
  assert(result.unmatched.length === 1, '1 unmatched starboard organ');
  assert(result.errors.length > 0, 'Errors are reported');
  console.log(`  Error: ${result.errors[0]}`);
}
console.log();

// ── Test 8: All symmetry types produce valid V coordinates ──
console.log('Test 8: All symmetry types produce valid V coordinates');
{
  const types: SymmetryType[] = ['bilateral', 'radial-5', 'radial-3', 'biradial', 'spherical', 'asymmetrical'];

  for (const sym of types) {
    const result = getSymmetryVCoords(sym, 0);
    assert(result.vCoords.length > 0, `${sym}: has V coordinates`);
    assert(result.names.length === result.vCoords.length, `${sym}: names match V count`);

    // All V values must be in [0, 1)
    for (const v of result.vCoords) {
      assert(v >= 0 && v < 1, `${sym}: V=${v} is in [0, 1)`);
    }
  }
}
console.log();

// ── Test 9: Bilateral bounding box is centered on X=0 ──
console.log('Test 9: Bounding box is centered on X=0 for bilateral');
{
  const r = 5.0;
  const organs: OrganPlacement[] = [];

  // Create bilateral pairs
  for (let i = 0; i < 5; i++) {
    const v = 0.0 + i * 0.05;
    const vMirror = bilateralMirrorV(v);
    const sbPos = vToXY(v, r);
    const portPos = vToXY(vMirror, r);
    const z = i * 4;

    organs.push({ id: `o${i}_sb`, type: 'test', pos: { x: sbPos.x, y: sbPos.y, z }, clearanceRadius: 1 });
    organs.push({ id: `o${i}_port`, type: 'test', pos: { x: portPos.x, y: portPos.y, z }, clearanceRadius: 1 });
  }

  const result = testBilateralSymmetry(organs);
  const boxCenter = (result.boundingBox.minX + result.boundingBox.maxX) / 2;
  assertApprox(boxCenter, 0, 1e-6, 'Bounding box center is at X=0');
  assertApprox(result.boundingBox.minX, -result.boundingBox.maxX, 1e-6, 'minX = -maxX (symmetric box)');
}
console.log();

// ── Test 10: symmetryCorrectV for all symmetry types ──
console.log('Test 10: symmetryCorrectV produces correct partner V for all modes');
{
  const r = 5.0;
  const types: SymmetryType[] = ['bilateral', 'radial-5', 'radial-3', 'biradial', 'spherical', 'asymmetrical'];

  for (const sym of types) {
    const groupSize = symmetryGroupSize(sym);
    const primaryV = 0.1; // arbitrary primary V
    const positions: { x: number; y: number }[] = [];

    for (let side = 0; side < groupSize; side++) {
      const v = symmetryCorrectV(sym, primaryV, side);
      const pos = vToXY(v, r);
      positions.push(pos);
    }

    if (sym === 'bilateral') {
      // Side 0 and side 1 must have opposite X, same Y
      assertApprox(positions[0].x, -positions[1].x, 1e-6, `${sym}: X is mirrored`);
      assertApprox(positions[0].y, positions[1].y, 1e-6, `${sym}: Y is same`);
    } else if (sym === 'asymmetrical') {
      // groupSize=1, only primary exists — no symmetry to check
      assert(positions.length === 1, `${sym}: only 1 position (no partners)`);
    } else {
      // Radial: all sides at same radius from center
      for (let i = 0; i < positions.length; i++) {
        const dist = Math.sqrt(positions[i].x ** 2 + positions[i].y ** 2);
        assertApprox(dist, r, 1e-6, `${sym} side ${i}: at radius r`);
      }
      // Check angular spacing
      for (let i = 1; i < positions.length; i++) {
        const angle0 = Math.atan2(positions[0].y, positions[0].x);
        const angleI = Math.atan2(positions[i].y, positions[i].x);
        let diff = angleI - angle0;
        while (diff < 0) diff += Math.PI * 2;
        const expectedAngle = (i / groupSize) * Math.PI * 2;
        assertApprox(diff, expectedAngle, 0.01, `${sym} side ${i}: ${((i / groupSize) * 360).toFixed(0)}° from primary`);
      }
    }
  }
}
console.log();

// ── Test 11: Multi-mode bounding box test — bilateral ──
console.log('Test 11: Multi-mode test — bilateral');
{
  const r = 5.0;
  const organs: OrganPlacement[] = [];
  // 3 bilateral pairs + 1 midline
  for (let i = 0; i < 3; i++) {
    const vSb = 0.0 + i * 0.05;
    const vPort = bilateralMirrorV(vSb);
    const sb = vToXY(vSb, r);
    const port = vToXY(vPort, r);
    organs.push({ id: `o${i}_sb`, type: 'test', pos: { x: sb.x, y: sb.y, z: i * 5 }, clearanceRadius: 1 });
    organs.push({ id: `o${i}_port`, type: 'test', pos: { x: port.x, y: port.y, z: i * 5 }, clearanceRadius: 1 });
  }
  organs.push({ id: 'mid', type: 'sail', pos: { x: 0, y: r, z: 10 }, clearanceRadius: 1 });

  const result = testSymmetry(organs, 'bilateral');
  assert(result.passed, 'Bilateral: test passes');
  assert(result.sectorCounts[0] === 3, 'Bilateral: 3 starboard organs');
  assert(result.sectorCounts[1] === 3, 'Bilateral: 3 port organs');
  assert(result.midlineCount === 1, 'Bilateral: 1 midline organ');
}
console.log();

// ── Test 12: Multi-mode bounding box test — radial-5 ──
console.log('Test 12: Multi-mode test — radial-5');
{
  const r = 5.0;
  const organs: OrganPlacement[] = [];
  // 2 groups of 5 organs each, evenly spaced
  // Use primaryV=0.05 to avoid landing on sector boundaries
  for (let g = 0; g < 2; g++) {
    const primaryV = 0.05 + g * 0.1;
    for (let side = 0; side < 5; side++) {
      const v = symmetryCorrectV('radial-5', primaryV, side);
      const pos = vToXY(v, r);
      organs.push({ id: `g${g}_s${side}`, type: 'test', pos: { x: pos.x, y: pos.y, z: g * 10 }, clearanceRadius: 1 });
    }
  }

  const result = testSymmetry(organs, 'radial-5');
  assert(result.passed, 'Radial-5: test passes with evenly spaced organs');
  assert(result.sectorCounts.length === 5, 'Radial-5: 5 sectors');
  // Each sector should have 2 organs
  for (let i = 0; i < 5; i++) {
    assert(result.sectorCounts[i] === 2, `Radial-5: sector ${i} has 2 organs (got ${result.sectorCounts[i]})`);
  }
}
console.log();

// ── Test 13: Multi-mode bounding box test — radial-3 ──
console.log('Test 13: Multi-mode test — radial-3');
{
  const r = 5.0;
  const organs: OrganPlacement[] = [];
  for (let g = 0; g < 3; g++) {
    const primaryV = 0.05 + g * 0.1;
    for (let side = 0; side < 3; side++) {
      const v = symmetryCorrectV('radial-3', primaryV, side);
      const pos = vToXY(v, r);
      organs.push({ id: `g${g}_s${side}`, type: 'test', pos: { x: pos.x, y: pos.y, z: g * 8 }, clearanceRadius: 1 });
    }
  }

  const result = testSymmetry(organs, 'radial-3');
  assert(result.passed, 'Radial-3: test passes with evenly spaced organs');
  assert(result.sectorCounts.length === 3, 'Radial-3: 3 sectors');
  for (let i = 0; i < 3; i++) {
    assert(result.sectorCounts[i] === 3, `Radial-3: sector ${i} has 3 organs`);
  }
}
console.log();

// ── Test 14: Multi-mode bounding box test — biradial ──
console.log('Test 14: Multi-mode test — biradial');
{
  const r = 5.0;
  const organs: OrganPlacement[] = [];
  for (let g = 0; g < 2; g++) {
    const primaryV = 0.05 + g * 0.1;
    for (let side = 0; side < 4; side++) {
      const v = symmetryCorrectV('biradial', primaryV, side);
      const pos = vToXY(v, r);
      organs.push({ id: `g${g}_s${side}`, type: 'test', pos: { x: pos.x, y: pos.y, z: g * 10 }, clearanceRadius: 1 });
    }
  }

  const result = testSymmetry(organs, 'biradial');
  assert(result.passed, 'Biradial: test passes with evenly spaced organs');
  assert(result.sectorCounts.length === 4, 'Biradial: 4 sectors');
}
console.log();

// ── Test 15: Multi-mode bounding box test — spherical ──
console.log('Test 15: Multi-mode test — spherical');
{
  const r = 5.0;
  const organs: OrganPlacement[] = [];
  for (let g = 0; g < 1; g++) {
    const primaryV = 0.05;
    for (let side = 0; side < 6; side++) {
      const v = symmetryCorrectV('spherical', primaryV, side);
      const pos = vToXY(v, r);
      organs.push({ id: `g${g}_s${side}`, type: 'test', pos: { x: pos.x, y: pos.y, z: g * 10 }, clearanceRadius: 1 });
    }
  }

  const result = testSymmetry(organs, 'spherical');
  assert(result.sectorCounts.length === 6, 'Spherical: 6 sectors');
}
console.log();

// ── Test 16: Multi-mode bounding box test — asymmetrical ──
console.log('Test 16: Multi-mode test — asymmetrical (always passes)');
{
  const organs: OrganPlacement[] = [
    { id: 'a', type: 'test', pos: { x: 3, y: 2, z: 5 }, clearanceRadius: 1 },
    { id: 'b', type: 'test', pos: { x: -1, y: 4, z: 10 }, clearanceRadius: 1 },
    { id: 'c', type: 'test', pos: { x: 5, y: -3, z: 15 }, clearanceRadius: 1 },
  ];

  const result = testSymmetry(organs, 'asymmetrical');
  assert(result.passed, 'Asymmetrical: always passes');
  assert(result.totalOrgans === 3, 'Asymmetrical: all organs counted');
}
console.log();

// ── Test 17: Multi-mode test detects asymmetry in radial-5 ──
console.log('Test 17: Multi-mode test detects broken radial-5 symmetry');
{
  const r = 5.0;
  const organs: OrganPlacement[] = [];
  // Create 4 organs in one sector, 1 in another, 0 in the rest
  for (let i = 0; i < 4; i++) {
    organs.push({ id: `a${i}`, type: 'test', pos: { x: r * Math.cos(0.1), y: r * Math.sin(0.1 + i * 0.01), z: i * 5 }, clearanceRadius: 1 });
  }
  organs.push({ id: 'b', type: 'test', pos: { x: r * Math.cos(2.5), y: r * Math.sin(2.5), z: 5 }, clearanceRadius: 1 });

  const result = testSymmetry(organs, 'radial-5');
  assert(!result.passed, 'Radial-5: broken symmetry is detected');
  assert(result.errors.length > 0, 'Radial-5: errors are reported');
}
console.log();

// ── Test 18: symmetryGroupSize ──
console.log('Test 18: symmetryGroupSize returns correct sizes');
{
  assert(symmetryGroupSize('bilateral') === 2, 'bilateral: 2');
  assert(symmetryGroupSize('radial-5') === 5, 'radial-5: 5');
  assert(symmetryGroupSize('radial-3') === 3, 'radial-3: 3');
  assert(symmetryGroupSize('biradial') === 4, 'biradial: 4');
  assert(symmetryGroupSize('spherical') === 6, 'spherical: 6');
  assert(symmetryGroupSize('asymmetrical') === 1, 'asymmetrical: 1');
}
console.log();

// ── Summary ──
console.log('═══════════════════════════════════════════════════════════');
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\n  FAILURES:');
  for (const f of failures) {
    console.log(`    ✗ ${f}`);
  }
}
console.log('═══════════════════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
