"use client";

/**
 * Keyboard input map (rebind-friendly representation).
 * Automatic transmission ONLY — no clutch/manual gearbox controls by design.
 */

export interface InputState {
  throttle: number; // 0..1
  brake: number; // 0..1
  steerLeft: boolean;
  steerRight: boolean;
  handbrake: boolean;
  reverseToggle: boolean;
  engineToggle: boolean;
  headlightsToggle: boolean;
  horn: boolean;
  wipers: boolean;
  doors: boolean;
  cruise: boolean;
  indicatorLeft: boolean;
  indicatorRight: boolean;
  cameraNext: boolean;
  resetVehicle: boolean;
  pause: boolean;
}

export class InputManager {
  readonly state: InputState = {
    throttle: 0,
    brake: 0,
    steerLeft: false,
    steerRight: false,
    handbrake: false,
    reverseToggle: false,
    engineToggle: false,
    headlightsToggle: false,
    horn: false,
    wipers: false,
    doors: false,
    cruise: false,
    indicatorLeft: false,
    indicatorRight: false,
    cameraNext: false,
    resetVehicle: false,
    pause: false,
  };

  private held = new Set<string>();
  private onAction?: (a: ActionName) => void;

  constructor(onAction?: (a: ActionName) => void) {
    this.onAction = onAction;
    window.addEventListener("keydown", this.keydown);
    window.addEventListener("keyup", this.keyup);
    window.addEventListener("blur", this.clear);
  }

  dispose() {
    window.removeEventListener("keydown", this.keydown);
    window.removeEventListener("keyup", this.keyup);
    window.removeEventListener("blur", this.clear);
  }

  private clear = () => {
    this.held.clear();
    this.syncAxis();
  };

  private keydown = (e: KeyboardEvent) => {
    if (e.repeat) {
      return;
    }
    const k = e.code;
    this.held.add(k);
    this.syncAxis();
    switch (k) {
      case "KeyR":
        this.state.reverseToggle = !this.state.reverseToggle;
        this.onAction?.("reverse");
        break;
      case "KeyG":
        this.state.engineToggle = !this.state.engineToggle;
        this.onAction?.("engine");
        break;
      case "KeyL":
        this.state.headlightsToggle = !this.state.headlightsToggle;
        this.onAction?.("headlights");
        break;
      case "KeyT":
        this.state.wipers = !this.state.wipers;
        this.onAction?.("wipers");
        break;
      case "KeyO":
        this.state.doors = !this.state.doors;
        this.onAction?.("doors");
        break;
      case "KeyZ":
        this.state.indicatorLeft = !this.state.indicatorLeft;
        if (this.state.indicatorLeft) this.state.indicatorRight = false;
        this.onAction?.("indLeft");
        break;
      case "KeyV":
        this.state.indicatorRight = !this.state.indicatorRight;
        if (this.state.indicatorRight) this.state.indicatorLeft = false;
        this.onAction?.("indRight");
        break;
      case "KeyC":
        if (e.ctrlKey) break;
        this.onAction?.("camera");
        break;
      case "KeyX":
        this.state.cruise = !this.state.cruise;
        this.onAction?.("cruise");
        break;
      case "KeyK":
        this.onAction?.("horn");
        break;
      case "KeyP":
      case "Escape":
        this.onAction?.("pause");
        break;
      case "KeyB":
        this.state.resetVehicle = true;
        this.onAction?.("reset");
        break;
    }
    if (["ArrowUp", "ArrowDown", "Space"].includes(k)) e.preventDefault();
  };

  private keyup = (e: KeyboardEvent) => {
    this.held.delete(e.code);
    this.syncAxis();
  };

  private syncAxis() {
    this.state.throttle =
      this.held.has("ArrowUp") || this.held.has("KeyW") ? 1 : 0;
    this.state.brake = this.held.has("ArrowDown") || this.held.has("KeyS") ? 1 : 0;
    this.state.steerLeft = this.held.has("ArrowLeft") || this.held.has("KeyA");
    this.steerRight = this.held.has("ArrowRight") || this.held.has("KeyD");
    this.state.handbrake = this.held.has("Space");
    this.state.horn = this.held.has("KeyK");
  }

  /** property alias (kept simple for future rebind map) */
  private set steerRight(v: boolean) {
    this.state.steerRight = v;
  }
}

export type ActionName =
  | "reverse"
  | "engine"
  | "headlights"
  | "wipers"
  | "doors"
  | "camera"
  | "cruise"
  | "horn"
  | "pause"
  | "reset"
  | "indLeft"
  | "indRight";
