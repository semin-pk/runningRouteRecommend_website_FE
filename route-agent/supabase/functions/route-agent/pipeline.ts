import {
  ApiError,
  type Candidate,
  type Context,
  type Place,
  type Query,
  type Raw,
  record,
  records,
  type Route,
  type StopPlan,
  type Understanding,
} from "./types.ts";
import { kakaoSearch, mixedRoute, OPENAI_URL, requestJson, requiredKey } from "./providers.ts";
import {
  buildResult,
  categoryCode,
  combinations,
  formatTime,
  MINUTE,
  normalizeUnderstanding,
  planTasksToStops,
  routeMinutes,
  schedule,
  searchAnchors,
} from "./planner.ts";

const TASK_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string" },
    purpose: { type: "string" },
    conditions: { type: "array", items: { type: "string" } },
    order: { type: "integer" },
    requested_stay_minutes: {
      type: ["integer", "null"],
      description: "사용자 요청 또는 목적에 맞춘 체류시간 추정. 모르면 null",
    },
    place_type_hint: { type: "string", description: "행동에 필요한 장소 유형 힌트" },
  },
  required: [
    "action",
    "purpose",
    "conditions",
    "order",
    "requested_stay_minutes",
    "place_type_hint",
  ],
  additionalProperties: false,
};

export async function understandingAgent(ctx: Context, query: Query): Promise<Understanding> {
  const key = requiredKey(ctx, "OPENAI_API_KEY");
  const data = await requestJson(ctx, "OpenAI", OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{
        role: "system",
        content: [
          "한국어 일정 요청을 구조화해. 목적지와 약속시간을 추출하고, 출발시간은 사용자가 명시한 경우만 채워.",
          "tasks에는 사용자가 요청한 경유 행동만 말한 순서대로 넣어. 이동/목적지 도착/약속 참석은 task가 아니야.",
          "'오늘 8시까지 일산역에 가야해'는 tasks=[]야. 요청하지 않은 카페, 식당, 대기를 절대 추가하지 마.",
          "'점심 먹고 카페에 있다가'는 점심 먹기와 카페 대기 두 task이고, '꽃 선물을 사서'는 꽃 구매 task야.",
          "search_area는 사용자가 목적지 주변을 명시하면 destination, 현재 위치 주변이면 origin, 그 외에는 route야.",
          "시각은 24시간 HH:MM으로 해석하고, 체류 시간은 사용자 지정 또는 행동별 현실적인 추정값을 사용해.",
          `현재 한국 시각: ${
            new Date(ctx.now() + 9 * 3600000).toISOString().slice(0, 16)
          } (Asia/Seoul).`,
        ].join(" "),
      }, { role: "user", content: query.query }],
      tools: [{
        type: "function",
        function: {
          name: "extract_route_request",
          description: "Extract destination, times, and explicitly requested intermediate actions.",
          parameters: {
            type: "object",
            properties: {
              destination: { type: "string" },
              appointment_time: { type: "string", description: "HH:MM" },
              departure_time: { type: ["string", "null"] },
              search_area: { type: "string", enum: ["route", "destination", "origin"] },
              tasks: { type: "array", maxItems: 3, items: TASK_SCHEMA },
            },
            required: ["destination", "appointment_time", "departure_time", "search_area", "tasks"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "extract_route_request" } },
    }),
  }, 30000);
  const message = record(records(data.choices)[0]?.message);
  const tool = records(message.tool_calls).find((item) =>
    record(item.function).name === "extract_route_request"
  );
  try {
    const args = JSON.parse(String(record(tool?.function).arguments || ""));
    return normalizeUnderstanding(record(args), query);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      502,
      "요청 내용을 해석하지 못했습니다. 목적지와 시간을 명확하게 입력해주세요.",
    );
  }
}

export async function placeAgent(
  ctx: Context,
  understanding: Understanding,
  destination: Place,
): Promise<StopPlan[]> {
  const plans = planTasksToStops(understanding);
  const anchors = searchAnchors(understanding, destination);
  for (const stop of plans) {
    const candidates = new Map<string, Place>();
    const queries = [
      ...new Set([`${stop.place_type} ${stop.task.conditions.join(" ")}`.trim(), stop.place_type]),
    ];
    for (const anchor of anchors) {
      for (const query of queries) {
        const results = await kakaoSearch(
          ctx,
          query,
          anchor.lat,
          anchor.lng,
          true,
          categoryCode(stop.place_type),
        );
        for (const place of results) {
          if (
            stop.place_type === "식당" &&
            /카페|커피|디저트|제과|베이커리|도넛|아이스크림|타르트|과일|주스|간식/.test(
              place.category_name || "",
            )
          ) {
            continue;
          }
          const id = `${place.lat},${place.lng}`;
          if (!candidates.has(id)) candidates.set(id, { ...place, place_type: stop.place_type });
        }
        if (candidates.size >= 3) break;
      }
      if (candidates.size >= 3) break;
    }
    stop.candidates = [...candidates.values()].slice(0, 3);
    if (!stop.candidates.length) {
      throw new ApiError(422, `${stop.action}에 맞는 ${stop.place_type}을 찾지 못했습니다.`);
    }
  }
  return plans;
}

async function refreshScheduled(
  ctx: Context,
  understanding: Understanding,
  plans: StopPlan[],
  origin: Place,
  destination: Place,
  initial: Candidate,
): Promise<Candidate | null> {
  let current = initial;
  for (let attempt = 0; attempt < 3; attempt++) {
    const points = [origin, ...current.places, destination];
    const routes: Route[] = [];
    let cursor = current.departureAt;
    for (let index = 0; index < points.length - 1; index++) {
      const route = await mixedRoute(ctx, points[index], points[index + 1], cursor);
      routes.push(route);
      cursor += (routeMinutes(route) + (current.stays[index] || 0)) * MINUTE;
    }
    const next = schedule(understanding, plans, current.places, routes, ctx.now());
    if (!next) return null;
    if (
      next.departureAt === current.departureAt &&
      next.stays.every((stay, index) => stay === current.stays[index])
    ) {
      return next;
    }
    current = next;
  }
  return null;
}

export async function routeAgent(
  ctx: Context,
  understanding: Understanding,
  plans: StopPlan[],
  destination: Place,
): Promise<Raw> {
  const origin: Place = {
    name: "현재 위치",
    address: "",
    phone: "",
    lat: understanding.user_lat,
    lng: understanding.user_lng,
  };
  const choices = combinations(plans.map((stop) => stop.candidates));
  const candidates: Candidate[] = [];
  let lastError: ApiError | undefined;
  for (const places of choices) {
    const points = [origin, ...places, destination];
    try {
      const routes = await Promise.all(
        points.slice(0, -1).map((point, index) => mixedRoute(ctx, point, points[index + 1])),
      );
      const candidate = schedule(understanding, plans, places, routes, ctx.now());
      if (candidate) candidates.push(candidate);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 422) throw error;
      lastError = error;
    }
  }
  candidates.sort((a, b) => b.departureAt - a.departureAt);
  for (const candidate of candidates) {
    try {
      const scheduled = await refreshScheduled(
        ctx,
        understanding,
        plans,
        origin,
        destination,
        candidate,
      );
      if (scheduled) return buildResult(understanding, plans, scheduled, destination);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 422) throw error;
      lastError = error;
    }
  }
  if (lastError && !candidates.length) throw lastError;
  throw new ApiError(
    422,
    understanding.departure_time
      ? "입력한 출발 시간으로는 이동, 계획 체류 시간과 도착 여유 10분을 확보하기 어렵습니다."
      : "약속 시간에 맞는 일정을 만들지 못했습니다. 출발 시각이 이미 지났거나 경로 시간이 맞지 않습니다.",
  );
}

function fallbackMessage(result: Raw): string {
  const stops = records(result.stops);
  const route = record(result.route);
  const destination = record(route.destination);
  const names = stops.map((stop) => `${record(stop.place).name}에서 ${stop.stay_minutes}분`).join(
    ", ",
  );
  return `${result.departure_time}에 출발해 ${
    names ? `${names} 머문 뒤 ` : ""
  }${destination.name}에 ${result.arrival_time} 도착하는 일정이에요. 약속까지 ${result.actual_arrival_buffer_minutes}분 여유가 있어요.`
    .slice(0, 200);
}

export async function coordinatorAgent(ctx: Context, result: Raw): Promise<string> {
  const fallback = fallbackMessage(result);
  if (ctx.deadline - Date.now() < 12000) return fallback;
  try {
    const data = await requestJson(ctx, "OpenAI", OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requiredKey(ctx, "OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 250,
        messages: [{
          role: "system",
          content:
            "제공된 일정만 친근한 한국어 200자 이내로 요약해. 출발 시각, 경유 행동별 장소 이름과 체류시간, 도착시각과 도착 여유를 포함해. 경유지가 없으면 직행으로 안내해. 식당과 카페를 합치지 말고, 없는 장소/교통편/시간표를 만들지 마. 교통편 시각은 예상이며 실제 열차 시간표로 단정하지 마. 이모지는 쓰지 마.",
        }, {
          role: "user",
          content: JSON.stringify({
            stops: result.stops,
            departure_time: result.departure_time,
            arrival_time: result.arrival_time,
            destination: record(result.route).destination,
            arrival_buffer_minutes: result.actual_arrival_buffer_minutes,
            verified_message: fallback,
          }),
        }],
      }),
    }, 15000);
    const content = record(records(data.choices)[0]?.message).content;
    return typeof content === "string" && content.trim() ? content.trim().slice(0, 200) : fallback;
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    console.warn(JSON.stringify({ event: "coordinator_fallback", reason: error.message }));
    return fallback;
  }
}

export async function runPipeline(ctx: Context, query: Query): Promise<Raw> {
  const understanding = await understandingAgent(ctx, query);
  const destinations = await kakaoSearch(
    ctx,
    understanding.destination,
    query.user_lat,
    query.user_lng,
    false,
  );
  const destination = destinations[0];
  if (!destination) {
    throw new ApiError(422, `목적지를 찾지 못했습니다: ${understanding.destination}`);
  }
  const plans = await placeAgent(ctx, understanding, destination);
  const result = await routeAgent(ctx, understanding, plans, destination);
  result.message = await coordinatorAgent(ctx, result);
  return result;
}
