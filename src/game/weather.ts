import * as THREE from "three";

/**
 * Dynamic weather (Phase 4): cycles clear → light rain → heavy rain → clear
 * with smooth transitions. Rain is rendered as instanced streaks in a moving
 * volume around the player; intensity drives road grip loss, overcast
 * lighting, fog closure, and audible rain.
 */
export type WeatherState = "clear" | "light rain" | "heavy rain";

const TARGETS: Record<WeatherState, number> = {
  "clear": 0,
  "light rain": 0.45,
  "heavy rain": 1,
};

const HOLD_MIN_S = 55;
const HOLD_MAX_S = 150;

export class WeatherSystem {
  state: WeatherState = "clear";
  intensity = 0;      // smoothed 0..1
  private target = 0;
  private holdTimer = HOLD_MIN_S + Math.random() * (HOLD_MAX_S - HOLD_MIN_S);
  private rain: THREE.InstancedMesh;
  private m4 = new THREE.Matrix4();
  private drops: { x: number; y: number; z: number }[] = [];
  private volumeRadius = 55;
  private volumeHeight = 34;

  constructor(scene: THREE.Scene) {
    const count = 900;
    this.rain = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.014, 0.5, 0.014),
      new THREE.MeshBasicMaterial({
        color: 0xa9c2d8,
        transparent: true,
        opacity: 0.5,
      }),
      count,
    );
    this.rain.visible = false;
    this.rain.frustumCulled = false;
    scene.add(this.rain);
    for (let i = 0; i < count; i++) {
      this.drops.push({
        x: (Math.random() - 0.5) * 2 * this.volumeRadius,
        y: Math.random() * this.volumeHeight,
        z: (Math.random() - 0.5) * 2 * this.volumeRadius,
      });
    }
  }

  /** 0..1 wetness used for grip & visuals. */
  get wetLevel() {
    return this.intensity;
  }

  get raining() {
    return this.intensity > 0.12;
  }

  update(dt: number, followX: number, followY: number, followZ: number) {
    // --- scheduling ---
    this.holdTimer -= dt;
    if (this.holdTimer <= 0) {
      // bias away from repeating the same state back-to-back too often
      const options: WeatherState[] = ["clear", "light rain", "light rain", "heavy rain", "clear"];
      const next = options[Math.floor(Math.random() * options.length)];
      this.holdTimer = HOLD_MIN_S + Math.random() * (HOLD_MAX_S - HOLD_MIN_S);
      if (TARGETS[next] !== TARGETS[this.state]) this.state = next;
      this.target = TARGETS[this.state];
    }
    // smooth intensity toward target
    const lerp = Math.min(1, dt * 0.25);
    this.intensity += (this.target - this.intensity) * lerp;

    // leaving rain: fade intensity to 0
    if (this.target === 0 && this.intensity < 0.01 && this.state !== "clear") {
      this.state = "clear";
    }

    // --- particles ---
    const active = Math.floor(this.drops.length * Math.min(1, this.intensity * 1.15));
    this.rain.visible = active > 0;
    if (this.rain.visible) {
      (this.rain.material as THREE.MeshBasicMaterial).opacity = 0.22 + this.intensity * 0.38;
      const fallSpeed = 24 + this.intensity * 10;
      for (let i = 0; i < active; i++) {
        const d = this.drops[i];
        d.y -= fallSpeed * dt;
        if (d.y < 0) {
          d.y = this.volumeHeight;
          d.x = (Math.random() - 0.5) * 2 * this.volumeRadius;
          d.z = (Math.random() - 0.5) * 2 * this.volumeRadius;
        }
        this.m4.makeTranslation(followX + d.x, followY + d.y, followZ + d.z);
        this.rain.setMatrixAt(i, this.m4);
      }
      // hide unused instances
      for (let i = active; i < this.drops.length; i++) {
        this.m4.makeScale(0, 0, 0);
        this.rain.setMatrixAt(i, this.m4);
      }
      this.rain.instanceMatrix.needsUpdate = true;
    }
  }
}
