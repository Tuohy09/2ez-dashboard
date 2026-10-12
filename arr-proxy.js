import express from 'express'
import { randomUUID } from 'node:crypto'

const positive = value => Number.isSafeInteger(value) && value > 0
const ids = value => Array.isArray(value) && value.length > 0 && value.length <= 25 && value.every(positive) && new Set(value).size === value.length
const fields = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]))
const titleFields = ['id', 'title', 'sortTitle', 'year', 'overview', 'status', 'monitored', 'path', 'qualityProfileId', 'genres', 'runtime', 'network', 'studio', 'added', 'nextAiring', 'tvdbId', 'tmdbId', 'hasFile', 'isAvailable', 'sizeOnDisk', 'digitalRelease', 'physicalRelease', 'inCinemas', 'seriesType']
export const cleanTitle = value => ({
  ...fields(value, titleFields),
  statistics: fields(value?.statistics, ['seasonCount', 'episodeCount', 'episodeFileCount', 'totalEpisodeCount', 'sizeOnDisk']),
  seasons: (value?.seasons || []).map(season => ({ ...fields(season, ['seasonNumber', 'monitored']), statistics: fields(season.statistics, ['episodeCount', 'episodeFileCount', 'totalEpisodeCount']) })),
  quality: value?.movieFile?.quality?.quality?.name,
})
const cleanEpisode = value => ({ ...fields(value, ['id', 'seriesId', 'title', 'seasonNumber', 'episodeNumber', 'airDateUtc', 'hasFile', 'monitored', 'overview']), ...(value?.series ? { series: cleanTitle(value.series) } : {}) })
const cleanQueue = value => ({
  ...fields(value, ['id', 'title', 'seriesId', 'movieId', 'size', 'sizeleft', 'status', 'trackedDownloadStatus', 'trackedDownloadState', 'timeleft', 'estimatedCompletionTime', 'downloadClient', 'protocol']),
  quality: value.quality?.quality?.name,
  statusMessages: (value.statusMessages || []).map(message => fields(message, ['title', 'messages'])),
  ...(value.series ? { series: cleanTitle(value.series) } : {}),
  ...(value.movie ? { movie: cleanTitle(value.movie) } : {}),
  ...(value.episode ? { episode: cleanEpisode(value.episode) } : {}),
})
const fail = (status, message) => Object.assign(new Error(message), { status })

export function createArrProxy({ service, base = process.env[`${service.toUpperCase()}_BASE`], apiKey = process.env[`${service.toUpperCase()}_API_KEY`], fetcher = fetch } = {}) {
  if (!['sonarr', 'radarr'].includes(service)) throw new Error('Unknown media service')
  const name = service === 'sonarr' ? 'Sonarr' : 'Radarr'
  const tv = service === 'sonarr'
  const entity = tv ? 'series' : 'movie'
  const externalKey = tv ? 'tvdbId' : 'tmdbId'
  const router = express.Router()
  const cache = new Map()
  const releases = new Map()
  const releaseTTL = 10 * 60000
  let revision = 0
  async function upstream(endpoint, method = 'GET', body, timeoutMs = 20000) {
    if (!base || !apiKey) throw fail(503, `${name} is not connected. Configure its server URL and API key, then restart the dashboard.`)
    let response
    try {
      response = await fetcher(`${base.replace(/\/+$/, '')}/api/v3/${endpoint}`, {
        method, headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs), redirect: 'error',
      })
    } catch { throw fail(502, `Cannot reach ${name}. Check the service connection and retry.`) }
    if ([401, 403].includes(response.status)) throw fail(403, `${name} denied access. Check its API key in the dashboard server configuration.`)
    if (!response.ok) throw fail(response.status < 500 ? response.status : 502, `${name} could not complete this request (${response.status}). Review its settings or logs before retrying.`)
    try { return response.status === 204 ? {} : await response.json() } catch { throw fail(502, `${name} returned an unexpected response. Check the service URL and retry.`) }
  }
  async function cached(key, loader, ttl = 30000) {
    const entry = cache.get(key)
    if (entry && Date.now() - entry.time < ttl) return entry.value
    const version = revision
    const value = await loader()
    if (version === revision) cache.set(key, { value, time: Date.now() })
    return value
  }
  const library = () => cached('library', async () => {
    const result = await upstream(entity)
    if (!Array.isArray(result)) throw fail(502, `${name} returned an invalid library. Retry the connection.`)
    return result.map(cleanTitle)
  })
  const options = () => cached('options', async () => {
    const [profiles, folders] = await Promise.all([upstream('qualityprofile'), upstream('rootfolder')])
    if (!Array.isArray(profiles) || !Array.isArray(folders)) throw fail(502, `${name} returned invalid library settings. Open its settings and retry.`)
    return { profiles: profiles.map(profile => fields(profile, ['id', 'name'])), folders: folders.map(folder => fields(folder, ['id', 'path', 'accessible', 'freeSpace'])) }
  }, 60000)
  const pageNumber = req => {
    const value = Number(req.query.page ?? 1)
    if (!positive(value) || value > 100000) throw fail(400, 'Choose a valid page.')
    return value
  }
  const queryOnly = (req, allowed) => {
    if (Object.keys(req.query).some(key => !allowed.includes(key)) || Object.values(req.query).some(value => typeof value !== 'string')) throw fail(400, 'Invalid request filters.')
  }
  const strictBody = (req, allowed) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).some(key => !allowed.includes(key))) throw fail(400, 'Invalid media request.')
    queryOnly(req, [])
    return req.body
  }
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    if (req.method !== 'GET') {
      let sameOrigin = true
      try { if (req.get('Origin')) sameOrigin = new URL(req.get('Origin')).host === req.get('Host') } catch { sameOrigin = false }
      if (!sameOrigin || req.get('Sec-Fetch-Site') === 'cross-site' || req.get('X-2ez-arr') !== '1') return res.status(403).json({ error: 'Use the dashboard to make media changes.' })
    }
    next()
  })
  router.use(express.json({ limit: '16kb' }))
  router.get('/summary', async (req, res) => {
    queryOnly(req, [])
    const summary = await cached('summary', async () => {
      const [items, status, health, queue, missing] = await Promise.all([
        library(), upstream('system/status'), upstream('health'), upstream('queue?page=1&pageSize=1'), upstream('wanted/missing?page=1&pageSize=1&monitored=true'),
      ])
      return { total: items.length, monitored: items.filter(item => item.monitored).length,
        collected: tv ? items.reduce((sum, item) => sum + (item.statistics.episodeFileCount || 0), 0) : items.filter(item => item.hasFile).length,
        missing: missing.totalRecords, queue: queue.totalRecords, version: status.version,
        health: health.map(item => fields(item, ['type', 'message'])), updated: new Date().toISOString(),
      }
    }, 15000)
    res.json(summary)
  })
  router.get('/library', async (req, res) => {
    queryOnly(req, ['page', 'query', 'filter', 'sort'])
    const page = pageNumber(req)
    const query = (req.query.query || '').trim().toLowerCase()
    const filter = req.query.filter || 'all', sort = req.query.sort || 'title'
    if (query.length > 200 || !['all', 'monitored', 'unmonitored', 'missing'].includes(filter) || !['title', 'added', 'year'].includes(sort)) throw fail(400, 'Invalid library filters.')
    const result = (await library()).filter(item => item.title.toLowerCase().includes(query) && (filter === 'all' || filter === 'monitored' && item.monitored || filter === 'unmonitored' && !item.monitored || filter === 'missing' && item.monitored && (tv ? (item.statistics.episodeCount || 0) > (item.statistics.episodeFileCount || 0) : !item.hasFile && item.isAvailable)))
    result.sort((a, b) => sort === 'added' ? (b.added || '').localeCompare(a.added || '') : sort === 'year' ? b.year - a.year || a.title.localeCompare(b.title) : (a.sortTitle || a.title).localeCompare(b.sortTitle || b.title))
    res.json({ records: result.slice((page - 1) * 24, page * 24), totalRecords: result.length, page, pageSize: 24 })
  })
  router.get('/queue', async (req, res) => {
    queryOnly(req, ['page'])
    const result = await upstream(`queue?page=${pageNumber(req)}&pageSize=24&${tv ? 'includeSeries=true&includeEpisode=true&includeUnknownSeriesItems=true' : 'includeMovie=true&includeUnknownMovieItems=true'}`)
    res.json({ ...fields(result, ['totalRecords', 'page', 'pageSize']), records: result.records.map(cleanQueue) })
  })
  router.get('/missing', async (req, res) => {
    queryOnly(req, ['page'])
    const result = await upstream(`wanted/missing?page=${pageNumber(req)}&pageSize=24&monitored=true${tv ? '&includeSeries=true&sortKey=airDateUtc&sortDirection=descending' : '&sortKey=title&sortDirection=ascending'}`)
    res.json({ ...fields(result, ['totalRecords', 'page', 'pageSize']), records: result.records.map(tv ? cleanEpisode : cleanTitle) })
  })
  router.get('/calendar', async (req, res) => {
    queryOnly(req, ['start', 'end'])
    const start = new Date(req.query.start), end = new Date(req.query.end)
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start || end - start > 32 * 86400000) throw fail(400, 'Choose a calendar range of up to 32 days.')
    const result = await upstream(`calendar?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}${tv ? '&includeSeries=true' : ''}`)
    res.json(result.map(tv ? cleanEpisode : cleanTitle))
  })
  router.get('/options', async (req, res) => { queryOnly(req, []); res.json(await options()) })
  router.get('/lookup', async (req, res) => {
    queryOnly(req, ['term'])
    const term = req.query.term?.trim()
    if (!term || term.length < 2 || term.length > 200) throw fail(400, 'Enter a title with 2–200 characters.')
    const [result, existing] = await Promise.all([upstream(`${entity}/lookup?term=${encodeURIComponent(term)}`), library()])
    res.json(result.slice(0, 40).map(item => ({ ...cleanTitle(item), existingId: existing.find(entry => entry[externalKey] === item[externalKey])?.id })))
  })
  router.get('/episodes', async (req, res) => {
    queryOnly(req, ['seriesId'])
    const id = Number(req.query.seriesId)
    if (!tv || !positive(id)) throw fail(400, 'Choose a valid series.')
    res.json((await upstream(`episode?seriesId=${id}`)).map(cleanEpisode))
  })
  router.get('/cover/:id', async (req, res) => {
    queryOnly(req, [])
    const id = Number(req.params.id)
    if (!positive(id) || !base || !apiKey) return res.sendStatus(404)
    try {
      const response = await fetcher(`${base.replace(/\/+$/, '')}/api/v3/mediacover/${id}/poster.jpg`, { headers: { 'X-Api-Key': apiKey }, signal: AbortSignal.timeout(10000), redirect: 'error' })
      const type = response.headers.get('content-type') || ''
      if (!response.ok || !/^image\/(jpeg|png|webp)(;|$)/i.test(type) || Number(response.headers.get('content-length')) > 10 * 1024 * 1024) return res.sendStatus(404)
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.length > 10 * 1024 * 1024) return res.sendStatus(404)
      res.set('Content-Type', type).set('Cache-Control', 'private, max-age=3600').send(bytes)
    } catch { res.sendStatus(404) }
  })
  router.put('/monitor', async (req, res) => {
    const data = strictBody(req, ['kind', 'ids', 'monitored'])
    if (!ids(data.ids) || typeof data.monitored !== 'boolean' || !['title', ...(tv ? ['episodes'] : [])].includes(data.kind)) throw fail(400, 'Select up to 25 titles or episodes and a monitoring state.')
    await upstream(data.kind === 'episodes' ? 'episode/monitor' : `${entity}/editor`, 'PUT', { [data.kind === 'episodes' ? 'episodeIds' : tv ? 'seriesIds' : 'movieIds']: data.ids, monitored: data.monitored })
    revision++; cache.clear()
    res.json({ success: true })
  })
  router.post('/search', async (req, res) => {
    const data = strictBody(req, ['kind', 'ids', 'seasonNumber'])
    if (!ids(data.ids) || !['title', ...(tv ? ['episodes', 'season'] : [])].includes(data.kind) || tv && data.kind !== 'episodes' && data.ids.length !== 1
      || (data.kind === 'season' ? !Number.isSafeInteger(data.seasonNumber) || data.seasonNumber < 0 : 'seasonNumber' in data)) throw fail(400, 'Choose specific titles, episodes or a season to search.')
    const result = await upstream('command', 'POST', tv ? data.kind === 'episodes' ? { name: 'EpisodeSearch', episodeIds: data.ids } : { name: data.kind === 'season' ? 'SeasonSearch' : 'SeriesSearch', seriesId: data.ids[0], ...(data.kind === 'season' ? { seasonNumber: data.seasonNumber } : {}) } : { name: 'MoviesSearch', movieIds: data.ids })
    res.json(fields(result, ['id', 'status', 'name']))
  })
  router.post('/releases', async (req, res) => {
    const data = strictBody(req, ['kind', 'id', 'seasonNumber'])
    if (!positive(data.id) || !(tv ? ['episodes', 'season'] : ['title']).includes(data.kind)
      || (data.kind === 'season' ? !Number.isSafeInteger(data.seasonNumber) || data.seasonNumber < 0 : 'seasonNumber' in data)) throw fail(400, 'Choose an episode, season or movie for interactive search.')
    const target = tv ? data.kind === 'episodes' ? { episodeId: data.id } : { seriesId: data.id, seasonNumber: data.seasonNumber } : { movieId: data.id }
    const result = await upstream(`release?${new URLSearchParams(target)}`, 'GET', undefined, 120000)
    if (!Array.isArray(result)) throw fail(502, `${name} returned an invalid release search. Try searching again.`)
    const now = Date.now()
    for (const [token, entry] of releases) if (now - entry.time >= releaseTTL && !entry.busy) releases.delete(token)
    const records = result.slice(0, 1000).map(item => {
      const token = randomUUID()
      const downloadAllowed = item.downloadAllowed === true && typeof item.guid === 'string' && !!item.guid && positive(item.indexerId)
      if (downloadAllowed) releases.set(token, { time: now, guid: item.guid, indexerId: item.indexerId, target, busy: false })
      return { token, ...fields(item, ['title', 'size', 'indexer', 'seeders', 'leechers', 'age', 'publishDate', 'protocol', 'fullSeason', 'seasonNumber', 'episodeNumbers', 'customFormatScore']),
        quality: item.quality?.quality?.name || 'Unknown quality', languages: (item.languages || []).map(language => language.name),
        customFormats: (item.customFormats || []).map(format => format.name), rejected: item.rejected === true || Boolean(item.rejections?.length),
        rejections: (item.rejections || []).map(String), downloadAllowed,
      }
    })
    while (releases.size > 5000) {
      const oldest = [...releases].find(([, entry]) => !entry.busy)
      if (!oldest) break
      releases.delete(oldest[0])
    }
    res.json({ records, totalRecords: result.length, searchedAt: new Date(now).toISOString(), expiresAt: new Date(now + releaseTTL).toISOString() })
  })
  router.post('/grab', async (req, res) => {
    const data = strictBody(req, ['token'])
    if (typeof data.token !== 'string' || !/^[\da-f-]{36}$/i.test(data.token)) throw fail(400, 'Choose a release from an interactive search.')
    const release = releases.get(data.token)
    if (!release || Date.now() - release.time >= releaseTTL) {
      releases.delete(data.token)
      throw fail(409, 'This release search expired. Search again before downloading.')
    }
    if (release.busy) throw fail(409, 'This release is already being sent to the download client. Check the queue before retrying.')
    release.busy = true
    try {
      const { seasonNumber: _season, ...target } = release.target
      await upstream('release', 'POST', { guid: release.guid, indexerId: release.indexerId, ...target })
      releases.delete(data.token)
      revision++; cache.clear()
      res.json({ success: true })
    } catch (error) {
      if (error.status === 404) {
        releases.delete(data.token)
        throw fail(409, `${name} no longer has this release cached. Search again before downloading.`)
      }
      throw error
    } finally { release.busy = false }
  })
  router.post('/add', async (req, res) => {
    const data = strictBody(req, ['externalId', 'qualityProfileId', 'rootFolderId', 'monitor', 'searchOnAdd', ...(tv ? ['seriesType'] : ['minimumAvailability'])])
    if (![data.externalId, data.qualityProfileId, data.rootFolderId].every(positive) || typeof data.searchOnAdd !== 'boolean'
      || !(tv ? ['all', 'future', 'missing', 'none'] : ['movieOnly', 'none']).includes(data.monitor)
      || tv && !['standard', 'daily', 'anime'].includes(data.seriesType)
      || !tv && !['announced', 'inCinemas', 'released'].includes(data.minimumAvailability)) throw fail(400, 'Choose valid library settings for this title.')
    const [settings, existing, lookup] = await Promise.all([options(), library(), upstream(`${entity}/lookup?term=${tv ? 'tvdb' : 'tmdb'}:${data.externalId}`)])
    const folder = settings.folders.find(item => item.id === data.rootFolderId && item.accessible !== false)
    if (!folder || !settings.profiles.some(item => item.id === data.qualityProfileId)) throw fail(400, 'Choose an accessible root folder and an existing quality profile.')
    if (existing.some(item => item[externalKey] === data.externalId)) throw fail(409, 'This title is already in your library. Refresh to open it.')
    const candidate = lookup.find(item => item[externalKey] === data.externalId)
    if (!candidate) throw fail(404, 'This title could not be found. Search again before adding it.')
    const payload = { ...fields(candidate, ['title', 'titleSlug', 'year', 'images', 'seasons', 'tvdbId', 'tmdbId', 'originalLanguage']),
      rootFolderPath: folder.path, qualityProfileId: data.qualityProfileId, monitored: data.monitor !== 'none',
      ...(tv ? { seriesType: data.seriesType, seasonFolder: true, addOptions: { monitor: data.monitor, searchForMissingEpisodes: data.searchOnAdd && data.monitor !== 'none' } }
        : { minimumAvailability: data.minimumAvailability, addOptions: { monitor: 'movieOnly', searchForMovie: data.searchOnAdd && data.monitor !== 'none' } }),
    }
    const result = await upstream(entity, 'POST', payload)
    revision++; cache.clear()
    res.status(201).json(cleanTitle(result))
  })
  router.use((_req, res) => res.status(404).json({ error: 'Unsupported media operation.' }))
  router.use((error, _req, res, next) => {
    void next
    res.status(error.status || 502).json({ error: error.type === 'entity.too.large' ? 'Media request is too large.' : error.type === 'entity.parse.failed' ? 'Invalid JSON request.' : error.status ? error.message : `${name} returned an invalid update. Retry the connection.` })
  })
  return router
}
