export default function Timeline({
  timeline = [],
  departNow,
  toCafeMinutes,
  cafeArriveTime,
  stayMinutes,
  cafeDepartTime,
  toDestMinutes,
  arrivalTime,
  bufferMinutes,
}) {
  if (timeline.length > 0) {
    return <DynamicTimeline timeline={timeline} bufferMinutes={bufferMinutes} />;
  }

  const stayLabel = formatDuration(stayMinutes);
  const stayFill = `${Math.min(100, Math.max(12, (Number(stayMinutes) / 120) * 100 || 12))}%`;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl shadow-black/20">
      <h2 className="text-lg font-semibold text-zinc-100">이동 타임라인</h2>

      <div className="mt-5">
        <TimelineNode
          color="bg-sky-400"
          time={departNow ? "지금 출발" : "출발"}
          title="현재 위치"
          sideText={`이동 ${toCafeMinutes || 0}분`}
        />

        <DottedLine />

        <TimelineNode
          color="bg-emerald-400"
          time={cafeArriveTime || "-"}
          title="카페 도착"
        />

        <div className="grid grid-cols-[24px_1fr] gap-4">
          <div className="mx-auto h-16 border-l border-dashed border-zinc-700" />
          <div className="flex items-center gap-3">
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-400"
                style={{ width: stayFill }}
              />
            </div>
            <span className="shrink-0 text-sm font-medium text-emerald-200">
              {stayLabel} 체류
            </span>
          </div>
        </div>

        <TimelineNode
          color="bg-emerald-400"
          time={cafeDepartTime || "-"}
          title="카페 출발"
          sideText={`이동 ${toDestMinutes || 0}분`}
        />

        <DottedLine />

        <TimelineNode
          color="bg-violet-400"
          time={arrivalTime || "-"}
          title="약속 도착"
          description={`(${bufferMinutes || 0}분 여유)`}
        />
      </div>
    </div>
  );
}

function DynamicTimeline({ timeline, bufferMinutes }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl shadow-black/20">
      <h2 className="text-lg font-semibold text-zinc-100">이동 타임라인</h2>
      <div className="mt-5">
        {timeline.map((item, index) => (
          <div key={`${item.type}-${item.label}-${index}`}>
            {item.type === "travel" ? (
              <TravelLine item={item} />
            ) : (
              <TimelineNode
                color={nodeColor(item.type)}
                time={item.time || item.depart_time || "-"}
                title={nodeTitle(item)}
                description={nodeDescription(item, bufferMinutes)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TravelLine({ item }) {
  const modeLabel = item.mode === "WALK" ? "도보" : "대중교통";
  const details = item.details || [];

  return (
    <div className="grid grid-cols-[24px_1fr] gap-4">
      <div className="mx-auto h-12 border-l border-dashed border-zinc-700" />
      <div className="py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-zinc-500">{item.label}</p>
          <div className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-xs font-medium text-zinc-300">
            {modeLabel} {item.duration_minutes || 0}분
          </div>
        </div>

        {details.length > 0 && (
          <div className="mt-3 space-y-2">
            {details.map((detail, index) => (
              <div
                key={`${detail.mode}-${detail.line_name}-${index}`}
                className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={detailBadgeClass(detail.mode)}>
                    {detail.mode_label}
                  </span>
                  {detail.line_name && (
                    <span className="text-sm font-semibold text-zinc-100">
                      {detail.line_name}
                    </span>
                  )}
                  <span className="text-xs text-zinc-500">
                    {detail.time_type === "estimated" ? "예상 " : ""}
                    {detail.start_time} - {detail.end_time}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {detail.duration_minutes || 0}분
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-zinc-400">
                  {detail.summary}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function detailBadgeClass(mode) {
  const base = "rounded-full px-2 py-0.5 text-xs font-semibold";
  if (mode === "SUBWAY" || mode === "RAIL" || mode === "TRAIN") {
    return `${base} bg-violet-400/15 text-violet-200`;
  }
  if (mode === "BUS") {
    return `${base} bg-sky-400/15 text-sky-200`;
  }
  if (mode === "WALK") {
    return `${base} bg-emerald-400/15 text-emerald-200`;
  }
  return `${base} bg-zinc-700 text-zinc-200`;
}

function TimelineNode({ color, time, title, description, sideText }) {
  return (
    <div className="grid grid-cols-[24px_1fr_auto] items-start gap-4">
      <div className={`mt-1 h-4 w-4 rounded-full ${color} ring-4 ring-zinc-900`} />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-100">{time}</p>
        <p className="mt-1 text-sm text-zinc-400">{title}</p>
        {description && <p className="mt-1 text-xs text-zinc-500">{description}</p>}
      </div>
      {sideText && (
        <div className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-xs font-medium text-zinc-300">
          {sideText}
        </div>
      )}
    </div>
  );
}

function nodeColor(type) {
  if (type === "start") {
    return "bg-sky-400";
  }
  if (type === "arrival") {
    return "bg-violet-400";
  }
  return "bg-emerald-400";
}

function nodeTitle(item) {
  if (item.type === "start") {
    return item.place?.name || "현재 위치";
  }
  if (item.type === "arrival") {
    return `${item.place?.name || "약속 장소"} 도착`;
  }
  return `${item.place?.name || item.label} · ${item.label}`;
}

function nodeDescription(item, bufferMinutes) {
  if (item.type === "arrival") {
    return `(${item.duration_minutes ?? bufferMinutes ?? 0}분 여유)`;
  }
  if (item.type === "stop") {
    return `${item.depart_time || "-"} 출발 · ${formatDuration(item.duration_minutes)} 체류`;
  }
  return "";
}

function DottedLine() {
  return (
    <div className="grid grid-cols-[24px_1fr] gap-4">
      <div className="mx-auto h-10 border-l border-dashed border-zinc-700" />
      <div />
    </div>
  );
}

function formatDuration(minutes = 0) {
  const safeMinutes = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;

  if (hours === 0) {
    return `${mins}분`;
  }

  return `${hours}시간 ${mins}분`;
}
