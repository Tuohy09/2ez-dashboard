import { useCallback, useEffect, useRef, useState } from 'react';
import { bytes, mergeSync, modern, qbtRequest, torrentGroup } from './api';
import { ActionForm, AddTorrent, Organisation, Preferences } from './Forms';
import Details from './Details';
import { advanceOpening } from './opening';
import { Activity, InspectorDrawer, StatusBoard, TorrentTable } from './TransferViews';
import './qbittorrent.css';

const layouts = [['dense', 'Transfer desk'], ['bottom', 'Split workspace'], ['cards', 'Status board']];
const empty = () => ({ torrents: {}, categories: {}, tags: [], server_state: {}, rid: 0 });
const filters = [['all', 'All torrents'], ['downloading', 'Downloading'], ['seeding', 'Seeding'], ['paused', 'Stopped'], ['checking', 'Checking'], ['error', 'Errored']];
export default function QBittorrentPage() {
  const [snapshot, setSnapshot] = useState(null);
  const [opening, setOpening] = useState(null);
  const [version, setVersion] = useState('');
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState([]);
  const [layout, setLayout] = useState(() => { try { const saved = localStorage.getItem('2ez-qbt-layout'); return layouts.some(([id]) => id === saved) ? saved : 'bottom'; } catch { return 'bottom'; } });
  const [collapsed, setCollapsed] = useState({});
  const inspectedRef = useRef(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [category, setCategory] = useState('*');
  const [tag, setTag] = useState('*');
  const [sort, setSort] = useState({ key: 'name', direction: 1 });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState([]);
  const [inspected, setInspected] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const versionCache = useRef('');
  const cache = useRef(empty());
  const pollRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController(); let pending = false;
    const poll = async () => {
      if (pending) return; pending = true;
      try {
        const [update, detected] = await Promise.all([
          qbtRequest(`sync/maindata?rid=${cache.current.rid || 0}`, { signal: controller.signal }),
          versionCache.current || qbtRequest('app/version', { signal: controller.signal }).catch(() => ''),
        ]);
        if (!controller.signal.aborted && /^v?\d+\./.test(String(detected))) { versionCache.current = String(detected); setVersion(String(detected)); }
        if (!update || typeof update !== 'object' || !Number.isInteger(update.rid)) throw new Error('qBittorrent returned an invalid update. Retrying automatically.');
        if (controller.signal.aborted) return;
        cache.current = mergeSync(cache.current, update);
        setSnapshot(cache.current); setError(''); setLastUpdate(Date.now());
        const observed = cache.current.torrents;
        const observedAt = Date.now();
        const variant = Math.random();
        setOpening(previous => advanceOpening(previous, observed, observedAt, () => variant));
        const current = cache.current.torrents[inspectedRef.current];
        if (current) setHistory(previous => [...previous.filter(point => point.time > Date.now() - 300000).slice(-119), { time: Date.now(), down: current.dlspeed || 0, up: current.upspeed || 0 }]);
      } catch (err) { if (!controller.signal.aborted) setError(err.message); }
      finally { pending = false; }
    };
    pollRef.current = poll; poll();
    const timer = setInterval(poll, 2500);
    return () => { controller.abort(); clearInterval(timer); pollRef.current = null; };
  }, []);
  const refresh = useCallback(() => { setRevision(value => value + 1); pollRef.current?.(); }, []);
  const done = message => { setNotice(message); setActionError(''); refresh(); };
  const torrents = Object.values(snapshot?.torrents || {});
  const categories = snapshot?.categories || {};
  const tags = snapshot?.tags || [];
  const transfer = snapshot?.server_state || {};
  const chosen = selected.map(hash => snapshot?.torrents[hash]).filter(Boolean);
  const torrent = snapshot?.torrents[inspected];
  const disabled = busy || !snapshot || Boolean(error) || !version;
  const counts = torrents.reduce((result, item) => { const group = torrentGroup(item); result[group] = (result[group] || 0) + 1; return result; }, { all: torrents.length });
  const filtered = torrents.filter(item => (filter === 'all' || torrentGroup(item) === filter) && (category === '*' || item.category === category) && (tag === '*' || (item.tags || '').split(',').map(value => value.trim()).includes(tag)) && item.name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => (sort.key === 'name' ? a.name.localeCompare(b.name) : (a[sort.key] || 0) - (b[sort.key] || 0)) * sort.direction);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 50) - 1));
  const visible = filtered.slice(currentPage * 50, currentPage * 50 + 50);
  function changeLayout(next) {
    setLayout(next);
    try { localStorage.setItem('2ez-qbt-layout', next); } catch { /* The view still works without browser storage. */ }
    if (next === 'cards' && torrent) {
      const group = torrentGroup(torrent);
      setCollapsed(previous => ({ ...previous, [group === 'downloading' || group === 'seeding' ? group : 'attention']: false }));
    }
  }
  function closeInspector() {
    const button = document.querySelector(`[data-torrent-hash="${inspectedRef.current}"]`);
    inspectedRef.current = null; setInspected(null); setHistory([]); button?.focus();
  }
  function inspect(hash) {
    if (hash === inspectedRef.current) { if (layout === 'cards') closeInspector(); return; }
    inspectedRef.current = hash; setInspected(hash);
    const item = snapshot.torrents[hash];
    setHistory([{ time: Date.now(), down: item.dlspeed || 0, up: item.upspeed || 0 }]);
  }
  function selectAll(checked) { setSelected(previous => checked ? [...new Set([...previous, ...visible.map(item => item.hash)])] : previous.filter(hash => !visible.some(item => item.hash === hash))); }
  function open(operation) { setActionError(''); setDialog(operation); }
  function select(hash, checked) { setSelected(previous => checked ? [...new Set([...previous, hash])] : previous.filter(value => value !== hash)); }
  async function action(endpoint, data, message = 'Torrent updated.') {
    setBusy(true); setActionError(''); setNotice('');
    try { await qbtRequest(`torrents/${endpoint}`, { method: 'POST', data }); done(message); }
    catch (err) { setActionError(err.message); } finally { setBusy(false); }
  }
  const bulk = (endpoint, data = {}) => action(endpoint, { hashes: chosen.map(item => item.hash).join('|'), ...data }, 'Selected torrents updated.');
  async function formSubmit(values) {
    const { kind, torrents: targets } = dialog;
    const hashes = targets.map(item => item.hash).join('|');
    const hash = targets[0].hash;
    setBusy(true); setActionError(''); setNotice('');
    try {
      const post = (endpoint, data) => qbtRequest(`torrents/${endpoint}`, { method: 'POST', data });
      if (kind === 'limits') {
        await post('setDownloadLimit', { hashes, limit: values.downloadLimit });
        await post('setUploadLimit', { hashes, limit: values.uploadLimit });
        await post('setShareLimits', { hashes, ratioLimit: values.ratioLimit, seedingTimeLimit: values.seedingTimeLimit, inactiveSeedingTimeLimit: values.inactiveSeedingTimeLimit });
      } else {
        const endpoint = { delete: 'delete', rename: 'rename', location: 'setLocation', category: 'setCategory', addTags: 'addTags', removeTags: 'removeTags', addTrackers: 'addTrackers', editTracker: 'editTracker', removeTracker: 'removeTrackers', renameFile: 'renameFile', addPeers: 'addPeers' }[kind];
        const data = { hashes, ...values };
        if (['rename', 'addTrackers', 'editTracker', 'removeTracker', 'renameFile'].includes(kind)) { delete data.hashes; data.hash = hash; }
        if (kind === 'editTracker') data.origUrl = dialog.url;
        if (kind === 'removeTracker') data.urls = dialog.url;
        if (kind === 'renameFile') data.oldPath = dialog.path;
        await post(endpoint, data);
      }
      if (kind === 'delete') { setSelected([]); if (targets.some(item => item.hash === inspectedRef.current)) closeInspector(); }
      setDialog(null); done(kind === 'delete' ? 'Selected torrents removed.' : 'Changes applied.');
    } catch (err) { setActionError(kind === 'limits' ? `${err.message} Some limits may already have been applied; refresh and review before retrying.` : err.message); } finally { setBusy(false); }
  }
  function more(value) {
    if (!value) return;
    if (['rename', 'location', 'category', 'addTags', 'removeTags', 'limits'].includes(value)) open({ kind: value, torrents: chosen });
    else if (value === 'force') bulk('setForceStart', { value: true });
    else if (value === 'unforce') bulk('setForceStart', { value: false });
    else if (value === 'automatic') bulk('setAutoManagement', { enable: true });
    else if (value === 'manual') bulk('setAutoManagement', { enable: false });
    else bulk(value);
  }
  function sortBy(key) { setSort(previous => ({ key, direction: previous.key === key ? -previous.direction : 1 })); setPage(0); }
  async function toggleAlternative() {
    setBusy(true); setActionError('');
    try { await qbtRequest('transfer/toggleSpeedLimitsMode', { method: 'POST' }); done('Speed mode updated.'); }
    catch (err) { setActionError(err.message); } finally { setBusy(false); }
  }

  const inspector = torrent && <div className="qb-inspector" id="qb-selected-transfer"><Details key={torrent.hash} torrent={torrent} onOperation={open} onAction={action} disabled={disabled} revision={revision} scrollOnMount={layout === 'bottom'} onClose={closeInspector} /><Activity history={history} name={torrent.name} /></div>;
  // Keep a filtered or paginated selection accessible without changing the user's filters.
  const cardGroup = torrent && (['downloading', 'seeding'].includes(torrentGroup(torrent)) ? torrentGroup(torrent) : 'attention');
  const inspectorInCard = layout === 'cards' && visible.some(item => item.hash === inspected) && !collapsed[cardGroup];
  return <div className={`page-content qb-page qb-layout-${layout}`}>
    <div className="qb-layout-picker"><div role="group" aria-label="Transfer layout">{layouts.map(([id, label]) => <button key={id} aria-pressed={layout === id} onClick={() => changeLayout(id)}>{label}</button>)}</div><span>{layout === 'dense' ? 'Full-width transfers · details in a drawer' : layout === 'bottom' ? 'Transfers above · selected torrent below' : 'Grouped transfers · open or close groups and details'}</span></div>
    <div className="qb-intro"><div><p className="eyebrow">2EZ / QBITTORRENT</p><h1>{error ? 'Lost touch with qBittorrent. Trying again…' : opening?.title || 'Let’s see what’s downloading…'}</h1><p className="qb-opening-summary">{error ? `Last known counts · ${opening?.summary || 'Waiting for the first update'}` : opening?.summary || 'Reading your transfer queue…'}</p></div><div className="qb-top-actions"><button className="qb-button" disabled={disabled} onClick={() => open({ kind: 'speed' })}>⇵ Speed limits</button><button className="qb-button" disabled={disabled} onClick={() => open({ kind: 'settings' })}>Settings</button><button className="qb-button qb-primary" disabled={disabled} onClick={() => open({ kind: 'add' })}>+ Add torrent</button></div></div>
    <div className="qb-stats"><div><strong className="qb-down">↓ {snapshot ? bytes(transfer.dl_info_speed) : '—'}/s</strong><span>downloading</span></div><div><strong className="qb-up">↑ {snapshot ? bytes(transfer.up_info_speed) : '—'}/s</strong><span>uploading</span></div><div><strong>{opening?.counts.downloading || 0}</strong><span>downloading</span></div><div><strong>{opening?.counts.seeding || 0}</strong><span>seeding</span></div><span className="qb-connection"><i className={error ? 'qb-dot-error' : transfer.connection_status === 'connected' ? 'qb-dot-live' : ''} />{error ? 'Connection lost · showing last update' : !snapshot ? 'Connecting…' : transfer.connection_status === 'connected' ? 'Connected' : transfer.connection_status === 'firewalled' ? 'Connected · firewalled' : 'Disconnected'}{snapshot && ` · ${bytes(transfer.free_space_on_disk)} free`}</span></div>
    {error && <div className="qb-error" role="alert">{error} <button className="qb-text-button" onClick={refresh}>Retry</button></div>}
    {snapshot && !version && <div className="qb-error">Could not detect the qBittorrent version. Retrying automatically to enable controls.</div>}
    {actionError && !dialog && <div className="qb-error" role="alert">{actionError}</div>}{notice && <div className="qb-notice" role="status">{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></div>}
    <div className={`qb-workspace ${torrent ? 'has-detail' : ''}`}><aside className="qb-filters" aria-label="Torrent filters"><p className="eyebrow">TRANSFERS</p>{filters.map(([id, label]) => <button key={id} className={`qb-filter ${filter === id ? 'active' : ''}`} aria-pressed={filter === id} onClick={() => { setFilter(id); setPage(0); }}>{label}<span>{counts[id] || 0}</span></button>)}<label className="qb-filter-label">CATEGORY<select value={category} onChange={event => { setCategory(event.target.value); setPage(0); }}><option value="*">All categories</option><option value="">Uncategorised</option>{Object.keys(categories).sort().map(name => <option key={name}>{name}</option>)}</select></label><label className="qb-filter-label">TAG<select value={tag} onChange={event => { setTag(event.target.value); setPage(0); }}><option value="*">All tags</option>{tags.map(name => <option key={name}>{name}</option>)}</select></label><button className="qb-text-button" disabled={disabled} onClick={() => open({ kind: 'organisation' })}>Manage categories & tags</button></aside>
    <div className="qb-center"><section className="qb-panel"><div className="qb-list-head"><label className="qb-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Find a torrent…" aria-label="Find a torrent" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label><span>{filtered.length} torrents</span><button className="qb-text-button" onClick={refresh}>Refresh ↻</button></div>
    <div className="qb-bulk"><span>{chosen.length ? `${chosen.length} selected` : 'Select torrents to manage'}</span><button className="qb-button" disabled={disabled || !chosen.length} onClick={() => bulk(modern(version) ? 'start' : 'resume')}>Start</button><button className="qb-button" disabled={disabled || !chosen.length} onClick={() => bulk(modern(version) ? 'stop' : 'pause')}>Stop</button><select aria-label="More torrent actions" value="" disabled={disabled || !chosen.length} onChange={event => more(event.target.value)}><option value="">More…</option><optgroup label="Transfers"><option value="force">Force start</option><option value="unforce">Disable force start</option><option value="recheck">Recheck</option><option value="reannounce">Reannounce</option><option value="limits">Set speed & share limits</option><option value="toggleSequentialDownload">Toggle sequential download</option><option value="toggleFirstLastPiecePrio">Toggle first/last piece priority</option></optgroup><optgroup label="Organise"><option value="rename" disabled={chosen.length !== 1}>Rename</option><option value="location">Move files</option><option value="category">Set category</option><option value="addTags">Add tags</option><option value="removeTags">Remove tags</option><option value="automatic">Automatic management</option><option value="manual">Manual management</option></optgroup><optgroup label="Queue"><option value="topPrio">Move to top</option><option value="increasePrio">Move up</option><option value="decreasePrio">Move down</option><option value="bottomPrio">Move to bottom</option></optgroup></select><button className="qb-button qb-danger" disabled={disabled || !chosen.length} onClick={() => open({ kind: 'delete', torrents: chosen })}>Remove</button></div>
    {layout === 'cards' ? <><div className="qb-board-tools"><label><input type="checkbox" aria-label="Select all visible torrents" checked={visible.length > 0 && visible.every(item => selected.includes(item.hash))} disabled={!visible.length} onChange={event => selectAll(event.target.checked)} /> Select page</label><label>Sort <select aria-label="Sort transfers" value={`${sort.key}:${sort.direction}`} onChange={event => { const [key, direction] = event.target.value.split(':'); setSort({ key, direction: Number(direction) }); setPage(0); }}>{[['name', 'Name'], ['size', 'Size'], ['progress', 'Progress'], ['dlspeed', 'Download speed'], ['upspeed', 'Upload speed'], ['ratio', 'Ratio'], ['eta', 'ETA']].flatMap(([key, label]) => [1, -1].map(direction => <option key={`${key}:${direction}`} value={`${key}:${direction}`}>{label} {direction === 1 ? '↑' : '↓'}</option>))}</select></label></div><StatusBoard visible={visible} selected={selected} inspected={inspected} select={select} inspect={inspect} inspector={inspectorInCard ? inspector : null} collapsed={collapsed} toggleGroup={id => setCollapsed(previous => ({ ...previous, [id]: !previous[id] }))} /></> : <TorrentTable visible={visible} selected={selected} inspected={inspected} sort={sort} sortBy={sortBy} select={select} selectAll={selectAll} inspect={inspect} />}
    {!snapshot ? <div className="qb-empty">{error ? 'Waiting for qBittorrent to reconnect.' : 'Loading torrents…'}</div> : !filtered.length && <div className="qb-empty">{torrents.length ? 'No torrents match these filters.' : 'No torrents yet. Add a magnet link or torrent file to get started.'}</div>}
    <div className="qb-list-foot"><span>{lastUpdate ? `Updated ${new Date(lastUpdate).toLocaleTimeString()}` : 'Waiting for first update'}</span>{filtered.length > 50 && <div className="qb-pagination"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span>{currentPage + 1} / {Math.ceil(filtered.length / 50)}</span><button disabled={(currentPage + 1) * 50 >= filtered.length} onClick={() => setPage(currentPage + 1)}>Next</button></div>}<button className="qb-text-button" disabled={disabled} aria-pressed={Boolean(transfer.use_alt_speed_limits)} onClick={toggleAlternative}>Alternative limits {transfer.use_alt_speed_limits ? 'on' : 'off'}</button></div>
    </section></div>
    {layout === 'dense' && inspector ? <InspectorDrawer onClose={closeInspector}>{inspector}</InspectorDrawer> : layout === 'bottom' ? inspector : !inspectorInCard && torrent ? <div className="qb-hidden-selection"><span>{torrent.name} · {collapsed[cardGroup] ? 'Group collapsed' : 'Outside the current filters or page'}</span><button className="qb-text-button" onClick={() => { setFilter('all'); setQuery(''); setCategory('*'); setTag('*'); setSort({ key: 'name', direction: 1 }); setPage(Math.floor([...torrents].sort((a, b) => a.name.localeCompare(b.name)).findIndex(item => item.hash === inspected) / 50)); setCollapsed(previous => ({ ...previous, [cardGroup]: false })); }}>Show selected transfer</button><button className="qb-text-button" onClick={closeInspector}>Close details</button></div> : null}
    </div><footer className="qb-footer"><span>{version ? `qBittorrent ${version}` : 'qBittorrent'} · Updates every 2.5s</span><a href="https://2ez.dinosaur-banana.ts.net:8081" target="_blank" rel="noreferrer">Open full Web UI ↗</a></footer>
    {dialog?.kind === 'add' && <AddTorrent categories={categories} version={version} onClose={() => setDialog(null)} onDone={done} />}
    {['speed', 'settings'].includes(dialog?.kind) && <Preferences speedOnly={dialog.kind === 'speed'} onClose={() => setDialog(null)} onDone={done} />}
    {dialog?.kind === 'organisation' && <Organisation categories={categories} tags={tags} onClose={() => setDialog(null)} onDone={done} />}
    {dialog && !['add', 'speed', 'settings', 'organisation'].includes(dialog.kind) && <ActionForm operation={dialog} categories={categories} onClose={() => setDialog(null)} onSubmit={formSubmit} busy={busy} error={actionError} />}
  </div>;
}
