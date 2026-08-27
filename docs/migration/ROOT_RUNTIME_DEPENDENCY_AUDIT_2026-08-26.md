# GSYEN 根仓库生产依赖安全审计（2026-08-26）

审计时间：2026-08-26T16:09:57+08:00；修复复验截至 2026-08-26T17:14+08:00  
审计对象：`/Users/Ethan/Desktop/Projects/gsyen` 根仓库  
执行方式：先只读建立基线，随后在本地实施最小兼容更新并复验；未运行 `npm audit fix --force`，未提交、部署、读取或输出 Secret。

## 结论

- 修复前基线为 **11 项：4 high、7 moderate、0 critical**；修复后 `npm audit --omit=dev --json` 为 **5 项：0 high、5 moderate、0 critical**，生产高危门已清零。
- 原 **P1 `pdfjs-dist@6.0.227`** 已精确升级到 `6.2.108`。Web 文档抽取和 Electron PDF 预览改为共享的 fail-closed 参数：关闭 XFA、单图最多 25,000,000 像素、解析错误立即失败。独立复审进一步证明 436-byte PDF 可用极端 `MediaBox` 请求 200,000 × 200,000 canvas；现已在 canvas 分配前限制单边 16,384、总计 16,000,000 像素，预览每次最多自动挂载 20 页，文本提取在逐页循环内消耗 240,000 字符预算。当前版本的 `DocumentInitParameters` 不暴露 `enableScripting` 加载参数，因此没有伪造一个运行时不消费的字段；安全主修复是公告要求的 `6.2.108`。
- 原 **P2 `mermaid@11.15.0`** 已精确升级到 `11.16.1`，并显式设置 `securityLevel: 'strict'`；`dompurify` 锁为 `3.4.13`。
- `js-yaml`、三条维护线的 `brace-expansion`、PostCSS 的 `nanoid`、`fast-uri` 和 jsdom 的 `undici` 已锁到修复版；Electron 升至 `42.10.1`，Sharp 升至 `0.35.3`。
- Fortune Sheet / ExcelJS 链上的 `uuid@8.3.2` 没有上游兼容修复版本，仍表现为 5 个聚合 moderate 项。当前代码不调用受影响的 v3/v5/v6 外部 buffer API；ExcelJS 可见源码只调用 `v4()`，暂列 **P3 书面例外**，不使用跨主版本 override。
- 完整开发/构建树仍有 **1 high、6 moderate**：Excalidraw 固定依赖 `nanoid@3.3.3`，npm 给出的“修复”是倒退到 Excalidraw `0.17.6`，不接受该破坏性建议。现有应用没有向用户暴露 nanoid 的自定义 size/generator API，暂列 **P2 条件风险**，等待上游发布；必须以浏览器/Electron Excalidraw E2E 继续约束。
- `npm ls --all` 仍会因 Excalidraw 内嵌旧 Radix 组件只声明 React 16–18、而根应用使用 React 19，以及 Sharp 的两个跨平台 optional 包被 npm 标为 extraneous 而退出 1。根 Excalidraw 包本身声明支持 React 19，lint/test/build 均通过，但在真实浏览器 E2E 前该 peer 警告仍是 **P2 兼容风险**，不得虚报依赖树完全干净。
- `pdfjs-dist@6.2.108` 要求 Node `>=22.13`。根 `package.json` 与 lock 根节点现已声明同一下限，Docker build/runtime 从 Node 20 改为 Node 22；镜像 tag 仍未按 digest 锁定，需在阿里云构建链确定后固定并复验。

## 修复实施与本地复验证据

| 项目 | 修复后证据 |
|---|---|
| PDF.js | `pdfjs-dist@6.2.108`；共享加载策略；canvas 单边/总像素门；20 页分批挂载；提取预算前移；策略测试通过 |
| Mermaid / DOMPurify | `mermaid@11.16.1`、strict；`dompurify@3.4.13` |
| YAML / URI / fetch | `js-yaml@4.3.1`、`fast-uri@3.1.6`、jsdom `undici@7.29.0` |
| glob / ID | `brace-expansion@1.1.18 / 2.1.4 / 5.0.9`；PostCSS `nanoid@3.3.18`；mermaid-to-excalidraw `nanoid@5.1.16` |
| Electron / image | `electron@42.10.1`、`sharp@0.35.3`；Sharp 内存 PNG 冒烟通过（92 bytes） |
| Vercel 类型 | 删除仅用于编译类型的 `@vercel/node`，以本地最小结构类型替代；认证代理重复入口收敛为单一实现 |
| 生产 audit | 0 critical / 0 high / 5 moderate；均为 Fortune/Excel/uuid 无上游修复链 |
| 完整 audit | 0 critical / 1 high / 6 moderate；新增项为 Excalidraw 固定 nanoid 条件风险 |
| 静态与单测 | `npm run lint` PASS；33 files / 163 tests PASS；Electron security 38/38 PASS |
| 构建 | `npm run build` PASS；主 JS 2,641.33 kB、gzip 774.08 kB，保留性能 warning |

本轮没有运行 `npm audit fix --force`，没有把 `uuid@8` 强推到 11，也没有用 Excalidraw 降级换取表面上的零告警。

## 审计基线时的工作树保护证据

审计开始和报告写入前均检查了依赖清单：

| 文件 | 状态 | 证据与处理 |
|---|---|---|
| `package.json` | 已修改、未暂存 | `git diff --numstat` 为 `6 insertions / 5 deletions`；差异位于 Electron 配置生成、release 流程及 test script，不是本次审计产生。必须保留并在未来依赖更新时逐行合并。 |
| `package-lock.json` | 干净、未暂存 | 工作树及 index 均无差异。本次审计未触碰。 |
| `docs/migration/README.md` | 未跟踪的迁移文档 | 本次只追加本报告索引，不改变其既有结论。 |

基线建立后已用唯一目录创建本地恢复检查点并实施上述变更。该检查点后来在脚本复审中发现输出目录竞态，只保留为辅助证据、不能作为唯一恢复依据；修复脚本的新检查点必须等独立安全复审放行后以新 ID 创建。整个过程中没有覆盖、清理或提交既有用户修改。

## 审计基线与依赖路径

以下版本来自当前 `package-lock.json` / `npm ls --omit=dev --all`；最小修复版本来自 2026-08-26 的 npm registry 元数据和 GitHub Reviewed advisories。

| 漏洞包 | 当前版本与依赖路径 | npm 严重度 | 最小修复版本 | 生产可达性 | 本仓库分级 |
|---|---|---:|---:|---|---:|
| `pdfjs-dist` | `gsyen -> pdfjs-dist@6.0.227`（直接） | high | `6.2.108` | Web 上传解析、Electron PDF 预览均直接可达 | **P1** |
| `mermaid` | `gsyen -> mermaid@11.15.0`（直接） | moderate（包含 1 low + 4 moderate 公告） | `11.16.1` | Web/Electron Markdown 预览可达 | **P2** |
| `dompurify` | `gsyen -> mermaid -> dompurify@3.4.12` | moderate | `3.4.13` | Mermaid 会调用 sanitize，但当前未使用漏洞所需的 `IN_PLACE` 配置 | P3，随 Mermaid 同批修复 |
| `js-yaml` | `gsyen -> electron-updater@6.8.9 -> js-yaml@4.1.1` | high | `4.3.1` | Electron 主进程解析受信更新源的 YAML；普通业务输入不可达 | P2 |
| `brace-expansion` v1 | `fortune-excel -> exceljs -> archiver / unzipper -> minimatch@3 -> brace-expansion@1.1.16` | high | `1.1.18` | 安装在生产树；当前 UI 导出走 ExcelJS browser build，未发现不可信 glob/stream-writer 调用 | P3 |
| `brace-expansion` v2 | `fortune-excel -> exceljs -> archiver -> readdir-glob -> minimatch@5 -> brace-expansion@2.1.3` | high | `2.1.4` | 同上 | P3 |
| `nanoid` | `gsyen -> sanitize-html -> postcss@8.5.24 -> nanoid@3.3.16` | high | `3.3.18` | Office 解析链可加载；PostCSS 当前源码固定调用 `nanoid(6)`，不满足 size=0 前提 | P3 |
| `uuid` | `fortune-sheet/core -> uuid@8.3.2`；`fortune-excel -> exceljs -> uuid@8.3.2` | moderate | `11.1.1`（但父依赖不兼容） | Excel UI/导出可达；漏洞 API 前提未发现可达 | P3、无上游 fix |

`npm audit` 中另外列出的 `@corbe30/fortune-excel`、`@fortune-sheet/core`、`@fortune-sheet/react`、`exceljs` 是 `uuid` 的影响聚合，不是四个新的独立漏洞。当前各自的 npm `latest` 仍为 `2.3.3`、`1.0.4`、`1.0.4`、`4.4.0`，仍声明 `uuid@^8.3.x`，所以 `fixAvailable: false`。

### 现有 semver 是否容纳补丁

- `pdfjs-dist` 根声明为 `^6.0.227`，可容纳 `6.2.108`；为了防止旧锁文件重建，仍应把直接下限提高到 `^6.2.108`。
- `mermaid` 根声明为 `^11.15.0`，可容纳 `11.16.1`；直接下限应提高到 `^11.16.1`。
- `electron-updater@6.8.9` 声明 `js-yaml@^4.1.0`，可容纳 `4.3.1`。
- `mermaid@11.16.1` 声明 `dompurify@^3.3.3`，可容纳 `3.4.13`。
- `postcss@8.5.24` 声明 `nanoid@^3.3.16`，可容纳 `3.3.18`。
- 两条 minimatch 链分别允许 `brace-expansion@1.1.18` 与 `2.1.4` 的同维护线更新。
- `uuid@11.1.1` 不满足 Fortune Sheet / ExcelJS 的 `^8.3.x`，不可作为无风险锁文件更新。

## PDF.js 专项审计

### 可达路径

1. `src/components/PdfViewer.tsx:64-73`：Electron renderer 通过受限 preload 读取用户授权路径中的 PDF，随后调用 `pdfjsLib.getDocument({ data: arr })`。
2. `src/utils/chatDocuments.ts:30-35,72-88`：Web/Electron 聊天附件接受最多 20 MiB 的 PDF，调用同一 `getDocument`，最多抽取 120 页、240,000 字符。
3. 两处调用都没有传 `enableScripting: false`。
4. `index.html` 没有 CSP meta；仓库根 Web/Electron 配置未找到 `Content-Security-Policy`。外部生产 CDN 是否另加响应头不在本次本地证据范围内，但 Electron `file://` 生产页没有仓库内 CSP 保护。

GitHub Reviewed advisory [GHSA-hq66-cqwq-w95j](https://github.com/advisories/GHSA-hq66-cqwq-w95j) 明确记录：受影响范围为 `>=5.6.83 <6.2.108`，默认 `enableScripting=true` 且没有禁止脚本的 CSP 时，打开恶意 PDF 会在宿主域上下文执行攻击者 JavaScript；修复版为 `6.2.108`，临时缓解是关闭 scripting 或设置 CSP。

### 当前安全边界及其局限

- 正面边界：Electron 设置了 `nodeIntegration: false`、`contextIsolation: true`；本地文件读取限制为用户经 picker 授权的文件/目录，binary 默认上限 32 MiB；Web 上传上限 20 MiB。
- 局限：这些大小限制只约束资源消耗，不能阻止脚本执行。成功的 renderer JavaScript 仍能以用户身份访问同源页面数据/请求，并调用 `window.electronAPI` 暴露的能力，包括授权路径内的读写/删除/重命名、更新器操作、local bridge 配置和 v2ray 配置。文件能力不是全盘任意访问，但机密性和完整性影响仍高。
- 结论：需要用户打开/上传恶意文件，因此不是无交互的 P0；但生产路径真实可达且影响跨越 Web 会话和 Electron preload 边界，定为 **P1**。
- 资源 DoS 复审：文件字节上限和 `maxImageSize` 不能约束 PDF `MediaBox`。现已在 canvas 分配前校验有限正整数、单边和总像素，并把默认页面挂载改为每批 20 页；聊天抽取也不再先拼接最多 120 页后才裁剪。单页 `getTextContent()` 仍可能耗费 CPU，完整超时/worker 隔离和真正 viewport virtualization 仍列为 P2 纵深改进。

### 必须修复

1. 将 `pdfjs-dist` 提升到至少 `6.2.108`（已完成）。
2. 两处 `getDocument` 使用同一个有类型约束的 fail-closed 参数工厂（已完成）。PDF.js `6.2.108` 的加载参数类型没有 `enableScripting`；不得添加一个不会被加载器消费的伪缓解字段。
3. 在 canvas 分配前限制页面尺寸，并避免一次自动挂载全部页面（已完成最小门；完整虚拟化仍待 E2E）。
4. 为生产 Web 和 Electron 页面建立经过回归的 CSP（未完成）。具体 `worker-src` / `script-src` / wasm 取值必须依据 Vite 与 PDF worker 构建产物验证，不能直接复制未经测试的策略。

## Mermaid 与 DOMPurify 专项审计

### 可达路径

`CanvasWriterPane.tsx` 将 Markdown fenced code 中语言为 `mermaid` 的内容交给 `MermaidBlock`；`src/components/MermaidBlock.tsx:17-40` 使用应用常量调用 `mermaid.initialize`，再把 `mermaid.render` 的 SVG 通过 `dangerouslySetInnerHTML` 插入专用 `<div>`。因此图源码属于用户可控/导入文档可控输入，Web 和 Electron 都可达。

当前 Mermaid 默认 strict 路径会调用 DOMPurify；已安装源码调用 `DOMPurify.sanitize(...)`，没有给出 `IN_PLACE: true`。据此分诊：

- [配置 API 原型污染](https://github.com/advisories/GHSA-c4c3-pg64-4m4v)：`initialize` 接收的是应用写死的 theme 配置，不是图源码透传的对象；公告也说明 Mermaid 图内 init/YAML frontmatter 已另行防护。当前主要前提不满足。
- [CSS sibling injection](https://github.com/advisories/GHSA-6x64-9x62-f2gx)：组件把返回 SVG 作为专用空容器的唯一 child，符合公告给出的结构缓解；没有同容器 sibling 可被选择。但这不是替代升级的长期保证。
- [Architecture diagram 原型污染](https://github.com/advisories/GHSA-3rrr-jr9j-h3q3)：图源码本身即可触发，当前可达；写入值受限为 `horizontal` / `vertical`，可造成逻辑污染/DoS，不是直接 RCE。
- [XY Chart infinite loop](https://github.com/advisories/GHSA-2v8p-3f2j-5mp7) 与 [Radar diagram DoS](https://github.com/advisories/GHSA-rhh3-jpg6-66xh)：图源码可触发；渲染在 UI 主 realm，没有仓库级超时或 worker 隔离，可能冻结页面/renderer。
- [DOMPurify IN_PLACE hook 漏洞](https://github.com/advisories/GHSA-55q2-fjhq-7xh7)：公告要求 `IN_PLACE` sanitization 加移除元素的 hook。当前 Mermaid 路径虽注册 attribute hooks，但普通 sanitize 没有 `IN_PLACE: true`，未发现该精确利用前提。

综合定为 **P2**：没有证据支持 P0/P1 RCE，但可由不可信图源码造成页面/renderer DoS 和受限原型污染。修复要求为 `mermaid>=11.16.1` 且锁定 `dompurify>=3.4.13`；同时建议显式设置 `securityLevel: 'strict'`，并评估把解析/渲染隔离到可超时终止的 worker 或 sandbox iframe。

## `sanitize-html` / Office 边界

`sanitize-html@2.17.6` 本身没有出现在当前漏洞表中。它只在 `electron/sanitize-office-html.cjs` 中使用，处理 Office worker 生成的 DOCX/XLSX HTML：

- 标签、属性、scheme 均为 allow-list；禁止 protocol-relative URL；图片只保留指定 data-image MIME；链接固定增加 `noopener noreferrer`。
- Office 文件必须在用户授权路径内，并经过 input、archive expansion、sheet/cell、worker 数和 output 大小限制；解析发生在 worker thread。
- 清洗结果才进入 OfficeViewer 的 `dangerouslySetInnerHTML`。

这是一条合理的纵深边界，但它**不参与** PDF.js 或 Mermaid 的输入处理，不能被视为那两条路径的缓解。其 PostCSS 依赖固定调用 `nanoid(6)`，而当前 nanoid 公告需要 custom generator size=0，因此当前调用不满足利用前提；仍应把锁文件更新至 `nanoid@3.3.18`。

## 其他高危项的实际可达性

### `js-yaml`

`electron-updater` 在 Electron 主进程中解析远程 `latest.yml` / 平台更新 metadata，父依赖范围允许 `4.3.1`。普通用户内容不能到达此解析器；攻击需要控制或污染受信更新 feed，当前更直接的预期影响是 CPU DoS。因此定 P2，但因为它位于自动更新供应链，不应延期到 GCP 迁移之后。

### `brace-expansion`

两份 vulnerable 包来自 ExcelJS 的 Node stream/archiver/unzipper 依赖。应用的 `ExcelEditor` 通过 `@corbe30/fortune-excel` 在 renderer 做导入导出；ExcelJS 包声明了 browser build，现有生产 bundle 未发现 `brace-expansion` / `archiver` 标识，仓库也没有调用 ExcelJS stream writer 或接受 glob pattern。当前定 P3 不可达，但同维护线补丁没有理由保留，应随锁文件更新。

### `uuid`

[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) 只影响 UUID API 的 v3/v5/v6 在调用者提供越界 buffer/offset 时的完整性检查；v4 不受影响。根代码没有直接 import `uuid`，ExcelJS 可见源码调用 `v4()`，没有外部 buffer。Fortune Sheet 的已发布最新版仍依赖 `^8.3.2`，无法从 npm 获得兼容修复。当前接受 P3 例外，并跟踪上游替代/修复；不能用 `uuid@11.1.1` 强制 override 后直接上线。

## 已实施的最小非破坏更新集合

本轮逐行保留了 `package.json` 的既有用户修改，并实施：

1. 两个直接依赖精确锁为 `pdfjs-dist: 6.2.108`、`mermaid: 11.16.1`，防止迁移窗口内漂移。
2. 重新解析锁文件后明确核对：`dompurify=3.4.13`、`js-yaml=4.3.1`、PostCSS `nanoid=3.3.18`，以及 `brace-expansion` v1/v2/v5 分别为 `1.1.18 / 2.1.4 / 5.0.9`。
3. 不对 `uuid` 做跨主版本 override；保留 P3 例外，或在单独变更中替换/fork Fortune Sheet / ExcelJS 后做完整表格兼容测试。
4. 同批加入共享 PDF fail-closed 参数和 Mermaid strict 配置；CSP 仍需独立验证。
5. `pdfjs-dist@6.2.108` 的 npm engine 为 Node `>=22.13.0 || >=24`。本机为 Node `22.22.3`，当前满足；根 engine 和 Docker 已提升到 Node 22。GitHub Actions 只写 `node-version: '22'`，应保证 runner 实际解析到 `>=22.13`，并在阿里云构建链固定受支持的 22.x 镜像 digest 以保证可重复构建。

不要把 `npm audit fix --force` 作为实施手段；它会扩大变更面，也不能解决 Fortune/Excel 的无上游 fix 链。

## API/兼容风险

| 变更 | 风险 | 重点 |
|---|---|---|
| PDF.js `6.0.227 -> 6.2.108` | 同主版本但 worker/parser 有行为变化；Node engine 下限提高 | Vite worker URL、Web/Electron canvas、文本提取、加密/损坏 PDF、macOS/Windows 包 |
| Mermaid `11.15.0 -> 11.16.1` | parser、SVG/CSS 和 beta diagram 修复可能改变输出或拒绝旧语法 | flow/sequence/state/architecture/XY/radar、暗色主题、错误呈现、Excalidraw 间接兼容 |
| DOMPurify `3.4.12 -> 3.4.13` | 极低，sanitization 结果可能更严格 | SVG 标签/属性、链接、tooltip |
| js-yaml `4.1.1 -> 4.3.1` | 低，拒绝或限制病态 YAML 可能改变错误 | `latest.yml` 检查、下载、平台 manifest |
| nanoid / brace maintenance patch | 低 | Office sanitizer、Excel 导入导出和大文件错误路径 |
| 强制 uuid 8 -> 11（不建议） | 高，超出父依赖范围，CJS/ESM 与 API 兼容未知 | 不进入最小集合 |

## 必须回归的测试

1. 基线：`npm ci`、`npm run lint`、`npm test`、`npm run test:electron-security`、`npm run build`；在隔离 runner 上完成 Windows/macOS Electron package。
2. 安全门：`npm audit --omit=dev --audit-level=high` 必须退出 0；完整 audit 仍会留下 Fortune/Excel/uuid 的 5 个 moderate 聚合项，必须与本报告的 P3 例外一致，不能虚报为零漏洞。
3. PDF：普通、多页、中文、加密、损坏、接近 20/32 MiB 上限文件；Web 文本抽取与 Electron canvas；恶意 PDF PoC 必须证明没有执行脚本、不能调用同源请求或 `electronAPI`；PDF worker 在生产 CSP 下能加载。
4. Mermaid：常用图型、暗/亮主题、错误语法；官方 architecture/XY/radar PoC 不得污染 `Object.prototype` 或冻结 renderer；CSS 不得影响容器外元素；SVG/链接 sanitization 保持。
5. Office/Excel：现有 sanitizer security tests、archive bomb/cell/output 限制；DOCX/XLSX 预览；公式、合并单元格、样式、中文、条件格式、导入后导出再打开；确认 uuid 例外没有 ID 完整性回归。
6. updater：真实但非生产发布 feed 的 `latest.yml` / `latest-mac.yml` 检查、下载、校验、错误恢复；病态 YAML 必须被有界拒绝而不是阻塞主进程。
7. 业务：Web 登录/会话、聊天附件、Electron 本地 Library 授权路径、重启后能力恢复；观察控制台/Sentry 中没有新增 parser、worker、CSP 错误。

## 复核命令（均为只读）

```text
git status --short -- package.json package-lock.json docs/migration/README.md
git diff -- package.json package-lock.json
git diff --cached -- package.json package-lock.json
npm ls --omit=dev --all brace-expansion js-yaml nanoid pdfjs-dist dompurify mermaid sanitize-html uuid fortune excel
npm audit --omit=dev --json
npm view <package>@<version> version dependencies peerDependencies engines dist-tags --json
rg -n <dependency-or-API> src electron package.json package-lock.json
```

本报告同时保留修复前基线和本地修复后证据；它不是生产发布、浏览器 E2E 或迁移完成声明。
