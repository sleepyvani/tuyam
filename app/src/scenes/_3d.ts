// 3D kit for Túy Âm: one pinhole camera shared by ray-marched passes (FSPass), three.js meshes and 3D
// LineBatches; a ray-march pass template with the engine's shared supersampling (SS_TAP); the cup as a
// signed distance field; extruded 3D text built from the fonts' outlines.
import * as THREE from 'three';
import { FSPass, H, SS_TAP, SS_TAP_GLSL } from '../engine/gl';
import { textPathCommands } from '../engine/type';

export type V3 = THREE.Vector3;
export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/**
 * A pinhole camera: position, target, roll, vertical field of view. `apply()` computes the basis,
 * fills the GLSL uniforms and syncs a three.js PerspectiveCamera for meshes and 3D line batches.
 */
export class Cam3 {
  pos = v3(0, 1, 5);
  target = v3(0, 0, 0);
  roll = 0;
  fov = 40; // degrees, vertical
  R = v3(1, 0, 0); U = v3(0, 1, 0); F = v3(0, 0, -1);
  focal = 1; // logical px
  three = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 4000);
  uniforms: Record<string, THREE.IUniform> = {
    camPos: { value: v3() }, camR: { value: v3() }, camU: { value: v3() }, camF: { value: v3() }, focal: { value: 1 },
  };
  set(pos: V3, target: V3, roll = 0, fov = this.fov) { this.pos.copy(pos); this.target.copy(target); this.roll = roll; this.fov = fov; return this.apply(); }
  apply() {
    this.F.copy(this.target).sub(this.pos).normalize();
    const up0 = v3(Math.sin(this.roll), Math.cos(this.roll), 0);
    // keep up0 in the camera's world frame: rotate the world up around F by roll
    const worldUp = v3(0, 1, 0);
    const R0 = v3().crossVectors(this.F, worldUp).normalize();
    const U0 = v3().crossVectors(R0, this.F).normalize();
    this.R.copy(R0).multiplyScalar(Math.cos(this.roll)).addScaledVector(U0, -Math.sin(this.roll)).normalize();
    this.U.crossVectors(this.R, this.F).normalize();
    void up0;
    this.focal = (H / 2) / Math.tan((this.fov * Math.PI) / 360);
    const u = this.uniforms;
    (u.camPos!.value as V3).copy(this.pos); (u.camR!.value as V3).copy(this.R); (u.camU!.value as V3).copy(this.U); (u.camF!.value as V3).copy(this.F);
    u.focal!.value = this.focal;
    const c = this.three;
    c.fov = this.fov; c.aspect = 16 / 9;
    c.position.copy(this.pos);
    c.up.copy(this.U);
    c.lookAt(this.target);
    c.updateProjectionMatrix(); c.updateMatrixWorld(true);
    return this;
  }
  /** World point → screen px (logical, y down), depth along F. */
  project(p: V3) {
    const rel = p.clone().sub(this.pos);
    const z = rel.dot(this.F);
    return { x: 960 + (rel.dot(this.R) / z) * this.focal, y: 540 - (rel.dot(this.U) / z) * this.focal, z };
  }
}

/** GLSL: the camera uniforms and the ray through a pixel (px: logical px from the centre, y up). */
export const GLSL_CAM = /* glsl */ `
uniform vec3 camPos, camR, camU, camF; uniform float focal;
vec3 camDir(vec2 px) { return normalize(camF * focal + camR * px.x + camU * px.y); }
`;

/**
 * A ray-marched fullscreen pass. `body` must define `vec3 shade(vec3 ro, vec3 rd, vec2 px)` returning
 * linear HDR colour; it may declare uniforms (a `t` float is always there). Four rotated-grid taps per
 * pixel, shared across motion-blur sub-frames (SS_TAP).
 */
export function rayPass(cam: Cam3, body: string, uniforms: Record<string, THREE.IUniform> = {}) {
  return new FSPass(/* glsl */ `
    ${GLSL_CAM}
    ${SS_TAP_GLSL}
    uniform float t;
    ${body}
    void main() {
      vec2 px0 = FRAG_PX - vec2(960.0, 540.0);
      vec3 col = vec3(0.0);
      for (int k = ssK0(); k < ssK1(); k++) {
        vec2 px = px0 + rgss(k) / PX_SCALE;
        col += shade(camPos, camDir(px), px);
      }
      fragColor = vec4(col * ssWeight(), 1.0);
    }`, { ...cam.uniforms, t: { value: 0 }, ssTap: SS_TAP, ...uniforms });
}

/**
 * GLSL: the cup as SDFs, rim centred at the origin (y up), rim radius R (a spherical bowl of radius R
 * whose rim is at y = 0 and bottom at y = -D), wall thickness th, a foot ring under it.
 *   sdCup(p)            — the porcelain
 *   sdWine(p, level)    — the wine inside, up to height `level` (y, ≤ 0 is inside the bowl)
 */
export const GLSL_CUP = /* glsl */ `
uniform float cupR, cupD, cupTh;
float sdCupBowl(vec3 p) {
  // sphere through the rim circle and the bottom point
  float Rs = (cupR * cupR + cupD * cupD) / (2.0 * cupD);
  vec3 c = vec3(0.0, Rs - cupD, 0.0);
  float d = abs(length(p - c) - Rs) - cupTh * 0.5;
  return max(d, p.y);                        // cut at the rim
}
float sdCupFoot(vec3 p) {
  vec2 q = vec2(length(p.xz) - cupR * 0.32, p.y + cupD + cupR * 0.05);
  return length(max(abs(q) - vec2(cupTh * 0.5, cupR * 0.07), 0.0)) - 0.004;
}
float sdCup(vec3 p) { return min(sdCupBowl(p) - 0.003, sdCupFoot(p)); }
float sdWine(vec3 p, float level) {
  float Rs = (cupR * cupR + cupD * cupD) / (2.0 * cupD);
  vec3 c = vec3(0.0, Rs - cupD, 0.0);
  return max(length(p - c) - (Rs - cupTh * 0.5), p.y - level);
}
`;

const textGeoCache = new Map<string, THREE.ExtrudeGeometry>();
/**
 * Extruded 3D text (centred on its advance, baseline at y = 0, extruding toward -z), from the font's
 * outlines (engine/type.ts textPathCommands). `size` in world units.
 */
export function textGeometry(text: string, family: string, size: number, depth: number) {
  const key = `${text}|${family}|${size}|${depth}`;
  const hit = textGeoCache.get(key);
  if (hit) return hit;
  const S = 100; // outline units per world unit
  const cmds = textPathCommands(text, family, S);
  const sp = new THREE.ShapePath();
  for (const c of cmds) {
    const cc = c as any;
    if (cc.type === 'M') sp.moveTo(cc.x, -cc.y);
    else if (cc.type === 'L') sp.lineTo(cc.x, -cc.y);
    else if (cc.type === 'Q') sp.quadraticCurveTo(cc.x1, -cc.y1, cc.x, -cc.y);
    else if (cc.type === 'C') sp.bezierCurveTo(cc.x1, -cc.y1, cc.x2, -cc.y2, cc.x, -cc.y);
  }
  const shapes = sp.toShapes();
  const g = new THREE.ExtrudeGeometry(shapes, { depth: depth * S / size, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 0.8, bevelSegments: 2, curveSegments: 5 });
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  g.translate(-(bb.min.x + bb.max.x) / 2, 0, -depth * S / size);
  g.scale(size / S, size / S, size / S);
  g.computeVertexNormals();
  textGeoCache.set(key, g);
  return g;
}

/**
 * A lit material for meshes: key light + rim + ambient, an emissive mix (0..1) toward `glow`, all in
 * linear HDR (the engine's render targets). `fogDensity` fades toward `fogColor` with distance.
 */
export function litMaterial(o: { color: [number, number, number]; glow?: [number, number, number]; keyDir?: V3; fogColor?: [number, number, number]; fogDensity?: number; transparent?: boolean }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      base: { value: new THREE.Vector3(...o.color) }, glowC: { value: new THREE.Vector3(...(o.glow ?? [0, 0, 0])) }, emit: { value: 0 }, alpha: { value: 1 },
      keyDir: { value: (o.keyDir ?? v3(0.4, 0.8, 0.5)).clone().normalize() }, fogC: { value: new THREE.Vector3(...(o.fogColor ?? [0, 0, 0])) }, fogD: { value: o.fogDensity ?? 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW; varying float vDist;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
        vec4 mv = viewMatrix * w; vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 base, glowC, keyDir, fogC; uniform float emit, alpha, fogD;
      varying vec3 vN; varying vec3 vW; varying float vDist;
      void main() {
        vec3 N = normalize(vN);
        vec3 V = normalize(cameraPosition - vW);
        float dif = max(dot(N, keyDir), 0.0);
        float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec3 col = base * (0.18 + 0.82 * dif) + base * rim * 0.6;
        col = mix(col, glowC, emit);
        col = mix(col, fogC, 1.0 - exp(-fogD * vDist));
        gl_FragColor = vec4(col, alpha);
      }`,
    transparent: o.transparent ?? false,
  });
}

/** Render a three.js scene into an HDR target over what is there (depth cleared first). */
export function renderMeshes(renderer: THREE.WebGLRenderer, scene: THREE.Scene, cam: Cam3, out: THREE.WebGLRenderTarget) {
  renderer.setRenderTarget(out);
  renderer.clearDepth();
  renderer.render(scene, cam.three);
}

/** Smooth camera shake (world units) for a hit pulse k at time t. */
export function shake3(k: number, t: number, amp = 0.05) {
  return v3(Math.sin(t * 91.7) * amp * k, Math.cos(t * 77.3) * amp * k, Math.sin(t * 63.1) * amp * 0.5 * k);
}
