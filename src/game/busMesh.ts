import * as THREE from "three";
import type { BusSpec } from "./bus";

/**
 * Procedural bus mesh — drivable Phase-1 vehicle with working headlights,
 * brake/indicator lights, wheels, and a driver cockpit for the dash camera.
 * (Dealership buses with unique exteriors arrive in Phase 2.)
 */
export function createBusMesh(spec: BusSpec): {
  root: THREE.Group;
  headlights: THREE.SpotLight[];
  brakeLights: THREE.Mesh[];
  steeringWheel: THREE.Mesh;
  dashLight: THREE.PointLight;
} {
  const root = new THREE.Group();
  const L = spec.lengthM;
  const W = spec.widthM;
  const H = spec.heightM;
  const wheelR = spec.wheelRadius;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xd8a018,
    metalness: 0.35,
    roughness: 0.45,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x9fc4d8,
    metalness: 0.2,
    roughness: 0.15,
    transparent: true,
    opacity: 0.55,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.8 });

  // main body + roof
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.72, L), bodyMat);
  body.position.y = wheelR + 0.25 + (H * 0.72) / 2;
  body.castShadow = true;
  root.add(body);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(W * 0.98, 0.16, L * 0.96), darkMat);
  roof.position.y = body.position.y + (H * 0.72) / 2 + 0.08;
  root.add(roof);

  // window band (front, back, sides)
  const winH = 0.85;
  const winY = body.position.y + H * 0.18;
  for (const [w, h, d, x, y, z] of [
    [W * 0.92, winH, 0.06, 0, winY, L / 2 + 0.01],
    [W * 0.92, winH, 0.06, 0, winY, -L / 2 - 0.01],
    [0.06, winH, L * 0.86, W / 2 + 0.01, winY, 0],
    [0.06, winH, L * 0.86, -W / 2 - 0.01, winY, 0],
  ] as const) {
    const win = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      glassMat,
    );
    win.position.set(x, y, z);
    root.add(win);
  }

  // front fascia
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(W, 0.5, 0.25), darkMat);
  fascia.position.set(0, wheelR + 0.35, L / 2 - 0.12);
  root.add(fascia);

  // headlights + real spotlights
  const headlights: THREE.SpotLight[] = [];
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.22, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xfff6d0 }),
    );
    lamp.position.set((side * W) / 2 - side * 0.35, wheelR + 0.5, L / 2 + 0.02);
    root.add(lamp);

    const spot = new THREE.SpotLight(0xfff2cc, 0, 55, 0.42, 0.5, 1.2);
    spot.position.set(lamp.position.x, lamp.position.y, lamp.position.z + 0.2);
    const target = new THREE.Object3D();
    target.position.set(lamp.position.x * 0.6, 0, L / 2 + 22);
    root.add(target);
    spot.target = target;
    root.add(spot);
    headlights.push(spot);
  }

  // taillights
  const brakeLights: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.18, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x5a0d0d }),
    );
    tail.position.set((side * W) / 2 - side * 0.3, wheelR + 0.5, -L / 2 - 0.03);
    root.add(tail);
    brakeLights.push(tail);
  }

  // wheels (6) with hubs
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.34, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x9aa1ab, metalness: 0.6 });
  const wheelDefs: [number, number][] = [
    [-(W / 2), L / 2 - 1.2],
    [W / 2, L / 2 - 1.2],
    [-(W / 2), -L * 0.22],
    [W / 2, -L * 0.22],
    [-(W / 2), -L / 2 + 1.1],
    [W / 2, -L / 2 + 1.1],
  ];
  for (const [wx, wz] of wheelDefs) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(wx, wheelR, wz);
    w.castShadow = true;
    root.add(w);
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(wheelR * 0.45, wheelR * 0.45, 0.36, 10),
      hubMat,
    );
    hub.rotation.z = Math.PI / 2;
    hub.position.set(wx, wheelR, wz);
    root.add(hub);
  }

  // ---- interior: driver cockpit ----
  const interior = new THREE.Group();
  interior.position.set(-W * 0.28, wheelR + 0.55, L / 2 - 1.5);

  const dash = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.28, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x22252b, roughness: 0.7 }),
  );
  interior.add(dash);

  const steeringWheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.26, 0.035, 8, 20),
    darkMat,
  );
  steeringWheel.position.set(-0.15, 0.35, 0.15);
  steeringWheel.rotation.x = -0.7;
  interior.add(steeringWheel);

  const dashLight = new THREE.PointLight(0x66ccff, 0.6, 3);
  dashLight.position.set(0, 0.6, -0.2);
  interior.add(dashLight);

  root.add(interior);

  return { root, headlights, brakeLights, steeringWheel, dashLight };
}
