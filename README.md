# yunlumi

云鹿觅：拨动字轮、收集露光、躲开迷雾，逐步点亮夜空中的星座。

纯 HTML、CSS、JavaScript 互动网站，无依赖、无构建步骤、无服务端。视觉由 SVG / Canvas 绘制，音效由 WebAudio 合成；存档只保存在浏览器本地。

## 本地运行

在仓库根目录运行 `python -m http.server 8080`，打开 http://localhost:8080/ 。也可直接打开 `index.html`。

## 验证

运行 `node tests/selftest.js`。

2026-11-17 收件验证：15 项逻辑自检通过，所有 JavaScript 文件通过 Node 语法检查。浏览器实玩、移动设备手感和低端设备性能尚未验证。

## 部署

无需构建，可直接托管静态文件。当前尚未部署、未绑定域名。玩法和文件说明见 [HANDOFF.md](HANDOFF.md)。

