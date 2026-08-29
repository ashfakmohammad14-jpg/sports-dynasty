import os
import sys
import subprocess
import importlib.util

# -------------------------------------------------------------
# AUTO-DEPENDENCY CHECKER & INSTALLER
# -------------------------------------------------------------
REQUIRED_PACKAGES = {
    "fastapi": "fastapi>=0.110.0",
    "uvicorn": "uvicorn>=0.28.0",
    "requests": "requests>=2.31.0",
    "bs4": "beautifulsoup4>=4.12.0",
    "jinja2": "jinja2>=3.1.3",
    "pydantic": "pydantic>=2.6.0"
}

def ensure_dependencies():
    """Check for missing packages and automatically install them before starting."""
    missing = []
    for mod_name, pkg_req in REQUIRED_PACKAGES.items():
        if importlib.util.find_spec(mod_name) is None:
            missing.append(pkg_req)

    if missing:
        print("=" * 60)
        print("[CRICKET DASHBOARD] Missing required packages detected:")
        for p in missing:
            print(f"  -> {p}")
        print("\n[CRICKET DASHBOARD] Automatically installing missing packages...")
        print("=" * 60)
        try:
            cmd = [sys.executable, "-m", "pip", "install", *missing, "--disable-pip-version-check"]
            subprocess.check_call(cmd)
            print("\n[CRICKET DASHBOARD] All dependencies successfully installed!\n")
        except Exception as e:
            print(f"\n[ERROR] Failed to automatically install dependencies: {e}")
            print("Please run manually: pip install -r requirements.txt\n")

ensure_dependencies()

# -------------------------------------------------------------
# APPLICATION IMPORTS
# -------------------------------------------------------------
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from espn_client import espn_service

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

from fastapi.middleware.gzip import GZipMiddleware

app = FastAPI(
    title="Cricket Live Analytics Dashboard",
    description="Real-Time Cricket Scorecards, Player/Team Analytics, and Live Commentary powered by ESPN API",
    version="1.0.0"
)

# Enable Gzip compression for lightning-fast mobile/web performance
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Static and Template directories
static_dir = os.path.join(BASE_DIR, "static")
templates_dir = os.path.join(BASE_DIR, "templates")

if not os.path.exists(static_dir):
    os.makedirs(static_dir, exist_ok=True)
if not os.path.exists(templates_dir):
    os.makedirs(templates_dir, exist_ok=True)

app.mount("/static", StaticFiles(directory=static_dir), name="static")
templates = Jinja2Templates(directory=templates_dir)

@app.get("/", response_class=HTMLResponse)
async def serve_dashboard(request: Request):
    """Render the main interactive dashboard."""
    initial_matches = espn_service.get_live_matches()
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "title": "Cricket Pulse - Live Analytics & Match Center",
            "initial_matches": initial_matches
        }
    )

@app.get("/api/matches")
async def get_matches():
    """Return all live, recent, and upcoming matches."""
    data = espn_service.get_live_matches()
    return JSONResponse(content=data)

@app.get("/api/match/{league_id}/{event_id}")
async def get_match_details(league_id: str, event_id: str):
    """Return detailed scorecard, timeline, squad, and analytics for a match."""
    summary = espn_service.get_match_summary(league_id, event_id)
    if "error" in summary and not summary.get("title"):
        return JSONResponse(status_code=404, content={"error": summary["error"]})
    return JSONResponse(content=summary)

@app.get("/api/player/{player_id}")
async def get_player_profile(player_id: str, name: str = ""):
    """Return detailed player profile and stats for any cricket player."""
    profile = espn_service.get_player_profile(player_id, name)
    if not profile or not profile.get("name"):
        return JSONResponse(status_code=404, content={"error": "Player not found"})
    return JSONResponse(content=profile)

@app.get("/api/players/search")
async def search_players(q: str = ""):
    """Search for any cricket player worldwide."""
    results = espn_service.search_players(q)
    return JSONResponse(content={"players": results})

@app.get("/api/news")
async def get_news():
    """Return real-time breaking cricket news."""
    data = espn_service.get_latest_news()
    return JSONResponse(content={"articles": data})

@app.get("/api/rankings")
async def get_rankings():
    """Return official ICC Team and Player rankings."""
    data = espn_service.get_icc_rankings()
    return JSONResponse(content=data)

@app.get("/api/teams")
async def get_teams():
    """Return international teams directory and info."""
    data = espn_service.get_teams_directory()
    return JSONResponse(content={"teams": data})

@app.get("/api/series")
async def get_series():
    """Return featured tournaments, series, and standings."""
    data = espn_service.get_featured_series()
    return JSONResponse(content={"series": data})

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "Cricket Live Analytics API"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print("=" * 60)
    print("  CRICKET LIVE ANALYTICS DASHBOARD")
    print(f"  Server running at: http://0.0.0.0:{port}")
    print("=" * 60)
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
