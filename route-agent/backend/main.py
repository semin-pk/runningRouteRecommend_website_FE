from typing import Any
from pathlib import Path

import logging
import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agents import APIConfigurationError, run_pipeline


load_dotenv(Path(__file__).resolve().with_name(".env"))
logging.basicConfig(level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,https://www.run2yourstyle.com",
        ).split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    query: str
    user_lat: float
    user_lng: float


class QueryResponse(BaseModel):
    cafe: dict[str, Any]
    route: dict[str, Any]
    tasks: list[dict[str, Any]]
    stops: list[dict[str, Any]]
    timeline: list[dict[str, Any]]
    total_travel_minutes: int
    total_stay_minutes: int
    stay_minutes: int
    departure_time: str
    planned_stay_minutes: int
    arrival_buffer_minutes: int
    arrival_time: str
    to_cafe_minutes: int
    cafe_arrive_time: str
    cafe_depart_time: str
    to_dest_minutes: int
    buffer_minutes: int
    message: str


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/query", response_model=QueryResponse)
async def query_route(request: QueryRequest) -> QueryResponse:
    try:
        result = await run_pipeline(request.query, request.user_lat, request.user_lng)
    except APIConfigurationError as exc:
        logger.warning("API configuration error: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return QueryResponse(**result)
