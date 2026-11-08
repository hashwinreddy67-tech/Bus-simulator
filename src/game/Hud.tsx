"use client";

import { useEffect, useRef, useState } from "react";
import { telemetry } from "@/game/telemetry";
import { useGame } from "@/game/state";

/** HUD: speedometer cluster, fuel, gear, clock, minimap, controls legend. */
export default function Hud() {
  const [, force] = useState(0);
  const paused = useGame((s) => s.paused);
  const money = useGame((s) => s.money);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const showMinimap = useGame((s) => s.settings.showMinimap);

  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 120);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!showMinimap) return;
    const id = setInterval(drawMinimap, 150);
    return () => clearInterval(id);
  }, [showMinimap]);

  function drawMinimap() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const w = 150;
    const c = w / 2;
    // real-world scale: 1 px = 3.2 m → ring radius ≈ 78px, fits 150px map
    const scale = 3.2;
    ctx.clearRect(0, 0, w, w);
    ctx.fillStyle = "#0a1220";
    ctx.fillRect(0, 0, w, w);
    ctx.strokeStyle = "#4c5a70";
    ctx.lineWidth = 18 / scale * 1.2;
    ctx.beginPath();
    ctx.arc(c, c, 250 / scale, 0, Math.PI * 2);
    ctx.stroke();
    // bus marker
    const te = telemetry;
    const bx = c + te.x / scale;
    const by = c - te.z / scale;
    ctx.fillStyle = "#ffb62e";
    ctx.beginPath();
    ctx.arc(bx, by, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ff5c33";
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + Math.sin(te.heading) * 10, by - Math.cos(te.heading) * 10);
    ctx.stroke();
  }

  const te = telemetry;
  const hh = String(Math.floor(te.clockHours)).padStart(2, "0");
  const mm = String(Math.floor((te.clockHours % 1) * 60)).padStart(2, "0");
  const rpmPct = Math.min(100, (te.rpm / te.maxRpm) * 100);

  return (
    <>
      {/* top bar */}
      <div
        style={{
          position: "fixed",
          top: 12,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: 12,
          pointerEvents: "none",
          zIndex: 10,
        }}
      >
        <div className="hud-card" style={{ display: "flex", gap: 18, fontSize: 13 }}>
          <span>₹ {money.toLocaleString("en-IN")}</span>
          <span>
            {hh}:{mm}
          </span>
          <span>
            TRIP {(te.tripDistanceM / 1000).toFixed(1)} km
          </span>
          <span>{te.camera} view (C)</span>
          {te.cruise && <span style={{ color: "#ffb62e" }}>CRUISE 60</span>}
        </div>
      </div>

      {/* bottom cluster */}
      <div className="hud-bottom">
        <div className="hud-card" style={{ fontSize: 11, color: "#8b93a7" }}>
          <div style={{ marginBottom: 4, letterSpacing: "0.1em" }}>CONTROLS</div>
          W/S drive · A/D steer · SPACE handbrake · R reverse<br />
          G engine · L lights · K horn · X cruise · O doors<br />
          T wipers · C camera · B reset · ESC pause
        </div>

        <div className="hud-card" style={{ minWidth: 220 }}>
          <div className="speedo-num">{Math.round(te.speedKph)}</div>
          <div className="speedo-unit">KM/H</div>
          <div className="hud-bar">
            <div style={{ width: `${rpmPct}%`, background: rpmPct > 85 ? "#ff5c33" : "#ffb62e" }} />
          </div>
          <div className="hud-label">
            <span>RPM</span>
            <span>{Math.round(te.rpm)}</span>
          </div>
          <div className="gear-paddle">{te.gear}</div>
        </div>

        <div className="hud-card" style={{ textAlign: "right" }}>
          {showMinimap && (
            <canvas
              ref={(el) => {
                if (el) ctxRef.current = el.getContext("2d");
              }}
              width={150}
              height={150}
              style={{ display: "block", marginBottom: 8, borderRadius: 6 }}
            />
          )}
          <div className="hud-bar" style={{ width: 150 }}>
            <div
              style={{
                width: `${te.fuelPct}%`,
                background: te.fuelPct < 15 ? "#ff5c33" : "#6fbf4f",
              }}
            />
          </div>
          <div className="hud-label" style={{ width: 150 }}>
            <span>FUEL {Math.round(te.fuelPct)}%</span>
            <span>{te.rangeKm.toFixed(0)} KM RANGE</span>
          </div>
          <div className="hud-label" style={{ width: 150 }}>
            <span>{te.engineOn ? "ENGINE ON" : "ENGINE OFF"}</span>
            <span>{te.headlightsOn ? "LIGHTS" : ""}</span>
          </div>
          <div className="hud-label" style={{ width: 150 }}>
            <span>{te.doorsOpen ? "DOORS OPEN" : "DOORS CLOSED"}</span>
            <span>{te.passengers} PAX</span>
          </div>
        </div>
      </div>

      {paused === false && te.fuelPct < 12 && (
        <div
          style={{
            position: "fixed",
            top: 60,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(255,92,51,0.9)",
            padding: "8px 18px",
            borderRadius: 8,
            fontWeight: 700,
            zIndex: 20,
          }}
        >
          ⛽ LOW FUEL — find a fuel station (Phase 4) or press B to reset if stranded
        </div>
      )}
    </>
  );
}
