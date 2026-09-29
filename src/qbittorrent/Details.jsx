import { useEffect, useRef, useState } from 'react';
import { bytes, duration, percent, qbtRequest, stateLabel, torrentGroup } from './api';
const tabs = ['Overview', 'Files', 'Trackers', 'Peers'];
export default function Details({ torrent, onOperation, onAction, disabled, revision, onClose, scrollOnMount = true }) {
  const panel = useRef(null);
  useEffect(() => { if (scrollOnMount && window.matchMedia('(max-width: 1000px)').matches) panel.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); }, [scrollOnMount]);
  const [tab, setTab] = useState('Overview');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileQuery, setFileQuery] = useState('');
  const [filePage, setFilePage] = useState(0);
  const key = `${torrent.hash}/${tab}`;
  useEffect(() => {
    const controller = new AbortController(); let pending = false;
    const load = async () => {
      if (pending) return; pending = true;
      const endpoint = tab === 'Peers' ? `sync/torrentPeers?hash=${torrent.hash}&rid=0` : `torrents/${{ Overview: 'properties', Files: 'files', Trackers: 'trackers' }[tab]}?hash=${torrent.hash}`;
      try { const data = await qbtRequest(endpoint, { signal: controller.signal }); if (!controller.signal.aborted) { setResult({ key, data }); setError(''); } }
      catch (err) { if (!controller.signal.aborted) setError(err.message); } finally { pending = false; }
    };
    load(); const timer = setInterval(load, 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [torrent.hash, tab, key, revision]);
  const data = result?.key === key ? result.data : null;
  const operation = (kind, extra = {}) => onOperation({ kind, torrents: [torrent], ...extra });
  const group = torrentGroup(torrent);
  const row = (label, value) => <div className="qb-data-row" key={label}><span>{label}</span><strong>{value}</strong></div>;
  const files = Array.isArray(data) && tab === 'Files' ? data.filter(file => file.name.toLowerCase().includes(fileQuery.toLowerCase())) : [];
  return <section ref={panel} className="qb-panel qb-detail" aria-label="Torrent details">
    <div className="qb-detail-heading"><p className="eyebrow">SELECTED TORRENT</p><button className="qb-icon-button" aria-label="Close torrent details" onClick={onClose}>×</button></div>
    <div className="qb-detail-top"><h2>{torrent.name}</h2><p>{torrent.category || 'Uncategorised'} · {bytes(torrent.total_size || torrent.size)}</p><span className={`qb-state qb-${group}`}>{stateLabel(torrent)}</span><div className="qb-detail-progress"><strong>{percent(torrent.progress)}</strong><span>{torrent.progress >= 1 ? 'Complete' : `${duration(torrent.eta)} remaining`}</span></div><div className={`qb-progress qb-${group}`}><i style={{ width: percent(torrent.progress) }} /></div><p>{bytes(torrent.completed)} of {bytes(torrent.size)} downloaded</p></div>
    <div className="qb-tabs" role="tablist" aria-label="Torrent details">{tabs.map(name => <button key={name} id={`qb-tab-${name}`} role="tab" aria-selected={tab === name} aria-controls={`qb-panel-${name}`} tabIndex={tab === name ? 0 : -1} className={tab === name ? 'active' : ''} onClick={() => setTab(name)} onKeyDown={event => { const index = tabs.indexOf(tab); const next = event.key === 'ArrowRight' ? (index + 1) % 4 : event.key === 'ArrowLeft' ? (index + 3) % 4 : -1; if (next >= 0) { event.preventDefault(); setTab(tabs[next]); document.getElementById(`qb-tab-${tabs[next]}`)?.focus(); } }}>{name}</button>)}</div>
    <div className="qb-details-body" role="tabpanel" id={`qb-panel-${tab}`} aria-labelledby={`qb-tab-${tab}`}>
      {error && <p className="qb-error" role="alert">{error}</p>}
      {data === null ? <p className="qb-empty">{error ? 'Retrying automatically…' : 'Loading details…'}</p> : tab === 'Overview' ? <div className="qb-overview">
        <section><p className="eyebrow qb-detail-label">TRANSFER</p>{row('Download', `${bytes(torrent.dlspeed)}/s`)}{row('Upload', `${bytes(torrent.upspeed)}/s`)}{row('Share ratio', Number(torrent.ratio || 0).toFixed(2))}{row('Seeding time', duration(data.seeding_time))}</section>
        <section><p className="eyebrow qb-detail-label">CONNECTIONS</p>{row('Seeds / peers', `${torrent.num_seeds || 0} / ${torrent.num_leechs || 0}`)}{row('Availability', Number(torrent.availability || 0).toFixed(2))}{row('Added', torrent.added_on ? new Date(torrent.added_on * 1000).toLocaleString() : '—')}<a className="qb-text-button" href={`/qbt/api/v2/torrents/export?hash=${torrent.hash}`} download>Export .torrent</a></section>
        <section><p className="eyebrow qb-detail-label">SAVE LOCATION</p><p className="qb-path">{torrent.save_path}</p><p className="eyebrow qb-detail-label">CATEGORY & TAGS</p><div className="qb-chips">{[torrent.category, ...(torrent.tags || '').split(',').map(tag => tag.trim())].filter(Boolean).map((tag, index) => <span key={`${tag}-${index}`}>{tag}</span>)}</div>
        {data.comment && <><p className="eyebrow qb-detail-label">COMMENT</p><p className="qb-wrap">{data.comment}</p></>}</section>
      </div> : tab === 'Files' ? <>
        <label className="qb-search"><input type="search" aria-label="Find a file" placeholder="Find a file…" value={fileQuery} onChange={event => { setFileQuery(event.target.value); setFilePage(0); }} /></label>
        {!files.length && <p className="qb-empty">{fileQuery ? 'No matching files.' : 'Files appear after torrent metadata is available.'}</p>}
        {files.slice(filePage * 30, (filePage + 1) * 30).map(file => <div className="qb-file" key={file.index}><p className="qb-path">{file.name}</p><small>{bytes(file.size)} · {percent(file.progress)}</small><div><select aria-label={`Priority for ${file.name}`} value={file.priority} disabled={disabled} onChange={event => onAction('filePrio', { hash: torrent.hash, id: file.index, priority: event.target.value }, 'File priority updated.')}><option value="0">Do not download</option><option value="1">Normal priority</option><option value="6">High priority</option><option value="7">Maximum priority</option></select><button className="qb-text-button" disabled={disabled} onClick={() => operation('renameFile', { path: file.name })}>Rename</button></div></div>)}
        {files.length > 30 && <div className="qb-pagination"><button disabled={filePage === 0} onClick={() => setFilePage(page => page - 1)}>Previous</button><span>{filePage + 1} / {Math.ceil(files.length / 30)}</span><button disabled={(filePage + 1) * 30 >= files.length} onClick={() => setFilePage(page => page + 1)}>Next</button></div>}
      </> : tab === 'Trackers' ? <>
        <button className="qb-button" disabled={disabled} onClick={() => operation('addTrackers')}>+ Add trackers</button>
        {data.length === 0 && <p className="qb-empty">No trackers reported.</p>}
        {data.map(tracker => <div className="qb-file" key={tracker.url}><p className="qb-path">{tracker.url}</p><small>{({ 0: 'Disabled', 1: 'Not contacted', 2: 'Working', 3: 'Updating', 4: 'Not working' })[tracker.status] || 'Peer discovery'} · {tracker.num_seeds < 0 ? '—' : tracker.num_seeds} seeds</small>{tracker.msg && <p className="qb-wrap qb-form-note">{tracker.msg}</p>}{tracker.tier >= 0 && <div><button className="qb-text-button" disabled={disabled} onClick={() => operation('editTracker', { url: tracker.url })}>Edit</button><button className="qb-text-button qb-danger" disabled={disabled} onClick={() => operation('removeTracker', { url: tracker.url })}>Remove</button></div>}</div>)}
      </> : <>
        <button className="qb-button" disabled={disabled} onClick={() => operation('addPeers')}>+ Add peers</button>
        {Object.keys(data.peers || {}).length === 0 && <p className="qb-empty">No peers connected.</p>}
        {Object.entries(data.peers || {}).map(([id, peer]) => <div className="qb-file" key={id}><p className="qb-path">{peer.ip}:{peer.port}</p><small>{peer.client || 'Unknown client'} · {percent(peer.progress)}</small>{row('↓ / ↑', `${bytes(peer.dl_speed)}/s / ${bytes(peer.up_speed)}/s`)}</div>)}
      </>}
    </div><div className="qb-detail-actions"><button className="qb-button" disabled={disabled} onClick={() => operation('location')}>Change location</button><button className="qb-button" disabled={disabled} onClick={() => operation('limits')}>Set limits</button></div>
  </section>;
}
