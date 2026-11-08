/** Live telemetry bridge between the Three.js engine and React HUD. */
export interface Telemetry {
  speedKph: number;
  rpm: number;
  maxRpm: number;
  gear: string;
  fuelPct: number;
  fuelLiters: number;
  rangeKm: number;
  headlightsOn: boolean;
  wipersOn: boolean;
  doorsOpen: boolean;
  engineOn: boolean;
  horn: boolean;
  cruise: boolean;
  clockHours: number; // 0..24
  tripDistanceM: number;
  camera: string;
  passengers: number;
  x: number;
  z: number;
  heading: number;
  stopArcM: number; // metres to nearest bus stop
  stopWaiting: number; // crowd waiting there
  canService: boolean; // bus in position to board/alight
  revenueBoarding: number; // live cash from this service action
}

export const telemetry: Telemetry = {
  speedKph: 0,
  rpm: 0,
  maxRpm: 2400,
  gear: "N",
  fuelPct: 100,
  fuelLiters: 100,
  rangeKm: 0,
  headlightsOn: false,
  wipersOn: false,
  doorsOpen: false,
  engineOn: true,
  horn: false,
  cruise: false,
  clockHours: 8,
  tripDistanceM: 0,
  camera: "Chase",
  passengers: 0,
  x: 0,
  z: 0,
  heading: 0,
  stopArcM: 1e9,
  stopWaiting: 0,
  canService: false,
  revenueBoarding: 0,
};

export const TELEM_MAX_RPM_SHOWN = 2400;
export const FUEL_RANGE_KM_PER_L = 3.4; // diesel bus kmpl baseline

export function resetTelemetry() {
  telemetry.speedKph = 0;
  telemetry.gear = "N";
  telemetry.camera = "Chase";
}
