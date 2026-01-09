// src/utils/weatherCache.ts

type CacheEntry = {
  timestamp: number;
  weatherCode: number | null;
  temperature: number | null;
};

const CACHE_TTL_MS = 120 * 1000; // 120초
const CACHE_PREFIX = 'weather_cache_';

/**
 * 좌표를 캐시 키로 변환 (소수점 5자리로 반올림)
 */
function getCacheKey(lat: number, lng: number): string {
  const roundedLat = Math.round(lat * 100000) / 100000;
  const roundedLng = Math.round(lng * 100000) / 100000;
  return `${CACHE_PREFIX}${roundedLat}_${roundedLng}`;
}

/**
 * 캐시에서 날씨 데이터 조회
 */
export function getCachedWeather(lat: number, lng: number): CacheEntry | null {
  try {
    const key = getCacheKey(lat, lng);
    const cached = sessionStorage.getItem(key);
    
    if (!cached) return null;
    
    const entry: CacheEntry = JSON.parse(cached);
    const now = Date.now();
    
    // TTL 체크
    if (now - entry.timestamp > CACHE_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    
    return entry;
  } catch (error) {
    console.warn('캐시 읽기 실패:', error);
    return null;
  }
}

/**
 * 날씨 데이터를 캐시에 저장
 */
export function setCachedWeather(
  lat: number,
  lng: number,
  weatherCode: number | null,
  temperature: number | null
): void {
  try {
    const key = getCacheKey(lat, lng);
    const entry: CacheEntry = {
      timestamp: Date.now(),
      weatherCode,
      temperature,
    };
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    console.warn('캐시 저장 실패:', error);
  }
}

