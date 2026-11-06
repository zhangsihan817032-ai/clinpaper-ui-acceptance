import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {ReviewStore} from '../store.mjs';
import {platformOf} from '../project-config.mjs';

const site=fileURLToPath(new URL('..',import.meta.url));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const matrix=[
  ['community','android','https://gitlab.dxy.net/android-developer/idxyer-2016','app/src/main/res/layout/card.xml'],
  ['community','ios','https://gitlab.dxy.net/ios-developer/dxyer','src/Feed/Card.swift'],
  ['community','harmony','https://gitlab.dxy.net/ohos/idxyer-2024/idxyer-ohos','entry/src/main/ets/Card.ets'],
  ['community','web-pc','https://gitlab.dxy.net/f2e/tod/bbs-hybrid-mobile','src/pages/index/index.less'],
  ['community','web-mobile','https://gitlab.dxy.net/f2e/tod/bbs-hybrid-mobile','src/pages/richtext/index.less'],
  ['clinpaper','web-pc','https://gitlab.dxy.net/f2e/tod/clinic-paper','src/components/Card.tsx'],
  ['clinpaper','web-mobile','https://gitlab.dxy.net/f2e/tod/clinic-paper','src/components/Card.tsx'],
];

async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'source-review-all-platforms-'));
  const issues=matrix.map(([projectId,platform],n)=>({id:`${projectId==='community'?'DXY':'CP'}-${String(n+1).padStart(3,'0')}`,projectId,platform,pageId:'test-page',category:'字体',priority:'P2',title:'TEST ONLY',actual:'TEST old',expected:'TEST design',recommendation:'TEST',evidence:{asset:'historical.png'},status:'待处理',runIds:[],history:[]}));
  await mkdir(join(root,'data'));
  const dbPath=join(root,'data/review.json');
  await writeFile(dbPath,JSON.stringify({version:3,revision:1,updatedAt:'2026-10-27T00:00:00Z',issues,runs:[]}));
  return {root,dbPath,store:await new ReviewStore(dbPath,root).open()};
}
async function draft(ctx,projectId,id){
  const dir=join(ctx.root,'assets/runs',id);
  await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'design.png'),png);
  const asset=`assets/runs/${id}/design.png`;
  const issues=ctx.store.snapshot(projectId).issues;
  return {baseRevision:ctx.store.db.revision,newIssues:[],run:{
    id,projectId,name:'TEST source review',date:'2026-10-27',type:'修复回归',scope:'TEST ONLY',conclusion:'TEST ONLY',evidenceMode:'source-acceptance',acceptanceBasis:'TEST source versus design',
    coverage:Object.fromEntries(issues.map(i=>[i.platform,'TEST ONLY'])),
    pages:issues.map(i=>({id:i.pageId,name:'TEST ONLY',platform:i.platform,status:'源码已复核',images:[]})),
    rounds:[1,2,3].map(n=>({title:`TEST ${n}`,result:'TEST',note:'TEST fixture, not a product review',newIssues:0})),
    findings:issues.map(i=>{const [, ,repository,path]=matrix.find(([p,s])=>p===projectId&&s===platformOf(i));return {
      issueId:i.id,result:'已修复',reviewState:'源码已复核',verificationBasis:'source',verified:true,actual:'TEST source matches',expected:'TEST design',note:'TEST source only, no runtime assertion',
      evidence:{asset,coordinates:'TEST source line1',figmaNode:'3:1',source:{repository,path,commit:'a'.repeat(40),lineStart:1,lineEnd:2,excerpt:'TEST source',resolution:'TEST actual reference and override chain'},design:{asset,kind:'figma',version:'TEST Figma read date and node'}},
    };}),
  }};
}

test('all seven project/platform pairs publish source acceptance, persist and preserve history',async()=>{
  const c=await fixture();
  for(const project of ['community','clinpaper']){
    const other=project==='community'?'clinpaper':'community';
    const untouched=c.store.snapshot(other);
    await c.store.publish(await draft(c,project,`test-source-${project}`),project);
    const run=c.store.snapshot(project).runs.at(-1);
    assert.equal(run.counts.fixed,project==='community'?5:2);
    assert.equal(run.counts.pendingReview,0);
    for(const i of c.store.snapshot(project).issues){
      assert.equal(i.status,'已解决');assert.equal(i.actual,'TEST old');assert.equal(i.history.length,1);
      assert.equal(i.history[0].verificationBasis,'source');assert.equal(i.history[0].verified,true);
    }
    assert.deepEqual(c.store.snapshot(other).issues,untouched.issues);
    assert.deepEqual(c.store.snapshot(other).runs,untouched.runs);
  }
  const snapshots=structuredClone(c.store.db.runs);
  await c.store.status('DXY-001','待处理','community');
  assert.deepEqual(c.store.db.runs,snapshots);
  const reopened=await draft(c,'community','test-source-reopen');
  reopened.run.findings[0].result='仍存在';reopened.run.findings[0].verified=false;
  await c.store.publish(reopened,'community');
  const restart=await new ReviewStore(c.dbPath,c.root).open();
  assert.equal(restart.snapshot('community').issues[0].status,'待处理');
  assert.equal(restart.snapshot('clinpaper').issues[0].status,'已解决');
  assert.deepEqual(restart.db.runs.slice(0,2),snapshots);
});

test('each platform rejects wrong provenance, incomplete proof and false runtime claims atomically',async()=>{
  const c=await fixture();
  for(const [project,platform] of matrix){
    const p=await draft(c,project,`test-invalid-${project}-${platform}`);
    const n=p.run.findings.findIndex(f=>c.store.db.issues.find(i=>i.id===f.issueId).platform===platform);
    const before=await readFile(c.dbPath,'utf8');
    const invalid=[
      f=>f.evidence.source.repository='https://gitlab.dxy.net/wrong/project',
      f=>f.evidence.source.path='src/../private.swift',
      f=>f.evidence.source.path='src//Card.tsx',
      f=>f.evidence.source.path='src/./Card.tsx',
      f=>f.evidence.source.path='../../private.swift',
      f=>f.evidence.source.path=platform==='android'?'src/Card.tsx':platform==='harmony'?'src/Card.ets':platform==='ios'?'app/Card.kt':'app/src/main/Card.kt',
      f=>f.evidence.source.commit='master',
      f=>f.evidence.source.lineStart=0,
      f=>f.evidence.source.lineEnd=0,
      f=>f.evidence.source.lineEnd=1.5,
      f=>f.evidence.source.excerpt=' ',
      f=>delete f.evidence.source.resolution,
      f=>f.evidence.design.kind='actual',
      f=>f.evidence.design.asset=f.evidence.design.asset.replace('design.png','missing.png'),
      f=>f.evidence.design.asset='assets/runs/other/design.png',
      f=>f.evidence.design.version='',
      f=>delete f.evidence.figmaNode,
      f=>f.verificationBasis='runtime',
      f=>f.reviewState='已复核',
      f=>f.verified=false,
    ];
    for(const mutate of invalid){const q=structuredClone(p);mutate(q.run.findings[n]);await assert.rejects(()=>c.store.publish(q,project),e=>e.statusCode===400);}
    for(const mutate of [q=>q.baseRevision--,q=>q.run.pages[0].status='已复核',q=>q.run.projectId=project==='community'?'clinpaper':'community']){
      const q=structuredClone(p);mutate(q);await assert.rejects(()=>c.store.publish(q,project));
    }
    assert.equal(await readFile(c.dbPath,'utf8'),before);
  }
});

test('mixed source conclusions keep uncertain and ignored items pending/ignored without extra statuses',async()=>{
  const c=await fixture();
  await c.store.status('DXY-003','已忽略','community');
  const p=await draft(c,'community','test-mixed-source');
  const f=p.run.findings[1];
  Object.assign(f,{result:'待复核',reviewState:'待复核',verified:false,note:'TEST dependency unavailable; keep pending'});
  p.run.pages[1].status='待复核';
  const q=structuredClone(p);q.run.findings[1].verified=true;
  await assert.rejects(()=>c.store.publish(q,'community'),/不可标记通过/);
  await c.store.publish(p,'community');
  const issues=c.store.snapshot('community').issues;
  assert.equal(issues[0].status,'已解决');assert.equal(issues[1].status,'待处理');assert.equal(issues[2].status,'已忽略');
  assert.ok(issues.every(i=>['待处理','已解决','已忽略'].includes(i.status)));
});

test('legacy ClinPaper platforms normalize; cross-project findings and symlink evidence remain rejected',async()=>{
  const c=await fixture();
  c.store.db.issues.find(i=>i.id==='CP-006').platform='desktop';
  c.store.db.issues.find(i=>i.id==='CP-007').platform='mobile';
  const p=await draft(c,'clinpaper','test-legacy-source');
  p.run.findings[0].evidence.source.path='src/components/Card.tsx';
  p.run.findings[1].evidence.source.path='src/components/Card.tsx';
  assert.equal((await c.store.preview(p,'clinpaper')).counts.fixed,2);
  const q=structuredClone(p);q.run.findings[0].issueId='DXY-001';
  await assert.rejects(()=>c.store.preview(q,'clinpaper'),/项目/);
  await writeFile(join(c.root,'outside.png'),png);
  await symlink(join(c.root,'outside.png'),join(c.root,'assets/runs/test-legacy-source/escape.png'));
  const s=structuredClone(p);s.run.findings[0].evidence.design.asset='assets/runs/test-legacy-source/escape.png';
  await assert.rejects(()=>c.store.preview(s,'clinpaper'),/符号链接/);
});

test('existing scoped HTTP API publishes both projects and synchronizes source status via events',async()=>{
  const c=await fixture();
  const p=await draft(c,'community','test-http-source-community');
  const child=spawn(process.execPath,[join(site,'server.mjs')],{env:{...process.env,PORT:'18887',HOST:'127.0.0.1',REVIEW_ROOT:c.root,REVIEW_FILE:c.dbPath,REPORT_USER:'',REPORT_PASSWORD:''},stdio:['ignore','pipe','pipe']});
  let errors='';child.stderr.on('data',d=>errors+=d);
  const abort=new AbortController();
  try{
    await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error(errors||'server exited');})]);
    const origin='http://127.0.0.1:18887';
    const events=await fetch(origin+'/api/projects/community/events',{signal:abort.signal});
    const reader=events.body.getReader();
    await reader.read();
    const send=async(project,payload)=>{const res=await fetch(`${origin}/api/projects/${project}/runs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});assert.equal(res.status,201,JSON.stringify(await res.clone().json()));return res.json();};
    const result=await send('community',p);assert.equal(result.revision,2);
    const stream=new TextDecoder().decode((await reader.read()).value);
    assert.match(stream,/"DXY-002":"已解决"/);
    const read=async project=>(await fetch(`${origin}/api/projects/${project}/review`)).json();
    assert.ok((await read('community')).issues.every(i=>i.status==='已解决'));
    assert.ok((await read('clinpaper')).issues.every(i=>i.status==='待处理'));
    c.store=await new ReviewStore(c.dbPath,c.root).open();
    await send('clinpaper',await draft(c,'clinpaper','test-http-source-clinpaper'));
    assert.ok((await read('clinpaper')).issues.every(i=>i.status==='已解决'));
    const restart=await new ReviewStore(c.dbPath,c.root).open();
    assert.equal(restart.db.runs.length,2);assert.ok(restart.db.issues.every(i=>i.status==='已解决'));
  }finally{abort.abort();if(child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}}
});
