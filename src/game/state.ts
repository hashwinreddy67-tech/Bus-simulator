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
  ownedBuses: string[];
  activeBusId: string;
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
  ownedBuses: string[];
  activeBusId: string;
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
  buyBus: (id: string, price: number) => boolean;
  sellBus: (id: string, price: number) => boolean;
  setActiveBus: (id: string) => void;
  startNewGame: () => void;
  loadSave: () => boolean;
  saveNow: () => void;
}

const SAVE_KEY = "infinite-roads:save:v2";
const SETTINGS_KEY = "infinite-roads:settings:v1";

import { create } from "zustand";
import { STARTER_BUS } from "./bus";

const STARTER_BUS_ID = STARTER_BUS.id;
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
  ownedBuses: [STARTER_BUS_ID],
  activeBusId: STARTER_BUS_ID,
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

export const useGame = create<GameStore>((set, get) => ({
  money: START_MONEY,
  distanceMeters: 0,
  tripsCompleted: 0,
  bestSpeedKph: 0,
  totalEarnings: 0,
  xp: 0,
  ownedBuses: [STARTER_BUS_ID],
  activeBusId: STARTER_BUS_ID,
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
      ownedBuses: st.ownedBuses,
      activeBusId: st.activeBusId,
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

  buyBus: (id, price) => {
    const st = get();
    if (st.ownedBuses.includes(id)) return false;
    if (st.money < price) return false;
    const stNew = {
      money: st.money - price,
      ownedBuses: [...st.ownedBuses, id],
      activeBusId: id, // delivered to depot and ready to drive
    };
    set(stNew);
    get().saveNow();
    return true;
  },

  sellBus: (id, price) => {
    const st = get();
    if (!st.ownedBuses.includes(id)) return false;
    const owned = st.ownedBuses.filter((b) => b !== id);
    set({
      money: st.money + price,
      ownedBuses: owned,
      activeBusId: st.activeBusId === id ? owned[0] ?? STARTER_BUS_ID : st.activeBusId,
    });
    get().saveNow();
    return true;
  },

  setActiveBus: (id) => {
    const st = get();
    if (!st.ownedBuses.includes(id)) return;
    set({ activeBusId: id });
    get().saveNow();
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
      ownedBuses: [STARTER_BUS_ID],
      activeBusId: STARTER_BUS_ID,
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
      ownedBuses: save.ownedBuses?.length ? save.ownedBuses : [STARTER_BUS_ID],
      activeBusId: save.activeBusId || STARTER_BUS_ID,
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
      ownedBuses: st.ownedBuses,
      activeBusId: st.activeBusId,
    };
    writeJson(SAVE_KEY, save);
  },
}));
