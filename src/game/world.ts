import * as THREE from "three";

/**
 * Procedural Phase-1 world: a real ring highway circuit with lane markings,
 * street lamps with night glow, guardrails, a city skyline, village sheds,
 * trees on the infield, and working day/night lighting.
 */

export const ROAD_CENTER_RADIUS = 250; // m — centerline of the ring highway
export const ROAD_HALF_WIDTH = 9; // 18 m carriageway (2 lanes each direction)
export const GRASS_INNER = ROAD_CENTER_RADIUS - ROAD_HALF_WIDTH - 6;
export const GRASS_OUTER = ROAD_CENTER_RADIUS + ROAD_HALF_WIDTH + 6;

/** Bus stop support: shelter at predefined ring angles (functional in Phase 3). */
export const STOP_COUNT = 8;
export function stopAngle(i: number): number {
  return (i / STOP_COUNT) * Math.PI * 2 + 0.3;
}

export interface World {
  group: THREE.Group;
  lampHeads: THREE.InstancedMesh;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sky: THREE.Mesh;
  fuelPumpAngles: number[];
}

// Deterministic LCG so the world is identical every session.
let seed = 1;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

function makeAsphaltTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#2b2e33";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 20 + Math.random() * 30;
    ctx.fillStyle = `rgb(${v},${v},${v + 3})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Place an instance at position+rotation+scale. */
const _q = new THREE.Quaternion();
function compose(
  m: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  ry: number,
  sx: number,
  sy: number,
  sz: number,
) {
  _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
  m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
}

export function buildWorld(scene: THREE.Scene): World {
  const group = new THREE.Group();
  scene.add(group);
  const m = new THREE.Matrix4();

  // ---- ground ----
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(1600, 64),
    new THREE.MeshStandardMaterial({ color: 0x3d4a2c, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  group.add(ground);

  // ---- ring road ----
  const asphalt = makeAsphaltTexture();
  asphalt.repeat.set(160, 1);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(
      ROAD_CENTER_RADIUS - ROAD_HALF_WIDTH,
      ROAD_CENTER_RADIUS + ROAD_HALF_WIDTH,
      220,
      1,
    ),
    new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.receiveShadow = true;
  group.add(ring);

  // shoulder edge lines
  for (const r of [
    ROAD_CENTER_RADIUS - ROAD_HALF_WIDTH + 0.4,
    ROAD_CENTER_RADIUS + ROAD_HALF_WIDTH - 0.4,
  ]) {
    const strip = new THREE.Mesh(
      new THREE.RingGeometry(r - 0.08, r + 0.08, 220),
      new THREE.MeshBasicMaterial({ color: 0xf5e642 }),
    );
    strip.rotation.x = -Math.PI / 2;
    strip.position.y = 0.02;
    group.add(strip);
  }

  // dashed centre divider
  const dashes = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.25, 3),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    160,
  );
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2;
    compose(
      m,
      Math.sin(a) * ROAD_CENTER_RADIUS,
      0.02,
      Math.cos(a) * ROAD_CENTER_RADIUS,
      -a,
      1,
      1,
      1,
    );
    m.multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    dashes.setMatrixAt(i, m);
  }
  group.add(dashes);

  // guard rails
  const railMat = new THREE.MeshStandardMaterial({
    color: 0xb9c0c9,
    metalness: 0.7,
    roughness: 0.4,
  });
  for (const rr of [GRASS_INNER + 1, GRASS_OUTER - 1]) {
    const rail = new THREE.Mesh(
      new THREE.TorusGeometry(rr, 0.09, 6, 180),
      railMat,
    );
    rail.rotation.x = Math.PI / 2;
    rail.position.y = 0.75;
    group.add(rail);
  }

  // ---- street lamps (heads glow at night via material emissive) ----
  const lamps: THREE.Vector3[] = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const r =
      ROAD_CENTER_RADIUS + (i % 2 === 0 ? ROAD_HALF_WIDTH + 3 : -(ROAD_HALF_WIDTH + 3));
    lamps.push(new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r));
  }
  const lampPosts = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.09, 0.12, 7, 6),
    new THREE.MeshStandardMaterial({ color: 0x666e77 }),
    lamps.length,
  );
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xfff2c2 });
  const lampHeads = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.35, 8, 6),
    lampHeadMat,
    lamps.length,
  );
  lamps.forEach((p, i) => {
    compose(m, p.x, 3.5, p.z, 0, 1, 1, 1);
    lampPosts.setMatrixAt(i, m);
    compose(m, p.x, 7.2, p.z, 0, 1, 1, 1);
    lampHeads.setMatrixAt(i, m);
  });
  group.add(lampPosts);
  group.add(lampHeads);

  // ---- buildings: city blocks outside the ring ----
  const palette = [0x8c96a3, 0xa3958c, 0x6f7f92, 0x9aa08c, 0x8c7f9e];
  const city = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ roughness: 0.9 }),
    140,
  );
  const color = new THREE.Color();
  for (let i = 0; i < 140; i++) {
    const a = rand() * Math.PI * 2;
    const r = GRASS_OUTER + 18 + rand() * 160;
    const w = 6 + rand() * 14;
    const d = 6 + rand() * 12;
    const h = 8 + rand() * 42;
    compose(
      m,
      Math.sin(a) * r,
      h / 2,
      Math.cos(a) * r,
      rand() * Math.PI,
      w,
      h,
      d,
    );
    city.setMatrixAt(i, m);
    city.setColorAt(i, color.setHex(palette[Math.floor(rand() * palette.length)]));
  }
  city.castShadow = city.receiveShadow = true;
  group.add(city);

  // village sheds inside the ring
  const sheds = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xb39b7a, roughness: 1 }),
    60,
  );
  for (let i = 0; i < 60; i++) {
    const a = rand() * Math.PI * 2;
    const r = GRASS_INNER - 40 - rand() * 110;
    const h = 3 + rand() * 3;
    compose(
      m,
      Math.sin(a) * r,
      h / 2,
      Math.cos(a) * r,
      rand() * Math.PI,
      5 + rand() * 6,
      h,
      4 + rand() * 6,
    );
    sheds.setMatrixAt(i, m);
  }
  sheds.castShadow = sheds.receiveShadow = true;
  group.add(sheds);

  // ---- trees ----
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.18, 0.28, 2.4, 5),
    new THREE.MeshStandardMaterial({ color: 0x5b4230 }),
    220,
  );
  const crowns = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1.8, 4.4, 7),
    new THREE.MeshStandardMaterial({ color: 0x2f5b2d }),
    220,
  );
  for (let i = 0; i < 220; i++) {
    const a = rand() * Math.PI * 2;
    let r: number;
    const pick = rand();
    if (pick < 0.35) r = GRASS_OUTER + 2 + rand() * 10;
    else if (pick < 0.7) r = GRASS_INNER - 2 - rand() * 10;
    else r = 40 + rand() * Math.max(1, GRASS_INNER - 60);
    const s = 0.8 + rand() * 0.7;
    compose(m, Math.sin(a) * r, 1.2 * s, Math.cos(a) * r, 0, s, s, s);
    trunks.setMatrixAt(i, m);
    compose(m, Math.sin(a) * r, (2.4 + 2.2) * s, Math.cos(a) * r, 0, s, s, s);
    crowns.setMatrixAt(i, m);
  }
  trunks.castShadow = crowns.castShadow = true;
  group.add(trunks);
  group.add(crowns);

  // ---- bus stops: shelter + bench + sign at every stop angle ----
  for (let i = 0; i < STOP_COUNT; i++) {
    const a = stopAngle(i);
    const sr = ROAD_CENTER_RADIUS + ROAD_HALF_WIDTH + 5;
    const stop = new THREE.Group();
    // shelter posts
    for (const off of [-1.4, 1.4]) {
      const sp = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6),
        new THREE.MeshStandardMaterial({ color: 0x37507a }),
      );
      sp.position.set(off, 1.3, 0);
      stop.add(sp);
    }
    // roof
    const sroof = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 0.09, 1.7),
      new THREE.MeshStandardMaterial({ color: 0x2a5f8f }),
    );
    sroof.position.set(0, 2.65, -0.1);
    stop.add(sroof);
    // back panel
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 1.6, 0.07),
      new THREE.MeshStandardMaterial({ color: 0xb4bcc4, roughness: 0.6 }),
    );
    back.position.set(0, 1.8, -0.85);
    stop.add(back);
    // bench
    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(3.0, 0.08, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x7a4b2a }),
    );
    bench.position.set(0, 0.55, -0.6);
    stop.add(bench);
    // stop sign
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 3, 6),
      new THREE.MeshStandardMaterial({ color: 0x37507a }),
    );
    pole.position.set(1.8, 1.5, 0.4);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.9, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x146b3a }),
    );
    board.position.set(1.8, 2.6, 0.4);
    stop.add(pole, board);

    stop.position.set(Math.sin(a) * sr, 0, Math.cos(a) * sr);
    stop.lookAt(0, 0, 0);
    stop.position.y = 0;
    group.add(stop);
  }

  // ---- fuel stations: canopy + pumps + I-can-refuel signage at 2 angles ----
  const fuelPumpAngles = [1.5, 4.0];
  for (const fa of fuelPumpAngles) {
    const fr = ROAD_CENTER_RADIUS - ROAD_HALF_WIDTH - 4; // inner shoulder, service side
    const station = new THREE.Group();
    // canopy
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(9, 0.35, 6),
      new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.6 }),
    );
    canopy.position.y = 4.6;
    station.add(canopy);
    for (const off of [-3.5, 3.5]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 4.4, 8),
        new THREE.MeshStandardMaterial({ color: 0xb6bcc2, metalness: 0.5 }),
      );
      post.position.set(off, 2.2, 0);
      station.add(post);
    }
    // pump island
    const island = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.18, 5.5),
      new THREE.MeshStandardMaterial({ color: 0x585d63 }),
    );
    island.position.set(0, 0.09, 0);
    station.add(island);
    for (const off of [-1.4, 1.4]) {
      const pump = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 1.3, 0.45),
        new THREE.MeshStandardMaterial({ color: 0xc23b22, roughness: 0.5 }),
      );
      pump.position.set(0, 0.85, off);
      station.add(pump);
      const face = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.4, 0.03),
        new THREE.MeshBasicMaterial({ color: 0x1b1d20 }),
      );
      face.position.set(0.36, 1.0, off);
      station.add(face);
    }
    // sign totem: "DIESEL ₹92.14"
    const signTex = makeSignTexture("FUEL · ₹92/L");
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 0.9),
      new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide }),
    );
    sign.position.set(4.6, 5.6, 0);
    const signPost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 5.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x44484d }),
    );
    signPost.position.set(4.6, 2.6, 0);
    station.add(sign, signPost);

    station.position.set(Math.sin(fa) * fr, 0, Math.cos(fa) * fr);
    station.lookAt(0, 0, 0);
    station.position.y = 0;
    group.add(station);
  }

  // ---- sky + lighting ----
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1400, 32, 16),
    new THREE.MeshBasicMaterial({
      color: 0x87b7e8,
      side: THREE.BackSide,
      fog: false,
    }),
  );
  group.add(sky);

  const hemi = new THREE.HemisphereLight(0xbdd8ff, 0x4a5538, 0.9);
  group.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 900;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -320;
  sun.shadow.camera.right = sun.shadow.camera.top = 320;
  group.add(sun);
  group.add(sun.target);

  return { group, lampHeads, sun, hemi, sky, fuelPumpAngles };
}

function makeSignTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 192;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#0e2338";
  ctx.fillRect(0, 0, 512, 192);
  ctx.strokeStyle = "#e8b62e";
  ctx.lineWidth = 10;
  ctx.strokeRect(6, 6, 500, 180);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 64px 'Segoe UI', Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 96);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}
