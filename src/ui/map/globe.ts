/**
 * The terrain layer, in WebGL2. Every pass projects lon/lat orthographically
 * in the vertex shader, so the night globe and the close front map are one
 * projection at different radii. Far-side fragments are discarded rather than
 * depth-tested: in an orthographic view each screen point has one near-side
 * point, so tiles draw coarse to fine with no depth buffer.
 */
import { pxPerDeg, radius, type Camera, type Viewport } from '../view';
import { bounds, MASK_H, MASK_RES, MASK_W, OVERLAY_H, OVERLAY_RES, OVERLAY_W, type Rect } from './situation';
import { keyOf, levelFor, parent, spanOf, TileIndex, wantedTiles, type Manifest, type TileKey } from './tiles';

const ORTHO = /* glsl */ `
uniform vec4 u_cam;   // lon0, lat0 (radians), sin(lat0), cos(lat0)
uniform vec3 u_view;  // radius px, viewport w, h (CSS px)
vec3 ortho(vec2 ll) {
  float l = radians(ll.x) - u_cam.x, p = radians(ll.y), cp = cos(p), sp = sin(p), cl = cos(l);
  return vec3(cp * sin(l), u_cam.w * sp - u_cam.z * cp * cl, u_cam.z * sp + u_cam.w * cp * cl);
}
vec4 clip(vec3 o) { return vec4(o.x * u_view.x * 2.0 / u_view.y, o.y * u_view.x * 2.0 / u_view.z, 0.0, 1.0); }
`;

const TILE_VS = /* glsl */ `#version 300 es
in vec2 a_uv;
uniform vec4 u_tile;  // west, north, span east, span south (degrees)
out vec2 v_tex;
out vec2 v_ll;
out float v_z;
${ORTHO}
void main() {
  vec2 ll = vec2(u_tile.x + a_uv.x * u_tile.z, u_tile.y - a_uv.y * u_tile.w);
  vec3 o = ortho(ll);
  v_ll = ll;
  v_z = o.z;
  v_tex = a_uv;
  gl_Position = clip(o);
}`;

const TILE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_tex;
in vec2 v_ll;
in float v_z;
uniform sampler2D u_tex;
uniform sampler2D u_mask;
uniform sampler2D u_overlay;
uniform float u_globe;    // 1 on the far globe, 0 from theatre zoom in
uniform float u_dpr;
uniform float u_seaGrid;
uniform vec3 u_view;
out vec4 frag;
const vec3 BLUE = vec3(0.25, 0.55, 0.91), RED = vec3(0.84, 0.22, 0.24);
void main() {
  vec2 sp = gl_FragCoord.xy / u_dpr - u_view.yz * 0.5;
  if (v_z < 0.0 || length(sp) > u_view.x) discard;
  vec4 t = texture(u_tex, v_tex);
  // Tiles keep land in alpha 160..255 (see build-tiles.page.js).
  float land = clamp((t.a - 0.6275) / 0.3725, 0.0, 1.0);
  vec3 c = t.rgb;
  vec2 muv = vec2((v_ll.x + 180.0) / 360.0, (90.0 - v_ll.y) / 180.0);
  vec4 m = texture(u_mask, muv);
  float own = smoothstep(0.15, 0.45, m.r), foe = smoothstep(0.15, 0.45, m.g), occ = smoothstep(0.15, 0.45, m.b), war = smoothstep(0.15, 0.45, m.a);
  // Tint multiplies the relief rather than painting over it, so ridges and valleys still read through.
  c = mix(c, c * vec3(0.78, 1.08, 1.5) + BLUE * 0.03, own * 0.85 * land);
  c = mix(c, c * vec3(1.75, 0.78, 0.78) + RED * 0.035, foe * 0.85 * land);
  c = mix(c, c * vec3(1.35, 1.12, 0.8), war * 0.5 * land);
  float s = fract((gl_FragCoord.x + gl_FragCoord.y) / (13.0 * u_dpr));
  c += vec3(1.0, 0.47, 0.47) * 0.15 * (smoothstep(0.0, 0.06, s) - smoothstep(0.13, 0.2, s)) * occ * land;

  // The front: where the friendly and enemy fields cross, drawn as a glowing line a fixed width on screen.
  float d = m.r - m.g, fw = max(fwidth(d), 1e-5), px = abs(d) / fw / u_dpr;
  float both = smoothstep(0.35, 0.7, m.r + m.g) * step(0.04, min(m.r, m.g));
  float core = 1.0 - smoothstep(0.7, 1.6, px), glow = exp(-px * 0.32);
  c = mix(c, vec3(1.0, 0.3, 0.31), glow * 0.42 * both);
  c = mix(c, vec3(1.0, 0.45, 0.38), core * both);

  vec4 o = texture(u_overlay, muv);
  c = c * (1.0 - o.a) + o.rgb;

  if (u_seaGrid > 0.0) {
    vec2 g = vec2((v_ll.x + 180.0) / 3.0, (90.0 - v_ll.y) / 3.0);
    vec2 e = abs(fract(g - 0.5) - 0.5) / max(fwidth(g), vec2(1e-5));
    c += vec3(0.43, 0.59, 0.75) * 0.07 * u_seaGrid * (1.0 - smoothstep(0.5, 1.5, min(e.x, e.y))) * (1.0 - land);
  }

  c *= mix(1.0, 0.3 + 0.7 * pow(v_z, 0.55), u_globe);
  c += vec3(0.12, 0.35, 0.63) * pow(1.0 - v_z, 3.0) * u_globe;
  frag = vec4(c, 1.0);
}`;

const STENCIL_VS = /* glsl */ `#version 300 es
in vec2 a_ll;
out float v_z;
${ORTHO}
void main() {
  vec3 o = ortho(a_ll);
  v_z = o.z;
  gl_Position = clip(o);
}`;

/** Marks the near side of a damaged box in the stencil buffer. */
const STENCIL_FS = /* glsl */ `#version 300 es
precision mediump float;
in float v_z;
out vec4 frag;
void main() {
  if (v_z < 0.0) discard;
  frag = vec4(0.0);
}`;

const BG_VS = /* glsl */ `#version 300 es
in vec2 a_uv;
void main() { gl_Position = vec4(a_uv * 4.0 - 1.0, 0.0, 1.0); }`;

/** Ink, the atmosphere's halo around the globe, and a sparse star field that fades as the globe fills the screen. */
const BG_FS = /* glsl */ `#version 300 es
precision highp float;
uniform vec3 u_view;
uniform float u_dpr;
uniform float u_globe;
out vec4 frag;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 p = gl_FragCoord.xy / u_dpr - u_view.yz * 0.5;
  float r = length(p) / u_view.x;
  vec3 c = vec3(0.016, 0.027, 0.047);
  if (r < 1.0) c = vec3(0.03, 0.08, 0.13);
  else {
    float dd = r - 1.0;
    c += vec3(0.12, 0.43, 0.82) * (exp(-dd * 26.0) * 0.9 + exp(-dd * 6.0) * 0.22) * u_globe;
    vec2 cell = floor(gl_FragCoord.xy / (1.5 * u_dpr));
    float h = hash(cell);
    c += vec3(0.85, 0.88, 1.0) * step(0.9975, h) * pow(hash(cell + 7.0), 3.0) * 0.9 * u_globe;
  }
  frag = vec4(c, 1.0);
}`;

const LIGHT_VS = /* glsl */ `#version 300 es
in vec3 a_p;  // lon, lat, population
uniform float u_lights;
uniform float u_dpr;
out float v_a;
${ORTHO}
void main() {
  vec3 o = ortho(a_p.xy);
  float size = clamp(log(a_p.z) / log(10.0) * 3.2 - 10.0, 2.0, 14.0) * (0.55 + 0.25 * u_lights);
  v_a = o.z <= 0.0 ? 0.0 : pow(o.z, 1.6) * u_lights;
  gl_PointSize = size * 2.2 * u_dpr;
  gl_Position = o.z <= 0.0 ? vec4(2.0, 2.0, 0.0, 1.0) : clip(o);
}`;

const LIGHT_FS = /* glsl */ `#version 300 es
precision mediump float;
in float v_a;
out vec4 frag;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0 || v_a <= 0.0) discard;
  float core = exp(-d * d * 9.0), halo = (1.0 - d) * (1.0 - d);
  vec3 c = vec3(1.0, 0.84, 0.59) * core * 0.55 + vec3(1.0, 0.6, 0.27) * halo * 0.2;
  frag = vec4(c * v_a, 1.0);
}`;

/** Tile mesh subdivisions: enough that a 90-degree tile's horizon edge stays smooth on the globe. */
const GRID = 40;
const MAX_TEXTURES = 160;
const MAX_INFLIGHT = 8;
const UPLOADS_PER_FRAME = 3;
/** Subdivisions of the patch a damaged box is stencilled with; boxes are cut to at most PATCH_SPAN degrees first. */
const PATCH = 8;
const PATCH_VERTICES = PATCH * PATCH * 6;
const PATCH_SPAN = 10;

/** Damage is scissored per square of this many CSS px; past MAX_PASSES squares, one scissor goes round it all. */
const SCISSOR_CELL = 128;
const MAX_PASSES = 12;
const MAX_UPLOADS = 32;
/** Past this share of the screen, a whole frame costs no more than a partial one. */
const MAX_PARTIAL_SHARE = 0.5;

/** Degrees: west and east as x0 and x1, and y0 and y1 counted down from the north pole. */
type Box = Rect;

/** The degree box of texel rectangle `r` on a grid of `res` degrees, grown by a texel for linear filtering. */
const boxOf = (r: Rect, res: number): Box => ({ x0: (r.x0 - 1) * res - 180, y0: (r.y0 - 1) * res, x1: (r.x1 + 1) * res - 180, y1: (r.y1 + 1) * res });

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
/** Whether two boxes overlap, either way round the antimeridian. */
const meets = (a: Box, b: Box) => [-360, 0, 360].some((d) => overlaps({ ...a, x0: a.x0 + d, x1: a.x1 + d }, b));

/** A tile's degree box. */
function tileBox(t: TileKey): Box {
  const span = spanOf(t.z);
  return { x0: -180 + t.x * span, y0: t.y * span, x1: -180 + (t.x + 1) * span, y1: (t.y + 1) * span };
}

/**
 * The screen rectangle (CSS px) round box `b`'s patch, from where its grid points fall on the projection
 * plane, near side or far; null when it is all behind the globe.
 */
function footprint(cam: Camera, vp: Viewport, b: Box): Rect | null {
  const r = Math.PI / 180, R = radius(cam), p0 = cam.lat * r, s0 = Math.sin(p0), c0 = Math.cos(p0);
  const out = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  let nearest = -Infinity;
  for (let i = 0; i <= PATCH; i++) for (let j = 0; j <= PATCH; j++) {
    const l = (b.x0 + ((b.x1 - b.x0) * i) / PATCH - cam.lon) * r, p = (90 - b.y0 - ((b.y1 - b.y0) * j) / PATCH) * r;
    const cp = Math.cos(p), sp = Math.sin(p), cl = Math.cos(l);
    const x = vp.width / 2 + R * cp * Math.sin(l), y = vp.height / 2 - R * (c0 * sp - s0 * cp * cl);
    nearest = Math.max(nearest, s0 * sp + c0 * cp * cl);
    out.x0 = Math.min(out.x0, x);
    out.x1 = Math.max(out.x1, x);
    out.y0 = Math.min(out.y0, y);
    out.y1 = Math.max(out.y1, y);
  }
  // Between grid points the surface leaves its chords by under R * 1e-4, and faces by at most 0.03 more.
  if (nearest < -0.03) return null;
  const pad = 3 + R * 1e-4;
  return { x0: out.x0 - pad, y0: out.y0 - pad, x1: out.x1 + pad, y1: out.y1 + pad };
}

/** Each box as a PATCH x PATCH grid of lon/lat triangles. */
function patchTriangles(boxes: readonly Box[]): Float32Array {
  const out = new Float32Array(boxes.length * PATCH_VERTICES * 2);
  let k = 0;
  for (const b of boxes) {
    const lon = (i: number) => b.x0 + ((b.x1 - b.x0) * i) / PATCH, lat = (j: number) => 90 - b.y0 - ((b.y1 - b.y0) * j) / PATCH;
    for (let j = 0; j < PATCH; j++) for (let i = 0; i < PATCH; i++) {
      for (const [di, dj] of [[0, 0], [0, 1], [1, 0], [1, 0], [0, 1], [1, 1]]) {
        out[k++] = lon(i + di);
        out[k++] = lat(j + dj);
      }
    }
  }
  return out;
}

/** `b` grown by `by` degrees and cut into pieces small enough that a patch follows the globe's curve. */
function pieces(b: Box, by: number): Box[] {
  const g = { x0: b.x0 - by, y0: Math.max(0, b.y0 - by), x1: b.x1 + by, y1: Math.min(180, b.y1 + by) };
  const nx = Math.ceil((g.x1 - g.x0) / PATCH_SPAN), ny = Math.ceil((g.y1 - g.y0) / PATCH_SPAN), out: Box[] = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    out.push({ x0: g.x0 + ((g.x1 - g.x0) * i) / nx, x1: g.x0 + ((g.x1 - g.x0) * (i + 1)) / nx, y0: g.y0 + ((g.y1 - g.y0) * j) / ny, y1: g.y0 + ((g.y1 - g.y0) * (j + 1)) / ny });
  }
  return out;
}

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const prog = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(`shader: ${gl.getShaderInfoLog(sh)}`);
    gl.attachShader(prog, sh);
  }
  gl.bindAttribLocation(prog, 0, 'a_uv');
  gl.bindAttribLocation(prog, 0, 'a_p');
  gl.bindAttribLocation(prog, 0, 'a_ll');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(prog)}`);
  return prog;
}

interface Program {
  prog: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string, names: string[]): Program {
  const prog = compile(gl, vs, fs);
  return { prog, u: Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)])) };
}

interface Loaded {
  tex: WebGLTexture;
  used: number;
}

export interface GlobeOptions {
  seaGrid: boolean;
}

/** How far the night-globe look (limb shading, halo, stars, city lights) is applied at a zoom. */
export function globeAmount(cam: Camera): number {
  const p = pxPerDeg(cam);
  return Math.max(0, Math.min(1, (22 - p) / 14));
}

export class GlobeGL {
  private readonly gl: WebGL2RenderingContext;
  private readonly tileProg: Program;
  private readonly bgProg: Program;
  private readonly lightProg: Program;
  private readonly stencilProg: Program;
  private readonly grid: WebGLVertexArrayObject;
  private readonly gridCount: number;
  /** Triangles over this frame's damaged boxes, in lon/lat, drawn in one call. */
  private readonly patches: WebGLVertexArrayObject;
  private readonly patchBuffer: WebGLBuffer;
  private readonly quad: WebGLVertexArrayObject;
  private lights: WebGLVertexArrayObject | null = null;
  private lightCount = 0;
  private readonly mask: WebGLTexture;
  private readonly overlay: WebGLTexture;
  private index: TileIndex | null = null;
  private readonly textures = new Map<string, Loaded>();
  private readonly inflight = new Set<string>();
  private readonly ready: { key: string; img: ImageBitmap }[] = [];
  private readonly failed = new Set<string>();
  private frame = 0;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private resScale = 1;
  /** Where the mask or overlay changed since the last frame drawn. */
  private damage: Box[] = [];
  /** The next frame must be drawn whole: the view, the tiles or the drawing buffer changed. */
  private whole = true;
  private drawnView = '';
  private readonly aniso: EXT_texture_filter_anisotropic | null;
  /** Called when a tile finishes loading, so the owner can schedule a frame. */
  onTile: () => void = () => {};

  constructor(private readonly canvas: HTMLCanvasElement, private readonly base: string) {
    // Kept between frames, so a frame where only part of the situation changed redraws only that part, through a stencil.
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: true, stencil: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    const cam = ['u_cam', 'u_view'];
    this.tileProg = program(gl, TILE_VS, TILE_FS, [...cam, 'u_tile', 'u_tex', 'u_mask', 'u_overlay', 'u_globe', 'u_dpr', 'u_seaGrid']);
    this.bgProg = program(gl, BG_VS, BG_FS, ['u_view', 'u_dpr', 'u_globe']);
    this.lightProg = program(gl, LIGHT_VS, LIGHT_FS, [...cam, 'u_lights', 'u_dpr']);
    this.stencilProg = program(gl, STENCIL_VS, STENCIL_FS, cam);

    const uv: number[] = [], idx: number[] = [];
    for (let j = 0; j <= GRID; j++) for (let i = 0; i <= GRID; i++) uv.push(i / GRID, j / GRID);
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
      const a = j * (GRID + 1) + i, b = a + 1, c = a + GRID + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    this.grid = this.vao(new Float32Array(uv), 2, new Uint16Array(idx));
    this.gridCount = idx.length;
    this.patchBuffer = gl.createBuffer()!;
    this.patches = gl.createVertexArray()!;
    gl.bindVertexArray(this.patches);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.patchBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.quad = this.vao(new Float32Array([0, 0, 1, 0, 0, 1]), 2, null);

    this.mask = this.texture(MASK_W, MASK_H);
    this.overlay = this.texture(OVERLAY_W, OVERLAY_H);
  }

  private vao(data: Float32Array, size: number, index: Uint16Array | null): WebGLVertexArrayObject {
    const gl = this.gl, vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, size, gl.FLOAT, false, 0, 0);
    if (index) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
    }
    gl.bindVertexArray(null);
    return vao;
  }

  private texture(w: number, h: number): WebGLTexture {
    const gl = this.gl, tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  setManifest(m: Manifest) {
    this.index = new TileIndex(m);
    this.whole = true;
    for (let x = 0; x < 2; x++) this.request({ z: 0, x, y: 0 });
  }

  setLights(lonLatPop: Float32Array) {
    this.lights = this.vao(lonLatPop, 3, null);
    this.lightCount = lonLatPop.length / 3;
    this.whole = true;
  }

  /** Upload the changed rectangles of the control mask. */
  setMask(data: Uint8Array, rects: readonly Rect[]) {
    this.upload2d(this.mask, MASK_W, data, rects);
    for (const r of rects) this.damage.push(boxOf(r, MASK_RES));
  }

  /** Upload the changed rectangles of the overlay raster. */
  setOverlay(data: Uint8Array, rects: readonly Rect[]) {
    this.upload2d(this.overlay, OVERLAY_W, data, rects);
    for (const r of rects) this.damage.push(boxOf(r, OVERLAY_RES));
  }

  private upload2d(tex: WebGLTexture, width: number, data: Uint8Array, rects: readonly Rect[]) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, width);
    // Each upload has a fixed cost, so a great many go up as one.
    for (const r of rects.length > MAX_UPLOADS ? [bounds(rects)] : rects) {
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, r.x0);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, r.y0);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
  }

  resize(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.applyScale();
  }

  /**
   * Resolution scale of the drawing buffer. Fill rate is the globe's whole
   * cost, so on a weak GPU the owner drops it while the camera moves and
   * restores it when the camera stops.
   */
  get scale() {
    return this.resScale;
  }

  set scale(s: number) {
    if (s === this.resScale) return;
    this.resScale = s;
    this.applyScale();
  }

  private applyScale() {
    this.canvas.width = Math.max(1, Math.round(this.width * this.dpr * this.resScale));
    this.canvas.height = Math.max(1, Math.round(this.height * this.dpr * this.resScale));
    this.whole = true;
  }

  private request(t: TileKey) {
    const key = keyOf(t);
    if (this.textures.has(key) || this.inflight.has(key) || this.failed.has(key) || this.inflight.size >= MAX_INFLIGHT) return;
    this.inflight.add(key);
    fetch(`${this.base}${key}.webp`)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
      .then((img) => {
        this.ready.push({ key, img });
        this.onTile();
      })
      .catch(() => {
        this.failed.add(key);
        this.inflight.delete(key);
      });
  }

  private upload(key: string, img: ImageBitmap) {
    const gl = this.gl, tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    img.close();
    this.textures.set(key, { tex, used: this.frame });
    this.whole = true;
    // A tile stays in flight until it is uploaded, so the frames between its arrival and its upload do not fetch it again.
    this.inflight.delete(key);
  }

  private evict() {
    if (this.textures.size <= MAX_TEXTURES) return;
    const old = [...this.textures].filter(([k, t]) => t.used < this.frame && !k.startsWith('0/')).sort((a, b) => a[1].used - b[1].used);
    for (const [k, t] of old.slice(0, this.textures.size - MAX_TEXTURES)) {
      this.gl.deleteTexture(t.tex);
      this.textures.delete(k);
    }
  }

  /**
   * The tiles to draw this frame, coarse first: for each wanted tile, the best
   * one the manifest has if it is loaded, else its nearest loaded ancestor.
   */
  private plan(cam: Camera, vp: Viewport): { tile: TileKey; tex: WebGLTexture }[] {
    const index = this.index;
    if (!index) return [];
    const z = levelFor(cam, this.dpr);
    const out = new Map<string, { tile: TileKey; tex: WebGLTexture }>();
    for (const want of wantedTiles(cam, vp, z)) {
      let t: TileKey | null = index.best(want);
      this.request(t);
      while (t) {
        const key = keyOf(t), loaded = this.textures.get(key);
        if (loaded) {
          loaded.used = this.frame;
          out.set(key, { tile: t, tex: loaded.tex });
          break;
        }
        t = parent(t);
        if (t && index.has(t)) this.request(t);
      }
    }
    return [...out.values()].sort((a, b) => a.tile.z - b.tile.z);
  }

  /**
   * Scissor rectangles (CSS px) round the near side of the damaged boxes, pooled per patch of screen, each
   * with the boxes it holds; null when they would cover so much that a whole frame is as cheap.
   */
  private scissors(cam: Camera, vp: Viewport, damage: readonly Box[]): { rect: Rect; boxes: Box[] }[] | null {
    const screen = { x0: 0, y0: 0, x1: this.width, y1: this.height };
    const pooled = new Map<number, { rect: Rect; boxes: Box[] }>();
    for (const b of damage) {
      const f = footprint(cam, vp, b);
      if (!f || !overlaps(f, screen)) continue;
      const r = { x0: Math.max(0, f.x0), y0: Math.max(0, f.y0), x1: Math.min(this.width, f.x1), y1: Math.min(this.height, f.y1) };
      const k = Math.floor((r.x0 + r.x1) / 2 / SCISSOR_CELL) * 4096 + Math.floor((r.y0 + r.y1) / 2 / SCISSOR_CELL), p = pooled.get(k);
      if (p) {
        p.rect = bounds([p.rect, r]);
        p.boxes.push(b);
      } else pooled.set(k, { rect: r, boxes: [b] });
    }
    let out = [...pooled.values()];
    if (out.length > MAX_PASSES) out = [{ rect: bounds(out.map((p) => p.rect)), boxes: out.flatMap((p) => p.boxes) }];
    const area = out.reduce((a, { rect: r }) => a + (r.x1 - r.x0) * (r.y1 - r.y0), 0);
    return area > MAX_PARTIAL_SHARE * this.width * this.height ? null : out;
  }

  /** Draws a frame, or the part of one where the mask or overlay changed; returns true while tiles the view wants are still loading. */
  draw(cam: Camera, vp: Viewport, opts: GlobeOptions): boolean {
    const gl = this.gl;
    this.frame++;
    for (let i = 0; i < (this.resScale < 1 ? 1 : UPLOADS_PER_FRAME) && this.ready.length; i++) {
      const r = this.ready.shift()!;
      this.upload(r.key, r.img);
    }
    const plan = this.plan(cam, vp);
    const pending = this.ready.length > 0 || this.inflight.size > 0;
    const view = `${cam.lon}|${cam.lat}|${cam.zoom}|${vp.width}|${vp.height}|${this.dpr}|${this.resScale}|${opts.seaGrid}`;
    // Grown by a few pixels as well, for the screen-space derivatives the front line is drawn with.
    const damage = this.damage.flatMap((b) => pieces(b, 3 / pxPerDeg(cam)));
    const passes = this.whole || view !== this.drawnView ? null : this.scissors(cam, vp, damage);
    this.damage = [];
    this.whole = false;
    this.drawnView = view;
    if (passes && !passes.length) {
      this.evict();
      return pending;
    }

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    const R = radius(cam), globe = globeAmount(cam);
    const lat0 = (cam.lat * Math.PI) / 180;
    const camU = [(cam.lon * Math.PI) / 180, lat0, Math.sin(lat0), Math.cos(lat0)] as const;
    const dpr = this.dpr * this.resScale;

    if (passes) {
      // Only pixels on the near side of a damaged box are redrawn; the rest of the buffer is still right. Each
      // pass marks its own boxes, so a pixel in two passes' scissors is redrawn (and lit) once.
      const st = this.stencilProg;
      gl.enable(gl.STENCIL_TEST);
      gl.stencilMask(0xff);
      gl.clearStencil(0);
      gl.clear(gl.STENCIL_BUFFER_BIT);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
      gl.colorMask(false, false, false, false);
      gl.useProgram(st.prog);
      gl.uniform4f(st.u.u_cam, ...camU);
      gl.uniform3f(st.u.u_view, R, this.width, this.height);
      const tris = patchTriangles(passes.flatMap((p) => p.boxes));
      gl.bindVertexArray(this.patches);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.patchBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, tris, gl.STREAM_DRAW);
      let first = 0;
      passes.forEach((p, i) => {
        gl.stencilFunc(gl.ALWAYS, i + 1, 0xff);
        gl.drawArrays(gl.TRIANGLES, first, p.boxes.length * PATCH_VERTICES);
        first += p.boxes.length * PATCH_VERTICES;
      });
      gl.colorMask(true, true, true, true);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    }

    // The stencil says which pixels change; scissors keep the shading to near them, since a fragment shader
    // that discards is run before the stencil test.
    for (const [i, pass] of (passes ?? [null]).entries()) {
      if (pass) {
        const { x0, y0, x1, y1 } = pass.rect;
        gl.stencilFunc(gl.EQUAL, i + 1, 0xff);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(Math.floor(x0 * dpr), this.canvas.height - Math.ceil(y1 * dpr), Math.ceil(x1 * dpr) - Math.floor(x0 * dpr), Math.ceil(y1 * dpr) - Math.floor(y0 * dpr));
      }
      // Close in, the globe fills the screen and the tiles cover every pixel: skip the sky.
      if (!plan.length || R * R < (this.width * this.width + this.height * this.height) / 4) {
        gl.useProgram(this.bgProg.prog);
        gl.uniform3f(this.bgProg.u.u_view, R, this.width, this.height);
        gl.uniform1f(this.bgProg.u.u_dpr, dpr);
        gl.uniform1f(this.bgProg.u.u_globe, globe);
        gl.bindVertexArray(this.quad);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      const p = this.tileProg;
      gl.useProgram(p.prog);
      gl.uniform4f(p.u.u_cam, ...camU);
      gl.uniform3f(p.u.u_view, R, this.width, this.height);
      gl.uniform1f(p.u.u_globe, globe);
      gl.uniform1f(p.u.u_dpr, dpr);
      gl.uniform1f(p.u.u_seaGrid, opts.seaGrid ? Math.max(0, Math.min(1, (pxPerDeg(cam) - 12) / 20)) : 0);
      gl.uniform1i(p.u.u_tex, 0);
      gl.uniform1i(p.u.u_mask, 1);
      gl.uniform1i(p.u.u_overlay, 2);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.mask);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.overlay);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindVertexArray(this.grid);
      for (const { tile, tex } of plan) {
        if (pass && !pass.boxes.some((b) => meets(b, tileBox(tile)))) continue;
        const span = spanOf(tile.z);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform4f(p.u.u_tile, -180 + tile.x * span, 90 - tile.y * span, span, span);
        gl.drawElements(gl.TRIANGLES, this.gridCount, gl.UNSIGNED_SHORT, 0);
      }

      if (this.lights && globe > 0) {
        const l = this.lightProg;
        gl.useProgram(l.prog);
        gl.uniform4f(l.u.u_cam, ...camU);
        gl.uniform3f(l.u.u_view, R, this.width, this.height);
        gl.uniform1f(l.u.u_lights, globe);
        gl.uniform1f(l.u.u_dpr, dpr);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.bindVertexArray(this.lights);
        gl.drawArrays(gl.POINTS, 0, this.lightCount);
        gl.disable(gl.BLEND);
      }
    }
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.bindVertexArray(null);
    this.evict();
    return pending;
  }
}
