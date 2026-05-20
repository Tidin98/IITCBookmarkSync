# IITC Bookmark Sync

IITC 插件，将 Bookmarks 插件的 portal/map 书签数据同步到 Google Sheet，实现多设备间书签共享。

## 依赖

- [IITC](https://iitc.app/) (Ingress Intel Total Conversion)
- [Bookmarks 插件](https://github.com/IITC-CE/ingress-intel-total-conversion)

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击 [bookmark-sync.user.js](https://raw.githubusercontent.com/Tidin98/IITCBookmarkSync/main/bookmark-sync.user.js) 安装脚本

## 配置 Google Sheet 后端

### 1. 创建 Google Sheet

1. 打开 [Google Sheets](https://docs.google.com/spreadsheets/u/0/)，新建一个空白表格
2. 进入 **扩展程序 → Apps Script**
3. 删除 Code.gs 中的默认内容，粘贴本仓库的 [Code.gs](Code.gs)
4. 点击保存

### 2. 初始化

1. 在 Apps Script 编辑器顶部函数选择器中选择 `initialSetup`
2. 点击运行
3. 按提示授权 Google 账号权限

### 3. 部署

1. 点击 **部署 → 新建部署**
2. 类型选择 **Web 应用**
3. "谁有权访问" 设为 **任何人**
4. 点击部署，复制生成的 Web 应用 URL

### 4. 配置插件

1. 打开 IITC 地图
2. 在左侧工具栏点击 **Bookmark Sync**
3. 粘贴刚才复制的 URL，点击保存

## 使用

- **上传到云端**：用本地书签覆盖 Google Sheet 中的数据
- **从云端下载**：用 Google Sheet 中的数据覆盖本地书签

操作前会显示差异报告（不变/新增/移除的数量），确认后才会执行。

## 文件说明

| 文件 | 说明 |
|------|------|
| `bookmark-sync.user.js` | IITC 用户脚本插件 |
| `Code.gs` | Google Apps Script 后端，部署到 Google Sheet |
