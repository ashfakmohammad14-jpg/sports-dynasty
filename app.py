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

@app.get("/rankings")
async def serve_rankings_redirect():
    """Redirect directly to official ESPN Cricinfo ICC rankings page."""
    return RedirectResponse(url="https://www.espncricinfo.com/rankings/content/page/211271.html", status_code=302)

def render_legal_document(title: str, description: str, path: str, doc_title: str, doc_body: str) -> HTMLResponse:
    canonical_url = f"https://sportsdynasty.in{path}"
    html = f"""<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{clean_meta_attr(title)} | Sports Dynasty</title>
    <meta name="description" content="{clean_meta_attr(description)}">
    <link rel="canonical" href="{canonical_url}">
    <meta name="robots" content="index, follow">
    <meta name="theme-color" content="#064e3b">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Sports Dynasty">
    <meta property="og:title" content="{clean_meta_attr(title)}">
    <meta property="og:description" content="{clean_meta_attr(description)}">
    <meta property="og:url" content="{canonical_url}">
    <link rel="icon" type="image/png" href="https://a.espncdn.com/i/teamlogos/cricket/500/6.png">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {{
            darkMode: 'class',
            theme: {{
                extend: {{
                    colors: {{
                        brand: {{ green: '#059669', darkgreen: '#064e3b', emerald: '#10b981', light: '#34d399' }},
                        dark: {{ 900: '#0b0f19', 800: '#111827', 700: '#1f2937', 600: '#374151' }}
                    }}
                }}
            }}
        }}
    </script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9257478787714323" crossorigin="anonymous"></script>
</head>
<body class="bg-[#0b0f19] text-gray-100 font-sans min-h-screen flex flex-col antialiased">
    <header class="sticky top-0 z-40 bg-[#064e3b] border-b border-emerald-500/30 shadow-md">
        <div class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <a href="/" class="flex items-center gap-2.5 text-white font-black text-lg sm:text-xl tracking-tight">
                <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white shadow text-sm">
                    🏏
                </div>
                <span>Sports Dynasty</span>
            </a>
            <nav class="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm font-bold text-white/90">
                <a href="/" class="hover:text-[#00ff88] transition">Live Scores</a>
                <a href="/news" class="hover:text-[#00ff88] transition">News</a>
                <a href="/series" class="hover:text-[#00ff88] transition">Series</a>
                <a href="/rankings" class="hover:text-[#00ff88] transition">Rankings</a>
            </nav>
        </div>
    </header>

    <main class="max-w-4xl mx-auto px-4 py-8 sm:py-12 flex-1 w-full">
        <article class="bg-gray-900/90 border border-emerald-500/20 rounded-2xl p-6 sm:p-10 shadow-2xl space-y-6">
            <header class="border-b border-gray-800 pb-4">
                <h1 class="text-2xl sm:text-3xl font-black text-white tracking-tight">{doc_title}</h1>
                <p class="text-xs text-emerald-400 font-mono mt-1">Official Legal Documentation • Sports Dynasty</p>
            </header>
            <div class="text-slate-300 space-y-4 text-sm sm:text-base leading-relaxed">
                {doc_body}
            </div>
            <div class="pt-6 border-t border-gray-800 text-xs text-slate-500 flex flex-wrap justify-between items-center gap-2">
                <span>Last Updated: September 2026</span>
                <a href="/" class="text-[#00ff88] hover:underline font-bold flex items-center gap-1">← Return to Live Match Arena</a>
            </div>
        </article>
    </main>

    <footer class="border-t border-gray-800 bg-gray-950 py-6 text-xs text-gray-400">
        <div class="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p>© 2026 Sports Dynasty • Real-Time Cricket Telemetry. All rights reserved.</p>
            <div class="flex flex-wrap items-center gap-3 text-gray-400">
                <a href="/privacy-policy" class="hover:text-[#00ff88] transition">Privacy Policy</a>
                <span>•</span>
                <a href="/terms" class="hover:text-[#00ff88] transition">Terms</a>
                <span>•</span>
                <a href="/about" class="hover:text-[#00ff88] transition">About Us</a>
                <span>•</span>
                <a href="/contact" class="hover:text-[#00ff88] transition">Contact</a>
                <span>•</span>
                <a href="/disclaimer" class="hover:text-[#00ff88] transition">Disclaimer</a>
            </div>
        </div>
    </footer>
    <script>if (window.lucide) lucide.createIcons();</script>
</body>
</html>"""
    return HTMLResponse(content=html, media_type="text/html; charset=utf-8")

@app.get("/privacy-policy", response_class=HTMLResponse)
@app.get("/privacy", response_class=HTMLResponse)
async def serve_privacy_policy():
    body = """
<h2 class="text-xl font-bold text-white mb-2">1. Introduction</h2>
<p>Welcome to <strong>Sports Dynasty</strong> (accessible at <a href="https://sportsdynasty.in" class="text-emerald-400 underline">https://sportsdynasty.in</a>). At Sports Dynasty, the privacy of our visitors is of paramount importance to us. This Privacy Policy outlines the types of information collected and how it is used.</p>

<h2 class="text-xl font-bold text-white mt-6 mb-2">2. Information We Collect</h2>
<p>Sports Dynasty provides free, real-time live cricket scorecards, ball-by-ball telemetry, ICC rankings, and sports news. We do not require visitors to register, create accounts, or provide sensitive personal details such as passwords or credit card numbers to access our core cricket coverage.</p>
<p>Like most modern web platforms, our servers may automatically log non-personally identifiable diagnostic data including:</p>
<ul class="list-disc pl-5 space-y-1">
    <li>Internet Protocol (IP) address</li>
    <li>Browser type, device classification, and operating system</li>
    <li>Referring/exit pages and timestamps</li>
    <li>Aggregated pageview and session telemetry to optimize low-latency live score delivery</li>
</ul>

<h2 class="text-xl font-bold text-white mt-6 mb-2">3. Google AdSense & Third-Party Advertising (Cookie Policy)</h2>
<p>Sports Dynasty partners with trusted third-party advertising vendors, including <strong>Google AdSense</strong>, to serve advertisements when you visit our website. These third-party vendors use cookies and web beacons to serve ads based on your prior visits to our website or other sites on the Internet.</p>
<p><strong>DoubleClick Cookie:</strong> Google's use of advertising cookies enables it and its partners to serve personalized ads to our visitors based on their visit to sportsdynasty.in and/or other sites on the Internet.</p>
<p><strong>Opting Out:</strong> Visitors may choose to opt out of personalized advertising at any time by visiting the official <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener" class="text-emerald-400 underline">Google Ads Settings</a> page. Alternatively, you can opt out of third-party vendors' use of cookies for personalized advertising by visiting <a href="https://www.aboutads.info" target="_blank" rel="noopener" class="text-emerald-400 underline">www.aboutads.info</a>.</p>

<h2 class="text-xl font-bold text-white mt-6 mb-2">4. Log Files & Analytics</h2>
<p>Sports Dynasty utilizes standard web server logs and lightweight, privacy-preserving session metrics. The information gathered is strictly used for analyzing traffic trends, administering the site, tracking real-time concurrent active users during live matches, and maintaining server availability.</p>

<h2 class="text-xl font-bold text-white mt-6 mb-2">5. GDPR & CCPA Compliance</h2>
<p>We respect international privacy rights including the European Union General Data Protection Regulation (GDPR) and the California Consumer Privacy Act (CCPA):</p>
<ul class="list-disc pl-5 space-y-1">
    <li>You have the right to request information about diagnostic data collected.</li>
    <li>You have the right to request deletion of non-essential records.</li>
    <li>We never sell, rent, or trade personal data to third parties.</li>
</ul>

<h2 class="text-xl font-bold text-white mt-6 mb-2">6. Children's Privacy (COPPA)</h2>
<p>Sports Dynasty does not knowingly collect any personal identifiable information from children under the age of 13. If you believe your child has provided personal information on our site, please contact us immediately and we will promptly remove such records.</p>

<h2 class="text-xl font-bold text-white mt-6 mb-2">7. Contact Information</h2>
<p>If you have questions, feedback, or concerns regarding our Privacy Policy, please contact our administrative team at:</p>
<p class="font-mono text-emerald-400 font-bold">Email: support@sportsdynasty.in | ashfaq261190@gmail.com</p>
"""
    return render_legal_document(
        "Privacy Policy",
        "Sports Dynasty Privacy Policy: Learn how we collect, protect, and respect your data, including Google AdSense cookies and opt-out information.",
        "/privacy-policy",
        "Privacy Policy",
        body
    )

@app.get("/terms", response_class=HTMLResponse)
@app.get("/terms-of-service", response_class=HTMLResponse)
async def serve_terms():
    body = """
<h2 class="text-xl font-bold text-white mb-2">1. Agreement to Terms</h2>
<p>By accessing and using <strong>Sports Dynasty</strong> (<a href="https://sportsdynasty.in" class="text-emerald-400 underline">https://sportsdynasty.in</a>), you accept and agree to be bound by the terms and provisions of this agreement. If you do not agree to abide by these terms, please do not use this service.</p>

<h2 class="text-xl font-bold text-white mt-6 mb-2">2. Description of Service</h2>
<p>Sports Dynasty provides real-time live cricket scorecards, ball-by-ball telemetry, player statistics, tournament schedules, points tables, and official ICC rankings for informational and sports entertainment purposes.</p>

<h2 class="text-xl font-bold text-white mt-6 mb-2">3. Intellectual Property & Fair Use</h2>
<p>All proprietary code, brand design, graphical interfaces, and telemetry calculation algorithms developed by Sports Dynasty are the intellectual property of Sports Dynasty.</p>
<p>Live scores, match facts, player career statistics, and team fixtures are public domain facts and news information aggregated for sports journalistic commentary and fair fan engagement.</p>

<h2 class="text-xl font-bold text-white mt-6 mb-2">4. User Conduct</h2>
<p>Users agree not to:</p>
<ul class="list-disc pl-5 space-y-1">
    <li>Use automated scrapers, bots, or spiders to overload or degrade the performance of our live telemetry servers.</li>
    <li>Attempt to decompile, reverse engineer, or disrupt the operation of the web dashboard.</li>
    <li>Use the platform for any unlawful purpose or in violation of local, state, national, or international law.</li>
</ul>

<h2 class="text-xl font-bold text-white mt-6 mb-2">5. Disclaimer of Warranties</h2>
<p>The service is provided on an "as is" and "as available" basis. While Sports Dynasty strives for millisecond-level telemetry accuracy, we make no representations or warranties regarding the continuous availability or absolute error-free operation of third-party sports data feeds.</p>

<h2 class="text-xl font-bold text-white mt-6 mb-2">6. Contact Us</h2>
<p>For inquiries regarding these Terms of Service, contact: <span class="font-mono text-emerald-400 font-bold">support@sportsdynasty.in</span></p>
"""
    return render_legal_document(
        "Terms of Service",
        "Sports Dynasty Terms of Service: Read our terms and conditions for accessing live cricket scores, statistics, and editorial content.",
        "/terms",
        "Terms of Service",
        body
    )

@app.get("/about", response_class=HTMLResponse)
@app.get("/about-us", response_class=HTMLResponse)
async def serve_about():
    body = """
<h2 class="text-xl font-bold text-white mb-2">Welcome to Sports Dynasty</h2>
<p><strong>Sports Dynasty</strong> is a next-generation digital cricket center built to give cricket fans worldwide the fastest, cleanest, and most immersive ball-by-ball live match experience.</p>

<h2 class="text-xl font-bold text-white mt-6 mb-2">Our Mission</h2>
<p>Traditional sports portals are often cluttered with intrusive distractions, slow reload times, and confusing navigation. Our mission is simple: <strong>deliver ultra-fast live cricket scores, comprehensive scorecards, and advanced telemetry directly to fans without friction.</strong></p>

<h2 class="text-xl font-bold text-white mt-6 mb-2">What We Cover</h2>
<ul class="list-disc pl-5 space-y-2">
    <li><strong>International Bilateral Cricket:</strong> Full coverage of ICC Men's & Women's Test Matches, One Day Internationals (ODIs), and Twenty20 Internationals (T20Is).</li>
    <li><strong>Global Franchise Leagues:</strong> Indian Premier League (IPL), Big Bash League (BBL), Caribbean Premier League (CPL), Pakistan Super League (PSL), The Hundred, SA20, and MLC.</li>
    <li><strong>Major Tournaments:</strong> ICC Men's & Women's Cricket World Cups, ICC Champions Trophy, ICC T20 World Cup, and ICC World Test Championship (WTC).</li>
    <li><strong>First-Class & Domestic Circuits:</strong> English County Championship, Ranji Trophy, Sheffield Shield, and Under-19 Youth International fixtures.</li>
</ul>

<h2 class="text-xl font-bold text-white mt-6 mb-2">Advanced Real-Time Features</h2>
<p>Sports Dynasty incorporates live Current Run Rate (CRR) calculations, Required Run Rate (RRR) chase telemetry, active partnerships, Fall of Wickets timelines, and official Playing XI alerts directly following the toss.</p>

<h2 class="text-xl font-bold text-white mt-6 mb-2">Editorial & Operations Team</h2>
<p>Our sports desk and technical infrastructure are headquartered online with 24/7 global match monitoring.</p>
<p>For partnerships, feedback, or press queries: <span class="font-mono text-emerald-400 font-bold">support@sportsdynasty.in</span></p>
"""
    return render_legal_document(
        "About Us",
        "About Sports Dynasty: Discover our mission to provide the fastest live cricket scores, ball-by-ball telemetry, and comprehensive global tournament coverage.",
        "/about",
        "About Sports Dynasty",
        body
    )

@app.get("/contact", response_class=HTMLResponse)
@app.get("/contact-us", response_class=HTMLResponse)
async def serve_contact():
    body = """
<h2 class="text-xl font-bold text-white mb-2">Get in Touch with Sports Dynasty</h2>
<p>We welcome feedback, suggestions, error reports, and business inquiries from cricket fans, journalists, and partners around the globe.</p>

<div class="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
    <div class="bg-gray-800/80 border border-emerald-500/30 rounded-xl p-4 space-y-2">
        <h3 class="text-sm font-bold text-emerald-400 uppercase tracking-wider font-mono">General Support & Feedback</h3>
        <p class="text-xs text-slate-300">Questions regarding match scores, statistics, or website features.</p>
        <p class="font-mono text-white font-bold text-sm">support@sportsdynasty.in</p>
    </div>
    <div class="bg-gray-800/80 border border-emerald-500/30 rounded-xl p-4 space-y-2">
        <h3 class="text-sm font-bold text-emerald-400 uppercase tracking-wider font-mono">Editorial & Administration</h3>
        <p class="text-xs text-slate-300">Official administration, data corrections, and publisher correspondence.</p>
        <p class="font-mono text-white font-bold text-sm">ashfaq261190@gmail.com</p>
    </div>
</div>

<h2 class="text-xl font-bold text-white mt-6 mb-2">Response Turnaround</h2>
<p>Our operations team monitors all incoming messages actively. We endeavor to respond to all legitimate technical, editorial, and partnership inquiries within <strong>24 to 48 business hours</strong>.</p>

<h2 class="text-xl font-bold text-white mt-6 mb-2">Digital Office</h2>
<p class="text-slate-300">Sports Dynasty Online Publishing<br>Website: <a href="https://sportsdynasty.in" class="text-emerald-400 underline">https://sportsdynasty.in</a><br>Platform: Live Cricket Analytics & Digital Broadcast Operations</p>
"""
    return render_legal_document(
        "Contact Us",
        "Contact Sports Dynasty: Get in touch with our editorial and technical teams for support, feedback, and business inquiries.",
        "/contact",
        "Contact Us",
        body
    )

@app.get("/disclaimer", response_class=HTMLResponse)
async def serve_disclaimer():
    body = """
<h2 class="text-xl font-bold text-white mb-2">Legal & Sports Data Disclaimer</h2>
<p><strong>Sports Dynasty</strong> (<a href="https://sportsdynasty.in" class="text-emerald-400 underline">https://sportsdynasty.in</a>) is an independent cricket news, live score reporting, and match analytics service.</p>

<h2 class="text-xl font-bold text-white mt-6 mb-2">1. Non-Affiliation Notice</h2>
<p>Sports Dynasty is not affiliated with, authorized, sponsored, or endorsed by the International Cricket Council (ICC), the Board of Control for Cricket in India (BCCI), the England and Wales Cricket Board (ECB), Cricket Australia (CA), the Pakistan Cricket Board (PCB), or any other national or regional cricket administration body.</p>

<h2 class="text-xl font-bold text-white mt-6 mb-2">2. Trademarks & Logos</h2>
<p>All cricket team names, logos, tournament emblems, and player likenesses displayed on Sports Dynasty are the registered trademarks and copyrights of their respective owners. They are used on this platform strictly for identification, news reporting, and sports fan commentary under the Fair Use provisions of applicable copyright law.</p>

<h2 class="text-xl font-bold text-white mt-6 mb-2">3. Accuracy of Live Data</h2>
<p>While our automated synchronization systems track ball-by-ball updates from verified international sports feeds, Sports Dynasty does not guarantee that data displayed will be 100% uninterrupted or free from delays caused by transmission latencies. Users should not use this platform as the sole basis for critical financial or sports wagering decisions.</p>

<h2 class="text-xl font-bold text-white mt-6 mb-2">4. External Links</h2>
<p>Sports Dynasty may contain links to third-party websites (such as Google Ads Settings). We do not control or endorse the content or privacy practices of any third-party websites.</p>

<p class="pt-4 text-xs text-slate-400">Questions? Contact: <span class="font-mono text-emerald-400 font-bold">support@sportsdynasty.in</span></p>
"""
    return render_legal_document(
        "Disclaimer",
        "Sports Dynasty Disclaimer: Legal information regarding cricket trademarks, third-party data accuracy, and fair use policies.",
        "/disclaimer",
        "Sports Data & Legal Disclaimer",
        body
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

@app.get("/api/series/{series_id}/matches")
async def get_series_matches(series_id: str):
    """Return all matches for a specific series/league in chronological sequence."""
    try:
        matches = espn_service._fetch_series_matches(series_id)
        # Sort chronologically by match date (earliest to latest)
        matches_sorted = sorted(matches, key=lambda m: m.get("date") or "")
        return JSONResponse(content={"matches": matches_sorted, "total": len(matches_sorted)})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e), "matches": []})

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
        ("https://sportsdynasty.in/privacy-policy", now_iso, "monthly", "0.7"),
        ("https://sportsdynasty.in/terms", now_iso, "monthly", "0.7"),
        ("https://sportsdynasty.in/about", now_iso, "monthly", "0.7"),
        ("https://sportsdynasty.in/contact", now_iso, "monthly", "0.7"),
        ("https://sportsdynasty.in/disclaimer", now_iso, "monthly", "0.7"),
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
