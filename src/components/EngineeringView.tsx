import React, { useRef, useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Ruler, Grid3x3, Maximize2, Layers, Compass,
  MousePointer2, Plus, Spline, Eraser, Hand, Ruler as RulerIcon,
  Brain, Heart, Zap, Leaf, Shield, Wrench,
  ChevronDown, Eye, EyeOff, MoreHorizontal,
  FlipHorizontal, FlipVertical,
  Flame, Droplet, Activity, Wind, Bone, Container,
  CircleDot, Network, Eye as EyeIcon, Cog, Snowflake, Sprout,
  Home, DoorOpen, Columns, Boxes, Crosshair, Sparkles,
  PanelRightClose, PanelRightOpen, Split,
  PenTool, Spline as SplineIcon, Pencil, GitCommitVertical,
  Undo2, Redo2, Waves, Shapes, ClipboardCheck,
} from 'lucide-react';
import { AppState, SHIP_SECTIONS, OrganPipelineType } from '../types';
import { PIPELINE_COLORS, PIPELINE_NAMES } from '../utils/pipelineGraph';
import { svgPathToAnchorsCached, svgPathBBoxCached, getPath2D } from '../utils/svgPathToAnchors';
import { validateShipRequirements, ShipValidationResult, RequirementIssue, SEVERITY_META, CATEGORY_META } from '../utils/shipRequirements';

interface EngineeringViewProps {
  state: AppState;
  onUpdateState?: (updates: Partial<AppState>) => void;
}

// ── Edit tools ──
// Each tool has an icon, label (for tooltip), and optional pipeline association.
// Tools are grouped: navigation, creation, modification.

type ToolId =
  | 'select'      // Select / move existing organs
  | 'pan'         // Pan the canvas
  | 'measure'     // Measure distances
  | 'place-organ' // Place a new organ (uses active pipeline)
  | 'connect'     // Draw conduit connections between organs
  | 'erase'       // Delete organs or connections
  | 'section'     // Edit anatomical section boundaries
  | 'repair'      // Repair / heal damaged regions
  | 'hull-edit';  // Edit the hull outline (SVG vector)

// ── Hull outline data model ──
// The hull is a closed cubic bezier path in world coordinates.
// Each segment has two anchor points (start/end) and two control handles.
// The path is symmetric by default (port = starboard mirror).
// Anchors and handles are editable via drag in hull-edit mode.
interface HullAnchor {
  id: string;
  wx: number;  // world x (port-starboard, 0 = centerline)
  wz: number;  // world z (fore-aft, 0 = midship, negative = forward)
  role?: 'wall-fwd' | 'wall-aft' | 'tail' | 'peak' | 'window';
  locked?: boolean; // anchored/immovable points (only port-side: A, W1, W2, C)
  cornerRadius?: number; // Live Corner radius in world meters (0 = sharp)
  cornerType?: 'round' | 'smooth' | 'inverted' | 'chamfer'; // Live Corner style
  cornerRelative?: boolean; // true = relative rounding mode
}

interface HullHandle {
  id: string;
  wx: number;
  wz: number;
}

interface HullSegment {
  id: string;
  startAnchorId: string;
  endAnchorId: string;
  // Control handles for the cubic bezier (relative to start/end anchors in world coords)
  startHandleId: string;  // handle attached to start anchor
  endHandleId: string;    // handle attached to end anchor
}

interface HullOutline {
  anchors: HullAnchor[];
  handles: HullHandle[];
  segments: HullSegment[];
}

// ── Placed outline part instance ──
// When a silhouette from the outline drawer is placed on the canvas, it
// becomes an independent instance with its own transform (position, scale,
// rotation). The instance retains the local-space anchors from the catalog
// entry so it can be rendered and hit-tested after transformation.
interface PlacedPartInstance {
  id: string;
  partId: string;       // catalog entry id (for reference / re-rendering icon)
  name: string;
  // Raw SVG path data for high-fidelity canvas rendering
  pathD: string;
  // Local-space anchors (origin = shape center, untransformed) — used for hit-testing
  localAnchors: OutlinePartAnchor[];
  // Transform
  wx: number;           // world position (center of the part)
  wz: number;
  scale: number;        // uniform scale multiplier
  rotation: number;     // radians (0 = no rotation)
  // Metadata
  symmetric?: boolean;
  mirrorX?: boolean;    // if true, a mirrored copy was also placed
  mirrorZ?: boolean;
  color?: string;       // optional tint
}

// Transform handle drag modes for placed part instances
type PartDragMode = 'move' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se' | 'resize-n' | 'resize-s' | 'resize-w' | 'resize-e' | 'rotate';

// ── Engineering data model ──
// Organs placed by the user on the 2D canvas, stored in world coordinates
// (meters relative to ship center: x = lateral/port-starboard, z = fore-aft).
interface PlacedOrgan {
  id: string;
  pipeline: OrganPipelineType;
  name: string;
  nodeId: string;   // catalog nodeId (e.g. 'plasma_gland') — used for inner node rendering
  wx: number;      // world x (meters, port-starboard, 0 = centerline)
  wz: number;      // world z (meters, fore-aft, 0 = midship, negative = forward)
  radius: number;  // world-space radius (meters)
  health: number;  // 0..1 (1 = healthy, <1 = damaged)
  mirrorId?: string | null;  // id of the mirrored counterpart (null = no mirror)
  isMirror?: boolean;        // true if this organ was auto-created as a mirror
  isAutoConduit?: boolean;   // true if auto-created as a conduit between two organs
}

interface PlacedConnection {
  id: string;
  fromId: string;
  toId: string;
  fromPort?: string | null;  // port label on the source organ (e.g. "Plasma")
  toPort?: string | null;    // port label on the target organ (e.g. "Plasma")
  mirrorId?: string | null;  // id of the mirrored connection
}

interface MeasureState {
  startWX: number | null;
  startWZ: number | null;
  endWX: number | null;
  endWZ: number | null;
}

interface ToolDef {
  id: ToolId;
  label: string;
  icon: React.ReactNode;
  shortcut: string;
  group: 'navigate' | 'create' | 'modify';
}

// All tools in rail order (with group dividers between groups)
const ALL_TOOLS: ToolDef[] = [
  { id: 'select',      label: 'Select & Move',    icon: <MousePointer2 className="w-5 h-5" />, shortcut: 'V', group: 'navigate' },
  { id: 'pan',         label: 'Pan Canvas',       icon: <Hand className="w-5 h-5" />,          shortcut: 'H', group: 'navigate' },
  { id: 'measure',     label: 'Measure Distance', icon: <RulerIcon className="w-5 h-5" />,     shortcut: 'M', group: 'navigate' },
  { id: 'connect',     label: 'Connect Organs',   icon: <Spline className="w-5 h-5" />,        shortcut: 'C', group: 'create' },
  { id: 'hull-edit',   label: 'Edit Hull Outline', icon: <PenTool className="w-5 h-5" />,      shortcut: 'B', group: 'create' },
  { id: 'erase',       label: 'Erase',            icon: <Eraser className="w-5 h-5" />,        shortcut: 'E', group: 'modify' },
  { id: 'section',     label: 'Edit Sections',    icon: <Layers className="w-5 h-5" />,        shortcut: 'S', group: 'modify' },
  { id: 'repair',      label: 'Repair Tissue',    icon: <Wrench className="w-5 h-5" />,        shortcut: 'R', group: 'modify' },
];

// Pipeline-specific organ placement sub-tools
interface PipelineToolDef {
  id: OrganPipelineType;
  label: string;
  icon: React.ReactNode;
  color: string;
}

const PIPELINE_TOOLS: PipelineToolDef[] = [
  { id: 'BIO_PLASMA',    label: PIPELINE_NAMES.BIO_PLASMA,    icon: <Zap className="w-4 h-4" />,   color: '#ff6b35' },
  { id: 'HEMOLYMPH',     label: PIPELINE_NAMES.HEMOLYMPH,     icon: <Heart className="w-4 h-4" />, color: '#f43f5e' },
  { id: 'NERVOUS',       label: PIPELINE_NAMES.NERVOUS,       icon: <Brain className="w-4 h-4" />, color: '#a855f7' },
  { id: 'LIFE_SUPPORT',  label: PIPELINE_NAMES.LIFE_SUPPORT,  icon: <Leaf className="w-4 h-4" />,  color: '#10b981' },
  { id: 'ARMOR_DEFENSE', label: PIPELINE_NAMES.ARMOR_DEFENSE, icon: <Shield className="w-4 h-4" />, color: '#38bdf8' },
];

// ── Hull edit sub-modes ──
type HullEditMode = 'control-points' | 'edge-points' | 'freehand';

const HULL_EDIT_MODES: { id: HullEditMode; label: string; icon: React.ReactNode }[] = [
  { id: 'control-points', label: 'Control Points', icon: <GitCommitVertical className="w-4 h-4" /> },
  { id: 'edge-points',    label: 'Edge Points',    icon: <SplineIcon className="w-4 h-4" /> },
  { id: 'freehand',       label: 'Freehand Draw',  icon: <Pencil className="w-4 h-4" /> },
];

// ── Default hull outline ──
// The hull is defined in world coordinates (meters). The ship spans from
// -length/2 (nose) to +length/2 (tail) along Z, and ±thoraxWidth/2 along X.
//
// The nose section contains the command room. The port-side exterior wall has
// 4 locked (immovable) anchor points — the room dimensions are fixed:
//
//   A----B       (wall z-)
//   |    |
//   W1   |       (window z-)
//   |    |
//   W2   |       (window z+)
//   |    |
//   C----D       (wall z+)
//
// Only A, W1, W2, C are locked (port side). The starboard side (B, D, and
// starboard window edges) mirrors the port side when mirrorX is on. The
// centerline nose tip and back of nose are implicit curve points (no separate
// anchor — the front/back walls curve from port to starboard as single beziers).
//
// Anchor layout (11 anchors, clockwise from A):
//   a-port-wall-fwd   = A  (port corner at wall z-)              [LOCKED]
//   a-stbd-wall-fwd   = B  (stbd corner at wall z-)              [editable, mirror of A]
//   a-stbd-win-fwd       (stbd window z-)                        [editable, mirror of W1]
//   a-stbd-win-aft       (stbd window z+)                        [editable, mirror of W2]
//   a-stbd-wall-aft   = D  (stbd corner at wall z+)              [editable, mirror of C]
//   a-stbd-peak          (starboard peak at 30%)                 [editable]
//   a-tail               (tail, rear centerline)                 [editable]
//   a-port-peak          (port peak at 30%)                      [editable]
//   a-port-wall-aft   = C  (port corner at wall z+)              [LOCKED]
//   a-port-win-aft   = W2 (port window z+)                       [LOCKED]
//   a-port-win-fwd   = W1 (port window z-)                       [LOCKED]
//   (back to A)
//
// Segments (11 cubic beziers, closed loop):
//   A → B → stbd-win-fwd → stbd-win-aft → D → stbd-peak →
//   tail → port-peak → C → W2 → W1 → A
function createDefaultHull(shipLength: number, thoraxWidth: number): HullOutline {
  const halfLen = shipLength / 2;
  const halfWidth = thoraxWidth / 2;
  const peakZ = -halfLen + shipLength * 0.30; // peak girth at 30% from nose

  // ── Command room dimensions (fixed) ──
  const cranialU = 0.08;
  const roomCenterZ = -halfLen + cranialU * shipLength;
  const crewCount = shipLength <= 7 ? 1 : shipLength <= 12 ? 2 : shipLength <= 17 ? 3 : shipLength <= 25 ? 4 : 5;
  const STATION_FOOTPRINT = 2.0;
  const STATION_HEIGHT = 2.5;
  const FIXED_OVERHEAD = 15.0;
  const roomVolume = crewCount * STATION_FOOTPRINT * STATION_FOOTPRINT * STATION_HEIGHT + FIXED_OVERHEAD;
  const roomHeightM = STATION_HEIGHT + 0.5;
  const hullWidthAtRoom = thoraxWidth * 0.4;
  const maxRoomSide = hullWidthAtRoom * 0.9;
  const roomSideM = Math.min(Math.sqrt(roomVolume / roomHeightM), maxRoomSide);
  const roomHalfSide = roomSideM / 2;
  const wallThickness = Math.max(0.3, roomHalfSide * 0.15);

  // The 2 anchored Z positions (front wall and back wall of command room):
  const wallZfwd = roomCenterZ - roomHalfSide;
  const wallZaft = roomCenterZ + roomHalfSide;

  // Hull half-width at the nose section = room half-width (room fills hull)
  const noseHalfWidth = roomSideM / 2;
  // Window spans 60% of the nose width, centered on the centerline
  const windowHalfWidth = noseHalfWidth * 0.6;

  // Anchors (clockwise from A = port-wall-fwd)
  // Front wall: A → W1 → W2 → B (all at wall z-, same Y)
  // W1→W2 is the window opening; A→W1 and W2→B are solid wall sections
  const anchors: HullAnchor[] = [
    // A — port corner at wall z- (LOCKED, -x)
    { id: 'a-port-wall-fwd',  wx: -noseHalfWidth,  wz: wallZfwd,   role: 'wall-fwd',  locked: true },
    // W1 — port window edge at wall z- (LOCKED, -x, between A and center)
    { id: 'a-win-port',       wx: -windowHalfWidth, wz: wallZfwd,   role: 'window',    locked: true },
    // W2 — stbd window edge at wall z- (LOCKED, +x, between center and B)
    { id: 'a-win-stbd',       wx: windowHalfWidth,  wz: wallZfwd,   role: 'window',    locked: true },
    // B — stbd corner at wall z- (LOCKED, +x)
    { id: 'a-stbd-wall-fwd',  wx: noseHalfWidth,   wz: wallZfwd,   role: 'wall-fwd',  locked: true },
    // D — stbd corner at wall z+ (editable)
    { id: 'a-stbd-wall-aft',  wx: noseHalfWidth,   wz: wallZaft,   role: 'wall-aft' },
    // main hull
    { id: 'a-stbd-peak',      wx: halfWidth,       wz: peakZ,      role: 'peak' },
    { id: 'a-tail',           wx: 0,               wz: halfLen,    role: 'tail' },
    { id: 'a-port-peak',      wx: -halfWidth,      wz: peakZ,      role: 'peak' },
    // C — port corner at wall z+ (editable)
    { id: 'a-port-wall-aft',  wx: -noseHalfWidth,  wz: wallZaft,   role: 'wall-aft' },
  ];

  // Control handles
  const handles: HullHandle[] = [
    // A → W1: straight line (handles collinear on wallZfwd)
    { id: 'h-a-w1-s', wx: -noseHalfWidth * 0.7,  wz: wallZfwd },
    { id: 'h-a-w1-e', wx: -windowHalfWidth * 0.7, wz: wallZfwd },
    // W1 → W2: straight line (window opening)
    { id: 'h-w1-w2-s', wx: -windowHalfWidth * 0.5, wz: wallZfwd },
    { id: 'h-w1-w2-e', wx: windowHalfWidth * 0.5,  wz: wallZfwd },
    // W2 → B: straight line
    { id: 'h-w2-b-s', wx: windowHalfWidth * 0.7,  wz: wallZfwd },
    { id: 'h-w2-b-e', wx: noseHalfWidth * 0.7,   wz: wallZfwd },
    // B → stbd-peak: convex — goes straight down past room back wall, then out to peak
    { id: 'h-b-sp-s', wx: noseHalfWidth,  wz: wallZaft },
    { id: 'h-b-sp-e', wx: halfWidth * 0.85, wz: peakZ - shipLength * 0.06 },
    // stbd-peak → tail: taper
    { id: 'h-sp-tail-s', wx: halfWidth * 0.6,  wz: peakZ + shipLength * 0.15 },
    { id: 'h-sp-tail-e', wx: halfWidth * 0.08, wz: halfLen - shipLength * 0.05 },
    // tail → port-peak: taper mirror
    { id: 'h-tail-pp-s', wx: -halfWidth * 0.08, wz: halfLen - shipLength * 0.05 },
    { id: 'h-tail-pp-e', wx: -halfWidth * 0.6,  wz: peakZ + shipLength * 0.15 },
    // port-peak → A: convex — comes from peak, goes straight down to room back wall, then up to A
    { id: 'h-pp-a-s', wx: -halfWidth * 0.85,    wz: peakZ - shipLength * 0.06 },
    { id: 'h-pp-a-e', wx: -noseHalfWidth,       wz: wallZaft },
  ];

  const segments: HullSegment[] = [
    { id: 's-a-w1',    startAnchorId: 'a-port-wall-fwd',  endAnchorId: 'a-win-port',      startHandleId: 'h-a-w1-s',    endHandleId: 'h-a-w1-e' },
    { id: 's-w1-w2',   startAnchorId: 'a-win-port',       endAnchorId: 'a-win-stbd',      startHandleId: 'h-w1-w2-s',   endHandleId: 'h-w1-w2-e' },
    { id: 's-w2-b',    startAnchorId: 'a-win-stbd',       endAnchorId: 'a-stbd-wall-fwd',  startHandleId: 'h-w2-b-s',    endHandleId: 'h-w2-b-e' },
    { id: 's-b-sp',    startAnchorId: 'a-stbd-wall-fwd',  endAnchorId: 'a-stbd-peak',      startHandleId: 'h-b-sp-s',    endHandleId: 'h-b-sp-e' },
    { id: 's-sp-tail', startAnchorId: 'a-stbd-peak',      endAnchorId: 'a-tail',           startHandleId: 'h-sp-tail-s', endHandleId: 'h-sp-tail-e' },
    { id: 's-tail-pp', startAnchorId: 'a-tail',           endAnchorId: 'a-port-peak',      startHandleId: 'h-tail-pp-s', endHandleId: 'h-tail-pp-e' },
    { id: 's-pp-a',    startAnchorId: 'a-port-peak',      endAnchorId: 'a-port-wall-fwd',  startHandleId: 'h-pp-a-s',    endHandleId: 'h-pp-a-e' },
  ];

  return { anchors, handles, segments };
}

// ── Live Corners math (Adobe/Figma parity) ──
// KAPPA constant for Bézier approximation of circular arcs
const KAPPA = 4 * (Math.SQRT2 - 1) / 3; // ≈ 0.5522847498
// Squircle KAPPA for smooth (Figma iOS-style) corners
const SQUIRCLE_KAPPA = 0.82;

// Get the prev/next anchors along the hull path for a given anchor
function getAdjacentAnchors(hull: HullOutline, anchorId: string): { prev: HullAnchor | null; next: HullAnchor | null } {
  const getAnchor = (id: string) => hull.anchors.find((a) => a.id === id)!;
  let prev: HullAnchor | null = null;
  let next: HullAnchor | null = null;
  for (const seg of hull.segments) {
    if (seg.endAnchorId === anchorId) prev = getAnchor(seg.startAnchorId);
    if (seg.startAnchorId === anchorId) next = getAnchor(seg.endAnchorId);
  }
  return { prev, next };
}

// Compute the bisector direction at a corner (normalized sum of incoming/outgoing tangent directions)
function cornerBisector(hull: HullOutline, anchorId: string): { dx: number; dz: number; angle: number } {
  const a = hull.anchors.find((x) => x.id === anchorId);
  if (!a) return { dx: 0, dz: -1, angle: Math.PI };
  const { prev, next } = getAdjacentAnchors(hull, anchorId);
  if (!prev || !next) return { dx: 0, dz: -1, angle: Math.PI };
  // Incoming direction (from prev to corner) and outgoing (from corner to next)
  const inDx = a.wx - prev.wx, inDz = a.wz - prev.wz;
  const outDx = next.wx - a.wx, outDz = next.wz - a.wz;
  const inLen = Math.hypot(inDx, inDz) || 1;
  const outLen = Math.hypot(outDx, outDz) || 1;
  // Normalized vectors pointing AWAY from corner along each segment
  const a1x = -inDx / inLen, a1z = -inDz / inLen; // toward prev
  const a2x = outDx / outLen, a2z = outDz / outLen; // toward next
  // Angle between the two segments (interior angle)
  const dot = a1x * a2x + a1z * a2z;
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
  // Bisector = normalized sum of the two outward directions
  const bx = a1x + a2x, bz = a1z + a2z;
  const bLen = Math.hypot(bx, bz);
  if (bLen < 1e-6) {
    // 180° angle — bisector is perpendicular to both
    return { dx: -a2z, dz: a2x, angle: Math.PI };
  }
  return { dx: bx / bLen, dz: bz / bLen, angle };
}

// Angle-aware max radius: min(half adjacent segment lengths) with angle correction
function maxCornerRadius(hull: HullOutline, anchorId: string): number {
  const a = hull.anchors.find((x) => x.id === anchorId);
  if (!a) return 3;
  const { prev, next } = getAdjacentAnchors(hull, anchorId);
  if (!prev || !next) return 3;
  const dPrev = Math.hypot(prev.wx - a.wx, prev.wz - a.wz);
  const dNext = Math.hypot(next.wx - a.wx, next.wz - a.wz);
  // Max radius is limited by the shorter segment, adjusted by angle
  // For a 90° corner: max = min(dPrev, dNext) / 2
  // For acute angles: less radius fits
  const { angle } = cornerBisector(hull, anchorId);
  const halfAngle = angle / 2;
  // cut distance = r / tan(halfAngle), must be < segment length
  // so r < segment_length * tan(halfAngle)
  const maxByPrev = dPrev * Math.tan(halfAngle);
  const maxByNext = dNext * Math.tan(halfAngle);
  return Math.min(maxByPrev, maxByNext, 5);
}

// Build an SVG path string from a HullOutline (in screen coordinates)
// Applies Live Corners using proper fillet math:
// - cut distance = r / tan(θ/2) where θ is the interior angle
// - Bézier handle length = r × KAPPA (circular arc approximation)
// - smooth type uses SQUIRCLE_KAPPA for iOS-style continuous curvature
// - inverted type pushes handles outward (concave notch)
// - chamfer type pulls handles very close to anchor (near-straight bevel)
// - relative mode scales radius by angle factor for consistent visual height
function hullToSvgPath(hull: HullOutline, toScreen: (wx: number, wz: number) => { x: number; y: number }): string {
  const getAnchor = (id: string) => hull.anchors.find((a) => a.id === id)!;
  const getHandle = (id: string) => hull.handles.find((h) => h.id === id)!;

  if (hull.segments.length === 0) return '';

  // Compute the effective radius for an anchor (applying relative mode)
  const effectiveRadius = (a: HullAnchor): number => {
    if (!a.cornerRadius || a.cornerRadius <= 0) return 0;
    if (!a.cornerRelative) return a.cornerRadius;
    // Relative mode: scale by angle factor to maintain consistent visual height
    const { angle } = cornerBisector(hull, a.id);
    // For 90° corners, factor = 1. For sharper angles, reduce radius.
    const factor = Math.sin(angle / 2);
    return a.cornerRadius * factor;
  };

  // Compute the adjusted handle position for a segment endpoint,
  // applying the corner fillet math.
  const adjustedHandle = (handleId: string, anchorId: string) => {
    const h = getHandle(handleId);
    const a = getAnchor(anchorId);
    const r = effectiveRadius(a);
    if (r <= 0) return h;
    const { prev, next } = getAdjacentAnchors(hull, anchorId);
    // Determine which direction this handle goes (toward prev or next)
    const isStartHandle = hull.segments.some((s) => s.startAnchorId === anchorId && s.startHandleId === handleId);
    const neighbor = isStartHandle ? next : prev;
    if (!neighbor) return h;
    // Direction from anchor toward neighbor
    const dx = neighbor.wx - a.wx, dz = neighbor.wz - a.wz;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-6) return h;
    const ux = dx / dist, uz = dz / dist;
    const type = a.cornerType || 'round';
    const { angle } = cornerBisector(hull, anchorId);
    const halfAngle = angle / 2;
    // Cut distance: how far from the corner the arc tangent point is
    const cutDist = r / Math.tan(halfAngle);
    // Handle length from tangent point: KAPPA × radius
    const kappa = type === 'smooth' ? SQUIRCLE_KAPPA : KAPPA;
    if (type === 'inverted') {
      // Push handle past anchor in opposite direction (concave)
      const pushDist = r * 0.5;
      return { id: h.id, wx: a.wx - ux * pushDist, wz: a.wz - uz * pushDist };
    }
    if (type === 'chamfer') {
      // Place handle very close to the cut point (near-straight)
      const handlePos = cutDist * 0.95;
      return { id: h.id, wx: a.wx + ux * handlePos, wz: a.wz + uz * handlePos };
    }
    // round + smooth: place handle at cutDist - kappa*r along the segment
    // The handle is at the tangent point, offset back by kappa × r
    const tangentPoint = cutDist;
    const handleOffset = tangentPoint - kappa * r;
    return { id: h.id, wx: a.wx + ux * handleOffset, wz: a.wz + uz * handleOffset };
  };

  const first = getAnchor(hull.segments[0].startAnchorId);
  const start = toScreen(first.wx, first.wz);
  let path = `M ${start.x.toFixed(2)} ${start.y.toFixed(2)}`;

  for (const seg of hull.segments) {
    const sH = adjustedHandle(seg.startHandleId, seg.startAnchorId);
    const eH = adjustedHandle(seg.endHandleId, seg.endAnchorId);
    const s = toScreen(sH.wx, sH.wz);
    const e = toScreen(eH.wx, eH.wz);
    const end = getAnchor(seg.endAnchorId);
    const ep = toScreen(end.wx, end.wz);
    path += ` C ${s.x.toFixed(2)} ${s.y.toFixed(2)}, ${e.x.toFixed(2)} ${e.y.toFixed(2)}, ${ep.x.toFixed(2)} ${ep.y.toFixed(2)}`;
  }
  path += ' Z';
  return path;
}

// Sample points along the hull outline at equal parameter intervals.
// Returns array of {wx, wz} in world coordinates.
function sampleHullOutline(hull: HullOutline, samplesPerSegment: number = 20): { wx: number; wz: number }[] {
  const getAnchor = (id: string) => hull.anchors.find((a) => a.id === id)!;
  const getHandle = (id: string) => hull.handles.find((h) => h.id === id)!;
  const points: { wx: number; wz: number }[] = [];

  for (const seg of hull.segments) {
    const p0 = getAnchor(seg.startAnchorId);
    const p1 = getHandle(seg.startHandleId);
    const p2 = getHandle(seg.endHandleId);
    const p3 = getAnchor(seg.endAnchorId);
    for (let i = 0; i < samplesPerSegment; i++) {
      const t = i / samplesPerSegment;
      const mt = 1 - t;
      const wx = mt*mt*mt*p0.wx + 3*mt*mt*t*p1.wx + 3*mt*t*t*p2.wx + t*t*t*p3.wx;
      const wz = mt*mt*mt*p0.wz + 3*mt*mt*t*p1.wz + 3*mt*t*t*p2.wz + t*t*t*p3.wz;
      points.push({ wx, wz });
    }
  }
  return points;
}

// Find the hull edge point at a given Z coordinate (world), returning the
// port (negative X) and starboard (positive X) edge points.
// Used to connect the command room window to the hull edges.
// Returns the port and starboard window edge anchors (forward and aft).
function hullWindowEdges(hull: HullOutline): {
  port: { wx: number; wz: number } | null;
  stbd: { wx: number; wz: number } | null;
} {
  const port = hull.anchors.find((a) => a.id === 'a-win-port');
  const stbd = hull.anchors.find((a) => a.id === 'a-win-stbd');
  return {
    port: port ? { wx: port.wx, wz: port.wz } : null,
    stbd: stbd ? { wx: stbd.wx, wz: stbd.wz } : null,
  };
}

// ── Outline catalog for the right-side drawer ──
// Pre-made outline parts sourced from game-icons.net (CC-BY-3.0) and converted
// from SVG path data into sampled anchor points via svgPathToAnchors.
// Each part is a complete closed silhouette — no half-mirror reconstruction.
//
// View tagging: every entry declares which view orientations it is appropriate
// for. Side-profile creature silhouettes are tagged ['side']; dorsal/top-down
// planforms are tagged ['top-down']; shapes that read equally well from several
// orientations list all of them. The outline drawer filters by the current
// viewOrientation so side-view parts never appear in top-down (and vice versa).
type OutlineViewOrientation = 'top-down' | 'side' | 'front' | 'back';

interface OutlinePartAnchor {
  wx: number;
  wz: number;
}

interface OutlineCatalogEntry {
  id: string;
  name: string;
  shortName: string;
  icon: React.ReactNode;
  // Raw SVG path "d" string — rendered as an inline <svg> silhouette icon
  pathD: string;
  // Anchors in local space (origin = shape center, normalized to targetSize)
  anchors: OutlinePartAnchor[];
  // Whether the shape is already visually symmetric about wx=0 (skip X-mirror)
  symmetric?: boolean;
  // View orientations where this silhouette is anatomically appropriate.
  // The drawer filters parts by the current viewOrientation.
  views: OutlineViewOrientation[];
}

interface OutlineCategory {
  id: string;
  label: string;
  icon: React.ReactNode;
  parts: OutlineCatalogEntry[];
}

// Render an SVG path as a bold silhouette icon, matching the emerald styling
// of the surrounding lucide icons. The path is drawn in a 512×512 viewBox
// (game-icons.net convention) and scaled to fill the given size.
const SilhouetteIcon = ({ pathD, className = 'w-4 h-4' }: { pathD: string; className?: string }) => (
  <svg viewBox="0 0 512 512" className={className} fill="currentColor" aria-hidden="true">
    <path d={pathD} />
  </svg>
);

// Helper: build a catalog entry from an SVG path string
const svgPart = (
  id: string,
  name: string,
  shortName: string,
  icon: React.ReactNode,
  pathD: string,
  opts?: {
    targetSize?: number;
    maxPoints?: number;
    symmetric?: boolean;
    views?: OutlineViewOrientation[];
  },
): OutlineCatalogEntry => ({
  id,
  name,
  shortName,
  icon,
  pathD,
  symmetric: opts?.symmetric,
  views: opts?.views ?? ['side'],
  anchors: svgPathToAnchorsCached(pathD, {
    targetSize: opts?.targetSize ?? 3.0,
    maxPoints: opts?.maxPoints ?? 26,
  }),
});

// ── SVG path data from game-icons.net (CC-BY-3.0) ──
// These are the fill paths from the white-on-black SVG versions.
// Source URLs documented per shape.

const SVG_WHALE_TAIL = "M453.004 35.117c-65.314 46.61-189.755 41.018-213.559 125.426C184.41 101.41 98.625 83.031 21.771 63.209c6.532 139.103 71.38 147.437 192.44 194.547 23.71 25.786 29.786 49.93 19.254 82.705 46.403 5.1 71.504 15.468 106.754 27.742-.708-71.67-25.14-108.928-75.518-175.035 11.058 4.233 44.979 37.02 56.578 58.607 109.419-42.421 147.64-112.074 131.725-216.658zM180.178 353.9c-60.89-.24-114.034 19.49-158.426 74.221 167.075-48.84 292.003-13.21 471.893 7.895-118.936-38.752-224.474-81.763-313.467-82.116zm98.043 77.844c-99.28.255-206.34 18.738-256.866 63.139 168.002-26.61 356.801-28.408 470.8-4.967 1.102-35.337-101.418-58.46-213.934-58.172z";

const SVG_SHARK_FIN = "M349.603 42.768c-31.36-1.053-234.946 205.685-280.595 309.828 26.998-7.923 58.257-15.23 82.4-13.004 22.594 2.083 40.82 15.274 57.844 26.603 17.023 11.33 32.575 20.703 48.654 20.416 16.378-.29 32.196-11.74 49.502-24.862 17.306-13.122 36.175-27.944 60.272-27.812 6.093.033 12.397.946 18.79 2.505-56.174-100.224-21.42-289.766-36.062-293.598a6.536 6.536 0 0 0-.805-.074z";

const SVG_BULL_HORNS = "M73.813 39.28c70.517 36.34 49.052 103.816 8.374 138.22-88.595 74.925-82.78 199.22 48.25 244.563-10.524-32.924-9.554-66.272 2.063-99.063-30.195-25.72-38.378-63.247 11.906-135.656 30.388-43.758 23.922-140.87-70.594-148.063zm361.5 0c-94.516 7.193-100.982 104.306-70.594 148.064 47.774 68.795 42.742 106.107 16.217 131.72 7.033 17.736 12.06 35.84 13.282 54.467.963 14.702-.57 29.68-5.25 44.72 120.973-48.166 124.15-167.84 37.936-240.75-40.677-34.404-62.11-101.88 8.406-138.22zm-79.875 268.345c-66.123 9.62-131.398 17.49-196.22.688-23.464 45.56-24.194 89.256.47 134.656 65.572-6.135 131.11-5.805 196.593.06 15.795-23.503 20.762-45.73 19.283-68.28-1.44-21.957-9.355-44.356-20.125-67.125z";

const SVG_SCORPION_TAIL = "M234.156 50.97C206.818 50.935 181.553 62 160.75 82.5l-.03.03-2.407 2.407-3.407.344c-49.495 5.403-83.706 33.15-89.5 85.095l-.375 3.5-2.56 2.47c-36.707 35.167-44.447 78.697-16.595 128.75l1.688 3.06-.626 3.44C41.666 340.604 46.126 363.12 57.5 381s30.177 31.492 55.344 40.625l4.125 1.5 1.624 4.063c12.656 31.673 29.218 54.478 50.844 64.687l297.968-.22c-37.12-38.026-97.324-65.477-154.562-82.28-32.405-9.513-63.8-15.746-89.22-19.03-25.418-3.286-45.81-3.197-52.155-1.75l-11.407 2.624-.532-11.72c-.957-22.076-7.112-36.88-16.655-48.813-9.543-11.93-22.932-21.06-38.813-29.687L94 295.53l6.97-9.092c9.87-12.847 11.79-26.224 10.093-41.594-1.7-15.37-7.504-32.15-12.782-48.844l-2.843-8.97 8.876-3.186c39.696-14.2 61.118-34.885 70.687-62.53l3.22-9.314 9.31 3.313c27.454 9.8 51.837 2.02 85.25-9.813l6.564-2.313 4.344 5.438c14.095 17.657 33.44 31.493 53.75 36.688a76.252 76.252 0 0 0 9.562 1.78c-57.08 49.068 10.62 193.9 145.03 147.876-89.358-9.813-54.872-56.095-45.78-93.595 10.03-41.365-14.234-70.782-51.75-70.53-4.967-22.81-18.265-40.016-35.78-51.564-19.87-13.097-45.096-18.51-67.876-15.03l-3 .47-2.75-1.314c-17.383-8.393-34.527-12.417-50.938-12.437z";

const SVG_CURL_TENT = "M309.822 19.695c-91.36.614-193.674 54.694-233.935 133.168-58.023 113.09-28.643 221.764 35.04 336.393l190.57-.002a32.73 32.73 0 0 0 2.222.02c.142-.002.28-.015.423-.02h53.826c-10.486-3.502-20.882-7.894-31.085-13.047 10.072-16.983 2.354-44.398-23.168-43.71-10.64.29-18.18 5.295-22.633 12.222-9.458-8.397-18.286-17.478-26.467-27.068 14.902-15.993 8.335-49.138-19.69-48.38-4.657.125-8.716 1.157-12.187 2.855a296.492 296.492 0 0 1-15.035-30.328c19.106-14.293 13.695-52.217-16.244-51.435a238.492 238.492 0 0 1-3.124-18.773 219.15 219.15 0 0 1-1.234-13.135c27.28-5.747 28.78-46.347 4.5-54.635 2.133-8.412 4.962-16.413 8.507-23.892l.038-.08c3.723 2.18 8.316 3.415 13.788 3.267 24.495-.642 31.46-28.02 20.904-43.215a203.652 203.652 0 0 1 13.332-9.234 89.57 89.57 0 0 1 4.932-2.897c2.136 11.04 10.508 20.495 25.126 20.1 19.36-.506 27.768-17.725 25.23-32.423 10.7-.52 20.69.4 29.788 2.475-3.264 13.06 3.77 28.85 21.106 28.38 7.844-.205 13.576-3.63 17.203-8.513a61.384 61.384 0 0 1 3.927 4.208c5.093 6.01 8.785 12.684 10.91 19.893-16.187 5.228-16.828 29.973-1.92 35.932-3.047 8.154-7.957 16.63-15.078 25.203-2.402-2.767-6.02-4.564-10.86-4.433-13.943.38-17.764 16.166-11.48 24.613-7.052 4.543-13.68 7.366-19.712 8.86.646-5.998-2.903-12.428-10.666-12.22-7.328.2-10.9 6.108-10.737 11.784-.245-.09-.493-.178-.733-.273-3.894-2.125-7.526-5.38-10.77-10.09 10-2.95 10.16-18.5.458-21.31 1.414-3.197 3.41-6.582 6.097-10.094 2.516 1.67 6.553 2.795 12.133 2.72 12.562-.16 17.35-6.17 14.387-10.68.03.004.058.005.088.007-.056-.047-.113-.09-.168-.137-.805-1.158-2.132-2.21-3.975-3.03-9.49-6.445-20.606-8.778-30.73-7.298l-.29-.275c-.12.126-.23.253-.35.38-20.527 3.34-36.708 22.448-26.394 54.75 38.275 119.87 242.354 18.336 199.733-111.55-26.183-79.795-79.363-114.193-151.262-115.053v.01c-1.444-.017-2.892-.02-4.342-.012z";

const SVG_INSECT_JAWS = "M141.063 54.72c-5.572-.08-10.61 1.583-14.25 5.124-8.962 8.715-5.958 25.523 6.718 37.53 12.677 12.01 30.228 14.685 39.19 5.97 8.96-8.715 5.925-25.524-6.75-37.53-7.528-7.13-16.765-10.978-24.907-11.095zm231.156 0c-8.144.116-17.412 3.963-24.94 11.093-12.675 12.007-15.68 28.816-6.717 37.53 8.96 8.716 26.51 6.04 39.187-5.968 12.676-12.008 15.68-28.816 6.72-37.53-3.642-3.542-8.68-5.206-14.25-5.126zm-182.94 67.31c-8.27.095-15.847 2.3-20.81 6.626-9.93 8.654-5.566 22.475 9.75 30.844 15.314 8.37 35.79 8.123 45.718-.53 9.928-8.655 5.533-22.445-9.782-30.814-7.657-4.184-16.603-6.218-24.875-6.125zm134.69 0c-8.273-.092-17.22 1.942-24.876 6.126-15.315 8.37-19.68 22.16-9.75 30.813 9.93 8.653 30.403 8.9 45.72.53 15.314-8.37 19.677-22.19 9.748-30.844-4.964-4.327-12.57-6.53-20.843-6.625zm-183.064 53.407c-5.683 10.385-14.37 20.635-25.937 29.75-24.016 18.923-54.28 28.154-79.5 26.657-2.37 12.198-3.376 24.48-3.376 37.312 0 92.572 63.884 171.475 153.094 199.25-27.045-21.037-26.52-70.76-6.782-95.53-81.704-65.275-54.32-135.304 19.688-168.438-19.968-5.9-38.035-14.754-53.25-25.97-1.34-.988-2.64-2.004-3.938-3.03z";

const SVG_DRAGON_HEAD = "M200.947 18.686c-6.98.087-14.64.774-22.85 1.9 27.57 20.468 51.098 45.25 67.594 70.527 1.66 0 3.312.012 4.958.047 18.066.39 35.487 2.906 53.217 7.2-15.695-28.457-29.935-50.19-47.45-63.22-13.817-10.278-30.063-16.168-52.52-16.454-.967-.013-1.95-.013-2.948 0zm-91.66 22.96c-.73-.002-1.46.006-2.195.022-14.045.31-29.36 3.92-46.86 11.13 56.18 18.807 106.985 50.468 133.907 83.585 18.377-5.13 29.44-14.72 36.454-28.817C195.84 78.18 168.118 56.19 140.65 46.96c-10.168-3.418-20.433-5.306-31.363-5.315z";

const SVG_BAT_WING = "M23.25 19.875c38.22 44.005 38.98 90.112 16 132.344 75.61-33.06 158.24-45.382 238.844-45.407 2.933 0 5.854 0 8.78.03 45.98.49 91.18 4.898 133.938 11.626C295.842 26.31 154.954 21.397 23.25 19.874zm251.5 105.75c-75.736.388-152.785 11.91-223.03 41.563 39.527 25.086 44.946 85.016 30.78 130.156 81.86-82.396 213.783-137.65 326.688-161.72-43.14-6.38-88.547-10.234-134.438-10z";

const SVG_WALRUS_HEAD = "M256 31.488c-62.127 0-98.646 18.767-122.092 48.3-23.446 29.53-30.34 72.845-37.908 118.7-13.287 80.496-2.9 175.54-48 256 41.61 13.22 96.365 16.84 136.607 21.72-15.898-35.502-26.492-74.345-31.105-114.405-12.457-.062-24.528-3.69-32.53-13.69-17.096-21.373-22.408-41.488-18.78-58.728 3.63-17.24 15.384-30.328 28.408-40.096 26.048-19.537 59.216-27.532 59.216-27.532l4.368 17.46s-30.832 8.006-52.784 24.47c-10.976 8.232-19.223 18.144-21.593 29.404-2.37 11.26.317 25.145 15.22 43.773 4.65 5.813 12.35 7.853 24.088 6.68 11.738-1.172 26.218-5.948 39.95-11.96 27.47-12.02 51.88-28.542 51.88-28.542L256 299.61l5.055 3.433s24.41 16.522 51.88 28.543c13.732 6.01 28.212 10.787 39.95 11.96 11.737 1.172 19.438-.868 24.088-6.68 14.903-18.63 17.59-32.514 15.22-43.774-2.37-11.26-10.617-21.172-21.593-29.404-21.952-16.464-52.784-24.47-52.784-24.47l4.368-17.46s33.168 7.995 59.216 27.53c13.024 9.77 24.777 22.857 28.407 40.097 3.63 17.24-1.683 37.355-18.78 58.727-8 10-20.072 13.63-32.53 13.69-4.62 40.133-15.246 79.043-31.192 114.597 43.53-4.93 88.473-8.18 136.695-21.912-48-80-34.096-175.61-48-256-7.935-45.878-13.918-89.265-37.625-118.77C354.668 50.21 318.13 31.487 256 31.487z";

const SVG_ANGLER_FISH = "M442.906 52.156c-.806.02-1.617.076-2.437.188-13.124 1.79-22.993 13.47-30.47 32.875-5.993 15.552-10.81 37.088-13.938 66.5-32.023-22.095-63.766-29.543-95.28-25.845l-26.97-60.063-24.968 71.282L198.5 107.28l-.813 63.064-46.562 1.75 12.53 30.562c-17.504 16.246-34.963 34.403-52.405 53.844l-92.813-45.375 44.876 75.906-36.47 39.095 36.282 2.78-40.47 59.876 108.064-64.905 87.56 42.53-49.75 17.376 35.564 13.814-32.563 22.22 52.157.967-4.593 46.845 59.312-72.03L365 437.654 496.063 270.47a652.84 652.84 0 0 0-11.594-19.095l-119.376 150.97-4.72 5.967-6.78-3.406-44.344-22.22 8.375-16.717 37.53 18.81L473.69 234.907c-20.158-29.63-40.187-52.59-60.094-69.656 2.96-34.52 8.11-58.353 13.875-73.313 6.36-16.51 12.884-20.706 15.5-21.062 1.306-.178 2.63.047 4.75 1.53 2.118 1.485 4.693 4.293 7 8.19 4.582 7.743 8.005 19.562 8.217 31.686a23.333 23.333 0 0 0-13.437 21.157c0 12.878 10.436 23.313 23.313 23.313 12.876 0 23.312-10.435 23.312-23.313 0-9.752-6.002-18.114-14.5-21.593-.284-15.23-4.225-29.62-10.813-40.75-3.322-5.615-7.346-10.478-12.375-14-3.77-2.642-8.322-4.49-13.125-4.875-.8-.065-1.6-.083-2.406-.064z";

const SVG_TOOTH = "M246.752 23.084c-11.678-.205-23.032 4.26-30.952 15.185-29.264 40.35-39.476 78.655-44.385 111.545-4.514 30.235-13.507 59.72-30.952 87.02-31.793 49.747-65.857 124.744-73.587 167.612-5.864 32.387 17.908 42.053 32.705 7.008 20.245-47.94 65.492-125.768 122.06-103.955 51.25 19.76 8.924 122.165-22.193 152.43-25.11 24.424-7.202 51.466 23.944 22.192 33.048-31.062 78.602-92.256 94.612-147.172 6.233-21.378 15.79-43.776 34.458-54.315 39.813-22.477 81.826-58.99 98.115-133.156 10.9-49.632-50.517-70.425-85.266-37.378-5.303-50.398-46.487-62.34-76.51-35.624 10.073-27.63-16.357-50.942-42.048-51.394z";

const SVG_JELLYFISH = "M258.25 19.594c-76.095.492-152.275 42.48-171.844 139.812-2.706 13.46.208 22.172 7.406 30.063 6.18 6.774 16.286 12.65 29.313 17.155 8.87-6.015 17.417-19.395 20.47-34.156 1.136 15.568 7.102 33.066 17.28 42.53 12.807 1.726 26.597 2.752 40.78 3.188C205.5 123.968 313.99 114.71 323.22 208.5c11.655-2.437 22.868-5.327 33.28-8.656 11.107-15.656 7.692-26.07 5.03-41 8.16 11.035 11.332 22.095 28.314 27.25 9.952-5.37 18.034-11.312 23.687-17.5 8.163-8.936 11.494-17.695 9.97-28.47-10.676-75.457-84.34-119.695-161.625-120.53a208.585 208.585 0 0 0-3.625 0z";

const SVG_GRASP_CLAWS = "M233.156 36.156c-6.48-.048-13.395 1.184-20.47 3.625-16.957 5.854-33.577 18.887-43.467 36.157 77.39 68.916 107.53 126.832 108.06 219.25 43.458-77.778 36.565-167.55-17.217-248.218-6.928-7.206-16.306-10.736-26.907-10.814zm93.78 35.375c-6.478-.047-13.393 1.185-20.467 3.626-2.493.86-4.982 1.902-7.44 3.063 14.802 31.958 23.134 65.038 24.75 97.936 32.99 45.06 46.945 91.825 47.314 154.375 43.432-77.787 36.5-167.58-17.313-248.25-6.92-7.15-16.28-10.67-26.842-10.75z";

// ── Top-down / dorsal planform silhouettes (game-icons.net, CC-BY-3.0) ──
// These read as a creature seen from above, which matches the default
// top-down drafting orientation of the engineering canvas.
// Sources:
//  https://game-icons.net/1x1/delapouite/manta-ray.html
//  https://game-icons.net/1x1/lorc/crab.html
//  https://game-icons.net/1x1/lorc/octopus.html
//  https://game-icons.net/1x1/delapouite/sea-turtle.html
//  https://game-icons.net/1x1/lorc/butterfly.html
//  https://game-icons.net/1x1/lorc/trilobite.html
//  https://game-icons.net/1x1/lorc/ammonite.html
//  https://game-icons.net/1x1/lorc/brain.html
//  https://game-icons.net/1x1/lorc/spiked-tentacle.html
//  https://game-icons.net/1x1/lorc/sea-dragon.html
//  https://game-icons.net/1x1/delapouite/eel.html

const SVG_MANTA_RAY = "M21.732 21.732C115.44 146.675 131.057 256.001 115.44 334.09c16.476 5.492 27.146 9.056 34.75 13.402a404.063 404.063 0 0 0-14.605 4.815c-20.447 7.19-43.892 16.797-57.791 31.25-14.689 15.274-23.998 40.669-30.81 62.767-6.813 22.099-1.635 42.635-1.635 42.635s12.333-16.25 18.834-37.334c6.5-21.085 16.658-45.272 26.584-55.594 9.135-9.5 31.343-19.908 50.789-26.746 8.692-3.056 16.722-5.493 23.058-7.295 4.299 7.593 7.85 18.227 13.297 34.57 78.09-15.617 187.415 0 312.358 93.708C474.65 443.414 459.03 365.324 412.178 256c-9.776-29.327-13.43-52.534-10.969-69.623 15.121-2.598 24.97-12.368 31.266-22.035 6.821-10.474 11.285-20.903 17.302-26.92l-12.726-12.727c-9.6 9.6-14.16 21.383-19.658 29.825-1.928 2.959-3.753 5.487-5.8 7.578-46.029-15.344-46.347-15.662-61.69-61.692 2.09-2.046 4.618-3.871 7.577-5.799 8.442-5.498 20.224-10.057 29.825-19.658l-12.727-12.726c-6.017 6.017-16.446 10.48-26.92 17.302-9.667 6.297-19.437 16.145-22.035 31.266-17.09 2.462-40.296-1.193-69.623-10.969C146.676 52.97 68.586 37.35 21.732 21.732zM215.766 131.06h17.998c0 14.741 2.215 26.782 6.447 35.652 4.232 8.87 10.13 14.748 19.22 18.498l-6.863 16.639c-13.023-5.373-22.744-15.11-28.601-27.387-5.858-12.276-8.201-26.909-8.201-43.402zm-41.553 2.51 17.967 1.052c-.767 13.08 2.013 31.07 9.017 47.291 7.005 16.22 18.026 30.535 33.139 38.285l-8.211 16.016c-19.896-10.202-33.258-28.194-41.451-47.166-8.193-18.973-11.424-39.062-10.461-55.479zm152.578 119c3.75 9.09 9.628 14.988 18.498 19.22 8.87 4.232 20.91 6.447 35.652 6.447v17.998c-16.493 0-31.126-2.343-43.402-8.2-12.276-5.858-22.014-15.579-27.387-28.602l16.639-6.864zm-34.988 25.095c7.75 15.113 22.064 26.134 38.285 33.139 16.22 7.004 34.211 9.784 47.29 9.017l1.054 17.967c-16.417.963-36.506-2.268-55.479-10.46-18.972-8.194-36.964-21.556-47.166-41.452l16.016-8.21z";

const SVG_CRAB = "M269.03 60.03C168.74 59.907 68.5 103.35 19.564 202.563c58.543-9.985 113.65 6.082 165.75 34 70.184-39.588 144.73-44.868 214.5-18.875 10.514-41.038 42.6-63.99 89.468-74.5-54.013-53.032-137.15-83.052-220.25-83.156zm72.126 163.407c-11.402 0-20.594 9.247-20.594 21.094 0 11.85 9.193 21.096 20.594 21.096 11.4 0 20.594-9.246 20.594-21.094 0-11.846-9.192-21.093-20.594-21.093zm-82.812 4.188c-11.402 0-20.594 9.246-20.594 21.094 0 11.845 9.193 21.092 20.594 21.092 11.4 0 20.594-9.247 20.594-21.094 0-11.85-9.192-21.095-20.594-21.095zm201.47 4.188c-4.164.11-8.78 1.334-13.94 3.812-11.792 5.665-25.755 18.744-38.624 40.813L404 282l-6.344-1.063c-27.112-4.514-46.836-.19-64.062 11.813-13.355 9.305-25.297 23.88-36.594 43.375 21.91-4.96 44.527-8.67 68.5-8.313l1.625.032c7.183-5.527 14.684-12.313 22.75-20.813-5.452 13.003-10.846 26.15-17.938 37.91-.017.032-.044.06-.062.092-10.86 19.943-33.42 36.072-55.594 49.72 30.027 21.8 61.94 26.562 90 18.906 31.256-8.527 57.875-32.584 70.565-67.656 10.892-30.1 14.177-55.068 12.562-73.625-1.614-18.557-8.06-30.293-15.47-35.875-3.703-2.79-7.76-4.426-12.373-4.656a21.603 21.603 0 0 0-1.75-.03zM52.31 268.406c-16.702.463-26.298 6.886-31.28 17.25-5.316 11.055-5.09 28.77 4.812 50.906 9.902 22.137 29.235 48.22 59.843 74.938 35.545 31.025 79.76 41.25 119.563 31.28 36.588-9.163 69.667-35.298 89.125-79.905-20.686-.45-39.67-1.264-56.656-6.28-.13-.03-.25-.065-.376-.095-30.142-7.197-48.195-22.108-71.22-44.906 17.366 9.184 32.465 14.25 46 16.594l.127-.063c25.762-15.026 38.305-20.79 59.5-27.156-48.484-31.7-90.278-26.67-129.22-3.284l-2.218 1.344h-5.344l-2.314-1.467c-31.643-20.31-58.067-28.794-76.906-29.157a75.764 75.764 0 0 0-3.438 0z";

const SVG_OCTOPUS = "M150.25 19.97c-114.48-.574-139.972 184.95 20.563 212.124-29.5.534-55.382 8.11-91.75 25.97C-19.2 306.313.665 462.966 100.874 446c34.48-5.838 51.21-50.325.875-65.375 16.515 29.61-27.968 47.1-41.906 1.938-11.262-36.49 21.145-74.914 52.468-85 30.5-9.82 55.244-10.86 82.47-5.844-36.585 34.247-56.547 80.465-42.376 123.624 44.522 135.595 192.146 82.52 162.844-6.72-10.346-31.506-41.408-46.505-68-10.155 35.164-8.854 50.45 38.75 18.188 49.342-26.355 8.655-60.212-13.527-66.032-41.343-7.82-37.39 19.77-77.195 54.78-95.25 22.176 35.37 38.812 48.68 83.22 72.186 85.843 45.436 212.957-36.54 143.906-110.53-22.626-24.244-54.574-30.02-67.5 13.124 30.188-20.09 60.748 26.8 33.875 47.563-21.95 16.96-61.503 19.135-86.437 5.5-30.797-16.842-53.79-37.798-70.188-66.532 57.07 13.69 119.584-1.065 143-45.342 45.72-86.45-7.046-152.467-59.125-153.375-20.378-.356-40.654 9.237-54.875 31.5-17.85 27.946-9.815 61.533 35.157 59.124-29.11-21.628-1.9-63.623 26.717-45.343 23.378 14.932 22.494 51.88 9.75 77.28-15.165 30.23-60.573 50.738-95.062 24.657-3.008-5.71-5.563-11.683-7.78-17.843 8.99-6.49 14.874-17.028 14.874-28.875 0-17.772-13.252-32.64-30.345-35.218-9.763-47.134-23.34-92.648-84.844-112.594-13.64-4.424-26.437-6.472-38.28-6.53zm117.844 137.405c9.463 0 16.937 7.474 16.937 16.938 0 9.463-7.473 16.937-16.936 16.937-9.463 0-16.906-7.474-16.906-16.938 0-9.463 7.443-16.937 16.906-16.937zm-65.406 10.5c9.463 0 16.937 7.474 16.937 16.938 0 9.463-7.474 16.937-16.938 16.937-9.463 0-16.937-7.474-16.937-16.938 0-9.463 7.474-16.937 16.938-16.937z";

const SVG_SEA_TURTLE = "M426.7 63.83c-7.2 2.78-14.2 9.16-20 16.46 4.6 19.6-4.6 40.81-11.9 56.01 19.4-.6 53 6.3 68.4-2.3 18.4-10.3 35-46.21 29.8-63.71-18.8-4.75-50.3-11.83-66.3-6.46zm-149.3 8.56-1.7 12.6c12.3 2.9 23.4 7.4 33.7 14.5 1.6-11.2 4.5-21 12.3-27.3-14.7-1-30.1-.9-44.3.2zm193.3 2c-14.1 8-27.9 13.7-34.4 22.4-6.4-5.6-10.5-12-8.6-20.9 14.1-6.1 29.2-4.7 43-1.5zm-211.7 0c-10.8 1.4-21.5 3.4-32.2 6.1 10.8.1 21.9.5 31.1 1.5zm73.2 12.6c-8.3 17.01-3.1 28.61 3.6 41.91 8.8-15 16.5-31.01 23-47.71-9-1.8-20.6-.5-26.6 5.8zm46.1-6.2C320 240.2 158.9 331.4 17.99 320.7c1.2 36.6 60.44 21.1 81.95 17.1 52.16-10 119.46-33 167.66-74.6 38.7-33.3 74.3-72.9 98.2-111.2 7.4-16.4 28.9-46.9 24-65.71-1.6-4.5-7.1-4.5-11.5-5.5zM196.5 100.2c10.7 5.9 19.9 13.2 28.7 20.2 3.4-7.3 8.6-14.6 16.3-21.61-14.7-.6-31.5.2-45 1.41zm71.6 1.5c-18.5 10.6-25.5 20.2-28.4 30.3 10.1 10 21.1 23.9 30.1 36.2-.9-23.7 19.8-44.1 36.8-48-11.1-10.4-22.9-15.3-38.5-18.5zm-101.4 6c-1.4 1.9-2.7 3.8-4 5.8 5.3 8.6 11.1 16.7 17.5 24.2 5.1-3.7 10.4-7.1 15.9-10.2-9.5-7.7-19.4-14.5-29.4-19.8zm220.8 6.1c-1.6 11-7.3 21.9-15.9 32.4 6.9 5.9 13.4 12.2 19.4 18.9 5.3-9.7 8.7-19.8 9.7-30.3-4.4-7.7-8.7-15.1-13.2-21zm-242.5 14.4c-3.9 7.5-7.1 15.2-9.5 23.1 8.4 6.5 17.2 12.5 26.4 17.9 2.4-8.5 6.4-16.7 11.7-24.2-10.1-5.2-19.4-11.1-28.6-16.8zm263.5 12.1c-2.4 8.7-6.4 17.3-11.7 25.6 7.9 7.5 15.2 15.6 21.8 24.1 4.9-9.4 8-19.2 9-29 1.8-7.5-12.1-13.9-19.1-20.7zm-284.9 13.4c-1.8 8.2-2.8 16.6-2.8 25.1 0 3.1.1 6.2.4 9.3 9.4 4.3 19 8 28.9 11.1-.5-3.4-.7-6.9-.7-10.4 0-9.4 1.5-18.6 4.3-27.3-10.4-2.2-20.5-5-30.1-7.8zm305.4 14.9c.3 3.4.4 6.8.4 10.2 0 9.1-1.4 18-4 26.6 9.9 3.1 19.5 6.8 28.7 11 -3.6-16.4-12.9-32.4-25.1-47.8zm-283.9 24.7c2.6 8.3 6.4 16.3 11.2 23.8 8.2-3.7 16.7-6.9 25.4-9.6-3.2-7.3-5.4-15-6.5-23-10.4 2.4-20.5 5.4-30.1 8.8zm262.5 12.1c-9.5 3.4-19.3 6.3-29.3 8.6-1.1 8-3.3 15.7-6.5 23 8.7 2.7 17.2 5.9 25.4 9.6 4.8-7.5 8.6-15.5 11.2-23.8-3.6-5.8-7.7-11.6-12.2-17.4zm-235.3 17.8c5.4 6.5 11.6 12.6 18.4 18.1 6.3-5.5 13.1-10.5 20.3-14.9-6.3-5.5-12-11.7-16.9-18.4-7.6 4.4-14.9 9.4-21.8 15.2zm208.1 0c-6.9-5.8-14.2-11.2-21.8-15.2-4.9 6.7-10.6 12.9-16.9 18.4 7.2 4.4 14 9.4 20.3 14.9 6.8-5.5 13-11.6 18.4-18.1z";

const SVG_BUTTERFLY = "m222.97 43.094-17.72 5.937c18.246 54.362 27.075 112.164 24.406 174.47l-.875 20.5 16.032-12.78c47.213-37.597 81.827-86.216 102.282-146.095l-17.688-6.063c-17.04 49.88-44.08 90.906-80.656 124.22.156-56.652-8.915-109.937-25.78-160.188zM53.812 51.22C51.09 160.79 110.03 244.245 208.75 273c2.573-110.1-55.144-193.608-154.938-221.78zm335.156 150.374c-58.436-.03-115.656 25.943-163.5 76.094 90.775 49.848 192.148 32.407 268.217-47.563-34.172-19.135-69.658-28.513-104.718-28.53zM136.936 277.03c-52.45.582-94.1 32.36-116.687 91.25 82.336 33.03 151.56 4.26 182.72-77.374-23.333-9.574-45.51-14.102-66.032-13.875zm81.97 19.47c-37.76 80.056-8.793 149.03 75.343 183.094 37.786-80.46 9.994-149.316-75.344-183.094z";

const SVG_TRILOBITE = "M159.9 19.55c-20.7.2-41.7 7.8-60.4 20.8-53.2 37-89.8 119.45-56.7 216.85 14 41.3 17.2 76.3 12.5 102.9-4.6 26.5-16.6 44.3-33.4 53.5l9 16.4c22.5-12.3 37.5-36 42.8-66.7 5.4-30.7 1.6-68.6-13.2-112.1-30.7-90.4 3.9-163.55 49.7-195.45 22.9-16 48.2-21.4 69.9-14.6 8.8 2.7 17.2 7.5 24.9 14.6 6.8-1.9 13.9-3.4 21-4.5-11.5-14-25.3-23.3-40.4-28-9.2-2.48-17.2-3.7-25.7-3.7zm166.5 3.8c-14.9 4.6-28.5 13.7-40 27.4 7.3 1 14.5 2.4 21.6 4.2 7.4-6.7 15.5-11.2 24-13.8 21.7-6.8 46.9-1.4 69.8 14.6 45.8 31.9 80.5 105.05 49.7 195.45-14.7 43.5-18.6 81.4-13.2 112.1 5.4 30.7 20.4 54.4 42.8 66.7l9-16.4c-16.7-9.2-28.8-27-33.4-53.5-4.6-26.6-1.5-61.6 12.5-102.9 33.1-97.4-3.5-179.75-56.7-216.85-18.7-13-39.7-20.6-60.3-20.8-8.9.1-18.5 1.48-25.8 3.8zM258 67.45c-45.6 0-86 15.3-115.4 46.25-18.4 19.4-32.6 45.3-40.6 78.1 25.2-18.3 62.6-29.2 87.9-33.8 3-.4 4.9-.3 7.4 1.1 40.3 20.3 84.2 21.5 121.7 0 2.4-1.8 3.6-1.6 6.4-1.1 35.8 5 64.1 15.1 88.5 33.4-8.1-32.6-22.2-58.3-40.6-77.7C344 82.75 303.5 67.45 258 67.45zM190.9 177c-28.4 7.6-94.13 24.2-95.2 57h-.2c-.5 6-.8 12.2-.9 18.6 27.9-23.9 64.7-34.3 97.2-40.1-.5 6.3-.9 12.7-1.3 19.2-30.8 6.8-92.77 17.3-94.6 56.1v.2c.7 7 1.5 13.8 2.6 20.6 22.9-21.8 63.8-35.3 90.8-40.6-.2 6.4 0 13.3 0 19.1-26.5 8.6-82.9 20.6-84.9 50.7 2 7.8 4.3 15.6 6.8 23 18.7-20.2 55.9-32.8 79.3-37.7-.2 6.4 0 13.3 0 19.1-26.5 8.6-82.9 20.6-84.9 50.7 2 7.8 4.3 15.6 6.8 23 18.7-20.2 55.9-32.8 79.3-37.7.4 6.4.8 12.7 1.3 18.9-24.7 5.7-66.7 19.4-71.6 41.5 4.2 9.5 8.9 18.5 13.9 26.9 15.2-17.6 42-26.7 61.5-31.3.8 6.4 1.8 12.5 2.8 18.7-15.1 5.1-50.3 13.9-52.3 30.7 6.9 9.3 14.4 17.8 22.2 25.3 9.9-10.1 26-15.7 37.8-18.5 1.6 6.3 3.3 12.3 5.2 18-10.8 3.9-21.6 5.4-28.7 12.5 22.7 17.1 48.3 26.6 75.4 26.6 26.6 0 51.8-9.1 74.3-25.8-7.6-7.1-20-10.8-28.7-13.1 1.8-5.7 3.6-11.7 5.2-18 12.9 3.3 30.8 10.5 37.8 19.3 8.8-8.2 17-17.7 24.6-28.2-8.6-18.2-37.1-25.7-54.4-29.5 1-6 2-12.1 2.8-18.6 23.7 5.2 49 13 63 30.7 4.7-8.1 9.1-16.7 13.1-25.7-6.4-24.2-52.2-37.4-72.2-41.7.5-6.2.9-12.4 1.3-18.8 27.5 5.7 63.2 18.2 79.9 37.7 2.5-7.2 4.7-14.6 6.6-22.2-13.7-27.7-60.3-45.9-85.3-51.2 0-6.8.3-13 0-19.2 34.5 11.7 70 18.2 91.2 42.4 1.2-7.4 2.1-14.9 2.8-22.5-7.3-35.6-67.6-51.1-95.2-56.4-.4-6.5-.8-13-1.3-19.2 34.9 7 72.7 16.8 97.8 40.2-.1-8-.5-15.8-1.2-23.3-13.5-33.4-66.2-46.7-95-52.2-44.8 21.5-92.3 22.1-134.2-.1zm114 37c.5 6.7 1 13.6 1.4 20.6-31.3 12.6-68.2 13-97.3.6.4-6.8.8-13.5 1.4-20.2 28.4 13.4 68.6 14.8 94.5-1zm2.5 55.7c0 7.4-.1 15.3-.2 21.8-31.6 13.2-69.7 13.5-99.1.6-.1-7.9-.2-13.9-.2-21.2 30.3 15.1 72.2 16.8 99.5-1.2zm-1.6 55.3c-.5 7.6-1 15.1-1.7 22.3-30 11.6-65 11.9-92.9.6-.7-7-1.2-14.3-1.7-21.7 28.2 14.2 71 15.9 96.3-1.2zm-5.7 56.1c-1.1 7.6-2.3 14.8-3.6 21.8-26.1 7.7-53.6 7.9-77.9.3-1.2-6.8-2.4-13.9-3.5-21.4 26.7 10.5 60.4 11.6 85-.7zM225 432.6c19.5 8.1 46.4 9.7 64.9.1-2.2 8.2-4.5 15.7-6.9 22.5-17.3 3.7-35.1 3.9-51.2-.2-2.4-6.7-4.6-14.2-6.8-22.4z";

const SVG_AMMONITE = "M203.656 18.594c-20.42.244-40.646 3.69-59.78 10l18.655 44.062-17.186 7.313-18.906-44.69c-20.745 9.09-39.768 21.67-55.813 37.314l28.563 27-12.813 13.594L57.97 86.374c-12.95 15.674-23.174 33.727-29.72 53.813l38.188 7.156-3.47 18.375-39.5-7.407a168.932 168.932 0 0 0-.905 4.812c-3.637 21.03-2.63 42.506 2.406 62.78l37.56-11.624 5.532 17.845-37.468 11.625c8.693 22.822 22.683 43.34 41 58.938l19.625-27.282 15.155 10.906-19.72 27.47c13.604 8.55 28.99 14.62 45.876 17.468 2.268.382 4.538.696 6.814.938l.937-32.063 18.69.53-.94 31.97c17.806-1.012 35.196-6.088 50.47-14.594L192.22 293l15.686-10.22 16.125 24.814c18.458-14.83 31.852-35.59 35.876-60.656 1.294-8.06 1.4-16.225.438-24.22l-26.313 6.063-4.218-18.218 26.344-6.062c-6.05-17.766-17.544-33.373-33.187-43.156l-10.595 22.594L195.47 176l10.468-22.375a70.759 70.759 0 0 0-9.5-2.156c-15.263-2.37-31.01 1.074-43.72 8.905l11.126 15.938L148.5 187l-10.063-14.406c-5.965 7.145-10.122 15.83-11.562 25.687-3.282 22.473 10.78 46.49 33.5 49.657 15.417 2.15 31.817-7.57 33.813-23.03l18.53 2.374c-3.468 26.873-30.073 42.623-54.937 39.157-34.097-4.755-54.066-38.93-49.405-70.843 6.343-43.43 50.054-68.933 90.906-62.594 53.438 8.29 85.36 61.194 79.626 112.063 7.897 7.11 19.648 11.173 33.813 12.093 15.244.99 32.824-1.718 49.186-7 16.362-5.28 31.51-13.155 41.97-21.78 10.22-8.43 15.18-17.07 15.312-23.814a238.112 238.112 0 0 0-9.844-35.03L353.594 197l-8.25-16.78 56.906-28.032c-11.99-26.314-28.637-50.273-48.906-70.438L311 124.97l-13.344-13.095 41.938-42.75c-23.064-19.49-49.934-34.32-79.47-42.78L247.25 80.468l-18.188-4.314L241.97 22c-.66-.125-1.31-.256-1.97-.375a191.86 191.86 0 0 0-36.344-3.03z";

const SVG_BRAIN = "M241.063 54.406a293.615 293.615 0 0 0-12.313.282c-8.814 1.567-12.884 5.426-15.094 9.843-2.435 4.87-2.34 11.423.375 17.25 2.717 5.83 7.7 10.596 14.657 12.376 6.958 1.78 16.536.86 29.125-7.187l10.063 15.75c-15.818 10.11-31.124 12.777-43.813 9.53-12.688-3.247-22.103-12.123-26.968-22.563-4.584-9.836-5.426-21.376-1.03-31.624-42.917 6.94-81.777 23.398-111.626 46.562-9.81 10.688-10.77 23.11-6.47 31.594 4.83 9.526 16.21 16.48 38.97 9.28l5.656 17.813c-28.58 9.04-52.137-.588-61.28-18.625-2.23-4.397-3.592-9.156-4.127-14.063-4.814 5.712-9.16 11.658-13 17.844l.126.06c-8.614 19.616-8.81 33.203-5.376 42.032 3.436 8.83 10.635 14.44 21.72 17.532 22.168 6.18 58.065-1.277 83.343-20.156 10.82-8.08 21.077-27.677 21.97-42.875.445-7.6-1.165-13.604-4.345-17.438-3.18-3.834-8.272-6.703-18.813-6.594l-.187-18.686c14.487-.15 26.25 4.754 33.375 13.344 7.124 8.59 9.26 19.652 8.625 30.468-1.27 21.633-12.595 44.172-29.438 56.75-29.876 22.314-69.336 31.606-99.53 23.188-13.988-3.9-26.37-12.386-32.75-25.53-9.546 45.446 4.323 87.66 30.718 116.874 3.45 3.82 7.122 7.43 10.97 10.78-2.754-7.887-4.016-16.1-3.72-24.093.53-14.325 6.082-28.346 17.22-38.03 9.134-7.946 21.752-12.53 36.843-12.5 1.006 0 2.034.018 3.062.06 2.35.1 4.763.304 7.22.626l-2.44 18.532c-15.588-2.048-25.705 1.522-32.436 7.375-6.73 5.854-10.443 14.614-10.813 24.625-.74 20.024 12.07 43.406 39.69 50.188l-.032.188c27.192 5.19 57.536.372 88-18.22.018-.012.043-.017.062-.03 6.34-4.45 9.755-8.808 11.438-12.563 1.985-4.432 1.943-8.292.53-12.438-2.824-8.29-12.94-16.812-22.218-19.187-15.002-3.84-24.532 1.436-29 7.72-4.468 6.28-4.74 12.45 2.156 17.81l-11.47 14.75c-14.187-11.033-15.092-30.487-5.905-43.405 6.892-9.688 18.985-16.326 33.564-16.75a46.963 46.963 0 0 1 1.844-.03c4.306.03 8.79.622 13.437 1.81 15.505 3.97 29.84 15.277 35.28 31.25a36.189 36.189 0 0 1 1.876 13.314c16.71-8.538 34.332-16.12 52.282-21.814 30.156-13.78 43.23-37.938 42.72-58.28-.515-20.493-13.187-37.74-42.376-40.626l1.844-18.594c36.666 3.626 58.462 29.848 59.188 58.75.422 16.84-5.754 34.363-18.188 49.28 16.072-1.8 32.044-1.495 47.53 1.627-3.152-6.472-4.68-13.478-4.467-20.438.677-22.036 19.42-42.593 48.875-42.906a66.155 66.155 0 0 1 6.03.218l-1.5 18.625c-24.927-1.998-34.3 11.086-34.718 24.656-.412 13.42 8.54 27.6 28.59 33.78 20.05 6.18 49.5 3.7 79.5-9.6 30-13.3 60.2-37.4 84.4-72.2-3.2-2.7-6.6-5.1-10.2-7.2-3.6-2.1-7.4-3.9-11.3-5.4-3.9-1.5-8-2.7-12.2-3.6-4.2-.9-8.5-1.5-12.9-1.8l1.4-18.7c5 .4 9.9 1.1 14.6 2.1 4.7 1 9.3 2.4 13.7 4.2 4.4 1.8 8.7 4 12.7 6.5 4 2.5 7.8 5.4 11.4 8.6 24.2-34.8 54.4-58.9 84.4-72.2 30-13.3 59.5-15.8 79.5-9.6 20.05 6.18 28.99 20.36 28.58 33.78-.41 13.42-9.79 26.5-34.72 24.65l-1.5-18.62a66.16 66.16 0 0 1 6.03-.22c29.46.32 48.2 20.88 48.88 42.91.21 6.96-1.32 13.97-4.47 20.44 15.49-3.12 31.46-3.43 47.53-1.63-12.43-14.92-18.61-32.44-18.18-49.28.72-28.9 22.52-55.13 59.18-58.75l1.85 18.59c-29.19 2.89-41.86 20.14-42.38 40.63-.51 20.34 12.57 44.5 42.72 58.28 17.95 5.69 35.57 13.28 52.28 21.81a36.19 36.19 0 0 1 1.88-13.31c5.44-15.97 19.78-27.28 35.28-31.25 4.65-1.19 9.13-1.78 13.44-1.81a46.96 46.96 0 0 1 1.84.03c14.58.42 26.67 7.06 33.56 16.75 9.19 12.92 8.28 32.37-5.9 43.41l-11.47-14.75c6.9-5.36 6.62-11.53 2.16-17.81-4.47-6.28-14-11.56-29-7.72-9.28 2.38-19.4 10.9-22.22 19.19-1.41 4.15-1.46 8.01.53 12.44 1.68 3.75 5.1 8.11 11.44 12.56.02.01.04.02.06.03 30.46 18.59 60.81 23.41 88 18.22l-.03-.19c27.62-6.78 40.43-30.16 39.69-50.19-.37-10.01-4.08-18.77-10.81-24.62-6.73-5.86-16.85-9.42-32.44-7.38l-2.44-18.53c2.46-.32 4.87-.53 7.22-.63 1.03-.04 2.06-.06 3.06-.06 15.09 0 27.71 4.59 36.84 12.5 11.14 9.69 16.69 23.71 17.22 38.04.3 7.99-.96 16.2-3.72 24.09 3.85-3.35 7.52-6.96 10.97-10.78 26.4-29.21 40.27-71.43 30.72-116.88-6.38 13.15-18.76 21.63-32.75 25.54-30.19 8.42-69.65-.88-99.53-23.19-16.84-12.58-28.17-35.12-29.44-56.75-.63-10.82 1.5-21.88 8.63-30.47 7.12-8.59 18.88-13.49 33.37-13.34l-.18 18.69c-10.55-.11-15.64 2.76-18.82 6.59-3.18 3.84-4.79 9.84-4.34 17.44.89 15.2 11.15 34.79 21.97 42.88 25.28 18.88 61.18 26.33 83.34 20.16 11.09-3.09 18.28-8.7 21.72-17.53 3.44-8.83 3.24-22.42-5.38-42.04l.13-.06c-3.84-6.18-8.19-12.13-13-17.84-.54 4.91-1.9 9.67-4.13 14.06-9.14 18.04-32.7 27.67-61.28 18.63l5.66-17.82c22.76 7.2 34.14.25 38.97-9.28 4.3-8.48 3.34-20.91-6.47-31.59-29.85-23.16-68.71-39.62-111.63-46.56 4.4 10.25 3.55 21.79-1.03 31.62-4.86 10.44-14.28 19.32-26.97 22.56-12.68 3.25-27.99.58-43.81-9.53l10.06-15.75c12.59 8.05 22.17 8.97 29.13 7.19 6.96-1.78 11.94-6.55 14.66-12.38 2.71-5.82 2.81-12.38.37-17.25-2.21-4.42-6.28-8.27-15.09-9.84a293.6 293.6 0 0 0-12.31-.28z";

const SVG_SPIKED_TENTACLE = "M126.21 44.816c-28.57.028-62.253 6.175-101.43 19.473v206.177c34.753-70.097 94.796-95.33 118.277-33.147.682.01 1.364.025 2.04.055 3.224.144 6.385.534 9.47 1.213 12.338 2.715 23.426 11.78 27.183 25.8 1.956 7.3 1.593 14.67-1.373 20.794-2.966 6.124-8.112 10.54-13.865 13.576-4.176 2.204-8.76 3.83-13.647 5.02.002.47.014.92.014 1.394a85.044 85.044 0 0 0 3.57 24.435c1.256-.51 2.525-.98 3.81-1.386a37.095 37.095 0 0 1 11.122-1.732c8.973-.013 18.105 3.27 25.32 10.487 5.345 5.344 8.714 11.907 9.208 18.693.494 6.786-1.756 13.183-5.22 18.69-1.63 2.588-3.532 5.05-5.653 7.41 10.645 7.775 22.837 14.108 36.008 18.71 1-2.945 2.326-5.773 4.08-8.437 5.995-9.102 17.213-14.595 30.828-14.595 14.235 0 25.768 7.644 29.588 18.42 1.417 3.995 2.053 8.125 2.118 12.352 16.59-1.707 33.3-6.156 49.358-13.756.152-8.87 4.284-18.062 12.052-25.83 6.29-6.292 13.948-9.724 21.325-10.214a26.966 26.966 0 0 1 1.654-.06c3.846-.026 7.58.763 10.967 2.376.103.05.2.107.302.157.835-.87 1.665-1.75 2.49-2.644 39.125-42.52 48.15-142.046 1.018-199.545-45.518-55.526-192.24 13.158-82.676 100.54-41.65-77.294 28.077-75.698 46.442-43.89 20.212 35.01 23.473 84.05-28.07 113.808-40.74 23.524-86.61-26.748-79.102-97.476 11.57-109.013-25.18-186.965-127.21-186.866zm167.315 47.778c-3.595 12.322-5.927 36.444-1.285 50.838 7.242-4.467 20.556-9.718 28.203-12.64-4.625-12.596-17.803-27.15-26.918-38.198zm118.914 7.746c-12 4.557-32.654 17.232-41.344 29.61 7.927 3.09 20.143 10.55 27.084 14.892 7.264-11.282 10.935-30.57 14.26-44.502zm28.753 89.523c-3.682-.066-7.177.133-10.33.66 3.792 8.808 7.462 24.518 9.465 33.526 14.805-3.092 33.197-15.397 47.016-23.747-10.684-4.902-30.192-10.152-46.15-10.44zm-299.51 66.23c-6.372.107-13.992 1.302-22.08 3.464-16.965 4.533-35.67 12.95-51.343 20.99 16.297 4.056 37.71 7.523 56.422 7.418 14.068-.08 26.53-2.266 33.107-5.736 3.287-1.737 4.947-3.5 5.767-5.193.82-1.693 1.22-3.78.14-7.81-2.193-8.187-5.76-10.762-13.146-12.387-1.846-.406-3.933-.646-6.218-.725a50.45 50.45 0 0 0-2.65-.02zm299.23 37.33c1.846 9.19-5.056 29.82-10.126 37.53 15.95 5.515 40.613 4.254 58.625 4.166-9.14-13.307-30.785-34.768-48.498-41.698zm-268.393 51.34c-.543.006-1.097.046-1.666.116-1.518.185-3.144.586-4.946 1.157-7.208 2.286-16.415 8.81-25.443 17.826-12.424 12.408-24.413 29.05-33.967 43.85 16.142-4.636 36.42-12.343 52.57-21.79 12.144-7.102 21.843-15.225 25.803-21.52 1.98-3.146 2.536-5.502 2.4-7.378-.137-1.876-.83-3.885-3.782-6.836-3.932-3.933-7.17-5.478-10.968-5.428zm208.722 31.633c-2.278-.144-4.678 1.167-8.96 5.448-6.627 6.628-7.317 10.62-6.387 15.136.93 4.517 4.95 10.543 11.79 16.743 9.61 8.715 23.68 17.07 37.524 24.96-3.23-14.377-8.502-31.08-15.27-43.492-5.04-9.243-10.957-15.676-14.965-17.586-1.002-.478-1.89-.86-2.758-1.06a5.881 5.881 0 0 0-.975-.148zm-115.29 19.74c-9.372 0-12.683 2.334-15.22 6.184-2.536 3.85-3.952 10.955-3.502 20.174.634 12.96 4.674 28.816 8.883 44.184 7.885-12.45 15.968-27.99 19.96-41.55 2.972-10.1 3.336-18.834 1.853-23.02-1.484-4.184-2.748-5.973-11.973-5.973z";

const SVG_EEL = "M290.4 27.83C219 81.44 130.3 113.9 52.29 159.4c-5.97 3.5-7.78 6.9-8.57 12.3s.37 13.1 2.91 21.6c1.4 4.6 3.19 9.5 5.1 14.5 6.06-11.5 15.22-22.5 26.17-32.9 23.1-22.1 55.4-42.7 89.2-61.2 67.8-36.97 142.8-65.34 165.3-74.39-15.1-2.99-29.9-6.48-42-11.48zm94.1 18.23c-14.6 0-28.6 3.2-44.9 9.78-23 9.25-97.4 37.37-163.9 73.66-33.2 18.1-64.3 38.2-85.37 58.4-21.14 20.2-31.24 39.2-27.8 55.8 4.07 19.6 23.14 34.1 52.97 44.7 30 10.6 69.4 16.6 108.4 20.3 39.1 3.6 77.9 5 107.6 6.9 14.9 1 27.5 2.1 37.1 3.8 4.8.9 8.9 1.9 12.7 3.4 3.6 1.5 8 3.8 9.6 9.7 3.2 11.7-1.4 23.6-9.6 32.6-8.4 9.1-20.3 16.7-34.7 23.9-28.7 14.5-68 26.9-108.1 38-40.3 11-81.4 20.5-113.3 28.6-15.9 4.1-29.51 7.7-39.36 11-3.97 1.3-6.78 2.4-9.33 3.5 7.74 2.1 21.67 3.6 39.19 3.8 36.3.5 88.4-3.8 141.6-13.5 53.1-9.7 107.2-24.8 148-45.1 40.7-20.3 66.5-45.1 68.2-73.1 1.9-27.4-12.1-44.3-37.1-57.9-25-13.5-60.9-21.7-97.1-26.9-36.4-5.2-73.4-7.6-101.8-10.8-14.4-1.7-26.4-3.4-35.6-6.1-4.8-1.4-8.8-2.9-12.4-5.5-3.5-2.5-7.1-6.9-7.5-12.4-.4-8 4-14.7 9.4-20.2 5.3-5.6 12.3-10.5 20.6-15.3 16.5-9.5 38-18.3 59.4-26.1 42.7-15.5 85.5-26.4 85.5-26.4l1.5-.4 1.4.1c29.1 2.1 64.3-3.8 89.7-15.7 12.8-5.9 22.9-13.3 29-21.23 3.9-5.05 6-10.16 6.6-15.76-36.8 12.56-48.6 18.26-78.3 19.49l-.9-18.03c24.9-.98 34.1-4.88 62-14.57-26.1-10.97-46.5-18.01-64.3-20.85-5.6-.91-11-1.43-16.2-1.56h-2.9zm-11 17.11a16 16 0 0 1 16 16 16 16 0 0 1-16 16 16 16 0 0 1-16-16 16 16 0 0 1 16-16zM214.7 206.6c-4.3 2.9-8.1 5.8-10.6 8.3-2.6 2.7-3.4 4.5-3.6 5.7 1 .6 3.1 1.6 6.4 2.6 7.2 2.1 18.7 3.9 32.6 5.5 27.6 3.1 64.9 5.6 102.3 10.9 37.2 5.4 74.6 13.4 103.1 28.9 16.5 8.9 30 20.8 38.4 35.9.8-10.4.1-23.4-3.7-41.2C406 230 298.9 224 214.7 206.6zm157.8 140c-86.6 25.6-158.5 61.1-270.6 74.1-44.78 5.3-56.15 28-75.05 50.3 2.59 3.2 6.97 6.1 13.79 8.4 6.07 2.2 13.65 3.7 22.06 4.8-2.15-1.2-4.12-2.7-5.9-4.8-1.89-2.3-3.31-5.8-3.18-9.2.13-3.4 1.55-6.3 3.23-8.6 2.95-3.9 6.03-5.2 9.79-7 3.77-1.7 8.28-3.4 13.61-5.2 10.65-3.4 24.55-7.2 40.55-11.2 32.2-8.2 73.2-17.7 112.9-28.6 39.7-10.9 78.2-23.3 104.9-36.7 13.3-6.6 23.5-13.6 29.3-19.9 2.2-2.4 3.7-4.5 4.6-6.4z";

const OUTLINE_CATALOG: OutlineCategory[] = [
  // ── Top-down / dorsal planforms (best in top-down view) ──
  {
    id: 'topdown-bodies',
    label: 'Top-Down Bodies',
    icon: <EyeIcon className="w-4 h-4" />,
    parts: [
      svgPart('body-manta', 'Manta Ray Planform', 'Manta',
        <FlipHorizontal className="w-4 h-4" />, SVG_MANTA_RAY,
        { targetSize: 5.0, maxPoints: 30, symmetric: true, views: ['top-down'] }),
      svgPart('body-crab', 'Crab Planform', 'Crab',
        <Network className="w-4 h-4" />, SVG_CRAB,
        { targetSize: 4.5, maxPoints: 30, symmetric: true, views: ['top-down'] }),
      svgPart('body-octopus', 'Octopus Planform', 'Octopus',
        <Sprout className="w-4 h-4" />, SVG_OCTOPUS,
        { targetSize: 4.5, maxPoints: 30, symmetric: true, views: ['top-down'] }),
      svgPart('body-turtle', 'Sea Turtle Planform', 'Turtle',
        <Waves className="w-4 h-4" />, SVG_SEA_TURTLE,
        { targetSize: 5.0, maxPoints: 30, symmetric: true, views: ['top-down'] }),
      svgPart('body-trilobite', 'Trilobite Planform', 'Trilobite',
        <Bone className="w-4 h-4" />, SVG_TRILOBITE,
        { targetSize: 4.5, maxPoints: 30, symmetric: true, views: ['top-down'] }),
      svgPart('body-ammonite', 'Ammonite Planform', 'Ammonite',
        <CircleDot className="w-4 h-4" />, SVG_AMMONITE,
        { targetSize: 4.5, maxPoints: 30, views: ['top-down'] }),
      svgPart('body-butterfly', 'Butterfly Planform', 'Butterfly',
        <Sparkles className="w-4 h-4" />, SVG_BUTTERFLY,
        { targetSize: 4.5, maxPoints: 28, symmetric: true, views: ['top-down'] }),
      svgPart('body-eel', 'Eel Planform', 'Eel',
        <SplineIcon className="w-4 h-4" />, SVG_EEL,
        { targetSize: 5.0, maxPoints: 28, views: ['top-down', 'side'] }),
    ],
  },
  // ── Top-down organs & appendages ──
  {
    id: 'topdown-organs',
    label: 'Top-Down Organs',
    icon: <Brain className="w-4 h-4" />,
    parts: [
      svgPart('organ-brain', 'Brain (dorsal)', 'Brain',
        <Brain className="w-4 h-4" />, SVG_BRAIN,
        { targetSize: 3.0, maxPoints: 28, symmetric: true, views: ['top-down'] }),
      svgPart('appendage-spiked-tent', 'Spiked Tentacle', 'Spiked Tent',
        <Sprout className="w-4 h-4" />, SVG_SPIKED_TENTACLE,
        { targetSize: 4.0, maxPoints: 30, views: ['top-down', 'side'] }),
    ],
  },
  // ── Side-profile tails & flukes ──
  {
    id: 'tails',
    label: 'Tails & Flukes',
    icon: <Waves className="w-4 h-4" />,
    parts: [
      svgPart('fluke-whale', 'Whale Tail Fluke', 'Whale Fluke',
        <Waves className="w-4 h-4" />, SVG_WHALE_TAIL,
        { targetSize: 3.5, maxPoints: 26, symmetric: true, views: ['side', 'back'] }),
      svgPart('tail-scorpion', 'Scorpion Tail', 'Scorpion',
        <SplineIcon className="w-4 h-4" />, SVG_SCORPION_TAIL,
        { targetSize: 3.5, maxPoints: 28, views: ['side'] }),
      svgPart('tail-jelly', 'Jellyfish Bell', 'Jellyfish',
        <Sprout className="w-4 h-4" />, SVG_JELLYFISH,
        { targetSize: 3.0, maxPoints: 24, symmetric: true, views: ['side', 'front', 'back'] }),
    ],
  },
  // ── Side-profile fins ──
  {
    id: 'fins',
    label: 'Fins',
    icon: <FlipHorizontal className="w-4 h-4" />,
    parts: [
      svgPart('fin-shark-dorsal', 'Shark Dorsal Fin', 'Shark Dorsal',
        <FlipVertical className="w-4 h-4" />, SVG_SHARK_FIN,
        { targetSize: 2.5, maxPoints: 22, views: ['side'] }),
      svgPart('fin-bat-wing', 'Bat Wing Fin', 'Bat Wing',
        <FlipHorizontal className="w-4 h-4" />, SVG_BAT_WING,
        { targetSize: 4.0, maxPoints: 28, symmetric: true, views: ['side', 'front', 'back'] }),
    ],
  },
  // ── Horns & spikes (mostly side/front) ──
  {
    id: 'horns',
    label: 'Horns & Spikes',
    icon: <Zap className="w-4 h-4" />,
    parts: [
      svgPart('horn-bull', 'Bull Horns', 'Bull Horns',
        <Zap className="w-4 h-4" />, SVG_BULL_HORNS,
        { targetSize: 3.5, maxPoints: 26, symmetric: true, views: ['front', 'side'] }),
      svgPart('horn-tooth', 'Fang / Tooth', 'Fang',
        <Crosshair className="w-4 h-4" />, SVG_TOOTH,
        { targetSize: 2.0, maxPoints: 18, views: ['side', 'front'] }),
    ],
  },
  // ── Appendages (side profile) ──
  {
    id: 'appendages',
    label: 'Appendages',
    icon: <Sprout className="w-4 h-4" />,
    parts: [
      svgPart('tentacle-curled', 'Curled Tentacle', 'Curled Tent',
        <Sprout className="w-4 h-4" />, SVG_CURL_TENT,
        { targetSize: 3.5, maxPoints: 28, views: ['side'] }),
      svgPart('mandible-insect', 'Insect Mandibles', 'Mandibles',
        <Bone className="w-4 h-4" />, SVG_INSECT_JAWS,
        { targetSize: 3.0, maxPoints: 26, symmetric: true, views: ['front', 'side'] }),
      svgPart('claw-grasping', 'Grasping Claws', 'Claws',
        <Network className="w-4 h-4" />, SVG_GRASP_CLAWS,
        { targetSize: 3.0, maxPoints: 24, symmetric: true, views: ['front', 'side'] }),
    ],
  },
  // ── Heads & crests (side profile) ──
  {
    id: 'heads',
    label: 'Heads & Crests',
    icon: <EyeIcon className="w-4 h-4" />,
    parts: [
      svgPart('head-dragon', 'Dragon Head', 'Dragon Head',
        <EyeIcon className="w-4 h-4" />, SVG_DRAGON_HEAD,
        { targetSize: 3.5, maxPoints: 28, views: ['side'] }),
      svgPart('head-walrus', 'Walrus Head', 'Walrus',
        <CircleDot className="w-4 h-4" />, SVG_WALRUS_HEAD,
        { targetSize: 3.0, maxPoints: 26, symmetric: true, views: ['front', 'side'] }),
      svgPart('head-anglerfish', 'Anglerfish Head', 'Anglerfish',
        <Sparkles className="w-4 h-4" />, SVG_ANGLER_FISH,
        { targetSize: 4.0, maxPoints: 28, views: ['side'] }),
    ],
  },
];

// ── Organ catalog for the right-side drawer ──
// Each organ has an icon, display name, and belongs to a pipeline category.
interface OrganCatalogEntry {
  nodeId: string;
  name: string;
  shortName: string;
  icon: React.ReactNode;
  radius: number; // world-space radius in meters (derived from 3D Canvas3D geometry)
}

// Radii are derived from the 3D mesh sizes in Canvas3D.tsx, using a typical
// heartNode.radius ≈ 1.2m (14m ship, 2.4m thorax). Each value approximates
// the visual extent of the organ's 3D geometry projected to 2D top-down.
const ORGAN_CATALOG: Record<OrganPipelineType, OrganCatalogEntry[]> = {
  BIO_PLASMA: [
    { nodeId: 'plasma_gland',        name: 'Bio-Plasma Electrolysis Gland',       shortName: 'Plasma Gland',      icon: <Flame className="w-4 h-4" />,      radius: 0.70 },
    { nodeId: 'plasma_bladder',      name: 'Muscular Plasma Bladder Reservoir',   shortName: 'Plasma Bladder',    icon: <Container className="w-4 h-4" />,  radius: 0.55 },
    // plasma_trunk, caudal_manifold — veiny conduits, auto-created on connect
    { nodeId: 'siphon_vent_nozzle',  name: 'Bio-Plasma Vent Nozzles',             shortName: 'Vent Nozzles',      icon: <Crosshair className="w-4 h-4" />,  radius: 0.35 },
    { nodeId: 'disruptor_gland',     name: 'Bio-Plasma Disruptor Glands',         shortName: 'Disruptor Glands',  icon: <Sparkles className="w-4 h-4" />,   radius: 0.50 },
  ],
  HEMOLYMPH: [
    { nodeId: 'heart_core',          name: 'Aorta Bioluminescent Central Engine', shortName: 'Heart Core',        icon: <Heart className="w-4 h-4" />,      radius: 0.80 },
    { nodeId: 'hemolymph_atrium',    name: 'Hemolymph Atrium Reservoir',          shortName: 'Atrium',            icon: <Droplet className="w-4 h-4" />,    radius: 0.45 },
    // aorta_highway, flank_artery — veiny conduits, auto-created on connect
    { nodeId: 'spiracle_vent',       name: 'Respiratory Spiracle Gill Vents',     shortName: 'Spiracle Vents',    icon: <Wind className="w-4 h-4" />,       radius: 0.35 },
  ],
  NERVOUS: [
    { nodeId: 'brain_core',          name: 'Primary Ganglion Brain Core',         shortName: 'Brain Core',        icon: <Brain className="w-4 h-4" />,      radius: 0.50 },
    { nodeId: 'neuro_link',          name: 'Human Neuro-Link Interface Pod',      shortName: 'Neuro-Link Pod',    icon: <Cog className="w-4 h-4" />,        radius: 0.35 },
    // axon_cord — veiny conduit, auto-created on connect
    { nodeId: 'ocular_pod',          name: 'Ocular Beam Stalk Pods',              shortName: 'Ocular Pods',       icon: <EyeIcon className="w-4 h-4" />,    radius: 0.35 },
    { nodeId: 'muscle_tendon',       name: 'Biomechanical Muscle Tendons',        shortName: 'Muscle Tendons',    icon: <Wrench className="w-4 h-4" />,     radius: 0.30 },
  ],
  LIFE_SUPPORT: [
    { nodeId: 'ice_gizzard',         name: 'Comet Ice Ingestion Gizzard',         shortName: 'Ice Gizzard',       icon: <Snowflake className="w-4 h-4" />,  radius: 0.80 },
    { nodeId: 'bio_moss',            name: 'Photosynthetic Bio-Moss Bed',         shortName: 'Bio-Moss Bed',      icon: <Sprout className="w-4 h-4" />,     radius: 0.55 },
    { nodeId: 'habitat_chamber',     name: 'Human Habitat Room Chambers',         shortName: 'Habitat Chambers',  icon: <Home className="w-4 h-4" />,       radius: 0.90 },
    { nodeId: 'cyber_airlock',       name: 'Cyber-Airlock Stomata Valves',        shortName: 'Airlock Valves',    icon: <DoorOpen className="w-4 h-4" />,   radius: 0.30 },
  ],
  ARMOR_DEFENSE: [
    { nodeId: 'chitin_vertebra',     name: 'Chitinous Bone Vertebrae Column',     shortName: 'Vertebrae Column',  icon: <Bone className="w-4 h-4" />,       radius: 0.30 },
    { nodeId: 'carapace_plate',      name: 'Overlapping Carapace Plates',         shortName: 'Carapace Plates',   icon: <Shield className="w-4 h-4" />,     radius: 0.40 },
    { nodeId: 'bio_nanite_bed',      name: 'Bio-Nanite Coagulation Bed',          shortName: 'Nanite Bed',        icon: <CircleDot className="w-4 h-4" />,  radius: 0.60 },
    { nodeId: 'shield_emitter',      name: 'Repulsion Shield Emitter Nodes',      shortName: 'Shield Emitters',   icon: <Boxes className="w-4 h-4" />,      radius: 0.30 },
  ],
};

// ── Veiny conduit organs (auto-created, not in drawer) ─────────────────────
// These are tube/conduit organs that form the "veins" between organs.
// They are automatically created at the midpoint when two organs are connected.
const CONDUIT_ORGANS: Record<string, { nodeId: string; name: string; shortName: string; pipeline: OrganPipelineType; radius: number }> = {
  plasma_trunk:     { nodeId: 'plasma_trunk',     name: 'Primary Plasma Trunk Highway',       shortName: 'Plasma Trunk',     pipeline: 'BIO_PLASMA',   radius: 0.30 },
  caudal_manifold:  { nodeId: 'caudal_manifold',  name: 'Caudal Manifold Distribution Trunk',  shortName: 'Caudal Manifold',  pipeline: 'BIO_PLASMA',   radius: 0.40 },
  aorta_highway:    { nodeId: 'aorta_highway',    name: 'Central Aorta Highway',               shortName: 'Aorta Highway',    pipeline: 'HEMOLYMPH',    radius: 0.30 },
  flank_artery:     { nodeId: 'flank_artery',     name: 'Luminescent Flank Arteries',          shortName: 'Flank Artery',     pipeline: 'HEMOLYMPH',    radius: 0.25 },
  axon_cord:        { nodeId: 'axon_cord',        name: 'Spinal Axon Cord Highway',            shortName: 'Axon Cord',        pipeline: 'NERVOUS',      radius: 0.25 },
};

// Conduit path rules: when connecting fromNodeId → toNodeId, these conduit
// organs are auto-created in sequence between them.
// Key format: "sourceNodeId→targetNodeId"
const CONDUIT_PATHS: Record<string, string[]> = {
  'plasma_bladder→siphon_vent_nozzle':  ['plasma_trunk', 'caudal_manifold'],
  'plasma_bladder→disruptor_gland':     ['plasma_trunk'],
  'plasma_trunk→siphon_vent_nozzle':    ['caudal_manifold'],
  'hemolymph_atrium→spiracle_vent':     ['aorta_highway', 'flank_artery'],
  'hemolymph_atrium→flank_artery':      ['aorta_highway'],
  'aorta_highway→spiracle_vent':        ['flank_artery'],
  'neuro_link→muscle_tendon':           ['axon_cord'],
};

// ── Organ inner nodes (requirement ports) ──────────────────────────────────
// Each organ has input ports (upstream requirements) and output ports
// (downstream consumers) derived from the pipeline graph topology.
// These are rendered as small balls inside the organ circle.
// Veiny conduit organs also have ports — they are auto-created when
// two non-conduit organs are connected and a conduit path exists between them.

interface OrganNodePort {
  nodeId: string;    // target organ nodeId this port connects to
  direction: 'in' | 'out';
  label: string;     // short label for the port
}

const ORGAN_NODES: Record<string, OrganNodePort[]> = {
  // Bio-Plasma — each organ has pipeline ports + neural control (in) + vascular supply (in)
  plasma_gland:       [{ nodeId: 'ice_gizzard',     direction: 'in',  label: 'H₂O' }, { nodeId: 'plasma_bladder',  direction: 'out', label: 'Plasma' }, { nodeId: 'brain_core', direction: 'in', label: 'Neural' }, { nodeId: 'heart_core', direction: 'in', label: 'Blood' }],
  plasma_bladder:     [{ nodeId: 'plasma_gland',    direction: 'in',  label: 'Plasma' }, { nodeId: 'plasma_trunk',   direction: 'out', label: 'Fuel' }, { nodeId: 'brain_core', direction: 'in', label: 'Neural' }, { nodeId: 'heart_core', direction: 'in', label: 'Blood' }],
  plasma_trunk:       [{ nodeId: 'plasma_bladder',  direction: 'in',  label: 'Fuel' }, { nodeId: 'caudal_manifold', direction: 'out', label: 'Thrust' }, { nodeId: 'disruptor_gland', direction: 'out', label: 'Weapon' }, { nodeId: 'brain_core', direction: 'in', label: 'Neural' }, { nodeId: 'heart_core', direction: 'in', label: 'Blood' }],
  caudal_manifold:    [{ nodeId: 'plasma_trunk',    direction: 'in',  label: 'Fuel' }, { nodeId: 'siphon_vent_nozzle', direction: 'out', label: 'Thrust' }, { nodeId: 'brain_core', direction: 'in', label: 'Neural' }, { nodeId: 'heart_core', direction: 'in', label: 'Blood' }],
  siphon_vent_nozzle: [{ nodeId: 'caudal_manifold', direction: 'in',  label: 'Thrust' }, { nodeId: 'brain_core', direction: 'in', label: 'Neural' }, { nodeId: 'heart_core', direction: 'in', label: 'Blood' }],
  disruptor_gland:    [{ nodeId: 'plasma_trunk',    direction: 'in',  label: 'Fuel' }, { nodeId: 'brain_core', direction: 'in', label: 'Neural' }, { nodeId: 'heart_core', direction: 'in', label: 'Blood' }],
  // Hemolymph — each organ has pipeline ports + neural control (in). Heart doesn't need blood from itself.
  heart_core:         [{ nodeId: 'bio_moss',        direction: 'in',  label: 'O₂' }, { nodeId: 'hemolymph_atrium', direction: 'out', label: 'Blood' }, { nodeId: 'brain_core', direction: 'in', label: 'Neural' }],
  hemolymph_atrium:   [{ nodeId: 'heart_core',      direction: 'in',  label: 'Blood' }, { nodeId: 'aorta_highway',  direction: 'out', label: 'Flow' }, { nodeId: 'brain_core', direction: 'in', label: 'Neural' }, { nodeId: 'heart_core', direction: 'in', label: 'Blood' }],
  aorta_highway:      [{ nodeId: 'hemolymph_atrium',direction: 'in',  label: 'Flow' }, { nodeId: 'flank_artery',   direction: 'out', label: 'Flow' }, { nodeId: 'brain_core', direction: 'in', label: 'Neural' }, { nodeId: 'heart_core', direction: 'in', label: 'Blood' }],
  flank_artery:       [{ nodeId: 'aorta_highway',   direction: 'in',  label: 'Flow' }, { nodeId: 'spiracle_vent',  direction: 'out', label: 'Flow' }, { nodeId: 'brain_core', direction: 'in', label: 'Neural' }, { nodeId: 'heart_core', direction: 'in', label: 'Blood' }],
  spiracle_vent:      [{ nodeId: 'flank_artery',    direction: 'in',  label: 'Flow' }, { nodeId: 'brain_core', direction: 'in', label: 'Neural' }, { nodeId: 'heart_core', direction: 'in', label: 'Blood' }],
  // Nervous — brain doesn't need neural from itself. Brain needs blood. Neuro-link needs blood.
  brain_core:         [{ nodeId: 'bio_moss',        direction: 'in',  label: 'O₂' }, { nodeId: 'neuro_link',     direction: 'out', label: 'Pilot' }, { nodeId: 'ocular_pod',  direction: 'in',  label: 'Vision' }, { nodeId: 'heart_core', direction: 'in', label: 'Blood' }],
  neuro_link:         [{ nodeId: 'brain_core',      direction: 'in',  label: 'Pilot' }, { nodeId: 'axon_cord',     direction: 'out', label: 'Motor' }, { nodeId: 'command_room',  direction: 'out', label: 'Pilot' }, { nodeId: 'heart_core', direction: 'in', label: 'Blood' }],
  axon_cord:          [{ nodeId: 'neuro_link',      direction: 'in',  label: 'Motor' }, { nodeId: 'muscle_tendon', direction: 'out', label: 'Move' }, { nodeId: 'chitin_vertebra', direction: 'in', label: 'Spine' }, { nodeId: 'heart_core', direction: 'in', label: 'Blood' }],
  ocular_pod:         [{ nodeId: 'brain_core',      direction: 'out', label: 'Vision' }, { nodeId: 'heart_core', direction: 'in', label: 'Blood' }],
  muscle_tendon:      [{ nodeId: 'axon_cord',       direction: 'in',  label: 'Move' }, { nodeId: 'heart_core', direction: 'in', label: 'Blood' }],
  // Life Support — each organ has pipeline ports + neural control (in) + vascular supply (in)
  ice_gizzard:        [{ nodeId: 'bio_moss',        direction: 'out', label: 'Water' }, { nodeId: 'plasma_gland',  direction: 'out', label: 'H₂O' }, { nodeId: 'brain_core', direction: 'in', label: 'Neural' }, { nodeId: 'heart_core', direction: 'in', label: 'Blood' }],
  bio_moss:           [{ nodeId: 'ice_gizzard',     direction: 'in',  label: 'Water' }, { nodeId: 'habitat_chamber', direction: 'out', label: 'O₂' }, { nodeId: 'heart_core', direction: 'out', label: 'O₂' }, { nodeId: 'brain_core', direction: 'out', label: 'O₂' }, { nodeId: 'brain_core', direction: 'in', label: 'Neural' }, { nodeId: 'heart_core', direction: 'in', label: 'Blood' }],
  habitat_chamber:    [{ nodeId: 'bio_moss',        direction: 'in',  label: 'O₂' }, { nodeId: 'cyber_airlock',  direction: 'out', label: 'EVA' }, { nodeId: 'brain_core', direction: 'in', label: 'Neural' }, { nodeId: 'heart_core', direction: 'in', label: 'Blood' }],
  cyber_airlock:      [{ nodeId: 'habitat_chamber', direction: 'in',  label: 'EVA' }, { nodeId: 'brain_core', direction: 'in', label: 'Neural' }, { nodeId: 'heart_core', direction: 'in', label: 'Blood' }],
  // Armor & Defense — vertebra has spine port for axon_cord (L12)
  chitin_vertebra:    [{ nodeId: 'carapace_plate',  direction: 'out', label: 'Armor' }, { nodeId: 'axon_cord', direction: 'out', label: 'Spine' }, { nodeId: 'brain_core', direction: 'in', label: 'Neural' }, { nodeId: 'heart_core', direction: 'in', label: 'Blood' }],
  carapace_plate:     [{ nodeId: 'chitin_vertebra', direction: 'in',  label: 'Spine' }, { nodeId: 'bio_nanite_bed', direction: 'out', label: 'Repair' }, { nodeId: 'brain_core', direction: 'in', label: 'Neural' }, { nodeId: 'heart_core', direction: 'in', label: 'Blood' }],
  bio_nanite_bed:     [{ nodeId: 'carapace_plate',  direction: 'in',  label: 'Armor' }, { nodeId: 'shield_emitter', direction: 'out', label: 'Shield' }, { nodeId: 'brain_core', direction: 'in', label: 'Neural' }, { nodeId: 'heart_core', direction: 'in', label: 'Blood' }],
  shield_emitter:     [{ nodeId: 'bio_nanite_bed',  direction: 'in',  label: 'Shield' }, { nodeId: 'brain_core', direction: 'in', label: 'Neural' }, { nodeId: 'heart_core', direction: 'in', label: 'Blood' }],
};

// ── Command room crew stations ─────────────────────────────────────────────
// Each station is a separate input node inside the command room.
// All stations receive from the single neuro_link "Pilot" output.
// Stations scale with crew size (1-5), filled in priority order.
interface CrewStation {
  id: string;        // station identifier
  name: string;      // short label (rendered inside room)
  role: string;      // full role name
  channel: string;   // neural-link channel (which ship system this station interfaces with)
  channelNodeId: string; // the organ nodeId this station ultimately connects to
}

const COMMAND_ROOM_STATIONS: CrewStation[] = [
  { id: 'commander',  name: 'CMD',  role: 'Commander',         channel: 'Pilot',  channelNodeId: 'neuro_link'  }, // Direct brain ↔ pilot
  { id: 'helm',       name: 'HELM', role: 'Helm',              channel: 'Motor',  channelNodeId: 'axon_cord'   }, // Spinal cord motor
  { id: 'bio',        name: 'BIO',  role: 'Bio-Systems',       channel: 'Auto',   channelNodeId: 'brain_core'  }, // Autonomic ganglia
  { id: 'tactical',   name: 'TAC',  role: 'Tactical',          channel: 'Weapon', channelNodeId: 'brain_core'  }, // Weapon ganglia
  { id: 'science',    name: 'SCI',  role: 'Science/Sensors',   channel: 'Sensor', channelNodeId: 'ocular_pod'  }, // Sensory ganglia
];

// Set of all conduit nodeIds for quick lookup
const CONDUIT_NODE_IDS = new Set(Object.keys(CONDUIT_ORGANS));

// Helper: find conduit path between two organ nodeIds.
// Returns array of conduit nodeIds to create between them, or empty array.
function findConduitPath(fromNodeId: string, toNodeId: string): string[] {
  // Direct lookup
  const key = `${fromNodeId}→${toNodeId}`;
  if (CONDUIT_PATHS[key]) return CONDUIT_PATHS[key];
  // Check if target is a conduit organ itself — no auto-conduit needed
  if (CONDUIT_NODE_IDS.has(toNodeId) || CONDUIT_NODE_IDS.has(fromNodeId)) return [];
  return [];
}

// Helper: check if a nodeId is a conduit organ
function isConduitOrgan(nodeId: string): boolean {
  return CONDUIT_NODE_IDS.has(nodeId);
}

// Helper: get the pipeline color for a target nodeId (for coloring inner nodes)
function nodePipelineColor(nodeId: string): number {
  // Command room connects via the nervous system
  if (nodeId === 'command_room') return PIPELINE_COLORS.NERVOUS;
  for (const pipeline of Object.keys(ORGAN_CATALOG) as OrganPipelineType[]) {
    const entry = ORGAN_CATALOG[pipeline].find((o) => o.nodeId === nodeId);
    if (entry) return PIPELINE_COLORS[pipeline];
  }
  return 0x64748b; // slate fallback
}

/**
 * Engineering View — top-down 2D blueprint canvas for living ship design.
 *
 * Design language (per AGENTS.md aesthetic direction):
 * - Interface Layer (Frutiger Aero / Skeuomorphic Futurism): glossy white surfaces,
 *   rounded organic curves, bright accent colors (cyan #00CED1, orange #FF6B35,
 *   yellow #FFD23F), skeuomorphic UI with depth and reflections.
 * - Biology Layer: deep darkness (#0A0A20) as canvas with bioluminescent amber
 *   backlighting (#FFB347) showing through translucent panels.
 * - The ship is alive — the grid pulses, the canvas breathes.
 *
 * The canvas is a blank top-down engineering surface with:
 * - A subtle bioluminescent grid (dorsal view — looking down at the ship's back)
 * - Anatomical section guides (Cranial → Neck → Thoracic → Caudal → Tail)
 * - A centerline / spine axis
 * - Ruler markings (ship length in meters)
 * - Zoom/pan controls (future)
 *
 * The user will place, drag, and connect organs on this surface.
 */
// ── Toolbar dropdown (clickable label with expandable options) ──
interface DropdownOption<T extends string> {
  value: T;
  label: string;
  desc?: string;
}

interface ToolbarDropdownProps<T extends string> {
  id: string;
  icon: React.ReactNode;
  currentLabel: string;
  options: DropdownOption<T>[];
  currentValue: T;
  onSelect: (value: T) => void;
  openDropdown: string | null;
  setOpenDropdown: (id: string | null) => void;
}

function ToolbarDropdown<T extends string>({
  id, icon, currentLabel, options, currentValue, onSelect, openDropdown, setOpenDropdown,
}: ToolbarDropdownProps<T>) {
  const isOpen = openDropdown === id;
  return (
    <div className="relative">
      <button
        onClick={() => setOpenDropdown(isOpen ? null : id)}
        className={`flex items-center gap-1.5 transition-all cursor-pointer rounded-md px-1.5 py-1 ${
          isOpen ? 'text-cyan-300 bg-cyan-950/50' : 'text-cyan-400 hover:text-cyan-300'
        }`}
      >
        {icon}
        <span className="text-[10px] font-mono uppercase tracking-wider">{currentLabel}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <>
          {/* Click-away backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpenDropdown(null)} />
          {/* Dropdown menu */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 bio-panel rounded-lg py-1 min-w-[140px]">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onSelect(opt.value);
                  setOpenDropdown(null);
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center justify-between gap-3 transition-all cursor-pointer ${
                  currentValue === opt.value
                    ? 'text-cyan-300 bg-cyan-950/40'
                    : 'text-cyan-400/70 hover:text-cyan-300 hover:bg-cyan-950/20'
                }`}
              >
                <span className="text-[10px] font-mono uppercase tracking-wider">{opt.label}</span>
                {currentValue === opt.value && (
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_4px_#22d3ee]" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Tool button (single icon with hover tooltip) ──
interface ToolButtonProps {
  toolId: ToolId;
  activeTool: ToolId;
  hoveredTool: string | null;
  setActiveTool: (t: ToolId) => void;
  setHoveredTool: (t: string | null) => void;
  icon: React.ReactNode;
  label: string;
  shortcut: string;
}

const ToolButton: React.FC<ToolButtonProps> = ({
  toolId,
  activeTool,
  hoveredTool,
  setActiveTool,
  setHoveredTool,
  icon,
  label,
  shortcut,
}) => {
  const isActive = activeTool === toolId;
  const isHovered = hoveredTool === toolId;
  return (
    <div className="relative">
      <button
        onClick={() => setActiveTool(toolId)}
        onMouseEnter={() => setHoveredTool(toolId)}
        onMouseLeave={() => setHoveredTool(null)}
        className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all cursor-pointer border ${
          isActive
            ? 'bio-panel bio-panel-active text-cyan-300 border-cyan-400/60'
            : 'bio-panel text-cyan-400/60 border-transparent hover:text-cyan-300 hover:border-cyan-500/30'
        }`}
        title={label}
      >
        {icon}
      </button>
      {/* Hover tooltip — slides in from the left with a spring */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, x: -8, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -8, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 600, damping: 30 }}
            className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bio-panel rounded-lg px-2.5 py-1.5 whitespace-nowrap pointer-events-none z-30"
          >
            <div className="text-[11px] font-mono font-bold text-cyan-300">{label}</div>
            <div className="text-[8px] font-mono text-cyan-500/60 mt-0.5">
              Press <span className="text-cyan-400 font-bold">{shortcut}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Active indicator dot — pulses */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: 'spring', stiffness: 700, damping: 20 }}
            className="absolute -right-0.5 -bottom-0.5 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]"
          >
            <motion.div
              className="absolute inset-0 rounded-full bg-cyan-400"
              animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const EngineeringView: React.FC<EngineeringViewProps> = React.memo(({ state, onUpdateState }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(performance.now());

  // ── Tool state ──
  const [activeTool, setActiveTool] = useState<ToolId>('select');
  const [activePipeline, setActivePipeline] = useState<OrganPipelineType>('BIO_PLASMA');
  const [hoveredTool, setHoveredTool] = useState<string | null>(null);

  // ── Organ drawer state (right side) ──
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerCategory, setDrawerCategory] = useState<OrganPipelineType>('BIO_PLASMA');
  const [selectedOrganNodeId, setSelectedOrganNodeId] = useState<string | null>(null);

  // ── Outline catalog drawer state (right side, below organ library) ──
  const [outlineDrawerOpen, setOutlineDrawerOpen] = useState(false);
  const [outlineCategory, setOutlineCategory] = useState(0); // index into OUTLINE_CATALOG

  // ── Requirements drawer state (right side, below outline drawer) ──
  const [requirementsDrawerOpen, setRequirementsDrawerOpen] = useState(false);
  const [collapsedIssues, setCollapsedIssues] = useState<Set<string> | null>(null);

  // ── Placed outline part instances ──
  // Silhouettes placed from the outline drawer become independent instances
  // with their own transform (position, scale, rotation). They are rendered
  // as filled silhouettes on the canvas and can be selected, moved, resized,
  // and rotated via a control bounding box.
  const [placedParts, setPlacedParts] = useState<PlacedPartInstance[]>([]);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const placedPartIdCounter = useRef(0);
  // Transform interaction state: which handle is being dragged
  const [partDragMode, setPartDragMode] = useState<PartDragMode | null>(null);
  const partDragStartRef = useRef<{ wx: number; wz: number; part: PlacedPartInstance } | null>(null);

  // Drag-from-outline-drawer state
  const [outlineDragPreview, setOutlineDragPreview] = useState<{ x: number; y: number; partId: string; catIdx: number } | null>(null);
  const outlineDragStartRef = useRef<{ x: number; y: number; partId: string; catIdx: number } | null>(null);
  const [isOutlineDragging, setIsOutlineDragging] = useState(false);
  const outlineDragOccurredRef = useRef(false);

  // ── Drag-from-drawer state ──
  // User can drag an organ icon from the drawer onto the canvas to place it.
  // Distinguished from a click by movement threshold (5px).
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number; nodeId: string; pipeline: OrganPipelineType } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; nodeId: string; pipeline: OrganPipelineType } | null>(null);
  const dragOccurredRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  // ── Tool rail collapse state ──
  // After a moment of no hover, unselected tools collapse into a "..." button.
  // Hovering the rail (or the "..." button) expands all tools.
  const [railExpanded, setRailExpanded] = useState(true);
  const railHoveredRef = useRef(false);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRailEnter = useCallback(() => {
    railHoveredRef.current = true;
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    setRailExpanded(true);
  }, []);

  const handleRailLeave = useCallback(() => {
    railHoveredRef.current = false;
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    // Collapse after 800ms of no hover — gives a moment of grace
    collapseTimerRef.current = setTimeout(() => {
      if (!railHoveredRef.current) setRailExpanded(false);
    }, 800);
  }, []);

  // Start the initial collapse timer on mount
  useEffect(() => {
    collapseTimerRef.current = setTimeout(() => {
      if (!railHoveredRef.current) setRailExpanded(false);
    }, 1500);
    return () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    };
  }, []);

  // When a tool is selected, re-arm the collapse timer and reset tool-specific state
  const handleSelectTool = useCallback((tool: ToolId) => {
    setActiveTool(tool);
    if (tool !== 'connect') { setConnectFromId(null); setConnectFromPort(null); setConnectError(null); }
    if (tool !== 'measure') setMeasure({ startWX: null, startWZ: null, endWX: null, endWZ: null });
    if (tool !== 'select') setSelectedId(null);
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = setTimeout(() => {
      if (!railHoveredRef.current) setRailExpanded(false);
    }, 800);
  }, []);

  // ── View state (top toolbar dropdowns) ──
  type ViewOrientation = 'top-down' | 'side' | 'front' | 'back';
  type ViewLayer = 'dorsal' | 'ventral' | 'cross-section';
  type GridMode = 'on' | 'off' | 'fine' | 'coarse';
  const [viewOrientation, setViewOrientation] = useState<ViewOrientation>('top-down');
  const [viewLayer, setViewLayer] = useState<ViewLayer>('dorsal');
  const [gridMode, setGridMode] = useState<GridMode>('on');
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Filter the outline catalog by the current view orientation. Each entry
  // declares which orientations it is appropriate for; entries that do not
  // match the current view are hidden. Categories with no visible parts are
  // dropped entirely so the dropdown never shows empty groups.
  const visibleOutlineCatalog: OutlineCategory[] = React.useMemo(() => {
    return OUTLINE_CATALOG.map((cat) => ({
      ...cat,
      parts: cat.parts.filter((p) => p.views.includes(viewOrientation)),
    })).filter((cat) => cat.parts.length > 0);
  }, [viewOrientation]);

  // Clamp the selected category index to the visible catalog. If the current
  // index is out of range (because the orientation changed and removed
  // categories), snap to the first available category.
  useEffect(() => {
    if (visibleOutlineCatalog.length === 0) return;
    if (outlineCategory >= visibleOutlineCatalog.length) {
      setOutlineCategory(0);
    }
  }, [visibleOutlineCatalog, outlineCategory]);

  // ── Engineering data (organs, connections, selection) ──
  const [organs, setOrgans] = useState<PlacedOrgan[]>([]);
  const [connections, setConnections] = useState<PlacedConnection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const [connectFromPort, setConnectFromPort] = useState<OrganNodePort | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [measure, setMeasure] = useState<MeasureState>({
    startWX: null, startWZ: null, endWX: null, endWZ: null,
  });
  const organIdCounter = useRef(0);
  const hoveredIconYRef = useRef(0);
  const connIdCounter = useRef(0);

  // ── Hull outline state ──
  // The editable SVG vector outline of the ship hull. Stored in world coordinates.
  // Initialized from the default teardrop shape, scaled to the ship dimensions.
  const thoraxWidth = state.thoraxWidth; // from AppState (mutable via genetics)
  const [hullOutline, setHullOutline] = useState<HullOutline>(() =>
    createDefaultHull(state.length, thoraxWidth)
  );
  // Re-create hull when ship length or thorax width changes (only if user hasn't customized it)
  const [hullCustomized, setHullCustomized] = useState(false);
  useEffect(() => {
    if (!hullCustomized) {
      setHullOutline(createDefaultHull(state.length, thoraxWidth));
    }
  }, [state.length, state.thoraxWidth]);

  // Hull edit sub-mode and interaction state
  const [hullEditMode, setHullEditMode] = useState<HullEditMode>('control-points');
  const [hullDragId, setHullDragId] = useState<string | null>(null); // anchor or handle being dragged
  const [hoveredAnchorId, setHoveredAnchorId] = useState<string | null>(null);
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);
  const [hullDragType, setHullDragType] = useState<'anchor' | 'handle' | 'edge' | 'corner' | null>(null);
  const [freehandPoints, setFreehandPoints] = useState<{ wx: number; wz: number }[]>([]);
  const [freehandDrawing, setFreehandDrawing] = useState(false);

  // ── Symmetry state (Blender-style mirror options) ──
  // Mirror X = port/starboard symmetry across the spine centerline.
  // When enabled, placing/moving an organ at (wx, wz) also creates/updates
  // a mirrored copy at (-wx, wz). Deleting one deletes both.
  const [mirrorX, setMirrorX] = useState(true);
  const [mirrorZ, setMirrorZ] = useState(false); // fore/aft symmetry (rare, but Blender has it)

  // ── Ship requirements validation ──
  // Computes unmet requirements from placed organs + connections.
  const validation: ShipValidationResult = React.useMemo(() => {
    // Estimate ship volume from length and thorax width (cylinder approximation)
    const r = state.thoraxWidth / 2;
    const shipVolume = Math.PI * r * r * state.length;
    return validateShipRequirements({
      organs: organs.map((o) => ({
        id: o.id,
        pipeline: o.pipeline,
        name: o.name,
        nodeId: o.nodeId,
        wx: o.wx,
        wz: o.wz,
        mirrorId: o.mirrorId,
        isMirror: o.isMirror,
      })),
      connections: connections.map((c) => ({ id: c.id, fromId: c.fromId, toId: c.toId })),
      shipLength: state.length,
      shipVolume,
      mirrorX,
      mirrorZ,
    });
  }, [organs, connections, state.length, state.thoraxWidth, mirrorX, mirrorZ]);

  // ── Viewport state (pan/zoom) ──
  // The canvas uses a world-to-screen transform (engineering top-down view):
  //   screenX = cx + (wx * scale * zoom) + panX   (port-starboard → horizontal)
  //   screenY = cy + (wz * scale * zoom) + panY   (fore-aft → vertical)
  // World coords: wx = port(−)/starboard(+), wz = nose(−)/tail(+)
  // Nose at top, tail at bottom, port at left, starboard at right.
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [zoom, setZoom] = useState(1);

  // ── Mouse interaction refs (avoid re-renders during drag) ──
  const mouseRef = useRef({
    isDown: false,
    button: 0,
    startX: 0, startY: 0,       // screen coords at mousedown
    lastX: 0, lastY: 0,         // previous screen coords during drag
    worldWX: 0, worldWZ: 0,     // current world coords under cursor (wx=port/stbd, wz=fore/aft)
    draggingOrganId: null as string | null,
    dragOffsetWX: 0, dragOffsetWZ: 0,
    draggingSectionIdx: -1,
    panning: false,
    panStartX: 0, panStartY: 0, // pan values at mousedown (so pan accumulates)
  });

  // ── Section boundary overrides (u-values, 0..1 along ship length) ──
  // Default from SHIP_SECTIONS; user can drag to adjust.
  const [sectionBounds, setSectionBounds] = useState<number[]>(
    SHIP_SECTIONS.map((s) => s.uMin),
  );

  // ── Undo/Redo system (Blender-style: one history step per action/drag) ──
  interface HistorySnapshot {
    organs: PlacedOrgan[];
    connections: PlacedConnection[];
    hullOutline: HullOutline;
    hullCustomized: boolean;
    sectionBounds: number[];
  }
  const undoStackRef = useRef<HistorySnapshot[]>([]);
  const redoStackRef = useRef<HistorySnapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const MAX_HISTORY = 64;

  const snapshotState = useCallback((): HistorySnapshot => ({
    organs: organs.map((o) => ({ ...o })),
    connections: connections.map((c) => ({ ...c })),
    hullOutline: {
      anchors: hullOutline.anchors.map((a) => ({ ...a })),
      handles: hullOutline.handles.map((h) => ({ ...h })),
      segments: hullOutline.segments.map((s) => ({ ...s })),
    },
    hullCustomized,
    sectionBounds: [...sectionBounds],
  }), [organs, connections, hullOutline, hullCustomized, sectionBounds]);

  const restoreSnapshot = useCallback((snap: HistorySnapshot) => {
    setOrgans(snap.organs.map((o) => ({ ...o })));
    setConnections(snap.connections.map((c) => ({ ...c })));
    setHullOutline({
      anchors: snap.hullOutline.anchors.map((a) => ({ ...a })),
      handles: snap.hullOutline.handles.map((h) => ({ ...h })),
      segments: snap.hullOutline.segments.map((s) => ({ ...s })),
    });
    setHullCustomized(snap.hullCustomized);
    setSectionBounds([...snap.sectionBounds]);
  }, []);

  const pushHistory = useCallback(() => {
    const snap = snapshotState();
    undoStackRef.current.push(snap);
    if (undoStackRef.current.length > MAX_HISTORY) undoStackRef.current.shift();
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, [snapshotState]);

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const current = snapshotState();
    redoStackRef.current.push(current);
    const prev = undoStackRef.current.pop()!;
    restoreSnapshot(prev);
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);
  }, [snapshotState, restoreSnapshot]);

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const current = snapshotState();
    undoStackRef.current.push(current);
    const next = redoStackRef.current.pop()!;
    restoreSnapshot(next);
    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);
  }, [snapshotState, restoreSnapshot]);

  // ── Coordinate conversion helpers ──
  // World (meters) ↔ screen (pixels). The ship footprint is computed inside
  // draw() using the same formula, so we expose the shared values via refs.
  const viewMetricsRef = useRef({
    cx: 0, cy: 0, scale: 1, shipLeft: 0, shipRight: 0, shipW: 0, shipH: 0,
    padding: 80,
  });

  const screenToWorld = useCallback((sx: number, sy: number) => {
    const vm = viewMetricsRef.current;
    // Engineering view: screen X = port-starboard (wx), screen Y = fore-aft (wz)
    const wx = (sx - vm.cx - panX) / (vm.scale * zoom);
    const wz = (sy - vm.cy - panY) / (vm.scale * zoom);
    return { wx, wz };
  }, [panX, panY, zoom]);

  const worldToScreen = useCallback((wx: number, wz: number) => {
    const vm = viewMetricsRef.current;
    // Engineering view: screen X = port-starboard (wx), screen Y = fore-aft (wz)
    return {
      sx: vm.cx + wx * vm.scale * zoom + panX,
      sy: vm.cy + wz * vm.scale * zoom + panY,
    };
  }, [panX, panY, zoom]);

  // ── Placed part transform helpers ──
  // Transform a local-space anchor to world space using the part's transform.
  const transformAnchor = useCallback((part: PlacedPartInstance, local: OutlinePartAnchor) => {
    const cos = Math.cos(part.rotation);
    const sin = Math.sin(part.rotation);
    const rx = part.scale * (local.wx * cos - local.wz * sin);
    const rz = part.scale * (local.wx * sin + local.wz * cos);
    return { wx: part.wx + rx, wz: part.wz + rz };
  }, []);

  // Get all world-space anchors for a placed part
  const getPartWorldAnchors = useCallback((part: PlacedPartInstance): OutlinePartAnchor[] => {
    return part.localAnchors.map((a) => transformAnchor(part, a));
  }, [transformAnchor]);

  // Compute the axis-aligned bounding box of a placed part in world space
  const getPartBounds = useCallback((part: PlacedPartInstance) => {
    const world = getPartWorldAnchors(part);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const a of world) {
      if (a.wx < minX) minX = a.wx;
      if (a.wx > maxX) maxX = a.wx;
      if (a.wz < minZ) minZ = a.wz;
      if (a.wz > maxZ) maxZ = a.wz;
    }
    return { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
  }, [getPartWorldAnchors]);

  // Hit-test a screen point against a placed part (point-in-polygon)
  const hitTestPlacedPart = useCallback((sx: number, sy: number): PlacedPartInstance | null => {
    const { wx, wz } = screenToWorld(sx, sy);
    for (let i = placedParts.length - 1; i >= 0; i--) {
      const part = placedParts[i];
      const world = getPartWorldAnchors(part);
      // Point-in-polygon ray casting
      let inside = false;
      for (let j = 0, k = world.length - 1; j < world.length; k = j++) {
        const cj = world[k], nj = world[j];
        if (((nj.wz > wz) !== (cj.wz > wz)) &&
            (wx < (cj.wx - nj.wx) * (wz - nj.wz) / (cj.wz - nj.wz) + nj.wx)) {
          inside = !inside;
        }
      }
      if (inside) return part;
    }
    return null;
  }, [placedParts, screenToWorld, getPartWorldAnchors]);

  // Hit-test transform handles for a selected placed part.
  // Returns the handle mode ('move', 'resize-nw', 'resize-ne', etc., 'rotate')
  // or null if no handle is under the cursor.
  const hitTestPartHandle = useCallback((sx: number, sy: number, part: PlacedPartInstance): PartDragMode | null => {
    const bounds = getPartBounds(part);
    const corners: { wx: number; wz: number; mode: PartDragMode }[] = [
      { wx: bounds.minX, wz: bounds.minZ, mode: 'resize-nw' },
      { wx: bounds.maxX, wz: bounds.minZ, mode: 'resize-ne' },
      { wx: bounds.minX, wz: bounds.maxZ, mode: 'resize-sw' },
      { wx: bounds.maxX, wz: bounds.maxZ, mode: 'resize-se' },
      { wx: bounds.cx, wz: bounds.minZ, mode: 'resize-n' },
      { wx: bounds.cx, wz: bounds.maxZ, mode: 'resize-s' },
      { wx: bounds.minX, wz: bounds.cz, mode: 'resize-w' },
      { wx: bounds.maxX, wz: bounds.cz, mode: 'resize-e' },
      // Rotate handle: above the top edge
      { wx: bounds.cx, wz: bounds.minZ - (bounds.maxZ - bounds.minZ) * 0.2, mode: 'rotate' },
    ];
    const handleR = 8; // 8px hit radius
    for (const c of corners) {
      const { sx: hsx, sy: hsy } = worldToScreen(c.wx, c.wz);
      const dx = sx - hsx;
      const dy = sy - hsy;
      if (dx * dx + dy * dy <= handleR * handleR) return c.mode;
    }
    return null;
  }, [getPartBounds, worldToScreen]);

  // ── Drag-from-drawer: window listeners while dragging ──
  // Use a ref for drag preview to avoid stale closure issues in handleUp
  const dragPreviewRef = useRef<{ x: number; y: number; nodeId: string; pipeline: OrganPipelineType } | null>(null);
  useEffect(() => {
    dragPreviewRef.current = dragPreview;
  }, [dragPreview]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      if (!dragPreviewRef.current) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (dx * dx + dy * dy < 25) return; // 5px threshold
        dragOccurredRef.current = true;
        const preview = { x: e.clientX, y: e.clientY, nodeId: start.nodeId, pipeline: start.pipeline };
        dragPreviewRef.current = preview;
        setDragPreview(preview);
      } else {
        const preview = { x: e.clientX, y: e.clientY, nodeId: start.nodeId, pipeline: start.pipeline };
        dragPreviewRef.current = preview;
        setDragPreview(preview);
      }
    };

    const handleUp = (e: MouseEvent) => {
      const start = dragStartRef.current;
      dragStartRef.current = null;

      if (dragPreviewRef.current) {
        const canvas = canvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const { wx, wz } = screenToWorld(sx, sy);
            pushHistory();
            const pipeline = start.pipeline;
            const catalogEntry = ORGAN_CATALOG[pipeline].find((o) => o.nodeId === start.nodeId);
            const id = `organ-${++organIdCounter.current}`;
            const organLabel = catalogEntry
              ? `${catalogEntry.shortName} ${organIdCounter.current}`
              : `${PIPELINE_NAMES[pipeline].split(' ')[0]} ${organIdCounter.current}`;
            const newOrgan: PlacedOrgan = {
              id, pipeline, name: organLabel, nodeId: start.nodeId, wx, wz, radius: catalogEntry?.radius ?? 0.8, health: 1, mirrorId: null, isMirror: false,
            };
            const mirrorOrgans: PlacedOrgan[] = [];
            if (mirrorX && Math.abs(wx) > 0.01) {
              const mirrorId = `organ-${++organIdCounter.current}`;
              newOrgan.mirrorId = mirrorId;
              mirrorOrgans.push({ ...newOrgan, id: mirrorId, wx: -wx, name: `${organLabel} (R)`, mirrorId: id, isMirror: true });
            }
            if (mirrorZ && Math.abs(wz) > 0.01) {
              const mirrorIdZ = `organ-${++organIdCounter.current}`;
              mirrorOrgans.push({ ...newOrgan, id: mirrorIdZ, wz: -wz, name: `${organLabel} (F)`, mirrorId: id, isMirror: true });
            }
            if (mirrorX && mirrorZ && Math.abs(wx) > 0.01 && Math.abs(wz) > 0.01) {
              const mirrorIdXZ = `organ-${++organIdCounter.current}`;
              mirrorOrgans.push({ ...newOrgan, id: mirrorIdXZ, wx: -wx, wz: -wz, name: `${organLabel} (RF)`, mirrorId: id, isMirror: true });
            }
            setOrgans((prev) => [...prev, newOrgan, ...mirrorOrgans]);
            setSelectedOrganNodeId(start.nodeId);
            setActivePipeline(pipeline);
          }
        }
        dragPreviewRef.current = null;
        setDragPreview(null);
      }
      setIsDragging(false);
      setTimeout(() => { dragOccurredRef.current = false; }, 0);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, screenToWorld, mirrorX, mirrorZ]);

  // ── Drag-from-outline-drawer: window listeners while dragging ──
  // Use a ref for drag preview to avoid stale closure issues in handleUp
  const outlineDragPreviewRef = useRef<{ x: number; y: number; partId: string; catIdx: number } | null>(null);
  useEffect(() => {
    outlineDragPreviewRef.current = outlineDragPreview;
  }, [outlineDragPreview]);

  useEffect(() => {
    if (!isOutlineDragging) return;

    const handleMove = (e: MouseEvent) => {
      const start = outlineDragStartRef.current;
      if (!start) return;
      if (!outlineDragPreviewRef.current) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (dx * dx + dy * dy < 25) return; // 5px threshold
        outlineDragOccurredRef.current = true;
        const preview = { x: e.clientX, y: e.clientY, partId: start.partId, catIdx: start.catIdx };
        outlineDragPreviewRef.current = preview;
        setOutlineDragPreview(preview);
      } else {
        const preview = { x: e.clientX, y: e.clientY, partId: start.partId, catIdx: start.catIdx };
        outlineDragPreviewRef.current = preview;
        setOutlineDragPreview(preview);
      }
    };

    const handleUp = (e: MouseEvent) => {
      const start = outlineDragStartRef.current;
      outlineDragStartRef.current = null;

      if (outlineDragPreviewRef.current && start) {
        const canvas = canvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const { wx, wz } = screenToWorld(sx, sy);
            // Find the part
            const cat = visibleOutlineCatalog[start.catIdx];
            const part = cat?.parts.find((p) => p.id === start.partId);
            if (part) {
              pushHistory();
              // Create placed part instances (with optional mirrors)
              const newParts: PlacedPartInstance[] = [];
              const baseId = `part-${++placedPartIdCounter.current}`;
              newParts.push({
                id: baseId,
                partId: part.id,
                name: part.name,
                pathD: part.pathD,
                localAnchors: part.anchors.map((a) => ({ ...a })),
                wx, wz, scale: 1, rotation: 0,
                symmetric: part.symmetric,
                mirrorX: mirrorX && !part.symmetric && Math.abs(wx) > 0.01,
                mirrorZ: mirrorZ && Math.abs(wz) > 0.01,
              });
              // X mirror: flip wx (port ↔ starboard). Skip if part is already symmetric.
              if (mirrorX && !part.symmetric && Math.abs(wx) > 0.01) {
                newParts.push({
                  id: `part-${++placedPartIdCounter.current}`,
                  partId: part.id,
                  name: `${part.name} (R)`,
                  pathD: part.pathD,
                  localAnchors: part.anchors.map((a) => ({ wx: -a.wx, wz: a.wz })),
                  wx: -wx, wz, scale: 1, rotation: 0,
                });
              }
              // Z mirror: flip wz (fore ↔ aft)
              if (mirrorZ && Math.abs(wz) > 0.01) {
                newParts.push({
                  id: `part-${++placedPartIdCounter.current}`,
                  partId: part.id,
                  name: `${part.name} (F)`,
                  pathD: part.pathD,
                  localAnchors: part.anchors.map((a) => ({ wx: a.wx, wz: -a.wz })),
                  wx, wz: -wz, scale: 1, rotation: 0,
                });
              }
              // X+Z mirror
              if (mirrorX && mirrorZ && !part.symmetric && Math.abs(wx) > 0.01 && Math.abs(wz) > 0.01) {
                newParts.push({
                  id: `part-${++placedPartIdCounter.current}`,
                  partId: part.id,
                  name: `${part.name} (RF)`,
                  pathD: part.pathD,
                  localAnchors: part.anchors.map((a) => ({ wx: -a.wx, wz: -a.wz })),
                  wx: -wx, wz: -wz, scale: 1, rotation: 0,
                });
              }
              setPlacedParts((prev) => [...prev, ...newParts]);
              setSelectedPartId(baseId);
              setHullCustomized(true);
            }
          }
        }
        outlineDragPreviewRef.current = null;
        setOutlineDragPreview(null);
      }
      setIsOutlineDragging(false);
      setTimeout(() => { outlineDragOccurredRef.current = false; }, 0);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isOutlineDragging, screenToWorld, mirrorX, mirrorZ, visibleOutlineCatalog, pushHistory]);

  // ── Hit testing ──

  // Compute screen position of a specific port on an organ
  const getPortScreenPos = useCallback((organ: PlacedOrgan, portLabel: string): { sx: number; sy: number } | null => {
    const ports = ORGAN_NODES[organ.nodeId];
    if (!ports) return null;
    const port = ports.find((p) => p.label === portLabel);
    if (!port) return null;

    const { sx: osx, sy: osy } = worldToScreen(organ.wx, organ.wz);
    const screenR = organ.radius * viewMetricsRef.current.scale * zoom;
    const ringR = screenR * 0.55;
    const inputs = ports.filter((p) => p.direction === 'in');
    const outputs = ports.filter((p) => p.direction === 'out');
    const isInput = port.direction === 'in';
    const groupPorts = isInput ? inputs : outputs;
    const idx = groupPorts.indexOf(port);
    const groupSize = groupPorts.length;
    const angle = isInput
      ? Math.PI / 2 + (idx + 1) * (Math.PI / (groupSize + 1))
      : -Math.PI / 2 + (idx + 1) * (Math.PI / (groupSize + 1));
    return {
      sx: osx + Math.cos(angle) * ringR,
      sy: osy + Math.sin(angle) * ringR,
    };
  }, [worldToScreen, zoom]);

  // Hit test for a specific port inside an organ — returns the port info if clicked
  const hitTestPort = useCallback((sx: number, sy: number, organ: PlacedOrgan): OrganNodePort | null => {
    const ports = ORGAN_NODES[organ.nodeId];
    if (!ports || ports.length === 0) return null;

    const { sx: osx, sy: osy } = worldToScreen(organ.wx, organ.wz);
    const screenR = organ.radius * viewMetricsRef.current.scale * zoom;
    if (screenR < 8) return null; // too small to hit ports

    const nodeR = Math.max(4, screenR * 0.18); // min 4px for hit testing
    const ringR = screenR * 0.55;
    const inputs = ports.filter((p) => p.direction === 'in');
    const outputs = ports.filter((p) => p.direction === 'out');

    for (const port of ports) {
      const isInput = port.direction === 'in';
      const groupPorts = isInput ? inputs : outputs;
      const idx = groupPorts.indexOf(port);
      const groupSize = groupPorts.length;
      const angle = isInput
        ? Math.PI / 2 + (idx + 1) * (Math.PI / (groupSize + 1))
        : -Math.PI / 2 + (idx + 1) * (Math.PI / (groupSize + 1));
      const nx = osx + Math.cos(angle) * ringR;
      const ny = osy + Math.sin(angle) * ringR;
      const dx = sx - nx;
      const dy = sy - ny;
      if (dx * dx + dy * dy <= nodeR * nodeR) return port;
    }
    return null;
  }, [worldToScreen, zoom]);

  const hitTestOrgan = useCallback((sx: number, sy: number): PlacedOrgan | null => {
    for (let i = organs.length - 1; i >= 0; i--) {
      const o = organs[i];
      const { sx: osx, sy: osy } = worldToScreen(o.wx, o.wz);
      const screenR = o.radius * viewMetricsRef.current.scale * zoom;
      const dx = sx - osx;
      const dy = sy - osy;
      if (dx * dx + dy * dy <= screenR * screenR) return o;
    }
    return null;
  }, [organs, worldToScreen, zoom]);

  const hitTestConnection = useCallback((sx: number, sy: number): PlacedConnection | null => {
    const threshold = 8; // pixels
    for (const conn of connections) {
      const from = organs.find((o) => o.id === conn.fromId);
      const to = organs.find((o) => o.id === conn.toId);
      if (!from || !to) continue;
      let p1 = worldToScreen(from.wx, from.wz);
      let p2 = worldToScreen(to.wx, to.wz);
      if (conn.fromPort) { const pp = getPortScreenPos(from, conn.fromPort); if (pp) p1 = pp; }
      if (conn.toPort) { const pp = getPortScreenPos(to, conn.toPort); if (pp) p2 = pp; }
      // Distance from point to line segment
      const dx = p2.sx - p1.sx;
      const dy = p2.sy - p1.sy;
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) continue;
      let t = ((sx - p1.sx) * dx + (sy - p1.sy) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const projX = p1.sx + t * dx;
      const projY = p1.sy + t * dy;
      const distSq = (sx - projX) ** 2 + (sy - projY) ** 2;
      if (distSq <= threshold * threshold) return conn;
    }
    return null;
  }, [connections, organs, worldToScreen, getPortScreenPos]);

  // ── Mouse event handlers ──
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { wx, wz } = screenToWorld(sx, sy);
    const m = mouseRef.current;
    m.isDown = true;
    m.button = e.button;
    m.startX = sx; m.startY = sy;
    m.lastX = sx; m.lastY = sy;
    m.worldWX = wx; m.worldWZ = wz;

    switch (activeTool) {
      case 'select': {
        // First: check if a transform handle on a selected placed part was clicked
        if (selectedPartId && partDragMode) {
          // Already in a transform drag — handled in mousemove
          break;
        }
        // Check transform handles of the currently selected part
        if (selectedPartId) {
          const selPart = placedParts.find((p) => p.id === selectedPartId);
          if (selPart) {
            const handle = hitTestPartHandle(sx, sy, selPart);
            if (handle) {
              pushHistory();
              setPartDragMode(handle);
              partDragStartRef.current = { wx, wz, part: { ...selPart } };
              break;
            }
          }
        }
        // Second: hit-test placed parts (on top of organs)
        const partHit = hitTestPlacedPart(sx, sy);
        if (partHit) {
          setSelectedPartId(partHit.id);
          setSelectedId(null); // deselect organs
          pushHistory();
          setPartDragMode('move');
          partDragStartRef.current = { wx, wz, part: { ...partHit } };
          break;
        }
        // Third: hit-test organs
        const hit = hitTestOrgan(sx, sy);
        if (hit) {
          setSelectedId(hit.id);
          setSelectedPartId(null);
          m.draggingOrganId = hit.id;
          pushHistory(); // snapshot before drag starts
          m.dragOffsetWX = hit.wx - wx;
          m.dragOffsetWZ = hit.wz - wz;
        } else {
          setSelectedId(null);
          setSelectedPartId(null);
        }
        break;
      }
      case 'pan': {
        m.panning = true;
        m.panStartX = panX;
        m.panStartY = panY;
        break;
      }
      case 'place-organ': {
        pushHistory();
        const id = `organ-${++organIdCounter.current}`;
        // Use the selected organ's short name from the catalog, or fall back to pipeline name
        const catalogEntry = ORGAN_CATALOG[activePipeline].find((o) => o.nodeId === selectedOrganNodeId);
        const organLabel = catalogEntry
          ? `${catalogEntry.shortName} ${organIdCounter.current}`
          : `${PIPELINE_NAMES[activePipeline].split(' ')[0]} ${organIdCounter.current}`;
        const newOrgan: PlacedOrgan = {
          id,
          pipeline: activePipeline,
          name: organLabel,
          nodeId: selectedOrganNodeId,
          wx, wz,
          radius: catalogEntry?.radius ?? 0.8,
          health: 1,
          mirrorId: null,
          isMirror: false,
        };

        // Symmetry: create mirrored copies if enabled
        const mirrorOrgans: PlacedOrgan[] = [];
        if (mirrorX && Math.abs(wx) > 0.01) {
          const mirrorId = `organ-${++organIdCounter.current}`;
          newOrgan.mirrorId = mirrorId;
          mirrorOrgans.push({
            ...newOrgan,
            id: mirrorId,
            wx: -wx,
            name: `${newOrgan.name} (R)`,
            mirrorId: id,
            isMirror: true,
          });
        }
        if (mirrorZ && Math.abs(wz) > 0.01) {
          const mirrorIdZ = `organ-${++organIdCounter.current}`;
          mirrorOrgans.push({
            ...newOrgan,
            id: mirrorIdZ,
            wz: -wz,
            name: `${newOrgan.name} (F)`,
            mirrorId: id,
            isMirror: true,
          });
        }
        if (mirrorX && mirrorZ && Math.abs(wx) > 0.01 && Math.abs(wz) > 0.01) {
          const mirrorIdXZ = `organ-${++organIdCounter.current}`;
          mirrorOrgans.push({
            ...newOrgan,
            id: mirrorIdXZ,
            wx: -wx,
            wz: -wz,
            name: `${newOrgan.name} (RF)`,
            mirrorId: id,
            isMirror: true,
          });
        }

        setOrgans((prev) => [...prev, newOrgan, ...mirrorOrgans]);
        setSelectedId(id);
        break;
      }
      case 'connect': {
        const hit = hitTestOrgan(sx, sy);
        if (!hit) {
          // Clicked empty space — cancel any pending connection
          setConnectFromId(null);
          setConnectFromPort(null);
          setConnectError(null);
          break;
        }

        // Try to hit a specific port inside the organ
        const portHit = hitTestPort(sx, sy, hit);

        if (!connectFromId) {
          // First click: select source organ + port
          setConnectFromId(hit.id);
          setConnectFromPort(portHit);
          break;
        }

        // Second click: attempt connection
        if (connectFromId === hit.id) {
          // Clicked same organ — cancel
          setConnectFromId(null);
          setConnectFromPort(null);
          break;
        }

        const fromOrgan = organs.find((o) => o.id === connectFromId);
        if (!fromOrgan) {
          setConnectFromId(null);
          setConnectFromPort(null);
          break;
        }

        // Validate: the source port must be an output, the target port must be an input
        // If no port was hit, fall back to organ-level connection (auto-match ports)
        let fromPort = connectFromPort;
        let toPort = portHit;

        // If the user clicked an output port on the first organ, use it
        // If they clicked an input port, they might be starting from the consumer side
        // For now: require output→input direction
        if (fromPort && fromPort.direction === 'in') {
          // User started from an input port — they want to receive from somewhere
          // Swap: the "from" organ is actually the target, and "hit" is the source
          // But this is confusing UX. Instead, just reject and re-arm.
          setConnectFromId(hit.id);
          setConnectFromPort(portHit);
          break;
        }
        if (toPort && toPort.direction === 'out') {
          // User clicked an output port on the target — that's backwards
          // Re-arm with this organ as the source
          setConnectFromId(hit.id);
          setConnectFromPort(portHit);
          break;
        }

        // Check if a conduit path is needed between these organs
        // (moved up so we can use it for port auto-matching and validation)
        const conduitPath = findConduitPath(fromOrgan.nodeId, hit.nodeId);

        // Validate port compatibility — check even when only one port is specified (L10)
        // The fromPort's nodeId should match the target organ's nodeId OR the first conduit
        // The toPort's nodeId should match the source organ's nodeId OR the last conduit
        const validFromTargets = new Set<string>([hit.nodeId, ...conduitPath]);
        const validToSources = new Set<string>([fromOrgan.nodeId, ...conduitPath]);
        if (fromPort && !validFromTargets.has(fromPort.nodeId)) {
          setConnectFromId(hit.id);
          setConnectFromPort(portHit);
          setConnectError(`Port mismatch: ${fromPort.label} output doesn't match ${hit.name}`);
          break;
        }
        if (toPort && !validToSources.has(toPort.nodeId)) {
          setConnectFromId(hit.id);
          setConnectFromPort(portHit);
          setConnectError(`Port mismatch: ${toPort.label} input doesn't match ${fromOrgan.name}`);
          break;
        }
        // If both ports are specified, they must be mutually compatible
        if (fromPort && toPort && fromPort.nodeId !== toPort.nodeId && !conduitPath.includes(fromPort.nodeId) && !conduitPath.includes(toPort.nodeId)) {
          setConnectFromId(hit.id);
          setConnectFromPort(portHit);
          setConnectError(`Port mismatch: ${fromPort.label} → ${toPort.label} is not a valid connection`);
          break;
        }

        // Auto-match ports if not explicitly clicked
        if (!fromPort) {
          const fromPorts = ORGAN_NODES[fromOrgan.nodeId] || [];
          // Direct match: output port points to target's nodeId
          fromPort = fromPorts.find((p) => p.direction === 'out' && p.nodeId === hit.nodeId) || null;
          // Conduit match: if a conduit path exists, the output port may point
          // to the first conduit in the chain rather than the final target
          if (!fromPort && conduitPath.length > 0) {
            const firstConduitId = conduitPath[0];
            fromPort = fromPorts.find((p) => p.direction === 'out' && p.nodeId === firstConduitId) || null;
          }
        }
        if (!toPort) {
          const toPorts = ORGAN_NODES[hit.nodeId] || [];
          // Direct match: input port expects source's nodeId
          toPort = toPorts.find((p) => p.direction === 'in' && p.nodeId === fromOrgan.nodeId) || null;
          // Conduit match: if a conduit path exists, the input port may expect
          // the last conduit in the chain rather than the original source
          if (!toPort && conduitPath.length > 0) {
            const lastConduitId = conduitPath[conduitPath.length - 1];
            toPort = toPorts.find((p) => p.direction === 'in' && p.nodeId === lastConduitId) || null;
          }
        }

        // L6: Duplicate connection prevention — check if the same connection already exists
        const existingConn = connections.some((c) =>
          (c.fromId === connectFromId && c.toId === hit.id) ||
          (c.fromId === hit.id && c.toId === connectFromId),
        );
        if (existingConn) {
          setConnectError(`Already connected: ${fromOrgan.name} → ${hit.name}`);
          setConnectFromId(null);
          setConnectFromPort(null);
          break;
        }

        const newOrgans: PlacedOrgan[] = [];
        const newConns: PlacedConnection[] = [];

        pushHistory();

        if (conduitPath.length > 0) {
          // Auto-create conduit organs along the path between the two organs
          let prevId = connectFromId;
          let prevNodeId = fromOrgan.nodeId;
          let prevPort = fromPort;

          for (const conduitNodeId of conduitPath) {
            const conduitDef = CONDUIT_ORGANS[conduitNodeId];
            // Place conduit at midpoint between prev organ and the target organ
            const prevOrganObj = organs.find((o) => o.id === prevId) || newOrgans.find((o) => o.id === prevId);
            const base = prevOrganObj || fromOrgan;
            const conduitId = `organ-${++organIdCounter.current}`;

            // Interpolate position: even spacing along the path
            const totalSteps = conduitPath.length + 1;
            const stepIndex = conduitPath.indexOf(conduitNodeId) + 1;
            const tFrac = stepIndex / totalSteps;
            const cwx = fromOrgan.wx + (hit.wx - fromOrgan.wx) * tFrac;
            const cwz = fromOrgan.wz + (hit.wz - fromOrgan.wz) * tFrac;

            const conduitOrgan: PlacedOrgan = {
              id: conduitId,
              pipeline: conduitDef.pipeline,
              name: `${conduitDef.shortName} ${organIdCounter.current}`,
              nodeId: conduitNodeId,
              wx: cwx,
              wz: cwz,
              radius: conduitDef.radius,
              health: 1,
              mirrorId: null,
              isMirror: false,
              isAutoConduit: true,
            };

            // Find the input port on the conduit that matches prevNodeId
            const conduitPorts = ORGAN_NODES[conduitNodeId] || [];
            const conduitInPort = conduitPorts.find((p) => p.direction === 'in' && p.nodeId === prevNodeId) || null;
            const conduitOutPort = conduitPorts.find((p) => p.direction === 'out') || null;

            // Connection from prev → conduit
            const connInId = `conn-${++connIdCounter.current}`;
            newConns.push({
              id: connInId,
              fromId: prevId,
              toId: conduitId,
              fromPort: prevPort?.label || null,
              toPort: conduitInPort?.label || null,
              mirrorId: null,
            });

            // Mirror the conduit if both endpoints have mirrors
            if (mirrorX && fromOrgan.mirrorId && hit.mirrorId) {
              const mirrorConduitId = `organ-${++organIdCounter.current}`;
              conduitOrgan.mirrorId = mirrorConduitId;
              const mirrorConduit: PlacedOrgan = {
                ...conduitOrgan,
                id: mirrorConduitId,
                wx: -cwx,
                name: `${conduitDef.shortName} ${organIdCounter.current} (R)`,
                mirrorId: conduitId,
                isMirror: true,
                isAutoConduit: true,
              };
              newOrgans.push(mirrorConduit);

              // Mirror connection
              const mirrorConnInId = `conn-${++connIdCounter.current}`;
              const mirrorPrevId = prevOrganObj?.mirrorId || fromOrgan.mirrorId;
              newConns.push({
                id: mirrorConnInId,
                fromId: mirrorPrevId!,
                toId: mirrorConduitId,
                fromPort: prevPort?.label || null,
                toPort: conduitInPort?.label || null,
                mirrorId: connInId,
              });
              newConns[newConns.length - 2].mirrorId = mirrorConnInId;
            }

            newOrgans.push(conduitOrgan);
            prevId = conduitId;
            prevNodeId = conduitNodeId;
            prevPort = conduitOutPort;
          }

          // Final connection: last conduit → target organ
          const finalConnId = `conn-${++connIdCounter.current}`;
          newConns.push({
            id: finalConnId,
            fromId: prevId,
            toId: hit.id,
            fromPort: prevPort?.label || null,
            toPort: toPort?.label || null,
            mirrorId: null,
          });

          // Mirror final connection
          if (mirrorX && fromOrgan.mirrorId && hit.mirrorId) {
            const mirrorFinalConnId = `conn-${++connIdCounter.current}`;
            const lastConduit = newOrgans.find((o) => o.id === prevId);
            newConns.push({
              id: mirrorFinalConnId,
              fromId: lastConduit?.mirrorId || prevId,
              toId: hit.mirrorId,
              fromPort: prevPort?.label || null,
              toPort: toPort?.label || null,
              mirrorId: finalConnId,
            });
            newConns[newConns.length - 2].mirrorId = mirrorFinalConnId;
          }
        } else {
          // Direct connection (no conduit needed)
          const connId = `conn-${++connIdCounter.current}`;
          newConns.push({
            id: connId,
            fromId: connectFromId,
            toId: hit.id,
            fromPort: fromPort?.label || null,
            toPort: toPort?.label || null,
            mirrorId: null,
          });

          // Symmetry: create mirrored connection if both organs have mirrors
          if (mirrorX && fromOrgan.mirrorId && hit.mirrorId) {
            const mirrorConnId = `conn-${++connIdCounter.current}`;
            newConns.push({
              id: mirrorConnId,
              fromId: fromOrgan.mirrorId,
              toId: hit.mirrorId,
              fromPort: fromPort?.label || null,
              toPort: toPort?.label || null,
              mirrorId: connId,
            });
            newConns[0].mirrorId = mirrorConnId;
          }
        }

        if (newOrgans.length > 0) {
          setOrgans((prev) => [...prev, ...newOrgans]);
        }
        setConnections((prev) => [...prev, ...newConns]);
        setConnectFromId(null);
        setConnectFromPort(null);
        setConnectError(null);
        break;
      }
      case 'erase': {
        // Erase placed parts first (they're on top)
        const partHit = hitTestPlacedPart(sx, sy);
        if (partHit) {
          pushHistory();
          setPlacedParts((prev) => prev.filter((p) => p.id !== partHit.id));
          if (selectedPartId === partHit.id) setSelectedPartId(null);
          break;
        }
        const organHit = hitTestOrgan(sx, sy);
        if (organHit) {
          pushHistory();
          // Collect IDs to delete: the organ + its mirror counterpart
          const idsToDelete = new Set<string>([organHit.id]);
          if (organHit.mirrorId) idsToDelete.add(organHit.mirrorId);
          // Also delete any auto-conduit organs that were created for connections
          // involving this organ
          const conduitIdsToDelete = new Set<string>();
          for (const c of connections) {
            if (idsToDelete.has(c.fromId) || idsToDelete.has(c.toId)) {
              // Find auto-conduit organs in the connection chain
              for (const o of organs) {
                if (o.isAutoConduit && (o.id === c.fromId || o.id === c.toId)) {
                  conduitIdsToDelete.add(o.id);
                  if (o.mirrorId) conduitIdsToDelete.add(o.mirrorId);
                }
              }
            }
          }
          const allOrganIdsToDelete = new Set([...idsToDelete, ...conduitIdsToDelete]);
          setOrgans((prev) => prev.filter((o) => !allOrganIdsToDelete.has(o.id)));
          setConnections((prev) => prev.filter(
            (c) => !allOrganIdsToDelete.has(c.fromId) && !allOrganIdsToDelete.has(c.toId),
          ));
          if (selectedId && allOrganIdsToDelete.has(selectedId)) setSelectedId(null);
          break;
        }
        const connHit = hitTestConnection(sx, sy);
        if (connHit) {
          pushHistory();
          const connIdsToDelete = new Set<string>([connHit.id]);
          if (connHit.mirrorId) connIdsToDelete.add(connHit.mirrorId);
          // Also delete any auto-conduit organs that were created solely for this connection
          const conduitIdsToDelete = new Set<string>();
          for (const o of organs) {
            if (o.isAutoConduit && (o.id === connHit.fromId || o.id === connHit.toId)) {
              // Check if this conduit organ is used by any other connection that's NOT being deleted
              const usedByOther = connections.some(
                (c) => !connIdsToDelete.has(c.id) && (c.fromId === o.id || c.toId === o.id),
              );
              if (!usedByOther) {
                conduitIdsToDelete.add(o.id);
                if (o.mirrorId) conduitIdsToDelete.add(o.mirrorId);
              }
            }
          }
          setConnections((prev) => prev.filter((c) => !connIdsToDelete.has(c.id)));
          if (conduitIdsToDelete.size > 0) {
            setOrgans((prev) => prev.filter((o) => !conduitIdsToDelete.has(o.id)));
          }
        }
        break;
      }
      case 'measure': {
        if (measure.startWX === null) {
          // First click
          setMeasure({ startWX: wx, startWZ: wz, endWX: wx, endWZ: wz });
        } else {
          // Second click — finalize
          setMeasure((prev) => ({ ...prev, endWX: wx, endWZ: wz }));
        }
        break;
      }
      case 'section': {
        // Check if clicking near a section boundary line (horizontal lines)
        const vm = viewMetricsRef.current;
        // Apply zoom and pan to match effective screen positions
        const effShipTop = vm.cy + panY - vm.shipH * zoom / 2;
        const effShipH = vm.shipH * zoom;
        for (let i = 1; i < sectionBounds.length; i++) {
          const boundY = effShipTop + sectionBounds[i] * effShipH;
          if (Math.abs(sy - boundY) < 10) {
            m.draggingSectionIdx = i;
            pushHistory();
            return;
          }
        }
        // Also check the last boundary (uMax of last section = 1.0)
        const lastBound = effShipTop + 1.0 * effShipH;
        if (Math.abs(sy - lastBound) < 10) {
          m.draggingSectionIdx = sectionBounds.length;
        }
        break;
      }
      case 'repair': {
        const hit = hitTestOrgan(sx, sy);
        if (hit && hit.health < 1) {
          pushHistory();
          setOrgans((prev) => prev.map((o) =>
            o.id === hit.id ? { ...o, health: 1 } : o,
          ));
        }
        break;
      }
      case 'hull-edit': {
        // In freehand mode, start drawing on canvas mousedown
        if (hullEditMode === 'freehand') {
          pushHistory();
          setFreehandPoints([{ wx, wz }]);
          setFreehandDrawing(true);
          setHullCustomized(true);
        }
        break;
      }
    }
  }, [activeTool, screenToWorld, hitTestOrgan, hitTestConnection, hitTestPort, getPortScreenPos, connectFromId, connectFromPort, measure.startWX, sectionBounds, mirrorX, mirrorZ, organs, selectedOrganNodeId, selectedPartId, partDragMode, placedParts, hullEditMode, panX, panY, zoom, pushHistory]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { wx, wz } = screenToWorld(sx, sy);
    const m = mouseRef.current;
    m.lastX = sx; m.lastY = sy;
    m.worldWX = wx; m.worldWZ = wz;

    if (!m.isDown) return;

    switch (activeTool) {
      case 'select': {
        // Placed part transform: move / resize / rotate
        if (partDragMode && partDragStartRef.current && selectedPartId) {
          const start = partDragStartRef.current;
          const dx = wx - start.wx;
          const dz = wz - start.wz;
          if (partDragMode === 'move') {
            setPlacedParts((prev) => prev.map((p) =>
              p.id === selectedPartId
                ? { ...p, wx: start.part.wx + dx, wz: start.part.wz + dz }
                : p,
            ));
          } else if (partDragMode === 'rotate') {
            const angle = Math.atan2(dz, dx) + Math.PI / 2;
            setPlacedParts((prev) => prev.map((p) =>
              p.id === selectedPartId ? { ...p, rotation: angle } : p,
            ));
          } else if (partDragMode.startsWith('resize')) {
            // Compute new scale from the drag distance relative to the part center
            const startBounds = getPartBounds(start.part);
            const startW = startBounds.maxX - startBounds.minX;
            const startH = startBounds.maxZ - startBounds.minZ;
            const startDiag = Math.hypot(startW, startH) || 1;
            const curDiag = Math.hypot(
              wx - start.part.wx,
              wz - start.part.wz,
            );
            const newScale = Math.max(0.1, (curDiag / startDiag) * start.part.scale);
            setPlacedParts((prev) => prev.map((p) =>
              p.id === selectedPartId ? { ...p, scale: newScale } : p,
            ));
          }
          break;
        }
        if (m.draggingOrganId) {
          const newWX = wx + m.dragOffsetWX;
          const newWZ = wz + m.dragOffsetWZ;
          setOrgans((prev) => prev.map((o) => {
            if (o.id === m.draggingOrganId) {
              return { ...o, wx: newWX, wz: newWZ };
            }
            // Move mirrored counterpart
            if (o.mirrorId === m.draggingOrganId) {
              return {
                ...o,
                wx: mirrorX ? -newWX : o.wx,
                wz: mirrorZ ? -newWZ : o.wz,
              };
            }
            return o;
          }));
        }
        break;
      }
      case 'pan': {
        if (m.panning) {
          const dx = sx - m.startX;
          const dy = sy - m.startY;
          setPanX(m.panStartX + dx);
          setPanY(m.panStartY + dy);
        }
        break;
      }
      case 'measure': {
        if (measure.startWX !== null) {
          setMeasure((prev) => ({ ...prev, endWX: wx, endWZ: wz }));
        }
        break;
      }
      case 'section': {
        if (m.draggingSectionIdx >= 0) {
          const vm = viewMetricsRef.current;
          // Apply zoom and pan to match the effective screen positions
          const effShipTop = vm.cy + panY - vm.shipH * zoom / 2;
          const u = (sy - effShipTop) / (vm.shipH * zoom);
          const clampedU = Math.max(0.02, Math.min(0.98, u));
          setSectionBounds((prev) => {
            const next = [...prev];
            // Ensure boundaries don't cross each other
            if (m.draggingSectionIdx > 0 && clampedU > next[m.draggingSectionIdx - 1] + 0.02) {
              next[m.draggingSectionIdx] = clampedU;
            }
            return next;
          });
        }
        break;
      }
    }
  }, [activeTool, screenToWorld, measure.startWX, mirrorX, mirrorZ, panX, panY, zoom, partDragMode, partDragStartRef, selectedPartId, getPartBounds]);

  const handleMouseUp = useCallback(() => {
    const m = mouseRef.current;
    m.isDown = false;
    m.draggingOrganId = null;
    m.panning = false;
    m.draggingSectionIdx = -1;
    // Clear placed part transform drag
    setPartDragMode(null);
    partDragStartRef.current = null;
  }, []);

  // ── Hull drag: window listeners for dragging hull control points / handles / edge points ──
  useEffect(() => {
    if (!hullDragId) return;

    const handleMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { wx, wz } = screenToWorld(sx, sy);

      setHullOutline((prev) => {
        const next: HullOutline = {
          anchors: [...prev.anchors],
          handles: [...prev.handles],
          segments: prev.segments,
        };

        if (hullDragType === 'anchor') {
          const idx = next.anchors.findIndex((a) => a.id === hullDragId);
          if (idx >= 0) {
            const oldAnchor = next.anchors[idx];
            // Locked anchors cannot be dragged
            if (oldAnchor.locked) return prev;
            const dwx = wx - oldAnchor.wx;
            const dwz = wz - oldAnchor.wz;
            next.anchors[idx] = { ...oldAnchor, wx, wz };
            // Move attached handles by the same delta
            for (const seg of prev.segments) {
              if (seg.startAnchorId === hullDragId) {
                const hIdx = next.handles.findIndex((h) => h.id === seg.startHandleId);
                if (hIdx >= 0) next.handles[hIdx] = { ...next.handles[hIdx], wx: next.handles[hIdx].wx + dwx, wz: next.handles[hIdx].wz + dwz };
              }
              if (seg.endAnchorId === hullDragId) {
                const hIdx = next.handles.findIndex((h) => h.id === seg.endHandleId);
                if (hIdx >= 0) next.handles[hIdx] = { ...next.handles[hIdx], wx: next.handles[hIdx].wx + dwx, wz: next.handles[hIdx].wz + dwz };
              }
            }
            // Mirror: if mirrorX is on, mirror the anchor and its handles
            if (mirrorX && oldAnchor.wx !== 0) {
              // Mirror mapping: port ↔ starboard
              const anchorMirrorMap: Record<string, string> = {
                'a-port-peak': 'a-stbd-peak',
                'a-stbd-peak': 'a-port-peak',
                'a-win-port': 'a-win-stbd',
                'a-win-stbd': 'a-win-port',
                'a-port-wall-fwd': 'a-stbd-wall-fwd',
                'a-stbd-wall-fwd': 'a-port-wall-fwd',
                'a-port-wall-aft': 'a-stbd-wall-aft',
                'a-stbd-wall-aft': 'a-port-wall-aft',
              };
              const mirrorAnchorId = anchorMirrorMap[oldAnchor.id] || null;
              if (mirrorAnchorId) {
                const mIdx = next.anchors.findIndex((a) => a.id === mirrorAnchorId);
                if (mIdx >= 0) {
                  next.anchors[mIdx] = { ...next.anchors[mIdx], wx: -wx, wz };
                  // Mirror handles: for each segment connected to the dragged anchor,
                  // find the mirrored segment and mirror the corresponding handle
                  // (start↔end because mirrored segments run in opposite directions)
                  const segMirrorMap = [2, 1, 0, 6, 5, 4, 3];
                  for (const seg of prev.segments) {
                    const segIdx = prev.segments.indexOf(seg);
                    const mirrorSegIdx = segMirrorMap[segIdx];
                    if (mirrorSegIdx === undefined) continue;
                    const mirrorSeg = prev.segments[mirrorSegIdx];
                    // If this segment starts at the dragged anchor, mirror its start handle
                    // to the mirror segment's END handle
                    if (seg.startAnchorId === oldAnchor.id) {
                      const srcHIdx = next.handles.findIndex((h) => h.id === seg.startHandleId);
                      const dstHIdx = next.handles.findIndex((h) => h.id === mirrorSeg.endHandleId);
                      if (srcHIdx >= 0 && dstHIdx >= 0) {
                        next.handles[dstHIdx] = { ...next.handles[dstHIdx], wx: -next.handles[srcHIdx].wx, wz: next.handles[srcHIdx].wz };
                      }
                    }
                    // If this segment ends at the dragged anchor, mirror its end handle
                    // to the mirror segment's START handle
                    if (seg.endAnchorId === oldAnchor.id) {
                      const srcHIdx = next.handles.findIndex((h) => h.id === seg.endHandleId);
                      const dstHIdx = next.handles.findIndex((h) => h.id === mirrorSeg.startHandleId);
                      if (srcHIdx >= 0 && dstHIdx >= 0) {
                        next.handles[dstHIdx] = { ...next.handles[dstHIdx], wx: -next.handles[srcHIdx].wx, wz: next.handles[srcHIdx].wz };
                      }
                    }
                  }
                }
              }
            }
          }
        } else if (hullDragType === 'handle') {
          const idx = next.handles.findIndex((h) => h.id === hullDragId);
          if (idx >= 0) {
            next.handles[idx] = { ...next.handles[idx], wx, wz };
            // Mirror: if this handle belongs to a stbd-edge segment, mirror to port
            if (mirrorX) {
              // Find the segment this handle belongs to
              const seg = prev.segments.find((s) => s.startHandleId === hullDragId || s.endHandleId === hullDragId);
              if (seg) {
                // 7 segments, mirrored pairs run in opposite directions:
                // 0: A→W1             ↔  2: W2→B        (start↔end)
                // 1: W1→W2            ↔  self           (start↔end)
                // 2: W2→B             ↔  0: A→W1        (start↔end)
                // 3: B→stbd-peak      ↔  6: port-peak→A (start↔end)
                // 4: stbd-peak→tail   ↔  5: tail→port-peak (start↔end)
                // mirror: 0↔2, 1→1, 3↔6, 4↔5
                const segIdx = prev.segments.indexOf(seg);
                const mirrorMap = [2, 1, 0, 6, 5, 4, 3];
                const mirrorSegIdx = mirrorMap[segIdx];
                if (mirrorSegIdx !== undefined && mirrorSegIdx < prev.segments.length) {
                  const mirrorSeg = prev.segments[mirrorSegIdx];
                  const isStartHandle = seg.startHandleId === hullDragId;
                  // Mirrored segments run in opposite directions (port↔stbd),
                  // so start↔end and end↔start
                  const mirrorHandleId = isStartHandle ? mirrorSeg.endHandleId : mirrorSeg.startHandleId;
                  const mHIdx = next.handles.findIndex((h) => h.id === mirrorHandleId);
                  if (mHIdx >= 0) {
                    next.handles[mHIdx] = { ...next.handles[mHIdx], wx: -wx, wz };
                  }
                }
              }
            }
          }
        } else if (hullDragType === 'edge') {
          // Edge point drag: deform the hull outline by moving the nearest
          // non-command-room anchor and its handles toward the cursor.
          // Command room anchors (A, B, W1, W2, C, D) are excluded — they
          // define the room geometry and must not be moved by edge dragging.
          const commandRoomAnchorIds = new Set([
            'a-port-wall-fwd', 'a-stbd-wall-fwd',
            'a-win-port', 'a-win-stbd',
            'a-port-wall-aft', 'a-stbd-wall-aft',
          ]);
          const pointIdx = parseInt(hullDragId.replace('ep-', ''));
          const samples = sampleHullOutline(prev, 8);
          if (pointIdx < samples.length) {
            const target = samples[pointIdx];
            // Find the nearest editable, non-command-room anchor
            let nearestAnchorIdx = -1;
            let minDist = Infinity;
            for (let i = 0; i < prev.anchors.length; i++) {
              const a = prev.anchors[i];
              if (a.locked || commandRoomAnchorIds.has(a.id)) continue;
              const d = Math.hypot(a.wx - target.wx, a.wz - target.wz);
              if (d < minDist) { minDist = d; nearestAnchorIdx = i; }
            }
            if (nearestAnchorIdx >= 0) {
              // Move the nearest anchor and its handles toward the cursor
              const anchor = next.anchors[nearestAnchorIdx];
              const dwx = wx - anchor.wx;
              const dwz = wz - anchor.wz;
              next.anchors[nearestAnchorIdx] = { ...anchor, wx, wz };
              for (const seg of prev.segments) {
                if (seg.startAnchorId === anchor.id) {
                  const hIdx = next.handles.findIndex((h) => h.id === seg.startHandleId);
                  if (hIdx >= 0) next.handles[hIdx] = { ...next.handles[hIdx], wx: next.handles[hIdx].wx + dwx * 0.5, wz: next.handles[hIdx].wz + dwz * 0.5 };
                }
                if (seg.endAnchorId === anchor.id) {
                  const hIdx = next.handles.findIndex((h) => h.id === seg.endHandleId);
                  if (hIdx >= 0) next.handles[hIdx] = { ...next.handles[hIdx], wx: next.handles[hIdx].wx + dwx * 0.5, wz: next.handles[hIdx].wz + dwz * 0.5 };
                }
              }
              // Mirror the moved anchor and its handles (same logic as anchor drag)
              if (mirrorX && anchor.wx !== 0) {
                const anchorMirrorMap: Record<string, string> = {
                  'a-port-peak': 'a-stbd-peak',
                  'a-stbd-peak': 'a-port-peak',
                  'a-win-port': 'a-win-stbd',
                  'a-win-stbd': 'a-win-port',
                  'a-port-wall-fwd': 'a-stbd-wall-fwd',
                  'a-stbd-wall-fwd': 'a-port-wall-fwd',
                  'a-port-wall-aft': 'a-stbd-wall-aft',
                  'a-stbd-wall-aft': 'a-port-wall-aft',
                };
                const mirrorAnchorId = anchorMirrorMap[anchor.id] || null;
                if (mirrorAnchorId) {
                  const mIdx = next.anchors.findIndex((a) => a.id === mirrorAnchorId);
                  if (mIdx >= 0) {
                    next.anchors[mIdx] = { ...next.anchors[mIdx], wx: -wx, wz };
                    const segMirrorMap = [2, 1, 0, 6, 5, 4, 3];
                    for (const seg of prev.segments) {
                      const segIdx = prev.segments.indexOf(seg);
                      const mirrorSegIdx = segMirrorMap[segIdx];
                      if (mirrorSegIdx === undefined) continue;
                      const mirrorSeg = prev.segments[mirrorSegIdx];
                      if (seg.startAnchorId === anchor.id) {
                        const srcHIdx = next.handles.findIndex((h) => h.id === seg.startHandleId);
                        const dstHIdx = next.handles.findIndex((h) => h.id === mirrorSeg.endHandleId);
                        if (srcHIdx >= 0 && dstHIdx >= 0) {
                          next.handles[dstHIdx] = { ...next.handles[dstHIdx], wx: -next.handles[srcHIdx].wx, wz: next.handles[srcHIdx].wz };
                        }
                      }
                      if (seg.endAnchorId === anchor.id) {
                        const srcHIdx = next.handles.findIndex((h) => h.id === seg.endHandleId);
                        const dstHIdx = next.handles.findIndex((h) => h.id === mirrorSeg.startHandleId);
                        if (srcHIdx >= 0 && dstHIdx >= 0) {
                          next.handles[dstHIdx] = { ...next.handles[dstHIdx], wx: -next.handles[srcHIdx].wx, wz: next.handles[srcHIdx].wz };
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        } else if (hullDragType === 'corner') {
          // Live Corner drag: adjust cornerRadius based on distance from anchor
          const anchorIdx = next.anchors.findIndex((a) => a.id === hullDragId);
          if (anchorIdx >= 0) {
            const anchor = next.anchors[anchorIdx];
            // Radius = distance from cursor to anchor in world meters
            const radius = Math.hypot(wx - anchor.wx, wz - anchor.wz);
            // Clamp to max radius based on adjacent segment lengths
            const maxR = maxCornerRadius(prev, anchor.id);
            const clampedRadius = Math.max(0, Math.min(maxR, radius));
            next.anchors[anchorIdx] = { ...anchor, cornerRadius: clampedRadius };
            // Mirror: if mirrorX is on, set the same radius + type on the mirrored anchor
            if (mirrorX && anchor.wx !== 0) {
              const anchorMirrorMap: Record<string, string> = {
                'a-port-peak': 'a-stbd-peak',
                'a-stbd-peak': 'a-port-peak',
                'a-win-port': 'a-win-stbd',
                'a-win-stbd': 'a-win-port',
                'a-port-wall-fwd': 'a-stbd-wall-fwd',
                'a-stbd-wall-fwd': 'a-port-wall-fwd',
                'a-port-wall-aft': 'a-stbd-wall-aft',
                'a-stbd-wall-aft': 'a-port-wall-aft',
              };
              const mirrorId = anchorMirrorMap[anchor.id];
              if (mirrorId) {
                const mIdx = next.anchors.findIndex((a) => a.id === mirrorId);
                if (mIdx >= 0) {
                  const maxRm = maxCornerRadius(prev, mirrorId);
                  const clampedM = Math.max(0, Math.min(maxRm, clampedRadius));
                  next.anchors[mIdx] = { ...next.anchors[mIdx], cornerRadius: clampedM, cornerType: anchor.cornerType, cornerRelative: anchor.cornerRelative };
                }
              }
            }
          }
        }
        return next;
      });
    };

    const handleUp = () => {
      setHullDragId(null);
      setHullDragType(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [hullDragId, hullDragType, screenToWorld, mirrorX]);

  // ── Freehand drawing: window listeners ──
  useEffect(() => {
    if (!freehandDrawing) return;

    const handleMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { wx, wz } = screenToWorld(sx, sy);
      setFreehandPoints((prev) => {
        // Only add point if moved enough (avoid jitter)
        const last = prev[prev.length - 1];
        if (last && Math.hypot(wx - last.wx, wz - last.wz) < 0.15) return prev;
        // Mirror points in real-time for visual feedback
        const newPts = [...prev, { wx, wz }];
        if (mirrorX && wx !== 0) newPts.push({ wx: -wx, wz });
        if (mirrorZ && wz !== 0) newPts.push({ wx, wz: -wz });
        if (mirrorX && mirrorZ && wx !== 0 && wz !== 0) newPts.push({ wx: -wx, wz: -wz });
        return newPts;
      });
    };

    const handleUp = () => {
      setFreehandDrawing(false);
      // Convert freehand points to a new hull outline
      setFreehandPoints((points) => {
        if (points.length < 4) return [];
        // Filter out mirror-generated points (keep only the drawn half)
        // The drawn points are the ones the user actually traced
        let drawnPoints = points;
        // If mirror was on, the array has interleaved mirror points.
        // We can't easily separate them, so just use all points as-is
        // — the mirror points will form a symmetric hull naturally.
        // Simplify the path into anchor points
        const N = Math.max(1, Math.floor(drawnPoints.length / 8));
        const anchorPoints: { wx: number; wz: number }[] = [];
        for (let i = 0; i < drawnPoints.length; i += N) {
          anchorPoints.push(drawnPoints[i]);
        }
        // Ensure the last point is included
        if (anchorPoints[anchorPoints.length - 1] !== drawnPoints[drawnPoints.length - 1]) {
          anchorPoints.push(drawnPoints[drawnPoints.length - 1]);
        }

        // Create anchors
        const newAnchors: HullAnchor[] = anchorPoints.map((p, i) => ({
          id: `a-fh-${i}`,
          wx: p.wx,
          wz: p.wz,
        }));

        // Create segments with auto-generated handles
        const newHandles: HullHandle[] = [];
        const newSegments: HullSegment[] = [];
        for (let i = 0; i < newAnchors.length; i++) {
          const nextIdx = (i + 1) % newAnchors.length;
          const a0 = newAnchors[i];
          const a1 = newAnchors[nextIdx];
          const prevIdx = (i - 1 + newAnchors.length) % newAnchors.length;
          const aPrev = newAnchors[prevIdx];
          const aNext = newAnchors[(nextIdx + 1) % newAnchors.length];
          // Auto-generate handles: 1/3 of the distance to the next/prev anchor
          const sHId = `h-fh-${i}-s`;
          const eHId = `h-fh-${i}-e`;
          newHandles.push({
            id: sHId,
            wx: a0.wx + (a1.wx - aPrev.wx) / 6,
            wz: a0.wz + (a1.wz - aPrev.wz) / 6,
          });
          newHandles.push({
            id: eHId,
            wx: a1.wx - (aNext.wx - a0.wx) / 6,
            wz: a1.wz - (aNext.wz - a0.wz) / 6,
          });
          newSegments.push({
            id: `s-fh-${i}`,
            startAnchorId: a0.id,
            endAnchorId: a1.id,
            startHandleId: sHId,
            endHandleId: eHId,
          });
        }

        setHullOutline({ anchors: newAnchors, handles: newHandles, segments: newSegments });
        setHullCustomized(true);
        return [];
      });
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [freehandDrawing, screenToWorld, mirrorX, mirrorZ]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    // preventDefault is handled by the native non-passive listener below
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.3, Math.min(5, z * delta)));
  }, []);

  // Attach a native non-passive wheel listener so preventDefault works
  // (React's synthetic wheel events are passive by default in modern browsers)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const nativeHandler = (e: WheelEvent) => {
      e.preventDefault();
    };
    canvas.addEventListener('wheel', nativeHandler, { passive: false });
    return () => canvas.removeEventListener('wheel', nativeHandler);
  }, []);

  // ── Canvas drawing ──
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const t = (performance.now() - startTimeRef.current) / 1000;

    // ── Background: deep biological darkness ──
    // Layer 3 (Biology): deep darkness with bioluminescent depth
    const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    bgGrad.addColorStop(0, '#0A1520');
    bgGrad.addColorStop(0.5, '#06101A');
    bgGrad.addColorStop(1, '#030810');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // ── Subtle bio-fluid shimmer (the ship is alive) ──
    // Slow-moving bioluminescent particles in the background
    ctx.save();
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 40; i++) {
      const px = ((i * 137.5 + t * 8) % w);
      const py = ((i * 89.3 + Math.sin(t * 0.3 + i) * 30 + t * 5) % h);
      const pr = 1 + Math.sin(t * 0.5 + i * 0.7) * 0.5;
      ctx.fillStyle = i % 3 === 0 ? '#FFB347' : '#06b6d4';
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // ── Ship footprint area ──
    // The ship occupies a vertical strip in the center of the canvas.
    // Top-down view: Z-axis runs top-bottom (nose top, tail bottom),
    // X-axis runs left-right (port left, starboard right).
    const shipLength = state.length;
    const padding = 80;
    const usableW = w - padding * 2;
    const usableH = h - padding * 2;
    const scale = Math.min(usableW / (thoraxWidth + 4), usableH / (shipLength + 4));
    const shipW = thoraxWidth * scale; // hull width in screen pixels (port-starboard)
    const shipH = shipLength * scale;  // hull length in screen pixels (fore-aft)
    const cx = w / 2;
    const cy = h / 2;
    const shipLeft = cx - shipW / 2;
    const shipRight = cx + shipW / 2;
    const shipTop = cy - shipH / 2;
    const shipBottom = cy + shipH / 2;

    // Store view metrics for mouse handlers (screen↔world conversion)
    viewMetricsRef.current = { cx, cy, scale, shipLeft, shipRight, shipW, shipH, padding };

    // ── Effective (zoom + pan adjusted) screen coordinates for drawing ──
    // worldToScreen applies zoom and pan on top of the base cx/cy/scale.
    // These effective values let the grid, sections, labels, ruler, etc.
    // respond to zoom and pan just like organs and the hull outline do.
    const effScale = scale * zoom;
    const effCx = cx + panX;
    const effCy = cy + panY;
    const effShipW = shipW * zoom;
    const effShipH = shipH * zoom;
    const effShipLeft = effCx - effShipW / 2;
    const effShipRight = effCx + effShipW / 2;
    const effShipTop = effCy - effShipH / 2;
    const effShipBottom = effCy + effShipH / 2;

    // ── Hull footprint fill (the outline is drawn as SVG overlay) ──
    // The fill is drawn on canvas; the editable vector outline is an SVG element
    // positioned over the canvas. This keeps the fill behind organs/connections
    // while the SVG outline renders on top.
    ctx.save();
    const hullPath = hullToSvgPath(hullOutline, (wx, wz) => {
      const { sx, sy } = worldToScreen(wx, wz);
      return { x: sx, y: sy };
    });
    // Use Path2D to fill the hull shape on canvas
    const p2d = new Path2D(hullPath);
    ctx.fillStyle = 'rgba(6, 182, 212, 0.03)';
    ctx.fill(p2d);
    ctx.restore();

    // ── Placed outline part instances ──
    // Render each placed silhouette using the raw SVG Path2D data for
    // full-fidelity curves (matching the drawer icons). A composed affine
    // transform maps SVG 512-space → normalized local → part transform →
    // world → screen.
    const vm = viewMetricsRef.current;
    const worldScale = vm.scale * zoom;
    for (const part of placedParts) {
      const bbox = svgPathBBoxCached(part.pathD, { targetSize: 3.0 });
      if (!bbox) continue;
      const isSelected = part.id === selectedPartId;
      const p2d = getPath2D(part.pathD);

      // Compose the affine transform:
      //   SVG (svgX, svgY) → local: (svgX - cx) * normScale, (svgY - cy) * normScale
      //   local → part-scaled: * partScale
      //   part-scaled → rotated: cos/sin
      //   rotated → world: + partWX, partWZ
      //   world → screen: * worldScale + vm.cx + panX, * worldScale + vm.cy + panY
      const S = bbox.normScale * part.scale * worldScale;
      const cos = Math.cos(part.rotation);
      const sin = Math.sin(part.rotation);
      // Canvas matrix: [a c e; b d f; 0 0 1]
      //   screenX = a*svgX + c*svgY + e
      //   screenY = b*svgX + d*svgY + f
      const a = S * cos;
      const b = S * sin;
      const c = -S * sin;
      const d = S * cos;
      // Compute screen position of the part center
      const centerSX = vm.cx + part.wx * worldScale + panX;
      const centerSY = vm.cy + part.wz * worldScale + panY;
      // Adjust for the SVG bbox center offset
      const e = centerSX - (bbox.cx * a + bbox.cy * c);
      const f = centerSY - (bbox.cx * b + bbox.cy * d);

      ctx.save();
      ctx.setTransform(dpr * a, dpr * b, dpr * c, dpr * d, dpr * e, dpr * f);
      ctx.fillStyle = isSelected ? 'rgba(52, 211, 153, 0.18)' : 'rgba(6, 182, 212, 0.12)';
      ctx.fill(p2d);
      ctx.strokeStyle = isSelected ? 'rgba(52, 211, 153, 0.8)' : 'rgba(6, 182, 212, 0.5)';
      ctx.lineWidth = (isSelected ? 2 : 1.5) / S; // counter-scale the stroke width
      ctx.stroke(p2d);
      ctx.restore();
      // Restore the DPR-scaled identity transform
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ── Anatomical section dividers ──
    // 5 sections: Cranial (0-15%), Neck (15-30%), Thoracic (30-65%),
    // Caudal (65-85%), Tail (85-100%)
    // Uses sectionBounds state so dragging boundaries updates the dividers.
    const sectionColors: Record<string, string> = {
      cranial: 'rgba(96, 165, 250, 0.7)',    // blue
      neck: 'rgba(251, 191, 36, 0.7)',       // amber
      thoracic: 'rgba(52, 211, 153, 0.7)',   // emerald
      caudal: 'rgba(244, 114, 182, 0.7)',    // pink
      tail: 'rgba(167, 139, 250, 0.7)',      // violet
    };

    for (let i = 0; i < SHIP_SECTIONS.length; i++) {
      const sec = SHIP_SECTIONS[i];
      const uMin = sectionBounds[i] ?? sec.uMin;
      const uMax = i < SHIP_SECTIONS.length - 1 ? (sectionBounds[i + 1] ?? sec.uMax) : sec.uMax;
      const secTop = effShipTop + uMin * effShipH;
      const secBottom = effShipTop + uMax * effShipH;
      const secColor = sectionColors[sec.id] || 'rgba(6, 182, 212, 0.5)';

      // Section label (left side, rotated)
      ctx.save();
      ctx.font = '9px "Orbitron", monospace';
      ctx.fillStyle = secColor;
      ctx.textAlign = 'center';
      ctx.fillText(sec.label.toUpperCase(), effShipLeft - 12, (secTop + secBottom) / 2);
      ctx.restore();

      // Section divider line (dashed, horizontal)
      if (uMin > 0) {
        ctx.save();
        ctx.strokeStyle = secColor.replace('0.7', '0.2');
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(effShipLeft - 8, secTop);
        ctx.lineTo(effShipRight + 8, secTop);
        ctx.stroke();
        ctx.restore();
      }
    }

    // ── Command Room (connects at hull window edges) ──
    // The command room is a human-scale square room at the front of the ship.
    // Its dimensions are fixed and match the hull's anchored window-edge points.
    // The hull has locked anchors at:
    //   wall z- (frontmost vertex), window z-, window z+, wall z+ (back vertex)
    // The room spans from wall z- to wall z+ and connects to the hull at the
    // window edge anchors on both port and starboard sides.
    {
      const shipLengthM = state.length;
      // Get the hull's anchored window edges and wall vertices
      const winEdges = hullWindowEdges(hullOutline);
      const wallFront = hullOutline.anchors.find((a) => a.id === 'a-port-wall-fwd');
      const wallBack = hullOutline.anchors.find((a) => a.id === 'a-port-wall-aft');
      const wallStbdFront = hullOutline.anchors.find((a) => a.id === 'a-stbd-wall-fwd');
      const wallStbdBack = hullOutline.anchors.find((a) => a.id === 'a-stbd-wall-aft');

      // Crew count scales with ship length
      const crewCount = shipLengthM <= 7 ? 1 : shipLengthM <= 12 ? 2 : shipLengthM <= 17 ? 3 : shipLengthM <= 25 ? 4 : 5;

      // Room dimensions from the hull anchors (fixed)
      const roomHalfWidth = wallFront && wallStbdFront ? Math.abs(wallStbdFront.wx - wallFront.wx) / 2 : thoraxWidth * 0.2;
      const roomHalfHeight = wallFront && wallBack ? Math.abs(wallBack.wz - wallFront.wz) / 2 : 2;
      const roomWidthPx = roomHalfWidth * 2 * scale * zoom;
      const roomHeightPx = roomHalfHeight * 2 * scale * zoom;
      const roomHalfPx = roomWidthPx / 2;
      const roomHalfHPx = roomHeightPx / 2;

      // Room center on screen — midpoint between all 4 wall corners
      const roomCenterWz = (wallFront && wallBack) ? (wallFront.wz + wallBack.wz) / 2 : -shipLengthM / 2 + 0.08 * shipLengthM;
      const roomCenterScreen = worldToScreen(0, roomCenterWz);
      const roomCenterX = roomCenterScreen.sx;
      const roomCenterY = roomCenterScreen.sy;

      // Window edge positions on screen (W1 and W2 on the front wall)
      const winPortScreen = winEdges.port ? worldToScreen(winEdges.port.wx, winEdges.port.wz) : null;
      const winStbdScreen = winEdges.stbd ? worldToScreen(winEdges.stbd.wx, winEdges.stbd.wz) : null;

      ctx.save();
      // Room shell — glossy white with cyan glow (Frutiger Aero)
      const roomGrad = ctx.createLinearGradient(
        roomCenterX - roomHalfPx, roomCenterY - roomHalfHPx,
        roomCenterX + roomHalfPx, roomCenterY + roomHalfHPx,
      );
      roomGrad.addColorStop(0, 'rgba(240, 248, 255, 0.25)');
      roomGrad.addColorStop(0.5, 'rgba(0, 206, 209, 0.15)');
      roomGrad.addColorStop(1, 'rgba(240, 248, 255, 0.20)');
      ctx.fillStyle = roomGrad;
      ctx.fillRect(roomCenterX - roomHalfPx, roomCenterY - roomHalfHPx, roomWidthPx, roomHeightPx);

      // Border — cyan with glow
      ctx.strokeStyle = 'rgba(0, 206, 209, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.strokeRect(roomCenterX - roomHalfPx, roomCenterY - roomHalfHPx, roomWidthPx, roomHeightPx);

      // Inner glow border
      ctx.strokeStyle = 'rgba(0, 206, 209, 0.2)';
      ctx.lineWidth = 3;
      ctx.strokeRect(roomCenterX - roomHalfPx - 1, roomCenterY - roomHalfHPx - 1, roomWidthPx + 2, roomHeightPx + 2);

      ctx.setLineDash([]);

      // Window cut — front-facing viewport on the top edge (toward the nose)
      // Spans from W1 (port) to W2 (stbd) on the front wall
      if (winPortScreen && winStbdScreen) {
        const winLeft = winPortScreen.sx;
        const winRight = winStbdScreen.sx;
        const winTop = roomCenterY - roomHalfHPx - 2;
        ctx.fillStyle = 'rgba(0, 206, 209, 0.35)';
        ctx.fillRect(winLeft, winTop, winRight - winLeft, 3);
        // Window glow
        ctx.strokeStyle = 'rgba(0, 206, 209, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(winLeft, winTop, winRight - winLeft, 3);
      }

      // ── Crew stations with neural-link nodes ──
      // Each station is a separate node inside the command room.
      // All stations receive from the single neuro_link "Pilot" output port,
      // which enters the room via the neuro-link port on the back wall.
      // The pilot signal fans out from that port to each active station.

      const activeStations = COMMAND_ROOM_STATIONS.slice(0, crewCount);
      const nodeR = Math.max(2, roomHalfPx * 0.09);
      const stationDotR = Math.max(1.5, roomHalfPx * 0.05);

      // Neuro-link port on the back wall — single entry point for the pilot signal
      const neuroLinkX = roomCenterX;
      const neuroLinkY = roomCenterY + roomHalfHPx - 2; // back wall (bottom in top-down)
      const neuroLinkR = Math.max(3, roomHalfPx * 0.11);

      // Compute station positions — laid out in a grid inside the room
      const stationPositions: { sx: number; sy: number; nx: number; ny: number }[] = [];
      for (let i = 0; i < crewCount; i++) {
        const stationX = roomCenterX - roomHalfPx * 0.3 + Math.floor(i / 2) * roomHalfPx * 0.6;
        const stationY = roomCenterY - roomHalfHPx * 0.5 + (i % 2) * roomHalfHPx * 0.8;
        // Node is below the station dot, toward the back wall
        const nodeOffsetY = roomHalfHPx * 0.12;
        stationPositions.push({
          sx: stationX,
          sy: stationY,
          nx: stationX,
          ny: stationY + nodeOffsetY,
        });
      }

      // Draw fan-out lines from the neuro-link port to each station node
      // These represent the pilot signal distributing to each crew station
      for (let i = 0; i < activeStations.length; i++) {
        const pos = stationPositions[i];
        const channelColor = `#${nodePipelineColor(activeStations[i].channelNodeId).toString(16).padStart(6, '0')}`;

        ctx.save();
        // Glow underlay
        ctx.strokeStyle = `${channelColor}22`;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(neuroLinkX, neuroLinkY);
        ctx.lineTo(pos.nx, pos.ny);
        ctx.stroke();

        // Animated flow line — dashes travel from neuro-link port → station node
        ctx.strokeStyle = `${channelColor}88`;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.lineDashOffset = -t * 15 - i * 2; // stagger each line's phase
        ctx.beginPath();
        ctx.moveTo(neuroLinkX, neuroLinkY);
        ctx.lineTo(pos.nx, pos.ny);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // Draw the neuro-link port (single input on the back wall)
      ctx.save();
      const nlGrad = ctx.createRadialGradient(neuroLinkX - neuroLinkR * 0.3, neuroLinkY - neuroLinkR * 0.3, 0, neuroLinkX, neuroLinkY, neuroLinkR);
      nlGrad.addColorStop(0, '#a855f7ff');
      nlGrad.addColorStop(0.7, '#a855f799');
      nlGrad.addColorStop(1, '#a855f744');
      ctx.fillStyle = nlGrad;
      ctx.beginPath();
      ctx.arc(neuroLinkX, neuroLinkY, neuroLinkR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#a855f7cc';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Pulsing ring on the neuro-link port
      const nlPulse = 0.5 + Math.sin(t * 2) * 0.3;
      ctx.strokeStyle = `rgba(168, 85, 247, ${nlPulse})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.lineDashOffset = -t * 10;
      ctx.beginPath();
      ctx.arc(neuroLinkX, neuroLinkY, neuroLinkR + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      if (roomHalfPx > 12) {
        ctx.font = `${Math.max(4, Math.floor(roomHalfPx * 0.1))}px "Rajdhani", monospace`;
        ctx.fillStyle = 'rgba(168, 85, 247, 0.8)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PILOT', neuroLinkX, neuroLinkY + neuroLinkR + 6);
      }
      ctx.restore();

      // Draw each crew station with its individual node
      for (let i = 0; i < activeStations.length; i++) {
        const station = activeStations[i];
        const pos = stationPositions[i];
        const channelColor = `#${nodePipelineColor(station.channelNodeId).toString(16).padStart(6, '0')}`;

        // Station dot (cyan — the crew member's physical workstation)
        ctx.save();
        ctx.fillStyle = 'rgba(0, 206, 209, 0.6)';
        ctx.beginPath();
        ctx.arc(pos.sx, pos.sy, stationDotR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Station neural-link node — colored by the channel's target system
        ctx.save();
        const nodeGrad = ctx.createRadialGradient(pos.nx - nodeR * 0.3, pos.ny - nodeR * 0.3, 0, pos.nx, pos.ny, nodeR);
        nodeGrad.addColorStop(0, `${channelColor}ff`);
        nodeGrad.addColorStop(0.7, `${channelColor}99`);
        nodeGrad.addColorStop(1, `${channelColor}44`);
        ctx.fillStyle = nodeGrad;
        ctx.beginPath();
        ctx.arc(pos.nx, pos.ny, nodeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `${channelColor}cc`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.restore();

        // Station label (role abbreviation) above the dot
        if (roomHalfPx > 15) {
          ctx.save();
          ctx.font = `${Math.max(4, Math.floor(roomHalfPx * 0.12))}px "Rajdhani", monospace`;
          ctx.fillStyle = 'rgba(0, 206, 209, 0.8)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(station.name, pos.sx, pos.sy - stationDotR - 4);
          ctx.restore();
        }

        // Channel label below the node (shows what system this station interfaces with)
        if (roomHalfPx > 18) {
          ctx.save();
          ctx.font = `${Math.max(3, Math.floor(roomHalfPx * 0.08))}px "Rajdhani", monospace`;
          ctx.fillStyle = `${channelColor}aa`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(station.channel, pos.nx, pos.ny + nodeR + 4);
          ctx.restore();
        }
      }

      // Label
      ctx.font = '7px "Orbitron", monospace';
      ctx.fillStyle = 'rgba(0, 206, 209, 0.7)';
      ctx.textAlign = 'center';
      ctx.fillText('CMD', roomCenterX, roomCenterY + roomHalfPx + 10);
      ctx.font = '6px "Rajdhani", monospace';
      ctx.fillStyle = 'rgba(0, 206, 209, 0.4)';
      ctx.fillText(`${crewCount} crew`, roomCenterX, roomCenterY + roomHalfPx + 19);
      ctx.restore();
    }

    // ── Centerline / spine axis (vertical: wx=0 → screenX=cx) ──
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 179, 71, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(effCx, effShipTop - 10);
    ctx.lineTo(effCx, effShipBottom + 10);
    ctx.stroke();
    ctx.restore();

    // Spine label
    ctx.save();
    ctx.font = '8px "Rajdhani", monospace';
    ctx.fillStyle = 'rgba(255, 179, 71, 0.5)';
    ctx.textAlign = 'left';
    ctx.fillText('SPINE', effCx + 4, effShipBottom + 22);
    ctx.restore();

    // ── Symmetry axes (when mirror is enabled) ──
    // Mirror X = port/starboard mirror → vertical line at wx=0 (screenX=cx)
    // Mirror Z = fore/aft mirror → horizontal line at wz=0 (screenY=cy)
    if (mirrorX) {
      ctx.save();
      const pulseAlpha = 0.15 + Math.sin(t * 1.5) * 0.05;
      ctx.strokeStyle = `rgba(34, 211, 238, ${pulseAlpha})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(effCx, effShipTop - 20);
      ctx.lineTo(effCx, effShipBottom + 20);
      ctx.stroke();
      // Mirror X label
      ctx.font = '8px "Orbitron", monospace';
      ctx.fillStyle = `rgba(34, 211, 238, ${pulseAlpha * 2})`;
      ctx.textAlign = 'left';
      ctx.fillText('↕ MIRROR X', effCx + 6, effShipTop - 8);
      ctx.restore();
    }
    if (mirrorZ) {
      ctx.save();
      const pulseAlpha = 0.15 + Math.sin(t * 1.5 + 1) * 0.05;
      ctx.strokeStyle = `rgba(34, 211, 238, ${pulseAlpha})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(effShipLeft - 20, effCy);
      ctx.lineTo(effShipRight + 20, effCy);
      ctx.stroke();
      // Mirror Z label
      ctx.font = '8px "Orbitron", monospace';
      ctx.fillStyle = `rgba(34, 211, 238, ${pulseAlpha * 2})`;
      ctx.textAlign = 'center';
      ctx.fillText('↔ MIRROR Z', effShipLeft - 24, effCy - 4);
      ctx.restore();
    }

    // ── Grid (bioluminescent, breathing) ──
    // Layer 1 (Interface): glossy, precise, skeuomorphic — like a holographic
    // drafting table. Grid pulses subtly to remind the user the ship is alive.
    // Grid mode: 'on' = 20px cells, 'fine' = 10px, 'coarse' = 40px, 'off' = none
    // Grid scales with zoom and offsets by pan so it stays aligned to the world.
    const gridPulse = 0.08 + Math.sin(t * 0.8) * 0.02;
    const baseGridSize = gridMode === 'fine' ? 10 : gridMode === 'coarse' ? 40 : 20;
    const gridSize = baseGridSize * zoom;
    if (gridMode !== 'off') {
      ctx.save();
      ctx.strokeStyle = `rgba(6, 182, 212, ${gridPulse})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      const startX = effCx % gridSize;
      for (let x = startX; x < w; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      const startY = effCy % gridSize;
      for (let y = startY; y < h; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
      ctx.restore();

      // Major grid lines (every 5 cells)
      ctx.save();
      ctx.strokeStyle = `rgba(6, 182, 212, ${gridPulse * 1.8})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      const majorSize = gridSize * 5;
      const majorStartX = effCx % majorSize;
      for (let x = majorStartX; x < w; x += majorSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      const majorStartY = effCy % majorSize;
      for (let y = majorStartY; y < h; y += majorSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // ── Ruler (left edge, vertical) ──
    // Skeuomorphic drafting ruler with meter markings along the fore-aft axis.
    // Markings scale with zoom and offset by pan so they track the ship.
    ctx.save();
    ctx.fillStyle = 'rgba(8, 27, 38, 0.8)';
    ctx.fillRect(padding / 2 - 20, padding / 2, 16, h - padding);
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(padding / 2 - 20, padding / 2, 16, h - padding);

    ctx.font = '8px "Rajdhani", monospace';
    ctx.fillStyle = 'rgba(6, 182, 212, 0.6)';
    ctx.textAlign = 'right';
    const rulerStart = effShipTop;
    const rulerEnd = effShipBottom;
    const metersPerCell = 1; // 1 meter per marking
    const pxPerMeter = effScale;
    for (let m = 0; m <= shipLength; m += metersPerCell) {
      const ry = rulerStart + m * pxPerMeter;
      if (ry < padding / 2 || ry > h - padding / 2) continue;
      const isMajor = m % 5 === 0;
      ctx.strokeStyle = `rgba(6, 182, 212, ${isMajor ? 0.6 : 0.25})`;
      ctx.beginPath();
      ctx.moveTo(padding / 2 - 20, ry);
      ctx.lineTo(padding / 2 - 20 + (isMajor ? 10 : 5), ry);
      ctx.stroke();
      if (isMajor) {
        ctx.fillText(`${m}m`, padding / 2 - 24, ry + 3);
      }
    }
    ctx.restore();

    // ── Port/Starboard labels ──
    // Port = left (negative wx), Starboard = right (positive wx)
    ctx.save();
    ctx.font = '9px "Orbitron", monospace';
    ctx.fillStyle = 'rgba(6, 182, 212, 0.4)';
    ctx.textAlign = 'right';
    ctx.fillText('PORT', effShipLeft - 16, effCy + 3);
    ctx.textAlign = 'left';
    ctx.fillText('STBD', effShipRight + 16, effCy + 3);
    // Dorsal/ventral indicator (top-down = looking at dorsal surface)
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 179, 71, 0.3)';
    ctx.font = '8px "Rajdhani", monospace';
    const viewLabel = `${viewOrientation.replace('-', ' ').toUpperCase()} · ${viewLayer.replace('-', ' ').toUpperCase()}`;
    ctx.fillText(viewLabel, effCx, padding / 2 - 10);
    ctx.restore();

    // ── Corner brackets (skeuomorphic viewport frame) ──
    // Layer 1: Frutiger Aero glossy corners — like a holographic display frame
    const bracketLen = 20;
    const bracketInset = 12;
    ctx.save();
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.5)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    // Top-left
    ctx.beginPath();
    ctx.moveTo(bracketInset, bracketInset + bracketLen);
    ctx.lineTo(bracketInset, bracketInset);
    ctx.lineTo(bracketInset + bracketLen, bracketInset);
    ctx.stroke();
    // Top-right
    ctx.beginPath();
    ctx.moveTo(w - bracketInset - bracketLen, bracketInset);
    ctx.lineTo(w - bracketInset, bracketInset);
    ctx.lineTo(w - bracketInset, bracketInset + bracketLen);
    ctx.stroke();
    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(bracketInset, h - bracketInset - bracketLen);
    ctx.lineTo(bracketInset, h - bracketInset);
    ctx.lineTo(bracketInset + bracketLen, h - bracketInset);
    ctx.stroke();
    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(w - bracketInset - bracketLen, h - bracketInset);
    ctx.lineTo(w - bracketInset, h - bracketInset);
    ctx.lineTo(w - bracketInset, h - bracketInset - bracketLen);
    ctx.stroke();
    ctx.restore();

    // ── Empty state hint (only when no organs placed) ──
    if (organs.length === 0) {
      const hintAlpha = 0.3 + Math.sin(t * 1.2) * 0.1;
      ctx.save();
      ctx.font = '14px "Orbitron", monospace';
      ctx.fillStyle = `rgba(6, 182, 212, ${hintAlpha})`;
      ctx.textAlign = 'center';
      ctx.fillText('ENGINEERING CANVAS', cx, cy - 20);
      ctx.font = '10px "Rajdhani", monospace';
      ctx.fillStyle = `rgba(6, 182, 212, ${hintAlpha * 0.6})`;
      ctx.fillText('Top-down dorsal view — nose up, tail down', cx, cy + 4);
      ctx.restore();
    }

    // ── Draw connections (conduits between organs) ──
    for (const conn of connections) {
      const from = organs.find((o) => o.id === conn.fromId);
      const to = organs.find((o) => o.id === conn.toId);
      if (!from || !to) continue;

      // Use port positions if available, otherwise fall back to organ centers
      let p1 = worldToScreen(from.wx, from.wz);
      let p2 = worldToScreen(to.wx, to.wz);
      if (conn.fromPort) {
        const portPos = getPortScreenPos(from, conn.fromPort);
        if (portPos) p1 = portPos;
      }
      if (conn.toPort) {
        const portPos = getPortScreenPos(to, conn.toPort);
        if (portPos) p2 = portPos;
      }

      // Conduit color based on source pipeline
      const conduitColor = `#${PIPELINE_COLORS[from.pipeline].toString(16).padStart(6, '0')}`;

      // Direction vector from source→target (output→input)
      const dx = p2.sx - p1.sx;
      const dy = p2.sy - p1.sy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue; // skip zero-length conduits

      // Pulsing glow — breathes with the ship's biology
      const pulsePhase = t * 1.5 + (from.wx + from.wz) * 0.3;
      const glowPulse = 0.5 + Math.sin(pulsePhase) * 0.25;

      ctx.save();
      ctx.lineCap = 'round';

      // Outer glow (wide, low alpha, pulsing)
      ctx.strokeStyle = `${conduitColor}${Math.round(glowPulse * 40).toString(16).padStart(2, '0')}`;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();

      // Inner glow (narrower, brighter)
      ctx.strokeStyle = `${conduitColor}${Math.round(glowPulse * 60).toString(16).padStart(2, '0')}`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();

      // Base conduit line (solid, dim)
      ctx.strokeStyle = `${conduitColor}55`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();

      // Flow layer 1 — fast dashes (direction: source→target)
      ctx.strokeStyle = `${conduitColor}cc`;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.lineDashOffset = -t * 30;
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();

      // Flow layer 2 — slower, offset dashes for depth
      ctx.strokeStyle = `${conduitColor}66`;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 12]);
      ctx.lineDashOffset = -t * 18;
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.restore();

      // Traveling particles — small bright dots flowing source→target
      const particleCount = Math.max(2, Math.min(5, Math.floor(dist / 60)));
      const flowSpeed = 0.35; // cycles per second
      for (let i = 0; i < particleCount; i++) {
        const phase = ((t * flowSpeed + i / particleCount) % 1);
        const px = p1.sx + dx * phase;
        const py = p1.sy + dy * phase;
        // Fade in at start, fade out at end
        const fadeAlpha = Math.sin(phase * Math.PI);
        const pr = 2 + Math.sin(pulsePhase + i) * 0.5;

        ctx.save();
        // Particle glow
        const pGrad = ctx.createRadialGradient(px, py, 0, px, py, pr * 3);
        pGrad.addColorStop(0, `${conduitColor}ff`);
        pGrad.addColorStop(0.4, `${conduitColor}${Math.round(fadeAlpha * 180).toString(16).padStart(2, '0')}`);
        pGrad.addColorStop(1, `${conduitColor}00`);
        ctx.fillStyle = pGrad;
        ctx.beginPath();
        ctx.arc(px, py, pr * 3, 0, Math.PI * 2);
        ctx.fill();

        // Particle core
        ctx.fillStyle = `rgba(255, 255, 255, ${fadeAlpha * 0.8})`;
        ctx.beginPath();
        ctx.arc(px, py, pr * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Arrowhead at target end — shows flow direction
      const arrowAngle = Math.atan2(dy, dx);
      const arrowSize = 6;
      const ax = p2.sx - Math.cos(arrowAngle) * (arrowSize + 2);
      const ay = p2.sy - Math.sin(arrowAngle) * (arrowSize + 2);
      ctx.save();
      ctx.fillStyle = `${conduitColor}cc`;
      ctx.beginPath();
      ctx.moveTo(p2.sx, p2.sy);
      ctx.lineTo(ax - Math.cos(arrowAngle - 0.5) * arrowSize, ay - Math.sin(arrowAngle - 0.5) * arrowSize);
      ctx.lineTo(ax - Math.cos(arrowAngle + 0.5) * arrowSize, ay - Math.sin(arrowAngle + 0.5) * arrowSize);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // ── Draw connect-mode preview line ──
    if (activeTool === 'connect' && connectFromId) {
      const from = organs.find((o) => o.id === connectFromId);
      if (from) {
        // Start from the selected port if available, otherwise from organ center
        let p1 = worldToScreen(from.wx, from.wz);
        if (connectFromPort) {
          const portPos = getPortScreenPos(from, connectFromPort.label);
          if (portPos) p1 = portPos;
        }
        const previewColor = connectFromPort
          ? `#${nodePipelineColor(connectFromPort.nodeId).toString(16).padStart(6, '0')}`
          : '#a855f7';
        ctx.save();
        // Glow
        ctx.strokeStyle = `${previewColor}33`;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p1.sx, p1.sy);
        ctx.lineTo(mouseRef.current.lastX, mouseRef.current.lastY);
        ctx.stroke();
        // Animated dash flow toward cursor
        ctx.strokeStyle = `${previewColor}aa`;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.lineDashOffset = -t * 25;
        ctx.beginPath();
        ctx.moveTo(p1.sx, p1.sy);
        ctx.lineTo(mouseRef.current.lastX, mouseRef.current.lastY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // ── Draw organs ──
    for (const organ of organs) {
      const { sx: osx, sy: osy } = worldToScreen(organ.wx, organ.wz);
      const screenR = organ.radius * scale * zoom;
      const colorHex = `#${PIPELINE_COLORS[organ.pipeline].toString(16).padStart(6, '0')}`;
      const isSelected = selectedId === organ.id;
      const isConnectFrom = connectFromId === organ.id;
      const isMirror = organ.isMirror;
      const pulse = 0.7 + Math.sin(t * 2 + organ.wx) * 0.15;

      // Outer glow
      ctx.save();
      const glowGrad = ctx.createRadialGradient(osx, osy, screenR * 0.5, osx, osy, screenR * 2);
      glowGrad.addColorStop(0, `${colorHex}40`);
      glowGrad.addColorStop(1, `${colorHex}00`);
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(osx, osy, screenR * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Organ body
      ctx.save();
      const bodyGrad = ctx.createRadialGradient(osx - screenR * 0.3, osy - screenR * 0.3, 0, osx, osy, screenR);
      bodyGrad.addColorStop(0, `${colorHex}cc`);
      bodyGrad.addColorStop(0.7, `${colorHex}66`);
      bodyGrad.addColorStop(1, `${colorHex}22`);
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.arc(osx, osy, screenR, 0, Math.PI * 2);
      ctx.fill();

      // Border
      ctx.strokeStyle = isSelected ? '#22d3ee' : isConnectFrom ? '#a855f7' : `${colorHex}aa`;
      ctx.lineWidth = isSelected || isConnectFrom ? 2.5 : 1.5;
      if (organ.isAutoConduit) ctx.setLineDash([3, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Inner requirement nodes — small balls inside the organ representing
      // input/output ports (upstream requirements and downstream consumers)
      const ports = ORGAN_NODES[organ.nodeId];
      if (ports && ports.length > 0 && screenR > 8) {
        const nodeR = Math.max(2, screenR * 0.18);
        const ringR = screenR * 0.55;
        // Split ports into inputs (left semicircle) and outputs (right semicircle)
        const inputs = ports.filter((p) => p.direction === 'in');
        const outputs = ports.filter((p) => p.direction === 'out');

        ctx.save();
        for (let i = 0; i < ports.length; i++) {
          const port = ports[i];
          // Position: inputs on left semicircle, outputs on right semicircle
          const isInput = port.direction === 'in';
          const groupPorts = isInput ? inputs : outputs;
          const idx = groupPorts.indexOf(port);
          const groupSize = groupPorts.length;
          // Spread across the semicircle: inputs from π/2 to 3π/2 (left), outputs from -π/2 to π/2 (right)
          const angle = isInput
            ? Math.PI / 2 + (idx + 1) * (Math.PI / (groupSize + 1))
            : -Math.PI / 2 + (idx + 1) * (Math.PI / (groupSize + 1));
          const nx = osx + Math.cos(angle) * ringR;
          const ny = osy + Math.sin(angle) * ringR;
          const portColor = `#${nodePipelineColor(port.nodeId).toString(16).padStart(6, '0')}`;

          // Highlight if this is the active connect-from port
          const isActivePort = isConnectFrom && connectFromPort?.label === port.label;

          // Node ball with gradient
          ctx.save();
          const nodeRActive = isActivePort ? nodeR * 1.4 : nodeR;
          const nodeGrad = ctx.createRadialGradient(nx - nodeRActive * 0.3, ny - nodeRActive * 0.3, 0, nx, ny, nodeRActive);
          nodeGrad.addColorStop(0, `${portColor}ff`);
          nodeGrad.addColorStop(0.7, `${portColor}99`);
          nodeGrad.addColorStop(1, `${portColor}44`);
          ctx.fillStyle = nodeGrad;
          ctx.beginPath();
          ctx.arc(nx, ny, nodeRActive, 0, Math.PI * 2);
          ctx.fill();

          // Node border
          ctx.strokeStyle = isActivePort ? '#22d3ee' : `${portColor}cc`;
          ctx.lineWidth = isActivePort ? 1.5 : 0.8;
          ctx.stroke();

          // Pulsing ring on active port
          if (isActivePort) {
            ctx.strokeStyle = `rgba(34, 211, 238, ${pulse})`;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.lineDashOffset = -t * 12;
            ctx.beginPath();
            ctx.arc(nx, ny, nodeRActive + 4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          ctx.restore();

          // Port label (only when zoomed in enough)
          if (screenR > 20) {
            ctx.save();
            ctx.font = `${Math.max(5, Math.floor(screenR * 0.15))}px "Rajdhani", monospace`;
            ctx.fillStyle = isActivePort ? '#22d3ee' : `${portColor}dd`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // Label positioned just outside the node ball
          const labelDist = ringR + nodeRActive + 6;
          const lx = osx + Math.cos(angle) * labelDist;
          const ly = osy + Math.sin(angle) * labelDist;
          ctx.fillText(port.label, lx, ly);
          ctx.restore();
          }
        }
        ctx.restore();
      }

      // Health ring (if damaged)
      if (organ.health < 1) {
        ctx.save();
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(osx, osy, screenR + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * organ.health);
        ctx.stroke();
        ctx.restore();
      }

      // Label
      ctx.save();
      ctx.font = '9px "Rajdhani", monospace';
      ctx.fillStyle = isSelected ? '#22d3ee' : isMirror ? `${colorHex}88` : `${colorHex}cc`;
      ctx.textAlign = 'center';
      ctx.fillText(organ.name, osx, osy + screenR + 12);
      ctx.restore();

      // Mirror badge — small "M" indicator on mirrored organs
      if (isMirror) {
        ctx.save();
        ctx.fillStyle = 'rgba(34, 211, 238, 0.6)';
        ctx.font = 'bold 7px "Orbitron", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('M', osx + screenR - 4, osy - screenR + 6);
        ctx.restore();
      }

      // Selection ring (animated)
      if (isSelected) {
        ctx.save();
        ctx.strokeStyle = `rgba(34, 211, 238, ${pulse})`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -t * 15;
        ctx.beginPath();
        ctx.arc(osx, osy, screenR + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Connect-from indicator
      if (isConnectFrom) {
        ctx.save();
        ctx.strokeStyle = `rgba(168, 85, 247, ${pulse})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.lineDashOffset = -t * 12;
        ctx.beginPath();
        ctx.arc(osx, osy, screenR + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // ── Draw measure overlay ──
    if (measure.startWX !== null && measure.startWZ !== null && measure.endWX !== null && measure.endWZ !== null) {
      const p1 = worldToScreen(measure.startWX, measure.startWZ);
      const p2 = worldToScreen(measure.endWX, measure.endWZ);
      const distW = Math.sqrt(
        (measure.endWX - measure.startWX) ** 2 + (measure.endWZ - measure.startWZ) ** 2,
      );

      ctx.save();
      // Measure line
      ctx.strokeStyle = 'rgba(255, 179, 71, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();

      // Endpoints
      ctx.fillStyle = '#FFB347';
      ctx.beginPath();
      ctx.arc(p1.sx, p1.sy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p2.sx, p2.sy, 4, 0, Math.PI * 2);
      ctx.fill();

      // Distance label
      const midX = (p1.sx + p2.sx) / 2;
      const midY = (p1.sy + p2.sy) / 2;
      ctx.font = 'bold 11px "Rajdhani", monospace';
      ctx.fillStyle = 'rgba(255, 179, 71, 0.95)';
      ctx.textAlign = 'center';
      ctx.fillText(`${distW.toFixed(2)}m`, midX, midY - 8);
      ctx.restore();
    }

    // ── Draw section edit handles (when section tool active) ──
    if (activeTool === 'section') {
      for (let i = 1; i < sectionBounds.length; i++) {
        const boundY = effShipTop + sectionBounds[i] * effShipH;
        ctx.save();
        ctx.fillStyle = 'rgba(56, 189, 248, 0.8)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(effShipLeft - 8, boundY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(effShipRight + 8, boundY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // ── Active tool indicator (bottom-left of canvas area) ──
    const toolLabels: Record<ToolId, string> = {
      'select': 'SELECT', 'pan': 'PAN', 'measure': 'MEASURE',
      'place-organ': 'PLACE', 'connect': 'CONNECT', 'hull-edit': 'HULL',
      'erase': 'ERASE', 'section': 'SECTION', 'repair': 'REPAIR',
    };
    const toolColors: Record<ToolId, string> = {
      'select': 'rgba(6, 182, 212, 0.8)',
      'pan': 'rgba(6, 182, 212, 0.6)',
      'measure': 'rgba(255, 179, 71, 0.7)',
      'place-organ': 'rgba(255, 107, 53, 0.7)',
      'connect': 'rgba(168, 85, 247, 0.7)',
      'erase': 'rgba(244, 63, 94, 0.7)',
      'section': 'rgba(56, 189, 248, 0.7)',
      'repair': 'rgba(16, 185, 129, 0.7)',
      'hull-edit': 'rgba(34, 211, 238, 0.7)',
    };
    ctx.save();
    ctx.font = '10px "Orbitron", monospace';
    ctx.fillStyle = toolColors[activeTool];
    ctx.textAlign = 'left';
    ctx.fillText(`◆ ${toolLabels[activeTool]}`, padding / 2, h - padding / 2 + 4);
    if (activeTool === 'place-organ') {
      const pipeColor = `#${PIPELINE_COLORS[activePipeline].toString(16).padStart(6, '0')}`;
      ctx.font = '9px "Rajdhani", monospace';
      ctx.fillStyle = pipeColor;
      ctx.fillText(`  ${PIPELINE_NAMES[activePipeline]}`, padding / 2 + 60, h - padding / 2 + 4);
    }
    ctx.restore();

    animFrameRef.current = requestAnimationFrame(draw);
  }, [state.length, state.thoraxWidth, activeTool, activePipeline, gridMode, viewOrientation, viewLayer,
    organs, connections, selectedId, connectFromId, connectFromPort, measure, panX, panY, zoom, sectionBounds,
    mirrorX, mirrorZ, hullOutline, worldToScreen, placedParts, selectedPartId, getPartWorldAnchors, getPortScreenPos]);

  useEffect(() => {
    draw();
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [draw]);

  // ── Resize observer ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      // draw is called by the animation loop; just trigger a re-render
      // by updating the canvas size on next frame
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // ── Keyboard shortcuts for tool switching + undo/redo ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept if typing in an input/select/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      // Undo: Ctrl+Z (not Shift)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      // Redo: Ctrl+Shift+Z or Ctrl+Y
      if (((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) || ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
        e.preventDefault();
        redo();
        return;
      }

      // Escape cancels current action
      if (e.key === 'Escape') {
        setConnectFromId(null);
        setMeasure({ startWX: null, startWZ: null, endWX: null, endWZ: null });
        setSelectedId(null);
        return;
      }

      // Delete key removes selected organ
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        pushHistory();
        setOrgans((prev) => prev.filter((o) => o.id !== selectedId));
        setConnections((prev) => prev.filter((c) => c.fromId !== selectedId && c.toId !== selectedId));
        setSelectedId(null);
        return;
      }

      // Delete key removes selected placed part
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPartId) {
        e.preventDefault();
        pushHistory();
        setPlacedParts((prev) => prev.filter((p) => p.id !== selectedPartId));
        setSelectedPartId(null);
        return;
      }

      const map: Record<string, ToolId> = {
        v: 'select', h: 'pan', m: 'measure',
        c: 'connect', b: 'hull-edit',
        e: 'erase', s: 'section', r: 'repair',
      };
      const tool = map[e.key.toLowerCase()];
      if (tool) {
        e.preventDefault();
        handleSelectTool(tool);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, selectedId]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-10 overflow-hidden"
      style={{ touchAction: 'none' }}
    >
      {/* The 2D canvas — full viewport, behind UI panels */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{
          cursor: activeTool === 'pan' ? (mouseRef.current.panning ? 'grabbing' : 'grab')
            : activeTool === 'select' ? 'default'
            : activeTool === 'place-organ' ? 'crosshair'
            : activeTool === 'connect' ? 'pointer'
            : activeTool === 'erase' ? 'not-allowed'
            : activeTool === 'measure' ? 'crosshair'
            : activeTool === 'section' ? 'row-resize'
            : activeTool === 'repair' ? 'cell'
            : activeTool === 'hull-edit' ? 'crosshair'
            : 'default',
        }}
      />

      {/* ── SVG Hull Outline Overlay ── */}
      {/* The editable vector outline of the ship hull. Rendered as SVG so
          control points, handles, and edge points can be individually
          styled and dragged. Sits above the canvas fill, below UI panels. */}
      <svg
        className="absolute inset-0 pointer-events-none"
        style={{ width: '100%', height: '100%', zIndex: 5 }}
      >
        {/* Hull glow underlay (drawn first, below edit controls) */}
        {activeTool === 'hull-edit' && (() => {
          const path = hullToSvgPath(hullOutline, (wx, wz) => {
            const { sx, sy } = worldToScreen(wx, wz);
            return { x: sx, y: sy };
          });
          return (
            <path
              d={path}
              fill="none"
              stroke="rgba(6, 182, 212, 0.15)"
              strokeWidth={6}
            />
          );
        })()}

        {/* Invisible thick path for double-click to add anchor point on a segment */}
        {activeTool === 'hull-edit' && hullEditMode === 'control-points' && (() => {
          const path = hullToSvgPath(hullOutline, (wx, wz) => {
            const { sx, sy } = worldToScreen(wx, wz);
            return { x: sx, y: sy };
          });
          return (
            <path
              d={path}
              fill="none"
              stroke="transparent"
              strokeWidth={16}
              style={{ pointerEvents: 'stroke', cursor: 'crosshair' }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                const svg = e.currentTarget.ownerSVGElement;
                if (!svg) return;
                const pt = svg.createSVGPoint();
                pt.x = e.clientX;
                pt.y = e.clientY;
                const ctm = svg.getScreenCTM();
                if (!ctm) return;
                const local = pt.matrixTransform(ctm.inverse());
                const { wx, wz } = screenToWorld(local.x, local.y);
                pushHistory();
                setHullOutline((prev) => {
                  const next = { ...prev, anchors: [...prev.anchors], handles: [...prev.handles], segments: [...prev.segments] };
                  // Find nearest segment by sampling
                  let bestSegIdx = -1;
                  let bestDist = Infinity;
                  for (let i = 0; i < next.segments.length; i++) {
                    const seg = next.segments[i];
                    const sA = next.anchors.find((a) => a.id === seg.startAnchorId)!;
                    const eA = next.anchors.find((a) => a.id === seg.endAnchorId)!;
                    const sH = next.handles.find((h) => h.id === seg.startHandleId)!;
                    const eH = next.handles.find((h) => h.id === seg.endHandleId)!;
                    for (let t = 0; t <= 1; t += 0.05) {
                      const mt = 1 - t;
                      const bx = mt*mt*mt*sA.wx + 3*mt*mt*t*sH.wx + 3*mt*t*t*eH.wx + t*t*t*eA.wx;
                      const bz = mt*mt*mt*sA.wz + 3*mt*mt*t*sH.wz + 3*mt*t*t*eH.wz + t*t*t*eA.wz;
                      const d = Math.hypot(bx - wx, bz - wz);
                      if (d < bestDist) { bestDist = d; bestSegIdx = i; }
                    }
                  }
                  if (bestSegIdx < 0 || bestDist > 2) return prev;
                  const seg = next.segments[bestSegIdx];
                  const sA = next.anchors.find((a) => a.id === seg.startAnchorId)!;
                  const eA = next.anchors.find((a) => a.id === seg.endAnchorId)!;
                  const sH = next.handles.find((h) => h.id === seg.startHandleId)!;
                  const eH = next.handles.find((h) => h.id === seg.endHandleId)!;
                  // Find best t along the segment
                  let bestT = 0.5;
                  let bestTDist = Infinity;
                  for (let t = 0; t <= 1; t += 0.02) {
                    const mt = 1 - t;
                    const bx = mt*mt*mt*sA.wx + 3*mt*mt*t*sH.wx + 3*mt*t*t*eH.wx + t*t*t*eA.wx;
                    const bz = mt*mt*mt*sA.wz + 3*mt*mt*t*sH.wz + 3*mt*t*t*eH.wz + t*t*t*eA.wz;
                    const d = Math.hypot(bx - wx, bz - wz);
                    if (d < bestTDist) { bestTDist = d; bestT = t; }
                  }
                  // De Casteljau subdivision at bestT
                  const t = bestT; const mt = 1 - t;
                  const q0 = { wx: mt*sA.wx + t*sH.wx, wz: mt*sA.wz + t*sH.wz };
                  const q1 = { wx: mt*sH.wx + t*eH.wx, wz: mt*sH.wz + t*eH.wz };
                  const q2 = { wx: mt*eH.wx + t*eA.wx, wz: mt*eH.wz + t*eA.wz };
                  const r0 = { wx: mt*q0.wx + t*q1.wx, wz: mt*q0.wz + t*q1.wz };
                  const r1 = { wx: mt*q1.wx + t*q2.wx, wz: mt*q1.wz + t*q2.wz };
                  const s = { wx: mt*r0.wx + t*r1.wx, wz: mt*r0.wz + t*r1.wz };
                  const newAnchorId = `a-ins-${Date.now()}`;
                  const newAnchor: HullAnchor = { id: newAnchorId, wx: s.wx, wz: s.wz };
                  const newH1EId = `h-ins-${Date.now()}-1e`;
                  const newH2SId = `h-ins-${Date.now()}-2s`;
                  // First sub-segment end handle = r0
                  next.handles.push({ id: newH1EId, wx: r0.wx, wz: r0.wz });
                  // Second sub-segment start handle = r1
                  next.handles.push({ id: newH2SId, wx: r1.wx, wz: r1.wz });
                  // Update original segment to be first sub-segment
                  next.segments[bestSegIdx] = { ...seg, endAnchorId: newAnchorId, endHandleId: newH1EId };
                  // Update original start handle to q0
                  const sHIdx = next.handles.findIndex((h) => h.id === seg.startHandleId);
                  if (sHIdx >= 0) next.handles[sHIdx] = { ...next.handles[sHIdx], wx: q0.wx, wz: q0.wz };
                  // Update original end handle to q2
                  const eHIdx = next.handles.findIndex((h) => h.id === seg.endHandleId);
                  if (eHIdx >= 0) next.handles[eHIdx] = { ...next.handles[eHIdx], wx: q2.wx, wz: q2.wz };
                  // Insert second sub-segment
                  next.segments.splice(bestSegIdx + 1, 0, {
                    id: `s-ins-${Date.now()}`,
                    startAnchorId: newAnchorId,
                    endAnchorId: seg.endAnchorId,
                    startHandleId: newH2SId,
                    endHandleId: seg.endHandleId,
                  });
                  next.anchors.push(newAnchor);
                  return next;
                });
                setHullCustomized(true);
              }}
            />
          );
        })()}

        {/* Control points and handles (only visible in hull-edit mode) */}
        {activeTool === 'hull-edit' && hullEditMode === 'control-points' && (() => {
          const toScreen = (wx: number, wz: number) => {
            const { sx, sy } = worldToScreen(wx, wz);
            return { x: sx, y: sy };
          };
          return (
            <g>
              {/* Handle lines (connecting anchors to their control handles) */}
              {hullOutline.segments.map((seg) => {
                const anchor = hullOutline.anchors.find((a) => a.id === seg.startAnchorId)!;
                const handle = hullOutline.handles.find((h) => h.id === seg.startHandleId)!;
                const a = toScreen(anchor.wx, anchor.wz);
                const h = toScreen(handle.wx, handle.wz);
                return <line key={`hl-${seg.id}-s`} x1={a.x} y1={a.y} x2={h.x} y2={h.y} stroke="rgba(6, 182, 212, 0.3)" strokeWidth={0.8} strokeDasharray="2 2" />;
              })}
              {hullOutline.segments.map((seg) => {
                const anchor = hullOutline.anchors.find((a) => a.id === seg.endAnchorId)!;
                const handle = hullOutline.handles.find((h) => h.id === seg.endHandleId)!;
                const a = toScreen(anchor.wx, anchor.wz);
                const h = toScreen(handle.wx, handle.wz);
                return <line key={`hl-${seg.id}-e`} x1={a.x} y1={a.y} x2={h.x} y2={h.y} stroke="rgba(6, 182, 212, 0.3)" strokeWidth={0.8} strokeDasharray="2 2" />;
              })}
              {/* Handle circles */}
              {hullOutline.handles.map((h) => {
                const p = toScreen(h.wx, h.wz);
                return (
                  <circle
                    key={h.id}
                    cx={p.x}
                    cy={p.y}
                    r={4}
                    fill="rgba(6, 182, 212, 0.4)"
                    stroke="rgba(6, 182, 212, 0.8)"
                    strokeWidth={1}
                    className="cursor-grab"
                    style={{ pointerEvents: 'all' }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      pushHistory();
                      setHullDragId(h.id);
                      setHullDragType('handle');
                      setHullCustomized(true);
                    }}
                  />
                );
              })}
              {/* Anchor squares — locked anchors (A, W1, W2, B) are highlighted */}
              {hullOutline.anchors.map((a) => {
                const p = toScreen(a.wx, a.wz);
                const isWindow = a.role === 'window';
                const isWallFwd = a.role === 'wall-fwd';
                const isWallAft = a.role === 'wall-aft';
                const isLocked = a.locked;
                // Labeled anchors: locked (A, W1, W2, B) + editable-but-labeled (C, D)
                if ((isLocked && (isWindow || isWallFwd)) || isWallAft) {
                  const color = isWallFwd || isWallAft ? 'rgba(255, 107, 53' : 'rgba(255, 179, 71';
                  const label = isWallFwd
                    ? (a.wx < 0 ? 'A' : 'B')
                    : isWallAft
                      ? (a.wx < 0 ? 'C' : 'D')
                      : (a.wx < 0 ? 'W1' : 'W2');
                  return (
                    <g key={a.id}>
                      <rect
                        x={p.x - 6}
                        y={p.y - 6}
                        width={12}
                        height={12}
                        rx={1}
                        fill={`${color}, 0.5)`}
                        stroke={`${color}, 1)`}
                        strokeWidth={2}
                        className={isLocked ? 'cursor-not-allowed' : 'cursor-move'}
                        style={{ pointerEvents: 'all' }}
                        onMouseEnter={() => setHoveredAnchorId(a.id)}
                        onMouseLeave={() => setHoveredAnchorId(null)}
                        onClick={(e) => { e.stopPropagation(); setSelectedAnchorId(a.id); }}
                        onMouseDown={(e) => {
                          if (isLocked) { e.stopPropagation(); setSelectedAnchorId(a.id); return; }
                          e.stopPropagation();
                          setSelectedAnchorId(a.id);
                          pushHistory();
                          setHullDragId(a.id);
                          setHullDragType('anchor');
                          setHullCustomized(true);
                        }}
                      />
                      {/* Lock indicator (small circle in corner) */}
                      {isLocked && (
                        <circle
                          cx={p.x + 7}
                          cy={p.y - 7}
                          r={3}
                          fill="rgba(255, 107, 53, 0.9)"
                          stroke="rgba(255, 255, 255, 0.6)"
                          strokeWidth={0.5}
                          style={{ pointerEvents: 'none' }}
                        />
                      )}
                      {/* Label */}
                      <text
                        x={p.x}
                        y={p.y - 10}
                        textAnchor="middle"
                        fill={`${color}, 0.8)`}
                        fontSize={7}
                        fontFamily="monospace"
                        style={{ pointerEvents: 'none' }}
                      >
                        {label}
                      </text>
                    </g>
                  );
                }
                return (
                  <rect
                    key={a.id}
                    x={p.x - 5}
                    y={p.y - 5}
                    width={10}
                    height={10}
                    rx={2}
                    fill="rgba(34, 211, 238, 0.6)"
                    stroke="rgba(34, 211, 238, 1)"
                    strokeWidth={1.5}
                    className="cursor-move"
                    style={{ pointerEvents: 'all' }}
                    onMouseEnter={() => setHoveredAnchorId(a.id)}
                    onMouseLeave={() => setHoveredAnchorId(null)}
                    onClick={(e) => { e.stopPropagation(); setSelectedAnchorId(a.id); }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setSelectedAnchorId(a.id);
                      pushHistory();
                      setHullDragId(a.id);
                      setHullDragType('anchor');
                      setHullCustomized(true);
                    }}
                  />
                );
              })}
            </g>
          );
        })()}

        {/* Edge points mode — sampled points along the hull edge */}
        {activeTool === 'hull-edit' && hullEditMode === 'edge-points' && (() => {
          const toScreen = (wx: number, wz: number) => {
            const { sx, sy } = worldToScreen(wx, wz);
            return { x: sx, y: sy };
          };
          const edgePoints = sampleHullOutline(hullOutline, 8);
          return (
            <g>
              {edgePoints.map((p, i) => {
                const sp = toScreen(p.wx, p.wz);
                return (
                  <circle
                    key={`ep-${i}`}
                    cx={sp.x}
                    cy={sp.y}
                    r={4}
                    fill="rgba(34, 211, 238, 0.3)"
                    stroke="rgba(34, 211, 238, 0.7)"
                    strokeWidth={1}
                    className="cursor-grab"
                    style={{ pointerEvents: 'all' }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      pushHistory();
                      setHullDragId(`ep-${i}`);
                      setHullDragType('edge');
                      setHullCustomized(true);
                    }}
                  />
                );
              })}
            </g>
          );
        })()}

        {/* Live Corners widgets — available in ALL hull-edit modes.
            Only shown for the hovered or selected anchor (Adobe behavior).
            Widget positioned along the corner bisector (not toward ship center).
            Supports 4 corner types: round, smooth (squircle), inverted, chamfer.
            Alt+click cycles types. Double-click opens numeric input. */}
        {activeTool === 'hull-edit' && (() => {
          const toScreen = (wx: number, wz: number) => {
            const { sx, sy } = worldToScreen(wx, wz);
            return { x: sx, y: sy };
          };
          const activeAnchorId = hoveredAnchorId || selectedAnchorId;
          const cornerMirrorMap: Record<string, string> = {
            'a-port-peak': 'a-stbd-peak', 'a-stbd-peak': 'a-port-peak',
            'a-win-port': 'a-win-stbd', 'a-win-stbd': 'a-win-port',
            'a-port-wall-fwd': 'a-stbd-wall-fwd', 'a-stbd-wall-fwd': 'a-port-wall-fwd',
            'a-port-wall-aft': 'a-stbd-wall-aft', 'a-stbd-wall-aft': 'a-port-wall-aft',
          };
          const cycleCornerType = (current: string): 'round' | 'smooth' | 'inverted' | 'chamfer' => {
            const order: ('round' | 'smooth' | 'inverted' | 'chamfer')[] = ['round', 'smooth', 'inverted', 'chamfer'];
            const idx = order.indexOf(current as 'round' | 'smooth' | 'inverted' | 'chamfer');
            return order[(idx + 1) % order.length];
          };
          return (
            <g>
              {hullOutline.anchors.map((a) => {
                if (a.id !== activeAnchorId) return null;
                const p = toScreen(a.wx, a.wz);
                const r = a.cornerRadius || 0;
                const hasRadius = r > 0;
                const type = a.cornerType || 'round';
                const maxR = maxCornerRadius(hullOutline, a.id);
                const atMax = r >= maxR - 0.01;
                const isRelative = a.cornerRelative || false;
                // Bisector-based widget positioning (Adobe parity)
                const bis = cornerBisector(hullOutline, a.id);
                // Widget sits along the bisector, offset inward from the corner
                const screenScale = viewMetricsRef.current.scale * zoom;
                const widgetOffset = 16 + r * screenScale * 0.4;
                // bisector dx/dz is in world space; convert to screen direction
                // screenX = cx + wx * scale, screenY = cy + wz * scale
                // so screen direction = (bis.dx * scale, bis.dz * scale)
                const bisScreenLen = Math.hypot(bis.dx, bis.dz) || 1;
                const wpx = p.x + (bis.dx / bisScreenLen) * widgetOffset;
                const wpy = p.y + (bis.dz / bisScreenLen) * widgetOffset;
                // Color by corner type: round=purple, smooth=pink, inverted=blue, chamfer=amber
                const typeColors: Record<string, string> = {
                  round: '168, 85, 247',
                  smooth: '236, 72, 153',
                  inverted: '59, 130, 246',
                  chamfer: '245, 158, 11',
                };
                const typeColor = typeColors[type] || typeColors.round;
                const typeLabel = type === 'smooth' ? 'Smooth' : type === 'inverted' ? 'Inverted' : type === 'chamfer' ? 'Chamfer' : 'Round';
                return (
                  <g key={`lc-${a.id}`}>
                    {/* Line from anchor to widget */}
                    {hasRadius && (
                      <line
                        x1={p.x}
                        y1={p.y}
                        x2={wpx}
                        y2={wpy}
                        stroke={`rgba(${typeColor}, 0.4)`}
                        strokeWidth={1}
                        strokeDasharray="2 2"
                        style={{ pointerEvents: 'none' }}
                      />
                    )}
                    {/* Corner radius arc preview */}
                    {hasRadius && (
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={r * screenScale}
                        fill="none"
                        stroke={atMax ? 'rgba(239, 68, 68, 0.6)' : `rgba(${typeColor}, 0.3)`}
                        strokeWidth={1}
                        style={{ pointerEvents: 'none' }}
                      />
                    )}
                    {/* Draggable radius widget */}
                    <circle
                      cx={wpx}
                      cy={wpy}
                      r={6}
                      fill={hasRadius ? `rgba(${typeColor}, 0.5)` : `rgba(${typeColor}, 0.2)`}
                      stroke={atMax ? 'rgba(239, 68, 68, 1)' : `rgba(${typeColor}, 0.9)`}
                      strokeWidth={1.5}
                      className="cursor-grab"
                      style={{ pointerEvents: 'all' }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        const input = window.prompt(
                          `Corner radius (m)\nType: ${typeLabel}${isRelative ? ' (relative)' : ''}\nMax: ${maxR.toFixed(2)}m`,
                          hasRadius ? r.toFixed(2) : '0',
                        );
                        if (input !== null) {
                          const val = Math.max(0, Math.min(maxR, parseFloat(input) || 0));
                          pushHistory();
                          setHullOutline((prev) => {
                            const next = { ...prev, anchors: prev.anchors.map((an) => ({ ...an })) };
                            const idx = next.anchors.findIndex((an) => an.id === a.id);
                            if (idx >= 0) next.anchors[idx] = { ...next.anchors[idx], cornerRadius: val };
                            // Mirror
                            if (mirrorX && a.wx !== 0) {
                              const mId = cornerMirrorMap[a.id];
                              if (mId) {
                                const mIdx = next.anchors.findIndex((an) => an.id === mId);
                                if (mIdx >= 0) {
                                  const maxRm = maxCornerRadius(prev, mId);
                                  next.anchors[mIdx] = { ...next.anchors[mIdx], cornerRadius: Math.min(val, maxRm) };
                                }
                              }
                            }
                            return next;
                          });
                          setHullCustomized(true);
                        }
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        // Alt+click cycles corner type
                        if (e.altKey) {
                          pushHistory();
                          setHullOutline((prev) => {
                            const next = { ...prev, anchors: prev.anchors.map((an) => ({ ...an })) };
                            const idx = next.anchors.findIndex((an) => an.id === a.id);
                            if (idx >= 0) {
                              const cur = next.anchors[idx].cornerType || 'round';
                              const nextType = cycleCornerType(cur);
                              next.anchors[idx] = { ...next.anchors[idx], cornerType: nextType };
                              // Mirror
                              if (mirrorX && a.wx !== 0) {
                                const mId = cornerMirrorMap[a.id];
                                if (mId) {
                                  const mIdx = next.anchors.findIndex((an) => an.id === mId);
                                  if (mIdx >= 0) next.anchors[mIdx] = { ...next.anchors[mIdx], cornerType: nextType };
                                }
                              }
                            }
                            return next;
                          });
                          setHullCustomized(true);
                          return;
                        }
                        // Shift+click toggles relative mode
                        if (e.shiftKey) {
                          e.preventDefault();
                          setHullOutline((prev) => {
                            const next = { ...prev, anchors: prev.anchors.map((an) => ({ ...an })) };
                            const idx = next.anchors.findIndex((an) => an.id === a.id);
                            if (idx >= 0) {
                              const curRel = next.anchors[idx].cornerRelative || false;
                              next.anchors[idx] = { ...next.anchors[idx], cornerRelative: !curRel };
                            }
                            return next;
                          });
                          return;
                        }
                        pushHistory();
                        setHullDragId(a.id);
                        setHullDragType('corner');
                        setHullCustomized(true);
                      }}
                    >
                      <title>{hasRadius
                        ? `${typeLabel}${isRelative ? ' (relative)' : ''}: ${r.toFixed(2)}m${atMax ? ' (MAX)' : ''}\nAlt+click: cycle type\nShift+click: toggle relative\nDouble-click: numeric input`
                        : 'Drag to round\nAlt+click: cycle type\nShift+click: toggle relative\nDouble-click: numeric input'}</title>
                    </circle>
                  </g>
                );
              })}
            </g>
          );
        })()}

        {/* Freehand drawing mode — show the path being drawn */}
        {activeTool === 'hull-edit' && hullEditMode === 'freehand' && freehandPoints.length > 1 && (() => {
          const toScreen = (wx: number, wz: number) => {
            const { sx, sy } = worldToScreen(wx, wz);
            return { x: sx, y: sy };
          };
          const d = freehandPoints.map((p, i) => {
            const sp = toScreen(p.wx, p.wz);
            return `${i === 0 ? 'M' : 'L'} ${sp.x.toFixed(2)} ${sp.y.toFixed(2)}`;
          }).join(' ');
          return (
            <path
              d={d}
              fill="none"
              stroke="rgba(34, 211, 238, 0.6)"
              strokeWidth={2}
              strokeDasharray="3 3"
            />
          );
        })()}

        {/* Hull outline path — drawn LAST so it's visible on top of anchors/handles.
            pointer-events:none so anchors still receive mouse events for dragging. */}
        {(() => {
          const path = hullToSvgPath(hullOutline, (wx, wz) => {
            const { sx, sy } = worldToScreen(wx, wz);
            return { x: sx, y: sy };
          });
          return (
            <path
              d={path}
              fill="none"
              stroke="rgba(6, 182, 212, 0.5)"
              strokeWidth={1.5}
              strokeDasharray={activeTool === 'hull-edit' ? 'none' : '4 6'}
              style={{ pointerEvents: 'none' }}
            />
          );
        })()}

        {/* ── Placed part selection bounding box + transform handles ── */}
        {selectedPartId && (() => {
          const part = placedParts.find((p) => p.id === selectedPartId);
          if (!part) return null;
          const bounds = getPartBounds(part);
          const { sx: x0, sy: y0 } = worldToScreen(bounds.minX, bounds.minZ);
          const { sx: x1, sy: y1 } = worldToScreen(bounds.maxX, bounds.maxZ);
          const { sx: cx, sy: cy } = worldToScreen(bounds.cx, bounds.cz);
          const w = x1 - x0;
          const h = y1 - y0;
          // Rotate handle position: above the top edge
          const rotOffset = h * 0.2;
          const { sx: rx, sy: ry } = worldToScreen(bounds.cx, bounds.minZ - (bounds.maxZ - bounds.minZ) * 0.2);
          const handleR = 5;
          const handles = [
            { sx: x0, sy: y0, mode: 'resize-nw', cursor: 'nwse-resize' },
            { sx: x1, sy: y0, mode: 'resize-ne', cursor: 'nesw-resize' },
            { sx: x0, sy: y1, mode: 'resize-sw', cursor: 'nesw-resize' },
            { sx: x1, sy: y1, mode: 'resize-se', cursor: 'nwse-resize' },
            { sx: cx, sy: y0, mode: 'resize-n', cursor: 'ns-resize' },
            { sx: cx, sy: y1, mode: 'resize-s', cursor: 'ns-resize' },
            { sx: x0, sy: cy, mode: 'resize-w', cursor: 'ew-resize' },
            { sx: x1, sy: cy, mode: 'resize-e', cursor: 'ew-resize' },
          ];
          return (
            <g style={{ pointerEvents: 'none' }}>
              {/* Bounding box rectangle */}
              <rect
                x={x0} y={y0} width={w} height={h}
                fill="none"
                stroke="rgba(52, 211, 153, 0.6)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              {/* Rotate handle connector line */}
              <line
                x1={cx} y1={y0} x2={rx} y2={ry}
                stroke="rgba(52, 211, 153, 0.5)"
                strokeWidth={1.5}
              />
              {/* Rotate handle (circle) */}
              <circle
                cx={rx} cy={ry} r={handleR + 2}
                fill="rgba(52, 211, 153, 0.9)"
                stroke="rgba(6, 78, 59, 0.9)"
                strokeWidth={1.5}
              />
              {/* Corner + edge resize handles (squares) */}
              {handles.map((h2) => (
                <rect
                  key={h2.mode}
                  x={h2.sx - handleR} y={h2.sy - handleR}
                  width={handleR * 2} height={handleR * 2}
                  fill="rgba(52, 211, 153, 0.9)"
                  stroke="rgba(6, 78, 59, 0.9)"
                  strokeWidth={1.5}
                  rx={2}
                />
              ))}
              {/* Part name label */}
              <text
                x={x0} y={y0 - 6}
                fill="rgba(52, 211, 153, 0.8)"
                fontSize={9}
                fontFamily="monospace"
              >
                {part.name}
              </text>
            </g>
          );
        })()}
      </svg>

      {/* ── Hull edit sub-mode selector (shown when hull-edit tool is active) ── */}
      <AnimatePresence>
        {activeTool === 'hull-edit' && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="absolute top-44 left-1/2 -translate-x-1/2 z-30 bio-panel rounded-xl px-3 py-2 flex items-center gap-2 pointer-events-auto"
          >
            <span className="text-[8px] font-mono text-cyan-400 uppercase tracking-wider mr-1">Hull</span>
            {HULL_EDIT_MODES.map((mode) => (
              <button
                key={mode.id}
                onClick={() => setHullEditMode(mode.id)}
                onMouseEnter={() => setHoveredTool(`hull-mode-${mode.id}`)}
                onMouseLeave={() => setHoveredTool(null)}
                className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                  hullEditMode === mode.id
                    ? 'bg-cyan-950/60 border border-cyan-400/40'
                    : 'hover:bg-cyan-950/30 border border-transparent'
                }`}
              >
                <span className={hullEditMode === mode.id ? 'text-cyan-300' : 'text-cyan-400/50'}>
                  {mode.icon}
                </span>
                <span className={`text-[9px] font-mono ${hullEditMode === mode.id ? 'text-cyan-300' : 'text-cyan-400/50'}`}>
                  {mode.label}
                </span>
                <AnimatePresence>
                  {hoveredTool === `hull-mode-${mode.id}` && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.9 }}
                      transition={{ type: 'spring', stiffness: 600, damping: 30 }}
                      className="absolute left-1/2 -translate-x-1/2 top-full mt-1 bio-panel rounded-lg px-2.5 py-1.5 whitespace-nowrap pointer-events-none z-30"
                    >
                      <div className="text-[10px] font-mono font-bold text-cyan-300">{mode.label}</div>
                      <div className="text-[8px] font-mono text-cyan-500/60 mt-0.5">
                        {mode.id === 'control-points' && 'Drag bezier anchors & handles'}
                        {mode.id === 'edge-points' && 'Drag points along the hull edge'}
                        {mode.id === 'freehand' && 'Draw a new outline freehand'}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Symmetry Options (top-left corner, Blender-style) ── */}
      {/* Mirror toggles that affect organ placement, movement, and deletion.
          When enabled, a pulsing axis line is drawn on the canvas.
          Just two icon buttons — glow when active, with styled hover tooltips. */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28, delay: 0.3 }}
        className="absolute top-20 left-4 lg:left-[380px] z-20 pointer-events-auto flex gap-1.5"
      >
        <div className="relative">
          <button
            onClick={() => setMirrorX((v) => !v)}
            onMouseEnter={() => setHoveredTool('mirror-x')}
            onMouseLeave={() => setHoveredTool(null)}
            className="flex items-center justify-center w-10 h-10 rounded-xl bio-panel transition-all cursor-pointer"
          >
            <FlipHorizontal
              className={`w-5 h-5 transition-all ${
                mirrorX
                  ? 'text-cyan-300 drop-shadow-[0_0_6px_rgba(34,211,238,0.8)]'
                  : 'text-cyan-400/30 hover:text-cyan-400/60'
              }`}
            />
          </button>
          <AnimatePresence>
            {hoveredTool === 'mirror-x' && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 600, damping: 30 }}
                className="absolute left-0 top-full mt-2 bio-panel rounded-lg px-2.5 py-1.5 whitespace-nowrap pointer-events-none z-30"
              >
                <div className="text-[11px] font-mono font-bold text-cyan-300">Mirror X</div>
                <div className="text-[8px] font-mono text-cyan-500/60 mt-0.5">Port / Starboard</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative">
          <button
            onClick={() => setMirrorZ((v) => !v)}
            onMouseEnter={() => setHoveredTool('mirror-z')}
            onMouseLeave={() => setHoveredTool(null)}
            className="flex items-center justify-center w-10 h-10 rounded-xl bio-panel transition-all cursor-pointer"
          >
            <FlipVertical
              className={`w-5 h-5 transition-all ${
                mirrorZ
                  ? 'text-cyan-300 drop-shadow-[0_0_6px_rgba(34,211,238,0.8)]'
                  : 'text-cyan-400/30 hover:text-cyan-400/60'
              }`}
            />
          </button>
          <AnimatePresence>
            {hoveredTool === 'mirror-z' && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 600, damping: 30 }}
                className="absolute left-0 top-full mt-2 bio-panel rounded-lg px-2.5 py-1.5 whitespace-nowrap pointer-events-none z-30"
              >
                <div className="text-[11px] font-mono font-bold text-cyan-300">Mirror Z</div>
                <div className="text-[8px] font-mono text-cyan-500/60 mt-0.5">Fore / Aft</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* ── Edit Tools (left side, vertical icon rail) ── */}
      {/* Layer 1: Frutiger Aero — glossy, skeuomorphic, rounded.
          Layer 3: Bioluminescent — pipeline-colored organ tools glow.
          Auto-collapse: after a moment of no hover, unselected tools fold into
          a "..." button. Hovering the rail expands all tools with a stagger
          animation — tools cascade in from top, like petals unfurling. */}
      <motion.div
        className="absolute top-1/2 -translate-y-1/2 left-4 lg:left-[380px] z-20 flex flex-col gap-1.5 pointer-events-auto"
        onMouseEnter={handleRailEnter}
        onMouseLeave={handleRailLeave}
        layout
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      >
        {/* Active tool is always visible — it's the anchor */}
        {(() => {
          const active = ALL_TOOLS.find((t) => t.id === activeTool) || ALL_TOOLS[0];
          return (
            <ToolButton
              key={`active-${active.id}`}
              toolId={active.id}
              activeTool={activeTool}
              hoveredTool={hoveredTool}
              setActiveTool={handleSelectTool}
              setHoveredTool={setHoveredTool}
              icon={active.icon}
              label={active.label}
              shortcut={active.shortcut}
            />
          );
        })()}

        {/* AnimatePresence handles enter/exit of the hidden tools + "..." button.
            Dividers are rendered as motion elements interleaved with tools
            (no React.Fragment wrappers — AnimatePresence needs direct motion children). */}
        <AnimatePresence initial={false} mode="popLayout">
          {railExpanded ? (
            /* ── Expanded: hidden tools + dividers cascade in ── */
            ALL_TOOLS
              .filter((t) => t.id !== activeTool)
              .flatMap((tool, idx, arr) => {
                const prevTool = arr[idx - 1];
                const showDivider = idx > 0 && prevTool && prevTool.group !== tool.group;
                const items: React.ReactNode[] = [];
                if (showDivider) {
                  items.push(
                    <motion.div
                      key={`divider-${tool.id}`}
                      className="h-px w-8 bg-cyan-500/20 my-0.5 mx-auto"
                      initial={{ scaleX: 0, opacity: 0 }}
                      animate={{ scaleX: 1, opacity: 1 }}
                      exit={{ scaleX: 0, opacity: 0 }}
                      transition={{ duration: 0.2, delay: idx * 0.03 }}
                    />,
                  );
                }
                items.push(
                  <motion.div
                    key={tool.id}
                    layout
                    initial={{ opacity: 0, x: -20, scale: 0.8 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -20, scale: 0.8 }}
                    transition={{
                      type: 'spring',
                      stiffness: 500,
                      damping: 28,
                      delay: idx * 0.04,
                    }}
                  >
                    <ToolButton
                      toolId={tool.id}
                      activeTool={activeTool}
                      hoveredTool={hoveredTool}
                      setActiveTool={handleSelectTool}
                      setHoveredTool={setHoveredTool}
                      icon={tool.icon}
                      label={tool.label}
                      shortcut={tool.shortcut}
                    />
                  </motion.div>,
                );
                return items;
              })
          ) : (
            /* ── Collapsed: "..." button fades/scales in ── */
            <motion.div
              key="more-btn"
              layout
              initial={{ opacity: 0, scale: 0.5, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5, y: -10 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              className="relative"
            >
              <button
                onMouseEnter={handleRailEnter}
                className="flex items-center justify-center w-10 h-10 rounded-xl bio-panel text-cyan-400/50 hover:text-cyan-300 border border-transparent hover:border-cyan-500/30 transition-all cursor-pointer"
                title="More tools"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── Pipeline selector (left side, below tools) ── */}
      {/* Shows when "place-organ" is active — pick which biological system to place.
          Slides in from the left with a stagger when activated. */}
      {/* ── Organ Drawer (right side, collapsible) ── */}
      {/* Category dropdown + organ icons. Clicking an organ switches to
          place-organ mode with that pipeline active.
          Positioned to the left of the TelemetryPanel on desktop. */}
      <div className="absolute top-20 right-4 lg:right-[372px] z-30 pointer-events-auto">
        {/* Collapse/expand toggle button */}
        <button
          onClick={() => setDrawerOpen((v) => !v)}
          onMouseEnter={() => setHoveredTool('drawer-toggle')}
          onMouseLeave={() => setHoveredTool(null)}
          className="flex items-center justify-center w-10 h-10 rounded-xl bio-panel transition-all cursor-pointer"
        >
          {drawerOpen
            ? <PanelRightClose className={`w-5 h-5 ${activeTool === 'place-organ' ? 'text-cyan-300 drop-shadow-[0_0_6px_rgba(34,211,238,0.8)]' : 'text-cyan-400/40 hover:text-cyan-400/70'}`} />
            : <PanelRightOpen className={`w-5 h-5 ${activeTool === 'place-organ' ? 'text-cyan-300 drop-shadow-[0_0_6px_rgba(34,211,238,0.8)]' : 'text-cyan-400/40 hover:text-cyan-400/70'}`} />}
        </button>
        <AnimatePresence>
          {hoveredTool === 'drawer-toggle' && !drawerOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 600, damping: 30 }}
              className="absolute right-0 top-full mt-2 bio-panel rounded-lg px-2.5 py-1.5 whitespace-nowrap pointer-events-none z-30"
            >
              <div className="text-[11px] font-mono font-bold text-cyan-300">Organ Library</div>
              <div className="text-[8px] font-mono text-cyan-500/60 mt-0.5">Browse & place organs</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Outline Catalog toggle (right side, below organ library) ── */}
      <div className="absolute top-32 right-4 lg:right-[372px] z-30 pointer-events-auto">
        <button
          onClick={() => setOutlineDrawerOpen((v) => !v)}
          onMouseEnter={() => setHoveredTool('outline-toggle')}
          onMouseLeave={() => setHoveredTool(null)}
          className="flex items-center justify-center w-10 h-10 rounded-xl bio-panel transition-all cursor-pointer"
        >
          <Shapes className={`w-5 h-5 ${outlineDrawerOpen ? 'text-emerald-300 drop-shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'text-emerald-400/40 hover:text-emerald-400/70'}`} />
        </button>
        <AnimatePresence>
          {hoveredTool === 'outline-toggle' && !outlineDrawerOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 600, damping: 30 }}
              className="absolute right-0 top-full mt-2 bio-panel rounded-lg px-2.5 py-1.5 whitespace-nowrap pointer-events-none z-30"
            >
              <div className="text-[11px] font-mono font-bold text-emerald-300">Outline Parts</div>
              <div className="text-[8px] font-mono text-emerald-500/60 mt-0.5">Pre-made hull shapes</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Requirements toggle (right side, below outline catalog) ── */}
      <div className="absolute top-44 right-4 lg:right-[372px] z-30 pointer-events-auto">
        <button
          onClick={() => setRequirementsDrawerOpen((v) => !v)}
          onMouseEnter={() => setHoveredTool('requirements-toggle')}
          onMouseLeave={() => setHoveredTool(null)}
          className="flex items-center justify-center w-10 h-10 rounded-xl bio-panel transition-all cursor-pointer relative"
        >
          <ClipboardCheck className={`w-5 h-5 ${requirementsDrawerOpen ? 'text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]' : 'text-amber-400/40 hover:text-amber-400/70'}`} />
          {validation.summary.critical > 0 && !requirementsDrawerOpen && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center pointer-events-none">
              {validation.summary.critical}
            </span>
          )}
          {validation.summary.critical === 0 && validation.summary.warning > 0 && !requirementsDrawerOpen && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white text-[8px] font-bold flex items-center justify-center pointer-events-none">
              {validation.summary.warning}
            </span>
          )}
        </button>
        <AnimatePresence>
          {hoveredTool === 'requirements-toggle' && !requirementsDrawerOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 600, damping: 30 }}
              className="absolute right-0 top-full mt-2 bio-panel rounded-lg px-2.5 py-1.5 whitespace-nowrap pointer-events-none z-30"
            >
              <div className="text-[11px] font-mono font-bold text-amber-300">Ship Requirements</div>
              <div className="text-[8px] font-mono text-amber-500/60 mt-0.5">
                {validation.summary.total > 0
                  ? `${validation.summary.critical} critical · ${validation.summary.warning} warnings`
                  : 'All requirements met'}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Requirements drawer panel */}
      <AnimatePresence>
        {requirementsDrawerOpen && (
          <motion.div
            initial={{ opacity: 0, x: 20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="absolute top-56 right-4 lg:right-[372px] z-25 pointer-events-auto bio-panel rounded-xl w-[280px] max-h-[calc(100vh-260px)] flex flex-col"
          >
            {/* Header */}
            <div className="px-3 pt-3 pb-2 border-b border-amber-500/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ClipboardCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[10px] font-mono font-bold text-amber-300 uppercase tracking-wider">Ship Requirements</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {validation.summary.critical > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[8px] font-mono font-bold">{validation.summary.critical} CRIT</span>
                  )}
                  {validation.summary.warning > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[8px] font-mono font-bold">{validation.summary.warning} WARN</span>
                  )}
                  {validation.summary.info > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 text-[8px] font-mono font-bold">{validation.summary.info} INFO</span>
                  )}
                  {validation.summary.total === 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[8px] font-mono font-bold">ALL MET</span>
                  )}
                </div>
              </div>
            </div>

            {/* Issues list */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {validation.issues.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                  <ClipboardCheck className="w-8 h-8 text-emerald-400/40 mb-2" />
                  <div className="text-[10px] font-mono text-emerald-400/60">All requirements satisfied</div>
                  <div className="text-[8px] font-mono text-emerald-500/40 mt-1">Ship systems operational</div>
                </div>
              )}
              {validation.issues.map((issue: RequirementIssue) => {
                const sev = SEVERITY_META[issue.severity];
                const cat = CATEGORY_META[issue.category];
                const isCollapsed = collapsedIssues === null || collapsedIssues.has(issue.id);
                const borderColor = issue.severity === 'critical' ? 'red' : issue.severity === 'warning' ? 'amber' : 'cyan';
                return (
                  <div
                    key={issue.id}
                    className={`rounded-lg ${sev.bg} border border-${borderColor}-500/20 overflow-hidden`}
                  >
                    <button
                      onClick={() => setCollapsedIssues((prev) => {
                        // First interaction: initialize with all issue IDs collapsed,
                        // then expand the clicked one
                        if (prev === null) {
                          const next = new Set(validation.issues.map((i) => i.id));
                          next.delete(issue.id);
                          return next;
                        }
                        const next = new Set(prev);
                        if (next.has(issue.id)) next.delete(issue.id);
                        else next.add(issue.id);
                        return next;
                      })}
                      className="flex items-start gap-1.5 w-full p-2 text-left cursor-pointer"
                    >
                      <div className={`flex-shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${issue.severity === 'critical' ? 'bg-red-400' : issue.severity === 'warning' ? 'bg-amber-400' : 'bg-cyan-400'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className={`text-[9px] font-mono font-bold ${sev.color} flex-1 truncate`}>{issue.title}</span>
                          <ChevronDown className={`flex-shrink-0 w-3 h-3 ${sev.color} transition-transform ${isCollapsed ? '' : 'rotate-180'}`} />
                        </div>
                        {isCollapsed && (
                          <div className="text-[7px] font-mono text-slate-600/50 mt-0.5 uppercase tracking-wider">
                            {cat.label}
                          </div>
                        )}
                      </div>
                    </button>
                    {!isCollapsed && (
                      <div className="px-2 pb-2">
                        <div className="text-[8px] font-mono text-slate-400/80 leading-relaxed mb-1">
                          {issue.description}
                        </div>
                        {issue.fixHint && (
                          <div className="text-[8px] font-mono text-slate-500/60 leading-relaxed italic">
                            → {issue.fixHint}
                          </div>
                        )}
                        <div className="text-[7px] font-mono text-slate-600/50 mt-1 uppercase tracking-wider">
                          {cat.label}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer summary */}
            <div className="px-3 py-2 border-t border-amber-500/20">
              <div className="text-[7px] font-mono text-amber-500/40 leading-tight">
                {organs.length} organs placed · {connections.length} connections
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Outline catalog drawer panel */}
      <AnimatePresence>
        {outlineDrawerOpen && (
          <motion.div
            initial={{ opacity: 0, x: 20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="absolute top-44 right-4 lg:right-[372px] z-25 pointer-events-auto bio-panel rounded-xl w-[200px] max-h-[calc(100vh-220px)] flex flex-col"
          >
            {/* Category selector */}
            <div className="relative px-2.5 pt-2.5 pb-2 border-b border-emerald-500/20">
              <div className="text-[8px] font-mono text-emerald-400 uppercase tracking-wider mb-1.5">Category</div>
              <button
                onClick={() => setOpenDropdown(openDropdown === 'outline-category' ? null : 'outline-category')}
                className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-500/20 hover:border-emerald-400/40 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="text-emerald-300">{visibleOutlineCatalog[outlineCategory]?.icon}</span>
                  <span className="text-[10px] font-mono text-emerald-200">{visibleOutlineCatalog[outlineCategory]?.label}</span>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-emerald-400/60 transition-transform ${openDropdown === 'outline-category' ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {openDropdown === 'outline-category' && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="absolute left-2.5 right-2.5 top-full mt-1 bio-panel rounded-lg overflow-hidden z-20"
                  >
                    {visibleOutlineCatalog.map((cat, idx) => (
                      <button
                        key={cat.id}
                        onClick={() => { setOutlineCategory(idx); setOpenDropdown(null); }}
                        className={`flex items-center gap-2 w-full px-2.5 py-1.5 text-left transition-colors cursor-pointer ${outlineCategory === idx ? 'bg-emerald-950/60' : 'hover:bg-emerald-950/30'}`}
                      >
                        <span className="text-emerald-300">{cat.icon}</span>
                        <span className="text-[10px] font-mono text-emerald-200">{cat.label}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Parts grid */}
            <div className="flex-1 overflow-y-auto p-2.5">
              <div className="text-[8px] font-mono text-emerald-400 uppercase tracking-wider mb-2">Parts</div>
              {visibleOutlineCatalog.length === 0 || !visibleOutlineCatalog[outlineCategory] ? (
                <div className="text-[10px] font-mono text-emerald-500/50 text-center py-6 px-2 leading-relaxed">
                  No outlines available for this view orientation.
                </div>
              ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {visibleOutlineCatalog[outlineCategory].parts.map((part, idx) => (
                  <motion.div
                    key={part.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.03, type: 'spring', stiffness: 500, damping: 30 }}
                    className="relative"
                  >
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault();
                        // Start potential drag — actual drag begins after 5px movement
                        outlineDragStartRef.current = {
                          x: e.clientX, y: e.clientY,
                          partId: part.id, catIdx: outlineCategory,
                        };
                        setIsOutlineDragging(true);
                      }}
                      onClick={() => {
                        // Suppress click if a drag just occurred
                        if (outlineDragOccurredRef.current) return;
                        // Click-to-place at the tail of the hull
                        pushHistory();
                        // Find the tail anchor (bottom-most, wz is max)
                        let tailWX = 0, tailWZ = 0;
                        for (const a of hullOutline.anchors) {
                          if (a.wz > tailWZ) { tailWZ = a.wz; tailWX = a.wx; }
                        }
                        const newParts: PlacedPartInstance[] = [];
                        const baseId = `part-${++placedPartIdCounter.current}`;
                        newParts.push({
                          id: baseId,
                          partId: part.id,
                          name: part.name,
                          pathD: part.pathD,
                          localAnchors: part.anchors.map((a) => ({ ...a })),
                          wx: tailWX, wz: tailWZ, scale: 1, rotation: 0,
                          symmetric: part.symmetric,
                          mirrorX: mirrorX && !part.symmetric && Math.abs(tailWX) > 0.01,
                          mirrorZ: mirrorZ && Math.abs(tailWZ) > 0.01,
                        });
                        if (mirrorX && !part.symmetric && Math.abs(tailWX) > 0.01) {
                          newParts.push({
                            id: `part-${++placedPartIdCounter.current}`,
                            partId: part.id,
                            name: `${part.name} (R)`,
                            pathD: part.pathD,
                            localAnchors: part.anchors.map((a) => ({ wx: -a.wx, wz: a.wz })),
                            wx: -tailWX, wz: tailWZ, scale: 1, rotation: 0,
                          });
                        }
                        if (mirrorZ && Math.abs(tailWZ) > 0.01) {
                          newParts.push({
                            id: `part-${++placedPartIdCounter.current}`,
                            partId: part.id,
                            name: `${part.name} (F)`,
                            pathD: part.pathD,
                            localAnchors: part.anchors.map((a) => ({ wx: a.wx, wz: -a.wz })),
                            wx: tailWX, wz: -tailWZ, scale: 1, rotation: 0,
                          });
                        }
                        if (mirrorX && mirrorZ && !part.symmetric && Math.abs(tailWX) > 0.01 && Math.abs(tailWZ) > 0.01) {
                          newParts.push({
                            id: `part-${++placedPartIdCounter.current}`,
                            partId: part.id,
                            name: `${part.name} (RF)`,
                            pathD: part.pathD,
                            localAnchors: part.anchors.map((a) => ({ wx: -a.wx, wz: -a.wz })),
                            wx: -tailWX, wz: -tailWZ, scale: 1, rotation: 0,
                          });
                        }
                        setPlacedParts((prev) => [...prev, ...newParts]);
                        setSelectedPartId(baseId);
                        setHullCustomized(true);
                      }}
                      onMouseEnter={(e) => {
                        setHoveredTool(`outline-${part.id}`);
                        const rect = e.currentTarget.getBoundingClientRect();
                        const drawerEl = e.currentTarget.closest('.bio-panel');
                        if (drawerEl) {
                          const drawerRect = drawerEl.getBoundingClientRect();
                          hoveredIconYRef.current = rect.top + rect.height / 2 - drawerRect.top;
                        }
                      }}
                      onMouseLeave={() => setHoveredTool(null)}
                      className="flex items-center justify-center w-full aspect-square rounded-lg transition-all cursor-grab active:cursor-grabbing border border-transparent hover:bg-emerald-950/30 hover:border-emerald-400/30 select-none"
                    >
                      <span className="text-emerald-400/80">
                        <SilhouetteIcon pathD={part.pathD} className="w-7 h-7" />
                      </span>
                    </button>
                  </motion.div>
                ))}
              </div>
              )}
              <div className="mt-2 text-[7px] font-mono text-emerald-500/40 leading-tight">
                Drag onto canvas to place · Click to place at tail
              </div>
            </div>

            {/* Part tooltips */}
            <AnimatePresence>
              {hoveredTool && hoveredTool.startsWith('outline-') && (() => {
                const partId = hoveredTool.slice(8);
                const part = visibleOutlineCatalog[outlineCategory]?.parts.find((p) => p.id === partId);
                if (!part) return null;
                return (
                  <motion.div
                    initial={{ opacity: 0, x: 6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 6 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="absolute right-full mr-2 bio-panel rounded-lg px-2.5 py-1.5 whitespace-nowrap pointer-events-none z-30"
                    style={{ top: `${hoveredIconYRef.current - 15}px` }}
                  >
                    <div className="text-[10px] font-mono font-bold text-emerald-300">{part.name}</div>
                    <div className="text-[8px] font-mono text-emerald-500/60 mt-0.5">
                      {part.symmetric ? 'Symmetric' : 'Asymmetric'} · {part.anchors.length} pts
                    </div>
                  </motion.div>
                );
              })()}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drawer panel */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            initial={{ opacity: 0, x: 20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="absolute top-32 right-4 lg:right-[372px] z-25 pointer-events-auto bio-panel rounded-xl w-[200px] max-h-[calc(100vh-180px)] flex flex-col"
          >
            {/* Category dropdown */}
            <div className="relative px-2.5 pt-2.5 pb-2 border-b border-cyan-500/20">
              <div className="text-[8px] font-mono text-cyan-400 uppercase tracking-wider mb-1.5">Category</div>
              <button
                onClick={() => setOpenDropdown(openDropdown === 'organ-category' ? null : 'organ-category')}
                className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg bg-cyan-950/40 border border-cyan-500/20 hover:border-cyan-400/40 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span style={{ color: `#${PIPELINE_COLORS[drawerCategory].toString(16).padStart(6, '0')}` }}>
                    {PIPELINE_TOOLS.find((p) => p.id === drawerCategory)?.icon}
                  </span>
                  <span className="text-[10px] font-mono text-cyan-200">
                    {PIPELINE_NAMES[drawerCategory]}
                  </span>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-cyan-400/60 transition-transform ${openDropdown === 'organ-category' ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {openDropdown === 'organ-category' && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="absolute left-2.5 right-2.5 top-full mt-1 bio-panel rounded-lg overflow-hidden z-20"
                  >
                    {PIPELINE_TOOLS.map((pt) => (
                      <button
                        key={pt.id}
                        onClick={() => {
                          setDrawerCategory(pt.id);
                          setOpenDropdown(null);
                        }}
                        className={`flex items-center gap-2 w-full px-2.5 py-1.5 text-left transition-colors cursor-pointer ${
                          drawerCategory === pt.id ? 'bg-cyan-950/60' : 'hover:bg-cyan-950/30'
                        }`}
                      >
                        <span style={{ color: pt.color }}>{pt.icon}</span>
                        <span className="text-[10px] font-mono text-cyan-200">{PIPELINE_NAMES[pt.id]}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Organ icons grid */}
            <div className="flex-1 overflow-y-auto p-2.5">
              <div className="text-[8px] font-mono text-cyan-400 uppercase tracking-wider mb-2">Organs</div>
              <div className="grid grid-cols-3 gap-1.5">
                {ORGAN_CATALOG[drawerCategory].map((organ, idx) => {
                  const color = `#${PIPELINE_COLORS[drawerCategory].toString(16).padStart(6, '0')}`;
                  const isSelected = selectedOrganNodeId === organ.nodeId;
                  return (
                    <motion.div
                      key={organ.nodeId}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.03, type: 'spring', stiffness: 500, damping: 30 }}
                      className="relative"
                    >
                      <button
                        onMouseDown={(e) => {
                          e.preventDefault();
                          // Start potential drag — actual drag begins after 5px movement
                          dragStartRef.current = {
                            x: e.clientX, y: e.clientY,
                            nodeId: organ.nodeId, pipeline: drawerCategory,
                          };
                          setIsDragging(true);
                        }}
                        onClick={() => {
                          // Suppress click if a drag just occurred
                          if (dragOccurredRef.current) return;
                          setSelectedOrganNodeId(organ.nodeId);
                          setActivePipeline(drawerCategory);
                          setActiveTool('place-organ');
                        }}
                        onMouseEnter={(e) => {
                          setHoveredTool(`organ-${organ.nodeId}`);
                          // Store the icon's vertical center for tooltip positioning
                          const rect = e.currentTarget.getBoundingClientRect();
                          const drawerEl = e.currentTarget.closest('.bio-panel');
                          if (drawerEl) {
                            const drawerRect = drawerEl.getBoundingClientRect();
                            hoveredIconYRef.current = rect.top + rect.height / 2 - drawerRect.top;
                          }
                        }}
                        onMouseLeave={() => setHoveredTool(null)}
                        className={`flex items-center justify-center w-full aspect-square rounded-lg transition-all cursor-grab active:cursor-grabbing border ${
                          isSelected
                            ? 'bg-cyan-950/60'
                            : 'border-transparent hover:bg-cyan-950/30'
                        }`}
                        style={
                          isSelected
                            ? { borderColor: `${color}80`, boxShadow: `0 0 10px ${color}40` }
                            : undefined
                        }
                      >
                        <span style={{ color: `${color}${isSelected ? 'ff' : '99'}` }}>
                          {organ.icon}
                        </span>
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Organ tooltips — rendered outside the scrollable grid so they're not clipped.
                Positioned to the left of the drawer, vertically centered on the hovered icon. */}
            <AnimatePresence>
              {hoveredTool && hoveredTool.startsWith('organ-') && (() => {
                const nodeId = hoveredTool.slice(6);
                const organ = ORGAN_CATALOG[drawerCategory].find((o) => o.nodeId === nodeId);
                if (!organ) return null;
                const color = `#${PIPELINE_COLORS[drawerCategory].toString(16).padStart(6, '0')}`;
                return (
                  <motion.div
                    initial={{ opacity: 0, x: 8, scale: 0.9 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 8, scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 600, damping: 30 }}
                    className="absolute right-full mr-2 bio-panel rounded-lg px-2.5 py-1.5 whitespace-nowrap pointer-events-none z-50"
                    style={{ borderColor: `${color}60`, top: hoveredIconYRef.current, transform: 'translateY(-50%)' }}
                  >
                    <div className="text-[10px] font-mono font-bold" style={{ color }}>
                      {organ.shortName}
                    </div>
                    <div className="text-[8px] font-mono text-cyan-500/50 mt-0.5">
                      {organ.name}
                    </div>
                  </motion.div>
                );
              })()}
            </AnimatePresence>

            {/* Footer — placement status */}
            {activeTool === 'place-organ' && selectedOrganNodeId && (
              <div className="px-2.5 py-2 border-t border-cyan-500/20">
                <div className="flex items-center gap-1.5">
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: `#${PIPELINE_COLORS[drawerCategory].toString(16).padStart(6, '0')}` }}
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                  <span className="text-[8px] font-mono text-cyan-400/70 uppercase tracking-wider">
                    Click canvas to place
                  </span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Engineering toolbar (top-center, below header) ── */}
      {/* Layer 1: Frutiger Aero — glossy, skeuomorphic, rounded.
          Each item is a clickable dropdown with alternative options. */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 z-35 bio-panel rounded-xl px-3 py-2 flex items-center gap-2 pointer-events-auto">
        <ToolbarDropdown<ViewOrientation>
          id="orientation"
          icon={<Compass className="w-4 h-4" />}
          currentLabel={viewOrientation.replace('-', ' ')}
          currentValue={viewOrientation}
          onSelect={setViewOrientation}
          openDropdown={openDropdown}
          setOpenDropdown={setOpenDropdown}
          options={[
            { value: 'top-down', label: 'Top-Down' },
            { value: 'side', label: 'Side' },
            { value: 'front', label: 'Front' },
            { value: 'back', label: 'Back' },
          ]}
        />
        <div className="w-px h-5 bg-cyan-500/20" />
        <ToolbarDropdown
          id="scale"
          icon={<Ruler className="w-4 h-4" />}
          currentLabel={`${state.length}m`}
          currentValue={`${state.length}`}
          onSelect={(v) => {
            if (onUpdateState) onUpdateState({ length: parseInt(v, 10) });
          }}
          openDropdown={openDropdown}
          setOpenDropdown={setOpenDropdown}
          options={[
            { value: '6', label: '6m', desc: 'Scout' },
            { value: '10', label: '10m', desc: 'Frigate' },
            { value: '14', label: '14m', desc: 'Corvette' },
            { value: '22', label: '22m', desc: 'Leviathan' },
          ]}
        />
        <div className="w-px h-5 bg-cyan-500/20" />
        <ToolbarDropdown<GridMode>
          id="grid"
          icon={gridMode === 'off' ? <EyeOff className="w-4 h-4" /> : <Grid3x3 className="w-4 h-4" />}
          currentLabel={gridMode === 'on' ? 'Grid' : gridMode}
          currentValue={gridMode}
          onSelect={setGridMode}
          openDropdown={openDropdown}
          setOpenDropdown={setOpenDropdown}
          options={[
            { value: 'on', label: 'Grid On' },
            { value: 'fine', label: 'Fine Grid' },
            { value: 'coarse', label: 'Coarse Grid' },
            { value: 'off', label: 'Grid Off' },
          ]}
        />
        <div className="w-px h-5 bg-cyan-500/20" />
        <ToolbarDropdown<ViewLayer>
          id="layer"
          icon={<Layers className="w-4 h-4" />}
          currentLabel={viewLayer.replace('-', ' ')}
          currentValue={viewLayer}
          onSelect={setViewLayer}
          openDropdown={openDropdown}
          setOpenDropdown={setOpenDropdown}
          options={[
            { value: 'dorsal', label: 'Dorsal' },
            { value: 'ventral', label: 'Ventral' },
            { value: 'cross-section', label: 'Cross-Section' },
          ]}
        />
      </div>

      {/* ── Undo/Redo buttons (bottom-left, above footer) ── */}
      <div className="absolute bottom-24 lg:bottom-10 left-4 lg:left-[380px] z-20 flex gap-1.5 pointer-events-auto">
        <button
          onClick={undo}
          disabled={!canUndo}
          className="bio-panel rounded-lg p-2 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-cyan-500/10 transition-colors group"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4 text-cyan-400 group-hover:text-cyan-300" />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          className="bio-panel rounded-lg p-2 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-cyan-500/10 transition-colors group"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="w-4 h-4 text-cyan-400 group-hover:text-cyan-300" />
        </button>
      </div>

      {/* ── Section legend (bottom-left, above footer) ── */}
      <div className="absolute bottom-24 lg:bottom-10 right-4 lg:right-6 z-15 bio-panel rounded-lg px-3 py-2 pointer-events-auto">
        <div className="text-[9px] font-mono text-cyan-400 uppercase tracking-wider mb-1.5">Anatomical Sections</div>
        <div className="flex flex-col gap-1">
          {SHIP_SECTIONS.map((sec, i) => {
            const uMin = sectionBounds[i] ?? sec.uMin;
            const uMax = i < SHIP_SECTIONS.length - 1 ? (sectionBounds[i + 1] ?? sec.uMax) : sec.uMax;
            return (
              <div key={sec.id} className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{
                    backgroundColor: `#${sec.color.toString(16).padStart(6, '0')}`,
                    boxShadow: `0 0 6px #${sec.color.toString(16).padStart(6, '0')}80`,
                  }}
                />
                <span className="text-[9px] font-mono text-cyan-300/80">{sec.label}</span>
                <span className="text-[8px] font-mono text-cyan-500/40">
                  {Math.round(uMin * state.length)}–{Math.round(uMax * state.length)}m
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Drag-from-drawer preview ── */}
      {/* Floating organ icon that follows the cursor during a drag from the drawer. */}
      <AnimatePresence>
        {dragPreview && (() => {
          const catalogEntry = ORGAN_CATALOG[dragPreview.pipeline].find((o) => o.nodeId === dragPreview.nodeId);
          const color = `#${PIPELINE_COLORS[dragPreview.pipeline].toString(16).padStart(6, '0')}`;
          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 600, damping: 30 }}
              className="fixed pointer-events-none z-[100] flex items-center justify-center w-10 h-10 rounded-lg border-2"
              style={{
                left: dragPreview.x - 20,
                top: dragPreview.y - 20,
                borderColor: `${color}80`,
                backgroundColor: `${color}20`,
                boxShadow: `0 0 16px ${color}60`,
              }}
            >
              <span style={{ color }}>{catalogEntry?.icon}</span>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Floating outline part icon that follows the cursor during a drag. */}
      <AnimatePresence>
        {outlineDragPreview && (() => {
          const cat = visibleOutlineCatalog[outlineDragPreview.catIdx];
          const part = cat?.parts.find((p) => p.id === outlineDragPreview.partId);
          if (!part) return null;
          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 600, damping: 30 }}
              className="fixed pointer-events-none z-[100] flex items-center justify-center w-10 h-10 rounded-lg border-2"
              style={{
                left: outlineDragPreview.x - 20,
                top: outlineDragPreview.y - 20,
                borderColor: 'rgba(52, 211, 153, 0.5)',
                backgroundColor: 'rgba(52, 211, 153, 0.12)',
                boxShadow: '0 0 16px rgba(52, 211, 153, 0.4)',
              }}
            >
              <span className="text-emerald-300">
                <SilhouetteIcon pathD={part.pathD} className="w-7 h-7" />
              </span>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
});
