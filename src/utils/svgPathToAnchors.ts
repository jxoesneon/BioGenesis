/**
 * SVG Path to Anchor Points Converter
 *
 * Parses SVG path data (the `d` attribute) and samples it into a set of 2D
 * anchor points suitable for use as hull outline parts in the engineering view.
 *
 * Used by the outline catalog to convert pre-made SVG silhouettes from
 * game-icons.net (CC-BY-3.0) into editable hull anchor arrays.
 *
 * Coordinate mapping:
 *   SVG x → world wx (right = starboard)
 *   SVG y → world wz (down = aft)
 * Both SVG y and world wz point downward, so the mapping is direct.
 */

interface Point {
  x: number;
  y: number;
}

interface Subpath {
  points: Point[];
  closed: boolean;
}

// ── Tokenizer ──────────────────────────────────────────────────────────────

/**
 * Tokenize an SVG path string into a sequence of command letters and numbers.
 */
function tokenizePath(d: string): (string | number)[] {
  const tokens: (string | number)[] = [];
  const regex = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(d)) !== null) {
    if (match[1] !== undefined) {
      tokens.push(match[1]);
    } else if (match[2] !== undefined) {
      tokens.push(parseFloat(match[2]));
    }
  }
  return tokens;
}

// ── Parser ──────────────────────────────────────────────────────────────────

/**
 * Parse an SVG path string into subpaths with sampled points.
 *
 * Each cubic/quadratic bezier segment is sampled at `samplesPerSegment`
 * evenly-spaced parameter values. Arcs are approximated via endpoint
 * parameterization (sampled along the chord — sufficient for silhouette use).
 */
function parseSvgPath(d: string, samplesPerSegment: number = 10): Subpath[] {
  const tokens = tokenizePath(d);
  const subpaths: Subpath[] = [];

  let i = 0;
  let currentPt: Point = { x: 0, y: 0 };
  let startPt: Point = { x: 0, y: 0 };
  let currentSubpath: Point[] = [];
  let lastControl: Point | null = null; // for S/s, T/t smooth commands
  let lastCommand = '';

  function flushSubpath(closed: boolean) {
    if (currentSubpath.length > 1) {
      subpaths.push({ points: currentSubpath, closed });
    }
    currentSubpath = [];
  }

  function pushSampledCubic(p0: Point, p1: Point, p2: Point, p3: Point) {
    for (let s = 1; s <= samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      const mt = 1 - t;
      currentSubpath.push({
        x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
        y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
      });
    }
  }

  function pushSampledQuadratic(p0: Point, p1: Point, p2: Point) {
    for (let s = 1; s <= samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      const mt = 1 - t;
      currentSubpath.push({
        x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
        y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
      });
    }
  }

  while (i < tokens.length) {
    let cmd: string;
    if (typeof tokens[i] === 'string') {
      cmd = tokens[i] as string;
      i++;
    } else {
      // Implicit repeat of last command (M → L, others stay same)
      cmd = lastCommand === 'M' ? 'L' : lastCommand === 'm' ? 'l' : lastCommand;
    }
    lastCommand = cmd;
    const isUpper = cmd === cmd.toUpperCase();
    const up = cmd.toUpperCase();

    switch (up) {
      case 'M': {
        const x = tokens[i++] as number;
        const y = tokens[i++] as number;
        currentPt = isUpper ? { x, y } : { x: currentPt.x + x, y: currentPt.y + y };
        flushSubpath(false);
        currentSubpath = [{ ...currentPt }];
        startPt = { ...currentPt };
        break;
      }
      case 'L': {
        const x = tokens[i++] as number;
        const y = tokens[i++] as number;
        currentPt = isUpper ? { x, y } : { x: currentPt.x + x, y: currentPt.y + y };
        currentSubpath.push({ ...currentPt });
        lastControl = null;
        break;
      }
      case 'H': {
        const x = tokens[i++] as number;
        currentPt = isUpper ? { x, y: currentPt.y } : { x: currentPt.x + x, y: currentPt.y };
        currentSubpath.push({ ...currentPt });
        lastControl = null;
        break;
      }
      case 'V': {
        const y = tokens[i++] as number;
        currentPt = isUpper ? { x: currentPt.x, y } : { x: currentPt.x, y: currentPt.y + y };
        currentSubpath.push({ ...currentPt });
        lastControl = null;
        break;
      }
      case 'C': {
        const x1 = tokens[i++] as number;
        const y1 = tokens[i++] as number;
        const x2 = tokens[i++] as number;
        const y2 = tokens[i++] as number;
        const x = tokens[i++] as number;
        const y = tokens[i++] as number;
        const p0 = { ...currentPt };
        const p1 = isUpper ? { x: x1, y: y1 } : { x: currentPt.x + x1, y: currentPt.y + y1 };
        const p2 = isUpper ? { x: x2, y: y2 } : { x: currentPt.x + x2, y: currentPt.y + y2 };
        const p3 = isUpper ? { x, y } : { x: currentPt.x + x, y: currentPt.y + y };
        pushSampledCubic(p0, p1, p2, p3);
        currentPt = p3;
        lastControl = p2;
        break;
      }
      case 'S': {
        const x2 = tokens[i++] as number;
        const y2 = tokens[i++] as number;
        const x = tokens[i++] as number;
        const y = tokens[i++] as number;
        const p0 = { ...currentPt };
        const p1 = lastControl
          ? { x: 2 * p0.x - lastControl.x, y: 2 * p0.y - lastControl.y }
          : { ...p0 };
        const p2 = isUpper ? { x: x2, y: y2 } : { x: currentPt.x + x2, y: currentPt.y + y2 };
        const p3 = isUpper ? { x, y } : { x: currentPt.x + x, y: currentPt.y + y };
        pushSampledCubic(p0, p1, p2, p3);
        currentPt = p3;
        lastControl = p2;
        break;
      }
      case 'Q': {
        const x1 = tokens[i++] as number;
        const y1 = tokens[i++] as number;
        const x = tokens[i++] as number;
        const y = tokens[i++] as number;
        const p0 = { ...currentPt };
        const p1 = isUpper ? { x: x1, y: y1 } : { x: currentPt.x + x1, y: currentPt.y + y1 };
        const p2 = isUpper ? { x, y } : { x: currentPt.x + x, y: currentPt.y + y };
        pushSampledQuadratic(p0, p1, p2);
        currentPt = p2;
        lastControl = p1;
        break;
      }
      case 'T': {
        const x = tokens[i++] as number;
        const y = tokens[i++] as number;
        const p0 = { ...currentPt };
        const p1 = lastControl
          ? { x: 2 * p0.x - lastControl.x, y: 2 * p0.y - lastControl.y }
          : { ...p0 };
        const p2 = isUpper ? { x, y } : { x: currentPt.x + x, y: currentPt.y + y };
        pushSampledQuadratic(p0, p1, p2);
        currentPt = p2;
        lastControl = p1;
        break;
      }
      case 'A': {
        // Arc: rx ry x-rot large-arc sweep x y
        // For silhouette use, approximate by sampling along the chord.
        tokens[i++]; // rx
        tokens[i++]; // ry
        tokens[i++]; // x-axis-rotation
        tokens[i++]; // large-arc-flag
        tokens[i++]; // sweep-flag
        const x = tokens[i++] as number;
        const y = tokens[i++] as number;
        const target = isUpper ? { x, y } : { x: currentPt.x + x, y: currentPt.y + y };
        for (let s = 1; s <= samplesPerSegment; s++) {
          const t = s / samplesPerSegment;
          currentSubpath.push({
            x: currentPt.x + (target.x - currentPt.x) * t,
            y: currentPt.y + (target.y - currentPt.y) * t,
          });
        }
        currentPt = target;
        lastControl = null;
        break;
      }
      case 'Z': {
        if (currentSubpath.length > 1) {
          const last = currentSubpath[currentSubpath.length - 1];
          if (Math.abs(last.x - startPt.x) > 0.01 || Math.abs(last.y - startPt.y) > 0.01) {
            currentSubpath.push({ ...startPt });
          }
          flushSubpath(true);
        }
        currentPt = { ...startPt };
        lastControl = null;
        break;
      }
      default:
        break;
    }
  }

  flushSubpath(false);
  return subpaths;
}

// ── Geometry helpers ────────────────────────────────────────────────────────

function getBBox(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Simplify a polyline by removing nearly-collinear points.
 * Uses a triangle-area tolerance test.
 */
function simplifyPoints(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;
  const result: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const next = points[i + 1];
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const cross = Math.abs(dx1 * dy2 - dy1 * dx2);
    const len1 = Math.hypot(dx1, dy1);
    const triArea = cross / 2;
    if (triArea > tolerance || len1 > tolerance * 3) {
      result.push(curr);
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

/**
 * Decimate a point array to at most `maxPoints` by even sampling.
 * Always preserves the first and last points.
 */
function decimatePoints(points: Point[], maxPoints: number): Point[] {
  if (points.length <= maxPoints) return points;
  const result: Point[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    result.push(points[Math.round(i * step)]);
  }
  return result;
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface SvgAnchor {
  wx: number;
  wz: number;
}

export interface SvgPathToAnchorsOptions {
  /** Largest dimension of the normalized shape in world meters. Default: 3.0 */
  targetSize?: number;
  /** Maximum number of anchor points. Default: 28 */
  maxPoints?: number;
  /** Bezier sampling resolution per segment. Default: 10 */
  samplesPerSegment?: number;
  /** Whether to pick the largest subpath only (true) or merge all. Default: true */
  largestSubpathOnly?: boolean;
}

/**
 * Convert an SVG path `d` string into a normalized array of anchor points
 * suitable for hull outline parts.
 *
 * The shape is centered at the origin (0, 0) in local space and scaled so
 * its largest dimension equals `targetSize`.
 *
 * Coordinate mapping: SVG x → wx, SVG y → wz (both point right/down).
 */
export function svgPathToAnchors(
  pathD: string,
  options: SvgPathToAnchorsOptions = {},
): SvgAnchor[] {
  const {
    targetSize = 3.0,
    maxPoints = 28,
    samplesPerSegment = 10,
    largestSubpathOnly = true,
  } = options;

  const subpaths = parseSvgPath(pathD, samplesPerSegment);
  if (subpaths.length === 0) return [];

  let selectedPoints: Point[];

  if (largestSubpathOnly) {
    let largest = subpaths[0];
    let largestArea = 0;
    for (const sp of subpaths) {
      const bb = getBBox(sp.points);
      const area = (bb.maxX - bb.minX) * (bb.maxY - bb.minY);
      if (area > largestArea) {
        largestArea = area;
        largest = sp;
      }
    }
    selectedPoints = largest.points;
  } else {
    selectedPoints = subpaths.flatMap((sp) => sp.points);
  }

  if (selectedPoints.length < 3) return [];

  const bb = getBBox(selectedPoints);
  const w = bb.maxX - bb.minX;
  const h = bb.maxY - bb.minY;
  if (w <= 0 || h <= 0) return [];

  const scale = targetSize / Math.max(w, h);
  const cx = (bb.minX + bb.maxX) / 2;
  const cy = (bb.minY + bb.maxY) / 2;

  let points = selectedPoints.map((p) => ({
    x: (p.x - cx) * scale,
    y: (p.y - cy) * scale,
  }));

  const tolerance = targetSize / 80;
  points = simplifyPoints(points, tolerance);
  points = decimatePoints(points, maxPoints);

  return points.map((p) => ({ wx: p.x, wz: p.y }));
}

/**
 * Compute the bounding box of the largest subpath in SVG coordinate space.
 * Returns the center and the normalization scale factor that maps the shape
 * to a given targetSize (matching svgPathToAnchors normalization).
 *
 * This is used to build canvas transforms for rendering raw SVG Path2D data
 * at the same position/scale as the sampled anchors.
 */
export function svgPathBBox(
  pathD: string,
  options: SvgPathToAnchorsOptions = {},
): { cx: number; cy: number; normScale: number; minX: number; minY: number; maxX: number; maxY: number } | null {
  const {
    targetSize = 3.0,
    samplesPerSegment = 10,
    largestSubpathOnly = true,
  } = options;

  const subpaths = parseSvgPath(pathD, samplesPerSegment);
  if (subpaths.length === 0) return null;

  let selectedPoints: Point[];
  if (largestSubpathOnly) {
    let largest = subpaths[0];
    let largestArea = 0;
    for (const sp of subpaths) {
      const bb = getBBox(sp.points);
      const area = (bb.maxX - bb.minX) * (bb.maxY - bb.minY);
      if (area > largestArea) {
        largestArea = area;
        largest = sp;
      }
    }
    selectedPoints = largest.points;
  } else {
    selectedPoints = subpaths.flatMap((sp) => sp.points);
  }

  if (selectedPoints.length < 3) return null;

  const bb = getBBox(selectedPoints);
  const w = bb.maxX - bb.minX;
  const h = bb.maxY - bb.minY;
  if (w <= 0 || h <= 0) return null;

  const normScale = targetSize / Math.max(w, h);
  const cx = (bb.minX + bb.maxX) / 2;
  const cy = (bb.minY + bb.maxY) / 2;

  return { cx, cy, normScale, minX: bb.minX, minY: bb.minY, maxX: bb.maxX, maxY: bb.maxY };
}

/**
 * Memoized version for use in module-level constant definitions.
 */
const cache = new Map<string, SvgAnchor[]>();

export function svgPathToAnchorsCached(
  pathD: string,
  options: SvgPathToAnchorsOptions = {},
): SvgAnchor[] {
  const key = pathD + JSON.stringify(options);
  let result = cache.get(key);
  if (!result) {
    result = svgPathToAnchors(pathD, options);
    cache.set(key, result);
  }
  return result;
}

// ── Path2D cache for high-fidelity canvas rendering ──
// Cache Path2D objects keyed by path data so we don't re-parse on every frame.
const path2dCache = new Map<string, Path2D>();

/**
 * Get (or create and cache) a Path2D object for the given SVG path data.
 * The Path2D can be filled/stroked directly on a canvas 2D context with
 * an appropriate transform applied.
 */
export function getPath2D(pathD: string): Path2D {
  let p2d = path2dCache.get(pathD);
  if (!p2d) {
    p2d = new Path2D(pathD);
    path2dCache.set(pathD, p2d);
  }
  return p2d;
}

// ── BBox cache ──
const bboxCache = new Map<string, ReturnType<typeof svgPathBBox>>();

/**
 * Memoized version of svgPathBBox for use in render loops.
 */
export function svgPathBBoxCached(
  pathD: string,
  options: SvgPathToAnchorsOptions = {},
): ReturnType<typeof svgPathBBox> {
  const key = pathD + JSON.stringify(options);
  let result = bboxCache.get(key);
  if (result === undefined) {
    result = svgPathBBox(pathD, options);
    bboxCache.set(key, result ?? null);
  }
  return result;
}
