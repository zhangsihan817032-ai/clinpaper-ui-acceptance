# 统一验收网站数据与发布

## 数据源与读写

`GET /api/review` 返回 version、revision、updatedAt、issues、runs。先读取并备份，revision 用于提交时防止覆盖并发变更。运行一个 Node 写入实例，持久化数据库和 `assets/runs/`；本地缓存仅离线兜底。

`GET /api/runs` 列正常批次，`?deleted=true` 列回收站；`GET /api/runs/:id` 读详情，删除后返回 410。`DELETE /api/runs/:id` 仅可恢复删除，`POST /api/runs/:id/restore` 恢复。没有问题删除、批次覆盖或永久清空接口。

`GET/PUT /api/status` 沿用旧接口；PUT `{id,status}`。状态为待处理/已解决/已忽略。`DELETE /api/status` 是重置当前状态，不能把它当作删除批次，不要在验收中调用。`GET /api/events` 保留兼容，网页默认 3 秒轮询，按服务端 revision 更新。

## 本地草稿与确认

先在隔离的预览目录与预览服务保存本次批次，不能直接修改正式网站。本站本地预览地址为 `http://127.0.0.1:8767`，正式本机服务为 8766。修改网页代码也只在预览目录进行。预览数据库独立；状态、删除与恢复测试不得影响正式数据。

完成本地校验后提供预览链接、变更范围和验证结果，用户明确确认该版本后才执行正式发布。以下接口格式在两套环境相同，但确认前只能向预览环境写入。

## 批次格式

`POST /api/runs` 接收：

```json
{
  "baseRevision": 1,
  "newIssues": [],
  "run": {
    "id": "cp-20261022-body-fix",
    "name": "病例正文修复回归",
    "date": "2026-10-22",
    "type": "修复回归",
    "scope": "核对病例资料正文，CP-001",
    "coverage": {"desktop": "1680px；病例正文首中尾段", "mobile": "本次未覆盖产品移动端"},
    "conclusion": "依据真实检查结果填写，不能照抄示例",
    "pages": [{
      "id": "review-case", "name": "核对病例资料", "platform": "desktop", "status": "已复核",
      "figmaNode": "188:3923",
      "images": [{"asset": "assets/runs/cp-20261022-body-fix/actual-body.png", "label": "实际页面 · 正文"}],
      "notes": ["记录视口、DPR、计算样式与实际检查范围"]
    }],
    "rounds": [
      {"title": "结构检查", "result": "依据实查填写", "note": "实际覆盖和结果", "newIssues": 0},
      {"title": "参数与像素细查", "result": "依据实查填写", "note": "实际测量与发现", "newIssues": 0},
      {"title": "完整复核", "result": "无新增", "note": "真实复查结果与未覆盖项", "newIssues": 0}
    ],
    "baseline": [{"name": "正文", "value": "当前 Figma 16px / 400 / 1.6"}],
    "findings": [{
      "issueId": "CP-001", "result": "已修复", "verified": true,
      "actual": "16px / 400 / 25.6px", "expected": "16px / 400 / 1.6",
      "note": "仅在确实逐段验证通过后记录",
      "evidence": {"asset": "assets/runs/cp-20261022-body-fix/actual-body.png", "coordinates": "x 450 y 410 w 875 h 690", "figmaNode": "188:3936"}
    }]
  }
}
```

示例参数不是已完成检查，必须替换为真实测量和存在的截图。type 只取首次验收/修复回归/新功能增量/全流程验收；platform 为 desktop/mobile；页面 status 为已复核或具体待复核说明。rounds 至少三轮，最后一轮 `newIssues: 0`。

新问题放在 newIssues：必含 id（从当前最大 CP 编号顺延）、pageId、platform、category、priority、title、actual、expected、recommendation、evidence，可有 notes。category：字体/字重/颜色/间距/尺寸与对齐/线条/圆角；priority：P0/P1/P2。每个新问题须有 result 为“新增”的 finding，禁止重新登记历史同一问题。

findings.result：新增/仍存在/已修复/待复核；issueId 必须存在且不可重复。非待复核项须有 actual、expected、note、evidence（asset 和 coordinates）；已修复另需 `verified: true`。问题需匹配本次 pages 的 ID 和端别。原始问题不覆盖，新测量写入 finding 与复核历史。

服务端自动计算新增、修复、复发、待复核项数，生成 issueSnapshots 和 snapshotAt，客户端不得提供可信计数或快照。待复核项数为待复核页面数加待复核问题数，不代表去重页面数。未覆盖问题状态不变；已忽略问题不自动改状态。

## 素材与提交

截图按 `assets/runs/<runId>/` 存放。页面图与当次 finding 必须属于本批次；问题原始证据仍可引用最初批次，以保留历史。归档图片发布后不覆盖。

列表可使用轻量预览，点击查看原图。具备 sharp 时，可运行 `node scripts/build-previews.mjs --site /absolute/site --run RUN_ID --sharp /absolute/path/to/sharp` 生成预览和映射；原图不会被修改。可选 evidence.preview 或图片 preview 也可指定本地预览，缺失时回退原图。不要以压缩预览替换原始验收证据。

在网站目录执行：

```bash
node scripts/publish-run.mjs --site /absolute/preview-site --origin http://127.0.0.1:8767 --input /absolute/draft.json --assets /absolute/captures
node scripts/check-integrity.mjs /absolute/preview-site
```

captures 中的相对文件路径须与草稿资产路径对应，且只能包含图片，不能使用符号链接。使用 `--assets` 时仅复制新文件，存在同名异内容文件则拒绝覆盖。素材已准备时可用 `--check` 校验而不发布，不能同时传 `--assets`。

服务端在 data/backups 下保存发布前数据库，再把整批问题、状态变化和历史作为一个原子事务保存，保存成功后才对外展示。校验失败不会产生半条批次；素材文件可保留等待草稿修正。409 后重新读取 revision、编号及状态，复核后重试。不得直接改写服务运行中的 review.json，不能覆盖同一批次。

成功后返回 `index.html#run/<runId>` 路径；验收入口始终为 `index.html#records`。脚本会更新目标环境的离线副本。本地预览是同一网站的草稿环境，不是另建历史记录网站。

## 用户确认后正式发布

备份正式代码与数据，重新读取线上 revision、问题最大编号和共享状态，对比本地草稿期间发生的线上变化并复核后再提交。保留原始批次草稿与截图，通过正式服务 `POST /api/runs` 增量发布，不复制预览数据库或离线副本覆盖正式状态。已确认的代码修改按差异发布，去除本地预览标识；不把测试状态、测试批次或未确认的新改动一起上线。离线副本由正式服务重新生成。

正式入口使用配置的固定 HTTPS 网址；没有稳定托管配置时明确说明，不能通过不断更换临时域名来满足固定网址要求。未经确认不得发布新版本或自动创建新隧道。

## 交付检查

逐页核对截图、Figma 映射、筛选计数；查看历史快照不随当前状态变化；用两个独立浏览器验证状态同步和刷新持久化。批次删除/恢复及服务重启测试使用隔离数据库，不在正式网站添加虚构验收批次。验证公网页面和本批次链接后再交付，不承诺隧道能长期稳定运行。
