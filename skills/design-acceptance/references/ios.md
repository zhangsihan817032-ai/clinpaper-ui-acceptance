# iOS 源码解析参考

适用 UIKit、SwiftUI、XIB/Storyboard 及项目实际使用的 Objective-C/Swift。公共规则见 [主流程](../SKILL.md)。

## 页面与布局链

- 确认控制器/视图入口、复用组件、状态分支和实际构建目标；检查运行赋值、复用重置及条件编译。
- UIKit 检查约束是否激活、优先级、冲突、父级约束、intrinsicContentSize、hugging/compression、UIStackView 的 spacing/distribution/alignment 和 layoutMargins。单个 frame 或约束常量不一定是最终尺寸。
- SwiftUI 追踪 modifier 顺序、父容器提议尺寸、frame/padding/offset、alignment、environment、主题及状态；外层修饰与内层修饰不能合并成同一个参数。
- 区分 safeArea、导航栏、scroll inset、系统附加区域及 WebView 容器，不能把系统区域高度全部算成页面间距。

## 字体与资源

字体追踪 UIFont/Font、富文本覆盖、paragraphStyle、基线、行数、截断、minimumScaleFactor 和 Dynamic Type。系统字体与指定字体、设计字号与用户字体放大分开记录。

图片核验 asset catalog 的实际变体、主题、@2x/@3x、原始尺寸、renderingMode、tintColor、contentMode、裁切及占位图。资源名、图片逻辑尺寸和可见图形边界不是同一个量。

## 原生合成图

沿输入数据 → renderer/画布 bounds 与 scale → 背景填充 → 文本/图片绘制区域 → 编码 → 上传 → 展示追踪。区分点坐标、像素坐标、裁切与坐标系转换。

发现固定灰条或留白时核对初始化区域是否全部绘制、是否透明、画布高度与内容高度是否一致，以及后处理和展示背景。当前提交某函数没有灰条，只能排除已核实的该路径，不能据此排除旧版本、其他入口或服务端处理。

## 运行验证与限制

记录 App 版本/构建、完整提交号、设备/模拟器、iOS 版本、原图像素尺寸、屏幕 scale、字体及显示缩放条件。镜像截图的像素不能直接换成 pt；先核对镜像缩放和内容区域。

二次验收判定遵循主流程，核对实际约束、资源、字体及覆盖关系。运行取证受构建或签名限制时如实记录，不用 HTML 重画或设计图冒充原生效果。

WKWebView 内问题同时读 [frontend.md](frontend.md)，拆分宿主与 H5 归属。双图及报告字段见 [report.md](report.md)。
