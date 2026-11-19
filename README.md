# 咒语旅团：像素法典 (Spell Brigade: Pixel Grimoire)

一款参考《咒语旅团》（*The Spell Brigade*）玩法制作的像素风类幸存者（Survivors-like）网页肉鸽游戏，技能与特效基于 [patch-gg/pixelfx](https://github.com/patch-gg/pixelfx) 纯代码程序化像素特效库打造。

## 核心特色

- **12 种 `pixelfx` 程序化像素法术**：炎爆火球、寒冰穿刺、霜冻新星、落雷天罚、奥术星轨、陨星天降、虚空黑洞、圣光裁决、火焰龙卷、链式闪电、剧毒瘴云、奥术光束。
- **元素附魔实时换色**：升级时可为法术注入烈焰、寒霜、雷霆、暗影元素，赋予额外机制并实时重绘 `pixelfx` 调色板。
- **4 名可选巫师 & 局外永久天赋树**：战斗获取星尘并自动存档至 `localStorage`，支持 8 项多级永久天赋与一键重置。
- **升级选卡刷新机制**：每次升级/开宝箱自带免费刷新次数（快捷键 `R`），可通过天赋与遗物增加。
- **局内随机任务 & 多阶段 Boss**：充能符文法阵、净化虚空裂隙、收集星辰碎片，以及 3 个阶段 Boss 与无尽模式。
- **单文件离线打包**：支持通过 `vite-plugin-singlefile` 直接打包为独立的单个 `dist/index.html`。

## 本地运行与打包

```bash
# 安装依赖
npm install

# 本地开发
npm run dev

# 打包为单个独立的 dist/index.html
npm run build
```

## 操作说明

- `WASD` / 方向键：移动
- `Space` / `Shift`：奥术闪现（短暂无敌）
- `M`：切换自动锁定 / 鼠标手动瞄准
- `1` / `2` / `3`：升级选卡快捷键
- `R`：刷新升级选项
- `Esc` / `P`：暂停
