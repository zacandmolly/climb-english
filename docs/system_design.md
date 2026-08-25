# climb-english R4 + Phase 3（R8–R12）系统设计

> 架构师：高见远 ｜ 纯设计，不落实现代码 ｜ 每个需求拆 **目标 / 涉及文件 / 设计要点 / 验收标准**，末尾给拆分顺序、人机边界、R12 渐进收敛路线与选型。

---

## R4 AI code review 门禁（P0，Phase 1 剩余项）

**目标**：PR 自动触发 AI review，把「PR diff + 相关功能清单」喂 DeepSeek，输出分类结构评论贴回 PR；建议性非阻断。
**涉及文件**：
- 新增 `.github/workflows/ai-review.yml`
- 新增 `scripts/ai-review.mjs`（编排：拉 diff → 精简上下文 → 调 DeepSeek → 贴评论）
- 新增 `scripts/lib/ai-review-prompt.mjs`（prompt 组装 + 结构化输出 schema）
- 复用 `scripts/lib/translate.mjs` 的 DeepSeek fetch 模式
- 复用 `src/data/videos/index.ts` / `lessons.ts` 生成「功能清单」上下文

**设计要点**：
- 触发：`pull_request`（opened / synchronize）+ `types: [opened, synchronize]`；**bypass 并发**用 `concurrency` 防止多 SHA 并行重复。
- **防重复**：先经 GitHub API `GET /repos/{owner}/{repo}/pulls/{n}/comments` 扫描是否已存在标记为 `ai-review-bot` 的评论；若当前 `PR#head.sha` 已审过则跳过（按 SHA 存评论 footer `Reviewed: <sha>`）。synchronize（新 commit 推送）允许重审，opened 只在无 AI 评论时审。
- 上下文组装：`gh api repos/{o}/{r}/pulls/{n}/files` 拿 files + patch；`gh api repos/{o}/{r}/pulls/{n}/commits` 拿 commit 列表拼**功能清单**（由提交梗概/AI 生成）。**截断策略**：单文件 >200 行只取 hunk 头 + 新增行摘要，整包 >40KB 取前 N 个文件，用 token 预算（如 8k）截断。
- DeepSeek 调用：复用 `translate.mjs` 的 `fetch(baseUrl/chat/completions)` + `response_format: json_object` + `parseJsonLoose`；输出 schema `{files:[], issues:[{category:'功能缺失'|'逻辑bug'|'边界遗漏'|'数据风险', severity:'high|med|low', file, line, suggestion}]}`。
- 回贴：`gh api repos/{o}/{r}/pulls/{n}/comments -f body=...`；body 含分类 issue 表 + 结论行 + `Reviewed: <sha>`。
- **非阻断**：该 job 只贴评论，**不**作为 required status check；如需 CI 信号，单独打一个 `neutral`/`success` 结论（而非 `failure`），标准 `$GITHUB_STEP_SUMMARY` 记录。DeepSeek key 存 `CI secrets.DEEPSEEK_API_KEY`，绝不入代码。

**验收标准**：① 新 PR 打开自动出一条 AI review 评论（含 SHA）；② 同一 SHA 不重复评论；③ push 新 commit 后重审并更新评论；④ 无 key 时 job 优雅跳过并注释说明；⑤ CI 无 required check 红色失败。

---

## R8 断句参数数据驱动实验（P1，只读）

**目标**：`segment.mjs` 的 gap/minWords/maxWords/mergeGap 用真实数据矩阵搜索留档，不再拍脑袋。
**涉及文件**：
- 新增 `scripts/experiments/segment-parameter-search.mjs`
- 新增 `scripts/experiments/lib/metrics.mjs`（评分函数）
- 新增 `docs/segment-parameter-search.md` 或 `scripts/experiments/results.json`
- **只读** `scripts/lib/segment.mjs`（默认不修改）

**设计要点**：
- 数据源：仓库无 VTT fixture（CI 已注明）。故从 `src/data/videos/*.video.ts` 的 `cues`（en+startTime/endTime）用 `timed-words.mjs` 的 `wordsFromCues` 动机做**等距插值**得到词级时间戳（`{time,word,raw}`），即「真实词级样本」。抽样 2–3 个视频各 300–500 词。
- 参数网格：`maxGapSeconds ∈ {0.7,1.0,1.5,1.8}`、`minWords ∈ {4,5,6,7}`、`mergeGapSeconds ∈ {1.2,1.5,2.0,2.5}`、`maxWords ∈ {22,26,30}` 做小规模笛卡尔积（可抽样降维）。
- 指标：碎片率（句长<minWords 占比）、超长句率（>maxWords 或 >maxSentenceSeconds）、短碎片平均词数、分布合理性（标准差/分位数）、filler 占比。综合成一个可比较的 `score`。
- 输出：矩阵结果表（每行一组参数+各指标）、最优参数建议（如 `maxGapSeconds=1.5, minWords=6, mergeGap=2.0`）、复现命令与 seed。落盘 `docs/segment-parameter-search.md`（表格）+ `results.json`。
- 只读原则：**不触碰**现有 `DEFAULTS`；除非实验证明 `gap 0.7/minWords 6`（注：现码已上调 gap→1.5）有明确更优解，才作为后续 PR 单独改动并加回归护栏。

**验收标准**：① 跑一次输出矩阵表 + 最优建议 + 复现说明；② segment.mjs 零改动；③ 结果落盘文档/JSON；④ 全流程无 DeepSeek 依赖（本地计算）。

---

## R9 幽灵进程端口守卫（P1）

**目标**：`npm run dev` 启动前探测 5173，非本仓库进程占用则阻断提示（替代人肉 lsof，复盘 #9）。
**涉及文件**：
- 新增 `scripts/port-guard.mjs`
- 改 `package.json`：`"dev": "node scripts/port-guard.mjs && node server/index.mjs"`

**设计要点**：
- 用 `child_process.execFileSync('lsof', ['-nP','-iTCP:5173','-sTCP:LISTEN','-Fn'])`（macOS/Linux）取 PID；`-iTCP:5173` 若为空直接放行。
- 对每个 PID 用 `ps -o command= -p <pid>` 取命令，用 `lsof -p <pid> | grep cwd` 或在 macOS 用 `lsof -a -p <pid> -d cwd -Fn` 取工作目录。
- 判断：cwd 展开后是否等于本仓库根（`path.resolve(process.cwd())`）。若**指向本仓库** → 打印「检测到旧 dev server 残留 pid=<pid>，可 `kill <pid>`」，提示后可选择继续；若**非本仓库** → 打印占用方信息并 `process.exit(1)` **阻断**。
- 兼容：macOS 与 Linux（CI/e2e 不跑 dev，无需处理）；Windows 留 `--nofallback` 提示。
- npm 接线：dev 前先跑守卫，失败即停，不让 server 起来占用已占端口。

**验收标准**：① 未占用时正常启动；② 本仓库残留进程时给出可 kill 提示（非阻断）；③ 外部进程占 5173 时**阻断**并提示占用方；④ 零依赖、纯 node 脚本。

---

## R10 前端报错 auto fix 闭环（MVP：只收集+分析报告）

**目标**：前端报错收集 → AI 分析报告（MVP **不自动改码**，只收集 + 分析 + 修复建议）。
**涉及文件**：
- 新增 `src/lib/errorReporter.ts`（`window.onerror`/`unhandledrejection` handler）
- 改 `src/main.tsx`（挂载 errorReporter）
- 改 `server/index.mjs`（新增 `POST /api/errors`）
- 新增 `scripts/error-report.mjs` + `src/lib/errorReport.mjs` 或复用 `translate.mjs` 模式
- 新增 `docs/error-report-YYYY-MM-DD.md`（落盘）

**设计要点**：
- 前端：`window.onerror` + `addEventListener('unhandledrejection')` 捕获，结构化 `{message, stack, componentStack, url, ts, route}`；**限流**合并（同 message+stack hash 30s 内去重，本地 `localStorage` 上限 ~200 条环形缓冲）；`navigator.onLine` 且 server 可达时 `fetch('/api/errors', POST)`，否则落 localStorage 下次补发。
- server：`POST /api/errors`，body 校验 + 简单限流（复用现有 usage 计数思路），写入 `docs/error-inbox.jsonl`（或内存+落盘）。注意该接口**仅本机/dev**，生产可关（`NODE_ENV!=production`）。
- 报告脚本：`npm run errors:report` → 读收集的报错 → 按错误签名聚类（同 stack 同 route 归并、统计频率）→ 调 DeepSeek（复用 translate 模式）分析根因 + 修复建议 + 影响范围 → 输出 `docs/error-report-YYYY-MM-DD.md`（分「阻断/常见/偶发」，每条给根因+建议+验证步骤）。
- **边界**：MVP 只到报告层；「自动修代码」留后续需人验收，代码里明确注释此边界。

**验收标准**：① 前端捕获报错并上报（离线落 localStorage）；② `/api/errors` 记录落盘；③ 一次 `errors:report` 生成结构化报告；④ 报告含聚类 + AI 根因 + 修复建议；⑤ 无自动改码逻辑。

---

## R11 oxidize harness（AI 自我进化）

**目标**：AI 扫自己执行任务时的摩擦（命令被拦/缺库/临时脚本）→ 优化计划 → 人挑 → 补工具/权限。
**涉及文件**：
- 新增 `docs/oxidize/log.json`（或 `docs/oxidize/log.md`）+ `docs/oxidize/README.md`
- 新增 `scripts/oxidize-report.mjs`
- 改 `package.json`：`"oxidize": "node scripts/oxidize-report.mjs"`
- 后续可能改 `scripts/*` + `.github/workflows/ci.yml`

**设计要点**：
- 摩擦日志格式 `.json`：`{ts, agent, phase, cmd, blockedBy:'permission'|'missing-lib'|'missing-tool'|'bug', expected, actual, suggestion}`。AI 卡点时追加一行。写入脚本可作为 helper 暴露（`scripts/lib/friction-log.mjs`）。
- `scripts/oxidize-report.mjs`：读 all logs → 按 `blockedBy` 分组统计频率 → 汇总为「优化计划」每条含：摩擦类型/根因/建议补什么工具或权限/应改哪些文件（`scripts/*`、`ci.yml`、`package.json`）。
- 计划中每类标 `before`（当前次数/耗时）与 `after`（期待下降目标），作为可量化验收。
- 输出 `docs/oxidize/plan.md`；**人挑执行**——脚本只给计划，不自动改 scripts/ci。

**验收标准**：① 有摩擦日志格式 + 写入 helper；② 一次 `npm run oxidize` 输出分组优化计划；③ 每条含 before/after 目标；④ 不自动改代码/权限，计划供人挑。

---

## R12 双数据模型收敛（最敏感，最高优先级，先设计不动手）

**目标**：`Lesson/PracticeSentence`（课程线）与 `SubtitleCue/VideoEntry`（视频线）两套类型、两套时间轴语义、重复工具函数收敛为**单一事实源**。
**涉及文件**：
- `src/types.ts`（核心：新增统一 `Cue` 基类型）
- `src/lib/lesson.ts`、`src/lib/ui.tsx`、`src/hooks/useCuePlayer.ts`、`src/lib/cue.ts`（新增）
- 数据：`src/data/lessons.*`、`src/data/videos/*.video.ts`
- 渲染：`views/LibraryView.tsx`、`BilingualStudio.tsx`、`MaterialBar.tsx`、`players/*`

**设计要点**：见下方「R12 渐进式收敛路线」。核心方向定为**课程线并入视频线**——以 `Cue` 为唯一时间轴基础单元，`SubtitleCue` 为其媒体直读版，`PracticeSentence` 为学习者标注版（在 `Cue` 之上叠加 keywords/patterns/speakingPrompt）。两套时间轴语义统一为：**播放层绝对时间 = cue.startTime（已含 mediaStartTime 偏移）的单一语义**，`mediaStartTime` 仅保留在 player 层做 `toVideoTime` 换算（现 `useCuePlayer` 已如此），课程线不再自行维护「sentence startTime + 偏移」双值。

---

## 拆分顺序与依赖（PR 划分）

| PR | 需求 | 优先级 | 依赖 | 说明 |
|---|---|---|---|---|
| PR-1 | R9 端口守卫 | P1 | 无 | 最小、独立、零风险 |
| PR-2 | R4 AI review | **P0** | 无 | 独立 CI 增量，Phase 1 收尾 |
| PR-3 | R8 断句实验 | P2 | 无 | 只读脚本，不动 segment.mjs |
| PR-4 | R10 报错闭环 | P1 | 无 | 前端 + server + 报告脚本 |
| PR-5 | R11 oxidize | P2 | 无 | 摩擦日志 + 计划脚本 |
| **PR-最后** | **R12 收敛** | **P0 谨慎** | 建议在 R8 之后（断句结果可能影响数据形态），且与其他 src 改动错峰 | 单独谨慎，分步渐进 |

**并行策略**：PR-1/2/3/4/5 相互独立，可并行多线开发（各改不同文件，冲突面小）；R12 单独排在最后，避免与其它 src 改动并发导致收敛基础反复漂移。

---

## 人机边界（每需求「AI 全自动 / 人审 gate」）

| 需求 | AI 全自动 | 人审 gate |
|---|---|---|
| R4 | 拉 diff、拼上下文、调 DeepSeek、贴评论 | 评论仅**建议非阻断**；是否采纳由人；key 由人在 secret 配置 |
| R8 | 参数矩阵搜索、指标评分、生成建议与文档 | 是否据此改 `segment.mjs` 默认参数需人确认（带回归护栏） |
| R9 | 探测端口、识别 cwd、判定残留/外部、阻断 | 本仓库残留提示，kill 与否由人决定 |
| R10 | 收集报错、聚类、DeepSeek 根因+建议 | **自动改码必须人验收**（MVP 明确不做）；报告由人阅读 |
| R11 | 读日志、分组、出优化计划（含 before/after） | **补工具/权限需人挑**；不自动改 scripts/ci |
| R12 | 类型层收敛（安全部分）可 AI 推进 | 行为/渲染层改动需实播验证 + 人验收；每步过 tsc+build+test 绿 |

---

## R12 渐进式收敛路线（分 5 步，每步验证 + 风险标记）

| 步骤 | 动作 | 验证方式 | 风险 |
|---|---|---|---|
| 1. 类型基座（纯类型，安全） | `types.ts` 新增统一 `Cue{id,startTime,endTime,en,zh,note}`，`SubtitleCue` 扩展它、`PracticeSentence` 复用其字段 | `tsc -b` + `npm run build` 绿 | 🟢 低（不改行为） |
| 2. 时间轴语义统一（纯工具层，安全） | 新增 `src/lib/cue.ts` 统一 `cueAtTime/wordsInRange`；`lesson.ts` 的 `sentenceIndexAtMediaTime` 与 `useCuePlayer` 迁到共用语义 | `tsc`+单测+`build` 绿 | 🟢 低（行为等价，需单测覆盖） |
| 3. 渲染层解耦（行为，中风险） | `players/*`、`BilingualStudio`、`MaterialBar` 改用 `Cue` 通用字段读取时间轴 | **实播验证**（开视频走查 karaoke 跟随 + 截图）+ Playwright | 🟡 中（涉及渲染，需实播） |
| 4. 数据单源化（数据，高风险） | 让 `Lesson.sentences` 引用共享 cue deck（按 id）或从 `VideoEntry.cues` 派生，删除重复句子副本 | 数据一致性断言（`check-cue-alignment` + 新 id 对齐脚本）+ tsc/build/test 绿 | 🔴 高（历史上对齐漂移重灾区，需 id 强校验） |
| 5. 工具函数归并收尾（行为，中风险） | 把分散的 `fullTranscript/segmentPatterns/uniqueKeywords` 等归并到 `lib/ui`+`lib/lesson`，删冗余 | 全量单测 + e2e + tsc 绿 | 🟡 中 |

> 原则：**每步一个可合入 PR**，step 不跳步；凡涉及行为/渲染（step 3/4/5）必须「实播验证 + 截图存档」；全程禁止一次性整仓重写（复盘底线）。纯类型层（step 1/2）安全可先做，行为层（3/4/5）需人验收。

---

## 关键技术选型

| 需求 | 工具/文件/命令/API |
|---|---|
| R4 | `gh api repos/{o}/{r}/pulls/{n}/files`、`/comments`；`GET .../pulls/{n}/comments`；`fetch(api.deepseek.com/chat/completions)` 复用 `translate.mjs`；`CI secrets.DEEPSEEK_API_KEY`；`pull_request[synchronize,opened]` + `concurrency` |
| R8 | `node scripts/experiments/segment-parameter-search.mjs`；复用 `timed-words.mjs` 的 `wordsFromCues`/`loadSubtitleWords`；`docs/segment-parameter-search.md` + `results.json` |
| R9 | `node scripts/port-guard.mjs`；`lsof -nP -iTCP:5173 -sTCP:LISTEN -Fn`、`lsof -a -p <pid> -d cwd -Fn`；`ps -o command= -p <pid>`；`path.resolve(process.cwd())` 判定 cwd；`package.json` 接 `&&` |
| R10 | `window.onerror`+`unhandledrejection`；`/api/errors` POST；`docs/error-inbox.jsonl`；`npm run errors:report`；`docs/error-report-YYYY-MM-DD.md`；DeepSeek 复用 translate 模式 |
| R11 | `docs/oxidize/log.json`；`scripts/lib/friction-log.mjs`；`npm run oxidize`；`docs/oxidize/plan.md`；改 `scripts/*`+`ci.yml` 由人挑 |
| R12 | 统一 `Cue` 基类型；新增 `src/lib/cue.ts`；`mediaStartTime` 仅存 player 层做 `toVideoTime`；每步 `tsc -b && npm run build && npm test` 绿 |
