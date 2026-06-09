# CoverFi 专业工程团队交接说明

更新日期：2026-06-09

本文是 CoverFi 从实验性 vibe 项目移交给专业开发/技术团队前的
权威交接文件。接手团队应先读本文，再读 `README.md`、`CLAUDE.md`、
`contracts/AUDIT.md` 和 `_docs/PRD.md`。

## 1. 项目一句话

CoverFi 是 Signa 预测市场仓位的链上本金保护层。用户在 Signa
下单后，可以在 CoverFi 为该仓位购买保护；如果被保护选项最终未命中，
协议按 365 天线性释放返还 100% 本金。

当前项目定位是：BSC Testnet 上的 testnet MVP / demo，不是主网真实资金版本。

线上地址：

- https://cover-fi.vercel.app

GitHub：

- https://github.com/edwardleeweb3-jpg/CoverFi

## 2. 当前可交付状态

当前仓库已经具备：

- Next.js 前端，可生产构建。
- wagmi + viem 钱包连接和链上读写。
- Supabase 作为链上状态的索引/展示镜像。
- Hardhat 3 合约子项目。
- BSC Testnet 上的 CoverFiPolicy Segment 5 v2 合约。
- Signa Pulse beta 的测试网合约地址和接口。
- 合约测试、AI 审计记录、部署脚本、链上/DB snapshot 脚本。

交付前验证基线：

```powershell
npm.cmd run lint
npm.cmd run build
cd contracts
npm.cmd test
```

最近一次本地收口结果：

- lint: 0 errors。
- build: passed。
- contracts test: 64 passing。

## 3. 技术栈

前端：

- Next.js 16 App Router。
- React 19。
- TypeScript strict mode。
- Tailwind CSS v4 + CSS variables。
- Zustand。
- wagmi v3 + viem。
- TanStack React Query。
- Supabase browser client。

合约：

- Solidity 0.8.28。
- Hardhat 3。
- OpenZeppelin 5。
- viem + node:test。

部署/服务：

- Vercel 生产部署，`main` 分支 push 会触发生产构建。
- Supabase 存储政策镜像数据。
- BSC Testnet 作为当前链环境。

## 4. 当前链上配置

当前只支持 BSC Testnet，chainId 97。

CoverFi：

- Active CoverFiPolicy:
  `0x93F92688C5feA2C5530cddeaf796b40b4Fab72f2`
- Legacy MockUSDC:
  `0xb1DC4F171091D2b3d94a8B14be8cc663fD994e73`

Signa Pulse beta：

- Factory:
  `0xD23323a906F6d6d28224a37Cc963d55678AA7E65`
- tUSDC:
  `0xc03d7EA305485421e444070260D68ee598C1719c`
- tUSDC decimals: 18

代码位置：

- `src/lib/contracts/addresses.ts`
- `src/lib/contracts/signa/addresses.ts`
- `contracts/src/CoverFiPolicy.sol`
- `contracts/src/signa/IPulseMarket.sol`
- `contracts/src/signa/IPulseFactoryRegistry.sol`

## 5. 数据模型和事实来源

链上是资金和保单生命周期的事实来源。

Supabase 是镜像/索引层，用于列表页、详情页静态字段和更快的查询。
如果链上和 Supabase 不一致，应以链上为准，并修复镜像同步。

核心表：

- `supabase/schema.sql`
- `supabase/migrations/0001_chain_link.sql`

当前 RLS 是 demo-phase 开放策略，不适合真实生产环境。主网上线前必须替换为：

- 钱包签名登录或 SIWE-style 认证。
- 服务端验证签名并签发 session/JWT。
- RLS 按 verified owner address 限制读写。
- 写入操作必须以链上交易 receipt/event 为依据。

## 6. 前端业务流

主要页面：

- `/` 首页。
- `/insurance` 可保护订单列表。
- `/insurance/review/[orderId]` 购买确认页。
- `/policies` 我的保单。
- `/policies/[policyId]` 保单详情。

主要流程：

1. 用户连接 MetaMask。
2. 前端校验 BSC Testnet。
3. 用户进入 `/insurance` 查看可保护仓位。
4. 用户确认保费并发起链上购买。
5. 链上 mint 成功后，前端写入 Supabase 镜像。
6. 用户在 `/policies` 和详情页查看状态。
7. Miss 后进入 releasing，用户可逐步 claim。

注意：订单/市场来源仍需要专业团队重点核查。仓库里仍有历史 mock 数据和
过渡代码，接管团队应区分“展示用 mock”和“当前链上事实”。

## 7. 合约状态

当前 Segment 5 合约表面已经引入 Signa-aware 逻辑：

- `buyPolicy` 从 Signa market 读取用户仓位本金。
- `settleByOnChainRead` 从 Signa market 读取结算状态。
- 旧的集中式 settler 流程已成为历史语境，接手时以当前合约代码为准。

合约测试入口：

```powershell
cd contracts
npm.cmd test
```

审计记录：

- `contracts/AUDIT.md`

注意：当前审计是 AI/internal review，不是第三方专业安全审计。

## 8. 已知不能直接主网上线的 blocker

这些不是“优化项”，而是主网上线前必须解决的事项：

1. Signed quote / trusted pricing

   当前仍有 `kBps` 输入可信度问题。主网上线前需要后端签名报价、
   `QUOTER_ROLE`、过期时间、最大保费保护，或等价的可信报价机制。

2. Admin 权限治理

   `DEFAULT_ADMIN_ROLE` 不能由个人 EOA 管理。主网必须迁移到 multisig，
   并建议叠加 timelock。

3. 偿付能力机制

   保险池不能只依赖项目方预充值。需要定义资本池、风险敞口上限、
   单市场/单用户/全局承保上限、再保险或其他偿付机制。

4. 专业安全审计

   主网上线前必须做第三方合约审计，并根据审计结果决定是否重部署。

5. Signa 生产依赖核验

   必须确认 Signa 主网/测试网合约、市场状态枚举、finalOption 语义、
   optionCount、userBets、异常状态、升级策略和 API/数据源稳定性。

6. Event indexer

   当前镜像主要由交易发起路径写入。生产环境需要事件索引器或定时
   reconcile 机制，监听 mint/settle/refund/claim 并修正 Supabase。

7. Auth/RLS

   当前 Supabase RLS 是 demo 开放策略。生产必须加入钱包签名认证和
   服务端写入保护。

8. 法律与合规

   “insurance” 在很多司法辖区是敏感词。上线前需要法律意见，并审查
   官网文案、免责声明、地域限制、真实资金条款和用户风险提示。

## 9. 资产和权限移交清单

项目方需要准备并安全移交：

- GitHub repo admin/write 权限。
- Vercel 项目权限。
- Supabase 项目权限。
- BSC Testnet deployer/dev wallet 权限，或由团队重新部署并弃用旧 EOA。
- Vercel 环境变量：
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- 本地 `.env.local` 示例值。
- `contracts/.env` 所需变量：
  - `BSC_TESTNET_RPC_URL`
  - `PRIVATE_KEY`
  - `BSCSCAN_API_KEY`
  - `SUPABASE_URL`
  - `SUPABASE_PUBLISHABLE_KEY`
- BscScan API key。
- Signa 文档、合作渠道、测试市场说明。
- 当前测试钱包资金状态和 tUSDC 获取方式。

不要通过聊天明文发送真实私钥。建议专业团队接手后重新生成 dev wallet、
重新配置 Vercel/Supabase 权限，并轮换所有可轮换凭据。

## 10. 建议接管流程

第一阶段：技术尽调

- clone repo。
- 安装 root 和 `contracts/` 依赖。
- 跑通 lint/build/contracts test。
- 读 `contracts/AUDIT.md`。
- 核对 BSC Testnet 合约地址和 ABI。
- 核对 Supabase schema 和线上表结构。
- 核对 Vercel env 和 build logs。
- 输出 blocker list。

第二阶段：testnet 稳定版

- 清理历史 mock/legacy 代码路径。
- 补 event indexer 或 reconcile job。
- 做完整 E2E smoke test。
- 增加错误监控和交易失败记录。
- 增加用户可见的测试网/风险提示。
- 固化 release checklist。

第三阶段：pre-mainnet

- 设计 signed quote。
- 设计 solvency/capital pool。
- 设计 admin multisig + timelock。
- 做第三方审计。
- 做法律/合规 review。
- 做灰度发布与资金上限策略。

## 11. 建议验收清单

本地：

- `npm.cmd run lint` 0 errors。
- `npm.cmd run build` passed。
- `cd contracts && npm.cmd test` passed。
- `.env.local` 不入库。
- `.claude/settings.local.json` 不作为产品代码交付。

线上：

- Vercel production deploy 成功。
- 首页可访问。
- `/insurance` 可访问。
- `/policies` 可访问。
- 钱包连接和错误状态正常。
- BSC Testnet 网络提示正常。
- Supabase 读写路径可追踪。

链上：

- 合约地址与 `addresses.ts` 一致。
- ABI 与已部署合约一致。
- policy mint / settle / claim 事件能被解析。
- tUSDC decimals 确认为 18。
- Signa factory/market 读方法可用。

## 12. 给接手团队的关键提醒

- 不要把这个项目当纯前端 demo，它已经有真实 testnet 合约状态。
- 不要把当前 testnet 版本当主网生产版本。
- 不要绕过链上事实直接改 Supabase 数据。
- 不要复用个人 EOA 做生产 admin。
- 不要忽略 `contracts/AUDIT.md` 中的 accepted risks。
- 不要在没有法律意见前大规模宣传为真实“保险”产品。

建议接管目标表述：

> 将 CoverFi 从 BSC Testnet MVP 工程化为可审计、可运维、可灰度发布的本金保护协议；先完成 testnet 稳定版，再评估主网生产化路径。
