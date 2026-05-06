import { useState, useEffect, useRef, useCallback, forwardRef, createContext, useContext } from "react";
import { createPortal } from "react-dom";

// ─── CONFIG ──────────────────────────────────────────────────────
const GLANCES_API   = "/api/4";
const POLL_INTERVAL = 2000;
const JF_KEY        = "176d8ddc607e4278b4f198723b69bd9e";
const NAV_PARAMS    = "u=tuohy&t=c3414658e4154ef03e5453c495b3b06f&s=poopy1&v=1.16.1&c=2ez-dashboard&f=json";
const ST_TOKEN      = "FEXsBlewacEQZtiCoU3DQVSyJ49iVDlbZjPXqRDQ86093df3";

// ─── SERVICES REGISTRY ───────────────────────────────────────────
const SVC = {
  sonarr:      { id: "sonarr",      name: "Sonarr",         url: "https://2ez.dinosaur-banana.ts.net/sonarr",    abbr: "SN", col: "#3B82F6", desc: "TV show management"   },
  radarr:      { id: "radarr",      name: "Radarr",         url: "https://2ez.dinosaur-banana.ts.net/radarr",    abbr: "RD", col: "#EF4444", desc: "Movie management"       },
  prowlarr:    { id: "prowlarr",    name: "Prowlarr",       url: "https://2ez.dinosaur-banana.ts.net/prowlarr",  abbr: "PW", col: "#F97316", desc: "Indexer manager"        },
  bazarr:      { id: "bazarr",      name: "Bazarr",         url: "https://2ez.dinosaur-banana.ts.net/bazarr",    abbr: "BZ", col: "#14B8A6", desc: "Subtitle management"    },
  seerr:       { id: "seerr",       name: "Seerr",          url: "https://2ez.dinosaur-banana.ts.net:5056",      abbr: "SE", col: "#6366F1", desc: "Media requests"         },
  nextcloud:   { id: "nextcloud",   name: "Nextcloud",      url: "https://2ez.dinosaur-banana.ts.net:8444",      abbr: "NC", col: "#0082C9", desc: "File sync & share"      },
  immich:      { id: "immich",      name: "Immich",         url: "https://2ez.dinosaur-banana.ts.net:2284",      abbr: "IC", col: "#F59E0B", desc: "Photo management"       },
  cockpit:     { id: "cockpit",     name: "Cockpit",        url: "https://2ez.dinosaur-banana.ts.net:9091",      abbr: "CP", col: "#EF4444", desc: "System management"      },
  dockge:      { id: "dockge",      name: "Dockge",         url: "https://2ez.dinosaur-banana.ts.net:5002",      abbr: "DK", col: "#22D3A7", desc: "Container management"   },
  filebrowser: { id: "filebrowser", name: "File Browser",   url: "https://2ez.dinosaur-banana.ts.net:8084",      abbr: "FB", col: "#8B5CF6", desc: "Web file manager"       },
  slskd:       { id: "slskd",       name: "SLSKD",          url: "https://2ez.dinosaur-banana.ts.net:5031",      abbr: "SL", col: "#EC4899", desc: "Soulseek daemon"        },
  beetsflask:  { id: "beetsflask",  name: "Beets-Flask",    url: "https://2ez.dinosaur-banana.ts.net:5086",      abbr: "BT", col: "#10B981", desc: "Music tagger"           },
  lrcget:      { id: "lrcget",      name: "LRCGET",         url: "http://100.107.207.57:5800",                   abbr: "LR", col: "#F59E0B", desc: "Lyrics fetcher"         },
  jellyfin:    { id: "jellyfin",    name: "Jellyfin",       url: "https://2ez.dinosaur-banana.ts.net/jellyfin",  abbr: "JF", col: "#00A4DC", desc: "Media server"           },
  navidrome:   { id: "navidrome",   name: "Navidrome",      url: "https://2ez.dinosaur-banana.ts.net/navidrome", abbr: "NV", col: "#F97316", desc: "Music server"           },
  qbt:         { id: "qbt",         name: "qBittorrent",    url: "http://192.168.0.170:8080",                    abbr: "QB", col: "#2979FF", desc: "Torrent client"         },
  unmanic:     { id: "unmanic",     name: "Unmanic",        url: "http://192.168.0.170:8888/unmanic/",           abbr: "UM", col: "#FF6D00", desc: "Media transcoder"       },
  speedtest:   { id: "speedtest",   name: "Speedtest",      url: "http://192.168.0.170:8083",                    abbr: "ST", col: "#22D3A7", desc: "Speed history"          },
  uptimekuma:  { id: "uptimekuma",  name: "Uptime Kuma",    url: "http://192.168.0.170:3001",                    abbr: "UK", col: "#5CDD8B", desc: "Service monitoring"     },
};

// ─── SERVICE ICONS ────────────────────────────────────────────────
const ICON_PATHS = {
  // TV monitor + antenna — Sonarr
  sonarr: <><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M12 7V3"/><path d="M9 3l3 4 3-3"/><path d="M7 17h10"/></>,
  // Film clapperboard — Radarr
  radarr: <><rect x="2" y="8" width="20" height="14" rx="2"/><path d="M2 13h20"/><path d="M4 8V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2"/><path d="M7 6l2 2M13 5l2 3"/></>,
  // Magnifying glass with inner arc — Prowlarr
  prowlarr: <><circle cx="10" cy="10" r="7"/><path d="M21 21l-4.35-4.35"/><path d="M7 10a3 3 0 0 1 3-3"/></>,
  // Chat bubble with subtitle lines — Bazarr
  bazarr: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="13" x2="13" y2="13"/></>,
  // Eye with sparkle — Seerr
  seerr: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/><path d="M19.5 5l1-1M21 5h-1.5M19.5 5v1.5"/></>,
  // Cloud — Nextcloud
  nextcloud: <><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></>,
  // Camera — Immich
  immich: <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></>,
  // Clock dial — Cockpit
  cockpit: <><circle cx="12" cy="12" r="10"/><path d="M12 8v4l2.5 2.5"/><path d="M6.5 6.5l1 1M17.5 6.5l-1 1M5 13H4M20 13h-1M17.5 18l-1-1M6.5 18l1-1"/></>,
  // Stacked boxes — Dockge
  dockge: <><path d="M12 2l9 5v10l-9 5-9-5V7l9-5z"/><path d="M12 22V12M3 7l9 5 9-5"/></>,
  // Folder with plus — File Browser
  filebrowser: <><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></>,
  // Share nodes — SLSKD (P2P)
  slskd: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></>,
  // Price tag with music note — Beets
  beetsflask: <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1" fill="currentColor" stroke="none"/><path d="M14 9v3"/><path d="M12 11h4"/></>,
  // Microphone — LRCGET
  lrcget: <><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>,
  // Play button in circle — Jellyfin
  jellyfin: <><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></>,
  // Music notes — Navidrome
  navidrome: <><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>,
  // Download with magnet hint — qBittorrent
  qbt: <><path d="M12 2a7 7 0 0 1 7 7v1h2a3 3 0 1 1 0 6h-2v1a7 7 0 0 1-14 0v-1H3a3 3 0 1 1 0-6h2V9a7 7 0 0 1 7-7z"/><path d="M12 8v8M9 13l3 4 3-4"/></>,
  // Swap arrows — Unmanic (transcode)
  unmanic: <><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></>,
  // Gauge/speedometer — Speedtest
  speedtest: <><circle cx="12" cy="12" r="10"/><path d="M12 6v2M7.05 7.05l1.41 1.41M5 13H3M21 13h-2M17.54 8.46l-1.41 1.41"/><path d="M12 13l-3-5"/><circle cx="12" cy="13" r="1.5" fill="currentColor" stroke="none"/></>,
  // Heartbeat line — Uptime Kuma
  uptimekuma: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
};

function SvcIcon({ id, color, size = 20 }) {
  const paths = ICON_PATHS[id];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "block", flexShrink: 0 }}>
      {paths ?? <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="700" fill={color} stroke="none">{SVC[id]?.abbr}</text>}
    </svg>
  );
}

// ─── MOCK DATA ───────────────────────────────────────────────────
const MOCK_CONTAINERS = [
  { name: "jellyfin",      cpu: 2.1,  mem: 512e6,  net_rx: 3.2e6,  net_tx: 0.8e6,  uptime: "14d 3h" },
  { name: "navidrome",     cpu: 0.3,  mem: 128e6,  net_rx: 0.1e6,  net_tx: 0.05e6, uptime: "14d 3h" },
  { name: "sonarr",        cpu: 0.8,  mem: 256e6,  net_rx: 0.4e6,  net_tx: 0.2e6,  uptime: "14d 3h" },
  { name: "radarr",        cpu: 0.6,  mem: 245e6,  net_rx: 0.3e6,  net_tx: 0.15e6, uptime: "14d 3h" },
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
  { name: "glances",       cpu: 0.8,  mem: 98e6,   net_rx: 0.2e6,  net_tx: 0.1e6,  uptime: "14d 3h" },
  { name: "uptime-kuma",   cpu: 0.2,  mem: 78e6,   net_rx: 0.15e6, net_tx: 0.08e6, uptime: "14d 3h" },
  { name: "dockge",        cpu: 0.1,  mem: 45e6,   net_rx: 0.08e6, net_tx: 0.04e6, uptime: "14d 3h" },
];

const generateMockData = (prev) => {
  const jitter = (base, range) => base + (Math.random() - 0.5) * range;
  const prevCpu = prev?.cpu?.total || 24;
  const prevLan = prev?.network?.lan || {};
  const prevTs  = prev?.network?.ts  || {};
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
    memswap: {
      percent: Math.max(0, Math.min(90, jitter(prev?.memswap?.percent || 14, 4))),
      used: 1.1 * 1024 * 1024 * 1024,
      total: 8 * 1024 * 1024 * 1024,
      sin:  Math.max(0, jitter(prev?.memswap?.sin  || 0, 1e5)),
      sout: Math.max(0, jitter(prev?.memswap?.sout || 0, 1e5)),
    },
    sensors: [
      { label: "Package", value: Math.max(30, Math.min(85, jitter(prev?.sensors?.[0]?.value || 48, 4))), unit: "C" },
      { label: "Core 0",  value: Math.max(30, Math.min(85, jitter(prev?.sensors?.[1]?.value || 45, 3))), unit: "C" },
      { label: "Core 1",  value: Math.max(30, Math.min(85, jitter(prev?.sensors?.[2]?.value || 43, 3))), unit: "C" },
    ],
    uptime: "12d 7h 34m",
    fs: [
      { mnt_point: "/",              device_name: "/dev/nvme0n1p2", percent: 34, used: 45.2 * 1e9,  size: 233.4 * 1e9 },
      { mnt_point: "/mnt/ironwolf",  device_name: "/dev/sda1",      percent: 61, used: 4.5 * 1e12,  size: 7.3 * 1e12  },
    ],
    diskio: [
      { disk_name: "nvme0n1", read_bytes: jitter(prev?.diskio?.[0]?.read_bytes || 2.1e6, 1e6),  write_bytes: jitter(prev?.diskio?.[0]?.write_bytes || 0.8e6, 5e5) },
      { disk_name: "sda",     read_bytes: jitter(prev?.diskio?.[1]?.read_bytes || 45e6,  20e6), write_bytes: jitter(prev?.diskio?.[1]?.write_bytes || 12e6,  8e6) },
    ],
    network: {
      lan: { rx: Math.max(0, jitter(prevLan.rx || 2.4e6, 1.5e6)), tx: Math.max(0, jitter(prevLan.tx || 0.8e6, 0.5e6)) },
      ts:  { rx: Math.max(0, jitter(prevTs.rx  || 0.3e6, 0.1e6)), tx: Math.max(0, jitter(prevTs.tx  || 0.1e6, 0.05e6)) },
    },
    docker: MOCK_CONTAINERS.map((c) => {
      const p = prev?.docker?.find((d) => d.name === c.name) || c;
      return {
        name: c.name,
        status: "running",
        cpu: Math.max(0, Math.min(100, jitter(p.cpu, c.cpu * 0.5 + 0.1))),
        mem: c.mem,
        net_rx: Math.max(0, jitter(p.net_rx, c.net_rx * 0.3)),
        net_tx: Math.max(0, jitter(p.net_tx, c.net_tx * 0.3)),
        uptime: c.uptime,
      };
    }),
    processes: [
      { pid: 1,    name: "systemd",   username: "root",   cpu_percent: 0.0, memory_percent: 0.1, num_threads: 1,  status: "S", cmdline: ["/sbin/init"] },
      { pid: 1234, name: "python3",   username: "root",   cpu_percent: jitter(12, 4), memory_percent: 2.3, num_threads: 4,  status: "S", cmdline: ["python3", "glances"] },
      { pid: 5678, name: "jellyfin",  username: "tuohy",  cpu_percent: jitter(6, 3),  memory_percent: 4.1, num_threads: 32, status: "S", cmdline: ["/usr/bin/jellyfin"] },
      { pid: 910,  name: "nginx",     username: "www-data", cpu_percent: 0.2, memory_percent: 0.3, num_threads: 2, status: "S", cmdline: ["nginx", "-g", "daemon off;"] },
    ],
  };
};

// ─── HELPERS ─────────────────────────────────────────────────────
const fmt = {
  bytes: (b) => {
    if (b >= 1e12) return (b / 1e12).toFixed(1) + " TB";
    if (b >= 1e9)  return (b / 1e9).toFixed(1)  + " GB";
    if (b >= 1e6)  return (b / 1e6).toFixed(1)  + " MB";
    if (b >= 1e3)  return (b / 1e3).toFixed(1)  + " KB";
    return b.toFixed(0) + " B";
  },
  speed: (bps) => fmt.bytes(Math.abs(bps)) + "/s",
  pct:   (v)   => Math.round(v) + "%",
  temp:  (v)   => Math.round(v) + "°C",
  num:   (v)   => Math.round(v).toLocaleString(),
  freq:  (mhz) => (mhz / 1000).toFixed(1) + " GHz",
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

// ─── GLOBAL CSS ──────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&family=Outfit:wght@300;400;500;600;700&display=swap');

  :root {
    --bg: #080c12;
    --bg2: #0b0f18;
    --card: rgba(255,255,255,0.09);
    --card-hover: rgba(255,255,255,0.15);
    --card-border: rgba(255,255,255,0.20);
    --card-shadow: 0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.18);
    --card-shadow-hover: 0 20px 56px rgba(0,0,0,0.55), 0 6px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.22);
    --text: #e0e4ea;
    --text-dim: rgba(224,228,234,0.45);
    --accent: #22d3a7;
    --accent-dim: rgba(34,211,167,0.12);
    --warn: #f59e0b;
    --crit: #ef4444;
    --radius: 20px;
    --font: 'Outfit', -apple-system, sans-serif;
    --mono: 'JetBrains Mono', monospace;
    --row-h: 150px;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }
  body, html, #root { background: var(--bg); background-image: radial-gradient(ellipse at 15% 0%, rgba(34,211,167,0.14) 0%, transparent 55%), radial-gradient(ellipse at 85% 100%, rgba(99,102,241,0.12) 0%, transparent 55%); color: var(--text); font-family: var(--font); -webkit-font-smoothing: antialiased; min-height: 100vh; overflow-x: hidden; max-width: 100vw; }

  /* ── Shell ── */
  .shell { max-width: 1320px; margin: 0 auto; padding: 28px 24px 48px; }

  /* ── Header ── */
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid var(--card-border); }
  .header-left { display: flex; align-items: center; gap: 14px; }
  .header-title { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
  .header-sub { font-size: 13px; color: var(--text-dim); font-weight: 400; }
  .header-url { font-size: 13px; color: var(--text-dim); font-weight: 400; }
  .header-right { display: flex; align-items: center; gap: 18px; font-family: var(--mono); font-size: 12px; color: var(--text-dim); }

  /* ── Live badge ── */
  .live-badge { display: flex; align-items: center; gap: 6px; background: var(--accent-dim); color: var(--accent); padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; font-family: var(--mono); flex-shrink: 0; border: 1px solid rgba(34,211,167,0.22); box-shadow: 0 0 16px rgba(34,211,167,0.12); }
  .live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: pulse-dot 2s ease-in-out infinite; }

  /* ── Grid (main dashboard) ── */
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); grid-auto-rows: var(--row-h, 150px); gap: 18px; align-items: stretch; position: relative; }
  @media (max-width: 1100px) { .grid { grid-template-columns: repeat(2, 1fr); grid-template-rows: unset !important; grid-auto-rows: auto; align-items: start; } .grid > * { grid-column: auto !important; grid-row: auto !important; } .card { height: auto; } .live-svc-card { height: auto; } .svc-card { height: auto; } }
  @media (max-width: 600px)  { .grid { grid-template-columns: 1fr; grid-template-rows: unset !important; grid-auto-rows: auto; width: 100%; max-width: 100%; overflow: hidden; } .grid > * { grid-column: auto !important; grid-row: span var(--card-rows, 1) !important; max-width: 100%; } .grid.half-mobile { grid-template-columns: repeat(2, 1fr); } .live-svc-card { height: auto; max-width: 100%; overflow: hidden; } .shell { padding: 16px 12px 32px; max-width: 100vw; overflow-x: hidden; box-sizing: border-box; } .header { gap: 8px; } .header-left { gap: 8px; flex: 1; min-width: 0; overflow: hidden; } .header-right { gap: 8px; flex-shrink: 0; } .header-url { display: none; } .header-clock { display: none; } .uptime-strip { display: none; } .live-stat { padding: 6px 8px; min-width: 0; } .live-stat-val { font-size: 13px; } .now-playing-row { overflow: hidden; min-width: 0; } .now-playing-row .label-xs { min-width: 0; } }

  /* ── Card ── */
  .card { background: var(--card); border: 1px solid var(--card-border); border-radius: var(--radius); padding: 18px; box-shadow: var(--card-shadow); backdrop-filter: blur(22px) saturate(160%); -webkit-backdrop-filter: blur(22px) saturate(160%); transition: background 0.28s ease, border-color 0.28s ease, box-shadow 0.28s ease, transform 0.28s cubic-bezier(0.22, 1, 0.36, 1); height: 100%; box-sizing: border-box; overflow: hidden; }
  .card:hover { background: var(--card-hover); border-color: rgba(255,255,255,0.20); box-shadow: var(--card-shadow-hover); transform: translateY(-4px); }
  .card-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--text-dim); font-weight: 600; margin-bottom: 14px; }
  .card-clickable { cursor: pointer; }
  .card-clickable:hover { border-color: rgba(34, 211, 167, 0.35) !important; box-shadow: var(--card-shadow-hover), 0 0 0 1px rgba(34,211,167,0.18) !important; }

  /* ── Typography ── */
  .mono { font-family: var(--mono); }
  .big-num { font-size: 36px; font-weight: 700; line-height: 1; font-family: var(--mono); }
  .label-sm { font-size: 12px; color: var(--text-dim); font-weight: 400; }
  .label-xs { font-size: 10px; color: var(--text-dim); font-weight: 400; }

  /* ── Bar ── */
  .bar-track { background: rgba(255,255,255,0.06); border-radius: 6px; overflow: hidden; }
  .bar-fill { border-radius: 4px; transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1); }

  /* ── Ring ── */
  .ring-progress { transition: stroke-dashoffset 0.6s cubic-bezier(0.22, 1, 0.36, 1); }

  /* ── Docker ── */
  .docker-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
  @media (max-width: 600px) { .docker-grid { grid-template-columns: 1fr; } }
  .docker-item { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); transition: background 0.2s ease, border-color 0.2s ease; }
  .docker-item:hover { background: rgba(255,255,255,0.07); border-color: rgba(255,255,255,0.11); }
  .docker-dot-wrap { flex-shrink: 0; }
  .docker-dot { width: 7px; height: 7px; border-radius: 50%; }
  .dot-live { background: var(--accent); box-shadow: 0 0 6px var(--accent); }
  .dot-dead { background: var(--crit); box-shadow: 0 0 6px var(--crit); animation: pulse-crit 1.5s ease-in-out infinite; }
  .docker-name { font-family: var(--mono); font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* ── Stat row ── */
  .stat-row { display: flex; justify-content: space-between; align-items: baseline; padding: 6px 0; }
  .stat-row + .stat-row { border-top: 1px solid rgba(255,255,255,0.05); }

  /* ── Network ── */
  .net-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .net-arrow { font-size: 14px; width: 22px; text-align: center; flex-shrink: 0; }
  .net-val { font-family: var(--mono); font-size: 15px; font-weight: 600; min-width: 90px; }

  /* ── Temps ── */
  .temp-grid { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }

  /* ── Uptime strip ── */
  .uptime-strip { display: flex; align-items: center; gap: 8px; font-family: var(--mono); font-size: 13px; color: var(--accent); font-weight: 500; }

  /* ── Cores ── */
  .cores-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin-top: 12px; }
  .core-bar-wrap { display: flex; flex-direction: column; align-items: center; gap: 3px; }
  .core-bar-outer { width: 100%; height: 32px; background: rgba(255,255,255,0.06); border-radius: 8px; position: relative; overflow: hidden; display: flex; align-items: flex-end; }
  .core-bar-inner { width: 100%; border-radius: 4px; transition: height 0.6s cubic-bezier(0.22, 1, 0.36, 1); }
  .core-label { font-family: var(--mono); font-size: 8px; color: var(--text-dim); }

  /* ── Section divider ── */
  .section-title { grid-column: 1 / -1; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: var(--text-dim); font-weight: 600; padding-top: 8px; }

  /* ── Close button ── */
  .close-btn { display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.04); border: 1px solid var(--card-border); border-radius: 8px; padding: 6px 12px; color: var(--text-dim); font-family: var(--font); font-size: 12px; font-weight: 500; cursor: pointer; transition: background 0.2s, color 0.2s, border-color 0.2s; }
  .close-btn:hover { background: rgba(255,255,255,0.07); color: var(--text); border-color: rgba(255,255,255,0.12); }

  /* ── Container detail ── */
  .container-detail { width: 100%; }
  .ct-col-header { display: inline-flex; align-items: center; cursor: pointer; user-select: none; transition: color 0.15s; white-space: nowrap; }
  .ct-col-header:hover { color: var(--text); }
  .ct-col-active { color: var(--accent) !important; }
  .ct-header { display: grid; grid-template-columns: 1fr 180px 100px 120px 120px 90px; padding: 5px 10px 8px; gap: 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--text-dim); font-weight: 600; border-bottom: 1px solid var(--card-border); margin-bottom: 2px; }
  .ct-row { display: grid; grid-template-columns: 1fr 180px 100px 120px 120px 90px; align-items: center; padding: 9px 10px; gap: 12px; border-radius: 8px; transition: background 0.2s; }
  .ct-row:hover { background: rgba(255,255,255,0.025); }
  @media (max-width: 900px) { .ct-header, .ct-row { grid-template-columns: 1fr 120px 90px 100px 100px 70px; gap: 8px; } }
  @media (max-width: 600px) { .ct-header { display: none; } .ct-row { grid-template-columns: 1fr auto; } .ct-row > *:nth-child(n+3) { display: none; } }

  /* ── Hamburger button ── */
  .hamburger-btn { background: none; border: none; color: var(--text-dim); cursor: pointer; padding: 8px; border-radius: 10px; display: flex; align-items: center; justify-content: center; transition: background 0.2s, color 0.2s; flex-shrink: 0; }
  .hamburger-btn:hover { background: var(--card-hover); color: var(--text); }

  /* ── Bottom tab bar (mobile only) ── */
  .bottom-tab-bar { display: none; }
  .tab-item { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; background: none; border: none; cursor: pointer; padding: 6px 4px; color: var(--text-dim); font-family: var(--font); transition: color 0.15s; -webkit-tap-highlight-color: transparent; }
  .tab-item.active { color: var(--accent); }
  .tab-item-label { font-size: 9px; font-weight: 500; letter-spacing: 0.3px; white-space: nowrap; }
  @media (max-width: 767px) {
    .hamburger-btn { display: none; }
    .bottom-tab-bar { display: flex; position: fixed; bottom: 0; left: 0; right: 0; height: calc(60px + max(env(safe-area-inset-bottom, 0px), 12px)); padding-bottom: max(env(safe-area-inset-bottom, 0px), 12px); background: rgba(8,12,18,0.88); backdrop-filter: blur(20px) saturate(150%); -webkit-backdrop-filter: blur(20px) saturate(150%); border-top: 1px solid rgba(255,255,255,0.10); z-index: 900; align-items: stretch; }
    .shell { padding-bottom: calc(80px + max(env(safe-area-inset-bottom, 0px), 12px)); }
  }

  /* ── Nav sidebar ── */
  .nav-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 999; backdrop-filter: blur(6px); }
  .nav-sidebar { position: fixed; top: 0; left: 0; height: 100vh; width: 256px; background: rgba(8,12,18,0.65); backdrop-filter: blur(32px) saturate(160%); -webkit-backdrop-filter: blur(32px) saturate(160%); border-right: 1px solid rgba(255,255,255,0.16); box-shadow: 4px 0 40px rgba(0,0,0,0.5); z-index: 1000; transform: translateX(-100%); transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1); display: flex; flex-direction: column; overflow-y: auto; }
  .nav-sidebar.open { transform: translateX(0); }
  .nav-header { padding: 22px 20px 16px; border-bottom: 1px solid var(--card-border); display: flex; align-items: center; gap: 12px; }
  .nav-header-title { font-size: 16px; font-weight: 700; }
  .nav-header-sub { font-size: 11px; color: var(--text-dim); margin-top: 1px; }
  .nav-section-lbl { padding: 18px 20px 6px; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: var(--text-dim); font-weight: 600; }
  .nav-item { display: flex; align-items: center; gap: 12px; padding: 10px 20px; cursor: pointer; background: none; border: none; color: var(--text-dim); font-family: var(--font); font-size: 14px; font-weight: 500; width: 100%; text-align: left; transition: background 0.15s, color 0.15s; border-radius: 0; }
  .nav-item:hover { background: rgba(255,255,255,0.03); color: var(--text); }
  .nav-item.active { color: var(--accent); background: var(--accent-dim); }
  .nav-item-icon { width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-family: var(--mono); font-size: 11px; font-weight: 700; flex-shrink: 0; box-shadow: 0 3px 10px rgba(0,0,0,0.3); }

  /* ── Service card grid ── */
  .svc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 18px; }
  @media (max-width: 600px) { .svc-grid { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); } }

  /* ── Service card ── */
  .svc-card { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; background: var(--card); border: 1px solid var(--card-border); border-radius: var(--radius); padding: 18px; text-decoration: none; color: var(--text); box-shadow: var(--card-shadow); backdrop-filter: blur(22px) saturate(160%); -webkit-backdrop-filter: blur(22px) saturate(160%); transition: background 0.28s, border-color 0.28s, box-shadow 0.28s, transform 0.28s cubic-bezier(0.22, 1, 0.36, 1); cursor: pointer; height: 100%; box-sizing: border-box; overflow: hidden; }
  .svc-card:hover { background: var(--card-hover); border-color: rgba(255,255,255,0.22); box-shadow: var(--card-shadow-hover); transform: translateY(-5px); }
  .svc-icon { width: 42px; height: 42px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-family: var(--mono); font-weight: 700; font-size: 12px; flex-shrink: 0; box-shadow: 0 4px 12px rgba(0,0,0,0.35); }
  .svc-name { font-size: 14px; font-weight: 600; line-height: 1.2; }
  .svc-desc { font-size: 11px; color: var(--text-dim); line-height: 1.4; }

  /* ── Live service card ── */
  .live-svc-card { display: flex; flex-direction: column; gap: 12px; background: var(--card); border: 1px solid var(--card-border); border-radius: var(--radius); padding: 18px; text-decoration: none; color: var(--text); box-shadow: var(--card-shadow); backdrop-filter: blur(22px) saturate(160%); -webkit-backdrop-filter: blur(22px) saturate(160%); transition: background 0.28s, border-color 0.28s, box-shadow 0.28s, transform 0.28s cubic-bezier(0.22, 1, 0.36, 1); cursor: pointer; height: 100%; box-sizing: border-box; overflow: hidden; }
  .live-svc-card:hover { background: var(--card-hover); border-color: rgba(255,255,255,0.22); box-shadow: var(--card-shadow-hover); transform: translateY(-5px); }
  .live-svc-top { display: flex; align-items: center; gap: 12px; }
  .live-svc-name { font-size: 14px; font-weight: 600; }
  .live-svc-desc { font-size: 11px; color: var(--text-dim); }

  /* ── Live stats row ── */
  .live-stats-row { display: flex; gap: 4px; flex-wrap: wrap; }
  .live-stat { display: flex; flex-direction: column; align-items: center; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.10); border-radius: 12px; padding: 8px 12px; flex: 1; min-width: 60px; box-shadow: 0 2px 8px rgba(0,0,0,0.25); }
  .live-stat-val { font-family: var(--mono); font-size: 16px; font-weight: 700; line-height: 1.2; color: var(--text); }
  .live-stat-lbl { font-size: 9px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.8px; margin-top: 2px; font-weight: 500; }

  /* ── Live now-playing / recent ── */
  .live-now-playing { border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px; display: flex; flex-direction: column; gap: 6px; }
  .now-playing-row { display: flex; align-items: center; gap: 8px; }
  .np-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .live-recent { border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px; display: flex; flex-direction: column; gap: 4px; }
  .recent-item { display: flex; justify-content: space-between; align-items: center; gap: 8px; }

  /* ── Page section heading ── */
  .page-section { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: var(--text-dim); font-weight: 600; margin-bottom: 16px; margin-top: 4px; }

  /* ── Animations ── */
  @keyframes fade-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .fade-in { animation: fade-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; }
  @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  @keyframes pulse-crit { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.85); } }
  @keyframes shimmer { from { background-position: -200% 0; } to { background-position: 200% 0; } }
  .skeleton-line { height: 12px; border-radius: 4px; background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 75%); background-size: 200% 100%; animation: shimmer 1.8s infinite; margin-bottom: 10px; }
  .skeleton-line:last-child { margin-bottom: 0; }

  .loading { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: var(--font); color: var(--text); }

  /* ── Settings cog button ── */
  .nav-footer { margin-top: auto; padding: 12px 16px 16px; border-top: 1px solid var(--card-border); }
  .settings-cog-btn { display: flex; align-items: center; gap: 10px; width: 100%; background: transparent; border: none; cursor: pointer; padding: 8px 10px; border-radius: 8px; color: var(--text-dim); font-family: var(--font); font-size: 13px; transition: background 0.15s, color 0.15s; }
  .settings-cog-btn:hover { background: rgba(255,255,255,0.06); color: var(--text); }
  .settings-cog-btn svg { flex-shrink: 0; }

  /* ── Settings panel ── */
  .settings-panel { position: fixed; bottom: 0; left: 256px; width: 300px; max-height: 80vh; overflow-y: auto; background: rgba(8,12,18,0.65); backdrop-filter: blur(32px) saturate(160%); -webkit-backdrop-filter: blur(32px) saturate(160%); border: 1px solid rgba(255,255,255,0.18); border-radius: 20px 20px 0 0; box-shadow: 0 -12px 60px rgba(0,0,0,0.5), 0 -2px 16px rgba(0,0,0,0.35); z-index: 1100; padding: 20px; font-family: var(--font); animation: slide-up 0.25s cubic-bezier(0.22,1,0.36,1) both; }
  @media (max-width: 600px) { .settings-panel { left: 0; width: 100%; border-radius: 12px 12px 0 0; } }
  @keyframes slide-up { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  .settings-panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
  .settings-panel-title { font-size: 13px; font-weight: 700; color: var(--text); text-transform: uppercase; letter-spacing: 1px; }
  .settings-section-lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--text-dim); font-weight: 600; margin-bottom: 10px; margin-top: 16px; }
  .settings-section-lbl:first-of-type { margin-top: 0; }

  /* ── Theme tiles ── */
  .theme-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .theme-tile { display: flex; flex-direction: column; align-items: center; gap: 6px; background: transparent; border: 2px solid transparent; border-radius: 10px; padding: 8px 4px; cursor: pointer; transition: border-color 0.15s; }
  .theme-tile:hover { border-color: rgba(255,255,255,0.2); }
  .theme-tile.active { border-color: var(--accent); }
  .theme-swatch { width: 44px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; gap: 3px; overflow: hidden; }
  .theme-swatch-dot { width: 8px; height: 8px; border-radius: 50%; }
  .theme-tile-name { font-size: 10px; color: var(--text-dim); font-family: var(--font); }

  /* ── Color pickers ── */
  .color-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
  .color-row:last-child { border-bottom: none; }
  .color-row-label { font-size: 12px; color: var(--text); }
  .color-input-wrap { display: flex; align-items: center; gap: 8px; }
  .color-input-wrap input[type=color] { width: 32px; height: 24px; border: none; border-radius: 4px; cursor: pointer; padding: 0; background: none; }
  .color-hex { font-family: var(--mono); font-size: 11px; color: var(--text-dim); width: 52px; }
  .reset-btn { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: var(--text-dim); font-family: var(--font); font-size: 10px; padding: 3px 8px; border-radius: 4px; cursor: pointer; transition: background 0.12s; }
  .reset-btn:hover { background: rgba(255,255,255,0.12); color: var(--text); }

  /* ── Drag-and-drop ── */
  .drag-item { cursor: grab; position: relative; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
  .drag-item:active { cursor: grabbing; }
  .drag-item.dragging { opacity: 0.3; pointer-events: none; }
  .drag-item.touch-pending { outline: 2px solid var(--accent); outline-offset: 3px; transition: outline 0.1s; }
  /* drop ghost: shows target position while dragging */
  .drop-ghost { border-radius: var(--radius); border: 2px dashed var(--accent); background: rgba(34,211,167,0.08); pointer-events: none; z-index: 5; transition: background 0.12s, border-color 0.12s; }
  /* sub-page SortableGrid indicators */
  .drag-item.drop-before::before { content: ''; position: absolute; top: 0; bottom: 0; left: -10px; width: 3px; background: var(--accent); border-radius: 2px; box-shadow: 0 0 10px var(--accent); z-index: 10; pointer-events: none; }
  .drag-item.drop-after::after { content: ''; position: absolute; top: 0; bottom: 0; right: -10px; width: 3px; background: var(--accent); border-radius: 2px; box-shadow: 0 0 10px var(--accent); z-index: 10; pointer-events: none; }
  /* ── Drag handle (desktop only — hidden on mobile) ── */
  .drag-handle { position: absolute; top: 8px; left: 8px; width: 20px; height: 28px; display: flex; align-items: center; justify-content: center; color: transparent; opacity: 0; cursor: grab; z-index: 11; touch-action: none; -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; border-radius: 4px; }
  @media (max-width: 767px) { .drag-item { -webkit-touch-callout: unset; cursor: default; } .drag-handle { display: none; } }

  /* ── Edit Layout button (mobile only) ── */
  .edit-layout-btn { display: none; background: none; border: none; color: var(--text-dim); cursor: pointer; padding: 6px; border-radius: 8px; transition: background 0.2s, color 0.2s; align-items: center; justify-content: center; flex-shrink: 0; }
  .edit-layout-btn:hover { background: var(--card-hover); color: var(--text); }
  @media (max-width: 767px) { .edit-layout-btn { display: flex; } }

  /* ── Layout edit modal ── */
  .layout-modal-backdrop { position: fixed; inset: 0; z-index: 2000; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); display: flex; align-items: flex-end; }
  .layout-modal { width: 100%; max-height: 88vh; background: rgba(12,17,24,0.98); backdrop-filter: blur(32px) saturate(160%); -webkit-backdrop-filter: blur(32px) saturate(160%); border-radius: 20px 20px 0 0; border-top: 1px solid rgba(255,255,255,0.12); display: flex; flex-direction: column; padding-bottom: max(env(safe-area-inset-bottom,0px),8px); animation: slide-up 0.25s cubic-bezier(0.22,1,0.36,1) both; }
  .layout-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px 14px; border-bottom: 1px solid rgba(255,255,255,0.08); flex-shrink: 0; }
  .layout-modal-title { font-size: 16px; font-weight: 700; }
  .layout-modal-list { overflow-y: auto; flex: 1; }
  .layout-modal-row { display: flex; align-items: center; justify-content: space-between; padding: 13px 20px; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .layout-modal-row-label { font-size: 14px; font-weight: 500; }
  .layout-modal-arrows { display: flex; gap: 8px; }
  .layout-modal-arrow { width: 36px; height: 36px; border-radius: 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.10); color: var(--text-dim); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.15s, color 0.15s; }
  .layout-modal-arrow:not(:disabled):active { background: rgba(255,255,255,0.12); color: var(--text); }
  .layout-modal-arrow:disabled { opacity: 0.2; cursor: default; }
  .layout-modal-footer { padding: 14px 20px 6px; border-top: 1px solid rgba(255,255,255,0.08); flex-shrink: 0; display: flex; gap: 10px; }
  .layout-modal-save { flex: 1; background: var(--accent); color: #0a0e15; border: none; border-radius: 12px; padding: 14px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: var(--font); transition: opacity 0.15s; }
  .layout-modal-save:hover { opacity: 0.88; }
  .layout-modal-cancel { flex: 1; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); color: var(--text-dim); border-radius: 12px; padding: 14px; font-size: 15px; font-weight: 600; cursor: pointer; font-family: var(--font); transition: background 0.15s, color 0.15s; }
  .layout-modal-cancel:hover { background: rgba(255,255,255,0.11); color: var(--text); }

  /* ── Size overlay for sub-page draggable grid ── */
  .size-overlay { position: absolute; top: 8px; right: 8px; z-index: 10; opacity: 0; transition: opacity 0.18s; pointer-events: none; }
  .drag-item:hover .size-overlay { opacity: 1; pointer-events: auto; }

  /* ── Card size control ── */
  .size-ctrl { display: flex; gap: 2px; align-items: center; flex-shrink: 0; }
  .size-btn { width: 20px; height: 18px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.08); background: transparent; color: var(--text-dim); font-family: var(--mono); font-size: 9px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.12s, color 0.12s, border-color 0.12s; padding: 0; }
  .size-btn:hover { background: rgba(255,255,255,0.08); color: var(--text); border-color: rgba(255,255,255,0.16); }
  .size-btn.sz-active { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }

  /* ── Alerts button & badge ── */
  .alerts-nav-btn { display: flex; align-items: center; gap: 10px; width: 100%; background: transparent; border: none; cursor: pointer; padding: 8px 10px; border-radius: 8px; color: var(--text-dim); font-family: var(--font); font-size: 13px; transition: background 0.15s, color 0.15s; }
  .alerts-nav-btn:hover { background: rgba(255,255,255,0.06); color: var(--text); }
  .alerts-nav-btn svg { flex-shrink: 0; }
  .alert-count-badge { margin-left: auto; min-width: 18px; height: 18px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; padding: 0 5px; }
  .alert-count-badge.crit { background: var(--crit); color: #fff; }
  .alert-count-badge.warn { background: var(--warn); color: #000; }
  .alert-count-badge.ok   { background: rgba(34,211,167,0.18); color: var(--ok); }

  /* ── Alert list items ── */
  .alert-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .alert-item:last-child { border-bottom: none; }
  .alert-state-pill { flex-shrink: 0; font-size: 9px; font-weight: 800; letter-spacing: 1px; padding: 2px 7px; border-radius: 4px; margin-top: 2px; }
  .alert-state-pill.critical { background: rgba(239,68,68,0.18); color: var(--crit); border: 1px solid rgba(239,68,68,0.3); }
  .alert-state-pill.warning  { background: rgba(245,158,11,0.18); color: var(--warn); border: 1px solid rgba(245,158,11,0.3); }
  .alert-item-type { font-size: 12px; font-weight: 600; color: var(--text); }
  .alert-item-meta { font-size: 10px; color: var(--text-dim); margin-top: 2px; }
  .alerts-all-clear { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 24px 0; color: var(--ok); font-size: 13px; }

  /* ── Notification bell ── */
  .bell-wrap { position: relative; }
  .bell-btn { position: relative; background: transparent; border: none; cursor: pointer; color: var(--text-dim); padding: 6px; border-radius: 8px; display: flex; align-items: center; justify-content: center; transition: color 0.15s, background 0.15s; }
  .bell-btn:hover { color: var(--text); background: rgba(255,255,255,0.07); }
  .bell-badge { position: absolute; top: 1px; right: 1px; min-width: 14px; height: 14px; background: var(--crit); border-radius: 7px; font-size: 8px; font-weight: 800; color: #fff; display: flex; align-items: center; justify-content: center; padding: 0 3px; border: 1.5px solid var(--bg); pointer-events: none; }

  /* ── Process modal ── */
  .proc-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); z-index: 8000; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .proc-modal { background: rgba(8,12,18,0.96); border: 1px solid rgba(255,255,255,0.16); border-radius: 16px; box-shadow: 0 24px 80px rgba(0,0,0,0.7); width: 100%; max-width: 1000px; max-height: 80vh; display: flex; flex-direction: column; overflow: hidden; }
  .proc-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.1); flex-shrink: 0; }
  .proc-table-wrap { overflow-y: auto; flex: 1; }
  .proc-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .proc-table th { text-align: left; padding: 8px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-dim); font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.1); position: sticky; top: 0; background: rgba(8,12,18,0.96); }
  .proc-table th.r, .proc-table td.r { text-align: right; }
  .proc-table td { padding: 6px 12px; border-bottom: 1px solid rgba(255,255,255,0.04); color: var(--text); font-family: var(--font); white-space: nowrap; }
  .proc-table tr:hover td { background: rgba(255,255,255,0.04); }
  .proc-table .mono { font-family: var(--mono); }
  .proc-table .dim { color: var(--text-dim); }
  .proc-cmd { max-width: 260px; overflow: hidden; text-overflow: ellipsis; font-family: var(--mono); font-size: 11px; color: var(--text-dim); }

  /* ── Notification drawer ── */
  .notif-drawer { position: fixed; width: 320px; max-height: 480px; overflow-y: auto; background: rgba(8,12,18,0.70); backdrop-filter: blur(32px) saturate(160%); -webkit-backdrop-filter: blur(32px) saturate(160%); border: 1px solid rgba(255,255,255,0.18); border-radius: 12px; box-shadow: 0 8px 40px rgba(0,0,0,0.55); z-index: 9999; }
  @keyframes slide-down { from { transform: translateY(-8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  .notif-drawer-anim { animation: slide-down 0.18s cubic-bezier(0.22,1,0.36,1) both; }
  .notif-drawer-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 12px; border-bottom: 1px solid rgba(255,255,255,0.12); position: sticky; top: 0; background: rgba(8,12,18,0.80); backdrop-filter: blur(32px); -webkit-backdrop-filter: blur(32px); z-index: 1; border-radius: 12px 12px 0 0; }
  .notif-drawer-title { font-size: 12px; font-weight: 700; color: var(--text); text-transform: uppercase; letter-spacing: 1px; }
  .notif-empty { padding: 32px 16px; text-align: center; font-size: 12px; color: var(--text-dim); }

  /* ── Notification items ── */
  .notif-item { position: relative; overflow: hidden; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .notif-item:last-child { border-bottom: none; }
  .notif-item-inner { display: flex; align-items: flex-start; gap: 10px; padding: 12px 16px; cursor: pointer; transition: background 0.15s; user-select: none; }
  .notif-item-inner:hover { background: rgba(255,255,255,0.04); }
  .notif-icon { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
  .notif-title { font-size: 12px; font-weight: 600; color: var(--text); }
  .notif-body  { font-size: 11px; color: var(--text-dim); margin-top: 2px; line-height: 1.4; }
  .notif-time  { font-size: 10px; color: var(--text-dim); margin-top: 4px; font-family: var(--mono); opacity: 0.7; }
  .notif-delete-btn { position: absolute; right: 0; top: 0; bottom: 0; width: 64px; display: flex; align-items: center; justify-content: center; background: var(--crit); border: none; color: #fff; font-size: 20px; cursor: pointer; }

  /* ── Quick Look Page ── */
  .ql-wrap { max-width: 440px; display: flex; flex-direction: column; gap: 12px; padding-top: 4px; }
  .ql-section { background: var(--card); border: 1px solid var(--card-border); border-radius: 16px; padding: 16px 18px; backdrop-filter: blur(22px) saturate(160%); }
  .ql-row-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
  .ql-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--text-dim); font-weight: 600; }
  .ql-value { font-size: 20px; font-weight: 700; font-family: var(--mono); line-height: 1; }
  .ql-cores { display: flex; gap: 4px; align-items: flex-end; height: 40px; margin-top: 12px; }
  .ql-core-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; height: 100%; }
  .ql-core-track { flex: 1; width: 100%; background: rgba(255,255,255,0.06); border-radius: 3px; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; min-height: 0; }
  .ql-core-fill { width: 100%; border-radius: 3px; transition: height 0.5s cubic-bezier(0.22, 1, 0.36, 1); min-height: 2px; }
  .ql-core-num { font-size: 8px; font-family: var(--mono); color: var(--text-dim); flex-shrink: 0; }
  .ql-load-row { display: flex; gap: 0; margin-top: 8px; }
  .ql-load-item { flex: 1; text-align: center; padding: 6px 0; border-right: 1px solid var(--card-border); }
  .ql-load-item:last-child { border-right: none; }
  .ql-load-val { font-size: 22px; font-weight: 700; font-family: var(--mono); color: var(--text); line-height: 1; }
  .ql-load-lbl { font-size: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }

  /* ── System Info Popover ── */
  .sysinfo-wrap { position: relative; display: inline-flex; align-items: center; }
  .sysinfo-btn { width: 16px; height: 16px; border-radius: 50%; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.16); color: var(--text-dim); font-size: 10px; font-style: italic; font-weight: 700; font-family: serif; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s, color 0.2s, border-color 0.2s; flex-shrink: 0; line-height: 1; padding: 0; }
  .sysinfo-btn:hover, .sysinfo-btn.active { background: var(--accent-dim); border-color: rgba(34,211,167,0.5); color: var(--accent); }
  .sysinfo-popover { position: fixed; z-index: 9999; background: rgba(8,12,18,0.94); backdrop-filter: blur(32px) saturate(160%); border: 1px solid var(--card-border); border-radius: 14px; padding: 14px 16px; min-width: 270px; box-shadow: 0 20px 56px rgba(0,0,0,0.65), 0 4px 16px rgba(0,0,0,0.4); }
  .sysinfo-heading { font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--accent); font-weight: 600; margin-bottom: 10px; }
  .sysinfo-row { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 5px 0; border-top: 1px solid rgba(255,255,255,0.05); }
  .sysinfo-row:first-child { border-top: none; }
  .sysinfo-lbl { font-size: 11px; color: var(--text-dim); white-space: nowrap; flex-shrink: 0; }
  .sysinfo-val { font-size: 11px; font-family: var(--mono); color: var(--text); text-align: right; word-break: break-all; }
  .sysinfo-divider { height: 1px; background: rgba(255,255,255,0.07); margin: 6px 0; }
  .sysinfo-loading { padding: 16px; text-align: center; font-size: 12px; color: var(--text-dim); }
`;

// ─── LOGO ────────────────────────────────────────────────────────
const DefaultLogoSvg = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="120" height="120" rx="24" fill="var(--accent)" />
    <text x="60" y="78" textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontWeight="800" fontSize="52" fill="var(--bg)" letterSpacing="-2">
      2EZ
    </text>
  </svg>
);

const Logo = ({ size = 32, onClick }) => {
  const [fallback, setFallback] = useState(false);
  const imgSize = Math.round(size * 1.68);

  const inner = !fallback
    ? <img src="/logo.png" width={imgSize} height={imgSize} style={{ borderRadius: 8, objectFit: "cover", flexShrink: 0 }} alt="logo" onError={() => setFallback(true)} />
    : <DefaultLogoSvg size={size} />;

  if (onClick) {
    return (
      <button onClick={onClick} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", flexShrink: 0 }}>
        {inner}
      </button>
    );
  }
  return inner;
};

// ─── HAMBURGER ICON ──────────────────────────────────────────────
const HamburgerIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="6"  x2="21" y2="6"  />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

// ─── DRAG HANDLE ─────────────────────────────────────────────────
// Rendered inside every draggable card. The touch hook ONLY starts a
// drag when the touch lands on this element, so the rest of the card
// remains fully scrollable / tappable.
const DragHandle = () => (
  <div className="drag-handle" data-drag-handle>
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
      <circle cx="2.5" cy="2"  r="1.5"/><circle cx="7.5" cy="2"  r="1.5"/>
      <circle cx="2.5" cy="8"  r="1.5"/><circle cx="7.5" cy="8"  r="1.5"/>
      <circle cx="2.5" cy="14" r="1.5"/><circle cx="7.5" cy="14" r="1.5"/>
    </svg>
  </div>
);

// ─── PENCIL ICON (edit layout button) ────────────────────────────
const PencilIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
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
      if (ref.current) ref.current.textContent = fmt[format](current);
      if (progress < 1) frameRef.current = requestAnimationFrame(animate);
      else prevVal.current = end;
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
      <div className="bar-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color || statusColor(value), height: "100%" }} />
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
          <stop offset="0%"   stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0"   />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${points} ${width},${height}`} fill={`url(#sg-${color.replace(/[^a-z0-9]/gi, "")})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const DualSpark = ({ rxData, txData, height = 40, width = 180, id = "ds" }) => {
  const hasRx = rxData && rxData.length >= 2;
  const hasTx = txData && txData.length >= 2;
  if (!hasRx && !hasTx) return null;
  const max = Math.max(...(hasRx ? rxData : []), ...(hasTx ? txData : []), 1);
  const toPoints = (data) => data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (v / max) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  const rxPts = hasRx ? toPoints(rxData) : null;
  const txPts = hasTx ? toPoints(txData) : null;
  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={`${id}-rx`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="var(--accent)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"   />
        </linearGradient>
        <linearGradient id={`${id}-tx`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="var(--warn)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="var(--warn)" stopOpacity="0"    />
        </linearGradient>
      </defs>
      {rxPts && <polygon points={`0,${height} ${rxPts} ${width},${height}`} fill={`url(#${id}-rx)`} />}
      {txPts && <polygon points={`0,${height} ${txPts} ${width},${height}`} fill={`url(#${id}-tx)`} />}
      {rxPts && <polyline points={rxPts} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
      {txPts && <polyline points={txPts} fill="none" stroke="var(--warn)"   strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
};

// ─── CARD ────────────────────────────────────────────────────────
const Card = ({ title, children, delay = 0, onClick, controls }) => (
  <div
    className={`card fade-in${onClick ? " card-clickable" : ""}`}
    style={{ animationDelay: `${delay}ms` }}
    onClick={onClick}
  >
    {title && (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8 }}>
        <div className="card-title" style={{ margin: 0 }}>{title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {controls}
          {onClick && (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, flexShrink: 0 }}>
              <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          )}
        </div>
      </div>
    )}
    {children}
  </div>
);

// ─── SIZE CONTROL ────────────────────────────────────────────────
const ALL_SIZES = [["S","compact"],["M","medium"],["L","large"]];
const SM_SIZES  = [["S","compact"],["M","medium"]];

function SizeCtrl({ size, onChange, sizes = ALL_SIZES }) {
  return (
    <div className="size-ctrl" onClick={e => e.stopPropagation()}>
      {sizes.map(([lbl, val]) => (
        <button
          key={val}
          className={`size-btn${size === val ? " sz-active" : ""}`}
          onClick={() => onChange(val)}
          title={val.charAt(0).toUpperCase() + val.slice(1)}
        >{lbl}</button>
      ))}
    </div>
  );
}

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
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--card-border)" strokeWidth={stroke} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={c} strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" className="ring-progress" />
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

// ─── DOCKER ITEMS ────────────────────────────────────────────────
const DockerItem = ({ name, status, cpu, mem }) => {
  const running = status === "running";
  return (
    <div className="docker-item">
      <div className="docker-dot-wrap">
        <div className={`docker-dot ${running ? "dot-live" : "dot-dead"}`} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="docker-name">{name}</div>
        <div className="label-xs" style={{ opacity: 0.4 }}>{cpu.toFixed(1)}% · {fmt.bytes(mem)}</div>
      </div>
    </div>
  );
};

// ─── CONTAINER DETAIL ────────────────────────────────────────────
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
    if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
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
      <span onClick={() => handleSort(id)} className={`ct-col-header${active ? " ct-col-active" : ""}`}>
        {label}
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          style={{ marginLeft: 4, opacity: active ? 1 : 0, transition: "opacity 0.15s, transform 0.2s", transform: active && sortDir === "asc" ? "rotate(180deg)" : "rotate(0deg)" }}>
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
            <span className="label-sm">{containers.filter(c => c.status === "running").length} / {containers.length} running</span>
          </div>
          <button className="close-btn" onClick={onClose}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Close
          </button>
        </div>
        <div className="ct-header">
          <ColHeader label="Container" id="name"   />
          <ColHeader label="CPU"       id="cpu"    />
          <ColHeader label="Memory"    id="mem"    />
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
                  <span className="mono" style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
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

// ─── USE POLLING HOOK ────────────────────────────────────────────
function usePolling(fetcher, ms = 30000) {
  const [state, setState] = useState({ data: null, loading: true, err: null });
  const ref = useRef(null);
  useEffect(() => { ref.current = fetcher; });
  useEffect(() => {
    let alive = true;
    async function run() {
      try {
        const data = await ref.current();
        if (alive && data != null) setState({ data, loading: false, err: null });
        else if (alive) setState(s => ({ ...s, loading: false }));
      } catch (e) {
        if (alive) setState(s => ({ ...s, loading: false, err: String(e.message || e) }));
      }
    }
    run();
    const id = setInterval(run, ms);
    return () => { alive = false; clearInterval(id); };
  }, [ms]);
  return state;
}

// ─── DATA CONTEXT ────────────────────────────────────────────────
const DataContext = createContext(null);
const useData = () => useContext(DataContext);

function DataProvider({ children }) {
  // ── Glances ────────────────────────────────────────────────────
  const [glances, setGlances] = useState({
    cpu: null, mem: null, memswap: null, sensors: [],
    uptime: null, network: null, docker: null,
    processes: null, fs: null, diskio: null,
    quicklook: null, alert: [],
  });
  const [connected, setConnected] = useState(true);
  const [glHistory, setGlHistory]     = useState({ cpu: [], lan: { rx: [], tx: [] }, ts: { rx: [], tx: [] } });
  const [diskHistory, setDiskHistory] = useState({});

  // ── qBittorrent ────────────────────────────────────────────────
  const [qbt, setQbt] = useState({ transfer: null, torrents: null });

  // ── Unmanic ────────────────────────────────────────────────────
  const [unmanic, setUnmanic] = useState({ pending: null, workers: null });

  // ── Jellyfin ───────────────────────────────────────────────────
  const [jellyfin, setJellyfin] = useState({ sessions: null, counts: null });

  // ── Navidrome ──────────────────────────────────────────────────
  const [navidrome, setNavidrome] = useState({ nowPlaying: null, artistCount: null, recentAlbums: null });

  // ── Speedtest ──────────────────────────────────────────────────
  const [speedtest, setSpeedtest] = useState({ result: null });

  // ── Glances main endpoints (2s) ────────────────────────────────
  useEffect(() => {
    function run() {
      if (!GLANCES_API) {
        setGlances(prev => generateMockData(prev));
        setConnected(true);
        return;
      }
      fetch(`${GLANCES_API}/mem`).then(r => r.json())
        .then(mem => { setGlances(prev => ({ ...prev, mem: { percent: mem?.percent || 0, used: mem?.used || 0, total: mem?.total || 0 } })); setConnected(true); })
        .catch(() => setConnected(false));
      fetch(`${GLANCES_API}/memswap`).then(r => r.json())
        .then(memswap => setGlances(prev => ({ ...prev, memswap: { percent: memswap?.percent || 0, used: memswap?.used || 0, total: memswap?.total || 0, sin: memswap?.sin || 0, sout: memswap?.sout || 0 } })))
        .catch(() => {});
      fetch(`${GLANCES_API}/sensors`).then(r => r.json())
        .then(sensors => setGlances(prev => ({ ...prev, sensors: (sensors || []).filter(s => s.type === "temperature_core").slice(0, 5).map(s => ({ label: s.label, value: s.value, unit: "C" })) })))
        .catch(() => {});
      fetch(`${GLANCES_API}/uptime`).then(r => r.json())
        .then(uptime => setGlances(prev => ({ ...prev, uptime: typeof uptime === "string" ? uptime : "—" })))
        .catch(() => {});
      fetch(`${GLANCES_API}/network`).then(r => r.json())
        .then(raw => {
          const ifaces = Array.isArray(raw) ? raw : [];
          const pick = (name) => { const n = ifaces.find(i => i.interface_name === name); return n ? { rx: n.bytes_recv_rate_per_sec || 0, tx: n.bytes_sent_rate_per_sec || 0 } : null; };
          setGlances(prev => ({ ...prev, network: { lan: pick("enp3s0"), ts: pick("tailscale0") } }));
        }).catch(() => {});
      fetch(`${GLANCES_API}/containers`).then(r => r.json())
        .then(docker => setGlances(prev => ({ ...prev, docker: (Array.isArray(docker) ? docker : []).map(c => ({ name: c.name || "unknown", status: c.status || "stopped", cpu: c.cpu_percent || c.cpu?.total || 0, mem: c.memory_usage || c.memory?.usage || 0, net_rx: c.network_rx || c.network?.rx || 0, net_tx: c.network_tx || c.network?.tx || 0, uptime: c.uptime || "—" })) })))
        .catch(() => {});
      fetch(`${GLANCES_API}/processlist`).then(r => r.json())
        .then(processlist => setGlances(prev => ({ ...prev, processes: Array.isArray(processlist) ? processlist : [] })))
        .catch(() => {});
      Promise.all([fetch(`${GLANCES_API}/fs`).then(r => r.json()).catch(() => null), fetch(`${GLANCES_API}/diskio`).then(r => r.json()).catch(() => null)])
        .then(([fs, diskio]) => setGlances(prev => ({ ...prev, fs: fs || [], diskio: diskio || [] }))).catch(() => {});
      Promise.all([fetch(`${GLANCES_API}/cpu`).then(r => r.json()).catch(() => null), fetch(`${GLANCES_API}/percpu`).then(r => r.json()).catch(() => null)])
        .then(([cpu, percpu]) => setGlances(prev => ({ ...prev, cpu: { total: cpu?.total || 0, cores: Array.isArray(percpu) ? percpu.map(c => c.total) : [], model: cpu?.cpucore ? `${cpu.cpucore} cores` : "", freq: cpu?.cpufreq_current || 0 } }))).catch(() => {});
    }
    run();
    const id = setInterval(run, POLL_INTERVAL);
    return () => clearInterval(id);
  }, []);

  // ── Glances quicklook (5s) ─────────────────────────────────────
  useEffect(() => {
    function run() {
      fetch(`${GLANCES_API}/quicklook`).then(r => r.json())
        .then(quicklook => setGlances(prev => ({ ...prev, quicklook }))).catch(() => {});
    }
    run();
    const id = setInterval(run, 5000);
    return () => clearInterval(id);
  }, []);

  // ── Glances alerts (10s) ───────────────────────────────────────
  useEffect(() => {
    function run() {
      fetch(`${GLANCES_API}/alert`).then(r => r.json())
        .then(alert => setGlances(prev => ({ ...prev, alert: Array.isArray(alert) ? alert : [] }))).catch(() => {});
    }
    run();
    const id = setInterval(run, 10000);
    return () => clearInterval(id);
  }, []);

  // ── Chart history (driven by glances state changes) ────────────
  useEffect(() => {
    if (!glances.cpu) return;
    setGlHistory(h => ({ ...h, cpu: [...h.cpu.slice(-59), glances.cpu.total] }));
  }, [glances.cpu]);

  useEffect(() => {
    if (!glances.network) return;
    setGlHistory(h => ({
      ...h,
      lan: glances.network.lan ? { rx: [...h.lan.rx.slice(-59), glances.network.lan.rx], tx: [...h.lan.tx.slice(-59), glances.network.lan.tx] } : h.lan,
      ts:  glances.network.ts  ? { rx: [...h.ts.rx.slice(-59),  glances.network.ts.rx],  tx: [...h.ts.tx.slice(-59),  glances.network.ts.tx]  } : h.ts,
    }));
  }, [glances.network]);

  useEffect(() => {
    if (!glances.diskio) return;
    const DISK_RE = /^nvme\d+n\d+$|^sd[a-z]$/;
    setDiskHistory(h => {
      const next = { ...h };
      glances.diskio.filter(d => DISK_RE.test(d.disk_name)).forEach(d => {
        const prev = next[d.disk_name] || { rx: [], tx: [] };
        next[d.disk_name] = { rx: [...prev.rx.slice(-59), d.read_bytes], tx: [...prev.tx.slice(-59), d.write_bytes] };
      });
      return next;
    });
  }, [glances.diskio]);

  // ── qBittorrent (2s) ──────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    async function run() {
      try {
        const [tr, to] = await Promise.all([fetch("/qbt/api/v2/transfer/info"), fetch("/qbt/api/v2/torrents/info?filter=active")]);
        const [transfer, torrents] = await Promise.all([tr.json(), to.json()]);
        if (alive) setQbt({ transfer, torrents });
      } catch {}
    }
    run();
    const id = setInterval(run, POLL_INTERVAL);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // ── Unmanic (2s) ──────────────────────────────────────────────
  useEffect(() => {
    async function run() {
      try {
        const [pending, workers] = await Promise.all([
          fetch("/unmanic/api/v2/pending/list", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ start: 0, length: 1 }) }).then(r => r.json()),
          fetch("/unmanic/api/v2/workers/status").then(r => r.json()),
        ]);
        setUnmanic({ pending, workers });
      } catch {}
    }
    run();
    const id = setInterval(run, POLL_INTERVAL);
    return () => clearInterval(id);
  }, []);

  // ── Jellyfin sessions (15s) + counts (60s) ────────────────────
  useEffect(() => {
    function run() { fetch(`/jellyfin/Sessions?api_key=${JF_KEY}`).then(r => r.json()).then(sessions => setJellyfin(prev => ({ ...prev, sessions }))).catch(() => {}); }
    run(); const id = setInterval(run, 15000); return () => clearInterval(id);
  }, []);
  useEffect(() => {
    function run() { fetch(`/jellyfin/Items/Counts?api_key=${JF_KEY}`).then(r => r.json()).then(counts => setJellyfin(prev => ({ ...prev, counts }))).catch(() => {}); }
    run(); const id = setInterval(run, 60000); return () => clearInterval(id);
  }, []);

  // ── Navidrome now-playing (10s) · artists (120s) · albums (60s)
  useEffect(() => {
    function run() {
      fetch(`/navidrome/rest/getNowPlaying.view?${NAV_PARAMS}`).then(r => r.json())
        .then(d => { const entry = d["subsonic-response"]?.nowPlaying?.entry || []; setNavidrome(prev => ({ ...prev, nowPlaying: Array.isArray(entry) ? entry : [entry].filter(Boolean) })); }).catch(() => {});
    }
    run(); const id = setInterval(run, 10000); return () => clearInterval(id);
  }, []);
  useEffect(() => {
    function run() {
      fetch(`/navidrome/rest/getArtists.view?${NAV_PARAMS}`).then(r => r.json())
        .then(d => { const idx = d["subsonic-response"]?.artists?.index || []; setNavidrome(prev => ({ ...prev, artistCount: idx.reduce((n, i) => n + (i.artist?.length || 0), 0) })); }).catch(() => {});
    }
    run(); const id = setInterval(run, 120000); return () => clearInterval(id);
  }, []);
  useEffect(() => {
    function run() {
      fetch(`/navidrome/rest/getAlbumList2.view?type=newest&size=3&${NAV_PARAMS}`).then(r => r.json())
        .then(d => { setNavidrome(prev => ({ ...prev, recentAlbums: d["subsonic-response"]?.albumList2?.album || [] })); }).catch(() => {});
    }
    run(); const id = setInterval(run, 60000); return () => clearInterval(id);
  }, []);

  // ── Speedtest (5 min) ─────────────────────────────────────────
  useEffect(() => {
    function run() {
      fetch("/speedtest/api/v1/results/latest", { headers: { Authorization: `Bearer ${ST_TOKEN}` } }).then(r => r.json())
        .then(d => setSpeedtest({ result: d?.data ?? null })).catch(() => {});
    }
    run(); const id = setInterval(run, 300000); return () => clearInterval(id);
  }, []);

  return (
    <DataContext.Provider value={{ glances, connected, glHistory, diskHistory, qbt, unmanic, jellyfin, navidrome, speedtest }}>
      {children}
    </DataContext.Provider>
  );
}

// ─── SERVICE CARD ────────────────────────────────────────────────
function SvcCard({ id }) {
  const s = SVC[id];
  return (
    <a href={s.url} target="_blank" rel="noopener noreferrer" className="svc-card fade-in">
      <div className="svc-icon" style={{ background: s.col + "22", border: `1px solid ${s.col}44` }}>
        <SvcIcon id={s.id} color={s.col} />
      </div>
      <div>
        <div className="svc-name">{s.name}</div>
        <div className="svc-desc">{s.desc}</div>
      </div>
    </a>
  );
}

// ─── LIVE CHIP ───────────────────────────────────────────────────
const LiveChip = () => (
  <div className="live-badge">
    <div className="live-dot" />LIVE
  </div>
);

// ─── JELLYFIN WIDGET ─────────────────────────────────────────────
function JellyfinWidget() {
  const s = SVC.jellyfin;
  const { jellyfin: { sessions, counts } } = useData();

  const activeStreams = sessions ? sessions.filter(s => s.NowPlayingItem).length : null;
  const nowPlaying   = sessions ? sessions.filter(s => s.NowPlayingItem) : [];

  return (
    <a href={s.url} target="_blank" rel="noopener noreferrer" className="live-svc-card fade-in">
      <div className="live-svc-top">
        <div className="svc-icon" style={{ background: s.col + "22", border: `1px solid ${s.col}44` }}>
          <SvcIcon id={s.id} color={s.col} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="live-svc-name">{s.name}</div>
          <div className="live-svc-desc">{s.desc}</div>
        </div>
        <LiveChip />
      </div>

      <div className="live-stats-row">
        <div className="live-stat">
          <span className="live-stat-val" style={{ color: s.col }}>{activeStreams ?? "—"}</span>
          <span className="live-stat-lbl">streams</span>
        </div>
        <div className="live-stat">
          <span className="live-stat-val">{counts?.MovieCount ?? "—"}</span>
          <span className="live-stat-lbl">movies</span>
        </div>
        <div className="live-stat">
          <span className="live-stat-val">{counts?.EpisodeCount ?? "—"}</span>
          <span className="live-stat-lbl">episodes</span>
        </div>
        <div className="live-stat">
          <span className="live-stat-val">{counts?.SongCount ?? "—"}</span>
          <span className="live-stat-lbl">songs</span>
        </div>
      </div>

      {nowPlaying.length > 0 && (
        <div className="live-now-playing">
          {nowPlaying.slice(0, 3).map((sess, i) => (
            <div key={i} className="now-playing-row">
              <span className="np-dot" style={{ background: s.col }} />
              <span className="label-xs" style={{ color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {sess.NowPlayingItem?.Name}
              </span>
              <span className="label-xs" style={{ opacity: 0.45, flexShrink: 0 }}>{sess.UserName}</span>
            </div>
          ))}
        </div>
      )}
    </a>
  );
}

// ─── QBITTORRENT WIDGET ──────────────────────────────────────────
function QBittorrentWidget() {
  const s = SVC.qbt;
  const { qbt } = useData();

  const { transfer, torrents } = qbt;
  const activeTorrents = Array.isArray(torrents) ? torrents : [];

  return (
    <a href={s.url} target="_blank" rel="noopener noreferrer" className="live-svc-card fade-in">
      <div className="live-svc-top">
        <div className="svc-icon" style={{ background: s.col + "22", border: `1px solid ${s.col}44` }}>
          <SvcIcon id={s.id} color={s.col} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="live-svc-name">{s.name}</div>
          <div className="live-svc-desc">{s.desc}</div>
        </div>
        <LiveChip />
      </div>

      <div className="live-stats-row">
        <div className="live-stat">
          <span className="live-stat-val" style={{ color: s.col }}>{transfer ? activeTorrents.length : "—"}</span>
          <span className="live-stat-lbl">active</span>
        </div>
        <div className="live-stat">
          <span className="live-stat-val" style={{ color: "var(--accent)" }}>
            {transfer ? fmt.speed(transfer.dl_info_speed) : "—"}
          </span>
          <span className="live-stat-lbl">↓ down</span>
        </div>
        <div className="live-stat">
          <span className="live-stat-val" style={{ color: "var(--warn)" }}>
            {transfer ? fmt.speed(transfer.up_info_speed) : "—"}
          </span>
          <span className="live-stat-lbl">↑ up</span>
        </div>
      </div>

      {activeTorrents.length > 0 && (
        <div className="live-now-playing">
          {activeTorrents.slice(0, 3).map((t, i) => (
            <div key={i} className="now-playing-row">
              <span className="np-dot" style={{ background: t.state === "downloading" ? "var(--accent)" : "var(--warn)" }} />
              <span className="label-xs" style={{ color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.name}
              </span>
              <span className="label-xs" style={{ opacity: 0.45, flexShrink: 0 }}>{Math.round(t.progress * 100)}%</span>
            </div>
          ))}
        </div>
      )}

    </a>
  );
}

// ─── NAVIDROME WIDGET ────────────────────────────────────────────
function NavidromeWidget() {
  const s = SVC.navidrome;

  const { navidrome: { nowPlaying, artistCount, recentAlbums } } = useData();

  const playing = Array.isArray(nowPlaying) ? nowPlaying : [];
  const recent  = Array.isArray(recentAlbums) ? recentAlbums : [];

  return (
    <a href={s.url} target="_blank" rel="noopener noreferrer" className="live-svc-card fade-in">
      <div className="live-svc-top">
        <div className="svc-icon" style={{ background: s.col + "22", border: `1px solid ${s.col}44` }}>
          <SvcIcon id={s.id} color={s.col} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="live-svc-name">{s.name}</div>
          <div className="live-svc-desc">{s.desc}</div>
        </div>
        <LiveChip />
      </div>

      <div className="live-stats-row">
        <div className="live-stat">
          <span className="live-stat-val" style={{ color: s.col }}>{nowPlaying ? playing.length : "—"}</span>
          <span className="live-stat-lbl">playing</span>
        </div>
        <div className="live-stat">
          <span className="live-stat-val">{artistCount ?? "—"}</span>
          <span className="live-stat-lbl">artists</span>
        </div>
      </div>

      {playing.length > 0 && (
        <div className="live-now-playing">
          {playing.slice(0, 2).map((track, i) => (
            <div key={i} className="now-playing-row">
              <span className="np-dot" style={{ background: s.col }} />
              <span className="label-xs" style={{ color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {track.title} — {track.artist}
              </span>
            </div>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <div className="live-recent">
          <div className="label-xs" style={{ marginBottom: 4, textTransform: "uppercase", letterSpacing: 1, opacity: 0.4 }}>Recently Added</div>
          {recent.map((a, i) => (
            <div key={i} className="recent-item">
              <span className="label-xs" style={{ color: "var(--text)" }}>{a.name}</span>
              <span className="label-xs" style={{ opacity: 0.45 }}>{a.artist}</span>
            </div>
          ))}
        </div>
      )}
    </a>
  );
}

// ─── UNMANIC WIDGET ──────────────────────────────────────────────
function parseEncSpeed(logTail) {
  if (!logTail) return null;
  const m = String(logTail).match(/speed=\s*([\d.]+x)/);
  return m ? m[1] : null;
}

function UnmanicWidget() {
  const s = SVC.unmanic;

  const { unmanic: { pending, workers } } = useData();

  const pendingCount  = pending?.total_count ?? null;
  const workerList    = Array.isArray(workers?.workers_status) ? workers.workers_status : [];
  const activeWorker  = workerList.find(w => !w.idle) ?? null;
  const progress      = activeWorker?.subprocess?.percent ?? null;
  const currentFile   = activeWorker?.current_file ?? null;
  const encSpeed      = parseEncSpeed(activeWorker?.worker_log_tail);

  return (
    <a href={s.url} target="_blank" rel="noopener noreferrer" className="live-svc-card fade-in">
      <div className="live-svc-top">
        <div className="svc-icon" style={{ background: s.col + "22", border: `1px solid ${s.col}44` }}>
          <SvcIcon id={s.id} color={s.col} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="live-svc-name">{s.name}</div>
          <div className="live-svc-desc">{s.desc}</div>
        </div>
        <LiveChip />
      </div>

      <div className="live-stats-row">
        <div className="live-stat">
          <span className="live-stat-val" style={{ color: s.col }}>{pendingCount ?? "—"}</span>
          <span className="live-stat-lbl">queued</span>
        </div>
        <div className="live-stat">
          <span className="live-stat-val">
            {workers ? (progress != null ? Math.round(progress) + "%" : activeWorker ? "—" : "idle") : "—"}
          </span>
          <span className="live-stat-lbl">progress</span>
        </div>
        <div className="live-stat">
          <span className="live-stat-val" style={{ color: "var(--accent)" }}>
            {encSpeed ?? "—"}
          </span>
          <span className="live-stat-lbl">speed</span>
        </div>
      </div>

      {currentFile && (
        <div className="live-now-playing">
          <div className="now-playing-row">
            <span className="np-dot" style={{ background: s.col }} />
            <span className="label-xs" style={{ color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentFile.split("/").pop() || currentFile}
            </span>
          </div>
        </div>
      )}
    </a>
  );
}

// ─── SPEEDTEST WIDGET ────────────────────────────────────────────
function SpeedtestWidget() {
  const s = SVC.speedtest;

  const { speedtest: { result } } = useData();

  return (
    <a href={s.url} target="_blank" rel="noopener noreferrer" className="live-svc-card fade-in">
      <div className="live-svc-top">
        <div className="svc-icon" style={{ background: s.col + "22", border: `1px solid ${s.col}44` }}>
          <SvcIcon id={s.id} color={s.col} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="live-svc-name">{s.name}</div>
          <div className="live-svc-desc">{s.desc}</div>
        </div>
        <LiveChip />
      </div>

      <div className="live-stats-row">
        <div className="live-stat">
          <span className="live-stat-val" style={{ color: "var(--accent)" }}>
            {result?.download_bits_human ?? "—"}
          </span>
          <span className="live-stat-lbl">↓ down</span>
        </div>
        <div className="live-stat">
          <span className="live-stat-val" style={{ color: "var(--warn)" }}>
            {result?.upload_bits_human ?? "—"}
          </span>
          <span className="live-stat-lbl">↑ up</span>
        </div>
        <div className="live-stat">
          <span className="live-stat-val">
            {result ? parseFloat(result.ping).toFixed(0) + "ms" : "—"}
          </span>
          <span className="live-stat-lbl">ping</span>
        </div>
      </div>

      {result?.server_name && (
        <div className="live-now-playing">
          <div className="now-playing-row">
            <span className="np-dot" style={{ background: s.col }} />
            <span className="label-xs" style={{ color: "var(--text-dim)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {result.server_name}
            </span>
          </div>
        </div>
      )}

      {result?.created_at && (
        <div style={{ textAlign: "right", marginTop: 4 }}>
          <span className="label-xs" style={{ opacity: 0.35 }}>
            Last run: {new Date(result.created_at).toLocaleString()}
          </span>
        </div>
      )}
    </a>
  );
}

// ─── THEME SYSTEM ────────────────────────────────────────────────
const THEMES = [
  {
    id: "default", name: "Default",
    colors: { bg: "#0d1117", bg2: "#161b22", text: "#e6edf3", accent: "#22D3A7", warn: "#F59E0B", crit: "#EF4444" },
  },
  {
    id: "dracula", name: "Dracula",
    colors: { bg: "#282a36", bg2: "#44475a", text: "#f8f8f2", accent: "#bd93f9", warn: "#ffb86c", crit: "#ff5555" },
  },
  {
    id: "nord", name: "Nord",
    colors: { bg: "#2e3440", bg2: "#3b4252", text: "#eceff4", accent: "#88c0d0", warn: "#ebcb8b", crit: "#bf616a" },
  },
  {
    id: "catppuccin", name: "Catppuccin",
    colors: { bg: "#1e1e2e", bg2: "#313244", text: "#cdd6f4", accent: "#cba6f7", warn: "#fab387", crit: "#f38ba8" },
  },
  {
    id: "gruvbox", name: "Gruvbox",
    colors: { bg: "#282828", bg2: "#3c3836", text: "#ebdbb2", accent: "#b8bb26", warn: "#fabd2f", crit: "#fb4934" },
  },
  {
    id: "tokyonight", name: "Tokyo Night",
    colors: { bg: "#1a1b26", bg2: "#24283b", text: "#c0caf5", accent: "#7aa2f7", warn: "#e0af68", crit: "#f7768e" },
  },
];

const DEFAULT_THEME = THEMES[0].colors;

function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function buildThemeVars(c) {
  return `:root {
    --bg: ${c.bg};
    --bg2: ${c.bg2};
    --text: ${c.text};
    --text-dim: ${hexToRgba(c.text, 0.45)};
    --accent: ${c.accent};
    --accent-dim: ${hexToRgba(c.accent, 0.15)};
    --warn: ${c.warn};
    --crit: ${c.crit};
    --bar-fill: ${c.accent};
    --card-bg: ${hexToRgba(c.bg2, 0.6)};
    --card-border: ${hexToRgba(c.text, 0.08)};
  }`;
}

const COLOR_FIELDS = [
  { key: "bg",     label: "Background" },
  { key: "bg2",    label: "Surface"    },
  { key: "text",   label: "Text"       },
  { key: "accent", label: "Accent"     },
  { key: "warn",   label: "Warning"    },
  { key: "crit",   label: "Critical"   },
];

function SettingsPanel({ colors, onChange, onClose, onResetLayout }) {
  const activePreset = THEMES.find(t =>
    Object.keys(t.colors).every(k => t.colors[k] === colors[k])
  );

  return (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <span className="settings-panel-title">Settings</span>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="settings-section-lbl">Theme Presets</div>
      <div className="theme-grid">
        {THEMES.map(t => (
          <button
            key={t.id}
            className={`theme-tile${activePreset?.id === t.id ? " active" : ""}`}
            onClick={() => onChange(t.colors)}
          >
            <div className="theme-swatch" style={{ background: t.colors.bg }}>
              <div className="theme-swatch-dot" style={{ background: t.colors.accent }} />
              <div className="theme-swatch-dot" style={{ background: t.colors.warn }} />
              <div className="theme-swatch-dot" style={{ background: t.colors.crit }} />
            </div>
            <span className="theme-tile-name">{t.name}</span>
          </button>
        ))}
      </div>

      <div className="settings-section-lbl">Customise</div>
      {COLOR_FIELDS.map(({ key, label }) => (
        <div key={key} className="color-row">
          <span className="color-row-label">{label}</span>
          <div className="color-input-wrap">
            <span className="color-hex">{colors[key]}</span>
            <input
              type="color"
              value={colors[key]}
              onChange={e => onChange({ ...colors, [key]: e.target.value })}
            />
          </div>
        </div>
      ))}

      <div className="settings-section-lbl">Logo</div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
        Drop your image as <span style={{ fontFamily: "var(--mono)", color: "var(--text)" }}>public/logo.png</span> in the project folder — it will load on every device automatically.
      </div>

      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
        <button className="reset-btn" onClick={() => onChange(DEFAULT_THEME)}>Reset to default</button>
      </div>

      <div className="settings-section-lbl">Dashboard Layout</div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 10 }}>
        Resets the main page to all Small cards, arranged alphabetically.
      </div>
      <button className="reset-btn" onClick={onResetLayout} style={{ width: "100%" }}>Reset layout</button>
    </div>
  );
}

// ─── NOTIFICATION COMPONENTS ─────────────────────────────────────
function fmtAgo(ts) {
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function NotificationItem({ notif, onDismiss, onClick }) {
  const [offsetX, setOffsetX] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const startX = useRef(null);
  const dragging = useRef(false);

  const onTouchStart = (e) => { startX.current = e.touches[0].clientX; dragging.current = true; };
  const onTouchMove  = (e) => {
    if (!dragging.current) return;
    const delta = e.touches[0].clientX - startX.current;
    if (delta < 0) setOffsetX(Math.max(delta, -64));
  };
  const onTouchEnd = () => {
    dragging.current = false;
    if (offsetX < -32) { setOffsetX(-64); setRevealed(true); }
    else               { setOffsetX(0);   setRevealed(false); }
    startX.current = null;
  };

  const stateColor = notif.severity === "CRITICAL" ? "var(--crit)" : notif.severity === "WARNING" ? "var(--warn)" : "var(--accent)";

  return (
    <div className="notif-item">
      <div
        className="notif-item-inner"
        style={{ transform: `translateX(${offsetX}px)`, transition: dragging.current ? "none" : "transform 0.2s" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => { if (!revealed) onClick(); }}
      >
        <div className="notif-icon" style={{ background: stateColor + "22", border: `1px solid ${stateColor}44` }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stateColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="notif-title">{notif.title}</div>
          <div className="notif-body">{notif.body}</div>
          <div className="notif-time">{fmtAgo(notif.ts)}</div>
        </div>
      </div>
      {revealed && (
        <button className="notif-delete-btn" onClick={onDismiss}>×</button>
      )}
    </div>
  );
}

const NotificationDrawer = forwardRef(function NotificationDrawer({ notifications, onDismiss, onClearAll, onNavigate, style }, ref) {
  return (
    <div ref={ref} className="notif-drawer notif-drawer-anim" style={style}>
      <div className="notif-drawer-header">
        <span className="notif-drawer-title">Notifications</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {notifications.length > 0 && (
            <button className="reset-btn" onClick={onClearAll}>Clear All</button>
          )}
        </div>
      </div>
      {notifications.length === 0 ? (
        <div className="notif-empty">No notifications</div>
      ) : (
        notifications.map(n => (
          <NotificationItem
            key={n.id}
            notif={n}
            onDismiss={() => onDismiss(n.id)}
            onClick={() => onNavigate(n.page)}
          />
        ))
      )}
    </div>
  );
});

function NotificationBell({ notifications, onDismiss, onClearAll, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [drawerStyle, setDrawerStyle] = useState({});
  const btnRef = useRef(null);
  const drawerRef = useRef(null);
  const unread = notifications.length;

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    if (window.innerWidth <= 600) {
      const headerBottom = document.querySelector('.header')?.getBoundingClientRect().bottom ?? r.bottom;
      setDrawerStyle({ top: headerBottom + 8, left: 8, right: 8, width: 'auto' });
    } else {
      setDrawerStyle({ top: r.bottom + 10, right: window.innerWidth - r.right });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        drawerRef.current && !drawerRef.current.contains(e.target)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="bell-wrap">
      <button className="bell-btn" ref={btnRef} onClick={() => setOpen(o => !o)} aria-label="Notifications">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && <span className="bell-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && createPortal(
        <NotificationDrawer
          ref={drawerRef}
          style={drawerStyle}
          notifications={notifications}
          onDismiss={onDismiss}
          onClearAll={onClearAll}
          onNavigate={(page) => { onNavigate(page); setOpen(false); }}
        />,
        document.body
      )}
    </div>
  );
}

// ─── ALERTS PANEL ────────────────────────────────────────────────
function AlertsPanel({ alerts, onClose }) {
  const [clearedBefore, setClearedBefore] = useState(
    () => parseInt(localStorage.getItem("2ez-alerts-cleared") || "0", 10)
  );

  const all     = alerts || [];
  const active  = all.filter(a => a.end === -1);
  const crits   = active.filter(a => a.state === "CRITICAL").length;
  const warns   = active.filter(a => a.state === "WARNING").length;
  const history = all
    .filter(a => a.end !== -1 && a.end > clearedBefore)
    .sort((a, b) => b.end - a.end)
    .slice(0, 10);

  const fmt = (ts) => {
    const secs = Math.floor(Date.now() / 1000) - ts;
    if (secs < 60)   return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
  };

  const clearHistory = () => {
    const now = Math.floor(Date.now() / 1000);
    localStorage.setItem("2ez-alerts-cleared", String(now));
    setClearedBefore(now);
  };

  const AlertRow = ({ a }) => (
    <div className="alert-item">
      <span className={`alert-state-pill ${a.state.toLowerCase()}`}>{a.state}</span>
      <div>
        <div className="alert-item-type">{a.type}</div>
        <div className="alert-item-meta">
          Max {a.max?.toFixed(1) ?? "—"} · Avg {a.avg?.toFixed(1) ?? "—"} · {fmt(a.end === -1 ? a.begin : a.end)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <span className="settings-panel-title">
          Alerts {active.length > 0 && <span style={{ color: crits ? "var(--crit)" : "var(--warn)", fontWeight: 400, fontSize: 11 }}>({crits} critical, {warns} warning)</span>}
        </span>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="settings-section-lbl">Current</div>
      {active.length === 0 ? (
        <div className="alerts-all-clear">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          All systems normal
        </div>
      ) : (
        active.map((a, i) => <AlertRow key={i} a={a} />)
      )}

      <div className="settings-section-lbl" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>Last 10 Alerts</span>
        {history.length > 0 && (
          <button className="reset-btn" onClick={clearHistory}>Clear</button>
        )}
      </div>
      {history.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--text-dim)", padding: "8px 0" }}>No recent alerts</div>
      ) : (
        history.map((a, i) => <AlertRow key={i} a={a} />)
      )}
    </div>
  );
}

// ─── MOBILE ORDER ────────────────────────────────────────────────
function useMobileOrder(pageKey, defaultIds) {
  const [order, setOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`2ez-mobile-order-${pageKey}`) || "null");
      if (Array.isArray(saved) && saved.length > 0) {
        // merge: keep saved order, append any new ids, drop removed ones
        const valid = saved.filter(id => defaultIds.includes(id));
        const added = defaultIds.filter(id => !valid.includes(id));
        return [...valid, ...added];
      }
    } catch {}
    return [...defaultIds];
  });
  useEffect(() => {
    localStorage.setItem(`2ez-mobile-order-${pageKey}`, JSON.stringify(order));
  }, [order, pageKey]);
  return [order, setOrder];
}

// ─── LAYOUT EDIT MODAL ───────────────────────────────────────────
function LayoutEditModal({ items, order, onSave, onCancel }) {
  const [local, setLocal] = useState([...order]);

  const move = (idx, dir) => setLocal(prev => {
    const next = [...prev];
    const to = idx + dir;
    if (to < 0 || to >= next.length) return prev;
    [next[idx], next[to]] = [next[to], next[idx]];
    return next;
  });

  return createPortal(
    <div className="layout-modal-backdrop" onClick={onCancel}>
      <div className="layout-modal" onClick={e => e.stopPropagation()}>
        <div className="layout-modal-head">
          <span className="layout-modal-title">Edit Layout</span>
          <button className="close-btn" onClick={onCancel}>Cancel</button>
        </div>
        <div className="layout-modal-list">
          {local.map((id, idx) => {
            const item = items.find(i => i.id === id);
            return (
              <div key={id} className="layout-modal-row">
                <span className="layout-modal-row-label">{item?.label ?? id}</span>
                <div className="layout-modal-arrows">
                  <button className="layout-modal-arrow" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label="Move up">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15"/></svg>
                  </button>
                  <button className="layout-modal-arrow" onClick={() => move(idx, 1)} disabled={idx === local.length - 1} aria-label="Move down">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="layout-modal-footer">
          <button className="layout-modal-cancel" onClick={onCancel}>Cancel</button>
          <button className="layout-modal-save" onClick={() => onSave(local)}>Save</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── LONG-PRESS TOUCH DRAG ───────────────────────────────────────
// Attaches passive-false touchmove to containerRef so we can preventDefault
// (blocking scroll) only once the long-press fires. callbacks.onStart/onMove/onEnd
// are read via a ref so the effect never needs to re-register.
function useLongPressTouch(containerRef, callbacks, longPressMs = 400, enabled = true) {
  const cb = useRef(callbacks);
  useEffect(() => { cb.current = callbacks; }); // keep fresh each render

  useEffect(() => {
    if (!enabled) return; // no-op on mobile — Edit Layout modal handles reorder instead
    const el = containerRef?.current;
    if (!el) return;

    let timer = null;
    let active = false;
    let pendingEl = null;
    let startX = 0, startY = 0;

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];

      // Only react when the touch lands directly on the designated drag handle.
      // This leaves normal taps, links, and vertical scroll untouched everywhere
      // else on the card.
      if (!t.target?.closest?.("[data-drag-handle]")) return;

      // Prevent iOS from showing the 3D-Touch preview / long-press context menu
      // on the handle. Safe here because the handle has touch-action:none and is
      // not a scroll-initiation point.
      e.preventDefault();

      startX = t.clientX; startY = t.clientY;
      pendingEl = t.target?.closest?.("[data-drag-id],[data-sort-id]");
      if (pendingEl) pendingEl.classList.add("touch-pending");
      timer = setTimeout(() => {
        if (pendingEl) pendingEl.classList.remove("touch-pending");
        active = true;
        navigator.vibrate?.(40); // haptic cue on Android
        cb.current.onStart?.(t.clientX, t.clientY);
      }, longPressMs);
    };

    const onTouchMove = (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (!active) {
        // Cancel long-press if the finger moves before it fires
        if (Math.hypot(t.clientX - startX, t.clientY - startY) > 8) {
          clearTimeout(timer); timer = null;
          if (pendingEl) { pendingEl.classList.remove("touch-pending"); pendingEl = null; }
        }
        return;
      }
      e.preventDefault(); // block page scroll while dragging
      cb.current.onMove?.(t.clientX, t.clientY);
    };

    const onTouchEnd = (e) => {
      clearTimeout(timer); timer = null;
      if (pendingEl) { pendingEl.classList.remove("touch-pending"); pendingEl = null; }
      if (!active) return;
      active = false;
      const t = e.changedTouches[0];
      cb.current.onEnd?.(t.clientX, t.clientY);
    };

    // touchstart must be non-passive so e.preventDefault() can block the iOS
    // context-menu / 3D-Touch preview when the finger is on the drag handle.
    // For all other touches (not on the handle) we return early without calling
    // preventDefault, so the browser's passive-scroll optimisation is not lost.
    el.addEventListener("touchstart",  onTouchStart, { passive: false });
    el.addEventListener("touchmove",   onTouchMove,  { passive: false }); // must be non-passive for scroll-block during drag
    el.addEventListener("touchend",    onTouchEnd,   { passive: true  });
    el.addEventListener("touchcancel", onTouchEnd,   { passive: true  });

    return () => {
      clearTimeout(timer);
      if (pendingEl) pendingEl.classList.remove("touch-pending");
      el.removeEventListener("touchstart",  onTouchStart);
      el.removeEventListener("touchmove",   onTouchMove);
      el.removeEventListener("touchend",    onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps — containerRef is stable; enabled is constant per session
}

// ─── DRAG SORT ───────────────────────────────────────────────────
function useSortable(pageKey, defaultOrder, containerRef) {
  const [order, setOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`2ez-order-${pageKey}`) || "null");
      if (!Array.isArray(saved)) return defaultOrder;
      const valid = saved.filter(id => defaultOrder.includes(id));
      const added = defaultOrder.filter(id => !valid.includes(id));
      return [...valid, ...added];
    } catch { return defaultOrder; }
  });

  useEffect(() => {
    localStorage.setItem(`2ez-order-${pageKey}`, JSON.stringify(order));
  }, [order, pageKey]);

  const ref = useRef({ from: null, overEl: null, before: true });
  const touchFromId = useRef(null);

  const clearIndicator = () => {
    if (ref.current.overEl) {
      ref.current.overEl.classList.remove("drop-before", "drop-after");
      ref.current.overEl = null;
    }
  };

  const commitReorder = (fromId, toId, before) => {
    if (!fromId || !toId || fromId === toId) return;
    setOrder(prev => {
      const next = prev.filter(x => x !== fromId);
      let ti = next.indexOf(toId);
      if (!before) ti++;
      next.splice(ti, 0, fromId);
      return next;
    });
  };

  // ── Touch drag (long-press) ──
  useLongPressTouch(containerRef, {
    onStart: (x, y) => {
      const el = document.elementFromPoint(x, y);
      const item = el?.closest?.("[data-sort-id]");
      const id = item?.dataset?.sortId;
      if (!id) return;
      touchFromId.current = id;
      ref.current.from = id;
      item.classList.add("dragging");
    },
    onMove: (x, y) => {
      if (!touchFromId.current) return;
      const el = document.elementFromPoint(x, y);
      const item = el?.closest?.("[data-sort-id]");
      clearIndicator();
      if (item && item.dataset.sortId !== touchFromId.current) {
        const rect = item.getBoundingClientRect();
        const before = x < rect.left + rect.width / 2;
        item.classList.add(before ? "drop-before" : "drop-after");
        ref.current.overEl = item;
        ref.current.before = before;
      }
    },
    onEnd: (x, y) => {
      const fromId = touchFromId.current;
      if (!fromId) return;
      touchFromId.current = null;
      clearIndicator();
      document.querySelectorAll("[data-sort-id].dragging").forEach(el => el.classList.remove("dragging"));
      const el = document.elementFromPoint(x, y);
      const item = el?.closest?.("[data-sort-id]");
      const toId = item?.dataset?.sortId;
      commitReorder(fromId, toId, ref.current.before);
      ref.current = { from: null, overEl: null, before: true };
    },
  });

  const getHandlers = (id) => ({
    draggable: true,
    onDragStart: (e) => {
      ref.current.from = id;
      e.dataTransfer.effectAllowed = "move";
      e.currentTarget.classList.add("dragging");
    },
    onDragOver: (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const el = e.currentTarget;
      if (ref.current.overEl && ref.current.overEl !== el) clearIndicator();
      const rect = el.getBoundingClientRect();
      const before = e.clientX < rect.left + rect.width / 2;
      el.classList.remove("drop-before", "drop-after");
      el.classList.add(before ? "drop-before" : "drop-after");
      ref.current.overEl = el;
      ref.current.before = before;
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) {
        e.currentTarget.classList.remove("drop-before", "drop-after");
        if (ref.current.overEl === e.currentTarget) ref.current.overEl = null;
      }
    },
    onDrop: (e) => {
      e.preventDefault();
      clearIndicator();
      const from = ref.current.from;
      const before = ref.current.before;
      commitReorder(from, id, before);
      ref.current = { from: null, overEl: null, before: true };
    },
    onDragEnd: (e) => {
      e.currentTarget.classList.remove("dragging");
      clearIndicator();
      ref.current = { from: null, overEl: null, before: true };
    },
  });

  return [order, getHandlers];
}

function SortableGrid({ pageKey, items }) {
  const containerRef = useRef(null);
  const [order, getHandlers] = useSortable(pageKey, items.map(i => i.id), containerRef);
  return (
    <div className="svc-grid" ref={containerRef}>
      {order.map(id => {
        const item = items.find(i => i.id === id);
        if (!item) return null;
        return (
          <div key={id} className="drag-item" data-sort-id={id} {...getHandlers(id)}>
            <DragHandle />
            {item.node}
          </div>
        );
      })}
    </div>
  );
}

// ─── DRAGGABLE GRID (sub-pages) ──────────────────────────────────
function useDraggableGrid(pageKey, ids, defaultSizes, defaultPositions, onAutoReorder) {
  const [positions, setPositions] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`2ez-positions-${pageKey}`) || "null");
      if (saved && typeof saved === "object" && !Array.isArray(saved))
        return { ...defaultPositions, ...saved };
    } catch {}
    return defaultPositions;
  });
  useEffect(() => {
    localStorage.setItem(`2ez-positions-${pageKey}`, JSON.stringify(positions));
  }, [positions, pageKey]);

  const [sizes, setSizes] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`2ez-sizes-${pageKey}`) || "null");
      return { ...defaultSizes, ...(saved || {}) };
    } catch { return defaultSizes; }
  });
  useEffect(() => {
    localStorage.setItem(`2ez-sizes-${pageKey}`, JSON.stringify(sizes));
  }, [sizes, pageKey]);

  const gridRef = useRef(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const autoDropRef = useRef({ overEl: null, before: true });
  const [isAutoLayout, setIsAutoLayout] = useState(() => window.matchMedia("(max-width: 1100px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1100px)");
    const handler = (e) => setIsAutoLayout(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const getCellFromMouse = useCallback((clientX, clientY) => {
    if (!gridRef.current) return null;
    const el = gridRef.current;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const numCols = style.gridTemplateColumns.split(' ').filter(Boolean).length || 4;
    const gapPx = parseFloat(style.columnGap || style.gap) || 18;
    const rowH = parseFloat(style.gridAutoRows) || 150;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const cellW = (rect.width - gapPx * (numCols - 1)) / numCols;
    const col = Math.max(1, Math.min(numCols, Math.floor(x / (cellW + gapPx)) + 1));
    const row = Math.max(1, Math.floor(y / (rowH + gapPx)) + 1);
    return { col, row };
  }, []);

  const checkConflict = useCallback((cardId, pos, spans) => {
    const { cols, rows } = spans;
    const numCols = gridRef.current
      ? (getComputedStyle(gridRef.current).gridTemplateColumns.split(' ').filter(Boolean).length || 4)
      : 4;
    if (pos.col + cols - 1 > numCols) return true;
    for (const [otherId, otherPos] of Object.entries(positions)) {
      if (otherId === cardId) continue;
      const { cols: oc, rows: or } = CARD_SIZE_SPANS[sizes[otherId] || "medium"];
      if (
        pos.col < otherPos.col + oc && pos.col + cols > otherPos.col &&
        pos.row < otherPos.row + or && pos.row + rows > otherPos.row
      ) return true;
    }
    return false;
  }, [positions, sizes]);

  const setSize = useCallback((id, s) => {
    const { cols } = CARD_SIZE_SPANS[s];
    setPositions(prev => {
      const pos = prev[id] || { col: 1, row: 1 };
      const clampedCol = Math.min(pos.col, 5 - cols);
      return clampedCol !== pos.col ? { ...prev, [id]: { ...pos, col: clampedCol } } : prev;
    });
    setSizes(prev => ({ ...prev, [id]: s }));
  }, []);

  const handleGridDragOver = useCallback((e) => {
    e.preventDefault();
    if (!draggingId) return;
    const cell = getCellFromMouse(e.clientX, e.clientY);
    if (cell) setDropTarget(cell);
  }, [draggingId, getCellFromMouse]);

  const handleGridDrop = useCallback((e) => {
    e.preventDefault();
    if (!draggingId || !dropTarget) return;
    const spans = CARD_SIZE_SPANS[sizes[draggingId] || "medium"];
    if (!checkConflict(draggingId, dropTarget, spans))
      setPositions(prev => ({ ...prev, [draggingId]: dropTarget }));
    setDraggingId(null);
    setDropTarget(null);
  }, [draggingId, dropTarget, sizes, checkConflict]);

  // ── Touch drag (desktop only — mobile uses Edit Layout modal) ──
  const touchDragId = useRef(null);
  const touchEnabled = typeof window !== "undefined" && !window.matchMedia("(max-width: 767px)").matches;
  useLongPressTouch(gridRef, {
    onStart: (x, y) => {
      const el = document.elementFromPoint(x, y);
      const item = el?.closest?.("[data-drag-id]");
      const id = item?.dataset?.dragId;
      if (!id) return;
      touchDragId.current = id;
      setDraggingId(id);
    },
    onMove: (x, y) => {
      if (!touchDragId.current) return;
      if (isAutoLayout) {
        const el = document.elementFromPoint(x, y);
        const item = el?.closest?.("[data-drag-id]");
        if (autoDropRef.current.overEl && autoDropRef.current.overEl !== item) {
          autoDropRef.current.overEl.classList.remove("drop-before", "drop-after");
        }
        if (item && item.dataset.dragId !== touchDragId.current) {
          const rect = item.getBoundingClientRect();
          const before = x < rect.left + rect.width / 2;
          item.classList.add(before ? "drop-before" : "drop-after");
          autoDropRef.current = { overEl: item, before };
        }
      } else {
        const cell = getCellFromMouse(x, y);
        if (cell) setDropTarget(cell);
      }
    },
    onEnd: () => {
      const id = touchDragId.current;
      if (!id) return;
      touchDragId.current = null;
      if (isAutoLayout) {
        const { overEl, before } = autoDropRef.current;
        if (overEl) {
          overEl.classList.remove("drop-before", "drop-after");
          onAutoReorder?.(id, overEl.dataset.dragId, before);
        }
        autoDropRef.current = { overEl: null, before: true };
      } else {
        setDropTarget(prev => {
          if (prev) {
            const spans = CARD_SIZE_SPANS[sizes[id] || "medium"];
            if (!checkConflict(id, prev, spans))
              setPositions(p => ({ ...p, [id]: prev }));
          }
          return null;
        });
      }
      setDraggingId(null);
    },
  }, 400, touchEnabled);

  return {
    gridRef, positions, sizes, setSize,
    draggingId, setDraggingId, dropTarget, setDropTarget,
    handleGridDragOver, handleGridDrop, checkConflict,
    isAutoLayout, autoDropRef,
  };
}

function DraggableGrid({ pageKey, items, resizable, defaultSizes, defaultPositions, mobileOrder, className, onReorder }) {
  const commitReorder = useCallback((fromId, toId, before) => {
    if (!fromId || !toId || fromId === toId || !onReorder) return;
    const base = mobileOrder || items.map(i => i.id);
    const next = base.filter(x => x !== fromId);
    const ti = next.indexOf(toId);
    if (ti === -1) return;
    next.splice(before ? ti : ti + 1, 0, fromId);
    onReorder(next);
  }, [mobileOrder, items, onReorder]);

  const {
    gridRef, positions, sizes, setSize,
    draggingId, setDraggingId, dropTarget, setDropTarget,
    handleGridDragOver, handleGridDrop, checkConflict,
    isAutoLayout, autoDropRef,
  } = useDraggableGrid(pageKey, items.map(i => i.id), defaultSizes, defaultPositions, commitReorder);

  // On mobile/auto-layout the CSS collapses the grid to auto positions using DOM order,
  // so we sort items by mobileOrder when it's provided.
  const orderedItems = mobileOrder
    ? [...items].sort((a, b) => mobileOrder.indexOf(a.id) - mobileOrder.indexOf(b.id))
    : items;

  const maxRow = items.reduce((max, { id }) => {
    const pos = positions[id] || { col: 1, row: 1 };
    const { rows } = CARD_SIZE_SPANS[sizes[id] || "medium"];
    return Math.max(max, pos.row + rows - 1);
  }, 1);

  const gridDragHandlers = isAutoLayout ? {
    onDragOver: (e) => e.preventDefault(),
    onDrop: (e) => e.preventDefault(),
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) {
        if (autoDropRef.current.overEl) {
          autoDropRef.current.overEl.classList.remove("drop-before", "drop-after");
          autoDropRef.current.overEl = null;
        }
        setDraggingId(null);
      }
    },
  } : {
    onDragOver: handleGridDragOver,
    onDrop: handleGridDrop,
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) { setDraggingId(null); setDropTarget(null); } },
  };

  return (
    <div
      className={className ? `grid ${className}` : "grid"}
      ref={gridRef}
      style={{ gridTemplateRows: `repeat(${maxRow + 2}, var(--row-h, 150px))` }}
      {...gridDragHandlers}
    >
      {!isAutoLayout && dropTarget && draggingId && (() => {
        const sz = sizes[draggingId] || "medium";
        const sp = CARD_SIZE_SPANS[sz];
        const conflict = checkConflict(draggingId, dropTarget, sp);
        return (
          <div
            className="drop-ghost"
            style={{
              gridColumn: `${dropTarget.col} / span ${sp.cols}`,
              gridRow: `${dropTarget.row} / span ${sp.rows}`,
              borderColor: conflict ? "var(--crit)" : "var(--accent)",
              background: conflict ? "rgba(255,80,80,0.08)" : "rgba(34,211,167,0.08)",
            }}
          />
        );
      })()}
      {orderedItems.map(({ id, node }) => {
        const pos = positions[id] || { col: 1, row: 1 };
        const size = sizes[id] || "medium";
        const { cols, rows } = CARD_SIZE_SPANS[size];
        const autoHandlers = isAutoLayout ? {
          onDragOver: (e) => {
            e.preventDefault();
            e.stopPropagation();
            const el = e.currentTarget;
            if (autoDropRef.current.overEl && autoDropRef.current.overEl !== el)
              autoDropRef.current.overEl.classList.remove("drop-before", "drop-after");
            const before = e.clientX < el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2;
            el.classList.remove("drop-before", "drop-after");
            el.classList.add(before ? "drop-before" : "drop-after");
            autoDropRef.current = { overEl: el, before };
          },
          onDragLeave: (e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              e.currentTarget.classList.remove("drop-before", "drop-after");
              if (autoDropRef.current.overEl === e.currentTarget) autoDropRef.current.overEl = null;
            }
          },
          onDrop: (e) => {
            e.preventDefault();
            const fromId = draggingId;
            const { before } = autoDropRef.current;
            e.currentTarget.classList.remove("drop-before", "drop-after");
            autoDropRef.current = { overEl: null, before: true };
            commitReorder(fromId, id, before);
            setDraggingId(null);
          },
        } : {};
        return (
          <div
            key={id}
            className={`drag-item${draggingId === id ? " dragging" : ""}`}
            style={isAutoLayout ? undefined : { gridColumn: `${pos.col} / span ${cols}`, gridRow: `${pos.row} / span ${rows}` }}
            data-drag-id={id}
            draggable
            onDragStart={(e) => { setDraggingId(id); e.dataTransfer.effectAllowed = "move"; }}
            onDragEnd={() => {
              if (autoDropRef.current.overEl) {
                autoDropRef.current.overEl.classList.remove("drop-before", "drop-after");
                autoDropRef.current = { overEl: null, before: true };
              }
              setDraggingId(null);
              setDropTarget(null);
            }}
            {...autoHandlers}
          >
            <DragHandle />
            {resizable.has(id) && (
              <div className="size-overlay">
                <SizeCtrl size={size} onChange={s => setSize(id, s)} sizes={ALL_SIZES} />
              </div>
            )}
            {node}
          </div>
        );
      })}
    </div>
  );
}

// ─── SYSTEM INFO BUTTON ──────────────────────────────────────────
const SysRow = ({ label, value }) => (
  <div className="sysinfo-row">
    <span className="sysinfo-lbl">{label}</span>
    <span className="sysinfo-val">{value}</span>
  </div>
);

function InfoButton() {
  const [open, setOpen]       = useState(false);
  const [info, setInfo]       = useState(null);
  const [fetching, setFetch]  = useState(false);
  const [pos, setPos]         = useState({ top: 0, left: 0 });
  const wrapRef               = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) {
      if (window.innerWidth <= 600) {
        const headerBottom = document.querySelector('.header')?.getBoundingClientRect().bottom ?? rect.bottom;
        setPos({ top: headerBottom + 8, left: 8, right: 8, width: 'auto' });
      } else {
        const popW = 270 + 8; // min-width + right padding
        const left = Math.min(rect.left, window.innerWidth - popW);
        setPos({ top: rect.bottom + 10, left: Math.max(8, left) });
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open || info || fetching) return;
    setFetch(true);
    Promise.all([
      fetch(`${GLANCES_API}/system`).then(r => r.json()).catch(() => null),
      fetch(`${GLANCES_API}/version`).then(r => r.json()).catch(() => null),
      fetch(`${GLANCES_API}/core`).then(r => r.json()).catch(() => null),
      fetch(`${GLANCES_API}/psutilversion`).then(r => r.json()).catch(() => null),
      fetch(`${GLANCES_API}/ip`).then(r => r.json()).catch(() => null),
    ]).then(([system, version, core, psutil, ip]) => {
      setInfo({ system, version, core, psutil, ip });
      setFetch(false);
    });
  }, [open, info, fetching]);

  const ver = info?.version;
  const glancesVer = typeof ver === "string" ? ver : (ver?.version ?? ver?.glances ?? null);
  const psutilVer  = typeof info?.psutil === "string" ? info.psutil : (info?.psutil?.version ?? null);
  const cores      = info?.core;
  const sys        = info?.system;
  const ip         = info?.ip;

  return (
    <div className="sysinfo-wrap" ref={wrapRef}>
      <button
        className={`sysinfo-btn${open ? " active" : ""}`}
        onClick={() => setOpen(o => !o)}
        aria-label="System information"
      >
        i
      </button>
      {open && createPortal(
        <div className="sysinfo-popover fade-in" style={pos}>
          {fetching ? (
            <div className="sysinfo-loading">Loading…</div>
          ) : (
            <>
              <div className="sysinfo-heading">System</div>
              {sys?.hostname    && <SysRow label="Hostname" value={sys.hostname} />}
              {sys?.os_name     && <SysRow label="OS"       value={`${sys.os_name} ${sys.os_version ?? ""}`.trim()} />}
              {sys?.linux_distro && <SysRow label="Distro"  value={sys.linux_distro} />}
              {sys?.platform    && <SysRow label="Platform" value={sys.platform} />}
              {cores            && <SysRow label="CPU Cores" value={`${cores.phys_cores ?? "—"} phys / ${cores.log_cores ?? "—"} logical`} />}
              {ip && (<>
                <div className="sysinfo-divider" />
                <div className="sysinfo-heading">Network</div>
                {ip.address    && <SysRow label="Local IP"   value={ip.address} />}
                {ip.mask       && <SysRow label="Mask"       value={ip.mask} />}
                {ip.gateway    && <SysRow label="Gateway"    value={ip.gateway} />}
                {ip.public_address && <SysRow label="Public IP"  value={ip.public_address} />}
              </>)}
              <div className="sysinfo-divider" />
              <div className="sysinfo-heading">Versions</div>
              {glancesVer  && <SysRow label="Glances" value={glancesVer} />}
              {psutilVer   && <SysRow label="psutil"  value={psutilVer} />}
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── NAV SIDEBAR ─────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "main",       label: "Main",                  shortLabel: "Home",      abbr: "HM", col: "#22D3A7",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { id: "media-auto", label: "Media Automation",       shortLabel: "Automate",  abbr: "MA", col: "#A855F7",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="8" width="20" height="14" rx="2"/><path d="M2 13h20"/><path d="M4 8V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2"/><path d="M7 6l2 2M13 5l2 3"/></svg> },
  { id: "media-srv",  label: "Media Server",           shortLabel: "Media",     abbr: "MS", col: "#00A4DC",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg> },
  { id: "mgmt",       label: "Management",             shortLabel: "Manage",    abbr: "MG", col: "#EF4444",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg> },
  { id: "downloads",  label: "Downloads & Transcodes", shortLabel: "Downloads", abbr: "DL", col: "#2979FF",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> },
  { id: "quick-look", label: "Quick Look",             shortLabel: "Quick",     abbr: "QL", col: "#22D3A7",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="7"/><line x1="21" y1="21" x2="15.65" y2="15.65"/></svg> },
];

function NavSidebar({ isOpen, activePage, onNavigate, onClose, themeColors, onThemeChange, alerts, onResetLayout }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [alertsOpen,   setAlertsOpen]   = useState(false);

  const activeAlerts = (alerts || []).filter(a => a.end === -1);
  const hasCrit = activeAlerts.some(a => a.state === "CRITICAL");
  const hasWarn = activeAlerts.some(a => a.state === "WARNING");

  return (
    <>
      {isOpen && <div className="nav-backdrop" onClick={() => { onClose(); setSettingsOpen(false); }} />}
      <div className={`nav-sidebar${isOpen ? " open" : ""}`} style={{ display: "flex", flexDirection: "column" }}>
        <div className="nav-header">
          <Logo size={32} onClick={() => { onNavigate("main"); onClose(); }} />
          <div>
            <div className="nav-header-title">2EZ</div>
            <div style={{ fontSize: 10, color: "var(--text-dim)" }}>2ez.dinosaur-banana.ts.net</div>
          </div>
        </div>

        <div className="nav-section-lbl">Navigation</div>

        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`nav-item${activePage === item.id ? " active" : ""}`}
            onClick={() => onNavigate(item.id)}
          >
            <div className="nav-item-icon" style={{
              background: activePage === item.id ? item.col + "22" : "rgba(255,255,255,0.04)",
              border: `1px solid ${activePage === item.id ? item.col + "44" : "rgba(255,255,255,0.06)"}`,
              color: activePage === item.id ? item.col : "var(--text-dim)",
            }}>
              {item.abbr}
            </div>
            {item.label}
          </button>
        ))}

        <div className="nav-footer">
          <button className="alerts-nav-btn" onClick={() => { setAlertsOpen(o => !o); setSettingsOpen(false); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            Alerts
            <span className={`alert-count-badge ${hasCrit ? "crit" : hasWarn ? "warn" : "ok"}`}>
              {activeAlerts.length}
            </span>
          </button>

          <button className="settings-cog-btn" onClick={() => { setSettingsOpen(o => !o); setAlertsOpen(false); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            Settings
          </button>
        </div>

      </div>

      {alertsOpen && (
        <AlertsPanel
          alerts={alerts}
          onClose={() => setAlertsOpen(false)}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          colors={themeColors}
          onChange={onThemeChange}
          onClose={() => setSettingsOpen(false)}
          onResetLayout={onResetLayout}
        />
      )}
    </>
  );
}

// ─── BOTTOM TAB BAR ──────────────────────────────────────────────
const SettingsCogIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

function BottomTabBar({ activePage, onNavigate, settingsOpen, onSettingsToggle }) {
  const tabs = NAV_ITEMS.filter(item => item.id !== "quick-look");
  return (
    <nav className="bottom-tab-bar">
      {tabs.map((item) => (
        <button
          key={item.id}
          className={`tab-item${activePage === item.id ? " active" : ""}`}
          onClick={() => onNavigate(item.id)}
          aria-label={item.label}
          style={activePage === item.id ? { color: item.col } : {}}
        >
          {item.icon}
          <span className="tab-item-label">{item.shortLabel}</span>
        </button>
      ))}
      <button
        className={`tab-item${settingsOpen ? " active" : ""}`}
        onClick={onSettingsToggle}
        aria-label="Settings"
        style={settingsOpen ? { color: "var(--text)" } : {}}
      >
        <SettingsCogIcon />
        <span className="tab-item-label">Settings</span>
      </button>
    </nav>
  );
}

// ─── GRID LAYOUT CONSTANTS ────────────────────────────────────────
// Small=1×1, Medium=1×2, Large=2×3. M+S=L, 3S=L.
const CARD_SIZE_SPANS = {
  compact: { cols: 1, rows: 1 },
  medium:  { cols: 1, rows: 2 },
  large:   { cols: 2, rows: 3 },
};

const DEFAULT_POSITIONS = {
  cpu:        { col: 1, row: 1 },
  mem:        { col: 2, row: 1 },
  memswap:    { col: 3, row: 1 },
  temps:      { col: 4, row: 1 },
  storage:    { col: 1, row: 3 },
  network:    { col: 2, row: 3 },
  containers: { col: 3, row: 3 },
  processes:  { col: 4, row: 3 },
};
const MAIN_CARD_LABELS = {
  cpu: "Processor", mem: "Memory", memswap: "Swap", temps: "Temps",
  storage: "Disk", network: "Network", containers: "Containers", processes: "Processes",
};

// Reset layout: all Small, alphabetical A-Z left-to-right
const RESET_POSITIONS = {
  containers: { col: 1, row: 1 },
  cpu:        { col: 2, row: 1 },
  mem:        { col: 3, row: 1 },
  memswap:    { col: 4, row: 1 },
  network:    { col: 1, row: 2 },
  processes:  { col: 2, row: 2 },
  storage:    { col: 3, row: 2 },
  temps:      { col: 4, row: 2 },
};
const RESET_SIZES = {
  cpu: "compact", mem: "compact", memswap: "compact", temps: "compact",
  storage: "compact", network: "compact", containers: "compact",
};

function Skeleton() {
  return (
    <div style={{ padding: "4px 0" }}>
      <div className="skeleton-line" style={{ width: "60%" }} />
      <div className="skeleton-line" style={{ width: "85%" }} />
      <div className="skeleton-line" style={{ width: "45%" }} />
    </div>
  );
}

// ─── MAIN PAGE (system dashboard) ────────────────────────────────
function MainPage({ onMenuToggle, bellProps, layoutResetKey }) {
  const { glances: data, connected, glHistory: history, diskHistory: diskioHistory } = useData();
  const [time, setTime] = useState(new Date());
  const [containerView, setContainerView] = useState(false);
  const [processView,   setProcessView]   = useState(false);
  const [editLayoutOpen, setEditLayoutOpen] = useState(false);

  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 600px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 600px)");
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const [isAutoLayout, setIsAutoLayout] = useState(() => window.matchMedia("(max-width: 1100px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1100px)");
    const handler = (e) => setIsAutoLayout(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const mainDefaultIds = Object.keys(DEFAULT_POSITIONS);
  const [mobileOrder, setMobileOrder] = useMobileOrder("main", mainDefaultIds);
  const mainModalItems = mainDefaultIds.map(id => ({ id, label: MAIN_CARD_LABELS[id] ?? id }));

  const [cardPositions, setCardPositions] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("2ez-positions-main") || "null");
      if (saved && typeof saved === "object" && !Array.isArray(saved)) {
        return { ...DEFAULT_POSITIONS, ...saved };
      }
    } catch {}
    return DEFAULT_POSITIONS;
  });

  useEffect(() => {
    localStorage.setItem("2ez-positions-main", JSON.stringify(cardPositions));
  }, [cardPositions]);

  const gridRef = useRef(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const autoDropRef = useRef({ overEl: null, before: true });

  const DEFAULT_CARD_SIZES = { cpu: "medium", mem: "medium", memswap: "medium", temps: "medium", storage: "medium", network: "medium", containers: "medium", processes: "compact" };
  const [cardSizes, setCardSizes] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("2ez-card-sizes") || "null");
      return { ...DEFAULT_CARD_SIZES, ...(saved || {}) };
    } catch { return DEFAULT_CARD_SIZES; }
  });

  useEffect(() => {
    if (layoutResetKey === 0) return;
    setCardPositions(RESET_POSITIONS);
    setCardSizes(RESET_SIZES);
  }, [layoutResetKey]);

  const setSize = (id, s) => {
    const { cols } = CARD_SIZE_SPANS[s];
    setCardPositions(prev => {
      const pos = prev[id] || { col: 1, row: 1 };
      const clampedCol = Math.min(pos.col, 5 - cols);
      return clampedCol !== pos.col ? { ...prev, [id]: { ...pos, col: clampedCol } } : prev;
    });
    setCardSizes(prev => ({ ...prev, [id]: s }));
  };

  const getCellFromMouse = useCallback((clientX, clientY) => {
    if (!gridRef.current) return null;
    const el = gridRef.current;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const numCols = style.gridTemplateColumns.split(' ').filter(Boolean).length || 4;
    const gapPx = parseFloat(style.columnGap || style.gap) || 18;
    const rowH = parseFloat(style.gridAutoRows) || 150;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const cellW = (rect.width - gapPx * (numCols - 1)) / numCols;
    const col = Math.max(1, Math.min(numCols, Math.floor(x / (cellW + gapPx)) + 1));
    const row = Math.max(1, Math.floor(y / (rowH + gapPx)) + 1);
    return { col, row };
  }, []);

  const checkConflict = useCallback((cardId, pos, spans) => {
    const { cols, rows } = spans;
    const numCols = gridRef.current
      ? (getComputedStyle(gridRef.current).gridTemplateColumns.split(' ').filter(Boolean).length || 4)
      : 4;
    if (pos.col + cols - 1 > numCols) return true;
    for (const [otherId, otherPos] of Object.entries(cardPositions)) {
      if (otherId === cardId) continue;
      const otherSize = cardSizes[otherId] || "medium";
      const { cols: oc, rows: or } = CARD_SIZE_SPANS[otherSize];
      if (
        pos.col < otherPos.col + oc &&
        pos.col + cols > otherPos.col &&
        pos.row < otherPos.row + or &&
        pos.row + rows > otherPos.row
      ) return true;
    }
    return false;
  }, [cardPositions, cardSizes]);

  const handleGridDragOver = useCallback((e) => {
    e.preventDefault();
    if (!draggingId) return;
    const cell = getCellFromMouse(e.clientX, e.clientY);
    if (cell) setDropTarget(cell);
  }, [draggingId, getCellFromMouse]);

  const handleGridDrop = useCallback((e) => {
    e.preventDefault();
    if (!draggingId || !dropTarget) return;
    const size = cardSizes[draggingId] || "medium";
    const spans = CARD_SIZE_SPANS[size];
    if (!checkConflict(draggingId, dropTarget, spans)) {
      setCardPositions(prev => ({ ...prev, [draggingId]: dropTarget }));
    }
    setDraggingId(null);
    setDropTarget(null);
  }, [draggingId, dropTarget, cardSizes, checkConflict]);

  // ── Touch drag (desktop only — mobile uses Edit Layout modal) ──
  const mainTouchDragId = useRef(null);
  const mainTouchEnabled = typeof window !== "undefined" && !window.matchMedia("(max-width: 767px)").matches;
  useLongPressTouch(gridRef, {
    onStart: (x, y) => {
      const el = document.elementFromPoint(x, y);
      const item = el?.closest?.("[data-drag-id]");
      const id = item?.dataset?.dragId;
      if (!id) return;
      mainTouchDragId.current = id;
      setDraggingId(id);
    },
    onMove: (x, y) => {
      if (!mainTouchDragId.current) return;
      if (isAutoLayout) {
        const el = document.elementFromPoint(x, y);
        const item = el?.closest?.("[data-drag-id]");
        if (autoDropRef.current.overEl && autoDropRef.current.overEl !== item)
          autoDropRef.current.overEl.classList.remove("drop-before", "drop-after");
        if (item && item.dataset.dragId !== mainTouchDragId.current) {
          const rect = item.getBoundingClientRect();
          const before = x < rect.left + rect.width / 2;
          item.classList.add(before ? "drop-before" : "drop-after");
          autoDropRef.current = { overEl: item, before };
        }
      } else {
        const cell = getCellFromMouse(x, y);
        if (cell) setDropTarget(cell);
      }
    },
    onEnd: () => {
      const id = mainTouchDragId.current;
      if (!id) return;
      mainTouchDragId.current = null;
      if (isAutoLayout) {
        const { overEl, before } = autoDropRef.current;
        if (overEl) {
          overEl.classList.remove("drop-before", "drop-after");
          const toId = overEl.dataset.dragId;
          if (toId && toId !== id) {
            setMobileOrder(prev => {
              const next = prev.filter(x => x !== id);
              const ti = next.indexOf(toId);
              if (ti === -1) return prev;
              next.splice(before ? ti : ti + 1, 0, id);
              return next;
            });
          }
        }
        autoDropRef.current = { overEl: null, before: true };
      } else {
        setDropTarget(prev => {
          if (prev) {
            const spans = CARD_SIZE_SPANS[cardSizes[id] || "medium"];
            if (!checkConflict(id, prev, spans))
              setCardPositions(p => ({ ...p, [id]: prev }));
          }
          return null;
        });
      }
      setDraggingId(null);
    },
  }, 400, mainTouchEnabled);

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    localStorage.setItem("2ez-card-sizes", JSON.stringify(cardSizes));
  }, [cardSizes]);

  const runningCount = data.docker ? data.docker.filter(d => d.status === "running").length : 0;
  const sortedDocker = data.docker ? [...data.docker].sort((a, b) => b.cpu - a.cpu) : [];

  return (
    <div className="shell">
      <header className="header fade-in">
        <div className="header-left">
          <button className="hamburger-btn" onClick={onMenuToggle} aria-label="Open menu">
            <HamburgerIcon />
          </button>
          <Logo size={38} />
        </div>
        <div className="header-right">
          {data.uptime && (
            <div className="uptime-strip">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              {data.uptime}
            </div>
          )}
          <span className="header-clock">{time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
          <button className="edit-layout-btn" onClick={() => setEditLayoutOpen(true)} aria-label="Edit layout">
            <PencilIcon />
          </button>
          {bellProps && <NotificationBell {...bellProps} />}
          <InfoButton />
          <div className="live-badge">
            <div className="live-dot" style={{ background: connected ? "var(--accent)" : "var(--crit)" }} />
            {connected ? "LIVE" : "OFFLINE"}
          </div>
        </div>
      </header>

      <div className="grid" ref={gridRef}
        onDragOver={isAutoLayout ? (e) => e.preventDefault() : handleGridDragOver}
        onDrop={isAutoLayout ? (e) => e.preventDefault() : handleGridDrop}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            if (isAutoLayout && autoDropRef.current.overEl) {
              autoDropRef.current.overEl.classList.remove("drop-before", "drop-after");
              autoDropRef.current.overEl = null;
            }
            setDraggingId(null);
            setDropTarget(null);
          }
        }}
      >
        {!isAutoLayout && dropTarget && draggingId && (() => {
          const sz = cardSizes[draggingId] || "medium";
          const sp = CARD_SIZE_SPANS[sz];
          const conflict = checkConflict(draggingId, dropTarget, sp);
          return (
            <div className="drop-ghost" style={{ gridColumn: `${dropTarget.col} / span ${sp.cols}`, gridRow: `${dropTarget.row} / span ${sp.rows}`, borderColor: conflict ? "var(--crit)" : "var(--accent)", background: conflict ? "rgba(255,80,80,0.08)" : "rgba(34,211,167,0.08)" }} />
          );
        })()}
        {((isMobile || isAutoLayout) ? mobileOrder : Object.keys(DEFAULT_POSITIONS)).map((id) => {
          const RESIZABLE = new Set(["cpu","mem","memswap","temps","storage","network","containers"]);
          const COMPACT_ONLY = new Set(["processes"]);
          const pos = cardPositions[id] || DEFAULT_POSITIONS[id];
          const size = RESIZABLE.has(id) ? (cardSizes[id] || "medium") : COMPACT_ONLY.has(id) ? "compact" : "medium";
          const { cols, rows } = CARD_SIZE_SPANS[size];
          const renderSize = isMobile ? (size === "large" ? "medium" : size) : size;
          const SM_ONLY = new Set(["mem","temps","storage","memswap"]);
          const ctrl = RESIZABLE.has(id)
            ? <SizeCtrl size={renderSize} onChange={s => setSize(id, s)} sizes={(isMobile || SM_ONLY.has(id)) ? SM_SIZES : ALL_SIZES} />
            : null;
          const isContainerFull = id === "containers" && containerView;
          const gridCol = isContainerFull ? "1 / -1" : `${pos.col} / span ${cols}`;
          const gridRow = isMobile ? `span ${CARD_SIZE_SPANS[renderSize].rows}` : `${pos.row} / span ${rows}`;

                let node;
            switch (id) {
              case "cpu": node = (
                <Card title="Processor" controls={ctrl}>
                  {!data.cpu ? <Skeleton /> : renderSize === "compact" ? (
                    <>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                        <div className="big-num" style={{ color: statusColor(data.cpu.total) }}><AnimNum value={data.cpu.total} /></div>
                        <span className="label-sm">%</span>
                      </div>
                      <Spark data={history.cpu} color={statusColor(data.cpu.total)} height={28} width={180} />
                    </>
                  ) : (
                    <>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                        <div>
                          <div className="big-num" style={{ color: statusColor(data.cpu.total) }}><AnimNum value={data.cpu.total} /></div>
                          <div className="label-sm" style={{ marginTop: 4 }}>{data.cpu.model}</div>
                          {data.cpu.freq > 0 && <div className="label-xs" style={{ marginTop: 2 }}>{fmt.freq(data.cpu.freq)}</div>}
                        </div>
                        <div style={{ width: renderSize === "large" ? 180 : 120, flexShrink: 0 }}>
                          <Spark data={history.cpu} color={statusColor(data.cpu.total)} height={renderSize === "large" ? 72 : 40} width={renderSize === "large" ? 180 : 120} />
                        </div>
                      </div>
                      <div className="cores-grid">
                        {data.cpu.cores.map((c, i) => (
                          <div key={i} className="core-bar-wrap">
                            <div className="core-bar-outer" style={renderSize === "large" ? { height: 56 } : {}}>
                              <div className="core-bar-inner" style={{ height: `${Math.max(2, c)}%`, background: statusColor(c), opacity: 0.8 }} />
                            </div>
                            <span className="core-label">{i}</span>
                          </div>
                        ))}
                      </div>
                      {renderSize === "large" && data.cpu.cores.length > 0 && (
                        <div style={{ display: "flex", gap: 12, marginTop: 10, borderTop: "1px solid var(--card-border)", paddingTop: 10, flexWrap: "wrap" }}>
                          <div className="stat-row" style={{ flex: 1 }}>
                            <span className="label-sm">Peak core</span>
                            <span className="mono label-sm" style={{ color: statusColor(Math.max(...data.cpu.cores)) }}>{Math.max(...data.cpu.cores).toFixed(0)}%</span>
                          </div>
                          <div className="stat-row" style={{ flex: 1 }}>
                            <span className="label-sm">Avg core</span>
                            <span className="mono label-sm">{(data.cpu.cores.reduce((a, b) => a + b, 0) / data.cpu.cores.length).toFixed(0)}%</span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </Card>
              ); break;

              case "mem": node = (
                <Card title="Memory" controls={ctrl}>
                  {!data.mem ? <Skeleton /> : renderSize === "compact" ? (
                    <>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                        <div className="big-num" style={{ color: statusColor(data.mem.percent) }}>{data.mem.percent.toFixed(0)}</div>
                        <span className="label-sm">%</span>
                      </div>
                      <Bar value={data.mem.percent} height={6} />
                      <div className="stat-row" style={{ marginTop: 4 }}>
                        <span className="label-sm">{fmt.bytes(data.mem.used)}</span>
                        <span className="label-sm" style={{ opacity: 0.5 }}>/ {fmt.bytes(data.mem.total)}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                        <Ring value={data.mem.percent} size={renderSize === "large" ? 150 : 110} label="Used" />
                      </div>
                      <div className="stat-row">
                        <span className="label-sm">Used</span>
                        <span className="mono label-sm">{fmt.bytes(data.mem.used)}</span>
                      </div>
                      <div className="stat-row">
                        <span className="label-sm">Total</span>
                        <span className="mono label-sm">{fmt.bytes(data.mem.total)}</span>
                      </div>
                      {renderSize === "large" && (
                        <div className="stat-row">
                          <span className="label-sm">Free</span>
                          <span className="mono label-sm">{fmt.bytes(data.mem.total - data.mem.used)}</span>
                        </div>
                      )}
                    </>
                  )}
                </Card>
              ); break;

              case "memswap": node = (
                <Card title="Swap" controls={ctrl}>
                  {!data.memswap ? <Skeleton /> : renderSize === "compact" ? (
                    <>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                        <div className="big-num" style={{ color: statusColor(data.memswap.percent) }}>{data.memswap.percent.toFixed(0)}</div>
                        <span className="label-sm">%</span>
                      </div>
                      <Bar value={data.memswap.percent} height={6} />
                      <div className="stat-row" style={{ marginTop: 4 }}>
                        <span className="label-sm">{fmt.bytes(data.memswap.used)}</span>
                        <span className="label-sm" style={{ opacity: 0.5 }}>/ {fmt.bytes(data.memswap.total)}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                        <Ring value={data.memswap.total > 0 ? data.memswap.percent : 0} size={110} label="Used" color={data.memswap.total === 0 ? "var(--text-dim)" : undefined} />
                      </div>
                      <div className="stat-row">
                        <span className="label-sm">Used</span>
                        <span className="mono label-sm">{fmt.bytes(data.memswap.used)}</span>
                      </div>
                      <div className="stat-row">
                        <span className="label-sm">Total</span>
                        <span className="mono label-sm">{data.memswap.total > 0 ? fmt.bytes(data.memswap.total) : "No swap"}</span>
                      </div>
                      <div className="stat-row">
                        <span className="label-sm">Swap In</span>
                        <span className="mono label-sm" style={{ color: "var(--accent)" }}>{fmt.bytes(data.memswap.sin)}</span>
                      </div>
                      <div className="stat-row">
                        <span className="label-sm">Swap Out</span>
                        <span className="mono label-sm" style={{ color: "var(--warn)" }}>{fmt.bytes(data.memswap.sout)}</span>
                      </div>
                    </>
                  )}
                </Card>
              ); break;

              case "temps": node = (
                <Card title="Temperatures" controls={ctrl}>
                  {!data.sensors ? <Skeleton /> : renderSize === "compact" ? (
                    data.sensors.length > 0 ? (
                      <>
                        <div className="big-num" style={{ color: tempColor(Math.max(...data.sensors.map(s => s.value))), marginBottom: 6 }}>
                          {Math.max(...data.sensors.map(s => s.value)).toFixed(0)}°
                        </div>
                        <div className="label-xs" style={{ opacity: 0.5 }}>°C · peak sensor</div>
                      </>
                    ) : <span className="label-sm" style={{ opacity: 0.4 }}>No data</span>
                  ) : (
                    <div className="temp-grid">
                      {data.sensors.map((s, i) => (
                        <Ring key={i} value={s.value} size={renderSize === "large" ? 96 : 72} stroke={5} color={tempColor(s.value)} label={s.label} format="temp" />
                      ))}
                    </div>
                  )}
                </Card>
              ); break;

              case "storage": node = (
                <Card title="Storage" controls={ctrl}>
                  {!data.fs ? <Skeleton /> : data.fs
                    .filter(d =>
                      d.mnt_point.includes("ironwolf") ||
                      d.mnt_point === "/host"
                    )
                    .filter((d, i, arr) => arr.findIndex(x => x.device_name === d.device_name) === i)
                    .map((d, i) => {
                      const label =
                        d.mnt_point.endsWith("ironwolf") ? "Ironwolf 8TB" :
                        d.mnt_point === "/host"           ? "Host"          :
                        d.mnt_point;
                      return (
                        <Bar key={d.mnt_point} value={d.percent} label={label}
                          detail={`${fmt.bytes(d.used)} / ${fmt.bytes(d.size)}`}
                          height={renderSize === "large" ? 12 : 8} delay={i * 80} />
                      );
                    })
                  }
                  {renderSize !== "compact" && data.diskio && data.diskio.length > 0 && (
                    <div style={{ marginTop: 10, borderTop: "1px solid var(--card-border)", paddingTop: 10 }}>
                      <div className="label-xs" style={{ marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>I/O Rates</div>
                      {data.diskio.filter(d => /^nvme\d+n\d+$/.test(d.disk_name) || /^sd[a-z]$/.test(d.disk_name)).map((d, i, arr) => {
                        const hist = diskioHistory[d.disk_name] || { rx: [], tx: [] };
                        return (
                          <div key={d.disk_name} style={{ paddingBottom: i < arr.length - 1 ? 10 : 0, marginBottom: i < arr.length - 1 ? 10 : 0, borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                              <span className="mono label-sm">{d.disk_name}</span>
                              <span className="label-sm" style={{ display: "flex", gap: 8 }}>
                                <span style={{ color: "var(--accent)" }}>↓ {fmt.speed(d.read_bytes)}</span>
                                <span style={{ color: "var(--warn)" }}>↑ {fmt.speed(d.write_bytes)}</span>
                              </span>
                            </div>
                            <DualSpark id={`disk-${d.disk_name}`} rxData={hist.rx} txData={hist.tx} height={28} width={180} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              ); break;

              case "network": node = (
                <Card title="Network" controls={ctrl}>
                  {!data.network ? <Skeleton /> : <>
                    {[
                      { key: "lan", label: "LAN",       iface: data.network.lan, hist: history.lan },
                      { key: "ts",  label: "Tailscale", iface: data.network.ts,  hist: history.ts  },
                    ].map(({ key, label, iface, hist }, i) => (
                      <div key={key} style={i > 0 ? { marginTop: renderSize === "compact" ? 6 : 10, paddingTop: renderSize === "compact" ? 6 : 10, borderTop: "1px solid var(--card-border)" } : {}}>
                        <div className="label-xs" style={{ marginBottom: renderSize === "compact" ? 2 : 5, textTransform: "uppercase", letterSpacing: 1, opacity: 0.5 }}>{label}</div>
                        <div style={{ display: "flex", gap: 16, marginBottom: renderSize !== "compact" ? 6 : 0 }}>
                          <div className="net-row" style={renderSize === "compact" ? { marginBottom: 0 } : {}}>
                            <span className="net-arrow" style={{ color: "var(--accent)" }}>↓</span>
                            <span className="net-val" style={{ color: "var(--accent)", fontSize: renderSize === "compact" ? 13 : undefined }}><AnimNum value={iface ? Math.abs(iface.rx) : 0} format="speed" /></span>
                          </div>
                          <div className="net-row" style={renderSize === "compact" ? { marginBottom: 0 } : {}}>
                            <span className="net-arrow" style={{ color: "var(--warn)" }}>↑</span>
                            <span className="net-val" style={{ color: "var(--warn)", fontSize: renderSize === "compact" ? 13 : undefined }}><AnimNum value={iface ? Math.abs(iface.tx) : 0} format="speed" /></span>
                          </div>
                        </div>
                        {renderSize !== "compact" && (
                          <DualSpark id={`net-${key}`} rxData={hist.rx} txData={hist.tx} height={renderSize === "large" ? 44 : 32} width={180} />
                        )}
                      </div>
                    ))}
                  </>}
                </Card>
              ); break;

              case "containers":
                if (!data.docker) {
                  node = <Card title="Containers" controls={ctrl}><Skeleton /></Card>;
                } else if (renderSize === "compact") {
                  node = (
                    <Card title="Containers" controls={ctrl}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span className="big-num" style={{ color: "var(--accent)" }}>{runningCount}</span>
                        <span className="label-sm">/ {data.docker.length} running</span>
                      </div>
                    </Card>
                  );
                } else if (renderSize === "large" || containerView) {
                  node = (
                    <div className="card fade-in">
                      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                        <div style={{ minWidth: 180, flexShrink: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div className="card-title" style={{ margin: 0 }}>Containers</div>
                              {ctrl}
                            </div>
                            {containerView && renderSize !== "large" && (
                              <button className="close-btn" onClick={() => setContainerView(false)}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                              </button>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                            <span className="big-num" style={{ color: "var(--accent)" }}>{runningCount}</span>
                            <span className="label-sm">/ {data.docker.length} running</span>
                          </div>
                          <div style={{ marginTop: 10 }}>
                            <Bar value={(runningCount / data.docker.length) * 100} color="var(--accent)" height={4} />
                          </div>
                          <div className="stat-row" style={{ marginTop: 4 }}>
                            <span className="label-sm">Total CPU</span>
                            <span className="mono label-sm">{data.docker.reduce((a, d) => a + d.cpu, 0).toFixed(1)}%</span>
                          </div>
                          <div className="stat-row">
                            <span className="label-sm">Total RAM</span>
                            <span className="mono label-sm">{fmt.bytes(data.docker.reduce((a, d) => a + d.mem, 0))}</span>
                          </div>
                        </div>
                        <div style={{ width: 1, background: "var(--card-border)", alignSelf: "stretch", flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 240 }}>
                          <div className="card-title" style={{ marginBottom: 14 }}>Container Status</div>
                          <div className="docker-grid">
                            {sortedDocker.map((c) => <DockerItem key={c.name} {...c} />)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  node = (
                    <Card title="Containers" controls={ctrl} onClick={() => setContainerView(true)}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                        <span className="big-num" style={{ color: "var(--accent)" }}>{runningCount}</span>
                        <span className="label-sm">/ {data.docker.length} running</span>
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <Bar value={(runningCount / data.docker.length) * 100} color="var(--accent)" height={4} />
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
                  );
                }
                break;

              case "processes": {
                if (!data.processes) { node = <Card title="Processes"><Skeleton /></Card>; break; }
                const sorted = [...data.processes].sort((a, b) => (b.cpu_percent || 0) - (a.cpu_percent || 0));
                const topProc = sorted[0];
                node = (
                  <>
                    <Card title="Processes" onClick={() => setProcessView(true)}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                        <span className="big-num">{data.processes.length}</span>
                        <span className="label-sm">processes</span>
                      </div>
                      {topProc && (
                        <div className="stat-row" style={{ marginTop: 2 }}>
                          <span className="label-sm" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "65%" }}>{topProc.name}</span>
                          <span className="mono label-sm" style={{ color: statusColor(topProc.cpu_percent) }}>{(topProc.cpu_percent || 0).toFixed(1)}%</span>
                        </div>
                      )}
                    </Card>
                    {processView && createPortal(
                      <div className="proc-backdrop" onClick={() => setProcessView(false)}>
                        <div className="proc-modal" onClick={e => e.stopPropagation()}>
                          <div className="proc-modal-header">
                            <div className="card-title" style={{ margin: 0 }}>Processes ({data.processes.length})</div>
                            <button className="close-btn" onClick={() => setProcessView(false)}>× Close</button>
                          </div>
                          <div className="proc-table-wrap">
                            <table className="proc-table">
                              <thead>
                                <tr>
                                  <th>Name</th>
                                  <th className="r">PID</th>
                                  <th>User</th>
                                  <th className="r">CPU%</th>
                                  <th className="r">RAM%</th>
                                  <th className="r">Threads</th>
                                  <th>Status</th>
                                  <th>Command</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sorted.map(p => (
                                  <tr key={p.pid}>
                                    <td className="mono">{p.name}</td>
                                    <td className="r dim mono">{p.pid}</td>
                                    <td className="dim">{p.username || "—"}</td>
                                    <td className="r mono" style={{ color: statusColor(p.cpu_percent || 0) }}>{(p.cpu_percent || 0).toFixed(1)}</td>
                                    <td className="r mono" style={{ color: statusColor(p.memory_percent || 0) }}>{(p.memory_percent || 0).toFixed(1)}</td>
                                    <td className="r dim mono">{p.num_threads ?? "—"}</td>
                                    <td className="dim">{p.status || "—"}</td>
                                    <td><div className="proc-cmd">{Array.isArray(p.cmdline) ? p.cmdline.join(" ") : (p.cmdline || "—")}</div></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>,
                      document.body
                    )}
                  </>
                );
                break;
              }

              default: return null;
            }

            const mainAutoHandlers = isAutoLayout ? {
              onDragOver: (e) => {
                e.preventDefault();
                e.stopPropagation();
                const el = e.currentTarget;
                if (autoDropRef.current.overEl && autoDropRef.current.overEl !== el)
                  autoDropRef.current.overEl.classList.remove("drop-before", "drop-after");
                const rect = el.getBoundingClientRect();
                const before = e.clientX < rect.left + rect.width / 2;
                el.classList.remove("drop-before", "drop-after");
                el.classList.add(before ? "drop-before" : "drop-after");
                autoDropRef.current = { overEl: el, before };
              },
              onDragLeave: (e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) {
                  e.currentTarget.classList.remove("drop-before", "drop-after");
                  if (autoDropRef.current.overEl === e.currentTarget) autoDropRef.current.overEl = null;
                }
              },
              onDrop: (e) => {
                e.preventDefault();
                const fromId = draggingId;
                const { before } = autoDropRef.current;
                e.currentTarget.classList.remove("drop-before", "drop-after");
                autoDropRef.current = { overEl: null, before: true };
                if (!fromId || fromId === id) { setDraggingId(null); return; }
                setMobileOrder(prev => {
                  const next = prev.filter(x => x !== fromId);
                  const ti = next.indexOf(id);
                  if (ti === -1) return prev;
                  next.splice(before ? ti : ti + 1, 0, fromId);
                  return next;
                });
                setDraggingId(null);
              },
            } : {};

            return (
              <div
                key={id}
                className={`drag-item${draggingId === id ? " dragging" : ""}`}
                style={{ gridColumn: gridCol, gridRow, "--card-rows": CARD_SIZE_SPANS[renderSize].rows }}
                data-drag-id={id}
                draggable
                onDragStart={(e) => { setDraggingId(id); e.dataTransfer.effectAllowed = "move"; }}
                onDragEnd={() => {
                  if (autoDropRef.current.overEl) {
                    autoDropRef.current.overEl.classList.remove("drop-before", "drop-after");
                    autoDropRef.current = { overEl: null, before: true };
                  }
                  setDraggingId(null);
                  setDropTarget(null);
                }}
                {...mainAutoHandlers}
              >
                <DragHandle />
                {node}
              </div>
            );
          })}
      </div>
      {editLayoutOpen && (
        <LayoutEditModal
          items={mainModalItems}
          order={mobileOrder}
          onSave={o => { setMobileOrder(o); setEditLayoutOpen(false); }}
          onCancel={() => setEditLayoutOpen(false)}
        />
      )}
    </div>
  );
}

// ─── PAGE HEADER (non-main pages) ────────────────────────────────
function PageHeader({ title, onMenuToggle, onNavigate, bellProps, onEditLayout }) {
  const [time, setTime] = useState(new Date());
  const { glances: { uptime } } = useData();

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="header fade-in">
      <div className="header-left">
        <button className="hamburger-btn" onClick={onMenuToggle} aria-label="Open menu">
          <HamburgerIcon />
        </button>
        <Logo size={38} onClick={() => onNavigate("main")} />
        <div>
          <div className="header-sub" style={{ color: "var(--accent)", fontWeight: 500 }}>{title}</div>
        </div>
      </div>
      <div className="header-right">
        {typeof uptime === "string" && (
          <div className="uptime-strip">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            {uptime}
          </div>
        )}
        <span className="header-clock">{time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
        {onEditLayout && (
          <button className="edit-layout-btn" onClick={onEditLayout} aria-label="Edit layout">
            <PencilIcon />
          </button>
        )}
        {bellProps && <NotificationBell {...bellProps} />}
      </div>
    </header>
  );
}

// ─── MEDIA AUTOMATION PAGE ───────────────────────────────────────
function MediaAutomationPage({ onMenuToggle, onNavigate, bellProps }) {
  const defaultIds = ["sonarr", "radarr", "prowlarr", "bazarr", "beetsflask", "slskd", "lrcget"];
  const [mobileOrder, setMobileOrder] = useMobileOrder("media-auto", defaultIds);
  const [editOpen, setEditOpen] = useState(false);
  const items = defaultIds.map(id => ({ id, node: <SvcCard id={id} /> }));
  const modalItems = defaultIds.map(id => ({ id, label: SVC[id]?.name ?? id }));
  const defaultSizes = Object.fromEntries(defaultIds.map(id => [id, "compact"]));
  const defaultPositions = {
    sonarr: {col:1,row:1}, radarr: {col:2,row:1}, prowlarr: {col:3,row:1}, bazarr: {col:4,row:1},
    beetsflask: {col:1,row:2}, slskd: {col:2,row:2}, lrcget: {col:3,row:2},
  };
  return (
    <div className="shell">
      <PageHeader title="Media Automation" onMenuToggle={onMenuToggle} onNavigate={onNavigate} bellProps={bellProps} onEditLayout={() => setEditOpen(true)} />
      <p className="page-section">Arr Apps &amp; Tools</p>
      <DraggableGrid pageKey="media-auto" items={items} resizable={new Set()} defaultSizes={defaultSizes} defaultPositions={defaultPositions} mobileOrder={mobileOrder} className="half-mobile" onReorder={setMobileOrder} />
      {editOpen && <LayoutEditModal items={modalItems} order={mobileOrder} onSave={o => { setMobileOrder(o); setEditOpen(false); }} onCancel={() => setEditOpen(false)} />}
    </div>
  );
}

// ─── MEDIA SERVER PAGE ───────────────────────────────────────────
function MediaServerPage({ onMenuToggle, onNavigate, bellProps }) {
  const defaultIds = ["jellyfin", "navidrome", "seerr", "immich", "nextcloud"];
  const [mobileOrder, setMobileOrder] = useMobileOrder("media-srv", defaultIds);
  const [editOpen, setEditOpen] = useState(false);
  const items = [
    { id: "jellyfin",  node: <JellyfinWidget /> },
    { id: "navidrome", node: <NavidromeWidget /> },
    { id: "seerr",     node: <SvcCard id="seerr" /> },
    { id: "immich",    node: <SvcCard id="immich" /> },
    { id: "nextcloud", node: <SvcCard id="nextcloud" /> },
  ];
  const modalItems = defaultIds.map(id => ({ id, label: SVC[id]?.name ?? id }));
  const defaultSizes = { jellyfin: "medium", navidrome: "medium", seerr: "compact", immich: "compact", nextcloud: "compact" };
  const defaultPositions = {
    jellyfin: {col:1,row:1}, navidrome: {col:2,row:1},
    seerr: {col:3,row:1}, immich: {col:4,row:1}, nextcloud: {col:3,row:2},
  };
  return (
    <div className="shell">
      <PageHeader title="Media Server" onMenuToggle={onMenuToggle} onNavigate={onNavigate} bellProps={bellProps} onEditLayout={() => setEditOpen(true)} />
      <p className="page-section">Streaming &amp; Libraries</p>
      <DraggableGrid pageKey="media-srv" items={items} resizable={new Set(["jellyfin","navidrome"])} defaultSizes={defaultSizes} defaultPositions={defaultPositions} mobileOrder={mobileOrder} onReorder={setMobileOrder} />
      {editOpen && <LayoutEditModal items={modalItems} order={mobileOrder} onSave={o => { setMobileOrder(o); setEditOpen(false); }} onCancel={() => setEditOpen(false)} />}
    </div>
  );
}

// ─── MANAGEMENT PAGE ─────────────────────────────────────────────
function ManagementPage({ onMenuToggle, onNavigate, bellProps }) {
  const defaultIds = ["cockpit", "dockge", "speedtest", "filebrowser", "uptimekuma"];
  const [mobileOrder, setMobileOrder] = useMobileOrder("mgmt", defaultIds);
  const [editOpen, setEditOpen] = useState(false);
  const items = [
    { id: "cockpit",     node: <SvcCard id="cockpit" /> },
    { id: "dockge",      node: <SvcCard id="dockge" /> },
    { id: "speedtest",   node: <SpeedtestWidget /> },
    { id: "filebrowser", node: <SvcCard id="filebrowser" /> },
    { id: "uptimekuma",  node: <SvcCard id="uptimekuma" /> },
  ];
  const modalItems = defaultIds.map(id => ({ id, label: SVC[id]?.name ?? id }));
  const defaultSizes = { cockpit: "compact", dockge: "compact", speedtest: "medium", filebrowser: "compact", uptimekuma: "compact" };
  const defaultPositions = {
    cockpit: {col:1,row:1}, dockge: {col:1,row:2}, speedtest: {col:2,row:1}, filebrowser: {col:3,row:1}, uptimekuma: {col:4,row:1},
  };
  return (
    <div className="shell">
      <PageHeader title="Management" onMenuToggle={onMenuToggle} onNavigate={onNavigate} bellProps={bellProps} onEditLayout={() => setEditOpen(true)} />
      <p className="page-section">System &amp; Infrastructure</p>
      <DraggableGrid pageKey="mgmt" items={items} resizable={new Set(["speedtest"])} defaultSizes={defaultSizes} defaultPositions={defaultPositions} mobileOrder={mobileOrder} onReorder={setMobileOrder} />
      {editOpen && <LayoutEditModal items={modalItems} order={mobileOrder} onSave={o => { setMobileOrder(o); setEditOpen(false); }} onCancel={() => setEditOpen(false)} />}
    </div>
  );
}

// ─── DOWNLOADS & TRANSCODES PAGE ─────────────────────────────────
function DownloadsPage({ onMenuToggle, onNavigate, bellProps }) {
  const defaultIds = ["qbittorrent", "unmanic"];
  const [mobileOrder, setMobileOrder] = useMobileOrder("downloads", defaultIds);
  const [editOpen, setEditOpen] = useState(false);
  const items = [
    { id: "qbittorrent", node: <QBittorrentWidget /> },
    { id: "unmanic",     node: <UnmanicWidget /> },
  ];
  const modalItems = defaultIds.map(id => ({ id, label: SVC[id]?.name ?? id }));
  const defaultSizes = { qbittorrent: "medium", unmanic: "medium" };
  const defaultPositions = { qbittorrent: {col:1,row:1}, unmanic: {col:2,row:1} };
  return (
    <div className="shell">
      <PageHeader title="Downloads &amp; Transcodes" onMenuToggle={onMenuToggle} onNavigate={onNavigate} bellProps={bellProps} onEditLayout={() => setEditOpen(true)} />
      <p className="page-section">Active transfers &amp; encoding queue</p>
      <DraggableGrid pageKey="downloads" items={items} resizable={new Set(["qbittorrent","unmanic"])} defaultSizes={defaultSizes} defaultPositions={defaultPositions} mobileOrder={mobileOrder} onReorder={setMobileOrder} />
      {editOpen && <LayoutEditModal items={modalItems} order={mobileOrder} onSave={o => { setMobileOrder(o); setEditOpen(false); }} onCancel={() => setEditOpen(false)} />}
    </div>
  );
}

// ─── QUICK LOOK PAGE ─────────────────────────────────────────────
function QuickLookPage({ onMenuToggle, onNavigate, bellProps }) {
  const { glances: { quicklook: data } } = useData();
  const loading = data === null;

  if (loading) {
    return (
      <div className="shell">
        <PageHeader title="Quick Look" onMenuToggle={onMenuToggle} onNavigate={onNavigate} bellProps={bellProps} />
        <div className="loading" style={{ paddingTop: 60 }}>
          <Logo size={36} />
          <div style={{ marginTop: 12, opacity: 0.5, fontSize: 13 }}>Loading…</div>
        </div>
      </div>
    );
  }

  const cpu  = data?.cpu  ?? 0;
  const mem  = data?.mem  ?? 0;
  const swap = data?.swap ?? 0;
  const loadArr = Array.isArray(data?.load)
    ? data.load
    : [data?.load?.min1 ?? data?.load1 ?? 0, data?.load?.min5 ?? data?.load5 ?? 0, data?.load?.min15 ?? data?.load15 ?? 0];
  const percpu = Array.isArray(data?.percpu)
    ? data.percpu.map(c => c.total ?? c.cpu_percent ?? 0)
    : [];

  return (
    <div className="shell">
      <PageHeader title="Quick Look" onMenuToggle={onMenuToggle} onNavigate={onNavigate} bellProps={bellProps} />
      <div className="ql-wrap">

        <div className="ql-section">
          <div className="ql-row-header">
            <span className="ql-label">CPU</span>
            <span className="ql-value" style={{ color: statusColor(cpu) }}>{cpu.toFixed(1)}%</span>
          </div>
          <Bar value={cpu} height={8} />
          {percpu.length > 0 && (
            <div className="ql-cores">
              {percpu.map((v, i) => (
                <div key={i} className="ql-core-col">
                  <div className="ql-core-track">
                    <div className="ql-core-fill" style={{ height: `${Math.min(100, Math.max(2, v))}%`, background: statusColor(v) }} />
                  </div>
                  <div className="ql-core-num">{Math.round(v)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ql-section">
          <div className="ql-row-header">
            <span className="ql-label">Memory</span>
            <span className="ql-value" style={{ color: statusColor(mem) }}>{mem.toFixed(1)}%</span>
          </div>
          <Bar value={mem} height={8} />
        </div>

        <div className="ql-section">
          <div className="ql-row-header">
            <span className="ql-label">Swap</span>
            <span className="ql-value" style={{ color: statusColor(swap) }}>{swap.toFixed(1)}%</span>
          </div>
          <Bar value={swap} height={8} />
        </div>

        <div className="ql-section">
          <div className="ql-label" style={{ marginBottom: 0 }}>Load Average</div>
          <div className="ql-load-row">
            {["1m", "5m", "15m"].map((lbl, i) => (
              <div key={lbl} className="ql-load-item">
                <div className="ql-load-val">{(loadArr[i] ?? 0).toFixed(2)}</div>
                <div className="ql-load-lbl">{lbl}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── APP ROOT ────────────────────────────────────────────────────
export default function App() {
  return <DataProvider><AppInner /></DataProvider>;
}

function AppInner() {
  const [activePage, setActivePage] = useState("main");
  const [menuOpen, setMenuOpen]     = useState(false);

  const [themeColors, setThemeColors] = useState(() => {
    try {
      const saved = localStorage.getItem("2ez-theme");
      return saved ? JSON.parse(saved) : DEFAULT_THEME;
    } catch { return DEFAULT_THEME; }
  });

  useEffect(() => {
    localStorage.setItem("2ez-theme", JSON.stringify(themeColors));
  }, [themeColors]);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const link = document.querySelector("link[rel='icon']");
      if (link) { link.type = "image/png"; link.href = "/logo.png"; }
    };
    img.src = "/logo.png";
  }, []);

  // ── Notifications ──────────────────────────────────────────────
  const [notifications, setNotifications] = useState(() => {
    try { return JSON.parse(localStorage.getItem("2ez-notifications") || "[]"); }
    catch { return []; }
  });
  useEffect(() => {
    localStorage.setItem("2ez-notifications", JSON.stringify(notifications));
  }, [notifications]);

  const addNotification   = useCallback((n) => setNotifications(p => [n, ...p].slice(0, 50)), []);
  const dismissNotif      = useCallback((id) => setNotifications(p => p.filter(n => n.id !== id)), []);
  const clearAllNotifs    = useCallback(() => setNotifications([]), []);

  // ── Alert bridge (data comes from DataProvider) ───────────────
  const { glances: { alert: alerts } } = useData();

  const seenAlertIds = useRef(new Set(
    JSON.parse(localStorage.getItem("2ez-seen-alerts") || "[]")
  ));

  useEffect(() => {
    if (!alerts) return;
    let changed = false;
    alerts.filter(a => a.end === -1).forEach(a => {
      const id = `alert_${a.type}_${a.begin}`;
      if (!seenAlertIds.current.has(id)) {
        seenAlertIds.current.add(id);
        changed = true;
        addNotification({
          id,
          type: "alert",
          severity: a.state,
          title: `${a.type} ${a.state}`,
          body: `Max ${a.max?.toFixed(1) ?? "—"} · Avg ${a.avg?.toFixed(1) ?? "—"}`,
          ts: Math.floor(Date.now() / 1000),
          page: "main",
        });
      }
    });
    if (changed) localStorage.setItem("2ez-seen-alerts", JSON.stringify([...seenAlertIds.current]));
  }, [alerts, addNotification]);

  // ── Navigation ────────────────────────────────────────────────
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);

  const navigate = useCallback((page) => {
    setActivePage(page);
    setMenuOpen(false);
    setMobileSettingsOpen(false);
  }, []);

  const toggleMenu = useCallback(() => setMenuOpen(o => !o), []);

  const [layoutResetKey, setLayoutResetKey] = useState(0);
  const resetLayout = useCallback(() => setLayoutResetKey(k => k + 1), []);

  const bellProps = { notifications, onDismiss: dismissNotif, onClearAll: clearAllNotifs, onNavigate: navigate };

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <style>{buildThemeVars(themeColors)}</style>

      <NavSidebar
        isOpen={menuOpen}
        activePage={activePage}
        onNavigate={navigate}
        onClose={() => setMenuOpen(false)}
        themeColors={themeColors}
        onThemeChange={setThemeColors}
        alerts={alerts}
        onResetLayout={resetLayout}
      />

      {activePage === "main"       && <MainPage            onMenuToggle={toggleMenu} bellProps={bellProps} layoutResetKey={layoutResetKey} />}
      {activePage === "media-auto" && <MediaAutomationPage onMenuToggle={toggleMenu} onNavigate={navigate} bellProps={bellProps} />}
      {activePage === "media-srv"  && <MediaServerPage     onMenuToggle={toggleMenu} onNavigate={navigate} bellProps={bellProps} />}
      {activePage === "mgmt"       && <ManagementPage      onMenuToggle={toggleMenu} onNavigate={navigate} bellProps={bellProps} />}
      {activePage === "downloads"  && <DownloadsPage        onMenuToggle={toggleMenu} onNavigate={navigate} bellProps={bellProps} />}
      {activePage === "quick-look" && <QuickLookPage        onMenuToggle={toggleMenu} onNavigate={navigate} bellProps={bellProps} />}

      <BottomTabBar
        activePage={activePage}
        onNavigate={navigate}
        settingsOpen={mobileSettingsOpen}
        onSettingsToggle={() => setMobileSettingsOpen(o => !o)}
      />

      {mobileSettingsOpen && (
        <SettingsPanel
          colors={themeColors}
          onChange={setThemeColors}
          onClose={() => setMobileSettingsOpen(false)}
          onResetLayout={resetLayout}
        />
      )}
    </>
  );
}
