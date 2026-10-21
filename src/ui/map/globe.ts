/**
 * The terrain layer, in WebGL2. Every pass projects lon/lat orthographically
 * in the vertex shader, so the night globe and the close front map are one
 * projection at different radii. Far-side fragments are discarded rather than
 * depth-tested: in an orthographic view each screen point has one near-side
 * point, so tiles draw coarse to fine with no depth buffer.
 */
import { pxPerDeg, radius, type Camera, type Viewport } from '../view';
import { MASK_H, MASK_W, OVERLAY_H, OVERLAY_W, type Rect } from './situation';
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
uniform vec3 u_tile;  // west, north, span (degrees)
out vec2 v_tex;
out vec2 v_ll;
out float v_z;
${ORTHO}
void main() {
  vec2 ll = vec2(u_tile.x + a_uv.x * u_tile.z, u_tile.y - a_uv.y * u_tile.z);
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
const vec3 BLUE = vec3(0.25, 0.55, 0.91), RED = vec3(0.84, 0.22, 0.24), AMBER = vec3(1.0, 0.71, 0.28);
void main() {
  vec2 sp = gl_FragCoord.xy / u_dpr - u_view.yz * 0.5;
  if (v_z < 0.0 || length(sp) > u_view.x) discard;
  vec4 t = texture(u_tex, v_tex);
  // Tiles keep land in alpha 160..255 (see build-tiles.page.js).
  float land = clamp((t.a - 0.6275) / 0.3725, 0.0, 1.0);
  vec3 c = t.rgb;
  vec2 muv = vec2((v_ll.x + 180.0) / 360.0, (90.0 - v_ll.y) / 180.0);
  vec4 m = texture(u_mask, muv);
  float own = smoothstep(0.28, 0.55, m.r), foe = smoothstep(0.28, 0.55, m.g), occ = smoothstep(0.3, 0.6, m.b), war = smoothstep(0.3, 0.6, m.a);
  float lum = 0.45 + 2.4 * dot(c, vec3(0.3, 0.5, 0.2));
  c = mix(c, BLUE * 0.42 * lum, own * 0.34 * land);
  c = mix(c, RED * 0.5 * lum, foe * 0.38 * land);
  c = mix(c, AMBER * 0.4 * lum, war * 0.16 * land);
  float s = fract((gl_FragCoord.x + gl_FragCoord.y) / (13.0 * u_dpr));
  c += vec3(1.0, 0.45, 0.45) * 0.10 * (smoothstep(0.0, 0.06, s) - smoothstep(0.13, 0.2, s)) * occ * land;

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
  private readonly grid: WebGLVertexArrayObject;
  private readonly gridCount: number;
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
  private readonly aniso: EXT_texture_filter_anisotropic | null;
  /** Called when a tile finishes loading, so the owner can schedule a frame. */
  onTile: () => void = () => {};

  constructor(private readonly canvas: HTMLCanvasElement, private readonly base: string) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    const cam = ['u_cam', 'u_view'];
    this.tileProg = program(gl, TILE_VS, TILE_FS, [...cam, 'u_tile', 'u_tex', 'u_mask', 'u_overlay', 'u_globe', 'u_dpr', 'u_seaGrid']);
    this.bgProg = program(gl, BG_VS, BG_FS, ['u_view', 'u_dpr', 'u_globe']);
    this.lightProg = program(gl, LIGHT_VS, LIGHT_FS, [...cam, 'u_lights', 'u_dpr']);

    const uv: number[] = [], idx: number[] = [];
    for (let j = 0; j <= GRID; j++) for (let i = 0; i <= GRID; i++) uv.push(i / GRID, j / GRID);
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
      const a = j * (GRID + 1) + i, b = a + 1, c = a + GRID + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    this.grid = this.vao(new Float32Array(uv), 2, new Uint16Array(idx));
    this.gridCount = idx.length;
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
    for (let x = 0; x < 2; x++) this.request({ z: 0, x, y: 0 });
  }

  setLights(lonLatPop: Float32Array) {
    this.lights = this.vao(lonLatPop, 3, null);
    this.lightCount = lonLatPop.length / 3;
  }

  /** Upload the changed rectangle of the control mask. */
  setMask(data: Uint8Array, r: Rect) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.mask);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, MASK_W);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, r.x0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, r.y0);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
  }

  setOverlay(data: Uint8Array) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.overlay);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, OVERLAY_W, OVERLAY_H, gl.RGBA, gl.UNSIGNED_BYTE, data);
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
      .catch(() => this.failed.add(key))
      .finally(() => this.inflight.delete(key));
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

  /** Draws a frame; returns true while tiles the view wants are still loading. */
  draw(cam: Camera, vp: Viewport, opts: GlobeOptions): boolean {
    const gl = this.gl;
    this.frame++;
    for (let i = 0; i < (this.resScale < 1 ? 1 : UPLOADS_PER_FRAME) && this.ready.length; i++) {
      const r = this.ready.shift()!;
      this.upload(r.key, r.img);
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    const R = radius(cam), globe = globeAmount(cam);
    const lat0 = (cam.lat * Math.PI) / 180;
    const camU = [(cam.lon * Math.PI) / 180, lat0, Math.sin(lat0), Math.cos(lat0)] as const;

    const dpr = this.dpr * this.resScale;
    const plan = this.plan(cam, vp);
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
    const pending = this.ready.length > 0 || this.inflight.size > 0;
    for (const { tile, tex } of plan) {
      const span = spanOf(tile.z);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform3f(p.u.u_tile, -180 + tile.x * span, 90 - tile.y * span, span);
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
    gl.bindVertexArray(null);
    this.evict();
    return pending;
  }
}
