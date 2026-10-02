import { useCallback, useEffect, useRef, useState } from 'react';
import './stack-manager.css';

const API = '/stack-api';
const starter = 'services:\n  app:\n    image: nginx:alpine\n    restart: unless-stopped\n    ports:\n      - "8088:80"\n';
const actionLabels = { deploy: 'Deploy', start: 'Start', stop: 'Stop', restart: 'Restart', pull: 'Pull images', down: 'Take down' };
const actionCopy = {
  deploy: 'Apply the saved Compose file. Changed services may be recreated and briefly unavailable.',
  stop: 'Stop all services in this stack. Containers and data remain available to start again.',
  restart: 'Restart all services in this stack. They will be briefly unavailable.',
  down: 'Remove this stack’s containers and networks. Named volumes and Compose files are kept. Data stored only in a container’s writable layer is lost.',
};
async function api(url, options = {}) {
  const response = await fetch(API + url, { ...options, headers: { 'Content-Type': 'application/json', 'X-2ez-manager': '1' }, signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The manager could not complete this request.');
  return data;
}
const statusLabel = status => ({ running: 'Running', stopped: 'Stopped', partial: 'Partly running', attention: 'Needs attention', undeployed: 'Not deployed' }[status] || status);

function StackWorkspace({ name, snapshot, onRefresh, onDirtyChange, onNavigate, composeAvailable, initialTab = 'services' }) {
  const [detail, setStack] = useState(null);
  const stack = detail && { ...detail, ...(snapshot ? { containers: snapshot.containers, running: snapshot.running, total: snapshot.total, status: snapshot.status } : {}) };
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState(initialTab);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [logs, setLogs] = useState(null);
  const [logsError, setLogsError] = useState('');
  const [follow, setFollow] = useState(true);
  const dirty = content !== saved;
  const runningJob = job?.status === 'running';
  const canManage = stack?.manageable && composeAvailable;
  const locked = busy || runningJob;

  const reload = useCallback(async () => {
    try {
      const data = await api(`/stacks/${encodeURIComponent(name)}`);
      setStack(data); setContent(data.content || ''); setSaved(data.content || ''); setError('');
      if (data.job) setJob(await api(`/jobs/${data.job}`));
    } catch (err) { setError(err.message); }
  }, [name]);
  useEffect(() => { let active = true; api(`/stacks/${encodeURIComponent(name)}`).then(async data => {
    if (!active) return;
    setStack(data); setContent(data.content || ''); setSaved(data.content || '');
    if (data.job) { const current = await api(`/jobs/${data.job}`); if (active) setJob(current); }
  }).catch(err => { if (active) setError(err.message); }); return () => { active = false; }; }, [name]);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    if (!runningJob) return;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const current = await api(`/jobs/${job.id}`);
        if (!active) return;
        setJob(current);
        if (current.status !== 'running') {
          onRefresh();
          const data = await api(`/stacks/${encodeURIComponent(name)}`);
          if (active) setStack(previous => ({ ...previous, containers: data.containers, running: data.running, total: data.total, status: data.status }));
        }
      } catch (err) { if (active) { setError(err.message); setJob(previous => ({ ...previous, status: 'unknown' })); } }
    }, 1000);
    return () => { active = false; clearInterval(timer); };
  }, [job?.id, runningJob, name, onRefresh]);
  useEffect(() => {
    if (tab !== 'logs' || !canManage) return;
    let active = true;
    let pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      try { const data = await api(`/stacks/${encodeURIComponent(name)}/logs`); if (active) { setLogs(data.output); setLogsError(''); } }
      catch (err) { if (active) setLogsError(err.message); }
      finally { pending = false; }
    };
    load(); const timer = follow ? setInterval(load, 4000) : null;
    return () => { active = false; clearInterval(timer); };
  }, [name, tab, follow, canManage]);

  async function save(validateOnly = false) {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api(`/stacks/${encodeURIComponent(name)}${validateOnly ? '/validate' : ''}`, { method: validateOnly ? 'POST' : 'PUT', body: JSON.stringify({ content, revision: stack.revision }) });
      if (validateOnly) setNotice(`Compose configuration is valid.${result.output ? '\n' + result.output : ''}`);
      else { setSaved(content); setStack(previous => ({ ...previous, revision: result.revision })); setNotice(`Saved. Deploy when you’re ready to apply the changes. Backup: ${result.backup}`); onRefresh(); }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function execute(action, container = null) {
    setConfirm(null); setBusy(true); setError(''); setNotice('');
    try {
      if (container) {
        const response = await fetch(`/docker-api/containers/${container.id}/${action}`, { method: 'POST', headers: { 'X-2ez-docker': '1' }, signal: AbortSignal.timeout(45000) });
        const result = await response.json();
        if (!response.ok || result.error) throw new Error(result.error || `Could not ${action} ${container.name}.`);
        const data = await api(`/stacks/${encodeURIComponent(name)}`);
        setStack(previous => ({ ...previous, containers: data.containers, running: data.running, total: data.total, status: data.status }));
        setNotice(`${container.name}: ${action} completed.`); onRefresh();
      } else {
        const current = await api(`/stacks/${encodeURIComponent(name)}/actions`, { method: 'POST', body: JSON.stringify({ action, revision: stack.revision }) });
        setJob(current); onRefresh();
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  function requestAction(action, container = null) {
    if (actionCopy[action]) setConfirm({ action, container });
    else execute(action, container);
  }
  if (!stack) return <section className="sm-panel sm-loading" aria-live="polite">{error ? <><p role="alert">{error}</p><button className="surface-button" onClick={reload}>Retry</button></> : 'Loading stack…'}</section>;
  return <section className="sm-panel sm-workspace" aria-label={`${name} workspace`}>
    <div className="sm-workspace-head"><div><p className="eyebrow">COMPOSE PROJECT</p><h2>{name}</h2><p className="sm-path">{stack.files.join(' + ') || 'No Compose file reported'}</p></div><span className={`sm-state sm-state-${stack.status}`}>{statusLabel(stack.status)}</span></div>
    {!stack.manageable && <div className="sm-notice">{stack.reason} <button className="sm-text-button" onClick={() => onNavigate('docker')}>Open Docker →</button></div>}
    <div className="sm-actionbar" aria-label="Stack actions">
      {Object.entries(actionLabels).map(([action, label]) => <button key={action} className={`surface-button ${action === 'deploy' ? 'sm-primary' : ''} ${action === 'down' ? 'sm-danger' : ''}`} disabled={!canManage || locked || dirty} onClick={() => requestAction(action)}>{label}</button>)}
    </div>
    {dirty && <p className="sm-notice">Unsaved changes. Save or reload the Compose file before running a stack action.</p>}
    {confirm && <div className="sm-confirm" role="alertdialog" aria-labelledby="sm-confirm-title" aria-describedby="sm-confirm-description"><h3 id="sm-confirm-title">{actionLabels[confirm.action]} {confirm.container?.name || name}?</h3><p id="sm-confirm-description">{confirm.container ? `This will ${confirm.action} only ${confirm.container.name}.` : actionCopy[confirm.action]}</p><div><button autoFocus className="surface-button" onClick={() => setConfirm(null)}>Cancel</button><button className={`surface-button ${confirm.action === 'down' || confirm.action === 'stop' ? 'sm-danger' : 'sm-primary'}`} onClick={() => execute(confirm.action, confirm.container)}>Confirm {actionLabels[confirm.action].toLowerCase()}</button></div></div>}
    {error && <div className="sm-error" role="alert">{error}</div>}
    {notice && <div className="sm-notice" role="status">{notice}</div>}
    <div className="sm-tabs" role="tablist" aria-label="Stack details">{['services', 'compose', 'logs'].map(value => <button key={value} role="tab" aria-selected={tab === value} aria-controls={`sm-panel-${value}`} id={`sm-tab-${value}`} onKeyDown={event => {
      const tabs = ['services', 'compose', 'logs'];
      const next = event.key === 'ArrowRight' ? (tabs.indexOf(tab) + 1) % 3 : event.key === 'ArrowLeft' ? (tabs.indexOf(tab) + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : -1;
      if (next >= 0) { event.preventDefault(); setTab(tabs[next]); document.getElementById(`sm-tab-${tabs[next]}`)?.focus(); }
    }} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}>{value === 'services' ? `Containers · ${stack.total}` : value === 'compose' ? `Compose${dirty ? ' •' : ''}` : 'Logs'}</button>)}</div>
    <div role="tabpanel" id={`sm-panel-${tab}`} aria-labelledby={`sm-tab-${tab}`}>
      {tab === 'services' && <div className="sm-services">{stack.containers.length ? stack.containers.map(container => <div className="sm-container" key={container.id}><span className={`sm-dot ${container.state === 'running' ? 'sm-dot-live' : ''}`} /><div className="sm-container-info"><h3>{container.name}</h3><p>{container.image}</p><span>{container.status || container.state}</span></div><div className="sm-container-actions">{(container.state === 'running' ? ['stop', 'restart'] : ['start']).map(action => <button key={action} className="surface-button" disabled={locked || !stack.manageable} onClick={() => requestAction(action, container)}>{actionLabels[action]}</button>)}</div></div>) : <div className="sm-loading">No containers yet. Review the Compose file, then deploy this stack.</div>}</div>}
      {tab === 'compose' && <div className="sm-editor"><div className="sm-editor-toolbar"><label htmlFor="sm-compose">Compose configuration</label><span>{dirty ? 'Unsaved changes' : stack.content === null ? 'Unavailable' : 'Saved on disk'}</span></div>{stack.content === null ? <div className="sm-loading">The Compose file cannot be opened here. Check the file paths and permissions on the host.</div> : <textarea id="sm-compose" spellCheck="false" autoCapitalize="off" autoComplete="off" value={content} readOnly={!canManage || locked} onChange={event => { setContent(event.target.value); setNotice(''); setConfirm(null); }} />}<div className="sm-editor-actions"><button className="surface-button" disabled={!canManage || locked} onClick={() => save(true)}>Validate</button><button className="surface-button sm-primary" disabled={!canManage || locked || !dirty} onClick={() => save()}>Save Compose</button><button className="surface-button" disabled={locked} onClick={() => { if (!dirty || window.confirm('Discard your unsaved Compose edits and reload from disk?')) reload(); }}>Reload from disk</button></div><p className="sm-footnote">Saving validates the configuration and creates a backup. Deploy applies the saved file.</p></div>}
      {tab === 'logs' && <div className="sm-logs"><div className="sm-editor-toolbar"><span>Latest 100 lines per service</span><label><input type="checkbox" checked={follow} onChange={event => setFollow(event.target.checked)} /> Refresh every 4s</label></div>{logsError && <p className="sm-error" role="alert">{logsError}</p>}<pre tabIndex="0" aria-label="Stack logs">{!canManage ? 'Stack logs are unavailable here. Open Docker for individual container logs.' : logs === null ? 'Loading logs…' : logs || 'No logs reported yet.'}</pre></div>}
    </div>
    {job && <div className="sm-operation" aria-label="Operation output"><div className="sm-editor-toolbar"><strong>{actionLabels[job.action]} · {job.status}</strong><span>{new Date(job.startedAt).toLocaleTimeString()}</span></div><pre tabIndex="0" aria-label="Operation output log">{job.output || (runningJob ? 'Waiting for Docker Compose…' : 'Operation completed without output.')}</pre><p role="status" className="sm-footnote">{runningJob ? 'Operation in progress. You can switch tabs; it will keep running.' : job.status === 'failed' ? 'Operation failed. Review the output above before retrying.' : job.status === 'unknown' ? 'Connection lost. Refresh the stack to check its current state.' : 'Operation completed.'}</p></div>}
  </section>;
}

function NewStack({ onCreated, onCancel, onDirtyChange }) {
  const [name, setName] = useState('');
  const [content, setContent] = useState(starter);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { onDirtyChange(Boolean(name) || content !== starter); return () => onDirtyChange(false); }, [name, content, onDirtyChange]);
  async function create(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await api('/stacks', { method: 'POST', body: JSON.stringify({ name, content }) }); onDirtyChange(false); onCreated(result.name); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <form className="sm-panel sm-new" onSubmit={create}><p className="eyebrow">NEW COMPOSE PROJECT</p><h2>Give your next service a home.</h2><p>Save a stack, review it, then deploy when you’re ready.</p><label htmlFor="sm-name">Stack name</label><input id="sm-name" autoFocus required pattern="[a-z0-9][a-z0-9_-]{0,62}" maxLength="63" placeholder="my-stack" value={name} disabled={busy} onChange={event => setName(event.target.value)} /><label htmlFor="sm-new-compose">Compose configuration</label><textarea id="sm-new-compose" spellCheck="false" required value={content} disabled={busy} onChange={event => setContent(event.target.value)} />{error && <div className="sm-error" role="alert">{error}</div>}<div className="sm-editor-actions"><button className="surface-button sm-primary" disabled={busy}>{busy ? 'Validating…' : 'Create stack'}</button><button type="button" className="surface-button" disabled={busy} onClick={onCancel}>Cancel</button></div></form>;
}

export default function StackManager({ onNavigate, onDirtyChange, embedded = false, initialStack = null, initialCreating = false, initialTab = 'services' }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(initialStack);
  const [creating, setCreating] = useState(initialCreating);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const dirtyRef = useRef(false);
  const setDirty = useCallback(value => { dirtyRef.current = value; onDirtyChange(value); }, [onDirtyChange]);
  const refresh = useCallback(async () => {
    try { const result = await api('/stacks'); setData(result); setError(''); }
    catch (err) { setError(err.message); }
  }, []);
  useEffect(() => { let active = true; let pending = false; const load = async () => {
    if (pending) return; pending = true;
    try { const result = await api('/stacks'); if (active) { setData(result); setError(''); } }
    catch (err) { if (active) setError(err.message); } finally { pending = false; }
  }; load(); const timer = setInterval(load, 10000); return () => { active = false; clearInterval(timer); }; }, []);
  useEffect(() => {
    const warn = event => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  function select(name, create = false) {
    if (dirtyRef.current && !window.confirm('Discard unsaved Compose edits?')) return;
    setDirty(false); setCreating(create); setSelected(name);
  }
  const stacks = data?.stacks || [];
  const visible = stacks.filter(stack => stack.name.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || (filter === 'attention' ? ['partial', 'attention'].includes(stack.status) : stack.status === filter)));
  const activeName = selected || stacks.find(stack => stack.manageable)?.name || stacks[0]?.name;
  return <div className={`${embedded ? 'dm-stacks' : 'page-content'} sm-page`}>{!embedded && <div className="sm-intro"><div><p className="eyebrow">2EZ / STACK MANAGER</p><h1>Your stacks, under control.</h1><p>Compose files, container controls and logs, together.</p></div><button className="surface-button sm-primary" disabled={!data?.composeVersion} onClick={() => select(null, true)}>+ New stack</button></div>}
    <div className="sm-summary"><span><i className={`sm-dot ${data && !error ? 'sm-dot-live' : ''}`} />{error ? 'Connection issue' : data ? `${stacks.length} stacks · ${stacks.filter(stack => stack.status === 'running').length} running` : 'Connecting to Docker…'}</span><span className="sm-path">{data?.root || '/opt/stacks'}{data?.composeVersion ? ` · Compose ${data.composeVersion}` : ''}</span><button className="sm-text-button" onClick={refresh}>Refresh ↻</button></div>
    {error && <div className="sm-error" role="alert">{error} <button className="sm-text-button" onClick={refresh}>Retry</button></div>}
    {data && !data.composeVersion && <div className="sm-error" role="alert">Docker Compose is unavailable. Check the dashboard’s Docker CLI installation to enable stack actions.</div>}
    {!data && !error ? <div className="sm-panel sm-loading">Discovering Compose projects…</div> : data && <div className="sm-layout"><aside className="sm-panel sm-stack-list" aria-label="Compose stacks"><div className="sm-list-tools"><label htmlFor="sm-search">STACKS</label><input id="sm-search" type="search" placeholder="Find a stack…" value={query} onChange={event => setQuery(event.target.value)} /><select aria-label="Filter stack status" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All stacks</option><option value="running">Running</option><option value="stopped">Stopped</option><option value="attention">Needs attention</option><option value="undeployed">Not deployed</option></select></div><select className="sm-mobile-picker" aria-label="Choose stack" value={creating ? '' : activeName || ''} onChange={event => select(event.target.value)}><option value="" disabled>Select a stack</option>{visible.map(stack => <option key={stack.name} value={stack.name}>{stack.name} · {statusLabel(stack.status)}</option>)}</select><div className="sm-stack-scroll">{visible.map(stack => <button className={`sm-stack-row ${!creating && activeName === stack.name ? 'is-selected' : ''}`} key={stack.name} aria-pressed={!creating && activeName === stack.name} onClick={() => select(stack.name)}><span className="sm-stack-name">{stack.name}</span><span><i className={`sm-dot ${stack.status === 'running' ? 'sm-dot-live' : stack.status === 'attention' || stack.status === 'partial' ? 'sm-dot-warn' : ''}`} />{stack.job ? 'Working…' : statusLabel(stack.status)}<small>{stack.running}/{stack.total}</small></span>{!stack.manageable && <small>View only</small>}</button>)}{!visible.length && <p className="sm-loading">{stacks.length ? 'No stacks match this filter.' : 'No stacks found. Create your first Compose project.'}</p>}</div></aside>
      {creating ? <NewStack onCreated={name => { setCreating(false); setSelected(name); refresh(); }} onCancel={() => select(activeName)} onDirtyChange={setDirty} /> : activeName ? <StackWorkspace key={activeName} name={activeName} snapshot={stacks.find(stack => stack.name === activeName)} onRefresh={refresh} onDirtyChange={setDirty} onNavigate={onNavigate} initialTab={initialTab} composeAvailable={Boolean(data.composeVersion) && !error} /> : <section className="sm-panel sm-loading">Create a stack to get started.</section>}
    </div>}
  </div>;
}
