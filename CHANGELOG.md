# Changelog

## 0.2.2

- 修复 Cursor 3.27 起 Composer 完全不可用：Cursor 服务端会灰度下发 `agent_host_local_loop`（本地循环运行时），此后 `BidiAppend` 里装的是新的 `RunInferenceRunRequest` 报文，与桥接的 `AgentRunRequest` 不兼容，表现为 `protobuf decode error` → HTTP 502 → Composer 提示 "The server failed 4 times"。现在在 Statsig bootstrap 中显式关闭该开关，回退到桥接支持的经典 agent 循环。
- 兼容 `ConversationStateStructure.plan` 的 wire type 变化：该字段改为未知字段跳过，不再中断整包解析。
- 本机监听端口持久化到 `network_ports`：桥接重启不再换端口，Cursor 不需要跟着重启。
- Magpie 网关短暂不可用时不再立即断开（保留 60 秒宽限，状态里给出 `warning`），连续超时才回退到 Cursor 官方服务。
- 模型目录未变化时不再每 15 秒重写 `effective.json`。
- 原生桥接的诊断输出写入 `~/.config/magpie-cursor-bridge/engine.log`（0600，超过 4 MiB 轮转），便于排查协议变更。
- 监视器 lock 增加命令行校验，避免进程号复用导致启动被误判为"已有实例"。
- 服务 plist 增加 `LimitLoadToSessionType=Aqua`。
- 协议解码失败时把原始报文写到 `$TMPDIR/bidi-dump-<seqno>.hex`，供后续协议对齐。

## 0.2.1

- Hide Cursor Auto in the bridge model picker using Cursor's display configuration, including clearing cached Auto controls. Magpie models and route groups remain selectable.

## 0.2.0

- Standard Magpie Agent package with an explicit file allowlist and bundled JavaScript dependency.
- Independent, per-machine certificate initialization; no original Cursor BYOK installation needed.
- Explicit macOS certificate trust step with SSL trust verification; existing certificates preserved.
- Setup reuses Magpie's Bun and keeps a local runtime copy, removing the dependency on user-installed Node.
- Plugin/native version pairing and native SHA-256 verification.
- Complete version directories and rollback of launch configuration after failed service registration.
- Status reports the actual running version. Updating the plugin requires rerunning setup to activate the matching service.
- Apple Silicon macOS only; no installation lifecycle scripts and no credentials in the package.

## 0.1.1

- Return only Magpie's model catalogue, without appending Cursor subscription models.

## 0.1.0

- Cursor protocol bridge through Magpie, background lifecycle, and recoverable proxy settings.
