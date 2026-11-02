import assert from "node:assert/strict";
import { createHandler } from "./handler.ts";
import { appointmentAt, formatTime, normalizeUnderstanding, planTasksToStops } from "./planner.ts";
import { mixedRoute } from "./providers.ts";
import { type Context, type Place, type Raw, record, records } from "./types.ts";

const NOW = Date.parse("2026-11-02T03:00:00Z");
const QUERY = { query: "서울역 16:00 약속", user_lat: 37.5665, user_lng: 126.978 };
const DIRECT = {
  destination: "서울역",
  appointment_time: "16:00",
  departure_time: null,
  search_area: "route",
  tasks: [],
};
const flower = {
  action: "꽃 선물 구매",
  purpose: "꽃 선물",
  conditions: [],
  order: 1,
  requested_stay_minutes: 10,
  place_type_hint: "꽃집",
};
const destination = {
  place_name: "서울역",
  road_address_name: "서울 중구 한강대로 405",
  x: "126.9707",
  y: "37.5541",
};

function fixture(understanding: Raw = DIRECT, transitStatus = 200, tooClose = false) {
  const calls: { url: URL; body: Raw; headers: Headers }[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const body = init?.body ? record(JSON.parse(String(init.body))) : {};
    calls.push({ url, body, headers: new Headers(init?.headers) });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (url.hostname === "api.openai.com") {
      if (body.tools) {
        return json({
          choices: [{
            message: {
              tool_calls: [{
                function: {
                  name: "extract_route_request",
                  arguments: JSON.stringify(understanding),
                },
              }],
            },
          }],
        });
      }
      return json({
        choices: [{ message: { content: "검증된 장소 순서와 시간에 맞춘 일정이에요." } }],
      });
    }
    if (url.hostname === "dapi.kakao.com") {
      const query = url.searchParams.get("query") || "";
      if (query === "서울역") return json({ documents: [destination] });
      const place = query.startsWith("꽃집")
        ? { place_name: "테스트 꽃집", x: "126.9781", y: "37.5666" }
        : query.startsWith("식당")
        ? { place_name: "테스트 식당", x: "126.972", y: "37.555" }
        : { place_name: "테스트 카페", x: "126.9725", y: "37.5555" };
      const documents = [{ ...place, address_name: "테스트 주소" }];
      if (query.startsWith("식당")) {
        return json({
          documents: [
            {
              ...place,
              place_name: "식사 후보가 아닌 간식점",
              category_name: "음식점 > 간식",
              x: "126.9711",
              y: "37.555",
            },
            {
              ...place,
              place_name: "식사 후보가 아닌 제과점",
              category_name: "음식점 > 간식 > 제과,베이커리",
              x: "126.971",
              y: "37.555",
            },
            ...documents,
          ],
        });
      }
      return json({ documents });
    }
    if (url.hostname === "apis.openapi.sk.com") {
      if (transitStatus !== 200) return json({ error: { code: "QUOTA_EXCEEDED" } }, transitStatus);
      if (tooClose) {
        return json({ result: { status: 11, message: "출발지와 도착지가 너무 가까움" } });
      }
      return json({
        metaData: {
          plan: {
            itineraries: [{
              totalTime: 1200,
              legs: [
                {
                  mode: "WALK",
                  sectionTime: 300,
                  start: { name: "출발지" },
                  end: { name: "탑승역" },
                },
                {
                  mode: "SUBWAY",
                  sectionTime: 600,
                  route: "경의중앙선",
                  start: { name: "탑승역" },
                  end: { name: "하차역" },
                },
                {
                  mode: "WALK",
                  sectionTime: 300,
                  start: { name: "하차역" },
                  end: { name: "목적지" },
                },
              ],
            }],
          },
        },
      });
    }
    throw new Error(`Unexpected provider: ${url.hostname}`);
  };
  const env = (name: string) =>
    name === "CORS_ORIGINS" ? "https://www.run2yourstyle.com" : "test-key";
  const handler = createHandler({ env, fetch: fakeFetch, now: () => NOW });
  const invoke = (body: unknown = QUERY) =>
    handler(
      new Request("https://project.supabase.co/functions/v1/route-agent/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://www.run2yourstyle.com" },
        body: JSON.stringify(body),
      }),
    );
  return { calls, fakeFetch, handler, invoke, env };
}

Deno.test("destination-only request has no invented stop and keeps compatible response fields", async () => {
  const { invoke, calls } = fixture();
  const response = await invoke();
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.stops, []);
  assert.deepEqual(result.cafe, {});
  assert.deepEqual(result.timeline.map((item: Raw) => item.type), ["start", "travel", "arrival"]);
  assert.equal(result.total_travel_minutes, 20);
  assert.equal(result.departure_time, "15:30");
  assert.equal(result.arrival_time, "15:50");
  assert.equal(result.cafe_depart_time, "");
  assert.equal(calls.filter((item) => item.url.hostname === "dapi.kakao.com").length, 1);
  assert(calls.some((item) => item.body.searchDttm === "202611021530"));
  const details = result.timeline[1].details;
  assert.equal(details[1].line_name, "경의중앙선");
  assert.equal(details[1].start_time, "15:35");
  assert.equal(details[1].time_type, "estimated");
});

Deno.test("flower stop combines nearby WALK and TRANSIT with an automatically calculated departure", async () => {
  const { invoke } = fixture({ ...DIRECT, tasks: [flower] });
  const response = await invoke();
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.stops.length, 1);
  assert.equal(result.stops[0].place_type, "꽃집");
  assert.equal(result.stay_minutes, 10);
  assert.deepEqual(
    result.timeline.filter((item: Raw) => item.type === "travel").map((item: Raw) => item.mode),
    ["WALK", "TRANSIT"],
  );
  assert.equal(result.cafe_arrive_time, result.stops[0].arrive_time);
  assert.equal(result.cafe_depart_time, result.stops[0].depart_time);
  assert.equal(result.arrival_time, "15:50");
  assert.equal(result.total_stay_minutes, 10);
});

Deno.test("destination-near lunch and cafe remain separate ordered stops", async () => {
  const { invoke, calls } = fixture({
    ...DIRECT,
    search_area: "destination",
    tasks: [
      { action: "점심 먹기", purpose: "식사", order: 1, requested_stay_minutes: 45 },
      { action: "카페 대기", purpose: "대기", order: 2, requested_stay_minutes: 30 },
    ],
  });
  const response = await invoke();
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.stops.map((stop: Raw) => stop.place_type), ["식당", "카페"]);
  assert.equal(result.total_stay_minutes, 75);
  assert.equal(result.stops[0].place.name, "테스트 식당");
  assert.equal(result.cafe.name, "테스트 카페");
  assert.equal(result.timeline.length, 7);
  const searches = calls.filter((item) =>
    item.url.hostname === "dapi.kakao.com" && item.url.searchParams.get("query") !== "서울역"
  );
  assert(
    searches.every((item) =>
      item.url.searchParams.get("x") === destination.x &&
      item.url.searchParams.get("y") === destination.y
    ),
  );
});

Deno.test("an impossible user departure returns a reason without inventing a recommendation", async () => {
  const { invoke } = fixture({ ...DIRECT, departure_time: "15:40", tasks: [flower] });
  const response = await invoke();
  assert.equal(response.status, 422);
  const result = await response.json();
  assert.match(result.detail, /출발 시간/);
  assert.equal(result.departure_time, undefined);
  assert.equal(result.cafe, undefined);
});

Deno.test("T map 429 is propagated without invented departure times", async () => {
  const { invoke } = fixture(DIRECT, 429);
  const response = await invoke();
  assert.equal(response.status, 429);
  assert.match((await response.json()).detail, /T map API 호출 한도 초과\(429/);
});

Deno.test("T map too-close status remains WALK, never relabeled TRANSIT", async () => {
  const { invoke } = fixture(DIRECT, 200, true);
  const response = await invoke();
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.timeline[1].mode, "WALK");
  assert.match(result.timeline[1].details[0].summary, /거리 기반 추정/);
});

Deno.test("identical route lookups share one in-flight provider request per invocation", async () => {
  const { fakeFetch, calls, env } = fixture();
  const ctx: Context = {
    fetch: fakeFetch,
    env,
    now: () => NOW,
    deadline: Date.now() + 120000,
    signal: new AbortController().signal,
    routeCache: new Map(),
  };
  const start: Place = { name: "현재 위치", address: "", phone: "", lat: 37.5665, lng: 126.978 };
  const end: Place = {
    name: "서울역",
    address: "",
    phone: "",
    lat: Number(destination.y),
    lng: Number(destination.x),
  };
  await Promise.all([mixedRoute(ctx, start, end), mixedRoute(ctx, start, end)]);
  assert.equal(calls.length, 1);
});

Deno.test("invalid requests and missing secrets fail before any provider call; health and CORS work", async () => {
  let called = false;
  const handler = createHandler({
    env: () => undefined,
    fetch: () => {
      called = true;
      throw new Error("No network permitted");
    },
    now: () => NOW,
  });
  const health = await handler(new Request("https://local/route-agent/health"));
  assert.equal(health.status, 200);
  const options = await handler(
    new Request("https://local/route-agent/api/query", {
      method: "OPTIONS",
      headers: { Origin: "https://www.run2yourstyle.com" },
    }),
  );
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("Access-Control-Allow-Origin"), "https://www.run2yourstyle.com");
  const denied = await handler(
    new Request("https://local/route-agent/health", {
      headers: { Origin: "https://unrelated.example" },
    }),
  );
  assert.equal(denied.status, 403);
  for (
    const body of [{ ...QUERY, user_lat: 100 }, { ...QUERY, query: "" }, {
      ...QUERY,
      user_lng: "126.97",
    }]
  ) {
    const response = await handler(
      new Request("https://local/api/query", { method: "POST", body: JSON.stringify(body) }),
    );
    assert.equal(response.status, 422);
  }
  const missing = await handler(
    new Request("https://local/api/query", { method: "POST", body: JSON.stringify(QUERY) }),
  );
  assert.equal(missing.status, 503);
  assert.match((await missing.json()).detail, /OPENAI_API_KEY/);
  assert.equal(called, false);
});

Deno.test("KST next-day schedules and invalid GPT stay estimates use deterministic fallbacks", () => {
  const at = appointmentAt("00:10", Date.parse("2026-11-02T14:50:00Z"));
  assert.equal(new Date(at).toISOString(), "2026-11-02T15:10:00.000Z");
  assert.equal(formatTime(at), "00:10");
  const understanding = normalizeUnderstanding({
    ...DIRECT,
    tasks: [{ ...flower, requested_stay_minutes: -50 }],
  }, QUERY);
  assert.equal(planTasksToStops(understanding)[0].stay_minutes, 10);
  const direct = normalizeUnderstanding({
    ...DIRECT,
    tasks: [{ action: "약속 장소 도착", purpose: "약속 참석" }],
  }, QUERY);
  assert.deepEqual(direct.tasks, []);
});

Deno.test("a dessert action uses its cafe hint instead of being forced into a restaurant", () => {
  const understanding = normalizeUnderstanding({
    ...DIRECT,
    tasks: [{ action: "케이크 먹기", purpose: "디저트", place_type_hint: "카페" }],
  }, QUERY);
  assert.equal(planTasksToStops(understanding)[0].place_type, "카페");
  assert.equal(planTasksToStops(understanding)[0].stay_minutes, 30);
});
