## Why

P4 的第一步：**事实账本与声明账本，以及声明级判定**（ADR-0003）。

「不编造」这条承诺现在靠逐字比对兜着——输出的每个汉字都得在原句里出现过。那条规则对规则引擎够用（它本来就在重排字符），但它拦不住语义上的编造，也没法说清「哪一条输出依据了哪一条事实」。

## What Changes

- **共享包新增 `engines/ledger.ts`**：
  - `extractComponents` —— 从一段文字里抽成分，五类：度量、拉丁实体、技能评级、职责动词、中文实词。纯规则，不含随机、不读时间。
  - `extractFactsByBullet` —— 把底稿的每条要点按句读切成子句，每条子句是一个 fact，带 `factId`（内容哈希）、原文区间与成分集合，并按要点分组。
  - `produceClaims` —— **规则引擎当第一个 claim 生产者**：每条底稿要点产出一条 claim（保留 / 改写 / 删除），引用来源要点的全部 fact。
  - `verifyClaims` —— 声明级判定，规则 R1–R8（ADR-0003 §4），合并类声明先严后松。
- **生成路径改用声明级判定**：`generateVersion` 不再调 `assertNoFactsAdded`，改为「产出声明 → 逐条判定 → 不可信的要点回退为原文并记录异常」。
- **`assertNoFactsAdded` 删除**：语义替换，不是叠加。两条口径并存会给出矛盾的结果（一条按字符、一条按成分）。
- **ADR-0003 的两处修正**：R5 在表里写的是「只记录不拦截」，第 8 节写的是拦截——按第 8 节（拦截）。另补一条实现细节：实词抽取时要去掉评级与动词，否则降级会被实词规则拦掉。

## Capabilities

### New Capabilities

（无——判定口径已在 ADR-0003 里定死，这里是它的实现。）

### Modified Capabilities

- `jd-version-generation`：「只重组、删减、强调底稿中已有的事实」这条 requirement 的判定口径从「逐字比对」改为「声明级校验」，并补上「从别处搬来的数字查得出来」这个场景。

## Impact

- 新增文件：`packages/shared/src/engines/ledger.ts` 及其用例。
- 改动文件：`packages/shared/src/engines/generateVersion.ts`（改用声明级判定）、`packages/shared/src/engines/transforms.ts`（删掉逐字校验）、`packages/shared/src/domain/types.ts`（异常的形状补上 `claimId` / `kind` / `component`）、`docs/adr/0003-integrity-verifier.md`（两处修正）。
- **版本落库结构不变**：异常的三个新字段都是可选的，存的是 jsonb，不需要迁移。
- **对当前的规则引擎没有可观察的变化**：它只重排已有字符，两种口径的结论一致。差别要到接入 LLM 之后才显出来——那时换词会被放行，换事实会被拦下。
