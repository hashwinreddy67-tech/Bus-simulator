"use client";

/**
 * Persistent player profile & settings (Phase 1).
 * Real financial transactions update `money`; nothing is display-only.
 */

export interface SaveData {
  playerName: string;
  playerLevel: number;
  xp: number;
  money: number;
  totalDistanceMeters: number;
  tripsCompleted: number;
  bestSpeedKph: number;
  totalEarnings: number;
}

export interface Settings {
  renderScale: number; // 0.5 – 1.0
  sfxVolume: number; // 0 – 1
  steeringSensitivity: number; // 0.4 – 2.0
  showMinimap: boolean;
}

export interface GameStore {
  money: number;
  distanceMeters: number;
  tripsCompleted: number;
  bestSpeedKph: number;
  totalEarnings: number;
  xp: number;
  settings: Settings;
  paused: boolean;
  hasSave: boolean;
  setPaused: (p: boolean) => void;
  updateSettings: (s: Partial<Settings>) => void;
  /** Mutate profile through actions so the save is written atomically. */
  commitTrip: (trip: {
    distanceMeters: number;
    earnings: number;
    bestSpeedKph: number;
    xp: number;
  }) => void;
  spend: (amount: number) => boolean;
  earn: (amount: number, applyToEarnings?: boolean) => void;
  startNewGame: () => void;
  loadSave: () => boolean;
  saveNow: () => void;
}

const SAVE_KEY = "infinite-roads:save:v1";
const SETTINGS_KEY = "infinite-roads:settings:v1";

const START_MONEY = 5000;

const defaultSave: SaveData = {
  playerName: "Driver",
  playerLevel: 1,
  xp: 0,
  money: START_MONEY,
  totalDistanceMeters: 0,
  tripsCompleted: 0,
  bestSpeedKph: 0,
  totalEarnings: 0,
};

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full/blocked — non-fatal */
  }
}

import { create } from "zustand";

export const useGame = create<GameStore>((set, get) => ({
  money: START_MONEY,
  distanceMeters: 0,
  tripsCompleted: 0,
  bestSpeedKph: 0,
  totalEarnings: 0,
  xp: 0,
  paused: false,
  hasSave: false,
  settings: {
    renderScale: 1,
    sfxVolume: 0.6,
    steeringSensitivity: 1,
    showMinimap: true,
  },

  setPaused: (p) => set({ paused: p }),

  updateSettings: (s) => {
    const settings = { ...get().settings, ...s };
    writeJson(SETTINGS_KEY, settings);
    set({ settings });
  },

  commitTrip: (trip) => {
    const st = get();
    const save: SaveData = {
      playerName: "Driver",
      playerLevel: 1,
      xp: st.xp + trip.xp,
      money: st.money + trip.earnings,
      totalDistanceMeters: st.distanceMeters + trip.distanceMeters,
      tripsCompleted: st.tripsCompleted + 1,
      bestSpeedKph: Math.max(st.bestSpeedKph, trip.bestSpeedKph),
      totalEarnings: st.totalEarnings + trip.earnings,
    };
    writeJson(SAVE_KEY, save);
    set({
      money: save.money,
      xp: save.xp,
      distanceMeters: save.totalDistanceMeters,
      tripsCompleted: save.tripsCompleted,
      bestSpeedKph: save.bestSpeedKph,
      totalEarnings: save.totalEarnings,
    });
  },

  spend: (amount) => {
    const st = get();
    if (st.money < amount) return false;
    set({ money: st.money - amount });
    get().saveNow();
    return true;
  },

  earn: (amount, applyToEarnings = true) => {
    const st = get();
    set({ money: st.money + amount });
    if (applyToEarnings) set({ totalEarnings: st.totalEarnings + amount });
    get().saveNow();
  },

  startNewGame: () => {
    writeJson(SAVE_KEY, defaultSave);
    set({
      money: defaultSave.money,
      xp: defaultSave.xp,
      distanceMeters: 0,
      tripsCompleted: 0,
      bestSpeedKph: 0,
      totalEarnings: 0,
    });
  },

  loadSave: () => {
    const save = readJson<SaveData>(SAVE_KEY);
    const settings = readJson<Settings>(SETTINGS_KEY);
    if (settings) set({ settings });
    if (!save) return false;
    set({
      money: save.money,
      xp: save.xp,
      distanceMeters: save.totalDistanceMeters,
      tripsCompleted: save.tripsCompleted,
      bestSpeedKph: save.bestSpeedKph,
      totalEarnings: save.totalEarnings,
      hasSave: true,
    });
    return true;
  },

  saveNow: () => {
    const st = get();
    const save: SaveData = {
      playerName: "Driver",
      playerLevel: 1,
      xp: st.xp,
      money: st.money,
      totalDistanceMeters: st.distanceMeters,
      tripsCompleted: st.tripsCompleted,
      bestSpeedKph: st.bestSpeedKph,
      totalEarnings: st.totalEarnings,
    };
    writeJson(SAVE_KEY, save);
  },
}));
