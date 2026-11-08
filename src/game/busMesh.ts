"use client";

import * as THREE from "three";
import type { BusSpec } from "./bus";

/**
 * Advanced bus visual system. Everything that animates is exposed on
 * BusVisual and driven by GameEngine each frame:
 *  - wheel spin + front-wheel steering
 *  - bifold passenger doors (open/close with speed lock)
 *  - wipers (sweep when on)
 *  - brake / reverse / indicator / headlight states (real emissive + spotlights)
 *  - body roll & pitch from lateral/longitudinal acceleration (suspension feel)
 *  - interior: driver cockpit, 2+2 instanced seats, handrail poles, night lights
 *  - Indian number plates + LED destination board (canvas textures)
 */

function makeTextTexture(text: string, opts: { bg: string; fg: string; w: number; h: number; font: string }): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = opts.w;
  c.height = opts.h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = opts.bg;
  ctx.fillRect(0, 0, opts.w, opts.h);
  ctx.fillStyle = opts.fg;
  ctx.font = opts.font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, opts.w / 2, opts.h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

function makeNumberPlate(num: string): THREE.Mesh {
  const tex = makeTextTexture(num, {
    bg: "#e8e4da",
    fg: "#111111",
    w: 256,
    h: 92,
    font: "bold 64px 'Arial Black', Arial",
  });
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.2),
    new THREE.MeshBasicMaterial({ map: tex }),
  );
  return m;
}

export class BusVisual {
  readonly root = new THREE.Group();

  private wheels: THREE.Mesh[] = [];
  private steerPivots: THREE.Group[] = [];
  private steerWheel!: THREE.Mesh;
  private bodyGroup = new THREE.Group(); // roll/pitch applied here
  private headSpots: THREE.SpotLight[] = [];
  private brakeMats: THREE.MeshBasicMaterial[] = [];
  private reverseMats: THREE.MeshBasicMaterial[] = [];
  private indicatorMats: THREE.MeshBasicMaterial[] = [];
  private doorPivots: THREE.Group[] = [];
  private wiperArms: THREE.Mesh[] = [];
  private interiorLights: THREE.PointLight[] = [];

  // door & wiper animation state
  doorAnim = 0; // 0 closed .. 1 open
  wiperPhase = 0;

  constructor(readonly spec: BusSpec) {
    const L = spec.lengthM;
    const W = spec.widthM;
    const H = spec.heightM;
    const wheelR = spec.wheelRadius;
    const floorY = wheelR + 0.12;
    const bodyH = H * 0.74;
    const bodyY = floorY + bodyH / 2 - 0.18;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xe8a80c,
      metalness: 0.45,
      roughness: 0.32,
    });
    const lowerMat = new THREE.MeshStandardMaterial({
      color: 0xf2ede1,
      metalness: 0.3,
      roughness: 0.5,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x7fa7bd,
      metalness: 0.4,
      roughness: 0.08,
      transparent: true,
      opacity: 0.5,
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.75 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xc3c9d1, metalness: 0.9, roughness: 0.25 });
    const styMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.9 });

    this.root.add(this.bodyGroup);

    // ---- main body: lower skirt (cream) + upper body (amber) + roof ----
    const lower = new THREE.Mesh(new THREE.BoxGeometry(W, 0.9, L), lowerMat);
    lower.position.y = floorY + 0.45 - 0.1;
    lower.castShadow = true;
    this.bodyGroup.add(lower);

    const body = new THREE.Mesh(new THREE.BoxGeometry(W, bodyH - 0.9, L), bodyMat);
    body.position.y = lower.position.y + 0.45 + (bodyH - 0.9) / 2;
    body.castShadow = true;
    this.bodyGroup.add(body);

    // livery stripe
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(W + 0.02, 0.22, L * 0.99),
      new THREE.MeshStandardMaterial({ color: 0x1d4f8b, roughness: 0.5 }),
    );
    stripe.position.set(0, floorY + 0.95, 0);
    this.bodyGroup.add(stripe);

    // roof + crown + roof-mounted AC pod
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W * 0.98, 0.14, L * 0.98), darkMat);
    roof.position.y = bodyY + bodyH / 2 + 0.07;
    this.bodyGroup.add(roof);
    const acPod = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.7, 0.32, L * 0.35),
      lowerMat,
    );
    acPod.position.set(0, roof.position.y + 0.2, -L * 0.18);
    acPod.castShadow = true;
    this.bodyGroup.add(acPod);

    // ---- glazing: windshield (slanted), rear, side band with pillars ----
    const winH = 0.95;
    const winY = bodyY + bodyH * 0.16;
    const windshield = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.94, winH, 0.07),
      glassMat,
    );
    windshield.position.set(0, winY, L / 2 - 0.18);
    windshield.rotation.x = 0.09;
    this.bodyGroup.add(windshield);

    const rearWin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, winH * 0.8, 0.07), glassMat);
    rearWin.position.set(0, winY + 0.1, -L / 2 + 0.02);
    this.bodyGroup.add(rearWin);

    // side windows: segmented panes + pillars (more real than one strip)
    const paneCount = 6;
    const span = L * 0.8;
    const paneLen = span / paneCount - 0.18;
    for (const side of [-1, 1]) {
      for (let i = 0; i < paneCount; i++) {
        const z = L / 2 - L * 0.1 - (i + 0.5) * (span / paneCount);
        const pane = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, winH, paneLen),
          glassMat,
        );
        pane.position.set(side * (W / 2 + 0.01), winY, z);
        this.bodyGroup.add(pane);
      }
      // side pillar cover strip
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, bodyH * 0.55, span + 0.3),
        bodyMat,
      );
      pillar.position.set(side * (W / 2 + 0.005), bodyY + 0.1, 0);
      this.bodyGroup.add(pillar);
    }

    // ---- destination board (LED) ----
    const destTex = makeTextTexture("500 A · MG ROAD", {
      bg: "#050608",
      fg: "#ffaa2a",
      w: 512,
      h: 96,
      font: "bold 52px 'Consolas', monospace",
    });
    const dest = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 0.6, 0.24),
      new THREE.MeshBasicMaterial({ map: destTex }),
    );
    dest.position.set(0, winY + winH / 2 + 0.22, L / 2 - 0.16);
    dest.rotation.x = 0.09;
    this.bodyGroup.add(dest);

    // ---- front fascia: grille, bumper, plate, markers ----
    const grille = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.5, 0.35, 0.1),
      styMat,
    );
    grille.position.set(0, floorY + 0.75, L / 2 + 0.01);
    this.bodyGroup.add(grille);
    for (let i = -3; i <= 3; i++) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(W * 0.42, 0.05, 0.03),
        darkMat,
      );
      bar.position.set(0, floorY + 0.75 + i * 0.06, L / 2 + 0.07);
      this.bodyGroup.add(bar);
    }
    const bumper = new THREE.Mesh(
      new THREE.BoxGeometry(W * 1.0, 0.3, 0.26),
      styMat,
    );
    bumper.position.set(0, floorY + 0.05, L / 2 + 0.04);
    this.bodyGroup.add(bumper);

    const frontPlate = makeNumberPlate("KA·01·IR·2026");
    frontPlate.position.set(0, floorY + 0.45, L / 2 + 0.18);
    this.bodyGroup.add(frontPlate);
    const rearPlate = makeNumberPlate("KA·01·IR·2026");
    rearPlate.position.set(0, floorY + 0.45, -L / 2 - 0.07);
    rearPlate.rotation.y = Math.PI;
    this.bodyGroup.add(rearPlate);

    // ---- headlights (emissive lens + real spotlight beams) ----
    for (const side of [-1, 1]) {
      const lens = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.24, 0.1),
        new THREE.MeshBasicMaterial({ color: 0xd9d0b8 }),
      );
      lens.position.set((side * W) / 2 - side * 0.32, floorY + 0.65, L / 2 + 0.05);
      this.bodyGroup.add(lens);

      const spot = new THREE.SpotLight(0xfff2cc, 0, 60, 0.44, 0.45, 1.1);
      spot.position.copy(lens.position);
      spot.position.z += 0.15;
      const target = new THREE.Object3D();
      target.position.set(lens.position.x * 0.55, 0.2, L / 2 + 26);
      this.bodyGroup.add(target);
      spot.target = target;
      this.bodyGroup.add(spot);
      this.headSpots.push(spot);

      // indicator lens (amber when blinking)
      const ind = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.14, 0.08),
        new THREE.MeshBasicMaterial({ color: 0x644c08 }),
      );
      ind.position.set((side * W) / 2, floorY + 0.95, L / 2 + 0.06);
      this.bodyGroup.add(ind);
      this.indicatorMats.push(ind.material as THREE.MeshBasicMaterial);
    }

    // rear cluster: brake + reverse + indicator
    for (const side of [-1, 1]) {
      const brake = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 0.2, 0.08),
        new THREE.MeshBasicMaterial({ color: 0x4a0b0b }),
      );
      brake.position.set((side * W) / 2 - side * 0.3, floorY + 0.7, -L / 2 - 0.04);
      this.bodyGroup.add(brake);
      this.brakeMats.push(brake.material as THREE.MeshBasicMaterial);

      const rev = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.14, 0.08),
        new THREE.MeshBasicMaterial({ color: 0x3a3f45 }),
      );
      rev.position.set((side * W) / 2 - side * 0.45, floorY + 0.7, -L / 2 - 0.04);
      this.bodyGroup.add(rev);
      this.reverseMats.push(rev.material as THREE.MeshBasicMaterial);

      const ind = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.14, 0.08),
        new THREE.MeshBasicMaterial({ color: 0x644c08 }),
      );
      ind.position.set((side * W) / 2, floorY + 0.95, -L / 2 - 0.06);
      this.bodyGroup.add(ind);
      this.indicatorMats.push(ind.material as THREE.MeshBasicMaterial);
    }

    // ---- mirrors ----
    for (const side of [-1, 1]) {
      const stalk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.35, 5),
        chromeMat,
      );
      stalk.position.set((side * W) / 2, winY + 0.45, L / 2 - 0.25);
      stalk.rotation.z = side * 0.5;
      this.bodyGroup.add(stalk);
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.3, 0.06),
        darkMat,
      );
      head.position.set((side * (W / 2 + 0.28)), winY + 0.55, L / 2 - 0.25);
      this.bodyGroup.add(head);
      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(0.18, 0.26),
        new THREE.MeshStandardMaterial({ color: 0x9fb4c4, metalness: 0.95, roughness: 0.1 }),
      );
      glass.position.set(head.position.x + side * 0.03, head.position.y, L / 2 - 0.25);
      glass.rotation.y = side * -0.35;
      this.bodyGroup.add(glass);
    }

    // ---- wheels: steer pivots on front axle ----
    const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.4, 18);
    wheelGeo.rotateZ(Math.PI / 2);
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x121417, roughness: 0.95 });
    const rimGeo = new THREE.CylinderGeometry(wheelR * 0.42, wheelR * 0.42, 0.42, 10);
    rimGeo.rotateZ(Math.PI / 2);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x8f97a3, metalness: 0.85, roughness: 0.3 });

    const axleZ: [number, boolean][] = [
      [L / 2 - 1.15, true],
      [-L * 0.18, false],
      [-L / 2 + 1.05, false],
    ];
    for (const [z, steerable] of axleZ) {
      for (const side of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set((side * W) / 2 - side * 0.05, wheelR, z);
        this.bodyGroup.add(pivot);
        const tyre = new THREE.Mesh(wheelGeo, tyreMat);
        tyre.castShadow = true;
        pivot.add(tyre);
        pivot.add(new THREE.Mesh(rimGeo, rimMat));
        this.wheels.push(tyre);
        if (steerable) {
          this.steerPivots.push(pivot);
        } else {
          this.wheels.push(tyre); // rear duals spin with the same mesh
        }
      }
    }

    // ---- luggage bay doors (upper-deckline dark band near lower body) ----
    for (const side of [-1, 1]) {
      const bay = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.55, L * 0.4),
        styMat,
      );
      bay.position.set(side * (W / 2 + 0.01), floorY + 0.6, -L * 0.05);
      this.bodyGroup.add(bay);
      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.05, 0.4),
        chromeMat,
      );
      handle.position.set(side * (W / 2 + 0.03), floorY + 0.45, -L * 0.05);
      this.bodyGroup.add(handle);
    }

    // ---- passenger doors (bifold, front + mid, left side) ----
    const doorDefs: { z: number; w: number }[] = [
      { z: L / 2 - 1.9, w: 0.78 },
      { z: 0.6, w: 0.9 },
    ];
    for (const d of doorDefs) {
      const pivot = new THREE.Group();
      pivot.position.set(-(W / 2) - 0.01, floorY + 1.05, d.z);
      this.bodyGroup.add(pivot);
      const leafPivots: THREE.Group[] = [];
      for (const half of [-1, 1]) {
        const lp = new THREE.Group();
        lp.position.set(0, 0, (half * d.w) / 2); // hinge at the leaf's outer edge
        pivot.add(lp);
        const leaf = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, 1.9, d.w / 2 - 0.02),
          new THREE.MeshStandardMaterial({
            color: 0xaab4bd,
            metalness: 0.6,
            roughness: 0.4,
            transparent: true,
            opacity: 0.92,
          }),
        );
        // leaf grows inward from its hinge
        leaf.position.set(0, 0, (-half * (d.w / 2 - 0.02)) / 2);
        lp.add(leaf);
        leafPivots.push(lp);
      }
      pivot.userData.leafPivots = leafPivots;
      this.doorPivots.push(pivot);
    }

    // ---- wipers ----
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.62, 0.02),
        darkMat,
      );
      arm.position.set(side * W * 0.25, winY + winH / 2, L / 2 - 0.1);
      arm.rotation.x = Math.PI / 2 - 0.16;
      arm.geometry.translate(0, -0.3, 0);
      this.bodyGroup.add(arm);
      this.wiperArms.push(arm);
    }

    // ---- interior ----
    const cabin = new THREE.Group();
    cabin.position.set(0, floorY + 0.06, 0);
    this.root.add(cabin);

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(W - 0.1, 0.06, L * 0.92),
      new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.95 }),
    );
    cabin.add(floor);

    // driver cockpit (left side, front)
    const cockpit = new THREE.Group();
    cockpit.position.set(-(W * 0.28), floorY + 0.72, L / 2 - 1.45);
    cabin.add(cockpit);

    const dash = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.34, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.6 }),
    );
    dash.position.y = 0.14;
    cockpit.add(dash);

    // instrument cluster face (canvas dial texture)
    const clusterTex = makeTextTexture("INFINITE ROADS", {
      bg: "#0b0e13",
      fg: "#39d0ff",
      w: 256,
      h: 64,
      font: "bold 30px 'Consolas', monospace",
    });
    const cluster = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, 0.1),
      new THREE.MeshBasicMaterial({ map: clusterTex }),
    );
    cluster.position.set(-0.18, 0.26, 0.24);
    cockpit.add(cluster);

    // steering wheel (rotates with steering angle)
    this.steerWheel = new THREE.Group() as unknown as THREE.Mesh;
    const rimMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.27, 0.032, 10, 24),
      darkMat,
    );
    (this.steerWheel as unknown as THREE.Group).add(rimMesh);
    for (const a of [0, Math.PI / 2]) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.25, 0.02), styMat);
      spoke.position.set(Math.sin(a) * 0.12, Math.cos(a) * 0.12, 0);
      spoke.rotation.z = -a;
      (this.steerWheel as unknown as THREE.Group).add(spoke);
    }
    this.steerWheel.position.set(-0.2, 0.42, 0.28);
    (this.steerWheel as unknown as THREE.Group).rotation.x = -0.75;
    cockpit.add(this.steerWheel);

    const driverSeat = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.5, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x36343a, roughness: 0.85 }),
    );
    driverSeat.position.set(-(W * 0.28), floorY + 0.55, L / 2 - 2.0);
    cabin.add(driverSeat);

    // 2+2 instanced passenger seats
    const rows = Math.floor((L * 0.72) / 1.05);
    const seatCount = rows * 2;
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x37437a, roughness: 0.9 });
    const seats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.5, 0.48), seatMat, seatCount);
    const backs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.55, 0.09), seatMat, seatCount);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let si = 0;
    for (let r = 0; r < rows; r++) {
      for (const seatX of [-W * 0.28 + 0.32, W * 0.28]) {
        const z = L * 0.36 - 2.2 - r * 1.05;
        m.compose(new THREE.Vector3(seatX, floorY + 0.62, z), q, new THREE.Vector3(1, 1, 1));
        seats.setMatrixAt(si, m);
        m.compose(
          new THREE.Vector3(seatX, floorY + 0.85, z - 0.24),
          q,
          new THREE.Vector3(1, 1, 1),
        );
        backs.setMatrixAt(si, m);
        si++;
      }
    }
    seats.castShadow = false;
    cabin.add(seats);
    cabin.add(backs);

    // handrail poles
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xd7dde3, metalness: 0.9, roughness: 0.2 });
    for (const z of [L / 2 - 2.6, 0.2, -L * 0.22, -L * 0.36]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.85, 8), poleMat);
      pole.position.set(0.15, floorY + 0.98, z);
      cabin.add(pole);
    }

    // interior lights (soft, only meaningful at night)
    for (const z of [L * 0.25, -L * 0.05, -L * 0.3]) {
      const pl = new THREE.PointLight(0xfff4d8, 0, 4.5);
      pl.position.set(0, roof.position.y - 0.5, z);
      this.root.add(pl);
      this.interiorLights.push(pl);
    }
  }

  /** doorPivots bookkeeping helper (array mutation above). */
  applyDoors(open: boolean, dt: number) {
    const target = open ? 1 : 0;
    this.doorAnim += Math.sign(target - this.doorAnim) * Math.min(dt * 1.6, Math.abs(target - this.doorAnim));
    for (const p of this.doorPivots) {
      const leafPivots = (p as THREE.Group).userData.leafPivots as THREE.Group[] | undefined;
      if (!leafPivots) continue;
      for (const lp of leafPivots) {
        const inward = lp.children[0].position.z < 0 ? 1 : -1;
        // bifold: each leaf folds outward around its hinge
        lp.rotation.y = this.doorAnim * 1.15 * inward;
      }
    }
  }

  applyWipers(on: boolean, dt: number) {
    if (on) {
      this.wiperPhase += dt * 5.5;
      const sweep = Math.max(0.25, 0.9 - Math.abs(Math.sin(this.wiperPhase * 4)) * 1.6);
      this.wiperArms.forEach((arm, i) => {
        arm.rotation.z = (i === 0 ? -1 : 1) * sweep * 0.45;
      });
    } else {
      for (const arm of this.wiperArms) arm.rotation.z = 0;
    }
  }

  spinWheels(deltaMeters: number, dt: number) {
    const omega = (deltaMeters / dt) / this.spec.wheelRadius;
    for (const w of this.wheels) w.rotation.x += omega * dt;
  }

  steerVisual(angle: number) {
    for (const p of this.steerPivots) p.rotation.y = angle;
    (this.steerWheel as unknown as THREE.Group).rotation.z = -angle * 3.2;
  }

  setLights(head: boolean, brake: boolean, reverse: boolean, interior: boolean) {
    for (const s of this.headSpots) s.intensity = head ? 260 : 0;
    for (const b of this.brakeMats) b.color.setHex(brake ? 0xff2418 : 0x4a0b0b);
    for (const r of this.reverseMats) r.color.setHex(reverse ? 0xf4f7f2 : 0x3a3f45);
    for (const l of this.interiorLights) l.intensity = interior ? 0.85 : 0;
  }

  blinkIndicators(on: boolean, dt: number) {
    if (on) {
      const on2 = Math.sin(this.wiperPhase * 6) > 0;
      for (const i of this.indicatorMats) i.color.setHex(on2 ? 0xffa516 : 0x3a2c06);
      this.wiperPhase += dt;
    } else {
      for (const i of this.indicatorMats) i.color.setHex(0x644c08);
    }
  }

  /** fake suspension: roll from cornering, pitch from accel/braking */
  applyBodyLean(latAccel: number, longAccel: number) {
    const roll = THREE.MathUtils.clamp(latAccel * 0.006, -0.05, 0.05);
    const pitch = THREE.MathUtils.clamp(-longAccel * 0.005, -0.035, 0.035);
    this.bodyGroup.rotation.z += (roll - this.bodyGroup.rotation.z) * 0.1;
    this.bodyGroup.rotation.x += (pitch - this.bodyGroup.rotation.x) * 0.1;
  }
}

export function createBusMesh(spec: BusSpec): BusVisual {
  return new BusVisual(spec);
}
