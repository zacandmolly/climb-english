# AI Handoff — climb-english

> 面向 Codex 等 AI 协作者的一站式上手文档。读完即可定位功能、理解数据流向、知道改某个模块的边界与门禁，**无需再通读整个代码库或依赖人肉问答**。
>
> 状态基线：2026-08-25，移动端字幕工作台与 20 秒 Git 预览 / YouTube 预热接续已落地；AI harness 已完整落地（Phase 0-3 + R4 全部完成，R0-R12 全落地）。

---

## 1. 项目一句话

把**真实 IFSC 攀岩解说视频**加工成**攀岩英语听说学习应用**：从 YouTube 导入解说 → 智能断句 + 翻译成字幕（cue）与课程句 → 前端提供「卡拉OK字幕跟随 / 精听 / 录音跟读教练 / 进度管理」；后端（Express + 可选 Cloudflare Worker）负责语音转写 + AI 教练反馈。

技术栈：React SPA + Vite + TypeScript + 本地 Express；内容生成走 Node 离线管线（`scripts/`）；媒体与密钥严格隔离。

---

## 2. 当前完整状态快照

### 2.1 迭代进度（Phase 0-3 + R4 全部落地）

| Phase | 内容 | 状态 |
|---|---|---|
| Phase 0 | R1 提交门禁（`ci.yml` + ESLint + Prettier + husky） | ✅ 已落地 |
| Phase 1 | R2 对齐硬校验 + R3 生成/手写数据隔离 + R4 AI code review | ✅ 全部落地 |
| Phase 2 | R5 Playwright 走查 + R6 模块边界 lint + R7 死代码检测 | ✅ 已落地 |
| Phase 3 | R8 断句参数实验 + R9 端口守卫 + R10 报错闭环(MVP) + R11 oxidize + R12 双模型收敛 | ✅ 全部落地 |

**R0-R12 全部完成**，harness 完整。遗留非阻断项见 §9。

### 2.2 各需求落地点

| 需求 | 落地点 | 说明 |
|---|---|---|
| R1 提交门禁 | `.github/workflows/ci.yml` + ESLint + Prettier + husky | lint/format 硬门禁 |
| R2 对齐硬校验 | `scripts/check-cue-alignment.mjs` + `scripts/alignment-baseline.json` | 严格 + 豁免清单：历史 151 行漂移豁免、新增漂移硬拦截 |
| R3 数据隔离 | `src/data/lessons.ts`（re-export）+ `lessons.generated.ts`（Bern）+ `lessons.manual.ts`（Innsbruck） | 生成与手写彻底隔离，CI `data-protect` 防覆盖 |
| R4 AI review | `scripts/ai-review.mjs` + `scripts/lib/ai-review-prompt.mjs` + `.github/workflows/ai-review.yml` | DeepSeek 结构化 review，建议性非阻断 |
| R5 E2E 走查 | `e2e/karaoke-playback.spec.ts` | Playwright 卡拉OK播放走查，CI 归档截图/录屏 |
| R6 模块边界 | `src/App.tsx` 拆分 + `.dependency-cruiser.js` + `lint:complexity` | `no-circular` 已升硬门禁；复杂度 warn |
| R7 死代码 | `knip` + `find-dead-css.mjs` | 告警不阻断 |
| R8 断句参数实验 | `scripts/experiments/segment-parameter-search.mjs` + `scripts/experiments/lib/metrics.mjs` | 只读，不改 segment.mjs |
| R9 端口守卫 | `scripts/port-guard.mjs` | dev 前探测 5173 |
| R10 报错闭环 | `src/lib/errorReporter.ts` + `server/index.mjs`(`POST /api/errors`) + `scripts/error-report.mjs` | 收集 + AI 报告；MVP 不做自动改码 |
| R11 oxidize | `scripts/oxidize-report.mjs` + `scripts/lib/friction-log.mjs` + `docs/oxidize/` | 摩擦 → 优化计划；只出计划人挑执行 |
| R12 双模型收敛 | `src/types.ts`(`Cue` 基类型) + `src/lib/cue.ts` + `scripts/check-lesson-cue-alignment.mjs` | 课程线并入视频线，统一时间轴；id 硬门禁 |
| 视频素材可播放门 | `src/players/CueMediaPlayer.tsx` + `scripts/check-video-pipeline.mjs` + Playwright | 已部署 MP4 直播；大文件/缺失文件先播 Git 20 秒学习窗口、后台预热 YouTube 接续点，并保持同一 cue 时间轴；CI 校验所有当前/未来素材 |

---

## 3. 核心架构：数据生成 / 数据消费分离

整个系统切成两个**互不干扰的边界**，中间只靠「数据文件」单向连接：

- **内容管线（离线，一次性生成）**：`scripts/` 负责所有新素材的「发现 → 下载/转码 → 断句 → 翻译 → 生成数据」，把结果**持久化**成 `.video.ts` / `lessons.generated.ts` 数据文件后就不再重跑。
- **页面端（在线，只读消费）**：`src/` + `server/` 只**读**管线产出的数据文件，负责播放 / 跟读 / 课程流 / 口语反馈，从不反向触碰内容。

> **原则**：改页面端不会碰内容管线、不返工，不会因改页面重新烧 DeepSeek Token。内容只生成一次，页面永远消费同一份数据。

单向连接示意：

```
内容管线（离线 scripts/）──生成──> 数据文件 ──只读消费──> 页面端（在线 src/ + server/）
       一次性                             持久化              永不反向写管线
```

边界规则：
- `scripts/` 可以读 `src/data/` 来校准/验证，但绝不写页面端逻辑。
- `src/` / `server/` 只读数据文件，绝不写回 `scripts/` 或数据文件。
- 静态部署时浏览器直连服务器；口语反馈走可选的远端 Worker。

---

## 4. 关键模块地图

| 模块 | 路径 | 职责 | 状态 |
|---|---|---|---|
| 应用入口 | `src/main.tsx` | React root；安装 R10 报错收集后才渲染 | ✅ |
| 应用外壳 | `src/App.tsx`（~544 行） | 4 tab（今天/听力/生词本/我的）切换、全局状态、拼装素材栏/播放器/工作台（纯编排） | ✅ 已拆分 |
| 素材栏（唯一素材入口） | `src/components/MaterialBar.tsx` | 课程+视频统一选择；`COURSE_SUPERSEDED_BY_VIDEO` 取代映射 | ✅ |
| 卡拉OK工作台 | `src/components/BilingualStudio.tsx` + `src/hooks/useCuePlayer.ts` | cue 级卡拉OK跟随、单句循环、学习句过滤；reset 只依赖稳定素材 id | ✅ |
| 卡拉OK媒体面 | `src/players/CueMediaPlayer.tsx` | 本地 MP4 / Git 20 秒预览 / YouTube 三层媒体统一暴露片段相对时钟；预览播放时 iframe 隐藏预热接续点 | ✅ 三层统一 |
| 跟读教练（视频素材） | `src/components/SpeakingCoach.tsx` | 录音→Whisper→AI 反馈；只接收 `CoachTarget` | ✅ |
| 口语教练（课程流程） | `src/views/CoachPanel.tsx` | 课程流程录音跟读；与 SpeakingCoach 功能重叠 | ⚠️ 待合并 |
| 课程播放器（本地） | `src/players/LocalVideoPlayer.tsx` | 本地视频，`onTimeReport(currentTime + mediaStartTime)` | ✅ |
| 课程播放器（YouTube） | `src/players/YouTubePlayer.tsx` | IFrame 嵌入 + 250ms 轮询；就绪前点击排队 | ✅ |
| 听力工作台 | `src/views/TodayView.tsx` + `src/views/Sidebar.tsx` | 今日台、整段精听卡拉OK + 侧栏进度/热力图 | ✅ |
| 课程构建 | `src/courses.ts` | lessons → 天/句子课程计划、解锁顺序 | ✅ |
| 进度存储 | `src/progress/storage.ts` + `src/progress/session.ts` | localStorage（schema v2 + v1 迁移）、生词本、打卡 | ✅ |
| 纯函数工具层 | `src/lib/ui.tsx` + `src/lib/{lesson,audio,feedback,cue}.ts` + `src/constants.ts` + `src/players/playback.ts` | 高亮/时间/静态资源 + 课程句时间轴 + WAV 编码 + 反馈降级 + **R12 统一时间轴原语** + 常量 | ✅ |
| 时间轴语义工具（R12） | `src/lib/cue.ts` | `cueAtTime` / `wordsInRange` / `toCue` / `transcriptOfCues` / `patternsForEnglish` | ✅ 有测试 |
| 类型 | `src/types.ts` | 统一 `Cue` 基类型 + 派生 `SubtitleCue`/`PracticeSentence` + `VideoEntry`/`Lesson` 等 | ✅ 已收敛 |
| 课程数据 | `src/data/lessons.ts` + `lessons.generated.ts` + `lessons.manual.ts` | Bern 6 天（生成）+ Innsbruck 7 天（手写） | ✅ 已隔离 |
| 视频数据 | `src/data/videos/` | 技巧教学 99 / Bern 646 / Innsbruck 2242 cue + 懒加载注册表 | ✅ |
| 课程↔cue 对齐 | `scripts/check-lesson-cue-alignment.mjs` + `lesson-cue-baseline.json` | id 强校验（R12 step4） | ✅ 有测试 |
| 本地服务器 | `server/index.mjs` | dev/prod 托管 + 口语反馈 API + 限流 + `POST /api/errors` | ✅ |
| 前端报错收集 | `src/lib/errorReporter.ts` + `scripts/error-report.mjs` | 报错 → 聚类 + AI 分析报告 | ✅ |
| 端口守卫 | `scripts/port-guard.mjs` | dev 前探测 5173 | ✅ |
| AI code review | `scripts/ai-review.mjs` + `scripts/lib/ai-review-prompt.mjs` + `ai-review.yml` | DeepSeek 建议性 review | ✅ |
| 断句参数实验 | `scripts/experiments/segment-parameter-search.mjs` + `experiments/lib/metrics.mjs` | 只读矩阵搜索 | ✅ |
| 摩擦→优化计划 | `scripts/oxidize-report.mjs` + `scripts/lib/friction-log.mjs` + `docs/oxidize/` | 只出计划 | ✅ |
| 导入管线 | `scripts/import-youtube.mjs` | yt-dlp → 断句评分翻译 → 生成 `.video.ts` | ✅ |
| 断句库 | `scripts/lib/segment.mjs` | 词级时间戳 → 句子边界 | ✅ 有测试 |
| 翻译库 | `scripts/lib/translate.mjs` | DeepSeek 批翻对齐 + 人工回填 | ✅ 有测试 |
| 对齐诊断 | `scripts/check-cue-alignment.mjs` | en/zh 漂移巡检（严格 + 豁免） | ✅ |
| 视频素材门禁 | `scripts/check-video-pipeline.mjs` | cue/翻译/时间窗/注册表 + 每条素材 Git 20 秒 faststart H.264/AAC 预览 + 完整媒体 Git 跟踪或 YouTube fallback | ✅ CI 硬门禁 |
| 视频发现 | `scripts/discover-youtube.mjs` | 扫描候选 → 队列 → 人工挑选 | ✅ |
| 课程生成器 | `scripts/build-official-lessons.mjs` | 只重建 Bern generated | ✅ |
| M1 运维 | `scripts/m1-feedback-api.mjs` | 远端密钥安装/状态/用量 | ✅ |
| 反馈 Worker | `workers/speaking-feedback-worker.mjs` | Cloudflare 代理 + KV 限流 | ✅ |
| 回归测试 | `tests/` | translate/segment/backfill/video pipeline（node --test） | ✅ |
| E2E 走查 | `e2e/karaoke-playback.spec.ts` | Playwright 走查本地 MP4 与 Git 预览→YouTube 预热接续的卡拉OK时间轴 | ✅ |

---

## 5. 数据模型（R12 收敛后）

### 5.1 统一 `Cue` 基类型（`src/types.ts`）

```ts
export type Cue = {
  id: string;        // 全局唯一句 id（subtitle cue 为 c001…，课程句为 s01…）
  startTime: number; // 媒体绝对时间轴上的起始（已含 mediaStartTime 偏移）
  endTime: number;   // 媒体绝对时间轴上的结束
  en: string;        // 英文原文
  zh: string;        // 中文翻译
  note?: string;     // 可选备注
};
```

### 5.2 派生关系

| 类型 | 关系 | 说明 |
|---|---|---|
| `SubtitleCue` | `Cue & {...}`（字面继承） | 媒体直读版，在 Cue 之上加 `score/study/keywords/needsTranslation` 等 |
| `PracticeSentence` | 复用 `Cue['startTime'/'endTime']` 字段 | 学习者标注版，文本字段沿用 `transcript`/`zhTranslation`（与 en/zh 语义等价），并加 `keywords/sentencePatterns/speakingPrompt` 等 |
| `VideoEntry` | 含 `cues: SubtitleCue[]` | 视频素材入口 |
| `Lesson` | 含 `sentences: PracticeSentence[]` | 课程入口 |

### 5.3 时间轴语义（R12 Step 2 统一，重要）

- **单一语义**：播放层绝对时间 = `cue.startTime`（已含 `mediaStartTime` 偏移）。
- `mediaStartTime` **仅保留在 player 层**做 `toVideoTime` 换算（`cueTime - mediaStartTime`），不进入时间轴判定。
- 视频素材的媒体面统一向 `useCuePlayer` 上报片段相对时间：本地为 `video.currentTime`，YouTube fallback 为 `youtube.currentTime - mediaStartTime`；因此 seek 时反向使用 `relativeTime + mediaStartTime`，不得为 Innsbruck/Bern 写素材特例。
- 句间自然停顿**保持上一句高亮**，不提前跳下一句；t 早于首句钳制到 0、越过末句钳制到末下标。

### 5.4 `src/lib/cue.ts` 核心函数

| 函数 | 作用 |
|---|---|
| `cueAtTime(cues, t): number` | 返回绝对时间 `t` 正在播报的 cue 下标（停顿保持上一句） |
| `wordsInRange(cues, start, end): T[]` | 取出时间窗口 `[start,end)` 内所有有交叠的 cue |
| `toCue(item): Cue` | 把 `SubtitleCue`/`PracticeSentence` 归一为统一 `Cue` 视图（数据单源桥，不删写原始数据） |
| `transcriptOfCues(cues)` | 把 Cue 列表英文按序拼接为完整文本 |
| `translationOfCues(cues)` | 中文按序拼接 |
| `patternsForEnglish(text)` | 抽可套用句型（≤3 条） |

> **重要**：`toCue` 只做「归一视图」，不改写任何原始课程数据。`Lesson.sentences` 是教学**策展句**，不是 `VideoEntry.cues` 的 id/时间戳/deep-equal 派生（见 §8 对齐红线）。

---

## 6. 数据流

### 6.1 内容管线（写 `.video.ts` / `.generated.ts`）

```
discover-youtube.mjs → import-youtube.mjs
  → yt-dlp 词级字幕 + 下载/转码媒体
  → segment.mjs（词级时间戳 → 句子边界，gap/minWords/maxWords 参数化）
  → 学习价值评分
  → translate.mjs（DeepSeek 批翻，24/批，严格按返回行 i 对齐；缺失标 needsTranslation 而非兜底）
  → 生成 src/data/videos/<slug>.video.ts + videos/index.ts（注册表带 GENERATED 标记）
```
课程线走 `build-official-lessons.mjs`，只写 `lessons.generated.ts`（Bern）。

### 6.2 运行时学习流

```
素材栏选课程 → lessons.ts → 课程/天/句子
  → LocalVideoPlayer（onTimeReport(currentTime + mediaStartTime) = 换算回统一 cue 绝对时间轴）
    或 YouTubePlayer（句子时间即视频时间；加载期点击排队）
  → 播放中上报播放头 → sentenceIndexAtMediaTime（委托 cueAtTime，停顿保持上一句）
  → 驱动练习稿高亮 + 列表钉顶滚动 → CoachPanel 按当前句给跟读目标
素材栏选视频 → BilingualStudio → CueMediaPlayer（本地 MP4；大文件/失败则 Git 20 秒预览 + 后台预热 YouTube + mediaStartTime 补偿）
  → useCuePlayer（播放本句/下一句/连播）→ cueAtTime 驱动卡拉OK高亮
```

### 6.3 口语反馈流

```
浏览器录音（WAV）→ POST /api/speaking-feedback（本地 Express 或 CF Worker）
  → Whisper 转写（OpenAI）或 DeepSeek 直接教练（仅音频指标）
  → AI 生成反馈（keywordHits / closeness / audioNotes / suggestions / naturalVersion）
  → 无 key 时降级为 demo 反馈（不失败）
```

### 6.4 进度流

```
练习状态 → localStorage（climb-english-progress-v2：completedSessionIds / vocab / practiceDates / activeCourseId）
  → 「我的」页 JSON 导出/导入备份
```

### 6.5 报错流（R10，仅 dev）

```
window.onerror / unhandledrejection → errorReporter 本地 ring 缓冲（去重）→ POST /api/errors
  → 追加到 docs/error-inbox.jsonl → npm run errors:report → 聚类 + DeepSeek 根因 → docs/error-report-DATE.md
```

---

## 7. AI 工作流 / Harness 现状

### 7.1 门禁清单（三档）

| 档 | 门禁 | 触发 | 行为 |
|---|---|---|---|
| **硬门禁**（阻断合入） | `lint` / `format:check` / `test` / `build` / `e2e` / `audit`(high+) / `align-check`(豁免清单) / `check:videos`(素材+媒体) / `check:lesson-alignment` / `data-protect` / `depcruise`(no-circular) | `ci.yml`（PR + push main） | 任一失败 → CI 红 → 阻断 PR |
| **告警不阻断** | `lint:complexity`(warn) / `knip` / `deadcss` | `ci.yml` 的 `boundary-check`、`dead-code` job | `continue-on-error`，只报告不阻断 |
| **AI review（建议性）** | `ai-review`（DeepSeek 结构化 review） | `ai-review.yml`（PR opened/synchronize） | 无 key / 失败 / 有发现**都不阻断**，仅 post 评论 |

### 7.2 人机协作边界原则

**凡「影响主干、影响数据正确性、影响用户体验」的，必须有 gate；凡「沙盒内可逆、可回放、有证据」的，放权给 AI 全自动。**

- gate 是代码不是 prompt——门禁每次合入前提强制执行，不可协商。
- 数据生成与消费分离——内容只生成一次，页面永远消费同一份数据。
- 单模块单 PR——PR 越小越易 review 和回滚。
- 反例测试先行——先用真实坏数据把测试写红，再修到绿。
- UI 改动必须实证——播放器/跟随无法靠静态检查，必须浏览器走查 + 截图留证。
- 生成文件零手改——要改就改管线，让管线重新生成。

### 7.3 R4 AI review 触发方式

- `.github/workflows/ai-review.yml` 在 PR `opened` / `synchronize` 时触发。
- `scripts/ai-review.mjs` 拉取 PR diff + commit + 特征文件列表，调 DeepSeek（classify-only issue 表），post 评论并带 `Reviewed: <sha>` footer 去重。
- **非阻断**：空 key / 格式错 / API 失败 / 有发现都不阻断 PR。key 走 CI secret `DEEPSEEK_API_KEY`。

---

## 8. 给 Codex 的关键约定（防踩坑）

1. **改 `scripts/lib/*` 必须反例测试先行**（红→绿）；**改 `src/` UI 必须浏览器实证 + qa 截图**（文本描述与截图一致）。
2. **数据隔离**：`src/data/lessons.generated.ts`（Bern，可生成）与 `src/data/lessons.manual.ts`（Innsbruck，手写只读）已隔离——**禁止**让 `build:lessons` 触碰 manual（CI `data-protect` 会拦）。
3. **提交过硬门禁**（`ci.yml`）：`lint / format / test / build / e2e / audit / align-check / check:videos / check:lesson-alignment / data-protect / no-circular`；`dead-code`（knip/deadcss）为告警；另跑 `ai-review`（建议性）。
4. **单模块单 PR，不混装**；commit 三段式（症状 → 根因 → 验证）。改共享函数前 grep 全部调用方。
5. **R12 对齐红线**：`npm run check:lesson-alignment`（即 `check-lesson-cue-alignment.mjs --strict --baseline`）必须 **0 新增漂移**。禁止把课程句 `Lesson.sentences` 改写成从 `VideoEntry.cues` 「派生」的假对应——策展教学不可干净派生（当前 136 句 id 碰撞 0、时间戳精确匹配 0，基线记录的是诚实的**连续切片**关系）。同时 `check:alignment` 用豁免清单拦新 en/zh 漂移。
6. **R12 语义收敛提醒**：
   - 视频线句间停顿「**保持上一句**」而非「提前跳下一句」。
   - 时间轴一律走 `cue.startTime` 绝对时间；`mediaStartTime` 仅存 player 层做 `toVideoTime` 换算。
7. **视频素材可播放红线**：每个素材跑 `npm run check:videos`；每条素材必须有从第一 cue 前 0.3 秒开始的 Git 20 秒预览；本地完整 MP4 只有被 Git 跟踪才算可部署，否则必须有合法 YouTube id。播放器 reset key 只能用稳定素材 id，三层播放器必须维持 `previewStartOffset + previewTime = youtubeTime - mediaStartTime` 的相对时钟。
8. **生成文件零手改**：`src/data/videos/*.video.ts`、`videos/index.ts`、`lessons.generated.ts` 由管线产出（注册表带 `GENERATED` 标记），禁止手改，一律改管线重新生成。
9. **密钥边界**：任何 `VITE_` 变量对浏览器可见，禁止放密钥。密钥只存 M1 的 `~/.climb-english-api.env`、Worker secrets、本地 `.env`（gitignore）。

---

## 9. 遗留非阻断项（供 Codex 判断优先级）

| 项 | 说明 | 建议 |
|---|---|---|
| R12 step4 真实删重复副本 | `Lesson.sentences` 与 cue deck 有 3 处**连续切片**关系（`lesson-cue-baseline.json` 记录）；是否真删重复副本需人确认映射关系，**不可干净派生** | 人确认后再动，动前先跑 `check:lesson-alignment` |
| R8 最优参数带自证偏置 | 当前最优 `maxGap=0.7/minWords=4/mergeGap=1.2/maxWords=22` 是评分函数偏向（minWords 越小碎片定义越松）的结果；`segment.mjs` 默认参数（maxGap=1.5/minWords=6/mergeGap=2.0/maxWords=26）**刻意保持未改** | 是否回归旧默认需人结合真实填充率决定 |
| knip 11 项死代码待清理 | `npm run knip` 报历史死代码（未用 lib 导出/类型等），当前 `dead-code` job 为告警 | 清理后收紧为硬门禁 |
| 视频线高亮去掉 -0.3s pre-roll 提前量 | `useCuePlayer` 的 `PRE_ROLL_SECONDS = 0.3` 仍作为高亮提前量；R12 对齐改进主张「保持上一句」，pre-roll 是否该去掉待验证 | 需浏览器实证后再决定 |
| `CoachPanel` vs `SpeakingCoach` 合并 | 课程流程与视频素材两套跟读教练功能重叠 | 另开 PR 合并 |
| `src/styles.css` v2 遗留死规则 | 全局样式含 v2 死规则 | `deadcss` 结果参考清理 |

---

## 10. 快速上手命令

```bash
npm install
npm run dev                   # 先跑 port-guard.mjs 探测 5173，再起 vite+Express → http://127.0.0.1:5173
npm run build                 # tsc -b && vite build → dist/
npm run preview               # NODE_ENV=production node server/index.mjs（静态托管 dist/）
npm test                      # node --test tests/*.test.mjs（管线回归）
npm run lint                  # eslint scripts+tests（硬门禁）
npm run lint:complexity       # eslint src/**（复杂度，warn）
npm run depcruise             # src 循环依赖（硬门禁）
npm run knip                  # 死代码/无用导出（告警）
npm run deadcss               # purgecss 未用选择器（告警）
npm run format:check          # prettier --check scripts+tests（硬门禁）
npm run check:alignment       # check-cue-alignment --strict --baseline（en/zh 漂移，硬门禁）
npm run check:videos          # 所有视频 cue/注册表/媒体来源（本地部署或 YouTube fallback）硬门禁
npm run check:lesson-alignment# check-lesson-cue-alignment --strict --baseline（R12 id 强校验）
npm run oxidize               # 摩擦日志 → docs/oxidize/plan.md（只出计划）
npm run errors:report         # 前端报错 inbox → docs/error-report-DATE.md（AI 分析）
npm run build:lessons         # 只重建 Bern 课程 → lessons.generated.ts
npm run import:youtube -- "<url>" --title "<标题>" --category <cat> --level <level> --slug <id>  # 导入素材
npm run generate:previews [video-id ...]  # 为历史素材重建 20 秒 Git 预览；新导入已自动生成
npm run translate:videos -- --video <slug>   # 补齐翻译
npm run discover:youtube      # 扫描候选 → 队列
```

**素材上线流程（新素材必经）**：`import:youtube`（自动生成 20 秒学习窗口）→ 翻译完整门 → `check:alignment` → `check:videos`（Git 预览 + 本地媒体可部署或有 YouTube fallback）→ `build` → 本地/预览→备用源卡拉OK浏览器实证 + qa 截图 → 素材栏接线（必要时在 `MaterialBar.tsx` 加 `COURSE_SUPERSEDED_BY_VIDEO` 映射）。**禁止手工编辑 `.video.ts` 绕过管线。**

---

## 附：相关文档

- `README.md` — 项目主文档（架构/模块/依赖/数据流/迭代规范/AI 工作流）。
- `RETROSPECTIVE.md` — 工程复盘与踩坑录（对齐漂移、旧副本端口占用、数据丢失等历史教训）。
- `docs/system_design.md` + `docs/class-diagram.mermaid` + `docs/sequence-diagram.mermaid` — 系统设计与时序/类图。
- `docs/ai-workflow-proposal.md` — AI harness 方法论完整方案。
- `docs/oxidize/plan.md`、`docs/segment-parameter-search.md`、`docs/error-report-*.md` — 各 harness 产物。
