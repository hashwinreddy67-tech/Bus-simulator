"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useGame } from "@/game/state";
import { BUS_FLEET, getBusSpec } from "@/game/buses";

/**
 * Phase 2 dealership: buy/sell buses with REAL transaction logic,
 * garage management, and instant "delivery to depot" (set active).
 */
export default function DealershipPage() {
  const money = useGame((s) => s.money);
  const owned = useGame((s) => s.ownedBuses);
  const active = useGame((s) => s.activeBusId);
  const buyBus = useGame((s) => s.buyBus);
  const sellBus = useGame((s) => s.sellBus);
  const setActiveBus = useGame((s) => s.setActiveBus);
  const loadSave = useGame((s) => s.loadSave);
  const [tab, setTab] = useState<"shop" | "garage">("shop");
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    loadSave();
  }, [loadSave]);

  function notify(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2600);
  }

  const sellValue = (id: string) => Math.floor(getBusSpec(id).price * 0.6);

  return (
    <>
      <div className="menu-bg" />
      <div
        style={{
          position: "fixed",
          inset: 0,
          overflowY: "auto",
          padding: "36px 6vw 60px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div className="subtitle">PHASE 2 • FLEET</div>
            <h1 className="title-xl" style={{ fontSize: 44 }}>BUS DEALERSHIP</h1>
          </div>
          <div className="panel" style={{ minWidth: 220 }}>
            <div style={{ fontSize: 12, color: "#8b93a7", letterSpacing: "0.2em" }}>BALANCE</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#ffb62e" }}>
              ₹{money.toLocaleString("en-IN")}
            </div>
            <div style={{ fontSize: 12, color: "#8b93a7", marginTop: 4 }}>
              {owned.length} bus{owned.length === 1 ? "" : "es"} owned · active:{" "}
              <b style={{ color: "#eef1f8" }}>{getBusSpec(active).name}</b>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, margin: "22px 0 16px" }}>
          {(["shop", "garage"] as const).map((t) => (
            <button
              key={t}
              className="menu-btn"
              style={{ width: 180, background: tab === t ? "rgba(255,182,46,0.15)" : undefined }}
              onClick={() => setTab(t)}
            >
              {t === "shop" ? "Showroom" : `My Garage (${owned.length})`}
            </button>
          ))}
          <Link href="/" style={{ textDecoration: "none", marginLeft: "auto" }}>
            <button className="menu-btn" style={{ width: 150 }}>← Main Menu</button>
          </Link>
        </div>

        {flash && (
          <div
            style={{
              background: "rgba(255,182,46,0.16)",
              border: "1px solid #ffb62e",
              padding: "10px 18px",
              borderRadius: 8,
              marginBottom: 16,
              fontWeight: 600,
            }}
          >
            {flash}
          </div>
        )}

        {tab === "shop" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 16 }}>
            {BUS_FLEET.map((b) => {
              const isOwned = owned.includes(b.id);
              const canAfford = money >= b.price;
              return (
                <div key={b.id} className="panel">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <b style={{ fontSize: 17 }}>{b.name}</b>
                    <span style={{ color: "#8b93a7", fontSize: 11, letterSpacing: "0.1em" }}>
                      {b.category.toUpperCase()}
                    </span>
                  </div>
                  <div className="stat-grid" style={{ margin: "12px 0" }}>
                    <div>Seats<br /><b>{b.seatCapacity}</b></div>
                    <div>Top speed<br /><b>{b.topSpeedKph} km/h</b></div>
                    <div>Torque<br /><b>{b.maxTorqueNm} Nm</b></div>
                    <div>{b.fuelType === "Electric" ? "Battery" : "Tank"}<br /><b>{b.tankLiters} {b.fuelType === "Electric" ? "kWh" : "L"}</b></div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#ffb62e", marginBottom: 10 }}>
                    {b.price === 0 ? "Starter (owned)" : `₹${b.price.toLocaleString("en-IN")}`}
                  </div>
                  {!isOwned ? (
                    <button
                      className="menu-btn"
                      disabled={!canAfford}
                      onClick={() => {
                        if (buyBus(b.id, b.price)) notify(`${b.name} purchased — delivered & set as your active bus.`);
                        else notify("Not enough money.");
                      }}
                    >
                      {canAfford ? "Buy & Deliver" : "Not enough balance"}
                    </button>
                  ) : (
                    <button
                      className="menu-btn"
                      onClick={() => {
                        sellBus(b.id, sellValue(b.id));
                        notify(`${b.name} sold for ₹${sellValue(b.id).toLocaleString("en-IN")}.`);
                      }}
                    >
                      Sell (60% of new price)
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 16 }}>
            {owned.map((id) => {
              const b = getBusSpec(id);
              return (
                <div key={id} className="panel" style={{ outline: id === active ? "2px solid #ffb62e" : undefined }}>
                  <b style={{ fontSize: 17 }}>{b.name}</b>
                  {id === active && (
                    <div style={{ color: "#ffb62e", fontSize: 12, marginTop: 4 }}>ACTIVE — drives next session</div>
                  )}
                  <div className="stat-grid" style={{ margin: "12px 0" }}>
                    <div>Seats<br /><b>{b.seatCapacity}</b></div>
                    <div>Mass<br /><b>{b.massKg.toLocaleString("en-IN")} kg</b></div>
                    <div>Top speed<br /><b>{b.topSpeedKph} km/h</b></div>
                    <div>Resale<br /><b>₹{sellValue(id).toLocaleString("en-IN")}</b></div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="menu-btn"
                      disabled={id === active}
                      onClick={() => {
                        setActiveBus(id);
                        notify(`${b.name} is now your active bus.`);
                      }}
                      style={{ flex: 1 }}
                    >
                      {id === active ? "Currently Active" : "Set Active"}
                    </button>
                    <button
                      className="menu-btn"
                      onClick={() => {
                        sellBus(id, sellValue(id));
                        notify(`${b.name} sold for ₹${sellValue(id).toLocaleString("en-IN")}.`);
                      }}
                      style={{ flex: 1, borderLeftColor: "#ff5c33" }}
                    >
                      Sell
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
