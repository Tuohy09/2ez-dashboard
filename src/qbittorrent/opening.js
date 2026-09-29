const ROTATE_MS = 45000;
const STALL_MS = 30000;
const COMPLETION_MS = 45000;
const downloadStates = new Set(['downloading', 'forcedDL', 'stalledDL', 'metaDL', 'forcedMetaDL', 'queuedDL']);

const lines = {
  quiet: [
    'Hmm, bit quiet in here. Been busy, mate?',
    'Nothing downloading. Suspiciously responsible of you.',
    'Your bandwidth has filed a missing person report.',
  ],
  one: ['One little download. As a treat.', 'Bringing one home.', 'Just the one? Look at your self-control.'],
  few: ['{count} on the go. Lovely little operation.', 'The bits are coming in nicely.', 'A few things cooking. Don’t touch the router.'],
  many: ['{count} downloading. The router would like a word.', 'Everything, everywhere, all downloading.', 'Your hard drive didn’t consent to this.'],
  queued: ['{count} in the queue. Form an orderly download.', 'Take a number. The bandwidth’s busy.', '{count} waiting. Apparently we’re collecting these now.'],
  stalled: [
    'All queued up and no peer to go.',
    'A peer-reviewed study in going absolutely nowhere.',
    'Waiting for a seed. Have you tried watering it?',
    'Nobody’s sharing. Someone tell the internet’s mum.',
    'Your download is currently a long-distance relationship.',
    'Schrödinger’s download: technically active, spiritually absent.',
  ],
  completed: ['That’s landed. Go on, have a look.', '{count} finished. We do occasionally complete things.', 'Job done. Try enjoying it before adding another.'],
  seeding: ['Nothing coming in. Just giving back, like a legend.', 'You’re the seed someone else is praying for.', 'Quietly keeping someone else’s progress bar alive.'],
  waiting: ['Waiting for the next bit.'],
  metadata: ['Finding out what we’ve signed up for.'],
  checking: ['A little quality control. Back in a bit.'],
  error: ['{count} needs a hand. Check the errored transfers.'],
};

export function openingCounts(torrents) {
  const counts = { downloading: 0, queued: 0, stalled: 0, metadata: 0, checking: 0, seeding: 0, stopped: 0, error: 0, completed: 0 };
  for (const item of Object.values(torrents)) {
    const state = item.state || 'unknown';
    if (item.progress >= 1) counts.completed++;
    if (['error', 'missingFiles', 'unknown'].includes(state)) counts.error++;
    else if (/checking|allocating|moving/i.test(state)) counts.checking++;
    else if (/^(paused|stopped)/.test(state)) counts.stopped++;
    else if (/^queued/.test(state)) counts.queued++;
    else if (state === 'stalledDL' && !(item.dlspeed > 0)) counts.stalled++;
    else if (/UP$|uploading/.test(state)) counts.seeding++;
    else if (/metaDL|forcedMetaDL/.test(state)) counts.metadata++;
    else counts.downloading++;
  }
  return counts;
}

export function advanceOpening(previous, torrents, now, random = Math.random) {
  const counts = openingCounts(torrents);
  // Treat reconnects as a new observation: stale data cannot prove a sustained stall
  // or that a newly imported, already-complete torrent just finished downloading.
  const continuous = previous && now - previous.observedAt <= 10000;
  const stalledSince = {};
  let finished = 0;
  for (const [hash, item] of Object.entries(torrents)) {
    const before = continuous ? previous.torrents[hash] : null;
    if (['stalledDL', 'metaDL', 'forcedMetaDL'].includes(item.state) && !(item.dlspeed > 0)) {
      stalledSince[hash] = before && item.progress === before.progress && item.downloaded === before.downloaded
        ? previous.stalledSince[hash] ?? now : now;
    }
    if (before && before.progress < 1 && item.progress >= 1 && downloadStates.has(before.state)
      && /^(uploading|forcedUP|stalledUP|queuedUP|stoppedUP|pausedUP)$/.test(item.state)) finished++;
  }
  let completion = continuous && previous.completion?.until > now ? previous.completion : null;
  if (finished) completion = { count: (completion?.count || 0) + finished, until: now + COMPLETION_MS };
  const waitingForPeers = counts.stalled + counts.metadata;
  const sustainedStall = waitingForPeers > 0 && Object.keys(stalledSince).length === waitingForPeers
    && Object.values(stalledSince).every(start => now - start >= STALL_MS);
  const mode = counts.error ? 'error' : completion ? 'completed'
    : counts.downloading >= 6 ? 'many' : counts.downloading >= 2 ? 'few' : counts.downloading === 1 ? 'one'
    : counts.checking ? 'checking' : sustainedStall ? 'stalled'
    : counts.metadata ? 'metadata' : counts.stalled ? 'waiting' : counts.queued ? 'queued'
    : counts.seeding ? 'seeding' : 'quiet';
  const pool = lines[mode];
  const sameMode = previous?.mode === mode;
  const rotate = sameMode && now - previous.rotatedAt >= ROTATE_MS;
  const index = sameMode ? (previous.index + (rotate ? 1 : 0)) % pool.length : Math.floor(random() * pool.length);
  const count = mode === 'completed' ? completion.count : mode === 'queued' ? counts.queued : counts.downloading;
  const title = pool[index].replace('{count}', mode === 'error' ? `${counts.error} ${counts.error === 1 ? 'transfer' : 'transfers'}` : count)
    .replace('transfers needs', 'transfers need');
  const labels = { downloading: 'downloading', queued: 'queued', stalled: 'stalled', metadata: 'getting metadata', checking: 'checking / moving', seeding: 'seeding', stopped: 'stopped', error: 'errored', completed: 'completed' };
  const summary = Object.entries(counts).filter(([, value]) => value > 0).map(([key, value]) => `${value} ${labels[key]}`).join(' · ') || '0 downloading · 0 queued · 0 completed';
  return { torrents, observedAt: now, stalledSince, completion, mode, index, rotatedAt: sameMode && !rotate ? previous.rotatedAt : now, title, summary, counts };
}
