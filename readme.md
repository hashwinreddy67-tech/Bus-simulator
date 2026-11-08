# 🚌 Metro Transit: Advanced Bus Simulator

A deep, realistic Bus Simulator — drive real routes, manage your depot, handle passengers, weather, traffic, and build a transit empire across an open city.

---

## 🎮 Overview

**Metro Transit** isn't just a driving game — it's a full transit operations simulator. Take the wheel as a rookie driver and work your way up: from short suburban shuttles to articulated city buses, night lines, and eventually your own bus company with hired drivers, purchased routes, and a depot full of vehicles.

Every ride matters. Follow the schedule, keep passengers happy, respect traffic laws, and manage fuel, wear, and the clock.

---

## ✨ Key Features

### 🛣️ Realistic Driving
- **Physics-based bus handling** — suspension, weight transfer, air brakes, ABS, and traction control
- **Multiple bus types**: midibus, city bus, articulated (bendy) bus, double-decker, electric trolleybus
- **Fully modeled cockpits**: working mirrors, dashboard, door controls,.DriverManager's ISIM display, transmission with automatic & manual modes
- **Seat & steering wheel adjustment** before departure

### 🧍 Passenger Simulation
- Passengers board and alight at stops with arrival prediction by trust in your punctuality
- Ticket sales, invalid tickets, fare dodgers, and priority seats (elderly/pregnant/strollers)
- Passenger mood system: late arrivals, hard braking, and missed stops lower satisfaction
- Holiday, rush hour, and school traffic affect passenger volumes

### 🕒 Route & Schedule System
- Timed timetables withlayover times at terminals
- Route editor: build your own routes, stops, breakpoints
- Dynamic events: roadworks, accidents, sudden bad weather, lost passenger incidents
- Bus stops Anno with infrastructure claims (shelters, ticket machines, display screens)

### 🌦️ Dynamic World
- Full day/night cycle with dynamic lighting
- Weather system: clear, rain, fog, snow, ice — each affects grip and visibility
- Living traffic: AI cars, pedestrians, other buses on your line
- Interactive traffic lights, crosswalks, palm-stop bus lanes

### 🏢 Career & Management
- **Driver career**: XP, licenses, rank progression (Rookie → Veteran → Transit Legend)
- **Company mode**: buy buses, apply for line licenses, hire NPC drivers, set fares
- Depot management: refueling, washing, maintenance, workshops, vehicle damage repair
- Economy: fuel costs, fines, ticket revenue, bank loans

### 🗺️ Open City
- Large handcrafted city map with suburbs, downtown, industrial districts, and countryside
- Interior shopping, liveries customizerDecals, paint, and company branding tool
- Screenshot/photo mode with director tools

---

## 🎯 Game Modes

| Mode | Description |
|-----------|-------------|
| **Career** | Start a no. 1 driver and grow a transit authority |
| **Free Roam** | Drive any unlocked bus with no timetable pressure |
| **Missions** | 40 scripted challenges: hairpin routes, record revenue, rescue runs |
| **Sandbox** | Full route editor + unlimited budget, for tinkerers |

---

## ⌨️ Controls

> Fully rebindable. Controller and steering-wheel peripherals supported.

| Action | Keyboard | Gamepad |
|-----------------|-------------|--------------|
| Accelerate / Brake | `W` / `S` | `RT` / `LT` |
| Steering | `A` / `D` | Left stick |
| Handbrake | `Space` | `X` |
| Doors (open/close) | `E` | `Y` |
| Horn | `H` | `B` |
| Turn signals | `Q` / `R` | D-pad Left/Right |
| Lights | `L` | D-pad Up |
| Wipers | `T` | D-pad Down |
| Route guidance UI | `Tab` | `Select` |
| Camera views | `1`–`6` | `RS` press |
| Pause / menu | `Esc` | `Start` |

---

## 🚀 Installation

### Requirements
- **OS**: Windows 10 64-bit (Linux/macOS planned)
- **CPU**: Intel Core i5-8400 / AMD Ryzen 5 2600 or better
- **GPU**: NVIDIA GTX 1060 6GB / AMD RX 580 or better
- **RAM**: 8 GB (16 GB recommended)
- **Storage**: 25 GB available space

### Setup (development build)
```bash
git clone https://github.com/yourname/metro-transit.git
cd metro-transit

# Install dependencies
npm install        # or: pnpm install

# Run in dev mode
npm run dev

# Build for production
npm run build
```

---

## 🛠️ Tech Stack

- **Engine**: [chosen engine — e.g., Godot / Unity / Unreal / Three.js]
- **Language**: [e.g., C# / C++ / GDScript / TypeScript]
- **Physics**: [e.g., custom vehicle model / PhysX / Bullet]
- **Audio**: positional 3D engine, air brake and bell sounds recorded from real buses

---

## 🗓️ Roadmap

- [x] Core driving physics prototype
- [x] Passenger boarding system
- [ ] Weather & traffic AI
- [ ] Route editor
- [ ] Company management mode
- [ ] Multiplayer co-op depot (long-term)

---

## 🤝 Contributing

Contributions are welcome! Check out `CONTRIBUTING.md` for code style, branch conventions, and bug report guidelines. Good first issues are tagged [`good first issue`](../../issues).

---

## 📜 License

[MIT](LICENSE) © 2026 Metro Transit Team

---

<p align="center"><i>Buckle up. Doors closing — mind the gap. 🚏</i></p>
