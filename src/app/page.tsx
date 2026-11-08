"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useGame } from "@/game/state";

/** Branded main menu. Every button performs a real action in Phase 1. */
export default function MainMenu() {
  const [hydrate, setHydrate] = useState(false);
  const money = useGame((s) => s.money);
  const distance = useGame((s) => s.distanceMeters);
  const trips = useGame((s) => s.tripsCompleted);
  const best = useGame((s) => s.bestSpeedKph);
  const hasSave = useGame((s) => s.hasSave);
  const loadSave = useGame((s) => s.loadSave);
  const startNewGame = useGame((s) => s.startNewGame);
  const updateSettings = useGame((s) => s.updateSettings);
  const settings = useGame((s) => s.settings);

  useEffect(() => {
    loadSave();
    setHydrate(true);
  }, [loadSave]);

  return (
    <>
      <div className="menu-bg" />
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 7vw",
          gap: 40,
        }}
      >
        <div style={{ maxWidth: 560 }}>
          <div className="subtitle">THE ULTIMATE BUS SIMULATOR</div>
          <h1 className="title-xl">INFINITE ROADS</h1>
          <p className="tagline">ONE WORLD. ENDLESS ROADS.</p>
          <p style={{ color: "#8b93a7", margin: "0 0 26px", letterSpacing: "0.25em", fontSize: 12 }}>
            DRIVE • EXPLORE • BUILD • CONQUER
          </p>

          <Link href="/play" style={{ textDecoration: "none" }}>
            <button className="menu-btn" style={{ borderColor: "#ffb62e" }}>
              {hasSave ? "Continue Game" : "Start Driving"}
              <small>Free roam · Phase 1 city circuit</small>
            </button>
          </Link>

          <button
            className="menu-btn"
            onClick={() => {
              startNewGame();
              window.location.href = "/play";
            }}
          >
            New Game
            <small>Resets progress to the starter balance of ₹5,000</small>
          </button>

          <button className="menu-btn" disabled>
            DEALERSHIP · COMPANY · PASSENGER AI
            <small>Coming in Phase 2–3 — roadmap tracked in readme.md</small>
          </button>
        </div>

        {hydrate && (
          <div className="panel" style={{ width: 320 }}>
            <div style={{ letterSpacing: "0.3em", fontSize: 11, color: "#8b93a7", marginBottom: 14 }}>
              DRIVER PROFILE
            </div>
            <div className="stat-grid">
              <div>Balance<br /><b>₹{money.toLocaleString("en-IN")}</b></div>
              <div>Distance<br /><b>{(distance / 1000).toFixed(1)} km</b></div>
              <div>Trips<br /><b>{trips}</b></div>
              <div>Top speed<br /><b>{Math.round(best)} km/h</b></div>
            </div>
            <div style={{ marginTop: 20, letterSpacing: "0.3em", fontSize: 11, color: "#8b93a7", marginBottom: 8 }}>
              QUICK SETTINGS
            </div>
            <div className="slider-row">
              <span>Volume</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.sfxVolume}
                onChange={(e) => updateSettings({ sfxVolume: +e.target.value })}
              />
            </div>
            <div className="slider-row">
              <span>Render</span>
              <input
                type="range"
                min={0.5}
                max={1.4}
                step={0.1}
                value={settings.renderScale}
                onChange={(e) => updateSettings({ renderScale: +e.target.value })}
              />
            </div>
            <div style={{ color: "#8b93a7", fontSize: 12, marginTop: 16 }}>
              BY HASHWIN AND ANIKET
            </div>
          </div>
        )}
      </div>
    </>
  );
}
