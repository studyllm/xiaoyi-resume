// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { RESET_PASSWORD_PATH, VERIFY_EMAIL_PATH } from '@xiaoyi/shared/domain/links'
import router from './index'

describe('邮件进来的链接', () => {
  it('链接指向的路径都有对应的路由', () => {
    // 服务端建链接用的路径与前端接路由用的路径是同一份定义——
    // 对不上就意味着点开邮件落不到页面上。
    const paths = router.getRoutes().map((route) => route.path)
    expect(paths).toContain(VERIFY_EMAIL_PATH)
    expect(paths).toContain(RESET_PASSWORD_PATH)
  })

  it('这两个页面是公开页——从邮件进来的人还没有登录态', () => {
    for (const path of [VERIFY_EMAIL_PATH, RESET_PASSWORD_PATH]) {
      const route = router.getRoutes().find((item) => item.path === path)
      expect(route?.meta.public).toBe(true)
    }
  })
})

describe('页面与路由', () => {
  it('每个页面组件都接在路由上', () => {
    // 「视图写了、路由忘了」会让邮件链接落到兜底路由上：
    // 用户看到的是「要求登录」，而验证那一步压根没跑。
    const viewsDirectory = join(process.cwd(), 'src/views')
    const routerSource = readFileSync(join(process.cwd(), 'src/router/index.ts'), 'utf8')
    const unrouted = readdirSync(viewsDirectory)
      .filter((name) => name.endsWith('.vue'))
      .filter((name) => !routerSource.includes(name))
    expect(unrouted).toEqual([])
  })
})
