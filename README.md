# ClinPaper 样式验收中心与 Skill

同一个验收网站持续记录设计对照、源码走查和修复回归。保留验收批次快照，问题沿用编号；当前状态由 Node 服务持久化并跨浏览器同步。

当前交付快照：2026-10-21，44 条问题、3 个批次，待处理 41、已忽略 3。原始 25 条问题及两个后续批次均保留；不包含本地状态测试历史。报告截图已保存为本地文件。本仓库不包含 ClinPaper 产品源码副本或登录凭据。

## 运行网站

需要 Node.js 22+，无需安装第三方运行依赖。在仓库根目录执行：

```sh
npm start
```

打开 <http://127.0.0.1:8766/index.html#records>。运行完整性检查和隔离测试：

```sh
npm run check
npm test
```

`outputs/clinpaper-ui-style-review/data/review.json` 是当前种子快照。部署后的运行数据库是权威数据，后续更新代码不能用仓库快照覆盖运行数据库。

## 本地预览后再发布

```sh
node outputs/clinpaper-ui-local-workflow/prepare-preview.mjs
node outputs/clinpaper-ui-local-workflow/start-preview.mjs
```

预览地址为 <http://127.0.0.1:8767/index.html#records>，数据库与正式环境隔离。已有预览目录不会被覆盖。修改与新批次先进入预览，用户确认具体版本后才能上线；不自动发布 Git 提交。

发布时读取正式服务最新 revision 和状态、备份，再按 Skill 协议通过 `POST /api/runs` 增量追加批次。不得复制预览数据库覆盖正式状态。详见 [发布规则](outputs/clinpaper-ui-local-workflow/README.md)。

## 使用 Skill

Skill 在 [outputs/clinpaper-ui-acceptance](outputs/clinpaper-ui-acceptance/SKILL.md)。可复制完整文件夹到 Codex 的个人 skills 目录，或当前项目的 `.agents/skills/` 目录。默认支持自动发现，也可明确调用 `$clinpaper-ui-acceptance`。

先读取 `references/clinpaper.md` 并确认当前项目目录和正式服务配置。仓库版使用相对路径，不沿用原电脑的绝对目录。Figma 与 GitLab 登录权限由使用者自己的环境提供，不随 Skill 或仓库上传。

检查范围包括字体、字号、字重、行高、颜色、间距、尺寸与对齐、线条粗细与颜色、圆角。检查中保留旧问题、截图、状态和历史；新问题继续顺延编号。无移动稿时只检查客观响应式问题；源码证据与运行截图分别说明。

## 对外部署

GitHub 仓库用于版本管理，不等于持续运行的网站。GitHub Pages 是静态托管，不能运行本项目的共享状态接口，因此本仓库没有将它冒充为可同步状态的正式部署。

完整部署需要持续运行的 Node 服务、固定 HTTPS 地址，以及持久化数据库和 `assets/runs/`。环境变量支持 `HOST`、`PORT`、`REVIEW_FILE`；只有需要访问保护时才配置 `REPORT_USER` 与 `REPORT_PASSWORD`。数据库和截图应一起备份。只运行一个写入服务实例。

当前尚未配置固定托管。原临时隧道已失效，不能保证原域名可恢复；未经用户指示不自动新建或更换隧道。服务运行中的状态变化不会自动提交回 GitHub。

## 目录

- `outputs/clinpaper-ui-style-review/`：网站代码、持久化种子数据、历史与截图。
- `outputs/clinpaper-ui-acceptance/`：验收 Skill 与无数据恢复模板。
- `outputs/clinpaper-ui-local-workflow/`：独立本地预览工具。
- `docs/outline-comparison.md`、`docs/outline-comparison.csv`：最新大纲设计对 GitLab 固定提交的差异表。
- `tests/`：隔离数据测试，不操作正式站。
