import useArrSummary from './useArrSummary';
import { serviceName } from './api';
import './arr.css';

export default function ArrWidget({ service }) {
  const { summary, error } = useArrSummary(service);
  const name = serviceName(service), tv = service === 'sonarr';
  return <a data-sort-id={service} className="arr-widget live-svc-card" href={`#${service}`} onClick={event => {
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); window.dispatchEvent(new CustomEvent('2ez-navigate', { detail: service })); }
  }}>
    <div className="arr-widget-head"><strong>{name}</strong><span aria-hidden="true">→</span></div>
    <p className="arr-meta">{error ? 'Connection needs attention' : summary ? `${summary.total} ${tv ? 'series' : 'movies'} · ${summary.monitored} monitored` : 'Connecting to your library…'}</p>
    <div className="arr-widget-counts"><span><strong>{error ? '—' : summary?.queue ?? '—'}</strong> in queue</span><span><strong>{error ? '—' : summary?.missing ?? '—'}</strong> missing {tv ? 'episodes' : 'movies'}</span></div>
    <p className={`arr-widget-state ${error || summary?.health.length ? 'arr-warning' : ''}`}>{error ? 'Open to check the connection' : !summary ? 'Waiting for first update' : summary.health.length ? `${summary.health.length} service ${summary.health.length === 1 ? 'warning' : 'warnings'} · Open to review` : 'Connected · Open library'}</p>
  </a>;
}
