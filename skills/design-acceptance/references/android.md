# Android 源码解析参考

适用 XML/View 与 Jetpack Compose，按项目实际实现选择。公共规则见 [主流程](../SKILL.md)。

## 生效配置与调用链

- 固定目标 variant、flavor、buildType、入口页面和状态，确认实际命中的源码与资源集。
- View 追踪 layout → style/theme/TextAppearance/控件默认值 → 运行赋值、BindingAdapter、selector、复用重置和自定义 View 绘制。
- 资源需核实 values、night、sw、方向及 flavor 等限定条件和引用链；名为 nsp、ndp 或带数字的资源名不能直接当成 sp/dp 实测值。
- Compose 追踪 composable 参数、Material/theme 默认值、LocalTextStyle、状态与 Modifier 顺序；尺寸、padding、背景、裁切、点击区域的顺序会改变结果。

## 字体、布局与图片

字体核验 textSize 的来源及 setTextSize 的实际单位，结合 density、scaledDensity、fontScale；检查 fontFamily、字重、includeFontPadding、lineSpacing、基线、行数、省略与 autoSize。不要把 sp 直接当截图像素。

布局核验 ConstraintLayout 约束、比例、weight、min/max、内外边距、itemDecoration、默认控件 inset。Compose 额外区分默认最小触摸尺寸、容器尺寸与可见图形尺寸；触摸区域大于图标不一定是视觉偏差。

图片核验 drawable/mipmap 的密度变体、矢量 viewport、tint、scaleType/ContentScale、可见边界和占位状态。Bitmap/Canvas 合成追踪密度、画布尺寸、绘制坐标、背景填充、导出及最终展示，避免将容器背景误判为生成图像素。

## 系统与 Hybrid 边界

核实状态栏、导航栏、windowInsets、edge-to-edge、屏幕方向和 WebView 内容区域。App 构建与 H5 部署分别记录，H5 根因按主流程归属，必要时同时读 [frontend.md](frontend.md)。

## 运行验证与限制

记录包版本/构建、完整提交号、variant、设备/模拟器、系统版本、原图尺寸、density 与 fontScale。能运行时用对应设备截图并核实页面状态；ADB 工具不可用不等于源码不可查，但不能声明已完成运行验证。

聊天缩略图或缩放后的镜像图只能辅助定位，不做精确 dp/sp 测量。跨平台稿差异保留共同视觉要求与平台确认依据。二次验收判定遵循主流程；双图与字段见 [report.md](report.md)。
