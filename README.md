# 开拍台 · CutSheet Studio

面向自媒体创作者与短视频导演的 **Agent 驱动拍摄脚本与多维创意工作台**。  
输入一个主题即可完成「主题 → 最佳时长映射 → 一次性多维创意发散 → 完整可实拍分镜与顺场方案 → 导演审片质检与精修」，**免登录游客模式开箱即用**，底层原生预留 **OpenAI (`gpt-6.2-sol` · High)** 与 **Google (`gemini-4-neon` · High)** 双模型接口。

## 核心能力

1. **主题 → 时长智能映射 Agent (`duration_mapper`)**
   - 结合确定性测算工具 `estimate_duration_and_pacing` 与高思考强度推理，从信息密度、叙事结构与平台完播规律自动映射最佳片长（15s / 30s / 45s / 60s / 90s / 120s / 180s），计算安全口播字数预算（3.5–4.0 字/秒 + 物理同期声留白），并提供 2 个可一键切换的备选时长策略。
2. **一次性多维创意发散 Agent (`idea_generator`)**
   - 围绕同一主题强制跨原型一次性产出 4–8 个差异化拍摄 Idea（反常识揭秘、器物微距拆解、沉浸式第一视角、对照组强反转、个体故事冲突、极速三连清单等），支持无限追加不同切口并在同一主题下展开多个脚本对比。
3. **导演级实拍脚本与执行方案 Agent (`script_architect`)**
   - 包含：**核心创意点与叙事逻辑链**、**视觉观感与 Hex 影调色卡**、**逐镜分镜脚本表（支持行内微调并自动重算时间轴）**、**低成本器材道具与布光方案**、**按机位/灯光合并的现场顺场实拍步骤（Shooting Order）**、**提词降 NG 技巧**及**后期剪辑 5 步走**。
4. **导演审片质检与定向精修 Agent (`shootability_reviewer` & `script_refiner`)**
   - 调用 `audit_script_timing_and_wordcount` 自动核验分镜总时长误差、口播语速与非露脸特写占比；支持一键精修（如「压缩成 30 秒高密版」「改成单人手机低成本拍」「换另一模型重写对比」）。
5. **双模型网关（均默认 High 思考强度）**
   - **OpenAI 通道**：默认模型 `gpt-6.2-sol`，默认 `reasoning.effort = "high"`（支持 `low` / `medium` / `high` / `xhigh` / `max`），默认走 **Responses API (`/v1/responses`)**，也支持兼容代理的 Chat Completions 协议。
   - **Google 通道**：默认模型 `gemini-4-neon`，默认 `thinkingLevel = "high"`（支持 `low` / `medium` / `high` / `xhigh`），默认走 **`generateContent` REST**，也支持 **Interactions API (`/v1beta/interactions`)**。
   - **双模型混编路由**：支持 `Gemini 4 Neon` 负责创意发散 + `GPT-6.2 Sol` 负责分镜编排与审片，并可在单脚本内一键切换另一模型重写对比。
   - **演示沙盒兜底**：未填 API Key 时自动启用本地主题感知沙盒引擎，游客打开即能体验全链路工作流。
6. **免登录游客模式 + 本地 SQLite 隔离持久化**
   - 首次访问自动生成 `HttpOnly` 匿名游客工作区 Cookie，历史策划、多版脚本自动留存，并支持通过工作区口令跨设备接续。

## 快速启动

需要 **Node.js 20+**（推荐 Node 24 LTS，内置 `node:sqlite`，零三方运行时依赖）：

```bash
cp .env.example .env
# 可选：在 .env 中填入 OPENAI_API_KEY 和/或 GEMINI_API_KEY
# 也可以留空，直接在网页右上角「模型网关」中临时填入，或直接用演示沙盒体验

npm start
```

服务默认监听 `http://0.0.0.0:3780`。

## 环境变量说明

| 变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `PORT` | `3780` | Web 服务端口 |
| `DATA_DIR` | `./data` | SQLite 游客工作区数据目录 |
| `OPENAI_API_KEY` | 空 | 服务端托管 OpenAI API Key（可由前端浏览器 Key 覆盖） |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI 接口基地址 |
| `OPENAI_MODEL` | `gpt-6.2-sol` | OpenAI 默认模型 ID |
| `OPENAI_REASONING_EFFORT` | `high` | 思考强度：`low` / `medium` / `high` / `xhigh` / `max` |
| `OPENAI_PROTOCOL` | `responses` | `responses`（推荐）或 `chat_completions` |
| `GEMINI_API_KEY` | 空 | 服务端托管 Google Gemini API Key（Neon 需 Paid Tier 项目） |
| `GEMINI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta` | Google Gemini API 基地址 |
| `GEMINI_MODEL` | `gemini-4-neon` | Google 默认模型 ID |
| `GEMINI_THINKING_LEVEL` | `high` | 思考强度：`low` / `medium` / `high` / `xhigh` |
| `GEMINI_PROTOCOL` | `generate_content` | `generate_content`（推荐）或 `interactions` |

## 部署到 `withkeya.com/cutsheet/`（与 `yingshi-studio` 一致的线上部署方案）

仓库已内置完整的生产部署配置（[route.conf](route.conf)、[cutsheet-studio.service](cutsheet-studio.service)、[deploy/install.sh](deploy/install.sh) 与 [deploy/auto-deploy.sh](deploy/auto-deploy.sh)），前后端均原生兼容子路径反代与 HTTPS Cookie：

1. 在 `withkeya.com` 服务器上拉取并执行一键安装脚本（要求 Node.js >= 20，推荐 24 LTS）：
   ```bash
   git clone https://github.com/Stans97/cutsheet-studio.git /tmp/cutsheet-install
   sudo bash /tmp/cutsheet-install/deploy/install.sh
   ```
   安装脚本会自动创建 `cutsheet-studio` 系统用户、`/var/lib/cutsheet-studio` 持久化 SQLite 目录、`/etc/cutsheet-studio/env` 密钥配置模板、`systemd` 常驻服务及每 60 秒自动跟踪 GitHub `main` 分支的原子热更定时器（更新前自动运行 `npm test`，健康检查失败自动回滚）。

2. 在 `withkeya.com` 现有的 Nginx HTTPS `server { ... }` 块中引入路由配置（与 `/h3-studio/` 并列）：
   ```nginx
   include /etc/cutsheet-studio/route.conf;
   ```
   然后重载 Nginx：
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

3. （可选）如需在服务器端托管全局 API Key（让游客打开即直连真模型），编辑 `/etc/cutsheet-studio/env` 填入 `OPENAI_API_KEY` 和/或 `GEMINI_API_KEY` 后执行 `sudo systemctl restart cutsheet-studio.service`。

## 运行自动化测试

```bash
npm test
```

测试覆盖：OpenAI/Google 请求体参数合规校验、响应解析器、双模型混编路由、时长映射与分镜审片工具、游客会话隔离、子路径 `/cutsheet/` 反代与 HTTPS Cookie、SSE 端到端流式编排与 Markdown 通告单导出。
