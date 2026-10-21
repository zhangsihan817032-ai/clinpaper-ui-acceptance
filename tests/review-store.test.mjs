import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ReviewStore } from '../outputs/clinpaper-ui-style-review/store.mjs';

await mkdir('work',{recursive:true});
const root=await mkdtemp(resolve('work/unified-test-'));
const seed=JSON.parse(await readFile('outputs/clinpaper-ui-style-review/data/review.json','utf8'));
// The original suite exercises a 25-issue baseline, independent of later real batches.
seed.issues=seed.issues.slice(0,25);
seed.runs=[seed.runs.find(r=>r.id==='cp-20261020-initial')];
const storePath=join(root,'review.json');
await writeFile(storePath,JSON.stringify(seed));
const store=await new ReviewStore(storePath,root).open();
const makePayload=async(id,result='已修复',issueId='CP-001')=>{
  const dir=join(root,`assets/runs/${id}`);await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'actual.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844"><rect width="390" height="844" fill="#eee"/></svg>');
  const evidence={asset:`assets/runs/${id}/actual.svg`,coordinates:'x 10 y 10 w 100 h 100',figmaNode:'188:3936'};
  return {baseRevision:store.db.revision,newIssues:[],run:{id,name:'隔离测试批次',date:'2026-10-21',type:'修复回归',scope:'病例解析正文',coverage:{desktop:'1680px 已复核',mobile:'无稿，仅响应式；本批次未覆盖'},conclusion:'隔离测试',pages:[{id:'review-case',name:'核对病例资料',platform:'desktop',status:'已复核',images:[{...evidence,label:'实际页面'}],notes:[]}],rounds:[{title:'结构',result:'完成',note:'结构检查',newIssues:0},{title:'细查',result:'完成',note:'参数检查',newIssues:0},{title:'复核',result:'无新增',note:'完整复查',newIssues:0}],findings:[{issueId,result,note:'由实际和设计证据复核',actual:'16px / 400 / 25.6px',expected:'16px / 400 / 1.6',verified:true,evidence}]}};
};

test('two batches preserve historical snapshots, fixed/reopened/ignored and uncovered statuses',async()=>{
  const original=structuredClone(store.db.runs[0]);
  const statusesBefore=store.statuses().statuses;
  const first=await makePayload('test-first');
  first.run.pages.push({...first.run.pages[0],id:'analyze-value',name:'分析病例价值'});
  first.run.findings.push({...first.run.findings[0],issueId:'CP-004'});
  await store.publish(first);
  assert.equal(store.db.issues[0].status,'已解决');
  assert.equal(store.db.issues.find(i=>i.id==='CP-004').status,'已忽略');
  assert.equal(store.db.issues.find(i=>i.id==='CP-002').status,statusesBefore['CP-002']);
  const frozen=structuredClone(store.db.runs.at(-1));
  const second=await makePayload('test-second','仍存在');
  await store.publish(second);
  assert.equal(store.db.issues[0].status,'待处理');
  assert.equal(store.db.runs.at(-1).counts.reopened,1);
  assert.deepEqual(store.db.runs[1],frozen);
  assert.deepEqual(store.db.runs[0],original);
  await store.status('CP-001','已解决');
  assert.deepEqual(store.db.runs[1],frozen);
  const before=store.statuses().statuses;
  await store.trash('test-first');
  assert.deepEqual(store.statuses().statuses,before);
  await store.trash('test-first',true);
  assert.deepEqual(store.db.runs[1],frozen);
});
test('stale revision and invalid evidence leave database and issue count unchanged',async()=>{
  const p=await makePayload('test-invalid');const initial=store.snapshot();
  p.baseRevision--;await assert.rejects(store.publish(p),/数据已更新/);assert.deepEqual(store.snapshot(),initial);
  p.baseRevision=store.db.revision;p.run.findings[0].evidence.asset='assets/runs/test-invalid/missing.png';
  await assert.rejects(store.publish(p),/截图不存在/);assert.deepEqual(store.snapshot(),initial);
  p.run.findings[0].evidence.asset='assets/runs/test-first/actual.svg';
  await assert.rejects(store.publish(p),/本批次目录/);assert.deepEqual(store.snapshot(),initial);
});
test('new feature issue gets next ID and mobile responsive finding is preserved',async()=>{
  const p=await makePayload('test-new-feature','新增','CP-026');
  p.run.type='新功能增量';p.run.pages[0].platform='mobile';p.run.pages[0].figmaNode=null;p.run.coverage.mobile='无移动端稿，仅检查客观响应式；390×844 横向溢出';
  p.newIssues=[{id:'CP-026',pageId:'review-case',title:'移动端横向溢出',platform:'mobile',category:'尺寸与对齐',priority:'P1',actual:'390px 视口滚动宽度 450px',expected:'无横向溢出',recommendation:'收敛最小宽度',evidence:p.run.findings[0].evidence}];
  await store.publish(p);assert.equal(store.db.issues.length,26);assert.equal(store.db.issues.at(-1).platform,'mobile');assert.equal(store.db.runs.at(-1).counts.added,1);
});
test('pending review and unresolved never falsely close issues; invalid fix rejected',async()=>{
  await store.status('CP-001','待处理');
  let p=await makePayload('test-unresolved','仍存在');await store.publish(p);assert.equal(store.db.issues[0].status,'待处理');
  p=await makePayload('test-pending','待复核');delete p.run.findings[0].evidence;await store.publish(p);assert.equal(store.db.issues[0].status,'待处理');
  p=await makePayload('test-unverified');p.run.findings[0].verified=false;const initial=store.snapshot();await assert.rejects(store.publish(p),/verified/);assert.deepEqual(store.snapshot(),initial);
});
test('queue prevents concurrent writes from losing updates, restart restores state',async()=>{
  await Promise.all([store.status('CP-001','已解决'),store.status('CP-002','已忽略')]);
  const again=await new ReviewStore(storePath,root).open();assert.equal(again.db.issues[0].status,'已解决');assert.equal(again.db.issues[1].status,'已忽略');
});
test('persistence failure rolls back in-memory publication',async()=>{
  const bad=Object.create(store);bad.db=store.snapshot();bad.queue=Promise.resolve();bad.path=join(root,'review.json/invalid.json');const original=bad.snapshot();
  await assert.rejects(bad.status('CP-001','待处理'));assert.deepEqual(bad.snapshot(),original);
});
test('HTTP status compatibility, batch delete/restore and cross-client sync',async()=>{
  const port=18767;
  await mkdir(join(root,'data'),{recursive:true});
  const servicePath=join(root,'data/review.json');await writeFile(servicePath,JSON.stringify(store.snapshot()));
  const child=spawn(process.execPath,[resolve('outputs/clinpaper-ui-style-review/server.mjs')],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',REVIEW_FILE:servicePath,REVIEW_ROOT:root},stdio:['ignore','pipe','pipe']});
  try{
    await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(new Error(`server exit ${code}`)));setTimeout(()=>reject(new Error('server startup timeout')),5000).unref();});
    const base=`http://127.0.0.1:${port}`;
    const call=async(path,options={})=>{const res=await fetch(base+path,{...options,headers:{'Content-Type':'application/json',...options.headers}});return {code:res.status,data:await res.json()};};
    assert.equal((await call('/api/health')).data.issueCount,26);
    assert.equal((await call('/api/status')).data.version,1);
    await call('/api/status',{method:'PUT',body:JSON.stringify({id:'CP-001',status:'已忽略'})});
    assert.equal((await call('/api/status')).data.statuses['CP-001'],'已忽略');
    const original=(await call('/api/runs/test-second')).data;
    await call('/api/runs/test-second',{method:'DELETE'});
    assert.equal((await call('/api/runs/test-second')).code,410);
    assert.equal((await call('/api/status')).data.statuses['CP-001'],'已忽略');
    await call('/api/runs/test-second/restore',{method:'POST'});
    assert.deepEqual((await call('/api/runs/test-second')).data,original);
    const cross=await call('/api/status',{method:'PUT',headers:{Origin:'https://unrelated.example'},body:JSON.stringify({id:'CP-001',status:'待处理'})});assert.equal(cross.code,403);
    assert.equal((await call('/data/status.json')).code,404);
    const draft=await makePayload('test-cli');draft.baseRevision=(await call('/api/review')).data.revision;
    const draftFile=join(root,'draft.json');await writeFile(draftFile,JSON.stringify(draft));
    const captures=join(root,'captures');await mkdir(captures);await writeFile(join(captures,'actual.svg'),await readFile(join(root,'assets/runs/test-cli/actual.svg')));
    const script=resolve('outputs/clinpaper-ui-style-review/scripts/publish-run.mjs');
    await promisify(execFile)(process.execPath,[script,'--site',root,'--input',draftFile,'--check']);
    const result=await promisify(execFile)(process.execPath,[script,'--site',root,'--origin',base,'--input',draftFile,'--assets',captures]);
    assert.equal(JSON.parse(result.stdout).id,'test-cli');
    assert.equal((await call('/api/runs/test-cli')).code,200);
    assert((await readFile(join(root,'assets/offline-snapshot.js'),'utf8')).includes('test-cli'));
    console.log(`Isolated HTTP checks passed: ${root}`);
  }finally{child.kill('SIGTERM');}
});
