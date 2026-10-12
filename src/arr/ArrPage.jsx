import { Fragment, useEffect, useRef, useState } from 'react';
import Modal from '../qbittorrent/Modal';
import { arrRequest, availability, calendarEvents, episodeCode, formatDate, queueState, releaseState, serviceName } from './api';
import useArrSummary from './useArrSummary';
import AddTitle from './AddTitle';
import TitleDetails from './TitleDetails';
import ReleaseSearch from './ReleaseSearch';
import '../qbittorrent/qbittorrent.css';
import './arr.css';

const sections = [['library', 'Library'], ['calendar', 'Upcoming'], ['queue', 'Queue'], ['missing', 'Missing']];
function Cover({ service, item }) {
  const [failed, setFailed] = useState(false);
  return <span className="arr-cover" aria-hidden="true">{!failed && item.id ? <img src={`/arr-api/${service}/cover/${item.id}`} loading="lazy" alt="" onError={() => setFailed(true)} /> : <span>{item.title?.slice(0, 1) || '•'}</span>}</span>;
}
function Progress({ item }) {
  const percent = item.size > 0 && Number.isFinite(item.sizeleft) ? Math.max(0, Math.min(100, (1 - item.sizeleft / item.size) * 100)) : null;
  return <div className="arr-transfer"><div><span>{percent === null ? 'Progress unavailable' : `${percent.toFixed(1)}%`}</span><span>{item.timeleft ? `${item.timeleft} left` : item.status || 'Queued'}</span></div>{percent !== null && <progress max="100" value={percent} aria-label={`${item.title} download progress`} />}</div>;
}
export default function ArrPage({ service }) {
  const tv = service === 'sonarr', name = serviceName(service);
  const { summary, error: summaryError, refresh: refreshSummary } = useArrSummary(service);
  const [section, setSection] = useState('library');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('title');
  const [page, setPage] = useState(1);
  const [week, setWeek] = useState(0);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const [searching, setSearching] = useState(null);
  const [interactive, setInteractive] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const actionLock = useRef(false);
  const lifetime = useRef(null);
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, []);
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() + week * 7);
  const end = new Date(start); end.setDate(end.getDate() + 7);
  const startISO = start.toISOString(), endISO = end.toISOString();
  const requestKey = JSON.stringify([service, section, query, filter, sort, page, startISO, endISO]);
  useEffect(() => {
    const controller = new AbortController(); let pending = false;
    const poll = async () => {
      if (pending) return; pending = true;
      const endpoint = section === 'library' ? `library?${new URLSearchParams({ page, query, filter, sort })}` : section === 'calendar' ? `calendar?${new URLSearchParams({ start: startISO, end: endISO })}` : `${section}?page=${page}`;
      try {
        const data = await arrRequest(service, endpoint, { signal: controller.signal });
        if (!controller.signal.aborted) {
          if (section !== 'calendar' && page > 1 && (page - 1) * data.pageSize >= data.totalRecords) { setPage(Math.max(1, Math.ceil(data.totalRecords / data.pageSize))); }
          setSnapshot({ key: requestKey, data, updated: new Date() }); setError('');
        }
      } catch (err) { if (!controller.signal.aborted) setError(err.message); }
      finally { pending = false; }
    };
    const first = setTimeout(poll, query ? 250 : 0); const timer = setInterval(poll, 15000);
    return () => { controller.abort(); clearTimeout(first); clearInterval(timer); };
  }, [service, section, query, filter, sort, page, startISO, endISO, requestKey, revision]);
  const loaded = snapshot?.key === requestKey;
  const data = loaded ? snapshot.data : null;
  const rows = section === 'calendar' ? calendarEvents(data || [], tv, start, end) : data?.records || [];
  const disabled = busy || !loaded || Boolean(error || summaryError);
  const connectionError = error || summaryError;
  function refresh() { setRevision(value => value + 1); refreshSummary(); }
  function switchSection(value) { setSection(value); setPage(1); setSelected(null); setError(''); }
  function updateFilter(setter, value) { setter(value); setPage(1); setSelected(null); }
  async function mutate(endpoint, method, payload, message) {
    if (actionLock.current) return false;
    actionLock.current = true; setBusy(true); setActionError(''); setNotice('');
    try {
      const result = await arrRequest(service, endpoint, { method, data: payload, signal: lifetime.current.signal });
      if (lifetime.current.signal.aborted) return false;
      setNotice(`${message}${endpoint === 'search' && result.id ? ` · Command #${result.id}` : ''}`); refresh(); return true;
    } catch (err) { if (!lifetime.current.signal.aborted) { setActionError(`${err.message} Refresh to review the current state before retrying.`); refresh(); } return false; }
    finally { actionLock.current = false; if (!lifetime.current.signal.aborted) setBusy(false); }
  }
  const monitor = (kind, item) => mutate('monitor', 'PUT', { kind, ids: [item.id], monitored: !item.monitored }, `${item.monitored ? 'Stopped monitoring' : 'Now monitoring'} ${item.title || episodeCode(item)}.`);
  const search = (kind, item) => { setActionError(''); setSearching({ kind, item }); };
  function closeDetails(id) { setSelected(null); document.querySelector(`[data-arr-title="${id}"]`)?.focus(); }
  const emptyCopy = section === 'library' ? query || filter !== 'all' ? 'No titles match these filters. Clear the search or choose another filter.' : `Your library is empty. Add a ${tv ? 'series' : 'movie'} to get started.` : section === 'queue' ? 'Your queue is clear. Downloads and import progress will appear here.' : section === 'missing' ? `No monitored ${tv ? 'episodes' : 'released movies'} are missing.` : 'No monitored releases in this week. Browse another week to see what’s coming.';
  const details = item => selected === item.id && <TitleDetails key={`${service}-${item.id}`} service={service} item={item} revision={revision} disabled={disabled} onMonitor={monitor} onSearch={search} onInteractive={(kind, item) => setInteractive({ kind, item })} />;
  const eventsByDay = Object.groupBy(rows, item => item.date ? new Date(item.date).toLocaleDateString() : 'Unknown');
  return <div className="page-content qb-page arr-page">
    <div className="arr-intro"><div><p className="eyebrow">2EZ / {tv ? 'TELEVISION' : 'MOVIES'}</p><h1>{tv ? 'The next episode, in view.' : 'A place for your next watch.'}</h1><p>{tv ? 'Your series, the episodes you have, and what’s still to come.' : 'Your movie shelf, upcoming releases, and the gaps to fill.'}</p></div><div className="arr-top-actions"><a className="qb-button" href={`/${service}/`} target="_blank" rel="noreferrer">Full {name} UI ↗</a><button className="qb-button qb-primary" disabled={Boolean(summaryError) || !summary} onClick={() => { setActionError(''); setAdding(true); }}>+ Add {tv ? 'series' : 'movie'}</button></div></div>
    <div className="arr-state-strip"><span className={`arr-connection ${connectionError ? 'arr-error-ink' : ''}`}><i className={connectionError ? 'arr-dot-error' : summary ? 'arr-dot-live' : ''} />{connectionError ? summary ? 'Connection lost · Last known state' : 'Connection needs attention' : summary ? 'Connected' : 'Connecting…'}</span><span>{summary?.total ?? '—'} {tv ? 'series' : 'movies'}</span><span>{summary?.collected ?? '—'} {tv ? 'episodes on your shelf' : 'on your shelf'}</span><button className="qb-text-button" onClick={() => switchSection('missing')}>{summary?.missing ?? '—'} missing {tv ? 'episodes' : 'movies'}</button><button className="qb-text-button" onClick={() => switchSection('queue')}>{summary?.queue ?? '—'} in queue</button></div>
    {connectionError && <div className="qb-error" role="alert">{connectionError} <button className="qb-text-button" onClick={refresh}>Retry connection</button></div>}
    {!searching && actionError && <div className="qb-error" role="alert">{actionError}</div>}
    {notice && <div className="qb-notice" role="status">{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></div>}
    {summary?.health.length > 0 && <details className="arr-health"><summary>{summary.health.length} service {summary.health.length === 1 ? 'warning' : 'warnings'} · Review before searching</summary>{summary.health.map((item, index) => <p key={index} className={item.type === 'error' ? 'arr-error-ink' : ''}>{item.message}</p>)}<a className="qb-text-button" href={`/${service}/system/status`} target="_blank" rel="noreferrer">Open {name} system status ↗</a></details>}
    <nav className="arr-sections" aria-label={`${name} sections`}>{sections.map(([id, label]) => <button key={id} aria-pressed={id === section} className={id === section ? 'active' : ''} onClick={() => switchSection(id)}>{label}{['queue', 'missing'].includes(id) && summary && <span>{summary[id]}</span>}</button>)}</nav>
    <section className="arr-panel" aria-label={`${name} ${section}`} aria-busy={!loaded && !error}>
      <div className="arr-toolbar">{section === 'library' ? <><label className="qb-search"><input type="search" aria-label={`Search ${name} library`} placeholder={`Find a ${tv ? 'series' : 'movie'}…`} value={query} maxLength={200} onChange={event => updateFilter(setQuery, event.target.value)} /></label><select aria-label="Filter library" value={filter} onChange={event => updateFilter(setFilter, event.target.value)}><option value="all">All titles</option><option value="monitored">Monitored</option><option value="missing">Missing {tv ? 'episodes' : 'movies'}</option><option value="unmonitored">Unmonitored</option></select><select aria-label="Sort library" value={sort} onChange={event => updateFilter(setSort, event.target.value)}><option value="title">Title A–Z</option><option value="added">Recently added</option><option value="year">Newest release year</option></select></> : section === 'calendar' ? <><div className="arr-week-controls"><button className="qb-button" aria-label="Previous week" onClick={() => setWeek(value => value - 1)}>←</button><button className="qb-button" onClick={() => setWeek(0)}>This week</button><button className="qb-button" aria-label="Next week" onClick={() => setWeek(value => value + 1)}>→</button></div><strong>{formatDate(start)} – {formatDate(new Date(+end - 1))}</strong></> : <div><h2>{section === 'queue' ? 'From download to library.' : 'Still to collect.'}</h2><p className="arr-meta">{section === 'queue' ? 'Download progress and import issues reported by the service.' : `Monitored ${tv ? 'episodes that have aired' : 'movies available for release'} without a file.`}</p></div>}
        <span className="arr-meta">{loaded ? `${section === 'calendar' ? rows.length : data.totalRecords} ${section === 'library' ? 'titles' : 'items'}` : 'Loading…'}</span><button className="qb-text-button" onClick={refresh}>Refresh ↻</button>
      </div>
      {!loaded ? <div className="arr-empty" role="status">{error ? 'Waiting to reconnect. Use Retry connection above.' : `Loading ${section === 'calendar' ? 'upcoming releases' : section}…`}</div> : !rows.length ? <div className="arr-empty"><strong>{section === 'queue' ? 'Nothing in the queue.' : section === 'missing' ? 'Nothing missing.' : section === 'calendar' ? 'A quiet week.' : 'No titles here yet.'}</strong><p>{emptyCopy}</p></div> : section === 'library' ? <>
        <div className="arr-library-labels"><span>YOUR {tv ? 'SERIES' : 'MOVIE SHELF'}</span><span>LIBRARY</span><span>MONITORING</span><span /></div>
        {rows.map(item => <article className={`arr-library-item ${selected === item.id ? 'expanded' : ''}`} key={item.id}><button className="arr-title-row" data-arr-title={item.id} aria-expanded={selected === item.id} aria-controls={selected === item.id ? `arr-details-${item.id}` : undefined} onClick={() => selected === item.id ? closeDetails(item.id) : setSelected(item.id)}><span className="arr-title-cell"><Cover service={service} item={item} /><span><strong>{item.title}</strong><span className="arr-meta">{item.year || 'Year unknown'} · {item.genres?.slice(0, 2).join(' / ') || item.status || 'No genres'}</span></span></span><span className={`arr-availability ${!tv && item.hasFile ? 'arr-collected' : ''}`}>{availability(item, tv)}{tv && item.statistics.episodeCount > 0 && <span className="arr-shelf-track"><i style={{ width: `${Math.min(100, (item.statistics.episodeFileCount || 0) / item.statistics.episodeCount * 100)}%` }} /></span>}</span><span className="arr-meta">{item.monitored ? 'Monitored' : 'Unmonitored'}</span><span className="arr-expand" aria-hidden="true">{selected === item.id ? '−' : '+'}</span></button>{details(item)}</article>)}
      </> : section === 'queue' ? rows.map(item => <article key={item.id} className="arr-queue-row"><div><p className="eyebrow">{item.series?.title || item.movie?.title || 'UNMATCHED DOWNLOAD'}</p><h3>{item.episode ? `${episodeCode(item.episode)} · ${item.episode.title}` : item.title}</h3><p className="arr-meta">{item.quality || 'Quality unknown'} · {item.downloadClient || 'Download client unknown'}</p><Progress item={item} /></div><div><span className={`arr-status ${item.trackedDownloadStatus === 'warning' || item.trackedDownloadStatus === 'error' ? 'arr-warning' : ''}`}>{queueState(item)}</span>{item.statusMessages?.map((message, index) => <div className="arr-queue-issue" key={index}><strong>{message.title}</strong>{message.messages?.map((text, i) => <p key={i}>{text}</p>)}</div>)}</div></article>) : section === 'calendar' ? <div className="arr-calendar">{Object.entries(eventsByDay).map(([day, events]) => <section className="arr-calendar-day" key={day}><div className="arr-day"><span>{new Date(events[0].date).toLocaleDateString(undefined, { weekday: 'short' })}</span><strong>{new Date(events[0].date).getDate()}</strong><span>{new Date(events[0].date).toLocaleDateString(undefined, { month: 'short' })}</span></div><div>{events.map(item => <div className="arr-release" key={item.eventId}><span className="arr-release-time">{tv ? new Date(item.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : item.label}</span><div><strong>{item.displayTitle}</strong><p>{tv ? `${item.label} · ${item.title}` : `${item.year} · ${item.hasFile ? 'On your shelf' : 'Not downloaded'}`}</p></div><span className="arr-meta">{releaseState(item, tv)}</span></div>)}</div></section>)}</div> : rows.map(item => <Fragment key={item.id}><article className="arr-missing-row"><div><span className="eyebrow">{tv ? item.series?.title || 'UNKNOWN SERIES' : item.year}</span><h3>{tv ? `${episodeCode(item)} · ${item.title}` : item.title}</h3><p className="arr-meta">{tv ? `Aired ${formatDate(item.airDateUtc)}` : `Released · ${item.genres?.slice(0, 2).join(' / ') || 'Movie'}`}</p></div><div className="arr-search-actions"><button className="qb-button" disabled={disabled} aria-label={`Automatic search ${tv ? 'episode' : 'movie'}`} onClick={() => search(tv ? 'episodes' : 'title', item)}>Automatic search</button><button className="qb-button" disabled={disabled} onClick={() => setInteractive({ kind: tv ? 'episodes' : 'title', item })}>Interactive search</button></div></article></Fragment>)}
      <div className="arr-list-footer"><span className="arr-meta">{snapshot ? `Last update ${snapshot.updated.toLocaleTimeString()}` : 'Waiting for first update'}</span>{loaded && section !== 'calendar' && data.totalRecords > data.pageSize && <div className="arr-pagination"><button className="qb-text-button" disabled={page === 1} onClick={() => { setPage(value => value - 1); setSelected(null); }}>Previous</button><span className="arr-meta">{page} / {Math.ceil(data.totalRecords / data.pageSize)}</span><button className="qb-text-button" disabled={page * data.pageSize >= data.totalRecords} onClick={() => { setPage(value => value + 1); setSelected(null); }}>Next</button></div>}</div>
    </section>
    <footer className="arr-footer"><span>{name} {summary?.version || ''} · Updates every 15s</span><a href={`/${service}/settings/profiles`} target="_blank" rel="noreferrer">Profiles & advanced settings ↗</a></footer>
    {adding && <AddTitle service={service} onClose={() => setAdding(false)} onAdded={item => { setAdding(false); setNotice(`${item.title} added to ${name}.`); setQuery(''); setFilter('all'); setSort('added'); setSection('library'); setPage(1); refresh(); }} />}
    {searching && <Modal title="Automatic search" busy={busy} onClose={() => { if (!busy) setSearching(null); }}><p>Automatically search configured indexers for <strong>{searching.item.title}</strong>{searching.kind === 'episodes' ? ` (${episodeCode(searching.item)})` : searching.kind === 'season' ? ` (Season ${searching.item.seasonNumber})` : ''}?</p><p className="arr-synopsis">{name} will choose matching releases using its quality profile and may start downloads.{tv && searching.kind === 'title' ? ' A series search covers its monitored episodes.' : ''}</p>{actionError && <p className="qb-error" role="alert">{actionError}</p>}<div className="arr-dialog-actions"><button className="qb-button" disabled={busy} onClick={() => setSearching(null)}>Cancel</button><button className="qb-button qb-primary" disabled={disabled} onClick={async () => { if (await mutate('search', 'POST', { kind: searching.kind, ids: [searching.item.id], ...(searching.kind === 'season' ? { seasonNumber: searching.item.seasonNumber } : {}) }, 'Search queued. Downloads will appear when a release is found.')) setSearching(null); }}>{busy ? 'Queuing…' : 'Start automatic search'}</button></div></Modal>}
    {interactive && <ReleaseSearch key={`${service}-${interactive.kind}-${interactive.item.id}-${interactive.item.seasonNumber ?? ''}`} service={service} target={interactive} disabled={Boolean(error || summaryError)} onClose={() => setInteractive(null)} onGrabbed={release => { setNotice(`${release.title} sent to the download client.`); refresh(); }} />}
  </div>;
}
