import { useEffect, useRef } from 'react';
import { bytes, duration, percent, stateLabel, torrentGroup } from './api';

export function Activity({ history, name }) {
  const maximum = Math.max(1, ...history.flatMap(point => [point.down, point.up]));
  const line = key => history.map((point, i) => `${i / Math.max(1, history.length - 1) * 700},${64 - point[key] / maximum * 56}`).join(' ');
  return <section className="qb-panel qb-activity" aria-label={`Transfer history for ${name}`}>
    <div><strong>Transfer history</strong><span><i className="qb-legend-down" />Download <i className="qb-legend-up" />Upload</span></div>
    <p className="qb-history-note">This torrent · sampled while selected · up to 5 minutes</p>
    {history.length < 2 ? <p className="qb-empty">Collecting transfer samples…</p> : <svg viewBox="0 0 700 72" preserveAspectRatio="none" aria-label={`Recent download and upload speeds for ${name}`} role="img"><path d="M0 24H700M0 48H700M0 64H700" stroke="var(--card-border)" strokeDasharray="2 5" /><polyline points={line('down')} fill="none" stroke="var(--color-blue)" strokeWidth="2" /><polyline points={line('up')} fill="none" stroke="var(--ok)" strokeWidth="1.5" /></svg>}
    <footer><span>{history.length ? new Date(history[0].time).toLocaleTimeString() : 'Waiting for data'}</span><span>{bytes(maximum === 1 && history.every(p => !p.down && !p.up) ? 0 : maximum)}/s peak</span></footer>
  </section>;
}

export function InspectorDrawer({ children, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="qb-drawer" aria-label="Selected transfer" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>{children}</dialog>;
}

function Progress({ item }) {
  const group = torrentGroup(item);
  return <><div className={`qb-progress-label qb-${group}`}><span>{stateLabel(item)}</span><span>{percent(item.progress)}</span></div><div className={`qb-progress qb-${group}`}><i style={{ width: percent(item.progress) }} /></div></>;
}

export function TorrentTable({ visible, selected, inspected, sort, sortBy, select, selectAll, inspect }) {
  return <div className="qb-table-scroll"><table className="qb-table"><thead><tr>
    <th><input type="checkbox" aria-label="Select all visible torrents" checked={visible.length > 0 && visible.every(item => selected.includes(item.hash))} disabled={!visible.length} onChange={event => selectAll(event.target.checked)} /></th>
    {[['name', 'Name'], ['size', 'Size'], ['progress', 'Progress'], ['dlspeed', '↓ Down'], ['upspeed', '↑ Up'], ['ratio', 'Ratio'], ['eta', 'ETA']].map(([key, label]) => <th key={key} className={`qb-col-${key}`} aria-sort={sort.key === key ? sort.direction === 1 ? 'ascending' : 'descending' : 'none'}><button onClick={() => sortBy(key)}>{label}{sort.key === key ? sort.direction === 1 ? ' ↑' : ' ↓' : ''}</button></th>)}
  </tr></thead><tbody>{visible.map(item => <tr key={item.hash} className={`${inspected === item.hash ? 'inspected' : ''} ${selected.includes(item.hash) ? 'selected' : ''}`}>
    <td><input type="checkbox" aria-label={`Select ${item.name}`} checked={selected.includes(item.hash)} onChange={event => select(item.hash, event.target.checked)} /></td>
    <td className="qb-col-name"><button className="qb-torrent-name" data-torrent-hash={item.hash} aria-expanded={inspected === item.hash} aria-controls={inspected === item.hash ? 'qb-selected-transfer' : undefined} onClick={() => inspect(item.hash)}>{item.name}</button><small>{item.category || 'Uncategorised'}</small></td>
    <td className="qb-col-size qb-rate">{bytes(item.size)}</td><td className="qb-col-progress"><Progress item={item} /></td>
    <td className="qb-col-dlspeed qb-rate qb-down">{item.dlspeed ? `${bytes(item.dlspeed)}/s` : '—'}</td><td className="qb-col-upspeed qb-rate">{item.upspeed ? `${bytes(item.upspeed)}/s` : '—'}</td>
    <td className="qb-col-ratio qb-rate">{Number(item.ratio || 0).toFixed(2)}</td><td className="qb-col-eta qb-rate">{item.progress >= 1 ? 'Complete' : duration(item.eta)}</td>
  </tr>)}</tbody></table></div>;
}

const groups = [
  { id: 'downloading', name: 'Downloading', states: ['downloading'] },
  { id: 'seeding', name: 'Seeding', states: ['seeding'] },
  { id: 'attention', name: 'Stopped & attention', states: ['paused', 'checking', 'error'] },
];

export function StatusBoard({ visible, selected, inspected, select, inspect, inspector, collapsed, toggleGroup }) {
  return <div className="qb-board">{groups.map(group => {
    const items = visible.filter(item => group.states.includes(torrentGroup(item)));
    return <section key={group.id} className="qb-board-group" aria-label={group.name}>
      <button className="qb-group-toggle" aria-expanded={!collapsed[group.id]} aria-controls={`qb-group-${group.id}`} onClick={() => toggleGroup(group.id)}><strong>{group.name}</strong><span>{items.length} on this page <b aria-hidden="true">{collapsed[group.id] ? '+' : '−'}</b></span></button>
      <div id={`qb-group-${group.id}`} hidden={Boolean(collapsed[group.id])}>{items.length ? items.map(item => <div className={`qb-transfer-card ${inspected === item.hash ? 'expanded' : ''} ${selected.includes(item.hash) ? 'selected' : ''}`} key={item.hash}>
        <div className="qb-card-heading"><button className="qb-torrent-name" data-torrent-hash={item.hash} aria-expanded={inspected === item.hash} aria-controls={inspected === item.hash ? 'qb-selected-transfer' : undefined} onClick={() => inspect(item.hash)}>{item.name}<span aria-hidden="true">{inspected === item.hash ? '−' : '+'}</span></button><input type="checkbox" aria-label={`Select ${item.name}`} checked={selected.includes(item.hash)} onChange={event => select(item.hash, event.target.checked)} /></div>
        <p className="qb-card-meta">{item.category || 'Uncategorised'} · {bytes(item.size)}</p><Progress item={item} />
        <div className="qb-card-rates"><span className="qb-down">↓ {bytes(item.dlspeed)}/s</span><span className="qb-up">↑ {bytes(item.upspeed)}/s</span></div><div className="qb-card-foot"><span>Ratio {Number(item.ratio || 0).toFixed(2)}</span><span>{item.progress >= 1 ? 'Complete' : `ETA ${duration(item.eta)}`}</span></div>
        {inspected === item.hash && inspector}
      </div>) : <p className="qb-empty">No matching transfers on this page.</p>}</div>
    </section>;
  })}</div>;
}
