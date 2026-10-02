import { useEffect, useState } from 'react';
import { bytes } from '../qbittorrent/api';
import { request } from './api';

export default function ContainerInspector({ item, image, disabled, onClose, onAction, onImage, onStack }) {
  const [tab, setTab] = useState('Overview');
  const [detail, setDetail] = useState(null);
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState('');
  const [follow, setFollow] = useState(true);
  useEffect(() => {
    const controller = new AbortController(); let pending = false;
    const load = async () => {
      if (pending) return; pending = true;
      try {
        const value = await request(`/sys-api/docker/${item.id}/${tab === 'Logs' ? 'logs' : 'inspect'}`, { signal: controller.signal });
        if (!controller.signal.aborted) { if (tab === 'Logs') setLogs(value.logs); else setDetail(value); setError(''); }
      } catch (err) { if (!controller.signal.aborted) setError(err.message); } finally { pending = false; }
    };
    load(); const timer = tab === 'Logs' && follow ? setInterval(load, 4000) : null;
    return () => { controller.abort(); clearInterval(timer); };
  }, [item.id, tab, follow]);
  const tabs = ['Overview', 'Logs', 'Compose'];
  const metadata = (name, value) => <div className="dm-kv"><span>{name}</span><strong>{value}</strong></div>;
  return <aside className="dm-panel dm-inspector" aria-label="Selected container">
    <div className="dm-inspector-head"><button className="qb-icon-button dm-close" aria-label="Close inspector" onClick={onClose}>×</button><p className="eyebrow">SELECTED CONTAINER</p><h2>{item.name}</h2><span className={`dm-state ${item.state === 'running' ? 'running' : ''}`}>{item.state}</span></div>
    <div className="dm-detail-tabs" role="tablist" aria-label="Container details">{tabs.map(name => <button key={name} role="tab" aria-selected={tab === name} tabIndex={tab === name ? 0 : -1} onClick={() => setTab(name)} onKeyDown={event => { const next = event.key === 'ArrowRight' ? (tabs.indexOf(name) + 1) % 3 : event.key === 'ArrowLeft' ? (tabs.indexOf(name) + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : -1; if (next >= 0) { event.preventDefault(); setTab(tabs[next]); event.currentTarget.parentElement.children[next].focus(); } }}>{name}</button>)}</div>
    <div className="dm-inspector-body" role="tabpanel" aria-label={tab}>
      {error && <p className="qb-error" role="alert">{error}</p>}
      {tab === 'Logs' ? <><label className="dm-follow"><input type="checkbox" checked={follow} onChange={event => setFollow(event.target.checked)} />Refresh every 4s</label><pre className="dm-log" tabIndex="0">{logs === null ? 'Loading logs…' : logs || 'No log output yet.'}</pre><p className="dm-note">Latest 200 lines</p></> : tab === 'Compose' ? <><p className="dm-note">{item.stack ? `This container belongs to ${item.stack}. Open its stack to inspect the Compose file, validate changes, and deploy.` : 'This container has no Compose project label. Manage it with the container controls, or create a new stack.'}</p>{item.stack && <button className="qb-button qb-primary" onClick={() => onStack(item.stack, 'compose')}>Open Compose editor →</button>}</> : <>
        <div className="dm-metrics"><div><strong>{item.state === 'running' ? `${Number(item.cpu_percent || 0).toFixed(1)}%` : '—'}</strong><span>CPU</span></div><div><strong>{item.state === 'running' ? bytes(item.memory_usage) : '—'}</strong><span>MEMORY</span></div></div>
        {metadata('Stack', item.stack ? <button className="qb-text-button" onClick={() => onStack(item.stack)}>{item.stack} ↗</button> : 'Standalone')}
        {metadata('Status', item.status || item.state)}
        {detail ? <>{metadata('Restart policy', detail.restartPolicy)}{metadata('Created', new Date(detail.created).toLocaleString())}</> : !error && <p className="dm-note">Loading configuration…</p>}
        <p className="eyebrow">IMAGE</p><div className="dm-image-reference">{item.image}<small>{item.image_id || image?.id || 'Image ID unavailable'}</small>{image && <button className="qb-text-button" onClick={() => onImage(image.id)}>Inspect image & usage ↗</button>}</div>
        {detail && <><p className="eyebrow">PORTS</p>{detail.ports?.length ? detail.ports.map(port => <p className="dm-metadata" key={port}>{port}</p>) : <p className="dm-note">No published ports</p>}<p className="eyebrow">STORAGE & NETWORK</p>{detail.volumes?.map((volume, index) => <p key={index} className="dm-metadata">{volume.dest}<small>← {volume.source} · {volume.mode}</small></p>)}{detail.networks?.map(network => <p key={network.name} className="dm-metadata">{network.name}<small>{network.ip}</small></p>)}<details className="dm-environment"><summary>Environment & command</summary><pre className="dm-log">{(detail.env || []).join('\n') || 'No environment variables'}{detail.command ? `\n\nCommand: ${detail.command}` : ''}</pre></details></>}
      </>}
    </div>
    <div className="dm-inspector-actions">{item.name === '2ez-dashboard' ? <p className="dm-note">Manage the dashboard itself from the host terminal.</p> : <>{(item.state === 'paused' ? ['unpause'] : item.state === 'running' ? ['restart', 'stop', 'pause'] : ['start']).map(action => <button className="qb-button" key={action} disabled={disabled} onClick={() => onAction(action, item)}>{action === 'unpause' ? 'Resume' : action[0].toUpperCase() + action.slice(1)}</button>)}<button className="qb-button qb-danger" disabled={disabled || ['running', 'paused'].includes(item.state)} onClick={() => onAction('remove', item)}>Remove container</button></> }</div>
  </aside>;
}
