import { useState, useEffect, useRef, useCallback } from "react";

// ─── CONFIG ──────────────────────────────────────────────────────
// Point this at your Glances API. For production, use your real URL.
const GLANCES_API = "/api/4";
const POLL_INTERVAL = 2000; // ms

// ─── MOCK DATA (used when GLANCES_API is empty) ─────────────────
const MOCK_CONTAINERS = [
  { name: "jellyfin",      cpu: 2.1,  mem: 512e6,  net_rx: 3.2e6,  net_tx: 0.8e6,  uptime: "14d 3h" },
  { name: "navidrome",     cpu: 0.3,  mem: 128e6,  net_rx: 0.1e6,  net_tx: 0.05e6, uptime: "14d 3h" },
  { name: "sonarr",        cpu: 0.8,  mem: 256e6,  net_rx: 0.4e6,  net_tx: 0.2e6,  uptime: "14d 3h" },
  { name: "radarr",        cpu: 0.6,  mem: 245e6,  net_rx: 0.3e6,  net_tx: 0.15e6, uptime: "14d 3h" },
  { name: "lidarr",        cpu: 0.2,  mem: 198e6,  net_rx: 0.1e6,  net_tx: 0.05e6, uptime: "14d 3h" },
  { name: "prowlarr",      cpu: 0.4,  mem: 167e6,  net_rx: 0.2e6,  net_tx: 0.1e6,  uptime: "14d 3h" },
  { name: "bazarr",        cpu: 0.1,  mem: 89e6,   net_rx: 0.05e6, net_tx: 0.02e6, uptime: "14d 3h" },
  { name: "qbittorrent",   cpu: 1.4,  mem: 312e6,  net_rx: 8.5e6,  net_tx: 5.2e6,  uptime: "14d 3h" },
  { name: "caddy",         cpu: 0.1,  mem: 34e6,   net_rx: 0.5e6,  net_tx: 0.4e6,  uptime: "14d 3h" },
  { name: "gluetun",       cpu: 0.3,  mem: 45e6,   net_rx: 9.1e6,  net_tx: 6.3e6,  uptime: "14d 3h" },
  { name: "unmanic",       cpu: 0.0,  mem: 156e6,  net_rx: 0.02e6, net_tx: 0.01e6, uptime: "5d 12h" },
  { name: "slskd",         cpu: 0.2,  mem: 112e6,  net_rx: 1.2e6,  net_tx: 0.8e6,  uptime: "14d 3h" },
  { name: "seerr",         cpu: 0.1,  mem: 198e6,  net_rx: 0.3e6,  net_tx: 0.2e6,  uptime: "14d 3h" },
  { name: "nextcloud",     cpu: 0.5,  mem: 278e6,  net_rx: 0.4e6,  net_tx: 0.6e6,  uptime: "14d 3h" },
  { name: "immich_server", cpu: 1.2,  mem: 445e6,  net_rx: 1.5e6,  net_tx: 2.1e6,  uptime: "14d 3h" },
  { name: "homepage",      cpu: 0.1,  mem: 67e6,   net_rx: 0.1e6,  net_tx: 0.05e6, uptime: "14d 3h" },
  { name: "glances",       cpu: 0.8,  mem: 98e6,   net_rx: 0.2e6,  net_tx: 0.1e6,  uptime: "14d 3h" },
  { name: "uptime-kuma",   cpu: 0.2,  mem: 78e6,   net_rx: 0.15e6, net_tx: 0.08e6, uptime: "14d 3h" },
  { name: "dockge",        cpu: 0.1,  mem: 45e6,   net_rx: 0.08e6, net_tx: 0.04e6, uptime: "14d 3h" },
];

const generateMockData = (prev) => {
  const jitter = (base, range) => base + (Math.random() - 0.5) * range;
  const prevCpu = prev?.cpu?.total || 24;
  const prevNet = prev?.network || {};
  return {
    cpu: {
      total: Math.max(1, Math.min(100, jitter(prevCpu, 8))),
      cores: Array.from({ length: 10 }, (_, i) =>
        Math.max(1, Math.min(100, jitter(prev?.cpu?.cores?.[i] || 15 + Math.random() * 30, 12)))
      ),
      model: "Intel Core i5-14400",
      freq: 4198,
    },
    mem: {
      percent: Math.max(20, Math.min(85, jitter(prev?.mem?.percent || 42, 3))),
      used: 10.1 * 1024 * 1024 * 1024,
      total: 24 * 1024 * 1024 * 1024,
    },
    sensors: [
      { label: "Package", value: Math.max(30, Math.min(85, jitter(prev?.sensors?.[0]?.value || 48, 4))), unit: "C" },
      { label: "Core 0", value: Math.max(30, Math.min(85, jitter(prev?.sensors?.[1]?.value || 45, 3))), unit: "C" },
      { label: "Core 1", value: Math.max(30, Math.min(85, jitter(prev?.sensors?.[2]?.value || 43, 3))), unit: "C" },
    ],
    uptime: "12d 7h 34m",
    fs: [
      { mnt_point: "/", device_name: "/dev/nvme0n1p2", percent: 34, used: 45.2 * 1e9, size: 233.4 * 1e9 },
      { mnt_point: "/mnt/ironwolf", device_name: "/dev/sda1", percent: 61, used: 4.5 * 1e12, size: 7.3 * 1e12 },
    ],
    diskio: [
      { disk_name: "nvme0n1", read_bytes: jitter(prev?.diskio?.[0]?.read_bytes || 2.1e6, 1e6), write_bytes: jitter(prev?.diskio?.[0]?.write_bytes || 0.8e6, 5e5) },
      { disk_name: "sda", read_bytes: jitter(prev?.diskio?.[1]?.read_bytes || 45e6, 20e6), write_bytes: jitter(prev?.diskio?.[1]?.write_bytes || 12e6, 8e6) },
    ],
    network: {
      rx: Math.max(0, jitter(prevNet.rx || 2.4e6, 1.5e6)),
      tx: Math.max(0, jitter(prevNet.tx || 0.8e6, 0.5e6)),
    },
    docker: MOCK_CONTAINERS.map((c) => {
      const p = prev?.docker?.find((d) => d.name === c.name) || c;
      return {
        name: c.name,
        status: c.name === "dockge" ? (Math.random() > 0.05 ? "running" : "paused") : "running",
        cpu: Math.max(0, Math.min(100, jitter(p.cpu, c.cpu * 0.5 + 0.1))),
        mem: c.mem,
        net_rx: Math.max(0, jitter(p.net_rx, c.net_rx * 0.3)),
        net_tx: Math.max(0, jitter(p.net_tx, c.net_tx * 0.3)),
        uptime: c.uptime,
      };
    }),
  };
};

// ─── HELPERS ─────────────────────────────────────────────────────
const fmt = {
  bytes: (b) => {
    if (b >= 1e12) return (b / 1e12).toFixed(1) + " TB";
    if (b >= 1e9) return (b / 1e9).toFixed(1) + " GB";
    if (b >= 1e6) return (b / 1e6).toFixed(1) + " MB";
    if (b >= 1e3) return (b / 1e3).toFixed(1) + " KB";
    return b.toFixed(0) + " B";
  },
  speed: (bps) => fmt.bytes(Math.abs(bps)) + "/s",
  pct: (v) => Math.round(v) + "%",
  temp: (v) => Math.round(v) + "°C",
  num: (v) => Math.round(v).toLocaleString(),
  freq: (mhz) => (mhz / 1000).toFixed(1) + " GHz",
};

const statusColor = (pct) => {
  if (pct < 50) return "var(--accent)";
  if (pct < 75) return "var(--warn)";
  return "var(--crit)";
};

const tempColor = (t) => {
  if (t < 50) return "var(--accent)";
  if (t < 70) return "var(--warn)";
  return "var(--crit)";
};

// ─── 2EZ LOGO ────────────────────────────────────────────────────
const Logo = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="120" height="120" rx="24" fill="var(--accent)" />
    <text x="60" y="78" textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontWeight="800" fontSize="52" fill="var(--bg)" letterSpacing="-2">
      2EZ
    </text>
  </svg>
);

// ─── ANIMATED NUMBER ─────────────────────────────────────────────
const AnimNum = ({ value, format = "pct", className = "" }) => {
  const ref = useRef(null);
  const prevVal = useRef(value);
  const frameRef = useRef(null);

  useEffect(() => {
    const start = prevVal.current;
    const end = value;
    const duration = 600;
    const startTime = performance.now();

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      if (ref.current) {
        ref.current.textContent = fmt[format](current);
      }
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        prevVal.current = end;
      }
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value, format]);

  return <span ref={ref} className={className}>{fmt[format](value)}</span>;
};

// ─── PROGRESS BAR ────────────────────────────────────────────────
const Bar = ({ value, color, height = 6, label, detail, delay = 0 }) => (
  <div style={{ marginBottom: 10, animationDelay: `${delay}ms` }} className="bar-wrap">
    {label && (
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span className="label-sm">{label}</span>
        <span className="label-sm mono" style={{ color: color || statusColor(value) }}>
          <AnimNum value={value} />
        </span>
      </div>
    )}
    <div className="bar-track" style={{ height }}>
      <div
        className="bar-fill"
        style={{
          width: `${Math.min(100, Math.max(0, value))}%`,
          background: color || statusColor(value),
          height: "100%",
        }}
      />
    </div>
    {detail && <div className="label-xs" style={{ marginTop: 2, opacity: 0.5 }}>{detail}</div>}
  </div>
);

// ─── MINI SPARKLINE ──────────────────────────────────────────────
const Spark = ({ data, color = "var(--accent)", height = 32, width = 100 }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={`sg-${color.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill={`url(#sg-${color.replace(/[^a-z0-9]/gi, "")})`}
      />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ─── CARD ────────────────────────────────────────────────────────
const Card = ({ title, children, span = 1, delay = 0, onClick }) => (
  <div
    className={`card fade-in${onClick ? " card-clickable" : ""}`}
    style={{ gridColumn: `span ${span}`, animationDelay: `${delay}ms` }}
    onClick={onClick}
  >
    {title && (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div className="card-title" style={{ margin: 0 }}>{title}</div>
        {onClick && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, flexShrink: 0 }}>
            <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
            <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
          </svg>
        )}
      </div>
    )}
    {children}
  </div>
);

// ─── RING GAUGE ──────────────────────────────────────────────────
const Ring = ({ value, size = 100, stroke = 7, color, label, format = "pct" }) => {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(100, Math.max(0, value)) / 100) * circ;
  const c = color || statusColor(value);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--card-border)" strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c} strokeWidth={stroke}
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round" className="ring-progress"
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="mono" style={{ fontSize: size * 0.22, fontWeight: 700, color: c, lineHeight: 1 }}>
            <AnimNum value={value} format={format} />
          </div>
        </div>
      </div>
      {label && <div className="label-xs">{label}</div>}
    </div>
  );
};

// ─── DOCKER DOT ──────────────────────────────────────────────────
const DockerItem = ({ name, status, cpu, mem }) => {
  const running = status === "running";
  return (
    <div className="docker-item">
      <div className="docker-dot-wrap">
        <div className={`docker-dot ${running ? "dot-live" : "dot-dead"}`} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="docker-name">{name}</div>
        <div className="label-xs" style={{ opacity: 0.4 }}>
          {cpu.toFixed(1)}% · {fmt.bytes(mem)}
        </div>
      </div>
    </div>
  );
};

// ─── CONTAINER DETAIL VIEW ───────────────────────────────────────
const parseUptime = (s) => {
  if (!s || s === "—") return 0;
  let t = 0;
  const d = s.match(/(\d+)d/); if (d) t += +d[1] * 86400;
  const h = s.match(/(\d+)h/); if (h) t += +h[1] * 3600;
  const m = s.match(/(\d+)m/); if (m) t += +m[1] * 60;
  return t;
};

const SORT_KEYS = {
  name:   (c) => c.name.toLowerCase(),
  cpu:    (c) => c.cpu,
  mem:    (c) => c.mem,
  net_rx: (c) => c.net_rx,
  net_tx: (c) => c.net_tx,
  uptime: (c) => parseUptime(c.uptime),
};

const ContainerDetail = ({ containers, onClose }) => {
  const [sortKey, setSortKey] = useState("cpu");
  const [sortDir, setSortDir] = useState("desc");

  const handleSort = (key) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...containers].sort((a, b) => {
    const av = SORT_KEYS[sortKey](a);
    const bv = SORT_KEYS[sortKey](b);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "desc" ? -cmp : cmp;
  });

  const ColHeader = ({ label, id }) => {
    const active = sortKey === id;
    return (
      <span
        onClick={() => handleSort(id)}
        className={`ct-col-header${active ? " ct-col-active" : ""}`}
      >
        {label}
        <svg
          width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          style={{ marginLeft: 4, opacity: active ? 1 : 0, transition: "opacity 0.15s, transform 0.2s", transform: active && sortDir === "asc" ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </span>
    );
  };

  return (
    <div className="container-detail fade-in">
      <div className="card" style={{ padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div className="card-title" style={{ margin: 0 }}>Containers</div>
            <span className="label-sm">
              {containers.filter(c => c.status === "running").length} / {containers.length} running
            </span>
          </div>
          <button className="close-btn" onClick={onClose}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Close
          </button>
        </div>

        <div className="ct-header">
          <ColHeader label="Container" id="name" />
          <ColHeader label="CPU"       id="cpu" />
          <ColHeader label="Memory"    id="mem" />
          <ColHeader label="Net ↓"     id="net_rx" />
          <ColHeader label="Net ↑"     id="net_tx" />
          <ColHeader label="Uptime"    id="uptime" />
        </div>

        <div>
          {sorted.map((c) => {
            const running = c.status === "running";
            const cpuColor = statusColor(c.cpu);
            return (
              <div key={c.name} className="ct-row">
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <div className={`docker-dot ${running ? "dot-live" : "dot-dead"}`} style={{ flexShrink: 0 }} />
                  <span className="mono" style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden", minWidth: 44 }}>
                    <div style={{ height: "100%", width: `${Math.min(100, c.cpu * 5)}%`, background: cpuColor, borderRadius: 2, transition: "width 0.6s cubic-bezier(0.22,1,0.36,1)" }} />
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: cpuColor, width: 38, textAlign: "right" }}>{c.cpu.toFixed(1)}%</span>
                </div>
                <span className="mono label-sm">{fmt.bytes(c.mem)}</span>
                <span className="mono label-sm" style={{ color: "var(--accent)" }}>↓ {fmt.speed(c.net_rx)}</span>
                <span className="mono label-sm" style={{ color: "var(--warn)" }}>↑ {fmt.speed(c.net_tx)}</span>
                <span className="label-sm">{c.uptime || "—"}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── MAIN DASHBOARD ──────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState({ cpu: [], rx: [], tx: [] });
  const [time, setTime] = useState(new Date());
  const [connected, setConnected] = useState(true);
  const [containerView, setContainerView] = useState(false);

  const fetchData = useCallback(async () => {
    if (!GLANCES_API) {
      setData((prev) => generateMockData(prev));
      setConnected(true);
      return;
    }
    try {
      const endpoints = ["cpu", "mem", "sensors", "uptime", "fs", "diskio", "network", "containers", "percpu"];
      const results = await Promise.all(
        endpoints.map((ep) =>
          fetch(`${GLANCES_API}/${ep}`).then((r) => r.json()).catch(() => null)
        )
      );
      const [cpu, mem, sensors, uptime, fs, diskio, network, docker, percpu] = results;

      // Normalize the Glances API response into our data shape
      const netIface = network ? (Array.isArray(network) ? network.find(n => !n.interface_name?.startsWith("lo") && !n.interface_name?.startsWith("docker") && !n.interface_name?.startsWith("veth") && !n.interface_name?.startsWith("br-") && !n.interface_name?.startsWith("tailscale")) || network[0] : network) : {};

      setData({
        cpu: {
          total: cpu?.total || 0,
          cores: Array.isArray(percpu) ? percpu.map(c => c.total) : [],
          model: cpu?.cpucore ? `${cpu.cpucore} cores` : "",
          freq: cpu?.cpufreq_current || 0,
        },
        mem: { percent: mem?.percent || 0, used: mem?.used || 0, total: mem?.total || 0 },
        sensors: (sensors || []).filter(s => s.type === "temperature_core").slice(0, 5).map(s => ({
          label: s.label, value: s.value, unit: "C"
        })),
        uptime: typeof uptime === "string" ? uptime : "—",
        fs: fs || [],
        diskio: diskio || [],
        network: { rx: netIface?.bytes_recv_rate_per_sec || 0, tx: netIface?.bytes_sent_rate_per_sec || 0 },
        docker: (Array.isArray(docker) ? docker : []).map(c => ({
          name: c.name || "unknown",
          status: c.status || "stopped",
          cpu: c.cpu_percent || c.cpu?.total || 0,
          mem: c.memory_usage || c.memory?.usage || 0,
          net_rx: c.network_rx || c.network?.rx || 0,
          net_tx: c.network_tx || c.network?.tx || 0,
          uptime: c.uptime || "—",
        })),
      });
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData]);

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!data) return;
    setHistory((h) => ({
      cpu: [...h.cpu.slice(-59), data.cpu.total],
      rx: [...h.rx.slice(-59), data.network.rx],
      tx: [...h.tx.slice(-59), data.network.tx],
    }));
  }, [data]);

  if (!data) {
    return (
      <div className="loading">
        <Logo size={48} />
        <div style={{ marginTop: 16, opacity: 0.5 }}>Connecting…</div>
      </div>
    );
  }

  const runningCount = data.docker.filter((d) => d.status === "running").length;
  const sortedDocker = [...data.docker].sort((a, b) => b.cpu - a.cpu);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&family=Outfit:wght@300;400;500;600;700&display=swap');

        :root {
          --bg: #0a0e14;
          --bg2: #0f1318;
          --card: rgba(255,255,255,0.025);
          --card-hover: rgba(255,255,255,0.04);
          --card-border: rgba(255,255,255,0.06);
          --text: #e0e4ea;
          --text-dim: rgba(224,228,234,0.45);
          --accent: #22d3a7;
          --accent-dim: rgba(34,211,167,0.12);
          --warn: #f59e0b;
          --crit: #ef4444;
          --radius: 14px;
          --font: 'Outfit', -apple-system, sans-serif;
          --mono: 'JetBrains Mono', monospace;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body, html, #root {
          background: var(--bg);
          color: var(--text);
          font-family: var(--font);
          -webkit-font-smoothing: antialiased;
          min-height: 100vh;
        }

        .shell {
          max-width: 1320px;
          margin: 0 auto;
          padding: 28px 24px 48px;
        }

        /* ── Header ── */
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 28px;
          padding-bottom: 20px;
          border-bottom: 1px solid var(--card-border);
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .header-title {
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.5px;
        }
        .header-sub {
          font-size: 13px;
          color: var(--text-dim);
          font-weight: 400;
        }
        .header-right {
          display: flex;
          align-items: center;
          gap: 18px;
          font-family: var(--mono);
          font-size: 12px;
          color: var(--text-dim);
        }
        .live-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--accent-dim);
          color: var(--accent);
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          font-family: var(--mono);
        }
        .live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent);
          animation: pulse-dot 2s ease-in-out infinite;
        }

        /* ── Grid ── */
        .grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }
        @media (max-width: 1100px) {
          .grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 600px) {
          .grid { grid-template-columns: 1fr; }
          .shell { padding: 16px 12px 32px; }
          .header { flex-direction: column; align-items: flex-start; gap: 12px; }
        }

        /* ── Card ── */
        .card {
          background: var(--card);
          border: 1px solid var(--card-border);
          border-radius: var(--radius);
          padding: 18px;
          transition: background 0.25s ease, border-color 0.25s ease;
        }
        .card:hover {
          background: var(--card-hover);
          border-color: rgba(255,255,255,0.09);
        }
        .card-title {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: var(--text-dim);
          font-weight: 600;
          margin-bottom: 14px;
        }

        /* ── Typography ── */
        .mono { font-family: var(--mono); }
        .big-num { font-size: 36px; font-weight: 700; line-height: 1; font-family: var(--mono); }
        .label-sm { font-size: 12px; color: var(--text-dim); font-weight: 400; }
        .label-xs { font-size: 10px; color: var(--text-dim); font-weight: 400; }

        /* ── Bar ── */
        .bar-track {
          background: rgba(255,255,255,0.04);
          border-radius: 4px;
          overflow: hidden;
        }
        .bar-fill {
          border-radius: 4px;
          transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
        }

        /* ── Ring ── */
        .ring-progress {
          transition: stroke-dashoffset 0.6s cubic-bezier(0.22, 1, 0.36, 1);
        }

        /* ── Docker ── */
        .docker-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 6px;
        }
        @media (max-width: 600px) {
          .docker-grid { grid-template-columns: 1fr; }
        }
        .docker-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 10px;
          border-radius: 8px;
          background: rgba(255,255,255,0.015);
          transition: background 0.2s ease;
        }
        .docker-item:hover {
          background: rgba(255,255,255,0.04);
        }
        .docker-dot-wrap { flex-shrink: 0; }
        .docker-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
        }
        .dot-live {
          background: var(--accent);
          box-shadow: 0 0 6px var(--accent);
        }
        .dot-dead {
          background: var(--crit);
          box-shadow: 0 0 6px var(--crit);
          animation: pulse-crit 1.5s ease-in-out infinite;
        }
        .docker-name {
          font-family: var(--mono);
          font-size: 12px;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* ── Stat row ── */
        .stat-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 6px 0;
        }
        .stat-row + .stat-row {
          border-top: 1px solid rgba(255,255,255,0.03);
        }

        /* ── Network ── */
        .net-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }
        .net-arrow {
          font-size: 14px;
          width: 22px;
          text-align: center;
          flex-shrink: 0;
        }
        .net-val {
          font-family: var(--mono);
          font-size: 15px;
          font-weight: 600;
          min-width: 90px;
        }

        /* ── Temps ── */
        .temp-grid {
          display: flex;
          gap: 12px;
          justify-content: center;
          flex-wrap: wrap;
        }

        /* ── Uptime strip ── */
        .uptime-strip {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--mono);
          font-size: 13px;
          color: var(--accent);
          font-weight: 500;
        }

        /* ── Animations ── */
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-in {
          animation: fade-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes pulse-crit {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }

        .loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          font-family: var(--font);
          color: var(--text);
        }

        /* ── Cores mini grid ── */
        .cores-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 4px;
          margin-top: 12px;
        }
        .core-bar-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
        }
        .core-bar-outer {
          width: 100%;
          height: 32px;
          background: rgba(255,255,255,0.04);
          border-radius: 4px;
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: flex-end;
        }
        .core-bar-inner {
          width: 100%;
          border-radius: 4px;
          transition: height 0.6s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .core-label {
          font-family: var(--mono);
          font-size: 8px;
          color: var(--text-dim);
        }

        /* ── Section divider ── */
        .section-title {
          grid-column: 1 / -1;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 2px;
          color: var(--text-dim);
          font-weight: 600;
          padding-top: 8px;
        }

        /* ── Clickable card ── */
        .card-clickable {
          cursor: pointer;
        }
        .card-clickable:hover {
          border-color: rgba(34, 211, 167, 0.22) !important;
        }

        /* ── Close button ── */
        .close-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--card-border);
          border-radius: 8px;
          padding: 6px 12px;
          color: var(--text-dim);
          font-family: var(--font);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s, color 0.2s, border-color 0.2s;
        }
        .close-btn:hover {
          background: rgba(255,255,255,0.07);
          color: var(--text);
          border-color: rgba(255,255,255,0.12);
        }

        /* ── Container detail ── */
        .container-detail { width: 100%; }
        .ct-col-header {
          display: inline-flex;
          align-items: center;
          cursor: pointer;
          user-select: none;
          transition: color 0.15s;
          white-space: nowrap;
        }
        .ct-col-header:hover { color: var(--text); }
        .ct-col-active { color: var(--accent) !important; }
        .ct-header {
          display: grid;
          grid-template-columns: 1fr 180px 100px 120px 120px 90px;
          padding: 5px 10px 8px;
          gap: 12px;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: var(--text-dim);
          font-weight: 600;
          border-bottom: 1px solid var(--card-border);
          margin-bottom: 2px;
        }
        .ct-row {
          display: grid;
          grid-template-columns: 1fr 180px 100px 120px 120px 90px;
          align-items: center;
          padding: 9px 10px;
          gap: 12px;
          border-radius: 8px;
          transition: background 0.2s;
        }
        .ct-row:hover {
          background: rgba(255,255,255,0.025);
        }
        @media (max-width: 900px) {
          .ct-header, .ct-row {
            grid-template-columns: 1fr 120px 90px 100px 100px 70px;
            gap: 8px;
          }
        }
        @media (max-width: 600px) {
          .ct-header { display: none; }
          .ct-row { grid-template-columns: 1fr auto; }
          .ct-row > *:nth-child(n+3) { display: none; }
        }
      `}</style>

      <div className="shell">
        {/* ── HEADER ── */}
        <header className="header fade-in">
          <div className="header-left">
            <Logo size={38} />
            <div>
              <div className="header-title">2EZ</div>
              <div className="header-sub">2ez.dinosaur-banana.ts.net</div>
            </div>
          </div>
          <div className="header-right">
            <div className="uptime-strip">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              {data.uptime}
            </div>
            <span>{time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
            <div className="live-badge">
              <div className="live-dot" />
              {connected ? "LIVE" : "OFFLINE"}
            </div>
          </div>
        </header>

        {/* ── GRID / DETAIL ── */}
        {containerView ? (
          <ContainerDetail containers={data.docker} onClose={() => setContainerView(false)} />
        ) : (
        <div className="grid">

          {/* CPU */}
          <Card title="Processor" span={2} delay={50}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div className="big-num" style={{ color: statusColor(data.cpu.total) }}>
                  <AnimNum value={data.cpu.total} />
                </div>
                <div className="label-sm" style={{ marginTop: 4 }}>{data.cpu.model}</div>
                {data.cpu.freq > 0 && (
                  <div className="label-xs" style={{ marginTop: 2 }}>{fmt.freq(data.cpu.freq)}</div>
                )}
              </div>
              <div style={{ width: 120, flexShrink: 0 }}>
                <Spark data={history.cpu} color={statusColor(data.cpu.total)} height={40} width={120} />
              </div>
            </div>
            <div className="cores-grid">
              {data.cpu.cores.map((c, i) => (
                <div key={i} className="core-bar-wrap">
                  <div className="core-bar-outer">
                    <div
                      className="core-bar-inner"
                      style={{
                        height: `${Math.max(2, c)}%`,
                        background: statusColor(c),
                        opacity: 0.8,
                      }}
                    />
                  </div>
                  <span className="core-label">{i}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Memory */}
          <Card title="Memory" delay={100}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
              <Ring value={data.mem.percent} size={110} label="Used" />
            </div>
            <div className="stat-row">
              <span className="label-sm">Used</span>
              <span className="mono label-sm">{fmt.bytes(data.mem.used)}</span>
            </div>
            <div className="stat-row">
              <span className="label-sm">Total</span>
              <span className="mono label-sm">{fmt.bytes(data.mem.total)}</span>
            </div>
          </Card>

          {/* Temps */}
          <Card title="Temperatures" delay={150}>
            <div className="temp-grid">
              {data.sensors.map((s, i) => (
                <Ring key={i} value={s.value} size={72} stroke={5} color={tempColor(s.value)} label={s.label} format="temp" />
              ))}
            </div>
          </Card>

          {/* Storage */}
          <Card title="Storage" span={2} delay={200}>
            {data.fs.map((d, i) => (
              <Bar
                key={i}
                value={d.percent}
                label={d.mnt_point === "/" ? "Boot SSD" : d.mnt_point === "/mnt/ironwolf" ? "Ironwolf 8TB" : d.mnt_point}
                detail={`${fmt.bytes(d.used)} / ${fmt.bytes(d.size)}`}
                height={8}
                delay={i * 80}
              />
            ))}
            {data.diskio.length > 0 && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--card-border)", paddingTop: 10 }}>
                <div className="label-xs" style={{ marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>I/O Rates</div>
                {data.diskio.map((d, i) => (
                  <div key={i} className="stat-row">
                    <span className="mono label-sm">{d.disk_name}</span>
                    <span className="label-sm">
                      <span style={{ color: "var(--accent)" }}>↓ {fmt.speed(d.read_bytes)}</span>
                      {" · "}
                      <span style={{ color: "var(--warn)" }}>↑ {fmt.speed(d.write_bytes)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Network */}
          <Card title="Network" delay={250}>
            <div className="net-row">
              <span className="net-arrow" style={{ color: "var(--accent)" }}>↓</span>
              <span className="net-val" style={{ color: "var(--accent)" }}>
                <AnimNum value={Math.abs(data.network.rx)} format="speed" />
              </span>
            </div>
            <div style={{ marginBottom: 8 }}>
              <Spark data={history.rx} color="var(--accent)" height={28} width={180} />
            </div>
            <div className="net-row">
              <span className="net-arrow" style={{ color: "var(--warn)" }}>↑</span>
              <span className="net-val" style={{ color: "var(--warn)" }}>
                <AnimNum value={Math.abs(data.network.tx)} format="speed" />
              </span>
            </div>
            <div>
              <Spark data={history.tx} color="var(--warn)" height={28} width={180} />
            </div>
          </Card>

          {/* Docker header */}
          <Card title="Containers" span={1} delay={300} onClick={() => setContainerView(true)}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
              <span className="big-num" style={{ color: "var(--accent)" }}>{runningCount}</span>
              <span className="label-sm">/ {data.docker.length} running</span>
            </div>
            <div style={{ marginTop: 12 }}>
              <Bar
                value={(runningCount / data.docker.length) * 100}
                color="var(--accent)"
                height={4}
              />
            </div>
            <div className="stat-row" style={{ marginTop: 4 }}>
              <span className="label-sm">Total CPU</span>
              <span className="mono label-sm">{data.docker.reduce((a, d) => a + d.cpu, 0).toFixed(1)}%</span>
            </div>
            <div className="stat-row">
              <span className="label-sm">Total RAM</span>
              <span className="mono label-sm">{fmt.bytes(data.docker.reduce((a, d) => a + d.mem, 0))}</span>
            </div>
          </Card>

          {/* Docker list */}
          <Card title="Container Status" span={3} delay={350}>
            <div className="docker-grid">
              {sortedDocker.map((c, i) => (
                <DockerItem key={c.name} {...c} />
              ))}
            </div>
          </Card>

        </div>
        )}
      </div>
    </>
  );
}
