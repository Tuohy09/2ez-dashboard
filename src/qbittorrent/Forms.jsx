import { useEffect, useState } from 'react';
import Modal from './Modal';
import { qbtRequest, modern } from './api';

export function AddTorrent({ categories, version, onClose, onDone }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError('');
    const form = new FormData(event.currentTarget);
    const files = form.getAll('torrents').filter(file => file.size > 0);
    if (!form.get('urls').trim() && !files.length) { setError('Paste a magnet/download link or choose a .torrent file.'); return; }
    form.delete('torrents'); files.forEach(file => form.append('torrents', file));
    form.set(modern(version) ? 'stopped' : 'paused', String(form.get('start') !== 'on')); form.delete('start');
    form.set('sequentialDownload', String(form.get('sequentialDownload') === 'on'));
    setBusy(true);
    try { await qbtRequest('torrents/add', { method: 'POST', data: form }); onDone('Torrent submitted. Metadata may take a moment to appear.'); onClose(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <Modal title="Add torrents" onClose={onClose} busy={busy}><form onSubmit={submit}><fieldset disabled={busy}>
    <label>Magnet links or torrent URLs<textarea name="urls" placeholder="One link per line" rows="4" /></label>
    <label>Torrent files<input name="torrents" type="file" multiple accept=".torrent,application/x-bittorrent" /></label>
    <label>Save location<input name="savepath" placeholder="Use qBittorrent’s default location" /></label>
    <div className="qb-form-grid"><label>Category<select name="category"><option value="">Uncategorised</option>{Object.keys(categories).map(name => <option key={name}>{name}</option>)}</select></label><label>Tags<input name="tags" placeholder="Comma-separated tags" /></label></div>
    <label className="qb-check"><input type="checkbox" name="start" defaultChecked />Start immediately</label>
    <label className="qb-check"><input type="checkbox" name="sequentialDownload" />Download sequentially</label>
    {error && <p className="qb-error" role="alert">{error}</p>}<footer><button type="button" className="qb-button" onClick={onClose}>Cancel</button><button className="qb-button qb-primary">{busy ? 'Adding…' : 'Add torrents'}</button></footer>
  </fieldset></form></Modal>;
}

export function ActionForm({ operation, onClose, onSubmit, busy, error, categories }) {
  const { kind, torrents } = operation;
  const one = torrents[0];
  const titles = { delete: 'Remove torrents', rename: 'Rename torrent', location: 'Change save location', category: 'Set category', addTags: 'Add tags', removeTags: 'Remove tags', limits: 'Torrent limits', addTrackers: 'Add trackers', editTracker: 'Edit tracker', removeTracker: 'Remove tracker', renameFile: 'Rename file', addPeers: 'Add peers' };
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data = Object.fromEntries(form);
    if (kind === 'delete') data.deleteFiles = form.get('deleteFiles') === 'on';
    if (kind === 'limits') { data.downloadLimit = Math.round(Number(data.downloadLimit) * 1024); data.uploadLimit = Math.round(Number(data.uploadLimit) * 1024); }
    onSubmit(data);
  }
  return <Modal title={titles[kind]} onClose={onClose} busy={busy}><form onSubmit={submit}><fieldset disabled={busy}>
    <p className="qb-modal-description">{torrents.length === 1 ? one.name : `${torrents.length} selected torrents`}</p>
    {torrents.length > 1 && <ul className="qb-targets">{torrents.map(torrent => <li key={torrent.hash}>{torrent.name}</li>)}</ul>}
    {kind === 'delete' && <><p>Remove these torrents from qBittorrent. Downloaded files are kept unless you select the option below.</p><label className="qb-check qb-danger"><input type="checkbox" name="deleteFiles" />Also permanently delete downloaded files</label></>}
    {kind === 'rename' && <label>Torrent name<input name="name" defaultValue={one.name} required /></label>}
    {kind === 'location' && <><label>Save location<input name="location" defaultValue={torrents.length === 1 ? one.save_path : ''} required /></label><p className="qb-form-note">qBittorrent will move the downloaded files to this location.</p></>}
    {kind === 'category' && <label>Category<select name="category" defaultValue={one.category}><option value="">Uncategorised</option>{Object.keys(categories).map(name => <option key={name}>{name}</option>)}</select></label>}
    {['addTags', 'removeTags'].includes(kind) && <label>Tags<input name="tags" placeholder="Comma-separated tags" required /></label>}
    {kind === 'limits' && <><div className="qb-form-grid"><label>Download limit (KiB/s)<input name="downloadLimit" type="number" min="0" defaultValue={torrents.length === 1 ? Math.max(0, one.dl_limit || 0) / 1024 : 0} required step="any" /></label><label>Upload limit (KiB/s)<input name="uploadLimit" type="number" min="0" defaultValue={torrents.length === 1 ? Math.max(0, one.up_limit || 0) / 1024 : 0} required step="any" /></label></div><p className="qb-form-note">0 means unlimited. Values apply to every selected torrent.</p><label>Share ratio limit<input name="ratioLimit" type="number" min="-2" step="any" defaultValue={one.ratio_limit ?? -2} required /></label><div className="qb-form-grid"><label>Seeding limit (minutes)<input name="seedingTimeLimit" type="number" min="-2" defaultValue={one.seeding_time_limit ?? -2} required /></label><label>Inactive seeding (minutes)<input name="inactiveSeedingTimeLimit" type="number" min="-2" defaultValue={one.inactive_seeding_time_limit ?? -2} required /></label></div><p className="qb-form-note">Share limits: -2 uses global settings; -1 means unlimited.</p></>}
    {kind === 'addTrackers' && <label>Tracker URLs<textarea name="urls" rows="5" placeholder="One tracker URL per line" required /></label>}
    {kind === 'editTracker' && <label>Tracker URL<input name="newUrl" defaultValue={operation.url} required /></label>}
    {kind === 'removeTracker' && <p className="qb-wrap">Remove {operation.url} from this torrent?</p>}
    {kind === 'renameFile' && <label>New file path<input name="newPath" defaultValue={operation.path} required /></label>}
    {kind === 'addPeers' && <label>Peers<input name="peers" placeholder="192.0.2.1:6881|198.51.100.1:6881" required /><span className="qb-form-note">Use IP:port, separated by | for multiple peers.</span></label>}
    {error && <p className="qb-error" role="alert">{error}</p>}<footer><button type="button" className="qb-button" onClick={onClose}>Cancel</button><button className={`qb-button ${kind === 'delete' || kind === 'removeTracker' ? 'qb-danger' : 'qb-primary'}`}>{busy ? 'Applying…' : kind === 'delete' || kind === 'removeTracker' ? 'Remove' : 'Apply'}</button></footer>
  </fieldset></form></Modal>;
}

const groups = {
  Downloads: [['save_path', 'Default save location', 'text'], ['temp_path_enabled', 'Use an incomplete-download directory', 'checkbox'], ['temp_path', 'Incomplete-download directory', 'text'], ['preallocate_all', 'Preallocate disk space', 'checkbox'], ['auto_tmm_enabled', 'Automatic torrent management by default', 'checkbox']],
  Connection: [['listen_port', 'Incoming port', 'number', 1, 65535], ['upnp', 'Use UPnP / NAT-PMP', 'checkbox'], ['max_connec', 'Global connection limit', 'number', -1], ['max_connec_per_torrent', 'Connections per torrent', 'number', -1], ['dht', 'Enable DHT', 'checkbox'], ['pex', 'Enable peer exchange', 'checkbox'], ['lsd', 'Enable local peer discovery', 'checkbox']],
  Queue: [['queueing_enabled', 'Enable torrent queueing', 'checkbox'], ['max_active_downloads', 'Active downloads', 'number', -1], ['max_active_uploads', 'Active uploads', 'number', -1], ['max_active_torrents', 'Active torrents', 'number', -1], ['dont_count_slow_torrents', 'Exclude slow torrents from limits', 'checkbox'], ['max_ratio_enabled', 'Limit share ratio', 'checkbox'], ['max_ratio', 'Share ratio', 'number', 0], ['max_seeding_time_enabled', 'Limit seeding time', 'checkbox'], ['max_seeding_time', 'Seeding time (minutes)', 'number', 0]],
};
export function Preferences({ speedOnly, onClose, onDone }) {
  const [prefs, setPrefs] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState('Downloads');
  const [dirty, setDirty] = useState(false);
  useEffect(() => { let active = true; qbtRequest('app/preferences').then(data => { if (active) setPrefs(data); }).catch(err => { if (active) setError(err.message); }); return () => { active = false; }; }, []);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    const values = new FormData(event.currentTarget); const changed = {};
    const fields = speedOnly ? [['dl_limit', 'Download limit', 'number'], ['up_limit', 'Upload limit', 'number'], ['alt_dl_limit', 'Alternative download limit', 'number'], ['alt_up_limit', 'Alternative upload limit', 'number']] : groups[section];
    for (const [key, , type] of fields) {
      if (!(key in prefs)) continue;
      const value = type === 'checkbox' ? values.get(key) === 'on' : type === 'number' ? Number(values.get(key)) * (speedOnly ? 1024 : 1) : values.get(key);
      if (value !== prefs[key]) changed[key] = value;
    }
    try { if (Object.keys(changed).length) await qbtRequest('app/setPreferences', { method: 'POST', data: { json: JSON.stringify(changed) } }); onDone('qBittorrent settings saved.'); onClose(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <Modal title={speedOnly ? 'Speed limits' : 'qBittorrent settings'} onClose={onClose} busy={busy}>
    {!speedOnly && <div className="qb-tabs">{Object.keys(groups).map(name => <button className={name === section ? 'active' : ''} key={name} onClick={() => { if (!dirty || window.confirm("Discard unsaved settings in this section?")) { setSection(name); setDirty(false); } }} disabled={busy}>{name}</button>)}</div>}
    {error && <p className="qb-error" role="alert">{error}</p>}{!prefs ? <p>{error ? 'Close and reopen settings to retry.' : 'Loading settings…'}</p> : <form key={section} onSubmit={submit} onChange={() => setDirty(true)}><fieldset disabled={busy}>
      {speedOnly ? <><p className="qb-form-note">Limits in KiB/s. 0 means unlimited. Enable alternative limits from the transfer toolbar.</p>{[['dl_limit', 'Download'], ['up_limit', 'Upload'], ['alt_dl_limit', 'Alternative download'], ['alt_up_limit', 'Alternative upload']].map(([key, label]) => <label key={key}>{label}<input name={key} type="number" min="0" step="any" defaultValue={prefs[key] / 1024} required /></label>)}</> : groups[section].filter(([key]) => key in prefs).map(([key, label, type, min, max]) => type === 'checkbox' ? <label className="qb-check" key={key}><input type="checkbox" name={key} defaultChecked={prefs[key]} />{label}</label> : <label key={key}>{label}<input name={key} type={type} min={min} max={max} step={key === 'max_ratio' ? 'any' : undefined} defaultValue={prefs[key]} required={type === 'number'} /></label>)}
      <footer><button type="button" className="qb-button" onClick={onClose}>Cancel</button><button className="qb-button qb-primary">{busy ? 'Saving…' : 'Save settings'}</button></footer>
    </fieldset></form>}
  </Modal>;
}

export function Organisation({ categories, tags, onClose, onDone }) {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event, kind) {
    event.preventDefault(); setBusy(true); setError(''); const data = Object.fromEntries(new FormData(event.currentTarget));
    try { await qbtRequest(`torrents/${kind}`, { method: 'POST', data }); onDone('Categories and tags updated.'); onClose(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <Modal title="Categories and tags" onClose={onClose} busy={busy}><p className="qb-form-note">Categories can assign a save location. Tags let you group torrents independently.</p>
    <form onSubmit={event => submit(event, 'createCategory')}><fieldset disabled={busy}><label>New category<input name="category" required /></label><label>Save location<input name="savePath" placeholder="Default location" /></label><button className="qb-button">Create category</button></fieldset></form>
    {Object.keys(categories).length > 0 && <form onSubmit={event => submit(event, 'editCategory')}><fieldset disabled={busy}><label>Edit category<select name="category">{Object.keys(categories).map(name => <option key={name}>{name}</option>)}</select></label><label>New save location<input name="savePath" placeholder="Default location" /></label><button className="qb-button">Update category</button></fieldset></form>}
    {Object.keys(categories).length > 0 && <form onSubmit={event => submit(event, 'removeCategories')}><fieldset disabled={busy}><label>Remove category<select name="categories">{Object.keys(categories).map(name => <option key={name}>{name}</option>)}</select></label><p className="qb-form-note">Removes the category assignment; torrents and downloaded files are kept.</p><button className="qb-button qb-danger">Remove category</button></fieldset></form>}
    <form onSubmit={event => submit(event, 'createTags')}><fieldset disabled={busy}><label>New tags<input name="tags" placeholder="Comma-separated tags" required /></label><button className="qb-button">Create tags</button></fieldset></form>
    {tags.length > 0 && <form onSubmit={event => submit(event, 'deleteTags')}><fieldset disabled={busy}><label>Remove tag<select name="tags">{tags.map(tag => <option key={tag}>{tag}</option>)}</select></label><button className="qb-button qb-danger">Remove tag from all torrents</button></fieldset></form>}
    {error && <p className="qb-error" role="alert">{error}</p>}
  </Modal>;
}
