import { ApiError, type Context, type Query } from "./types.ts";
import { runPipeline } from "./pipeline.ts";

interface Options {
  env?: (name: string) => string | undefined;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
}

export function parseQuery(value: unknown): Query {
  if (!value || typeof value !== "object") {
    throw new ApiError(422, "요청 본문은 JSON 객체여야 합니다.");
  }
  const body = value as Record<string, unknown>;
  const { user_lat, user_lng } = body;
  if (typeof body.query !== "string" || !body.query.trim() || body.query.length > 2000) {
    throw new ApiError(422, "요청 내용을 1~2000자로 입력해주세요.");
  }
  if (
    typeof user_lat !== "number" || !Number.isFinite(user_lat) || user_lat < -90 || user_lat > 90 ||
    typeof user_lng !== "number" || !Number.isFinite(user_lng) || user_lng < -180 || user_lng > 180
  ) {
    throw new ApiError(422, "올바른 현재 위치 좌표가 필요합니다.");
  }
  return { query: body.query.trim(), user_lat, user_lng };
}

export function createHandler(options: Options = {}): (request: Request) => Promise<Response> {
  const env = options.env || ((name: string) => Deno.env.get(`ROUTE_AGENT_${name}`));
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("Origin");
    const origins = (env("CORS_ORIGINS") ||
      "https://www.run2yourstyle.com,http://localhost:5173,http://127.0.0.1:5173")
      .split(",").map((item) => item.trim()).filter(Boolean);
    const headers = new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      Vary: "Origin",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    });
    if (origin && origins.includes(origin)) headers.set("Access-Control-Allow-Origin", origin);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers });
    if (origin && !origins.includes(origin)) {
      return json({ detail: "허용되지 않은 접속 주소입니다." }, 403);
    }
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const path = new URL(request.url).pathname
      .replace(/^\/functions\/v1(?=\/)/, "").replace(/^\/route-agent(?=\/|$)/, "") || "/";
    if (path === "/health" && request.method === "GET") {
      return json({ status: "ok", runtime: "supabase-edge" });
    }
    if (path !== "/api/query" && path !== "/") {
      return json({ detail: "요청한 경로를 찾을 수 없습니다." }, 404);
    }
    if (request.method !== "POST") {
      headers.set("Allow", "POST, OPTIONS");
      return json({ detail: "POST 요청만 지원합니다." }, 405);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        throw new ApiError(400, "요청 본문이 올바른 JSON이 아닙니다.");
      }
      const query = parseQuery(body);
      const ctx: Context = {
        fetch: options.fetch || globalThis.fetch,
        env,
        now: options.now || Date.now,
        signal: controller.signal,
        deadline: Date.now() + 120000,
        routeCache: new Map(),
      };
      return json(await runPipeline(ctx, query));
    } catch (error) {
      if (error instanceof ApiError) return json({ detail: error.message }, error.status);
      console.error(
        JSON.stringify({
          event: "pipeline_error",
          name: error instanceof Error ? error.name : "unknown",
        }),
      );
      return json({ detail: "경로 계산 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." }, 500);
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }
  };
}
