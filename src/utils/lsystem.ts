/**
 * L-Systems & Space Colonization Module
 *
 * Implements parametric L-systems and the space colonization algorithm
 * for branching structures, as recommended in
 * docs/research/PROCEDURAL_MESH_GENERATION_RESEARCH.md §2.5 and §4.1.
 *
 * L-systems are used for:
 *   - Arterial branching networks (with Murray's Law radius scaling)
 *   - Rib spur branching
 *   - Neural pathway trees
 *   - Coral-like protrusions
 *
 * Space colonization is used for:
 *   - Vascular networks that fill space (veins, capillaries)
 *   - Root-like structures
 *   - Space-filling branching patterns
 *
 * References:
 *   - Prusinkiewicz & Lindenmayer: "The Algorithmic Beauty of Plants" (1990)
 *   - Runions et al.: "Modeling and visualization of leaf venation" (2005)
 *   - Runions et al.: "Trees and space colonization" (2007)
 */

import * as THREE from 'three';

// ── L-System Module ──

/**
 * A single symbol in an L-system string, optionally with parameters.
 */
export interface LSymbol {
  /** The symbol character (e.g., 'F', '+', '-', '[', ']'). */
  char: string;
  /** Optional numerical parameters. */
  params?: number[];
}

/**
 * An L-system production rule with optional stochastic weighting and guard.
 */
export interface LRule {
  /** The predecessor symbol to match. */
  predecessor: string;
  /** The successor symbols to replace with. */
  successor: LSymbol[];
  /** Probability weight (for stochastic L-systems). Default 1.0. */
  weight?: number;
  /** Optional guard condition on parameters. */
  guard?: (params: number[]) => boolean;
}

/**
 * Parse an L-system string into symbols.
 * Format: "F(1.5)+F(2.0)[+F(1.0)]-F(1.0)"
 */
export function parseLString(str: string): LSymbol[] {
  const symbols: LSymbol[] = [];
  let i = 0;
  while (i < str.length) {
    const char = str[i];
    if (char === ' ' || char === '\t') { i++; continue; }
    i++;
    // Check for parameters
    let params: number[] | undefined;
    if (i < str.length && str[i] === '(') {
      i++; // skip '('
      const paramStr = str.slice(i).split(')')[0];
      params = paramStr.split(',').map(s => parseFloat(s.trim()));
      i += paramStr.length + 1; // skip params + ')'
    }
    symbols.push({ char, params });
  }
  return symbols;
}

/**
 * Convert L-symbols back to string representation.
 */
export function lSymbolsToString(symbols: LSymbol[]): string {
  return symbols.map(s => {
    if (s.params && s.params.length > 0) {
      return `${s.char}(${s.params.join(',')})`;
    }
    return s.char;
  }).join('');
}

/**
 * Apply one iteration of L-system rewriting.
 *
 * @param current Current symbol string.
 * @param rules Array of production rules.
 * @param rng Optional random number generator for stochastic rules.
 * @returns Rewritten symbol string.
 */
export function iterateLSystem(
  current: LSymbol[],
  rules: LRule[],
  rng?: () => number,
): LSymbol[] {
  const result: LSymbol[] = [];
  for (const sym of current) {
    // Find matching rules
    const matching = rules.filter(r =>
      r.predecessor === sym.char &&
      (!r.guard || (sym.params && r.guard(sym.params)))
    );
    if (matching.length === 0) {
      // No rule — keep symbol as-is
      result.push(sym);
      continue;
    }
    // Select rule (stochastic if multiple)
    let selected: LRule;
    if (matching.length === 1) {
      selected = matching[0];
    } else {
      const totalWeight = matching.reduce((sum, r) => sum + (r.weight ?? 1.0), 0);
      let r = (rng ? rng() : Math.random()) * totalWeight;
      selected = matching[0];
      for (const rule of matching) {
        r -= (rule.weight ?? 1.0);
        if (r <= 0) { selected = rule; break; }
      }
    }
    // Apply successor, substituting parameters from predecessor
    for (const succ of selected.successor) {
      result.push({
        char: succ.char,
        params: succ.params ?? sym.params,
      });
    }
  }
  return result;
}

/**
 * Generate an L-system string by applying n iterations.
 */
export function generateLSystem(
  axiom: string,
  rules: LRule[],
  iterations: number,
  rng?: () => number,
): LSymbol[] {
  let current = parseLString(axiom);
  for (let i = 0; i < iterations; i++) {
    current = iterateLSystem(current, rules, rng);
  }
  return current;
}

// ── Turtle Graphics Interpreter ──

/**
 * Turtle state for interpreting L-system strings as 3D geometry.
 */
export interface TurtleState {
  position: THREE.Vector3;
  heading: THREE.Vector3;    // Forward direction
  left: THREE.Vector3;       // Left direction
  up: THREE.Vector3;         // Up direction
  radius: number;            // Current branch radius
}

/**
 * A segment produced by the turtle interpreter.
 */
export interface TurtleSegment {
  start: THREE.Vector3;
  end: THREE.Vector3;
  startRadius: number;
  endRadius: number;
  depth: number;
}

/**
 * Interpret an L-system symbol string as 3D line segments using turtle graphics.
 *
 * Standard commands:
 *   F(d) — Move forward by d, draw segment
 *   f(d) — Move forward by d, no segment
 *   +    — Turn right by angle
 *   -    — Turn left by angle
 *   &    — Pitch down by angle
 *   ^    — Pitch up by angle
 *   \    — Roll left by angle
 *   /    — Roll right by angle
 *   [    — Push state (start branch)
 *   ]    — Pop state (end branch)
 *   !    — Shrink radius
 *   "    — Shrink segment length
 *
 * @param symbols L-system symbol string.
 * @param options Turtle parameters.
 * @returns Array of line segments.
 */
export function interpretLSystem3D(
  symbols: LSymbol[],
  options: {
    /** Initial position. */
    startPosition?: THREE.Vector3;
    /** Initial heading direction. */
    startHeading?: THREE.Vector3;
    /** Turn angle in radians. */
    angle?: number;
    /** Default step length. */
    stepLength?: number;
    /** Initial branch radius. */
    initialRadius?: number;
    /** Radius shrink factor per branch level. */
    radiusShrink?: number;
    /** Length shrink factor per branch level. */
    lengthShrink?: number;
  } = {},
): TurtleSegment[] {
  const angle = options.angle ?? 25 * Math.PI / 180;
  const stepLength = options.stepLength ?? 1.0;
  const initialRadius = options.initialRadius ?? 0.3;
  const radiusShrink = options.radiusShrink ?? 0.7;
  const lengthShrink = options.lengthShrink ?? 0.8;

  const stack: TurtleState[] = [];
  const segments: TurtleSegment[] = [];
  let depth = 0;

  const state: TurtleState = {
    position: options.startPosition?.clone() ?? new THREE.Vector3(0, 0, 0),
    heading: options.startHeading?.clone().normalize() ?? new THREE.Vector3(0, 1, 0),
    left: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 0, 1),
    radius: initialRadius,
  };

  // Ensure orthogonal frame
  state.left.crossVectors(state.up, state.heading).normalize();
  state.up.crossVectors(state.heading, state.left).normalize();

  let currentLength = stepLength;

  for (const sym of symbols) {
    switch (sym.char) {
      case 'F':
      case 'G': {
        const len = sym.params?.[0] ?? currentLength;
        const endPos = state.position.clone().add(
          state.heading.clone().multiplyScalar(len)
        );
        segments.push({
          start: state.position.clone(),
          end: endPos,
          startRadius: state.radius,
          endRadius: state.radius * radiusShrink,
          depth,
        });
        state.position = endPos;
        break;
      }
      case 'f':
      case 'g': {
        const len = sym.params?.[0] ?? currentLength;
        state.position.add(state.heading.clone().multiplyScalar(len));
        break;
      }
      case '+': {
        const a = sym.params?.[0] ?? angle;
        // Rotate around up axis (turn right)
        state.heading.applyAxisAngle(state.up, -a);
        state.left.applyAxisAngle(state.up, -a);
        break;
      }
      case '-': {
        const a = sym.params?.[0] ?? angle;
        // Rotate around up axis (turn left)
        state.heading.applyAxisAngle(state.up, a);
        state.left.applyAxisAngle(state.up, a);
        break;
      }
      case '&': {
        const a = sym.params?.[0] ?? angle;
        // Rotate around left axis (pitch down)
        state.heading.applyAxisAngle(state.left, -a);
        state.up.applyAxisAngle(state.left, -a);
        break;
      }
      case '^': {
        const a = sym.params?.[0] ?? angle;
        // Rotate around left axis (pitch up)
        state.heading.applyAxisAngle(state.left, a);
        state.up.applyAxisAngle(state.left, a);
        break;
      }
      case '\\': {
        const a = sym.params?.[0] ?? angle;
        // Rotate around heading axis (roll left)
        state.left.applyAxisAngle(state.heading, a);
        state.up.applyAxisAngle(state.heading, a);
        break;
      }
      case '/': {
        const a = sym.params?.[0] ?? angle;
        // Rotate around heading axis (roll right)
        state.left.applyAxisAngle(state.heading, -a);
        state.up.applyAxisAngle(state.heading, -a);
        break;
      }
      case '[': {
        stack.push({
          position: state.position.clone(),
          heading: state.heading.clone(),
          left: state.left.clone(),
          up: state.up.clone(),
          radius: state.radius,
        });
        depth++;
        state.radius *= radiusShrink;
        currentLength *= lengthShrink;
        break;
      }
      case ']': {
        const prev = stack.pop();
        if (prev) {
          state.position = prev.position;
          state.heading = prev.heading;
          state.left = prev.left;
          state.up = prev.up;
          state.radius = prev.radius;
        }
        depth = Math.max(0, depth - 1);
        currentLength = stepLength * Math.pow(lengthShrink, depth);
        break;
      }
      case '!': {
        state.radius *= radiusShrink;
        break;
      }
      case '"': {
        currentLength *= lengthShrink;
        break;
      }
    }
  }

  return segments;
}

/**
 * Convert turtle segments to a set of tube geometries.
 * Each segment becomes a tapered tube.
 */
export function segmentsToTubeGeometries(
  segments: TurtleSegment[],
  radialSegments: number = 8,
): THREE.BufferGeometry[] {
  const geometries: THREE.BufferGeometry[] = [];
  for (const seg of segments) {
    const direction = new THREE.Vector3().subVectors(seg.end, seg.start);
    const length = direction.length();
    if (length < 0.001) continue;

    // Build a simple tapered cylinder for each segment
    const ctrlPts = [seg.start, seg.start.clone().lerp(seg.end, 0.33),
                     seg.start.clone().lerp(seg.end, 0.66), seg.end];
    // Use the tube geometry module's buildOrganicTube
    // We inline a simpler version here to avoid circular imports
    const positions: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];

    const dir = direction.normalize();
    let ref = new THREE.Vector3(1, 0, 0);
    if (Math.abs(dir.dot(ref)) > 0.9) ref = new THREE.Vector3(0, 1, 0);
    const normal = new THREE.Vector3().crossVectors(dir, ref).normalize();
    const binormal = new THREE.Vector3().crossVectors(dir, normal).normalize();

    const tubularSegments = Math.max(2, Math.floor(length * 8));
    for (let i = 0; i <= tubularSegments; i++) {
      const t = i / tubularSegments;
      const center = seg.start.clone().lerp(seg.end, t);
      const r = THREE.MathUtils.lerp(seg.startRadius, seg.endRadius, t);
      for (let j = 0; j <= radialSegments; j++) {
        const phi = (j / radialSegments) * Math.PI * 2;
        const cosP = Math.cos(phi);
        const sinP = Math.sin(phi);
        const offset = normal.clone().multiplyScalar(cosP * r)
          .add(binormal.clone().multiplyScalar(sinP * r));
        positions.push(center.x + offset.x, center.y + offset.y, center.z + offset.z);
        normals.push(cosP * normal.x + sinP * binormal.x,
                     cosP * normal.y + sinP * binormal.y,
                     cosP * normal.z + sinP * binormal.z);
      }
    }
    for (let i = 0; i < tubularSegments; i++) {
      for (let j = 0; j < radialSegments; j++) {
        const a = i * (radialSegments + 1) + j;
        const b = (i + 1) * (radialSegments + 1) + j;
        const c = (i + 1) * (radialSegments + 1) + (j + 1);
        const d = i * (radialSegments + 1) + (j + 1);
        indices.push(a, b, d, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setIndex(indices);
    geometries.push(geo);
  }
  return geometries;
}

// ── Space Colonization Algorithm ──

/**
 * A node in the space colonization branching structure.
 */
export interface ColonizationNode {
  position: THREE.Vector3;
  parent: ColonizationNode | null;
  children: ColonizationNode[];
  radius: number;
  depth: number;
}

/**
 * An attraction point that guides branch growth.
 */
export interface AttractionPoint {
  position: THREE.Vector3;
  active: boolean;
  closestNode: ColonizationNode | null;
}

/**
 * Generate a branching structure using the space colonization algorithm.
 *
 * The algorithm grows branches iteratively toward attraction points,
 * producing organic, space-filling branching patterns ideal for
 * vascular networks and coral-like structures.
 *
 * Algorithm (Runions et al. 2007):
 *   1. Place attraction points in the space to be filled.
 *   2. For each attraction point, find the closest node within influence radius.
 *   3. Compute a growth direction from each node toward its associated attraction points.
 *   4. Extend nodes in the computed direction.
 *   5. Remove attraction points that are within kill distance of any node.
 *   6. Repeat until no attraction points remain active.
 *
 * @param rootPosition Starting position of the branching structure.
 * @param attractionPoints Array of attraction point positions.
 * @param options Algorithm parameters.
 * @returns Root node of the generated branching tree.
 */
export function colonizeSpace(
  rootPosition: THREE.Vector3,
  attractionPointPositions: THREE.Vector3[],
  options: {
    /** Radius of influence — nodes only respond to points within this distance. */
    influenceRadius?: number;
    /** Kill distance — points within this distance of a node are removed. */
    killDistance?: number;
    /** Segment length for each growth step. */
    segmentLength?: number;
    /** Maximum iterations. */
    maxIterations?: number;
    /** Initial branch radius. */
    initialRadius?: number;
    /** Radius scaling with depth (Murray's Law: r_parent³ = Σ r_child³). */
    murrayExponent?: number;
  } = {},
): ColonizationNode {
  const influenceRadius = options.influenceRadius ?? 2.0;
  const killDistance = options.killDistance ?? 0.5;
  const segmentLength = options.segmentLength ?? 0.3;
  const maxIterations = options.maxIterations ?? 100;
  const initialRadius = options.initialRadius ?? 0.2;
  const murrayExponent = options.murrayExponent ?? 3.0; // Murray's Law

  // Initialize root node
  const root: ColonizationNode = {
    position: rootPosition.clone(),
    parent: null,
    children: [],
    radius: initialRadius,
    depth: 0,
  };

  // Initialize attraction points
  const points: AttractionPoint[] = attractionPointPositions.map(pos => ({
    position: pos.clone(),
    active: true,
    closestNode: null,
  }));

  const allNodes: ColonizationNode[] = [root];

  for (let iter = 0; iter < maxIterations && points.some(p => p.active); iter++) {
    // Step 1: For each active attraction point, find closest node
    for (const point of points) {
      if (!point.active) continue;
      point.closestNode = null;
      let minDist = influenceRadius;
      for (const node of allNodes) {
        const dist = point.position.distanceTo(node.position);
        if (dist < minDist) {
          minDist = dist;
          point.closestNode = node;
        }
      }
    }

    // Step 2: Compute growth direction for each node
    const nodeDirections = new Map<ColonizationNode, THREE.Vector3>();
    for (const point of points) {
      if (!point.active || !point.closestNode) continue;
      const dir = new THREE.Vector3().subVectors(point.position, point.closestNode.position).normalize();
      const existing = nodeDirections.get(point.closestNode);
      if (existing) {
        existing.add(dir);
      } else {
        nodeDirections.set(point.closestNode, dir.clone());
      }
    }

    // Step 3: Extend nodes
    const newNodes: ColonizationNode[] = [];
    for (const [node, direction] of nodeDirections) {
      direction.normalize();
      const newPos = node.position.clone().add(direction.multiplyScalar(segmentLength));
      const child: ColonizationNode = {
        position: newPos,
        parent: node,
        children: [],
        radius: initialRadius * Math.pow(0.7, node.depth + 1),
        depth: node.depth + 1,
      };
      node.children.push(child);
      newNodes.push(child);
    }
    allNodes.push(...newNodes);

    // Step 4: Kill attraction points that are within kill distance
    for (const point of points) {
      if (!point.active) continue;
      for (const node of allNodes) {
        if (point.position.distanceTo(node.position) < killDistance) {
          point.active = false;
          break;
        }
      }
    }
  }

  // Step 5: Compute radii using Murray's Law (bottom-up)
  function computeMurrayRadius(node: ColonizationNode): number {
    if (node.children.length === 0) {
      return node.radius;
    }
    let childRadiusSum = 0;
    for (const child of node.children) {
      const childR = computeMurrayRadius(child);
      childRadiusSum += Math.pow(childR, murrayExponent);
    }
    node.radius = Math.pow(childRadiusSum, 1.0 / murrayExponent);
    return node.radius;
  }
  computeMurrayRadius(root);

  return root;
}

/**
 * Convert a colonization tree to turtle segments for mesh generation.
 */
export function colonizationToSegments(root: ColonizationNode): TurtleSegment[] {
  const segments: TurtleSegment[] = [];
  function traverse(node: ColonizationNode) {
    for (const child of node.children) {
      segments.push({
        start: node.position.clone(),
        end: child.position.clone(),
        startRadius: node.radius,
        endRadius: child.radius,
        depth: node.depth,
      });
      traverse(child);
    }
  }
  traverse(root);
  return segments;
}

/**
 * Generate a vascular network using space colonization.
 *
 * @param rootPosition Starting position (e.g., heart).
 * @param targetVolume Bounding box of the volume to fill with vessels.
 * @param options Parameters.
 * @returns Root node of the vascular tree.
 */
export function generateVascularNetwork(
  rootPosition: THREE.Vector3,
  targetVolume: THREE.Box3,
  options: {
    pointCount?: number;
    influenceRadius?: number;
    killDistance?: number;
    segmentLength?: number;
    seed?: number;
  } = {},
): ColonizationNode {
  const pointCount = options.pointCount ?? 200;
  const seed = options.seed ?? 42;

  // Seeded PRNG
  let s = seed;
  const next = () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) / 4294967296);
  };

  // Generate attraction points within the target volume
  const attractionPoints: THREE.Vector3[] = [];
  const size = new THREE.Vector3();
  targetVolume.getSize(size);
  for (let i = 0; i < pointCount; i++) {
    attractionPoints.push(new THREE.Vector3(
      targetVolume.min.x + next() * size.x,
      targetVolume.min.y + next() * size.y,
      targetVolume.min.z + next() * size.z,
    ));
  }

  return colonizeSpace(rootPosition, attractionPoints, {
    influenceRadius: options.influenceRadius ?? size.length() * 0.15,
    killDistance: options.killDistance ?? size.length() * 0.03,
    segmentLength: options.segmentLength ?? size.length() * 0.02,
    maxIterations: 200,
  });
}
