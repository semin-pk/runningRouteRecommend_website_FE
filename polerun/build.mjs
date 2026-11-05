import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { coursePage } from './course-page.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const dist=path.resolve(root,'../dist/polerun');
const base='https://www.run2yourstyle.com/polerun';
const prefixHtml=html=>html.replace(/(href|src)="\/(?!\/)/g,'$1="/polerun/');
const email='help.polerunapp@gmail.com';
const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
// Search Console values are public ownership proofs, not OAuth credentials.
const verification=JSON.parse(fs.readFileSync(path.join(root,'site-verification.json'),'utf8'));
if(!Array.isArray(verification.google)||verification.google.some(value=>typeof value!=='string'||! /^[A-Za-z0-9_-]{20,200}$/.test(value)))throw new Error('Invalid Google site verification value.');
const verificationMeta=[...new Set(verification.google)].map(value=>`<meta name="google-site-verification" content="${esc(value)}">`).join('');
const documents=[
  {key:'privacy',title:'개인정보처리방침',file:'PRIVACY_POLICY.md'},
  {key:'terms',title:'이용약관',file:'TERMS.md'},
  {key:'location',title:'위치정보 이용약관',file:'LOCATION_TERMS.md'},
  {key:'disclosures',title:'운영·외부 서비스 안내',file:'DISCLOSURES.md'},
];
fs.mkdirSync(dist,{recursive:true});
fs.copyFileSync(path.join(root,'style.css'),path.join(dist,'style.css'));
fs.mkdirSync(path.join(dist,'assets'),{recursive:true});
fs.copyFileSync(path.join(root,'assets/icon.png'),path.join(dist,'assets/icon.png'));
const courseConfig=JSON.parse(fs.readFileSync(path.join(root,'course-config.json'),'utf8'));
if(courseConfig.apiUrl!=='https://eypglnhhnjmxilvezhrg.supabase.co'||typeof courseConfig.anonKey!=='string')throw new Error('Invalid public course endpoint');
const publicRole=JSON.parse(Buffer.from(courseConfig.anonKey.split('.')[1]??'', 'base64url').toString());
if(publicRole.role!=='anon'||publicRole.ref!=='eypglnhhnjmxilvezhrg')throw new Error('Only the public anonymous key may be published');
for(const asset of ['course.js','course.css','course-config.json'])fs.copyFileSync(path.join(root,asset),path.join(dist,asset));
for(const name of fs.readdirSync(path.join(root,'verification-files'))){
  if(!/^google[A-Za-z0-9_-]+\.html$/.test(name))throw new Error('Unexpected verification filename.');
  const file=path.join(root,'verification-files',name);
  if(!fs.lstatSync(file).isFile()||fs.statSync(file).size>4096)throw new Error('Invalid verification file.');
  if(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'').trim()!==`google-site-verification: ${name}`)throw new Error('Verification content does not match filename.');
  fs.copyFileSync(file,path.join(dist,name));
}

function inline(source){
  return esc(source).replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_match,label,url)=>{
    const local=documents.find(doc=>doc.file===url);
    const href=local?`/${local.key}/`:/^(https:\/\/|mailto:)/.test(url)?url:null;
    return href?`<a href="${href}"${href.startsWith('https://')?' rel="noopener noreferrer"':''}>${label}</a>`:label;
  }).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>');
}
function markdown(source){
  let html='',table=[],list=[];
  function flush(){
    if(list.length){html+=`<ul>${list.map(line=>`<li>${inline(line)}</li>`).join('')}</ul>`;list=[];}
    if(table.length){const rows=table.filter(row=>!/^\|[\s|:-]+\|$/.test(row));html+='<div class="table-scroll"><table><thead>'+rows.map((row,index)=>{
      const tag=index?'td':'th';
      return `${index===1?'</thead><tbody>':''}<tr>${row.slice(1,-1).split('|').map(cell=>`<${tag}${index?'':' scope="col"'}>${inline(cell.trim())}</${tag}>`).join('')}</tr>`;
    }).join('')+(rows.length>1?'</tbody>':'</thead>')+'</table></div>';table=[];}
  }
  for(const line of source.split('\n')){
    if(line.trim().startsWith('|')){if(list.length)flush();table.push(line.trim());continue;}
    if(/^\s*- /.test(line)){if(table.length)flush();list.push(line.replace(/^\s*- /,''));continue;}
    flush();if(!line.trim())continue;
    const heading=line.match(/^(#{1,6}) (.*)/);
    if(heading?.[1].length===1)continue;
    html+=heading?`<h${Math.min(heading[1].length,6)}>${inline(heading[2])}</h${Math.min(heading[1].length,6)}>`:`<p>${inline(line)}</p>`;
  }
  flush();return html;
}
const notice=`<aside class="notice" aria-label="정책 시행 안내"><strong>정식 서비스 개시 전 공개 안내</strong>정책은 정식 서비스 개시일부터 시행할 예정입니다. 개시일과 운영자 공시·외부 처리의 세부 사항을 확인한 뒤 안내를 보완합니다. 현재 문서를 시행 중인 최종 정책이나 동의 완료로 표시하지 않습니다.</aside>`;
function page(title,body,current='',description='같은 코스, 더 나은 기록. PoleRun의 러닝 코스·기록 경쟁과 문의·정책을 안내합니다.'){
  const route=current?`/${current}/`:'/';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">${verificationMeta}<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${esc(description)}"><meta name="theme-color" content="#0c120e"><meta name="color-scheme" content="dark"><meta property="og:type" content="website"><meta property="og:site_name" content="PoleRun"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${base}${route}"><meta property="og:image" content="${base}/assets/icon.png"><link rel="canonical" href="${base}${route}"><link rel="icon" type="image/png" href="/assets/icon.png"><link rel="stylesheet" href="/style.css"><title>${esc(title)}${current?' | PoleRun':''}</title></head><body><a class="skip" href="#main">본문 바로가기</a><header class="site-header"><div class="wrap header-row"><a class="brand" href="/" aria-label="PoleRun 홈"><img src="/assets/icon.png" width="38" height="38" alt=""><span>Pole<em>Run</em></span></a><nav class="nav" aria-label="주요 메뉴"><a class="desktop-link" href="/#how">앱 소개</a><a href="/privacy/"${current==='privacy'?' aria-current="page"':''}>개인정보</a><a class="nav-contact" href="/support/"${current==='support'?' aria-current="page"':''}>문의·도움말 <span aria-hidden="true">↗</span></a></nav></div></header><main id="main">${body}</main><footer class="site-footer"><div class="wrap footer-row"><div><nav class="footer-links" aria-label="정책과 지원">${documents.map(doc=>`<a href="/${doc.key}/">${doc.title}</a>`).join('')}<a href="/support/">문의·도움말</a></nav><p>운영자 박세민 · <a href="mailto:${email}">${email}</a></p><p>정식 서비스 출시 준비 중 · 대한민국 · iPhone 우선</p></div><p class="copyright">© 2026 PoleRun</p></div></footer></body></html>`;
}
function write(route,html){const folder=route?path.join(dist,route):dist;fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'index.html'),prefixHtml(html));}
function heading(title,lead,label='POLERUN / GUIDE'){return `<div class="page-heading"><div class="wrap"><a class="back-link" href="/">← PoleRun 홈</a><p class="eyebrow">${label}</p><h1>${title}</h1><p>${lead}</p></div></div>`;}

const track=`<div class="track-art" aria-hidden="true"><span class="art-tag">YOUR NEXT LAP</span><svg viewBox="0 0 480 500" xmlns="http://www.w3.org/2000/svg"><g transform="translate(240 250) rotate(-25) translate(-240 -250)" fill="none"><rect x="85" y="55" width="310" height="390" rx="155" stroke="#3d5032" stroke-width="1.3"/><rect x="96" y="66" width="288" height="368" rx="144" stroke="#435a35" stroke-width="1.3"/><rect x="107" y="77" width="266" height="346" rx="133" stroke="#516a3d" stroke-width="1.3"/><rect x="118" y="88" width="244" height="324" rx="122" stroke="#617e48" stroke-width="1.3"/><rect x="129" y="99" width="222" height="302" rx="111" stroke="#73954c" stroke-width="1.3"/><rect x="140" y="110" width="200" height="280" rx="100" stroke="#8baa58" stroke-width="1.3"/><rect x="151" y="121" width="178" height="258" rx="89" stroke="#cbfa6c" stroke-width="3.3"/><rect x="162" y="132" width="156" height="236" rx="78" stroke="#78984e" stroke-width="1.3"/><path d="M150 250H88" stroke="#d8ecbd" stroke-width="2" stroke-dasharray="3 4"/><path d="M154 252l-5-9m5 9l7-8" stroke="#cbfa6c" stroke-width="2"/><circle cx="329" cy="245" r="9" fill="#cbfa6c" stroke="#162214" stroke-width="4"/><circle cx="328" cy="275" r="5" fill="#f0f5e7" stroke="#162214" stroke-width="3"/><circle cx="315" cy="317" r="5" fill="#789b5b" stroke="#162214" stroke-width="3"/></g><text x="239" y="245" fill="#cbfa6c" text-anchor="middle" font-family="-apple-system,sans-serif" font-size="23" font-weight="800" letter-spacing="-1">YOUR PACE.</text><text x="239" y="269" fill="#d7e2cd" text-anchor="middle" font-family="-apple-system,sans-serif" font-size="12" letter-spacing="3">YOUR NEXT RECORD.</text></svg><span class="art-label">ONE COURSE. A NEW PERSONAL BEST.</span></div>`;
const home=`<section class="wrap hero"><div><span class="pill"><i aria-hidden="true"></i> iPhone · 정식 출시 준비 중</span><h1>같은 코스,<br><span>더 나은 기록.</span></h1><p class="lead">오늘 달릴 코스를 찾고,<br>같은 출발선에서 나의 기록에 도전하세요.</p><div class="actions"><a class="button" href="#how">PoleRun 알아보기 <span aria-hidden="true">↓</span></a><a class="button secondary" href="/support/">문의하기 <span aria-hidden="true">↗</span></a></div><p class="availability">대한민국 · 만 14세 이상 · 무료 러닝 서비스</p></div>${track}</section><section class="section" id="how"><div class="wrap"><div class="section-head"><div><span class="eyebrow">FIND YOUR NEXT RUN</span><h2>달릴 길부터,<br>다음 목표까지.</h2></div><p>코스를 먼저 확인하고, 내 페이스로 달리고,<br>같은 코스의 기록과 비교해 보세요.</p></div><div class="steps"><article><span class="step-num">01 / COURSE</span><h3>오늘의 코스를 고르세요</h3><p>경로·거리·출발점·달리는 방향을 확인하세요. 직접 달리며 나만의 코스를 등록할 수도 있어요.</p></article><article><span class="step-num">02 / RACE</span><h3>기록과 레이스하세요</h3><p>거리·시간·페이스와 코스 진행 상황을 확인하며 달려요. 저장된 다른 러너의 기록을 기준으로 다음 목표에 도전하세요.</p></article><article><span class="step-num">03 / YOUR RECORD</span><h3>나의 러닝을 남기세요</h3><p>완주 결과와 검증 상태·순위를 확인하세요. 기록 사진으로 오늘의 러닝을 공유할 수 있어요.</p></article></div></div></section><section class="privacy-band"><div class="wrap privacy-row"><div><span class="eyebrow">RUN WITH CARE</span><h2>기록은 남기고,<br>소중한 위치는 보호해요.</h2></div><div><p>개인 기록의 공개 경로는 시작과 끝 최소 200m를 보호해요. 공개 코스의 공식 출발·도착 위치는 다른 러너의 도전을 위해 공개되므로, 등록할 때 공개할 장소를 확인해 주세요.</p><a class="text-link" href="/privacy/">개인정보 처리와 공개 범위 알아보기 ↗</a></div></div></section><section class="section"><div class="wrap contact-band"><div><span class="eyebrow">WE'RE HERE TO HELP</span><h2>궁금한 점이 있나요?</h2><p>로그인·코스·러닝 기록에 관한 질문이나 안전·개인정보 신고를 보내주세요. 운영자가 직접 확인합니다.</p></div><a class="button" href="/support/">문의·도움말 보기 <span aria-hidden="true">↗</span></a></div></section>`;
const googleAccountInfo=`<section class="section" aria-labelledby="google-account-info"><div class="wrap privacy-row"><div><span class="eyebrow">GOOGLE SIGN-IN</span><h2 id="google-account-info">Google 로그인 정보,<br>계정 이용에 필요한 만큼.</h2></div><div><p>Google 로그인을 선택하면 계정 식별자·이메일과 제공받은 기본 프로필 정보를 가입·로그인·계정 연결 관리에 사용합니다. Gmail 메일 내용·Drive 파일·주소록 읽기 권한은 요청하지 않습니다.</p><p>Google 계정 데이터의 저장·보호·공유·보관·삭제와 연결 해제 방법은 개인정보처리방침에서 확인할 수 있어요.</p><a class="text-link" href="/privacy/">Google 로그인 개인정보처리방침 보기 ↗</a></div></div></section>`;
write('',page('PoleRun — 같은 코스, 더 나은 기록',home+googleAccountInfo));

const support=`${heading('문의·도움말','PoleRun 이용에 관한 질문과 개인정보 요청을 안내합니다.')}<div class="wrap"><div class="support-lead"><section class="contact-box"><h2>이메일로 문의해 주세요</h2><p><a class="email" href="mailto:${email}">${email}</a></p><a class="button" href="mailto:${email}?subject=PoleRun%20%EB%AC%B8%EC%9D%98">메일 작성하기 <span aria-hidden="true">↗</span></a><p>박세민이 직접 확인합니다. 일반 문의는 영업일 3일 이내 첫 답변을 목표로 하며, 안전·개인정보 신고를 우선 확인합니다.</p></section><h2>어떤 내용을 보내면 되나요?</h2><ul><li>문제가 발생한 시각과 사용한 화면</li><li>기기·iOS 버전·앱 버전</li><li>문제 직전에 했던 동작과 표시된 오류 문구</li></ul><p>비밀번호·인증번호·불필요한 타인의 정보는 보내지 마세요. 문의 버튼은 이메일 작성을 열며, GPS 원본을 자동으로 첨부하지 않습니다. 메일 앱이 열리지 않으면 주소를 복사해 사용하는 메일 서비스에서 보내주세요.</p><h2 style="margin-top:45px">자주 묻는 질문</h2><details><summary>계정을 삭제하려면 어떻게 하나요?</summary><p>앱의 계정 관리 화면에서 ‘회원 탈퇴’를 진행할 수 있습니다. 계정과 본인의 기록·위치·작성 코스가 삭제됩니다. 다른 러너가 작성한 과거 기록은 해당 러너의 ‘삭제된 코스’ 이력으로 남습니다. 소셜 계정이 연결되어 있으면 본인 확인·연결 해제를 진행합니다. 로그인할 수 없다면 위 이메일로 삭제 요청을 보내주세요. 처리에 필요한 최소한의 본인 확인을 거칩니다.</p></details><details><summary>개인정보 열람·정정·삭제를 요청하고 싶어요</summary><p>앱의 계정 관리 → 개인정보 요청에서 접수하거나 위 이메일로 문의할 수 있습니다. 요청을 확인하는 데 필요한 최소한의 정보만 확인하며 법정 처리 기한이 있는 경우 해당 기한을 따릅니다.</p></details><details><summary>거리나 경로가 다른 기기와 다르게 나와요</summary><p>GPS 신호·정확도·기기·주변 환경에 따라 측정값이 달라질 수 있습니다. 기기·앱 버전, 발생 시각, 비교한 거리와 표시 화면을 알려주시면 확인하겠습니다. 원본 GPS 파일은 요청받기 전에 보내지 않아도 됩니다.</p></details><details><summary>위험하거나 부적절한 코스를 발견했어요</summary><p>앱의 신고 기능이나 위 이메일로 코스 이름·위험한 상황을 알려주세요. 러닝 중에는 현장의 안전과 출입 안내를 우선 확인해 주세요.</p></details><h2 style="margin-top:45px">문의 자료 보관</h2><p>문의·신고 내용과 첨부는 처리 완료 후 6개월 보관 후 삭제합니다. Google 내부 삭제·백업 기간 등 별도 기준은 <a href="/privacy/">개인정보처리방침</a>과 <a href="/disclosures/">운영·외부 서비스 안내</a>에서 확인할 수 있습니다.</p></div></div>`;
write('support',page('문의·도움말',support,'support','PoleRun 문의, 신고와 계정 삭제·개인정보 권리 행사 안내. help.polerunapp@gmail.com'));
write('courses',page('함께 달릴 코스',coursePage,'courses','공유받은 PoleRun 코스의 경로·거리·출발·도착 정보를 로그인 없이 확인하세요.').replace('</head>','<meta name="robots" content="noindex,follow"><link rel="stylesheet" href="/course.css"></head>'));
for(const doc of documents){
  const source=fs.readFileSync(path.join(root,'content',doc.file),'utf8');
  const nav=`<aside class="doc-nav" aria-label="정책 문서">${documents.map(item=>`<a href="/${item.key}/"${item.key===doc.key?' aria-current="page"':''}>${item.title}</a>`).join('')}<a href="/support/">문의·도움말</a><small>공개 안내: 2026년 10월 21일<br>문서 버전: 1.0<br>시행 예정: 정식 서비스 개시일</small></aside>`;
  const body=`${heading(doc.title,'수집·이용·공개·보관·삭제와 서비스 이용 기준을 확인하세요.','POLERUN / POLICY')}<div class="wrap doc-layout">${nav}<article class="doc-body">${notice}${markdown(source)}</article></div>`;
  write(doc.key,page(doc.title,body,doc.key,`PoleRun ${doc.title}. 서비스 개시 전 공개 안내이며 정식 서비스 개시일부터 시행할 예정입니다.`));
}
fs.writeFileSync(path.join(dist,'404.html'),prefixHtml(page('페이지를 찾을 수 없어요','<section class="wrap not-found"><span class="eyebrow">404 / NOT FOUND</span><h1>페이지를 찾을 수 없어요</h1><p>주소를 확인하거나 PoleRun 홈으로 이동해 주세요.</p><a class="button" href="/">홈으로 이동하기 →</a></section>')));
const routes=['','privacy','terms','location','disclosures','support'];
fs.writeFileSync(path.join(dist,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
fs.writeFileSync(path.join(dist,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map(route=>`<url><loc>${base}/${route?route+'/':''}</loc><lastmod>2026-11-05</lastmod></url>`).join('')}</urlset>`);
// Package the generated output, not local environment files or app credentials.
for(const route of routes){
  const html=fs.readFileSync(path.join(dist,route,'index.html'),'utf8');
  if(!html.includes('help.polerunapp@gmail.com')||!html.includes('<html lang="ko">'))throw new Error(`Incomplete page: ${route}`);
  if(/SUPABASE_SERVICE_ROLE_KEY|BEGIN PRIVATE KEY|sb_secret_|비공개 검토본/.test(html))throw new Error(`Unexpected private content: ${route}`);
}
console.log('Built 6 public information pages + 404, robots and sitemap. Policy activation remains unchanged.');
console.log('Built live public course sharing page; pending/private/hidden courses are filtered by the server.');

fs.writeFileSync(path.join(dist,'deployment-info.json'),JSON.stringify({
  baseUrl:base+'/', commit:process.env.AWS_COMMIT_ID || process.env.CODEBUILD_RESOLVED_SOURCE_VERSION || null,
  builtAt:new Date().toISOString(), policyActivationChanged:false,
},null,2)+'\n');
