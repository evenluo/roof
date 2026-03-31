# dnsctl

DNS 声明式管理工具，将 YAML 文件作为 DNS 记录的唯一来源，通过 plan/apply 工作流同步到云服务商。

支持 provider：Cloudflare、腾讯云 DNSPod。

---

## 环境配置

复制 `.env.example` 为 `.env.local`，填入真实密钥：

```bash
cp .env.example .env.local
```

```
CLOUDFLARE_API_TOKEN=       # Cloudflare API Token（需要 DNS Edit 权限）
Q_DNS_RECORD_SECRET_ID=     # 腾讯云 SecretId
Q_DNS_RECORD_SECRET_KEY=    # 腾讯云 SecretKey
```

`.env.local` 已在 `.gitignore` 中，不会入库。

---

## 声明文件格式

默认路径：`tools/dnsctl/dns/dns.yaml`（相对于仓库根目录）。

```yaml
zones:
  example.com:
    provider: tencent        # cloudflare | tencent
    records:
      - name: '@'            # @ 表示根域名
        type: A
        value: 1.2.3.4
        ttl: 600             # 秒，腾讯云必须为数字

  example.net:
    provider: cloudflare
    records:
      - name: www
        type: A
        value: 1.2.3.4
        ttl: auto            # auto 仅 Cloudflare 支持
        proxied: true        # proxied 仅 Cloudflare 支持，默认 false
      - name: _dnsauth
        type: TXT
        value: 'some-verification-string'
        ttl: auto
        proxied: false
```

支持的记录类型：`A`、`AAAA`、`CNAME`、`TXT`、`MX`。

约束：
- 同一 zone 内 `name + type` 不能重复（每种类型只能有一条记录）
- `ttl: auto` 仅限 Cloudflare zone
- `proxied` 仅限 Cloudflare zone

---

## 命令

所有命令从**仓库根目录**执行。

### inspect — 查询远端当前状态

```bash
# 查询所有 zone
bun tools/dnsctl/src/index.ts inspect

# 查询单个 zone
bun tools/dnsctl/src/index.ts inspect --zone example.com

# 输出 JSON
bun tools/dnsctl/src/index.ts inspect --json
```

### plan — 预览变更（不修改远端）

```bash
# 对比所有 zone
bun tools/dnsctl/src/index.ts plan

# 对比单个 zone
bun tools/dnsctl/src/index.ts plan --zone example.com

# 指定声明文件
bun tools/dnsctl/src/index.ts plan --file path/to/dns.yaml

# 输出 JSON（供脚本解析）
bun tools/dnsctl/src/index.ts plan --json
```

输出示例：

```
Zone: example.com (tencent)
  No changes

Zone: example.net (cloudflare)
  Create:
    www A 1.2.3.4
  Update:
    api A  value: 1.0.0.1 -> 1.1.1.1
  Delete:
    old CNAME old.example.net
```

### apply — 执行变更

```bash
# 应用所有 zone
bun tools/dnsctl/src/index.ts apply

# 应用单个 zone
bun tools/dnsctl/src/index.ts apply --zone example.com

# 指定声明文件
bun tools/dnsctl/src/index.ts apply --file path/to/dns.yaml
```

apply 按 plan 的结果执行 create / update / delete，远端多出的记录会被删除。

### import — 从远端生成声明文件

首次接管已有 DNS 时使用，将远端当前状态导入为 YAML。

```bash
# 导入所有 zone（文件不存在时才写入）
bun tools/dnsctl/src/index.ts import

# 覆盖已有文件
bun tools/dnsctl/src/index.ts import --force

# 只导入单个 zone
bun tools/dnsctl/src/index.ts import --zone example.com

# 指定输出路径
bun tools/dnsctl/src/index.ts import --output path/to/output.yaml
```

> `--force`：默认情况下文件已存在时会报错退出，防止意外覆盖。`--force` 表示明确知道会覆盖并继续。适用场景：远端被外部手动修改后，想重新拉取当前状态作为新基线。

> 不支持的记录类型（如 NS、SOA）会被自动过滤，不写入文件。

---

## Makefile

在 `tools/dnsctl/` 目录下可直接使用 `make`，依赖变化时自动执行 `bun install`。

```bash
cd tools/dnsctl

make plan                        # 预览所有 zone
make plan zone=maxtap.net        # 预览单个 zone
make apply                       # 应用所有 zone
make apply zone=ihongben.com     # 应用单个 zone
make inspect                     # 查询远端状态
make import                      # 生成声明文件（文件已存在时报错）
```

---

## 典型工作流

**日常改动：**

```
编辑 tools/dnsctl/dns/dns.yaml
    ↓
make plan    # 确认变更符合预期
    ↓
make apply   # 执行
```

**首次接管已有域名：**

```
make import              # 生成初始 dns.yaml
    ↓
检查并清理生成的文件
    ↓
make plan                # 确认 no changes（基线一致）
```

---

## GitHub Actions 自动化

`.github/workflows/` 中已配置两个 workflow：

| Workflow | 触发条件 | 行为 |
|----------|---------|------|
| `dns-plan.yml` | PR 中修改 `tools/dnsctl/dns/dns.yaml` | 运行 plan，结果以评论形式发到 PR |
| `dns-apply.yml` | `dns-release` 分支合并后 / 手动触发 | 运行 apply，将变更同步到远端 |

手动触发 apply（`workflow_dispatch`）时可以指定 zone，留空则全量应用。

所需 Secrets（在仓库 Settings → Secrets 中配置）：
- `CLOUDFLARE_API_TOKEN`
- `Q_DNS_RECORD_SECRET_ID`
- `Q_DNS_RECORD_SECRET_KEY`
