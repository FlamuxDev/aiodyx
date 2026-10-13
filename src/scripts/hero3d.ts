// Hero 3D: "your whole company in one system". A layered core (the system) assembles, six app tiles
// (sales, inventory, invoicing, people, point of sale, CRM) fly into a ring around it, light beams connect
// each tile to the core and data pulses travel along them. A sync wave periodically ripples across the floor.
// Loaded lazily (dynamic import) after first paint. No text in WebGL; icons are drawn pictograms.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, MeshStandardMaterial, MeshBasicMaterial, DirectionalLight,
  HemisphereLight, PlaneGeometry, ShadowMaterial, PMREMGenerator, SRGBColorSpace, ACESFilmicToneMapping,
  PCFShadowMap, CanvasTexture, Sprite, SpriteMaterial, AdditiveBlending, NormalBlending, RingGeometry,
  SphereGeometry, TubeGeometry, QuadraticBezierCurve3, Vector3, Vector2, Raycaster, DoubleSide, type Texture,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// three.js cannot read CSS variables, so both themes are mirrored here (see tokens.css).
const PALETTE = {
  light: {
    core: ['#dfe7f5', '#b4c8e6', '#2b3e8c'], seam: '#5a78d6', tile: '#ffffff', icon: '#2b3e8c', iconHot: '#4d6fe0',
    beam: '#9db5e6', pulse: '#2b3e8c', glow: '#5a78d6', ring: '#2b3e8c', ground: 0xcfd9ee, shadow: 0.1, additive: false,
  },
  dark: {
    core: ['#252d4d', '#3d4f8c', '#6a84d2'], seam: '#c3d0ff', tile: '#222a48', icon: '#c3d0ff', iconHot: '#ffffff',
    beam: '#5068b5', pulse: '#eef2ff', glow: '#8fa8ee', ring: '#8fa8ee', ground: 0x1a2140, shadow: 0.35, additive: true,
  },
} as const;
type Pal = (typeof PALETTE)[keyof typeof PALETTE];

const ICONS = ['chart', 'box', 'receipt', 'people', 'cart', 'chat'] as const;
const R = 2.75;                 // ring radius
const TILE = 1.05, TILE_H = 0.18, TILE_Y = -0.45;
const CORE = 1.75, CORE_H = 0.3, CORE_GAP = 0.06;
const CORE_TOP = (CORE_H + CORE_GAP) * 2 + CORE_H / 2 - 0.55;
const FLOOR_Y = -1.05;
const WAVE_EVERY = 6;           // seconds between sync waves
const INTRO = 2.6;              // seconds until the scene is fully assembled

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const outCubic = (x: number) => 1 - (1 - clamp01(x)) ** 3;
const outBack = (x: number) => { x = clamp01(x); const c = 1.5; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };

/** Rounded-stroke pictograms on a transparent 256px canvas. */
function drawIcon(ctx: CanvasRenderingContext2D, kind: (typeof ICONS)[number], color: string) {
  const s = 256;
  ctx.clearRect(0, 0, s, s);
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = 15; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (kind) {
    case 'chart':
      ctx.moveTo(52, 204); ctx.lineTo(204, 204);
      [[76, 150], [116, 116], [156, 136], [196, 70]].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.moveTo(166, 66); ctx.lineTo(198, 68); ctx.lineTo(196, 100);
      break;
    case 'box':
      ctx.moveTo(128, 50); ctx.lineTo(200, 88); ctx.lineTo(200, 170); ctx.lineTo(128, 208); ctx.lineTo(56, 170); ctx.lineTo(56, 88); ctx.closePath();
      ctx.moveTo(56, 88); ctx.lineTo(128, 126); ctx.lineTo(200, 88); ctx.moveTo(128, 126); ctx.lineTo(128, 208);
      ctx.moveTo(92, 69); ctx.lineTo(164, 107);
      break;
    case 'receipt':
      ctx.moveTo(70, 44); ctx.lineTo(186, 44); ctx.lineTo(186, 212); ctx.lineTo(166, 198); ctx.lineTo(147, 212); ctx.lineTo(128, 198);
      ctx.lineTo(109, 212); ctx.lineTo(90, 198); ctx.lineTo(70, 212); ctx.closePath();
      ctx.moveTo(96, 90); ctx.lineTo(160, 90); ctx.moveTo(96, 124); ctx.lineTo(160, 124); ctx.moveTo(96, 158); ctx.lineTo(134, 158);
      break;
    case 'people':
      ctx.arc(104, 92, 30, 0, Math.PI * 2);
      ctx.moveTo(48, 202); ctx.quadraticCurveTo(52, 140, 104, 140); ctx.quadraticCurveTo(156, 140, 160, 202);
      ctx.moveTo(172, 66); ctx.arc(160, 92, 26, -Math.PI / 2, Math.PI / 2.2);
      ctx.moveTo(178, 144); ctx.quadraticCurveTo(210, 156, 212, 202);
      break;
    case 'cart':
      ctx.moveTo(40, 60); ctx.lineTo(70, 60); ctx.lineTo(92, 164); ctx.lineTo(192, 164); ctx.lineTo(212, 90); ctx.lineTo(78, 90);
      ctx.stroke(); ctx.beginPath();
      ctx.arc(102, 200, 13, 0, Math.PI * 2); ctx.moveTo(195, 200); ctx.arc(182, 200, 13, 0, Math.PI * 2);
      ctx.fill();
      return;
    case 'chat':
      ctx.moveTo(72, 56); ctx.lineTo(184, 56); ctx.quadraticCurveTo(212, 56, 212, 84); ctx.lineTo(212, 142); ctx.quadraticCurveTo(212, 170, 184, 170);
      ctx.lineTo(118, 170); ctx.lineTo(78, 204); ctx.lineTo(82, 170); ctx.lineTo(72, 170); ctx.quadraticCurveTo(44, 170, 44, 142);
      ctx.lineTo(44, 84); ctx.quadraticCurveTo(44, 56, 72, 56); ctx.closePath();
      ctx.moveTo(90, 113); ctx.lineTo(90, 113); ctx.moveTo(128, 113); ctx.lineTo(128, 113); ctx.moveTo(166, 113); ctx.lineTo(166, 113);
      break;
  }
  ctx.stroke();
}

function glowTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function init(el: HTMLElement): () => void {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = matchMedia('(max-width: 959px)').matches;
  const fine = matchMedia('(pointer: fine)').matches;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    return () => {};
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !small;
  renderer.shadowMap.type = PCFShadowMap;

  let pal: Pal = PALETTE[document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'];
  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new PerspectiveCamera(28, 1, 0.1, 80);
  const hemi = new HemisphereLight(0xffffff, pal.ground, 0.75);
  scene.add(hemi);
  const sun = new DirectionalLight(0xffffff, 2);
  sun.position.set(3, 9, 5);
  sun.castShadow = !small;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 28 });
  sun.shadow.radius = 8;
  scene.add(sun);

  const world = new Group();
  scene.add(world);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  // ---- core: three stacked slabs with glowing seams ----
  const core = new Group();
  world.add(core);
  const coreGeo = keep(new RoundedBoxGeometry(CORE, CORE_H, CORE, 4, 0.08));
  const coreMats = pal.core.map((c) => keep(new MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.05, envMapIntensity: 0.4 })));
  const coreSlabs = coreMats.map((m) => {
    const s = new Mesh(coreGeo, m);
    s.castShadow = true; s.receiveShadow = true;
    core.add(s);
    return s;
  });
  const seamGeo = keep(new RoundedBoxGeometry(CORE - 0.1, CORE_GAP * 0.9, CORE - 0.1, 2, 0.02));
  const seamMat = keep(new MeshBasicMaterial({ color: pal.seam, transparent: true, opacity: 0, toneMapped: false }));
  const seams = [0, 1].map(() => { const m = new Mesh(seamGeo, seamMat); core.add(m); return m; });
  const slabY = (i: number) => i * (CORE_H + CORE_GAP) - 0.55;

  // ---- ring of app tiles ----
  const tileGeo = keep(new RoundedBoxGeometry(TILE, TILE_H, TILE, 3, 0.07));
  const tileMat = keep(new MeshStandardMaterial({ color: pal.tile, roughness: 0.5, metalness: 0.02, envMapIntensity: 0.8 }));
  const iconGeo = keep(new PlaneGeometry(TILE * 0.72, TILE * 0.72));
  const tiles = ICONS.map((kind, i) => {
    const a = (i / ICONS.length) * Math.PI * 2 + Math.PI / 6;
    const home = new Vector3(Math.cos(a) * R, TILE_Y, Math.sin(a) * R);
    const g = new Group();
    const body = new Mesh(tileGeo, tileMat);
    body.castShadow = true; body.receiveShadow = true;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    drawIcon(ctx, kind, pal.icon);
    const tex = keep(new CanvasTexture(c));
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    const iconMat = keep(new MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
    const icon = new Mesh(iconGeo, iconMat);
    icon.rotation.x = -Math.PI / 2;
    icon.position.y = TILE_H / 2 + 0.004;
    g.add(body, icon);
    world.add(g);
    // scattered intro start: far out, high or low, tumbling
    const from = home.clone().multiplyScalar(2.1).add(new Vector3(0, (i % 2 ? 2.4 : -1.6) + i * 0.2, 0));
    return { kind, a, home, from, g, body, icon, ctx, tex, spin: (i % 2 ? 1 : -1) * (1.6 + i * 0.2) };
  });

  // ---- beams: curved tubes from each tile to the core top ----
  const beamMat = keep(new MeshBasicMaterial({ color: pal.beam, transparent: true, opacity: 0.7, toneMapped: false }));
  const SEG = 48, RAD = 6;
  const beams = tiles.map((t) => {
    const start = new Vector3(t.home.x, t.home.y + TILE_H / 2 + 0.02, t.home.z);
    const end = new Vector3(Math.cos(t.a) * 0.4, CORE_TOP + 0.02, Math.sin(t.a) * 0.4);
    const mid = start.clone().lerp(end, 0.5).add(new Vector3(0, 1.05, 0));
    const curve = new QuadraticBezierCurve3(start, mid, end);
    const geo = keep(new TubeGeometry(curve, SEG, 0.022, RAD, false));
    const mat = beamMat.clone(); keep(mat);
    const mesh = new Mesh(geo, mat);
    geo.setDrawRange(0, 0);
    world.add(mesh);
    return { curve, geo, mat, mesh, total: geo.index!.count };
  });

  // ---- pulses: glowing beads travelling along the beams (two per beam, alternating direction) ----
  const glowTex = keep(glowTexture());
  const beadGeo = keep(new SphereGeometry(0.05, 12, 10));
  const beadMat = keep(new MeshBasicMaterial({ color: pal.pulse, transparent: true, toneMapped: false }));
  const pulses = beams.flatMap((b, i) => [0, 0.5].map((ph) => {
    const mat = beadMat.clone(); keep(mat);
    const bead = new Mesh(beadGeo, mat);
    const halo = new Sprite(keep(new SpriteMaterial({ map: glowTex, color: pal.glow, transparent: true, depthWrite: false, toneMapped: false })));
    halo.scale.setScalar(0.42);
    world.add(bead, halo);
    return { beam: b, tile: i, inbound: (i + (ph ? 1 : 0)) % 2 === 0, phase: ph + i * 0.13, speed: 0.28 + (i % 3) * 0.04, bead, halo };
  }));
  const coreHalo = new Sprite(keep(new SpriteMaterial({ map: glowTex, color: pal.glow, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })));
  coreHalo.position.set(0, CORE_TOP + 0.1, 0);
  coreHalo.scale.set(3.4, 1.6, 1);
  world.add(coreHalo);

  // ---- floor: soft shadow + sync wave ring ----
  const floorMat = keep(new ShadowMaterial({ opacity: pal.shadow }));
  const floor = new Mesh(keep(new PlaneGeometry(16, 16)), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = true;
  scene.add(floor);
  const waveMat = keep(new MeshBasicMaterial({ color: pal.ring, transparent: true, opacity: 0, side: DoubleSide, depthWrite: false, toneMapped: false }));
  const wave = new Mesh(keep(new RingGeometry(0.97, 1, 128)), waveMat);
  wave.rotation.x = -Math.PI / 2;
  wave.position.y = FLOOR_Y + 0.005;
  world.add(wave);

  const applyBlending = () => {
    const b = pal.additive ? AdditiveBlending : NormalBlending;
    pulses.forEach((p) => { (p.halo.material as SpriteMaterial).blending = b; p.halo.material.needsUpdate = true; });
    coreHalo.material.blending = b; coreHalo.material.needsUpdate = true;
  };
  applyBlending();

  const onTheme = () => {
    pal = PALETTE[document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'];
    coreMats.forEach((m, i) => m.color.set(pal.core[i]));
    seamMat.color.set(pal.seam); tileMat.color.set(pal.tile);
    beams.forEach((b) => b.mat.color.set(pal.beam));
    pulses.forEach((p) => { (p.bead.material as MeshBasicMaterial).color.set(pal.pulse); p.halo.material.color.set(pal.glow); });
    coreHalo.material.color.set(pal.glow); waveMat.color.set(pal.ring);
    hemi.groundColor.set(pal.ground); floorMat.opacity = pal.shadow;
    iconHot.fill(-1); // force icon redraw in the new colour
    applyBlending();
    draw(lastT);
  };
  document.addEventListener('themechange', onTheme);

  // ---- pointer: parallax + hover lift on tiles ----
  let px = 0, py = 0, tx = 0, ty = 0, lastT = 0;
  let hovered = -1;
  const ray = new Raycaster();
  const ndc = new Vector2();
  const bodies = tiles.map((t) => t.body);
  const onMove = (ev: PointerEvent) => {
    tx = (ev.clientX / innerWidth - 0.5) * 2;
    ty = (ev.clientY / innerHeight - 0.5) * 2;
    const r = canvas.getBoundingClientRect();
    const inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
    if (!inside) { hovered = -1; return; }
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(bodies, false)[0];
    hovered = hit ? bodies.indexOf(hit.object as Mesh) : -1;
  };
  if (fine && !reduce) addEventListener('pointermove', onMove, { passive: true });

  const lift = new Float32Array(tiles.length);
  const iconHot = new Float32Array(tiles.length).fill(-1);

  function draw(t: number) {
    lastT = t;
    px += (tx - px) * 0.05; py += (ty - py) * 0.05;
    world.rotation.y = -0.35 + (reduce ? 0 : t * 0.05) + px * 0.16;
    world.rotation.x = py * 0.04;

    // core assembles: slabs drop in from above, bottom first
    coreSlabs.forEach((s, i) => {
      const k = outBack((t - 0.1 - i * 0.22) / 0.8);
      s.position.y = slabY(i) + (1 - k) * (3.2 + i * 0.6);
      s.scale.setScalar(0.6 + 0.4 * smooth((t - 0.1 - i * 0.22) / 0.5));
      s.visible = t > 0.1 + i * 0.22;
    });
    seams.forEach((m, i) => { m.position.y = (slabY(i) + slabY(i + 1)) / 2; });
    core.rotation.y = t * 0.12;

    // tiles fly in, then float; a passing sync wave makes each one hop
    const wt = t > INTRO ? (t - INTRO) % WAVE_EVERY : -1;
    const waveR = wt >= 0 ? 0.9 + wt * 2.2 : 0;
    tiles.forEach((tl, i) => {
      const k = outBack((t - 0.55 - i * 0.1) / 1.05);
      const kp = outCubic((t - 0.55 - i * 0.1) / 1.05);
      lift[i] += ((hovered === i ? 1 : 0) - lift[i]) * 0.12;
      const bob = Math.sin(t * 1.3 + i * 1.1) * 0.05;
      const hop = wt >= 0 ? Math.exp(-(((waveR - R) / 0.55) ** 2)) * 0.16 : 0;
      tl.g.position.lerpVectors(tl.from, tl.home, k);
      tl.g.position.y += (bob + hop) * kp + lift[i] * 0.22;
      tl.g.rotation.set((1 - kp) * tl.spin * 0.6, (1 - kp) * tl.spin + lift[i] * 0.12, (1 - kp) * tl.spin * 0.4);
      tl.g.scale.setScalar(0.5 + 0.5 * kp);
      tl.icon.rotation.z = -(world.rotation.y + tl.g.rotation.y); // keep the pictogram upright on screen
      const q = Math.max(lift[i], hop / 0.16) > 0.5 ? 1 : 0; // highlighted while hovered or hopping
      if (q !== iconHot[i]) {
        iconHot[i] = q;
        const c = q > 0.5 ? pal.iconHot : pal.icon;
        drawIcon(tl.ctx, tl.kind, c);
        tl.tex.needsUpdate = true;
      }
    });

    // beams draw themselves from the tile towards the core
    beams.forEach((b, i) => {
      const k = smooth((t - 1.45 - i * 0.08) / 0.7);
      const per = RAD * 6;
      b.geo.setDrawRange(0, Math.floor((b.total / per) * k) * per);
      b.mat.opacity = (0.55 + lift[i] * 0.4) * (pal.additive ? 1 : 0.9);
    });

    // pulses + core flash when a bead touches the core
    const on = smooth((t - 2.2) / 0.6);
    let flash = 0;
    pulses.forEach((p) => {
      const u0 = (t * (p.speed + lift[p.tile] * 0.25) + p.phase) % 1;
      const u = p.inbound ? u0 : 1 - u0;
      p.beam.curve.getPointAt(u, p.bead.position);
      p.halo.position.copy(p.bead.position);
      const fade = Math.sin(Math.PI * u0) ** 0.6 * on;
      (p.bead.material as MeshBasicMaterial).opacity = fade;
      p.halo.material.opacity = fade * (pal.additive ? 0.9 : 0.55);
      p.halo.scale.setScalar(0.34 + lift[p.tile] * 0.16);
      const d = 1 - u; // distance to the core end of the beam
      flash = Math.max(flash, Math.exp(-(d * d) / 0.004) * on);
    });
    const wavePulse = wt >= 0 ? Math.exp(-((wt / 0.35) ** 2)) : 0;
    seamMat.opacity = Math.min(1, smooth((t - 1.2) / 0.8) * (0.45 + flash * 0.4 + wavePulse * 0.5));
    coreHalo.material.opacity = (flash * 0.35 + wavePulse * 0.6) * on * (pal.additive ? 1 : 0.6);

    // sync wave across the floor
    if (wt >= 0) {
      wave.scale.setScalar(waveR);
      waveMat.opacity = 0.5 * (1 - smooth(wt / 2.4)) * smooth(wt / 0.15);
    } else waveMat.opacity = 0;

    renderer.render(scene, camera);
  }

  function resize() {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    const dist = camera.aspect < 1 ? 15 : camera.aspect < 1.25 ? 13 : 12.8;
    camera.position.set(0, dist * 0.55, dist);
    camera.lookAt(0, -0.35, 0);
    camera.updateProjectionMatrix();
    draw(lastT);
  }

  el.appendChild(canvas);
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  lastT = reduce ? INTRO + WAVE_EVERY - 0.5 : 0; // static frame: assembled, between sync waves
  resize();
  requestAnimationFrame(() => el.classList.add('is-ready'));

  let visible = true, raf = 0, t0 = performance.now(), paused = 0, pausedAt = 0;
  const loop = (now: number) => {
    raf = 0;
    if (!visible || document.hidden) return;
    draw((now - t0 - paused) / 1000);
    raf = requestAnimationFrame(loop);
  };
  const start = () => {
    if (reduce || raf) return;
    if (pausedAt) { paused += performance.now() - pausedAt; pausedAt = 0; }
    raf = requestAnimationFrame(loop);
  };
  const stop = () => { if (!pausedAt) pausedAt = performance.now(); };
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; visible ? start() : stop(); }, { threshold: 0.05 });
  io.observe(el);
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVis);
  t0 = performance.now();
  start();

  const dispose = () => {
    cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
    removeEventListener('pointermove', onMove);
    document.removeEventListener('visibilitychange', onVis);
    document.removeEventListener('themechange', onTheme);
    disposables.forEach((d) => d.dispose());
    pmrem.dispose(); renderer.dispose();
  };
  addEventListener('pagehide', dispose, { once: true });
  return dispose;
}
