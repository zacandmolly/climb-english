# Climb English Studio

从真实 IFSC 攀岩解说视频中训练攀岩英语听说的本地学习应用。React SPA + 本地 Express 服务器 + YouTube 内容导入管线 + 远端 AI 口语反馈。

> 本 README 面向两类读者：项目所有者，以及后续参与协作的 AI。目标是看完本文件即可定位任何功能的代码位置、理解数据从哪来到哪去、知道改哪个模块该遵守什么约定。
>
> 工程复盘与踩坑录见 [RETROSPECTIVE.md](./RETROSPECTIVE.md)。
> **AI 协作者进场请先读 [docs/AI_HANDOFF.md](./docs/AI_HANDOFF.md)**——一站式上手：状态快照 / 架构 / 数据模型 / 门禁 / 防踩坑约定。

## 核心能力：卡拉OK字幕跟随（karaoke follow）

本项目最重要的学习功能。英文播放到哪，字幕就跟随到哪——当前句高亮 + 字幕列表自动滚动（当前句钉在列表顶部），点击任意句可跳转循环，配合 AI 跟读教练。两条实现路径，同一体验：

| 路径 | 场景 | 时间轴驱动 |
|---|---|---|
| **BilingualStudio**（卡拉OK工作台） | 素材栏选"视频素材"（导入管线产物，如技巧教学 99 句、Bern 646 句、Innsbruck 2242 句） | `CueMediaPlayer` 优先已部署本地 MP4；大文件先播 Git 中的 20 秒学习窗口，同时在后台预热 YouTube，超出窗口后按同一时钟接续；各媒体层都向 `useCuePlayer` 上报片段相对时间 → `videoTime + mediaStartTime` → `cueAtTime` → 活动句推进 |
| **ListeningWorkspace**（课程流程） | 素材栏选"课程素材"（Bern/Innsbruck 每日课程），整段精听模式 | 本地视频 `onTimeReport(currentTime + mediaStartTime)`；YouTube 走 250ms 轮询 `getCurrentTime()`（句子时间即视频时间，无偏移）→ `sentenceIndexAtMediaTime`（内部走 `cueAtTime`）→ 练习稿跟随 |

> **R12 时间轴语义（已收敛）**：两条路径的卡拉OK跟随都经 `src/lib/cue.ts` 的 `cueAtTime` 判定——**播放层绝对时间 = cue.startTime（已含 mediaStartTime 偏移）的单一语义**；`mediaStartTime` 仅保留在 player 层做 `toVideoTime` 换算。句间自然停顿保持上一句高亮，不提前跳下一句。

维护要点：跟随只推进高亮、绝不改播放模式或触发重播；播放器 reset effect 只依赖稳定素材 id，禁止依赖会在渲染中重建的 cues 数组或会被跟随间接改变的状态（见复盘 #10）；YouTube 嵌入经代理加载慢，就绪前的播放点击必须排队而非静默丢弃。

## 快速开始

```bash
npm install
npm run dev          # http://127.0.0.1:5173 （先跑 scripts/port-guard.mjs 探测 5173，再起 vite+Express）
npm run build        # tsc -b && vite build → dist/
npm run preview      # 生产模式静态托管 dist/ + 反馈 API
npm test             # node --test tests/*.test.mjs（管线回归测试）
```

⚠️ `npm run dev` 前置了 **端口守卫（R9）**：进 `node server/index.mjs` 前先探测 5173。若被**本仓库残留进程**占用（历史上有旧副本驻留导致"改了代码没生效"的事故，见复盘 #8），守卫会打印 `kill <pid>` 供手动清理；若被**外部进程**占用（非本仓库 cwd），守卫直接阻断并提示换端口，避免静默绑定失败。

## 架构总览

整个系统切成两个**互不干扰的边界**，中间只靠「数据文件」单向连接：

- **内容管线（离线，一次性生成）**：`scripts/` 负责所有新素材的「发现 → 下载/转码 → 断句 → 翻译 → 生成数据」，把结果**持久化**成 `.video.ts` / `lessons.generated.ts` 数据文件后就不再重跑。
- **页面端（在线，只读消费）**：`src/` + `server/` 只**读**管线产出的数据文件，负责播放 / 跟读 / 课程流 / 口语反馈，从不反向触碰内容。

> **原则：数据生成（管线）与数据消费（页面）分离。** 改页面端不会碰内容管线、不会返工，更不会因为改页面而重新跑翻译、重复消耗 DeepSeek Token；内容只生成一次，页面永远消费同一份数据。

```
┌──────────────────── 内容管线（离线 · scripts/，一次性生成）─────────────────────┐
│ 发现 discover-youtube ──> 导入 import-youtube（yt-dlp 词级字幕 + 下载/转码媒体） │
│   ──> 断句 segment（词级时间戳→句子边界）──> 翻译 translate（DeepSeek 批翻）     │
│ 产出（持久化数据文件，此后不再重跑）：                                            │
│   src/data/videos/<slug>.video.ts + videos/index.ts（注册表）                    │
│   src/data/lessons.generated.ts（课程生成器产物）                                │
└────────────────────────────────────────────────────────────────────────────────┘
                              │
                              │  只读消费（数据文件）
                              ▼
┌──────────────────── 页面端（在线 · src/ + server/，只读消费数据）────────────────┐
│ 浏览器 SPA（src/）                                                               │
│   main.tsx（安装 R10 报错收集）→ App.tsx（4 tab：今天/听力/生词本/我的，          │
│     视频素材内嵌今天视图；已拆分 views/players/progress/lib/courses/constants）   │
│     ├─ 素材栏（唯一素材入口）：课程素材（lessons.ts）｜视频素材（videos/*）         │
│     ├─ 课程流程（今天/听力视图）：视频播放器（本地 MP4 / YouTube IFrame）          │
│     │   + 整段精听卡拉OK跟随（统一 cueAtTime 时间轴） + CoachPanel 录音跟读        │
│     ├─ 视频素材（今天视图）：BilingualStudio 卡拉OK工作台（cue 级跟随）           │
│     └─ 进度/vocab：localStorage（schema v2，含 v1 迁移）                         │
│ 本地服务器（server/index.mjs）                                                   │
│   dev = vite 中间件；prod = dist/ 静态托管 + POST /api/speaking-feedback         │
│   （限流 + OpenAI Whisper 转写 + DeepSeek/OpenAI 教练回复）                      │
│   + POST /api/errors（R10 前端报错收集，仅 dev；prod 拒绝）                      │
└────────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ （静态部署时，浏览器直连）
┌──────────────────── 远端反馈（可选）─────────────────────────────────────────────┐
│ Cloudflare Worker（workers/，KV 限流）──> 常驻 M1 上的 API（持有密钥）            │
└────────────────────────────────────────────────────────────────────────────────┘
```

## 模块清单与职责

| 模块 | 路径 | 职责 | 状态 |
|---|---|---|---|
| 应用入口 | `src/main.tsx` | React root，仅此一处 render | ✅ |
| **应用外壳（视图路由/骨架）** | `src/App.tsx`（~540 行） | 4 tab（今天/听力/生词本/我的，视频素材内嵌今天视图）切换、全局状态（activeView/activeCourse/activeVideo）、把素材栏/播放器/工作台拼装起来（纯编排） | ✅ 已拆分 |
| **素材栏（唯一素材入口）** | `src/components/MaterialBar.tsx` | 课程+卡拉OK视频统一选择入口；`COURSE_SUPERSEDED_BY_VIDEO` 取代映射（课程被同源重切版取代时隐藏入口）；导入管线更新素材后自动呈现 | ✅ 已独立 |
| **卡拉OK工作台** | `src/components/BilingualStudio.tsx` + `src/hooks/useCuePlayer.ts` | 视频素材的 cue 级卡拉OK跟随、单句循环、学习句过滤、SpeakingCoach 跟读；reset key 使用稳定素材 id | ✅ 已独立 |
| **卡拉OK媒体面** | `src/players/CueMediaPlayer.tsx` | 已部署 MP4 直播；大文件/404 先播 Git 20 秒预览并后台 cue YouTube 接续点，以 `previewStartOffset + previewTime = youtubeTime - mediaStartTime` 保持统一 cue 时钟 | ✅ 本地/预览/备用源统一 |
| **跟读/口语教练（视频素材）** | `src/components/SpeakingCoach.tsx` | 录音 → Whisper 转写 → AI 教练反馈；只接收 `CoachTarget`，被卡拉OK工作台复用 | ✅ 已独立 |
| **口语教练（课程流程）** | `src/views/CoachPanel.tsx` | 课程流程的录音跟读教练；与 SpeakingCoach 功能重叠，合并另开 PR，本轮原样独立 | ⚠️ 待与 SpeakingCoach 合并 |
| 课程流程播放器（本地 MP4） | `src/players/LocalVideoPlayer.tsx` | 本地视频播放，`onTimeReport(currentTime + mediaStartTime)` 换算回字幕时间轴 | ✅ 已独立 |
| 课程流程播放器（YouTube） | `src/players/YouTubePlayer.tsx` | IFrame 嵌入 + 250ms 轮询 `getCurrentTime()`；就绪前的播放点击排队而非静默丢弃 | ✅ 已独立 |
| 课程流程/听力工作台 | `src/views/TodayView.tsx`（TodayFocusCard/SentenceStrip/ListeningWorkspace）+ `src/views/Sidebar.tsx`（Sidebar/Heatmap） | 今日练习台、整段精听卡拉OK跟随 + 侧栏学习进度/热力图 | ✅ 已独立 |
| 课程构建逻辑 | `src/courses.ts` | 把 lessons 切成「天/句子」的课程计划、解锁顺序（buildCourses/buildSessionsForCourse/COURSE_PLANS） | ✅ 已独立 |
| 进度存储与迁移 | `src/progress/storage.ts` + `src/progress/session.ts` | localStorage（schema v2 + v1 迁移）、生词本、打卡日期、解锁顺序 | ✅ 已独立 |
| 纯函数工具层 | `src/lib/ui.tsx` + `src/lib/{lesson,audio,feedback,cue}.ts` + `src/constants.ts` + `src/players/playback.ts` | 高亮/时间格式/静态资源 + 课程句子时间轴 + 录音 WAV 编码 + 反馈降级 + **R12 统一时间轴原语（cueAtTime/wordsInRange/toCue）** + 应用常量 | ✅ 已独立 |
| 生词本/我的/听力库视图 | `src/views/{VocabView,MeView,LibraryView}.tsx` | 生词复习、进度备份导出导入、听力库列表 | ✅ 已独立 |
| 样式 | `src/styles.css` | 全局样式，含 v2 遗留死规则 | ⚠️ 待清理 |
| 类型 | `src/types.ts` | 统一 `Cue` 基类型（id/startTime/endTime/en/zh/note）；`SubtitleCue` 字面继承、`PracticeSentence` 复用 Cue 时间轴字段；`VideoEntry/Lesson` 引用二者 | ✅ 已收敛（统一 Cue 基类型，R12） |
| **时间轴语义工具** | `src/lib/cue.ts`（R12） | 时间轴统一核心：`cueAtTime(cues,t)`（绝对时间 → 正在播报句，停顿保持上一句）+ `wordsInRange` + `toCue`（PracticeSentence/SubtitleCue 归一视图）+ `transcriptOfCues/patternsForEnglish` | ✅ 有测试 |
| 课程数据 | `src/data/lessons.ts`（re-export）+ `lessons.generated.ts` + `lessons.manual.ts` | Bern 2025（6 天，生成）+ Innsbruck 2026（7 天，手写）全部句子/翻译/关键词 | ✅ 已隔离 |
| 视频数据 | `src/data/videos/` | 导入视频的 cue 数据（技巧教学 99 / Bern 智能重切 646 / Innsbruck 完整重切 2242）+ 懒加载注册表 + 发现队列 | ✅ |
| 课程↔cue 对齐硬门禁 | `scripts/check-lesson-cue-alignment.mjs` + `scripts/lesson-cue-baseline.json`（R12 step4） | 课程句 vs cue deck 的 id 强校验：id 碰撞/时间戳精确匹配即阻断（当前 136 句 0 碰撞）；baseline 记录诚实的连续切片关系 | ✅ 有测试 |
| 本地服务器 | `server/index.mjs` | dev/prod 双模式托管 + 口语反馈 API + 限流 + `POST /api/errors`（R10，仅 dev） | ✅ |
| 前端报错收集 | `src/lib/errorReporter.ts`（R10）+ `scripts/error-report.mjs` | window.onerror/unhandledrejection → 本地 ring 缓冲 → `POST /api/errors`；`errors:report` 聚类 + DeepSeek 根因分析报告；**MVP 不做自动改码** | ✅ |
| 端口守卫 | `scripts/port-guard.mjs`（R9） | `npm run dev` 前探测 5173；本仓库残留提示可 kill、外部进程占用则阻断 | ✅ |
| AI code review | `scripts/ai-review.mjs` + `scripts/lib/ai-review-prompt.mjs` + `.github/workflows/ai-review.yml`（R4） | DeepSeek 结构化 review（建议性非阻断）；空 key/失败不阻断 PR | ✅ |
| 断句参数实验 | `scripts/experiments/segment-parameter-search.mjs` + `experiments/lib/metrics.mjs`（R8） | 参数矩阵搜索（192 格，只读不改 segment.mjs）；最优 `maxGap=0.7/minWords=4/mergeGap=1.2/maxWords=22`（带自证偏置，仅供评估） | ✅ |
| 摩擦日志 → 优化计划 | `scripts/oxidize-report.mjs` + `scripts/lib/friction-log.mjs` + `docs/oxidize/`（R11） | 摩擦日志聚合 → `plan.md`（before/after 目标）；**只出计划、人挑执行** | ✅ |
| 导入管线 | `scripts/import-youtube.mjs` | yt-dlp 拉字幕+视频 → 断句评分翻译 → 生成 `.video.ts` + 注册表 | ✅ 产物经素材栏消费 |
| 断句库 | `scripts/lib/segment.mjs` | 词级时间戳 → 句子边界（gap/minWords/maxWords 参数化） | ✅ 有测试 |
| 翻译库 | `scripts/lib/translate.mjs` | DeepSeek 批翻对齐（严格索引匹配）+ 人工翻译回填（backfillFromReference） | ✅ 有测试 |
| 对齐诊断 | `scripts/check-cue-alignment.mjs` | en/zh 漂移启发式巡检（`--strict` + 豁免清单是硬门禁；非严格是绊网） | ✅ |
| 视频素材门禁 | `scripts/check-video-pipeline.mjs` | 校验 cue/翻译/时间窗/注册表；每条素材强制有 Git 跟踪的 20 秒 H.264/AAC faststart 预览，本地完整 MP4 未部署时强制有 YouTube 备用源 | ✅ CI 硬门禁 |
| 视频发现 | `scripts/discover-youtube.mjs` | 扫描候选 → 队列 → 人工挑选导入 | ✅ |
| 课程生成器 | `scripts/build-official-lessons.mjs` | 只重建 Bern 课程，写入 `lessons.generated.ts` | ✅ 不再触碰手写 |
| M1 运维 | `scripts/m1-feedback-api.mjs` | 远端 API 的密钥安装/状态/用量（SSH 到 M1） | ✅ |
| 反馈 Worker | `workers/speaking-feedback-worker.mjs` | Cloudflare 代理 + KV 限流 | ✅ |
| 回归测试 | `tests/` | translate 对齐 + segment 断句 + backfill 回填 + video pipeline（node --test） | ✅ |
| E2E 走查 | `e2e/karaoke-playback.spec.ts` | Playwright 同时走查已部署本地 MP4 与 Git 预览→YouTube 预热接续的卡拉OK时间轴，CI 归档截图/录屏 | ✅ |

## 依赖关系（谁 import 谁）

```
main.tsx（安装 R10 报错收集）→ App.tsx → components/{MaterialBar, BilingualStudio, SpeakingCoach} + data/lessons.ts → types.ts
App.tsx → MaterialBar（唯一素材入口，选课程/选视频）
App.tsx → BilingualStudio（素材栏选视频素材时，今天视图内渲染）→ players/CueMediaPlayer.tsx + hooks/useCuePlayer.ts + data/videos/* + SpeakingCoach.tsx
App.tsx → SpeakingCoach（课程流程的 CoachPanel 也复用同一组件）
时间轴统一：hooks/useCuePlayer.ts → src/lib/cue.ts（cueAtTime）；src/lib/lesson.ts → src/lib/cue.ts（sentenceIndexAtMediaTime 委托 cueAtTime）
src/lib/cue.ts → types.ts（统一 Cue 基类型；PracticeSentence/SubtitleCue 归一为 Cue）
scripts/* 之间：import-youtube → lib/{timed-words, segment, translate, climbing-terms}
  experiments/segment-parameter-search.mjs → lib/{segment, timed-words} + experiments/lib/metrics.mjs（只读）
  ai-review.mjs → lib/ai-review-prompt.mjs + lib/translate.mjs；oxidize-report.mjs → lib/friction-log.mjs
server/index.mjs → dist/（prod）或 vite（dev）→ 依赖 src/ 的 vite 编译产物；不依赖 src/ 源码（除规范对齐）
```

## 数据流

**内容管线（写 `.video.ts`）**：`import:youtube` → yt-dlp 词级字幕 → segment.mjs 断句（gap>1.5s 或 >26 词强制切，短片段向后合并）→ 学习价值评分 → translate.mjs 批翻（24/批，严格按返回行 `i` 对齐，缺失行标记 needsTranslation 而非兜底）→ 从第一句前 0.3 秒生成 20 秒、360p 的 Git 预览 → 生成 TS 模块 + 注册表 `videos/index.ts`。

**运行时学习流**：素材栏选课程 → `lessons.ts` → 课程/天/句子 → LocalVideoPlayer（`onTimeReport(currentTime + mediaStartTime)`，即把播放头换算回**统一 cue.startTime 绝对时间轴**）或 YouTubePlayer（句子时间即视频时间，加载期点击排队）→ 播放中上报播放头 → `sentenceIndexAtMediaTime`（内部委托 `cueAtTime`，句间停顿保持上一句）驱动练习稿高亮与钉顶滚动 → CoachPanel 按当前句给跟读目标。素材栏选视频 → BilingualStudio → CueMediaPlayer（本地 MP4 优先；缺失时自动切 YouTube 且补偿 `mediaStartTime`）→ useCuePlayer / `cueAtTime` 驱动相同的剪切与卡拉OK效果；单句播放从 `cue.startTime` 精确起播，切换媒体源时不加入运行时 pre-roll。

**口语反馈流**：浏览器录音（WAV）→ `POST /api/speaking-feedback`（本地 Express 或 CF Worker）→ Whisper 转写 → DeepSeek/OpenAI 生成反馈 → 无 key 时降级为 demo 反馈（不失败）。

**进度流**：练习状态 → localStorage（`climb-english-progress-v2`：completedSessionIds / vocab / practiceDates / activeCourseId）→ 「我的」页 JSON 导出/导入备份。

## 构建与部署

- 本地：`npm run dev`（vite）/ `npm run preview`（prod）。
- GitHub Pages：push 后 Actions 构建静态站，`VITE_BASE_PATH` 控制子路径；静态部署下录音反馈走 `VITE_FEEDBACK_API_BASE` 指向的 Worker。
- Worker：`npm run worker:deploy`（wrangler 配置含 KV 限流：日 300 / 时 90 / 单 IP 时 35 / 音频 10MB）。

## 数据文件约定

- `src/data/lessons.ts`：**re-export 合并**（`[...bernLessons, ...innsbruckLessons]`）。生成部分在 `lessons.generated.ts`（Bern 6 天，可被 `build:lessons` 覆盖），手写部分在 `lessons.manual.ts`（Innsbruck 7 天，**只读受保护**）。`build-official-lessons.mjs` 只写 generated，CI 的 data-protect 门禁防止覆盖 manual。
- `src/data/videos/*.video.ts`、`videos/index.ts`：均由导入管线产出（注册表带 `GENERATED` 标记），禁止手改，一律通过管线重新生成。
- `src/data/videos/discover-queue.json`：发现队列，人工挑选后消费。
- `public/media/*.mp4`：Git 已追踪且小于 100 MiB 的 H.264/AAC faststart 完整文件会随 Pages 部署（现有技巧教学、Bern）；大文件不入库、仅留本地（Innsbruck 758MB）。
- `public/media/previews/*-20s.mp4`：每条素材必须有一个 Git 跟踪的 20 秒学习窗口（从第一 cue 前 0.3 秒开始，不是机械截源视频 0–20 秒）。这 0.3 秒只用于预览资产的采集缓冲；运行时单句播放仍从 cue 边界开始。大文件与 404 场景先播该预览，YouTube 同时在后台缓冲接续点；三层媒体共享同一 cue 时间轴。
- 密钥：只允许存在于 M1 的 `~/.climb-english-api.env`、Worker secrets、本地 `.env`（已 gitignore）。**任何 `VITE_` 变量和前端代码对浏览器可见，禁止放密钥。**

## 素材上线流程（所有素材必经，以 Bern 2025 重切为模板）

任何新素材（或素材更新）都必须走完以下管线并通过全部验证门，才允许出现在素材栏。**禁止手工编辑 `.video.ts` 绕过管线。**

```bash
# 1. 导入：yt-dlp 词级字幕 → 智能断句评分 → 人工翻译回填 → DeepSeek 机器翻译补齐 → 下载转码媒体
DEEPSEEK_API_KEY=sk-… npm run import:youtube -- "<YouTube 链接>" \
  --title "<标题> 智能重切" --category world-cup --level advanced \
  --backfill-zh src/data/lessons.ts \
  --slug <视频 id>
# 可选：--start/--end 只导一个窗口；--reuse-media + --media-start 复用已有媒体；--max-height 480 降低体积
# 历史素材可用 npm run generate:previews [video-id ...] 重建预览；新导入会自动生成
```

| # | 验证门 | 命令 / 标准 | 不过怎么办 |
|---|---|---|---|
| 1 | 翻译完整 | 导入日志 `translated: N/N`（needsTranslation=0） | `DEEPSEEK_API_KEY=… npm run translate:videos -- --video <slug>` 补齐 |
| 2 | 对齐巡检 | `npm run check:alignment -- --video <slug>`，无系统性漂移告警 | 人工抽查 en/zh 列；发现漂移按复盘 #1 法则修管线，禁止手改数据 |
| 3 | 素材/媒体契约 | `npm run check:videos`：cue/翻译/时间窗/注册表一致；每条素材必须有 Git 跟踪的 20 秒 faststart H.264/AAC 预览；完整 MP4 未部署时必须保留合法 YouTube id | 修导入管线、预览编码或备用源，不得让 404 静默上线 |
| 4 | 构建 | `npm run build` 全绿 | 修代码 |
| 5 | 卡拉OK实证 | 浏览器（确认端口归属）分别走查本地媒体与 404→YouTube 备用源：播放本句、下一句、连播、高亮推进、字幕钉顶；qa 截图存档 | 修 CueMediaPlayer/useCuePlayer，重走此门 |
| 6 | 素材栏接线 | 素材栏自动出现新素材（注册表驱动）；若取代了同源课程，在 `MaterialBar.tsx` 的 `COURSE_SUPERSEDED_BY_VIDEO` 加映射 | — |

上线后的维护事实：小媒体被 Git 跟踪后才会复制进 dist；每条素材的 20 秒学习窗口必须入 Git；大媒体只在本地，线上先播预览并后台预热 YouTube；cue 数据由管线生成；素材栏是唯一素材入口（`src/components/MaterialBar.tsx`，含取代映射）。

已完成上线的素材：技巧教学（99 句）、Bern 2025 智能重切（646 句）、Innsbruck 2026 完整重切（2242 句）。

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

## AI 自动开发工作流（harness）

> 面向 AI 协作者的工作流约定。完整方案见 [docs/ai-workflow-proposal.md](./docs/ai-workflow-proposal.md)。

本项目用「harness」方法论（脚手架 + 缰绳）落地 AI 自动开发迭代：把本文件的迭代规范与 [RETROSPECTIVE.md](./RETROSPECTIVE.md) 的踩坑经验，从「人肉 checklist」落成「代码门禁 + 自动化」。核心原则：**gate 是代码不是 prompt**。

### 架构设计思路

**核心哲学**：徐文浩的「harness = 脚手架 + 缰绳」。脚手架让 AI 跑得快（沙盒并行、自动生成、自动验证），缰绳让 AI 跑不偏（门禁、gate、人审）。纯 vibe coding 做大项目一定会塌——不是 AI 不行，而是没有「机制层」兜底：错误靠 prompt 提醒、验证靠人肉，规模一上来必然崩。唯一解是搭门禁 + 持续迭代，把纪律从「写在 README 里的话」变成「跑在 CI 里的代码」。

**六条设计原则（每条一句话讲清「为什么」）**：

1. **gate 是代码不是 prompt**——prompt 会被忽略、被遗忘、被「这轮先跳过」；代码门禁每次合入前强制执行，不可协商。
2. **数据生成与消费分离**——内容只生成一次、页面永远消费同一份数据；改页面不返工，也不重复烧 DeepSeek Token。
3. **单模块单 PR**——PR 越小越能被 review 和回滚；混装提交让「哪个改动引入了问题」无从定位。
4. **反例测试先行**——先用真实坏数据把测试写红，再修到绿；否则测试只验证了「能跑」，没验证「跑对」。
5. **UI 改动必须实证**——播放器/跟随这类行为无法靠静态检查，必须浏览器走查 + 截图留证；文本描述与截图一致。
6. **生成文件零手改**——手改生成文件会在下次重跑时被覆盖丢失；要改就改管线，让管线重新生成。

**四层闭环（需求 → 生成 → 验证 → 迭代）的设计取舍**：

- **需求分析层**：AI 拆解任务，但拆解结果必须过 **G1 人审 gate**——拆错了后面全白跑，这一步必须人确认才进生成。
- **代码生成层**：为什么在**沙盒**（worktree + dev container）——不进主干、可销毁、可回放；「整仓重写丢功能」的前车之鉴证明，无沙盒的 AI 全自动 = 灾难。
- **测试验证层**：为什么合入要**人工 gate（G2）**——门禁只能证明「没坏」，不能证明「没丢功能」；AI review 只作建议，最终 approve 由人拍板。
- **迭代优化层**：为什么门禁要**「现在就能全绿」起步**——门禁的价值在「拦新错」不在「清旧账」；先让现有代码全绿，AI 才有可依赖的基线，再逐步收紧。

**门禁收紧的「渐进」策略（先把现有代码养绿，再逐步收紧）**：

- **align-check 用豁免清单**：历史上首批导入留下的 151 行 en/zh 漂移记录进 `scripts/alignment-baseline.json`，`--strict --baseline` 下**历史漂移不阻断、新漂移硬拦截**——既不让历史债卡死合入，又保证新素材不再引入对齐错位。
- **boundary-check / dead-code 起步告警不阻断**：`App.tsx` 拆分已落地（现约 544 行），`no-circular` 因此已升为硬门禁；但 src/ 的复杂度和生成数据模块仍可能超阈值、knip 也必报历史死代码，所以 `lint:complexity` 与 `dead-code` 仍用 `warn` / `continue-on-error`——先让它们**跑起来、看得见**，等死代码清理 PR 落地后再收紧为硬门禁。

### 进度与路线图

| Phase | 内容 | 状态 |
|---|---|---|
| Phase 0 | R1 提交门禁（`.github/workflows/ci.yml` + ESLint + Prettier + husky） | ✅ 已落地 |
| Phase 1 | R2 对齐硬校验 + R3 生成/手写数据隔离 + R4 AI code review | ✅ 全部落地（R4 为 DeepSeek 建议性非阻断，见 `.github/workflows/ai-review.yml`） |
| Phase 2 | R5 Playwright 走查 + R6 模块边界 lint + R7 死代码检测 | ✅ 已落地（R6 no-circular 已升硬门禁 / R7 告警不阻断） |
| Phase 3 | R8 断句参数实验 + R9 端口守卫 + R10 报错闭环(MVP) + R11 oxidize + R12 双模型收敛 | ✅ 全部落地 |

> **Phase 3 / R4 已 100% 完成**。R0-R12 全部落地，harness 完整：硬门禁覆盖 lint/format/test/build/e2e/audit/align-check/check:videos/check:lesson-alignment/data-protect/no-circular，加 R4 AI review（建议性）。遗留非阻断项见下。

**各需求落地点**：

| 需求 | 落地点 | 说明 |
|---|---|---|
| R4 AI code review | `.github/workflows/ai-review.yml` + `scripts/ai-review.mjs` | DeepSeek 结构化 review（功能缺失/逻辑bug/边界遗漏/数据风险），建议性非阻断；key 走 `DEEPSEEK_API_KEY` secret |
| R8 断句参数实验 | `scripts/experiments/segment-parameter-search.mjs`（只读） | 192 格矩阵搜索，最优 `maxGap=0.7/minWords=4/mergeGap=1.2/maxWords=22`（带自证偏置，仅供评估，segment.mjs 默认未改） |
| R9 端口守卫 | `scripts/port-guard.mjs` | `npm run dev` 前探测 5173；外部进程占用则阻断、本仓库残留则提示可 kill |
| R10 报错闭环 MVP | `src/lib/errorReporter.ts` + `server/index.mjs`(`POST /api/errors`) + `scripts/error-report.mjs` | 前端报错收集 → AI 分析报告；**MVP 明确不做自动改码**（需人验收后另做） |
| R11 oxidize | `scripts/oxidize-report.mjs` + `docs/oxidize/log.json` | 摩擦日志 → 优化计划（before/after 目标），**只出计划、人挑执行** |
| R12 双模型收敛 | `src/types.ts`(`Cue` 基类型) + `src/lib/cue.ts` + `scripts/check-lesson-cue-alignment.mjs` + `scripts/lesson-cue-baseline.json` | 课程线并入视频线，统一 `Cue` 时间轴语义；句间停顿高亮「提前跳下一句」→「保持上一句」（对齐改进）；step4 保零丢失（策展句不可干净派生，未删重复数据）——`check:lesson-alignment`（id 强校验）已挂 CI 硬门禁 |

### 人机协作边界（一句话原则）

**凡「影响主干、影响数据正确性、影响用户体验」的，必须有 gate；凡「沙盒内可逆、可回放、有证据」的，放权给 AI 全自动。**

### Harness 门禁清单（三档）

| 档 | 门禁 | 触发 | 行为 |
|---|---|---|---|
| **硬门禁**（阻断合入） | `lint` / `format:check` / `test` / `build` / `e2e` / `audit`(high+) / `align-check`(豁免清单) / `check:videos`(素材+媒体) / `check:lesson-alignment` / `data-protect` / `depcruise`(no-circular) | `.github/workflows/ci.yml` | 任一失败 → CI 红 → 阻断 PR |
| **告警不阻断** | `lint:complexity`(warn) / `knip` / `deadcss` | `ci.yml` 的 `boundary-check` 与 `dead-code` job | `continue-on-error`，只报告不阻断，README 描述与 UI 需一一对应 |
| **AI review（建议性）** | `ai-review`（DeepSeek 结构化 review） | `.github/workflows/ai-review.yml`（PR opened/synchronize） | 无 key / 失败 / 有发现**都不阻断**，仅 post 评论（`Reviewed: <sha>` 去重） |

**npm scripts 速查**：
```bash
npm run dev                    # port-guard.mjs → server/index.mjs（vite 热更新）
npm run build                  # tsc -b && vite build → dist/
npm test                       # node --test tests/*.test.mjs
npm run lint                   # eslint scripts+tests
npm run lint:complexity        # eslint src/**（复杂度，warn）
npm run depcruise              # src 循环依赖检测（硬门禁）
npm run knip                   # 死代码/无用导出检测（告警）
npm run deadcss                # purgecss 未用选择器（告警）
npm run format:check           # prettier --check scripts+tests
npm run check:alignment        # check-cue-alignment（en/zh 漂移，豁免清单硬门禁）
npm run check:videos           # 所有视频 cue/注册表/媒体来源（本地部署或 YouTube fallback）硬门禁
npm run check:lesson-alignment # check-lesson-cue-alignment --strict --baseline（R12 id 强校验）
npm run oxidize                # 摩擦日志 → docs/oxidize/plan.md（只出计划）
npm run errors:report          # 前端报错 inbox → docs/error-report-DATE.md（AI 分析）
```

### 对 AI 接手者的关键约定

1. 改 `scripts/lib/*` 必须反例测试先行（红→绿）；改 `src/` UI 必须浏览器实证 + qa 截图。
2. `src/data/lessons.generated.ts`（Bern，可生成）与 `src/data/lessons.manual.ts`（Innsbruck，手写只读）已隔离——**禁止**让 `build:lessons` 触碰 manual。
3. 提交过 CI 门禁（`.github/workflows/ci.yml`）：硬门禁 `lint / format / test / build / e2e / audit / align-check / check:videos / check:lesson-alignment / data-protect / no-circular`；告警不阻断 `dead-code`；另有 `.github/workflows/ai-review.yml` 的 **AI code review（DeepSeek，建议性非阻断）**。
4. 单模块单 PR，不混装；commit 三段式（症状 → 根因 → 验证）。
5. **R12 对齐红线**：`scripts/check-lesson-cue-alignment.mjs --strict --baseline`（即 `npm run check:lesson-alignment`）必须 0 新增漂移——禁止把课程句 `Lesson.sentences` 改写成从 `VideoEntry.cues` "派生"的假对应（策展教学不可干净派生）。同时 `check:alignment`（cue deck en/zh）用豁免清单拦新漂移。
6. **R12 语义收敛提醒**：视频线句间停顿「保持上一句」而非「提前跳下一句」；时间轴一律走 `cue.startTime` 绝对时间（`mediaStartTime` 仅存 player 层做 `toVideoTime` 换算）。
7. **视频素材可播放红线**：播放器 reset key 只能用稳定素材 id；本地 MP4 不可部署时必须有 YouTube id，且备用源上报 `youtubeTime - mediaStartTime`，禁止为某一条素材写特例时间轴。

## 运维速查（M1 反馈 API）

```bash
npm run m1:status                  # 远端 API 状态
npm run m1:usage                   # 用量
npm run m1:install-key             # 从剪贴板装 OpenAI key 到 M1（不回显不入库）
npm run m1:install-deepseek-key    # 同上，DeepSeek（仅教练文本，不转写音频）
npm run worker:deploy              # 部署/更新 CF Worker
```

素材来源：Bern 2025 女子抱石决赛（官方 YouTube）； bundled 媒体版权归原权利方，代码 MIT。
