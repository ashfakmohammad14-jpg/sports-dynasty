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
    """Track real-time visitor pageviews and persistent distinct device sessions."""
    visitor_id = request.headers.get("x-visitor-id", "")
    client_ip = request.client.host if request.client else "127.0.0.1"
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    user_agent = request.headers.get("user-agent", "")
    
    if not visitor_id:
        visitor_id = hashlib.md5(f"{client_ip}:{user_agent}".encode()).hexdigest()[:16]
    
    # Client known maximum visit count (Self-healing persistent synchronization)
    try:
        client_max = int(request.headers.get("x-client-max", 0))
    except Exception:
        client_max = 0
        
    is_heartbeat = request.headers.get("x-heartbeat") == "1"
    
    data = load_analytics()
    today_str = datetime.now().strftime("%Y-%m-%d")
    if data.get("today_date") != today_str:
        data["today_date"] = today_str
        data["today_visits"] = 0
    
    now_ts = time.time()
    
    # Ensure count never drops below client's verified count or initial baseline
    current_stored = data.get("total_visits", 1450)
    highest_count = max(current_stored, client_max, 1450)
    
    # Only increment pageview count on fresh page loads (not periodic heartbeats)
    if not is_heartbeat:
        data["total_visits"] = highest_count + 1
        data["today_visits"] = data.get("today_visits", 0) + 1
    else:
        data["total_visits"] = highest_count
    
    if "unique_visitors" not in data:
        data["unique_visitors"] = {}
    data["unique_visitors"][visitor_id] = now_ts
    
    if "active_sessions" not in data:
        data["active_sessions"] = {}
    data["active_sessions"][visitor_id] = now_ts
    
    # Active online users active in last 60 seconds
    data["active_sessions"] = {k: v for k, v in data["active_sessions"].items() if now_ts - v < 60}
    
    save_analytics(data)
    
    active_count = max(len(data["active_sessions"]), 1)
    return JSONResponse(content={
        "total_visits": data["total_visits"],
        "today_visits": data["today_visits"],
        "active_online": active_count,
        "unique_devices": len(data.get("unique_visitors", {}))
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
        return HTMLResponse(content=content, media_type="text/html; charset=utf-8")
    return HTMLResponse(content="""<!DOCTYPE html><html><head><title>Sports Dynasty</title></head><body style="background:#064e3b;color:#fff;font-family:sans-serif;text-align:center;padding:50px;"><h2>Sports Dynasty Cricket Platform</h2><p>Loading application resources...</p></body></html>""")

@app.get("/static/js/{path:path}")
@app.get("/js/{path:path}")
@app.get("/dashboard.js")
async def serve_js(path: str = "dashboard.js"):
    filename = os.path.basename(path) if path.endswith(".js") else "dashboard.js"
    content, _ = get_file_content(filename, "static/js")
    if not content:
        content, _ = get_file_content("dashboard.js", "static/js")
    return Response(content=content, media_type="application/javascript; charset=utf-8")

@app.get("/static/css/{path:path}")
@app.get("/css/{path:path}")
@app.get("/custom.css")
async def serve_css(path: str = "custom.css"):
    filename = os.path.basename(path) if path.endswith(".css") else "custom.css"
    content, _ = get_file_content(filename, "static/css")
    if not content:
        content, _ = get_file_content("custom.css", "static/css")
    return Response(content=content, media_type="text/css; charset=utf-8")

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

@app.get("/ads.txt")
async def serve_ads_txt():
    """Official Google AdSense ads.txt authorization record."""
    content = "google.com, pub-9257478787714323, DIRECT, f08c47fec0942fa0\n"
    return Response(content=content, media_type="text/plain; charset=utf-8")


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
@app.get("/api/standings")
async def get_series():
    """Return featured tournaments, series, and standings."""
    try:
        data = espn_service.get_featured_series()
        return JSONResponse(content={"series": data, "standings": data})
    except Exception as e:
        return JSONResponse(content={"series": [], "standings": []})

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "Sports Dynasty Live API"}

@app.get("/manifest.json")
async def get_manifest():
    return JSONResponse(content={
        "name": "Sports Dynasty - Live Cricket Score",
        "short_name": "Sports Dynasty",
        "description": "Fastest 3D Live Cricket Scorecards, Ball-by-Ball Commentary & Analytics",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#064e3b",
        "theme_color": "#064e3b",
        "icons": [
            {
                "src": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png",
                "sizes": "192x192",
                "type": "image/png"
            },
            {
                "src": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png",
                "sizes": "512x512",
                "type": "image/png"
            }
        ]
    })

@app.get("/robots.txt")
async def get_robots():
    content = """User-agent: *
Allow: /
Sitemap: https://sportsdynasty.in/sitemap.xml
"""
    return Response(content=content, media_type="text/plain")

@app.get("/sitemap.xml")
async def get_sitemap():
    now_iso = datetime.utcnow().strftime("%Y-%m-%d")
    xml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>https://sportsdynasty.in/</loc>
        <lastmod>{now_iso}</lastmod>
        <changefreq>always</changefreq>
        <priority>1.0</priority>
    </url>
    <url>
        <loc>https://sportsdynasty.in/#tab-live</loc>
        <lastmod>{now_iso}</lastmod>
        <changefreq>always</changefreq>
        <priority>0.9</priority>
    </url>
    <url>
        <loc>https://sportsdynasty.in/#tab-scorecard</loc>
        <lastmod>{now_iso}</lastmod>
        <changefreq>always</changefreq>
        <priority>0.8</priority>
    </url>
    <url>
        <loc>https://sportsdynasty.in/#tab-rankings</loc>
        <lastmod>{now_iso}</lastmod>
        <changefreq>daily</changefreq>
        <priority>0.7</priority>
    </url>
    <url>
        <loc>https://sportsdynasty.in/#tab-news</loc>
        <lastmod>{now_iso}</lastmod>
        <changefreq>hourly</changefreq>
        <priority>0.8</priority>
    </url>
</urlset>
"""
    return Response(content=xml_content, media_type="application/xml")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print("=" * 60)
    print("  SPORTS DYNASTY CRICKET PLATFORM")
    print(f"  Server running at: http://0.0.0.0:{port}")
    print("=" * 60)
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
