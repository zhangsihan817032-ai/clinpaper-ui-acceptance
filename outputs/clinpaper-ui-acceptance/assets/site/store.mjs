import { readFile, writeFile, rename, mkdir, stat, realpath, copyFile } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';

export const STATUSES = ['待处理', '已解决', '已忽略'];
const RESULTS = ['新增', '仍存在', '已修复', '待复核'];
const CATEGORIES = ['字体','字重','颜色','间距','尺寸与对齐','线条','圆角'];
const fail = (message, code = 400) => { throw Object.assign(new Error(message), {statusCode:code}); };
const required = (v, name) => { if (typeof v !== 'string' || !v.trim()) fail(`缺少 ${name}`); };
const array = (v, name) => { if (!Array.isArray(v)) fail(`${name} 必须是数组`); };
const notes = (v, name) => { if(v!==undefined && (!Array.isArray(v)||v.some(n=>typeof n!=='string'))) fail(`${name} 必须是字符串数组`); };
const clone = v => structuredClone(v);

export class ReviewStore {
  constructor(path, root) { this.path=path; this.root=root; this.queue=Promise.resolve(); }
  async open() {
    this.db=JSON.parse(await readFile(this.path,'utf8'));
    if (this.db.version!==2 || !Array.isArray(this.db.issues) || !Array.isArray(this.db.runs)) throw new Error('验收数据格式错误，停止启动以避免覆盖数据');
    return this;
  }
  snapshot() { return clone(this.db); }
  statuses() { return {version:1,revision:this.db.revision,updatedAt:this.db.updatedAt,statuses:Object.fromEntries(this.db.issues.map(i=>[i.id,i.status])),issueCount:this.db.issues.length}; }
  mutate(fn, backup=false) {
    const operation=this.queue.then(async()=>{
      const next=clone(this.db);
      const result=await fn(next);
      next.revision=this.db.revision+1;
      next.updatedAt=new Date().toISOString();
      await mkdir(dirname(this.path),{recursive:true});
      if(backup){
        const backupDir=resolve(dirname(this.path),'backups');
        await mkdir(backupDir,{recursive:true});
        await copyFile(this.path,resolve(backupDir,`review-r${this.db.revision}.json`),1).catch(error=>{if(error.code!=='EEXIST')throw error;});
      }
      const temporary=`${this.path}.${process.pid}.tmp`;
      await writeFile(temporary,JSON.stringify(next,null,2)+'\n');
      await rename(temporary,this.path);
      this.db=next;
      return result;
    });
    this.queue=operation.catch(()=>{});
    return operation;
  }
  async status(id,status) {
    if (!STATUSES.includes(status)) fail('无效问题状态');
    await this.mutate(db=>{
      const issue=db.issues.find(i=>i.id===id);
      if (!issue) fail('问题不存在',404);
      if(issue.status!==status) {
        issue.history.push({date:new Date().toISOString(),kind:'手动状态',previousStatus:issue.status,status});
        issue.status=status;
      }
    });
  }
  async reset() { await this.mutate(db=>{for(const i of db.issues) {if(i.status!=='待处理') i.history.push({date:new Date().toISOString(),kind:'手动重置',previousStatus:i.status,status:'待处理'});i.status='待处理';}}); }
  async importStatuses(statuses) {
    await this.mutate(db=>{if(!db.issues.some(i=>i.history.some(h=>h.kind==='手动状态')) && !db.issues.some(i=>i.status!=='待处理')) for(const i of db.issues) if(STATUSES.includes(statuses?.[i.id])) i.status=statuses[i.id];});
  }
  async trash(id,restore=false) {
    await this.mutate(db=>{const run=db.runs.find(r=>r.id===id);if(!run) fail('批次不存在',404);run.deletedAt=restore?null:(run.deletedAt||new Date().toISOString());});
  }
  async checkAsset(asset,runId) {
    if (typeof asset!=='string' || !asset.startsWith(`assets/runs/${runId}/`)) fail(`证据必须保存到本批次目录 assets/runs/${runId}/`);
    const path=resolve(this.root,asset);
    if(relative(resolve(this.root,`assets/runs/${runId}`),path).startsWith('..')) fail('证据路径越界');
    const info=await stat(path).catch(()=>null);
    if(!info?.isFile()) fail(`截图不存在：${asset}`);
    const actual=await realpath(path);
    if(relative(await realpath(resolve(this.root,`assets/runs/${runId}`)),actual).startsWith('..')) fail('不允许跨目录证据符号链接');
    if(!/\.(png|jpe?g|webp|svg)$/i.test(asset)) fail('证据必须为图片');
  }
  async preview(payload) {
    const sandbox=Object.create(this);
    sandbox.db=clone(this.db);
    sandbox.mutate=async fn=>fn(sandbox.db);
    await sandbox.publish(payload);
    return sandbox.db.runs.at(-1);
  }
  async publish(payload) {
    let newRun;
    await this.mutate(async db=>{
      if(payload.baseRevision!==db.revision) fail('数据已更新，请重新读取当前问题和状态后再提交',409);
      const r=clone(payload.run);
      if(!r || !/^[a-z0-9][a-z0-9-]{2,79}$/.test(r.id||'')) fail('批次 ID 无效');
      if(db.runs.some(x=>x.id===r.id)) fail('批次已存在，不允许覆盖历史',409);
      for(const key of ['name','date','type','scope','conclusion']) required(r[key],key);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||Number.isNaN(Date.parse(r.date))) fail('日期格式应为 YYYY-MM-DD');
      if(!['首次验收','修复回归','新功能增量','全流程验收'].includes(r.type)) fail('验收类型无效');
      for(const key of ['desktop','mobile']) required(r.coverage?.[key],`coverage.${key}`);
      array(r.pages,'pages');array(r.rounds,'rounds');array(r.findings,'findings');array(payload.newIssues,'newIssues');
      if(r.rounds.length<3) fail('需记录结构检查、细查和复核至少三轮真实检查');
      for(const round of r.rounds) for(const key of ['title','result','note']) required(round[key],`round.${key}`);
      if(r.rounds.at(-1).newIssues!==0) fail('最后一轮须明确 newIssues: 0，未收敛不能发布');
      for(const p of r.pages) {
        for(const key of ['id','name','platform','status']) required(p[key],`page.${key}`);
        if(!['desktop','mobile'].includes(p.platform)) fail('页面端别无效');
        array(p.images,'page.images');
        notes(p.notes,'page.notes');
        if(p.status==='已复核' && !p.images.length) fail('已复核页面须有实际截图');
        for(const image of p.images) await this.checkAsset(image.asset,r.id);
      }
      let nextId=Math.max(0,...db.issues.map(i=>Number(i.id.slice(3))))+1;
      const newIds=new Set();
      for(const issue of payload.newIssues) {
        if(issue.id!==`CP-${String(nextId++).padStart(3,'0')}`) fail('新问题编号必须从当前最大编号连续顺延');
        for(const key of ['title','pageId','actual','expected','recommendation']) required(issue[key],`issue.${key}`);
        notes(issue.notes,'issue.notes');
        if(!CATEGORIES.includes(issue.category)||!['P0','P1','P2'].includes(issue.priority)||!['desktop','mobile'].includes(issue.platform)) fail('问题类型、优先级或端别无效');
        if(!r.pages.some(p=>p.id===issue.pageId&&p.platform===issue.platform)) fail('新问题需关联本批次对应端别页面');
        await this.checkAsset(issue.evidence?.asset,r.id);
        required(issue.evidence?.coordinates,'issue.evidence.coordinates');
        issue.status='待处理';issue.runIds=[];issue.history=[];
        newIds.add(issue.id);db.issues.push(issue);
      }
      const seen=new Set();
      const counts={added:payload.newIssues.length,fixed:0,reopened:0,pendingReview:r.pages.filter(p=>p.status!=='已复核').length};
      for(const finding of r.findings) {
        const issue=db.issues.find(i=>i.id===finding.issueId);
        if(!issue || seen.has(finding.issueId) || !RESULTS.includes(finding.result)) fail('复核条目 ID、结果无效或重复');
        seen.add(issue.id);required(finding.note,'finding.note');
        if(!r.pages.some(p=>p.id===issue.pageId&&p.platform===(issue.platform||'desktop'))) fail('复核问题需关联本次页面与端别');
        if(newIds.has(issue.id)!==(finding.result==='新增')) fail('新增问题与 findings 不匹配');
        if(finding.result!=='待复核') {
          await this.checkAsset(finding.evidence?.asset,r.id);
          for(const key of ['actual','expected']) required(finding[key],`finding.${key}`);
          required(finding.evidence?.coordinates,'finding.evidence.coordinates');
        }
        if(finding.result==='已修复' && finding.verified!==true) fail('修复通过须明确 verified: true 并提供实际与设计证据');
        const previousStatus=issue.status;
        if(issue.status!=='已忽略') {
          if(finding.result==='已修复') issue.status='已解决';
          if(finding.result==='仍存在') issue.status='待处理';
        }
        if(previousStatus==='待处理' && issue.status==='已解决') counts.fixed++;
        if(previousStatus==='已解决' && issue.status==='待处理') counts.reopened++;
        if(finding.result==='待复核') counts.pendingReview++;
        issue.runIds.push(r.id);
        issue.history.push({...finding,runId:r.id,date:r.date,previousStatus,status:issue.status});
      }
      if([...newIds].some(id=>!seen.has(id))) fail('每个新问题必须包含新增复核条目');
      if(!r.pages.length) fail('批次需要说明实际覆盖页面');
      r.counts=counts;r.deletedAt=null;r.snapshotAt=new Date().toISOString();
      r.issueSnapshots=db.issues.filter(i=>seen.has(i.id)).map(clone);
      r.baseline=Array.isArray(r.baseline)?r.baseline:[];
      db.runs.push(r);newRun=r.id;
    },true);
    return newRun;
  }
}
