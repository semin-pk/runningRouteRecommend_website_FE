import json
import logging
import math
import os
from itertools import product
from datetime import datetime, timedelta
from typing import Any, Optional
from zoneinfo import ZoneInfo

import httpx


OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
KAKAO_KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
TMAP_TRANSIT_URL = "https://apis.openapi.sk.com/transit/routes"
WALKING_ROUTE_THRESHOLD_METERS = 800
WALKING_METERS_PER_SECOND = 1.2
logger = logging.getLogger(__name__)


class APIConfigurationError(RuntimeError):
    pass


def _required_api_key(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if not value:
        raise APIConfigurationError(
            f"{name}가 설정되지 않았습니다. backend/.env에 실제 API 키를 입력한 뒤 백엔드를 재시작해주세요."
        )
    if not value.isascii() or any(char.isspace() or not char.isprintable() for char in value):
        raise APIConfigurationError(
            f"{name} 형식이 올바르지 않습니다. API 키의 공백, 줄바꿈, 잘못된 문자를 확인해주세요."
        )
    return value


async def understanding_agent(query: str, user_lat: float, user_lng: float) -> dict:
    api_key = _required_api_key("OPENAI_API_KEY")
    function_schema = {
        "type": "function",
        "function": {
            "name": "extract_route_request",
            "description": "Extract route planning requirements from a Korean natural language query.",
            "parameters": {
                "type": "object",
                "properties": {
                    "destination": {"type": "string", "description": "목적지"},
                    "appointment_time": {"type": "string", "description": "약속 시간. 예: 16:00"},
                    "place_type": {"type": "string", "description": "장소 유형. 예: 카페"},
                    "conditions": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "필요 조건 목록",
                    },
                    "tasks": {
                        "type": "array",
                        "description": "사용자가 약속 전 수행하려는 행동 목록. 말한 순서를 유지.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "action": {"type": "string", "description": "행동. 예: 점심 먹기"},
                                "purpose": {"type": "string", "description": "목적. 예: 식사, 대기, 선물 구매"},
                                "conditions": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "행동별 조건",
                                },
                                "order": {"type": "integer", "description": "수행 순서. 1부터 시작."},
                                "requested_stay_minutes": {
                                    "type": "integer",
                                    "description": "사용자가 말했거나 행동에 필요한 체류 시간 추정값",
                                },
                            },
                            "required": ["action", "purpose", "conditions", "order"],
                            "additionalProperties": False,
                        },
                    },
                    "purpose": {
                        "type": "string",
                        "description": "경유지에서 하려는 일. 예: 꽃 선물 구매, 카페 대기",
                    },
                    "min_stay_minutes": {
                        "type": "integer",
                        "description": "경유지에서 필요한 최소 체류 시간. 카페 대기는 30, 간단한 구매는 10 정도.",
                    },
                    "departure_time": {
                        "anyOf": [{"type": "string"}, {"type": "null"}],
                        "description": "사용자가 말한 출발 시간. 없으면 null. 예: 15:10",
                    },
                    "planned_stay_minutes": {
                        "type": "integer",
                        "description": "장소 유형과 목적에 맞는 권장 체류 시간. 예: 꽃집 10, 카페 30.",
                    },
                    "arrival_buffer_minutes": {
                        "type": "integer",
                        "description": "약속 장소 도착 여유 시간. 기본 10.",
                    },
                    "user_lat": {"type": "number"},
                    "user_lng": {"type": "number"},
                },
                "required": [
                    "destination",
                    "appointment_time",
                    "place_type",
                    "conditions",
                    "user_lat",
                    "user_lng",
                ],
                "additionalProperties": False,
            },
        },
    }
    payload = {
        "model": "gpt-4o",
        "messages": [
            {
                "role": "system",
                "content": (
                    "사용자의 경로 설정 요청에서 필요한 정보를 JSON으로 정확히 추출해. "
                    "약속 전 해야 할 일을 tasks 배열로 분리하고, 사용자가 말한 순서를 보존해. "
                    "목적지로 바로 이동하거나 도착해야 한다는 말만 있고 중간에 할 일이 없으면 tasks는 빈 배열로 둬. "
                    "목적지 이동, 목적지 도착, 약속 참석은 경유 task가 아니야. "
                    "예를 들어 '점심 먹고 카페에 있다가'는 '점심 먹기', '카페 대기' 두 task로 분리해. "
                    "place_type은 사용자가 들러야 하는 장소 유형으로 추론해. "
                    "departure_time은 사용자가 출발 시간을 명시한 경우에만 채우고, 없으면 null로 둬. "
                    "planned_stay_minutes는 장소 유형과 목적에 맞는 권장 체류 시간으로 추정해. "
                    "arrival_buffer_minutes는 별도 언급이 없으면 10으로 둬. "
                    "예를 들어 '꽃 선물을 사서'는 place_type을 '꽃집'으로, "
                    "'커피 마시며 기다려'는 '카페'로 추론해."
                ),
            },
            {
                "role": "user",
                "content": f"query: {query}\nuser_lat: {user_lat}\nuser_lng: {user_lng}",
            },
        ],
        "tools": [function_schema],
        "tool_choice": {
            "type": "function",
            "function": {"name": "extract_route_request"},
        },
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            OPENAI_CHAT_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        response.raise_for_status()

    message = response.json()["choices"][0]["message"]
    arguments = message["tool_calls"][0]["function"]["arguments"]
    result = json.loads(arguments)
    result["user_lat"] = float(result.get("user_lat", user_lat))
    result["user_lng"] = float(result.get("user_lng", user_lng))
    result["conditions"] = result.get("conditions") or []
    result["purpose"] = result.get("purpose") or result.get("place_type", "")
    result["tasks"] = _normalize_tasks(result)
    result["min_stay_minutes"] = int(
        result.get("min_stay_minutes") or _default_min_stay_minutes(result)
    )
    result["departure_time"] = _normalize_optional_time(result.get("departure_time"))
    result["planned_stay_minutes"] = _normalize_stay_minutes(
        result.get("planned_stay_minutes"),
        result,
    )
    result["arrival_buffer_minutes"] = _normalize_buffer_minutes(
        result.get("arrival_buffer_minutes")
    )
    return result


async def place_agent(conditions: dict, destination_place: Optional[dict] = None) -> list[dict]:
    api_key = _required_api_key("KAKAO_REST_API_KEY")
    stops = plan_tasks_to_stops(conditions)
    anchors = _route_search_anchors(
        conditions["user_lat"],
        conditions["user_lng"],
        destination_place or {},
    )

    async with httpx.AsyncClient(timeout=15) as client:
        for stop in stops:
            candidates_by_id = {}
            search_queries = _stop_search_queries(stop)
            for anchor in anchors:
                for search_query in search_queries:
                    params = {
                        "query": search_query,
                        "x": anchor["lng"],
                        "y": anchor["lat"],
                        "radius": 3000,
                        "sort": "distance",
                    }
                    category_code = _kakao_category_code(stop["place_type"])
                    if category_code:
                        params["category_group_code"] = category_code

                    _log_api_request("Kakao keyword search", "GET", KAKAO_KEYWORD_URL, params=params)
                    response = await client.get(
                        KAKAO_KEYWORD_URL,
                        headers={"Authorization": f"KakaoAK {api_key}"},
                        params=params,
                    )
                    _log_api_response("Kakao keyword search", response)
                    response.raise_for_status()
                    documents = response.json().get("documents", [])
                    logger.info(
                        "Kakao keyword search documents: stop=%r query=%r anchor=%s count=%s",
                        stop.get("action"),
                        search_query,
                        anchor.get("label"),
                        len(documents),
                    )
                    for item in documents:
                        place_id = item.get("id") or f"{item.get('x')},{item.get('y')}"
                        if place_id in candidates_by_id:
                            continue
                        candidates_by_id[place_id] = {
                            "name": item.get("place_name", ""),
                            "address": item.get("road_address_name") or item.get("address_name", ""),
                            "lat": float(item["y"]),
                            "lng": float(item["x"]),
                            "phone": item.get("phone", ""),
                            "place_type": stop["place_type"],
                            "place_url": item.get("place_url", ""),
                        }
                    if len(candidates_by_id) >= 3:
                        break
                if len(candidates_by_id) >= 3:
                    break
            stop["candidates"] = list(candidates_by_id.values())[:3]
            logger.info(
                "Stop candidates selected: action=%r place_type=%r count=%s",
                stop.get("action"),
                stop.get("place_type"),
                len(stop["candidates"]),
            )
    return stops


async def route_agent(
    user_lat: float,
    user_lng: float,
    places: list,
    destination: str,
    appointment_time: str,
    min_stay_minutes: int = 30,
    departure_time: Optional[str] = None,
    planned_stay_minutes: Optional[int] = None,
    arrival_buffer_minutes: int = 10,
    destination_place: Optional[dict] = None,
) -> dict:
    planned_stops = _ensure_planned_stops(places)
    dest = destination_place or await _find_place(destination, user_lat, user_lng)
    appointment_at = _appointment_datetime(appointment_time)
    arrival_buffer_minutes = _normalize_buffer_minutes(arrival_buffer_minutes)
    arrival_at = appointment_at - timedelta(minutes=arrival_buffer_minutes)
    user_departure_at = (
        _time_on_schedule_date(departure_time, appointment_at)
        if departure_time
        else None
    )
    best_result = None
    fatal_route_error = ""
    candidate_lists = [stop.get("candidates", [])[:3] for stop in planned_stops[:3]]

    if not planned_stops:
        return await _direct_route_result(
            user_lat,
            user_lng,
            dest,
            appointment_at,
            arrival_at,
            user_departure_at,
            arrival_buffer_minutes,
        )
    if any(not candidates for candidates in candidate_lists):
        return _empty_route_result(dest, planned_stops, 0, arrival_buffer_minutes, "조건에 맞는 경유지를 찾지 못했습니다.")

    for combination in product(*candidate_lists):
        try:
            segment_routes = []
            previous = {"lat": user_lat, "lng": user_lng, "name": "현재 위치"}
            for place in combination:
                segment_routes.append(
                    await _mixed_route(previous["lng"], previous["lat"], place["lng"], place["lat"])
                )
                previous = place
            segment_routes.append(
                await _mixed_route(previous["lng"], previous["lat"], dest["lng"], dest["lat"])
            )
        except httpx.HTTPError as exc:
            route_error = _route_error_message(exc)
            logger.info(
                "Skipping stop combination due to route API error: places=%s error=%s",
                [place.get("name") for place in combination],
                route_error,
            )
            if "429" in route_error or "QUOTA_EXCEEDED" in route_error:
                fatal_route_error = route_error
                break
            continue

        segment_minutes = [_route_minutes(route) for route in segment_routes]
        if any(minutes == 0 for minutes in segment_minutes):
            logger.info(
                "Skipping stop combination due to empty route minutes: places=%s segment_minutes=%s",
                [place.get("name") for place in combination],
                segment_minutes,
            )
            continue

        stop_stay_minutes = [
            _normalize_stay_minutes(
                stop.get("stay_minutes") or stop.get("requested_stay_minutes"),
                stop,
            )
            for stop in planned_stops[:3]
        ]
        travel_minutes = sum(segment_minutes)
        total_stay_minutes = sum(stop_stay_minutes)
        if user_departure_at:
            departure_at = user_departure_at
            available_stay_minutes = math.floor(
                (arrival_at - departure_at).total_seconds() / 60
            ) - travel_minutes
            if available_stay_minutes < total_stay_minutes:
                logger.info(
                    "Skipping stop combination due to insufficient stay time: places=%s available=%s required=%s",
                    [place.get("name") for place in combination],
                    available_stay_minutes,
                    total_stay_minutes,
                )
                continue
            stop_stay_minutes[-1] += available_stay_minutes - total_stay_minutes
        else:
            departure_at = arrival_at - timedelta(
                minutes=travel_minutes + total_stay_minutes
            )
            if departure_at <= datetime.now(ZoneInfo("Asia/Seoul")):
                logger.info(
                    "Skipping stop combination because recommended departure is in the past: places=%s departure_time=%s",
                    [place.get("name") for place in combination],
                    _format_time(departure_at),
                )
                continue

        planned_stop_results = _build_stop_results(
            planned_stops[:3],
            combination,
            segment_minutes,
            stop_stay_minutes,
            departure_at,
        )
        representative_index = len(combination) - 1
        representative = planned_stop_results[representative_index]
        representative_place = representative["place"]
        to_place_minutes = math.floor(
            (_time_on_schedule_date(representative["arrive_time"], arrival_at) - departure_at).total_seconds() / 60
        )
        to_dest_minutes = segment_minutes[-1]

        logger.info(
            "Route candidate: places=%s departure_time=%s arrival_time=%s travel_minutes=%s total_stay_minutes=%s",
            [place.get("name") for place in combination],
            _format_time(departure_at),
            _format_time(arrival_at),
            travel_minutes,
            sum(stop_stay_minutes),
        )

        candidate = {
            "best_place": representative_place,
            "best_cafe": representative_place,
            "destination": dest,
            "tasks": [stop.get("task", {}) for stop in planned_stops[:3]],
            "stops": planned_stop_results,
            "timeline": _build_dynamic_timeline(
                planned_stop_results,
                segment_routes,
                segment_minutes,
                departure_at,
                arrival_at,
                arrival_buffer_minutes,
                dest,
            ),
            "to_place_route": segment_routes[representative_index],
            "to_cafe_route": segment_routes[representative_index],
            "to_dest_route": segment_routes[-1],
            "stay_minutes": representative.get("stay_minutes", 0),
            "planned_stay_minutes": representative.get("stay_minutes", 0),
            "arrival_buffer_minutes": arrival_buffer_minutes,
            "departure_time": _format_time(departure_at),
            "arrival_time": _format_time(arrival_at),
            "travel_minutes": travel_minutes,
            "to_place_minutes": to_place_minutes,
            "to_dest_minutes": to_dest_minutes,
            "total_travel_minutes": travel_minutes,
            "total_stay_minutes": sum(stop_stay_minutes),
            "segment_minutes": segment_minutes,
            "segment_routes": segment_routes,
            "selected_places": list(combination),
            "planned_stops": planned_stops[:3],
            "stop_stay_minutes": stop_stay_minutes,
        }
        if best_result is None or departure_at > best_result["departure_at"]:
            candidate["departure_at"] = departure_at
            best_result = candidate

    if best_result:
        best_result = await _refresh_best_result_with_scheduled_routes(
            best_result,
            user_lat,
            user_lng,
            dest,
            arrival_at,
            user_departure_at,
            arrival_buffer_minutes,
        )
        best_result.pop("departure_at", None)
        best_result.pop("selected_places", None)
        best_result.pop("planned_stops", None)
        best_result.pop("stop_stay_minutes", None)
        return best_result

    return _empty_route_result(
        dest,
        planned_stops,
        sum(stop.get("stay_minutes", 0) for stop in planned_stops),
        arrival_buffer_minutes,
        fatal_route_error or _summarize_route_failure(planned_stops),
    )


async def coordinator_agent(understanding: dict, route_result: dict) -> str:
    place = route_result.get("best_place") or route_result.get("best_cafe", {})
    if route_result.get("error"):
        return _failure_message(understanding, route_result)

    api_key = _required_api_key("OPENAI_API_KEY")
    payload = {
        "model": "gpt-4o",
        "messages": [
            {
                "role": "system",
                "content": (
                    "친근한 한국어로 200자 이내 추천 메시지를 작성해. "
                    "선택된 장소 유형을 그대로 말하고, 카페가 아닌데 카페라고 부르지 마. "
                    "stops가 여러 개면 각 stop의 action, place_type, place.name을 순서대로 구분해서 말해. "
                    "stops가 없으면 경유지 없이 목적지로 바로 가는 직행 일정으로 말해. "
                    "식당에서 할 일을 카페에서 하라고 합치거나 바꾸지 마. "
                    "추천 장소, 출발 시간, 계획 체류 시간, 도착 여유 시간을 반드시 포함해. "
                    "선택된 장소가 없으면 추천을 꾸미지 말고 찾지 못했다고 말해. 이모지는 쓰지 마."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "destination": understanding.get("destination"),
                        "appointment_time": understanding.get("appointment_time"),
                        "place_type": understanding.get("place_type"),
                        "purpose": understanding.get("purpose"),
                        "recommended_place": {
                            "name": place.get("name"),
                            "address": place.get("address"),
                        },
                        "stops": route_result.get("stops", []),
                        "timeline": route_result.get("timeline", []),
                        "route_summary": {
                            "to_place_minutes": route_result.get("to_place_minutes", 0),
                            "to_destination_minutes": _route_minutes(route_result.get("to_dest_route", {})),
                            "to_place_mode": route_result.get("to_place_route", {}).get("mode"),
                            "to_destination_mode": route_result.get("to_dest_route", {}).get("mode"),
                            "total_travel_minutes": route_result.get("total_travel_minutes", route_result.get("travel_minutes", 0)),
                            "total_stay_minutes": route_result.get("total_stay_minutes", route_result.get("stay_minutes", 0)),
                        },
                        "stay_minutes": route_result.get("stay_minutes", 0),
                        "planned_stay_minutes": route_result.get("planned_stay_minutes", 0),
                        "departure_time": route_result.get("departure_time"),
                        "arrival_time": route_result.get("arrival_time"),
                        "arrival_buffer_minutes": route_result.get("arrival_buffer_minutes", 10),
                        "error": route_result.get("error", ""),
                        "arrival_margin": f"{route_result.get('arrival_buffer_minutes', 10)}분 여유",
                    },
                    ensure_ascii=False,
                ),
            },
        ],
        "max_tokens": 160,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            OPENAI_CHAT_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        response.raise_for_status()

    return response.json()["choices"][0]["message"]["content"].strip()


async def run_pipeline(query: str, user_lat: float, user_lng: float) -> dict:
    understanding = await understanding_agent(query, user_lat, user_lng)
    destination_place = await _find_place(
        understanding["destination"],
        understanding["user_lat"],
        understanding["user_lng"],
    )
    places = await place_agent(understanding, destination_place)
    route_result = await route_agent(
        understanding["user_lat"],
        understanding["user_lng"],
        places,
        understanding["destination"],
        understanding["appointment_time"],
        understanding["min_stay_minutes"],
        understanding.get("departure_time"),
        understanding.get("planned_stay_minutes"),
        understanding.get("arrival_buffer_minutes", 10),
        destination_place,
    )
    message = await coordinator_agent(understanding, route_result)
    to_cafe_minutes = route_result.get("to_place_minutes", 0)
    to_dest_minutes = route_result.get("to_dest_minutes", 0)
    cafe_arrive_time = _format_time(
        datetime.now(ZoneInfo("Asia/Seoul")) + timedelta(minutes=to_cafe_minutes)
    ) if to_cafe_minutes else ""
    cafe_depart_time = _format_cafe_depart_time(
        route_result.get("arrival_time", ""),
        to_dest_minutes,
    )
    return {
        "cafe": route_result.get("best_place", {}),
        "place": route_result.get("best_place", {}),
        "understanding": understanding,
        "tasks": route_result.get("tasks", understanding.get("tasks", [])),
        "stops": route_result.get("stops", []),
        "timeline": route_result.get("timeline", []),
        "total_travel_minutes": route_result.get("total_travel_minutes", route_result.get("travel_minutes", 0)),
        "total_stay_minutes": route_result.get("total_stay_minutes", route_result.get("stay_minutes", 0)),
        "route": {
            "to_place": route_result.get("to_place_route", {}),
            "to_cafe": route_result.get("to_place_route", {}),
            "to_destination": route_result.get("to_dest_route", {}),
            "destination": route_result.get("destination", {}),
            "to_place_minutes": route_result.get("to_place_minutes", 0),
            "to_destination_minutes": route_result.get("to_dest_minutes", 0),
            "travel_minutes": route_result.get("travel_minutes", 0),
            "to_place_mode": route_result.get("to_place_route", {}).get("mode"),
            "to_destination_mode": route_result.get("to_dest_route", {}).get("mode"),
        },
        "stay_minutes": route_result.get("stay_minutes", 0),
        "departure_time": route_result.get("departure_time", ""),
        "planned_stay_minutes": route_result.get("planned_stay_minutes", 0),
        "arrival_buffer_minutes": route_result.get("arrival_buffer_minutes", 10),
        "arrival_time": route_result.get("arrival_time", ""),
        "to_cafe_minutes": to_cafe_minutes,
        "cafe_arrive_time": cafe_arrive_time,
        "cafe_depart_time": cafe_depart_time,
        "to_dest_minutes": to_dest_minutes,
        "buffer_minutes": route_result.get("arrival_buffer_minutes", 10),
        "message": message,
    }


async def _find_place(query: str, lat: float, lng: float) -> dict:
    api_key = _required_api_key("KAKAO_REST_API_KEY")
    params = {"query": query, "x": lng, "y": lat, "size": 1}
    async with httpx.AsyncClient(timeout=15) as client:
        _log_api_request("Kakao destination search", "GET", KAKAO_KEYWORD_URL, params=params)
        response = await client.get(
            KAKAO_KEYWORD_URL,
            headers={"Authorization": f"KakaoAK {api_key}"},
            params=params,
        )
        _log_api_response("Kakao destination search", response)
        response.raise_for_status()

    documents = response.json().get("documents", [])
    logger.info("Kakao destination search documents: query=%r count=%s", query, len(documents))
    if not documents:
        raise ValueError(f"목적지를 찾을 수 없습니다: {query}")

    place = documents[0]
    return {
        "name": place.get("place_name", query),
        "lat": float(place["y"]),
        "lng": float(place["x"]),
    }


async def _mixed_route(
    start_lng: float,
    start_lat: float,
    end_lng: float,
    end_lat: float,
    search_at: Optional[datetime] = None,
) -> dict:
    distance_meters = _haversine_meters(start_lat, start_lng, end_lat, end_lng)
    if distance_meters <= WALKING_ROUTE_THRESHOLD_METERS:
        logger.info(
            "Using walking route without T map transit call: distance_meters=%s threshold=%s",
            round(distance_meters),
            WALKING_ROUTE_THRESHOLD_METERS,
        )
        return _walking_route_for_close_points(start_lng, start_lat, end_lng, end_lat)

    route = await _transit_route(start_lng, start_lat, end_lng, end_lat, search_at)
    route["mode"] = "TRANSIT"
    return route


async def _transit_route(
    start_lng: float,
    start_lat: float,
    end_lng: float,
    end_lat: float,
    search_at: Optional[datetime] = None,
) -> dict:
    api_key = _required_api_key("TMAP_APP_KEY")
    payload = {
        "startX": str(start_lng),
        "startY": str(start_lat),
        "endX": str(end_lng),
        "endY": str(end_lat),
        "lang": 0,
        "format": "json",
        "count": 1,
    }
    if search_at:
        payload["searchDttm"] = _format_tmap_search_dttm(search_at)

    async with httpx.AsyncClient(timeout=20) as client:
        _log_api_request("T map transit route", "POST", TMAP_TRANSIT_URL, json_body=payload)
        response = await client.post(
            TMAP_TRANSIT_URL,
            headers={
                "appKey": api_key,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            json=payload,
        )
        _log_api_response("T map transit route", response)
        response.raise_for_status()

    route = response.json()
    if _is_too_close_route(route):
        return _walking_route_for_close_points(start_lng, start_lat, end_lng, end_lat, route)

    return route


def _appointment_datetime(appointment_time: str) -> datetime:
    now = datetime.now(ZoneInfo("Asia/Seoul"))
    hour, minute = map(int, appointment_time.split(":")[:2])
    appointment_at = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if appointment_at <= now:
        appointment_at += timedelta(days=1)
    return appointment_at


def _time_on_schedule_date(time_text: str, appointment_at: datetime) -> datetime:
    hour, minute = map(int, time_text.split(":")[:2])
    scheduled_at = appointment_at.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if scheduled_at > appointment_at:
        scheduled_at -= timedelta(days=1)
    return scheduled_at


def _format_time(value: datetime) -> str:
    return value.strftime("%H:%M")


def _format_tmap_search_dttm(value: datetime) -> str:
    return value.strftime("%Y%m%d%H%M")


def _format_cafe_depart_time(arrival_time: str, to_dest_minutes: int) -> str:
    if not arrival_time or not to_dest_minutes:
        return ""
    try:
        hour, minute = map(int, arrival_time.split(":")[:2])
    except ValueError:
        return ""
    base = datetime.now(ZoneInfo("Asia/Seoul")).replace(
        hour=hour,
        minute=minute,
        second=0,
        microsecond=0,
    )
    return _format_time(base - timedelta(minutes=to_dest_minutes))


def _normalize_tasks(result: dict) -> list[dict]:
    tasks = result.get("tasks") or []
    normalized = []
    for index, task in enumerate(tasks[:3]):
        candidate = {
            "action": task.get("action") or task.get("purpose") or "",
            "purpose": task.get("purpose") or task.get("action") or "",
            "conditions": task.get("conditions") or [],
            "order": int(task.get("order") or index + 1),
            "requested_stay_minutes": task.get("requested_stay_minutes"),
        }
        if not _has_stop_intent(candidate):
            continue
        normalized.append(
            {
                "action": candidate["action"],
                "purpose": candidate["purpose"],
                "conditions": candidate["conditions"],
                "order": candidate["order"],
                "requested_stay_minutes": candidate["requested_stay_minutes"],
            }
        )
    if normalized:
        return sorted(normalized, key=lambda item: item["order"])
    fallback_task = {
        "action": result.get("purpose") or result.get("place_type", ""),
        "purpose": result.get("purpose") or result.get("place_type", ""),
        "conditions": result.get("conditions") or [],
        "order": 1,
        "requested_stay_minutes": result.get("planned_stay_minutes"),
    }
    if _has_stop_intent(fallback_task):
        return [fallback_task]
    return []


def _has_stop_intent(task: dict) -> bool:
    text = " ".join(
        [
            task.get("action", ""),
            task.get("purpose", ""),
            *task.get("conditions", []),
        ]
    )
    stop_keywords = [
        "점심",
        "밥",
        "식사",
        "저녁",
        "아침",
        "먹",
        "카페",
        "커피",
        "기다",
        "대기",
        "작업",
        "공부",
        "꽃",
        "선물",
        "사서",
        "구매",
        "약국",
        "약",
        "편의점",
    ]
    return any(keyword in text for keyword in stop_keywords)


def plan_tasks_to_stops(understanding: dict) -> list[dict]:
    stops = []
    for index, task in enumerate((understanding.get("tasks") or [])[:3]):
        stop_meta = _map_task_to_stop(task, understanding)
        stops.append(
            {
                "id": f"stop-{index + 1}",
                "order": index + 1,
                "task": task,
                "action": task.get("action", ""),
                "purpose": task.get("purpose", ""),
                "conditions": task.get("conditions", []),
                "place_type": stop_meta["place_type"],
                "stay_minutes": stop_meta["stay_minutes"],
                "search_terms": stop_meta["search_terms"],
                "candidates": [],
            }
        )
    return stops


def _map_task_to_stop(task: dict, understanding: dict) -> dict:
    text = " ".join(
        [
            task.get("action", ""),
            task.get("purpose", ""),
            *task.get("conditions", []),
        ]
    )
    requested_stay = task.get("requested_stay_minutes")
    if any(keyword in text for keyword in ["점심", "밥", "식사", "저녁", "아침", "먹"]):
        return _stop_meta("식당", requested_stay, 45, ["식당", *task.get("conditions", [])])
    if any(keyword in text for keyword in ["카페", "커피", "기다", "대기", "작업", "공부", "있다"]):
        default_stay = 60 if any(keyword in text for keyword in ["기다", "대기", "작업", "공부", "있다"]) else 30
        return _stop_meta("카페", requested_stay, default_stay, ["카페", *task.get("conditions", [])])
    if any(keyword in text for keyword in ["꽃", "선물"]):
        return _stop_meta("꽃집", requested_stay, 10, ["꽃집", *task.get("conditions", [])])
    if "약" in text:
        return _stop_meta("약국", requested_stay, 10, ["약국", *task.get("conditions", [])])
    if "편의점" in text:
        return _stop_meta("편의점", requested_stay, 10, ["편의점", *task.get("conditions", [])])
    fallback_type = understanding.get("place_type") or "장소"
    return _stop_meta(fallback_type, requested_stay, _default_min_stay_minutes(understanding), [fallback_type, *task.get("conditions", [])])


def _stop_meta(place_type: str, requested_stay: Any, default_stay: int, search_terms: list[str]) -> dict:
    try:
        stay_minutes = int(requested_stay)
    except (TypeError, ValueError):
        stay_minutes = default_stay
    if stay_minutes < 5 or stay_minutes > 180:
        stay_minutes = default_stay
    return {
        "place_type": place_type,
        "stay_minutes": stay_minutes,
        "search_terms": [term for term in search_terms if term],
    }


def _stop_search_queries(stop: dict) -> list[str]:
    terms = stop.get("search_terms") or [stop.get("place_type", "장소")]
    queries = [" ".join(terms), stop.get("place_type", "장소")]
    if "꽃" in stop.get("place_type", ""):
        queries.extend(["꽃집", "플라워"])
    return list(dict.fromkeys(query for query in queries if query.strip()))


def _route_search_anchors(user_lat: float, user_lng: float, destination_place: dict) -> list[dict]:
    dest_lat = float(destination_place.get("lat", user_lat))
    dest_lng = float(destination_place.get("lng", user_lng))
    anchors = []
    for ratio in [0.25, 0.5, 0.75, 1.0]:
        anchors.append(
            {
                "label": f"{int(ratio * 100)}%",
                "lat": float(user_lat) + (dest_lat - float(user_lat)) * ratio,
                "lng": float(user_lng) + (dest_lng - float(user_lng)) * ratio,
            }
        )
    return anchors


def _ensure_planned_stops(places: list) -> list[dict]:
    if not places:
        return []
    if "candidates" in places[0]:
        return places[:3]
    return [
        {
            "id": "stop-1",
            "order": 1,
            "task": {"action": places[0].get("place_type", "경유"), "purpose": places[0].get("place_type", "경유"), "conditions": [], "order": 1},
            "action": places[0].get("place_type", "경유"),
            "purpose": places[0].get("place_type", "경유"),
            "conditions": [],
            "place_type": places[0].get("place_type", "장소"),
            "stay_minutes": _default_min_stay_minutes({"place_type": places[0].get("place_type", "")}),
            "search_terms": [places[0].get("place_type", "장소")],
            "candidates": places[:3],
        }
    ]


def _build_stop_results(
    planned_stops: list[dict],
    combination: tuple,
    segment_minutes: list[int],
    stop_stay_minutes: list[int],
    departure_at: datetime,
) -> list[dict]:
    results = []
    cursor = departure_at
    for index, (stop, place) in enumerate(zip(planned_stops, combination)):
        cursor += timedelta(minutes=segment_minutes[index])
        arrive_at = cursor
        depart_at = arrive_at + timedelta(minutes=stop_stay_minutes[index])
        cursor = depart_at
        results.append(
            {
                "action": stop.get("action", ""),
                "purpose": stop.get("purpose", ""),
                "place_type": stop.get("place_type", ""),
                "place": place,
                "arrive_time": _format_time(arrive_at),
                "depart_time": _format_time(depart_at),
                "stay_minutes": stop_stay_minutes[index],
            }
        )
    return results


async def _refresh_best_result_with_scheduled_routes(
    result: dict,
    user_lat: float,
    user_lng: float,
    dest: dict,
    arrival_at: datetime,
    user_departure_at: Optional[datetime],
    arrival_buffer_minutes: int,
) -> dict:
    planned_stops = result.get("planned_stops", [])
    selected_places = result.get("selected_places", [])
    stop_stay_minutes = result.get("stop_stay_minutes", [])
    departure_at = result.get("departure_at")
    if not departure_at or not selected_places:
        return result

    try:
        segment_routes, segment_minutes = await _scheduled_segment_routes(
            user_lat,
            user_lng,
            selected_places,
            dest,
            stop_stay_minutes,
            departure_at,
        )
        if not user_departure_at:
            total_travel_minutes = sum(segment_minutes)
            total_stay_minutes = sum(stop_stay_minutes)
            departure_at = arrival_at - timedelta(
                minutes=total_travel_minutes + total_stay_minutes
            )
            segment_routes, segment_minutes = await _scheduled_segment_routes(
                user_lat,
                user_lng,
                selected_places,
                dest,
                stop_stay_minutes,
                departure_at,
            )
    except httpx.HTTPError as exc:
        logger.info(
            "Keeping estimated route because scheduled route refresh failed: error=%s",
            _route_error_message(exc),
        )
        return result

    if any(minutes == 0 for minutes in segment_minutes):
        logger.info(
            "Keeping estimated route because scheduled route refresh returned empty minutes: %s",
            segment_minutes,
        )
        return result

    travel_minutes = sum(segment_minutes)
    total_stay_minutes = sum(stop_stay_minutes)
    if user_departure_at:
        available_stay_minutes = math.floor(
            (arrival_at - user_departure_at).total_seconds() / 60
        ) - travel_minutes
        if available_stay_minutes < total_stay_minutes:
            logger.info(
                "Keeping estimated route because scheduled route refresh made stay insufficient: available=%s required=%s",
                available_stay_minutes,
                total_stay_minutes,
            )
            return result
        stop_stay_minutes = [*stop_stay_minutes]
        stop_stay_minutes[-1] += available_stay_minutes - total_stay_minutes
        departure_at = user_departure_at
        total_stay_minutes = sum(stop_stay_minutes)
    elif departure_at <= datetime.now(ZoneInfo("Asia/Seoul")):
        logger.info(
            "Keeping estimated route because scheduled route refresh departure is in the past: departure=%s",
            _format_time(departure_at),
        )
        return result

    planned_stop_results = _build_stop_results(
        planned_stops,
        tuple(selected_places),
        segment_minutes,
        stop_stay_minutes,
        departure_at,
    )
    representative_index = len(selected_places) - 1
    representative = planned_stop_results[representative_index]
    representative_place = representative["place"]
    to_place_minutes = math.floor(
        (_time_on_schedule_date(representative["arrive_time"], arrival_at) - departure_at).total_seconds() / 60
    )

    result.update(
        {
            "best_place": representative_place,
            "best_cafe": representative_place,
            "stops": planned_stop_results,
            "timeline": _build_dynamic_timeline(
                planned_stop_results,
                segment_routes,
                segment_minutes,
                departure_at,
                arrival_at,
                arrival_buffer_minutes,
                dest,
            ),
            "to_place_route": segment_routes[representative_index],
            "to_cafe_route": segment_routes[representative_index],
            "to_dest_route": segment_routes[-1],
            "stay_minutes": representative.get("stay_minutes", 0),
            "planned_stay_minutes": representative.get("stay_minutes", 0),
            "departure_time": _format_time(departure_at),
            "arrival_time": _format_time(arrival_at),
            "travel_minutes": travel_minutes,
            "to_place_minutes": to_place_minutes,
            "to_dest_minutes": segment_minutes[-1],
            "total_travel_minutes": travel_minutes,
            "total_stay_minutes": total_stay_minutes,
            "segment_minutes": segment_minutes,
            "segment_routes": segment_routes,
            "stop_stay_minutes": stop_stay_minutes,
            "departure_at": departure_at,
        }
    )
    return result


async def _scheduled_segment_routes(
    user_lat: float,
    user_lng: float,
    selected_places: list[dict],
    dest: dict,
    stop_stay_minutes: list[int],
    departure_at: datetime,
) -> tuple[list[dict], list[int]]:
    segment_routes = []
    previous = {"lat": user_lat, "lng": user_lng, "name": "현재 위치"}
    cursor = departure_at

    for index, place in enumerate(selected_places):
        route = await _mixed_route(
            previous["lng"],
            previous["lat"],
            place["lng"],
            place["lat"],
            cursor,
        )
        minutes = _route_minutes(route)
        segment_routes.append(route)
        cursor += timedelta(minutes=minutes + stop_stay_minutes[index])
        previous = place

    final_route = await _mixed_route(
        previous["lng"],
        previous["lat"],
        dest["lng"],
        dest["lat"],
        cursor,
    )
    segment_routes.append(final_route)
    return segment_routes, [_route_minutes(route) for route in segment_routes]


def _build_dynamic_timeline(
    stops: list[dict],
    segment_routes: list[dict],
    segment_minutes: list[int],
    departure_at: datetime,
    arrival_at: datetime,
    buffer_minutes: int,
    destination: dict,
) -> list[dict]:
    timeline = [{"type": "start", "label": "출발", "time": _format_time(departure_at), "place": {"name": "현재 위치"}}]
    cursor = departure_at
    for index, stop in enumerate(stops):
        timeline.append(
            {
                "type": "travel",
                "label": f"{stop.get('place_type', '장소')}까지 이동",
                "duration_minutes": segment_minutes[index],
                "mode": segment_routes[index].get("mode", "TRANSIT"),
                "details": _route_leg_details(segment_routes[index], cursor),
            }
        )
        cursor += timedelta(minutes=segment_minutes[index])
        timeline.append(
            {
                "type": "stop",
                "label": stop.get("action") or stop.get("place_type", "경유"),
                "time": stop.get("arrive_time", ""),
                "depart_time": stop.get("depart_time", ""),
                "duration_minutes": stop.get("stay_minutes", 0),
                "place": stop.get("place", {}),
            }
        )
        cursor += timedelta(minutes=stop.get("stay_minutes", 0))
    timeline.append(
        {
            "type": "travel",
            "label": "약속 장소까지 이동",
            "duration_minutes": segment_minutes[-1],
            "mode": segment_routes[-1].get("mode", "TRANSIT"),
            "details": _route_leg_details(segment_routes[-1], cursor),
        }
    )
    timeline.append(
        {
            "type": "arrival",
            "label": "약속 도착",
            "time": _format_time(arrival_at),
            "duration_minutes": buffer_minutes,
            "place": destination,
        }
    )
    return timeline


async def _direct_route_result(
    user_lat: float,
    user_lng: float,
    dest: dict,
    appointment_at: datetime,
    arrival_at: datetime,
    user_departure_at: Optional[datetime],
    arrival_buffer_minutes: int,
) -> dict:
    try:
        direct_route = await _mixed_route(
            user_lng,
            user_lat,
            dest["lng"],
            dest["lat"],
            user_departure_at,
        )
    except httpx.HTTPError as exc:
        return _empty_route_result(
            dest,
            [],
            0,
            arrival_buffer_minutes,
            _route_error_message(exc),
        )

    direct_minutes = _route_minutes(direct_route)
    if direct_minutes == 0:
        return _empty_route_result(dest, [], 0, arrival_buffer_minutes, "직행 경로 시간을 계산하지 못했습니다.")

    if user_departure_at:
        departure_at = user_departure_at
        expected_arrival_at = departure_at + timedelta(minutes=direct_minutes)
        if expected_arrival_at > arrival_at:
            return _empty_route_result(
                dest,
                [],
                0,
                arrival_buffer_minutes,
                "입력한 출발 시간으로는 도착 여유 시간을 확보하기 어렵습니다.",
            )
    else:
        departure_at = arrival_at - timedelta(minutes=direct_minutes)
        if departure_at <= datetime.now(ZoneInfo("Asia/Seoul")):
            return _empty_route_result(
                dest,
                [],
                0,
                arrival_buffer_minutes,
                "이미 출발했어야 하는 일정입니다.",
            )
        try:
            scheduled_route = await _mixed_route(user_lng, user_lat, dest["lng"], dest["lat"], departure_at)
            scheduled_minutes = _route_minutes(scheduled_route)
            if scheduled_minutes:
                direct_route = scheduled_route
                direct_minutes = scheduled_minutes
                departure_at = arrival_at - timedelta(minutes=direct_minutes)
        except httpx.HTTPError as exc:
            logger.info(
                "Keeping estimated direct route because scheduled route refresh failed: error=%s",
                _route_error_message(exc),
            )

    timeline = [
        {"type": "start", "label": "출발", "time": _format_time(departure_at), "place": {"name": "현재 위치"}},
        {
            "type": "travel",
            "label": "약속 장소까지 이동",
            "duration_minutes": direct_minutes,
            "mode": direct_route.get("mode", "TRANSIT"),
            "details": _route_leg_details(direct_route, departure_at),
        },
        {
            "type": "arrival",
            "label": "약속 도착",
            "time": _format_time(arrival_at),
            "duration_minutes": arrival_buffer_minutes,
            "place": dest,
        },
    ]
    return {
        "best_place": {},
        "best_cafe": {},
        "destination": dest,
        "tasks": [],
        "stops": [],
        "timeline": timeline,
        "to_place_route": {},
        "to_cafe_route": {},
        "to_dest_route": direct_route,
        "stay_minutes": 0,
        "planned_stay_minutes": 0,
        "arrival_buffer_minutes": arrival_buffer_minutes,
        "departure_time": _format_time(departure_at),
        "arrival_time": _format_time(arrival_at),
        "travel_minutes": direct_minutes,
        "to_place_minutes": 0,
        "to_dest_minutes": direct_minutes,
        "total_travel_minutes": direct_minutes,
        "total_stay_minutes": 0,
        "appointment_time": _format_time(appointment_at),
    }


def _empty_route_result(
    dest: dict,
    planned_stops: list[dict],
    planned_stay_minutes: int,
    arrival_buffer_minutes: int,
    error: str,
) -> dict:
    return {
        "best_place": {},
        "best_cafe": {},
        "destination": dest,
        "tasks": [stop.get("task", {}) for stop in planned_stops],
        "stops": [],
        "timeline": [],
        "to_place_route": {},
        "to_cafe_route": {},
        "to_dest_route": {},
        "stay_minutes": 0,
        "planned_stay_minutes": planned_stay_minutes,
        "arrival_buffer_minutes": arrival_buffer_minutes,
        "departure_time": "",
        "arrival_time": "",
        "travel_minutes": 0,
        "to_place_minutes": 0,
        "to_dest_minutes": 0,
        "total_travel_minutes": 0,
        "total_stay_minutes": 0,
        "attempted_places": planned_stops,
        "error": error,
    }


def _normalize_optional_time(value: Any) -> Optional[str]:
    if value in (None, "", "null"):
        return None
    try:
        hour, minute = map(int, str(value).strip().split(":")[:2])
    except (TypeError, ValueError):
        return None
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None
    return f"{hour:02d}:{minute:02d}"


def _normalize_stay_minutes(value: Any, understanding: dict) -> int:
    fallback = _default_min_stay_minutes(understanding)
    try:
        minutes = int(value)
    except (TypeError, ValueError):
        return fallback
    if minutes < 5 or minutes > 180:
        return fallback
    return minutes


def _normalize_buffer_minutes(value: Any) -> int:
    try:
        minutes = int(value)
    except (TypeError, ValueError):
        return 10
    if minutes < 0 or minutes > 60:
        return 10
    return minutes


def _route_minutes(route: dict[str, Any]) -> int:
    itineraries = (
        route.get("metaData", {})
        .get("plan", {})
        .get("itineraries", [])
    )
    if itineraries and "totalTime" in itineraries[0]:
        return max(1, math.ceil(int(itineraries[0]["totalTime"]) / 60))
    if "totalTime" in route:
        return max(1, math.ceil(int(route["totalTime"]) / 60))
    return 0


def _route_leg_details(route: dict[str, Any], segment_start_at: datetime) -> list[dict[str, Any]]:
    legs = _route_legs(route)
    details = []
    cursor = segment_start_at

    for leg in legs:
        seconds = _leg_seconds(leg)
        minutes = max(1, math.ceil(seconds / 60)) if seconds else 0
        start_at = _leg_time_at(
            leg,
            segment_start_at,
            ["startTime", "departureTime", "departTime", "depTime"],
        ) or cursor
        end_at = _leg_time_at(
            leg,
            segment_start_at,
            ["endTime", "arrivalTime", "arriveTime", "arrTime"],
        ) or (start_at + timedelta(seconds=seconds or minutes * 60))
        cursor = end_at
        mode = leg.get("mode", route.get("mode", "TRANSIT"))
        line_name = _leg_line_name(leg)
        detail = {
            "mode": mode,
            "mode_label": _mode_label(mode),
            "line_name": line_name,
            "duration_minutes": minutes,
            "start_time": _format_time(start_at),
            "end_time": _format_time(end_at),
            "start_name": (leg.get("start") or {}).get("name", ""),
            "end_name": (leg.get("end") or {}).get("name", ""),
            "distance": leg.get("distance", 0),
            "service": leg.get("service", 0),
        }
        detail["summary"] = _leg_summary(detail)
        details.append(detail)

    if details:
        return details

    minutes = _route_minutes(route)
    if minutes == 0:
        return []

    end_at = segment_start_at + timedelta(minutes=minutes)
    detail = {
        "mode": route.get("mode", "TRANSIT"),
        "mode_label": _mode_label(route.get("mode", "TRANSIT")),
        "line_name": "",
        "duration_minutes": minutes,
        "start_time": _format_time(segment_start_at),
        "end_time": _format_time(end_at),
        "start_name": "",
        "end_name": "",
        "distance": route.get("distance", 0),
    }
    detail["summary"] = _leg_summary(detail)
    return [detail]


def _route_legs(route: dict[str, Any]) -> list[dict[str, Any]]:
    if route.get("legs"):
        return route.get("legs", [])
    itineraries = (
        route.get("metaData", {})
        .get("plan", {})
        .get("itineraries", [])
    )
    if itineraries:
        return itineraries[0].get("legs", [])
    return []


def _leg_seconds(leg: dict[str, Any]) -> int:
    for key in ["sectionTime", "totalTime", "duration"]:
        value = leg.get(key)
        if value is None:
            continue
        try:
            return int(value)
        except (TypeError, ValueError):
            continue
    return 0


def _leg_line_name(leg: dict[str, Any]) -> str:
    for key in ["route", "routeName", "lineName", "busNo", "busNumber", "routeNo", "name"]:
        value = leg.get(key)
        if value:
            return str(value)

    lanes = leg.get("lane")
    if isinstance(lanes, list) and lanes:
        first_lane = lanes[0]
        for key in ["name", "busNo", "busNumber", "routeNo", "route", "routeName"]:
            value = first_lane.get(key)
            if value:
                return str(value)

    return ""


def _leg_time_at(
    leg: dict[str, Any],
    base_date: datetime,
    keys: list[str],
) -> Optional[datetime]:
    for key in keys:
        value = leg.get(key)
        parsed = _parse_route_time(value, base_date)
        if parsed:
            return parsed
    return None


def _parse_route_time(value: Any, base_date: datetime) -> Optional[datetime]:
    if value in (None, ""):
        return None
    text = str(value).strip()
    digits = "".join(char for char in text if char.isdigit())
    try:
        if len(digits) >= 12:
            return datetime.strptime(digits[:12], "%Y%m%d%H%M").replace(tzinfo=base_date.tzinfo)
        if len(digits) == 4:
            hour = int(digits[:2])
            minute = int(digits[2:])
        elif ":" in text:
            hour, minute = map(int, text.split(":")[:2])
        else:
            return None
    except ValueError:
        return None

    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None

    parsed = base_date.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if parsed < base_date - timedelta(hours=12):
        parsed += timedelta(days=1)
    elif parsed > base_date + timedelta(hours=12):
        parsed -= timedelta(days=1)
    return parsed


def _mode_label(mode: str) -> str:
    labels = {
        "WALK": "도보",
        "BUS": "버스",
        "SUBWAY": "지하철",
        "RAIL": "철도",
        "TRAIN": "열차",
        "TRANSIT": "대중교통",
    }
    return labels.get(str(mode).upper(), "이동")


def _leg_summary(detail: dict[str, Any]) -> str:
    mode = detail.get("mode_label", "이동")
    line = detail.get("line_name")
    start_name = detail.get("start_name")
    end_name = detail.get("end_name")
    duration = detail.get("duration_minutes", 0)

    if line and start_name and end_name:
        return f"{detail.get('start_time')} {start_name}에서 {line} 탑승, {end_name} 하차"
    if line:
        return f"{detail.get('start_time')} {line} {mode} 이용"
    if start_name and end_name:
        return f"{start_name}에서 {end_name}까지 {mode}"
    return f"{mode} {duration}분"


def _is_too_close_route(route: dict[str, Any]) -> bool:
    result = route.get("result", {})
    return result.get("status") == 11 or "너무 가까움" in result.get("message", "")


def _walking_route_for_close_points(
    start_lng: float,
    start_lat: float,
    end_lng: float,
    end_lat: float,
    original_route: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    distance_meters = _haversine_meters(start_lat, start_lng, end_lat, end_lng)
    walking_seconds = max(60, math.ceil(distance_meters / WALKING_METERS_PER_SECOND))
    logger.info(
        "Using walking route: distance_meters=%s totalTime=%s",
        round(distance_meters),
        walking_seconds,
    )
    return {
        "result": (original_route or {}).get("result", {}),
        "totalTime": walking_seconds,
        "distance": round(distance_meters),
        "mode": "WALK",
        "fallback": "walking",
        "legs": [
            {
                "mode": "WALK",
                "sectionTime": walking_seconds,
                "distance": round(distance_meters),
                "start": {"lon": start_lng, "lat": start_lat},
                "end": {"lon": end_lng, "lat": end_lat},
            }
        ],
    }


def _haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371000
    lat1_rad = math.radians(float(lat1))
    lat2_rad = math.radians(float(lat2))
    delta_lat = math.radians(float(lat2) - float(lat1))
    delta_lng = math.radians(float(lng2) - float(lng1))
    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lng / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _route_error_message(exc: Exception) -> str:
    if isinstance(exc, httpx.HTTPStatusError):
        status_code = exc.response.status_code
        error_code = _response_error_code(exc.response)
        request_id = exc.response.headers.get("x-amzn-requestid", "")
        if status_code == 403:
            if error_code == "INVALID_API_KEY":
                return "T map 대중교통 API 키 오류(403 INVALID_API_KEY). 대중교통 API 상품에 연결된 appKey가 필요합니다."
            return "T map 대중교통 API 권한 오류(403). 앱키에 대중교통 API 상품 권한이 필요합니다."
        if status_code == 429:
            suffix = f" request_id={request_id}" if request_id else ""
            if error_code == "QUOTA_EXCEEDED":
                return f"T map 대중교통 API 사용량 제한 초과(429 QUOTA_EXCEEDED).{suffix}"
            return f"T map 대중교통 API 호출 제한 오류(429 {error_code}).{suffix}"
        return f"T map 대중교통 API 오류({status_code} {error_code})."
    return "T map 대중교통 API 호출에 실패했습니다."


def _response_error_code(response: httpx.Response) -> str:
    try:
        return response.json().get("error", {}).get("code", "")
    except ValueError:
        return ""


def _log_api_request(
    label: str,
    method: str,
    url: str,
    params: Optional[dict[str, Any]] = None,
    json_body: Optional[dict[str, Any]] = None,
) -> None:
    logger.info(
        "%s request: method=%s url=%s params=%s json=%s",
        label,
        method,
        url,
        _safe_log_data(params),
        _safe_log_data(json_body),
    )


def _log_api_response(label: str, response: httpx.Response) -> None:
    logger.info(
        "%s response: status=%s request_url=%s request_id=%s error_type=%s body=%s",
        label,
        response.status_code,
        response.request.url,
        response.headers.get("x-amzn-requestid", ""),
        response.headers.get("x-amzn-errortype", ""),
        _trim_response_body(response),
    )


def _safe_log_data(data: Optional[dict[str, Any]]) -> dict[str, Any]:
    if not data:
        return {}
    hidden_keys = {"appKey", "Authorization", "OPENAI_API_KEY", "KAKAO_REST_API_KEY", "TMAP_APP_KEY"}
    return {
        key: "***" if key in hidden_keys or "key" in key.lower() else value
        for key, value in data.items()
    }


def _trim_response_body(response: httpx.Response) -> str:
    return response.text[:1000].replace("\n", " ")


def _summarize_route_failure(places: list[dict]) -> str:
    route_errors = [place.get("route_error") for place in places if place.get("route_error")]
    if route_errors:
        return route_errors[0]
    if not places:
        return "조건에 맞는 경유지를 찾지 못했습니다."
    return "조건에 맞는 경유지 또는 경로를 찾지 못했습니다."


def _failure_message(understanding: dict, route_result: dict) -> str:
    place_type = understanding.get("place_type") or "장소"
    destination = understanding.get("destination") or "목적지"
    error = route_result.get("error") or "경로를 찾지 못했습니다."
    if "403" in error:
        return f"{place_type} 후보는 찾았지만 {destination}까지의 실제 경로 계산이 실패했어요. {error}"
    return f"{destination} 일정에 맞는 {place_type} 경유 경로를 찾지 못했어요. {error}"


def _default_min_stay_minutes(understanding: dict) -> int:
    text = " ".join(
        [
            understanding.get("place_type", ""),
            understanding.get("purpose", ""),
            *understanding.get("conditions", []),
        ]
    )
    if any(keyword in text for keyword in ["카페", "대기", "기다", "작업", "공부"]):
        return 30
    if any(keyword in text for keyword in ["식당", "식사", "점심", "저녁", "아침", "밥"]):
        return 45
    if any(keyword in text for keyword in ["구매", "사서", "선물", "꽃", "약국", "편의점"]):
        return 10
    return 20


def _kakao_category_code(place_type: str) -> Optional[str]:
    normalized = place_type.replace(" ", "")
    category_map = {
        "카페": "CE7",
        "커피": "CE7",
        "음식점": "FD6",
        "식당": "FD6",
        "편의점": "CS2",
        "약국": "PM9",
        "병원": "HP8",
        "은행": "BK9",
        "문화시설": "CT1",
        "관광명소": "AT4",
    }
    for keyword, code in category_map.items():
        if keyword in normalized:
            return code
    return None
