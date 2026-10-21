# ClinPaper 实例定位

- 正式网站目录：仓库根目录下的 `outputs/clinpaper-ui-style-review/`。先定位当前检出根目录；不要套用另一台电脑的绝对路径。开发时不能直接修改正在运行的正式目录。
- 正式服务：该目录 `npm start`；默认 8766，入口 `/index.html#records`。先核对实际运行服务与配置，避免启动两个写入进程。
- 本地预览目录：同级 `clinpaper-ui-style-review-preview`，独立数据库，地址 `http://127.0.0.1:8767/index.html#records`。首次准备运行 `node outputs/clinpaper-ui-local-workflow/prepare-preview.mjs`，之后用 `node outputs/clinpaper-ui-local-workflow/start-preview.mjs` 启动。命令相对路径从上述工作区根目录执行，已有预览不得覆盖。
- 本地确认与发布操作说明：同级 `clinpaper-ui-local-workflow/README.md`。网站代码、问题补充及验收结论先在本地预览，用户确认该版本后才上线。正式状态变更不能被预览副本覆盖。
- 权威数据库：`data/review.json`。旧 `data/status.json` 仅为迁移来源，不再是状态源。配置了 `REVIEW_FILE` 时使用该文件，持久截图目录仍在网站 `assets/runs/`。
- 首批：`cp-20261020-initial`，原报告十八轮合并迁移，25 条问题保留，未拆成虚构的十八次独立验收。
- 产品 URL：`https://sci.dxy.net/paper/create?paperId=3067&flowId=330`。用户提供新项目/流程参数时以新值为准，不固定检查旧病例。
- Figma：`https://www.figma.com/design/N5zqRDIbK57dKR6hX8t2eB/Untitled?node-id=0-1`，PC 基准 1680px。每次读取当前设计确认未变更，不把历史 token 当作永久规范。

| 页面 ID | 页面 | Figma Frame |
| --- | --- | --- |
| review-case | 核对病例资料 | 188:3923 |
| analyze-value | 分析病例价值 | 188:6707 |
| writing-angle | 明确写作思路 | 188:3541 |
| writing-requirements | 补充写作要求 | 188:3665 |
| confirm-outline | 确认大纲 | 188:3788 |
| prepare-literature | 准备正文文献 | 188:6120 |
| write-check | 撰写并检查全文 | 188:3857 |
| export-materials | 导出投稿材料 | 188:3743 |

上表为首批历史映射。2026-10-21 大纲更新已确认新 Frame 为 `194:22133`，源码基准为 GitLab `feat-case @ bdffcb219686fc4172a80549be080ab61f38b392`；本次新增 CP-037–CP-044，保留旧问题而非改写旧稿证据。后续仍应重新读取当前节点，不能固定沿用旧映射或提交。

当前交付共44条问题和3个真实批次。历史最后三步未开放，不代表今后仍不可访问；每次重新判断。当前没有登记移动端稿；先在相关 Figma 范围查找，有稿则补充映射，无稿仅响应式检查。新功能页面增加新 ID 和真实 Frame 映射。

本实例公开分享无访问密码，但新版本须本地预览、用户确认后发布；先前公开授权不代表新版本确认。用户要求固定正式网址。稳定托管账号与域名尚未配置，现有 localhost.run 仅为过渡连接，不自动更换临时域名。固定托管接入后在此记录正式地址，持续复用；不要报告已经具有长期固定网址。
