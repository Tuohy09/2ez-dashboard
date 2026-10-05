const modified = '2026-10-03T14:32:00Z';
const folder = (name, parent = '/') => ({ name, path: `${parent === '/' ? '' : parent}/${name}`, isDir: true, size: 0, modified });
const file = (name, size, parent, type = '') => ({ name, path: `${parent}/${name}`, isDir: false, size, modified, type });
export const demoFiles = {
  '/': [folder('Music'), folder('Movies'), folder('Photos'), folder('Documents'), folder('Backups'), folder('Downloads'), file('readme.md', 1420, ''), file('docker-compose.yml', 3240, '')],
  '/Music': [folder('Tycho', '/Music'), folder('Bonobo', '/Music'), folder('Boards of Canada', '/Music'), folder('Nils Frahm', '/Music'), file('library.m3u', 4320, '/Music')],
  '/Music/Tycho': [folder('Awake', '/Music/Tycho'), folder('Dive', '/Music/Tycho'), folder('Epoch', '/Music/Tycho')],
  '/Music/Tycho/Awake': [file('01 - Awake.flac', 42358016, '/Music/Tycho/Awake', 'audio'), file('02 - Montana.flac', 38568960, '/Music/Tycho/Awake', 'audio'), file('03 - L.flac', 32112640, '/Music/Tycho/Awake', 'audio'), file('04 - Dye.flac', 36280729, '/Music/Tycho/Awake', 'audio'), file('05 - See.flac', 40994406, '/Music/Tycho/Awake', 'audio'), file('06 - Apogee.flac', 39321600, '/Music/Tycho/Awake', 'audio'), file('07 - Spectre.flac', 37014732, '/Music/Tycho/Awake', 'audio'), file('08 - Plains.flac', 30932992, '/Music/Tycho/Awake', 'audio'), file('cover.jpg', 843776, '/Music/Tycho/Awake', 'image'), file('album.nfo', 1240, '/Music/Tycho/Awake', 'text')],
  '/Documents': [folder('Homelab', '/Documents'), file('backup-plan.md', 3820, '/Documents'), file('network-map.txt', 1640, '/Documents')],
  '/Photos': [folder('2026', '/Photos'), folder('2025', '/Photos')],
  '/Downloads': [], '/Backups': [folder('Daily', '/Backups'), folder('Monthly', '/Backups')],
  '/Movies': [folder('Animation', '/Movies'), folder('Documentaries', '/Movies')],
};
export const demoText = '# Awake\n\nArtist: Tycho\nReleased: 2014\nFormat: FLAC · lossless\n\n8 tracks · 36 minutes\n\nKeep cover.jpg alongside the audio files.\nThe music library watches this folder.';
export function demoListing(path) { return { name: path.split('/').pop() || 'All files', path, isDir: true, items: demoFiles[path] || [] }; }
