const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const origin = 'https://www.run2yourstyle.com/polerun';
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search), id = params.get('id') ?? '';
const validId = UUID.test(id) && params.getAll('id').length === 1;
let generation = 0, controller, shareUrl;
const svgNS = 'http://www.w3.org/2000/svg';
function svg(name, attributes = {}, text) {
  const element = document.createElementNS(svgNS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text !== undefined) element.textContent = String(text);
  return element;
}
function routePreview(route, name) {
  const coords = route?.type === 'LineString' && Array.isArray(route.coordinates) ? route.coordinates : [];
  if (coords.length < 2 || coords.length > 20000 || coords.some(p => !Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 85)) throw new Error('route');
  const latitudes = coords.map(p => p[1]), longitudes = coords.map(p => p[0]);
  const north = Math.max(...latitudes), south = Math.min(...latitudes), west = Math.min(...longitudes), east = Math.max(...longitudes);
  const cos = Math.cos((north + south) * Math.PI / 360), width = Math.max((east - west) * cos, 0.000001), height = Math.max(north - south, 0.000001);
  const scale = Math.min(536 / width, 336 / height), ox = (640 - width * scale) / 2, oy = (440 - height * scale) / 2;
  const points = coords.map(([lng, lat]) => [ox + (lng - west) * cos * scale, oy + (north - lat) * scale]);
  const map = $('course-route'); map.replaceChildren(svg('title', { id: 'route-title' }, `${name} 경로, ① 출발점에서 ② 도착점 방향`));
  const defs = svg('defs'), pattern = svg('pattern', { id: 'course-grid', width: 32, height: 32, patternUnits: 'userSpaceOnUse' });
  pattern.append(svg('path', { d: 'M 32 0 L 0 0 0 32', fill: 'none', stroke: '#29382b', 'stroke-width': 1 })); defs.append(pattern); map.append(defs);
  map.append(svg('rect', { width: 640, height: 440, fill: 'url(#course-grid)' }));
  const line = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  map.append(svg('polyline', { points: line, fill: 'none', stroke: '#cbfa6c', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  for (const fraction of [0.27, 0.65]) {
    const index = Math.min(points.length - 2, Math.floor(points.length * fraction)), a = points[index], b = points[index + 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.001) continue;
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    map.append(svg('path', { d: 'M -7 -6 L 1 0 L -7 6', fill: 'none', stroke: '#fff', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', transform: `translate(${a[0]} ${a[1]}) rotate(${angle})` }));
  }
  const first = points[0], last = points.at(-1), shared = Math.hypot(first[0] - last[0], first[1] - last[1]) < 25;
  for (const [p, label, color] of shared ? [[first, '1·2', '#cbfa6c']] : [[first, '1', '#cbfa6c'], [last, '2', '#fff']]) {
    map.append(svg('circle', { cx: p[0], cy: p[1], r: shared ? 20 : 17, fill: color, stroke: '#0c120e', 'stroke-width': 4 }));
    map.append(svg('text', { x: p[0], y: p[1] + 5, fill: '#0c120e', 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 800 }, label));
  }
  const [lng, lat] = coords[0];
  $('course-start-map').href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
}
function state(title, message, retry = false) {
  $('course-content').hidden = true; $('course-state').hidden = false;
  $('state-title').textContent = title; $('state-message').textContent = message; $('retry-course').hidden = !retry;
}
function render(course) {
  if (!course || course.id?.toLowerCase() !== id.toLowerCase() || typeof course.name !== 'string' || !Number.isFinite(course.distanceMeters)) throw new Error('data');
  routePreview(course.route, course.name);
  $('course-title').textContent = course.name; $('course-region').textContent = course.region || '지역 정보 미등록';
  $('course-distance').textContent = `${(course.distanceMeters / 1000).toFixed(2)}km`;
  $('course-difficulty').textContent = ({ EASY: '쉬움', NORMAL: '보통', HARD: '어려움' })[course.difficulty] ?? '정보 없음';
  $('course-duration').textContent = Number.isFinite(course.estimatedDurationMinutes) && course.estimatedDurationMinutes > 0 ? `약 ${Math.round(course.estimatedDurationMinutes)}분` : '페이스에 따라 달라요';
  $('course-description').textContent = course.description?.trim() || '지도에서 코스 경로와 출발·도착 위치를 먼저 확인해 주세요.';
  const tags = $('course-tags'); tags.replaceChildren();
  for (const tag of (Array.isArray(course.tags) ? course.tags : []).filter(t => typeof t === 'string' && t.trim()).slice(0, 8)) {
    const element = document.createElement('span'); element.textContent = `#${tag}`; tags.append(element);
  }
  shareUrl = `${origin}/courses/?id=${id.toLowerCase()}`;
  $('open-course-app').href = `crewjam:///courses/${id.toLowerCase()}`;
  $('course-link').value = shareUrl;
  document.title = `${course.name} | PoleRun`;
  $('course-state').hidden = true; $('course-content').hidden = false;
}
async function loadCourse() {
  const current = ++generation; controller?.abort(); controller = new AbortController();
  const requestController = controller;
  if (!validId) { state('코스 링크를 확인해 주세요', '받은 링크를 다시 열어 주세요. 코스 주소가 올바르지 않아요.'); $('course-root').setAttribute('aria-busy', 'false'); return; }
  state('함께 달릴 코스를 불러오고 있어요', '경로와 출발·도착 정보를 확인하고 있어요.');
  $('course-root').setAttribute('aria-busy', 'true');
  const timer = setTimeout(() => requestController.abort(), 15000);
  try {
    const configResponse = await fetch('/polerun/course-config.json', { signal: requestController.signal, cache: 'no-store', credentials: 'omit' });
    if (!configResponse.ok) throw new Error('config');
    const config = await configResponse.json();
    if (config.apiUrl !== 'https://eypglnhhnjmxilvezhrg.supabase.co' || typeof config.anonKey !== 'string') throw new Error('config');
    const response = await fetch(`${config.apiUrl}/rest/v1/rpc/get_public_course_share`, {
      method: 'POST', headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_course_id: id.toLowerCase() }), signal: requestController.signal, cache: 'no-store', credentials: 'omit',
    });
    if (!response.ok) throw new Error('network');
    const course = await response.json(); if (current !== generation) return;
    if (course === null) { state('지금은 확인할 수 없는 코스예요', '삭제되었거나 아직 공개되지 않은 코스일 수 있어요. 공유한 사람에게 확인해 주세요.', true); return; }
    render(course);
  } catch {
    if (current === generation) state('코스를 불러오지 못했어요', '인터넷 연결을 확인하고 다시 시도해 주세요.', true);
  } finally { clearTimeout(timer); if (current === generation) $('course-root').setAttribute('aria-busy', 'false'); }
}
$('retry-course').addEventListener('click', () => { void loadCourse(); });
$('open-course-app').addEventListener('click', () => { $('share-feedback').textContent = '앱이 열리지 않으면 iPhone에 PoleRun이 설치되어 있는지 확인해 주세요.'; });
$('copy-course').addEventListener('click', async () => {
  if (!shareUrl) return;
  try { await navigator.clipboard.writeText(shareUrl); $('share-feedback').textContent = '코스 링크를 복사했어요. 메시지로 함께 달릴 사람에게 보내보세요.'; }
  catch { $('manual-copy').hidden = false; $('course-link').focus(); $('course-link').select(); $('share-feedback').textContent = '아래 주소를 길게 눌러 복사해 주세요.'; }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void loadCourse(); });
void loadCourse();
