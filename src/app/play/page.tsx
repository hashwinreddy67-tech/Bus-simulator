"use client";

export const dynamic = "force-dynamic";

import dynamicImport from "next/dynamic";
import { useEffect } from "react";
import { useGame } from "@/game/state";
import Hud from "@/game/Hud";

const GameCanvas = dynamicImport(() => import("@/game/GameCanvas"), {
  ssr: false,
  loading: () => (
    <div className="overlay">
      <div className="panel">
        <b>INFINITE ROADS</b>
        <p style={{ color: "#8b93a7" }}>Starting engine…</p>
      </div>
    </div>
  ),
});

/** Pause menu overlay — real actions: resume, settings, save+exit. */
export function PauseMenu() {
  const paused = useGame((s) => s.paused);
  const setPaused = useGame((s) => s.setPaused);
  const settings = useGame((s) => s.settings);
  const updateSettings = useGame((s) => s.updateSettings);

  if (!paused) return null;
  return (
    <div className="overlay">
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>PAUSED</h2>
        <button className="menu-btn" onClick={() => setPaused(false)}>
          Resume
        </button>
        <div style={{ margin: "14px 0" }}>
          <div className="slider-row">
            <span>Render scale</span>
            <input
              type="range"
              min={0.5}
              max={1.4}
              step={0.1}
              value={settings.renderScale}
              onChange={(e) => updateSettings({ renderScale: +e.target.value })}
            />
            <span>{settings.renderScale.toFixed(1)}×</span>
          </div>
          <div className="slider-row">
            <span>Sound volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.sfxVolume}
              onChange={(e) => updateSettings({ sfxVolume: +e.target.value })}
            />
            <span>{Math.round(settings.sfxVolume * 100)}%</span>
          </div>
          <div className="slider-row">
            <span>Steering sensitivity</span>
            <input
              type="range"
              min={0.4}
              max={2}
              step={0.1}
              value={settings.steeringSensitivity}
              onChange={(e) => updateSettings({ steeringSensitivity: +e.target.value })}
            />
            <span>{settings.steeringSensitivity.toFixed(1)}×</span>
          </div>
          <label className="slider-row" style={{ cursor: "pointer" }}>
            <span>Show minimap</span>
            <input
              type="checkbox"
              checked={settings.showMinimap}
              onChange={(e) => updateSettings({ showMinimap: e.target.checked })}
            />
          </label>
        </div>
        <button
          className="menu-btn"
          onClick={() => {
            useGame.getState().saveNow();
            window.location.href = "/";
          }}
        >
          Save & Exit to Menu
        </button>
      </div>
    </div>
  );
}

export default function PlayPage() {
  useEffect(() => {
    useGame.getState().loadSave();
  }, []);
  return (
    <>
      <GameCanvas />
      <Hud />
      <PauseMenu />
    </>
  );
}
