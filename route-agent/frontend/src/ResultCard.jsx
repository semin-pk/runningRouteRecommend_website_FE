export default function ResultCard({
  cafe,
  stops = [],
  stay_minutes,
  message,
  departure_time,
  planned_stay_minutes,
  arrival_buffer_minutes,
  arrival_time,
}) {
  const plannedStayTime = formatStayTime(planned_stay_minutes || stay_minutes);
  const kakaoMapUrl =
    cafe?.lat && cafe?.lng
      ? `https://map.kakao.com/link/to/${encodeURIComponent(cafe.name || "추천 장소")},${cafe.lat},${cafe.lng}`
      : "";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl shadow-black/20">
      <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4">
        <p className="text-sm font-medium leading-6 text-emerald-100">
          {message || "추천 결과를 준비했습니다."}
        </p>
      </div>

      <div className="mt-5 space-y-5">
        <div>
          <p className="text-xs font-medium uppercase text-zinc-500">
            {stops.length > 1 ? "추천 일정" : "추천 장소"}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-zinc-100">
            {cafe?.name || "추천 장소 없음"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">{cafe?.address || "-"}</p>
        </div>

        {stops.length > 1 && (
          <div className="space-y-2">
            {stops.map((stop, index) => (
              <div
                key={`${stop.place_type}-${stop.place?.name}-${index}`}
                className="rounded-lg border border-zinc-800 bg-zinc-950 p-3"
              >
                <p className="text-xs font-medium text-zinc-500">
                  {index + 1}. {stop.action || stop.place_type}
                </p>
                <p className="mt-1 text-sm font-semibold text-zinc-100">
                  {stop.place?.name || "-"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {stop.arrive_time} 도착 · {formatStayTime(stop.stay_minutes)} 체류
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-xs font-medium text-zinc-500">추천 출발 시간</p>
          <p className="mt-2 text-4xl font-bold text-emerald-300">
            {departure_time || "-"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
            <p className="text-xs font-medium text-zinc-500">계획 체류 시간</p>
            <p className="mt-2 text-xl font-semibold text-zinc-100">
              {plannedStayTime}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
            <p className="text-xs font-medium text-zinc-500">도착 목표</p>
            <p className="mt-2 text-xl font-semibold text-zinc-100">
              {arrival_time || "-"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {arrival_buffer_minutes || 0}분 여유
            </p>
          </div>
        </div>

        <a
          href={kakaoMapUrl || undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!kakaoMapUrl}
          className={`flex w-full items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold transition ${
            kakaoMapUrl
              ? "bg-yellow-300 text-zinc-950 hover:bg-yellow-200"
              : "pointer-events-none bg-zinc-800 text-zinc-500"
          }`}
        >
          카카오맵 길찾기
        </a>
      </div>
    </div>
  );
}

function formatStayTime(minutes = 0) {
  const safeMinutes = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;

  if (hours === 0) {
    return `${mins}분`;
  }

  return `${hours}시간 ${mins}분`;
}
