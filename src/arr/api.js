export const serviceName = service => service === 'sonarr' ? 'Sonarr' : 'Radarr';
export async function arrRequest(service, endpoint, { method = 'GET', data, signal, timeoutMs = 25000 } = {}) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const response = await fetch(`/arr-api/${service}/${endpoint}`, {
    method, signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-2ez-arr': '1' },
    body: method === 'GET' ? undefined : JSON.stringify(data),
  });
  let result;
  try { result = await response.json(); } catch { throw new Error(`${serviceName(service)} returned an unexpected response. Retry the connection.`); }
  if (!response.ok) throw new Error(result.error || `${serviceName(service)} request failed (${response.status}).`);
  return result;
}
export const formatDate = value => value && Number.isFinite(+new Date(value)) ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unknown';
export const episodeCode = item => `S${String(item.seasonNumber).padStart(2, '0')} E${String(item.episodeNumber).padStart(2, '0')}`;
export const queueState = item => ({ downloading: 'Downloading', queued: 'Queued', paused: 'Paused', completed: 'Downloaded', importPending: 'Awaiting import', importBlocked: 'Import blocked', imported: 'Imported', failed: 'Failed', downloadClientUnavailable: 'Client unavailable' }[item.trackedDownloadState || item.status] || String(item.trackedDownloadState || item.status || 'Queued').replace(/([a-z])([A-Z])/g, '$1 $2'));
export const releaseState = (item, tv) => item.hasFile ? 'Downloaded' : tv ? new Date(item.date) <= new Date() ? 'Aired · Missing' : 'Upcoming' : item.monitored ? 'Monitored' : 'Unmonitored';
export function availability(item, tv) {
  if (!tv) return item.hasFile ? 'On your shelf' : item.isAvailable ? 'Missing movie' : 'Awaiting release';
  const have = item.statistics?.episodeFileCount;
  const total = item.statistics?.episodeCount;
  return have == null || total == null ? 'Episode count unavailable' : `${have} / ${total} episodes`;
}
export function calendarEvents(items, tv, start, end) {
  const events = tv ? items.map(item => ({ ...item, eventId: String(item.id), date: item.airDateUtc, label: episodeCode(item), displayTitle: item.series?.title || 'Unknown series' }))
    : items.flatMap(item => [['inCinemas', 'In cinemas'], ['digitalRelease', 'Digital release'], ['physicalRelease', 'Physical release']].map(([key, label]) => ({ ...item, eventId: `${item.id}-${key}`, date: item[key], label, displayTitle: item.title })));
  return events.filter(item => Number.isFinite(+new Date(item.date)) && new Date(item.date) >= start && new Date(item.date) < end).sort((a, b) => new Date(a.date) - new Date(b.date));
}
