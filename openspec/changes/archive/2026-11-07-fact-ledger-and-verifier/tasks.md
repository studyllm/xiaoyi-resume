## 1. 账本

- [x] 1.1 成分抽取：度量（带单位）、拉丁实体、技能评级、职责动词、中文实词
- [x] 1.2 `splitClauses`：按句读与连接词切子句，不在空格处切
- [x] 1.3 `extractFactsByBullet`：fact 带 factId、原文区间与成分，按要点分组；两次抽取全等
- [x] 1.4 `produceClaims`：规则引擎当第一个 claim 生产者，一条输出要点一条 claim

## 2. 判定

- [x] 2.1 R1 度量、R2 实体、R3 评级、R4 动词、R5 实词
- [x] 2.2 R6 无引用、R7 keep、R8 delete
- [x] 2.3 合并类 claim 逐 fact 校验（先严后松，并集为准，单条 fact 核不过记观察）

## 3. 接进生成路径

- [x] 3.1 `generateVersion` 改用声明级判定，`assertNoFactsAdded` 删除
- [x] 3.2 不可信的要点回退为原文，异常记上 `claimId` / `kind` / `component`

## 4. 规格

- [x] 4.1 ADR-0003 的 R5 与第 8 节的矛盾按第 8 节统一
- [x] 4.2 补上「实词抽取去掉评级与动词」这条实现细节
- [x] 4.3 ADR-0003 的「相关变更」指向本变更
- [x] 4.4 `jd-version-generation` 的判定口径写成声明级

## 5. 验收

- [x] 5.1 共享包、前端、服务端三处测试全过
- [x] 5.2 用例覆盖：成分抽取、子句切分、两次抽取全等、声明生产、七类判定
