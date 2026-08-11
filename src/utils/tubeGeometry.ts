/**
 * Tube & Spline Geometry Module
 *
 * Implements spline-based tube generation with Bishop frame (rotation-minimizing)
 * and variable radius, as recommended in
 * docs/research/PROCEDURAL_MESH_GENERATION_RESEARCH.md §4.4.
 *
 * The Bishop frame avoids the twisting artifacts that the Frenet-Serret frame
 * produces at inflection points and straight segments — critical for organic
 * tubes like arteries, veins, and tentacles.
 *
 * References:
 *   - Bishop frame: "There is More Than One Way to Frame a Curve" (Bishop 1975)
 *   - Jia et al.: "Bishop Frame for Tube Generation" — dergipark.org.tr
 *   - Three.js TubeGeometry (Frenet frame reference)
 *   - Splinebox: splinebox.readthedocs.io
 */

import * as THREE from 'three';

// ── Bishop Frame Computation ──

/**
 * Compute a rotation-minimizing frame (Bishop frame) along a curve.
 *
 * The Bishop frame avoids twisting by transporting the normal/binormal
 * parallel along the curve, rather than recomputing from the Frenet-Serret
 * formulas which are undefined at inflection points.
 *
 * @param points Array of points along the curve.
 * @param tangents Array of tangent vectors at each point (normalized).
 * @param initialNormal Optional initial normal vector. If not provided,
 *   one is computed automatically.
 * @returns Array of { normal, binormal } frames at each point.
 */
export function computeBishopFrames(
  points: THREE.Vector3[],
  tangents: THREE.Vector3[],
  initialNormal?: THREE.Vector3,
): { normal: THREE.Vector3; binormal: THREE.Vector3 }[] {
  const n = points.length;
  if (n === 0) return [];
  if (n === 1) {
    const normal = initialNormal ?? new THREE.Vector3(1, 0, 0);
    const binormal = new THREE.Vector3().crossVectors(tangents[0], normal).normalize();
    normal.crossVectors(binormal, tangents[0]).normalize();
    return [{ normal: normal.clone(), binormal }];
  }

  const frames: { normal: THREE.Vector3; binormal: THREE.Vector3 }[] = [];

  // Initial frame
  let prevNormal: THREE.Vector3;
  if (initialNormal) {
    prevNormal = initialNormal.clone().normalize();
    // Make sure it's perpendicular to the tangent
    const t0 = tangents[0];
    prevNormal.sub(t0.clone().multiplyScalar(prevNormal.dot(t0))).normalize();
  } else {
    // Find a vector not parallel to the tangent
    const t0 = tangents[0];
    let ref = new THREE.Vector3(1, 0, 0);
    if (Math.abs(t0.dot(ref)) > 0.9) ref = new THREE.Vector3(0, 1, 0);
    prevNormal = new THREE.Vector3().crossVectors(t0, ref).normalize();
  }

  let prevBinormal = new THREE.Vector3().crossVectors(tangents[0], prevNormal).normalize();
  prevNormal.crossVectors(prevBinormal, tangents[0]).normalize();
  frames.push({ normal: prevNormal.clone(), binormal: prevBinormal.clone() });

  // Parallel transport the frame along the curve
  for (let i = 1; i < n; i++) {
    const t0 = tangents[i - 1];
    const t1 = tangents[i];

    // Rotate the previous frame to align with the new tangent
    // using double reflection method (Wang et al. 2008)
    const v1 = new THREE.Vector3().subVectors(points[i], points[i - 1]);
    const c1 = v1.dot(v1);
    if (c1 < 1e-12) {
      frames.push({ normal: prevNormal.clone(), binormal: prevBinormal.clone() });
      continue;
    }
    const rL = 2.0 / c1;
    const f1 = v1.clone().multiplyScalar(rL);

    // Reflect normal
    const n0 = prevNormal.clone();
    const n0v1 = n0.dot(v1);
    const n1 = n0.clone().sub(f1.clone().multiplyScalar(n0v1));

    // Reflect tangent
    const t0v1 = t0.dot(v1);
    const t0r = t0.clone().sub(f1.clone().multiplyScalar(t0v1));

    // Second reflection to align with t1
    const v2 = new THREE.Vector3().subVectors(t1, t0r);
    const c2 = v2.dot(v2);
    if (c2 < 1e-12) {
      frames.push({ normal: n1.clone(), binormal: new THREE.Vector3().crossVectors(t1, n1).normalize() });
      prevNormal = n1;
      prevBinormal = new THREE.Vector3().crossVectors(t1, n1).normalize();
      continue;
    }
    const rR = 2.0 / c2;
    const f2 = v2.clone().multiplyScalar(rR);

    const n1v2 = n1.dot(v2);
    const n2 = n1.clone().sub(f2.clone().multiplyScalar(n1v2));

    const binormal2 = new THREE.Vector3().crossVectors(t1, n2).normalize();
    n2.crossVectors(binormal2, t1).normalize();

    frames.push({ normal: n2.clone(), binormal: binormal2.clone() });
    prevNormal = n2;
    prevBinormal = binormal2;
  }

  return frames;
}

// ── Variable-Radius Tube Generation ──

/**
 * Radius function: returns tube radius at parameter t [0,1] and angle phi [0,2π].
 * Allows variable radius along the tube length and around the circumference.
 */
export type RadiusFunction = (t: number, phi: number) => number;

/**
 * Build a tube mesh along a Catmull-Rom spline with Bishop frame and variable radius.
 *
 * This is the organic tube generator for arteries, veins, tentacles, and conduits.
 * The Bishop frame prevents twisting at inflection points, and the variable radius
 * function enables tapering, bulging, and organic tube profiles.
 *
 * @param controlPoints Array of control points for the Catmull-Rom spline.
 * @param options Generation options.
 * @returns THREE.BufferGeometry with position, normal, and UV attributes.
 *
 * @example
 * const tube = buildOrganicTube(
 *   [new THREE.Vector3(0,0,0), new THREE.Vector3(0,1,0), new THREE.Vector3(1,2,0)],
 *   { tubularSegments: 64, radialSegments: 16, radius: (t) => 0.3 * (1 - t * 0.5) }
 * );
 */
export function buildOrganicTube(
  controlPoints: THREE.Vector3[],
  options: {
    /** Number of segments along the tube length. */
    tubularSegments?: number;
    /** Number of segments around the tube circumference. */
    radialSegments?: number;
    /** Constant radius (ignored if radiusFunction is provided). */
    radius?: number;
    /** Variable radius function r(t, phi). */
    radiusFunction?: RadiusFunction;
    /** Whether the spline is closed (loops back to start). */
    closed?: boolean;
    /** Tapering factor: 1.0 = no taper, 0.5 = half radius at end. */
    taper?: number;
    /** Whether to cap the ends of the tube. */
    capped?: boolean;
    /** Initial normal for Bishop frame (optional, auto-computed if omitted). */
    initialNormal?: THREE.Vector3;
  } = {},
): THREE.BufferGeometry {
  const tubularSegments = options.tubularSegments ?? 64;
  const radialSegments = options.radialSegments ?? 16;
  const closed = options.closed ?? false;
  const taper = options.taper ?? 1.0;
  const capped = options.capped ?? false;

  // Build Catmull-Rom curve
  const curve = new THREE.CatmullRomCurve3(controlPoints, closed, 'centripetal');
  const points = curve.getPoints(tubularSegments);
  const tangents: THREE.Vector3[] = [];
  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    tangents.push(curve.getTangent(t).normalize());
  }

  // Compute Bishop frames
  const frames = computeBishopFrames(points, tangents, options.initialNormal);

  // Generate vertices
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    const point = points[i];
    const frame = frames[i];

    for (let j = 0; j <= radialSegments; j++) {
      const phi = (j / radialSegments) * Math.PI * 2;

      // Compute radius at this point
      let r: number;
      if (options.radiusFunction) {
        r = options.radiusFunction(t, phi);
      } else {
        const baseRadius = options.radius ?? 0.3;
        r = baseRadius * (1.0 - (1.0 - taper) * t);
      }

      // Compute vertex position using Bishop frame
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);
      const normal = frame.normal.clone().multiplyScalar(cosPhi);
      const binormal = frame.binormal.clone().multiplyScalar(sinPhi);
      const offset = normal.add(binormal).multiplyScalar(r);
      const vertex = point.clone().add(offset);

      positions.push(vertex.x, vertex.y, vertex.z);

      // Outward normal
      const outNormal = frame.normal.clone().multiplyScalar(cosPhi).add(
        frame.binormal.clone().multiplyScalar(sinPhi)
      ).normalize();
      normals.push(outNormal.x, outNormal.y, outNormal.z);

      uvs.push(t, j / radialSegments);
    }
  }

  // Generate indices for tube surface
  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * (radialSegments + 1) + j;
      const b = (i + 1) * (radialSegments + 1) + j;
      const c = (i + 1) * (radialSegments + 1) + (j + 1);
      const d = i * (radialSegments + 1) + (j + 1);

      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  // Cap the ends if requested
  if (capped) {
    // Start cap
    const startCenterIdx = positions.length / 3;
    positions.push(points[0].x, points[0].y, points[0].z);
    normals.push(-tangents[0].x, -tangents[0].y, -tangents[0].z);
    uvs.push(0, 0.5);

    const startFrame = frames[0];
    const startRadius = options.radiusFunction ? options.radiusFunction(0, 0) : (options.radius ?? 0.3);
    for (let j = 0; j < radialSegments; j++) {
      const phi = (j / radialSegments) * Math.PI * 2;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);
      const offset = startFrame.normal.clone().multiplyScalar(cosPhi * startRadius)
        .add(startFrame.binormal.clone().multiplyScalar(sinPhi * startRadius));
      const vertex = points[0].clone().add(offset);
      positions.push(vertex.x, vertex.y, vertex.z);
      normals.push(-tangents[0].x, -tangents[0].y, -tangents[0].z);
      uvs.push(0, j / radialSegments);
    }
    for (let j = 0; j < radialSegments; j++) {
      indices.push(startCenterIdx, startCenterIdx + 1 + j, startCenterIdx + 1 + ((j + 1) % radialSegments));
    }

    // End cap
    const endCenterIdx = positions.length / 3;
    const lastIdx = tubularSegments;
    positions.push(points[lastIdx].x, points[lastIdx].y, points[lastIdx].z);
    normals.push(tangents[lastIdx].x, tangents[lastIdx].y, tangents[lastIdx].z);
    uvs.push(1, 0.5);

    const endFrame = frames[lastIdx];
    const endRadius = options.radiusFunction ? options.radiusFunction(1, 0) : (options.radius ?? 0.3) * taper;
    for (let j = 0; j < radialSegments; j++) {
      const phi = (j / radialSegments) * Math.PI * 2;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);
      const offset = endFrame.normal.clone().multiplyScalar(cosPhi * endRadius)
        .add(endFrame.binormal.clone().multiplyScalar(sinPhi * endRadius));
      const vertex = points[lastIdx].clone().add(offset);
      positions.push(vertex.x, vertex.y, vertex.z);
      normals.push(tangents[lastIdx].x, tangents[lastIdx].y, tangents[lastIdx].z);
      uvs.push(1, j / radialSegments);
    }
    for (let j = 0; j < radialSegments; j++) {
      indices.push(endCenterIdx, endCenterIdx + 1 + ((j + 1) % radialSegments), endCenterIdx + 1 + j);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

// ── Tapering Radius Functions ──

/**
 * Linear taper: radius decreases linearly from start to end.
 * @param baseRadius Radius at t=0.
 * @param endRatio Radius at t=1 as a fraction of baseRadius.
 */
export function linearTaper(baseRadius: number, endRatio: number = 0.3): RadiusFunction {
  return (t) => baseRadius * (1.0 - (1.0 - endRatio) * t);
}

/**
 * Bulging taper: radius swells in the middle.
 * @param baseRadius Base radius.
 * @param bulgeFactor How much the middle bulges (0 = no bulge, 1 = double).
 */
export function bulgeTaper(baseRadius: number, bulgeFactor: number = 0.5): RadiusFunction {
  return (t) => baseRadius * (1.0 + bulgeFactor * Math.sin(t * Math.PI));
}

/**
 * Organic taper with noise perturbation for natural-looking tubes.
 * @param baseRadius Base radius.
 * @param endRatio End radius ratio.
 * @param noiseAmplitude Radius noise amplitude.
 * @param noiseFrequency Noise frequency.
 */
export function organicTaper(
  baseRadius: number,
  endRatio: number = 0.3,
  noiseAmplitude: number = 0.05,
  noiseFrequency: number = 4.0,
): RadiusFunction {
  return (t, phi) => {
    const taper = 1.0 - (1.0 - endRatio) * t;
    const noise = Math.sin(t * noiseFrequency * Math.PI * 2 + phi * 3) * noiseAmplitude;
    return baseRadius * (taper + noise);
  };
}

/**
 * Pulsating radius for animated organic tubes (e.g., pumping arteries).
 * @param baseRadius Base radius.
 * @param pulseAmplitude Pulse amplitude.
 * @param pulseFrequency Pulses per unit length.
 * @param time Current animation time.
 */
export function pulsatingRadius(
  baseRadius: number,
  pulseAmplitude: number,
  pulseFrequency: number,
  time: number,
): RadiusFunction {
  return (t) => baseRadius * (1.0 + pulseAmplitude * Math.sin(t * pulseFrequency * Math.PI * 2 + time));
}

// ── Branching Tube Network ──

/**
 * Branch point definition for a branching tube network.
 */
export interface TubeBranch {
  /** Parameter t [0,1] along the parent tube where the branch starts. */
  branchPoint: number;
  /** Angle around the parent tube circumference. */
  branchAngle: number;
  /** Direction of the branch relative to the parent tangent. */
  branchDirection: THREE.Vector3;
  /** Branch length. */
  length: number;
  /** Branch radius (as fraction of parent radius at branch point). */
  radiusRatio: number;
  /** Number of segments for the branch. */
  segments: number;
}

/**
 * Build a branching tube network with Murray's Law radius scaling.
 *
 * Murray's Law: r_parent³ = r_child₁³ + r_child₂³
 * (vascular branching — see ORGAN_SYSTEMS.md §3.1)
 *
 * @param mainControlPoints Control points for the main tube.
 * @param branches Array of branch definitions.
 * @param options Tube generation options.
 * @returns Array of geometries: [mainTube, branch1, branch2, ...]
 */
export function buildBranchingTubeNetwork(
  mainControlPoints: THREE.Vector3[],
  branches: TubeBranch[],
  options: {
    tubularSegments?: number;
    radialSegments?: number;
    radius?: number;
    taper?: number;
  } = {},
): THREE.BufferGeometry[] {
  const geometries: THREE.BufferGeometry[] = [];

  // Main tube
  const mainGeo = buildOrganicTube(mainControlPoints, {
    tubularSegments: options.tubularSegments ?? 64,
    radialSegments: options.radialSegments ?? 16,
    radius: options.radius ?? 0.3,
    taper: options.taper ?? 1.0,
  });
  geometries.push(mainGeo);

  // Build branches
  const curve = new THREE.CatmullRomCurve3(mainControlPoints, false, 'centripetal');

  for (const branch of branches) {
    const parentPoint = curve.getPoint(branch.branchPoint);
    const parentTangent = curve.getTangent(branch.branchPoint).normalize();
    const parentRadius = (options.radius ?? 0.3) * (1.0 - (1.0 - (options.taper ?? 1.0)) * branch.branchPoint);
    const branchRadius = parentRadius * branch.radiusRatio;

    // Compute branch control points
    const branchStart = parentPoint.clone();
    const branchDir = branch.branchDirection.clone().normalize();
    const branchControlPoints: THREE.Vector3[] = [branchStart];

    // Add intermediate points along the branch direction with some curvature
    const numCtrlPts = 4;
    for (let i = 1; i <= numCtrlPts; i++) {
      const t = i / numCtrlPts;
      const dist = branch.length * t;
      // Add some organic curvature
      const curveOffset = Math.sin(t * Math.PI) * 0.3 * branch.length;
      const perpDir = new THREE.Vector3().crossVectors(branchDir, parentTangent).normalize();
      const point = branchStart.clone()
        .add(branchDir.clone().multiplyScalar(dist))
        .add(perpDir.clone().multiplyScalar(curveOffset * (branch.branchAngle > Math.PI ? 1 : -1)));
      branchControlPoints.push(point);
    }

    const branchGeo = buildOrganicTube(branchControlPoints, {
      tubularSegments: branch.segments,
      radialSegments: options.radialSegments ?? 16,
      radius: branchRadius,
      taper: 0.5,
    });
    geometries.push(branchGeo);
  }

  return geometries;
}

// ── Tentacle Generation ──

/**
 * Build a tentacle mesh: a tapered, curling tube with organic noise.
 *
 * Tentacles combine:
 *   - Catmull-Rom spline path with curl
 *   - Bishop frame for twist-free orientation
 *   - Tapered radius (thick at base, thin at tip)
 *   - Optional noise displacement for organic surface detail
 *
 * @param basePosition Root position of the tentacle.
 * @param direction Initial growth direction.
 * @param length Tentacle length.
 * @param baseRadius Radius at the base.
 * @param options Generation options.
 */
export function buildTentacle(
  basePosition: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  baseRadius: number,
  options: {
    segments?: number;
    radialSegments?: number;
    curlAmount?: number;
    curlFrequency?: number;
    taperEnd?: number;
    noiseAmplitude?: number;
  } = {},
): THREE.BufferGeometry {
  const segments = options.segments ?? 48;
  const radialSegments = options.radialSegments ?? 12;
  const curlAmount = options.curlAmount ?? 0.5;
  const curlFrequency = options.curlFrequency ?? 2.0;
  const taperEnd = options.taperEnd ?? 0.1;
  const noiseAmplitude = options.noiseAmplitude ?? 0.02;

  // Generate control points with curl
  const dir = direction.clone().normalize();
  const perp = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  if (perp.lengthSq() < 0.01) perp.set(1, 0, 0);
  const perp2 = new THREE.Vector3().crossVectors(dir, perp).normalize();

  const controlPoints: THREE.Vector3[] = [];
  const numCtrlPts = 5;
  for (let i = 0; i < numCtrlPts; i++) {
    const t = i / (numCtrlPts - 1);
    const dist = length * t;
    const curl = Math.sin(t * Math.PI * curlFrequency) * curlAmount * dist * 0.3;
    const curl2 = Math.cos(t * Math.PI * curlFrequency * 0.7) * curlAmount * dist * 0.2;
    const point = basePosition.clone()
      .add(dir.clone().multiplyScalar(dist))
      .add(perp.clone().multiplyScalar(curl))
      .add(perp2.clone().multiplyScalar(curl2));
    controlPoints.push(point);
  }

  return buildOrganicTube(controlPoints, {
    tubularSegments: segments,
    radialSegments,
    radiusFunction: (t, phi) => {
      const taper = baseRadius * (1.0 - (1.0 - taperEnd) * t);
      const noise = Math.sin(t * 20 + phi * 5) * noiseAmplitude * taper;
      return taper + noise;
    },
    capped: false,
  });
}
