## ADDED Requirements

### Requirement: 版本 id 全局唯一

系统 SHALL 为每个版本生成全局唯一的 id。id 是版本在存储里的主键，SHALL NOT 因为重复而让生成失败。

#### Scenario: 连续生成两个版本

- **WHEN** 用户连续生成两个版本
- **THEN** 两个版本的 id 不相同
- **AND** 两个版本都能存下来

#### Scenario: 服务端重启后再生成

- **WHEN** 服务端重启后用户生成一个版本
- **THEN** 新版本的 id 不与库里已有的版本重复
- **AND** 生成成功
