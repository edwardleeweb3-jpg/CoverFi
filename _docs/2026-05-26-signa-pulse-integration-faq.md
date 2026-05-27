# Signa Pulse 集成 FAQ(给 CoverFi 团队的答复)

**日期**: 2026-05-26
**对象**: CoverFi 技术对接(基于 BSC 测试网 chainId 97)
**作答口径**: 直接读 Signa Pulse v1 仓库源码与部署清单。所有合约地址都已经 verify,ABI 直接从 `forge build` 出来即可。下面分节对应原清单 A-F。

---

## A. 链与合约部署

**先回答最关键的一条:Signa Pulse 部署在 BSC,与 CoverFi 同链系。**
- **主网**: BSC mainnet,**chainId 56**
- **测试网**: BSC testnet,**chainId 97**(有 `dev` 和 `beta` 两套独立部署,见下表)

所以 CoverFi 在 BSC 测试网的合约可以**直接读 Signa Pulse 的链上数据**,不需要走链下适配器。最干净的路径。

### 合约地址(Pulse v1)

| 角色 | Prod (BSC mainnet, 56) | Beta (BSC testnet, 97) | Dev (BSC testnet, 97) |
|---|---|---|---|
| **Factory proxy** | `0xDc22B183Ecc9f6d86618AA858362490C8a9CcC9F` | `0xD23323a906F6d6d28224a37Cc963d55678AA7E65` | `0x12719568b045bA71EDb0911C4d4261e345cc7f09` |
| Factory impl | `0x0D0E0b61f06FD9A2f30086742a315D6e1C78eb34` | `0x557c4f50dF5BfDb1f810E7f1D9a570BB25EAf641` | (查 deployments json) |
| Market impl | `0xC20937C88d8dF5aB7ca7B67Dd3F02E71560DA98B` | `0x0eea815bb0ee634185276065e58A23A74c60B3ED` | (同上) |
| SingleArbitrator | `0xA4F0B3C0a9b0F6Fa0c5373a1B34B1A1deAB917f4` | `0x0fbEfde07334a0d3E9d12e96b55cCDDbc1016e04` | `0x9947aC8ac386f5650908eb1C2CB0BEF94c4520b6` |
| CollectiveArbitrator | **未部署(0x0)** | `0xb540a0a616202a9801f44ea7e4eF5090d855F399` | `0xf4BC50F4dE2f3A71e3e71F208d16b050e2d53fb9` |
| Treasury | `0xC469E989334D7B570652b58E5a6617eFb3BaeF99` | `0x08F0F3f4Fd98456c7cd1E217DC5C245c1D99D11C` | `0x08F0F3f4Fd98456c7cd1E217DC5C245c1D99D11C` |
| Base token | **USDT** `0x55d398...7955`(18 decimals) | **USDC** `0xc03d7E...1719c`(18 decimals) | 同 beta |
| Deploy block | 99,941,299 | 106,095,419 | (后期重置过,看 git) |

> **建议 CoverFi 对接 `beta` 测试网**——它的合约组合最完整(Single + Collective arbitrator 都部署了),也更稳定。`dev` 经常被清库重置。

### ABI / 源码 / 审计

- **合约源码**: 此仓库 `contract/src/`(主要合约:`PulseFactory.sol`、`PulseMarket.sol`、`SingleArbitrator.sol`、`CollectiveArbitrator.sol`、`PosVotingArbitrator.sol`、`PulseTypes.sol`)
- **ABI**: 跑 `forge build`,产物在 `contract/out/<合约名>.sol/<合约名>.json`。也可以用 `wagmi/cli` 或 `abitype` 生成 TS 类型
- **链上 verified**: 主网/测试网的工厂代理与实现都已 verified(BSC Scan / BSC Testnet Scan 直接看源码)
- **审计**: 仓库 `contract/` 下有 5 份内部审计报告 `INTERNAL-AUDIT-v1.md` ... `v5.md` + `audit.md`。**外部审计目前尚未做**(需要先确认对方对这个是否敏感)

---

## B. 订单数据模型

### 关键点:不是 NFT,是 storage mapping

Signa Pulse 的 "订单" / "持仓" **不是 NFT、也不是 ERC-1155**。一笔持仓由三元组唯一确定:

```
(marketAddr, userAddr, optionIndex)  →  uint256 grossAmount
```

存储位置在 `PulseMarket.sol`:

```solidity
mapping(address => mapping(uint8 => uint256)) public userBets;
//      ^bettor              ^option idx       ^net bet amount (post-fee)
mapping(address => bool) public hasBet;
//      ^bettor             ^"has placed >=1 bet?"
```

### 读法(任何第三方合约都可以读)

```solidity
import { IPulseMarket } from "@signa-pulse/contracts/interfaces/IPulseMarket.sol";

IPulseMarket m = IPulseMarket(marketAddr);

// 用户在 option=2 上的下注净额(扣过手续费)
uint256 amount = m.userBets(user, 2);

// 用户是否在该市场下过任何注
bool participated = m.hasBet(user);
```

**重要**:`userBets` 存的是 **净额(netAmount)** —— 已经扣过 entry-fee。原始毛额(grossAmount)只在 `BetPlaced` 事件里有,链上不持久。

### 给定 user 查全部市场:链上不可枚举

合约没有 "address X 的所有 markets" 的反查。必须**离线索引** `BetPlaced` 事件(见 C 节事件签名):

```
event BetPlaced(
  address indexed bettor,
  uint8   indexed option,
  uint256 grossAmount,
  uint256 netAmount,
  address referrer
);
```

`bettor` 是 indexed,所以可以高效 RPC 过滤。Signa 自己的 block-listener 就是这么做的。

### Market 注册表

工厂上有市场地址 ↔ 数字 ID 的双向映射,可以用来验证一个地址是不是合法的 Signa 市场(防止有人用任意地址冒充):

```solidity
IPulseFactory factory = IPulseFactory(factoryAddr);
uint256 id = factory.marketIds(marketAddr);    // 0 是 sentinel
address verified = factory.markets(id);
require(verified == marketAddr, "not a registered Pulse market");
```

---

## C. 结算与结果(对 CoverFi 最关键的一节)

### 状态机

```
Pending → Running → Settling → Settled → (Disputing → Disputed → Arbitrating →) Finalized
                                       ↓                       ↑
                                       └─── dispute window ────┘
```

完整 8 状态(定义在 `PulseTypes.sol`):

| 状态 | 说明 |
|---|---|
| `Pending` | 投注尚未开启 |
| `Running` | 接受投注 |
| `Settling` | Creator 已提交结果,可修改;**dispute 计时未开始** |
| `Settled` | 结果锁定,**dispute 窗口倒计时** |
| `Disputing` | ≥1 条 dispute 已提交,但未达阈值 |
| `Disputed` | 阈值达到,arbitration 窗口倒计时 |
| `Arbitrating` | 仲裁者已提交结果,在 min-window 内(SINGLE 还能改) |
| `Finalized` | **终态**;`finalOption >= 0` 是赢家选项,`== VOID_SENTINEL(-128)` 是作废/退款 |

### 第三方合约直接读结果

是的,完全可以。`PulseMarket` 把所有必要字段都开了 public getter:

```solidity
IPulseMarket m = IPulseMarket(marketAddr);

// 1) 是否已经终态
if (m.status() != Status.Finalized) {
    // 还未最终,可能还在 settling / disputing / arbitrating
    return;
}

// 2) 读 final outcome
int8 finalOption = m.finalOption();

if (finalOption == VOID_SENTINEL) {  // -128, 在 PulseTypes.sol 里定义
    // 市场作废,所有 bettors 走退款路径(claimRefund)
    // CoverFi 视角:此次保单按"无结果"处理
} else {
    uint8 winningOption = uint8(finalOption);
    // 用户是否赢:
    bool userWon = m.userBets(user, winningOption) > 0;
}
```

### Settlement / Final 事件签名(给离线索引用)

```solidity
event StatusChanged(Status indexed oldStatus, Status indexed newStatus);
//   ↑ 每次状态切换都触发,可以用来追踪生命周期

event MarketFinalized(int8 finalOption, string resolution);
//   ↑ 终态触发(从任何路径进入 Finalized 都会发),finalOption 同上语义

event CreatorSettled(int8 winningOption, string evidenceText, bytes32 fileHash, bool locked);
//   ↑ Creator 第一次提交结果时触发;locked=true 表示 Creator 自愿放弃修改权

event ArbitrationSubmitted(address indexed arbitrator, int8 outcome, bool locked);
//   ↑ Arbitrator 提交结果时触发

event Claimed(address indexed user, uint256 amount, bool isRefund);
//   ↑ 玩家提取奖金或退款时触发
```

> **建议**:CoverFi 只索引 `StatusChanged` + `MarketFinalized` 就够了。前者用于"市场进入了 Settled / Disputed / Arbitrating"这类中间状态告警,后者用于"出结果了,可以计算保单赔付"。

### 最终性 / 回滚保证

- `Finalized` 是**终态**,合约里没有任何回到非 Finalized 的路径。**一旦 Finalized 永不回滚。**
- `Arbitrating → Finalized` 中间有一个 `arbitrationWindow_min`(每市场配置,通常几小时),期间 SingleArbitrator **可以修改** 仲裁结果(`isLocked` 标志触发后不可改)。**CoverFi 想要"绝对最终"的语义,应该等 `status() == Finalized` 而不是仅看 `ArbitrationSubmitted`。**
- Dispute 阶段会延长结算总时长,但 dispute 不会"撤销"已发生的 finalize。
- **CoverFi 集成建议**:在保单到期判定时读 `status() == Finalized && finalOption == <claim 选项>`,作为赔付触发条件。读到 Finalized 之前的任何中间状态,都按"待定"处理。

### 作废 / 取消 / 退款

`finalOption == VOID_SENTINEL(-128)` 表示市场作废。触发场景:

- Arbitrator 主动判定为 VOID(罕见)
- 创建者超时未结算,且 dispute 窗口结束时没有有效的争议结果
- 配置错误导致仲裁失败的极端 fallback

退款路径:bettors 调用 `claimRefund()`,合约把本金原路退回。事件:`Claimed(user, amount, isRefund=true)`。

---

## D. 集成方式

| 方式 | 状态 | 建议 |
|---|---|---|
| 直接读合约 view | ✅ 最稳 | **首选**——`status()`、`finalOption()`、`userBets()` 三个 getter 够覆盖 95% 场景 |
| 监听链上事件 | ✅ 推荐 | 配合 view 使用——event 告诉你"什么时候去读",view 告诉你"读到的是什么" |
| Subgraph (The Graph) | ❌ 未部署 | 目前没有公开 subgraph |
| 官方 HTTP API (BFF) | 🟡 内部用 | `market-backend` 服务有 HTTP API 但**不对外稳定**,API surface 还在演进,不建议第三方依赖 |
| 官方 SDK | 🟡 内部用 | `frontend/src/libs/sdk/` 有 TS SDK,但只为前端用,没打 npm 包 |

**推荐流程**:
1. CoverFi 合约在保单创建时记录 `(pulseMarketAddr, pulseFactoryAddr, claimOption)` 三元组
2. CoverFi 合约的赔付检查函数读 `IPulseMarket(market).status()` + `finalOption()`,**外加 factory registry 校验**(防伪)
3. CoverFi 离线服务订阅 `MarketFinalized` 事件,作为触发 claim 流程的信号

---

## E. 结算代币

| 环境 | 代币 | 地址 | Decimals | 备注 |
|---|---|---|---|---|
| **Mainnet (BSC 56)** | **USDT** | `0x55d398326f99059fF775485246999027B3197955` | **18** | ⚠️ 注意:**BSC 上的 USDT 是 18 位精度**,跟 Ethereum 主网 USDT 的 6 位不同;CoverFi 自己内部账记得对齐 |
| **Beta (BSC testnet 97)** | USDC(测试) | `0xc03d7EA305485421e444070260D68ee598C1719c` | 18 | 测试网 USDC,我们自部署 mintable |
| **Dev (BSC testnet 97)** | USDC(测试) | 同上 | 18 | 跟 beta 共用 base token |

### Faucet

- **tBNB**(gas):BSC 官方 faucet → https://www.bnbchain.org/en/testnet-faucet
- **测试 USDC**(`0xc03d7E...`):仓库管理员 wallet 是 `0x08F0F3f4Fd98456c7cd1E217DC5C245c1D99D11C`,这个 wallet 有 mint 权;让 CoverFi 团队报地址,我们这边批量发一些(或者把 admin key 给到对方运维短期内自取)

---

## F. 测试环境与协作

### 可用测试网部署

- ✅ **Beta**(`chainId=97`, factory `0xD23323...`)—— 推荐用这个对接,合约组合完整(含 CollectiveArbitrator),且生命周期演练充分
- ⚠️ **Dev**(`chainId=97`, factory `0x12719568...`)—— **会被定期清库重置**(刚在 2026-05-25 重置了一次,start_block=109465107),不适合长期联调

### 测试市场种子

仓库 `contract/test/integration/PulseMarket.Lifecycle.t.sol` 有完整生命周期 forge 测试覆盖了:

- Settle → Finalized(无争议路径)
- Settle → Dispute → Arbitrate → Finalized
- 超时 → VOID
- Stale recovery(创建者长期不结算的兜底)

CoverFi 想要的"赢/输/作废"三种结果,我们可以在 beta 上**专门为你们创建 3 个测试市场**预先跑通生命周期,提供给对方做集成测试。需要的话给我们一个对接地址(EOA)我安排。

### 合约稳定性 / 升级计划

- `PulseFactory` / `PulseMarket` 是 UUPS 可升级(`factoryImpl` 是升级目标)。**最近一次升级是 2026-05-25**(`UpgradePulse.s.sol` 改为读 array-root deployment artifacts)。
- 当前 ABI 视为**稳定**——v1 的所有外部 surface(events + view functions)只增不删,符合 SemVer 思路。
- 升级时我们会提前在 #dev-code-reviews 或对接群通知,**对外暴露的 view function 签名不会破坏**。

### 对接人 / 沟通渠道

- 技术对接(链上):合约维护者 — Slack #dev-code-reviews 频道
- 后端对接:`market-backend` 团队 — 同频道(@Kai / @Billy)
- 前端 SDK:@django
- 集成期间建议开一个 shared Slack 子频道 `coverfi-signa-integration` 方便异步

---

## 附:CoverFi 合约侧最小集成示例

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPulseFactoryRegistry {
    function markets(uint256 id) external view returns (address);
    function marketIds(address market) external view returns (uint256);
}

interface IPulseMarket {
    enum Status {
        Pending, Running, Settling, Settled,
        Disputing, Disputed, Arbitrating, Finalized
    }
    function status() external view returns (Status);
    function finalOption() external view returns (int8);
    function userBets(address user, uint8 option) external view returns (uint256);
    function hasBet(address user) external view returns (bool);
}

int8 constant VOID_SENTINEL = type(int8).min;  // -128

contract CoverFiClaimCheck {
    address public immutable signaFactory;  // 部署时传入 0xD23323... (testnet beta) 或 0xDc22B1... (mainnet)

    constructor(address _factory) {
        signaFactory = _factory;
    }

    /// @notice 检查某个 Signa Pulse 市场是否已最终结算且用户赢了某个选项。
    /// @dev    第三方场景必须先用工厂注册表校验市场身份(防伪),再读 final 状态。
    function isUserWinner(address market, address user, uint8 claimOption) external view returns (
        bool finalized,
        bool isVoid,
        bool userWon
    ) {
        // 1) 校验市场身份
        uint256 id = IPulseFactoryRegistry(signaFactory).marketIds(market);
        require(IPulseFactoryRegistry(signaFactory).markets(id) == market, "not a signa market");

        // 2) 是否最终
        IPulseMarket m = IPulseMarket(market);
        if (m.status() != IPulseMarket.Status.Finalized) {
            return (false, false, false);
        }
        finalized = true;

        // 3) 是否作废
        int8 fin = m.finalOption();
        if (fin == VOID_SENTINEL) {
            isVoid = true;
            return (finalized, isVoid, false);
        }

        // 4) 用户在该选项上是否有持仓
        userWon = uint8(fin) == claimOption && m.userBets(user, claimOption) > 0;
    }
}
```

---

**总结一句**:CoverFi 跟 Signa Pulse 同在 BSC,可以**纯链上读取**集成。建议从 beta 测试网开始,先 `IPulseMarket.status()` + `finalOption()` 两个 view 跑通最小赔付判定,再加事件订阅做触发逻辑。所有 Signa 这边需要的支持(测试代币 mint、测试市场种子、对接 Slack 频道)随时配合。
