import * as THREE from "three";
import { ROAD_CENTER_RADIUS, ROAD_HALF_WIDTH } from "./world";

/**
 * AI traffic system (Phase 4 core, pulled forward because empty roads
 * are the worst part of a driving game).
 *
 * Vehicles travel both ways on the ring in lane offsets, keep their lane,
 * slow for the vehicle ahead (including the player), and switch on
 * headlamps at night. India left-hand traffic: each direction keeps to
 * the appropriate side of the centreline.
 */

interface TrafficVehicle {
  group: THREE.Group;
  headMat: THREE.MeshBasicMaterial[];
  dir: 1 | -1; // +1 = increasing angle, -1 = decreasing
  laneOffset: number;
  angle: number;
  radius: number;
  speed: number; // current m/s
  targetSpeed: number;
  lengthM: number;
}

const TYPES: {
  make: (mat: THREE.MeshStandardMaterial) => { g: THREE.Group; len: number; head: THREE.MeshBasicMaterial[] };
  speed: [number, number];
  weight: number;
}[] = [
  // compact hatchback — Wagon-R-type tallboy silhouette
  {
    weight: 7,
    speed: [9, 17],
    make: (mat) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.6, 3.55), mat);
      body.position.y = 0.62;
      g.add(body);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.72, 2.4), mat); // tall bubble cabin
      cabin.position.set(0, 1.24, -0.35);
      g.add(cabin);
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(1.42, 0.5, 2.42),
        new THREE.MeshStandardMaterial({ color: 0x223038, roughness: 0.15, metalness: 0.4 }),
      );
      glass.position.copy(cabin.position);
      glass.scale.multiplyScalar(1.004);
      g.add(glass);
      const head: THREE.MeshBasicMaterial[] = [];
      for (const s of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.05), new THREE.MeshBasicMaterial({ color: 0xd9d0b8 }));
        h.position.set(s * 0.5, 0.7, 1.78);
        g.add(h);
        head.push(h.material as THREE.MeshBasicMaterial);
      }
      for (const s of [-1, 1]) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.04), new THREE.MeshBasicMaterial({ color: 0x8c1b1b }));
        t.position.set(s * 0.55, 0.9, -1.79); // vertical stacked tail lamps (tallboy cue)
        g.add(t);
      }
      const wgeo = new THREE.CylinderGeometry(0.28, 0.28, 0.18, 10);
      wgeo.rotateZ(Math.PI / 2);
      for (const [x, z] of [[-0.66, 1.15], [0.66, 1.15], [-0.66, -1.05], [0.66, -1.05]]) {
        const w = new THREE.Mesh(wgeo, new THREE.MeshStandardMaterial({ color: 0x101214 }));
        w.position.set(x, 0.28, z);
        g.add(w);
      }
      return { g, len: 3.85, head };
    },
  },
  // compact sedan — Swift Dzire-type three-box
  {
    weight: 6,
    speed: [10, 18],
    make: (mat) => {
      const g = new THREE.Group();
      const lower = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.5, 3.95), mat);
      lower.position.y = 0.55;
      g.add(lower);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.45, 1.8), mat);
      cabin.position.set(0, 1.02, -0.1);
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.32, 1.82),
        new THREE.MeshStandardMaterial({ color: 0x223038, roughness: 0.15, metalness: 0.4 }),
      );
      glass.position.copy(cabin.position).setY(0.96);
      g.add(glass);
      g.add(cabin);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 0.7), mat);
      boot.position.set(0, 0.8, -1.6);
      g.add(boot);
      const head: THREE.MeshBasicMaterial[] = [];
      for (const s of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.05), new THREE.MeshBasicMaterial({ color: 0xd9d0b8 }));
        h.position.set(s * 0.46, 0.62, 1.98);
        g.add(h);
        head.push(h.material as THREE.MeshBasicMaterial);
      }
      const wgeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10);
      wgeo.rotateZ(Math.PI / 2);
      for (const [x, z] of [[-0.72, 1.2], [0.72, 1.2], [-0.72, -1.25], [0.72, -1.25]]) {
        const w = new THREE.Mesh(wgeo, new THREE.MeshStandardMaterial({ color: 0x101214 }));
        w.position.set(x, 0.3, z);
        g.add(w);
      }
      return { g, len: 4.0, head };
    },
  },
  // SUV — Bolero-type boxy utility
  {
    weight: 4,
    speed: [9, 15],
    make: (mat) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.75, 3.9), mat);
      body.position.y = 0.72;
      g.add(body);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 2.5), mat);
      cabin.position.set(0, 1.36, -0.2);
      g.add(cabin);
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(1.62, 0.4, 2.52),
        new THREE.MeshStandardMaterial({ color: 0x223038, roughness: 0.2, metalness: 0.3 }),
      );
      glass.position.copy(cabin.position).setY(1.3);
      g.add(glass);
      // spare wheel on tailgate (classic Bolero cue)
      const spare = new THREE.Mesh(
        new THREE.CylinderGeometry(0.33, 0.33, 0.14, 10),
        new THREE.MeshStandardMaterial({ color: 0x101214 }),
      );
      spare.rotation.x = Math.PI / 2;
      spare.position.set(0, 1.0, -1.98);
      g.add(spare);
      const head: THREE.MeshBasicMaterial[] = [];
      for (const s of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.05), new THREE.MeshBasicMaterial({ color: 0xd9d0b8 }));
        h.position.set(s * 0.55, 0.85, 1.96);
        g.add(h);
        head.push(h.material as THREE.MeshBasicMaterial);
      }
      const wgeo = new THREE.CylinderGeometry(0.36, 0.36, 0.24, 10);
      wgeo.rotateZ(Math.PI / 2);
      for (const [x, z] of [[-0.78, 1.25], [0.78, 1.25], [-0.78, -1.3], [0.78, -1.3]]) {
        const w = new THREE.Mesh(wgeo, new THREE.MeshStandardMaterial({ color: 0x101214 }));
        w.position.set(x, 0.36, z);
        g.add(w);
      }
      return { g, len: 4.1, head };
    },
  },
  // auto-rickshaw — Bajaj RE-type three-wheeler
  {
    weight: 5,
    speed: [5.5, 8.5],
    make: (mat) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.15, 2.35), new THREE.MeshStandardMaterial({ color: 0xd6c725 }));
      body.position.y = 0.95;
      g.add(body);
      const hood = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.5, 0.55), mat);
      hood.position.set(0, 1.05, 1.05);
      g.add(hood);
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.3, 1.55), new THREE.MeshStandardMaterial({ color: 0x1c1c1c }));
      canopy.position.set(0, 1.72, -0.1);
      g.add(canopy);
      // single front wheel + two rear wheels (3-wheeler layout)
      const wgeo = new THREE.CylinderGeometry(0.26, 0.26, 0.16, 8);
      wgeo.rotateZ(Math.PI / 2);
      const fw = new THREE.Mesh(wgeo, new THREE.MeshStandardMaterial({ color: 0x101214 }));
      fw.position.set(0, 0.26, 1.15);
      g.add(fw);
      for (const x of [-0.62, 0.62]) {
        const w = new THREE.Mesh(wgeo, new THREE.MeshStandardMaterial({ color: 0x101214 }));
        w.position.set(x, 0.26, -0.95);
        g.add(w);
      }
      const head: THREE.MeshBasicMaterial[] = [
        new THREE.MeshBasicMaterial({ color: 0xd9d0b8 }),
      ];
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.05), head[0]);
      h.position.set(0, 1.0, 1.33);
      g.add(h);
      return { g, len: 2.75, head };
    },
  },
  // mini-truck — Tata Ace-type LCV
  {
    weight: 4,
    speed: [8, 12],
    make: (mat) => {
      const g = new THREE.Group();
      // yellow cab (unmistakable Ace cue) + cargo box
      const cab = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1.15, 1.15),
        new THREE.MeshStandardMaterial({ color: 0xe4b31c }),
      );
      cab.position.set(0, 0.95, 1.45);
      g.add(cab);
      const cargoBox = new THREE.Mesh(new THREE.BoxGeometry(1.56, 1.05, 2.3), mat);
      cargoBox.position.set(0, 0.9, -0.4);
      g.add(cargoBox);
      const head: THREE.MeshBasicMaterial[] = [];
      for (const s of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.05), new THREE.MeshBasicMaterial({ color: 0xd9d0b8 }));
        h.position.set(s * 0.28, 0.85, 2.03);
        g.add(h);
        head.push(h.material as THREE.MeshBasicMaterial);
      }
      const wgeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10);
      wgeo.rotateZ(Math.PI / 2);
      for (const [x, z] of [[-0.72, 1.45], [0.72, 1.45], [-0.72, -1.4], [0.72, -1.4]]) {
        const w = new THREE.Mesh(wgeo, new THREE.MeshStandardMaterial({ color: 0x101214 }));
        w.position.set(x, 0.3, z);
        g.add(w);
      }
      return { g, len: 3.8, head };
    },
  },
  // pickup utility — Bolero Maxx-type
  {
    weight: 3,
    speed: [8, 13],
    make: (mat) => {
      const g = new THREE.Group();
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.62, 1.15, 1.75), mat);
      cab.position.set(0, 1.0, 1.15);
      g.add(cab);
      const cabGlass = new THREE.Mesh(
        new THREE.BoxGeometry(1.64, 0.42, 1.2),
        new THREE.MeshStandardMaterial({ color: 0x223038, roughness: 0.2 }),
      );
      cabGlass.position.set(0, 1.28, 1.0);
      g.add(cabGlass);
      const bed = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.5, 2.1), mat);
      bed.position.set(0, 0.85, -1.1);
      g.add(bed);
      const head: THREE.MeshBasicMaterial[] = [];
      for (const s of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.05), new THREE.MeshBasicMaterial({ color: 0xd9d0b8 }));
        h.position.set(s * 0.52, 0.85, 2.03);
        g.add(h);
        head.push(h.material as THREE.MeshBasicMaterial);
      }
      const wgeo = new THREE.CylinderGeometry(0.36, 0.36, 0.22, 10);
      wgeo.rotateZ(Math.PI / 2);
      for (const [x, z] of [[-0.78, 1.3], [0.78, 1.3], [-0.78, -1.5], [0.78, -1.5]]) {
        const w = new THREE.Mesh(wgeo, new THREE.MeshStandardMaterial({ color: 0x101214 }));
        w.position.set(x, 0.36, z);
        g.add(w);
      }
      void wgeo;
      return { g, len: 4.7, head };
    },
  },
  // intercity lorry — Tata 2518-type with open plank load bed
  {
    weight: 3,
    speed: [6, 10],
    make: (mat) => {
      const g = new THREE.Group();
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.1, 2.2), mat);
      cab.position.set(0, 1.55, 2.6);
      g.add(cab);
      // open bed with plank side rails (very Indian lorry look)
      const bedFloor = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.12, 5.6),
        new THREE.MeshStandardMaterial({ color: 0x6b5730 }),
      );
      bedFloor.position.set(0, 1.0, -1.5);
      g.add(bedFloor);
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.7, 5.6),
          new THREE.MeshStandardMaterial({ color: 0x9c4a1b }),
        );
        rail.position.set(side * 1.16, 1.4, -1.5);
        g.add(rail);
      }
      // roof-mounted luggage cluster + painted front plate (dhaba-style)
      const cargoLoad = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.5, 5.2),
        new THREE.MeshStandardMaterial({ color: 0x53523a }),
      );
      cargoLoad.position.set(0, 1.55, -1.5);
      g.add(cargoLoad);
      const wgeo = new THREE.CylinderGeometry(0.5, 0.5, 0.34, 10);
      wgeo.rotateZ(Math.PI / 2);
      for (const [x, z] of [[-1.1, 2.6], [1.1, 2.6], [-1.1, -1.1], [1.1, -1.1], [-1.1, -2.3], [1.1, -2.3]]) {
        const w = new THREE.Mesh(wgeo, new THREE.MeshStandardMaterial({ color: 0x101214 }));
        w.position.set(x, 0.5, z);
        g.add(w);
      }
      const head: THREE.MeshBasicMaterial[] = [];
      for (const s of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.05), new THREE.MeshBasicMaterial({ color: 0xd9d0b8 }));
        h.position.set(s * 0.85, 0.9, 3.71);
        g.add(h);
        head.push(h.material as THREE.MeshBasicMaterial);
      }
      return { g, len: 9.6, head };
    },
  },
  // city bus — Tata Starbus / Viking type (same family as the player's)
  {
    weight: 3,
    speed: [7, 11],
    make: (mat) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.55, 2.35, 10.5), mat);
      body.position.y = 1.85;
      g.add(body);
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(2.57, 0.9, 10.3),
        new THREE.MeshStandardMaterial({ color: 0x41525e, roughness: 0.15, metalness: 0.4 }),
      );
      win.position.y = 2.75;
      g.add(win);
      const wgeo = new THREE.CylinderGeometry(0.52, 0.52, 0.35, 10);
      wgeo.rotateZ(Math.PI / 2);
      for (const [x, z] of [[-1.2, 4.0], [1.2, 4.0], [-1.2, -3.6], [1.2, -3.6]]) {
        const w = new THREE.Mesh(wgeo, new THREE.MeshStandardMaterial({ color: 0x101214 }));
        w.position.set(x, 0.52, z);
        g.add(w);
      }
      const head: THREE.MeshBasicMaterial[] = [];
      for (const s of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.06), new THREE.MeshBasicMaterial({ color: 0xd9d0b8 }));
        h.position.set(s * 0.8, 0.9, 5.29);
        g.add(h);
        head.push(h.material as THREE.MeshBasicMaterial);
      }
      return { g, len: 10.8, head };
    },
  },
];

const CAR_COLORS = [0xb32b2b, 0x2b4eb3, 0xd9d9de, 0x3a3f47, 0x2f7d4f, 0xd3a125, 0xffffff, 0x722f37];

export class TrafficSystem {
  private vehicles: TrafficVehicle[] = [];
  private mat = new THREE.MeshStandardMaterial({ color: 0xb32b2b, roughness: 0.5, metalness: 0.4 });
  private laneOffsets = [3.2, 6.4];
  isNight = false;

  constructor(scene: THREE.Scene, count = 34) {
    // weighted type selection
    const total = TYPES.reduce((s, t) => s + t.weight, 0);
    for (let i = 0; i < count; i++) {
      let pick = Math.random() * total;
      let type = TYPES[0];
      for (const t of TYPES) {
        if (pick < t.weight) {
          type = t;
          break;
        }
        pick -= t.weight;
      }
      this.mat = new THREE.MeshStandardMaterial({
        color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
        roughness: 0.5,
        metalness: 0.4,
      });
      const { g, len, head } = type.make(this.mat);
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const laneOffset = this.laneOffsets[Math.floor(Math.random() * this.laneOffsets.length)];
      const radius = ROAD_CENTER_RADIUS - lfo(dir, laneOffset);
      const angle = Math.random() * Math.PI * 2;
      g.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
      scene.add(g);
      this.vehicles.push({
        group: g,
        headMat: head,
        dir,
        laneOffset,
        angle,
        radius,
        speed: type.speed[0],
        targetSpeed: type.speed[0] + Math.random() * (type.speed[1] - type.speed[0]),
        lengthM: len,
      });
    }
  }

  /** Advance traffic; player state provided for yielding and spacing. */
  update(dt: number, playerX: number, playerZ: number, playerSpeed: number) {
    const playerAngle = Math.atan2(playerX, playerZ);
    const playerRadius = Math.hypot(playerX, playerZ);

    for (const v of this.vehicles) {
      // --- slow for the nearest obstacle ahead in the same lane ---
      let gapToObstacle = Infinity;
      let obstacleSpeed = Infinity;

      const dirAheadAngle = (obstacleAngle: number, obstacleRadius: number) => {
        // angular offset from me to obstacle in my direction of travel
        let d = (obstacleAngle - v.angle) * v.dir;
        d = ((d % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); // wrap 0..2π
        if (obstacleRadius !== v.radius) {
          // rough lateral check: treat different lane as slower hazard only when close
          if (Math.abs(obstacleRadius - v.radius) > 2.5) return d;
        }
        return d;
      };

      // other traffic
      for (const o of this.vehicles) {
        if (o === v) continue;
        const d = dirAheadAngle(o.angle, o.radius) * v.radius;
        if (d < gapToObstacle && d < 30) {
          gapToObstacle = d;
          obstacleSpeed = o.speed;
        }
      }

      // player bus (also yields when the bus is on an opposite inner lane)
      const dAng = ((playerAngle - v.angle) * v.dir % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const lateral = Math.abs(playerRadius - v.radius);
      if (dAng * v.radius < gapToObstacle && dAng > 0 && lateral < 3.4) {
        gapToObstacle = dAng * v.radius;
        obstacleSpeed = Math.abs(playerSpeed);
      }

      // desired speed vs obstacle
      const safeGap = 6 + v.speed * 0.9;
      let target = v.targetSpeed;
      if (gapToObstacle < safeGap) {
        target = Math.min(target, Math.max(0, obstacleSpeed - 1));
        if (gapToObstacle < 5) target = 0;
      }

      // accelerate/brake toward target (car-like response, brakes faster)
      const rate = target > v.speed ? 2.5 : 8;
      v.speed += Math.max(-rate * dt, Math.min(rate * dt, target - v.speed));

      // --- integrate along the ring ---
      v.angle = (v.angle + (v.speed * v.dir) / v.radius * dt) % (Math.PI * 2);
      v.group.position.set(Math.sin(v.angle) * v.radius, 0, Math.cos(v.angle) * v.radius);
      v.group.rotation.y = v.dir === 1 ? v.angle + Math.PI / 2 : v.angle - Math.PI / 2;

      // night headlamps
      for (const h of v.headMat) {
        h.color.setHex(this.isNight ? 0xfff3c4 : 0xd9d0b8);
      }
    }
  }

  /** Circle-approx collision test against the player bus. */
  collidePlayer(playerX: number, playerZ: number): { x: number; z: number } | null {
    for (const v of this.vehicles) {
      const dx = v.group.position.x - playerX;
      const dz = v.group.position.z - playerZ;
      const d = Math.hypot(dx, dz);
      const overlap = (v.lengthM + 10.5) * 0.42;
      if (d < overlap) {
        return { x: dx, z: dz };
      }
    }
    return null;
  }
}

/** Left-hand traffic: +1 direction keeps inner lane ( traveller's left), -1 outer. */
function lfo(dir: 1 | -1, off: number): number {
  return dir === 1 ? -off : off;
}
