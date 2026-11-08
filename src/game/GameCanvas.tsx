"use client";

import { useEffect, useRef, useState } from "react";
import { GameEngine } from "@/game/engine";
import { telemetry } from "@/game/telemetry";
import { useGame } from "@/game/state";
import { getBusSpec } from "@/game/buses";

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [ready, setReady] = useState(false);
  const tripsRef = useRef({ reported: false, committed: false });

  useEffect(() => {
    if (!canvasRef.current) return;
    const store = useGame.getState();
    store.loadSave();

    const engine = new GameEngine(
      canvasRef.current,
      {
        onPauseToggle: () => {
          const s = useGame.getState();
          s.setPaused(!s.paused);
        },
        onTripProgress: () => {
          /* telemetry object is authoritative; read on exit */
        },
      },
      {
        renderScale: store.settings.renderScale,
        steeringSensitivity: store.settings.steeringSensitivity,
        sfxVolume: store.settings.sfxVolume,
        busSpec: getBusSpec(store.activeBusId),
      },
    );
    engineRef.current = engine;
    setReady(true);

    let prevPaused = false;
    const unsubPaused = useGame.subscribe((state) => {
      if (state.paused !== prevPaused) {
        prevPaused = state.paused;
        engine.setPausedExternal(state.paused);
        engine.setPaused(state.paused);
        if (!state.paused) {
          // resume session telemetry continues; commit happens on exit
        }
      }
      engine.setSettings(state.settings);
    });

    const onExit = () => {
      const s = useGame.getState();
      const t = telemetry;
      if (t.tripDistanceM > 1 && !tripsRef.current.committed) {
        tripsRef.current.committed = true;
        s.commitTrip({
          distanceMeters: t.tripDistanceM,
          // passenger revenue is a Phase 3 system; Phase 1 earns driving XP only
          earnings: 0,
          bestSpeedKph: t.speedKph,
          xp: Math.floor(t.tripDistanceM / 100),
        });
      }
    };

    return () => {
      unsubPaused();
      onExit();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      {!ready && (
        <div className="overlay">
          <div className="panel">Loading engine…</div>
        </div>
      )}
    </div>
  );
}
