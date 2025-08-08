from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, List
from datetime import datetime, date, timezone, timedelta
from uuid import uuid4
import os, re
from motor.motor_asyncio import AsyncIOMotorClient
import httpx
import math

import asyncio
from typing import Tuple, Dict, Any

from dotenv import load_dotenv
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME")
COLL_C = os.getenv("COLL_C", "vaskeliste_completions")
COLL_P = os.getenv("COLL_P", "vaskeliste_penalties")
COLL_M = os.getenv("COLL_M", "members")
COLL_N = os.getenv("COLL_N", "notifications")

MEMBERS = os.getenv("MEMBERS", "").split(",") if os.getenv("MEMBERS") else []
CHORES = os.getenv("CHORES", "").split(",") if os.getenv("CHORES") else []
BASE_MONDAY = date.fromisoformat(os.getenv("BASE_MONDAY"))

ENTUR_CLIENT = os.getenv("ENTUR_CLIENT")
ENTUR_GQL = "https://api.entur.io/journey-planner/v3/graphql"

MET_UA = os.getenv("MET_USER_AGENT")
MET_URL = "https://api.met.no/weatherapi/locationforecast/2.0/compact"

STOP_PLACES = {
    name: code for name, code in (
        (n.strip(), c.strip())
        for pair in (p.split("=") for p in os.getenv("STOP_PLACES", "").split(",") if "=" in p)
        for n, c in [pair]
    )
}


app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

client = AsyncIOMotorClient(MONGO_URI)
db = client[DB_NAME]
coll_c = db[COLL_C]
coll_p = db[COLL_P]
coll_m = db[COLL_M]
coll_n = db[COLL_N]

class CompleteIn(BaseModel):
    week: Optional[str] = None
    chore: str
    assignee: str

class CompletionOut(BaseModel):
    id: str
    week: str
    chore: str
    assignee: str
    ts: datetime

class MemberUpdate(BaseModel):
    phone: Optional[str] = None
    notify_sms: Optional[bool] = None

def monday_from_week(week: Optional[str]) -> date:
    if not week:
        y, w, _ = datetime.now().date().isocalendar()
    else:
        m = re.fullmatch(r"(\d{4})-W(\d{2})", week)
        if not m: raise HTTPException(400, "week must be YYYY-Www")
        y, w = int(m.group(1)), int(m.group(2))
    return date.fromisocalendar(y, w, 1)

def iso_week_str(d: date) -> str:
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"

def assign_for_week(monday: date):
    weeks = (monday - BASE_MONDAY).days // 7
    shift = weeks % len(MEMBERS)
    rotated = MEMBERS[shift:] + MEMBERS[:shift]
    return [{"chore": c, "assignee": rotated[i % len(rotated)]} for i, c in enumerate(CHORES)]

async def points_by_member() -> Dict[str, int]:
    pipeline = [{"$group": {"_id": "$assignee", "cnt": {"$sum": 1}}}]
    out = {m: 0 for m in MEMBERS}
    async for row in coll_p.aggregate(pipeline):
        out[row["_id"]] = row["cnt"]
    return out

@app.get("/api/vaskeliste")
async def get_vaskeliste(week: Optional[str] = None):
    monday = monday_from_week(week)
    week_id = iso_week_str(monday)
    assignments = assign_for_week(monday)
    done = await coll_c.find({"week": week_id}).to_list(100)
    done_map = {(d["chore"], d["assignee"]): str(d["_id"]) for d in done}
    items = [{"chore": a["chore"], "assignee": a["assignee"],
              "completed": (a["chore"], a["assignee"]) in done_map,
              "completionId": done_map.get((a["chore"], a["assignee"]))} for a in assignments]
    pts = await points_by_member()
    return {"week": week_id, "monday": monday.isoformat(), "assignments": items, "pointsByMember": pts}

@app.post("/api/vaskeliste/complete", response_model=CompletionOut)
async def complete(body: CompleteIn):
    monday = monday_from_week(body.week)
    week_id = iso_week_str(monday)
    exists = await coll_c.find_one({"week": week_id, "chore": body.chore, "assignee": body.assignee})
    if exists: raise HTTPException(409, "Already completed")
    doc = {"_id": str(uuid4()), "week": week_id, "chore": body.chore, "assignee": body.assignee, "ts": datetime.now(timezone.utc)}
    await coll_c.insert_one(doc)
    return {"id": doc["_id"], **{k: doc[k] for k in ("week", "chore", "assignee", "ts")}}

@app.delete("/api/vaskeliste/complete/{completion_id}")
async def undo(completion_id: str):
    res = await coll_c.delete_one({"_id": completion_id})
    if res.deleted_count == 0: raise HTTPException(404, "Not found")
    return {"ok": True}

@app.post("/api/vaskeliste/rollover")
async def rollover(week: Optional[str] = None):
    if not week:
        today = datetime.now().date()
        prev_monday = monday_from_week(f"{(today - timedelta(days=7)).isocalendar().year}-W{(today - timedelta(days=7)).isocalendar().week:02d}")
        monday = prev_monday
    else:
        monday = monday_from_week(week)
    week_id = iso_week_str(monday)
    assignments = assign_for_week(monday)
    done = await coll_c.find({"week": week_id}).to_list(100)
    done_set = {(d["chore"], d["assignee"]) for d in done}
    missed = [a for a in assignments if (a["chore"], a["assignee"]) not in done_set]
    created = []
    for a in missed:
        exists = await coll_p.find_one({"week": week_id, "chore": a["chore"], "assignee": a["assignee"], "reason": "missed"})
        if exists: continue
        pid = str(uuid4())
        pen = {"_id": pid, "week": week_id, "chore": a["chore"], "assignee": a["assignee"], "reason": "missed", "ts": datetime.now(timezone.utc)}
        await coll_p.insert_one(pen)
        member = await coll_m.find_one({"name": a["assignee"]}) or {}
        if member.get("notify", {}).get("sms") and member.get("phone"):
            msg = f"Vaskeliste: du fikk 1 prikker for uke {week_id} (manglet: {a['chore']})."
            ndoc = {"_id": str(uuid4()), "to": member["phone"], "channel": "sms", "body": msg,
                    "scheduledAt": datetime.now(timezone.utc), "meta": {"week": week_id, "assignee": a["assignee"], "chore": a["chore"]}}
            await coll_n.insert_one(ndoc)
        created.append(pen["_id"])
    return {"week": week_id, "penaltiesCreated": created, "missedCount": len(created)}

@app.get("/api/vaskeliste/penalties")
async def list_penalties(assignee: Optional[str] = None, limit: int = 100):
    q = {"assignee": assignee} if assignee else {}
    cur = coll_p.find(q).sort("ts", -1).limit(limit)
    out = []
    async for d in cur:
        out.append({"id": d["_id"], "week": d["week"], "chore": d["chore"], "assignee": d["assignee"], "reason": d["reason"], "ts": d["ts"]})
    return {"items": out}

@app.put("/api/members/{name}")
async def update_member(name: str, body: MemberUpdate):
    update = {}
    if body.phone is not None: update["phone"] = body.phone
    if body.notify_sms is not None: update.setdefault("notify", {})["sms"] = body.notify_sms
    if not update: return {"ok": True}
    await coll_m.update_one({"name": name}, {"$set": update}, upsert=True)
    return {"ok": True}


async def entur_gql(query: str, variables: dict) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            ENTUR_GQL,
            headers={"Content-Type": "application/json", "ET-Client-Name": ENTUR_CLIENT},
            json={"query": query, "variables": variables},
        )
    body = r.json()
    if r.status_code != 200:
        print("Entur HTTP", r.status_code, body)
        raise HTTPException(502, f"Entur GQL {r.status_code}")
    if body.get("errors"):
        # don't crash the whole endpoint; let caller degrade gracefully
        print("Entur GQL errors:", body["errors"])
        return {"stopPlace": None}
    return body["data"]


async def fetch_departures_for_stop(stop_place_id: str, name_hint: str) -> dict:
    q = """
    query($id: String!, $start: DateTime!, $range: Int!, $n: Int!) {
      stopPlace(id: $id) {
        name
        quays {
          estimatedCalls(startTime: $start, timeRange: $range, numberOfDepartures: $n) {
            aimedDepartureTime
            expectedDepartureTime
            destinationDisplay { frontText }
            serviceJourney { line { publicCode name } }
          }
        }
      }
    }
    """
    now_iso = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    data = await entur_gql(q, {"id": stop_place_id, "start": now_iso, "range": 7200, "n": 12})
    sp = (data or {}).get("stopPlace")
    if not sp:
        return {"id": stop_place_id, "name": name_hint, "departures": []}

    now_ms = datetime.now(timezone.utc).timestamp() * 1000
    calls = []
    for quay in sp.get("quays") or []:
        for c in quay.get("estimatedCalls") or []:
            t = c.get("expectedDepartureTime") or c.get("aimedDepartureTime")
            if not t:
                continue
            ms = int(datetime.fromisoformat(t.replace("Z", "+00:00")).timestamp() * 1000 - now_ms)
            minutes = max(0, round(ms / 60000))
            line = ((c.get("serviceJourney") or {}).get("line") or {}).get("publicCode") or ""
            dest = (c.get("destinationDisplay") or {}).get("frontText") or ((c.get("serviceJourney") or {}).get("line") or {}).get("name") or ""
            calls.append({"line": line, "destination": dest, "time": t, "minutes": minutes})
    calls.sort(key=lambda d: d["minutes"])
    return {"id": stop_place_id, "name": sp.get("name") or name_hint, "departures": calls[:8]}

@app.get("/api/bus")
async def get_bus(stops: Optional[str] = None):
    names = [s.strip() for s in (stops or "Kvamstykket,Seminarbakken").split(",") if s.strip()]
    out = []
    for n in names:
        spid = STOP_PLACES.get(n)
        if not spid:
            out.append({"id": None, "name": n, "departures": []})
            continue
        out.append(await fetch_departures_for_stop(spid, n))
    return {"stops": out}

_WEATHER_CACHE: Dict[str, Dict[str, Any]] = {}
_WEATHER_LOCKS: Dict[str, asyncio.Lock] = {}


def _wx_key(lat: float, lon: float) -> str:
    # round to coalesce nearby requests (MET likes this)
    return f"{round(lat, 4)},{round(lon, 4)}"

def _get_lock(key: str) -> asyncio.Lock:
    lock = _WEATHER_LOCKS.get(key)
    if lock is None:
        lock = asyncio.Lock()
        _WEATHER_LOCKS[key] = lock
    return lock

async def fetch_met_compact(lat: float, lon: float, min_interval_sec: int = 600) -> dict:
    key = _wx_key(lat, lon)
    lock = _get_lock(key)
    async with lock:
        now = datetime.now(timezone.utc)
        entry = _WEATHER_CACHE.get(key)

        # Serve cached if we're inside min interval or we have a backoff in place
        if entry:
            if entry.get("next_allowed_at") and now < entry["next_allowed_at"]:
                return entry["data"]
            if entry.get("fetched_at") and (now - entry["fetched_at"]).total_seconds() < min_interval_sec:
                return entry["data"]

        headers = {"User-Agent": MET_UA, "Accept": "application/json"}
        if entry and entry.get("etag"):
            headers["If-None-Match"] = entry["etag"]

        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(MET_URL, params={"lat": lat, "lon": lon}, headers=headers)

        # 304 -> unchanged, keep cache
        if r.status_code == 304 and entry and entry.get("data"):
            entry["fetched_at"] = now
            _WEATHER_CACHE[key] = entry
            return entry["data"]

        # 429 -> rate limited: set backoff and return last good if we have it
        if r.status_code == 429:
            retry_after = r.headers.get("Retry-After")
            try:
                secs = int(retry_after) if retry_after else 600
            except ValueError:
                secs = 600
            backoff_until = now + timedelta(seconds=secs)
            if entry and entry.get("data"):
                entry["next_allowed_at"] = backoff_until
                _WEATHER_CACHE[key] = entry
                return entry["data"]
            raise HTTPException(502, "met.no rate limited and no cache yet")

        if r.status_code != 200:
            # fall back to cache if available
            if entry and entry.get("data"):
                return entry["data"]
            raise HTTPException(502, f"met.no {r.status_code}")

        data = r.json()
        etag = r.headers.get("ETag")

        _WEATHER_CACHE[key] = {
            "etag": etag,
            "data": data,
            "fetched_at": now,
            "next_allowed_at": None,
        }
        return data

def parse_met_compact(data: dict, hours: int = 12) -> dict:
    ts = (data.get("properties") or {}).get("timeseries") or []
    if not ts:
        return {"current": None, "hourly": []}
    now = ts[0]
    def sym(row: dict) -> Tuple[Optional[str], Optional[dict]]:
        n1 = (row["data"].get("next_1_hours") or {})
        n6 = (row["data"].get("next_6_hours") or {})
        s = (n1.get("summary") or {}).get("symbol_code") or (n6.get("summary") or {}).get("symbol_code")
        d = (n1.get("details") or {}) or (n6.get("details") or {})
        return s, d

    s0, d0 = sym(now)
    cur = {
        "time": now["time"],
        "temp": now["data"]["instant"]["details"].get("air_temperature"),
        "wind": now["data"]["instant"]["details"].get("wind_speed"),
        "windDir": now["data"]["instant"]["details"].get("wind_from_direction"),
        "precip": (d0 or {}).get("precipitation_amount"),
        "symbol": s0,
    }
    hourly = []
    for row in ts[: max(1, min(hours, 24))]:
        s, d = sym(row)
        inst = row["data"]["instant"]["details"]
        hourly.append({
            "time": row["time"],
            "temp": inst.get("air_temperature"),
            "wind": inst.get("wind_speed"),
            "windDir": inst.get("wind_from_direction"),
            "precip": (d or {}).get("precipitation_amount"),
            "symbol": s,
        })
    return {"current": cur, "hourly": hourly}

@app.get("/api/weather")
async def api_weather(lat: Optional[float] = None, lon: Optional[float] = None, hours: int = 12):
    # Defaults: Tromsø sentrum
    lat = lat if lat is not None else 69.6496
    lon = lon if lon is not None else 18.9560
    raw = await fetch_met_compact(lat, lon, min_interval_sec=600)
    parsed = parse_met_compact(raw, hours=hours)
    return {"lat": lat, "lon": lon, **parsed}