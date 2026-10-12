# Native Sonarr and Radarr pages

Open **Sonarr** or **Radarr** from the sidebar, mobile **More** menu, global service search, Home service links, or Media Automation. Direct entry links are `/#sonarr` and `/#radarr`. Modified clicks on the existing external shortcuts still open the full service UI.

Each page includes a searchable library, monitoring and missing-title filters, sorting, 24-item pagination, a weekly upcoming calendar, download/import queue details, missing items, real health warnings, and the last successful update time. Library rows expand to show a synopsis and file/library information. Sonarr also lists episodes by season, with individual monitoring and searches. Movie calendars distinguish cinema, digital and physical releases. Dates and episode airtimes use the browser's local timezone.

Search confirmations describe the possibility of starting downloads. A successful command submission means **search queued**, not a completed download. Add-title dialogs use the service's actual quality profiles and accessible root folders; choose monitoring, series type or minimum movie availability, and optional immediate search. Immediate search is off by default. Adding unmonitored titles never triggers an immediate search. An interrupted write asks you to check the current library before retrying.

**Automatic search** lets Sonarr or Radarr choose releases according to its profile. Sonarr supports series, individual episodes, and the selected season (including Specials). **Interactive search** searches configured indexers without starting a download and opens a release picker for a movie, episode, or selected season. Sonarr's title-level interactive button searches the season selected in its episode details, because its release API has no whole-series interactive search.

The picker shows quality, custom format score/formats, size, seeders/leechers, indexer, language, publish date, season packs, and automatic rejection reasons. Filter or sort the results, then choose **Download** and confirm the exact release. Manually downloading a rejected release displays its rejection reasons and requires **Download anyway**; releases the service cannot map are unavailable. No release matching, quality or download URL overrides are provided. The service retains control of download clients and imports. Results expire after ten minutes; search again if the service loses its release cache. A successful manual grab means the release was sent to the download client, not that downloading or importing finished. Check the queue before retrying an interrupted grab.

Sonarr and Radarr live widgets are available through Home's widget picker and in Media Automation. Existing quick links continue to work. The pages use the existing 2ez Light, Dark and OLED appearance settings, shared Manrope / DM Mono fonts, borders, and mobile navigation.

## Connection

Set the following in the dashboard's untracked `.env`:

```dotenv
SONARR_BASE=http://127.0.0.1:8989/sonarr
SONARR_API_KEY=
RADARR_BASE=http://127.0.0.1:7878/radarr
RADARR_API_KEY=
```

Use the actual application root, including its URL base if configured, excluding `/api/v3`. Find each API key in its Settings → General. Compose passes these values to the backend. For a local Node server use `node --env-file=.env server.js`. Rebuild and recreate the dashboard container after changing configuration or code. Neither key is embedded in the browser bundle, response payloads, image URLs, or logs.

The `/arr-api/sonarr` and `/arr-api/radarr` routers use the services' v3 APIs, including authenticated media covers. The separate `/arr-api` prefix avoids the production reverse proxy's `/sonarr*` and `/radarr*` full-UI routes. Mutations and explicit interactive searches require same-origin requests and a custom header. The backend validates targets, settings, and specific release selections, and resolves add-title metadata on the server. Interactive results expose random selection tokens; release GUIDs, download/magnet URLs and indexer credentials remain server-side. Up to 1,000 prioritized releases are returned per search; at most 5,000 downloadable selections are held per service, with ten-minute expiry and duplicate-grab prevention. Interactive lookups allow two minutes for indexers and are never polled automatically. Service settings, deletion, manual import, release mapping overrides and download-client administration remain available in **Full Sonarr/Radarr UI**. Retain the dashboard's existing private access restrictions: these routers use server credentials, rather than individual user accounts.

Pages poll every 15 seconds. Library responses cache for 30 seconds and summaries for 15 seconds; mutations invalidate those caches. Quality-profile/root-folder metadata caches for one minute. Cached content is visibly marked when the connection fails, and write controls are disabled. Missing-item counts come from each service's wanted/missing endpoint; Sonarr library progress uses its monitored episode statistics, so those two views can reflect different episode scopes.

Checked against the installed Sonarr **4.0.20.3014** and Radarr **6.4.4.10685** with live read-only requests. API references: [Sonarr](https://sonarr.tv/docs/api/) and [Radarr](https://radarr.video/docs/api/).

## Validation

`node --test tests/arr-proxy.test.js` verifies request validation, private credentials, pagination/filtering, health summaries, automatic episode/season/movie payloads, interactive release targets, canonical grabs, selection expiry, concurrent-grab prevention, additions, error handling and calendar dates.

`node tests/arr.browser.mjs` exercises both native pages with mocked automatic searches and downloads, including interactive release filtering, sorting, pagination, confirmations, exact selections, rejection reasons, unavailable/expired results, search/grab errors, themes and mobile, alongside existing library controls. Set `DASHBOARD_TEST_URL`, `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` for your local browser environment. Live smoke checks use only library reads and interactive lookups; they do not queue automatic searches or download releases.
