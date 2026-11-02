## 1. 联系方式那一行在编辑模式下始终渲染

- [x] 1.1 `frontend/src/components/ResumePreview.vue`: 联系方式那一行的判定改成 `profile.contacts.length > 0 || editable`
- [x] 1.2 `frontend/src/components/ResumeEditor.spec.ts`: 新增"没有联系方式时也能新增第一条"
- [x] 1.3 `frontend/src/components/ResumePreview.spec.ts`: 新增"只读模式下没有联系方式就不渲染这一行"

## 2. 验证

- [x] 2.1 `frontend`: `npm run type-check` 与 `npm test` 全绿
- [x] 2.2 浏览器实测：编辑模式下一条联系方式都没有时，抬头上有「＋ 新增联系方式」；加上后出现在抬头上；预览模式没有联系方式时那一行不出现
