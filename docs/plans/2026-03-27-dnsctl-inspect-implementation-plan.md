# dnsctl Inspect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `tools/dnsctl` 中实现一个本地只读查询命令，读取 `.env.local`，查询 `ihongben.com` 和 `maxtap.net` 的当前 DNS 状态，并默认输出统一 YAML。

**Architecture:** 采用独立 Bun 小工具项目。CLI 入口负责参数解析与结果输出，provider 模块负责查询远端 DNS 记录，normalize 模块负责把 Cloudflare 和腾讯云返回值统一为稳定的内部结构。测试优先覆盖参数解析、环境变量校验、分页聚合与输出标准化，最后再用真实 `.env.local` 做一次端到端验证。

**Tech Stack:** Bun, TypeScript, bun:test, fetch, js-yaml

---

### Task 1: 初始化 `tools/dnsctl` 项目骨架

**Files:**
- Create: `tools/dnsctl/package.json`
- Create: `tools/dnsctl/tsconfig.json`
- Modify: `tools/dnsctl/.gitignore`
- Modify: `tools/dnsctl/.env.example`

- [ ] **Step 1: 补全项目清单与脚本**

创建 `package.json`，至少包含：
- `inspect` 脚本
- `test` 脚本
- `typecheck` 脚本

- [ ] **Step 2: 补全 TypeScript 配置**

创建 `tsconfig.json`，保证 Bun 可直接运行 TypeScript 且编辑器有类型提示。

- [ ] **Step 3: 补齐忽略规则**

更新 `.gitignore`，确保 `node_modules`、`.env.local` 等本地文件不会被提交。

- [ ] **Step 4: 检查骨架可用**

Run: `cd tools/dnsctl && bun install`
Expected: 依赖安装成功，生成锁文件。

- [ ] **Step 5: Commit**

```bash
git add tools/dnsctl/package.json tools/dnsctl/tsconfig.json tools/dnsctl/.gitignore tools/dnsctl/.env.example
git commit -m "chore: initialize dnsctl project"
```

### Task 2: 建立内部数据模型与标准化测试

**Files:**
- Create: `tools/dnsctl/src/types.ts`
- Create: `tools/dnsctl/src/normalize/records.ts`
- Create: `tools/dnsctl/src/normalize/records.test.ts`

- [ ] **Step 1: 写失败测试，覆盖标准化输出**

测试至少覆盖：
- 根记录输出为 `@`
- Cloudflare `ttl=1` 标准化为 `auto`
- 输出排序稳定
- 非重点记录类型保留输出

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd tools/dnsctl && bun test src/normalize/records.test.ts`
Expected: 因标准化实现缺失而失败。

- [ ] **Step 3: 写最小实现**

实现统一的内部记录结构与标准化函数。

- [ ] **Step 4: 运行测试并确认通过**

Run: `cd tools/dnsctl && bun test src/normalize/records.test.ts`
Expected: 测试通过。

- [ ] **Step 5: Commit**

```bash
git add tools/dnsctl/src/types.ts tools/dnsctl/src/normalize/records.ts tools/dnsctl/src/normalize/records.test.ts
git commit -m "feat: add dns record normalization"
```

### Task 3: 实现环境变量读取与 CLI 参数解析

**Files:**
- Create: `tools/dnsctl/src/config.ts`
- Create: `tools/dnsctl/src/cli.ts`
- Create: `tools/dnsctl/src/config.test.ts`
- Create: `tools/dnsctl/src/cli.test.ts`

- [ ] **Step 1: 写失败测试，覆盖配置与参数行为**

测试至少覆盖：
- 缺少必需环境变量时报错
- 默认输出 YAML
- `--json` 输出 JSON
- `--zone <name>` 只选择单个 zone
- 不支持的 zone 参数报错

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd tools/dnsctl && bun test src/config.test.ts src/cli.test.ts`
Expected: 因实现缺失而失败。

- [ ] **Step 3: 写最小实现**

实现环境变量读取、zone ownership 定义与参数解析。

- [ ] **Step 4: 运行测试并确认通过**

Run: `cd tools/dnsctl && bun test src/config.test.ts src/cli.test.ts`
Expected: 测试通过。

- [ ] **Step 5: Commit**

```bash
git add tools/dnsctl/src/config.ts tools/dnsctl/src/cli.ts tools/dnsctl/src/config.test.ts tools/dnsctl/src/cli.test.ts
git commit -m "feat: add dnsctl config and cli parsing"
```

### Task 4: 实现 Cloudflare provider 查询与分页聚合

**Files:**
- Create: `tools/dnsctl/src/providers/cloudflare.ts`
- Create: `tools/dnsctl/src/providers/cloudflare.test.ts`

- [ ] **Step 1: 写失败测试，覆盖 Cloudflare 查询行为**

测试至少覆盖：
- 正确构造请求头
- 按 zone 名查 zone ID
- 记录列表分页聚合
- `proxied` 字段保留

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd tools/dnsctl && bun test src/providers/cloudflare.test.ts`
Expected: 因 provider 实现缺失而失败。

- [ ] **Step 3: 写最小实现**

实现 Cloudflare API v4 查询封装，并返回标准化前的原始记录结构。

- [ ] **Step 4: 运行测试并确认通过**

Run: `cd tools/dnsctl && bun test src/providers/cloudflare.test.ts`
Expected: 测试通过。

- [ ] **Step 5: Commit**

```bash
git add tools/dnsctl/src/providers/cloudflare.ts tools/dnsctl/src/providers/cloudflare.test.ts
git commit -m "feat: add cloudflare dns inspector"
```

### Task 5: 实现腾讯云 DNSPod provider 查询与分页聚合

**Files:**
- Create: `tools/dnsctl/src/providers/tencent.ts`
- Create: `tools/dnsctl/src/providers/tencent.test.ts`

- [ ] **Step 1: 写失败测试，覆盖腾讯云查询行为**

测试至少覆盖：
- 正确使用 `dnspod.tencentcloudapi.com`
- API 版本固定为 `2021-03-23`
- `DescribeDomainList` 解析 zone
- `DescribeRecordList` 通过 `Offset + Limit` 聚合分页
- 仅接受默认线路记录

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd tools/dnsctl && bun test src/providers/tencent.test.ts`
Expected: 因 provider 实现缺失而失败。

- [ ] **Step 3: 写最小实现**

实现腾讯云 DNSPod API 3.0 查询封装。

- [ ] **Step 4: 运行测试并确认通过**

Run: `cd tools/dnsctl && bun test src/providers/tencent.test.ts`
Expected: 测试通过。

- [ ] **Step 5: Commit**

```bash
git add tools/dnsctl/src/providers/tencent.ts tools/dnsctl/src/providers/tencent.test.ts
git commit -m "feat: add tencent dnspod inspector"
```

### Task 6: 组装 inspect 入口并输出 YAML/JSON

**Files:**
- Create: `tools/dnsctl/src/index.ts`
- Create: `tools/dnsctl/src/output.ts`
- Create: `tools/dnsctl/src/index.test.ts`

- [ ] **Step 1: 写失败测试，覆盖整条 inspect 流程**

测试至少覆盖：
- 默认查询两个 zone
- `--zone` 限定范围
- YAML 输出结构正确
- JSON 输出结构正确
- provider 报错时带 zone 与 provider 上下文

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd tools/dnsctl && bun test src/index.test.ts`
Expected: 因入口实现缺失而失败。

- [ ] **Step 3: 写最小实现**

把 config、provider、normalize、output 串起来，实现 inspect 命令。

- [ ] **Step 4: 运行测试并确认通过**

Run: `cd tools/dnsctl && bun test src/index.test.ts`
Expected: 测试通过。

- [ ] **Step 5: Commit**

```bash
git add tools/dnsctl/src/index.ts tools/dnsctl/src/output.ts tools/dnsctl/src/index.test.ts
git commit -m "feat: add dns inspect command"
```

### Task 7: 全量验证与真实环境检查

**Files:**
- Verify: `tools/dnsctl/.env.local`

- [ ] **Step 1: 运行完整测试集**

Run: `cd tools/dnsctl && bun test`
Expected: 全部测试通过。

- [ ] **Step 2: 运行类型检查**

Run: `cd tools/dnsctl && bun run typecheck`
Expected: 无类型错误。

- [ ] **Step 3: 用本地真实配置验证单个 zone**

Run: `cd tools/dnsctl && bun run inspect -- --zone ihongben.com`
Expected: 成功输出 `ihongben.com` 当前 YAML 状态。

- [ ] **Step 4: 用本地真实配置验证全量查询**

Run: `cd tools/dnsctl && bun run inspect`
Expected: 成功输出两个 zone 的统一 YAML 状态。

- [ ] **Step 5: Commit**

```bash
git add tools/dnsctl
git commit -m "feat: complete dns inspect tool"
```
