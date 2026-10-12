import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
const TERM_THEME = {
  background: "#0a0e14", foreground: "#c8e6d8",
  cursor: "#22D3A7", cursorAccent: "#0a0e14",
  selectionBackground: "rgba(34,211,167,0.28)",
  black: "#0a0e14", brightBlack: "#3b4754",
  red: "#ef4444", brightRed: "#f87171",
  green: "#22D3A7", brightGreen: "#4ade80",
  yellow: "#f59e0b", brightYellow: "#fbbf24",
  blue: "#2979FF", brightBlue: "#60a5fa",
  magenta: "#a855f7", brightMagenta: "#c084fc",
  cyan: "#22d3ee", brightCyan: "#67e8f9",
  white: "#c8e6d8", brightWhite: "#f0fdf4",
};

export default function TerminalView() {
  const hostRef = useRef(null);
  useEffect(() => {
    const term = new Terminal({
      fontFamily: '"DM Mono", ui-monospace, monospace',
      fontSize: 13, cursorBlink: true, theme: TERM_THEME, allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    const safeFit = () => { try { fit.fit(); } catch { /* not laid out yet */ } };
    requestAnimationFrame(safeFit);

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/terminal`);
    ws.binaryType = "arraybuffer";
    let alive = true;
    term.writeln("\x1b[38;5;80mConnecting to shell…\x1b[0m");

    ws.onopen = () => {
      term.clear();
      safeFit();
      try { ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows })); } catch { /* ignore */ }
    };
    ws.onmessage = (e) => term.write(typeof e.data === "string" ? e.data : new Uint8Array(e.data));
    ws.onclose = () => { if (alive) term.write("\r\n\x1b[38;5;244m[session ended]\x1b[0m\r\n"); };
    ws.onerror = () => { if (alive) term.write("\r\n\x1b[31m[connection error — is the terminal backend running?]\x1b[0m\r\n"); };

    const dataSub = term.onData((d) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "input", data: d })); });

    const onResize = () => {
      safeFit();
      if (ws.readyState === WebSocket.OPEN) { try { ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows })); } catch { /* ignore */ } }
    };
    const ro = new ResizeObserver(onResize);
    if (hostRef.current) ro.observe(hostRef.current);
    window.addEventListener("resize", onResize);

    return () => {
      alive = false;
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      dataSub.dispose();
      try { ws.close(); } catch { /* ignore */ }
      term.dispose();
    };
  }, []);
  return <div ref={hostRef} className="term-host" />;
}
