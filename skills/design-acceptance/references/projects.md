# 项目、源码与报告入口

本文件集中维护固定入口。下列地址从已有验收配置继承，登记日期为 2026-10-23；使用前检查访问、目录与服务实际情况，不将登记视为当次连通验证。

## 项目与源码

| 项目 / projectId / 编号 | 端别键 | 默认源码入口 |
| --- | --- | --- |
| 丁香园社区 / community / DXY | ios | https://gitlab.dxy.net/ios-developer/dxyer |
| 丁香园社区 / community / DXY | android | https://gitlab.dxy.net/android-developer/idxyer-2016 |
| 丁香园社区 / community / DXY | harmony | https://gitlab.dxy.net/ohos |
| 丁香园社区 / community / DXY | web-mobile、web-pc | https://gitlab.dxy.net/f2e/tod/bbs-hybrid-mobile |
| ClinPaper / clinpaper / CP | web-mobile、web-pc | https://gitlab.dxy.net/f2e/tod/clinic-paper |

鸿蒙地址为仓库组，不能直接当可 clone 仓库；先定位具体项目，无法唯一定位时询问。社区 PC 先确认目标页面是否在所列 Hybrid 仓库，不能假定全部 PC 页面在此。

仓库固定、版本不固定。沿用当次任务明确的目标版本，否则查看现有记录及分支/标签后再确定；不默认旧 11.10.5。记录完整提交号和固定提交的文件定位，访问受限时如实说明已读与未读范围。

## 默认设计入口

- [丁香园社区设计文件](https://www.figma.com/design/3u1UKn9czqHZeqBeq3w6ej/Untitled?node-id=0-1)
- [ClinPaper 设计文件](https://www.figma.com/design/N5zqRDIbK57dKR6hX8t2eB/Untitled?node-id=0-1)

根节点只是入口；验收记录必须定位到本次实际对比的 frame/组件/状态，用户另有指定时使用其当次要求。

## 唯一工作入口

| 环境 | 入口 | 已登记目录 |
| --- | --- | --- |
| 多项目预览 | http://127.0.0.1:8786/index.html#projects | `/Users/dingxiangyuan/Documents/Codex/2026-10-22/yo/outputs/ui-style-review-preview` |

用户于 2026-10-23 明确：后续只在多项目预览中进行。该环境同时承载社区与 ClinPaper，走查、补图、登记、复核、状态维护与交付均以此为准。名称虽保留“预览”，它已是当前日常工作环境，不再要求完成后转到正式站。其数据、素材和状态必须持久保留，不能当成可随时重置的测试副本。

服务使用该目录的 `data/review.json`、`assets/runs/` 及备份。启动或维护前读取所在旧工作区适用的 AGENTS.md 和部署说明，确认端口、进程及服务根目录，不启动第二个数据库写入进程。历史目录的写权限按实际环境处理；本项目维护流程不自动搬迁服务。

项目页面使用 `index.html#project/<projectId>/records`、`issues`、`run/<runId>`；端别使用 `?platform=ios` 等参数。旧无项目路由及 `/api/...` 仅兼容 ClinPaper，不用于社区写入。

用户反映问题消失时，先核对项目、端别、处理状态、页面与搜索条件，再查实时项目数据、批次及回收站。不重置状态、不建空库、不用旧预览覆盖恢复。

项目与端别决定开发团队，社区前端与 ClinPaper 前端分开。Hybrid 实现归属按 [主流程](../SKILL.md) 记录，当前服务字段及历史处理见 [report.md](report.md)。

## 历史参考（不参与日常写入）

以下只为追溯既有数据和部署保留，不列为日常交付入口：

- 旧正式站：端口 8766；目录 `/Users/dingxiangyuan/Documents/Codex/2026-10-20/https-sci-dxy-net-paper-create/outputs/clinpaper-ui-style-review`；登记的 launchd 服务为 `net.dxy.clinpaper.ui-review`。
- 旧 ClinPaper 预览：端口 8767；目录为旧正式目录同级的 `clinpaper-ui-style-review-preview`。

各环境数据库独立。2026-10-23 的本地核对发现，旧正式库的 CP-083～CP-104 及部分批次未出现在多项目预览，旧 ClinPaper 预览还有 CP-105～CP-119 未出现在旧正式库；这只是按编号比对的历史差异，不代表已经确认独有问题或完成合并。暂存为待核对事项，不因切换工作入口而删除、停服、覆盖或自动导入。确需历史核对时只读访问旧环境，不能把旧库作为整库恢复来源。

不记录永久问题总数，日常以多项目预览实时数据与筛选条件为准；不能将入口切换表述为“历史内容已全部迁入”。用户后续明确要求切换其他环境、迁移或清理时，再按具体范围执行。
