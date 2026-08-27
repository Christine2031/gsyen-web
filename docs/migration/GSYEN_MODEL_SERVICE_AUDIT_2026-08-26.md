# GSYEN Model 服务代码与阿里云可运行性审计

审计日期：2026-08-26（Asia/Shanghai）  
工作区：`/Users/Ethan/Desktop/Projects/gsyen`  
模型仓库：`/Users/Ethan/Desktop/Projects/gsyen/gsyen-model`  
性质：证据审计与本地候选加固；未安装依赖、未读取 Secret、未访问或修改生产

## 1. 结论

`gsyen-model` 本身没有 GCP SDK、项目 ID、Cloud Run、GCS、Cloud SQL、Artifact Registry 或 Secret Manager 运行依赖，因而不需要做 provider 替换。但是，当前代码是一个以固定模拟 CSV 为数据源的 v0.0.1 演示服务，**尚不具备可声明为生产迁移完成的服务契约**：

1. 当前 `transactions.csv` 截止 2026-06-02，且仓库明确称其为营销模拟数据。服务在每次启动时使用这份 CSV 现场训练，再把数据最后一天的次日称作“明天”；在 2026-08-26 部署会给出已经过期近三个月的结果。
2. 审计时 Web 只在构建时显式设置 `VITE_PREDICT_API` 后直连 `/ask`，且阿里云没有认证代理。该代码缺口已在本地修复为“Web/Electron → 带 Bearer 的 GSYEN API `/api/model/ask` → loopback `127.0.0.1:18083`”，并通过单元、类型、构建和 Caddy 模板测试；旧 ECS model runtime 已只读闭环，但真实 Supabase token、候选 release、GSYEN API 与 Caddy E2E 未执行，所以生产链路仍未验收。
3. 不能简单把 `18083` 暴露到公网：FastAPI 全部接口无鉴权、无速率限制，CORS 为 `*`，并可读取单个或批量客户流失结果。当前模板继续保持 loopback，公网只允许经过 GSYEN API 的单一 `/ask` 契约；若未来绕过该边界，真实客户数据接入后仍会成为条件性 P0 数据访问问题。
4. 2026-08-27 已从真实 ECS Python `3.12.3` 运行环境闭环 56 项完整 freeze、`pip check` 和
   `LC_ALL=C` 排序哈希，并据此固定九项直接依赖与 `requirements.lock`；但尚无带 hash 的
   wheelhouse/SBOM 或从全新目录重建证据，因此依赖 P1 仅部分解除。
5. 模型、AUC、补货结果和流失分数每次进程启动都重算；本地已补 immutable 数据版本/
   manifest/hash 与独立 stage/promote/rollback 事务，但还没有真实新鲜 dataset、模型
   artifact、首次 legacy onboarding、训练时间/峰值内存基线或 Linux/断电回滚记录。实际 ECS
   服务仍以 root、无独立 cgroup 上限运行，且与无关商城/Smart Wing 进程共机；75 秒启动
   门限和故障隔离尚未验收。

因此当前状态是：**源码基线和静态契约已审计；可作为影子环境候选，禁止作为已验收的生产模型服务对外切换。**

### 2026-08-27 ECS 续跑证据

- Workbench 只读会话确认 Ubuntu/Python 为 `24.04` / `3.12.3`，Node 为 `22.23.2`；
  `gsyen-model.service` 在 `127.0.0.1:18083` 运行，根端点返回
  `{"status":"alive","churn_auc":0.845}`，中文 `/ask` 模拟数据冒烟成功。
- ECS 的 7 个 Python 文件与本地 commit 对应文件逐项 SHA-256 相同；
  `transactions.csv` 也与本地基线同为
  `61e148ff48706c3803e8d1459f901a34ec8fda2c23c0fdfd0fd32d275f8ee264`。
- 真实 venv 共 56 项依赖，`pip check` 为 `No broken requirements found`；
  `pip freeze | LC_ALL=C sort` 的 SHA-256 为
  `2eb726b9252ba840f305cf4fe405a809ffd889d12f592ab1c907eec8b8ac3c20`，与新增
  `requirements.lock` 完全一致。
- 当前 ECS 目录不是 Git/release 工作树，服务以 root 运行，`CPUQuota`/`MemoryMax` 为
  infinity；仓库目标 unit 尚未安装。运行成功只关闭“能否在该 Linux ABI 启动”的未知项，
  不关闭数据新鲜度、最小权限、可重建、容量和回滚 P1。

### 2026-08-27 本地候选加固增量

- production 配置现在强制提供 64 位小写 `GSYEN_MODEL_DATA_SHA256` 和 1 KiB–1 GiB 的
  `GSYEN_MODEL_DATA_MAX_BYTES`；systemd 启动前检查与 Python 运行时使用同一合同。
- production 路径在配置加载时解析并约束在 `/srv/gsyen/data/gsyen-model`；文件通过一个
  `O_NOFOLLOW` 文件描述符读取一次，读取前后核对 inode/size/mtime/ctime/uid/gid/mode，训练
  和报告使用同一份内存字节，哈希不符即拒绝启动。
- 生产文件必须是 `root:gsyen`、`0640` 普通文件；模型数据目录模板改为
  `root:gsyen 0750`，其 `/srv/gsyen/data` 父级改为 `root:gsyen-space 0710`，防止共用
  `gsyen` UID 的其他应用 rename/替换整棵模型目录。
- CSV 字符串 ID/品类/天气改为显式 string dtype 并拒绝空白，保留前导零；日期转换后拒绝
  `NaT`，数量/单价/金额拒绝 `NaN`/`inf`/非正值；日期字符串必须是 ISO 8601，并统一为
  `Asia/Shanghai` 业务时间。训练结束后不再把原始 CSV bytes、DataFrame 与 classifier 常驻内存。
- 当前 19/19 stdlib 合同测试、11 个 Python 文件语法编译、阿里云模板验证均通过；新鲜度
  固定使用 `Asia/Shanghai`，production OpenAPI 关闭，unit 固定单 worker/native 线程并设置
  重启频率上限。由于本机
  没有 pandas/FastAPI 且目标候选尚未部署，Pandas fixture、真实 Python 3.12 import/API、
  时区与缺失日业务口径、独立 cgroup 和端到端认证仍是未关闭门禁。
- `stage-model-dataset.sh`/`promote-model-dataset.sh`/`rollback-model-dataset.sh` 已把
  immutable `versions/<id>`、确定性 `MANIFEST.json`、env/current/previous/manifest hash、
  一次性批准 marker 和精确 `/readyz` data SHA 纳入事务。5/5 fixture 覆盖 stage、promote、
  rollback 及失败恢复；promotion/rollback 要求 `gsyen-model.service` 已 active，不能借数据
  批准偷偷完成旧服务 onboarding。首次 legacy 转换、跨文件断电 journal 和真实 Linux
  `systemctl`/health/power-failure 演练仍为 P1。

## 2. 已核实基线与本轮验证

### 2.1 Git 与源代码身份

| 项目 | 证据 |
|---|---|
| 分支 | `main`，跟踪 `origin/main`，ahead/behind 为 `+0/-0` |
| commit | `d83a0e7b01fa5f168b87ca13b5eb57954be18a5e` |
| tag | `v0.0.1`；annotated tag object 为 `76a1a61a50c5d819055f5c758247dd78a51426bd`，peeled commit 为 `d83a0e7...` |
| remote | `https://github.com/Christine3749/gsyen-model.git` |
| dirty 状态 | `git status --porcelain=v2` 无文件记录，工作树干净 |
| 历史 | 当前本地 refs 只有一个提交；`git fsck --no-dangling` 通过 |
| 根仓库关系 | 独立嵌套 Git 工作树；根仓库没有 `.gitmodules`，根仓库当前仅把 `gsyen-model/` 视为未跟踪目录 |

续网后以 `GIT_TERMINAL_PROMPT=0 git ls-remote --heads --tags origin` 在线复核，远端 `refs/heads/main` 与 `v0.0.1^{}` 都指向 `d83a0e7...`，所以本地源码与当时公开远端一致。正式构建仍须把该查询时间、完整输出哈希和 release manifest 一起归档，不能把一次查询当作永久最新性证明。

### 2.2 不依赖第三方包的验证

本机 Python 为 `3.14.5`。使用独立临时 pycache 目录执行以下文件的 `py_compile` 全部通过，模型 Git 状态在验证后仍干净：

- `01_generate_data.py`
- `02_predict.py`
- `03_validate_real.py`
- `04_validate_real_clean.py`
- `api.py`
- `gsyen_models.py`
- `test_api.py`

这只证明语法可被 Python 3.14 解析，不证明第三方二进制包支持 Python 3.14，也不证明目标 ECS Python ABI 兼容。

本机探测结果为 `pandas`、`numpy`、`statsforecast`、`sklearn`、`fastapi`、`uvicorn`、`requests`、`matplotlib`、`openpyxl` 全部 absent。本轮遵守约束，没有联网安装或猜测版本，也没有运行会导入这些依赖的 API/训练脚本。

部署模板的本地静态套件 `bash deploy/aliyun/tests/validate-templates.sh` 通过，包括 model unit 必须从当前 release 的 `.venv/bin/python -m uvicorn` 启动、端口分配和 foundation/release 守卫。该结果不替代 Linux `systemd-analyze verify` 或 ECS 实启。

2026-08-27 又新增不依赖 pandas/FastAPI 的 `runtime_contract.py`、`dataset_contract.py` 与
19 项 stdlib 单测，覆盖 demo/production 模式、绝对数据路径、1–3650 天新鲜度边界、未来日期、
陈旧生产数据拒绝、CORS origin 净化/去重、生产 CORS 禁用、数据目录越界、批准 SHA/大小、
末级 symlink、uid/gid/mode 拒绝、helper 的 production hash 防御、非法 CORS port 和上海业务日边界；19/19 通过。更新后的 11 个 Python 文件
`py_compile` 通过。由于 Mac 未安装模型二进制依赖且处于高 swap 状态，本轮没有在 Mac
联网安装或运行训练/API；真实依赖导入仍须在同构 Linux candidate 中复验。

### 2.3 随仓库 CSV 的静态完整性

| 项目 | 结果 |
|---|---:|
| 文件 | `gsyen-model/transactions.csv` |
| 大小 | 624,000 bytes |
| SHA-256 | `61e148ff48706c3803e8d1459f901a34ec8fda2c23c0fdfd0fd32d275f8ee264` |
| 数据行 | 10,280 |
| schema | `order_id,customer_id,datetime,product,qty_jin,unit_price,amount,weather`，精确匹配 |
| 唯一订单 ID | 10,280；重复 0 |
| 客户 | 318 |
| 商品 | 基围虾 5,218；对虾 3,082；明虾 1,980 |
| 时间范围 | 2026-02-03 06:55:00 至 2026-06-02 12:00:00 |
| 日期连续性 | 120/120 天；三个商品分别覆盖 120/120 天 |
| 空字段/非数值/非正金额行 | 0 / 0 / 0 |
| 流失训练切点 | 2026-05-03；313 个历史客户，其中返回 292、未返回 21 |

另有 3,017 行的 `amount` 不等于“CSV 中已四舍五入后的 `qty_jin × unit_price` 再保留一位小数”，最大绝对差 0.2，绝对差合计 309.6。生成器先用未展示的原始价格计算金额，再单独把单价保留一位，因此这更像生成口径不一致，而非文件损坏；但若金额进入真实 RFM/财务口径，必须明确以哪个字段为准并加入校验。

仓库 README 和生成脚本都把该 CSV 声明为模拟数据；文件中没有姓名、电话或地址，但“模拟”身份尚未用可重复生成哈希独立证明。本轮没有运行 `01_generate_data.py`，因为它会覆盖已跟踪的 `transactions.csv`。

## 3. 真实服务契约对照

| 层 | 当前事实 | 影响 |
|---|---|---|
| 模型 API | `POST /ask` 接收 `{q: string}`，返回中文键 `专家` 和 `answer`；另有 `/restock`、`/churn/risk`、`/churn/{cid}` | `/ask` 与 Web 当前解析逻辑相容；其余接口会暴露业务/客户预测数据 |
| 健康检查 | 候选新增 `/healthz`（进程活）与 `/readyz`（训练完成、data mode/as-of/forecast/data SHA/row count/AUC）；保留根 `/` 兼容响应，健康模板改查 `/readyz` | liveness/readiness 已在代码契约上拆分；尚缺 candidate Linux 实启、commit/model version 与真实监控告警 |
| Web consumer | 本地已改为复用 `VITE_GSYEN_API_URL`/same-origin API 基址，取得当前 Supabase access token 后调用 `/api/model/ask`；不再使用 `VITE_PREDICT_API` | Web 保持第一方路径；Electron 只接受干净 HTTPS API origin；无 token 或代理不可用时降级到通用模型 |
| 取消/超时 | consumer 已透传 `useChatStream` 的 `AbortSignal`；GSYEN API 默认 4 秒硬超时 | 本地测试已覆盖取消；目标 Node/ECS 的实际超时、fallback 和日志仍待 E2E |
| systemd | `.venv/bin/python -m uvicorn api:app --host 127.0.0.1 --port 18083`，工作目录为 immutable `current` | Python 入口形式正确，loopback 边界正确；与源码 README/demo/test 的 `8000` 不同 |
| Caddy | Web 站点的 `/api/auth/*` 与 `/api/model/*` 已在本地模板转给 loopback GSYEN API `18081`；模型 `18083` 仍无公网路由 | 满足同源 Cookie/API 和模型隔离方向；渲染后的真实 Caddy 尚未 validate/reload/E2E |
| 配置模板 | `gsyen-api.env.example` 集中定义 loopback origin、超时/并发/限流；model env 现要求 production、绝对 data path、7 天上限、CORS 空值和四类 native thread=1 | 路径/模式/线程及 dataset transaction 已模板化；真实新鲜 dataset、模型 artifact/version 与缓存目录仍缺 |
| 发布 | model 使用统一 immutable release/current 与 `RELEASE.json`；README 要求 Linux 上用 `venv --copies` | exact dependency lock 已有；尚无两次离线重建的 candidate/wheelhouse/SBOM、该 commit staged tree hash 或 ECS transaction 证据 |

### 推荐的最小目标链路

不要创建一个供浏览器直接访问且无鉴权的模型域名。最小且低耦合的生产链路应为：

```text
已认证 Web / Electron
        ↓ same-origin
GSYEN API（会话、授权、限流、输入上限、超时）
        ↓ loopback 127.0.0.1:18083
gsyen-model（只提供内部 API）
```

这样 Caddy 仍只暴露现有 GSYEN API，模型继续 loopback；Web 不再需要公开 `VITE_PREDICT_API`，也避免将内部模型端口、CORS 和未来客户预测数据暴露给任意站点。应先冻结 `/ask` 的请求/响应契约，再做一个很小的 GSYEN API adapter，不需要新增微服务。

## 4. 代码与模型质量审计

### 4.1 值得保留的设计

- 服务边界小：模型计算集中在 `gsyen_models.py`，HTTP 调度集中在 `api.py`，没有 GCP SDK或云厂商耦合。
- 单进程状态在 startup 一次生成，请求阶段只读，当前小型 CSV 下避免每次请求重复训练。
- `n_jobs=1` 和 sklearn `random_state=0` 有利于限制基础并行和重现分类器结果。
- 补货与流失的中文响应契约简单，当前 Web 可以低成本做 fallback。
- 当前模拟 CSV 的主键、schema、日期连续性和基础数值质量良好。
- 阿里云 unit 已采用独立 `gsyen` 身份、loopback、immutable `current`、systemd hardening、GSYEN slice 和启动后监听断言。

### 4.2 数据和模型问题

- `load_tx()` 使用相对路径 `transactions.csv`，没有配置、schema、主键、空值、取值范围、时区、数据新鲜度或 SHA 校验。
- `PRODUCTS` 固定为三个品类；缺品、改名、历史不足或不规则日期会造成 `fc.loc[p]` 异常，服务无法启动。
- 流失训练在小类只有 21 个样本的当前数据上随机切分，只报告 AUC，没有 precision/recall、阈值、校准、分群偏差或时间外验证。
- 样本太少、只有单一类别或分层切分不足时，`train_test_split(..., stratify=y)`/`roc_auc_score` 会直接失败。
- 模型没有 artifact 和 manifest；版本只由源码隐含，输出无法关联到数据 hash、训练参数、训练时间和包版本。
- 服务启动才训练，没有后台刷新、双版本切换、失败保留上一版或数据漂移检测。
- 当前“明天”没有返回 `as_of`/`forecast_for`，会把历史次日包装成当前次日。

### 4.3 API、安全与错误处理

- 旧 ECS 版本的 CORS 为 `*`、methods/headers 全开；候选已改为默认不启用 CORS，且
  production 模式拒绝任何浏览器 origin。全部业务 endpoint 仍无自身认证，因此必须继续
  loopback，仅允许 GSYEN API 暴露受认证的 `/ask` adapter。
- 候选已给 `q` 增加非空/500 字符上限、`top` 增加 1–100、`cid` 增加 1–128；仍没有
  ASGI 层请求体字节上限，且 `restock/churn` 内部端点未做独立授权。
- 查无客户返回 HTTP 200 的 `{error: ...}`，而不是稳定的 404/error schema。
- 默认 FastAPI docs/OpenAPI 若对外暴露也会公开所有内部接口。
- 没有限流、请求 ID、结构化日志、统一异常映射或安全审计事件。
- `warnings.filterwarnings("ignore")` 全局吞掉依赖、数值和数据质量告警。
- Web consumer 用 `(import.meta as any)` 和未经验证的 JSON cast；不验证 URL、response schema 或 content type，所有错误静默降级，生产故障难以观测。

### 4.4 启动、资源与 ECS 兼容

- lifespan 内同步执行 CSV 读取、GradientBoosting 训练、AutoETS 训练/预测和全量客户打分；在 listener 出现前阻塞启动。
- unit 的 `TimeoutStartSec=75`、监听等待 60 秒和每 3 秒重启没有真实数据/目标 Python 的耗时证据。失败依赖或坏数据可能造成重启风暴。
- `gsyen.slice` 限制整个 GSYEN 为 `CPUQuota=450%`、`MemoryHigh=7G`、`MemoryMax=8G`，但模型 unit 没有独立 CPU/内存上限，训练峰值可挤压同 slice 的 Web/API/邮件服务。
- 未设置 `OMP_NUM_THREADS`、`OPENBLAS_NUM_THREADS`、`MKL_NUM_THREADS` 等 native 数学库线程边界；`n_jobs=1` 不能自动证明所有底层库只有一个线程。
- immutable release 在 `ProtectSystem=strict` 下只读是正确方向，但 Python bytecode、Numba/JIT 或第三方缓存是否需要可写目录未验证；env 也没有显式缓存目录。
- `venv --copies` 避免 Python launcher 指回临时构建目录，是正确要求；仍必须在与 ECS 相同 OS/架构/Python minor 上生成并验证，不能从 macOS 复制 `.venv`。

### 4.5 依赖和发布可重复性

2026-08-27 之前，`requirements.txt` 的九行都是未约束包名。现已按目标 ECS 的真实
Python 3.12.3 venv 固定为：

```text
pandas==2.3.3, numpy==2.5.2, statsforecast==2.1.1,
scikit-learn==1.9.0, fastapi==0.141.1, uvicorn[standard]==0.52.4,
requests==2.34.2, matplotlib==3.11.1, openpyxl==3.1.5
```

新增的 `requirements.lock` 精确固定 56 项完整环境，排序后 SHA-256 与 ECS freeze 同为
`2eb726b9252ba840f305cf4fe405a809ffd889d12f592ab1c907eec8b8ac3c20`，且现有 venv 的
`pip check` 通过。这关闭了“目标 ABI 和实际版本完全未知”，但锁文件尚无 wheel hash、
SBOM、离线 wheelhouse、双重重建或独立安全扫描，不能视为供应链闭环。API 运行实际只
需要其中一部分；`requests` 只用于手工 smoke，`matplotlib/openpyxl` 只用于离线报告脚本。
把开发/验证依赖装入生产 venv 会增加安装失败面和漏洞面，仍应拆分 runtime/dev lock。

`03_validate_real.py`/`04_validate_real_clean.py` 只读取当前目录已有的 `online_retail.xlsx`；代码中没有下载 URL 或下载动作。README 所称“运行时自动下载”与实现不符。这两个脚本以及 `01_generate_data.py`、HTML demo、字体、图片和报告都不是 API 运行入口，生产 release 应通过明确 allowlist 选择是否携带，且禁止在生产运行会覆盖数据或生成报告的脚本。

## 5. P0–P3 问题清单

严重度含义：P0 为正在发生或一旦执行当前切换即可能造成重大数据/安全事故；P1 为生产上线阻断；P2 为应在正式验收前完成的重要可靠性/质量项；P3 为低风险维护项。

### P0

| ID | 状态 | 问题 | 门禁 |
|---|---|---|---|
| MODEL-P0-01 | 条件性，尚未发生 | 若为满足 Web 调用而把 `18083`/独立域名直接暴露公网，任意来源可无鉴权读取补货、批量/单客户流失结果；接入真实数据后构成越权数据访问 | **禁止新增公网模型路由**；先实现 GSYEN API 内部代理、会话授权、限流和输入上限 |

未发现当前已经对公网暴露模型或已经泄露真实客户数据的证据，因此不虚报为“已发生
P0”。ECS 只读盘点已确认 `18083` 仅绑定 loopback，当前 Caddy 没有模型路由，且
UFW/安全组没有共同放行该端口；这证明当前没有公网入口，但不替代切换后的网络 E2E。

### P1

| ID | 问题 | 证据/影响 | 最小处置 |
|---|---|---|---|
| MODEL-P1-01 | 尚无可批准的生产数据 | CSV 截止 2026-06-02；候选现将 demo 回答明确标记并返回 `as_of`/`forecast_for`，production 超过配置天数会拒绝启动，但真实新鲜 dataset/current 尚不存在 | 接入经确认的数据快照/接口，绑定 data/model version；完成数量、主键、时间和 SHA 核对后才能关闭 P1 |
| MODEL-P1-02 | 生产调用链尚未 E2E | 本地已实现认证 API adapter、同源 Caddy 路由、Web/Electron client 和 9 项新增边界测试；目标 ECS、真实 token/model/data 尚未验证 | 保持 `18083` loopback；影子环境执行登录→代理→模型→fallback、限速、超时和重启测试后才能关闭此 P1 |
| MODEL-P1-03 | 依赖可重建链仅部分闭环 | 已闭环 Python 3.12.3、56 项 exact lock、freeze hash 与 `pip check`；仍无 wheel hash/wheelhouse/SBOM、全新目录双重重建或依赖安全扫描 | 在目标同构 Linux 生成带 hash 的 wheelhouse/SBOM，两次离线重建并核对 release tree；不得把一次现存 venv 当永久构建来源 |
| MODEL-P1-04 | ECS runtime/source/data 只闭环到裸目录 | 源码/CSV SHA、Python/OS/arch、loopback listener 和业务冒烟已闭环；本地 data transaction 5/5 通过，但生产无 `.git`/`RELEASE.json`、不可变 current、独立用户/cgroup、启动峰值、首次 onboarding 或回滚记录 | 用已验证 lock 构建 immutable candidate，绑定 commit/data hash；在影子 Linux 执行 onboarding、容量、重启、断电和单服务回滚 |

### P2

| ID | 问题 | 影响/处置 |
|---|---|---|
| MODEL-P2-01 | 启动即训练，无耗时/内存/CPU基线或可回滚 artifact | 在 shadow ECS 测冷/热启动与真实数据量，记录 `/usr/bin/time -v`、cgroup 指标；采用 versioned data/model manifest 和 last-known-good |
| MODEL-P2-02 | 模型服务无独立 cgroup 上限 | 容量测试后为 unit 设置独立 `CPUQuota`/`MemoryHigh`/`MemoryMax`；故障注入须证明不会拖垮同 slice 的 API/Web/mail |
| MODEL-P2-03 | 数据契约仅部分收敛 | 候选已校验必需列、非空、唯一 order ID、正数金额/数量、三品类、至少 35 天、流失双类别最小样本、未来/陈旧生产数据和 production 路径边界；仍缺时区、允许品类配置、金额口径、真实数据 fixture 和 Linux 集成测试 |
| MODEL-P2-04 | API 边界仅部分收敛 | q/top/cid 已有限制；仍缺 ASGI body 字节上限、缺客户 404、统一 error schema，以及中文/Unicode/非法 JSON 的 FastAPI integration tests |
| MODEL-P2-05 | consumer/代理边界已本地修复，运行态未观测 | 已透传 AbortSignal，API 固定 loopback URL、4 秒超时、JSON/schema/byte 上限并覆盖 fallback 测试；仍需影子运行日志与 E2E |
| MODEL-P2-06 | 测试不具备回归能力 | `test_api.py` 是固定 `8000` 的打印脚本，无 assertions/fixture/覆盖率；补 unit、FastAPI integration、cold-start、load、restart、rollback 测试 |
| MODEL-P2-07 | 训练/数据质量证据不足 | 真实时间外 holdout 与朴素基线比较，补 precision/recall/calibration；3,017 行金额口径差必须决策并固化校验 |
| MODEL-P2-08 | 数据版本路径已本地实现，真实备份/恢复未闭环 | 候选使用 `/srv/gsyen/data/gsyen-model/datasets/versions`、只读 current/previous 与 manifest hash；仍须用真实数据执行加密异地备份、fresh-host restore、数量/主键/SHA 与独立数据回滚演练 |
| MODEL-P2-09 | 可写缓存仍未知 | env 候选已将 OMP/OpenBLAS/MKL/NumExpr 线程固定为 1，并禁写 bytecode；仍须在 systemd sandbox 下验证 Numba/第三方缓存并指定受控路径，禁止临时放宽 `ProtectSystem` |

### P3

| ID | 问题 | 处置 |
|---|---|---|
| MODEL-P3-01 | 开发端口 8000 与阿里云 18083 不同 | 手工 smoke 已支持 `GSYEN_MODEL_BASE_URL`；README 继续明确 8000 只用于开发，systemd 固定 18083 |
| MODEL-P3-02 | README 的真实数据下载描述已修正 | 现明确脚本不会下载；操作者须校验来源、license、hash 后显式放入隔离验证目录，生产启动不得下载外部数据 |
| MODEL-P3-03 | 全局吞 warnings、print 非结构化 | 只过滤已论证的单一告警；结构化记录 commit、data hash、model version、训练时长和错误类别，不记录敏感明文 |
| MODEL-P3-04 | 生产 release 候选混有生成器、demo、字体、图片、报告和手工测试 | 定义最小 runtime allowlist；离线验证工具另做开发/审计产物 |
| MODEL-P3-05 | 独立仓库只有一个提交且无 CI | 保留独立 Git 历史；新增静态/单元/构建 CI，生成可追溯 release manifest，不把它粗暴并入根仓库历史 |

## 6. 可安全实施的最小下一步

以下步骤不需要 DNS、生产切换、GCP 停服或数据删除，但涉及 ECS 的步骤仍必须等现有阿里云快照/文件备份审批门通过：

1. 冻结 v0.0.1 API contract，明确该服务究竟是“演示数据功能”还是“真实商户预测”。在完成真实数据源前，UI 必须标记 demo，不能展示成生产建议。
2. 在代码层增加纯标准库/轻依赖的数据预检器和测试 fixture，先让过期、缺品、重复 ID、单类别、NaN/负值、历史不足 fail closed；不改变模型算法。
3. 已从 ECS Python 3.12.3 的真实 venv 固定直接依赖和 56 项完整 lock；下一步拆分 runtime 与 dev/validation 依赖，生成带 hash 的 wheelhouse/SBOM，并在两个全新目录离线重建。只有该复验通过的版本才进入 release。
4. 已完成最小内部 adapter 和 Web consumer 的本地实现；下一步在影子环境用真实认证验证限流、超时、取消、fallback，并证明 `18083` 未被 Caddy/安全组公开。
5. 定义 `/healthz`（进程活）与 `/readyz`（数据新鲜、训练完成、artifact/hash 可用），响应只含非敏感版本元数据。health timer 检查 readiness，systemd listener 断言保留。
6. 数据候选已使用 `/srv/gsyen/data/gsyen-model/datasets/versions/<id>`，服务只读打开经
   批准的 version，数据 current/previous 与代码 current 相互独立。下一步是在快照与变更
   批准后完成一次 legacy onboarding，再用真实数据在 Linux 验证 power-loss journal、
   readiness、备份恢复和独立回滚；生成的模型 artifact 仍须建立同等级 version contract。
7. 取得阿里云变更审批后，先只读核对 ECS 的 OS/arch/Python、当前 unit、release/data hash、日志、启动时长和监听，再在影子端口执行容量/故障/回滚测试。

## 7. 上线阻断与验收命令

### 7.1 当前可重复的离线审计

```bash
git -C /Users/Ethan/Desktop/Projects/gsyen/gsyen-model \
  status --porcelain=v2 --branch
git -C /Users/Ethan/Desktop/Projects/gsyen/gsyen-model \
  rev-parse HEAD
git -C /Users/Ethan/Desktop/Projects/gsyen/gsyen-model \
  fsck --no-dangling

python3 -m py_compile \
  /Users/Ethan/Desktop/Projects/gsyen/gsyen-model/01_generate_data.py \
  /Users/Ethan/Desktop/Projects/gsyen/gsyen-model/02_predict.py \
  /Users/Ethan/Desktop/Projects/gsyen/gsyen-model/03_validate_real.py \
  /Users/Ethan/Desktop/Projects/gsyen/gsyen-model/04_validate_real_clean.py \
  /Users/Ethan/Desktop/Projects/gsyen/gsyen-model/api.py \
  /Users/Ethan/Desktop/Projects/gsyen/gsyen-model/gsyen_models.py \
  /Users/Ethan/Desktop/Projects/gsyen/gsyen-model/test_api.py

shasum -a 256 \
  /Users/Ethan/Desktop/Projects/gsyen/gsyen-model/transactions.csv
```

`py_compile` 会生成 cache；在保护工作树的审计中应设置独立 `PYTHONPYCACHEPREFIX`，并在运行前后比较 Git 状态。

### 7.2 影子 ECS 前置核对（审批后，只读）

```bash
uname -a
uname -m
cat /etc/os-release
python3 --version
systemctl cat gsyen-model
systemctl show gsyen-model \
  -p FragmentPath -p User -p Group -p Slice -p WorkingDirectory \
  -p ExecStart -p MemoryCurrent -p MemoryPeak -p CPUUsageNSec -p TasksCurrent
ss -ltnp
journalctl -u gsyen-model --since '24 hours ago' --no-pager
```

输出归档前必须检查日志是否含客户原文或 Secret；报告只摘录状态、耗时、版本和错误类别，不复制敏感载荷。

### 7.3 候选构建验收（生成 hashed lock/wheelhouse 后）

```bash
python3 -m venv --copies .venv
.venv/bin/python -m pip install \
  --require-hashes --no-index --find-links wheelhouse \
  -r requirements.hashed.lock
.venv/bin/python -m pip check
.venv/bin/python -m pip freeze --all
```

当前 `requirements.lock` 只有 exact version、没有 distribution hash，不能与
`--require-hashes` 混用；`requirements.hashed.lock` 是待生成的候选产物，不得用推测 hash
手工编写。必须在目标同构 Linux 生成 wheelhouse/hashed lock，并在两次全新目录中离线
重建，核对 freeze、wheelhouse 和 release tree hash；macOS `.venv` 不得复制到 ECS。

### 7.4 业务/API 验收（影子端口）

至少验证：

- `/healthz` 在训练期间可区分启动状态，`/readyz` 仅在数据新鲜、模型可用后 200；响应含 commit、data SHA、model version、`as_of`，不含客户数据。
- `/ask` 的补货、流失、未命中三类中文输入和 Unicode 输入；response schema 固定。
- 空 q、超长 q、非法 JSON、超大 body、`top=0`、负 top、超上限 top、非法 cid 的 4xx 与稳定 error code。
- 未认证访问 GSYEN API adapter 为 401/403；模型端口只在 loopback；外部安全组和 Caddy 均不能直达 `18083`。
- Web 登录会话下能调用，退出后不能调用；取消和超时会终止模型 fetch 并按设计 fallback。
- 每个预测返回的 `as_of`/`forecast_for` 与批准的数据版本一致，不允许把历史日期称为当前“明天”。

### 7.5 容量、重启和回滚验收

- 对预期、2× 和峰值数据量分别记录冷启动/热启动耗时、Max RSS、CPU time、线程数和磁盘写入；最慢冷启动必须低于设置的 systemd 门限并保留余量。
- 连续重启、ECS reboot 后自动恢复；坏 CSV、缺商品、单类别、只读 cache、磁盘满和 OOM 注入不得拖垮 GSYEN API、Web、mail-ingest 或 HalfSphere。
- 为 model unit 设置经测量的独立 cgroup 上限；压测时 GSYEN/HalfSphere 两个 slice 均不越界。
- data/model/current 与 code/current 分别回滚；恢复后响应的 commit/data/model hash 必须精确回到基线。
- 备份恢复到隔离目录，核对记录数、主键和 SHA，再启动隔离实例完成业务抽样；不能以“tar 可解压”代替恢复演练。

## 8. 完成判据

只有同时具备以下证据，`gsyen-model` 才能在总迁移中标记通过：

1. ECS 上正在运行的 release commit、依赖 lock、Python/OS/arch、data/model hash 与审计账本一致。
2. 真实或明确标注的 demo 数据用途已经用户确认；生产建议使用新鲜数据，并返回可核对的日期和版本。
3. Web/Electron → GSYEN API → loopback model 的认证契约通过，公网无法直接访问 `18083`。
4. unit/integration/build、安全边界、中文、输入边界、容量、重启、备份恢复和单服务回滚全部通过。
5. GCP 完全停止时模型及其调用方仍正常；发布产物和运行日志中没有 GCP 平台地址或请求。
6. 没有未解决的 P0/P1，且失败记录、资源峰值、回滚时长均已写入最终中文报告。

当前只部分满足第 1 项的源码/ABI/lock 身份，仍不满足第 2–4、6 项，因此不得把该组件或总 Goal 标记完成。
