import { useEffect, useRef, useState } from 'react';
import { duration } from '../qbittorrent/api';
import { date, encodingSpeed, filename, progress, unmanicRequest, workerState } from './api';
import JobDetails from './JobDetails';
import ActionDialog from './ActionDialog';
import '../qbittorrent/qbittorrent.css';
import './unmanic.css';

const sections = [['queue', 'Queue'], ['workers', 'Workers'], ['history', 'History'], ['libraries', 'Libraries']];
const pageSize = 25;
const label = (item, kind) => kind === 'queue' ? filename(item.abspath) : kind === 'history' ? item.task_label : item.name;
export default function UnmanicPage() {
  const [section, setSection] = useState('queue');
  const [query, setQuery] = useState('');
  const [library, setLibrary] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState([]);
  const [inspected, setInspected] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [operation, setOperation] = useState(null);
  const meta = useRef(null);
  const refreshRef = useRef(null);
  const requestKey = JSON.stringify([section, query, library, status, page]);
  useEffect(() => {
    const controller = new AbortController(); let pending = false;
    const poll = async () => {
      if (pending) return; pending = true;
      const request = (endpoint, data) => unmanicRequest(endpoint, { ...(data ? { method: 'POST', data } : {}), signal: controller.signal });
      try {
        const [workerData, scan, queue, history, catalog] = await Promise.all([
          request('workers/status'), request('pending/rescan/status'),
          request('pending/tasks', section === 'queue' ? { start: page * pageSize, length: pageSize, search_value: query, library_ids: library === 'all' ? [] : [Number(library)], order_by: 'priority', order_direction: 'desc' } : { start: 0, length: 1 }),
          request('history/tasks', section === 'history' ? { start: page * pageSize, length: pageSize, search_value: query, status, order_by: 'finish_time', order_direction: 'desc' } : { start: 0, length: 1 }),
          meta.current && Date.now() - meta.current.time < 60000 ? meta.current : Promise.all([request('settings/libraries'), request('version/read')]).then(([libraries, version]) => ({ libraries: libraries.libraries, version: version.version, time: Date.now() })),
        ]);
        if (controller.signal.aborted) return;
        if (!Array.isArray(workerData.workers_status) || !Array.isArray(queue.results) || !Array.isArray(history.results) || !Array.isArray(catalog.libraries)) throw new Error('Unmanic returned an invalid update. Retrying automatically.');
        meta.current = catalog;
        const rows = section === 'queue' ? queue.results : section === 'history' ? history.results : (section === 'workers' ? workerData.workers_status : catalog.libraries).filter(item => item.name.toLowerCase().includes(query.toLowerCase()));
        const total = section === 'queue' ? queue.recordsFiltered : section === 'history' ? history.recordsFiltered : rows.length;
        if (page > 0 && page * pageSize >= total) setPage(Math.max(0, Math.ceil(total / pageSize) - 1));
        setSnapshot({ key: requestKey, workers: workerData.workers_status, scan, queue, history, ...catalog, rows, total, updated: Date.now() }); setError('');
      } catch (err) { if (!controller.signal.aborted) setError(err.message); }
      finally { pending = false; }
    };
    refreshRef.current = poll;
    const first = setTimeout(poll, 200); const timer = setInterval(poll, 4000);
    return () => { controller.abort(); clearTimeout(first); clearInterval(timer); refreshRef.current = null; };
  }, [section, query, library, status, page, requestKey]);
  const loaded = snapshot?.key === requestKey;
  const rows = loaded ? snapshot.rows : [];
  const workers = snapshot?.workers || [];
  const libraries = snapshot?.libraries || [];
  const scan = snapshot?.scan;
  const disabled = busy || !loaded || Boolean(error);
  const selectedItems = rows.filter(item => selected.includes(item.id));
  const active = workers.filter(worker => !worker.idle && !worker.paused).length;
  const paused = workers.filter(worker => worker.paused).length;
  const headline = !snapshot ? 'Checking what’s cooking…' : active ? `${active} ${active === 1 ? 'worker' : 'workers'} cooking. Let the codecs do their thing.` : paused ? 'The workers are taking a breather.' : snapshot.queue.recordsTotal ? 'A little queue. A lot of potential.' : 'Nothing to squeeze. Even codecs need a day off.';
  function updateFilter(setter, value) { setter(value); setPage(0); setSelected([]); }
  function switchSection(next) { setSection(next); setCollapsed({}); setQuery(''); setLibrary('all'); setStatus('all'); setPage(0); setSelected([]); setInspected(null); }
  function closeDetails() { const button = [...document.querySelectorAll('[data-um-id]')].find(element => element.dataset.umId === String(inspected?.item.id)); setInspected(null); button?.focus(); }
  function inspect(item) { if (inspected?.item.id === item.id) closeDetails(); else setInspected({ kind: section, item }); }
  function select(id, checked) { setSelected(previous => checked ? [...new Set([...previous, id])] : previous.filter(value => value !== id)); }
  async function mutate(endpoint, method, data, message) {
    setBusy(true); setActionError(''); setNotice('');
    try {
      await unmanicRequest(endpoint, { method, data }); setNotice(message); setOperation(null); refreshRef.current?.(); return true;
    } catch (err) { setActionError(`${err.message} Refresh to review the current state before retrying.`); refreshRef.current?.(); return false; }
    finally { setBusy(false); }
  }
  function action(kind, items = []) {
    setActionError('');
    if (['pause', 'resume'].includes(kind)) return mutate(`workers/worker/${kind}`, 'POST', { worker_id: items[0].id }, `Worker ${kind === 'pause' ? 'paused' : 'resumed'}.`);
    if (['top', 'bottom'].includes(kind)) return mutate('pending/reorder', 'POST', { id_list: items.map(item => item.id), position: kind }, 'Queue order updated.');
    setOperation({ kind, items });
  }
  async function submit(data) {
    const map = { add: ['pending/create', 'POST', 'File queued.'], scan: ['pending/rescan', 'POST', 'Library scan scheduled.'], cancelScan: ['pending/rescan', 'DELETE', 'Library scan cancelled.'], removeQueue: ['pending/tasks', 'DELETE', 'Selected queue entries removed.'], removeHistory: ['history/tasks', 'DELETE', 'Selected history records removed.'], reprocess: ['history/reprocess', 'POST', 'Selected files queued for processing.'], terminate: ['workers/worker/terminate', 'DELETE', 'Current job terminated.'] };
    const [endpoint, method, message] = map[operation.kind];
    const payload = { ...data, ...(operation.kind === 'terminate' ? { worker_id: operation.items[0].id } : operation.items?.length ? { id_list: operation.items.map(item => item.id) } : {}) };
    if (await mutate(endpoint, method, payload, message)) { setSelected([]); if (['removeQueue', 'removeHistory'].includes(operation.kind)) setInspected(null); }
  }
  const detailItem = inspected && (inspected.kind === 'workers' ? workers.find(item => item.id === inspected.item.id) : rows.find(item => item.id === inspected.item.id)) || inspected?.item;
  const details = inspected && <JobDetails key={`${inspected.kind}-${inspected.item.id}`} kind={inspected.kind} item={detailItem} workers={workers} disabled={disabled || (inspected.kind === 'workers' && !workers.some(item => item.id === inspected.item.id))} onAction={action} onClose={closeDetails} />;
  const jobState = item => section === 'workers' ? workerState(item) : section === 'history' ? item.task_success ? 'Succeeded' : 'Failed' : section === 'libraries' ? item.enable_scanner ? 'Scanning enabled' : 'Scanner disabled' : workers.some(w => w.current_task === item.id && !w.idle) ? 'Processing' : item.status === 'pending' ? 'Queued' : item.status;
  const groupNames = [...new Set(rows.map(jobState))];
  const expandable = item => <button className="um-item-name" data-um-id={item.id} aria-expanded={inspected?.item.id === item.id} aria-controls={inspected?.item.id === item.id ? "um-selected-job" : undefined} onClick={() => inspect(item)}>{label(item, section)}<span aria-hidden="true">{inspected?.item.id === item.id ? '−' : '+'}</span></button>;
  const summary = item => section === 'queue' ? `${item.library_name || 'Unassigned library'} · Priority ${item.priority}` : section === 'history' ? `${date(item.finish_time)} · ${duration(item.finish_time - item.start_time)}` : section === 'libraries' ? item.path : item.current_file || 'No current job';
  return <div className="page-content qb-page um-page">
    <div className="qb-intro"><div><p className="eyebrow">2EZ / UNMANIC</p><h1>{error ? 'Lost touch with Unmanic. Trying again…' : headline}</h1><p>{snapshot ? `${snapshot.queue.recordsTotal} queue entries · ${active} processing · ${paused} paused workers` : 'Connecting to your media processor…'}</p></div><div className="qb-top-actions"><a className="qb-button" href="/unmanic/" target="_blank" rel="noreferrer">Full Unmanic UI ↗</a><button className="qb-button qb-primary" disabled={disabled} onClick={() => action('add')}>+ Add file</button></div></div>
    <div className="qb-stats"><div><strong className="qb-down">{snapshot?.queue.recordsTotal ?? '—'}</strong><span>in queue</span></div><div><strong>{active} / {workers.length}</strong><span>workers processing</span></div><div><strong className="qb-up">{snapshot?.history.successCount ?? '—'}</strong><span>succeeded · all time</span></div><div><strong className="qb-danger">{snapshot?.history.failedCount ?? '—'}</strong><span>failed · all time</span></div><span className="qb-connection"><i className={error ? 'qb-dot-error' : snapshot ? 'qb-dot-live' : ''} />{error ? 'Showing last update' : snapshot ? 'Connected' : 'Connecting'}</span></div>
    {error && <div className="qb-error" role="alert">{error} <button className="qb-text-button" onClick={() => refreshRef.current?.()}>Retry</button></div>}{actionError && !operation && <div className="qb-error" role="alert">{actionError}</div>}{notice && <div className="qb-notice" role="status">{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></div>}
    <section className="qb-panel um-operations" aria-label="Processing controls"><div><span className="eyebrow">WORKERS</span><button className="qb-button" disabled={disabled || !workers.length || workers.every(w => w.paused)} onClick={() => mutate('workers/worker/pause/all', 'POST', {}, 'All workers paused.')}>Pause all</button><button className="qb-button" disabled={disabled || !paused} onClick={() => mutate('workers/worker/resume/all', 'POST', {}, 'All workers resumed.')}>Resume all</button></div><div><span className="eyebrow">SCAN · {scan?.state || '—'}</span>{scan?.current_library_name && <span className="um-meta">{scan.current_library_name}</span>}<button className="qb-button" disabled={disabled || !scan?.can_rescan} onClick={() => action('scan')}>Scan libraries</button>{scan?.can_pause && <button className="qb-button" disabled={disabled} onClick={() => mutate('pending/rescan/pause', 'POST', {}, 'Scan paused.')}>Pause scan</button>}{scan?.can_resume && <button className="qb-button" disabled={disabled} onClick={() => mutate('pending/rescan/resume', 'POST', {}, 'Scan resumed.')}>Resume scan</button>}{scan?.can_cancel && <button className="qb-button qb-danger" disabled={disabled} onClick={() => action('cancelScan')}>Cancel scan</button>}</div></section>
    <nav className="um-sections" aria-label="Unmanic sections">{sections.map(([id, name]) => <button key={id} className={section === id ? 'active' : ''} aria-pressed={section === id} onClick={() => switchSection(id)}>{name}</button>)}</nav>
    <section className="qb-panel um-list um-card-list"><div className="qb-list-head"><label className="qb-search"><input type="search" aria-label="Search Unmanic items" placeholder={`Search ${section}…`} value={query} onChange={event => updateFilter(setQuery, event.target.value)} /></label>{section === 'queue' && <select aria-label="Filter library" value={library} onChange={event => updateFilter(setLibrary, event.target.value)}><option value="all">All libraries</option>{libraries.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}{section === 'history' && <select aria-label="Filter result" value={status} onChange={event => updateFilter(setStatus, event.target.value)}><option value="all">All results</option><option value="success">Succeeded</option><option value="failed">Failed</option></select>}<span>{loaded ? `${snapshot.total} items` : 'Loading…'}</span><button className="qb-text-button" onClick={() => refreshRef.current?.()}>Refresh ↻</button></div>
    {['queue', 'history'].includes(section) && <div className="qb-bulk"><label className="um-check"><input type="checkbox" aria-label="Select page" checked={rows.length > 0 && rows.every(item => selected.includes(item.id))} disabled={!rows.length} onChange={event => setSelected(event.target.checked ? rows.map(item => item.id) : [])} />{selectedItems.length} selected</label>{section === 'queue' ? <><button className="qb-button" disabled={disabled || !selectedItems.length} onClick={() => action('top', selectedItems)}>Move to top</button><button className="qb-button" disabled={disabled || !selectedItems.length} onClick={() => action('bottom', selectedItems)}>Move to bottom</button></> : <button className="qb-button" disabled={disabled || !selectedItems.length} onClick={() => action('reprocess', selectedItems)}>Reprocess</button>}<button className="qb-button qb-danger" disabled={disabled || !selectedItems.length} onClick={() => action(section === 'queue' ? 'removeQueue' : 'removeHistory', selectedItems)}>Remove {section === 'queue' ? 'from queue' : 'records'}</button></div>}
    {!loaded ? <p className="qb-empty">{error ? 'Waiting to reconnect…' : 'Loading Unmanic…'}</p> : !rows.length ? <p className="qb-empty">{query || library !== 'all' || status !== 'all' ? 'No items match these filters.' : section === 'queue' ? 'The queue is clear. Add a file or scan your libraries.' : section === 'history' ? 'No completed jobs yet.' : section === 'workers' ? 'No workers configured. Open Unmanic settings to add workers.' : 'No libraries configured. Open Unmanic settings to add a library.'}</p> : <div className="um-board">{groupNames.map(group => <section key={group}><button className="um-group-toggle" aria-expanded={!collapsed[group]} onClick={() => setCollapsed(previous => ({ ...previous, [group]: !previous[group] }))}><strong>{group}</strong><span>{rows.filter(item => jobState(item) === group).length} {collapsed[group] ? '+' : '−'}</span></button><div hidden={Boolean(collapsed[group])}>{rows.filter(item => jobState(item) === group).map(item => <article key={item.id} className={`um-card ${inspected?.item.id === item.id ? 'expanded' : ''}`}><div className="um-card-head">{expandable(item)}{['queue', 'history'].includes(section) && <input type="checkbox" aria-label={`Select ${label(item, section)}`} checked={selected.includes(item.id)} onChange={event => select(item.id, event.target.checked)} />}</div><p className="um-meta">{summary(item)}</p><span className={`um-state ${jobState(item) === 'Failed' ? 'um-failed' : ''}`}>{jobState(item)}</span>{section === 'workers' && !item.idle && <><div className="um-progress"><i style={{ width: `${Math.max(0, Math.min(100, progress(item) || 0))}%` }} /></div><p className="um-meta">{progress(item) === null ? 'Progress unavailable' : `${progress(item).toFixed(1)}%`} · {encodingSpeed(item)}</p></>}</article>)}</div></section>)}</div>}
    <div className="qb-list-foot"><span>{snapshot ? `Updated ${new Date(snapshot.updated).toLocaleTimeString()}` : 'Waiting for first update'}</span>{loaded && ['queue', 'history'].includes(section) && snapshot.total > pageSize && <div className="qb-pagination"><button disabled={disabled || page === 0} onClick={() => { setPage(value => value - 1); setSelected([]); }}>Previous</button><span>{page + 1} / {Math.ceil(snapshot.total / pageSize)}</span><button disabled={disabled || (page + 1) * pageSize >= snapshot.total} onClick={() => { setPage(value => value + 1); setSelected([]); }}>Next</button></div>}<span>{section === 'queue' ? 'Highest priority first' : section === 'history' ? 'Most recent first' : 'Live state'}</span></div></section>
    {details}
    <footer className="qb-footer"><span>Unmanic {snapshot?.version || ''} · Updates every 4s</span><a href="/unmanic/" target="_blank" rel="noreferrer">Advanced settings & plugins ↗</a></footer>
    {operation && <ActionDialog key={operation.kind} operation={operation} libraries={libraries} busy={busy} error={actionError} onClose={() => { if (!busy) setOperation(null); }} onSubmit={submit} />}
  </div>;
}
