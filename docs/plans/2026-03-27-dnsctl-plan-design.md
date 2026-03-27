# dnsctl 第二阶段设计：声明式 `plan` 能力

## 1. 结论

在保持现有 `inspect` 行为不变的前提下，为 `dnsctl` 增加只读的 `plan` 子命令：

- 读取仓库内单文件 YAML 声明
- 查询远端当前 DNS 状态
- 输出按 zone 分组的 `create / update / delete` 变更计划
- 默认面向人工审阅，支持 `--json` 供脚本消费

兼容性决策：保持兼容。现有 `inspect` 命令、输出格式和 provider 查询逻辑不变，仅新增 `plan` 能力与声明文件加载逻辑。`inspect` 继续使用硬编码的 zone 配置（`config.ts`），`plan` 从声明文件读取 zone 列表，两者独立运行，不共享 zone 来源。

## 2. 命令模型

新增命令：

```bash
bun run src/index.ts plan
bun run src/index.ts plan --zone <name>
bun run src/index.ts plan --file <path>
bun run src/index.ts plan --json
```

命令约定：

- `plan` 默认读取 `dns/dns.yaml`（相对于 cwd）
- `--file` 可覆盖默认路径
- `--zone` 仅对单个 zone 做 plan；指定的 zone 必须存在于声明文件中，否则报错
- 默认输出人类可读 diff
- `--json` 输出结构化计划结果
- 参数错误、声明错误、provider 错误一律 fail-fast
- 远端记录的 diff 前置校验错误（如重复 name+type）为 zone 级错误，跳过该 zone 并继续处理其他 zone
- credentials 复用现有 `.env.local` 加载逻辑，与 `inspect` 共享同一套环境变量

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
- `name` 使用相对主机名，根记录用 `@` 表示（与 `normalizeCloudflareRecord` / `normalizeTencentRecord` 输出一致）
- `proxied` 只允许用于 Cloudflare zone；Cloudflare zone 中省略 `proxied` 时视为 `false`
- `ttl` 支持数值和 `auto`；`auto` 仅允许用于 Cloudflare zone，Tencent zone 使用 `auto` 视为校验错误
- 首版支持的记录类型：A / AAAA / CNAME / TXT / MX。声明文件中出现其他类型视为校验错误
- 首版不支持同名同类型多值记录，声明侧遇到直接报错
- 校验错误信息应包含 zone 名称和记录定位信息（name + type），方便用户定位问题

## 4. Diff 规则

类型过滤：

- diff 只处理支持的记录类型（A / AAAA / CNAME / TXT / MX）
- 远端存在不支持类型的记录（如 NS / SRV / CAA / SOA 等）时，直接忽略，不纳入 diff 计算

记录身份规则：

- 用 `name + type` 作为同一条记录的匹配键（仅在支持类型范围内）
- 声明侧存在重复 `name + type`，直接报错
- 远端侧存在重复 `name + type`（如多条 MX/TXT 记录），对该 zone 报错并跳过，附带具体冲突记录列表，提示用户该 zone 包含多值记录暂不支持
- 不使用 provider 原始 ID
- 不把多值记录做隐式合并

变更分类：

- `create`：声明有，远端没有
- `delete`：远端有，声明没有（仅限支持类型）
- `update`：同键记录存在，但 `value` / `ttl` / `proxied` 不同
- `unchanged`：默认不输出

delete 风险说明：首版 `plan` 只读不执行，delete 计划仅用于人工审阅。未来 `apply` 阶段需要额外的 delete 确认机制（不在本阶段设计范围内）。

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
- `plan` 只是在"远端标准化结果"和"声明文件标准化结果"之间做 diff

## 6. 输出行为

默认文本输出：

- 按 zone 分组
- 每个 zone 显示 provider
- 分段展示 `create / update / delete`
- `update` 显示字段级变更
- 每个 zone 末尾输出变更数量摘要（如 `2 to create, 1 to update, 0 to delete`）
- 无变更时明确输出 `No changes`

文本输出示例：

```
Zone: maxtap.net (cloudflare)

  Create:
    + blog    A    1.2.3.4    ttl=600

  Update:
    ~ @    A    1.1.1.1
      value: 1.0.0.1 -> 1.1.1.1
      proxied: false -> true

  Delete:
    - old-api    CNAME    legacy.example.com    ttl=300

  Summary: 1 to create, 1 to update, 1 to delete
```

JSON 输出：

- 顶层包含声明文件路径、生成时间、各 zone 计划结果
- 每个 zone 下包含 `provider`、`creates`、`updates`、`deletes`
- `updates` 保留可供后续 `apply` 直接复用的信息

JSON 输出示例：

```json
{
  "file": "dns/dns.yaml",
  "generatedAt": "2026-03-27T15:00:00+08:00",
  "zones": {
    "maxtap.net": {
      "provider": "cloudflare",
      "creates": [
        { "name": "blog", "type": "A", "value": "1.2.3.4", "ttl": 600 }
      ],
      "updates": [
        {
          "name": "@",
          "type": "A",
          "changes": {
            "value": { "from": "1.0.0.1", "to": "1.1.1.1" },
            "proxied": { "from": false, "to": true }
          }
        }
      ],
      "deletes": [
        { "name": "old-api", "type": "CNAME", "value": "legacy.example.com", "ttl": 300 }
      ]
    }
  }
}
```

## 7. 测试计划

需要新增并通过：

- CLI 参数测试：`plan`、`--file`、`--zone`、`--json`
- `--zone` 指定声明文件中不存在的 zone 时报错
- 声明文件测试：合法结构、非法结构、未知 provider、非法 `proxied`、Tencent zone 使用 `ttl: auto` 报错
- Diff 测试：create / delete / update / no-op
- 重复键测试：声明侧重复报错、远端侧重复报错并跳过该 zone
- 多值记录测试：远端存在多值记录时报错并输出冲突详情
- `proxied` 缺省测试：Cloudflare zone 省略 `proxied` 时视为 `false`
- 集成测试：全量 zone、单 zone、provider 报错上下文、默认文本输出、JSON 输出

验收标准：

- `bun test` 通过
- `bun run typecheck` 通过
- `inspect` 无回归
- 使用真实 `.env.local` 和示例 `dns/dns.yaml` 能得到非空计划或明确 no-op 结果

## 8. 默认假设

- 默认声明文件路径为 `dns/dns.yaml`（相对于 cwd）
- `plan` 从声明文件读取 zone 列表和 provider 映射；`inspect` 保持硬编码配置不变，两者独立
- 首版 `plan` 只做只读比对，不执行任何变更
- 不支持同名同类型多值记录；声明侧报错，远端侧报错并跳过
- 默认输出优先服务人工审阅，`--json` 是补充接口
- credentials 共享 `inspect` 的 `.env.local` 加载路径
