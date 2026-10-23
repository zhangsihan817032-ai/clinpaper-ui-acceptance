import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {ReviewStore} from '../store.mjs';

const site=fileURLToPath(new URL('..',import.meta.url));
const root=await mkdtemp(join(tmpdir(),'ui-review-projects-'));
await mkdir(join(root,'data'));
const initial={version:2,revision:7,updatedAt:'2026-10-20T00:00:00Z',issues:[{id:'CP-001',pageId:'shared-page',platform:'desktop',category:'间距',priority:'P2',title:'TEST CP',actual:'test',expected:'test',recommendation:'test',status:'已解决',runIds:[],history:[]}],runs:[]};
const dbPath=join(root,'data/review.json');
await writeFile(dbPath,JSON.stringify(initial));
let store=await new ReviewStore(dbPath,root).open();
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
async function draft(id,platforms=['ios','android']){
  await mkdir(join(root,'assets/runs',id),{recursive:true});
  await writeFile(join(root,'assets/runs',id,'actual.png'),png);
  await writeFile(join(root,'assets/runs',id,'design.png'),png);
  const asset=`assets/runs/${id}/actual.png`;
  const shot={asset,kind:'actual',label:'TEST runtime',version:'TEST build / device / scale unknown',width:1,height:1,crop:[0,0,1,1],regions:[{rect:[0,0,1,1],label:'test'}]};
  const evidence={asset,coordinates:'TEST 0,0,1,1',visual:{date:'2026-10-22',location:'TEST → TEST',note:'TEST fixture only',actual:shot,design:{...shot,asset:`assets/runs/${id}/design.png`,kind:'figma'}}};
  const issues=platforms.map((platform,n)=>({id:`DXY-00${n+1}`,projectId:'community',pageId:'shared-page',platform,category:'间距',priority:'P2',title:'TEST '+platform,actual:'TEST visible',expected:'TEST design',recommendation:'TEST',evidence,relatedIssueIds:n?['DXY-001']:[]}));
  return {baseRevision:store.db.revision,newIssues:issues,run:{id,projectId:'community',name:'TEST ONLY',date:'2026-10-22',type:'首次验收',scope:'TEST ONLY',conclusion:'TEST ONLY',coverage:Object.fromEntries(platforms.map(p=>[p,'TEST'])),pages:platforms.map(platform=>({id:'shared-page',name:'TEST',platform,status:'已复核',images:[{asset,kind:'actual',version:'TEST build/device/scale unknown'}]})),rounds:[1,2,3].map(n=>({title:'TEST '+n,result:'TEST',note:'TEST',newIssues:n===2?issues.length:0})),findings:issues.map(i=>({issueId:i.id,result:'新增',actual:i.actual,expected:i.expected,note:'TEST ONLY',evidence}))}};
}
test('read-through migration preserves disk and isolates reads',async()=>{
  assert.deepEqual(JSON.parse(await readFile(dbPath)),initial);
  assert.equal(store.snapshot().issues[0].platform,'desktop');
  assert.equal(store.snapshot('community').issues.length,0);
  assert.throws(()=>store.snapshot('unknown'),/项目不存在/);
});
test('multi-platform publish isolates numbering and preserves snapshots',async()=>{
  await store.publish(await draft('dxy-test-initial'),'community');
  assert.equal(store.snapshot('community').issues.length,2);
  assert.equal(store.snapshot().issues.length,1);
  assert.deepEqual(JSON.parse(await readFile(join(root,'data/backups/review-r7.json'))),initial);
  const snapshots=structuredClone(store.db.runs[0].issueSnapshots);
  await store.status('DXY-001','已解决','community');
  assert.equal(store.snapshot('community').issues[1].status,'待处理');
  assert.equal(store.snapshot().issues[0].status,'已解决');
  assert.deepEqual(store.db.runs[0].issueSnapshots,snapshots);
});
test('cross-project writes, findings and associations fail atomically',async()=>{
  const before=await readFile(dbPath,'utf8');
  await assert.rejects(()=>store.status('CP-001','待处理','community'),/问题不存在/);
  await assert.rejects(()=>store.trash('dxy-test-initial',false,'clinpaper'),/批次不存在/);
  const p=await draft('dxy-test-cross',[]);
  p.run.pages=[{id:'shared-page',name:'TEST',platform:'ios',status:'待复核',images:[]}];p.run.coverage={ios:'TEST'};
  p.run.findings=[{issueId:'CP-001',result:'待复核',note:'TEST'}];
  await assert.rejects(()=>store.publish(p,'community'),/项目/);
  p.run.findings=[];p.run.projectId='clinpaper';await assert.rejects(()=>store.publish(p,'community'),/项目/);
  const related=await draft('dxy-test-related',['ios']);related.newIssues[0].id='DXY-003';related.newIssues[0].relatedIssueIds=['CP-001'];related.run.findings[0].issueId='DXY-003';
  await assert.rejects(()=>store.publish(related,'community'),/关联问题/);
  assert.equal(await readFile(dbPath,'utf8'),before);
});
test('screenshots, coverage, platforms and revisions are validated',async()=>{
  const p=await draft('dxy-test-invalid',['ios']);p.newIssues[0].id='DXY-003';p.run.findings[0].issueId='DXY-003';
  const before=await readFile(dbPath,'utf8');
  for(const mutate of [q=>q.baseRevision--,q=>q.run.pages[0].platform='desktop',q=>q.run.coverage={},q=>q.run.pages[0].images[0].kind='source-render',q=>q.run.findings[0].evidence.visual.actual.kind='source-render']){
    const q=structuredClone(p);mutate(q);await assert.rejects(()=>store.publish(q,'community'));
  }
  assert.equal(await readFile(dbPath,'utf8'),before);
});
test('trash/restore, legacy reset and restart keep other project state',async()=>{
  await store.trash('dxy-test-initial',false,'community');assert.ok(store.db.runs[0].deletedAt);
  await store.trash('dxy-test-initial',true,'community');assert.equal(store.db.runs[0].deletedAt,null);
  await store.reset();assert.equal(store.snapshot().issues[0].status,'待处理');
  assert.equal(store.snapshot('community').issues[0].status,'已解决');
  store=await new ReviewStore(dbPath,root).open();assert.equal(store.db.version,3);assert.equal(store.snapshot('community').issues.length,2);
});
test('scoped HTTP compatibility and independent browser synchronization',async()=>{
  await cp(join(site,'assets'),join(root,'assets'),{recursive:true,force:false});
  await cp(join(site,'index.html'),join(root,'index.html'));
  const child=spawn(process.execPath,[join(site,'server.mjs')],{env:{...process.env,PORT:'18886',HOST:'127.0.0.1',REVIEW_ROOT:root,REVIEW_FILE:dbPath,REPORT_USER:'',REPORT_PASSWORD:''},stdio:['ignore','pipe','pipe']});
  let log='';child.stderr.on('data',d=>log+=d);
  try{
    await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error(log||'server exited');})]);
    const origin='http://127.0.0.1:18886';
    const request=async(path,options)=>{const res=await fetch(origin+path,options);return {status:res.status,data:await res.json()};};
    assert.equal((await request('/api/review')).data.issues.length,1);
    assert.equal((await request('/api/projects/community/review')).data.issues.length,2);
    assert.equal((await request('/api/runs/dxy-test-initial')).status,404);
    assert.equal((await request('/api/projects/community/runs/dxy-test-initial')).status,200);
    assert.equal((await request('/api/projects/no-project/review')).status,404);
    assert.equal((await request('/api/status',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'DXY-001',status:'待处理'})})).status,404);
    assert.equal((await request('/api/projects')).data.projects.length,2);
    if(process.env.PLAYWRIGHT_PATH){
      const {chromium}=await import(process.env.PLAYWRIGHT_PATH);
      const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
      try{
        const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
        const pages=await Promise.all(contexts.map(c=>c.newPage()));
        for(const page of pages){page.on('pageerror',e=>console.log('browser error:',e.message));await page.goto(origin+'/index.html#project/community/issues');}
        for(const page of pages)await page.waitForFunction(()=>document.querySelector('#sync-status').textContent==='共享状态已同步');
        await pages[0].locator('[data-issue="DXY-002"][data-status="已解决"]').click();
        await pages[1].waitForFunction(()=>document.querySelector('[data-issue="DXY-002"][data-status="已解决"]')?.getAttribute('aria-pressed')==='true',{},{timeout:10000});
        await pages[1].reload();await pages[1].waitForFunction(()=>document.querySelector('[data-issue="DXY-002"][data-status="已解决"]')?.getAttribute('aria-pressed')==='true');
        assert.equal(await pages[1].locator('[data-issue="CP-001"]').count(),0);
        await pages[0].selectOption('#filter-platform','android');assert.match(pages[0].url(),/platform=android/);assert.equal(await pages[0].locator('.issue').count(),1);
        await pages[0].selectOption('#project-switch','clinpaper');await pages[0].waitForFunction(()=>document.querySelector('.project-context strong')?.textContent==='ClinPaper');
        await pages[0].goto(origin+'/index.html#project/clinpaper/issues');await pages[0].waitForFunction(()=>document.querySelector('[data-issue="CP-001"]'));
        assert.equal(await pages[0].locator('[data-issue="DXY-001"]').count(),0);
        assert.equal((await request('/api/status')).data.statuses['CP-001'],'待处理');
        console.log('two browser contexts synchronized and survived refresh; test data isolated');
      }finally{await browser.close();}
    }
  }finally{if(child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}}
});

test('source-only mobile candidates require provenance and never count as visual verification',async()=>{
  const p=await draft('dxy-test-source',['web-mobile']);
  const id=`DXY-${String(1+Math.max(...store.snapshot('community').issues.map(i=>Number(i.id.split('-').at(-1))))).padStart(3,'0')}`;
  const source={repository:'https://gitlab.dxy.net/f2e/tod/bbs-hybrid-mobile',commit:'a'.repeat(40),path:'src/pages/richtext/index.less',lineStart:1,lineEnd:2,excerpt:'font-size: 23px;'};
  p.run.evidenceMode='source-comparison';p.run.pages[0].status='待复核：缺运行截图';p.run.pages[0].images=[];
  p.newIssues[0].id=id;p.newIssues[0].reviewState='待复核';p.newIssues[0].evidence={...p.newIssues[0].evidence,source};delete p.newIssues[0].evidence.visual;
  p.run.findings[0]={...p.run.findings[0],issueId:id,reviewState:'待复核',evidence:p.newIssues[0].evidence};
  const before=await readFile(dbPath,'utf8');
  const candidate=await store.preview(p,'community');
  assert.equal(candidate.counts.added,1);assert.equal(candidate.counts.pendingReview,2);assert.equal(candidate.issueSnapshots[0].status,'待处理');
  for(const mutate of [q=>delete q.run.evidenceMode,q=>delete q.run.findings[0].reviewState,q=>q.run.findings[0].evidence.source.commit='branch-name',q=>q.run.pages[0].status='已复核']){
    const q=structuredClone(p);mutate(q);await assert.rejects(()=>store.preview(q,'community'));
  }
  assert.equal(await readFile(dbPath,'utf8'),before);
});

test('Android source candidates remain pending and reject frontend repository attribution',async()=>{
  const p=await draft('dxy-test-android-source',['android']);
  const id=`DXY-${String(1+Math.max(...store.snapshot('community').issues.map(i=>Number(i.id.split('-').at(-1))))).padStart(3,'0')}`;
  p.run.evidenceMode='source-comparison';p.run.pages[0].status='待复核：缺运行截图';p.run.pages[0].images=[];
  const issue=p.newIssues[0];issue.id=id;issue.reviewState='待复核';
  issue.evidence={asset:issue.evidence.asset,coordinates:'源码 app/src/main/res/layout/card.xml:1–2',source:{repository:'https://gitlab.dxy.net/android-developer/idxyer-2016',commit:'b'.repeat(40),path:'app/src/main/res/layout/card.xml',lineStart:1,lineEnd:2,excerpt:'android:textSize="@dimen/nsp_11"'}};
  p.run.findings[0]={...p.run.findings[0],issueId:id,reviewState:'待复核',evidence:issue.evidence};
  const before=await readFile(dbPath,'utf8');
  const candidate=await store.preview(p,'community');
  assert.equal(candidate.counts.pendingReview,2);assert.equal(candidate.counts.fixed,0);
  for(const mutate of [q=>q.run.findings[0].evidence.source.repository='https://gitlab.dxy.net/f2e/tod/bbs-hybrid-mobile',q=>q.run.findings[0].evidence.source.path='../private.xml',q=>q.run.pages[0].status='已复核']){
    const q=structuredClone(p);mutate(q);await assert.rejects(()=>store.preview(q,'community'));
  }
  assert.equal(await readFile(dbPath,'utf8'),before);
});

test('Harmony source candidates require their fixed repository and cannot verify runtime',async()=>{
  const p=await draft('dxy-test-harmony-source',['harmony']);
  const id=`DXY-${String(1+Math.max(...store.snapshot('community').issues.map(i=>Number(i.id.split('-').at(-1))))).padStart(3,'0')}`;
  p.run.evidenceMode='source-comparison';p.run.pages[0].status='待复核：缺运行截图';p.run.pages[0].images=[];
  const issue=p.newIssues[0];issue.id=id;issue.reviewState='待复核';
  issue.evidence={asset:issue.evidence.asset,coordinates:'源码 entry/src/main/ets/Card.ets:1–2',source:{repository:'https://gitlab.dxy.net/ohos/idxyer-2024/idxyer-ohos',commit:'c'.repeat(40),path:'entry/src/main/ets/Card.ets',lineStart:1,lineEnd:2,excerpt:'.fontSize(17)'}};
  p.run.findings[0]={...p.run.findings[0],issueId:id,reviewState:'待复核',evidence:issue.evidence};
  const before=await readFile(dbPath,'utf8');
  const candidate=await store.preview(p,'community');
  assert.equal(candidate.counts.added,1);assert.equal(candidate.counts.pendingReview,2);assert.equal(candidate.counts.fixed,0);
  for(const mutate of [q=>q.run.findings[0].evidence.source.repository='https://gitlab.dxy.net/android-developer/idxyer-2016',q=>q.run.findings[0].evidence.source.path='entry/src/../private.ets',q=>q.run.findings[0].evidence.source.commit='develop',q=>delete q.run.findings[0].reviewState,q=>q.run.pages[0].status='已复核',q=>q.run.findings[0].result='已修复']){
    const q=structuredClone(p);mutate(q);await assert.rejects(()=>store.preview(q,'community'));
  }
  assert.equal(await readFile(dbPath,'utf8'),before);
});
