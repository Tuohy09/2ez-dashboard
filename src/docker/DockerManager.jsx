import { useCallback, useEffect, useRef, useState } from 'react';
import StackManager from '../StackManager';
import Modal from '../qbittorrent/Modal';
import { bytes } from '../qbittorrent/api';
import ContainerInspector from './ContainerInspector';
import ImageInspector from './ImageInspector';
import { imageName, request, splitTag } from './api';
import '../qbittorrent/qbittorrent.css';
import './docker.css';

export default function DockerManager({ onDirtyChange }) {
  const [tab, setTab] = useState('containers');
  const [data, setData] = useState({ containers: null, images: null, stacks: null, jobs: [] });
  const [errors, setErrors] = useState({});
  const [selectedContainer, setSelectedContainer] = useState(undefined);
  const [selectedImage, setSelectedImage] = useState(undefined);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'name', direction: 1 });
  const [page, setPage] = useState(0);
  const [checked, setChecked] = useState([]);
  const [operation, setOperation] = useState(null);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [stackTarget, setStackTarget] = useState({ key: 0 });
  const [dismissedJob, setDismissedJob] = useState(null);
  const refresh = useRef(null), dirty = useRef(false);
  const reportDirty = useCallback(value => { dirty.current = value; onDirtyChange(value); }, [onDirtyChange]);
  useEffect(() => {
    const controller = new AbortController(); let pending = false;
    async function poll() {
      if (pending) return; pending = true;
      const endpoints = [['containers', '/sys-api/docker/containers'], ['images', '/docker-api/images'], ['stacks', '/stack-api/stacks'], ['jobs', '/docker-api/jobs']];
      const results = await Promise.allSettled(endpoints.map(async ([key, path]) => { const result = await request(path, { signal: controller.signal }); if (key === 'stacks' ? !Array.isArray(result.stacks) : !Array.isArray(result)) throw new Error('Docker returned an invalid inventory.'); return result; }));
      if (!controller.signal.aborted) {
        results.forEach((result, i) => { const key = endpoints[i][0]; if (result.status === 'fulfilled') { setData(previous => ({ ...previous, [key]: result.value })); setErrors(previous => ({ ...previous, [key]: '' })); if (key === 'containers') setSelectedContainer(previous => previous === undefined ? result.value[0]?.id || null : previous); if (key === 'images') setSelectedImage(previous => previous === undefined ? result.value[0]?.id || null : previous); } else setErrors(previous => ({ ...previous, [key]: result.reason.message })); });
      }
      pending = false;
    }
    refresh.current = poll; poll(); const timer = setInterval(poll, 4000);
    return () => { controller.abort(); clearInterval(timer); refresh.current = null; };
  }, []);
  const containers = data.containers || [], images = data.images || [], stacks = data.stacks?.stacks || [];
  const imageTab = tab === 'images', items = imageTab ? images : containers;
  const current = imageTab ? images.find(item => item.id === selectedImage) : containers.find(item => item.id === selectedContainer);
  const disabled = busy || Boolean(errors[tab]) || !data[tab];
  const unused = images.filter(image => !image.containers.length);
  const latestJob = data.jobs[0];
  function leaveStack() { if (dirty.current && !window.confirm('Discard unsaved Compose edits?')) return false; reportDirty(false); setStackTarget(previous => previous.create ? { ...previous, create: false } : previous); return true; }
  function chooseTab(next) { if (next === tab) return; if (!leaveStack()) return; setTab(next); setQuery(''); setFilter('all'); setPage(0); setChecked([]); setSort({ key: 'name', direction: 1 }); }
  function openStack(name = null, initialTab = 'services', create = false) { if (!leaveStack()) return; setStackTarget(previous => ({ key: previous.key + 1, name, initialTab, create })); setTab('stacks'); setQuery(''); }
  function openImage(id) { if (!leaveStack()) return; setTab('images'); setSelectedImage(id); setQuery(''); setFilter('all'); setPage(0); setChecked([]); setSort({ key: 'name', direction: 1 }); }
  function openContainer(id) { if (!leaveStack()) return; setTab('containers'); setSelectedContainer(id); setQuery(''); setFilter('all'); setPage(0); setChecked([]); setSort({ key: 'name', direction: 1 }); }
  function ask(kind, targets = []) { setActionError(''); setOperation({ kind, targets }); }
  function pull(reference = '') { setReference(reference); ask('pull'); }
  function updateFilter(setter, value) { setter(value); setPage(0); setChecked([]); }
  function sortBy(key) { setSort(previous => ({ key, direction: previous.key === key ? -previous.direction : 1 })); setPage(0); }
  const matches = items.filter(item => {
    const text = imageTab ? [...item.tags, item.id, ...item.digests].join(' ') : [item.name, item.image, item.stack].join(' ');
    return text.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || (imageTab ? filter === 'unused' ? !item.containers.length : item.containers.length > 0 : filter === 'stopped' ? !['running', 'paused'].includes(item.state) : item.state === filter));
  }).sort((a, b) => {
    const value = item => sort.key === 'name' ? imageTab ? imageName(item) : item.name : sort.key === 'refs' ? item.containers.length : item[sort.key] ?? 0;
    const av = value(a), bv = value(b); return (typeof av === 'string' ? av.localeCompare(String(bv)) : av - bv) * sort.direction;
  });
  const pages = Math.max(1, Math.ceil(matches.length / 25)), actualPage = Math.min(page, pages - 1);
  const rows = matches.slice(actualPage * 25, actualPage * 25 + 25), selectable = rows.filter(item => imageTab && !item.containers.length);
  const selectedImages = images.filter(item => checked.includes(item.id));
  async function apply() {
    setBusy(true); setActionError(''); setNotice('');
    try {
      if (operation.kind === 'pull') {
        const job = await request('/docker-api/images/pull', { method: 'POST', data: { reference: reference.trim() } });
        setData(previous => ({ ...previous, jobs: [job, ...previous.jobs.filter(item => item.id !== job.id)] })); setDismissedJob(null); setNotice('Image pull started. Containers keep their current image until recreated.');
      } else if (operation.kind === 'images') {
        const completed = [];
        for (const item of operation.targets) {
          try { await request(`/docker-api/images/${encodeURIComponent(item.id)}`, { method: 'DELETE' }); completed.push(item.id); }
          catch (error) { setOperation(previous => ({ ...previous, targets: previous.targets.filter(target => !completed.includes(target.id)) })); setChecked(previous => previous.filter(id => !completed.includes(id))); throw new Error(`${completed.length} images removed. ${imageName(item)}: ${error.message}`); }
        }
        setChecked([]); setNotice(`${completed.length} images removed. No volumes were changed.`);
      } else {
        const target = operation.targets[0];
        await request(`/docker-api/containers/${target.id}/${operation.kind}`, { method: 'POST' }); setNotice(`${target.name}: ${operation.kind} completed.`);
        if (operation.kind === 'remove') setSelectedContainer(null);
      }
      setOperation(null);
    } catch (error) { setActionError(error.message); }
    finally { setBusy(false); refresh.current?.(); }
  }
  const actionTitle = operation?.kind === 'pull' ? 'Pull an image' : operation?.kind === 'images' ? 'Remove selected images?' : operation ? `${operation.kind[0].toUpperCase() + operation.kind.slice(1)} ${operation.targets[0].name}?` : '';
  return <div className="page-content qb-page dm-page">
    <div className="qb-intro"><div><p className="eyebrow">2EZ / DOCKER</p><h1>Every container. Every image.</h1><p>A clear inventory, with the details always within reach.</p></div><div className="qb-top-actions"><button className="qb-button" disabled={busy || Boolean(errors.images)} onClick={() => pull()}>↓ Pull image</button><button className="qb-button qb-primary" disabled={!data.stacks?.composeVersion} onClick={() => openStack(null, 'services', true)}>+ New stack</button></div></div>
    <div className="dm-summary"><span><strong className="dm-live">{data.containers ? containers.filter(c => c.state === 'running').length : '—'}</strong> running <small>/ {data.containers ? containers.length : '—'} containers</small></span><span><strong>{data.stacks ? stacks.length : '—'}</strong> stacks</span><span><strong className="dm-blue">{data.images ? images.length : '—'}</strong> images</span><button className="dm-unused" disabled={!data.images || Boolean(errors.images)} onClick={() => { if (!leaveStack()) return; setTab('images'); setFilter('unused'); setQuery(''); setPage(0); setChecked([]); }}><strong>{data.images ? unused.length : '—'}</strong> unused images</button><span className="dm-connection">{Object.values(errors).some(Boolean) ? 'Connection issue · data may be stale' : data.containers ? '● Docker connected' : 'Connecting…'}</span></div>
    <nav className="dm-resource-tabs" aria-label="Docker resources">{['containers', 'stacks', 'images'].map(value => <button key={value} aria-pressed={tab === value} onClick={() => chooseTab(value)}>{value[0].toUpperCase() + value.slice(1)}<small>{value === 'containers' ? containers.length : value === 'images' ? images.length : stacks.length}</small></button>)}</nav>
    {Object.entries(errors).filter(([, value]) => value).map(([key, value]) => <div className="qb-error" role="alert" key={key}>{key}: {value} <button className="qb-text-button" onClick={() => refresh.current?.()}>Retry</button></div>)}
    {notice && <div className="qb-notice" role="status">{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></div>}
    {latestJob && latestJob.id !== dismissedJob && <details className="dm-job" open={latestJob.status === 'running' || latestJob.status === 'failed'}><summary>Image pull · {latestJob.reference} · {latestJob.status}</summary><pre className="dm-log" tabIndex="0">{latestJob.output || 'Waiting for Docker…'}</pre>{latestJob.status !== 'running' && <button className="qb-text-button" onClick={() => setDismissedJob(latestJob.id)}>Dismiss output</button>}</details>}
    {tab === 'stacks' ? <StackManager key={stackTarget.key} embedded initialStack={stackTarget.name} initialCreating={stackTarget.create} initialTab={stackTarget.initialTab} onDirtyChange={reportDirty} onNavigate={() => chooseTab('containers')} /> : <div className="dm-fleet"><section className="dm-panel dm-inventory" aria-label={imageTab ? 'Image inventory' : 'Container inventory'}>
      <div className="dm-toolbar"><input type="search" aria-label={imageTab ? 'Search images' : 'Search containers'} placeholder={imageTab ? 'Search images, tags or IDs…' : 'Search containers, stacks or images…'} value={query} onChange={event => updateFilter(setQuery, event.target.value)} /><select aria-label="Filter inventory" value={filter} onChange={event => updateFilter(setFilter, event.target.value)}>{(imageTab ? [['all', 'All images'], ['used', 'In use'], ['unused', 'Unused']] : [['all', 'All states'], ['running', 'Running'], ['stopped', 'Stopped'], ['paused', 'Paused']]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="qb-text-button" onClick={() => refresh.current?.()}>Refresh ↻</button></div>
      {imageTab && <div className="dm-image-tools"><span>{selectedImages.length} selected</span><button className="qb-button" onClick={() => updateFilter(setFilter, 'unused')}>Review unused</button><button className="qb-button qb-danger" disabled={disabled || !selectedImages.length || selectedImages.some(image => image.containers.length)} onClick={() => ask('images', selectedImages)}>Remove selected</button></div>}
      <div className="dm-table-scroll"><table className={`dm-table ${imageTab ? 'dm-image-table' : ''}`}><thead><tr>{imageTab && <th className="dm-check"><input type="checkbox" aria-label="Select unused images on this page" checked={selectable.length > 0 && selectable.every(item => checked.includes(item.id))} disabled={disabled || !selectable.length} onChange={event => setChecked(event.target.checked ? selectable.map(item => item.id) : [])} /></th>}{(imageTab ? [['name', 'Repository / tag'], ['size', 'Size'], ['refs', 'Used by']] : [['name', 'Container / stack'], ['image', 'Image'], ['state', 'State'], ['cpu_percent', 'CPU'], ['memory_usage', 'Memory']]).map(([key, title]) => <th key={key} aria-sort={sort.key === key ? sort.direction === 1 ? 'ascending' : 'descending' : 'none'}><button onClick={() => sortBy(key)}>{title}{sort.key === key ? sort.direction === 1 ? ' ↑' : ' ↓' : ''}</button></th>)}</tr></thead><tbody>{rows.map(item => imageTab ? <tr key={item.id} className={selectedImage === item.id ? 'selected' : ''}><td className="dm-check"><input type="checkbox" aria-label={`Select ${imageName(item)}`} disabled={disabled || item.containers.length > 0} checked={checked.includes(item.id)} onChange={event => setChecked(previous => event.target.checked ? [...previous, item.id] : previous.filter(id => id !== item.id))} /></td><td><button className="dm-name" onClick={() => setSelectedImage(item.id)}>{imageName(item)}</button><small>{item.tags.length > 1 ? `+${item.tags.length - 1} tags · ` : ''}{item.id.slice(0, 19)}</small></td><td className="dm-number">{bytes(item.size)}</td><td><span className={item.containers.length ? 'dm-live dm-number' : 'dm-warning dm-number'}>{item.containers.length ? `${item.containers.length} container${item.containers.length === 1 ? '' : 's'}` : 'Unused'}</span></td></tr> : <tr key={item.id} className={selectedContainer === item.id ? 'selected' : ''}><td><button className="dm-name" onClick={() => setSelectedContainer(item.id)}>{item.name}</button>{item.stack ? <button className="dm-stack-link" onClick={() => openStack(item.stack)}>{item.stack} ↗</button> : <small>Standalone</small>}</td><td><button className="dm-image-link" disabled={!images.some(image => image.id === item.image_id || image.tags.includes(item.image))} onClick={() => openImage(images.find(image => image.id === item.image_id || image.tags.includes(item.image)).id)}>{splitTag(item.image)[0]}<small>{splitTag(item.image)[1]}</small></button></td><td><span className={`dm-state ${item.state === 'running' ? 'running' : ''}`}>{item.state}</span></td><td className="dm-number">{item.state === 'running' ? `${Number(item.cpu_percent || 0).toFixed(1)}%` : '—'}</td><td className="dm-number">{item.state === 'running' ? bytes(item.memory_usage) : '—'}</td></tr>)}</tbody></table></div>
      {!data[tab] ? <p className="qb-empty">{errors[tab] ? 'Inventory unavailable. Retry the connection.' : 'Loading Docker inventory…'}</p> : !rows.length && <p className="qb-empty">{query || filter !== 'all' ? 'No items match these filters.' : imageTab ? 'No local images. Pull an image to get started.' : 'No containers found. Create a stack to get started.'}</p>}
      <div className="dm-list-foot"><span>{matches.length} {imageTab ? 'images' : 'containers'}{imageTab && ` · ${bytes(matches.reduce((sum, image) => sum + image.size, 0))} summed sizes`}</span>{pages > 1 && <div className="qb-pagination"><button disabled={actualPage === 0} onClick={() => { setPage(actualPage - 1); setChecked([]); }}>Previous</button><span>{actualPage + 1} / {pages}</span><button disabled={actualPage >= pages - 1} onClick={() => { setPage(actualPage + 1); setChecked([]); }}>Next</button></div>}<span>{imageTab ? 'Sizes include shared layers' : 'Select a container to inspect it'}</span></div>
    </section>{current ? imageTab ? <ImageInspector key={current.id} item={current} disabled={disabled} onClose={() => setSelectedImage(null)} onContainer={openContainer} onRemove={items => ask('images', items)} onPull={pull} /> : <ContainerInspector key={current.id} item={current} image={images.find(image => image.id === current.image_id || image.tags.includes(current.image))} disabled={disabled} onClose={() => setSelectedContainer(null)} onAction={(kind, item) => ask(kind, [item])} onImage={openImage} onStack={openStack} /> : <aside className="dm-panel dm-inspector-empty">Select {imageTab ? 'an image' : 'a container'} to see its details.</aside>}</div>}
    <footer className="dm-footer"><span>{data.stacks?.root || '/opt/stacks'} · Local Docker host</span><span>Compose · Containers · Images · Updates every 4s</span></footer>
    {operation && <Modal title={actionTitle} busy={busy} onClose={() => setOperation(null)}><form onSubmit={event => { event.preventDefault(); apply(); }}><p className="qb-modal-description">{operation.kind === 'pull' ? 'Pull a repository tag or digest into the local library. Existing containers keep their current image until recreated.' : operation.kind === 'images' ? 'Remove these specific images and their tags. References are checked again, including stopped containers. Shared layers still used by other images are kept.' : operation.kind === 'remove' ? 'Remove this stopped container and its writable layer. Named volumes and bind-mounted files are kept. Compose may recreate it on the next deploy.' : `This will ${operation.kind === 'unpause' ? 'resume' : operation.kind} only this container. ${['stop', 'restart', 'pause'].includes(operation.kind) ? 'Its service may be temporarily unavailable.' : ''}`}</p>{operation.kind === 'pull' ? <label>Image reference<input required maxLength="256" value={reference} onChange={event => setReference(event.target.value)} placeholder="nginx:alpine" disabled={busy} /></label> : <ul className="qb-targets">{operation.targets.map(item => <li key={item.id}>{operation.kind === 'images' ? <>{imageName(item)}<small className="dm-id">{item.id}</small></> : item.name}</li>)}</ul>}{actionError && <div className="qb-error" role="alert">{actionError}</div>}<footer><button type="button" className="qb-button" disabled={busy} onClick={() => setOperation(null)}>Cancel</button><button className={`qb-button ${['remove', 'images'].includes(operation.kind) ? 'qb-danger' : 'qb-primary'}`} disabled={busy}>{busy ? 'Applying…' : operation.kind === 'pull' ? 'Pull image' : operation.kind === 'images' ? 'Remove images' : 'Confirm'}</button></footer></form></Modal>}
  </div>;
}
