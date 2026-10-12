import { useEffect, useRef, useState } from 'react';
import Modal from '../qbittorrent/Modal';
import { arrRequest, episodeCode, formatDate, serviceName } from './api';

const size = value => Number.isFinite(value) ? value >= 1073741824 ? `${(value / 1073741824).toFixed(2)} GiB` : `${(value / 1048576).toFixed(0)} MiB` : 'Size unknown';
export default function ReleaseSearch({ service, target, disabled, onClose, onGrabbed }) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('priority');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [grabError, setGrabError] = useState('');
  const [grabbed, setGrabbed] = useState([]);
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now);
  const lock = useRef(false);
  const lifetime = useRef(null);
  const name = serviceName(service);
  const { kind, item } = target;
  const id = item.id, seasonNumber = item.seasonNumber;
  const scope = kind === 'episodes' ? `${item.series?.title ? `${item.series.title} · ` : ''}${episodeCode(item)} · ${item.title}` : kind === 'season' ? `${item.title} · ${seasonNumber === 0 ? 'Specials' : `Season ${seasonNumber}`}` : item.title;
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; const timer = setInterval(() => setNow(Date.now()), 1000); return () => { controller.abort(); clearInterval(timer); }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    arrRequest(service, 'releases', { method: 'POST', data: { kind, id, ...(kind === 'season' ? { seasonNumber } : {}) }, signal: controller.signal, timeoutMs: 130000 })
      .then(data => { if (!controller.signal.aborted) { setSnapshot(data); setLoading(false); } })
      .catch(err => { if (!controller.signal.aborted) { setError(err.message); setLoading(false); } });
    return () => controller.abort();
  }, [service, kind, id, seasonNumber, revision]);
  const expired = snapshot && now >= +new Date(snapshot.expiresAt);
  const records = (snapshot?.records || []).filter(item => item.title.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || filter === 'rejected' && item.rejected || filter === 'eligible' && !item.rejected));
  if (sort !== 'priority') records.sort((a, b) => sort === 'size' ? (a.size ?? Infinity) - (b.size ?? Infinity) : sort === 'peers' ? (b.seeders ?? -1) - (a.seeders ?? -1) : sort === 'score' ? (b.customFormatScore ?? 0) - (a.customFormatScore ?? 0) : (b.publishDate || '').localeCompare(a.publishDate || ''));
  function refresh() { setSnapshot(null); setLoading(true); setError(''); setGrabError(''); setSelected(null); setGrabbed([]); setNotice(''); setPage(1); setRevision(value => value + 1); }
  function change(setter, value) { setter(value); setPage(1); }
  async function grab() {
    if (lock.current || !selected || expired || disabled) return;
    lock.current = true; setBusy(true); setGrabError('');
    try {
      await arrRequest(service, 'grab', { method: 'POST', data: { token: selected.token }, signal: lifetime.current.signal });
      if (lifetime.current.signal.aborted) return;
      setGrabbed(previous => [...previous, selected.token]); setSelected(null); setNotice('Release sent to the download client. Check the queue for progress.'); onGrabbed(selected);
    } catch (err) { if (!lifetime.current.signal.aborted) setGrabError(`${err.message} Check the queue before retrying if the connection was interrupted.`); }
    finally { lock.current = false; if (!lifetime.current.signal.aborted) setBusy(false); }
  }
  return <Modal title="Interactive search" busy={busy} onClose={onClose}>
    <div className="arr-release-search"><p className="eyebrow">{name.toUpperCase()} / RELEASES</p><h3 className="arr-release-scope">{scope}</h3>
      {selected ? <div className="arr-grab-confirm"><button className="qb-text-button" disabled={busy} onClick={() => setSelected(null)}>← Back to releases</button><h4>Download this release?</h4><p className="arr-release-name">{selected.title}</p><p className="arr-meta">{selected.quality} · {size(selected.size)} · {selected.indexer}</p><p className="arr-synopsis">Send this release to {name}’s configured download client. This can replace an existing file when the service imports it.</p>
        {selected.rejected && <div className="arr-release-rejections"><strong>{name} would skip this release automatically:</strong><ul>{selected.rejections.map((reason, index) => <li key={index}>{reason}</li>)}</ul><p>Downloading it manually bypasses those automatic selection rules.</p></div>}
        {expired && <p className="qb-error" role="alert">This search expired. Go back and search again.</p>}{grabError && <p className="qb-error" role="alert">{grabError}</p>}
        <div className="arr-dialog-actions"><button className="qb-button" disabled={busy} onClick={() => setSelected(null)}>Cancel download</button><button className="qb-button qb-primary" disabled={busy || disabled || expired} onClick={grab}>{busy ? 'Sending…' : selected.rejected ? 'Download anyway' : 'Download release'}</button></div>
      </div> : <>
        <p className="arr-synopsis">Compare releases from your configured indexers. Downloads start only when you choose a release and confirm.</p>
        {notice && <div className="qb-notice" role="status">{notice}</div>}
        {loading ? <div className="arr-empty" role="status">Searching configured indexers… This may take up to two minutes.</div> : error ? <div className="qb-error" role="alert">{error} <button className="qb-text-button" onClick={refresh}>Retry search</button></div> : <>
          <div className="arr-release-tools"><label className="qb-search"><input type="search" aria-label="Filter release titles" placeholder="Filter releases…" value={query} onChange={event => change(setQuery, event.target.value)} /></label><select aria-label="Filter release decisions" value={filter} onChange={event => change(setFilter, event.target.value)}><option value="all">All releases</option><option value="eligible">Meets profile</option><option value="rejected">Rejected</option></select><select aria-label="Sort releases" value={sort} onChange={event => change(setSort, event.target.value)}><option value="priority">Service priority</option><option value="size">Smallest size</option><option value="peers">Most seeders</option><option value="score">Highest format score</option><option value="date">Newest release</option></select><button className="qb-button" disabled={busy} onClick={refresh}>Search again</button></div>
          <p className="arr-meta arr-release-count">{records.length} matching releases{snapshot.totalRecords > snapshot.records.length ? ` · First ${snapshot.records.length} of ${snapshot.totalRecords} results` : ''} · Searched {new Date(snapshot.searchedAt).toLocaleTimeString()}</p>
          {expired && <div className="qb-error" role="alert">This search expired. Search again to download a release.</div>}
          {!records.length ? <div className="arr-empty"><strong>{snapshot.records.length ? 'No releases match these filters.' : 'No releases found.'}</strong><p>{snapshot.records.length ? 'Clear the filter or choose another decision.' : 'Check your indexers and title availability, then search again.'}</p></div> : <div className="arr-release-results">{records.slice((page - 1) * 25, page * 25).map(item => <article className="arr-release-result" key={item.token}><div className="arr-release-main"><strong className="arr-release-name">{item.title}</strong><span className={`arr-release-decision ${item.rejected ? 'arr-warning' : ''}`}>{item.rejected ? 'Rejected automatically' : 'Meets profile'}{item.fullSeason ? ' · Season pack' : ''}</span><p className="arr-meta">{item.indexer || 'Unknown indexer'} · {item.protocol || 'Unknown protocol'} · {formatDate(item.publishDate)}{item.languages?.length ? ` · ${item.languages.join(', ')}` : ''}</p>{item.rejections.length > 0 && <details className="arr-release-reasons"><summary>{item.rejections.length} rejection {item.rejections.length === 1 ? 'reason' : 'reasons'}</summary><ul>{item.rejections.map((reason, index) => <li key={index}>{reason}</li>)}</ul></details>}{item.customFormats?.length > 0 && <p className="arr-meta">{item.customFormats.join(' · ')}</p>}</div><div className="arr-release-spec"><strong>{item.quality}</strong><span className="arr-meta">Format score {item.customFormatScore ?? '—'}</span></div><span className="arr-meta arr-release-size">{size(item.size)}</span><span className="arr-meta arr-release-peers">{item.protocol === 'torrent' ? `${item.seeders ?? '—'} seeders / ${item.leechers ?? '—'} leechers` : 'Usenet'}</span><button className="qb-button" disabled={disabled || expired || !item.downloadAllowed || grabbed.includes(item.token)} onClick={() => { setSelected(item); setGrabError(''); }}>{grabbed.includes(item.token) ? 'Sent' : !item.downloadAllowed ? 'Unavailable' : 'Download'}</button></article>)}</div>}
          {records.length > 25 && <div className="arr-pagination arr-release-pagination"><button className="qb-text-button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous releases</button><span className="arr-meta">{page} / {Math.ceil(records.length / 25)}</span><button className="qb-text-button" disabled={page * 25 >= records.length} onClick={() => setPage(value => value + 1)}>Next releases</button></div>}
        </>}
        <div className="arr-dialog-actions"><button className="qb-button" onClick={onClose}>Done</button></div>
      </>}
    </div>
  </Modal>;
}
