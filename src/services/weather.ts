// src/services/weather.ts

export type OpenMeteoResponse = {
  current?: {
    weather_code?: number;
    temperature_2m?: number;
  };
};

export async function fetchCurrentWeather(
  lat: number,
  lng: number,
  signal?: AbortSignal
) {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&current=weather_code,temperature_2m` +
    `&timezone=Asia%2FSeoul`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Weather API failed: ${res.status}`);
  }

  const data = (await res.json()) as OpenMeteoResponse;

  return {
    weatherCode: data.current?.weather_code ?? null,
    temperature: data.current?.temperature_2m ?? null,
  };
}


