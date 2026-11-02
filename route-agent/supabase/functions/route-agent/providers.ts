import {
  ApiError,
  type Context,
  number,
  type Place,
  record,
  records,
  type Route,
} from "./types.ts";

const KAKAO_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";
export const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const TMAP_URL = "https://apis.openapi.sk.com/transit/routes";

export function requiredKey(ctx: Context, name: string): string {
  const key = ctx.env(name)?.trim();
  if (!key) {
    throw new ApiError(503, `${name}가 설정되지 않았습니다. Supabase Secrets를 확인해주세요.`);
  }
  if (/[^\x21-\x7e]/.test(key)) {
    throw new ApiError(503, `${name} 형식이 올바르지 않습니다. 공백과 줄바꿈을 확인해주세요.`);
  }
  return key;
}

export async function requestJson(
  ctx: Context,
  provider: string,
  url: string,
  init: RequestInit,
  timeoutMs = 20000,
): Promise<Record<string, unknown>> {
  const remaining = ctx.deadline - Date.now();
  if (remaining <= 0 || ctx.signal.aborted) {
    throw new ApiError(504, "경로 계산 시간이 초과됐습니다.");
  }
  const started = Date.now();
  console.info(JSON.stringify({
    provider,
    event: "request",
    method: init.method || "GET",
    url,
    parameters: provider === "T map" ? JSON.parse(String(init.body || "{}")) : undefined,
  }));
  let response: Response;
  try {
    response = await ctx.fetch(url, {
      ...init,
      signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(Math.min(timeoutMs, remaining))]),
    });
  } catch {
    console.warn(
      JSON.stringify({ provider, event: "network_error", elapsed_ms: Date.now() - started }),
    );
    throw new ApiError(504, `${provider} API 응답을 받지 못했습니다. 잠시 후 다시 시도해주세요.`);
  }
  let data: Record<string, unknown>;
  try {
    data = record(await response.json());
  } catch {
    throw new ApiError(502, `${provider} API가 올바른 JSON을 반환하지 않았습니다.`);
  }
  const errorCode = String(record(data.error).code || "");
  console.info(JSON.stringify({
    provider,
    event: "response",
    status: response.status,
    request_id: response.headers.get("x-amzn-requestid") || response.headers.get("x-request-id"),
    elapsed_ms: Date.now() - started,
    error_code: errorCode,
    result_status: record(data.result).status,
    document_count: Array.isArray(data.documents) ? data.documents.length : undefined,
  }));
  if (!response.ok) {
    const reason = response.status === 429
      ? "호출 한도 초과"
      : response.status === 401 || response.status === 403
      ? "인증 또는 API 권한 오류"
      : "호출 오류";
    const status = response.status === 429 ? 429 : 502;
    const safeCode = errorCode.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50);
    throw new ApiError(
      status,
      `${provider} API ${reason}(${response.status}${safeCode ? ` ${safeCode}` : ""}).`,
    );
  }
  return data;
}

export async function kakaoSearch(
  ctx: Context,
  query: string,
  lat: number,
  lng: number,
  nearby = true,
  category = "",
): Promise<Place[]> {
  const params = new URLSearchParams({
    query,
    x: String(lng),
    y: String(lat),
    size: nearby ? "15" : "1",
  });
  if (nearby) {
    params.set("radius", "3000");
    params.set("sort", "distance");
  }
  if (category) params.set("category_group_code", category);
  const key = requiredKey(ctx, "KAKAO_REST_API_KEY");
  const data = await requestJson(ctx, "Kakao", `${KAKAO_URL}?${params}`, {
    headers: { Authorization: `KakaoAK ${key}` },
  }, 15000);
  return records(data.documents).filter((item) =>
    item.x !== undefined && item.y !== undefined &&
    Number.isFinite(Number(item.x)) && Number.isFinite(Number(item.y))
  ).map((item) => ({
    name: String(item.place_name || query),
    address: String(item.road_address_name || item.address_name || ""),
    lat: Number(item.y),
    lng: Number(item.x),
    phone: String(item.phone || ""),
    place_url: String(item.place_url || ""),
    category_name: String(item.category_name || ""),
  }));
}

export function distanceMeters(start: Place, end: Place): number {
  const rad = Math.PI / 180;
  const a = Math.sin((end.lat - start.lat) * rad / 2) ** 2 +
    Math.cos(start.lat * rad) * Math.cos(end.lat * rad) *
      Math.sin((end.lng - start.lng) * rad / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - Math.min(1, a)));
}

function walkingRoute(start: Place, end: Place): Route {
  const distance = Math.round(distanceMeters(start, end));
  const seconds = Math.max(60, Math.ceil(distance / 1.2));
  const legs = [{
    mode: "WALK",
    sectionTime: seconds,
    distance,
    start: { name: start.name, lat: start.lat, lon: start.lng },
    end: { name: end.name, lat: end.lat, lon: end.lng },
  }];
  return {
    mode: "WALK",
    seconds,
    legs,
    estimated: true,
    raw: { mode: "WALK", totalTime: seconds, distance, fallback: "walking", legs },
  };
}

export async function mixedRoute(
  ctx: Context,
  start: Place,
  end: Place,
  departureAt?: number,
): Promise<Route> {
  const cacheKey = JSON.stringify([
    start.lat,
    start.lng,
    end.lat,
    end.lng,
    departureAt === undefined ? null : Math.floor(departureAt / 60000),
  ]);
  let pending = ctx.routeCache.get(cacheKey);
  if (!pending) {
    pending = loadRoute(ctx, start, end, departureAt);
    ctx.routeCache.set(cacheKey, pending);
  }
  return await pending;
}

async function loadRoute(
  ctx: Context,
  start: Place,
  end: Place,
  departureAt?: number,
): Promise<Route> {
  if (distanceMeters(start, end) <= 800) {
    console.info(
      JSON.stringify({
        provider: "walking",
        event: "estimated_route",
        distance: Math.round(distanceMeters(start, end)),
      }),
    );
    return walkingRoute(start, end);
  }
  const body: Record<string, unknown> = {
    startX: String(start.lng),
    startY: String(start.lat),
    endX: String(end.lng),
    endY: String(end.lat),
    lang: 0,
    format: "json",
    count: 1,
  };
  if (departureAt !== undefined) {
    const local = new Date(departureAt + 9 * 3600000);
    body.searchDttm = local.toISOString().replace(/[-:T]/g, "").slice(0, 12);
  }
  const key = requiredKey(ctx, "TMAP_APP_KEY");
  const data = await requestJson(ctx, "T map", TMAP_URL, {
    method: "POST",
    headers: { appKey: key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const result = record(data.result);
  if (number(result.status) === 11 || String(result.message || "").includes("너무 가까움")) {
    return walkingRoute(start, end);
  }
  const itinerary = records(record(record(data.metaData).plan).itineraries)[0];
  const seconds = number(itinerary?.totalTime);
  if (seconds <= 0) {
    throw new ApiError(422, "T map에서 이 구간의 대중교통 경로를 찾지 못했습니다.");
  }
  const legs = records(itinerary.legs);
  const mode = legs.length && legs.every((leg) => leg.mode === "WALK") ? "WALK" : "TRANSIT";
  return {
    mode,
    seconds,
    legs,
    raw: { ...data, mode },
    estimated: false,
  };
}
