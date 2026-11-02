export type Raw = Record<string, unknown>;

export interface Query {
  query: string;
  user_lat: number;
  user_lng: number;
}

export interface Task {
  action: string;
  purpose: string;
  conditions: string[];
  order: number;
  requested_stay_minutes: number | null;
  place_type_hint: string;
}

export interface Understanding extends Query {
  destination: string;
  appointment_time: string;
  departure_time: string | null;
  arrival_buffer_minutes: number;
  search_area: "route" | "destination" | "origin";
  tasks: Task[];
}

export interface Place {
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone: string;
  place_type?: string;
  place_url?: string;
  category_name?: string;
}

export interface StopPlan {
  action: string;
  purpose: string;
  task: Task;
  place_type: string;
  stay_minutes: number;
  candidates: Place[];
}

export interface Stop {
  action: string;
  purpose: string;
  place_type: string;
  place: Place;
  arrive_time: string;
  depart_time: string;
  stay_minutes: number;
}

export interface Route {
  mode: "WALK" | "TRANSIT";
  seconds: number;
  legs: Raw[];
  raw: Raw;
  estimated: boolean;
}

export interface Candidate {
  places: Place[];
  routes: Route[];
  minutes: number[];
  stays: number[];
  departureAt: number;
  arrivalAt: number;
}

export interface Context {
  fetch: typeof globalThis.fetch;
  env: (name: string) => string | undefined;
  now: () => number;
  signal: AbortSignal;
  deadline: number;
  routeCache: Map<string, Promise<Route>>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export function record(value: unknown): Raw {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Raw : {};
}

export function records(value: unknown): Raw[] {
  return Array.isArray(value) ? value.filter((item) => Object.keys(record(item)).length > 0) : [];
}

export function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function number(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
