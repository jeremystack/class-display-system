# 现行件指针表（运维 2026-11-19 02:40 建，08:17 换正本后刷新）

> **规则**：`shared/docs/` 根下的同名件一律**不是**现行件，只作只读证据。
> 取件唯一入口＝本表「现行件」列给出的路径。
> 本表所有字节／blob／sha256 均由脚本实读生成，未手敲；**身份以 blob / sha256 为准，不以路径为准**。
> 现行件的基准提交：**HEAD `9d64519`**（2026-11-19 02:52:11）。本地检出副本在 `/home/rakazo/chk260/docs/`（`git checkout` 所得，`git hash-object` 与仓库一致）。

## 一、对照表

| 文件 | shared/docs 件（过期） | 过期件版本 | 过期件字节 / sha256（加横幅 + 08:25 路径纠正后） | 现行件（`9d64519`） | 现行版本 | 现行件字节 / blob / sha256 |
|---|---|---|---|---|---|---|
| api.md | `shared/docs/api.md` | **V2.2.1** | 14,775 / `3e03109a8e1e24dc47b770cb6311cd84f9c4d11ca98c3ec8989db93519c17c3c` | `/home/rakazo/chk260/docs/api.md` | **V2.2.20** | 77,502 / `a343c138` / `3f60879caf2d956023369dca1323ced3629eef7bcbb82e5c7ea498668ebe5807` |
| mqtt.md | `shared/docs/mqtt.md` | **V2.2.14** | 68,390 / `cee941b14aa53e0a154ca9eb8e5df2652f4d58876928ea671497735f687e0d8e` | `/home/rakazo/chk260/docs/mqtt.md` | **V2.2.37** | 151,221 / `0048688b` / `1d38031e724ec93db497c3a3e7d3357964aa74c520ddca503cf675b981de2262` |
| database.md | `shared/docs/database.md` | **V2.2** | 9,046 / `ce166b2951b996a0efb16193c40bf998011df31924714d5d5f6c079ece3ecba6` | `/home/rakazo/chk260/docs/database.md` | **V2.2.5** | 13,453 / `69465dd9` / `88394ca5832bf64cf2573c0f18b58bb3d98624d8ecb7cf784c674cb61f77ac5e` |
| 前端设计-V2.1.md | `shared/docs/前端设计-V2.1.md` | **V2.1.13** | 104,604 / `fd1b56246e88f18049c8395e458ef7504c32cced1539e5cda513ead54f698d45` | `/home/rakazo/chk260/docs/前端设计-V2.1.md` | 头写 **V2.1.55**（标签未随补笔递增） | 187,869 / `3b2213ce` / `6ec8c0d1c4ba7e946b0e2dea15fa0156d0908f422d6116a277ea2d7e5d77eeda` |
| 前端设计-V2.1-变更单.md | `shared/docs/前端设计-V2.1-变更单.md` | CO-2026-11-18-03 初版（无独立版本号） | 74,783 / `1c873f377c542be48ce94373446edb4a8cd4794fe583c2f95d96120a35595b50` | `/home/rakazo/chk260/docs/前端设计-V2.1-变更单.md` | 无版本号（按变更单号记） | 251,019 / `4b2c31dc` / `85da2e2393dfaf7b4401608a50f2b262305ee8b7f9205f55ab67e28b7e4b768d` |
| 验收清单-V2.1.md | `shared/docs/验收清单-V2.1.md` | 198 判据 / 分母 175 | 38,741 / `3de6d22d436d2b643ed523e6278f16701c9c64f43f45f0059445f7afff16fdcd` | **`shared/docs/acceptance/验收清单-V2.1.v260.125086.md`**（冻件，`9d64519`） | **V2.1.60** | 125,086 / `4f2635ab` / `2940ad7d78af33bb8a17b10d0f5032a0b55e7a9f6d80e5fd7dc25fe0ce78bc44`（275 判据 / 分母 **238**） |

## 二、改动前的留存件（均在 `shared/migrations/backups/`，权限 644，可逐字节复原）

**加横幅前原件**：

| 过期件 | 原字节 | 原 sha256 |
|---|---|---|
| api.md | 14,048 | `974486514b64a3d4993cf837a036d58ce16712fc1329f225285b8e8f472382bb` |
| mqtt.md | 67,659 | `9665d33d2cce281c4a79da12a0906aee7fd31f8e2e54eb9605025d8d4d62a840` |
| database.md | 8,314 | `0f2c5e50d10e051f11fbd14c28f210bbe9a40f4efc8980b2846fb621c202274c` |
| 前端设计-V2.1.md | 103,790 | `10bb46d743f17b59012bfee63911fd125546f7717e1d0d1fb53ea7680003b5ed` |
| 前端设计-V2.1-变更单.md | 73,949 | `c6045d247dd2daaf7e7354b70ad4e97cf06fa5b6365134cab5fc5eac244a63e1` |

**08:15 本轮改前件**（横幅时刻/数值更新前，逐件有备份、可 `cmp` 复原）：

| 文件 | 字节 | sha256 | 备份名（`shared/migrations/backups/`） |
|---|---|---|---|
| api.md | 14,684 | `9c18b701c749b1ec7780adbb0e27bf5bae9a3479d780b418097dca383fc35d52` | `api.md.before-v260ref.14684.md` |
| mqtt.md | 68,313 | `4fff5d56d036cf235d563107467ec96f6bda2f7a8be8067ab2ca110151d0cef8` | `mqtt.md.before-v260ref.68313.md` |
| database.md | 8,969 | `eee6088a1d5dcac4e4e812942636a61fd0b86e431f754245f4044e948d963e1a` | `database.md.before-v260ref.8969.md` |
| 前端设计-V2.1.md | 104,463 | `0497c056e4a27f0290e1fb890d86a8a4553585ee950722e4514cf727eb6b872b` | `前端设计-V2.1.md.before-fixbanner.104463.md` |
| 前端设计-V2.1-变更单.md | 74,628 | `102d5fb617520f9676b16f16f8a3e51f720960c9cff76c330ccd11241b41400a` | `前端设计-V2.1-变更单.md.before-fixbanner.74628.md` |
| 验收清单-V2.1.md | 38,677 | `ada8584e935ca8fa7765bcaa5cea0d5b87b06016b51f7d061a621c13e404af28` | `验收清单-V2.1.md.before-v260banner.38677.md` |
| README-验收正本.md | 3,258 | `7bcaa11333e10668b3aeae96dfb8f6f7d4211a6636b5f6247f162ba12c8b8677` | `README-验收正本.md.before-v260.3258.md` |
| README-现行件指针.md | 5,097 | `75b4cafe783e88b13666c13030d7297cd0220c37fed8ad98efdd445a4e3845ed` | `README-现行件指针.md.before-v260.5097.md` |

> 前三件（api/mqtt/database）改前**没有**直接备份，是按「改前 sha 已记录」**重建后校验**：用本条旧横幅行还原原文，`sha256` 与记录逐字符相符（`MATCH`）才落为备份。**这不是「有备份可核」而是「重建后 sha 相符」，两者不等价**——故意改写过的文件也能被重建得自洽，所以它与台账是两层：备份可复原字节，台账证明时刻。

## 三、三个必须知道的事实

1. **滞后不是「2 个世代」，是 5–42 个次版本**：api.md V2.2.1 → V2.2.20（19 版）、mqtt.md V2.2.14 → V2.2.37（23 版）、database.md V2.2 → V2.2.5（5 版）、前端设计 V2.1.13 → V2.1.55 头标（42 版）。`shared/docs/api.md` 里**没有** §4.1 注册限流、**没有** 错误码 `4097`、**没有** V2.2.20；照它写实现＝写限流之前的接口。
2. **「现行」五件目前不在 `shared/` 里**，而在 `/home/rakazo/chk260/docs/`（HEAD `9d64519` 的检出）。按「用作证据的文件必须落 `shared/`」的规矩，它们应在 **11-20 验收冻结时与验收正本一并落到 `shared/docs/acceptance/`**。在此之前，本表只是指针，不是副本。
3. **`tmp/push-cds/` 是活跃工作树，且已落后于仓库**：其本地 HEAD 停在 `bc34b77`，`docs/` 三件 `MM` 未提交；其 api.md 是 V2.2.19 / 72,888、设计 175,945、变更单 213,636 —— 都比 `9d64519` 旧。**不要用它当现行件来源**，也不要由运维覆盖（会冲掉未提交改动）。

## 四、复核命令（逐条可跑）

```bash
sha256sum shared/docs/api.md                       # 3e03109a…（加横幅+路径纠正后，非现行）
sha256sum /home/rakazo/chk260/docs/api.md                   # 3f60879c…
git -C /home/rakazo/chk260 rev-parse HEAD                   # 9d64519
git -C /home/rakazo/chk260 hash-object docs/api.md          # a343c138…（与上表 blob 同）
grep -c '^- \[ \]' shared/docs/验收清单-V2.1.md                        # 198
grep -c '^- \[ \]' shared/docs/acceptance/验收清单-V2.1.v260.125086.md # 275
```

横幅行一律以 `> ` 开头，不以 `- [ ]` 开头，**不改变任何判据计数**（实测 198 与 275 均未变）。

## 五、两轮自纠（记在这里，不抹掉）

1. 横幅初版标注时刻手写成 **02:45**，实际落盘 **02:40**（未来 5 分钟）；通报前已改回。**横幅时间手写、脚本只采字节/blob/sha/mtime。**
2. 本表 02:40 版的「含 `rg` 45（33+12）」写法在 v260 上仍成立，但口径必须带限定：**判据行上** `grep '^- \[ \]' F | grep -c 'rg'`（无词边界）= **49**，多出 4 条是 `target_note`／`margin-left` 的子串污染；**全文**（无 `^- [ ]` 过滤）`grep -c 'rg'` = **58**、全文 `\brg\b` = **54**。**本表与 `README-验收正本.md` 里所有 `rg` 数一律指「判据行」口径**，断言一律写 `\brg\b` 或 `rg `（带空格）。照字面跑全文会得 58，与表里的 45 不是同一个量。

## 六、08:25 路径纠正（20 处死链，Chief 08:24 报出，我改）

**事实**：本表第二节原把现行件写在本仓 `tmp/chk260/docs/`——**该路径任何 cwd 下都不存在**。实际检出在 Team 根 `/home/rakazo/chk260/`（`git rev-parse HEAD` = `9d64519`，08:12 检出）。若 cwd = Team 根，`tmp/chk260` 解析为 `/home/rakazo/tmp/chk260`；若 cwd = bot home，解析为 `bots/<id>/tmp/chk260`；**两种都取不到件**。

**根因**：检出目录是我自己建的，就在 Team 根 `chk260/`，而我在文档里写成了 `tmp/chk260/`——**写文档时凭记忆补了 `tmp/` 前缀**。这是今晚第 6 次同形：错的是**标识符（路径）**，不是内容；而本表正是「取件唯一入口」，最后一步死链会让整条规矩闭环失败。

**范围比报出的大**（我实测 `grep -o` 计处数）：不是 2 文件 11 处，是 **8 文件 20 处**——

| 文件 | 处数 | 性质 |
|---|---|---|
| `shared/docs/README-现行件指针.md` | 10 | 表头 1 + 五行「现行件」列 5 + 事实说明 1 + 复核命令 3 |
| `shared/docs/acceptance/README-验收正本.md` | 2 | 副本表 L48 + 待办 L74 |
| `shared/docs/api.md` / `mqtt.md` / `database.md` / `前端设计-V2.1.md` / `前端设计-V2.1-变更单.md` | 各 1 | **横幅第 3 行**——即「过期件自己指向的现行件」，死链会把人再送回过期件 |
| `shared/Class Display System - 运维交付计划.md` | 3 | §35 记载 |

**改法**：一律 `tmp/chk260` → **`/home/rakazo/chk260`**（绝对路径，与 cwd 无关；不用相对路径，因为本表的读者 cwd 不固定）。

**副作用与处置**：五件过期件的横幅因此各 +9 B，本表第一列「过期件字节 / sha256」**同步刷新为改后值**（否则表里记的字节属于已经不存在的版本）。备份：`shared/migrations/backups/pathfix-0825/`（8 个 `.before` 原件 + `MANIFEST.md`，逐件改前/改后字节与 sha256，全 644）。

**新增规矩**：**任何写进 `shared/` 的路径，必须是下列两种之一——① 绝对路径；② 以 `shared/` 开头的 Team 根相对路径。禁止 `tmp/…`、`bots/…` 之外的裸相对路径**，因为它随读者 cwd 漂移。登记后必须**当场在两种 cwd 下各解析一次**（Team 根 与 bot home），两次都要 `test -f` 通过。

---

## 七、2026-11-28 原型调整（V2.2）新增现行件

本轮据 Jeremyzh《需求-原型调整-1128.md》改原型，**文档与原型同步改**；研发冻结，仓库 `docs/` 未动、未 push。以下两件是**本轮口径的现行件**（待 Jeremyzh 确认后并入仓库并重定签字锚点）：

| 文件 | 版本 | 字节 / blob | 说明 |
|---|---|---|---|
| `shared/docs/前端设计-V2.2.md` | **V2.2.6** | 239,306 / `e20946a5` | V2.1 全文 + **§16**（V2.2，需求 1–9）＋ **§17**（V2.2.1 第三轮 6 条）＋ **§17.9 裁决记录** ＋ **§18**（V2.2.2 第五轮 5 条）＋ **§19**（V2.2.3 第六轮 3 条：正文字号归位／m→n 同款控件／66 卷等宽对齐） |
| `shared/docs/产品需求文档-V1.2.md` | **V1.8**（文件名沿用 V1.2） | 22,840 / `55156dfb` | PRD；同一份也写到 `shared/Class Display System - 产品需求文档.md`（旧 V1.1 备份在 `shared/backups/产品需求文档-V1.1-20261128.md`） |

原型件：`shared/prototype-v1128/console.html` 95,507 B / `bc49f2ce` / 1515 行；`display.html` 38,222 B / `082345ea` / 721 行；`screen.html` 38,375 B / `80d0a4a2`（与仓库 `prototype/` 同内容）。
同一目录下 `peer-1518/` 是他人更早产出的同名原型，**Jeremyzh 2026-11-28 16:52 裁决「以当日最新沟通为准」⇒ 不采用、仅备查**。

过程稿（**已被取代**，仅留证）：`shared/docs/前端设计-V2.2-1128-同步稿.md`、`shared/docs/产品需求文档-V1.2-1128-同步稿.md`。

**口径**：凡 V2.1 与 §16/§17/§18 冲突，依次以 §18 > §17 > §16 为准；作废项逐条见 §16.5、§17.7、§18.7。**2026-11-28 16:52 三条裁决**（以当日最新稿为准、「整章一屏」移除不加回、黑屏恒纯黑）见 §17.9；**18:18 第六轮三条**（正文字号归位、m→n 同款控件、66 卷对齐）见 §19。

### 第五轮（V2.2.2，2026-11-28 17:44）

- 需求：`shared/docs/需求-原型调整-1128.md` **§九**（R6-1~R6-4-2，5 条）。
- 设计：`shared/docs/前端设计-V2.2.md` **§18**（三态音乐、打点模式、经文简写、移动底部栏、文章点行即发、作废清单、自证）。
- PRD：**V1.4**（功能表与交互细则同步）。
- 原型：见上表两件（**仍未入库、非签字锚点**）。

### 第六轮（V2.2.3，2026-11-28 18:18）

- 需求：`shared/docs/需求-原型调整-1128.md` **§十**（R7-1~R7-3，3 条）。
- 设计：`shared/docs/前端设计-V2.2.md` **§19**（正文字号归位、m→n 同款 stepper、66 卷等宽格子、作废清单、自证）。
- PRD：**V1.5**（2.2 功能表 3 行、6.3 交互细则 2 行、变更记录）。
- 原型：`console.html` 94,617 B / `d0683f80` / 1,503 行；`display.html` 30,298 B / `a3b108ea` / 580 行（本轮 display **未改**）。

### 第八轮（V2.2.5，2026-11-28 18:56）

- 需求：`shared/docs/需求-原型调整-1128.md` **§十二**（8-1，1 条：投屏端文章换行齐左）。
- 设计：`shared/docs/前端设计-V2.2.md` **§21**（齐左三处改法、窄屏行内节号、**作废 V2.1.14 续行悬挂缩进与 `c−1` 有效字数**、行数公式回滚、自证、未覆盖）。
- PRD：**V1.7**（变更记录 + 版本头）。
- 原型：`display.html` 30,915 B / `595e182f` / 588 行（本轮**只改 display**，console 未动）。
- **本轮首次入库**（Jeremyzh 18:56 明确要求）：`prototype-v1128/console.html`、`prototype-v1128/display.html`、`docs/前端设计-V2.2.md`、`docs/产品需求文档-V1.2.md`、`docs/需求-原型调整-1128.md`，并把根目录 `Class Display System - 产品需求文档.md` 升到与 V1.7 同哈希。`prototype/`（V2.1 线上版）内容不变。

### 第九轮（V2.2.6，2026-11-28 19:10）— 原型已升为线上 `prototype/`

- 需求：`shared/docs/需求-原型调整-1128.md` **§十三**（单屏模式齐左 / 投屏端双击全屏 / 投屏端三击改码 / 替换 `/prototype/`）。
- 设计：`shared/docs/前端设计-V2.2.md` **§22**；PRD **V1.8**（`docs/产品需求文档-V1.2.md` 与仓库根同名件同哈希）。
- **仓库布局变化**：

| 路径 | 内容 |
|---|---|
| `prototype/console.html` `display.html` `screen.html` `index.html` | **V2.2.6 现行版**（线上入口 https://cds.242500.xyz/prototype/） |
| `prototype/v2.1/` | V2.1 四件原样归档（2026-11-18 版，可回退） |
| `prototype/v1/` | 更早的 V1，未动 |
| `prototype-v1128/` | 与 `prototype/` 同内容，供追溯 |

- 本轮盘口（**入库后**，标题统一为 V2.2.6）：`console.html` 95,507 / `bc49f2ce`；`display.html` 38,222 / `082345ea`；`screen.html` 38,377 / `93b7ca1d`。
- 线上：https://cds.242500.xyz/prototype/ （入口页列出四件）
