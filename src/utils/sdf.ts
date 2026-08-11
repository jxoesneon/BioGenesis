/**
 * Signed Distance Field (SDF) Composition Module
 *
 * Implements the SDF-first organ representation recommended in
 * docs/research/PROCEDURAL_MESH_GENERATION_RESEARCH.md §5.1.
 *
 * Each organ is defined as a composited SDF using:
 *   - Primitives (sphere, box, capsule, torus, cone, cylinder)
 *   - CSG operations (union, intersection, subtraction)
 *   - Smooth-min blending for organic transitions
 *   - Transformations (translate, rotate, scale)
 *
 * The SDF is the source of truth; triangle meshes are extracted on demand
 * via marching cubes (see marchingCubes.ts) or dual contouring (dualContouring.ts).
 *
 * References:
 *   - Inigo Quilez: "Distance Estimation" — iquilezles.org
 *   - fogleman/sdf (Python) — CSG API patterns
 *   - cheind/sdftoolbox — mesh extraction
 */

import * as THREE from 'three';

// ── SDF Function Type ──

/**
 * A signed distance function. Returns the signed distance from point p
 * to the surface. Negative inside, positive outside, zero on surface.
 */
export type SDF = (p: THREE.Vector3) => number;

// ── Primitives ──

/** Sphere SDF: distance to sphere surface centered at origin. */
export function sdSphere(radius: number): SDF {
  return (p) => p.length() - radius;
}

/** Box SDF: distance to axis-aligned box centered at origin. */
export function sdBox(halfExtents: THREE.Vector3): SDF {
  return (p) => {
    const q = new THREE.Vector3(
      Math.abs(p.x) - halfExtents.x,
      Math.abs(p.y) - halfExtents.y,
      Math.abs(p.z) - halfExtents.z,
    );
    const external = new THREE.Vector3(
      Math.max(q.x, 0),
      Math.max(q.y, 0),
      Math.max(q.z, 0),
    );
    return external.length() + Math.min(Math.max(q.x, Math.max(q.y, q.z)), 0);
  };
}

/** Capsule SDF: distance to a capsule along the Y axis. */
export function sdCapsule(radius: number, halfHeight: number): SDF {
  return (p) => {
    const py = p.y;
    const pxz = new THREE.Vector2(p.x, p.z);
    // Project onto the capsule axis region
    const clampedY = Math.max(-halfHeight, Math.min(halfHeight, py));
    const d = new THREE.Vector2(pxz.x, py - clampedY);
    return d.length() - radius;
  };
}

/** Torus SDF: distance to a torus in the XZ plane. */
export function sdTorus(majorRadius: number, minorRadius: number): SDF {
  return (p) => {
    const q = new THREE.Vector2(
      new THREE.Vector2(p.x, p.z).length() - majorRadius,
      p.y,
    );
    return q.length() - minorRadius;
  };
}

/** Cone SDF: distance to a cone along the Y axis (tip at +height, base at 0). */
export function sdCone(radius: number, height: number): SDF {
  return (p) => {
    const q = new THREE.Vector2(
      new THREE.Vector2(p.x, p.z).length(),
      p.y,
    );
    const tip = new THREE.Vector2(0, height);
    // Distance from point to cone surface
    const ca = new THREE.Vector2().subVectors(tip, new THREE.Vector2(radius, 0));
    const cb = new THREE.Vector2().subVectors(q, tip);
    const h = Math.max(0, Math.min(1, cb.dot(ca) / ca.dot(ca)));
    const d = new THREE.Vector2().subVectors(cb, ca.clone().multiplyScalar(h));
    const r = new THREE.Vector2(
      Math.max(0, q.x - radius * (1 - h)),
      Math.abs(q.y - height + height * h),
    );
    const s = Math.sign(ca.y * cb.x - ca.x * cb.y);
    return Math.min(d.length() * s, r.length() * Math.sign(q.y - height));
  };
}

/** Cylinder SDF: distance to a cylinder along the Y axis. */
export function sdCylinder(radius: number, halfHeight: number): SDF {
  return (p) => {
    const d = new THREE.Vector2(
      new THREE.Vector2(p.x, p.z).length() - radius,
      Math.abs(p.y) - halfHeight,
    );
    return Math.min(Math.max(d.x, d.y), 0) + d.clone().max(new THREE.Vector2(0, 0)).length();
  };
}

/** Ellipsoid SDF (approximation — not exact SDF but good for preview). */
export function sdEllipsoid(radii: THREE.Vector3): SDF {
  return (p) => {
    const k0 = new THREE.Vector3(
      p.x / radii.x,
      p.y / radii.y,
      p.z / radii.z,
    ).length();
    const k1 = new THREE.Vector3(
      p.x / (radii.x * radii.x),
      p.y / (radii.y * radii.y),
      p.z / (radii.z * radii.z),
    ).length();
    return k0 * (k0 - 1.0) / k1;
  };
}

/** Plane SDF: distance to a plane with normal n at distance h from origin. */
export function sdPlane(normal: THREE.Vector3, h: number): SDF {
  const n = normal.clone().normalize();
  return (p) => p.dot(n) + h;
}

// ── CSG Operations ──

/** Union: min(d1, d2) — combines two SDFs. */
export function opUnion(a: SDF, b: SDF): SDF {
  return (p) => Math.min(a(p), b(p));
}

/** Intersection: max(d1, d2) — keeps only the overlapping region. */
export function opIntersection(a: SDF, b: SDF): SDF {
  return (p) => Math.max(a(p), b(p));
}

/** Subtraction: max(d1, -d2) — subtracts b from a. */
export function opSubtraction(a: SDF, b: SDF): SDF {
  return (p) => Math.max(a(p), -b(p));
}

// ── Smooth Blending ──

/**
 * Polynomial smooth minimum (smin).
 *
 * The single most important technique for organic organ composition.
 * Creates smooth, organic blending between two SDFs.
 *
 * Formula: mix(d2, d1, h) - k*h*(1-h)
 * where h = clamp(0.5 + 0.5*(d2-d1)/k, 0, 1)
 *
 * @param k Blend radius in distance units. Larger = smoother blend.
 * @returns SDF that smoothly blends a and b.
 *
 * Reference: Inigo Quilez — "smooth minimum" iquilezles.org
 */
export function opSmoothUnion(a: SDF, b: SDF, k: number): SDF {
  return (p) => {
    const d1 = a(p);
    const d2 = b(p);
    const h = Math.max(0, Math.min(0.5 + 0.5 * (d2 - d1) / (k * 2), 1));
    return d2 * (1 - h) + d1 * h - k * h * (1 - h);
  };
}

/**
 * Smooth subtraction: organically subtracts b from a with a soft transition.
 * @param k Blend radius in distance units.
 */
export function opSmoothSubtraction(a: SDF, b: SDF, k: number): SDF {
  return (p) => {
    const d1 = a(p);
    const d2 = b(p);
    const h = Math.max(0, Math.min(0.5 - 0.5 * (d2 + d1) / (k * 2), 1));
    return d1 * (1 - h) + (-d2) * h - k * h * (1 - h);
  };
}

/**
 * Smooth intersection: organically intersects a and b with a soft transition.
 * @param k Blend radius in distance units.
 */
export function opSmoothIntersection(a: SDF, b: SDF, k: number): SDF {
  return (p) => {
    const d1 = a(p);
    const d2 = b(p);
    const h = Math.max(0, Math.min(0.5 + 0.5 * (d2 - d1) / (k * 2), 1));
    return d2 * (1 - h) + d1 * h + k * h * (1 - h);
  };
}

// ── Transformations ──

/** Translate an SDF by an offset vector. */
export function opTranslate(sdf: SDF, offset: THREE.Vector3): SDF {
  return (p) => {
    const local = p.clone().sub(offset);
    return sdf(local);
  };
}

/** Rotate an SDF by a rotation matrix (inverse applied to query point). */
export function opRotate(sdf: SDF, rotation: THREE.Matrix3): SDF {
  const inv = rotation.clone().invert();
  return (p) => {
    const local = p.clone().applyMatrix3(inv);
    return sdf(local);
  };
}

/** Scale an SDF by a uniform scale factor. */
export function opScale(sdf: SDF, scale: number): SDF {
  return (p) => {
    const local = p.clone().divideScalar(scale);
    return sdf(local) * scale;
  };
}

/** Apply an arbitrary 4x4 transformation matrix to an SDF. */
export function opTransform(sdf: SDF, matrix: THREE.Matrix4): SDF {
  const inv = matrix.clone().invert();
  return (p) => {
    const local = p.clone().applyMatrix4(inv);
    return sdf(local);
  };
}

// ── Domain Modifications ──

/** Elongate an SDF along all axes by extent e (rounds the corners). */
export function opElongate(sdf: SDF, e: THREE.Vector3): SDF {
  return (p) => {
    const q = new THREE.Vector3(
      Math.abs(p.x) - e.x,
      Math.abs(p.y) - e.y,
      Math.abs(p.z) - e.z,
    );
    const exterior = new THREE.Vector3(
      Math.max(q.x, 0),
      Math.max(q.y, 0),
      Math.max(q.z, 0),
    );
    const interior = new THREE.Vector3(
      Math.min(Math.max(q.x, Math.min(q.y, q.z)), 0),
    );
    const offset = exterior.length() + interior.x;
    const local = p.clone().sub(exterior).sub(interior);
    return sdf(local) + offset;
  };
}

/** Twist an SDF along the Y axis by twistAmount radians per unit. */
export function opTwist(sdf: SDF, twistAmount: number): SDF {
  return (p) => {
    const angle = p.y * twistAmount;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const local = new THREE.Vector3(
      c * p.x - s * p.z,
      p.y,
      s * p.x + c * p.z,
    );
    return sdf(local);
  };
}

/** Bend an SDF along the X axis by bendAmount radians per unit. */
export function opBend(sdf: SDF, bendAmount: number): SDF {
  return (p) => {
    const angle = p.x * bendAmount;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const local = new THREE.Vector3(
      c * p.x - s * p.y,
      s * p.x + c * p.y,
      p.z,
    );
    return sdf(local);
  };
}

/** Repeat an SDF periodically along all three axes. */
export function opRepeat(sdf: SDF, spacing: THREE.Vector3): SDF {
  return (p) => {
    const local = new THREE.Vector3(
      p.x - spacing.x * Math.round(p.x / spacing.x),
      p.y - spacing.y * Math.round(p.y / spacing.y),
      p.z - spacing.z * Math.round(p.z / spacing.z),
    );
    return sdf(local);
  };
}

/** Displace an SDF surface using a noise function for organic detail. */
export function opDisplace(sdf: SDF, displacement: (p: THREE.Vector3) => number): SDF {
  return (p) => sdf(p) + displacement(p);
}

// ── SDF Bounding & Sampling ──

/**
 * Sample an SDF on a regular 3D grid and return the values as a typed array.
 * Used by marching cubes and dual contouring for mesh extraction.
 *
 * @param sdf The signed distance function to sample.
 * @param bounds Axis-aligned bounding box to sample within.
 * @param resolution Grid resolution (cells per axis).
 * @returns Float32Array of size (res+1)^3 with SDF values.
 */
export function sampleSDFGrid(
  sdf: SDF,
  bounds: THREE.Box3,
  resolution: number,
): Float32Array {
  const size = resolution + 1;
  const values = new Float32Array(size * size * size);
  const min = bounds.min;
  const max = bounds.max;
  const step = new THREE.Vector3(
    (max.x - min.x) / resolution,
    (max.y - min.y) / resolution,
    (max.z - min.z) / resolution,
  );

  const p = new THREE.Vector3();
  let idx = 0;
  for (let i = 0; i < size; i++) {
    p.x = min.x + i * step.x;
    for (let j = 0; j < size; j++) {
      p.y = min.y + j * step.y;
      for (let k = 0; k < size; k++) {
        p.z = min.z + k * step.z;
        values[idx++] = sdf(p);
      }
    }
  }
  return values;
}

/**
 * Compute the bounding box of an SDF by sampling at the given resolution.
 * Returns a Box3 that encloses all points where |sdf| < threshold.
 */
export function estimateSDFBounds(
  sdf: SDF,
  center: THREE.Vector3,
  maxRadius: number,
  resolution: number = 16,
): THREE.Box3 {
  const box = new THREE.Box3(
    center.clone().subScalar(maxRadius),
    center.clone().addScalar(maxRadius),
  );
  // Tighten bounds by sampling
  const values = sampleSDFGrid(sdf, box, resolution);
  const size = resolution + 1;
  const min = box.min;
  const max = box.max;
  const step = new THREE.Vector3(
    (max.x - min.x) / resolution,
    (max.y - min.y) / resolution,
    (max.z - min.z) / resolution,
  );

  let tightMin = max.clone();
  let tightMax = min.clone();
  const p = new THREE.Vector3();
  let idx = 0;
  for (let i = 0; i < size; i++) {
    p.x = min.x + i * step.x;
    for (let j = 0; j < size; j++) {
      p.y = min.y + j * step.y;
      for (let k = 0; k < size; k++) {
        p.z = min.z + k * step.z;
        if (values[idx] < 0) {
          tightMin.min(p);
          tightMax.max(p);
        }
        idx++;
      }
    }
  }

  // Add padding
  const padding = maxRadius * 0.1;
  tightMin.subScalar(padding);
  tightMax.addScalar(padding);
  return new THREE.Box3(tightMin, tightMax);
}

// ── Composited SDF Builder ──

/**
 * Builder pattern for composing complex SDFs.
 * Provides a fluent API for chaining CSG and smooth blend operations.
 *
 * @example
 * const organSDF = new SDFBuilder()
 *   .add(sdSphere(1.0))
 *   .smoothUnion(sdCapsule(0.3, 1.5), 0.3)
 *   .subtract(sdSphere(0.4), 0)
 *   .translate(new THREE.Vector3(0, 1, 0))
 *   .build();
 */
export class SDFBuilder {
  private sdf: SDF;

  constructor(initial?: SDF) {
    this.sdf = initial ?? (() => Infinity);
  }

  /** Add a primitive or composed SDF via hard union. */
  add(sdf: SDF): this {
    this.sdf = this.sdf === undefined ? sdf : opUnion(this.sdf, sdf);
    return this;
  }

  /** Add a primitive or composed SDF via smooth union. */
  smoothUnion(sdf: SDF, k: number): this {
    this.sdf = opSmoothUnion(this.sdf, sdf, k);
    return this;
  }

  /** Subtract an SDF via hard subtraction. */
  subtract(sdf: SDF): this {
    this.sdf = opSubtraction(this.sdf, sdf);
    return this;
  }

  /** Subtract an SDF via smooth subtraction. */
  smoothSubtract(sdf: SDF, k: number): this {
    this.sdf = opSmoothSubtraction(this.sdf, sdf, k);
    return this;
  }

  /** Intersect with an SDF via hard intersection. */
  intersect(sdf: SDF): this {
    this.sdf = opIntersection(this.sdf, sdf);
    return this;
  }

  /** Translate the entire composition. */
  translate(offset: THREE.Vector3): this {
    this.sdf = opTranslate(this.sdf, offset);
    return this;
  }

  /** Rotate the entire composition. */
  rotate(rotation: THREE.Matrix3): this {
    this.sdf = opRotate(this.sdf, rotation);
    return this;
  }

  /** Scale the entire composition. */
  scale(s: number): this {
    this.sdf = opScale(this.sdf, s);
    return this;
  }

  /** Apply a 4x4 transformation matrix. */
  transform(matrix: THREE.Matrix4): this {
    this.sdf = opTransform(this.sdf, matrix);
    return this;
  }

  /** Twist the composition along Y. */
  twist(amount: number): this {
    this.sdf = opTwist(this.sdf, amount);
    return this;
  }

  /** Bend the composition along X. */
  bend(amount: number): this {
    this.sdf = opBend(this.sdf, amount);
    return this;
  }

  /** Displace the surface with a noise function. */
  displace(displacement: (p: THREE.Vector3) => number): this {
    this.sdf = opDisplace(this.sdf, displacement);
    return this;
  }

  /** Build the final SDF function. */
  build(): SDF {
    return this.sdf;
  }
}
