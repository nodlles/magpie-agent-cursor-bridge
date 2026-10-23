# Cursor · Magpie Bridge

让普通版 Cursor 使用 Magpie 中配置的模型和路由组。模型菜单仅返回 Magpie 模型目录，并隐藏 Cursor Auto 入口，保留 Cursor 原有登录。当前版本 **0.2.2，仅支持 Apple Silicon macOS**，适配 Magpie 0.1.1327 与 Cursor 3.27.6（会关闭 Cursor 3.27 服务端下发的本地循环开关，详见 CHANGELOG）。

升级后重启 Cursor 以刷新模型菜单。已有聊天若仍显示 Auto，请手动改选一次 Magpie 模型；此版本隐藏菜单入口，不改写已有聊天保存的模型选择。

## 安装

需要先安装 Magpie 和 Cursor 到 `/Applications`，并在 Magpie 配置可用模型。无需安装 Cursor BYOK、Node 或 Rust。

### 从 Magpie 插件页安装

在 Magpie → Plugins 添加以下固定版本地址：

```text
github:nodlles/magpie-agent-cursor-bridge#v0.2.2
```

[项目主页](https://github.com/nodlles/magpie-agent-cursor-bridge) · [v0.2.2 发布页与安装包](https://github.com/nodlles/magpie-agent-cursor-bridge/releases/tag/v0.2.2)

此版本通过 GitHub 发布；无需从其他机器复制配置，也无需 npm 账号。

安装后，在终端运行一次：

```sh
bash "$HOME/.config/magpie/plugins/node_modules/magpie-agent-cursor-bridge/setup.command"
```

如果设置了 `XDG_CONFIG_HOME`，请相应替换 `.config` 路径。初始化会复用 Magpie 下载的 Bun，无需另装 Node；便携安装可用 `MAGPIE_BUN` 指定 Magpie 的 Bun 路径。

### 从 ZIP 安装

[下载 Apple Silicon macOS 安装包](https://github.com/nodlles/magpie-agent-cursor-bridge/releases/download/v0.2.2/magpie-agent-cursor-bridge-0.2.2-macos-arm64.zip)，解压后在终端输入 `bash `，把包内 `setup.command` 拖进终端，回车。它会自动把插件注册到 Magpie。首次使用 Magpie、尚无 Bun 时，先在 Magpie → Plugins 添加解压后的插件文件夹，再运行初始化。

初始化会在本机生成独立证书，并请求 macOS 信任（可能需要确认或密码）。证书名称沿用上游的 `Cursor BYOK Local CA`。证书和私钥仅存在本机，安装包不会携带。已有桥接证书会被保留；取消授权后可重新运行初始化。

完成后，在 Magpie → Agents 选择 **Cursor · Magpie Bridge** 和模型，首次连接后重启 Cursor。请勿同时开启原 Cursor BYOK 接管。

## 使用和更新

- 在 Cursor 模型菜单切换 Magpie 模型；Magpie 中选中的模型优先排列。
- 模型目录每 15 秒同步一次，新增模型后 Cursor 菜单可能需要刷新。
- 断开：Magpie 中选择 Disconnect，或运行 `magpie cursor-bridge default`。
- 状态：`bash setup.command status`，输出后台实际运行版本和连接状态。
- 更新：在 Magpie 更新插件后，**再运行一次上述初始化命令**，使后台切换到配套版本。只更新 Agent 文件不会替换正在运行的后台。ZIP 用户下载新版并运行其初始化。
- 停用并卸载后台：`bash setup.command uninstall`。从插件页安装的版本还需在 Magpie 中移除该插件。

卸载会还原 Cursor 代理，保留证书、数据和恢复记录。它不会删除可能与旧 Cursor BYOK 共用的受信任证书。安装和卸载不会强制退出 Cursor；代理变化后若 Cursor 保留旧连接，请自行重启。

## 后台和隐私

```text
Magpie Agent 插件 → 专用连接配置 → 后台监视器
                                     ├─ 启停原生桥接
                                     └─ 备份/还原 Cursor 代理
Cursor → 本机 TLS 代理 → Cursor 协议与工具循环 → Magpie 网关 → 配置的模型
```

Agent 插件不能自行启动后台，且 Magpie 安装插件时禁用安装脚本，所以初始化是一个明确的独立步骤。后台随用户登录启动，断开时仅保留监视器；Magpie 网关不可用时恢复 Cursor 代理并停止原生桥接。桥接监听本机回环地址，只对 Cursor 域名进行协议转换；使用 Agent 网关密钥，不复制模型提供商密钥。

```text
~/.local/share/magpie-cursor-bridge/
  agent.js、package.json       # ZIP 安装的稳定插件入口
  releases/版本-编号/         # 完整后台和本机复制的运行环境
~/.config/magpie-cursor-bridge/
  connection.json            # Magpie 写入的私有连接配置
  installation.json          # 当前安装版本与位置
  settings-journal.json      # Cursor 代理恢复记录（连接时存在）
  data/ca/                   # 本机证书与私钥
  data/bridge.db             # 独立数据库，会存储会话和调用记录
```

后台使用完整版本目录，先准备新版本，再停止旧版并切换；启动注册失败时恢复旧后台。Bun 只在本机复制，避免 Magpie 清理缓存后后台无法启动，下载包不额外捆绑运行环境。旧版本目录保留，安装程序不自动清理用户数据。

代理恢复保留无关用户修改；手动改动代理时暂停接管；设置文件损坏时保留恢复记录。监视器异常退出后，原生桥接会随之退出，macOS 重启监视器并恢复设置。

当前只验证了单个 macOS 用户、标准 `/Applications` 安装。普通 Cursor 仍需已有可用登录；Tab 补全沿用原路径。不同模型的工具和图片能力取决于提供方；Cursor 协议升级可能需要配套更新。此构建未做 Apple Developer ID 签名或公证，其他机器可能需要在 macOS“隐私与安全性”中允许运行。

## 开发

JavaScript 依赖固定为 `jsonc-parser@3.3.1`，通过 npm `bundleDependencies` 随发布包分发。无 `postinstall` 等自动执行脚本。

```sh
npm ci --ignore-scripts
npm test
bash scripts/build-native.sh
npm pack --ignore-scripts
```

原生构建需要 Git、Rust/Cargo 和 Python 3。脚本克隆固定上游提交、应用 `source.patch`，默认最多两个编译任务，并写入程序摘要。安装时验证摘要及程序报告的版本。

`npm test` 使用临时目录验证独立 CA、版本配对、初始化授权流程、升级回退和设置恢复，不修改钥匙串或真实 Cursor 设置。证书信任提示通过模拟系统命令验证，仍需在目标机器完成首次 macOS 授权。

已有正常连接时，可显式运行 `bun test/manual-lifecycle.mjs`（或 Node），用临时设置验证原生启停、模型切换、网关故障和崩溃恢复；它会读取已有连接和证书，不生成模型请求。

原生核心来自 [leookun/cursor-byok v1.0.1](https://github.com/leookun/cursor-byok/tree/v1.0.1)，MIT，固定提交 `2068ab20513288e6a0289d33febe872a30608610`。第三方说明见 `THIRD_PARTY_NOTICES.md`。
