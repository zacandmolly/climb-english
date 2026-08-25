# Oxidize 优化计划（2026-08-25）

> 本计划由 `npm run oxidize` 从 `docs/oxidize/log.json` 自动生成，**仅作供人挑选的建议**，不自动修改 scripts/CI。

共记录 3 条摩擦，归类为 3 类。
- **其他摩擦**：1 条（33%）
- **脚本 bug**：1 条（33%）
- **权限拦截**：1 条（33%）

## 各摩擦簇与建议

### 其他摩擦

- **发生次数**：1（before）
- **根因**：不属于上面四类的偶发摩擦
- **建议补工具/权限**：人工判断，补充工具或权限
- **需改动文件**：scripts/*
- **目标（after）**：该类摩擦降至 减少一半（人工判断）。
- **已有建议**：「用 prettier --write 并删掉未用变量」
- **高频命令**：
  - npm run lint（×1）

### 脚本 bug

- **发生次数**：1（before）
- **根因**：脚本逻辑错误/边界未处理，导致预期行为与实测不一致
- **建议补工具/权限**：修复该脚本逻辑，并加回归测试（tests/*）防止回退
- **需改动文件**：scripts/*、tests/*
- **目标（after）**：该类摩擦降至 0 次（修复并加回归测试）。
- **已有建议**：「解析 fcwd 后的 n/c 行，兼容下一天」
- **高频命令**：
  - node scripts/port-guard.mjs（×1）

### 权限拦截

- **发生次数**：1（before）
- **根因**：命令需要写权限/网络权限/secret，当前环境下被拒绝或不可用
- **建议补工具/权限**：补齐 workflow 权限（contents/write 等）、secret（DEEPSEEK_API_KEY）、或显式授权白名单
- **需改动文件**：.github/workflows/ci.yml、package.json
- **目标（after）**：该类摩擦降至 0 次（权限补齐后不再被拦）。
- **已有建议**：「workflow 补权限并走 CI secrets.DEEPSEEK_API_KEY」
- **高频命令**：
  - gh api repos/{o}/{r}/pulls/{n}/files（×1）

## 人机边界

1. **只出计划**：本脚本只读日志、写计划，不改任何 scripts/CI；
2. **人挑执行**：由人逐条决定是否实施，选中后单独提交并验证（before/after 对照本文件）；
3. **可量化验收**：每类摩擦的目标次数写在 after 列，达到即视为该项闭合。
