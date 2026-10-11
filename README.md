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
3. "执行身份" 设为 **我**，"谁有权访问" 设为 **任何人**
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

## 升级后端

新版将大于 50,000 字符的书签 JSON 分块保存到 `Bookmarks` 工作表的 B2、B3 等单元格，并兼容原来的 B2 单元格数据。上传只有收到后端确认且重新读取的数据一致时才会显示成功。

1. 用新版 `Code.gs` 替换 Apps Script 中的内容并保存。
2. 运行一次 `initialSetup` 绑定目标表格并授权；新版初始化会保留已有书签。
3. 在 **部署 → 管理部署 → 编辑 → 版本：新版本 → 部署** 更新现有 Web 应用，保留原 `/exec` URL。只保存代码不会更新已部署版本。执行身份选 **我**，访问权限选 **任何人**。
4. 更新用户脚本到 0.2.0，刷新 IITC 页面。请勿将重定向后的 `script.googleusercontent.com/macros/echo` 地址填入设置。

## 验证

运行 `node --test tests/sync.test.cjs` 验证大数据分块、删除书签后的覆盖、Google 重定向错误和上传完成判定。
