import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFileBrowserProxy } from '../file-browser-proxy.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const directory = await mkdtemp(path.join(tmpdir(), '2ez-files-browser-session-'));
const sessionFile = path.join(directory, 'sessions.json');
let router, server, context, time = Date.now(), logins = 0, renewals = 0, offline = false;
const token = () => `fixture.${Buffer.from(JSON.stringify({ exp: Math.floor((time + 2 * 3600000) / 1000) })).toString('base64url')}.fixture-signature`;
const fetcher = async url => {
  if (offline) throw new Error('Fixture connection failure');
  if (url.endsWith('/login')) { logins++; return new Response(token()); }
  if (url.endsWith('/renew')) { renewals++; return new Response(token()); }
  return Response.json({ isDir: true, path: '/', items: [{ name: 'Documents', isDir: true, size: 0, modified: new Date(time).toISOString() }] });
};
async function start(port = 0) {
  const app = express();
  router = createFileBrowserProxy({ base: 'http://fixture.test', fetcher, now: () => time, sessionFile, renewalIntervalMs: 0 });
  app.use('/files-api', router);
  app.use(express.static(path.resolve('dist')));
  app.get(/.*/, (_req, res) => res.sendFile(path.resolve('dist/index.html')));
  server = await new Promise(resolve => { const listener = app.listen(port, '127.0.0.1', () => resolve(listener)); });
}
async function stop() { router?.closeFileSessions(); if (server) { await new Promise(resolve => server.close(resolve)); server = null; } }
async function openContext(storageState) {
  context = await browser.newContext({ ...(storageState ? { storageState } : {}), viewport: { width: 1680, height: 1120 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.route('**/sys-api/**', route => route.fulfill({ json: [] }));
  await page.route('**/qbt/**', route => route.fulfill({ json: {} }));
  await page.route('**/um-api/**', route => route.fulfill({ json: {} }));
  await page.route('https://**', route => route.abort());
  return page;
}
try {
  await start(); const port = server.address().port; const origin = `http://127.0.0.1:${port}`;
  let page = await openContext(); await page.goto(`${origin}/#files`);
  await page.getByLabel('Username', { exact: true }).fill('fixture-user');
  await page.getByLabel('Password', { exact: true }).fill('fixture-password-not-stored');
  await page.getByRole('button', { name: 'Sign in to File Browser', exact: true }).click();
  await page.getByRole('heading', { name: /^All files/ }).waitFor();
  for (let index = 0; index < 3; index++) { await page.reload(); await page.getByRole('heading', { name: /^All files/ }).waitFor(); }
  assert.equal(logins, 1);
  const state = await context.storageState();
  const cookie = state.cookies.find(item => item.name === 'twoez_files_session');
  assert.ok(cookie?.httpOnly); assert.equal(cookie.sameSite, 'Strict'); assert.ok(cookie.expires * 1000 > Date.now() + 29 * 24 * 3600000);
  assert.equal(JSON.stringify(state).includes('fixture-password-not-stored'), false);
  assert.equal(JSON.stringify(state).includes('fixture-signature'), false);
  assert.equal((await readFile(sessionFile, 'utf8')).includes('fixture-password-not-stored'), false);
  await context.close(); page = await openContext(state); await page.goto(`${origin}/#files`); await page.getByRole('heading', { name: /^All files/ }).waitFor();
  await stop(); await start(port);
  await page.reload(); await page.getByRole('heading', { name: /^All files/ }).waitFor(); assert.equal(logins, 1);
  time += 65 * 60000; await page.reload(); await page.getByRole('heading', { name: /^All files/ }).waitFor(); assert.equal(renewals, 1); assert.equal(logins, 1);
  time += 65 * 60000; offline = true; await page.reload(); await page.getByRole('heading', { name: 'Could not restore your login', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Sign in to File Browser', exact: true }).count(), 0);
  offline = false; await page.getByRole('button', { name: 'Retry connection', exact: true }).click(); await page.getByRole('heading', { name: /^All files/ }).waitFor(); assert.equal(logins, 1);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await page.getByRole('button', { name: 'Sign in to File Browser', exact: true }).waitFor();
  await stop(); await start(port); await page.reload(); await page.getByRole('button', { name: 'Sign in to File Browser', exact: true }).waitFor();
  console.log('Real HttpOnly cookies: repeated page reloads, browser-context restoration, backend restart, proactive token renewal, connection recovery, no stored passwords, and durable logout passed.');
} finally { await context?.close(); await browser.close(); await stop(); await rm(directory, { recursive: true, force: true }); }
