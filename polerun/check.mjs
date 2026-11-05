import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(root, '../dist/polerun')
const base = 'https://www.run2yourstyle.com/polerun/'
const manifest=JSON.parse(fs.readFileSync(path.join(dist,'policy-manifest.json'),'utf8'))
const pages = ['', 'privacy', 'terms', 'location', 'disclosures', 'support', 'courses']
for (const page of pages) {
  const file = path.join(dist, page, 'index.html')
  const html = fs.readFileSync(file, 'utf8')
  assert.ok(html.includes(`rel="canonical" href="${base}${page ? page + '/' : ''}"`), `Wrong canonical: ${page}`)
  assert.ok(html.includes('help.polerunapp@gmail.com'), `Missing support contact: ${page}`)
  assert.ok(!/googlesyndication|adsbygoogle|google-analytics|googletagmanager|polerun\.readybay64\.chatgpt\.site/.test(html), `Unexpected embedded service or old address: ${page}`)
  for (const match of html.matchAll(/(?:href|src)="(\/[^\"]*)"/g)) {
    const url = new URL(match[1], base)
    assert.ok(url.pathname.startsWith('/polerun/'), `Link escapes PoleRun: ${match[1]}`)
    const relative = decodeURIComponent(url.pathname.slice('/polerun/'.length))
    const local = path.join(dist, relative.endsWith('/') ? relative + 'index.html' : relative)
    assert.ok(fs.existsSync(local), `Missing asset or page: ${match[1]}`)
  }
}
const course = fs.readFileSync(path.join(dist, 'course.js'), 'utf8')
assert.ok(course.includes("fetch('/polerun/course-config.json'"))
assert.ok(course.includes("const origin = 'https://www.run2yourstyle.com/polerun'"))
assert.ok(course.includes('get_public_course_share'))
assert.ok(!course.includes('polerun.readybay64.chatgpt.site'))
const config = JSON.parse(fs.readFileSync(path.join(dist, 'course-config.json'), 'utf8'))
const claims = JSON.parse(Buffer.from(config.anonKey.split('.')[1], 'base64url').toString())
assert.equal(claims.role, 'anon')
assert.equal(claims.ref, 'eypglnhhnjmxilvezhrg')
assert.ok(fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8').includes(base + 'privacy/'))
for (const route of ['privacy', 'terms', 'location', 'disclosures']) {
  const html=fs.readFileSync(path.join(dist, route, 'index.html'), 'utf8')
  assert.ok(html.includes(manifest.status==='published'?'정책 안내':'정식 서비스 개시 전 공개 안내'))
  assert.ok(html.includes(`문서 버전: ${manifest.version}`))
  assert.ok(html.includes(`name="polerun-policy-version" content="${manifest.version}"`))
  assert.ok(html.includes(`name="polerun-policy-sha256" content="${manifest.documentHashes[route]}"`))
}
console.log('PoleRun: 7 pages, scoped links/assets, privacy status, public course key and ad-free HTML verified.')
