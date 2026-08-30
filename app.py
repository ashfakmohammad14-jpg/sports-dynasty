import os
import sys
import json
import time
import hashlib
from datetime import datetime
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse, Response
from fastapi.middleware.gzip import GZipMiddleware
from espn_client import espn_service

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")
ANALYTICS_FILE = os.path.join(BASE_DIR, "analytics_data.json")

app = FastAPI(
    title="Sports Dynasty - Live Cricket Platform",
    description="Real-Time Cricket Scorecards, News, Series Standings, ICC Rankings & Live Visitor Analytics",
    version="3.5.0"
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

# -------------------------------------------------------------
# VISITOR ANALYTICS & HIT TRACKER ENGINE
# -------------------------------------------------------------
def load_analytics() -> dict:
    if os.path.exists(ANALYTICS_FILE):
        try:
            with open(ANALYTICS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "total_visits": 1420,
        "today_date": datetime.now().strftime("%Y-%m-%d"),
        "today_visits": 184,
        "unique_visitors": {},
        "active_sessions": {}
    }

def save_analytics(data: dict):
    try:
        with open(ANALYTICS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass

@app.post("/api/analytics/track")
@app.get("/api/analytics/track")
async def track_visitor(request: Request):
    """Track unique visitor session and increment live view counters."""
    client_ip = request.client.host if request.client else "127.0.0.1"
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    ip_hash = hashlib.md5(client_ip.encode()).hexdigest()[:12]
    
    data = load_analytics()
    today_str = datetime.now().strftime("%Y-%m-%d")
    if data.get("today_date") != today_str:
        data["today_date"] = today_str
        data["today_visits"] = 0
    
    now_ts = time.time()
    last_seen = data.get("unique_visitors", {}).get(ip_hash, 0)
    
    # Increment total visit if new session (> 30 mins)
    if (now_ts - last_seen) > 1800:
        data["total_visits"] = data.get("total_visits", 1420) + 1
        data["today_visits"] = data.get("today_visits", 184) + 1
    
    if "unique_visitors" not in data:
        data["unique_visitors"] = {}
    data["unique_visitors"][ip_hash] = now_ts
    
    if "active_sessions" not in data:
        data["active_sessions"] = {}
    data["active_sessions"][ip_hash] = now_ts
    
    # Clean up sessions older than 5 minutes for active online counter
    data["active_sessions"] = {k: v for k, v in data["active_sessions"].items() if now_ts - v < 300}
    
    save_analytics(data)
    
    active_count = max(len(data["active_sessions"]), 1)
    return JSONResponse(content={
        "total_visits": data.get("total_visits", 1420),
        "today_visits": data.get("today_visits", 184),
        "active_online": active_count
    })

@app.get("/api/analytics/stats")
async def get_analytics_stats():
    """Return visitor counts and live active user count."""
    data = load_analytics()
    now_ts = time.time()
    active_sessions = {k: v for k, v in data.get("active_sessions", {}).items() if now_ts - v < 300}
    active_count = max(len(active_sessions), 1)
    return JSONResponse(content={
        "total_visits": data.get("total_visits", 1420),
        "today_visits": data.get("today_visits", 184),
        "active_online": active_count
    })

def get_file_content(filename: str, subfolder: str = "") -> tuple[str, str]:
    candidates = [
        os.path.join(BASE_DIR, subfolder, filename) if subfolder else None,
        os.path.join(BASE_DIR, filename),
        os.path.join(TEMPLATES_DIR, filename),
        os.path.join(STATIC_DIR, filename),
        os.path.join(STATIC_DIR, "js", filename),
        os.path.join(STATIC_DIR, "css", filename)
    ]
    for p in candidates:
        if p and os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    return f.read(), p
            except Exception:
                pass
    return "", ""

@app.get("/", response_class=HTMLResponse)
async def serve_dashboard(request: Request):
    """Serve the Sports Dynasty Cricket Web Platform."""
    content, _ = get_file_content("index.html", "templates")
    if content:
        return HTMLResponse(content=content)
    return HTMLResponse(content="""<!DOCTYPE html><html><head><title>Sports Dynasty</title></head><body style="background:#064e3b;color:#fff;font-family:sans-serif;text-align:center;padding:50px;"><h2>🏏 Sports Dynasty Cricket Platform</h2><p>Loading application resources...</p></body></html>""")

@app.get("/static/js/{path:path}")
@app.get("/js/{path:path}")
@app.get("/dashboard.js")
async def serve_js(path: str = "dashboard.js"):
    content, _ = get_file_content("dashboard.js", "static/js")
    return Response(content=content, media_type="application/javascript")

@app.get("/static/css/{path:path}")
@app.get("/css/{path:path}")
@app.get("/custom.css")
async def serve_css(path: str = "custom.css"):
    content, _ = get_file_content("custom.css", "static/css")
    return Response(content=content, media_type="text/css")

@app.get("/static/manifest.json")
@app.get("/manifest.json")
async def serve_manifest():
    content, _ = get_file_content("manifest.json", "static")
    return Response(content=content, media_type="application/json")

@app.get("/static/sw.js")
@app.get("/sw.js")
async def serve_sw():
    content, _ = get_file_content("sw.js", "static")
    return Response(content=content, media_type="application/javascript")

@app.get("/api/matches")
async def get_matches():
    """Return all live, recent, and upcoming matches."""
    try:
        data = espn_service.get_live_matches()
        return JSONResponse(content=data)
    except Exception as e:
        return JSONResponse(content={"total": 0, "matches": [], "categories": {"live": [], "recent": [], "upcoming": []}, "error": str(e)})

@app.get("/api/match/{league_id}/{event_id}")
async def get_match_details(league_id: str, event_id: str):
    """Return detailed scorecard, timeline, squad, and analytics for a match."""
    try:
        summary = espn_service.get_match_summary(league_id, event_id)
        return JSONResponse(content=summary)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/api/player/{player_id}")
async def get_player_profile(player_id: str, name: str = ""):
    """Return detailed player profile and stats for any cricket player."""
    try:
        profile = espn_service.get_player_profile(player_id, name)
        if not profile or not profile.get("name"):
            return JSONResponse(status_code=404, content={"error": "Player not found"})
        return JSONResponse(content=profile)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/api/players/search")
async def search_players(q: str = ""):
    """Search for any cricket player worldwide."""
    try:
        results = espn_service.search_players(q)
        return JSONResponse(content={"players": results})
    except Exception as e:
        return JSONResponse(content={"players": []})

@app.get("/api/news")
async def get_news():
    """Return real-time breaking cricket news."""
    try:
        data = espn_service.get_latest_news()
        return JSONResponse(content={"articles": data})
    except Exception as e:
        return JSONResponse(content={"articles": []})

@app.get("/api/rankings")
async def get_rankings():
    """Return official ICC Team and Player rankings."""
    try:
        data = espn_service.get_icc_rankings()
        return JSONResponse(content=data)
    except Exception as e:
        return JSONResponse(content={})

@app.get("/api/teams")
async def get_teams():
    """Return international teams directory and info."""
    try:
        data = espn_service.get_teams_directory()
        return JSONResponse(content={"teams": data})
    except Exception as e:
        return JSONResponse(content={"teams": []})

@app.get("/api/series")
async def get_series():
    """Return featured tournaments, series, and standings."""
    try:
        data = espn_service.get_featured_series()
        return JSONResponse(content={"series": data})
    except Exception as e:
        return JSONResponse(content={"series": []})

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "Sports Dynasty Live API"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print("=" * 60)
    print("  SPORTS DYNASTY CRICKET PLATFORM")
    print(f"  Server running at: http://0.0.0.0:{port}")
    print("=" * 60)
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
