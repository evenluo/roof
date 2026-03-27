# dnsctl 第二阶段设计：声明式 `plan` 能力

## 1. 结论

在保持现有 `inspect` 行为不变的前提下，为 `dnsctl` 增加只读的 `plan` 子命令：

- 读取仓库内单文件 YAML 声明
- 查询远端当前 DNS 状态
- 输出按 zone 分组的 `create / update / delete` 变更计划
- 默认面向人工审阅，支持 `--json` 供脚本消费

兼容性决策：保持兼容。现有 `inspect` 命令、输出格式和 provider 查询逻辑不变，仅新增 `plan` 能力与声明文件加载逻辑。

## 2. 命令模型

新增命令：

```bash
bun run src/index.ts plan
bun run src/index.ts plan --zone <name>
bun run src/index.ts plan --file <path>
bun run src/index.ts plan --json
```

命令约定：

- `plan` 默认读取 `dns/dns.yaml`
- `--file` 可覆盖默认路径
- `--zone` 仅对单个 zone 做 plan
- 默认输出人类可读 diff
- `--json` 输出结构化计划结果
- 参数错误、声明错误、provider 错误、diff 前置校验错误一律 fail-fast

## 3. 声明文件结构

首版声明文件采用单文件 YAML，顶层沿用 `zones` 映射：

```yaml
zones:
  ihongben.com:
    provider: tencent
    records:
      - name: "@"
        type: A
        value: "2.2.2.2"
        ttl: 600

  maxtap.net:
    provider: cloudflare
    records:
      - name: "@"
        type: A
        value: "1.1.1.1"
        ttl: auto
        proxied: true
```

规则：

- `provider` 必填，zone ownership 以声明文件为准
- `records` 结构沿用当前标准模型：`name` / `type` / `value` / `ttl` / `proxied?`
- `proxied` 只允许用于 Cloudflare zone
- `ttl` 支持数值和 `auto`
- 首版仅支持当前模型能稳定表达的记录
- 首版不支持同名同类型多值记录，遇到直接报错

## 4. Diff 规则

记录身份规则：

- 用 `name + type` 作为同一条记录的匹配键
- 若声明侧或远端侧存在重复 `name + type`，直接报错
- 不使用 provider 原始 ID
- 不把多值记录做隐式合并

变更分类：

- `create`：声明有，远端没有
- `delete`：远端有，声明没有
- `update`：同键记录存在，但 `value` / `ttl` / `proxied` 不同
- `unchanged`：默认不输出

更新展示：

- 默认输出字段级摘要
- 示例：`ttl: 600 -> auto`、`proxied: false -> true`

## 5. 实现拆分

建议新增 3 类模块：

- 声明文件加载与校验
- diff 计算
- `plan` 输出格式化

现有模块复用策略：

- 继续复用 `inspect` 的 provider 查询能力
- 继续复用标准化输出模型
- `plan` 只是在“远端标准化结果”和“声明文件标准化结果”之间做 diff

## 6. 输出行为

默认文本输出：

- 按 zone 分组
- 每个 zone 显示 provider
- 分段展示 `create / update / delete`
- `update` 显示字段级变更
- 无变更时明确输出 `No changes`

JSON 输出：

- 顶层包含声明文件路径、生成时间、各 zone 计划结果
- 每个 zone 下包含 `provider`、`creates`、`updates`、`deletes`
- `updates` 保留可供后续 `apply` 直接复用的信息

## 7. 测试计划

需要新增并通过：

- CLI 参数测试：`plan`、`--file`、`--zone`、`--json`
- 声明文件测试：合法结构、非法结构、未知 provider、非法 `proxied`
- Diff 测试：create / delete / update / no-op
- 重复键测试：声明侧重复、远端侧重复
- 多值记录测试：命中不支持边界时报错
- 集成测试：全量 zone、单 zone、provider 报错上下文、默认文本输出、JSON 输出

验收标准：

- `bun test` 通过
- `bun run typecheck` 通过
- `inspect` 无回归
- 使用真实 `.env.local` 和示例 `dns/dns.yaml` 能得到非空计划或明确 no-op 结果

## 8. 默认假设

- 默认声明文件路径为 `dns/dns.yaml`
- zone/provider 真源迁移到声明文件
- 首版 `plan` 只做只读比对
- 不支持同名同类型多值记录
- 默认输出优先服务人工审阅，`--json` 是补充接口
