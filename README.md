# Climb English Studio

从真实 IFSC 攀岩解说视频中训练攀岩英语听说的本地学习应用。React SPA + 本地 Express 服务器 + YouTube 内容导入管线 + 远端 AI 口语反馈。

> 本 README 面向两类读者：项目所有者，以及后续参与协作的 AI。目标是看完本文件即可定位任何功能的代码位置、理解数据从哪来到哪去、知道改哪个模块该遵守什么约定。
>
> 工程复盘与踩坑录见 [RETROSPECTIVE.md](./RETROSPECTIVE.md)。

## 快速开始

```bash
npm install
npm run dev          # http://127.0.0.1:5173 （dev 模式，vite 热更新）
npm run build        # tsc -b && vite build → dist/
npm run preview      # 生产模式静态托管 dist/ + 反馈 API
npm test             # node --test tests/*.test.mjs（管线回归测试）
```

⚠️ 端口 5173 若已被占用，先 `lsof -nP -iTCP:5173 -sTCP:LISTEN` 确认占用进程的服务目录是不是本仓库——历史上有旧副本进程驻留导致"改了代码没生效"的事故（见复盘 #8）。

## 架构总览

```
┌─────────────────────────── 内容管线（离线，scripts/）───────────────────────────┐
│ YouTube ──yt-dlp──> 词级字幕 ──segment.mjs──> 智能断句/评分 ──translate.mjs──>   │
│                       (timed-words.mjs)      (DeepSeek 批翻)                    │
│ 中英 cue 数据 ──生成──> src/data/videos/<slug>.video.ts + index.ts（注册表）     │
└────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼ （⚠️ 当前无消费者，见"死代码区"）
┌─────────────────────────── 运行时（在线）──────────────────────────────────────┐
│ 浏览器 SPA（src/）                                                              │
│   main.tsx → App.tsx ──> data/lessons.ts（课程数据，唯一数据源）                 │
│     ├─ 今天/听力视图：视频播放器（本地 MP4 / YouTube IFrame）+ 练习稿跟随        │
│     ├─ CoachPanel：录音（MediaRecorder）+ Web Speech 转写 + 反馈展示            │
│     └─ 进度/vocab：localStorage（schema v2，含 v1 迁移）                        │
│ 本地服务器（server/index.mjs）                                                  │
│   dev = vite 中间件；prod = dist/ 静态托管 + POST /api/speaking-feedback        │
│   （限流 + OpenAI Whisper 转写 + DeepSeek/OpenAI 教练回复）                     │
└────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼ （静态部署时，浏览器直连）
┌─────────────────────────── 远端反馈（可选）────────────────────────────────────┐
│ Cloudflare Worker（workers/，KV 限流）──> 常驻 M1 上的 API（持有密钥）           │
└────────────────────────────────────────────────────────────────────────────────┘
```

## 模块清单与职责

| 模块 | 路径 | 职责 | 状态 |
|---|---|---|---|
| 应用入口 | `src/main.tsx` | React root，仅此一处 render | ✅ |
| **应用主体（单体）** | `src/App.tsx`（~3000 行） | 全部 5 个视图（今天/听力/视频库/生词本/我的）、2 个课程播放器、口语教练、课程构建、进度存储与迁移 | ⚠️ 过大，待拆分 |
| 样式 | `src/styles.css` | 全局样式，含 v2 遗留死规则 | ⚠️ 待清理 |
| 类型 | `src/types.ts` | `Lesson/PracticeSentence`（课程）与 `SubtitleCue/VideoEntry`（视频库）两套并行模型 | ⚠️ 双轨 |
| 课程数据 | `src/data/lessons.ts` | Bern 2025（6 天）+ Innsbruck 2026（7 天）全部句子/翻译/关键词 | ⚠️ 手写与生成混用，见下 |
| **视频库 tab** | `src/components/BilingualStudio.tsx` + `src/hooks/useCuePlayer.ts` | 字幕视频库视图：连播卡拉OK跟随、单句循环、学习句过滤、SpeakingCoach 跟读 | ✅ 已接回第五个 tab |
| 视频库数据 | `src/data/videos/` | 导入视频的 cue 数据（技巧视频 99 句 + Bern 智能重切 652 句）+ 懒加载注册表 + 发现队列 | ✅ 由视频库 tab 消费 |
| 本地服务器 | `server/index.mjs` | dev/prod 双模式托管 + 口语反馈 API + 限流 | ✅ |
| 导入管线 | `scripts/import-youtube.mjs` | yt-dlp 拉字幕+视频 → 断句评分翻译 → 生成 `.video.ts` + 注册表 | ✅ 产物由视频库 tab 消费 |
| 断句库 | `scripts/lib/segment.mjs` | 词级时间戳 → 句子边界（gap/minWords/maxWords 参数化） | ✅ 有测试 |
| 翻译库 | `scripts/lib/translate.mjs` | DeepSeek 批翻对齐（严格索引匹配）+ 人工翻译回填（backfillFromReference） | ✅ 有测试 |
| 对齐诊断 | `scripts/check-cue-alignment.mjs` | en/zh 漂移启发式巡检（是绊网不是真相） | ✅ |
| 视频发现 | `scripts/discover-youtube.mjs` | 扫描候选 → 队列 → 人工挑选导入 | ✅ |
| 课程生成器 | `scripts/build-official-lessons.mjs` | **一次性脚本**：只重建 Bern 课程，写入 lessons.ts | ⚠️ 危险，见下 |
| M1 运维 | `scripts/m1-feedback-api.mjs` | 远端 API 的密钥安装/状态/用量（SSH 到 M1） | ✅ |
| 反馈 Worker | `workers/speaking-feedback-worker.mjs` | Cloudflare 代理 + KV 限流 | ✅ |
| 回归测试 | `tests/` | translate 对齐 6 例 + segment 断句 5 例（main）；backfill 5 例在 PR #4 分支 | ✅ |

## 依赖关系（谁 import 谁）

```
main.tsx → App.tsx → data/lessons.ts → types.ts
App.tsx → components/BilingualStudio.tsx（视频库 tab）→ hooks/useCuePlayer.ts + data/videos/* + SpeakingCoach.tsx
scripts/* 之间：import-youtube → lib/{timed-words, segment, translate, climbing-terms}
server/index.mjs → dist/（prod）或 vite（dev）；不依赖 src/ 源码
```

## 数据流

**内容管线（写 `.video.ts`）**：`import:youtube` → yt-dlp 词级字幕 → segment.mjs 断句（gap>1.5s 或 >26 词强制切，短片段向后合并）→ 学习价值评分 → translate.mjs 批翻（24/批，严格按返回行 `i` 对齐，缺失行标记 needsTranslation 而非兜底）→ 生成 TS 模块 + 注册表 `videos/index.ts`。

**运行时学习流**：`lessons.ts` → 课程/天/句子 → LocalVideoPlayer（`currentTime + mediaStartTime` 换算回字幕时间轴）或 YouTubePlayer（句子时间即视频时间）→ 播放中上报播放头 → `sentenceIndexAtMediaTime` 驱动练习稿高亮与钉顶滚动 → CoachPanel 按当前句给跟读目标。

**口语反馈流**：浏览器录音（WAV）→ `POST /api/speaking-feedback`（本地 Express 或 CF Worker）→ Whisper 转写 → DeepSeek/OpenAI 生成反馈 → 无 key 时降级为 demo 反馈（不失败）。

**进度流**：练习状态 → localStorage（`climb-english-progress-v2`：completedSessionIds / vocab / practiceDates / activeCourseId）→ 「我的」页 JSON 导出/导入备份。

## 构建与部署

- 本地：`npm run dev`（vite）/ `npm run preview`（prod）。
- GitHub Pages：push 后 Actions 构建静态站，`VITE_BASE_PATH` 控制子路径；静态部署下录音反馈走 `VITE_FEEDBACK_API_BASE` 指向的 Worker。
- Worker：`npm run worker:deploy`（wrangler 配置含 KV 限流：日 300 / 时 90 / 单 IP 时 35 / 音频 10MB）。

## 数据文件约定

- `src/data/lessons.ts`：**手写与生成混用**。生成器 `build-official-lessons.mjs` 只会重建 Bern 2025 部分——**重跑 `npm run build:lessons` 会整体覆盖文件，抹掉手写的 Innsbruck 2026 课程（~1800 行）**。在拆分手写/生成数据之前，禁止运行该命令。
- `src/data/videos/*.video.ts`、`videos/index.ts`：头部有 `GENERATED` 标记，禁止手改，一律通过管线重新生成。
- `src/data/videos/discover-queue.json`：发现队列，人工挑选后消费。
- 密钥：只允许存在于 M1 的 `~/.climb-english-api.env`、Worker secrets、本地 `.env`（已 gitignore）。**任何 `VITE_` 变量和前端代码对浏览器可见，禁止放密钥。**

## 迭代规范（按模块独立迭代）

**每次迭代只聚焦一个模块。一个 PR 只回答一个问题。**

1. **迭代单元 = 上表的一个模块**。改哪个模块，分支名就叫 `fix|feat/<模块>-<内容>`（如 `fix/segment-transcript-follow`）。
2. **禁止混装提交**：功能与修复不同 PR；UI 重构不夹带功能增删；数据文件变更不与逻辑变更同 commit；文档单独成 commit。
3. **管线改动测试先行**：改 `scripts/lib/*` 必须先写一个用真实坏数据构造的失败测试（反例驱动），再修到绿。
4. **UI 改动必须实证**：在确认端口归属的构建上用浏览器走一遍关键流程，qa 截图存档（gitignore，不入库）；文本描述与截图数据要一致。
5. **生成文件零手改**；手写内容不放进生成器输出路径。
6. **死代码不过夜**：新增组件必须在同一迭代接线或删除；删功能必须同步删 README 对应段落——README 描述的 UI 必须与实际 UI 一一对应。
7. **commit message 三段式**（现有风格保持）：症状 → 根因 → 验证方式。修复类提交必须能回答"为什么之前没发现"。
8. **改共享函数前 grep 全部调用方**：优先在所有调用方共同经过的位置修一次，而不是每个调用方各打补丁。

## 运维速查（M1 反馈 API）

```bash
npm run m1:status                  # 远端 API 状态
npm run m1:usage                   # 用量
npm run m1:install-key             # 从剪贴板装 OpenAI key 到 M1（不回显不入库）
npm run m1:install-deepseek-key    # 同上，DeepSeek（仅教练文本，不转写音频）
npm run worker:deploy              # 部署/更新 CF Worker
```

素材来源：Bern 2025 女子抱石决赛（官方 YouTube）； bundled 媒体版权归原权利方，代码 MIT。
