import { useEffect, useState } from 'react';
import { arrRequest, availability, episodeCode, formatDate } from './api';

export default function TitleDetails({ service, item, disabled, revision, onMonitor, onSearch, onInteractive }) {
  const tv = service === 'sonarr';
  const [episodes, setEpisodes] = useState(null);
  const [error, setError] = useState('');
  const [season, setSeason] = useState(item.seasons?.find(entry => entry.seasonNumber > 0)?.seasonNumber ?? 1);
  const [page, setPage] = useState(1);
  useEffect(() => {
    if (!tv) return;
    const controller = new AbortController();
    arrRequest(service, `episodes?seriesId=${item.id}`, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) { setEpisodes(data); setError(''); } }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [service, tv, item.id, revision]);
  const list = (episodes || []).filter(episode => episode.seasonNumber === Number(season)).sort((a, b) => a.episodeNumber - b.episodeNumber);
  const seasons = [...new Set((episodes || []).map(episode => episode.seasonNumber))].sort((a, b) => a - b);
  return <div className="arr-title-details" id={`arr-details-${item.id}`}>
    <div className="arr-detail-summary"><div><p className="arr-synopsis">{item.overview || 'No synopsis available for this title.'}</p><dl className="arr-facts"><div><dt>Library</dt><dd>{availability(item, tv)}</dd></div><div><dt>{tv ? 'Network' : 'Quality'}</dt><dd>{tv ? item.network || 'Unknown' : item.quality || 'No file yet'}</dd></div><div><dt>Added</dt><dd>{formatDate(item.added)}</dd></div>{tv && item.nextAiring && <div><dt>Next episode</dt><dd>{formatDate(item.nextAiring)}</dd></div>}</dl><p className="arr-path">{item.path}</p></div>
      <div className="arr-detail-actions"><button className="qb-button" disabled={disabled} aria-pressed={item.monitored} onClick={() => onMonitor('title', item)}>{item.monitored ? 'Stop monitoring' : 'Monitor title'}</button><button className="qb-button qb-primary" disabled={disabled} aria-label={`Automatic search ${tv ? 'series' : 'movie'}`} onClick={() => onSearch('title', item)}>Automatic search</button><button className="qb-button" disabled={disabled} onClick={() => onInteractive(tv ? 'season' : 'title', tv ? { ...item, seasonNumber: Number(season) } : item)}>Interactive search</button></div>
    </div>
    {tv && <div className="arr-episodes"><div className="arr-episode-head"><h3>Episodes</h3><label>Season<select aria-label="Episode season" value={season} onChange={event => { setSeason(Number(event.target.value)); setPage(1); }}>{(seasons.length ? seasons : [season]).map(number => <option key={number} value={number}>{number === 0 ? 'Specials' : `Season ${number}`}</option>)}</select></label><span className="arr-meta">{list.length} episodes</span><button className="qb-text-button" disabled={disabled || !episodes || Boolean(error)} onClick={() => onSearch('season', { ...item, seasonNumber: Number(season) })}>Automatic season search</button></div>
      {error ? <p className="qb-error" role="alert">{error} Close and reopen this title to retry.</p> : !episodes ? <p className="arr-empty" role="status">Loading episode details…</p> : !list.length ? <p className="arr-empty">No episodes in this season.</p> : list.slice((page - 1) * 12, page * 12).map(episode => <div className="arr-episode" key={episode.id}><span className="arr-meta">{episodeCode(episode)}</span><div><strong>{episode.title}</strong><span className="arr-meta">{formatDate(episode.airDateUtc)} · {episode.hasFile ? 'Downloaded' : episode.airDateUtc && new Date(episode.airDateUtc) <= new Date() ? 'Missing' : 'Unaired'}</span></div><button className="qb-button arr-monitor-button" disabled={disabled || Boolean(error)} aria-pressed={episode.monitored} aria-label={`${episode.monitored ? 'Stop monitoring' : 'Monitor'} ${episodeCode(episode)}`} onClick={() => onMonitor('episodes', episode)}>{episode.monitored ? 'Monitored' : 'Unmonitored'}</button><button className="qb-text-button" disabled={disabled || Boolean(error)} aria-label={`Automatic search ${episodeCode(episode)}`} onClick={() => onSearch('episodes', episode)}>Automatic</button><button className="qb-text-button" disabled={disabled || Boolean(error)} aria-label={`Interactive search ${episodeCode(episode)}`} onClick={() => onInteractive('episodes', episode)}>Interactive</button></div>)}
      {list.length > 12 && <div className="arr-pagination"><button className="qb-text-button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous episodes</button><span className="arr-meta">{page} / {Math.ceil(list.length / 12)}</span><button className="qb-text-button" disabled={page * 12 >= list.length} onClick={() => setPage(value => value + 1)}>Next episodes</button></div>}
    </div>}
  </div>;
}
