import * as THREE from "three";
import { ROAD_CENTER_RADIUS, ROAD_HALF_WIDTH, STOP_COUNT, stopAngle } from "./world";

/**
 * Phase 3 passenger + ticketing simulation.
 *
 * - waiting crowds regenerate at stops (rush hour weighted)
 * - boarding with seat + standing capacity, tickets sold per passenger
 * - destination tracking: passengers alight only at their chosen stop
 * - fare: base + distance along the ring (Indian city bus style)
 */
interface OnboardPassenger {
  destStop: number;
  fare: number;
}

export interface BoardingResult {
  boarded: number;
  revenue: number;
  alighted: number;
}

const FARE_BASE = 8;      // ₹
const FARE_PER_KM = 2.2;  // ₹ per segment km
const BOARD_RATE = 1.4;   // passengers per second while doors open

export class PassengerSystem {
  /** waiting passengers per stop */
  waiting = new Array(STOP_COUNT).fill(0) as number[];
  /** passengers currently on the bus */
  onboard: OnboardPassenger[] = [];
  private totalBoarded = 0;
  private totalEarned = 0;

  // crowd visuals
  private bodies: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private crowdMatricesDirty = true;
  private m4 = new THREE.Matrix4();
  private jitter: Array<{ x: number; z: number }> = [];

  constructor(parent: THREE.Object3D) {
    const cap = STOP_COUNT * 10;
    this.bodies = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.16, 0.2, 1.05, 6),
      new THREE.MeshStandardMaterial({ color: 0x806020 }),
      cap,
    );
    this.heads = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.13, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x8a5a3a }),
      cap,
    );
    const palette = [0x806020, 0x2b4b8b, 0x8b2b2b, 0x2f7d4f, 0x5a3a6a, 0x6a6a2b];
    const color = new THREE.Color();
    let i = 0;
    for (let s = 0; s < STOP_COUNT; s++) {
      // deterministic per-passenger jitter
      for (let p = 0; p < 10; p++) {
        const a0 = Math.random() * Math.PI * 2;
        const r0 = Math.random() * 0.8;
        this.jitter.push({ x: Math.sin(a0) * r0, z: Math.cos(a0) * r0 });
        const a = stopAngle(s);
        // place on the outer shoulder beside the shelter, oriented to the road
        const sr = ROAD_CENTER_RADIUS - ROAD_HALF_WIDTH - 1.0; // kerbside by the stop
        const px = Math.sin(a) * sr + Math.sin(a) * this.jitter[i].x;
        const pz = Math.cos(a) * sr + Math.cos(a) * this.jitter[i].z;
        // cyl local axes: y up — set position only, rotation via lookAt-ish yaw
        this.m4.compose(
          new THREE.Vector3(px, 0.62, pz),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a),
          new THREE.Vector3(1, 1, 1),
        );
        this.bodies.setMatrixAt(i, this.m4);
        this.m4.compose(
          new THREE.Vector3(px, 1.34, pz),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a),
          new THREE.Vector3(1, 1, 1),
        );
        this.heads.setMatrixAt(i, this.m4);
        this.bodies.setColorAt(i, color.setHex(palette[Math.floor(Math.random() * palette.length)]));
        i++;
      }
    }
    this.bodies.count = i;
    this.heads.count = i;
    parent.add(this.bodies);
    parent.add(this.heads);
  }

  /** Random crowd level at boot so stops feel alive from the first drive. */
  seed() {
    for (let s = 0; s < STOP_COUNT; s++) {
      this.waiting[s] = Math.floor(Math.random() * 7);
    }
    this.crowdMatricesDirty = true;
  }

  private idx(stop: number, p: number) {
    return stop * 10 + p;
  }

  private updateCrowdVisual() {
    if (!this.crowdMatricesDirty) return;
    this.crowdMatricesDirty = false;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let s = 0; s < STOP_COUNT; s++) {
      for (let p = 0; p < 10; p++) {
        if (p < this.waiting[s]) continue;
        this.bodies.setMatrixAt(this.idx(s, p), zero);
        this.heads.setMatrixAt(this.idx(s, p), zero);
      }
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
  }

  /** Mirrors crowd of a specific stop back to floor(n) people visible. */
  setWaiting(stop: number, n: number) {
    const before = this.waiting[stop];
    if (n === before) return;
    if (n > before) {
      // new people: randomise their spot (index within 10)
      // visual refresh below handles adding/removing
    }
    this.waiting[stop] = n;
    this.crowdMatricesDirty = true;
  }

  update(dt: number, clockHours: number) {
    // demand model: quiet 10pm-6am, peaks 8-10am & 5-8pm
    const rush =
      (clockHours >= 7.5 && clockHours <= 10 ? 1.6 : 0) +
      (clockHours >= 16.5 && clockHours <= 19.5 ? 1.8 : 0) +
      0.35;
    for (let s = 0; s < STOP_COUNT; s++) {
      if (this.waiting[s] < 10 && Math.random() < rush * dt * 0.5) {
        this.setWaiting(s, this.waiting[s] + 1);
      }
    }
    this.updateCrowdVisual();
  }

  /** Nearest stop index to the bus, plus arc distance in metres. */
  static nearestStop(busX: number, busZ: number): { stop: number; arcM: number } {
    const ang = Math.atan2(busX, busZ);
    let best = 0;
    let bestArc = Infinity;
    for (let s = 0; s < STOP_COUNT; s++) {
      let d = Math.abs(ang - stopAngle(s));
      d = ((d % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      if (d > Math.PI) d = Math.PI * 2 - d;
      const arc = d * ROAD_CENTER_RADIUS;
      if (arc < bestArc) {
        bestArc = arc;
        best = s;
      }
    }
    return { stop: best, arcM: bestArc };
  }

  /** Fare between two stops along the ring (shorter way). */
  static fare(from: number, to: number): number {
    const seg = Math.abs(to - from) % STOP_COUNT;
    const km = Math.min(seg, STOP_COUNT - seg) * 0.785; // arc distance between stops (2πR/8 ≈ 0.785 km at R=250? shown scaled)
    return Math.round(FARE_BASE + km * FARE_PER_KM);
  }

  /**
   * Exchange passengers with a stop. Returns boarding count + alighting count
   * and revenue collected. Seats are respected; standing = seats * 0.35.
   */
  exchange(
    stop: number,
    doorsOpen: boolean,
    capacity: number,
    busX: number,
    busZ: number,
  ): BoardingResult {
    if (!doorsOpen) return { boarded: 0, revenue: 0, alighted: 0 };

    // alight first: passengers whose destination is this stop
    const staying: OnboardPassenger[] = [];
    let alighted = 0;
    for (const p of this.onboard) {
      if (p.destStop === stop) {
        alighted++;
      } else {
        staying.push(p);
      }
    }
    if (alighted !== this.onboard.length - staying.length) {
      /* assertion guard; staying computed directly */
    }
    this.onboard = staying;

    // board from the queue while there is room
    let boarded = 0;
    let revenue = 0;
    const standing = Math.floor(capacity * 0.35);
    while (this.waiting[stop] > 0 && this.onboard.length < capacity + standing) {
      // pick a random other destination
      let dest = stop;
      while (dest === stop) dest = Math.floor(Math.random() * STOP_COUNT);
      const fare = PassengerSystem.fare(stop, dest);
      this.onboard.push({ destStop: dest, fare });
      revenue += fare;
      this.totalBoarded++;
      this.totalEarned += revenue;
      this.setWaiting(stop, this.waiting[stop] - 1);
      boarded++;
    }

    void busX;
    void busZ;
    return { boarded, revenue, alighted };
  }

  /** Manual exchange pacing: returns true when a boarding step should run. */
  static stepDue(dt: number, accumulator: { value: number }): boolean {
    accumulator.value += dt * BOARD_RATE;
    if (accumulator.value >= 1) {
      accumulator.value = 0;
      return true;
    }
    return false;
  }

  get lifetimeBoarded() {
    return this.totalBoarded;
  }
}
