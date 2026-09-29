const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})});
const page=await browser.newPage({viewport:{width:1920,height:1080},reducedMotion:'reduce'});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const a='a'.repeat(40),b='b'.repeat(40),c='c'.repeat(40);
let torrents={ [a]:{hash:a,name:'Ubuntu 24.04 Desktop',state:'downloading',progress:.724,size:5700000000,total_size:5700000000,completed:4100000000,category:'Linux',tags:'keep-seeding',dlspeed:19500000,upspeed:284000,eta:84,ratio:.08,save_path:'/downloads/linux',num_seeds:24,num_leechs:8,added_on:1790500000,dl_limit:0,up_limit:0,ratio_limit:-2,seeding_time_limit:-2,inactive_seeding_time_limit:-2}, [b]:{hash:b,name:'Fedora Workstation',state:'stoppedDL',progress:.418,size:2300000000,category:'Linux',tags:'',dlspeed:0,upspeed:0,eta:8640000,save_path:'/downloads/linux'},[c]:{hash:c,name:'Big Buck Bunny',state:'uploading',progress:1,size:1400000000,category:'Open media',tags:'keep-seeding',dlspeed:0,upspeed:820000,save_path:'/downloads/media'} };
const posts=[];let rid=0;let fail=false;
const prefs={dl_limit:1024000,up_limit:512000,alt_dl_limit:204800,alt_up_limit:102400,save_path:'/downloads',temp_path_enabled:false,temp_path:'/incomplete',preallocate_all:false,auto_tmm_enabled:false,listen_port:6881,upnp:false,max_connec:500,max_connec_per_torrent:100,dht:true,pex:true,lsd:false,queueing_enabled:true,max_active_downloads:3,max_active_uploads:5,max_active_torrents:8,dont_count_slow_torrents:true,max_ratio_enabled:false,max_ratio:2,max_seeding_time_enabled:false,max_seeding_time:1440};
await page.route('**/qbt/api/v2/**',async route=>{
 const req=route.request();const url=new URL(req.url());const endpoint=url.pathname.split('/api/v2/')[1];
 if(fail)return route.fulfill({status:403,body:'Forbidden'});
 if(req.method()==='POST'){
  posts.push({endpoint,body:req.postData()||''});const data=new URLSearchParams(req.postData()||'');
  if(endpoint==='torrents/delete')for(const hash of data.get('hashes').split('|'))delete torrents[hash];
  if(endpoint==='torrents/stop')for(const hash of data.get('hashes').split('|'))torrents[hash].state='stoppedDL';
  if(endpoint==='torrents/start')for(const hash of data.get('hashes').split('|'))torrents[hash].state='downloading';
  if(endpoint==='torrents/rename')torrents[data.get('hash')].name=data.get('name');
  return route.fulfill({status:200,body:endpoint==='torrents/add'?'Ok.':''});
 }
 let data={};
 if(endpoint==='app/version')return route.fulfill({status:200,body:'v5.2.3'});
 if(endpoint==='sync/maindata')data={full_update:true,rid:++rid,torrents,categories:{Linux:{savePath:'/downloads/linux'},'Open media':{savePath:'/downloads/media'}},tags:['keep-seeding'],server_state:{dl_info_speed:32400000,up_info_speed:2100000,free_space_on_disk:212000000000,connection_status:'connected',use_alt_speed_limits:false}};
 if(endpoint==='app/preferences')data=prefs;
 if(endpoint==='transfer/info')data={dl_info_speed:32400000,up_info_speed:2100000};
 if(endpoint==='torrents/info')data=Object.values(torrents);
 if(endpoint==='torrents/properties')data={seeding_time:120,comment:'Example data'};
 if(endpoint==='torrents/files')data=[{index:0,name:'ubuntu-desktop.iso',size:5700000000,progress:.724,priority:1}];
 if(endpoint==='torrents/trackers')data=[{url:'https://tracker.example.org/announce',tier:0,status:2,num_seeds:24,msg:''}];
 if(endpoint==='sync/torrentPeers')data={peers:{'192.0.2.10:6881':{ip:'192.0.2.10',port:6881,client:'qBittorrent',progress:1,dl_speed:1000000,up_speed:200000}}};
 return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
});
try {
 await page.goto(process.env.DASHBOARD_TEST_URL || 'http://127.0.0.1:5173');
 await page.locator('.nav-item').filter({hasText:'qBittorrent'}).click();
 const view=name=>page.getByRole('button',{name,exact:true});
 await view('Ubuntu 24.04 Desktop').click();
 await page.getByRole('checkbox',{name:'Select Ubuntu 24.04 Desktop',exact:true}).check();
 await page.locator('.nav-footer').getByRole('button',{name:'Dark',exact:true}).click();
 await page.waitForTimeout(2700);
 assert.equal(await view('Split workspace').getAttribute('aria-pressed'),'true');
 const history=page.getByRole('region',{name:'Transfer history for Ubuntu 24.04 Desktop'});
 assert.ok((await history.textContent()).includes('18.6 MiB/s peak'), 'History uses torrent speed, not the 30.9 MiB/s global speed');
 assert.equal(await history.locator('polyline').count(),2);
 const detailBox=await page.locator('.qb-detail').boundingBox(), historyBox=await history.boundingBox();
 assert.ok(historyBox.y>=detailBox.y+detailBox.height, 'History is below selected transfer');
 await page.evaluate(() => window.scrollTo(0, 0));
 await page.screenshot({path:resolve('artifacts/2ez-qbittorrent-layout-bottom-built.png'),fullPage:true});
 await view('Transfer desk').click();
 await page.getByRole('dialog',{name:'Selected transfer',exact:true}).waitFor();
 assert.ok(await page.getByRole('region',{name:'Transfer history for Ubuntu 24.04 Desktop'}).isVisible());
 await page.getByRole('tab',{name:'Files',exact:true}).click();
 await page.getByRole('combobox',{name:'Priority for ubuntu-desktop.iso',exact:true}).selectOption('6');
 await page.getByRole('status').filter({hasText:'File priority updated.'}).waitFor();
 assert.equal(new URLSearchParams(posts.at(-1).body).get('hash'),a);
 await view('Change location').click();
 await page.getByRole('dialog').last().getByRole('button',{name:'Close dialog',exact:true}).click();
 assert.equal(await page.getByRole('dialog').count(),1,'Nested form returns to drawer');
 await page.getByRole('tab',{name:'Overview',exact:true}).click();
 await page.evaluate(() => window.scrollTo(0, 0));
 await page.screenshot({path:resolve('artifacts/2ez-qbittorrent-layout-dense-built.png'),fullPage:true});
 await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
 await view('Status board').click();
 await view('Ubuntu 24.04 Desktop').click();
 assert.equal(await page.getByRole('checkbox',{name:'Select Ubuntu 24.04 Desktop',exact:true}).isChecked(),true);
 assert.ok(await page.locator('.qb-transfer-card.expanded .qb-activity').isVisible());
 await view('Ubuntu 24.04 Desktop').click();assert.equal(await page.locator('.qb-inspector').count(),0,'Card details toggle closed');
 await view('Ubuntu 24.04 Desktop').click();
 await page.getByRole('button',{name:/^Downloading 1 on this page/}).click();
 assert.equal(await page.locator('.qb-inspector').count(),0,'Group collapses details too');
 await view('Show selected transfer').click();assert.ok(await page.locator('.qb-transfer-card.expanded .qb-activity').isVisible());
 await view('Fedora Workstation').click();
 assert.equal(await page.locator('.qb-inspector').count(),1);
 assert.ok((await page.locator('.qb-activity').textContent()).includes('0 B/s peak'),'New selection does not inherit previous torrent history');
 await page.getByRole('searchbox',{name:'Find a torrent',exact:true}).fill('Ubuntu');
 await view('Show selected transfer').click();assert.ok(await page.locator('.qb-transfer-card.expanded .qb-activity').isVisible());
 await view('Ubuntu 24.04 Desktop').click();
 await page.getByRole('tab',{name:'Trackers',exact:true}).click();await page.getByText('https://tracker.example.org/announce',{exact:true}).waitFor();
 await page.getByRole('tab',{name:'Peers',exact:true}).click();await page.getByText('192.0.2.10:6881',{exact:true}).waitFor();
 await page.getByRole('tab',{name:'Overview',exact:true}).click();
 await page.evaluate(() => window.scrollTo(0, 0));
 await page.screenshot({path:resolve('artifacts/2ez-qbittorrent-layout-cards-built.png'),fullPage:true});
 await page.locator('.qb-bulk').getByRole('button',{name:'Stop',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Selected torrents updated.'}).waitFor();
 assert.equal(posts.at(-1).endpoint,'torrents/stop');assert.equal(new URLSearchParams(posts.at(-1).body).get('hashes'),a);
 await page.locator('.qb-transfer-card.expanded').waitFor();assert.equal(await page.locator('.qb-transfer-card.expanded .qb-activity').count(),1,'Inspector follows transfer changing groups');
 for(const mode of ['Light','Dark','OLED']) {
  await page.locator('.nav-footer').getByRole('button',{name:mode,exact:true}).click();
  for(const name of ['Transfer desk','Split workspace','Status board']) {
   await view(name).click();
   if(name==='Transfer desk')await page.keyboard.press('Escape');
   for(const width of [1920,1440,1024,768,390,320]) { await page.setViewportSize({width,height:1080});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} ${mode} overflow at ${width}`); }
   await page.setViewportSize({width:1920,height:1080});
  }
 }
 await view('Status board').click();await page.reload();await page.locator('.nav-item').filter({hasText:'qBittorrent'}).click();
 assert.equal(await view('Status board').getAttribute('aria-pressed'),'true','Layout persists after reload');
 await view('Ubuntu 24.04 Desktop').click();
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(() => window.scrollTo(0, 0));
 await page.screenshot({path:resolve('artifacts/2ez-qbittorrent-layout-mobile-built.png'),fullPage:true});
 await page.setViewportSize({width:1920,height:1080});
 for(let i=0;i<52;i++){const hash=i.toString(16).padStart(40,'0');torrents[hash]={...torrents[b],hash,name:`Archive ${String(i).padStart(2,'0')}`};}
 await view('Refresh ↻').click();await view('Show selected transfer').waitFor();await view('Show selected transfer').click();
 assert.ok((await page.locator('.qb-pagination').textContent()).includes('2 / 2'),'Selected transfer is revealed on its page');
 assert.ok(await page.locator('.qb-transfer-card.expanded .qb-activity').isVisible());
 fail=true;await view('Refresh ↻').click();await page.getByRole('alert').filter({hasText:'access denied'}).first().waitFor();assert.equal(await view('+ Add torrent').isDisabled(),true);
 fail=false;torrents={};await view('Retry').click();await page.getByText('No torrents yet. Add a magnet link or torrent file to get started.',{exact:true}).waitFor();
 assert.equal(await page.locator('.qb-inspector').count(),0);
 assert.deepEqual(errors,[]);console.log('All three layouts: saved view, selection, per-transfer history, collapsible cards/groups, drawer/nested dialog, bulk actions, themes, responsive sizing, errors and empty states passed.');
} finally { await browser.close(); }
