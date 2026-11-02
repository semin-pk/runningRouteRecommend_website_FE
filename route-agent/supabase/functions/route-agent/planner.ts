import {
  ApiError,
  type Candidate,
  number,
  type Place,
  type Query,
  type Raw,
  record,
  records,
  type Route,
  type Stop,
  type StopPlan,
  strings,
  type Task,
  type Understanding,
} from "./types.ts";

export const MINUTE = 60000;
const DAY = 24 * 60 * MINUTE;
const KST = 9 * 60 * MINUTE;

export function formatTime(at: number): string {
  return new Date(at + KST).toISOString().slice(11, 16);
}

export function normalizeTime(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{1,2}:\d{2}$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour < 24 && minute < 60
    ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
    : null;
}

export function appointmentAt(time: string, now: number): number {
  const local = new Date(now + KST);
  const [hour, minute] = time.split(":").map(Number);
  const at =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour, minute) - KST;
  return at <= now ? at + DAY : at;
}

function departureAt(time: string, appointment: number): number {
  const local = new Date(appointment + KST);
  const [hour, minute] = time.split(":").map(Number);
  const at =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour, minute) - KST;
  return at > appointment ? at - DAY : at;
}

export function normalizeUnderstanding(data: Raw, query: Query): Understanding {
  const destination = typeof data.destination === "string" ? data.destination.trim() : "";
  const time = normalizeTime(data.appointment_time);
  if (!destination || !time) throw new ApiError(422, "목적지와 약속 시간을 함께 알려주세요.");
  const tasks: Task[] = records(data.tasks).slice(0, 3).map((item, index) => ({
    action: String(item.action || item.purpose || "").trim(),
    purpose: String(item.purpose || item.action || "").trim(),
    conditions: strings(item.conditions),
    order: number(item.order, index + 1),
    requested_stay_minutes: item.requested_stay_minutes == null
      ? null
      : number(item.requested_stay_minutes),
    place_type_hint: String(item.place_type_hint || ""),
  })).filter((task) => {
    if (!task.action) return false;
    const text = `${task.action} ${task.purpose} ${task.conditions.join(" ")}`;
    const stop =
      /점심|아침|저녁|식사|먹|카페|커피|기다|대기|작업|공부|꽃|선물|구매|사기|약국|편의점/.test(
        text,
      );
    return stop || !/이동|도착|약속|참석/.test(task.action);
  }).sort((a, b) => a.order - b.order);
  return {
    ...query,
    destination,
    appointment_time: time,
    departure_time: normalizeTime(data.departure_time),
    arrival_buffer_minutes: 10,
    search_area: data.search_area === "destination" || data.search_area === "origin"
      ? data.search_area
      : "route",
    tasks,
  };
}

export function planTasksToStops(understanding: Understanding): StopPlan[] {
  return understanding.tasks.map((task) => {
    const text = `${task.action} ${task.purpose} ${task.conditions.join(" ")}`;
    let type = task.place_type_hint;
    let fallback =
      ({ "식당": 45, "카페": 30, "꽃집": 10, "약국": 10, "편의점": 10 } as Record<string, number>)[
        type
      ] || 20;
    if (/점심|식사|아침|저녁|밥/.test(text)) [type, fallback] = ["식당", 45];
    else if (/카페|커피|기다|대기|작업|공부/.test(text)) {
      [type, fallback] = ["카페", /기다|대기|작업|공부/.test(text) ? 60 : 30];
    } else if (/꽃/.test(text)) [type, fallback] = ["꽃집", 10];
    else if (/약국|약 구매|약 사기/.test(text)) [type, fallback] = ["약국", 10];
    else if (/편의점/.test(text)) [type, fallback] = ["편의점", 10];
    if (!type) {
      throw new ApiError(422, `${task.action}에 필요한 장소를 조금 더 구체적으로 알려주세요.`);
    }
    const requested = task.requested_stay_minutes;
    const stay = requested !== null && requested >= 5 && requested <= 180
      ? Math.round(requested)
      : fallback;
    return {
      action: task.action,
      purpose: task.purpose,
      task,
      place_type: type,
      stay_minutes: stay,
      candidates: [],
    };
  });
}

export function searchAnchors(understanding: Understanding, destination: Place): Place[] {
  const start: Place = {
    name: "현재 위치",
    address: "",
    phone: "",
    lat: understanding.user_lat,
    lng: understanding.user_lng,
  };
  if (understanding.search_area === "destination") return [destination];
  if (understanding.search_area === "origin") return [start];
  return [0.25, 0.5, 0.75, 1].map((ratio) => ({
    ...start,
    lat: start.lat + (destination.lat - start.lat) * ratio,
    lng: start.lng + (destination.lng - start.lng) * ratio,
  }));
}

export function categoryCode(type: string): string {
  return ({ "카페": "CE7", "식당": "FD6", "편의점": "CS2", "약국": "PM9" } as Record<
    string,
    string
  >)[type] || "";
}

export function combinations(lists: Place[][]): Place[][] {
  return lists.reduce<Place[][]>(
    (rows, list) => rows.flatMap((row) => list.map((item) => [...row, item])),
    [[]],
  );
}

export function routeMinutes(route: Route): number {
  return Math.max(1, Math.ceil(route.seconds / 60));
}

export function schedule(
  understanding: Understanding,
  plans: StopPlan[],
  places: Place[],
  routes: Route[],
  now: number,
): Candidate | null {
  const minutes = routes.map(routeMinutes);
  const totalTravel = minutes.reduce((sum, value) => sum + value, 0);
  const stays = plans.map((stop) => stop.stay_minutes);
  const totalStay = stays.reduce((sum, value) => sum + value, 0);
  const appointment = appointmentAt(understanding.appointment_time, now);
  const goal = appointment - understanding.arrival_buffer_minutes * MINUTE;
  const fixed = understanding.departure_time;
  const depart = fixed
    ? departureAt(fixed, appointment)
    : goal - (totalTravel + totalStay) * MINUTE;
  if (depart < now) return null;
  if (fixed) {
    const available = Math.floor((goal - depart) / MINUTE) - totalTravel;
    if (available < totalStay) return null;
    if (stays.length) stays[stays.length - 1] += available - totalStay;
  }
  const arrival = depart + (totalTravel + stays.reduce((sum, stay) => sum + stay, 0)) * MINUTE;
  if (arrival > goal) return null;
  return { places, routes, minutes, stays, departureAt: depart, arrivalAt: arrival };
}

function lineName(leg: Raw): string {
  const lane = records(leg.lane)[0] || {};
  return String(
    leg.route || leg.routeName || leg.lineName || leg.busNo || leg.busNumber || lane.name ||
      lane.busNo || "",
  );
}

export function legDetails(route: Route, at: number): Raw[] {
  let cursor = at;
  const legs = route.legs.length ? route.legs : [{ mode: route.mode, sectionTime: route.seconds }];
  return legs.map((leg) => {
    const seconds = Math.max(0, number(leg.sectionTime ?? leg.totalTime ?? leg.duration));
    const mode = String(leg.mode || route.mode).toUpperCase();
    const label =
      ({ WALK: "도보", SUBWAY: "지하철", BUS: "버스", TRAIN: "열차", RAIL: "철도" } as Record<
        string,
        string
      >)[mode] || "대중교통";
    const line = lineName(leg);
    const start = String(record(leg.start).name || "");
    const end = String(record(leg.end).name || "");
    const startTime = formatTime(cursor);
    cursor += seconds * 1000;
    return {
      mode,
      mode_label: label,
      line_name: line,
      duration_minutes: Math.ceil(seconds / 60),
      start_time: startTime,
      end_time: formatTime(cursor),
      start_name: start,
      end_name: end,
      distance: number(leg.distance),
      time_type: "estimated",
      summary: line
        ? `${start || "정류장/역"}에서 ${line} 탑승, ${end || "도착 정류장/역"} 하차`
        : `${start ? `${start}에서 ` : ""}${end ? `${end}까지 ` : ""}${label}${
          route.estimated ? " (거리 기반 추정)" : ""
        }`,
    };
  });
}

export function buildResult(
  understanding: Understanding,
  plans: StopPlan[],
  candidate: Candidate,
  destination: Place,
): Raw {
  const { routes, minutes, stays, places } = candidate;
  let cursor = candidate.departureAt;
  const stops: Stop[] = [];
  const timeline: Raw[] = [{
    type: "start",
    label: "출발",
    time: formatTime(cursor),
    place: { name: "현재 위치" },
  }];
  for (let index = 0; index < routes.length; index++) {
    const stop = plans[index];
    timeline.push({
      type: "travel",
      label: stop ? `${stop.place_type}까지 이동` : "약속 장소까지 이동",
      duration_minutes: minutes[index],
      mode: routes[index].mode,
      details: legDetails(routes[index], cursor),
    });
    cursor += minutes[index] * MINUTE;
    if (stop) {
      const entry: Stop = {
        action: stop.action,
        purpose: stop.purpose,
        place_type: stop.place_type,
        place: places[index],
        arrive_time: formatTime(cursor),
        depart_time: formatTime(cursor + stays[index] * MINUTE),
        stay_minutes: stays[index],
      };
      stops.push(entry);
      timeline.push({
        type: "stop",
        label: entry.action,
        time: entry.arrive_time,
        depart_time: entry.depart_time,
        duration_minutes: entry.stay_minutes,
        place: entry.place,
      });
      cursor += stays[index] * MINUTE;
    }
  }
  const actualBuffer = Math.floor(
    (appointmentAt(understanding.appointment_time, candidate.departureAt) - cursor) / MINUTE,
  );
  timeline.push({
    type: "arrival",
    label: "약속 도착",
    time: formatTime(cursor),
    duration_minutes: actualBuffer,
    place: destination,
  });
  const representative = stops.at(-1);
  const totalTravel = minutes.reduce((sum, value) => sum + value, 0);
  const toPlace = representative ? minutes.slice(0, -1).reduce((sum, value) => sum + value, 0) : 0;
  const incoming = representative ? routes[routes.length - 2] : undefined;
  return {
    cafe: representative?.place || {},
    place: representative?.place || {},
    understanding,
    tasks: understanding.tasks,
    stops,
    timeline,
    total_travel_minutes: totalTravel,
    total_stay_minutes: stays.reduce((sum, value) => sum + value, 0),
    route: {
      to_place: incoming?.raw || {},
      to_cafe: incoming?.raw || {},
      to_destination: routes.at(-1)?.raw || {},
      destination,
      to_place_minutes: toPlace,
      to_destination_minutes: minutes.at(-1) || 0,
      travel_minutes: totalTravel,
      to_place_mode: incoming?.mode || null,
      to_destination_mode: routes.at(-1)?.mode || null,
    },
    stay_minutes: representative?.stay_minutes || 0,
    departure_time: formatTime(candidate.departureAt),
    planned_stay_minutes: representative?.stay_minutes || 0,
    arrival_buffer_minutes: understanding.arrival_buffer_minutes,
    actual_arrival_buffer_minutes: actualBuffer,
    arrival_time: formatTime(cursor),
    to_cafe_minutes: toPlace,
    cafe_arrive_time: representative?.arrive_time || "",
    cafe_depart_time: representative?.depart_time || "",
    to_dest_minutes: minutes.at(-1) || 0,
    buffer_minutes: understanding.arrival_buffer_minutes,
  };
}
