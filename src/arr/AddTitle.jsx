import { useEffect, useRef, useState } from 'react';
import Modal from '../qbittorrent/Modal';
import { arrRequest, serviceName } from './api';

export default function AddTitle({ service, onClose, onAdded }) {
  const tv = service === 'sonarr';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState(null);
  const [settings, setSettings] = useState(null);
  const [profile, setProfile] = useState('');
  const [folder, setFolder] = useState('');
  const [monitor, setMonitor] = useState(tv ? 'all' : 'movieOnly');
  const [seriesType, setSeriesType] = useState('standard');
  const [availability, setAvailability] = useState('released');
  const [searchOnAdd, setSearchOnAdd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lookup = useRef(null);
  const lifetime = useRef(null);
  const actionLock = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    arrRequest(service, 'options', { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) { setSettings(data); setProfile(String(data.profiles[0]?.id || '')); setFolder(String(data.folders.find(item => item.accessible !== false)?.id || '')); }
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => { controller.abort(); lookup.current?.abort(); };
  }, [service]);
  async function search(event) {
    event.preventDefault(); lookup.current?.abort();
    const controller = new AbortController(); lookup.current = controller;
    setLoading(true); setError(''); setSelected(null); setResults(null);
    try { const data = await arrRequest(service, `lookup?term=${encodeURIComponent(query.trim())}`, { signal: controller.signal }); if (!controller.signal.aborted) setResults(data); }
    catch (err) { if (!controller.signal.aborted) setError(err.message); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  async function add(event) {
    event.preventDefault();
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError('');
    try {
      const item = await arrRequest(service, 'add', { method: 'POST', signal: lifetime.current.signal, data: { externalId: selected[tv ? 'tvdbId' : 'tmdbId'], qualityProfileId: Number(profile), rootFolderId: Number(folder), monitor, searchOnAdd, ...(tv ? { seriesType } : { minimumAvailability: availability }) } });
      onAdded(item);
    } catch (err) { if (!lifetime.current.signal.aborted) setError(`${err.message} Check the library before retrying if the connection was interrupted.`); }
    finally { actionLock.current = false; if (!lifetime.current.signal.aborted) setBusy(false); }
  }
  return <Modal title={`Add to ${serviceName(service)}`} busy={busy} onClose={onClose}>
    {error && <p className="qb-error" role="alert">{error}</p>}
    {!selected ? <>
      <p>Find a {tv ? 'series' : 'movie'} to add to your library.</p>
      <form className="arr-lookup-form" onSubmit={search}><label>Title<input type="search" required minLength={2} maxLength={200} value={query} onChange={event => setQuery(event.target.value)} placeholder={tv ? 'Search TV shows…' : 'Search movies…'} /></label><button className="qb-button qb-primary" disabled={loading || query.trim().length < 2}>{loading ? 'Searching…' : 'Find titles'}</button></form>
      {loading && <p className="arr-empty" role="status">Looking up titles…</p>}
      {results && !results.length && <p className="arr-empty">No titles found. Try a different name or release year.</p>}
      <div className="arr-lookup-results">{results?.map(item => <button key={item[tv ? 'tvdbId' : 'tmdbId']} className="arr-lookup-result" disabled={Boolean(item.existingId)} onClick={() => { setSelected(item); setSeriesType(item.seriesType || 'standard'); setError(''); }}><strong>{item.title}</strong><span className="arr-meta">{item.year || 'Year unknown'} · {item.existingId ? 'Already in your library' : item.genres?.slice(0, 2).join(' / ') || 'Select title'}</span><p>{item.overview || 'No synopsis available.'}</p></button>)}</div>
    </> : <form onSubmit={add}>
      <button type="button" className="qb-text-button" disabled={busy} onClick={() => setSelected(null)}>← Back to results</button>
      <h3 className="arr-add-title">{selected.title} <span>{selected.year}</span></h3><p className="arr-synopsis">{selected.overview || 'No synopsis available.'}</p>
      {!settings ? <p className="arr-empty">Loading library settings… Close and reopen if the connection fails.</p> : <>
        {(!settings.profiles.length || !settings.folders.some(item => item.accessible !== false)) && <p className="qb-error" role="alert">Configure an accessible root folder and a quality profile in {serviceName(service)}, then reopen this dialog.</p>}
        <fieldset disabled={busy}><label>Quality profile<select aria-label="Quality profile" required value={profile} onChange={event => setProfile(event.target.value)}>{settings.profiles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Root folder<select aria-label="Root folder" required value={folder} onChange={event => setFolder(event.target.value)}>{settings.folders.filter(item => item.accessible !== false).map(item => <option key={item.id} value={item.id}>{item.path}</option>)}</select></label>
          <label>Monitor<select aria-label="Monitor" value={monitor} onChange={event => setMonitor(event.target.value)}>{(tv ? [['all', 'All episodes'], ['future', 'Future episodes'], ['missing', 'Missing episodes'], ['none', 'Unmonitored']] : [['movieOnly', 'This movie'], ['none', 'Unmonitored']]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {tv ? <label>Series type<select aria-label="Series type" value={seriesType} onChange={event => setSeriesType(event.target.value)}><option value="standard">Standard</option><option value="daily">Daily</option><option value="anime">Anime</option></select></label> : <label>Minimum availability<select aria-label="Minimum availability" value={availability} onChange={event => setAvailability(event.target.value)}><option value="announced">Announced</option><option value="inCinemas">In cinemas</option><option value="released">Released</option></select></label>}
          <label className="arr-check"><input type="checkbox" checked={searchOnAdd} disabled={monitor === 'none'} onChange={event => setSearchOnAdd(event.target.checked)} />Search for {tv ? 'missing episodes' : 'this movie'} after adding</label>
          <p className="arr-meta">{searchOnAdd && monitor !== 'none' ? 'Searches may start downloads using the selected profile.' : 'Adds the title without starting an immediate search.'}</p>
        </fieldset>
        <div className="arr-dialog-actions"><button type="button" className="qb-button" disabled={busy} onClick={onClose}>Cancel</button><button className="qb-button qb-primary" disabled={busy || !profile || !folder}>{busy ? 'Adding…' : `Add ${tv ? 'series' : 'movie'}`}</button></div>
      </>}
    </form>}
  </Modal>;
}
