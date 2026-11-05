export const coursePage = `<section class="wrap course-page" id="course-root" aria-busy="true">
  <a class="back-link" href="/">← PoleRun 홈</a>
  <p class="eyebrow">ONE COURSE. RUN TOGETHER.</p>
  <div id="course-state" class="course-state" role="status" aria-live="polite">
    <h1 id="state-title">함께 달릴 코스를 불러오고 있어요</h1>
    <p id="state-message">경로와 출발·도착 정보를 확인하고 있어요.</p>
    <button id="retry-course" class="button secondary" type="button" hidden>다시 불러오기</button>
  </div>
  <article id="course-content" hidden>
    <header class="course-heading"><span class="pill">공개 러닝 코스</span><h1 id="course-title"></h1><p id="course-region"></p></header>
    <div class="course-layout">
      <figure class="course-map"><svg id="course-route" viewBox="0 0 640 440" role="img" aria-labelledby="route-title"></svg>
        <figcaption><strong>① 출발</strong><span>② 도착 · 화살표는 달리는 방향</span></figcaption><p>실제 좌표로 그린 경로 미리보기예요. 주변 지형은 출발점 지도에서 확인하세요.</p></figure>
      <div class="course-info"><dl class="course-metrics"><div><dt>코스 거리</dt><dd id="course-distance"></dd></div><div><dt>난이도</dt><dd id="course-difficulty"></dd></div><div><dt>예상 시간</dt><dd id="course-duration"></dd></div></dl>
        <div id="course-tags" class="course-tags"></div>
        <div class="course-actions"><a id="open-course-app" class="button" href="#">PoleRun 앱에서 열기 ↗</a><button id="copy-course" class="button secondary" type="button">코스 링크 복사</button></div>
        <p class="course-caption">iPhone에 PoleRun이 설치되어 있다면 앱에서 코스를 열 수 있어요. 앱이 없어도 이 페이지에서 코스 정보를 확인할 수 있어요.</p>
        <p id="share-feedback" class="course-caption" role="status" aria-live="polite"></p>
        <div id="manual-copy" hidden><label for="course-link">길게 눌러 링크를 복사하세요</label><input id="course-link" type="text" readonly></div>
      </div>
    </div>
    <section class="course-about"><h2>어떤 길인가요?</h2><p id="course-description"></p>
      <a id="course-start-map" class="text-link" href="#" target="_blank" rel="noopener noreferrer">출발점 지도 보기 ↗</a>
      <p class="course-caption">거리와 경로는 등록된 코스를 기준으로 해요. 공사·기상·출입 제한과 현장 표지를 확인하고 보행 가능한 길을 이용하세요.</p>
    </section>
  </article>
  <noscript><p>코스 정보를 보려면 브라우저의 JavaScript를 켜 주세요.</p></noscript>
</section><script type="module" src="/course.js"></script>`;
