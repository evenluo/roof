# dnsctl 第一阶段设计：本地查询当前 DNS 指向状态

## 1. 结论

第一阶段不做网站、不做自动同步，先在仓库中落一个独立的 Bun 小工具 `tools/dnsctl`，用于本地只读查询当前 DNS 指向状态，并统一输出为 YAML。

已确定约束：

- 仓库顶层采用 `apps/ + tools/` 结构
- 第一个工具项目位于 `tools/dnsctl/`
- 本地密钥来源为 `tools/dnsctl/.env.local`
- 当前根域名 ownership 固定：
  - `ihongben.com` 由腾讯云 DNSPod 管理
  - `maxtap.net` 由 Cloudflare 管理
- 第一阶段只做查询，不做写入
- 默认输出 YAML，JSON 作为可选输出格式

## 2. 目标与非目标

### 2.1 目标

- 查询当前两个根域名的 DNS 状态
- 将 Cloudflare 和 DNSPod 的记录标准化为统一结构
- 输出结果可直接作为后续声明式配置的草稿来源
- 为后续 `plan/apply` 能力建立稳定的 provider 抽象和输出模型

### 2.2 非目标

- 不提供网站或后台
- 不做 DNS 写入、同步、删除、回滚
- 不支持 provider 自动探测
- 不支持同一根域名跨 provider 切换
- 不引入 fallback、兼容分支或迁移逻辑

## 3. 方案选择

### 3.1 选型结论

采用独立子项目方案：

- 顶层目录：`apps/ + tools/`
- DNS 工具目录：`tools/dnsctl/`
- 运行时：`bun`
- 第一阶段只提供一个查询入口

### 3.2 不采用的网站方案

当前核心需求是“查询和后续自动管理 DNS 指向”，不是展示内容。网站或后台会明显增加认证、界面、交互和部署复杂度，不适合作为第一阶段起点。

## 4. 目录结构

建议的第一阶段目录结构如下：

```text
/
  README.md
  apps/
  tools/
    dnsctl/
      package.json
      .gitignore
      .env.example
      src/
        index.ts
        providers/
          cloudflare.ts
          tencent.ts
        normalize/
          records.ts
```

说明：

- `tools/dnsctl` 是独立 Bun 项目
- `.env.local` 仅存在于 `tools/dnsctl/` 且不提交
- 第一阶段只需要 provider 查询和标准化逻辑

## 5. 命令模型

### 5.1 主命令

第一阶段命令模型收敛为单一入口：

```bash
bun run src/index.ts inspect
```

后续可通过 `package.json` script 包装为：

```bash
bun run inspect
```

### 5.2 行为

执行 `inspect` 时：

1. 读取 `tools/dnsctl/.env.local`
2. 读取内置的 zone ownership
3. 查询每个 zone 当前 DNS 记录
4. 标准化结果
5. 默认以 YAML 输出到 stdout

### 5.3 可选参数

第一阶段仅保留一个可选参数：

- `--json`：输出 JSON

默认行为保持为 YAML 输出。

## 6. 数据来源与密钥管理

### 6.1 数据来源

第一阶段查询的数据来源固定为对应 provider 的远端 API：

- `ihongben.com` -> 腾讯云 DNSPod API
- `maxtap.net` -> Cloudflare API

### 6.2 密钥来源

本地运行时不读取 GitHub Actions Secrets，而是从本地 `.env.local` 读取：

```env
CLOUDFLARE_API_TOKEN=
Q_DNS_RECORD_SECRET_ID=
Q_DNS_RECORD_SECRET_KEY=
```

密钥约束：

- `.env.local` 仅用于本地
- `.env.example` 只保留变量名，不放真实值
- 后续接 GitHub Actions 时复用相同变量名

## 7. 输出结构

### 7.1 顶层结构

第一阶段输出采用映射形式，便于按根域名直接读取：

```yaml
generatedAt: "2026-03-27T14:30:00+08:00"
zones:
  ihongben.com:
    provider: tencent
    records:
      - name: "@"
        type: A
        value: 1.2.3.4
        ttl: 600

  maxtap.net:
    provider: cloudflare
    records:
      - name: "@"
        type: A
        value: 5.6.7.8
        ttl: 1
        proxied: true
```

### 7.2 标准字段

优先标准化这些字段：

- `name`
- `type`
- `value`
- `ttl`

Cloudflare 额外保留：

- `proxied`

### 7.3 记录命名规则

- 根记录统一使用 `@`
- 子记录使用相对主机名，如 `www`、`blog`
- `type` 使用标准 DNS 记录类型名
- `value` 尽量以可维护的目标值输出

### 7.4 排序规则

为保证输出稳定，记录排序固定为：

1. 按 `name`
2. 按 `type`
3. 按 `value`

## 8. provider 查询边界

### 8.1 当前确定支持

当前接入 provider：

- 腾讯云 DNSPod
- Cloudflare

当前固定 zone：

- `ihongben.com`
- `maxtap.net`

### 8.2 记录类型策略

第一阶段重点支持的常用类型：

- `A`
- `AAAA`
- `CNAME`
- `TXT`

对于其他记录类型：

- 保留
- 尽量原样输出
- 不因为存在非重点类型而中断整次查询

### 8.3 provider 特有字段处理

- Cloudflare：保留 `proxied`
- 腾讯云：第一阶段只处理默认线路，不表达复杂线路差异
- 不保留 provider 原始响应中的无关元数据，如记录 ID、创建时间、更新时间等

## 9. 错误处理

第一阶段采用 fail-fast 策略，但错误信息必须带上下文。

失败场景：

- `.env.local` 缺少必要密钥
- provider 鉴权失败
- zone 查询失败
- provider 返回无法识别的关键结构

错误信息至少包含：

- provider
- zone
- 操作阶段
- 原始错误摘要

示例：

```text
Failed to inspect zone "ihongben.com" from provider "tencent": authentication failed
```

明确不做：

- 不跳过失败 zone 后继续返回残缺结果
- 不自动切换到其他 provider
- 不做 fallback

## 10. 兼容性决策

当前兼容性判断：保持兼容，但不额外引入兼容逻辑。

具体决策：

- 保持根域名固定 ownership，不支持跨 provider 切换
- 不支持自动发现 zone 归属
- 不支持 provider 迁移
- 不引入 fallback
- 对非重点记录类型保留并输出，避免丢失现状信息

## 11. 可验证结果

第一阶段完成后，预期可以验证：

1. 在 `tools/dnsctl/` 下配置 `.env.local` 后，可本地执行查询命令
2. 能成功查询 `ihongben.com` 当前 DNS 状态
3. 能成功查询 `maxtap.net` 当前 DNS 状态
4. 默认输出统一 YAML，而不是两套 provider 原始结构
5. 非 `A / AAAA / CNAME / TXT` 记录不会被丢弃
6. 缺少密钥或 provider 查询失败时，命令明确失败并输出上下文信息

## 12. 后续计划入口

本设计只覆盖第一阶段查询能力。待用户确认后，再进入实现计划，继续拆分：

- `dnsctl` 初始化
- `.env.local` 约定
- provider 查询封装
- 标准化与 YAML 输出
- 本地验证方式
