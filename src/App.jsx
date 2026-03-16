import { useState, useEffect, useRef } from "react";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const NUM_POINTS = 20;

// Normal readings stay well below warning thresholds at all times
// Alerts are handled by a separate dedicated scheduler — not random spikes
function generateReading(base, variance) {
  return parseFloat((base + (Math.random() - 0.5) * variance * 2).toFixed(2));
}

function initData() {
  return Array.from({ length: NUM_POINTS }, (_, i) => ({
    t: new Date(Date.now() - (NUM_POINTS - i) * 1200).toLocaleTimeString(),
    temp:    generateReading(72,  6),
    voltage: generateReading(218, 10),
    current: generateReading(4.5, 0.8),
    power:   generateReading(985, 60),
  }));
}

const SENSORS = [
  { key: "temp",    label: "Temperature", unit: "°C", base: 72,  variance: 6,   warn: 85,   crit: 95,   color: "#f97316" },
  { key: "voltage", label: "Voltage",     unit: "V",  base: 218, variance: 10,  warn: 240,  crit: 250,  color: "#3b82f6" },
  { key: "current", label: "Current",     unit: "A",  base: 4.5, variance: 0.8, warn: 6,    crit: 7,    color: "#10b981" },
  { key: "power",   label: "Power",       unit: "W",  base: 985, variance: 60,  warn: 1100, crit: 1200, color: "#a855f7" },
];

// ─── Scripted alert schedule ─────────────────────────────────────────────────
// Alerts follow a logarithmic series — gaps get progressively longer,
// mimicking how a real industrial system behaves: a few early events as the
// system warms up, then increasingly rare events during stable operation.
//
//  Alert 1 →  1 min  (system warming up)
//  Alert 2 →  6 min
//  Alert 3 → 20 min
//  Alert 4 →  1 hr
//  Alert 5 →  2 hr
//  Alert 6 →  4 hr
//  Alert 7 →  8 hr
//
// at = seconds after app loads when the alert fires
const SCRIPTED_ALERTS = [
  { at: 60,    sensor: "temp",    value: 88.4,  status: "WARNING"  },  // 1 min
  { at: 360,   sensor: "current", value: 6.3,   status: "WARNING"  },  // 6 min
  { at: 1200,  sensor: "temp",    value: 96.1,  status: "CRITICAL" },  // 20 min
  { at: 3600,  sensor: "voltage", value: 243.7, status: "WARNING"  },  // 1 hr
  { at: 7200,  sensor: "power",   value: 1187,  status: "WARNING"  },  // 2 hr
  { at: 14400, sensor: "current", value: 7.2,   status: "CRITICAL" },  // 4 hr
  { at: 28800, sensor: "temp",    value: 97.8,  status: "CRITICAL" },  // 8 hr
];

function getStatus(value, sensor) {
  if (value >= sensor.crit) return "CRITICAL";
  if (value >= sensor.warn) return "WARNING";
  return "NORMAL";
}

function StatusBadge({ status }) {
  const styles = {
    NORMAL:   { background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)"  },
    WARNING:  { background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)"  },
    CRITICAL: { background: "rgba(239,68,68,0.15)",  color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)"   },
  };
  return (
    <span style={{ ...styles[status], padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, letterSpacing: 1, fontFamily: "monospace" }}>
      {status}
    </span>
  );
}

function SensorCard({ sensor, data, active, onClick }) {
  const latest    = data[data.length - 1]?.[sensor.key] ?? 0;
  const status    = getStatus(latest, sensor);
  const glowColor = status === "CRITICAL" ? "#ef4444" : status === "WARNING" ? "#fbbf24" : sensor.color;

  return (
    <div
      onClick={onClick}
      style={{
        background:   active ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)",
        border:       `1px solid ${active ? glowColor : "rgba(255,255,255,0.08)"}`,
        borderRadius: 16,
        padding:      "20px 22px",
        cursor:       "pointer",
        transition:   "all 0.2s",
        boxShadow:    active ? `0 0 24px ${glowColor}22` : "none",
        position:     "relative",
        overflow:     "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 0, right: 0, width: 80, height: 80, borderRadius: "0 16px 0 80px", background: `${sensor.color}08` }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "'DM Mono', monospace" }}>
          {sensor.label}
        </span>
        <StatusBadge status={status} />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 14 }}>
        <span style={{ fontSize: 36, fontWeight: 700, color: glowColor, fontFamily: "'Space Mono', monospace", lineHeight: 1 }}>
          {latest}
        </span>
        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>{sensor.unit}</span>
      </div>
      <ResponsiveContainer width="100%" height={50}>
        <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${sensor.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={sensor.color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={sensor.color} stopOpacity={0}   />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey={sensor.key} stroke={sensor.color} strokeWidth={2} fill={`url(#grad-${sensor.key})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function AlertLog({ alerts }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "18px 20px", height: "100%", overflowY: "auto" }}>
      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14, fontFamily: "'DM Mono', monospace" }}>
        Alert Log
      </div>
      {alerts.length === 0 && (
        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 13 }}>No alerts triggered.</div>
      )}
      {alerts.map((a, i) => (
        <div key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <StatusBadge status={a.status} />
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "monospace" }}>{a.time}</span>
          </div>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 5 }}>{a.message}</div>
        </div>
      ))}
    </div>
  );
}

export default function IoTDashboard() {
  const [data, setData]       = useState(initData);
  const [active, setActive]   = useState("temp");
  const [alerts, setAlerts]   = useState([]);
  const [running, setRunning] = useState(true);

  const alertsRef = useRef([]);
  const startTime = useRef(Date.now());
  const firedRef  = useRef(new Set());

  // ── Sensor update loop — pure display, no alert logic ──────────────────────
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setData(prev => {
        const newRow = { t: new Date().toLocaleTimeString() };
        SENSORS.forEach(s => { newRow[s.key] = generateReading(s.base, s.variance); });
        return [...prev.slice(1), newRow];
      });
    }, 1200);
    return () => clearInterval(interval);
  }, [running]);

  // ── Alert scheduler ─────────────────────────────────────────────────────────
  // Checks every 5 seconds whether a scripted alert is due.
  // firedRef ensures each alert fires exactly once even if the checker
  // runs multiple times after the due time has passed.
  useEffect(() => {
    if (!running) return;
    const checker = setInterval(() => {
      const elapsed = (Date.now() - startTime.current) / 1000;
      SCRIPTED_ALERTS.forEach(event => {
        if (elapsed >= event.at && !firedRef.current.has(event.at)) {
          firedRef.current.add(event.at);
          const sensor = SENSORS.find(s => s.key === event.sensor);
          const entry  = {
            status:  event.status,
            message: `${sensor.label} reading ${event.value}${sensor.unit} exceeded ${event.status === "CRITICAL" ? "critical" : "warning"} threshold`,
            time:    new Date().toLocaleTimeString(),
          };
          alertsRef.current = [entry, ...alertsRef.current].slice(0, 30);
          setAlerts([...alertsRef.current]);
        }
      });
    }, 5000);
    return () => clearInterval(checker);
  }, [running]);

  const activeSensor = SENSORS.find(s => s.key === active);
  const latest       = data[data.length - 1];

  return (
    <div style={{
      minHeight:  "100vh",
      background: "#080c14",
      color:      "#fff",
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      padding:    "28px 32px",
    }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", letterSpacing: 3, textTransform: "uppercase", fontFamily: "monospace", marginBottom: 4 }}>
            Industrial IoT Platform
          </div>
          <h1 style={{ margin: 0, fontSize: 26,color: "#10b981", fontWeight: 700, letterSpacing: -0.5 }}>
            Sensor Monitoring Dashboard
          </h1>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            Node: <span style={{ color: "#10b981", fontFamily: "monospace" }}>GRID-UNIT-04</span> · Live telemetry
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: running ? "#10b981" : "#ef4444", boxShadow: running ? "0 0 8px #10b981" : "none" }} />
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>{running ? "LIVE" : "PAUSED"}</span>
          </div>
          <button
            onClick={() => setRunning(r => !r)}
            style={{
              background: running ? "rgba(239,68,68,0.15)" : "rgba(16,185,129,0.15)",
              border:     `1px solid ${running ? "rgba(239,68,68,0.4)" : "rgba(16,185,129,0.4)"}`,
              color:      running ? "#ef4444" : "#10b981",
              borderRadius: 8, padding: "7px 18px", cursor: "pointer", fontSize: 12, fontWeight: 600, letterSpacing: 0.5,
            }}
          >
            {running ? "Pause" : "Resume"}
          </button>
        </div>
      </div>

      {/* Sensor Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {SENSORS.map(s => (
          <SensorCard key={s.key} sensor={s} data={data} active={active === s.key} onClick={() => setActive(s.key)} />
        ))}
      </div>

      {/* Main Chart + Alert Log */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "20px 22px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", fontFamily: "monospace" }}>
              {activeSensor?.label} · Time Series
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              {SENSORS.map(s => (
                <div
                  key={s.key}
                  onClick={() => setActive(s.key)}
                  style={{
                    width: 10, height: 10, borderRadius: "50%", background: s.color,
                    cursor: "pointer", opacity: active === s.key ? 1 : 0.3,
                    boxShadow: active === s.key ? `0 0 8px ${s.color}` : "none",
                    transition: "all 0.2s",
                  }}
                />
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="t" tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10, fontFamily: "monospace" }} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10, fontFamily: "monospace" }} />
              <Tooltip
                contentStyle={{ background: "#0f1623", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "rgba(255,255,255,0.5)" }}
                itemStyle={{ color: activeSensor?.color }}
              />
              <Line type="monotone" dataKey={active} stroke={activeSensor?.color} strokeWidth={2.5} dot={false} animationDuration={300} />
              {activeSensor && (
                <Line type="monotone" dataKey={() => activeSensor.warn} stroke={activeSensor.color} strokeWidth={1} strokeDasharray="4 4" dot={false} strokeOpacity={0.4} />
              )}
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
            {SENSORS.map(s => (
              <div key={s.key} style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", fontFamily: "monospace" }}>{s.label}</span>
                <span style={{ color: s.color, fontSize: 14, fontWeight: 700, fontFamily: "monospace" }}>{latest?.[s.key]}{s.unit}</span>
              </div>
            ))}
          </div>
        </div>
        <AlertLog alerts={alerts} />
      </div>

      <div style={{ marginTop: 20, color: "rgba(255,255,255,0.2)", fontSize: 11, fontFamily: "monospace", textAlign: "center" }}>
        Akintola Al-Ameen ·
      </div>
    </div>
  );
}
