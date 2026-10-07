// Hero 3D: five matte rounded slabs (modules) breathe apart, then snap into one unified block.
// Loaded lazily (dynamic import) after first paint. No text in WebGL.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, MeshStandardMaterial, MeshBasicMaterial, DirectionalLight,
  HemisphereLight, PlaneGeometry, ShadowMaterial, PMREMGenerator, CylinderGeometry, SRGBColorSpace,
  ACESFilmicToneMapping, PCFShadowMap, MathUtils,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const COLORS = ['#c3d8d0', '#eef5f2', '#b4e0d2', '#3fb59a', '#0e6b5c']; // bottom to top
const N = COLORS.length;
const H = 0.34, GAP = 0.025, SPREAD = 0.5;
const OFFX = [-0.4, 0.32, -0.25, 0.36, 0];
const OFFR = [0.32, -0.22, 0.18, -0.3, 0.12];
const ease = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));

export function init(el: HTMLElement): () => void {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = matchMedia('(max-width: 959px)').matches;
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

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new PerspectiveCamera(26, 1, 0.1, 60);
  scene.add(new HemisphereLight(0xffffff, 0xcfeee5, 0.7));
  const sun = new DirectionalLight(0xffffff, 2.1);
  sun.position.set(2.5, 8, 4);
  sun.castShadow = !small;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 24 });
  sun.shadow.radius = 8;
  scene.add(sun);

  const group = new Group();
  scene.add(group);
  const geo = new RoundedBoxGeometry(2.6, H, 2.6, 4, 0.09);
  const slabs: Mesh[] = COLORS.map((c) => {
    const m = new Mesh(geo, new MeshStandardMaterial({ color: c, roughness: 0.42, metalness: 0.04, envMapIntensity: 0.9 }));
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    return m;
  });
  const spineMat = new MeshBasicMaterial({ color: '#3fb59a', transparent: true, opacity: 0 });
  const spine = new Mesh(new CylinderGeometry(0.022, 0.022, 1, 8), spineMat);
  group.add(spine);

  const floor = new Mesh(new PlaneGeometry(14, 14), new ShadowMaterial({ opacity: 0.08 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.3;
  floor.receiveShadow = true;
  scene.add(floor);

  function pose(e: number) {
    const step = H + GAP + e * SPREAD;
    const mid = ((N - 1) * step) / 2;
    slabs.forEach((m, i) => {
      m.position.set(OFFX[i] * e, i * step - mid, OFFX[(i + 2) % N] * 0.35 * e);
      m.rotation.y = OFFR[i] * e;
    });
    spine.scale.y = Math.max(0.001, (N - 1) * step + 0.5);
    spineMat.opacity = Math.min(1, e * 1.4) * 0.85;
  }
  // time -> explode amount: assemble, hold united, explode again (10s loop)
  const explode = (t: number) => {
    const p = (t % 10) / 10;
    if (p < 0.3) return 1 - ease(p / 0.3);
    if (p < 0.62) return 0;
    if (p < 0.78) return ease((p - 0.62) / 0.16);
    return 1;
  };

  let w = 0, h = 0;
  function resize() {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    w = r.width; h = r.height;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const dist = camera.aspect < 1 ? 14 : camera.aspect < 1.25 ? 12 : 12.2;
    camera.position.set(0, dist * 0.36, dist);
    camera.lookAt(0, -0.2, 0);
    camera.updateProjectionMatrix();
    draw(lastT);
  }

  let px = 0, py = 0, tx = 0, ty = 0, lastT = 0;
  const fine = matchMedia('(pointer: fine)').matches;
  const onMove = (ev: PointerEvent) => {
    tx = (ev.clientX / innerWidth - 0.5) * 2;
    ty = (ev.clientY / innerHeight - 0.5) * 2;
  };
  if (fine && !reduce) addEventListener('pointermove', onMove, { passive: true });

  function draw(t: number) {
    lastT = t;
    px += (tx - px) * 0.05; py += (ty - py) * 0.05;
    pose(reduce ? 0 : explode(t)); // keep
    group.rotation.y = -0.62 + (reduce ? 0 : t * 0.1) + px * 0.18;
    group.rotation.x = py * 0.05;
    renderer.render(scene, camera);
  }

  el.appendChild(canvas);
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();
  requestAnimationFrame(() => el.classList.add('is-ready'));

  let visible = true, raf = 0, t0 = performance.now(), paused = 0, pausedAt = 0;
  const loop = (now: number) => {
    raf = 0;
    if (!visible || document.hidden) return;
    draw((now - t0 - paused) / 1000 + 2.2);
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
  start();

  const dispose = () => {
    cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
    removeEventListener('pointermove', onMove);
    document.removeEventListener('visibilitychange', onVis);
    geo.dispose(); slabs.forEach((m) => (m.material as MeshStandardMaterial).dispose());
    pmrem.dispose(); renderer.dispose();
  };
  addEventListener('pagehide', dispose, { once: true });
  return dispose;
}
