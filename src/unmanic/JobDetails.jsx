import { useEffect, useRef, useState } from 'react';
import { bytes, duration } from '../qbittorrent/api';
import { date, encodingSpeed, filename, logText, number, progress, unmanicRequest, workerState } from './api';

export default function JobDetails({ item, kind, workers, disabled, onAction, onClose }) {
  const [tab, setTab] = useState('Overview');
  const [historyLog, setHistoryLog] = useState(null);
  const [error, setError] = useState('');
  const panel = useRef(null);
  const worker = kind === 'workers' ? workers.find(w => w.id === item.id) : kind === 'queue' ? workers.find(w => w.current_task === item.id) : null;
  useEffect(() => { if (matchMedia('(max-width: 800px)').matches) panel.current?.scrollIntoView({ block: 'start' }); }, []);
  useEffect(() => {
    if (kind !== 'history' || tab !== 'Logs') return;
    const controller = new AbortController();
    unmanicRequest('history/task/log', { method: 'POST', data: { task_id: item.id }, signal: controller.signal }).then(result => { if (!controller.signal.aborted) { setHistoryLog(logText(result.command_log_lines?.length ? result.command_log_lines : result.command_log)); setError(''); } }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [item.id, kind, tab]);
  const row = (label, value) => <div className="qb-data-row" key={label}><span>{label}</span><strong>{value}</strong></div>;
  const tabs = kind === 'libraries' ? ['Overview'] : ['Overview', 'Logs'];
  const pct = worker ? progress(worker) : null;
  const title = kind === 'workers' ? item.name : kind === 'history' ? item.task_label : kind === 'libraries' ? item.name : filename(item.abspath);
  const logs = kind === 'history' ? historyLog : worker ? logText(worker.worker_log_tail) : '';
  return <section className="qb-panel um-detail" id="um-selected-job" ref={panel} aria-label="Selected Unmanic item">
    <div className="qb-detail-heading"><p className="eyebrow">{kind === 'libraries' ? 'LIBRARY' : kind === 'workers' ? 'SELECTED WORKER' : 'SELECTED JOB'}</p><button className="qb-icon-button" aria-label="Close Unmanic details" onClick={onClose}>×</button></div>
    <div className="um-detail-title"><h2>{title}</h2>{worker && <span className={`um-state um-${workerState(worker).toLowerCase()}`}>{workerState(worker)}</span>}{pct !== null && <><div className="um-progress"><i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div><p className="um-meta">{pct.toFixed(1)}% · {encodingSpeed(worker)} · {duration(number(worker.subprocess?.elapsed))} elapsed</p></>}</div>
    <div className="qb-tabs" role="tablist" aria-label="Unmanic item details">{tabs.map(name => <button key={name} role="tab" tabIndex={tab === name ? 0 : -1} onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (tabs.indexOf(name) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; setTab(tabs[next]); event.currentTarget.parentElement.children[next].focus(); }} aria-selected={tab === name} aria-controls="um-detail-body" className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name}</button>)}</div>
    <div className="qb-details-body" id="um-detail-body" role="tabpanel" aria-label={tab}>
      {tab === 'Logs' ? <>{error && <p className="qb-error" role="alert">{error}</p>}<pre className="um-log">{logs || (kind === 'history' && historyLog === null && !error ? 'Loading processing log…' : 'No log output available yet.')}</pre></> : <div className="um-overview">
        <section>{kind === 'queue' && <>{row('Status', item.status)}{row('Priority', item.priority)}{row('Library', item.library_name || '—')}{row('Task type', item.type)}<p className="eyebrow">SOURCE FILE</p><p className="qb-path">{item.abspath}</p></>}
        {kind === 'history' && <>{row('Result', item.task_success ? 'Succeeded' : 'Failed')}{row('Started', date(item.start_time))}{row('Finished', date(item.finish_time))}{row('Processing time', duration(item.finish_time - item.start_time))}</>}
        {kind === 'libraries' && <><p className="eyebrow">LIBRARY PATH</p><p className="qb-path">{item.path}</p>{row('Scanner', item.enable_scanner ? 'Enabled' : 'Disabled')}{row('File monitoring', item.enable_inotify ? 'Enabled' : 'Disabled')}{row('Remote only', item.enable_remote_only ? 'Yes' : 'No')}{row('Locked', item.locked ? 'Yes' : 'No')}</>}
        {worker && <>{row('Worker', worker.name)}{row('Started', date(worker.start_time))}{row('CPU', number(worker.subprocess?.cpu_percent) === null ? '—' : `${Number(worker.subprocess.cpu_percent).toFixed(1)}%`)}{row('Memory', bytes(number(worker.subprocess?.rss_bytes)))}{row('File', worker.current_file || 'No current job')}</>}
        </section>{worker && <section><p className="eyebrow">PROCESSING STEPS</p>{Object.entries(worker.runners_info || {}).length ? Object.entries(worker.runners_info).map(([id, runner]) => <div className="um-runner" key={id}><strong>{runner.name || id}</strong><span>{runner.status}{runner.status === 'complete' ? runner.success ? ' · Succeeded' : ' · Failed' : ''}</span></div>) : <p className="um-meta">No plugin steps running.</p>}{worker.current_command && <><p className="eyebrow">CURRENT COMMAND</p><pre className="um-log">{worker.current_command}</pre></>}</section>}
      </div>}
    </div>
    <div className="qb-detail-actions">{worker && <><button className="qb-button" disabled={disabled} onClick={() => onAction(worker.paused ? 'resume' : 'pause', [worker])}>{worker.paused ? 'Resume worker' : 'Pause worker'}</button><button className="qb-button qb-danger" disabled={disabled || worker.idle} onClick={() => onAction('terminate', [worker])}>Stop current job</button></>}{kind === 'queue' && <button className="qb-button" disabled={disabled || Boolean(worker)} onClick={() => onAction('top', [item])}>Move to top</button>}{kind === 'history' && <button className="qb-button" disabled={disabled} onClick={() => onAction('reprocess', [item])}>Reprocess file</button>}{kind === 'libraries' && <a className="qb-button" href="/unmanic/" target="_blank" rel="noreferrer">Library & plugin settings ↗</a>}</div>
  </section>;
}
