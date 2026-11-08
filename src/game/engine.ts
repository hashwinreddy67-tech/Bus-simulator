"use client";

import * as THREE from "three";
import { BusVehicle, type BusSpec, STARTER_BUS } from "./bus";
import { createBusMesh } from "./busMesh";
import { TrafficSystem } from "./traffic";
import {
  buildWorld,
  ROAD_CENTER_RADIUS,
  ROAD_HALF_WIDTH,
  type World,
} from "./world";
import {
  telemetry,
  resetTelemetry,
  FUEL_RANGE_KM_PER_L,
} from "./telemetry";
import { InputManager, type ActionName } from "./input";
import { EngineAudio } from "./audio";
import { PassengerSystem } from "./passengers";
import { useGame } from "./state";

export interface EngineCallbacks {
  onPauseToggle: () => void;
  onTripProgress: (tripDistanceM: number, bestSpeedKph: number) => void;
}

const CAMERA_MODES = ["Chase", "Dashboard", "Cabin", "Hood", "Top"] as const;
type CameraMode = (typeof CAMERA_MODES)[number];

/** Main game engine: render loop, cameras, day/night, bus sync, obstacles. */
export class GameEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private world: World;
  private traffic: TrafficSystem;
  private bus = new BusVehicle();
  private busMesh!: ReturnType<typeof createBusMesh>;
  private passengers!: PassengerSystem;
  private boardAcc = { value: 0 };
  private revenueFlush = 0;
  private teService = { arcM: 1e9, waiting: 0, inPosition: false };
  private input: InputManager;
  private audio = new EngineAudio();
  private raf = 0;
  private lastT = 0;
  private acc = 0;
  private disposed = false;
  private mode: CameraMode = "Chase";
  private bestSpeed = 0;
  private indicatorTimer = 0;
  private clockSpeed = 60; // 1 in-game minute per real second baseline
  private clockHours = 8;
  private steeringSensitivity = 1;
  private prevSpeed = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private cb: EngineCallbacks,
    options: {
      renderScale: number;
      steeringSensitivity: number;
      sfxVolume: number;
      busSpec?: BusSpec;
    },
  ) {
    resetTelemetry();
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, options.renderScale * 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

    this.camera = new THREE.PerspectiveCamera(
      62,
      canvas.clientWidth / canvas.clientHeight,
      0.3,
      3000,
    );
    this.scene.fog = new THREE.Fog(0x9cb8d8, 320, 1500);

    this.world = buildWorld(this.scene);
    this.passengers = new PassengerSystem(this.world.group);
    this.passengers.seed();
    this.traffic = new TrafficSystem(this.scene, 34);
    this.bus = new BusVehicle(options.busSpec ?? STARTER_BUS);
    this.busMesh = createBusMesh(this.bus.spec);
    this.scene.add(this.busMesh.root);
    // Spawn on the ring centreline at angle π/2 (x = R, z = 0), facing the
    // -Z tangent so the bus drives around the circuit immediately.
    this.bus.reset(
      ROAD_CENTER_RADIUS,
      0,
      Math.PI,
    );
    this.steeringSensitivity = options.steeringSensitivity;
    this.audio.setVolume(options.sfxVolume);

    this.input = new InputManager((a) => this.onAction(a));
    window.addEventListener("resize", this.onResize);
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.audio.start();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.input.dispose();
    window.removeEventListener("resize", this.onResize);
    this.audio.stop();
    this.renderer.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });
  }

  setSettings(s: { renderScale?: number; steeringSensitivity?: number; sfxVolume?: number }) {
    if (s.renderScale !== undefined) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, s.renderScale * 2));
      this.onResize();
    }
    if (s.steeringSensitivity !== undefined)
      this.steeringSensitivity = s.steeringSensitivity;
    if (s.sfxVolume !== undefined) this.audio.setVolume(s.sfxVolume);
  }

  /** Called when the React layer pauses/unpauses the game. */
  setPaused(p: boolean) {
    this.audio.setPaused(p);
  }

  private onResize = () => {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private onAction(a: ActionName) {
    const st = this.bus.state;
    switch (a) {
      case "pause":
        this.cb.onPauseToggle();
        break;
      case "reverse":
        this.bus.toggleReverse();
        break;
      case "engine":
        this.bus.toggleEngine();
        break;
      case "camera":
        this.mode =
          CAMERA_MODES[(CAMERA_MODES.indexOf(this.mode) + 1) % CAMERA_MODES.length];
        break;
      case "horn":
        this.audio.horn();
        break;
      case "reset":
        // place bus back on the road centreline moving along the ring tangent
        const r = ROAD_CENTER_RADIUS;
        const ang = Math.atan2(st.x, st.z);
        st.x = Math.sin(ang) * r;
        st.z = Math.cos(ang) * r;
        st.heading = ang + Math.PI / 2;
        st.speed = 0;
        break;
      default:
        break;
    }
  }

  // ---- main loop ----
  private frame = (t: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (t - this.lastT) / 1000);
    this.lastT = t;
    if (this.paused) {
      return;
    }

    // fixed 120 Hz physics
    this.acc += dt;
    const step = 1 / 120;
    const inp = this.input.state;
    // doors auto-safety-cancel: cannot drive the bus with doors open
    const doorsOpen = inp.doors && Math.abs(this.bus.state.speed) < 1.2;
    while (this.acc >= step) {
      const steer = (inp.steerLeft ? 1 : 0) - (inp.steerRight ? 1 : 0);
      const surface = this.onRoadSurface() ? "road" : "grass";
      this.bus.step(
        step,
        inp.throttle,
        inp.brake,
        steer * this.steeringSensitivity,
        inp.handbrake,
        inp.cruise ? 60 : null,
        surface === "grass" ? "grass" : "road",
        doorsOpen,
      );
      this.acc -= step;
    }

    // clock
    this.clockHours = (this.clockHours + dt * (this.clockSpeed / 3600)) % 24;
    const dayT = this.clockHours;

    // lighting + fog by time of day
    this.updateDayNight(dayT, dt);

    // sync bus mesh + run every visual subsystem
    const st = this.bus.state;
    this.busMesh.root.position.set(st.x, 0, st.z);
    this.busMesh.root.rotation.y = st.heading;
    this.busMesh.steerVisual(st.steeringAngle);
    this.busMesh.spinWheels(Math.abs(st.speed) * dt, dt);
    this.busMesh.applyDoors(doorsOpen, dt);
    this.busMesh.applyWipers(inp.wipers, dt);
    this.busMesh.blinkIndicators(inp.indicatorLeft || inp.indicatorRight, dt);
    const yawRate = (st.speed / this.bus.spec.wheelbase) * Math.tan(st.steeringAngle);
    const longAccel = (st.speed - this.prevSpeed) / Math.max(dt, 1e-4);
    this.prevSpeed = st.speed;
    this.busMesh.applyBodyLean(yawRate * st.speed, longAccel);

    // lights
    const lightsOn = st.engineOn && (dayT > 18.5 || dayT < 6.3);
    this.busMesh.setLights(
      lightsOn,
      inp.brake > 0.05 || inp.handbrake,
      st.gearMode === "R",
      lightsOn, // cabin lights on at night
    );

    // fence guardrail soft barrier
    this.clampToCorridor();

    // traffic AI
    this.traffic.isNight = lightsOn;
    this.traffic.update(dt, st.x, st.z, st.speed);
    if (this.traffic.collidePlayer(st.x, st.z)) {
      st.speed *= 0.4; // rough grazing rule; contact resolution in Phase 8
    }

    // ---- passenger service (Phase 3) ----
    const nearest = PassengerSystem.nearestStop(st.x, st.z);
    const inPosition =
      nearest.arcM < 9 && Math.abs(st.speed) < 0.8 && this.onRoadSurface();
    this.teService = { arcM: nearest.arcM, waiting: this.passengers.waiting[nearest.stop], inPosition };
    st.passengers = this.passengers.onboard.length;
    if (doorsOpen && inPosition && PassengerSystem.stepDue(dt, this.boardAcc)) {
      const ex = this.passengers.exchange(
        nearest.stop,
        true,
        this.bus.spec.seatCapacity,
        st.x,
        st.z,
      );
      this.revenueFlush += ex.revenue;
    }
    if (this.revenueFlush >= 1) {
      const earned = Math.floor(this.revenueFlush);
      this.revenueFlush -= earned;
      useGame.getState().earn(earned, true);
    }

    // camera
    this.updateCamera();

    // audio
    this.audio.updateEngine(this.bus.state.rpm, Math.abs(st.speed) / this.bus.spec.wheelRadius, this.bus.throttleOut);

    // telemetry
    this.bestSpeed = Math.max(this.bestSpeed, this.bus.speedKph);
    const te = telemetry;
    te.speedKph = this.bus.speedKph;
    te.rpm = this.bus.state.rpm;
    te.maxRpm = this.bus.spec.ratedRpm;
    te.gear =
      st.gearMode === "D"
        ? `D${st.gearIndex + 1}`
        : st.gearMode;
    te.fuelPct = (st.fuelLiters / this.bus.spec.tankLiters) * 100;
    te.fuelLiters = st.fuelLiters;
    te.rangeKm = st.fuelLiters * FUEL_RANGE_KM_PER_L;
    te.headlightsOn = lightsOn;
    te.wipersOn = this.input.state.wipers;
    te.doorsOpen = doorsOpen;
    te.engineOn = st.engineOn;
    te.cruise = this.input.state.cruise;
    te.clockHours = dayT;
    te.tripDistanceM = st.tripDistance;
    te.camera = this.mode;
    te.passengers = st.passengers;
    te.x = st.x;
    te.z = st.z;
    te.heading = st.heading;
    te.stopArcM = this.teService.arcM;
    te.stopWaiting = this.teService.waiting;
    te.canService = this.teService.inPosition;

    this.cb.onTripProgress(st.tripDistance, this.bestSpeed);

    this.renderer.render(this.scene, this.camera);
  };

  private paused = false;
  setPausedExternal(p: boolean) {
    this.paused = p;
  }

  private onRoadSurface(): boolean {
    const d = Math.hypot(this.bus.state.x, this.bus.state.z);
    return Math.abs(d - ROAD_CENTER_RADIUS) <= ROAD_HALF_WIDTH + 1;
  }

  private clampToCorridor() {
    const st = this.bus.state;
    const d = Math.hypot(st.x, st.z);
    const lo = ROAD_CENTER_RADIUS - ROAD_HALF_WIDTH - 5;
    const hi = ROAD_CENTER_RADIUS + ROAD_HALF_WIDTH + 5;
    if (d < lo || d > hi) {
      const ang = Math.atan2(st.x, st.z);
      const clamped = Math.min(hi, Math.max(lo, d));
      st.x = Math.sin(ang) * clamped;
      st.z = Math.cos(ang) * clamped;
      st.speed *= 0.4;
    }
  }

  private updateDayNight(hours: number, _dt: number) {
    // sun angle: sunrise 6h, sunset 18h
    const dayFrac = (hours - 6) / 12; // 0 sunrise, 1 sunset
    const angle = Math.PI * Math.min(1, Math.max(0, dayFrac));
    const sunDir = new THREE.Vector3(
      Math.cos(angle),
      Math.sin(angle) * 0.9 + 0.12,
      0.35,
    ).normalize();
    this.world.sun.position.copy(sunDir.multiplyScalar(420));
    this.world.sun.target.position.set(this.bus.state.x, 0, this.bus.state.z);

    const daylight = Math.sin(angle);
    const night = Math.max(0, -daylight * 4);
    const dayI = Math.max(0.06, Math.min(1, daylight * 1.4));

    this.world.sun.intensity = 2.4 * dayI;
    this.world.sun.color.setHSL(0.09, 0.6, 0.45 + 0.45 * Math.min(1, daylight * 2));
    this.world.hemi.intensity = 0.25 + 0.75 * dayI;

    // sky + fog colour
    const skyDay = new THREE.Color(0x87b7e8);
    const skyDusk = new THREE.Color(0xf2a05a);
    const skyNight = new THREE.Color(0x070b18);
    const c = new THREE.Color();
    if (hours >= 6.5 && hours <= 17.5) c.copy(skyDay);
    else if (hours > 17.5 && hours < 19.5) {
      const f = 1 - (hours - 17.5) / 2;
      c.copy(skyDusk).lerp(skyNight, 1 - f);
    } else if (hours > 4.5 && hours < 6.5) {
      const f = (hours - 4.5) / 2;
      c.copy(skyNight).lerp(skyDusk, f);
    } else c.copy(skyNight);
    if (hours >= 6 && hours <= 8 || hours >= 16.5 && hours <= 18.5) {
      const f = 1 - Math.min(1, Math.abs(hours - (hours < 12 ? 7 : 17.5)) / 1);
      c.lerp(skyDusk, 0.35 * f);
    }
    (this.world.sky.material as THREE.MeshBasicMaterial).color.copy(c);
    (this.scene.fog as THREE.Fog).color.copy(c);
    (this.scene.fog as THREE.Fog).near = skyNight.equals(c) ? 200 : 320;

    // lamp glow at night
    (this.world.lampHeads.material as THREE.MeshBasicMaterial).color.setHex(
      dayI < 0.35 ? 0xfff2c2 : 0x777166,
    );
    void night;
  }

  private updateCamera() {
    const st = this.bus.state;
    const fwd = new THREE.Vector3(Math.sin(st.heading), 0, Math.cos(st.heading));
    const pos = new THREE.Vector3(st.x, 0, st.z);
    switch (this.mode) {
      case "Chase": {
        const target = pos
          .clone()
          .addScaledVector(fwd, -16)
          .setY(7.5);
        this.camera.position.lerp(target, 0.12);
        this.camera.lookAt(pos.clone().addScaledVector(fwd, 10).setY(3));
        break;
      }
      case "Dashboard": {
        const seat = pos
          .clone()
          .addScaledVector(fwd, this.bus.spec.lengthM / 2 - 1.9)
          .addScaledVector(new THREE.Vector3(fwd.z, 0, -fwd.x), -0.55)
          .setY(2.35);
        this.camera.position.copy(seat);
        this.camera.lookAt(seat.clone().addScaledVector(fwd, 12).setY(2.1));
        break;
      }
      case "Cabin": {
        const seat = pos
          .clone()
          .addScaledVector(fwd, -2)
          .setY(2.8);
        this.camera.position.copy(seat);
        this.camera.lookAt(seat.clone().addScaledVector(fwd, 8));
        break;
      }
      case "Hood": {
        this.camera.position.copy(
          pos.clone().addScaledVector(fwd, this.bus.spec.lengthM / 2 + 0.5).setY(3.4),
        );
        this.camera.lookAt(pos.clone().addScaledVector(fwd, 20).setY(2.6));
        break;
      }
      case "Top": {
        this.camera.position.copy(pos.clone().setY(60));
        this.camera.up.set(fwd.x, 0, fwd.z);
        this.camera.lookAt(pos);
        break;
      }
    }
  }
}
