import { readFile, writeFile, rename, mkdir, stat, realpath, copyFile } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { PROJECTS, projectOf, platformOf, getProject } from './project-config.mjs';

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
    if (![2,3].includes(this.db.version) || !Array.isArray(this.db.issues) || !Array.isArray(this.db.runs)) throw new Error('验收数据格式错误，停止启动以避免覆盖数据');
    this.needsMigration=this.db.version===2;
    // Read-through migration: no disk write at startup; historical snapshots remain untouched.
    this.db.version=3;
    for(const item of [...this.db.issues,...this.db.runs]) {
      item.projectId=projectOf(item);
      if(!getProject(item.projectId)) throw new Error('未知项目，停止启动');
    }
    return this;
  }
  project(id) {const p=getProject(id);if(!p)fail('项目不存在',404);return p;}
  snapshot(projectId='clinpaper') { this.project(projectId);return {...clone(this.db),projectId,issues:clone(this.db.issues.filter(i=>projectOf(i)===projectId)),runs:clone(this.db.runs.filter(r=>projectOf(r)===projectId))}; }
  projects() {return {revision:this.db.revision,projects:PROJECTS.map(p=>({...clone(p),issueCount:this.db.issues.filter(i=>projectOf(i)===p.id).length,pendingCount:this.db.issues.filter(i=>projectOf(i)===p.id&&i.status==='待处理').length,runCount:this.db.runs.filter(r=>projectOf(r)===p.id&&!r.deletedAt).length}))};}
  statuses(projectId='clinpaper') {const db=this.snapshot(projectId);return {version:1,projectId,revision:db.revision,updatedAt:db.updatedAt,statuses:Object.fromEntries(db.issues.map(i=>[i.id,i.status])),issueCount:db.issues.length}; }
  mutate(fn, backup=false) {
    const operation=this.queue.then(async()=>{
      const next=clone(this.db);
      const result=await fn(next);
      next.revision=this.db.revision+1;
      next.updatedAt=new Date().toISOString();
      await mkdir(dirname(this.path),{recursive:true});
      if(backup||this.needsMigration){
        const backupDir=resolve(dirname(this.path),'backups');
        await mkdir(backupDir,{recursive:true});
        await copyFile(this.path,resolve(backupDir,`review-r${this.db.revision}.json`),1).catch(error=>{if(error.code!=='EEXIST')throw error;});
      }
      const temporary=`${this.path}.${process.pid}.tmp`;
      await writeFile(temporary,JSON.stringify(next,null,2)+'\n');
      await rename(temporary,this.path);
      this.db=next;
      this.needsMigration=false;
      return result;
    });
    this.queue=operation.catch(()=>{});
    return operation;
  }
  async status(id,status,projectId='clinpaper') {
    this.project(projectId);
    if (!STATUSES.includes(status)) fail('无效问题状态');
    await this.mutate(db=>{
      const issue=db.issues.find(i=>i.id===id&&projectOf(i)===projectId);
      if (!issue) fail('问题不存在',404);
      if(issue.status!==status) {
        issue.history.push({date:new Date().toISOString(),kind:'手动状态',previousStatus:issue.status,status});
        issue.status=status;
      }
    });
  }
  async reset(projectId='clinpaper') { this.project(projectId);await this.mutate(db=>{for(const i of db.issues.filter(i=>projectOf(i)===projectId)) {if(i.status!=='待处理') i.history.push({date:new Date().toISOString(),kind:'手动重置',previousStatus:i.status,status:'待处理'});i.status='待处理';}}); }
  async importStatuses(statuses,projectId='clinpaper') {
    this.project(projectId);
    await this.mutate(db=>{const issues=db.issues.filter(i=>projectOf(i)===projectId);if(!issues.some(i=>i.history.some(h=>h.kind==='手动状态')) && !issues.some(i=>i.status!=='待处理')) for(const i of issues) if(STATUSES.includes(statuses?.[i.id])) i.status=statuses[i.id];});
  }
  async trash(id,restore=false,projectId='clinpaper') {
    this.project(projectId);
    await this.mutate(db=>{const run=db.runs.find(r=>r.id===id&&projectOf(r)===projectId);if(!run) fail('批次不存在',404);run.deletedAt=restore?null:(run.deletedAt||new Date().toISOString());});
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
  async preview(payload,projectId=projectOf(payload.run)) {
    const sandbox=Object.create(this);
    sandbox.db=clone(this.db);
    sandbox.mutate=async fn=>fn(sandbox.db);
    await sandbox.publish(payload,projectId);
    return sandbox.db.runs.at(-1);
  }
  async publish(payload,projectId='clinpaper') {
    payload=clone(payload);
    const project=this.project(projectId);
    let newRun;
    await this.mutate(async db=>{
      if(payload.baseRevision!==db.revision) fail('数据已更新，请重新读取当前问题和状态后再提交',409);
      const r=clone(payload.run);
      if(!r || !/^[a-z0-9][a-z0-9-]{2,79}$/.test(r.id||'')) fail('批次 ID 无效');
      if(projectOf(r)!==projectId) fail('批次与入口项目不一致');
      r.projectId=projectId;
      if(db.runs.some(x=>x.id===r.id)) fail('批次已存在，不允许覆盖历史',409);
      for(const key of ['name','date','type','scope','conclusion']) required(r[key],key);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||Number.isNaN(Date.parse(r.date))) fail('日期格式应为 YYYY-MM-DD');
      if(!['首次验收','修复回归','新功能增量','全流程验收'].includes(r.type)) fail('验收类型无效');
      if(!r.coverage||typeof r.coverage!=='object'||Array.isArray(r.coverage))fail('缺少逐端 coverage');
      const allowed=project.platforms.map(p=>p.id);
      const legacy=projectId==='clinpaper';
      for(const [key,value] of Object.entries(r.coverage)) {
        if(!allowed.includes(platformOf({platform:key}))||(!legacy&&['desktop','mobile'].includes(key)))fail('覆盖端别无效');
        required(value,`coverage.${key}`);
      }
      array(r.pages,'pages');array(r.rounds,'rounds');array(r.findings,'findings');array(payload.newIssues,'newIssues');
      if(r.rounds.length<3) fail('需记录结构检查、细查和复核至少三轮真实检查');
      for(const round of r.rounds) for(const key of ['title','result','note']) required(round[key],`round.${key}`);
      if(r.rounds.at(-1).newIssues!==0) fail('最后一轮须明确 newIssues: 0，未收敛不能发布');
      for(const p of r.pages) {
        for(const key of ['id','name','platform','status']) required(p[key],`page.${key}`);
        if(p.projectId&&p.projectId!==projectId)fail('页面与批次项目不一致');
        if(!allowed.includes(platformOf(p))||(!legacy&&['desktop','mobile'].includes(p.platform))) fail('页面端别无效');
        if(!r.coverage[p.platform]&&!r.coverage[platformOf(p)])fail('页面端别缺少覆盖说明');
        array(p.images,'page.images');
        notes(p.notes,'page.notes');
        if(p.status==='已复核' && !p.images.length) fail('已复核页面须有实际截图');
        for(const image of p.images) await this.checkAsset(image.asset,r.id);
        if(projectId==='community'&&p.status==='已复核') {
          if(!p.images.some(image=>image.kind==='actual'&&/\.(png|jpe?g|webp)$/i.test(image.asset)&&typeof image.version==='string'&&image.version.trim()))fail('社区已复核页面须有标明版本的真实运行截图');
        }
      }
      if(r.platformNotes!==undefined){array(r.platformNotes,'platformNotes');for(const n of r.platformNotes){if(!allowed.includes(n.platform)||!['已确认的平台差异','待设计确认'].includes(n.status))fail('平台适配记录无效');required(n.note,'platformNotes.note');if(n.status==='已确认的平台差异')required(n.basis,'platformNotes.basis');}}
      let nextId=Math.max(0,...db.issues.filter(i=>projectOf(i)===projectId).map(i=>Number(i.id.split('-').at(-1))))+1;
      const newIds=new Set();
      for(const issue of payload.newIssues) {
        if(issue.id!==`${project.prefix}-${String(nextId++).padStart(3,'0')}`) fail('新问题编号必须从当前项目最大编号连续顺延');
        if(issue.projectId&&issue.projectId!==projectId)fail('问题与批次项目不一致');
        issue.projectId=projectId;
        for(const key of ['title','pageId','platform','actual','expected','recommendation']) required(issue[key],`issue.${key}`);
        notes(issue.notes,'issue.notes');
        if(!CATEGORIES.includes(issue.category)||!['P0','P1','P2'].includes(issue.priority)||!allowed.includes(platformOf(issue))||(!legacy&&['desktop','mobile'].includes(issue.platform))) fail('问题类型、优先级或端别无效');
        if(!r.pages.some(p=>p.id===issue.pageId&&platformOf(p)===platformOf(issue))) fail('新问题需关联本批次对应端别页面');
        await this.checkAsset(issue.evidence?.asset,r.id);
        required(issue.evidence?.coordinates,'issue.evidence.coordinates');
        issue.status='待处理';issue.runIds=[];issue.history=[];
        newIds.add(issue.id);db.issues.push(issue);
      }
      for(const issue of payload.newIssues) {
        if(issue.relatedIssueIds!==undefined) {
          array(issue.relatedIssueIds,'relatedIssueIds');
          if(new Set(issue.relatedIssueIds).size!==issue.relatedIssueIds.length||issue.relatedIssueIds.some(id=>id===issue.id||!db.issues.some(i=>i.id===id&&projectOf(i)===projectId)))fail('关联问题须为同一项目的其他问题');
        }
      }
      const seen=new Set();
      const sourceAcceptance=r.evidenceMode==='source-acceptance';
      if(sourceAcceptance) {
        required(r.acceptanceBasis,'源码验收口径与用户要求');
        if(projectId!=='community'||r.pages.some(p=>p.platform!=='android'))fail('当前源码验收仅支持社区Android');
        if(r.pages.some(p=>!['源码已复核','待复核'].includes(p.status)))fail('源码验收页面须明确区分源码与运行复核');
      }
      const counts={added:payload.newIssues.length,fixed:0,reopened:0,pendingReview:r.pages.filter(p=>p.status!=='已复核'&&!(sourceAcceptance&&p.status==='源码已复核')).length};
      for(const finding of r.findings) {
        const issue=db.issues.find(i=>i.id===finding.issueId);
        if(!issue || projectOf(issue)!==projectId || seen.has(finding.issueId) || !RESULTS.includes(finding.result)) fail('复核条目 ID、项目、结果无效或重复');
        seen.add(issue.id);required(finding.note,'finding.note');
        if(!r.pages.some(p=>p.id===issue.pageId&&platformOf(p)===platformOf(issue))) fail('复核问题需关联本次页面与端别');
        if(newIds.has(issue.id)!==(finding.result==='新增')) fail('新增问题与 findings 不匹配');
        if(finding.result!=='待复核') {
          await this.checkAsset(finding.evidence?.asset,r.id);
          for(const key of ['actual','expected']) required(finding[key],`finding.${key}`);
          required(finding.evidence?.coordinates,'finding.evidence.coordinates');
          if(projectId==='community') {
            const sourceCandidate=r.evidenceMode==='source-comparison'&&['web-mobile','android','harmony'].includes(issue.platform)&&issue.reviewState==='待复核'&&finding.reviewState==='待复核'&&finding.result==='新增';
            if(sourceCandidate) {
              const source=finding.evidence?.source;
              const repository=issue.platform==='android'?'https://gitlab.dxy.net/android-developer/idxyer-2016':issue.platform==='harmony'?'https://gitlab.dxy.net/ohos/idxyer-2024/idxyer-ohos':'https://gitlab.dxy.net/f2e/tod/bbs-hybrid-mobile';
              const pathPattern=issue.platform==='android'?/^(app|dxycommon)\/[a-zA-Z0-9_./-]+$/:issue.platform==='harmony'?/^entry\/src\/main\/[a-zA-Z0-9_./-]+$/:/^src\/[a-zA-Z0-9_./-]+$/;
              if(!source||source.repository!==repository||!/^[a-f0-9]{40}$/.test(source.commit||'')||!pathPattern.test(source.path||'')||source.path.includes('..')||!Number.isInteger(source.lineStart)||source.lineStart<1||!Number.isInteger(source.lineEnd)||source.lineEnd<source.lineStart)fail('源码候选须包含有效仓库、固定提交和代码行定位');
              required(source.excerpt,'源码摘录');
              if(issue.evidence?.source?.commit!==source.commit||issue.evidence?.source?.path!==source.path)fail('源码候选与新增发现的定位不一致');
            } else if(sourceAcceptance) {
              const source=finding.evidence?.source,design=finding.evidence?.design;
              if(finding.verificationBasis!=='source'||finding.reviewState!=='源码已复核')fail('源码验收须显式标注核验依据，不可冒充运行验证');
              if(!source||source.repository!=='https://gitlab.dxy.net/android-developer/idxyer-2016'||!/^[a-f0-9]{40}$/.test(source.commit||'')||!/^(app|dxycommon)\/[a-zA-Z0-9_./-]+$/.test(source.path||'')||source.path.includes('..')||!Number.isInteger(source.lineStart)||source.lineStart<1||!Number.isInteger(source.lineEnd)||source.lineEnd<source.lineStart)fail('源码验收缺少固定提交和有效代码位置');
              required(source.excerpt,'源码验收摘录');
              required(source.resolution,'源码生效链与资源解析依据');
              if(design?.kind!=='figma'||!/\.(png|jpe?g|webp)$/i.test(design.asset||''))fail('源码验收须提供当前设计图');
              required(design.version,'设计读取版本');required(finding.evidence.figmaNode,'设计节点');
              await this.checkAsset(design.asset,r.id);
            } else {
              const actual=finding.evidence?.visual?.actual;
              if(actual?.kind!=='actual'||!/\.(png|jpe?g|webp)$/i.test(actual.asset||''))fail('社区非待复核发现须有真实运行截图对照，不接受源码或重放图');
              required(actual.version,'运行截图版本信息');
              await this.checkAsset(actual.asset,r.id);
            }
          }
        }
        if(finding.result==='已修复' && finding.verified!==true) fail('修复通过须明确 verified: true 并提供实际与设计证据');
        const previousStatus=issue.status;
        if(issue.status!=='已忽略') {
          if(finding.result==='已修复') issue.status='已解决';
          if(finding.result==='仍存在') issue.status='待处理';
        }
        if(previousStatus==='待处理' && issue.status==='已解决') counts.fixed++;
        if(previousStatus==='已解决' && issue.status==='待处理') counts.reopened++;
        if(finding.result==='待复核'||finding.reviewState==='待复核') counts.pendingReview++;
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
