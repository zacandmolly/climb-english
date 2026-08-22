# 工程复盘：Vibe Coding 踩坑录（climb-english）

基于项目完整 git 历史（2026-05-26 至 2026-08-22，25 个提交、3 个已开 PR）与 `.workbuddy/memory` 工作日志整理。目标是把"每次都靠现场侦探破案"变成"按清单预防"。

## 版本演进时间线

| 阶段 | 时间 | 产物 | 质量后果 |
|---|---|---|---|
| MVP 单日冲刺 | 05-26（12 commits） | 录音、AI 反馈、M1 API、Worker、限流 | 起点干净，模块边界清楚 |
| v2 字幕视频库 | 07-24（未独立提交，后随 PR #1 落库） | BilingualStudio + useCuePlayer + 导入管线 + 小红书风 UI | 引入了第二个数据模型（VideoEntry） |
| v3 课程制重构 | 08-21 `a937cfd` | 单栏学习流、双课程、生词本、打卡 | **最大退化点**：App.tsx 800→3036 行；视频库入口丢失；README 与 UI 脱节 |
| 数据管线修复三连 | 08-22（PR #1/#4/#5） | 翻译对齐、断句调参、backfill 收紧、跟随恢复 | 修复质量高（测试+实证），但都在还 v2/v3 欠的债 |

## 踩坑清单（按根因分类）

### A. 数据完整性类

**1. 静默兜底毁掉对齐（最严重）**
- 实例：`translate.mjs` 的 `items.find(e => e.i === index) ?? items[index]`——DeepSeek 丢行/返回 1 基索引/乱序时，兜底把下一行的翻译悄悄对到上一行，造成 c031 起 +1 系统性漂移，33 句中招而人工只察觉"下一句按钮好像坏了"。
- 根因：把"索引对不上"当成可容忍异常用 fallback 糊过去，而不是当成错误暴露。
- 修复：PR #1 严格索引匹配 + 缺失行标记 needsTranslation + 6 个回归测试。
- 法则：**对齐/映射逻辑里不允许静默 fallback。对不上就 fail loud（标记/报错），让管线重跑，而不是借邻居的数据顶上。**

**2. 启发式诊断报喜不报忧**
- 实例：`check-cue-alignment.mjs` 只报出 9 句可疑，真实漂移 33+3 句（漏报 4 倍）。
- 法则：**启发式是绊网不是真相。定位数据漂移靠人肉逐列 diff（en 列 vs zh 列并排读），启发式只负责巡检报警。**

**3. 断句参数凭感觉定**
- 实例：`segment.mjs` gap 阈值 0.7s 是拍的——YouTube 自动字幕换气停顿被切成 1-6 词碎片（26 个），LLM 翻译时把碎片合并，自身索引位移，把 #1 修好的对齐器又"忠实"地漂移了。
- 修复：不猜，跑实验矩阵（gap × minWords × mergeGap × maxWords，用真实 2549 词字幕），26 碎片→0。
- 法则：**参数调优必须跑真实数据矩阵，不许单点试错。顺手发现第二层坑：minWords=6 会吞掉真实短句，要加标点守卫——这条是失败测试抓出来的。**

**4. 模糊匹配阈值连修三次（Issue #2）**
- 实例：backfill 回填人工翻译，0.6/0.5 单向覆盖率阈值 → 60% 重叠的碎片也整句复制 → "一句话翻译出现在好几张卡上"（Bern 664/670 句中招）。第一版修成双向覆盖率仍不够（bb0c5be 才统一到 0.8）。
- 法则：**模糊匹配复用数据，阈值必须双向覆盖 + 用真实反例（Bern c003 vs lessons s01）写进测试。宁可多打 needsTranslation 让机器翻译，不可错配人工校对。**

### B. 工程结构类

**5. 整仓重写丢功能（最大单点退化）**
- 实例：`a937cfd` 一次提交重写 App.tsx（+2112 行），课程制新 UI 上线，但 v2 的视频库入口和卡拉 OK 字幕跟随没有迁移——BilingualStudio/useCuePlayer/SpeakingCoach/data/videos 从此成为无人引用的死代码，README 继续描述一个不存在的"字幕视频库"视图。用户两周后才发现功能没了。
- 根因：vibe coding 时"重写"比"迁移"爽，但重写 PR 没有功能清单对照表，交叉功能（跨视图的字幕跟随）无主，直接蒸发。
- 法则：**重构 PR 必须附旧版功能清单逐项打勾（保留/迁移/删除）；"删除"必须当场删代码删文档，"迁移"必须当场接线。禁止"先留着以后接"。**

**6. 单体化回潮**
- 实例：v2 重构特意把 App.tsx 拆到 ~800 行 + 独立组件；v3 又长回 3036 行（16 组件 + 30 个工具函数 + 存储迁移 + 课程构建全在一个文件）。
- 后果：死代码修复（PR #5 的 rangeKey 反馈循环）要在 3000 行里追 effect 依赖链；任何人改任何功能都在同一个文件制造合并冲突面。
- 法则：**App.tsx 超过 ~800 行就该拆。拆分边界参考 v2：播放器 / 工作台 / 教练 / 进度存储 / 课程构建。**

**7. 生成器与手写数据混用一个文件**
- 实例：`build-official-lessons.mjs` 一次性生成 `lessons.ts`（Bern 6 天课程）；v3 又手写了 Innsbruck 课程直接塞进同一个文件。现在重跑 `npm run build:lessons` 会把 Innsbruck ~1800 行手写内容整体抹掉。
- 法则：**生成器输出文件禁止手改追加。手写课程放独立文件（`lessons.handwritten.ts`）与生成文件并列，或生成器支持多课程输入。雷未拆前，README 红字禁止运行该命令（已加）。**

**8. 双数据模型并行**
- 实例：`Lesson/PracticeSentence`（课程线）与 `SubtitleCue/VideoEntry`（视频库线）两套类型、两套时间轴语义（前者 mediaStartTime 偏移，后者 cue 即时间轴）、重复的工具函数（formatTime / HighlightedText / resolveStaticAssetUrl 在 App.tsx 与 BilingualStudio.tsx 各一份）。
- 法则：**同一概念出现两套模型时，要么当轮统一，要么在 README 明确各自领地。最坏的选择是两个都留且互相不知道对方存在。**

### C. 环境与流程类

**9. 幽灵进程喂错版本**
- 实例：8/21 会话遗留的 dev server 驻留 5173 端口，服务目录是 WorkBuddy 临时副本（旧代码）。用户浏览器里"改了没生效"、"功能消失了"，实际看的根本不是本仓库的构建。本次排查先验证了 20 分钟假线索。
- 法则：**验证任何本地改动前，先 `lsof -nP -iTCP:<port> -sTCP:LISTEN` 确认端口进程的工作目录。agent 会话结束要杀掉自己起的 dev server；看到"改了没生效"，第一反应查环境，第二反应才是查代码。**

**10. 状态派生 key 触发 effect 反馈循环**
- 实例：PR #5 修复中，segment 模式 `rangeKey` 含 `sentence.id`；字幕跟随推进当前句 → key 变化 → seek-to-preroll effect 重跑 → 视频播 4 秒被暂停回退。表象是"播放器有 bug"，真凶是三个模块（跟随状态 / rangeKey / seek effect）的隐性耦合。
- 法则：**effect 的依赖 key 若包含"会被该 effect 间接改变的状态"，就是反馈循环。跟随时 key 必须稳定（`lesson.id-segment`），改动前后要实际播放验证，不能只看渲染。**

**11. TDZ 被 try/catch 吞掉（踩了两次）**
- 实例：`discover-youtube.mjs` 顶层同步调用 `main()`，`const QUEUE_FILE` 声明在文件底部 → TDZ ReferenceError 被 loadQueue 的 try/catch 吃掉，表象是"队列文件不存在"。
- 法则：**顶层立即执行 main() 的 CLI 脚本，所有 const 声明上移到文件头；catch 块不许空吞，至少 console.error 具体错误。**

**12. 大 PR 混装**
- 实例：PR #1 提交信息声称"Bilingual Studio 与翻译修复原子落地"，但实际 App.tsx 从未接线——"原子"承诺与事实不符，审查者（包括未来的自己）无法从 PR 边界判断哪部分可用。
- 法则：**见 README 迭代规范：一个 PR 只回答一个问题。功能落地 = 代码 + 接线 + 文档三件套齐了才算落地。**

## 质量退化点（当前快照）

| # | 问题 | 位置 | 严重度 |
|---|---|---|---|
| 1 | ~~死代码三件套~~ ✅ 已接回（2026-08-22 视频库 tab）| `src/components/ hooks/ data/videos/` | 已解决：双模型仍在（P1-6 观察） |
| 2 | App.tsx 单体 3036 行 | `src/App.tsx` | 高：所有后续改动的冲突面 |
| 3 | lessons.ts 手写/生成混用，生成器重跑即毁数据 | `src/data/lessons.ts` + `scripts/build-official-lessons.mjs` | 高：数据丢失风险 |
| 4 | styles.css 2884 行含 v2 死规则（.subtitle-panel 现已被视频库 tab 复用，.hero 系仍死） | `src/styles.css` | 低 |
| 5 | ~~`.workbuddy/` 未进 .gitignore~~ ✅ 已修 | 根目录 | 已解决 |
| 6 | segment maxWords=26 硬切句中残留（~8 句长碎片结尾是虚词） | `scripts/lib/segment.mjs` | 低：已记录，方案=超长时向后找标点切 |

## 修复与重构优先级清单

**P0（立即，半天内）**
1. ~~决策死代码去留~~ ✅ **已完成（2026-08-22，选方案 A）**：BilingualStudio 接回新 UI 作为第五个 tab"视频库"，数据管线产出恢复消费，README 模块表已同步。
2. ~~`.gitignore` 加 `.workbuddy/`~~ ✅ 已完成（PR #6）。
3. ~~README 重写~~ ✅ 已完成（PR #6），此后每次 UI 变更同步模块表。

**P1（下一个迭代周期，每个都是独立 PR）**
4. 拆分 App.tsx → `src/views/`（5 视图）+ `src/players/`（本地/YouTube/共享时间轴逻辑）+ `src/progress/`（存储与迁移）+ `src/courses.ts`（课程构建）。拆分纯移动不改逻辑，拆完 tsc+build+浏览器走查。
5. lessons.ts 手写/生成分离：Innsbruck 抽到 `lessons.innsbruck.ts`，生成器只写 `lessons.bern.ts`，`lessons.ts` 变成两行 re-export。
6. ~~统一时间轴语义文档~~ ⚠️ 部分完成：README 数据流一节已写明（Lesson 的 mediaStartTime 偏移 vs VideoEntry 直读），两套模型合并仍在 P1 观察名单。

**P2（顺手做）**
7. 公共工具去重：formatTime / HighlightedText / resolveStaticAssetUrl 收敛到 `src/lib/ui.tsx`。
8. styles.css 清 v2 死规则（配合 P1 拆分一起做）。

**P3（记录在案，触发时再做）**
9. segment.mjs 超长句向后找标点切分（Issue #3 备注）。
10. discover 每日自动化的 TLS 中断（网络层，非代码问题）。

## 可复用迭代方法论（改任何模块前的 checklist）

**改前（诊断）**
- [ ] 症状 ≠ 根因：先复现，再 grep 全部调用方，最后才动手
- [ ] 数据问题：人肉逐列 diff 是真相，启发式只做报警
- [ ] "改了没生效" → 先查端口/进程/目录归属，再查代码
- [ ] 参数调优 → 真实数据矩阵实验，不单点试错

**改中（实现）**
- [ ] 最小 diff，修在所有调用方共同经过的位置
- [ ] 对齐/映射逻辑零静默 fallback
- [ ] effect 依赖 key 不含会被自己间接改变的状态
- [ ] CLI 脚本 const 声明在顶层 main() 之前；catch 不空吞
- [ ] 生成文件零手改

**改后（验证）**
- [ ] 管线改动：反例测试先行，红→绿
- [ ] UI 改动：真实构建 + 浏览器走查 + qa 截图，文本与截图数据一致
- [ ] 播放器/跟随类改动：实际播放 ≥10 秒验证（反馈循环类 bug 静态看不出来）

**提交（纪律）**
- [ ] 单模块单 PR，不混装
- [ ] commit 三段式：症状 → 根因 → 验证
- [ ] 功能落地三件套：代码 + 接线 + 文档
- [ ] 死代码不过夜
