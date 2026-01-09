// src/utils/theme.ts

export type WeatherGroup = "clear" | "cloudy" | "rainy" | "snowy";
export type ThemeId =
  | "morning_clear"
  | "day_clear"
  | "evening_clear"
  | "night_clear"
  | "rainy";

export function mapWeatherCodeToGroup(code: number | null): WeatherGroup {
  if (code == null) return "clear";

  // Open-Meteo weather codes (요약 매핑)
  // 0: clear
  // 1-3: partly cloudy ~ overcast
  // 45,48: fog
  // 51-57: drizzle
  // 61-67: rain
  // 71-77: snow
  // 80-82: rain showers
  // 85-86: snow showers
  // 95-99: thunderstorm
  if (code === 0) return "clear";
  if ([1, 2, 3, 45, 48].includes(code)) return "cloudy";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99)) return "rainy";
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return "snowy";
  return "cloudy";
}

function getTimeBucket(date = new Date()): "morning" | "day" | "evening" | "night" {
  const h = date.getHours();
  if (h >= 5 && h < 10) return "morning";
  if (h >= 10 && h < 17) return "day";
  if (h >= 17 && h < 20) return "evening";
  return "night";
}

export function decideThemeId(group: WeatherGroup, date = new Date()): ThemeId {
  // 비/눈은 시간대 무시하고 rainy로 통합(단순 + 안정적)
  if (group === "rainy" || group === "snowy") return "rainy";

  const bucket = getTimeBucket(date);
  if (bucket === "morning") return "morning_clear";
  if (bucket === "day") return "day_clear";
  if (bucket === "evening") return "evening_clear";
  return "night_clear";
}

export function applyThemeId(themeId: ThemeId) {
  document.documentElement.dataset.theme = themeId;
}

/**
 * 테마와 날씨 그룹에 따른 한 줄 카피 생성
 */
export function getHeroMessage(themeId: ThemeId, weatherGroup: WeatherGroup): string {
  // 비/눈은 무조건 rainy 카피로
  if (weatherGroup === "rainy" || weatherGroup === "snowy") {
    return "☔ 오늘은 무리하지 말고, 짧고 안전하게 달려요";
  }

  // themeId에 따른 카피
  switch (themeId) {
    case "night_clear":
      return "🌙 지금, 야간 러닝하기 좋은 시간이에요";
    case "evening_clear":
      return "🌆 노을 질 때 가볍게 한 바퀴 어때요?";
    case "morning_clear":
      return "☀️ 상쾌한 아침이에요. 가볍게 시작해볼까요?";
    case "day_clear":
      return "🏃 오늘 컨디션에 맞춰 코스를 골라볼까요?";
    case "rainy":
      return "☔ 오늘은 무리하지 말고, 짧고 안전하게 달려요";
    default:
      return "🏃 오늘 컨디션에 맞춰 코스를 골라볼까요?";
  }
}

