# Climb English Studio

从真实 IFSC 攀岩解说视频中训练攀岩英语听说的本地学习应用。React SPA + 本地 Express 服务器 + YouTube 内容导入管线 + 远端 AI 口语反馈。

> 本 README 面向两类读者：项目所有者，以及后续参与协作的 AI。目标是看完本文件即可定位任何功能的代码位置、理解数据从哪来到哪去、知道改哪个模块该遵守什么约定。
>
> 工程复盘与踩坑录见 [RETROSPECTIVE.md](./RETROSPECTIVE.md)。

## 核心能力：卡拉OK字幕跟随（karaoke follow）

本项目最重要的学习功能。英文播放到哪，字幕就跟随到哪——当前句高亮 + 字幕列表自动滚动（当前句钉在列表顶部），点击任意句可跳转循环，配合 AI 跟读教练。两条实现路径，同一体验：

| 路径 | 场景 | 时间轴驱动 |
|---|---|---|
| **BilingualStudio**（卡拉OK工作台） | 素材栏选"视频素材"（导入管线产物，如技巧教学 99 句、Bern 智能重切 652 句） | `useCuePlayer`：video timeupdate → `currentTime + mediaStartTime` → 活动句推进 → SubtitlePanel 钉顶滚动 |
| **ListeningWorkspace**（课程流程） | 素材栏选"课程素材"（Bern/Innsbruck 每日课程），整段精听模式 | 本地视频 `onTimeReport(currentTime + mediaStartTime)`；YouTube 走 250ms 轮询 `getCurrentTime()`（句子时间即视频时间，无偏移）→ `sentenceIndexAtMediaTime` → 练习稿跟随 |

维护要点：跟随只推进高亮、绝不改播放模式或触发重播；effect 依赖 key 不得包含会被跟随间接改变的状态（见复盘 #10 rangeKey 反馈循环）；YouTube 嵌入经代理加载慢，就绪前的播放点击必须排队而非静默丢弃。

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
│   main.tsx → App.tsx（4 tab：今天/听力/生词本/我的，视频素材内嵌今天视图）       │
│     ├─ 素材栏（唯一素材入口）：课程素材（lessons.ts）｜视频素材（videos/*）         │
│     ├─ 课程流程（今天/听力视图）：视频播放器（本地 MP4 / YouTube IFrame）          │
│     │   + 整段精听卡拉OK跟随 + CoachPanel 录音跟读                               │
│     ├─ 视频素材（今天视图）：BilingualStudio 卡拉OK工作台（cue 级跟随）           │
│     └─ 进度/vocab：localStorage（schema v2，含 v1 迁移）                         │
│ 本地服务器（server/index.mjs）                                                   │
│   dev = vite 中间件；prod = dist/ 静态托管 + POST /api/speaking-feedback         │
│   （限流 + OpenAI Whisper 转写 + DeepSeek/OpenAI 教练回复）                      │
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
| **卡拉OK工作台** | `src/components/BilingualStudio.tsx` + `src/hooks/useCuePlayer.ts` | 视频素材的 cue 级卡拉OK跟随、单句循环、学习句过滤、SpeakingCoach 跟读；经素材栏"视频素材"入口进入（今天视图内渲染） | ✅ 已独立 |
| **跟读/口语教练（视频素材）** | `src/components/SpeakingCoach.tsx` | 录音 → Whisper 转写 → AI 教练反馈；只接收 `CoachTarget`，被卡拉OK工作台复用 | ✅ 已独立 |
| **口语教练（课程流程）** | `src/views/CoachPanel.tsx` | 课程流程的录音跟读教练；与 SpeakingCoach 功能重叠，合并另开 PR，本轮原样独立 | ⚠️ 待与 SpeakingCoach 合并 |
| 课程流程播放器（本地 MP4） | `src/players/LocalVideoPlayer.tsx` | 本地视频播放，`onTimeReport(currentTime + mediaStartTime)` 换算回字幕时间轴 | ✅ 已独立 |
| 课程流程播放器（YouTube） | `src/players/YouTubePlayer.tsx` | IFrame 嵌入 + 250ms 轮询 `getCurrentTime()`；就绪前的播放点击排队而非静默丢弃 | ✅ 已独立 |
| 课程流程/听力工作台 | `src/views/TodayView.tsx`（TodayFocusCard/SentenceStrip/ListeningWorkspace）+ `src/views/Sidebar.tsx`（Sidebar/Heatmap） | 今日练习台、整段精听卡拉OK跟随 + 侧栏学习进度/热力图 | ✅ 已独立 |
| 课程构建逻辑 | `src/courses.ts` | 把 lessons 切成「天/句子」的课程计划、解锁顺序（buildCourses/buildSessionsForCourse/COURSE_PLANS） | ✅ 已独立 |
| 进度存储与迁移 | `src/progress/storage.ts` + `src/progress/session.ts` | localStorage（schema v2 + v1 迁移）、生词本、打卡日期、解锁顺序 | ✅ 已独立 |
| 纯函数工具层 | `src/lib/ui.tsx` + `src/lib/{lesson,audio,feedback}.ts` + `src/constants.ts` + `src/players/playback.ts` | 高亮/时间格式/静态资源 + 课程句子时间轴 + 录音 WAV 编码 + 反馈降级 + 应用常量 | ✅ 已独立 |
| 生词本/我的/听力库视图 | `src/views/{VocabView,MeView,LibraryView}.tsx` | 生词复习、进度备份导出导入、听力库列表 | ✅ 已独立 |
| 样式 | `src/styles.css` | 全局样式，含 v2 遗留死规则 | ⚠️ 待清理 |
| 类型 | `src/types.ts` | `Lesson/PracticeSentence`（课程）与 `SubtitleCue/VideoEntry`（视频）两套并行模型 | ⚠️ 双轨 |
| 课程数据 | `src/data/lessons.ts`（re-export）+ `lessons.generated.ts` + `lessons.manual.ts` | Bern 2025（6 天，生成）+ Innsbruck 2026（7 天，手写）全部句子/翻译/关键词 | ✅ 已隔离 |
| 视频数据 | `src/data/videos/` | 导入视频的 cue 数据（技巧教学 / Bern 智能重切 / Innsbruck 完整重切）+ 懒加载注册表 + 发现队列 | ✅ |
| 本地服务器 | `server/index.mjs` | dev/prod 双模式托管 + 口语反馈 API + 限流 | ✅ |
| 导入管线 | `scripts/import-youtube.mjs` | yt-dlp 拉字幕+视频 → 断句评分翻译 → 生成 `.video.ts` + 注册表 | ✅ 产物经素材栏消费 |
| 断句库 | `scripts/lib/segment.mjs` | 词级时间戳 → 句子边界（gap/minWords/maxWords 参数化） | ✅ 有测试 |
| 翻译库 | `scripts/lib/translate.mjs` | DeepSeek 批翻对齐（严格索引匹配）+ 人工翻译回填（backfillFromReference） | ✅ 有测试 |
| 对齐诊断 | `scripts/check-cue-alignment.mjs` | en/zh 漂移启发式巡检（`--strict` + 豁免清单是硬门禁；非严格是绊网） | ✅ |
| 视频发现 | `scripts/discover-youtube.mjs` | 扫描候选 → 队列 → 人工挑选导入 | ✅ |
| 课程生成器 | `scripts/build-official-lessons.mjs` | 只重建 Bern 课程，写入 `lessons.generated.ts` | ✅ 不再触碰手写 |
| M1 运维 | `scripts/m1-feedback-api.mjs` | 远端 API 的密钥安装/状态/用量（SSH 到 M1） | ✅ |
| 反馈 Worker | `workers/speaking-feedback-worker.mjs` | Cloudflare 代理 + KV 限流 | ✅ |
| 回归测试 | `tests/` | translate 对齐 + segment 断句 + backfill 回填（node --test） | ✅ |
| E2E 走查 | `e2e/karaoke-playback.spec.ts` | Playwright 卡拉OK播放走查（R5），CI 归档截图/录屏 | ✅ |

## 依赖关系（谁 import 谁）

```
main.tsx → App.tsx → components/{MaterialBar, BilingualStudio, SpeakingCoach} + data/lessons.ts → types.ts
App.tsx → MaterialBar（唯一素材入口，选课程/选视频）
App.tsx → BilingualStudio（素材栏选视频素材时，今天视图内渲染）→ hooks/useCuePlayer.ts + data/videos/* + SpeakingCoach.tsx
App.tsx → SpeakingCoach（课程流程的 CoachPanel 也复用同一组件）
scripts/* 之间：import-youtube → lib/{timed-words, segment, translate, climbing-terms}
server/index.mjs → dist/（prod）或 vite（dev）；不依赖 src/ 源码
```

## 数据流

**内容管线（写 `.video.ts`）**：`import:youtube` → yt-dlp 词级字幕 → segment.mjs 断句（gap>1.5s 或 >26 词强制切，短片段向后合并）→ 学习价值评分 → translate.mjs 批翻（24/批，严格按返回行 `i` 对齐，缺失行标记 needsTranslation 而非兜底）→ 生成 TS 模块 + 注册表 `videos/index.ts`。

**运行时学习流**：素材栏选课程 → `lessons.ts` → 课程/天/句子 → LocalVideoPlayer（`currentTime + mediaStartTime` 换算回字幕时间轴）或 YouTubePlayer（句子时间即视频时间，加载期点击排队）→ 播放中上报播放头 → `sentenceIndexAtMediaTime` 驱动练习稿高亮与钉顶滚动 → CoachPanel 按当前句给跟读目标。素材栏选视频 → BilingualStudio（cue 级卡拉OK，见"核心能力"一节）。

**口语反馈流**：浏览器录音（WAV）→ `POST /api/speaking-feedback`（本地 Express 或 CF Worker）→ Whisper 转写 → DeepSeek/OpenAI 生成反馈 → 无 key 时降级为 demo 反馈（不失败）。

**进度流**：练习状态 → localStorage（`climb-english-progress-v2`：completedSessionIds / vocab / practiceDates / activeCourseId）→ 「我的」页 JSON 导出/导入备份。

## 构建与部署

- 本地：`npm run dev`（vite）/ `npm run preview`（prod）。
- GitHub Pages：push 后 Actions 构建静态站，`VITE_BASE_PATH` 控制子路径；静态部署下录音反馈走 `VITE_FEEDBACK_API_BASE` 指向的 Worker。
- Worker：`npm run worker:deploy`（wrangler 配置含 KV 限流：日 300 / 时 90 / 单 IP 时 35 / 音频 10MB）。

## 数据文件约定

- `src/data/lessons.ts`：**re-export 合并**（`[...bernLessons, ...innsbruckLessons]`）。生成部分在 `lessons.generated.ts`（Bern 6 天，可被 `build:lessons` 覆盖），手写部分在 `lessons.manual.ts`（Innsbruck 7 天，**只读受保护**）。`build-official-lessons.mjs` 只写 generated，CI 的 data-protect 门禁防止覆盖 manual。
- `src/data/videos/*.video.ts`、`videos/index.ts`：头部有 `GENERATED` 标记，禁止手改，一律通过管线重新生成。
- `src/data/videos/discover-queue.json`：发现队列，人工挑选后消费。
- `public/media/*.mp4`：大媒体文件**不再入库**（GitHub 100MB 单文件硬限制；历史已追踪的两个小文件保留）。新素材媒体仅存本地——新机器上跑 `npm run import:youtube -- --reuse-media` 前需先经管线重新下载（Innsbruck 完整版 758MB 需用 HLS 格式下载再 ffmpeg 转 H.264，见素材上线流程）。
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
```

| # | 验证门 | 命令 / 标准 | 不过怎么办 |
|---|---|---|---|
| 1 | 翻译完整 | 导入日志 `translated: N/N`（needsTranslation=0） | `DEEPSEEK_API_KEY=… npm run translate:videos -- --video <slug>` 补齐 |
| 2 | 对齐巡检 | `npm run check:alignment -- --video <slug>`，无系统性漂移告警 | 人工抽查 en/zh 列；发现漂移按复盘 #1 法则修管线，禁止手改数据 |
| 3 | 构建 | `npm run build` 全绿 | 修代码 |
| 4 | 卡拉OK实证 | 浏览器（确认端口归属）连播走查：当前句高亮随播放推进、字幕列表钉顶滚动、点句跳转正常，qa 截图存档 | 修 useCuePlayer/播放器，重走此门 |
| 5 | 素材栏接线 | 素材栏自动出现新素材（注册表驱动）；若取代了同源课程，在 `MaterialBar.tsx` 的 `COURSE_SUPERSEDED_BY_VIDEO` 加映射 | — |

上线后的维护事实：媒体文件落 `public/media/`（构建时复制进 dist）；cue 数据为 `GENERATED` 文件；素材栏是唯一素材入口（`src/components/MaterialBar.tsx`，含取代映射）。

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
- **boundary-check / dead-code 起步告警不阻断**：`App.tsx`（~3000 行）和生成数据模块现在必然超阈值、knip 也必报历史死代码，所以这两个 job 用 `warn` / `continue-on-error`——先让它们**跑起来、看得见**，等 App.tsx 拆分和死代码清理 PR 落地后再收紧为硬门禁。

### 进度与路线图

| Phase | 内容 | 状态 |
|---|---|---|
| Phase 0 | R1 提交门禁（`.github/workflows/ci.yml` + ESLint + Prettier + husky） | ✅ 已落地 |
| Phase 1 | R2 对齐硬校验 + R3 生成/手写数据隔离 + R4 AI code review | 🚧 R2（含豁免清单机制）/R3 已落地，R4 待做 |
| Phase 2 | R5 Playwright 走查 + R6 模块边界 lint + R7 死代码检测 | ✅ 本轮已落地（R6/R7 起步告警不阻断） |
| Phase 3 | R8 参数实验 + R9 端口守卫 + R10 auto fix + R11 oxidize + R12 双模型收敛 | ⬜ 待做 |

### 人机协作边界（一句话原则）

**凡「影响主干、影响数据正确性、影响用户体验」的，必须有 gate；凡「沙盒内可逆、可回放、有证据」的，放权给 AI 全自动。**

### 对 AI 接手者的关键约定

1. 改 `scripts/lib/*` 必须反例测试先行（红→绿）；改 `src/` UI 必须浏览器实证 + qa 截图。
2. `src/data/lessons.generated.ts`（Bern，可生成）与 `src/data/lessons.manual.ts`（Innsbruck，手写只读）已隔离——**禁止**让 `build:lessons` 触碰 manual。
3. 提交过 CI 门禁（`.github/workflows/ci.yml`）：硬门禁 `lint / format / test / build / e2e / audit / align-check(豁免清单) / data-protect`；告警不阻断 `boundary-check / dead-code`。
4. 单模块单 PR，不混装；commit 三段式（症状 → 根因 → 验证）。

## 运维速查（M1 反馈 API）

```bash
npm run m1:status                  # 远端 API 状态
npm run m1:usage                   # 用量
npm run m1:install-key             # 从剪贴板装 OpenAI key 到 M1（不回显不入库）
npm run m1:install-deepseek-key    # 同上，DeepSeek（仅教练文本，不转写音频）
npm run worker:deploy              # 部署/更新 CF Worker
```

素材来源：Bern 2025 女子抱石决赛（官方 YouTube）； bundled 媒体版权归原权利方，代码 MIT。
