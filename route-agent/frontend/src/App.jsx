import { useState } from "react";

import MapView from "./MapView.jsx";
import ResultCard from "./ResultCard.jsx";
import Timeline from "./Timeline.jsx";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:8000"
).replace(/\/+$/, "");

export default function App() {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState(null);
  const [locationKeyword, setLocationKeyword] = useState("");
  const [locationResults, setLocationResults] = useState([]);
  const [result, setResult] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleUseLocation = () => {
    setError("");

    if (!navigator.geolocation) {
      setError("브라우저에서 현재 위치를 지원하지 않습니다.");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          user_lat: position.coords.latitude,
          user_lng: position.coords.longitude,
          label: "현재 위치",
        });
        setLocationResults([]);
        setIsLocating(false);
      },
      (geoError) => {
        const messageByCode = {
          1: "위치 권한이 거부되었습니다. 브라우저 주소창의 위치 권한을 허용하거나 위치 검색으로 지정해주세요.",
          2: "현재 위치를 확인할 수 없습니다. 잠시 후 다시 시도하거나 위치 검색으로 지정해주세요.",
          3: "현재 위치 확인 시간이 초과되었습니다. 위치 검색으로 직접 지정할 수 있습니다.",
        };
        setError(messageByCode[geoError.code] || "현재 위치를 가져오지 못했습니다.");
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSearchLocation = async () => {
    setError("");
    setLocationResults([]);

    if (!locationKeyword.trim()) {
      setError("현재 위치로 사용할 장소를 입력해주세요.");
      return;
    }

    if (!window.kakao?.maps) {
      setError("카카오맵 SDK를 불러오지 못했습니다. VITE_KAKAO_MAP_KEY를 확인해주세요.");
      return;
    }

    setIsSearchingLocation(true);

    window.kakao.maps.load(() => {
      const places = new window.kakao.maps.services.Places();
      places.keywordSearch(locationKeyword, (data, status) => {
        setIsSearchingLocation(false);

        if (status !== window.kakao.maps.services.Status.OK) {
          setError("검색 결과가 없습니다. 더 구체적인 장소명으로 다시 검색해주세요.");
          return;
        }

        setLocationResults(
          data.slice(0, 5).map((place) => ({
            id: place.id,
            name: place.place_name,
            address: place.road_address_name || place.address_name,
            user_lat: Number(place.y),
            user_lng: Number(place.x),
          }))
        );
      });
    });
  };

  const handleSelectLocation = (place) => {
    setLocation({
      user_lat: place.user_lat,
      user_lng: place.user_lng,
      label: place.name,
    });
    setLocationKeyword(place.name);
    setLocationResults([]);
    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setResult(null);

    if (!query.trim()) {
      setError("어떤 경로를 찾을지 자연어로 입력해주세요.");
      return;
    }

    if (!location) {
      setError("먼저 현재 위치를 가져와주세요.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          user_lat: location.user_lat,
          user_lng: location.user_lng,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(
          typeof errorBody?.detail === "string"
            ? errorBody.detail
            : "경로 추천 요청에 실패했습니다."
        );
      }

      setResult(await response.json());
    } catch (err) {
      setError(err.message || "알 수 없는 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 px-5 py-8 text-zinc-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 shadow-xl shadow-black/20">
          <div className="mb-5">
            <h1 className="text-2xl font-semibold">Route Agent</h1>
            <p className="mt-2 text-sm text-zinc-400">
              약속 전 들를 장소와 이동 시간을 한 번에 계산합니다.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              rows={4}
              className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
              placeholder="예: 서울역에 16:00 약속이 있는데 꽃 선물을 사서 가고 싶어"
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={handleUseLocation}
                disabled={isLocating}
                className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLocating ? "위치 확인 중..." : "현재 위치 사용"}
              </button>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                {location && (
                  <span className="text-xs text-zinc-400">
                    {location.label} · {location.user_lat.toFixed(5)},{" "}
                    {location.user_lng.toFixed(5)}
                  </span>
                )}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="rounded-md bg-emerald-400 px-5 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  경로 찾기
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={locationKeyword}
                  onChange={(event) => setLocationKeyword(event.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
                  placeholder="위치 검색: 강남역, 서울시청, 홍대입구"
                />
                <button
                  type="button"
                  onClick={handleSearchLocation}
                  disabled={isSearchingLocation}
                  className="rounded-md bg-sky-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSearchingLocation ? "검색 중..." : "위치 검색"}
                </button>
              </div>

              {locationResults.length > 0 && (
                <div className="mt-3 overflow-hidden rounded-md border border-zinc-800">
                  {locationResults.map((place) => (
                    <button
                      key={place.id}
                      type="button"
                      onClick={() => handleSelectLocation(place)}
                      className="block w-full border-b border-zinc-800 px-4 py-3 text-left transition last:border-b-0 hover:bg-zinc-900"
                    >
                      <span className="block text-sm font-medium text-zinc-100">
                        {place.name}
                      </span>
                      <span className="mt-1 block text-xs text-zinc-500">
                        {place.address}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </form>

          {error && (
            <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}
        </section>

        {isLoading && (
          <div className="flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 p-10">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
          </div>
        )}

        {result && !isLoading && (
          <section className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
            <div className="space-y-5">
              <ResultCard
                cafe={result.cafe}
                stops={result.stops}
                message={result.message}
                stay_minutes={result.stay_minutes}
                departure_time={result.departure_time}
                planned_stay_minutes={result.planned_stay_minutes}
                arrival_buffer_minutes={result.arrival_buffer_minutes}
                arrival_time={result.arrival_time}
              />
              {/* Timeline is intentionally placed below ResultCard for step-by-step route review. */}
              <Timeline
                timeline={result.timeline}
                departNow
                toCafeMinutes={result.to_cafe_minutes}
                cafeArriveTime={result.cafe_arrive_time}
                stayMinutes={result.stay_minutes}
                cafeDepartTime={result.cafe_depart_time}
                toDestMinutes={result.to_dest_minutes}
                arrivalTime={result.arrival_time}
                bufferMinutes={result.buffer_minutes}
              />
            </div>
            {/* Destination marker props come from backend response: result.route.destination.{lat,lng,name}. */}
            <MapView
              cafeLat={result.cafe?.lat}
              cafeLng={result.cafe?.lng}
              cafeName={result.cafe?.name}
              stops={result.stops}
              userLat={location?.user_lat}
              userLng={location?.user_lng}
              destLat={result.route?.destination?.lat}
              destLng={result.route?.destination?.lng}
              destName={result.route?.destination?.name}
            />
          </section>
        )}
      </div>
    </main>
  );
}
