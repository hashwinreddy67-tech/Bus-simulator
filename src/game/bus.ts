/**
 * INFINITE ROADS — Vehicle simulation module (Phase 1).
 *
 * Automatic transmission ONLY. Gears shift automatically in the background;
 * there is deliberately no clutch or manual gearbox interface.
 *
 * Physics model:
 *  - longitudional engine model with torque curve + automatic 6-speed gearbox
 *  - bicycle-model steering with speed-dependent steering limit
 *  - air-brake response lag, ABS-modulated braking, handbrake
 *  - passenger mass affecting acceleration and braking distance
 *  - fuel consumption derived from engine torque at RPM
 */

export interface BusSpec {
  id: string;
  name: string;
  category: string;
  massKg: number;
  maxTorqueNm: number;
  ratedRpm: number;
  gears: number[];
  finalDrive: number;
  wheelRadius: number;
  wheelbase: number;
  tankLiters: number;
  fuelType: "Diesel" | "CNG" | "Electric";
  seatCapacity: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  price: number;
  topSpeedKph: number;
  classOf?: string; // real-life vehicle class this model is based on
}

/** Starter bus: a classic Indian city bus. */
export const STARTER_BUS: BusSpec = {
  id: "city-bus-01",
  name: "Bharat City Cruiser 40",
  category: "City Bus",
  massKg: 11500,
  maxTorqueNm: 1100,
  ratedRpm: 2400,
  gears: [5.6, 3.4, 2.3, 1.6, 1.2, 0.95],
  finalDrive: 5.125,
  wheelRadius: 0.52,
  wheelbase: 5.6,
  tankLiters: 220,
  fuelType: "Diesel",
  seatCapacity: 41,
  lengthM: 10.5,
  widthM: 2.55,
  heightM: 3.37,
  price: 0,
  topSpeedKph: 88,
  classOf: "Tata Starbus Ultra LB step-entry (10.5 m)",
};

/** Simple torque curve: parabola peaking at 1600 rpm. */
function torqueAt(rpm: number, spec: BusSpec): number {
  const r = Math.max(600, Math.min(rpm, spec.ratedRpm * 1.05));
  const peak = spec.maxTorqueNm;
  const t = (r - 1600) / 1600;
  return peak * Math.max(0.25, 1 - 0.55 * t * t);
}

export type GearMode = "P" | "N" | "D" | "R";

export interface VehicleState {
  x: number;
  z: number;
  heading: number;
  speed: number; // m/s, signed (negative = reverse)
  engineOn: boolean;
  rpm: number;
  gearIndex: number;
  gearMode: GearMode;
  steeringAngle: number;
  fuelLiters: number;
  tripDistance: number;
  passengers: number;
}

const IDLE_RPM = 700;
const SHIFT_UP_RPM = 2050;
const SHIFT_DOWN_RPM = 1150;
const SHIFT_COOLDOWN = 0.55;

export class BusVehicle {
  readonly spec: BusSpec;
  state: VehicleState;
  private shiftTimer = 0;
  private shiftCut = 0; // torque dip while the gearbox executes a change
  private brakeServo = 0; // simulated air brake buildup
  throttleOut = 0; // audio telemetry
  tireSlip = 0;

  constructor(spec: BusSpec = STARTER_BUS) {
    this.spec = spec;
    this.state = {
      x: 0,
      z: 0,
      heading: 0,
      speed: 0,
      engineOn: false,
      rpm: 0,
      gearIndex: 0,
      gearMode: "N",
      steeringAngle: 0,
      fuelLiters: spec.tankLiters,
      tripDistance: 0,
      passengers: 0,
    };
  }

  reset(x: number, z: number, heading: number) {
    const s = this.state;
    s.x = x;
    s.z = z;
    s.heading = heading;
    s.speed = 0;
    s.engineOn = true;
    s.rpm = IDLE_RPM;
    s.gearMode = "D";
    s.gearIndex = 0;
    s.steeringAngle = 0;
    s.passengers = Math.max(4, Math.round(s.passengers || 8));
  }

  get engineRunning() {
    return this.state.engineOn && this.state.fuelLiters > 0;
  }

  toggleEngine() {
    if (this.state.fuelLiters <= 0) return;
    this.state.engineOn = !this.state.engineOn;
    if (!this.state.engineOn) this.state.gearMode = "N";
  }

  toggleReverse() {
    if (this.state.speed > 2) return; // must nearly stop before engaging R
    if (this.state.gearMode === "R") this.state.gearMode = "D";
    else if (this.state.gearMode === "D") this.state.gearMode = "R";
  }

  get speedKph() {
    return Math.abs(this.state.speed) * 3.6;
  }

  /** Fixed-timestep simulation step. */
  step(
    dt: number,
    throttle: number,
    brake: number,
    steerInput: number, // -1..1
    handbrake: boolean,
    cruiseTargetKph: number | null,
    onSurface: "road" | "grass" = "road",
    doorsOpen = false,
  ) {
    const s = this.state;
    const spec = this.spec;
    const g = 9.81;
    const mass = spec.massKg + s.passengers * 72;
    this.shiftCut = Math.max(0, this.shiftCut - dt);

    // ---- cruise control target ----
    let throttleIn = throttle;
    if (doorsOpen) throttleIn = 0; // safety interlock: no drive with doors open
    if (cruiseTargetKph !== null && s.gearMode === "D" && this.engineRunning) {
      const target = cruiseTargetKph / 3.6;
      const err = target - s.speed;
      throttleIn = Math.max(0, Math.min(1, err * 0.25));
      if (err < -1) throttleIn = 0;
    }

    // ---- steering (speed-sensitive) ----
    const speedKph = Math.abs(s.speed) * 3.6;
    const maxAngle = 0.62 - Math.min(0.44, speedKph / 190);
    const target = steerInput * maxAngle;
    const rate = (1.8 / (1 + speedKph / 40)) * 2.2;
    s.steeringAngle +=
      Math.max(-rate * dt, Math.min(rate * dt, target - s.steeringAngle));
    // self-centering
    if (Math.abs(steerInput) < 0.05) {
      s.steeringAngle *= Math.max(0, 1 - 2.5 * dt);
    }

    // ---- engine / transmission ----
    let wheelTorque = 0;
    if (this.engineRunning && s.gearMode !== "N" && s.gearMode !== "P") {
      const ratio =
        s.gearMode === "R"
          ? spec.gears[0] * 1.15 + spec.gears[1]
          : spec.gears[s.gearIndex];
      const wheelOmega = Math.abs(s.speed) / spec.wheelRadius;
      const targetRpm = Math.max(
        IDLE_RPM,
        wheelOmega * ratio * spec.finalDrive * (60 / (2 * Math.PI)),
      );
      // rpm follows target with inertia (torque converter slip at low speed)
      s.rpm += (targetRpm - s.rpm) * Math.min(1, dt * 6);
      s.rpm = Math.max(IDLE_RPM, Math.min(s.rpm, spec.ratedRpm * 1.05));

      const T = torqueAt(s.rpm, spec);
      const rpmFactor = Math.max(0.15, 1 - Math.max(0, s.rpm - spec.ratedRpm * 0.92) / (spec.ratedRpm * 0.2));
      const shiftDip = this.shiftCut > 0 ? 0 : 1; // clutch-to-clutch pressure dip
      const maxWheelTorque =
        T * ratio * spec.finalDrive * 0.9 * throttleIn * rpmFactor * shiftDip;
      const driveTorqueLimit = mass * g * 0.72 * spec.wheelRadius; // traction cap
      wheelTorque = Math.sign(
        s.gearMode === "R" ? 1 : -1,
      ) === 1 && s.gearMode === "R"
        ? -maxWheelTorque * 0.6
        : Math.min(maxWheelTorque, driveTorqueLimit);
    } else {
      // coasting / neutral: rpm falls
      s.rpm += (IDLE_RPM - s.rpm) * Math.min(1, dt * 2);
    }
    this.throttleOut = throttleIn;

    // ---- longitudinal forces ----
    const wheelTorqueToForce = wheelTorque / spec.wheelRadius;
    let force = wheelTorqueToForce;

    // braking with air-brake servo lag + ABS modulation at high decel
    this.brakeServo += ((brake > 0.05 || handbrake ? 1 : 0) - this.brakeServo) * Math.min(1, dt * 4);
    const brakeForce = brake * this.brakeServo * mass * g * (onSurface === "road" ? 0.62 : 0.3);
    const handbrakeForce = handbrake ? mass * g * 0.35 : 0;
    const absLimit = mass * g * 0.75;
    const totalBrake = Math.min(brakeForce + handbrakeForce, absLimit);
    this.tireSlip = brakeForce > absLimit * 0.85 ? 1 : 0;
    if (totalBrake > 0) {
      const opposing = s.speed > 0 ? -1 : 1;
      force += opposing * totalBrake * Math.sign(s.speed || 1);
    }

    // resistances
    const rolling = onSurface === "road" ? 0.012 : 0.05;
    const dragC = 3.5; // approximates ½·ρ·Cd·A for a full-size bus
    const airDrag = dragC * s.speed * s.speed * 0.5 * 1.2;
    const rollResist = rolling * mass * g * Math.sign(s.speed || 0);
    force -= airDrag * Math.sign(s.speed || 0) + rollResist;

    // integrate
    const accel = force / mass;
    s.speed += accel * dt;

    // engine braking (coasting decel grows with rpm)
    if (
      this.engineRunning &&
      throttleIn < 0.02 &&
      s.gearMode !== "N" &&
      s.gearMode !== "P" &&
      Math.abs(s.speed) > 0.5
    ) {
      const eb = 0.10 + 0.00035 * s.rpm; // m/s²
      s.speed -= eb * dt * Math.sign(s.speed);
    }

    if (brake * this.brakeServo > 0.1 && Math.abs(s.speed) < 0.35) s.speed = 0;
    s.speed = Math.max(-8, Math.min(s.speed, spec.topSpeedKph / 3.6));

    // steering yaw (bicycle model)
    const yawRate = (s.speed / spec.wheelbase) * Math.tan(s.steeringAngle);
    s.heading += yawRate * dt;
    s.x += Math.sin(s.heading) * s.speed * dt;
    s.z += Math.cos(s.heading) * s.speed * dt;
    s.tripDistance += Math.abs(s.speed) * dt;

    // ---- automatic transmission ----
    this.shiftTimer -= dt;
    if (s.gearMode === "D" && this.shiftTimer <= 0) {
      if (s.rpm > SHIFT_UP_RPM && s.gearIndex < spec.gears.length - 1) {
        s.gearIndex++;
        this.shiftTimer = SHIFT_COOLDOWN;
        this.shiftCut = 0.24;
      } else if (s.rpm < SHIFT_DOWN_RPM && s.gearIndex > 0) {
        s.gearIndex--;
        this.shiftTimer = SHIFT_COOLDOWN;
        this.shiftCut = 0.24;
      }
    }

    // ---- fuel burn ----
    if (this.engineRunning && spec.fuelType === "Diesel") {
      const load = 0.15 + throttleIn * 0.85;
      const lph = (s.rpm / 1000) * load * 9; // L per hour approximation
      s.fuelLiters = Math.max(0, s.fuelLiters - (lph / 3600) * dt);
      if (s.fuelLiters <= 0) s.engineOn = false;
    }
  }
}
