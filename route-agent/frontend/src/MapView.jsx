import { useEffect, useRef, useState } from "react";

const MARKER_IMAGE_SIZE = { width: 32, height: 36 };

export default function MapView({
  cafeLat,
  cafeLng,
  cafeName,
  stops = [],
  userLat,
  userLng,
  destLat,
  destLng,
  destName,
}) {
  const mapRef = useRef(null);
  const [error, setError] = useState("");
  const hasRequiredCoordinates = [userLat, userLng, destLat, destLng].every((value) =>
    Number.isFinite(Number(value))
  );
  const hasCafeCoordinates = [cafeLat, cafeLng].every((value) =>
    Number.isFinite(Number(value))
  );
  const hasCoordinates = hasRequiredCoordinates && (hasCafeCoordinates || stops.length === 0);

  useEffect(() => {
    if (!hasCoordinates) {
      return;
    }

    if (!window.kakao?.maps) {
      setError("카카오맵 SDK를 불러오지 못했습니다.");
      return;
    }

    window.kakao.maps.load(() => {
      const kakao = window.kakao;
      const userPosition = new kakao.maps.LatLng(Number(userLat), Number(userLng));
      const destPosition = new kakao.maps.LatLng(Number(destLat), Number(destLng));
      const cafePosition = hasCafeCoordinates
        ? new kakao.maps.LatLng(Number(cafeLat), Number(cafeLng))
        : destPosition;
      const stopPoints = stops
        .map((stop) => stop.place)
        .filter((place) => Number.isFinite(Number(place?.lat)) && Number.isFinite(Number(place?.lng)));

      const map = new kakao.maps.Map(mapRef.current, {
        center: cafePosition,
        level: 5,
      });
      const markerSize = new kakao.maps.Size(
        MARKER_IMAGE_SIZE.width,
        MARKER_IMAGE_SIZE.height
      );
      const blueMarker = createMarkerImage(kakao, "#38bdf8", markerSize);
      const redMarker = createMarkerImage(kakao, "#ef4444", markerSize);
      const purpleMarker = createMarkerImage(kakao, "#a78bfa", markerSize);
      const greenMarker = createMarkerImage(kakao, "#34d399", markerSize);

      new kakao.maps.Marker({
        map,
        position: userPosition,
        image: blueMarker,
        title: "현재 위치",
      });

      if (stopPoints.length > 0) {
        stopPoints.forEach((place, index) => {
          const position = new kakao.maps.LatLng(Number(place.lat), Number(place.lng));
          new kakao.maps.Marker({
            map,
            position,
            image: index === stopPoints.length - 1 ? redMarker : greenMarker,
            title: place.name || `경유지 ${index + 1}`,
          });
          new kakao.maps.InfoWindow({
            position,
            content: `<div style="padding:6px 10px;font-size:13px;color:#111;white-space:nowrap;">${index + 1}. ${escapeHtml(
              place.name || "경유지"
            )}</div>`,
          }).open(map);
        });
      } else if (hasCafeCoordinates) {
        new kakao.maps.Marker({
          map,
          position: cafePosition,
          image: redMarker,
          title: cafeName || "추천 장소",
        });
      }

      new kakao.maps.Marker({
        map,
        position: destPosition,
        image: purpleMarker,
        title: destName || "약속 장소",
      });

      if (stopPoints.length === 0 && hasCafeCoordinates) {
        const cafeInfoWindow = new kakao.maps.InfoWindow({
          position: cafePosition,
          content: `<div style="padding:6px 10px;font-size:13px;color:#111;white-space:nowrap;">${escapeHtml(
            cafeName || "추천 장소"
          )}</div>`,
        });
        cafeInfoWindow.open(map);
      }

      const destInfoWindow = new kakao.maps.InfoWindow({
        position: destPosition,
        content: `<div style="padding:6px 10px;font-size:13px;color:#111;white-space:nowrap;">${escapeHtml(
          destName || "목적지"
        )} 약속 장소</div>`,
      });
      destInfoWindow.open(map);

      const bounds = new kakao.maps.LatLngBounds();
      bounds.extend(userPosition);
      if (stopPoints.length > 0) {
        stopPoints.forEach((place) => {
          bounds.extend(new kakao.maps.LatLng(Number(place.lat), Number(place.lng)));
        });
      } else if (hasCafeCoordinates) {
        bounds.extend(cafePosition);
      }
      bounds.extend(destPosition);
      map.setBounds(bounds, 40, 40, 40, 40);
      setError("");
    });
  }, [cafeLat, cafeLng, cafeName, destLat, destLng, destName, hasCafeCoordinates, hasCoordinates, stops, userLat, userLng]);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 shadow-xl shadow-black/20">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">지도 위치</h2>
        <p className="mt-1 text-sm text-zinc-400">
          {hasCoordinates
            ? stops.length > 0 || cafeName
              ? `${cafeName || "경유지"} → ${destName || "약속 장소"}`
              : `현재 위치 → ${destName || "약속 장소"}`
            : "현재 위치와 목적지 좌표가 표시됩니다."}
        </p>
      </div>

      <div className="relative overflow-hidden rounded-md border border-zinc-800 bg-zinc-950">
        <div ref={mapRef} className="aspect-[4/3] w-full" />
        {(!hasCoordinates || error) && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950 text-sm text-zinc-500">
            {error || "좌표 없음"}
          </div>
        )}
      </div>
    </div>
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createMarkerImage(kakao, color, size) {
  const svg = `
    <svg width="32" height="36" viewBox="0 0 32 36" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 35C16 35 29 22.8 29 13.5C29 6.596 23.18 1 16 1C8.82 1 3 6.596 3 13.5C3 22.8 16 35 16 35Z" fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="16" cy="13.5" r="5" fill="white"/>
    </svg>
  `;

  return new kakao.maps.MarkerImage(
    `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    size,
    { offset: new kakao.maps.Point(16, 36) }
  );
}
