# ClinPaper 样式验收中心

运行 `npm start`，打开 `http://127.0.0.1:8766/index.html#records`。无需安装依赖，使用 Node.js 22 或更新版本。

同一网站提供验收记录、批次快照、当前问题和回收站。问题不提供删除功能，验收批次可删除与恢复。页面每 3 秒同步一次，服务端保存状态；静态打开使用离线副本并明确标注仅本机。

## 数据与迁移

`data/review.json` 是唯一权威数据源，包含当前问题、状态、复核历史及不可改写的批次快照。`data/status.json` 是旧版迁移来源，保留用于回溯，不再用于运行时保存。原报告和状态备份在工作目录 `work/backups/unified-site-before/report/`。

现有 25 条问题合并迁移为 `cp-20261020-initial`，保留十八轮记录、8 个页面、截图和原状态。迁移时刻的状态作为首个批次快照，未推测历史上每轮的状态。

图片存入 `assets/runs/<批次ID>/`，发布后不得覆盖。数据库通过串行事务和临时文件 rename 原子保存；失败不替换内存和已发布数据。只运行一个写入服务实例。长期托管须同时持久化数据库和截图目录。

## 新验收批次

读取 `/api/review` 的 `revision` 作为草稿 `baseRevision`。按 Skill 的 `references/report-contract.md` 准备 JSON 与截图后运行：

```bash
node scripts/publish-run.mjs --site /absolute/path/to/site --origin http://127.0.0.1:8766 --input /absolute/path/to/draft.json --assets /absolute/path/to/captures
node scripts/check-integrity.mjs /absolute/path/to/site
```

已准备素材时使用 `--check`（不能同时指定 `--assets`）进行只读校验。发布失败不会创建半条批次，已复制的素材保留用于重试；相同文件可复用，不同内容拒绝覆盖。409 表示有新的状态变更或批次，应重读数据并复核草稿后重试，不能盲目覆盖版本号。

## 服务接口

- `GET /api/review`：完整当前数据；`GET /api/runs`：正常批次，`?deleted=true`：回收站。
- `POST /api/runs`：原子追加批次、问题和复核，服务器计算计数及历史快照。
- `GET /api/runs/:id`：详情；已删除返回 410；`DELETE /api/runs/:id`：可恢复删除；`POST /api/runs/:id/restore`：恢复。
- `GET/PUT/DELETE /api/status`、`POST /api/status/import` 和 `GET /api/events` 保留旧版兼容；重置只修改当前状态，历史快照不变。

## 部署

默认公开访问，不设访问密码。环境变量：`PORT`（8766）、`HOST`（0.0.0.0）、`REVIEW_FILE`（持久数据库绝对路径）。可选 `REPORT_USER` 和 `REPORT_PASSWORD` 同时配置后启用 Basic Auth。纯静态托管不能保存跨设备状态。

优先更新现有稳定主机；没有稳定主机时，可用 HTTPS 隧道连接 8766 端口。临时地址只在电脑、Node 服务和隧道运行期间有效，可能被服务商轮换；不将其写死到 Skill。

