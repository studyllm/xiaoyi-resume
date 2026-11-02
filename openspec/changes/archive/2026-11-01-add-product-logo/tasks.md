## 1. 资源与变量

- [x] 1.1 `frontend/src/assets/logo.png`：用定稿标识的图形部分——裁出 Y 形标记（y=618..1213）、按 `alpha=(252-min)/52` 抠掉白底并保留光束层次、放进 256×256 透明方形画布、缩到 256×256
- [x] 1.2 `frontend/src/assets/logo-full.png`：原图完整组合（图形 + 「小奕·简历」字样），同样抠成透明底、缩到 512 宽，作素材存档
- [x] 1.3 `frontend/src/styles/tokens.css`：新增 `--brand-logo-size-landing: 28px` 与 `--brand-logo-size-bar: 24px`

## 2. 标识组件

- [x] 2.1 `frontend/src/components/BrandLogo.vue`（新增）：`import logoUrl from '@/assets/logo.png'`，渲染 `<img class="brand-logo" :class="`is-${variant}`" :src="logoUrl" alt="">`；尺寸走 `variant`（`landing` / `bar`）映射到 tokens 里的尺寸变量；`object-fit: contain` 保证换成非方形的标识时不被压扁
- [x] 2.2 组件不接受替代文本参数：标识是装饰性的，alt 固定为空

## 3. 两处顶栏

- [x] 3.1 `frontend/src/views/WelcomeView.vue`：落地页顶栏在「小奕·简历」前加 `<BrandLogo variant="landing" />`；品牌区改成横向排列并留出间距
- [x] 3.2 `frontend/src/layouts/DefaultLayout.vue`：工作台顶栏在「小奕·简历」前加标识；`.layout-title` 改成横向排列并留出间距，仍是回首页的链接
- [x] 3.3 确认两处顶栏的标识与产品名文字同行、基线协调，落地页与工作台的版式没有其它变化

## 4. 守卫

- [x] 4.1 `frontend/src/flows.spec.ts`：新增「顶栏的品牌区有标识」检查——落地页与工作台顶栏都引用 `BrandLogo`
- [x] 4.2 `frontend/src/flows.spec.ts`：新增「标识只从固定路径引用」检查——`BrandLogo.vue` 从 `assets/logo.png` 引入资源，且标识统一由它渲染，别处不自己贴 `<img>`
- [x] 4.3 `frontend/src/flows.spec.ts`：新增「标识是装饰性的」检查——标识的 `alt` 为空

## 5. 验收

- [x] 5.1 `cd frontend && npm run type-check` 通过
- [x] 5.2 `cd frontend && npm run test` 通过
- [x] 5.3 浏览器实测：落地页与工作台顶栏都出现标识（实测 28×28 / 24×24、alt 为空），与产品名文字并列
- [x] 5.4 浏览器实测：24px 与 28px 下标记都清晰，背景透明看不到白方块
- [x] 5.5 浏览器实测：工作台顶栏的「回到首页」链接仍然可点，标识在链接内
- [x] 5.6 `npm run build` 通过，logo 正常产出为带哈希的资源文件；未被引用的 `logo-full.png` 不进产物
