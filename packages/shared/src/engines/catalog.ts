export type CatalogCategory =
  | 'frontend'
  | 'backend'
  | 'data'
  | 'infra'
  | 'architecture'
  | 'engineering'
  | 'soft'
  | 'language'
  | 'domain'

export interface CatalogEntry {
  id: string
  label: string
  category: CatalogCategory
  aliases: string[]
  related: string[]
}

export const CATALOG: CatalogEntry[] = [
  // ---- 前端 ----
  { id: 'vue', label: 'Vue', category: 'frontend', aliases: ['Vue', 'Vue.js', 'Vue3'], related: ['前端框架'] },
  { id: 'react', label: 'React', category: 'frontend', aliases: ['React', 'React.js'], related: ['前端框架'] },
  { id: 'angular', label: 'Angular', category: 'frontend', aliases: ['Angular'], related: ['前端框架'] },
  { id: 'svelte', label: 'Svelte', category: 'frontend', aliases: ['Svelte'], related: ['前端框架'] },
  { id: 'typescript', label: 'TypeScript', category: 'frontend', aliases: ['TypeScript', 'TS'], related: ['类型系统'] },
  { id: 'javascript', label: 'JavaScript', category: 'frontend', aliases: ['JavaScript', 'JS'], related: ['ES6'] },
  { id: 'html-css', label: 'HTML/CSS', category: 'frontend', aliases: ['HTML', 'CSS', 'HTML5', 'CSS3'], related: ['页面布局'] },
  { id: 'sass-less', label: 'Sass/Less', category: 'frontend', aliases: ['Sass', 'SCSS', 'Less'], related: ['样式预处理'] },
  { id: 'tailwind', label: 'Tailwind CSS', category: 'frontend', aliases: ['Tailwind', 'Tailwind CSS'], related: ['原子化 CSS'] },
  { id: 'element-plus', label: 'Element Plus', category: 'frontend', aliases: ['Element Plus', 'ElementUI', 'Element UI'], related: ['组件库'] },
  { id: 'ant-design', label: 'Ant Design', category: 'frontend', aliases: ['Ant Design', 'AntD'], related: ['组件库'] },
  { id: 'vite', label: 'Vite', category: 'frontend', aliases: ['Vite'], related: ['构建工具'] },
  { id: 'webpack', label: 'Webpack', category: 'frontend', aliases: ['Webpack'], related: ['构建工具', '打包工具'] },
  { id: 'rollup', label: 'Rollup', category: 'frontend', aliases: ['Rollup'], related: ['构建工具'] },
  { id: 'nextjs', label: 'Next.js', category: 'frontend', aliases: ['Next.js', 'NextJS', 'Nuxt', 'Nuxt.js'], related: ['服务端渲染', 'SSR'] },
  { id: 'miniprogram', label: '小程序', category: 'frontend', aliases: ['小程序', '微信小程序'], related: ['跨端'] },
  { id: 'responsive', label: '响应式', category: 'frontend', aliases: ['响应式', '移动端适配'], related: ['兼容性'] },
  { id: 'frontend-tooling', label: '前端工程化', category: 'frontend', aliases: ['前端工程化', '工程化'], related: ['脚手架'] },
  { id: 'component-library', label: '组件库', category: 'frontend', aliases: ['组件库', '基础组件'], related: ['设计系统'] },
  { id: 'state-management', label: '状态管理', category: 'frontend', aliases: ['状态管理', 'Pinia', 'Vuex', 'Redux'], related: ['数据流'] },
  { id: 'electron', label: 'Electron', category: 'frontend', aliases: ['Electron', 'Tauri'], related: ['桌面端'] },
  { id: 'visualization', label: '数据可视化', category: 'frontend', aliases: ['ECharts', 'D3', 'Canvas', 'WebGL', '数据可视化'], related: ['图表'] },
  { id: 'web-security', label: '前端安全', category: 'frontend', aliases: ['XSS', 'CSRF', 'CORS'], related: ['安全策略'] },

  // ---- 后端 ----
  { id: 'spring', label: 'Spring', category: 'backend', aliases: ['Spring', 'Spring Boot', 'Spring Cloud'], related: ['后端框架'] },
  { id: 'mybatis', label: 'MyBatis', category: 'backend', aliases: ['MyBatis', 'Hibernate', 'JPA'], related: ['ORM'] },
  { id: 'nodejs', label: 'Node.js', category: 'backend', aliases: ['Node.js', 'NodeJS'], related: ['后端框架'] },
  { id: 'express', label: 'Express', category: 'backend', aliases: ['Express', 'NestJS', 'Koa'], related: ['后端框架'] },
  { id: 'django', label: 'Django', category: 'backend', aliases: ['Django', 'Flask', 'FastAPI'], related: ['后端框架'] },
  { id: 'gin', label: 'Gin', category: 'backend', aliases: ['Gin', 'Echo'], related: ['后端框架'] },
  { id: 'high-concurrency', label: '高并发', category: 'backend', aliases: ['高并发', '大流量'], related: ['并发处理'] },
  { id: 'microservice', label: '微服务', category: 'backend', aliases: ['微服务', '服务化', '服务拆分'], related: ['服务治理'] },
  { id: 'distributed', label: '分布式', category: 'backend', aliases: ['分布式', '分布式系统'], related: ['多机部署'] },
  { id: 'rpc', label: 'RPC', category: 'backend', aliases: ['gRPC', 'RPC', 'Thrift', 'Dubbo'], related: ['服务调用'] },
  { id: 'restful', label: 'RESTful', category: 'backend', aliases: ['RESTful', 'REST'], related: ['接口设计'] },
  { id: 'api-design', label: '接口设计', category: 'backend', aliases: ['接口设计', 'API 设计', '开放接口'], related: ['协议设计'] },
  { id: 'resilience', label: '限流降级', category: 'backend', aliases: ['限流', '熔断', '降级', '过载保护'], related: ['稳定性'] },
  { id: 'service-governance', label: '服务治理', category: 'backend', aliases: ['服务治理', '注册发现', '配置中心'], related: ['服务化'] },

  // ---- 数据 ----
  { id: 'mysql', label: 'MySQL', category: 'data', aliases: ['MySQL', 'MariaDB'], related: ['关系型数据库'] },
  { id: 'postgresql', label: 'PostgreSQL', category: 'data', aliases: ['PostgreSQL', 'PG', 'Oracle'], related: ['关系型数据库'] },
  { id: 'redis', label: 'Redis', category: 'data', aliases: ['Redis'], related: ['缓存'] },
  { id: 'mongodb', label: 'MongoDB', category: 'data', aliases: ['MongoDB'], related: ['文档数据库'] },
  { id: 'elasticsearch', label: 'Elasticsearch', category: 'data', aliases: ['Elasticsearch', 'ES', 'Lucene'], related: ['检索引擎'] },
  { id: 'kafka', label: 'Kafka', category: 'data', aliases: ['Kafka', 'RocketMQ', 'RabbitMQ'], related: ['消息队列'] },
  { id: 'message-queue', label: '消息队列', category: 'data', aliases: ['消息队列', 'MQ'], related: ['异步解耦'] },
  { id: 'sql', label: 'SQL', category: 'data', aliases: ['SQL', 'SQL 优化'], related: ['查询优化'] },
  { id: 'index-optimization', label: '索引优化', category: 'data', aliases: ['索引优化', '慢查询', '执行计划'], related: ['查询优化'] },
  { id: 'sharding', label: '分库分表', category: 'data', aliases: ['分库分表', '分表', '读写分离'], related: ['水平拆分'] },
  { id: 'data-modeling', label: '数据建模', category: 'data', aliases: ['数据建模', '数据模型', '数据治理'], related: ['数据规范'] },
  { id: 'olap', label: 'OLAP', category: 'data', aliases: ['Hive', 'Spark', 'Flink', 'ClickHouse', '数据仓库'], related: ['离线计算'] },
  { id: 'cache', label: '缓存', category: 'data', aliases: ['缓存', '缓存设计', '本地缓存'], related: ['性能优化'] },

  // ---- 基础设施 ----
  { id: 'docker', label: 'Docker', category: 'infra', aliases: ['Docker'], related: ['容器'] },
  { id: 'containerization', label: '容器化', category: 'infra', aliases: ['容器化', '容器编排'], related: ['交付'] },
  { id: 'kubernetes', label: 'Kubernetes', category: 'infra', aliases: ['Kubernetes', 'K8s', 'K8S'], related: ['容器编排'] },
  { id: 'cicd', label: 'CI/CD', category: 'infra', aliases: ['CI/CD', 'Jenkins', 'GitLab CI', 'GitHub Actions'], related: ['持续集成', '持续交付'] },
  { id: 'monitoring', label: '监控告警', category: 'infra', aliases: ['监控告警', 'Prometheus', 'Grafana', '可观测性'], related: ['告警'] },
  { id: 'logging', label: '日志', category: 'infra', aliases: ['日志', '日志系统', 'ELK'], related: ['排障'] },
  { id: 'linux', label: 'Linux', category: 'infra', aliases: ['Linux', 'Unix'], related: ['命令行'] },
  { id: 'nginx', label: 'Nginx', category: 'infra', aliases: ['Nginx', '网关', '反向代理'], related: ['接入层'] },
  { id: 'deployment', label: '部署', category: 'infra', aliases: ['部署', '发布', '灰度发布', '上线流程'], related: ['交付'] },
  { id: 'shell', label: 'Shell', category: 'infra', aliases: ['Shell', 'Bash', '脚本'], related: ['自动化'] },
  { id: 'iaas', label: '云基础设施', category: 'infra', aliases: ['云计算', '公有云', '私有云', 'Kubernetes 集群'], related: ['资源管理'] },

  // ---- 架构 ----
  { id: 'ddd', label: 'DDD', category: 'architecture', aliases: ['DDD', '领域驱动设计'], related: ['领域建模'] },
  { id: 'architecture-design', label: '架构设计', category: 'architecture', aliases: ['架构设计', '系统设计', '技术方案设计'], related: ['方案设计'] },
  { id: 'monolith', label: '单体架构', category: 'architecture', aliases: ['单体架构'], related: ['架构演进'] },
  { id: 'consistency', label: '一致性', category: 'architecture', aliases: ['最终一致性', '强一致性', '分布式事务'], related: ['事务'] },
  { id: 'idempotent', label: '幂等', category: 'architecture', aliases: ['幂等', '幂等性'], related: ['稳定性'] },
  { id: 'capacity', label: '容量规划', category: 'architecture', aliases: ['容量规划', '容量评估', '压测'], related: ['性能评估'] },
  { id: 'high-availability', label: '高可用', category: 'architecture', aliases: ['高可用', '容灾', '故障转移'], related: ['稳定性'] },
  { id: 'middleware', label: '中间件', category: 'architecture', aliases: ['中间件'], related: ['基础设施'] },
  { id: 'evolution', label: '架构演进', category: 'architecture', aliases: ['架构演进', '重构', '技术改造'], related: ['代码重构'] },

  // ---- 工程实践 ----
  { id: 'unit-test', label: '单元测试', category: 'engineering', aliases: ['单元测试', '单测'], related: ['测试'] },
  { id: 'integration-test', label: '集成测试', category: 'engineering', aliases: ['集成测试', '端到端测试', 'E2E'], related: ['测试'] },
  { id: 'coverage', label: '测试覆盖率', category: 'engineering', aliases: ['测试覆盖率', '覆盖率'], related: ['质量保障'] },
  { id: 'code-review', label: '代码评审', category: 'engineering', aliases: ['代码评审', 'Code Review', 'CR'], related: ['协作'] },
  { id: 'performance', label: '性能优化', category: 'engineering', aliases: ['性能优化', '首屏优化', '内存优化', '打包优化'], related: ['性能'] },
  { id: 'troubleshooting', label: '排查问题', category: 'engineering', aliases: ['排查问题', '定位问题', '线上问题', '故障处理'], related: ['排障'] },
  { id: 'code-standard', label: '代码规范', category: 'engineering', aliases: ['代码规范', '编码规范', 'Lint', 'ESLint'], related: ['代码质量'] },
  { id: 'documentation', label: '文档', category: 'engineering', aliases: ['文档', '技术文档', '接口文档'], related: ['沉淀'] },
  { id: 'sharing', label: '技术分享', category: 'engineering', aliases: ['技术分享', '分享会', '内部培训'], related: ['知识沉淀'] },
  { id: 'observability-data', label: '埋点', category: 'engineering', aliases: ['埋点', '数据采集', '指标体系'], related: ['数据驱动'] },

  // ---- 软技能 ----
  { id: 'teamwork', label: '团队协作', category: 'soft', aliases: ['团队协作', '协作能力', '跨部门协作'], related: ['协作'] },
  { id: 'communication', label: '沟通能力', category: 'soft', aliases: ['沟通能力', '沟通表达', '表达能力'], related: ['沟通'] },
  { id: 'requirement-analysis', label: '需求分析', category: 'soft', aliases: ['需求分析', '需求梳理'], related: ['业务理解'] },
  { id: 'learning', label: '学习能力', category: 'soft', aliases: ['学习能力', '自驱', '快速学习'], related: ['成长'] },
  { id: 'ownership', label: '责任心', category: 'soft', aliases: ['责任心', '主人翁意识', '认真负责'], related: ['态度'] },
  { id: 'pressure', label: '抗压', category: 'soft', aliases: ['抗压', '抗压能力'], related: ['态度'] },
  { id: 'drive', label: '推动落地', category: 'soft', aliases: ['推动落地', '推动', '落地'], related: ['执行'] },
  { id: 'project-management', label: '项目管理', category: 'soft', aliases: ['项目管理', '排期', '进度管理'], related: ['协作'] },
  { id: 'lead-team', label: '带团队', category: 'soft', aliases: ['带团队', '团队管理', '人员培养'], related: ['管理'] },
  { id: 'review-retro', label: '复盘', category: 'soft', aliases: ['复盘', '总结'], related: ['沉淀'] },
  { id: 'reporting', label: '汇报', category: 'soft', aliases: ['汇报', '向上汇报', '对齐'], related: ['沟通'] },

  // ---- 语言 ----
  { id: 'java', label: 'Java', category: 'language', aliases: ['Java'], related: ['后端语言'] },
  { id: 'go', label: 'Go', category: 'language', aliases: ['Go', 'Golang'], related: ['后端语言'] },
  { id: 'python', label: 'Python', category: 'language', aliases: ['Python'], related: ['脚本语言'] },
  { id: 'cpp', label: 'C++', category: 'language', aliases: ['C++', 'C#', 'Rust', 'Kotlin', 'Swift', 'Scala'], related: ['系统语言'] },
  { id: 'php', label: 'PHP', category: 'language', aliases: ['PHP', 'Ruby'], related: ['后端语言'] },
  { id: 'english', label: '英语', category: 'language', aliases: ['英语', '英文', 'English'], related: ['外语能力'] },

  // ---- 业务域 ----
  { id: 'ecommerce', label: '电商', category: 'domain', aliases: ['电商', '零售'], related: ['交易'] },
  { id: 'finance', label: '金融', category: 'domain', aliases: ['金融', '支付', '清结算', '风控'], related: ['资金'] },
  { id: 'education-domain', label: '教育', category: 'domain', aliases: ['教育', '在线教育'], related: ['学习'] },
  { id: 'medical', label: '医疗', category: 'domain', aliases: ['医疗', '健康'], related: ['行业'] },
  { id: 'game', label: '游戏', category: 'domain', aliases: ['游戏'], related: ['娱乐'] },
  { id: 'social', label: '社交', category: 'domain', aliases: ['社交', '社区', 'IM'], related: ['互动'] },
  { id: 'advertising', label: '广告', category: 'domain', aliases: ['广告', '投放'], related: ['增长'] },
  { id: 'search-domain', label: '搜索', category: 'domain', aliases: ['搜索', '检索', '推荐', '推荐系统'], related: ['流量'] },
  { id: 'logistics', label: '物流', category: 'domain', aliases: ['物流', '供应链', '仓储'], related: ['履约'] },
  { id: 'saas', label: 'SaaS', category: 'domain', aliases: ['SaaS', '企业服务', '中台', 'CRM', 'ERP'], related: ['toB'] },
  { id: 'live', label: '直播', category: 'domain', aliases: ['直播', '短视频', '内容'], related: ['流量'] },
]

export type CatalogMatchKind = 'alias' | 'related'

export interface CatalogMatch {
  entry: CatalogEntry
  term: string
  kind: CatalogMatchKind
  start: number
  end: number
}

interface IndexedTerm {
  entry: CatalogEntry
  term: string
  kind: CatalogMatchKind
}

let indexedTerms: IndexedTerm[] | null = null

function allTerms(): IndexedTerm[] {
  if (indexedTerms) return indexedTerms
  const terms: IndexedTerm[] = []
  for (const entry of CATALOG) {
    for (const alias of entry.aliases) terms.push({ entry, term: alias, kind: 'alias' })
    for (const related of entry.related) terms.push({ entry, term: related, kind: 'related' })
  }
  terms.sort((left, right) => {
    if (right.term.length !== left.term.length) return right.term.length - left.term.length
    if (left.kind !== right.kind) return left.kind === 'alias' ? -1 : 1
    return left.term.localeCompare(right.term)
  })
  indexedTerms = terms
  return terms
}

function occurrences(text: string, term: string): Array<[number, number]> {
  const found: Array<[number, number]> = []
  if (!term) return found

  if (/^[A-Za-z][A-Za-z0-9+#.]*$/.test(term)) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'gi')
    for (const match of text.matchAll(pattern)) {
      found.push([match.index, match.index + match[0].length])
    }
    return found
  }

  let cursor = text.indexOf(term)
  while (cursor !== -1) {
    found.push([cursor, cursor + term.length])
    cursor = text.indexOf(term, cursor + 1)
  }
  return found
}

export function matchCatalog(text: string): CatalogMatch[] {
  const matches: CatalogMatch[] = []
  const masked = new Array<boolean>(text.length).fill(false)

  for (const { entry, term, kind } of allTerms()) {
    for (const [start, end] of occurrences(text, term)) {
      let covered = false
      for (let index = start; index < end; index += 1) {
        if (masked[index]) {
          covered = true
          break
        }
      }
      if (covered) continue
      for (let index = start; index < end; index += 1) masked[index] = true
      matches.push({ entry, term, kind, start, end })
    }
  }

  return matches.sort((left, right) => left.start - right.start)
}

export function catalogTerms(text: string): string[] {
  return [...new Set(matchCatalog(text).map((match) => match.term))]
}

export function findEntry(id: string): CatalogEntry | undefined {
  return CATALOG.find((entry) => entry.id === id)
}

let termIndex: Map<string, CatalogEntry> | null = null

export function findEntryByTerm(term: string): CatalogEntry | undefined {
  if (!termIndex) {
    termIndex = new Map()
    for (const entry of CATALOG) {
      for (const alias of entry.aliases) {
        if (!termIndex.has(alias)) termIndex.set(alias, entry)
      }
    }
  }
  return termIndex.get(term)
}
