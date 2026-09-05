import os
import sys
import json
import time
import hashlib
import re
from datetime import datetime, timezone
from xml.sax.saxutils import escape
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse, Response, RedirectResponse
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

def clean_meta_attr(text: str) -> str:
    """Escape strings safely for HTML attributes (e.g. meta content)."""
    return str(text or "").replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;').replace('>', '&gt;')

def render_ssr_match_page(league_id: str, event_id: str, request: Request) -> HTMLResponse:
    content, _ = get_file_content("index.html", "templates")
    if not content:
        content = """<!DOCTYPE html><html><head><title>Sports Dynasty</title></head><body><h2>Sports Dynasty</h2></body></html>"""

    # 1. Quick lookup in live matches
    match_info = None
    try:
        live_data = espn_service.get_live_matches()
        for m in live_data.get("matches", []):
            if str(m.get("id")) == str(event_id):
                match_info = m
                if not league_id or league_id == "0":
                    league_id = str(m.get("leagueId") or "0")
                break
    except Exception:
        pass

    # 2. Summary fallback if not found in current live list
    match_summary = None
    if not match_info:
        try:
            match_summary = espn_service.get_match_summary(league_id, event_id)
        except Exception:
            pass

    title = ""
    teams = []
    scores = []
    status_text = ""
    league_name = ""
    logo_url = "https://a.espncdn.com/i/teamlogos/cricket/500/6.png"

    if match_info:
        title = match_info.get("name") or match_info.get("shortName") or "Cricket Match"
        league_name = match_info.get("leagueName") or match_info.get("description") or "Live Cricket"
        status_text = match_info.get("statusText") or match_info.get("statusDetail") or "Live Coverage"
        competitors = match_info.get("competitors") or []
        for c in competitors:
            c_name = c.get("name", "")
            c_score = c.get("score", "")
            if c_name:
                teams.append(c_name)
            if c_score:
                scores.append(f"{c_name} {c_score}")
            if c.get("logo"):
                logo_url = c.get("logo")
    elif match_summary:
        title = match_summary.get("title") or match_summary.get("shortName") or "Cricket Match"
        league_name = match_summary.get("description") or "Live Cricket"
        status_text = match_summary.get("statusDetail") or match_summary.get("leadSummary") or "Live Coverage"
        competitors = match_summary.get("competitors") or []
        for c in competitors:
            c_name = c.get("name", "")
            c_score = c.get("score", "")
            if c_name:
                teams.append(c_name)
            if c_score:
                scores.append(f"{c_name} {c_score}")
            if c.get("logo"):
                logo_url = c.get("logo")

    if not title:
        title = "Live Cricket Match"

    teams_str = " vs ".join(teams) if teams else title
    score_str = " vs ".join(scores) if scores else teams_str

    seo_title = f"{teams_str} Live Cricket Score, Scorecard & Ball-by-Ball Commentary | Sports Dynasty"
    seo_description = f"Live Score: {score_str}. {status_text}. Follow real-time ball-by-ball commentary, full scorecard, player stats, and live telemetry on Sports Dynasty."
    canonical_url = f"https://sportsdynasty.in/match/{league_id}/{event_id}"

    schema_ld = {
        "@context": "https://schema.org",
        "@type": "SportsEvent",
        "name": f"{teams_str} Live Cricket Match",
        "description": seo_description,
        "sport": "Cricket",
        "url": canonical_url,
        "competitor": [{"@type": "SportsTeam", "name": t} for t in teams],
        "organizer": {
            "@type": "SportsOrganization",
            "name": "Sports Dynasty",
            "url": "https://sportsdynasty.in"
        }
    }
    schema_json_str = json.dumps(schema_ld, ensure_ascii=False)

    seo_body_block = f"""
    <!-- Googlebot & Search Engine SSR Crawl Anchor -->
    <div id="ssr-crawl-content" class="sr-only" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;">
        <h1>{clean_meta_attr(seo_title)}</h1>
        <h2>{clean_meta_attr(teams_str)} - {clean_meta_attr(league_name)}</h2>
        <p>{clean_meta_attr(seo_description)}</p>
        <p>Live status: {clean_meta_attr(status_text)}. Full match scorecard, live telemetry, and player performance.</p>
    </div>
    """

    hydration_script = f"""
    <script>
        window.__INITIAL_MATCH__ = {{
            leagueId: "{clean_meta_attr(str(league_id))}",
            eventId: "{clean_meta_attr(str(event_id))}"
        }};
    </script>
    """

    content = re.sub(r'<title>.*?</title>', f'<title>{clean_meta_attr(seo_title)}</title>', content, count=1)
    content = re.sub(r'<meta\s+name=["\']description["\']\s+content=["\'][^"\']*["\']', f'<meta name="description" content="{clean_meta_attr(seo_description)}"', content, count=1)
    content = re.sub(r'<link\s+rel=["\']canonical["\']\s+href=["\'][^"\']*["\']', f'<link rel="canonical" href="{canonical_url}"', content, count=1)
    
    content = re.sub(r'<meta\s+property=["\']og:title["\']\s+content=["\'][^"\']*["\']', f'<meta property="og:title" content="{clean_meta_attr(seo_title)}"', content, count=1)
    content = re.sub(r'<meta\s+property=["\']og:description["\']\s+content=["\'][^"\']*["\']', f'<meta property="og:description" content="{clean_meta_attr(seo_description)}"', content, count=1)
    content = re.sub(r'<meta\s+property=["\']og:url["\']\s+content=["\'][^"\']*["\']', f'<meta property="og:url" content="{canonical_url}"', content, count=1)
    content = re.sub(r'<meta\s+property=["\']og:image["\']\s+content=["\'][^"\']*["\']', f'<meta property="og:image" content="{logo_url}"', content, count=1)

    content = re.sub(r'<meta\s+name=["\']twitter:title["\']\s+content=["\'][^"\']*["\']', f'<meta name="twitter:title" content="{clean_meta_attr(seo_title)}"', content, count=1)
    content = re.sub(r'<meta\s+name=["\']twitter:description["\']\s+content=["\'][^"\']*["\']', f'<meta name="twitter:description" content="{clean_meta_attr(seo_description)}"', content, count=1)
    content = re.sub(r'<meta\s+name=["\']twitter:image["\']\s+content=["\'][^"\']*["\']', f'<meta name="twitter:image" content="{logo_url}"', content, count=1)

    content = content.replace('</head>', f'<script type="application/ld+json">{schema_json_str}</script>\n</head>', 1)

    if '<body' in content:
        body_end = content.find('>', content.find('<body')) + 1
        content = content[:body_end] + "\n" + seo_body_block + "\n" + hydration_script + content[body_end:]

    return HTMLResponse(content=content, media_type="text/html; charset=utf-8")

def render_hub_page(view_name: str, title: str, description: str, path: str) -> HTMLResponse:
    content, _ = get_file_content("index.html", "templates")
    if not content:
        content = """<!DOCTYPE html><html><head><title>Sports Dynasty</title></head><body><h2>Sports Dynasty</h2></body></html>"""
    
    canonical_url = f"https://sportsdynasty.in{path}"
    
    content = re.sub(r'<title>.*?</title>', f'<title>{clean_meta_attr(title)}</title>', content, count=1)
    content = re.sub(r'<meta\s+name=["\']description["\']\s+content=["\'][^"\']*["\']', f'<meta name="description" content="{clean_meta_attr(description)}"', content, count=1)
    content = re.sub(r'<link\s+rel=["\']canonical["\']\s+href=["\'][^"\']*["\']', f'<link rel="canonical" href="{canonical_url}"', content, count=1)
    
    content = re.sub(r'<meta\s+property=["\']og:title["\']\s+content=["\'][^"\']*["\']', f'<meta property="og:title" content="{clean_meta_attr(title)}"', content, count=1)
    content = re.sub(r'<meta\s+property=["\']og:description["\']\s+content=["\'][^"\']*["\']', f'<meta property="og:description" content="{clean_meta_attr(description)}"', content, count=1)
    content = re.sub(r'<meta\s+property=["\']og:url["\']\s+content=["\'][^"\']*["\']', f'<meta property="og:url" content="{canonical_url}"', content, count=1)

    content = re.sub(r'<meta\s+name=["\']twitter:title["\']\s+content=["\'][^"\']*["\']', f'<meta name="twitter:title" content="{clean_meta_attr(title)}"', content, count=1)
    content = re.sub(r'<meta\s+name=["\']twitter:description["\']\s+content=["\'][^"\']*["\']', f'<meta name="twitter:description" content="{clean_meta_attr(description)}"', content, count=1)

    hydration_script = f"""
    <script>
        window.__INITIAL_VIEW__ = "{clean_meta_attr(view_name)}";
    </script>
    """
    if '<body' in content:
        body_end = content.find('>', content.find('<body')) + 1
        content = content[:body_end] + "\n" + hydration_script + content[body_end:]

    return HTMLResponse(content=content, media_type="text/html; charset=utf-8")

@app.get("/", response_class=HTMLResponse)
async def serve_dashboard(request: Request):
    """Serve the Sports Dynasty Cricket Web Platform."""
    content, _ = get_file_content("index.html", "templates")
    if content:
        return HTMLResponse(content=content, media_type="text/html; charset=utf-8")
    return HTMLResponse(content="""<!DOCTYPE html><html><head><title>Sports Dynasty</title></head><body style="background:#064e3b;color:#fff;font-family:sans-serif;text-align:center;padding:50px;"><h2>Sports Dynasty Cricket Platform</h2><p>Loading application resources...</p></body></html>""")

@app.get("/match/{league_id}/{event_id}", response_class=HTMLResponse)
async def serve_match_ssr(league_id: str, event_id: str, request: Request):
    """Clean SEO-Optimized Match URL with Dynamic Metadata & Structured Schema."""
    return render_ssr_match_page(league_id, event_id, request)

@app.get("/match/{event_id}", response_class=HTMLResponse)
async def serve_match_ssr_short(event_id: str, request: Request):
    """Short Match URL route (auto-resolves league ID)."""
    return render_ssr_match_page("0", event_id, request)

@app.get("/live-scores", response_class=HTMLResponse)
async def serve_live_scores_hub(request: Request):
    return render_hub_page(
        "live",
        "Live Cricket Score Today • Ball by Ball Commentary & Scorecard | Sports Dynasty",
        "Check fastest live cricket scores today, ball by ball commentary, real-time match telemetry, partnerships, and wagon wheels on Sports Dynasty.",
        "/live-scores"
    )

@app.get("/news", response_class=HTMLResponse)
async def serve_news_hub(request: Request):
    return render_hub_page(
        "news",
        "Latest Cricket News, Match Reports & Exclusive Analysis | Sports Dynasty",
        "Breaking cricket news, tournament previews, match analysis, player interviews, and post-match press reports on Sports Dynasty.",
        "/news"
    )

@app.get("/series", response_class=HTMLResponse)
@app.get("/standings", response_class=HTMLResponse)
async def serve_series_hub(request: Request):
    return render_hub_page(
        "series",
        "Cricket Series, Tournaments & Points Table Standings 2026 | Sports Dynasty",
        "Track upcoming series schedules, tournament fixtures, and updated team standings & points tables on Sports Dynasty.",
        "/series"
    )

@app.get("/teams", response_class=HTMLResponse)
async def serve_teams_hub(request: Request):
    return render_hub_page(
        "teams",
        "International Cricket Teams Directory, Squads & Stats | Sports Dynasty",
        "Explore international and domestic cricket teams, player rosters, recent form, and team statistics on Sports Dynasty.",
        "/teams"
    )

@app.get("/rankings", response_class=HTMLResponse)
async def serve_rankings_hub(request: Request):
    return render_hub_page(
        "rankings",
        "Official ICC Cricket Rankings 2026 - Teams, Batters & Bowlers | Sports Dynasty",
        "Latest official ICC Rankings for Test, ODI, and T20I cricket. Check top ranked teams, batters, bowlers, and all-rounders.",
        "/rankings"
    )

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
    """Dynamic XML Sitemap generating clean URLs for all live, recent, and upcoming matches."""
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    urls = [
        ("https://sportsdynasty.in/", now_iso, "always", "1.0"),
        ("https://sportsdynasty.in/live-scores", now_iso, "always", "0.9"),
        ("https://sportsdynasty.in/news", now_iso, "hourly", "0.8"),
        ("https://sportsdynasty.in/series", now_iso, "daily", "0.8"),
        ("https://sportsdynasty.in/rankings", now_iso, "daily", "0.8"),
        ("https://sportsdynasty.in/teams", now_iso, "weekly", "0.7"),
    ]

    try:
        live_data = espn_service.get_live_matches()
        for m in live_data.get("matches", []):
            eid = str(m.get("id", ""))
            lid = str(m.get("leagueId", "0"))
            if not eid:
                continue
            is_live = bool(m.get("isLive"))
            cf = "always" if is_live else "daily"
            prio = "0.9" if is_live else "0.8"
            urls.append((f"https://sportsdynasty.in/match/{lid}/{eid}", now_iso, cf, prio))
    except Exception:
        pass

    xml_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    ]
    for loc, lastmod, cf, prio in urls:
        xml_lines.append(f"""    <url>
        <loc>{escape(loc)}</loc>
        <lastmod>{lastmod}</lastmod>
        <changefreq>{cf}</changefreq>
        <priority>{prio}</priority>
    </url>""")
    xml_lines.append('</urlset>')
    xml_content = "\n".join(xml_lines)
    return Response(content=xml_content, media_type="application/xml; charset=utf-8")

@app.exception_handler(404)
async def custom_404_handler(request: Request, exc):
    """Fallback handler: For browser navigation requests, serve the dashboard SPA or SSR match page seamlessly."""
    accept = request.headers.get("accept", "")
    path = request.url.path
    if "text/html" in accept or "*/*" in accept:
        match_route = re.match(r'^/match/([^/]+)(?:/([^/]+))?/?$', path)
        if match_route:
            p1 = match_route.group(1)
            p2 = match_route.group(2)
            if p2:
                return render_ssr_match_page(p1, p2, request)
            else:
                return render_ssr_match_page("0", p1, request)
        return await serve_dashboard(request)
    return JSONResponse(status_code=404, content={"detail": "Not Found"})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print("=" * 60)
    print("  SPORTS DYNASTY CRICKET PLATFORM")
    print(f"  Server running at: http://0.0.0.0:{port}")
    print("=" * 60)
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
