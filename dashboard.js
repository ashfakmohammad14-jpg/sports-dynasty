
function safeCreateIcons() {
    try {
        if (window.lucide && typeof lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    } catch (e) {
        console.warn('Lucide icon render error:', e);
    }
}

// ESPNcricinfo Match Center Live Dashboard JavaScript Engine

let appState = {
    matches: [],
    categories: { live: [], recent: [], upcoming: [] },
    selectedLeagueId: null,
    selectedEventId: null,
    selectedSeriesFilter: null,
    currentMatchData: null,
    activeCategory: 'all',
    activeTab: 'live',
    activeInningsKey: '1',
    commFilter: 'all',
    searchQuery: '',
    countdown: 10,
    intervalId: null,
    charts: {
        partnerships: null,
        runShare: null
    },
    activePlatformView: 'live',
    newsArticles: [],
    currentNewsCategory: 'all',
    teamsList: [],
    rankingsData: null,
    activeRankFormat: 'test',
    activeRankCategory: 'teams'
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initTheme();
        initApp();
    });
} else {
    initTheme();
    initApp();
}

function initTheme() {
    const savedTheme = localStorage.getItem('cricinfo_theme') || 'light';
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
    } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
    }

    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const isDark = document.documentElement.classList.contains('dark');
            if (isDark) {
                document.documentElement.classList.remove('dark');
                document.documentElement.classList.add('light');
                localStorage.setItem('cricinfo_theme', 'light');
            } else {
                document.documentElement.classList.add('dark');
                document.documentElement.classList.remove('light');
                localStorage.setItem('cricinfo_theme', 'dark');
            }
            if (appState.currentMatchData) {
                renderAnalyticsTab(appState.currentMatchData);
            }
        });
    }
}

// ============================================================
// REAL-TIME CRICKET NOTIFICATION SYSTEM (POINTS 2 & 4)
// ============================================================

function initNotificationSystem() {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
        checkImportantMatchNotifications();
    } else if (Notification.permission === 'default') {
        const dismissed = localStorage.getItem('sd_notif_banner_dismissed');
        const now = Date.now();
        if (!dismissed || (now - parseInt(dismissed, 10)) > 24 * 60 * 60 * 1000) {
            showNotificationPromptBanner();
        }
    }
}

function showNotificationPromptBanner() {
    if (document.getElementById('sd-notif-prompt-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'sd-notif-prompt-banner';
    banner.className = 'fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-50 p-4 rounded-2xl bg-gradient-to-r from-emerald-900/95 via-gray-900/95 to-dark-900/95 border border-emerald-500/50 shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 text-white transition-all transform animate-in slide-in-from-bottom duration-300';
    banner.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0 text-emerald-400">
                <i data-lucide="bell-ring" class="w-5 h-5 animate-bounce"></i>
            </div>
            <div class="min-w-0">
                <h5 class="text-xs font-black uppercase tracking-wider text-emerald-400">Live Cricket Alerts</h5>
                <p class="text-[11px] text-slate-300 leading-tight">Get instant alerts for India matches, Playing XI announcements & close finishes!</p>
            </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
            <button id="sd-notif-allow-btn" class="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-dark-900 text-xs font-black tracking-wide shadow-md transition active:scale-95 cursor-pointer">
                Allow
            </button>
            <button id="sd-notif-dismiss-btn" class="p-1.5 rounded-xl text-slate-400 hover:text-white transition cursor-pointer">
                <i data-lucide="x" class="w-4 h-4"></i>
            </button>
        </div>
    `;
    document.body.appendChild(banner);
    safeCreateIcons();

    document.getElementById('sd-notif-allow-btn')?.addEventListener('click', async () => {
        banner.remove();
        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                sendNotificationAlert(
                    '⚡ Cricket Alerts Enabled!',
                    'You will receive instant updates for India matches, Playing XI announcements and thrilling finishes.',
                    'sd-welcome',
                    '/'
                );
                checkImportantMatchNotifications();
            }
        } catch(e) {}
    });

    document.getElementById('sd-notif-dismiss-btn')?.addEventListener('click', () => {
        banner.remove();
        localStorage.setItem('sd_notif_banner_dismissed', Date.now().toString());
    });
}

function sendNotificationAlert(title, body, tag, url = '/') {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(reg => {
                reg.showNotification(title, {
                    body: body,
                    icon: 'https://a.espncdn.com/i/teamlogos/cricket/500/6.png',
                    badge: 'https://a.espncdn.com/i/teamlogos/cricket/500/6.png',
                    tag: tag,
                    renotify: true,
                    data: { url: url }
                });
            });
        } else {
            new Notification(title, {
                body: body,
                icon: 'https://a.espncdn.com/i/teamlogos/cricket/500/6.png',
                tag: tag
            });
        }
    } catch(e) {
        console.warn("Notification send error:", e);
    }
}

function checkImportantMatchNotifications() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const matches = appState.matches || [];
    if (matches.length === 0) return;

    matches.forEach(m => {
        const mName = String(m.name || '').toLowerCase();
        const isIndia = mName.includes('india');
        const isLive = Boolean(m.isLive || (m.state && ['in', 'live'].includes(m.state.toLowerCase())));
        const matchId = String(m.id || '');

        // 1. Important Live Match Alert (Trigger once per live match)
        if (isLive) {
            const notifiedKey = `sd_notified_live_${matchId}`;
            if (!localStorage.getItem(notifiedKey)) {
                let isCrucial = isIndia;
                if (!isCrucial && m.rrr && parseFloat(m.rrr) > 8.5) isCrucial = true;

                if (isCrucial) {
                    sendNotificationAlert(
                        `🏏 Live: ${m.name}`,
                        `${m.status || 'Match is live.'} Tap to view real-time scorecard and commentary!`,
                        `live-${matchId}`,
                        `/match/${m.leagueId || '0'}/${matchId}`
                    );
                    localStorage.setItem(notifiedKey, Date.now().toString());
                }
            }
        }

        // 2. India Squad / Playing XI Announcement Notification (Point 4)
        if (isIndia) {
            checkIndiaSquadNotification(m);
        }
    });
}

function checkIndiaSquadNotification(m) {
    if (!m || !m.id) return;
    const matchId = String(m.id);
    const squadNotifiedKey = `sd_notified_india_squad_${matchId}`;
    if (localStorage.getItem(squadNotifiedKey)) return;

    const statusText = String(m.status || m.summary || '').toLowerCase();
    const hasTossOrXI = statusText.includes('elected to') || 
                        statusText.includes('opt to') || 
                        statusText.includes('won the toss') || 
                        statusText.includes('playing xi') || 
                        statusText.includes('lineup') ||
                        statusText.includes('squad');

    let hasPlaying11 = false;
    if (appState.currentMatchData && String(appState.currentMatchData.id) === matchId) {
        const sqs = appState.currentMatchData.squads || [];
        const indSq = sqs.find(s => String(s.teamName || '').toLowerCase().includes('india'));
        if (indSq && ((indSq.playingXI && indSq.playingXI.length >= 11) || (indSq.players && indSq.players.length >= 11))) {
            hasPlaying11 = true;
        }
    }

    if (hasTossOrXI || hasPlaying11) {
        sendNotificationAlert(
            `🇮🇳 Team India Playing XI / Squad Announced!`,
            `${m.name}: ${m.status || 'Playing 11 announced!'} Tap to view the official lineup & scorecard.`,
            `india-squad-${matchId}`,
            `/match/${m.leagueId || '0'}/${matchId}`
        );
        localStorage.setItem(squadNotifiedKey, Date.now().toString());
    }
}

function initApp() {
    setupTabs();
    setupFilters();
    setupSearch();
    setupRefresh();
    startPollingTimer();
    startUpcomingCountdowns();
    fetchMatches(false);
    fetchSeriesData();
    initNotificationSystem();

    // Check for SSR initial view or pathname-based hub route
    if (window.__INITIAL_VIEW__) {
        switchPlatformView(window.__INITIAL_VIEW__);
    } else {
        const cleanPath = window.location.pathname.replace(/^\/+|\/+$/g, '');
        if (cleanPath === 'rankings') {
            window.location.href = 'https://www.espncricinfo.com/rankings/content/page/211271.html';
            return;
        }
        if (['news', 'series', 'standings', 'teams', 'live-scores'].includes(cleanPath)) {
            switchPlatformView(cleanPath === 'live-scores' ? 'live' : (cleanPath === 'standings' ? 'series' : cleanPath));
        }
    }
}

async function fetchSeriesData() {
    try {
        const resp = await fetch('/api/series');
        if (resp.ok) {
            const data = await resp.json();
            appState.allSeriesData = data.series || [];
        }
    } catch(e) {}
}

// -------------------------------------------------------------
// API Data Fetching
// -------------------------------------------------------------

function isSecondXIMatch(m) {
    if (!m) return false;
    const l = String(m.leagueName || '').toLowerCase();
    const d = String(m.description || '').toLowerCase();
    const n = String(m.name || '').toLowerCase();
    const c1 = m.competitors && m.competitors[0] ? String(m.competitors[0].name || '').toLowerCase() : '';
    const c2 = m.competitors && m.competitors[1] ? String(m.competitors[1].name || '').toLowerCase() : '';
    const txt = `${l} ${d} ${n} ${c1} ${c2}`;
    return (
        txt.includes('second eleven') || 
        txt.includes('2nd eleven') || 
        txt.includes('second xi') || 
        txt.includes('2nd xi') || 
        txt.includes('2nd-xi') ||
        txt.includes('second-xi') ||
        txt.includes('county 2nd') ||
        txt.includes('county second xi') ||
        txt.includes('county 2nd xi') ||
        txt.includes('second 11') ||
        txt.includes('2nd 11') ||
        txt.includes('sec xi') ||
        txt.includes('sec 11') ||
        txt.includes('premier limited') ||
        txt.includes('sher-e-punjab') ||
        txt.includes('punjab t20')
    );
}

async function fetchMatches(silent = false) {
    const refreshIcon = document.getElementById('refresh-icon');
    if (refreshIcon) refreshIcon.classList.add('animate-spin');

    try {
        const resp = await fetch('/api/matches');
        if (!resp.ok) throw new Error('Network error fetching matches');
        const data = await resp.json();

        appState.matches = (data.matches || []).filter(m => !isSecondXIMatch(m));
        appState.categories = {
            live: ((data.categories && data.categories.live) || []).filter(m => !isSecondXIMatch(m)),
            recent: ((data.categories && data.categories.recent) || []).filter(m => !isSecondXIMatch(m)),
            upcoming: ((data.categories && data.categories.upcoming) || []).filter(m => !isSecondXIMatch(m))
        };

        // Update counts
        const liveCountElem = document.getElementById('live-count');
        if (liveCountElem) liveCountElem.textContent = (appState.categories.live || []).length;
        
        const countBadge = document.getElementById('match-count-badge');
        if (countBadge) countBadge.textContent = `${appState.matches.length} Matches`;

        // Always render match list immediately
        renderMatchList();

        // Intelligent Persistent Match Selection on Page Refresh/Reload
        let targetMatch = null;

        // Priority 1: Injected SSR initial match
        if (window.__INITIAL_MATCH__ && window.__INITIAL_MATCH__.eventId) {
            const initEid = String(window.__INITIAL_MATCH__.eventId);
            targetMatch = (appState.matches || []).find(m => String(m.id) === initEid);
            if (!targetMatch) {
                targetMatch = {
                    id: initEid,
                    leagueId: window.__INITIAL_MATCH__.leagueId || '0'
                };
            }
        }

        // Priority 2: Clean URL path (/match/:leagueId/:eventId or /match/:eventId)
        if (!targetMatch) {
            const pathMatch = window.location.pathname.match(/\/match\/(?:([0-9a-zA-Z_\-]+)\/)?([0-9a-zA-Z_\-]+)/);
            if (pathMatch) {
                const pathLeagueId = pathMatch[1] || '0';
                const pathEventId = pathMatch[2];
                targetMatch = (appState.matches || []).find(m => String(m.id) === String(pathEventId));
                if (!targetMatch && pathEventId) {
                    targetMatch = { id: pathEventId, leagueId: pathLeagueId };
                }
            }
        }

        // Priority 3: Legacy URL hash (#match-12345)
        if (!targetMatch) {
            const urlHash = window.location.hash || '';
            const matchHashMatch = urlHash.match(/#match-([a-zA-Z0-9_\-]+)/);
            if (matchHashMatch) {
                const hashEventId = matchHashMatch[1];
                targetMatch = (appState.matches || []).find(m => String(m.id) === String(hashEventId));
            }
        }
        
        // Priority 4: Stored match (only if on root path without other match specified)
        if (!targetMatch && (window.location.pathname === '/' || window.location.pathname === '') && !window.location.hash) {
            try {
                const savedMatchRaw = localStorage.getItem('sports_dynasty_selected_match');
                if (savedMatchRaw) {
                    const savedObj = JSON.parse(savedMatchRaw);
                    targetMatch = (appState.matches || []).find(m => String(m.id) === String(savedObj.eventId));
                }
            } catch(e) {}
        }

        const isMobile = isMobileLayoutActive();

        if (targetMatch && !appState.selectedEventId) {
            // Initial match selection on load/refresh if URL hash or stored match exists
            selectMatch(targetMatch.leagueId, targetMatch.id);
        } else if (!isMobile && appState.matches.length > 0 && !appState.selectedEventId) {
            // On Desktop, default to first live or top match if none selected
            const firstMatch = appState.categories.live.length > 0 ? appState.categories.live[0] : appState.matches[0];
            selectMatch(firstMatch.leagueId, firstMatch.id);
        } else if (isMobile && !targetMatch && !appState.selectedEventId) {
            // On Mobile home view, show carousel list and hide detail section until a match is clicked
            const carouselSec = document.getElementById('section-match-carousel');
            const detailSec = document.getElementById('section-match-detail');
            const backBar = document.getElementById('mobile-match-back-bar');
            if (carouselSec) carouselSec.classList.remove('hidden');
            if (detailSec) detailSec.classList.add('hidden');
            if (backBar) {
                backBar.classList.add('hidden');
                backBar.classList.remove('flex');
            }
        } else if (appState.selectedLeagueId && appState.selectedEventId && silent) {
            fetchMatchDetails(appState.selectedLeagueId, appState.selectedEventId, true);
        }
        checkImportantMatchNotifications();
    } catch (err) {
        console.error('Error fetching matches:', err);
    } finally {
        if (refreshIcon) {
            setTimeout(() => refreshIcon.classList.remove('animate-spin'), 400);
        }
    }
}

async function fetchMatchDetails(leagueId, eventId, silent = false, retryCount = 0) {
    const heroContent = document.getElementById('match-hero-content');
    const matchObj = (appState.matches || []).find(m => String(m.id) === String(eventId));

    // If we have match data in list, render hero immediately without showing spinner
    if (matchObj && heroContent && (!heroContent.querySelector('.hud-glass-panel') || heroContent.innerHTML.includes('animate-spin'))) {
        renderHeroBanner(matchObj);
    } else if (!silent && heroContent && !heroContent.querySelector('.hud-glass-panel')) {
        heroContent.innerHTML = `
            <div class="text-center py-10 text-slate-400">
                <div class="animate-spin inline-block w-7 h-7 border-2 border-[#059669] border-t-transparent rounded-full mb-2"></div>
                <p class="text-xs font-medium">Loading live Cricinfo match details & scorecard...</p>
            </div>
        `;
    }

    try {
        const resp = await fetch(`/api/match/${leagueId}/${eventId}`);
        if (!resp.ok) throw new Error('Failed to fetch match details');
        const data = await resp.json();

        // Merge with matchObj to ensure competitors and metadata are always present
        if (matchObj) {
            if (!data.competitors || data.competitors.length === 0) {
                data.competitors = matchObj.competitors;
            }
            if (!data.description) data.description = matchObj.description;
            if (!data.location) data.location = matchObj.location;
            if (!data.state) data.state = matchObj.state;
            if (!data.statusDetail) data.statusDetail = matchObj.statusDetail || matchObj.statusText;
            if (!data.title) data.title = matchObj.title;
        }

        appState.currentMatchData = data;

        // Sync rich detailed score from summary back into carousel match card
        if (data.competitors && appState.matches) {
            const mObj = appState.matches.find(x => String(x.id) === String(eventId));
            if (mObj && mObj.competitors) {
                let changed = false;
                data.competitors.forEach((sc, idx) => {
                    if (mObj.competitors[idx] && sc.score) {
                        const curScore = mObj.competitors[idx].score || '';
                        if (!curScore || curScore === '-' || (sc.score.includes('ov') && !curScore.includes('ov'))) {
                            mObj.competitors[idx].score = sc.score;
                            changed = true;
                        }
                    }
                });
                if (data.playerOfTheMatch && !mObj.playerOfTheMatch) {
                    mObj.playerOfTheMatch = data.playerOfTheMatch;
                    changed = true;
                }
                if (data.playerOfTheSeries && !mObj.playerOfTheSeries) {
                    mObj.playerOfTheSeries = data.playerOfTheSeries;
                    changed = true;
                }
                if (changed) renderMatchList();
            }
        }

        renderAllMatchDetails(data);
    } catch (err) {
        console.error('Error fetching match details:', err);
        if (retryCount < 2) {
            setTimeout(() => fetchMatchDetails(leagueId, eventId, true, retryCount + 1), 800);
            return;
        }
        if (matchObj) {
            renderHeroBanner(matchObj);
        } else if (heroContent) {
            heroContent.innerHTML = `
                <div class="text-center py-8 text-rose-500 text-xs">
                    <i data-lucide="alert-circle" class="w-6 h-6 mx-auto mb-2"></i>
                    <p>Unable to load match details. <button onclick="fetchMatchDetails('${leagueId}', '${eventId}')" class="text-emerald-500 underline font-bold ml-1 hover:text-emerald-400">Click to Retry</button></p>
                </div>
            `;
            safeCreateIcons();
        }
    }
}

function renderTeamLogo(name, logoUrl, customClass = 'w-5 h-5') {
    const cleanName = String(name || 'Team').replace(/[^a-zA-Z\s]/g, '').trim();
    const initials = cleanName.split(/\s+/).map(w => w[0]).join('').substring(0, 3).toUpperCase() || 'TM';
    const cleanLogo = (logoUrl && typeof logoUrl === 'string' && !logoUrl.includes('default-team-logo')) ? logoUrl : '';

    if (cleanLogo) {
        return `
            <div class="relative ${customClass} rounded-lg overflow-hidden shrink-0 bg-white dark:bg-dark-800 flex items-center justify-center border border-slate-200/80 dark:border-emerald-500/40 shadow-2xs">
                <img src="${cleanLogo}" 
                     alt="${cleanName}" 
                     class="w-full h-full object-contain p-0.5" 
                     onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
                <div style="display:none;" class="w-full h-full bg-gradient-to-br from-emerald-600 to-teal-800 text-white font-black text-[9px] items-center justify-center select-none font-mono">
                    ${initials}
                </div>
            </div>
        `;
    }

    return `
        <div class="${customClass} rounded-lg bg-gradient-to-br from-emerald-600 to-teal-800 text-white font-black text-[9px] flex items-center justify-center border border-emerald-400/40 shadow-2xs shrink-0 select-none font-mono">
            ${initials}
        </div>
    `;
}

function matchTeamNameOrAbbr(teamName, teamAbbr, targetTeam) {
    if (!targetTeam) return false;
    const cleanTarget = String(targetTeam).replace(/\s*\([^)]*\)/g, '').toLowerCase().trim();
    const target = String(targetTeam).toLowerCase().trim();
    const tClean = target.replace(/[^a-z0-9]/g, '');
    const tCleanNoParen = cleanTarget.replace(/[^a-z0-9]/g, '');
    const tTokens = new Set(target.split(/[^a-z0-9]+/).filter(Boolean));

    const cleanName = String(teamName || '').replace(/\s*\([^)]*\)/g, '').toLowerCase().trim();
    const name = String(teamName || '').toLowerCase().trim();
    const nClean = name.replace(/[^a-z0-9]/g, '');
    const nCleanNoParen = cleanName.replace(/[^a-z0-9]/g, '');
    const abbr = String(teamAbbr || '').toLowerCase().trim();

    // 1. Exact match on normalized full name
    if (nClean && tClean && (nClean === tClean)) return true;
    if (nCleanNoParen && tCleanNoParen && (nCleanNoParen === tCleanNoParen)) return true;

    // 2. Exact match on abbreviation token
    const STOP_WORDS_SET = new Set([
        'team', 'club', 'cricket', 'mens', 'womens', 'men', 'women', 'under', 'zone',
        'npl', 'ipl', 'bbl', 'psl', 'cpl', 'bpl', 'csa', 't20', 'odi', 'test', 'cup',
        'kings', 'royals', 'warriors', 'titans', 'stars', 'lions', 'riders', 'super', 'knights',
        'challengers', 'sixers', 'strikers'
    ]);
    if (abbr && !STOP_WORDS_SET.has(abbr) && tTokens.has(abbr)) return true;

    // 3. Exact word boundary match for full team name
    if (cleanName && cleanName.length >= 4 && (new RegExp('\\b' + cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(target))) return true;

    // 4. Significant tokens match (> 3 characters, excluding stop words and generic nicknames)
    const nTokens = cleanName.split(/[^a-z0-9]+/).filter(w => w.length > 3 && !STOP_WORDS_SET.has(w));
    if (nTokens.length > 0 && nTokens.every(tok => tTokens.has(tok))) return true;

    return false;
}

function isBilateralSeries(matchData) {
    if (!matchData) return false;
    const leagueName = String(matchData.leagueName || '').toLowerCase();
    const seriesTitle = String(matchData.seriesTitle || '').toLowerCase();
    const desc = String(matchData.description || '').toLowerCase();
    const name = String(matchData.name || '').toLowerCase();
    const combined = `${leagueName} ${seriesTitle} ${desc} ${name}`.toLowerCase();

    // Multi-team tournament indicators (if present, NOT bilateral)
    const tournamentKeywords = [
        'cup', 'trophy', 'tri-series', 'quadrangular', 'championship', 
        'league', 'ipl', 'bbl', 'psl', 'cpl', 'hundred', 'vitality',
        'shield', 'division', 'games', 'world cup', 'asia cup', 'tournament',
        'provincial t20', 'csa domestic', 'president'
    ];
    for (const kw of tournamentKeywords) {
        if (combined.includes(kw)) {
            return false;
        }
    }

    // Explicit bilateral indicators
    if (combined.includes('tour of') || combined.includes(' in ') || combined.includes(' v ') || combined.includes(' vs ')) {
        return true;
    }

    return false;
}

function isTeamCurrentlyBatting(competitor, data) {
    if (!competitor) return false;
    const isLive = Boolean(data.state && (data.state.toLowerCase() === 'in' || data.state.toLowerCase() === 'live'));
    if (!isLive) return false;

    const s = String(competitor.score || '').toLowerCase();
    const compName = competitor.name || '';
    const compAbbr = competitor.abbr || '';

    // 1. If this competitor is chasing a target, they are batting in the 2nd Innings
    if (s.includes('target') || s.includes('need')) {
        return true;
    }

    // 2. Check currentInnings object from summary API
    if (data.currentInnings && data.currentInnings.teamName) {
        const innTeam = data.currentInnings.teamName;
        if (matchTeamNameOrAbbr(compName, compAbbr, innTeam)) return true;
        const innNum = String(data.currentInnings.inningsNumber || '');
        if (innNum === '2' && competitor.order === 2) return true;
        if (innNum === '1' && competitor.order === 1) return true;
    }

    // 3. In limited overs cricket, if competitor 1 completed 20 or 50 overs, they are NOT batting
    const isComp1 = (competitor.order === 1 || (data.competitors && data.competitors[0] === competitor));
    if (isComp1 && data.competitors && data.competitors.length > 1) {
        const otherScore = String(data.competitors[1].score || '').toLowerCase();
        if (otherScore.includes('target') || otherScore.includes('ov')) {
            return false;
        }
    }

    // 4. Fallback from latest innings in scorecard:
    if (data.innings) {
        const intKeys = Object.keys(data.innings).filter(k => /^\d+$/.test(k)).map(Number);
        if (intKeys.length > 0) {
            const latestKey = String(Math.max(...intKeys));
            const latestInn = data.innings[latestKey];
            if (latestInn && latestInn.teamName) {
                const innTeam = latestInn.teamName;
                if (matchTeamNameOrAbbr(compName, compAbbr, innTeam)) return true;
                if (latestKey === '2' && competitor.order === 2) return true;
                if (latestKey === '1' && competitor.order === 1) return true;
            }
        }
    }

    // 5. If overs in score and competitor 1 when competitor 2 has not started
    if (s.includes('ov') && isComp1 && data.competitors && data.competitors.length > 1) {
        const otherScore = String(data.competitors[1].score || '').trim();
        if (!otherScore || otherScore === '-') {
            return true;
        }
    }

    return false;
}

function renderMultiInningsScoreHTML(scoreStr, isTeamBattingNow = false, isLiveMatch = false, crrStr = "", isSecondInnings = false) {
    const cleanStr = cleanScoreString(scoreStr);
    if (!cleanStr || cleanStr === '-' || (/^\s*\(?\s*\d+(?:\.\d+)?\s*(?:ov|overs)\s*\)?\s*$/i.test(cleanStr) && !cleanStr.includes('/'))) {
        return `
            <div class="bg-slate-100/90 dark:bg-dark-900/90 border border-slate-200 dark:border-emerald-500/30 rounded-lg px-2.5 py-1 shadow-2xs text-right shrink-0">
                <div class="font-mono font-bold text-xs sm:text-sm text-slate-400 dark:text-gray-500">Yet to bat</div>
            </div>
        `;
    }
    const crrBadge = (isTeamBattingNow && isLiveMatch && crrStr && crrStr !== '-' && crrStr !== '0.00')
        ? `<span class="inline-block text-[8px] sm:text-[9px] font-mono font-black text-emerald-800 dark:text-[#00ff88] bg-[#00ff88]/20 border border-[#00ff88]/50 px-1.5 py-0.2 rounded ml-1 tracking-normal select-none shadow-[0_0_8px_rgba(0,255,136,0.5)]">CRR ${crrStr}</span>`
        : '';

    if (cleanStr.includes('&')) {
        const parts = cleanStr.split('&');
        const inn1 = parts[0].trim();
        const inn2 = parts[1].trim();

        const inn1Label = isSecondInnings ? '2nd INN' : '1st INN';
        const inn2Label = isSecondInnings ? '4th INN' : '3rd INN';
        const inn2IsLive = isTeamBattingNow && isLiveMatch;

        return `
            <div class="flex items-center gap-1 sm:gap-1.5 text-right shrink-0">
                <!-- 1st/2nd Innings Glass Pod (Completed) -->
                <div class="bg-slate-100/90 dark:bg-dark-900/90 border border-slate-200/90 dark:border-emerald-500/30 rounded-lg px-2 py-0.5 sm:px-2.5 sm:py-1 shadow-2xs">
                    <div class="hero-inn-label text-[7.5px] sm:text-[8px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-400 flex items-center justify-end gap-1">
                        <span class="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0"></span>
                        <span>${inn1Label}</span>
                    </div>
                    <div class="font-mono font-bold text-xs sm:text-sm text-slate-700 dark:text-gray-200 tracking-tight leading-tight">
                        ${inn1}
                    </div>
                </div>

                <!-- Divider Connector -->
                <div class="text-[9px] font-black px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-[#00ff88] border border-emerald-500/30 select-none shadow-2xs">
                    &
                </div>

                <!-- 3rd/4th Innings Pod (Active 3D Neon Pod if Live, Glass Pod if Completed) -->
                ${inn2IsLive ? `
                    <div class="bg-emerald-500/15 dark:bg-emerald-950/80 border-2 border-[#00ff88] rounded-lg px-2 sm:px-2.5 py-0.5 sm:py-1 shadow-[0_0_20px_rgba(0,255,136,0.5),inset_0_0_10px_rgba(0,255,136,0.2)] ring-1 ring-[#00ff88]/50">
                        <div class="hero-inn-label text-[7.5px] sm:text-[8px] font-bold uppercase tracking-wider text-emerald-800 dark:text-[#00ff88] flex items-center justify-end gap-1">
                            <span class="w-1.5 h-1.5 rounded-full bg-[#00ff88] shadow-[0_0_8px_#00ff88] animate-ping shrink-0"></span>
                            <span class="font-bold">${inn2Label} (LIVE)</span>
                            ${crrBadge}
                        </div>
                        <div class="digital-score-3d font-mono font-black text-sm sm:text-base md:text-lg text-emerald-800 dark:text-[#00ff88] drop-shadow-[0_0_12px_rgba(0,255,136,0.6)] tracking-tight leading-tight">
                            ${inn2}
                        </div>
                    </div>
                ` : `
                    <div class="bg-slate-100/90 dark:bg-dark-900/90 border border-slate-200/90 dark:border-emerald-500/30 rounded-lg px-2 py-0.5 sm:px-2.5 sm:py-1 shadow-2xs">
                        <div class="hero-inn-label text-[7.5px] sm:text-[8px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-400 flex items-center justify-end gap-1">
                            <span class="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0"></span>
                            <span>${inn2Label}</span>
                        </div>
                        <div class="font-mono font-bold text-xs sm:text-sm text-slate-700 dark:text-gray-200 tracking-tight leading-tight">
                            ${inn2}
                        </div>
                    </div>
                `}
            </div>
        `;
    }

    const is2nd = isSecondInnings || cleanStr.toLowerCase().includes('target') || cleanStr.toLowerCase().includes('need');
    const innLabel = is2nd ? '2nd INN' : '1st INN';
    const innIsLive = isTeamBattingNow && isLiveMatch;

    return `
        <div class="${innIsLive ? 'bg-emerald-500/15 dark:bg-emerald-950/80 border-2 border-[#00ff88] shadow-[0_0_20px_rgba(0,255,136,0.5),inset_0_0_10px_rgba(0,255,136,0.2)] ring-1 ring-[#00ff88]/50' : 'bg-slate-100/90 dark:bg-dark-900/90 border border-slate-200/90 dark:border-emerald-500/30 shadow-2xs'} rounded-lg px-2.5 sm:px-3 py-1 sm:py-1.5 text-right shrink-0">
            <div class="hero-inn-label text-[7.5px] sm:text-[8px] font-bold uppercase tracking-wider ${innIsLive ? 'text-emerald-800 dark:text-[#00ff88]' : 'text-slate-400 dark:text-gray-400'} flex items-center justify-end gap-1">
                <span class="w-1.5 h-1.5 rounded-full ${innIsLive ? 'bg-[#00ff88] shadow-[0_0_8px_#00ff88] animate-ping' : 'bg-slate-400 dark:bg-slate-500'} shrink-0"></span>
                <span class="${innIsLive ? 'font-bold' : ''}">${innLabel} ${innIsLive ? '(LIVE)' : ''}</span>
                ${innIsLive ? crrBadge : ''}
            </div>
            <div class="${innIsLive ? 'digital-score-3d text-emerald-800 dark:text-[#00ff88] drop-shadow-[0_0_12px_rgba(0,255,136,0.6)]' : 'text-slate-800 dark:text-gray-100 font-bold'} font-mono text-base sm:text-lg md:text-xl tracking-tight leading-tight">
                ${cleanStr}
            </div>
        </div>
    `;
}

// -------------------------------------------------------------
// UI Rendering - Matches Sidebar List
// -------------------------------------------------------------

function escapeQuotes(str) {
    if (!str) return '';
    return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

async function filterBySpecificSeries(seriesName, leagueId = '') {
    if (!seriesName) return;
    appState.selectedSeriesFilter = seriesName;
    appState.selectedSeriesLeagueId = leagueId;

    // Resolve leagueId if not provided directly
    if (!leagueId && appState.matches) {
        const sLower = seriesName.toLowerCase();
        const found = appState.matches.find(m => {
            const lName = (m.leagueName || '').toLowerCase();
            const sTitle = (m.seriesTitle || '').toLowerCase();
            return (lName && (lName.includes(sLower) || sLower.includes(lName))) ||
                   (sTitle && (sTitle.includes(sLower) || sLower.includes(sTitle)));
        });
        if (found && found.leagueId) {
            leagueId = found.leagueId;
            appState.selectedSeriesLeagueId = leagueId;
        }
    }

    renderMatchList();

    if (leagueId) {
        if (!appState.seriesMatchesCache) appState.seriesMatchesCache = {};
        if (!appState.seriesMatchesCache[leagueId]) {
            try {
                const resp = await fetch(`/api/series/${leagueId}/matches`);
                if (resp.ok) {
                    const data = await resp.json();
                    if (data.matches && data.matches.length > 0) {
                        appState.seriesMatchesCache[leagueId] = data.matches;
                        renderMatchList();
                    }
                }
            } catch(e) {
                console.warn("Failed to fetch series matches:", e);
            }
        }
    }
}

function clearSeriesFilter() {
    appState.selectedSeriesFilter = null;
    appState.selectedSeriesLeagueId = null;
    renderMatchList();
}

// ============================================================
// UPCOMING MATCHES - IST TIME FORMATTER & ANTICLOCKWISE TIMER
// ============================================================

function parseMatchDate(dateStr) {
    if (!dateStr) return null;
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;
        return d;
    } catch(e) {
        return null;
    }
}

function formatMatchTimeIST(dateStr) {
    const d = parseMatchDate(dateStr);
    if (!d) return 'Upcoming';

    try {
        const timeStr = d.toLocaleTimeString('en-US', {
            timeZone: 'Asia/Kolkata',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        const now = new Date();
        const istDateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        const nowIstDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

        const nowIst = new Date(nowIstDateStr + 'T00:00:00');
        const matchIst = new Date(istDateStr + 'T00:00:00');
        const diffDays = Math.round((matchIst - nowIst) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return `Today, ${timeStr} IST`;
        } else if (diffDays === 1) {
            return `Tomorrow, ${timeStr} IST`;
        } else {
            const datePart = d.toLocaleDateString('en-US', {
                timeZone: 'Asia/Kolkata',
                day: '2-digit',
                month: 'short'
            });
            return `${datePart}, ${timeStr} IST`;
        }
    } catch(e) {
        return 'Upcoming';
    }
}

function computeAnticlockwiseCountdown(dateStr) {
    const d = parseMatchDate(dateStr);
    if (!d) return { text: 'Upcoming', isLiveNow: false };

    const nowMs = Date.now();
    const diffMs = d.getTime() - nowMs;

    if (diffMs <= 0) {
        return { text: 'Starting Soon', isLiveNow: true };
    }

    const totalSec = Math.floor(diffMs / 1000);
    const sec = totalSec % 60;
    const totalMin = Math.floor(totalSec / 60);
    const min = totalMin % 60;
    const totalHours = Math.floor(totalMin / 60);
    const hours = totalHours % 24;
    const days = Math.floor(totalHours / 24);

    const pad = (n) => String(n).padStart(2, '0');

    if (days > 0) {
        return { text: `${days}d ${pad(hours)}h ${pad(min)}m`, isLiveNow: false };
    }
    return { text: `${pad(hours)}h : ${pad(min)}m : ${pad(sec)}s`, isLiveNow: false };
}

let upcomingTimerInterval = null;
function startUpcomingCountdowns() {
    if (upcomingTimerInterval) return;
    upcomingTimerInterval = setInterval(() => {
        // Update countdown badges on match cards
        const badges = document.querySelectorAll('.upcoming-countdown-badge');
        badges.forEach(el => {
            const dateStr = el.getAttribute('data-match-date');
            if (dateStr) {
                const cd = computeAnticlockwiseCountdown(dateStr);
                const textEl = el.querySelector('.countdown-timer-text');
                if (textEl) {
                    textEl.textContent = cd.text;
                    if (cd.isLiveNow) {
                        el.classList.add('animate-pulse');
                    }
                }
            }
        });

        // Update countdown box on hero match banner
        const heroCd = document.querySelectorAll('.upcoming-hero-countdown');
        heroCd.forEach(el => {
            const dateStr = el.getAttribute('data-match-date');
            if (dateStr) {
                const cd = computeAnticlockwiseCountdown(dateStr);
                const textEl = el.querySelector('.countdown-hero-text');
                if (textEl) {
                    textEl.textContent = cd.isLiveNow ? 'Match Starting Soon' : `Starts in: ${cd.text}`;
                    if (cd.isLiveNow) {
                        el.classList.add('animate-pulse');
                    }
                }
            }
        });
    }, 1000);
}


// -------------------------------------------------------------
// CHASE EQUATION & REQUIRED RUN RATE (RRR) CALCULATION ENGINE
// -------------------------------------------------------------

function extractOrComputeChaseEquation(data, c1Score, c2Score, c1, c2) {
    if (!data) return null;
    const isTestMatch = Boolean(
        data.isTestMatch || 
        (data.currentInnings && data.currentInnings.isTestMatch) || 
        (data.description && /test|4-day|5-day|championship|shield|ranji/i.test(data.description))
    );
    if (isTestMatch) return null;

    const s1 = String(c1Score || '');
    const s2 = String(c2Score || '');
    const lead = String(data.leadSummary || data.statusDetail || '');

    let runsNeeded = null;
    let ballsLeft = null;
    let rrr = '';
    let target = null;
    let chasingTeam = '';

    // 1. Try to extract official equation directly from leadSummary (handles DLS, rain revisions, official match data)
    // Matches patterns like: "India need 22 runs from 126 balls (RRR: 1.05)" or "Need 102 runs in 233 balls"
    const leadMatch = lead.match(/(?:(.+?)\s+)?need\s+(\d+)\s+runs?(?:\s+(?:from|in|off)\s+(\d+)\s+balls?)?(?:\s*\((?:RRR:?\s*)?([\d\.]+)\))?/i);
    if (leadMatch) {
        if (leadMatch[1]) chasingTeam = leadMatch[1].trim();
        if (leadMatch[2]) runsNeeded = parseInt(leadMatch[2], 10);
        if (leadMatch[3]) ballsLeft = parseInt(leadMatch[3], 10);
        if (leadMatch[4]) rrr = leadMatch[4].trim();
    }

    if (!rrr) {
        const rrrMatch = lead.match(/RRR:\s*([\d\.]+)/i);
        if (rrrMatch) rrr = rrrMatch[1].trim();
    }

    // 2. Target extraction from strings
    const targetMatch = (s1 + ' ' + s2 + ' ' + lead).match(/target\s*(\d+)/i);
    if (targetMatch) {
        target = parseInt(targetMatch[1], 10);
    }

    const isSecondInnings = Boolean(
        target !== null ||
        runsNeeded !== null ||
        (data.innings && Object.keys(data.innings).length >= 2) ||
        s2.toLowerCase().includes('target') ||
        lead.toLowerCase().includes('need')
    );

    if (!isSecondInnings) return null;

    let chasingScoreStr = s2;
    let firstInningsScoreStr = s1;
    let chaserObj = c2;
    if (s1.toLowerCase().includes('target') && !s2.toLowerCase().includes('target')) {
        chasingScoreStr = s1;
        firstInningsScoreStr = s2;
        chaserObj = c1;
    }

    if (!chasingTeam && chaserObj) {
        chasingTeam = chaserObj.name || chaserObj.shortName || chaserObj.abbr || 'Batting Team';
    }

    const rChaserMatch = chasingScoreStr.match(/^(\d+)/);
    const runsScored = rChaserMatch ? parseInt(rChaserMatch[1], 10) : 0;

    if (target === null) {
        const r1M = firstInningsScoreStr.match(/^(\d+)/);
        if (r1M) {
            target = parseInt(r1M[1], 10) + 1;
        }
    }

    if (target !== null && runsNeeded === null) {
        runsNeeded = Math.max(0, target - runsScored);
    }

    // Flexible regex for current overs bowled & max overs:
    // Matches "(8.1/47 ov, target 135)", "(26/37 ov)", "(15.2/20 ov)", "(8.1 ov)"
    const ovMatch = chasingScoreStr.match(/\((\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?\s*ov/i);
    if (ovMatch && ballsLeft === null) {
        const curOv = parseFloat(ovMatch[1]);
        let maxOv = ovMatch[2] ? parseFloat(ovMatch[2]) : null;
        if (!maxOv) {
            const maxM = (firstInningsScoreStr + ' ' + (data.description || '')).match(/(?:\/|reduced\s+to\s*)(\d+(?:\.\d+)?)\s*ov/i);
            if (maxM) {
                maxOv = parseFloat(maxM[1]);
            } else if (firstInningsScoreStr.includes('/50') || (data.description && /odi|50/i.test(data.description))) {
                maxOv = 50;
            } else {
                maxOv = 20;
            }
        }
        const fullOv = Math.floor(curOv);
        const remB = Math.round((curOv - fullOv) * 10);
        const ballsBowled = fullOv * 6 + remB;
        const totalBalls = Math.round(maxOv * 6);
        ballsLeft = Math.max(0, totalBalls - ballsBowled);
    }

    if (!rrr && runsNeeded !== null && ballsLeft !== null && ballsLeft > 0) {
        rrr = (runsNeeded / (ballsLeft / 6.0)).toFixed(2);
    }

    return {
        isChase: true,
        chasingTeam,
        runsNeeded: runsNeeded !== null ? runsNeeded : 0,
        ballsLeft: ballsLeft !== null ? ballsLeft : 0,
        target: target || 0,
        rrr: rrr || '-',
        equationText: (runsNeeded !== null && ballsLeft !== null) ? `${runsNeeded} runs in ${ballsLeft} balls` : '',
        shortEquation: (runsNeeded !== null && ballsLeft !== null) ? `${runsNeeded} off ${ballsLeft}b` : ''
    };
}

function renderSingleMatchCard(m) {
    const isActive = (m.id === appState.selectedEventId);
    const isLive = m.isLive;
    const statusText = m.statusDetail || (isLive ? '● LIVE' : 'Scheduled');
    const isStumps = statusText.toLowerCase().includes('stumps') || statusText.toLowerCase().includes('tea') || statusText.toLowerCase().includes('lunch');

    const isMatchDone = Boolean(m.state && ['post', 'final', 'completed'].includes(m.state.toLowerCase()));
    const isUpcoming = Boolean(
        !isLive && !isMatchDone &&
        (m.state === 'pre' || 
         (m.statusDetail && (m.statusDetail.toLowerCase().includes('scheduled') || m.statusDetail.toLowerCase().includes('starts'))) ||
         (m.date && new Date(m.date).getTime() > Date.now()))
    );

    let statusClass = 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40';
    let displayStatus = statusText;

    if (isStumps) {
        statusClass = 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-400/60 dark:border-amber-600/70 shadow-xs font-black';
        displayStatus = statusText;
    } else if (isLive) {
        statusClass = 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60';
        displayStatus = '● LIVE';
    } else if (isMatchDone) {
        statusClass = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-gray-300 border border-slate-200 dark:border-gray-700';
        displayStatus = m.statusDetail || 'Final';
    } else if (isUpcoming) {
        statusClass = 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 font-mono font-bold';
        displayStatus = m.date ? formatMatchTimeIST(m.date) : 'Upcoming';
    }

    const c1 = m.competitors && m.competitors[0] ? m.competitors[0] : { name: 'Team 1', score: '' };
    const c2 = m.competitors && m.competitors[1] ? m.competitors[1] : { name: 'Team 2', score: '' };

    let cardSummaryText = m.summary || m.statusDetail || '';
    if (isMatchDone) {
        if (m.statusDetail && !m.statusDetail.toLowerCase().includes('lead by') && !m.statusDetail.toLowerCase().includes('trail by')) {
            cardSummaryText = m.statusDetail;
        } else if (c1.isWinner) {
            cardSummaryText = `${c1.name} won`;
        } else if (c2.isWinner) {
            cardSummaryText = `${c2.name} won`;
        } else if (cardSummaryText.toLowerCase().includes('drawn') || (m.statusDetail && m.statusDetail.toLowerCase().includes('drawn'))) {
            cardSummaryText = 'Match drawn';
        } else {
            cardSummaryText = 'Match Completed';
        }
    }

    const seriesTitle = m.leagueName || (m.description ? m.description.split(',')[0].trim() : 'Series');
    const safeSeries = escapeQuotes(seriesTitle);

    let cardRRR = "";
    if (isLive && !m.isTestMatch) {
        const chaseCardInfo = extractOrComputeChaseEquation(m, c1.score, c2.score, c1, c2);
        if (chaseCardInfo && chaseCardInfo.rrr !== '-') {
            cardRRR = chaseCardInfo.rrr;
        }
    }

    return `
        <div onclick="selectMatch('${m.leagueId}', '${m.id}')" 
             class="match-card p-3 rounded-xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-dark-800 cursor-pointer ${isActive ? 'active-match' : ''}">
            <div class="flex items-center justify-between gap-1.5 mb-1.5">
                <div onclick="event.stopPropagation(); filterBySpecificSeries('${safeSeries}', '${m.leagueId || ''}')" 
                     class="flex items-center gap-1 truncate max-w-[190px] cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 transition group/ser" 
                     title="View all ${seriesTitle} matches">
                    <span class="text-[10px] font-extrabold text-slate-600 dark:text-gray-300 group-hover/ser:text-emerald-600 dark:group-hover/ser:text-emerald-400 uppercase tracking-wider truncate group-hover/ser:underline">
                        ${seriesTitle}
                    </span>
                    <i data-lucide="chevron-right" class="w-3 h-3 text-slate-400 group-hover/ser:text-emerald-500 shrink-0 transition group-hover/ser:translate-x-0.5"></i>
                    ${m.inningsLabel ? `<span class="innings-pill text-[8px] px-1.5 py-0.2 rounded font-mono font-medium uppercase bg-sky-50 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 shrink-0 select-none">${m.inningsLabel}</span>` : ''}
                </div>
                
                <div class="flex items-center gap-1.5 shrink-0">
                    ${!isBilateralSeries(m) ? `
                    <button onclick="event.stopPropagation(); viewMatchPointsTable('${m.leagueId}', '${m.id}')" 
                            class="card-points-btn flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/40 text-[9.5px] font-black uppercase tracking-wider transition active:scale-95 cursor-pointer shadow-2xs"
                            title="View Tournament Points Table">
                        <i data-lucide="trophy" class="w-3 h-3 text-amber-500"></i>
                        <span>Points Table</span>
                    </button>
                    ` : ''}
                    <span class="text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase shrink-0 ${statusClass}">
                        ${displayStatus}
                    </span>
                </div>
            </div>

            <div class="space-y-1 text-xs">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-2 truncate">
                        ${renderTeamLogo(c1.name, c1.logo, 'w-5 h-5')}
                        <span class="font-bold text-slate-800 dark:text-gray-200 truncate ${c1.isWinner ? 'text-[#059669] dark:text-emerald-400' : ''}">${c1.name}</span>
                    </div>
                    <span class="match-team-score font-mono font-bold text-slate-900 dark:text-white text-right">${cleanScoreString(c1.score)}</span>
                </div>
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-2 truncate">
                        ${renderTeamLogo(c2.name, c2.logo, 'w-5 h-5')}
                        <span class="font-bold text-slate-800 dark:text-gray-200 truncate ${c2.isWinner ? 'text-[#059669] dark:text-emerald-400' : ''}">${c2.name}</span>
                    </div>
                    <span class="match-team-score font-mono font-bold text-slate-900 dark:text-white text-right">${cleanScoreString(c2.score)}</span>
                </div>
            </div>

            ${isUpcoming ? `
                <div class="mt-2 pt-1.5 border-t border-slate-100 dark:border-gray-800/80 flex items-center justify-between text-[10.5px]">
                    <span class="text-slate-500 dark:text-gray-400 font-sans font-medium flex items-center gap-1 truncate max-w-[140px]" title="Match Time: ${formatMatchTimeIST(m.date)}">
                        <i data-lucide="clock" class="w-3.5 h-3.5 text-blue-500 shrink-0"></i>
                        <span class="font-mono text-[10px] font-bold text-slate-700 dark:text-gray-300 truncate">${formatMatchTimeIST(m.date)}</span>
                    </span>
                    <span class="upcoming-countdown-badge px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40 font-black font-mono text-[10px] tracking-tight flex items-center gap-1.5 shrink-0" data-match-date="${m.date || ''}">
                        <svg class="w-3.5 h-3.5 text-amber-500 animate-spin-reverse shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <circle cx="12" cy="12" r="10" stroke-dasharray="60" stroke-dashoffset="15"></circle>
                            <polyline points="12 6 12 12 8 14"></polyline>
                        </svg>
                        <span class="countdown-timer-text">${computeAnticlockwiseCountdown(m.date).text}</span>
                    </span>
                </div>
            ` : (cardRRR ? `
                <div class="mt-2 pt-1.5 border-t border-slate-100 dark:border-gray-800/80 flex items-center justify-between text-[10px] font-mono font-bold">
                    <span class="text-rose-600 dark:text-[#ff4d6d] flex items-center gap-1 font-black">
                        <i data-lucide="target" class="w-3 h-3 text-rose-500 animate-pulse"></i> RRR: ${cardRRR}
                    </span>
                    ${m.crr ? `<span class="text-emerald-600 dark:text-emerald-400 font-bold">CRR: ${m.crr}</span>` : ''}
                </div>
            ` : (m.winProbability && (isLive || m.winProbability.isLive) ? `
                <div class="card-win-prob hidden md:flex mt-2 pt-1.5 border-t border-slate-100 dark:border-gray-800/80 items-center justify-between text-[10px] font-mono font-bold">
                    <span class="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <i data-lucide="trending-up" class="w-3 h-3 text-emerald-500"></i> ${m.winProbability.team1?.shortName} ${m.winProbability.team1?.probability}%
                    </span>
                    <span class="text-indigo-600 dark:text-indigo-400">
                        ${m.winProbability.team2?.shortName} ${m.winProbability.team2?.probability}%
                    </span>
                </div>
            ` : (cardSummaryText ? `
                <div class="mt-2 pt-1.5 border-t border-slate-100 dark:border-gray-800/80 text-[11px] text-slate-600 dark:text-gray-300 font-semibold truncate flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-[#059669] dark:bg-sky-400 shrink-0"></span>
                    <span>${cardSummaryText}</span>
                </div>
            ` : '')))}

            ${m.playerOfTheMatch ? `
                <div class="mt-1.5 pt-1 border-t border-amber-500/20 text-[10.5px] text-amber-700 dark:text-amber-400 font-bold truncate flex items-center gap-1.5">
                    <span class="shrink-0 text-xs">🏆</span>
                    <span class="truncate">POTM: <span class="text-slate-900 dark:text-white font-black">${escapeQuotes(m.playerOfTheMatch.name)}</span>${m.playerOfTheMatch.performance ? ` <span class="font-normal opacity-90 font-mono text-[9.5px]">(${escapeQuotes(m.playerOfTheMatch.performance)})</span>` : ''}</span>
                </div>
            ` : ''}

            ${m.playerOfTheSeries ? `
                <div class="mt-1 pt-1 border-t border-purple-500/20 text-[10.5px] text-purple-700 dark:text-purple-400 font-bold truncate flex items-center gap-1.5">
                    <span class="shrink-0 text-xs">🎖️</span>
                    <span class="truncate">${escapeQuotes(m.playerOfTheSeries.title || 'POTS')}: <span class="text-slate-900 dark:text-white font-black">${escapeQuotes(m.playerOfTheSeries.name)}</span>${m.playerOfTheSeries.teamName ? ` <span class="font-normal opacity-90 text-[9.5px]">(${escapeQuotes(m.playerOfTheSeries.teamName)})</span>` : ''}</span>
                </div>
            ` : ''}
        </div>
    `;
}

function renderMatchList() {
    const container = document.getElementById('match-list-container');
    if (!container) return;

    const prevScrollLeft = container.scrollLeft;

    let filtered = appState.matches;

    // Series Grouping Mode: When user tapped the Series Name on top of any match card
    if (appState.selectedSeriesFilter) {
        const sFilter = appState.selectedSeriesFilter.toLowerCase();
        filtered = filtered.filter(m => 
            (m.leagueName && m.leagueName.toLowerCase().includes(sFilter)) ||
            (m.description && m.description.toLowerCase().includes(sFilter))
        );
    } else if (appState.activeCategory === 'live') {
        filtered = appState.categories.live;
    } else if (appState.activeCategory === 'recent') {
        filtered = appState.categories.recent;
    } else if (appState.activeCategory === 'upcoming') {
        filtered = appState.categories.upcoming;
    }

    if (appState.searchQuery.trim() !== '') {
        const q = appState.searchQuery.toLowerCase();
        filtered = filtered.filter(m => 
            (m.name && m.name.toLowerCase().includes(q)) ||
            (m.leagueName && m.leagueName.toLowerCase().includes(q)) ||
            (m.location && m.location.toLowerCase().includes(q))
        );
    }

    if (appState.selectedSeriesFilter) {
        const sFilter = appState.selectedSeriesFilter.toLowerCase();
        
        // Retrieve full sequence of matches for this series (from API cache if available)
        let seriesAllMatches = [];
        if (appState.selectedSeriesLeagueId && appState.seriesMatchesCache && appState.seriesMatchesCache[appState.selectedSeriesLeagueId]) {
            seriesAllMatches = appState.seriesMatchesCache[appState.selectedSeriesLeagueId];
        } else {
            seriesAllMatches = (appState.matches || []).filter(m => 
                (m.leagueName && m.leagueName.toLowerCase().includes(sFilter)) ||
                (m.description && m.description.toLowerCase().includes(sFilter)) ||
                (m.name && m.name.toLowerCase().includes(sFilter))
            );
        }

        // Sort chronologically in A to Z sequence (earliest to latest)
        seriesAllMatches = [...seriesAllMatches].sort((a, b) => {
            const da = a.date ? new Date(a.date).getTime() : 0;
            const db = b.date ? new Date(b.date).getTime() : 0;
            return da - db;
        });

        const liveFeed = seriesAllMatches.filter(m => m.isLive);
        const recentFeed = seriesAllMatches.filter(m => !m.isLive && (m.isCompleted || (m.state && ['post', 'final', 'completed'].includes(m.state.toLowerCase()))));
        const upcomingFeed = seriesAllMatches.filter(m => !m.isLive && (m.isUpcoming || (m.state && ['pre', 'scheduled'].includes(m.state.toLowerCase()))));
        const totalMatchesCount = liveFeed.length + recentFeed.length + upcomingFeed.length;

        container.innerHTML = `
            <div class="w-full flex flex-col space-y-4">
                <div class="flex items-center justify-between bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-transparent border border-emerald-500/40 px-3.5 py-2.5 rounded-2xl shadow-xs">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <button onclick="clearSeriesFilter()" class="flex items-center gap-1.5 text-xs font-black text-emerald-800 dark:text-emerald-300 bg-white dark:bg-dark-800 hover:bg-emerald-50 dark:hover:bg-dark-700 border border-emerald-500/40 px-3 py-1.5 rounded-xl transition active:scale-95 cursor-pointer shadow-sm">
                            <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i> All Matches
                        </button>
                        <span class="text-slate-400 font-bold">/</span>
                        <div class="flex items-center gap-1.5 truncate">
                            <div class="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white shrink-0 shadow-2xs">
                                <i data-lucide="trophy" class="w-3.5 h-3.5"></i>
                            </div>
                            <span class="font-black text-xs sm:text-sm text-slate-900 dark:text-white truncate font-mono">${appState.selectedSeriesFilter}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <button onclick="switchPlatformView('series')" class="flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-[#00ff88] bg-white dark:bg-dark-800 hover:bg-emerald-50 dark:hover:bg-dark-700 px-2.5 py-1 rounded-lg border border-emerald-500/40 transition shadow-2xs cursor-pointer">
                            <i data-lucide="award" class="w-3.5 h-3.5 text-amber-400"></i>
                            <span>Points Table</span>
                        </button>
                        <span class="text-[10px] font-mono font-black px-2.5 py-1 rounded-lg bg-emerald-600 text-white shadow-2xs shrink-0">
                            ${totalMatchesCount} ${totalMatchesCount === 1 ? 'Match' : 'Matches'}
                        </span>
                    </div>
                </div>

                ${liveFeed.length > 0 ? `
                    <div class="space-y-2">
                        <div class="flex items-center gap-1.5 text-xs font-mono font-black uppercase text-rose-500">
                            <span class="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
                            Live Now (${liveFeed.length})
                        </div>
                        <div class="flex flex-col lg:flex-row space-y-2.5 lg:space-y-0 lg:space-x-3 overflow-x-hidden lg:overflow-x-auto pb-1.5">
                            ${liveFeed.map(m => renderSingleMatchCard(m)).join('')}
                        </div>
                    </div>
                ` : ''}

                <div class="space-y-2">
                    <div class="flex items-center justify-between text-xs font-mono font-black uppercase text-emerald-700 dark:text-emerald-300">
                        <span class="flex items-center gap-1.5">
                            <i data-lucide="check-circle" class="w-3.5 h-3.5 text-emerald-500"></i>
                            Completed Matches (Results)
                        </span>
                        <span class="text-[10px] font-mono text-slate-400">${recentFeed.length} Matches</span>
                    </div>
                    ${recentFeed.length > 0 ? `
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                            ${recentFeed.map(m => renderSingleMatchCard(m)).join('')}
                        </div>
                    ` : '<div class="text-slate-400 text-xs py-3 text-center bg-slate-50 dark:bg-dark-900/50 rounded-xl border border-slate-200/60 dark:border-gray-800">No completed matches found for this series yet.</div>'}
                </div>

                <div class="space-y-2">
                    <div class="flex items-center justify-between text-xs font-mono font-black uppercase text-blue-600 dark:text-blue-400">
                        <span class="flex items-center gap-1.5">
                            <i data-lucide="calendar" class="w-3.5 h-3.5 text-blue-500"></i>
                            Upcoming Fixtures (Schedule)
                        </span>
                        <span class="text-[10px] font-mono text-slate-400">${upcomingFeed.length} Matches</span>
                    </div>
                    ${upcomingFeed.length > 0 ? `
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                            ${upcomingFeed.map(m => renderSingleMatchCard(m)).join('')}
                        </div>
                    ` : '<div class="text-slate-400 text-xs py-3 text-center bg-slate-50 dark:bg-dark-900/50 rounded-xl border border-slate-200/60 dark:border-gray-800">No upcoming fixtures scheduled.</div>'}
                </div>
            </div>
        `;
        safeCreateIcons();
        startUpcomingCountdowns();
        return;
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-slate-400 text-xs w-full">
                <i data-lucide="inbox" class="w-6 h-6 mx-auto mb-2 opacity-50"></i>
                <p>No matches found in this category.</p>
            </div>
        `;
        safeCreateIcons();
        return;
    }

    container.innerHTML = filtered.map(m => renderSingleMatchCard(m)).join('');

    if (prevScrollLeft > 0) {
        container.scrollLeft = prevScrollLeft;
    }

    safeCreateIcons();
    startUpcomingCountdowns();
}

function isMobileLayoutActive() {
    return window.innerWidth < 1024 || document.body.classList.contains('layout-mode-mobile');
}

function selectMatch(leagueId, eventId, autoScroll = false) {
    appState.selectedLeagueId = leagueId;
    appState.selectedEventId = eventId;
    appState.activeInningsKey = null;

    // Persist selected match to localStorage
    try {
        localStorage.setItem('sports_dynasty_selected_match', JSON.stringify({ leagueId: leagueId, eventId: eventId }));
    } catch(e) {}

    renderMatchList();

    const isMobile = isMobileLayoutActive();
    const carouselSec = document.getElementById('section-match-carousel');
    const detailSec = document.getElementById('section-match-detail');
    const backBar = document.getElementById('mobile-match-back-bar');

    if (isMobile) {
        // Cricbuzz Mobile Focus View: Hide match list, show ONLY selected match
        if (carouselSec) carouselSec.classList.add('hidden');
        if (detailSec) detailSec.classList.remove('hidden');
        if (backBar) {
            backBar.classList.remove('hidden');
            backBar.classList.add('flex');
            
            // Set dynamic title
            const matchObj = (appState.matches || []).find(m => m.id === eventId);
            if (matchObj) {
                const titleEl = document.getElementById('mobile-back-match-title');
                const statusEl = document.getElementById('mobile-back-match-status');
                const c1 = matchObj.competitors?.[0]?.name || 'Team 1';
                const c2 = matchObj.competitors?.[1]?.name || 'Team 2';
                if (titleEl) titleEl.textContent = `${c1} vs ${c2}`;
                if (statusEl) statusEl.textContent = matchObj.statusText || matchObj.statusDetail || '⚡ Live Match Arena';
            }
        }
        
        safeCreateIcons();

        try {
            const cleanUrl = `/match/${leagueId}/${eventId}`;
            if (window.location.pathname !== cleanUrl) {
                history.pushState({ matchView: eventId, leagueId: leagueId }, '', cleanUrl);
            }
        } catch(e) {}
    } else {
        // Desktop View: Keep both carousel and details visible
        if (carouselSec) carouselSec.classList.remove('hidden');
        if (detailSec) detailSec.classList.remove('hidden');
        if (backBar) {
            backBar.classList.add('hidden');
            backBar.classList.remove('flex');
        }

        try {
            const cleanUrl = `/match/${leagueId}/${eventId}`;
            if (window.location.pathname !== cleanUrl) {
                history.replaceState({ matchView: eventId, leagueId: leagueId }, '', cleanUrl);
            }
        } catch(e) {}

        // Scroll ONLY the carousel container horizontally if user explicitly clicked next/prev
        if (autoScroll) {
            setTimeout(() => {
                const listContainer = document.getElementById('match-list-container');
                const activeCard = document.querySelector('.match-card.active-match');
                if (listContainer && activeCard) {
                    const cardLeft = activeCard.offsetLeft;
                    const cardWidth = activeCard.offsetWidth;
                    const containerWidth = listContainer.offsetWidth;
                    listContainer.scrollTo({
                        left: cardLeft - (containerWidth / 2) + (cardWidth / 2),
                        behavior: 'smooth'
                    });
                }
            }, 100);
        }
    }

    fetchMatchDetails(leagueId, eventId, true);
}

function backToMatchList() {
    try {
        localStorage.removeItem('sports_dynasty_selected_match');
    } catch(e) {}

    const carouselSec = document.getElementById('section-match-carousel');
    const detailSec = document.getElementById('section-match-detail');
    const backBar = document.getElementById('mobile-match-back-bar');

    if (carouselSec) carouselSec.classList.remove('hidden');
    if (backBar) {
        backBar.classList.add('hidden');
        backBar.classList.remove('flex');
    }

    if (isMobileLayoutActive()) {
        if (detailSec) detailSec.classList.add('hidden');
    } else {
        if (detailSec) detailSec.classList.remove('hidden');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    safeCreateIcons();

    try {
        if (window.location.pathname.startsWith('/match/')) {
            history.pushState(null, '', '/');
        } else if (window.location.hash.startsWith('#match-')) {
            history.pushState(null, '', window.location.pathname);
        }
    } catch(e) {}
}

window.addEventListener('popstate', (e) => {
    if (isMobileLayoutActive() && (!e.state || !e.state.matchView)) {
        backToMatchList();
    }
});

function scrollMatchList(offset) {
    const container = document.getElementById('match-list-container');
    if (container) {
        container.scrollBy({ left: offset, behavior: 'smooth' });
    }
}

function navigateMatch(direction) {
    if (!appState.matches || appState.matches.length === 0) return;
    const currIdx = appState.matches.findIndex(m => m.id === appState.selectedEventId);
    let nextIdx = currIdx + direction;
    if (nextIdx < 0) nextIdx = appState.matches.length - 1;
    if (nextIdx >= appState.matches.length) nextIdx = 0;

    const nextMatch = appState.matches[nextIdx];
    if (nextMatch) {
        selectMatch(nextMatch.leagueId, nextMatch.id, true);
    }
}
function renderAllMatchDetails(data) {
    if (!data) return;
    try { renderHeroBanner(data); } catch(e) { console.error("renderHeroBanner err:", e); }
    try { renderCricinfoLiveTab(data); } catch(e) { console.error("renderCricinfoLiveTab err:", e); }
    try { renderTvStreamTab(data); } catch(e) { console.error("renderTvStreamTab err:", e); }
    try { renderScorecardTab(data); } catch(e) { console.error("renderScorecardTab err:", e); }
    try { renderMatchCoverageTab(data); } catch(e) { console.error("renderMatchCoverageTab err:", e); }
    try { renderAnalyticsTab(data); } catch(e) { console.error("renderAnalyticsTab err:", e); }
    try { renderCommentaryTab(data); } catch(e) { console.error("renderCommentaryTab err:", e); }
    try { renderSquadsTab(data); } catch(e) { console.error("renderSquadsTab err:", e); }
    try { renderMatchInfoTab(data); } catch(e) { console.error("renderMatchInfoTab err:", e); }
    
    // Restore persistent active tab (e.g. scorecard, live, commentary) on page refresh
    try {
        const savedTab = localStorage.getItem('sports_dynasty_active_tab') || appState.activeTab || 'live';
        switchMainTab(savedTab);
    } catch(e) {}

    safeCreateIcons();
}

// Precision Cricket Calculation Helpers
function computeEconomy(overs, runs) {
    if (!overs || runs === undefined || runs === null) return "0.00";
    const ovStr = String(overs).trim();
    const rVal = parseFloat(runs);
    if (!ovStr || ovStr === "0" || ovStr === "0.0" || isNaN(rVal)) return "0.00";

    let totalOvers = 0;
    if (ovStr.includes('.')) {
        const parts = ovStr.split('.');
        const fullOv = parseFloat(parts[0]) || 0;
        const balls = parseFloat(parts[1]) || 0;
        totalOvers = fullOv + (balls / 6.0);
    } else {
        totalOvers = parseFloat(ovStr) || 0;
    }

    if (totalOvers <= 0) return "0.00";
    return (rVal / totalOvers).toFixed(2);
}

function computeStrikeRate(runs, balls) {
    const r = parseFloat(runs) || 0;
    const b = parseFloat(balls) || 0;
    if (b <= 0) return "0.00";
    return ((r / b) * 100.0).toFixed(2);
}

function computeCRRFromScore(scoreStr) {
    if (!scoreStr) return "";
    const s = String(scoreStr).trim();
    const rrMatch = s.match(/RR:\s*([\d\.]+)/i);
    if (rrMatch) return rrMatch[1].trim();
    const ovMatch = s.match(/(\d+\.?\d*)\s*(?:ovs?|overs?)/i);
    if (!ovMatch) return "";
    const ovStr = ovMatch[1];
    const sWithoutOvers = s.replace(ovMatch[0], "");
    const scoreMatch = sWithoutOvers.match(/(\d+)(?:\s*[\-/]\s*\d+)?/);
    if (!scoreMatch) return "";
    return computeEconomy(ovStr, scoreMatch[1]);
}

function cleanScoreString(str) {
    if (!str || str === '-') return '-';
    let s = String(str).replace(/,\s*RR:\s*[\d\.]+/gi, '').trim();
    // If score string is purely overs without runs e.g. "(86 ov)", team has not batted yet!
    if (/^\s*\(?\s*\d+(?:\.\d+)?\s*(?:ov|overs)\s*\)?\s*$/i.test(s) && !s.includes('/')) {
        return '-';
    }
    s = s.replace(/(\d+[\-/]\d+|\d+)\(/g, '$1 (');
    return s || '-';
}

function formatDismissalHTML(dismissal, isNotOut) {
    if (!dismissal || isNotOut || dismissal.toLowerCase() === 'not out' || dismissal.toLowerCase() === 'batting') {
        return `<span class="text-emerald-600 dark:text-emerald-400 font-bold text-xs">not out</span>`;
    }
    const d = String(dismissal).trim();
    if (!d) return `<span class="text-slate-400 text-xs">-</span>`;

    // Match 'c Fielder b Bowler'
    const cMatch = d.match(/^c\s+(.*?)\s+b\s+(.*)$/i);
    if (cMatch) {
        return `<span class="text-slate-500 dark:text-gray-400 text-xs">c <span class="font-semibold text-slate-800 dark:text-gray-200">${cMatch[1]}</span> b <span class="font-bold text-[#059669] dark:text-emerald-400">${cMatch[2]}</span></span>`;
    }

    // Match 'c & b Bowler'
    const cbMatch = d.match(/^c\s*&\s*b\s+(.*)$/i);
    if (cbMatch) {
        return `<span class="text-slate-500 dark:text-gray-400 text-xs">c & b <span class="font-bold text-[#059669] dark:text-emerald-400">${cbMatch[1]}</span></span>`;
    }

    // Match 'b Bowler'
    const bMatch = d.match(/^b\s+(.*)$/i);
    if (bMatch) {
        return `<span class="text-slate-500 dark:text-gray-400 text-xs">b <span class="font-bold text-[#059669] dark:text-emerald-400">${bMatch[1]}</span></span>`;
    }

    // Match 'lbw b Bowler'
    const lbwMatch = d.match(/^lbw\s+b\s+(.*)$/i);
    if (lbwMatch) {
        return `<span class="text-slate-500 dark:text-gray-400 text-xs"><span class="font-bold text-amber-700 dark:text-amber-400">lbw</span> b <span class="font-bold text-[#059669] dark:text-emerald-400">${lbwMatch[1]}</span></span>`;
    }

    // Match 'st Keeper b Bowler'
    const stMatch = d.match(/^st\s+(.*?)\s+b\s+(.*)$/i);
    if (stMatch) {
        return `<span class="text-slate-500 dark:text-gray-400 text-xs">st <span class="font-semibold text-slate-800 dark:text-gray-200">${stMatch[1]}</span> b <span class="font-bold text-[#059669] dark:text-emerald-400">${stMatch[2]}</span></span>`;
    }
    // Match 'run out (Fielder)'
    const roMatch = d.match(/run\s*out\s*(?:\((.*?)\))?/i);
    if (roMatch) {
        return `<span class="text-rose-600 dark:text-rose-400 font-bold text-xs">run out</span> ${roMatch[1] ? `<span class="text-slate-700 dark:text-gray-300 font-medium">(${roMatch[1]})</span>` : ''}`;
    }

    return `<span class="text-slate-700 dark:text-gray-300 font-medium text-xs">${d}</span>`;
}

function renderCompactWinProbBadge(winProb, c1, c2, isTestMatch) {
    if (!winProb) return '';
    const p1 = typeof winProb.team1?.probability === 'number' ? winProb.team1.probability : 50;
    const p2 = typeof winProb.team2?.probability === 'number' ? winProb.team2.probability : 50;
    const pDraw = typeof winProb.draw?.probability === 'number' ? winProb.draw.probability : 0;
    const name1 = winProb.team1?.shortName || c1?.abbr || 'Team 1';
    const name2 = winProb.team2?.shortName || c2?.abbr || 'Team 2';

    if (pDraw > 0) {
        return `
            <span class="bg-white/80 dark:bg-dark-900/90 px-2.5 py-1 rounded-lg border border-emerald-500/30 shadow-sm flex items-center gap-1.5 font-mono text-[11px]" title="${winProb.summary || 'Win Probability'}">
                <i data-lucide="trending-up" class="w-3.5 h-3.5 text-emerald-500 shrink-0"></i>
                <span class="font-black text-emerald-600 dark:text-emerald-400">${name1} ${p1}%</span>
                <span class="opacity-30">|</span>
                <span class="text-slate-500 dark:text-gray-400 font-medium">Draw ${pDraw}%</span>
                <span class="opacity-30">|</span>
                <span class="font-black text-indigo-600 dark:text-indigo-400">${name2} ${p2}%</span>
            </span>
        `;
    }

    return `
        <span class="bg-white/80 dark:bg-dark-900/90 px-2.5 py-1 rounded-lg border border-emerald-500/30 shadow-sm flex items-center gap-1.5 font-mono text-[11px]" title="${winProb.summary || 'Win Probability'}">
            <i data-lucide="trending-up" class="w-3.5 h-3.5 text-emerald-500 shrink-0"></i>
            <span class="font-black text-emerald-600 dark:text-emerald-400">${name1} ${p1}%</span>
            <span class="opacity-30">•</span>
            <span class="font-black text-indigo-600 dark:text-indigo-400">${name2} ${p2}%</span>
        </span>
    `;
}

function resolveTeamScoreFromInnings(competitor, innings) {
    if (!competitor || !innings) return '';
    const compName = competitor.name || '';
    const compAbbr = competitor.abbr || '';
    const parts = [];
    const intKeys = Object.keys(innings).filter(k => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
    for (const k of intKeys) {
        const inn = innings[String(k)];
        if (!inn) continue;
        const innTeam = inn.teamName || inn.team || '';
        if (matchTeamNameOrAbbr(compName, compAbbr, innTeam)) {
            const tot = String(inn.total || inn.runs || '').trim();
            if (tot && tot !== '-') {
                parts.push(tot);
            }
        }
    }
    return parts.join(' & ');
}

function renderHeroBanner(data) {
    const container = document.getElementById('match-hero-content');
    if (!container) return;
    if (!data) return;

    try {
        let competitors = data.competitors;
        if (!competitors || competitors.length === 0) {
            const matchObj = (appState.matches || []).find(m => String(m.id) === String(data.matchId || data.id || appState.selectedEventId));
            if (matchObj && matchObj.competitors && matchObj.competitors.length > 0) {
                competitors = matchObj.competitors;
            }
        }

        const c1 = (competitors && competitors[0]) ? competitors[0] : { name: 'Team 1', score: '' };
        const c2 = (competitors && competitors[1]) ? competitors[1] : { name: 'Team 2', score: '' };

        const c1Name = String(c1.name || 'Team 1');
        const c2Name = String(c2.name || 'Team 2');
        const c1Abbr = String(c1.abbr || 'TM1');
        const c2Abbr = String(c2.abbr || 'TM2');
        let c1Score = String(c1.score || '');
        let c2Score = String(c2.score || '');

        // Fallback: If score is missing or "-", resolve directly from scorecard innings
        if ((!c1Score || c1Score === '-') && data.innings) {
            c1Score = resolveTeamScoreFromInnings(c1, data.innings) || c1Score;
        }
        if ((!c2Score || c2Score === '-') && data.innings) {
            c2Score = resolveTeamScoreFromInnings(c2, data.innings) || c2Score;
        }

        // Hide Points Table tab for bilateral series (multi-team tournaments only)
        const standingsTabBtn = document.querySelector('.cricinfo-tab[data-tab="standings"], .main-tab-btn[data-tab="standings"]');
        if (standingsTabBtn) {
            if (isBilateralSeries(data)) {
                standingsTabBtn.classList.add('hidden');
                if (appState.activeTab === 'standings') {
                    switchMainTab('live');
                }
            } else {
                standingsTabBtn.classList.remove('hidden');
            }
        }

        let matchDate = data.date;
        if (!matchDate) {
            const matchObj = (appState.matches || []).find(m => String(m.id) === String(data.matchId || data.id || appState.selectedEventId));
            if (matchObj && matchObj.date) {
                matchDate = matchObj.date;
            }
        }
        data.date = matchDate;

        const statusDetail = String(data.statusDetail || 'LIVE');
        const isLive = data.state ? (data.state.toLowerCase() === 'in' || data.state.toLowerCase() === 'live') : false;
        const isCompleted = data.state ? (data.state.toLowerCase() === 'post' || data.state.toLowerCase() === 'final' || data.state.toLowerCase() === 'completed') : false;
        const isUpcoming = Boolean(
            !isLive && !isCompleted && 
            (data.state === 'pre' || 
             (statusDetail.toLowerCase().includes('scheduled') || statusDetail.toLowerCase().includes('starts')) ||
             (data.date && new Date(data.date).getTime() > Date.now()))
        );
        const isStumps = statusDetail.toLowerCase().includes('stumps') || statusDetail.toLowerCase().includes('tea') || statusDetail.toLowerCase().includes('lunch');

        let statusPill = '';
        if (isStumps) {
            statusPill = `<span class="text-[11px] font-black uppercase px-3 py-1 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.4)] flex items-center gap-1.5"><i data-lucide="moon" class="w-3.5 h-3.5"></i> ${statusDetail}</span>`;
        } else if (isLive) {
            statusPill = `<span class="pulse-live-badge text-[11px] font-black uppercase px-3 py-1 rounded-full flex items-center gap-1.5 shadow-[0_0_15px_rgba(239,68,68,0.7)] animate-broadcast-pulse"><span class="w-2 h-2 rounded-full bg-white animate-ping"></span> 3D LIVE ON AIR</span>`;
        } else if (isUpcoming) {
            const istTimeStr = formatMatchTimeIST(data.date);
            statusPill = `<span class="text-[11px] font-black uppercase px-3 py-1 rounded-full bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/40 shadow-sm flex items-center gap-1.5 font-mono"><i data-lucide="clock" class="w-3.5 h-3.5 text-blue-500"></i> ${istTimeStr}</span>`;
        } else {
            statusPill = `<span class="text-[11px] font-black uppercase px-3 py-1 rounded-full bg-slate-200 dark:bg-dark-800 text-slate-800 dark:text-emerald-300 border border-slate-300 dark:border-emerald-500/40 shadow-sm">${statusDetail}</span>`;
        }

        let situationBanner = String(data.leadSummary || data.statusDetail || 'In Progress');

        // Sync sticky mobile back bar details
        const backTitle = document.getElementById('mobile-back-match-title');
        const backStatus = document.getElementById('mobile-back-match-status');
        if (backTitle) backTitle.textContent = `${c1Name} vs ${c2Name}`;
        if (backStatus) {
            if (isUpcoming) {
                backStatus.textContent = `Starts: ${formatMatchTimeIST(data.date)}`;
            } else {
                backStatus.textContent = situationBanner || statusDetail || '⚡ Live Match';
            }
        }

        const c1Winner = String(c1.isWinner) === 'true';
        const c2Winner = String(c2.isWinner) === 'true';

        if (isUpcoming) {
            const istTimeStr = formatMatchTimeIST(data.date);
            const cd = computeAnticlockwiseCountdown(data.date);
            situationBanner = `
                <div class="flex items-center gap-2.5 sm:gap-3 flex-wrap">
                    <span class="text-xs sm:text-sm font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                        <i data-lucide="calendar" class="w-4 h-4 text-emerald-500"></i>
                        Match Time: <span class="text-emerald-600 dark:text-[#00ff88] font-mono font-black">${istTimeStr}</span>
                    </span>
                    <div class="upcoming-hero-countdown flex items-center gap-2 px-3 py-1 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-700 dark:text-amber-300 font-mono font-black text-xs shadow-sm" data-match-date="${data.date || ''}">
                        <svg class="w-4 h-4 text-amber-500 animate-spin-reverse shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <circle cx="12" cy="12" r="10" stroke-dasharray="60" stroke-dashoffset="15"></circle>
                            <polyline points="12 6 12 12 8 14"></polyline>
                        </svg>
                        <span class="countdown-hero-text">${cd.isLiveNow ? 'Match Starting Soon' : `Starts in: ${cd.text}`}</span>
                    </div>
                </div>
            `;
        } else if (isCompleted || statusDetail.toLowerCase().includes('won by') || statusDetail.toLowerCase().includes('drawn') || statusDetail.toLowerCase().includes('tied') || statusDetail.toLowerCase().includes('abandoned') || statusDetail.toLowerCase().includes('no result') || situationBanner.toLowerCase().includes('won by') || situationBanner.toLowerCase().includes('drawn')) {
            if (data.leadSummary && !data.leadSummary.toLowerCase().includes('lead by') && !data.leadSummary.toLowerCase().includes('trail by')) {
                situationBanner = data.leadSummary;
            } else if (statusDetail.toLowerCase().includes('won by') || statusDetail.toLowerCase().includes('drawn') || statusDetail.toLowerCase().includes('tied') || statusDetail.toLowerCase().includes('abandoned') || statusDetail.toLowerCase().includes('no result')) {
                situationBanner = statusDetail;
            } else if (c1Winner) {
                situationBanner = `${c1Name} won`;
            } else if (c2Winner) {
                situationBanner = `${c2Name} won`;
            } else {
                situationBanner = statusDetail || 'Match Completed';
            }
        }

        const seriesText = data.description ? `${data.description}, ${data.location || ''}` : String(data.location || '');

        // Determine accurate CRR
        let currentCRR = String(data.crr || (data.liveCrease ? data.liveCrease.crr : "") || "");
        if (!currentCRR) {
            currentCRR = computeCRRFromScore(c2Score) || computeCRRFromScore(c1Score);
        }
        const last10 = String(data.liveCrease && data.liveCrease.last10Overs ? data.liveCrease.last10Overs : "");

        // Compute Required Run Rate (RRR) and Chase Equation for 2nd innings chase in limited overs
        const chaseDetailInfo = extractOrComputeChaseEquation(data, c1Score, c2Score, c1, c2);
        let liveRRR = (chaseDetailInfo && chaseDetailInfo.rrr !== '-') ? chaseDetailInfo.rrr : "";

        // Determine active batting team for dynamic 3D Active Pod highlighting
        const c1IsBatting = isTeamCurrentlyBatting(c1, data);
        const c2IsBatting = !c1IsBatting ? isTeamCurrentlyBatting(c2, data) : false;

        const displayBadge = data.currentInnings && data.currentInnings.displayBadge ? String(data.currentInnings.displayBadge) : '';

        const shareTitle = `${c1Name} vs ${c2Name}`;
        const shareScore = `${c1Name} ${c1Score} | ${c2Name} ${c2Score}`;

        container.innerHTML = `
            <div class="flex flex-col space-y-3">
                <!-- 3D Top Subtitle & Prev/Next Bar -->
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-500/20 pb-2 text-xs text-slate-500 dark:text-gray-400">
                    <div class="flex items-center gap-2.5">
                        ${statusPill}
                        <span class="font-bold truncate max-w-xl text-slate-700 dark:text-emerald-200 text-xs">${seriesText}</span>
                    </div>
                    <div class="flex items-center gap-2 text-slate-600 dark:text-gray-300 font-black text-xs">
                        <button onclick="shareActiveMatchWhatsApp('${escapeQuotes(shareTitle)}', '${escapeQuotes(shareScore)}', '${escapeQuotes(situationBanner)}')" 
                                class="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#25D366]/15 hover:bg-[#25D366]/30 text-[#16a34a] dark:text-[#4ade80] border border-[#25D366]/40 transition active:scale-95 cursor-pointer text-[11px] font-bold shadow-2xs" 
                                title="Share live match to WhatsApp">
                            <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
                            <span>Share</span>
                        </button>
                        <button onclick="navigateMatch(-1)" class="hover:text-emerald-500 dark:hover:text-emerald-400 flex items-center gap-1 transition px-2.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-800 border border-transparent hover:border-emerald-500/30 active:scale-95">
                            <i data-lucide="chevron-left" class="w-3.5 h-3.5"></i> Prev
                        </button>
                        <span class="opacity-40">|</span>
                        <button onclick="navigateMatch(1)" class="hover:text-emerald-500 dark:hover:text-emerald-400 flex items-center gap-1 transition px-2.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-800 border border-transparent hover:border-emerald-500/30 active:scale-95">
                            Next <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
                        </button>
                    </div>
                </div>

                <!-- 3D Teams Scoreboard Arena (Compact Neon Cards) -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2 py-0.5">
                    <!-- Team 1 3D HUD Box -->
                    <div class="hud-glass-panel p-2 sm:p-2.5 rounded-xl flex items-center justify-between gap-2 ${c1IsBatting ? 'border-2 border-[#00ff88] shadow-[0_0_22px_rgba(0,255,136,0.35)] bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent' : 'border border-emerald-500/30'} shadow-xs hover:border-[#00ff88]/60 transition">
                        <div class="flex items-center space-x-2.5 truncate">
                            ${renderTeamLogo(c1Name, c1.logo, 'w-8 h-8 sm:w-10 sm:h-10')}
                            <div class="truncate">
                                <span class="font-black text-sm sm:text-base text-slate-900 dark:text-white truncate tracking-tight block ${c1Winner ? 'text-emerald-600 dark:text-[#00ff88] drop-shadow-[0_0_8px_rgba(0,255,136,0.5)]' : ''}">${c1Name}</span>
                                <span class="text-[9px] font-bold text-slate-400 dark:text-emerald-400/80 uppercase tracking-widest">${c1Abbr}</span>
                            </div>
                        </div>
                        ${renderMultiInningsScoreHTML(c1Score, c1IsBatting, isLive, currentCRR, false)}
                    </div>

                    <!-- Team 2 3D HUD Box -->
                    <div class="hud-glass-panel p-2 sm:p-2.5 rounded-xl flex items-center justify-between gap-2 ${c2IsBatting ? 'border-2 border-[#00ff88] shadow-[0_0_22px_rgba(0,255,136,0.35)] bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent' : 'border border-emerald-500/30'} shadow-xs hover:border-[#00ff88]/60 transition">
                        <div class="flex items-center space-x-2.5 truncate">
                            ${renderTeamLogo(c2Name, c2.logo, 'w-8 h-8 sm:w-10 sm:h-10')}
                            <div class="truncate">
                                <span class="font-black text-sm sm:text-base text-slate-900 dark:text-white truncate tracking-tight block ${c2Winner ? 'text-emerald-600 dark:text-[#00ff88] drop-shadow-[0_0_8px_rgba(0,255,136,0.5)]' : ''}">${c2Name}</span>
                                <span class="text-[9px] font-bold text-slate-400 dark:text-emerald-400/80 uppercase tracking-widest">${c2Abbr}</span>
                            </div>
                        </div>
                        ${renderMultiInningsScoreHTML(c2Score, c2IsBatting, isLive, currentCRR, true)}
                    </div>
                </div>

                <!-- Match Situation & 3D Telemetry Lower Third -->
                <div class="pt-2.5 border-t border-emerald-500/20 flex flex-wrap items-center justify-between gap-2.5">
                    <div class="flex flex-wrap items-center gap-2 sm:gap-3">
                        <div class="text-sm sm:text-base font-black text-[#059669] dark:text-emerald-400 flex items-center gap-2 drop-shadow-xs">
                            <i data-lucide="zap" class="w-4 h-4 text-amber-400 animate-pulse"></i>
                            <span>${situationBanner}</span>
                            ${displayBadge ? `
                                <span class="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md uppercase tracking-wide border border-emerald-400/40">
                                    ${displayBadge}
                                </span>
                            ` : ''}
                        </div>

                        ${data.playerOfTheMatch ? `
                            <!-- Man of the Match Chip directly next to Match Result -->
                            <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent dark:from-amber-950/60 dark:to-dark-900 border border-amber-500/40 shadow-xs">
                                <div class="relative shrink-0 flex items-center">
                                    <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden border border-amber-400 bg-white dark:bg-dark-800 flex items-center justify-center shadow-xs">
                                        <img src="${data.playerOfTheMatch.headshot || 'https://a.espncdn.com/i/headshots/cricket/players/default-player-logo-500.png'}" 
                                             alt="${escapeQuotes(data.playerOfTheMatch.name)}" 
                                             class="w-full h-full object-cover object-top" 
                                             onerror="this.src='https://a.espncdn.com/i/headshots/cricket/players/default-player-logo-500.png';">
                                    </div>
                                    <span class="absolute -bottom-1 -right-1 text-[9px] leading-none">🏆</span>
                                </div>
                                <div class="flex items-center gap-1.5 flex-wrap">
                                    <span class="text-[10.5px] font-mono font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-0.5">
                                        <i data-lucide="award" class="w-3.5 h-3.5 text-amber-500"></i>
                                        <span>POTM:</span>
                                    </span>
                                    <span class="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                                        ${escapeQuotes(data.playerOfTheMatch.name)}
                                    </span>
                                    ${data.playerOfTheMatch.teamName ? `
                                        <span class="text-[10.5px] text-slate-500 dark:text-gray-400 font-bold">(${escapeQuotes(data.playerOfTheMatch.teamName)})</span>
                                    ` : ''}
                                    ${data.playerOfTheMatch.performance ? `
                                        <span class="text-[10px] sm:text-[10.5px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                                            ${escapeQuotes(data.playerOfTheMatch.performance)}
                                        </span>
                                    ` : ''}
                                </div>
                            </div>
                        ` : ''}

                        ${data.playerOfTheSeries ? `
                            <!-- Player of the Series/Tournament Chip -->
                            <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-gradient-to-r from-purple-500/20 via-purple-500/10 to-transparent dark:from-purple-950/60 dark:to-dark-900 border border-purple-500/40 shadow-xs">
                                <div class="relative shrink-0 flex items-center">
                                    <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden border border-purple-400 bg-white dark:bg-dark-800 flex items-center justify-center shadow-xs">
                                        <img src="${data.playerOfTheSeries.headshot || 'https://a.espncdn.com/i/headshots/cricket/players/default-player-logo-500.png'}" 
                                             alt="${escapeQuotes(data.playerOfTheSeries.name)}" 
                                             class="w-full h-full object-cover object-top" 
                                             onerror="this.src='https://a.espncdn.com/i/headshots/cricket/players/default-player-logo-500.png';">
                                    </div>
                                    <span class="absolute -bottom-1 -right-1 text-[9px] leading-none">🎖️</span>
                                </div>
                                <div class="flex items-center gap-1.5 flex-wrap">
                                    <span class="text-[10.5px] font-mono font-black uppercase tracking-wider text-purple-700 dark:text-purple-400 flex items-center gap-0.5">
                                        <i data-lucide="award" class="w-3.5 h-3.5 text-purple-500"></i>
                                        <span>${escapeQuotes(data.playerOfTheSeries.title || 'Player of the Series')}:</span>
                                    </span>
                                    <span class="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                                        ${escapeQuotes(data.playerOfTheSeries.name)}
                                    </span>
                                    ${data.playerOfTheSeries.teamName ? `
                                        <span class="text-[10.5px] text-slate-500 dark:text-gray-400 font-bold">(${escapeQuotes(data.playerOfTheSeries.teamName)})</span>
                                    ` : ''}
                                    ${data.playerOfTheSeries.performance ? `
                                        <span class="text-[10px] sm:text-[10.5px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-purple-500/20 text-purple-800 dark:text-purple-300 border border-purple-500/30">
                                            ${escapeQuotes(data.playerOfTheSeries.performance)}
                                        </span>
                                    ` : ''}
                                </div>
                            </div>
                        ` : ''}
                    </div>

                    <div class="text-[11px] sm:text-xs text-slate-600 dark:text-gray-300 font-bold flex flex-wrap items-center gap-2">
                        ${liveRRR ? `
                            <span class="bg-gradient-to-r from-rose-500/15 via-rose-500/10 to-transparent dark:from-rose-950/60 dark:to-dark-900 px-3 py-1 rounded-lg border border-rose-500/40 shadow-sm text-rose-700 dark:text-[#ff4d6d] font-mono font-black flex items-center gap-1.5" title="Required Run Rate: ${liveRRR}">
                                <i data-lucide="target" class="w-3.5 h-3.5 text-rose-500 animate-pulse"></i>
                                <span>RRR: <span class="text-slate-900 dark:text-white font-black">${liveRRR}</span></span>
                            </span>
                        ` : renderCompactWinProbBadge(data.winProbability, c1, c2, data.isTestMatch)}
                        ${currentCRR ? `<span class="bg-white/80 dark:bg-dark-900/90 px-3 py-1 rounded-lg border border-emerald-500/30 shadow-sm">CRR: <span class="font-mono font-black text-emerald-600 dark:text-emerald-400">${currentCRR}</span></span>` : ''}
                        ${last10 ? `<span class="bg-white/80 dark:bg-dark-900/90 px-3 py-1 rounded-lg border border-emerald-500/30 shadow-sm">Last 10: <span class="font-mono font-bold text-slate-800 dark:text-gray-200">${last10}</span></span>` : ''}
                    </div>
                </div>
            </div>
        `;
        safeCreateIcons();
        startUpcomingCountdowns();
    } catch(err) {
        console.error("renderHeroBanner execution error:", err);
    }
}

window.shareActiveMatchWhatsApp = function(title, scoreText, sitText) {
    const matchUrl = appState.selectedLeagueId && appState.selectedEventId 
        ? `https://sportsdynasty.in/match/${appState.selectedLeagueId}/${appState.selectedEventId}` 
        : 'https://sportsdynasty.in';
    const text = `🏏 *${title}* Live Scorecard\n📊 ${scoreText}\n⚡ ${sitText}\n👉 Watch Live Ball-by-Ball Scorecard on Sports Dynasty:\n${matchUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
};

window.shareActiveMatchTelegram = function(title, scoreText, sitText) {
    const matchUrl = appState.selectedLeagueId && appState.selectedEventId 
        ? `https://sportsdynasty.in/match/${appState.selectedLeagueId}/${appState.selectedEventId}` 
        : 'https://sportsdynasty.in';
    const text = `🏏 ${title} | ${scoreText} • ${sitText} - Live on Sports Dynasty\n👉 ${matchUrl}`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(matchUrl)}&text=${encodeURIComponent(text)}`, '_blank');
};

// -------------------------------------------------------------
// LIVE TAB - CRICINFO MATCH CENTER TABLE & MATCH PULSE
// -------------------------------------------------------------

function computeLast5Overs(recentDeliveries, last10Str, crrStr, fowList = [], totalStr = '') {
    // 1. Compute from parsed recentDeliveries if available
    if (recentDeliveries && Array.isArray(recentDeliveries) && recentDeliveries.length > 0) {
        const overs = [];
        let currentOv = [];
        for (const d of recentDeliveries) {
            if (d === '|') {
                if (currentOv.length > 0) {
                    overs.push(currentOv);
                    currentOv = [];
                }
            } else {
                currentOv.push(d);
            }
        }
        if (currentOv.length > 0) overs.push(currentOv);

        const last5 = overs.slice(-5);
        if (last5.length > 0) {
            let totalRuns = 0;
            let totalWkts = 0;
            let totalBalls = 0;
            for (const ov of last5) {
                for (const b of ov) {
                    const bStr = String(b).trim().toUpperCase();
                    if (bStr === 'W' || bStr.includes('W')) {
                        totalWkts++;
                        totalBalls++;
                    } else if (bStr === '0' || bStr === '•' || bStr === '.') {
                        totalBalls++;
                    } else if (/^\d+$/.test(bStr)) {
                        totalRuns += parseInt(bStr, 10);
                        totalBalls++;
                    } else {
                        const m = bStr.match(/(\d+)/);
                        if (m) totalRuns += parseInt(m[1], 10);
                        totalBalls++;
                    }
                }
            }
            if (totalBalls > 0) {
                const rr = (totalBalls >= 6) ? (totalRuns / (totalBalls / 6.0)).toFixed(2) : totalRuns.toFixed(2);
                const wTxt = `${totalWkts} wkt${totalWkts !== 1 ? 's' : ''}`;
                return `${totalRuns} runs, ${wTxt} (RR: ${rr})`;
            }
        }
    }

    // 2. Compute exact wickets from Fall of Wickets (FOW) if available
    let wktsInLast5 = 0;
    let hasWktCalc = false;
    if (fowList && Array.isArray(fowList) && fowList.length > 0 && totalStr) {
        const ovMatch = totalStr.match(/(\d+(?:\.\d+)?)\s*(?:ov|overs)/i);
        if (ovMatch) {
            const ovs = parseFloat(ovMatch[1]);
            const fullOvs = Math.floor(ovs);
            const extraBalls = Math.round((ovs - fullOvs) * 10);
            const currBalls = fullOvs * 6 + extraBalls;
            const cutoffBalls = Math.max(0, currBalls - 30);

            for (const w of fowList) {
                if (w && w.overs) {
                    const wOv = parseFloat(w.overs);
                    const wFull = Math.floor(wOv);
                    const wExtra = Math.round((wOv - wFull) * 10);
                    const wBalls = wFull * 6 + wExtra;
                    if (wBalls >= cutoffBalls) {
                        wktsInLast5++;
                    }
                }
            }
            hasWktCalc = true;
        }
    }

    // 3. Check if last10Str has text
    if (last10Str) {
        if (!last10Str.toLowerCase().includes('wkt') && hasWktCalc) {
            return `${last10Str}, ${wktsInLast5} wkt${wktsInLast5 !== 1 ? 's' : ''}`;
        }
        return last10Str;
    }

    // 4. Fallback from CRR with exact wickets count
    if (crrStr) {
        const c = parseFloat(crrStr);
        if (!isNaN(c) && c > 0) {
            const r = Math.round(c * 5);
            const wTxt = hasWktCalc ? `${wktsInLast5} wkt${wktsInLast5 !== 1 ? 's' : ''}` : '0 wkts';
            return `${r} runs, ${wTxt} (RR: ${crrStr})`;
        }
    }

    return '-';
}

function computeTestSessionJS(notes, totalStr, crrStr) {
    if (!totalStr) return '';
    let s = String(totalStr);
    if (s.includes('&')) {
        const parts = s.split('&');
        s = parts[parts.length - 1].trim();
    }
    let curRuns = 0;
    let curWkts = 0;
    let curBalls = 0;

    const rMatch = s.match(/(\d+)(?:[/-](\d+))?/);
    if (rMatch) {
        curRuns = parseInt(rMatch[1], 10);
        curWkts = rMatch[2] ? parseInt(rMatch[2], 10) : 0;
        if (s.toLowerCase().includes('all out') || s.includes('/10') || s.includes('-10')) {
            curWkts = 10;
        }
    }
    const ovMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:ov|overs)/i);
    if (ovMatch) {
        const ovs = parseFloat(ovMatch[1]);
        const full = Math.floor(ovs);
        curBalls = full * 6 + Math.round((ovs - full) * 10);
    }

    if (curBalls <= 0 && curRuns <= 0) return '';

    const allInningsCheckpoints = [];
    let currentInnCps = [{ type: 'start', runs: 0, wkts: 0, balls: 0 }];
    let lastBallsSeen = 0;

    if (notes && Array.isArray(notes)) {
        for (const n of notes) {
            const text = String(n).trim();

            if (text.toLowerCase().includes('innings break')) {
                const mIb = text.match(/innings\s*break:\s*.*?(?:-\s*)?(\d+)(?:[/-](\d+))?\s*(?:in\s*)?(\d+(?:\.\d+)?)\s*overs?/i);
                if (mIb) {
                    const ibOvs = parseFloat(mIb[3]);
                    const ibFull = Math.floor(ibOvs);
                    currentInnCps.push({
                        type: 'innings break',
                        runs: parseInt(mIb[1], 10),
                        wkts: mIb[2] ? parseInt(mIb[2], 10) : 10,
                        balls: ibFull * 6 + Math.round((ibOvs - ibFull) * 10)
                    });
                }
                allInningsCheckpoints.push(currentInnCps);
                currentInnCps = [{ type: 'start', runs: 0, wkts: 0, balls: 0 }];
                lastBallsSeen = 0;
                continue;
            }

            const cpMatch = text.match(/(lunch|tea|end\s*of\s*day|stumps):\s*.*?(?:-\s*)?(\d+)(?:[/-](\d+))?\s*(?:in\s*)?(\d+(?:\.\d+)?)\s*overs?/i);
            if (cpMatch) {
                const cOvs = parseFloat(cpMatch[4]);
                const cFull = Math.floor(cOvs);
                const cBalls = cFull * 6 + Math.round((cOvs - cFull) * 10);

                if (cBalls < lastBallsSeen && lastBallsSeen > 120) {
                    allInningsCheckpoints.push(currentInnCps);
                    currentInnCps = [{ type: 'start', runs: 0, wkts: 0, balls: 0 }];
                }

                currentInnCps.push({
                    type: cpMatch[1].toLowerCase(),
                    runs: parseInt(cpMatch[2], 10),
                    wkts: cpMatch[3] ? parseInt(cpMatch[3], 10) : 0,
                    balls: cBalls
                });
                lastBallsSeen = cBalls;
            }
        }
    }

    allInningsCheckpoints.push(currentInnCps);

    const cps = allInningsCheckpoints[allInningsCheckpoints.length - 1];
    let validCps = cps.filter(cp => cp.balls <= curBalls && cp.runs <= curRuns);
    if (!validCps || validCps.length === 0) {
        validCps = [{ type: 'start', runs: 0, wkts: 0, balls: 0 }];
    }

    const lastCp = validCps[validCps.length - 1];
    let startCp, endRuns, endWkts, endBalls;

    if (curBalls > lastCp.balls) {
        startCp = lastCp;
        endRuns = curRuns;
        endWkts = curWkts;
        endBalls = curBalls;
    } else {
        if (validCps.length >= 2) {
            startCp = validCps[validCps.length - 2];
            endRuns = lastCp.runs;
            endWkts = lastCp.wkts;
            endBalls = lastCp.balls;
        } else {
            startCp = validCps[0];
            endRuns = lastCp.runs;
            endWkts = lastCp.wkts;
            endBalls = lastCp.balls;
        }
    }

    const sRuns = Math.max(0, endRuns - startCp.runs);
    const sWkts = Math.max(0, endWkts - startCp.wkts);
    const sBalls = Math.max(0, endBalls - startCp.balls);

    if (sBalls <= 0) return '';

    const sOvs = (sBalls % 6 !== 0) ? `${Math.floor(sBalls / 6)}.${sBalls % 6}` : `${Math.floor(sBalls / 6)}.0`;
    const sRR = (sRuns / (sBalls / 6.0)).toFixed(2);
    const wTxt = `${sWkts} wkt${sWkts !== 1 ? 's' : ''}`;

    return `${sRuns} runs, ${wTxt} (${sOvs} ov, RR: ${sRR})`;
}

function formatScorecardTotalWithRR(totalStr, runsFallback) {
    if (!totalStr && !runsFallback) return '-';
    let cleanTot = cleanScoreString(totalStr || runsFallback || '0');
    if (cleanTot.toLowerCase().includes('rr:')) return cleanTot;

    // Extract runs
    const rMatch = cleanTot.match(/(\d+)(?:[/-]\d+)?/);
    let runs = rMatch ? parseInt(rMatch[1], 10) : 0;
    if (!runs && runsFallback) {
        const rMatch2 = String(runsFallback).match(/(\d+)/);
        if (rMatch2) runs = parseInt(rMatch2[1], 10);
    }

    // Extract overs
    const ovMatch = cleanTot.match(/(\d+(?:\.\d+)?)\s*(?:ov|overs)/i);
    if (ovMatch) {
        const ovs = parseFloat(ovMatch[1]);
        const fullOvs = Math.floor(ovs);
        const extraBalls = Math.round((ovs - fullOvs) * 10);
        const balls = fullOvs * 6 + extraBalls;
        if (balls > 0 && runs >= 0) {
            const rr = (runs / (balls / 6.0)).toFixed(2);
            if (cleanTot.includes('(') && cleanTot.includes(')')) {
                cleanTot = cleanTot.replace(/\)/, `, RR: ${rr})`);
            } else {
                cleanTot += ` (RR: ${rr})`;
            }
        }
    }

    return cleanTot;
}

function getPlayerInitials(name) {
    if (!name) return 'CR';
    const clean = name.replace(/\s*\([^\)]*\)/g, '').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function renderPlayerAvatar(name, headshotUrl, customClass = 'w-6 h-6 sm:w-7 sm:h-7') {
    const initials = getPlayerInitials(name);
    const cleanHeadshot = (headshotUrl && !headshotUrl.includes('default-player-logo')) ? headshotUrl : '';

    if (cleanHeadshot) {
        return `
            <div class="relative ${customClass} rounded-full overflow-hidden shrink-0 border border-emerald-500/40 bg-slate-100 dark:bg-dark-800 shadow-2xs inline-flex items-center justify-center">
                <img src="${cleanHeadshot}" 
                     alt="${name}" 
                     class="w-full h-full object-cover" 
                     onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
                <div style="display:none;" class="w-full h-full bg-gradient-to-br from-emerald-600 to-teal-800 text-white font-black text-[9px] sm:text-[10px] items-center justify-center select-none">
                    ${initials}
                </div>
            </div>
        `;
    }

    return `
        <div class="${customClass} rounded-full bg-gradient-to-br from-emerald-600 to-teal-800 text-white font-black text-[9px] sm:text-[10px] flex items-center justify-center border border-emerald-400/40 shadow-2xs shrink-0 select-none">
            ${initials}
        </div>
    `;
}

// Dynamic Real-Time Strike Tracker
if (!window.liveStrikeTracker) window.liveStrikeTracker = {};

function resolveActiveStriker(matchKey, batters, data) {
    if (!batters || batters.length === 0) return 0;
    if (batters.length === 1) return 0;

    const isMatchCompleted = (data.state && (data.state.toLowerCase() === 'post' || data.state.toLowerCase() === 'final'));
    if (isMatchCompleted) return -1;

    // 1. Check if user clicked a batter to toggle strike
    if (!window.liveStrikeTracker[matchKey]) {
        const initialStrikerIdx = batters.findIndex(b => Boolean(b.isStriker) || (b.name && b.name.includes('*')));
        window.liveStrikeTracker[matchKey] = {
            currentStrikerName: (initialStrikerIdx >= 0) ? batters[initialStrikerIdx].name : batters[0].name,
            battersSnap: {},
            lastOver: ''
        };
    }

    const tracker = window.liveStrikeTracker[matchKey];
    let activeName = tracker.currentStrikerName;

    // Verify current activeName is still at the crease
    const activeIdx = batters.findIndex(b => b.name === activeName);
    if (activeIdx === -1) {
        const sourceIdx = batters.findIndex(b => Boolean(b.isStriker) || (b.name && b.name.includes('*')));
        activeName = (sourceIdx >= 0) ? batters[sourceIdx].name : batters[0].name;
        tracker.currentStrikerName = activeName;
    }

    // 2. Track ball deliveries & runs scored between polls to rotate strike automatically
    if (tracker.battersSnap && Object.keys(tracker.battersSnap).length > 0) {
        let rotated = false;
        let facedBatterName = null;
        let runsScored = 0;

        for (const b of batters) {
            const prev = tracker.battersSnap[b.name];
            if (prev) {
                const curBalls = parseInt(b.balls, 10) || 0;
                const prevBalls = parseInt(prev.balls, 10) || 0;
                const curRuns = parseInt(b.runs, 10) || 0;
                const prevRuns = parseInt(prev.runs, 10) || 0;

                if (curBalls > prevBalls) {
                    facedBatterName = b.name;
                    runsScored = curRuns - prevRuns;
                    break;
                }
            }
        }

        if (facedBatterName) {
            const partner = batters.find(b => b.name !== facedBatterName);
            // If odd runs (1, 3, 5) taken, strike rotates to partner!
            if (runsScored % 2 !== 0 && partner) {
                activeName = partner.name;
                rotated = true;
            } else {
                activeName = facedBatterName;
                rotated = true;
            }
        }

        // Check if over completed (strike rotates at end of over)
        const curOverStr = String((data.liveCrease && data.liveCrease.activeBowler && data.liveCrease.activeBowler.overs) || '');
        if (tracker.lastOver && curOverStr && tracker.lastOver !== curOverStr) {
            const prevO = parseFloat(tracker.lastOver);
            const curO = parseFloat(curOverStr);
            if (Math.floor(curO) > Math.floor(prevO)) {
                const partner = batters.find(b => b.name !== activeName);
                if (partner) {
                    activeName = partner.name;
                    rotated = true;
                }
            }
        }
        if (curOverStr) tracker.lastOver = curOverStr;

        if (rotated) {
            tracker.currentStrikerName = activeName;
        }
    }

    // Save snapshot for next poll
    const newSnap = {};
    for (const b of batters) {
        newSnap[b.name] = { runs: b.runs, balls: b.balls };
    }
    tracker.battersSnap = newSnap;

    let finalIdx = batters.findIndex(b => b.name === activeName);
    return (finalIdx >= 0) ? finalIdx : 0;
}

window.toggleStrike = function(leagueId, matchId, batterName) {
    const matchKey = `${leagueId}_${matchId}`;
    if (!window.liveStrikeTracker) window.liveStrikeTracker = {};
    if (!window.liveStrikeTracker[matchKey]) {
        window.liveStrikeTracker[matchKey] = { currentStrikerName: batterName, battersSnap: {} };
    } else {
        window.liveStrikeTracker[matchKey].currentStrikerName = batterName;
    }
    if (appState.currentMatchData) {
        renderCricinfoLiveTab(appState.currentMatchData);
        safeCreateIcons();
    }
};

function renderLivePlayingXI(data, isPreMatchOnly = false) {
    if (!data) return '';
    const squads = (data.squads && data.squads.length > 0) ? data.squads : [];
    const tossText = data.toss || (data.leadSummary && /toss|opted|batted|fielded|elected/i.test(data.leadSummary) ? data.leadSummary : '') || '';
    const matchState = String(data.state || '').toLowerCase();
    const isUpcoming = matchState === 'pre' || Boolean(data.date && new Date(data.date).getTime() > Date.now());
    const istTimeStr = data.date ? formatMatchTimeIST(data.date) : '';
    const cd = data.date ? computeAnticlockwiseCountdown(data.date) : null;

    if (squads.length === 0) {
        if (isPreMatchOnly) {
            return `
                <div class="hud-glass-panel rounded-2xl p-6 border border-emerald-500/30 text-center space-y-4">
                    <div class="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-500 mx-auto flex items-center justify-center shadow-lg">
                        <i data-lucide="coins" class="w-7 h-7 animate-bounce"></i>
                    </div>
                    <div class="space-y-1">
                        <h3 class="text-base font-black text-slate-900 dark:text-white uppercase tracking-wider font-mono">
                            ${tossText ? 'Toss Result Announced' : 'Toss & Official Playing XI'}
                        </h3>
                        <p class="text-xs text-slate-500 dark:text-gray-400 max-w-lg mx-auto">
                            ${tossText ? 'Playing 11 is being finalized and will refresh here automatically.' : 'Both teams will announce their official Playing 11 immediately after the coin toss (approx. 30 minutes before match start).'}
                        </p>
                    </div>

                    ${tossText ? `
                        <div class="inline-flex items-center gap-2.5 px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/50 text-amber-800 dark:text-amber-300 font-bold text-xs sm:text-sm shadow-sm font-sans">
                            <i data-lucide="check-circle-2" class="w-4 h-4 text-amber-500 shrink-0"></i>
                            <span>${tossText}</span>
                        </div>
                    ` : ''}

                    ${isUpcoming && istTimeStr ? `
                        <div class="pt-2 flex items-center justify-center gap-3 flex-wrap text-xs">
                            <span class="px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-[#00ff88] font-mono font-bold">
                                <i data-lucide="calendar" class="w-3.5 h-3.5 inline mr-1 text-emerald-500"></i> ${istTimeStr}
                            </span>
                            ${cd && !cd.isLiveNow ? `
                                <span class="px-3 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-300 font-mono font-black">
                                    Starts in: ${cd.text}
                                </span>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
            `;
        }
        return '';
    }

    const teamCardsHtml = squads.slice(0, 2).map((sq, sqIdx) => {
        const playingXI = (sq.playingXI && sq.playingXI.length > 0) ? sq.playingXI : (sq.players || []).slice(0, 11);
        const bench = (sq.bench && sq.bench.length > 0) ? sq.bench : (sq.fullSquad ? sq.fullSquad.slice(11) : (sq.players || []).slice(11));

        return `
            <div class="hud-glass-panel rounded-2xl p-3.5 sm:p-4 border border-slate-200 dark:border-emerald-500/30 shadow-md space-y-3 flex flex-col bg-white dark:bg-dark-900/90">
                <!-- Team Header Bar -->
                <div class="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-gray-800">
                    <div class="flex items-center space-x-2.5 min-w-0">
                        ${sq.teamLogo ? `
                            <img src="${sq.teamLogo}" class="w-8 h-8 object-contain rounded-lg p-0.5 bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-gray-700 shrink-0" onerror="this.style.display='none'">
                        ` : ''}
                        <div class="min-w-0">
                            <h4 class="font-black text-slate-900 dark:text-white text-sm sm:text-base truncate leading-tight">${sq.teamName}</h4>
                            <span class="text-[10px] text-slate-500 dark:text-gray-400 font-mono">Playing 11 (${playingXI.length})</span>
                        </div>
                    </div>
                    <span class="text-[10px] font-mono font-black px-2.5 py-0.5 rounded-full bg-[#00ff88]/15 text-emerald-800 dark:text-[#00ff88] border border-[#00ff88]/40 shadow-2xs shrink-0">
                        PLAYING XI
                    </span>
                </div>

                <!-- 11 Players Grid List -->
                <div class="space-y-1.5 flex-1">
                    ${(() => {
                        let teamWkFound = false;
                        return playingXI.map((p, pIdx) => {
                            const isC = Boolean(p.captain || p.isCaptain || /\(c\)/i.test(p.name) || /\(c\s*&/i.test(p.name));
                            let isWk = Boolean(p.wicketKeeper || p.isWicketKeeper || /\(wk\)/i.test(p.name) || /&\s*wk\)/i.test(p.name));
                            if (isWk) {
                                if (!teamWkFound) {
                                    teamWkFound = true;
                                } else {
                                    isWk = false;
                                }
                            }
                            const cleanPName = p.name.replace(/\s*\([^\)]*\)/g, '').trim();
                            let tag = '';
                            if (isC && isWk) {
                                tag = '<span class="text-[9px] px-1.5 py-0.2 rounded font-black font-mono bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0 select-none">(c & wk)</span>';
                            } else if (isC) {
                                tag = '<span class="text-[9px] px-1.5 py-0.2 rounded font-black font-mono bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0 select-none">(c)</span>';
                            } else if (isWk) {
                                tag = '<span class="text-[9px] px-1.5 py-0.2 rounded font-black font-mono bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 shrink-0 select-none">(wk)</span>';
                            }

                            return `
                            <div onclick="openPlayerProfile('${p.id || ''}', '${cleanPName.replace(/'/g, "\\'")}')" 
                                 class="flex items-center justify-between p-1.5 sm:p-2 rounded-xl bg-slate-50/80 dark:bg-dark-800/60 border border-slate-200/80 dark:border-gray-800/90 hover:border-emerald-500/60 dark:hover:border-[#00ff88]/60 hover:shadow-xs transition cursor-pointer group/p11" title="View Profile & Stats of ${cleanPName}">
                                <div class="flex items-center space-x-2 truncate min-w-0">
                                    <span class="w-5 h-5 rounded-md bg-slate-200/60 dark:bg-dark-900 border border-slate-300/60 dark:border-gray-700 flex items-center justify-center font-mono text-[10px] font-bold text-slate-500 dark:text-gray-400 shrink-0">${pIdx + 1}</span>
                                    ${renderPlayerAvatar(cleanPName, p.headshot, 'w-6 h-6 rounded-full ring-1 ring-slate-200 dark:ring-gray-700 shrink-0')}
                                    <div class="flex items-center gap-1 truncate min-w-0">
                                        <span class="font-bold text-slate-900 dark:text-white group-hover/p11:text-[#00ff88] group-hover/p11:underline truncate text-xs">${cleanPName}</span>
                                        ${tag}
                                    </div>
                                </div>
                                <span class="text-[10px] text-slate-500 dark:text-gray-400 font-mono font-medium shrink-0 ml-1.5">${p.role || 'Player'}</span>
                            </div>
                        `;
                        }).join('');
                    })()}
                </div>

                <!-- Bench / Substitutes Section (Collapsible Accordion) -->
                ${bench.length > 0 ? `
                    <div class="pt-2 border-t border-slate-200 dark:border-gray-800">
                        <details class="text-xs group/bench">
                            <summary class="cursor-pointer font-bold text-slate-600 dark:text-gray-300 hover:text-emerald-500 flex items-center justify-between py-1 px-2 rounded-lg bg-slate-100/70 dark:bg-dark-800/40 border border-slate-200/80 dark:border-gray-700/60 transition select-none">
                                <span class="flex items-center gap-1.5 font-mono text-[11px]">
                                    <i data-lucide="armchair" class="w-3.5 h-3.5 text-slate-400"></i>
                                    Bench (${bench.length})
                                </span>
                                <span class="text-[9px] font-mono text-emerald-600 dark:text-emerald-400 group-open/bench:rotate-180 transition-transform">▼</span>
                            </summary>
                            <div class="mt-1.5 space-y-1 pl-1 max-h-[180px] overflow-y-auto custom-scrollbar">
                                ${bench.map(p => {
                                    const cleanPName = p.name.replace(/\s*\([^\)]*\)/g, '').trim();
                                    return `
                                        <div onclick="openPlayerProfile('${p.id || ''}', '${cleanPName.replace(/'/g, "\\'")}')"
                                             class="flex items-center justify-between p-1.5 rounded-lg bg-slate-50/50 dark:bg-dark-900/40 border border-slate-100 dark:border-gray-800/60 hover:border-slate-300 dark:hover:border-gray-700 transition cursor-pointer text-xs group/bn">
                                            <div class="flex items-center space-x-2 truncate">
                                                ${renderPlayerAvatar(cleanPName, p.headshot, 'w-5 h-5 rounded-full opacity-80 shrink-0')}
                                                <span class="font-medium text-slate-700 dark:text-gray-300 group-hover/bn:text-emerald-500 truncate text-[11px]">${cleanPName}</span>
                                            </div>
                                            <span class="text-[9px] text-slate-400 font-mono shrink-0 ml-1.5">${p.role || 'Player'}</span>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </details>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    return `
        <div class="hud-glass-panel rounded-2xl p-3 sm:p-4 border border-emerald-500/30 shadow-md space-y-3.5">
            <!-- Header with Coin Toss Update -->
            <div class="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-emerald-500/20">
                <div class="flex items-center space-x-2.5">
                    <div class="w-7 h-7 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 font-black shadow-[0_0_12px_rgba(251,191,36,0.6)]">
                        <i data-lucide="coins" class="w-4 h-4 text-slate-950"></i>
                    </div>
                    <div>
                        <h3 class="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider font-mono flex items-center gap-2">
                            <span>Official Playing XI & Toss</span>
                            ${isUpcoming ? '<span class="text-[9px] px-2 py-0.2 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30 font-mono">Toss Done</span>' : ''}
                        </h3>
                        ${tossText ? `
                            <p class="text-xs font-bold text-amber-700 dark:text-amber-300 mt-0.5 font-sans">
                                🪙 ${tossText}
                            </p>
                        ` : `
                            <p class="text-[11px] text-slate-500 dark:text-gray-400 font-sans">Official match day squads announced</p>
                        `}
                    </div>
                </div>

                ${isUpcoming && istTimeStr ? `
                    <div class="flex items-center gap-2">
                        <span class="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-[#00ff88] font-mono font-bold text-xs">
                            <i data-lucide="calendar" class="w-3 h-3 inline mr-1 text-emerald-500"></i> ${istTimeStr}
                        </span>
                        ${cd && !cd.isLiveNow ? `
                            <div class="upcoming-countdown-badge px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-700 dark:text-amber-300 font-mono font-black text-xs shadow-xs" data-match-date="${data.date || ''}">
                                <span class="countdown-timer-text">${cd.text}</span>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>

            <!-- Two-Column Playing XI Arena -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                ${teamCardsHtml}
            </div>
        </div>
    `;
}

function renderCricinfoLiveTab(data) {
    const container = document.getElementById('cricinfo-live-crease-table-container');
    if (!container) return;

    const crease = data.liveCrease;
    const hasBatters = Boolean(crease && crease.batters && crease.batters.length > 0);
    const hasBowler = Boolean(crease && (crease.activeBowler || crease.bowler || (crease.bowlers && crease.bowlers.length > 0)));
    const hasRecentDeliveries = Boolean(crease && crease.recentDeliveries && crease.recentDeliveries.length > 0);
    const hasActivePlay = hasBatters || hasBowler || hasRecentDeliveries;
    const isCompleted = Boolean(data.state && (data.state.toLowerCase() === 'post' || data.state.toLowerCase() === 'final' || data.state.toLowerCase() === 'completed'));

    if (!hasActivePlay && !isCompleted) {
        // Pre-Match or Toss Just Announced: Show the Official Playing XI & Toss as the main centerpiece!
        container.innerHTML = renderLivePlayingXI(data, true);
        const p11Sub = document.getElementById('cricinfo-live-playing11-container');
        if (p11Sub) p11Sub.innerHTML = '';
        safeCreateIcons();
        return;
    }

    if (!crease) return;

    const batters = crease.batters || [];
    const bw = crease.activeBowler || crease.bowler || (crease.bowlers && crease.bowlers[0]);
    const pb = crease.partnerBowler || (crease.bowlers && crease.bowlers[1]);

    let battersHtml = '';
    if (batters.length === 0) {
        battersHtml = `<tr><td colspan="6" class="py-2.5 text-center text-slate-400 text-xs font-medium">No active batters currently on crease.</td></tr>`;
    } else {
        const matchKey = `${data.leagueId}_${data.matchId}`;
        const isMatchCompleted = (data.state && (data.state.toLowerCase() === 'post' || data.state.toLowerCase() === 'final'));
        const strikerIndex = resolveActiveStriker(matchKey, batters, data);

        battersHtml = batters.map((b, idx) => {
            const isFacing = (!isMatchCompleted && idx === strikerIndex);
            const sr = (b.strikeRate && b.strikeRate !== '0.00' && b.strikeRate !== 0) ? b.strikeRate : computeStrikeRate(b.runs, b.balls);
            const isC = Boolean(b.isCaptain || b.captain || /\(c\)/i.test(b.name) || /\(c\s*&/i.test(b.name));
            const isWk = Boolean(b.isWicketKeeper || b.wicketKeeper || /\(wk\)/i.test(b.name) || /&\s*wk\)/i.test(b.name));
            const cleanBName = b.name.replace(/\s*\([^\)]*\)/g, '').trim();
            let bRoleTag = '';
            if (isC && isWk) {
                bRoleTag = '<span class="text-[8.5px] font-mono font-black px-1 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0 select-none ml-1">(c & wk)</span>';
            } else if (isC) {
                bRoleTag = '<span class="text-[8.5px] font-mono font-black px-1 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0 select-none ml-1">(c)</span>';
            } else if (isWk) {
                bRoleTag = '<span class="text-[8.5px] font-mono font-black px-1 py-0.2 rounded bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 shrink-0 select-none ml-1">(wk)</span>';
            }

            return `
                <tr onclick="toggleStrike('${data.leagueId}', '${data.matchId}', '${b.name.replace(/'/g, "\\'")}')" 
                    title="Click to toggle active strike to ${b.name}" 
                    class="cursor-pointer transition ${isFacing ? 'bg-gradient-to-r from-emerald-500/25 via-[#00ff88]/15 to-transparent dark:from-[#00ff88]/20 dark:via-emerald-950/70 dark:to-transparent border-l-4 border-l-[#00ff88] shadow-[0_0_15px_rgba(0,255,136,0.25)] font-bold hover:from-emerald-500/30' : 'hover:bg-slate-50 dark:hover:bg-dark-900/60'}">
                    <td class="py-1 px-1.5 font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                        <div class="flex items-center gap-1 min-w-0">
                            ${isFacing ? `
                                <span class="relative flex h-2 w-2 shrink-0" title="Facing Bowling (On Strike)">
                                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00ff88] opacity-80"></span>
                                    <span class="relative inline-flex rounded-full h-2 w-2 bg-[#00ff88] shadow-[0_0_8px_#00ff88]"></span>
                                </span>
                            ` : ''}
                            <div onclick="event.stopPropagation(); openPlayerProfile('${b.id || ''}', '${cleanBName.replace(/'/g, "\\'")}')" 
                                 class="flex items-center gap-1 min-w-0 cursor-pointer hover:opacity-80 transition group/p" title="View Profile & Stats of ${cleanBName}">
                                ${renderPlayerAvatar(cleanBName, b.headshot, 'w-4 h-4 sm:w-5 sm:h-5 group-hover/p:ring-2 group-hover/p:ring-[#00ff88] shrink-0')}
                                <span class="text-[#059669] dark:text-emerald-400 truncate group-hover/p:underline text-[11px] sm:text-xs ${isFacing ? 'font-black text-emerald-700 dark:text-[#00ff88]' : 'font-semibold'}">${cleanBName}</span>
                                ${bRoleTag}
                            </div>
                            ${isFacing ? '<span class="text-[7px] font-black uppercase px-1 py-0.2 rounded bg-[#00ff88]/25 text-emerald-800 dark:text-[#00ff88] border border-[#00ff88]/60 shrink-0 font-mono hidden sm:inline">STRIKE</span>' : ''}
                        </div>
                    </td>
                    <td class="py-1 px-1 text-right font-mono font-black text-xs sm:text-sm ${isFacing ? 'text-emerald-700 dark:text-[#00ff88]' : 'text-slate-900 dark:text-white'}">${b.runs}</td>
                    <td class="py-1 px-1 text-right font-mono font-bold text-[11px] sm:text-xs ${isFacing ? 'text-emerald-800 dark:text-emerald-200' : 'text-slate-700 dark:text-gray-300'}">${b.balls}</td>
                    <td class="py-1 px-1 text-right font-mono font-semibold text-[11px] sm:text-xs ${isFacing ? 'text-emerald-800 dark:text-emerald-200' : 'text-slate-700 dark:text-gray-300'}">${b.fours || 0}</td>
                    <td class="py-1 px-1 text-right font-mono font-semibold text-[11px] sm:text-xs ${isFacing ? 'text-emerald-800 dark:text-emerald-200' : 'text-slate-700 dark:text-gray-300'}">${b.sixes || 0}</td>
                    <td class="py-1 px-1 text-right font-mono font-black text-[11px] sm:text-xs text-emerald-600 dark:text-emerald-400">${sr}</td>
                </tr>
            `;
        }).join('');
    }

    const bowlers = [];
    if (bw) bowlers.push(bw);
    if (pb && (!bw || pb.name !== bw.name)) bowlers.push(pb);

    if (bowlers.length > 1) {
        const hasFrac0 = /\.[1-5]$/.test(String(bowlers[0].overs || ''));
        const hasFrac1 = /\.[1-5]$/.test(String(bowlers[1].overs || ''));
        if (hasFrac1 && !hasFrac0) {
            const temp = bowlers[0];
            bowlers[0] = bowlers[1];
            bowlers[1] = temp;
        }
    }

    let bowlersHtml = '';
    if (bowlers.length === 0) {
        bowlersHtml = `<tr><td colspan="6" class="py-2 text-center text-slate-400 text-xs font-medium">No active bowlers currently recorded.</td></tr>`;
    } else {
        const isMatchCompleted = (data.state && (data.state.toLowerCase() === 'post' || data.state.toLowerCase() === 'final'));
        bowlersHtml = bowlers.map((b, idx) => {
            const isBowlingNow = (idx === 0 && !isMatchCompleted);
            const econ = (b.economy && b.economy !== '0.00' && b.economy !== '0') ? b.economy : computeEconomy(b.overs, b.runs);
            const isBwC = Boolean(b.isCaptain || b.captain || /\(c\)/i.test(b.name));
            const cleanBwName = b.name.replace(/\s*\([^\)]*\)/g, '').trim();
            const bwRoleTag = isBwC ? '<span class="text-[8.5px] font-mono font-black px-1 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0 select-none ml-1">(c)</span>' : '';

            return `
                <tr class="hover:bg-slate-50 dark:hover:bg-dark-900/60 transition ${isBowlingNow ? 'bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent dark:from-amber-950/50 dark:via-dark-900 border-l-4 border-l-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.2)]' : ''}">
                    <td class="py-1 px-1.5 font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                        <div class="flex items-center gap-1 min-w-0">
                            ${isBowlingNow ? `
                                <span class="relative flex h-2 w-2 shrink-0" title="Currently Bowling (Active Bowler)">
                                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-80"></span>
                                    <span class="relative inline-flex rounded-full h-2 w-2 bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,1)]"></span>
                                </span>
                            ` : ''}
                            <div onclick="event.stopPropagation(); openPlayerProfile('${b.id || ''}', '${cleanBwName.replace(/'/g, "\\'")}')" 
                                 class="flex items-center gap-1 min-w-0 cursor-pointer hover:opacity-80 transition group/p" title="View Profile & Stats of ${cleanBwName}">
                                ${renderPlayerAvatar(cleanBwName, b.headshot, 'w-4 h-4 sm:w-5 sm:h-5 group-hover/p:ring-2 group-hover/p:ring-amber-400 shrink-0')}
                                <span class="text-[#059669] dark:text-emerald-400 truncate group-hover/p:underline text-[11px] sm:text-xs ${isBowlingNow ? 'font-black text-amber-700 dark:text-amber-300' : 'font-semibold'}">${cleanBwName}</span>
                                ${bwRoleTag}
                            </div>
                            ${isBowlingNow ? '<span class="text-[7px] font-black uppercase px-1 py-0.2 rounded bg-amber-400/25 text-amber-700 dark:text-amber-300 border border-amber-400/60 shrink-0 font-mono hidden sm:inline">BOWLING</span>' : ''}
                        </div>
                    </td>
                    <td class="py-1 px-1 text-right font-mono font-bold text-[11px] sm:text-xs ${isBowlingNow ? 'text-amber-600 dark:text-amber-300 font-black' : 'text-slate-900 dark:text-white'}">${b.overs}</td>
                    <td class="py-1 px-1 text-right font-mono font-semibold text-[11px] sm:text-xs text-slate-700 dark:text-gray-300">${b.maidens || 0}</td>
                    <td class="py-1 px-1 text-right font-mono font-semibold text-[11px] sm:text-xs text-slate-700 dark:text-gray-300">${b.runs}</td>
                    <td class="py-1 px-1 text-right font-mono font-black text-xs sm:text-sm text-rose-600 dark:text-rose-400">${b.wickets}</td>
                    <td class="py-1 px-1 text-right font-mono font-black text-[11px] sm:text-xs text-slate-900 dark:text-white">${econ}</td>
                </tr>
            `;
        }).join('');
    }

    // Extract FOW List & current total strictly for the CURRENT ACTIVE INNINGS ONLY
    let fowList = [];
    let currentTotalStr = "";
    if (data.innings) {
        const innKeys = Object.keys(data.innings);
        const sortedKeys = innKeys.sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
        if (sortedKeys.length > 0) {
            let activeKey = sortedKeys[sortedKeys.length - 1];
            if (data.currentInnings && data.currentInnings.inningsKey && data.innings[data.currentInnings.inningsKey]) {
                activeKey = String(data.currentInnings.inningsKey);
            }
            const activeInn = data.innings[activeKey];
            if (activeInn) {
                currentTotalStr = activeInn.total || activeInn.runs || "";
                if (Array.isArray(activeInn.fow) && activeInn.fow.length > 0) {
                    fowList = activeInn.fow;
                }
                // Fallback: If fow array is missing, reconstruct from dismissed batsmen
                if (fowList.length === 0 && Array.isArray(activeInn.batsmen)) {
                    const dismissed = activeInn.batsmen.filter(b => {
                        const dis = String(b.dismissal || b.out || '').toLowerCase().trim();
                        return dis && !dis.includes('not out') && !dis.includes('batting') && !dis.includes('yet to bat');
                    });
                    if (dismissed.length > 0) {
                        fowList = dismissed.map((b, idx) => ({
                            player: b.name || b.player || 'Batter',
                            score: b.runs !== undefined ? `${b.runs} (${b.balls || 0}b)` : '',
                            runs: b.runs || 0,
                            dismissal: b.dismissal || '',
                            wicketNumber: idx + 1
                        }));
                    }
                }
            }
        }
    }
    if (fowList.length === 0 && crease && Array.isArray(crease.fowList) && crease.fowList.length > 0) {
        fowList = crease.fowList;
    }

    const liveCRR = data.crr || (crease.crr ? crease.crr : "");
    const last5OversText = computeLast5Overs(crease.recentDeliveries, crease.last10Overs, liveCRR, fowList, currentTotalStr);

    const isTestMatch = Boolean(
        data.isTestMatch || 
        (data.currentInnings && data.currentInnings.isTestMatch) || 
        (data.description && /test|4-day|5-day|championship|shield|ranji|trophy/i.test(data.description)) ||
        (data.title && /test|4-day|5-day/i.test(data.title))
    );

    function resolveTestSessionTitleJS(m) {
        if (!m) return 'This Session';
        const statusDetail = String(m.statusDetail || m.status || '').toLowerCase();
        const daySession = String((m.currentInnings && m.currentInnings.daySession) || '').toLowerCase();
        const sessionField = String(m.session || '').toLowerCase();

        const textToScan = `${statusDetail} ${daySession} ${sessionField}`;
        const sessMatch = textToScan.match(/(?:day\s*\d+\s*[-:]\s*)?([123](?:st|nd|rd)?\s+session|session\s+[123]|first\s+session|second\s+session|third\s+session)/i);
        if (sessMatch) {
            let s = sessMatch[1].toUpperCase();
            if (s.includes('1') || s.includes('FIRST')) return '1ST SESSION';
            if (s.includes('2') || s.includes('SECOND')) return '2ND SESSION';
            if (s.includes('3') || s.includes('THIRD')) return '3RD SESSION';
        }

        if (statusDetail.includes('tea')) return 'SESSION 2 (TEA)';
        if (statusDetail.includes('lunch')) return 'SESSION 1 (LUNCH)';
        if (statusDetail.includes('stumps')) return 'SESSION 3 (STUMPS)';

        const notes = m.notes || [];
        for (let i = notes.length - 1; i >= 0; i--) {
            const nStr = String(notes[i]).toLowerCase();
            if (nStr.includes('tea:')) return '3RD SESSION';
            if (nStr.includes('lunch:')) return '2ND SESSION';
            if (nStr.includes('end of day:') || nStr.includes('stumps:')) return '1ST SESSION';
        }

        return '1ST SESSION';
    }

    function cleanPartnershipDisplay(pship) {
        if (!pship) return 'Unbroken';
        let s = String(pship).trim();
        s = s.replace(/\s*-\s*[A-Za-z].*$/, '').trim();
        if (!/\d+\s*runs?/i.test(s)) {
            const numbers = [...s.matchAll(/(\d+)\*/g)].map(m => parseInt(m[1], 10));
            const tot = numbers.reduce((a, b) => a + b, 0);
            return tot > 0 ? `${tot} runs` : 'Unbroken';
        }
        return s;
    }

    function ensureSessionRunRate(sessionStr, liveCRR) {
        if (!sessionStr || sessionStr === '-') return '-';
        let s = String(sessionStr).trim();

        const runsM = s.match(/(\d+)\s*runs?/i);
        const ovM = s.match(/\((\d+(?:\.\d+)?)\s*ov/i);
        
        if (runsM && ovM) {
            const rVal = parseFloat(runsM[1]);
            const ovVal = ovM[1];
            const calcSessionRR = computeEconomy(ovVal, rVal);
            if (calcSessionRR && calcSessionRR !== '0.00') {
                if (s.toLowerCase().includes('rr:')) {
                    return s.replace(/RR:\s*[\d\.]+/i, `RR: ${calcSessionRR}`);
                } else {
                    return s.replace(/\((\d+(?:\.\d+)?\s*ov)\)/i, `($1, RR: ${calcSessionRR})`);
                }
            }
        }

        return s;
    }

    const isMatchCompleted = Boolean(data.state && (data.state.toLowerCase() === 'post' || data.state.toLowerCase() === 'final' || data.state.toLowerCase() === 'completed'));

    const testSessionTitle = isTestMatch ? resolveTestSessionTitleJS(data) : 'Last 5 Overs';
    const testSessionCalculated = computeTestSessionJS(data.notes, currentTotalStr, liveCRR);
    let sessionWidgetTitle = isTestMatch ? testSessionTitle : 'Last 5 Overs';
    let sessionWidgetIcon = isTestMatch ? 'clock' : 'activity';
    const rawSessionVal = isTestMatch 
        ? (crease.thisSession || data.thisSession || testSessionCalculated || last5OversText) 
        : last5OversText;
    let sessionWidgetValue = ensureSessionRunRate(rawSessionVal, liveCRR);

    if (isMatchCompleted) {
        sessionWidgetTitle = 'Match Result';
        sessionWidgetIcon = 'award';
        sessionWidgetValue = (data.leadSummary && !data.leadSummary.toLowerCase().includes('lead by') && !data.leadSummary.toLowerCase().includes('trail by')) 
            ? data.leadSummary 
            : (data.statusDetail || 'Match Completed');
    }

    const lastWkt = (fowList && fowList.length > 0) ? fowList[fowList.length - 1] : null;
    const rawPartnership = crease.partnership || 
        (crease.currentPartnership ? `${crease.currentPartnership.runs} runs (${crease.currentPartnership.balls || 0}b)` : '');
    const formattedPartnership = cleanPartnershipDisplay(rawPartnership);

    let fowItemsHtml = '';
    if (!fowList || fowList.length === 0) {
        fowItemsHtml = `<div class="col-span-full text-emerald-800/60 dark:text-emerald-400/60 text-xs py-2 italic text-center">No wickets fallen in this innings yet.</div>`;
    } else {
        fowItemsHtml = fowList.map((w, idx) => {
            const ordinals = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];
            const wNum = w.wicketNumber || parseInt(w.wicket, 10) || (idx + 1);
            let sc = w.score;
            if (!sc || sc.toLowerCase().startsWith('wkt')) {
                sc = (w.runs !== undefined && w.runs !== '') ? `${w.runs}/${wNum}` : (wNum ? `Wkt ${wNum}` : 'Wkt');
            }
            const pName = w.player || w.name || 'Wicket';
            const ov = w.overs ? `${w.overs} ov` : '';
            return `
                <div class="px-2 py-1 rounded-lg bg-emerald-500/5 dark:bg-emerald-950/40 border border-emerald-500/20 text-[11px] font-sans flex items-center justify-between gap-1 shadow-2xs hover:border-emerald-500/50 transition min-w-0">
                    <div class="flex items-center gap-1 truncate min-w-0">
                        <span class="px-1.5 py-0.2 rounded bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 font-mono font-black text-[10px] border border-rose-200 dark:border-rose-900/60 shrink-0">${sc}</span>
                        <span class="font-bold text-slate-800 dark:text-gray-200 truncate text-[11px]" title="${pName}">${pName}</span>
                    </div>
                    ${ov ? `<span class="text-[9px] font-mono text-slate-400 dark:text-emerald-400/80 shrink-0 font-bold">(${ov})</span>` : ''}
                </div>
            `;
        }).join('');
    }

    container.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
            <!-- LEFT 7 COLS: Batters Arena & Bowlers Command -->
            <div class="lg:col-span-7 flex flex-col space-y-2.5">
                <!-- Batters Arena (Top Half of Left) -->
                <div class="hud-glass-panel rounded-xl overflow-hidden border border-emerald-500/30 shadow-xs flex-1 flex flex-col">
                    <div class="bg-gradient-to-r from-emerald-600 to-teal-700 px-3 py-1.5 text-white text-[11px] font-black uppercase tracking-wider flex items-center justify-between border-b border-emerald-500/40">
                        <div class="flex items-center gap-1.5 font-mono">
                            <i data-lucide="crosshair" class="w-3.5 h-3.5 text-emerald-300"></i>
                            <span>Batters Arena</span>
                        </div>
                        <span class="text-[9px] text-emerald-200 font-mono font-bold">Click row to set Strike</span>
                    </div>
                    <div class="overflow-x-auto custom-scrollbar flex-1">
                        <table class="cricinfo-table text-left w-full">
                            <thead>
                                <tr>
                                    <th class="py-1 px-2.5 text-xs font-black">Batter</th>
                                    <th class="py-1 px-2 text-right text-xs font-black">R</th>
                                    <th class="py-1 px-2 text-right text-xs font-black">B</th>
                                    <th class="py-1 px-2 text-right text-xs font-black">4s</th>
                                    <th class="py-1 px-2 text-right text-xs font-black">6s</th>
                                    <th class="py-1 px-2 text-right text-xs font-black">SR</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${battersHtml}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Bowlers Command (Bottom Half of Left) -->
                <div class="hud-glass-panel rounded-xl overflow-hidden border border-emerald-500/30 shadow-xs flex-1 flex flex-col">
                    <div class="bg-gradient-to-r from-emerald-700 to-teal-800 px-3 py-1 text-white text-[11px] font-black uppercase tracking-wider flex items-center justify-between border-b border-emerald-500/40">
                        <div class="flex items-center gap-1.5 font-mono">
                            <i data-lucide="shield" class="w-3.5 h-3.5 text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]"></i>
                            <span>Bowlers Command</span>
                        </div>
                        <span class="text-[9px] text-emerald-200 font-mono font-bold">Active Spell</span>
                    </div>
                    <div class="overflow-x-auto custom-scrollbar flex-1">
                        <table class="cricinfo-table text-left w-full">
                            <thead>
                                <tr>
                                    <th class="py-1 px-2.5 text-xs font-black">Bowler</th>
                                    <th class="py-1 px-2 text-right text-xs font-black">O</th>
                                    <th class="py-1 px-2 text-right text-xs font-black">M</th>
                                    <th class="py-1 px-2 text-right text-xs font-black">R</th>
                                    <th class="py-1 px-2 text-right text-xs font-black">W</th>
                                    <th class="py-1 px-2 text-right text-xs font-black">ECO</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${bowlersHtml}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- RIGHT 5 COLS: Match Pulse & Structured Telemetry Box -->
            <div class="lg:col-span-5 hud-glass-panel rounded-xl border border-emerald-500/30 shadow-xs flex flex-col overflow-hidden">
                <!-- Header -->
                <div class="bg-gradient-to-r from-emerald-600 to-teal-700 px-3 py-1 text-white text-[11px] font-black uppercase tracking-wider flex items-center justify-between border-b border-emerald-500/40">
                    <span class="flex items-center gap-1.5 font-mono">
                        <i data-lucide="activity" class="w-3.5 h-3.5 text-[#00ff88] drop-shadow-[0_0_6px_#00ff88]"></i> Match Pulse & Telemetry
                    </span>
                    <span class="text-[10px] font-mono font-bold text-slate-200 dark:text-[#00ff88]">Live Synced</span>
                </div>

                <!-- Structured Telemetry Rows (No blank box) -->
                <div class="p-2.5 space-y-2 flex-1 flex flex-col justify-start">
                    <!-- 1. Session / Last 5 Overs Micro-Bar -->
                    <div class="py-1.5 px-2.5 rounded-lg border border-amber-400/40 dark:border-amber-400/50 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent dark:from-amber-950/50 dark:via-dark-900 flex items-center justify-between gap-2 shadow-[0_0_12px_rgba(251,191,36,0.12)]">
                        <div class="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300 shrink-0 font-mono">
                            <i data-lucide="${sessionWidgetIcon}" class="w-3.5 h-3.5 text-amber-500 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]"></i>
                            <span>${sessionWidgetTitle}</span>
                        </div>
                        <div class="font-mono font-bold text-xs text-slate-800 dark:text-gray-100 truncate text-right" title="${sessionWidgetValue}">
                            ${sessionWidgetValue}
                        </div>
                    </div>

                    <!-- 2. Last Batter Out Micro-Bar -->
                    ${(() => {
                        let lastOutText = "";
                        const directLast = (crease && (crease.lastWicket || crease.lastDismissal)) ? String(crease.lastWicket || crease.lastDismissal).trim() : "";
                        if (directLast) {
                            lastOutText = directLast;
                        } else if (fowList && fowList.length > 0) {
                            const lastF = fowList[fowList.length - 1];
                            const pName = lastF.player || lastF.name || "Wicket";
                            const dism = lastF.dismissal ? ` ${lastF.dismissal}` : "";
                            const sc = lastF.score ? ` • ${lastF.score}` : (lastF.runs !== undefined ? ` • ${lastF.runs}` : "");
                            const ov = lastF.overs ? ` (${lastF.overs} ov)` : "";
                            lastOutText = `${pName}${dism}${sc}${ov}`.trim();
                        }

                        // Enrich with catcher & bowler details from batting scorecard if missing
                        if (data.innings) {
                            const innKeys = Object.keys(data.innings).sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
                            if (innKeys.length > 0) {
                                let activeKey = innKeys[innKeys.length - 1];
                                if (data.currentInnings && data.currentInnings.inningsKey && data.innings[data.currentInnings.inningsKey]) {
                                    activeKey = String(data.currentInnings.inningsKey);
                                }
                                const activeInn = data.innings[activeKey];
                                if (activeInn && Array.isArray(activeInn.batsmen)) {
                                    const dismissed = activeInn.batsmen.filter(b => {
                                        const dis = String(b.dismissal || b.out || '').toLowerCase().trim();
                                        return dis && !dis.includes('not out') && !dis.includes('batting') && !dis.includes('yet to bat');
                                    });
                                    if (dismissed.length > 0) {
                                        const lastDismissed = dismissed[dismissed.length - 1];
                                        const bName = lastDismissed.name || lastDismissed.player || 'Batter';
                                        const dism = lastDismissed.dismissal ? ` ${lastDismissed.dismissal}` : '';
                                        const r = lastDismissed.runs !== undefined ? ` • ${lastDismissed.runs}` : '';
                                        const b = lastDismissed.balls ? ` (${lastDismissed.balls}b)` : '';
                                        if (!lastOutText || (!lastOutText.includes(' b ') && !lastOutText.includes('c ') && !lastOutText.includes('lbw') && !lastOutText.includes('run out'))) {
                                            lastOutText = `${bName}${dism}${r}${b}`.trim();
                                        }
                                    }
                                }
                            }
                        }

                        if (!lastOutText) {
                            lastOutText = "No wickets fallen in this innings yet";
                        }
                        return `
                            <div class="py-1.5 px-2.5 rounded-lg border border-rose-500/30 dark:border-rose-500/40 bg-gradient-to-r from-rose-500/10 via-rose-500/5 to-transparent dark:from-rose-950/40 dark:via-dark-900 flex items-center justify-between gap-2 shadow-[0_0_10px_rgba(255,0,85,0.1)]">
                                <div class="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-rose-700 dark:text-[#ff4d6d] shrink-0 font-mono">
                                    <i data-lucide="user-x" class="w-3.5 h-3.5 text-rose-500 drop-shadow-[0_0_6px_rgba(255,0,85,0.8)]"></i>
                                    <span>Last Out</span>
                                </div>
                                <div class="font-semibold text-xs text-slate-800 dark:text-gray-200 truncate text-right font-sans" title="${lastOutText}">
                                    ${lastOutText}
                                </div>
                            </div>
                        `;
                    })()}

                    <!-- 3. Current Partnership Micro-Bar -->
                    <div class="py-1.5 px-2.5 rounded-lg border-2 border-[#00ff88]/60 border-l-4 border-l-[#00ff88] bg-gradient-to-r from-[#00ff88]/15 via-emerald-500/10 to-transparent dark:from-emerald-950/70 dark:via-dark-900 flex items-center justify-between gap-2 shadow-[0_0_20px_rgba(0,255,136,0.25)]">
                        <div class="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-emerald-800 dark:text-[#00ff88] shrink-0 font-mono">
                            <i data-lucide="users" class="w-3.5 h-3.5 text-[#00ff88] drop-shadow-[0_0_6px_#00ff88]"></i>
                            <span>Partnership</span>
                        </div>
                        <div class="font-extrabold text-xs text-emerald-800 dark:text-[#00ff88] drop-shadow-[0_0_6px_rgba(0,255,136,0.5)] truncate text-right font-sans" title="${formattedPartnership}">
                            ${formattedPartnership}
                        </div>
                    </div>

                    <!-- 4. Fall of Wickets (FOW) Section (Visible on Desktop Live view, on Mobile available under Scorecard tab) -->
                    <div class="pt-1.5 border-t border-emerald-500/20 flex-1 flex-col min-h-0 hidden lg:flex">
                        <div class="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300 pb-1 mb-1 font-mono">
                            <span class="flex items-center gap-1">
                                <i data-lucide="shield-alert" class="w-3.5 h-3.5 text-rose-500 drop-shadow-[0_0_6px_rgba(255,0,85,0.8)]"></i> Fall of Wickets (FOW)
                            </span>
                            <span class="font-mono text-[10px] text-rose-600 dark:text-[#ff4d6d] font-bold drop-shadow-[0_0_6px_rgba(255,0,85,0.5)]">${fowList.length > 0 ? `${fowList.length} ${fowList.length === 1 ? 'Wkt' : 'Wkts'} Fallen` : 'No Wickets'}</span>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 overflow-y-auto max-h-[160px] custom-scrollbar pr-0.5">
                            ${fowItemsHtml}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    `;

    const p11Sub = document.getElementById('cricinfo-live-playing11-container');
    if (p11Sub) {
        p11Sub.innerHTML = renderLivePlayingXI(data, false);
    }
    safeCreateIcons();
}

function renderRecentOversHTML(data) {
    const crease = data.liveCrease || {};
    const recentOvers = data.recentOvers || crease.recentOvers || [];

    function getBallBadge(symbol, shortText = '') {
        const raw = String(symbol !== undefined && symbol !== null ? symbol : '0').trim();
        let displayChar = raw;
        let badgeCls = 'bg-slate-200/90 dark:bg-dark-800 text-slate-700 dark:text-gray-300 border border-slate-300/80 dark:border-gray-700';

        const numRun = parseInt(raw, 10);
        if (!isNaN(numRun)) {
            if (numRun === 0) {
                displayChar = '0';
                badgeCls = 'bg-slate-200/90 dark:bg-dark-800 text-slate-600 dark:text-gray-300 border border-slate-300/80 dark:border-gray-700';
            } else if (numRun === 4) {
                displayChar = '4';
                badgeCls = 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-black shadow-xs ring-1 ring-blue-400/40';
            } else if (numRun === 6) {
                displayChar = '6';
                badgeCls = 'bg-gradient-to-br from-purple-600 to-pink-600 text-white font-black shadow-xs ring-1 ring-purple-400/40 animate-pulse';
            } else {
                displayChar = String(numRun);
                badgeCls = 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-black border border-emerald-500/40 shadow-2xs';
            }
        } else if (raw.toUpperCase() === 'W' || (raw.toLowerCase().includes('w') && !raw.toLowerCase().includes('wd'))) {
            displayChar = 'W';
            badgeCls = 'bg-gradient-to-br from-rose-600 to-red-700 text-white font-black shadow-sm ring-1 ring-rose-400/60';
        } else if (raw.toLowerCase().includes('wd') || raw.toLowerCase().includes('nb')) {
            displayChar = raw;
            badgeCls = 'bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold border border-amber-500/40';
        } else if (raw === '.' || raw === '•') {
            displayChar = '0';
            badgeCls = 'bg-slate-200/90 dark:bg-dark-800 text-slate-600 dark:text-gray-300 border border-slate-300/80 dark:border-gray-700';
        }

        let tooltip = `${displayChar === '0' ? '0 runs (Dot ball)' : (displayChar + (displayChar === '1' ? ' run' : ' runs'))}`;
        if (displayChar === 'W') tooltip = 'Wicket';
        if (displayChar === '4') tooltip = 'Boundary Four';
        if (displayChar === '6') tooltip = 'Maximum Six';
        if (displayChar.includes('wd')) tooltip = 'Wide Delivery';
        if (displayChar.includes('nb')) tooltip = 'No Ball';

        return `<span title="${tooltip}" class="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs sm:text-sm font-mono font-black select-none cursor-default transition-all transform hover:scale-110 shadow-xs shrink-0 ${badgeCls}">${displayChar}</span>`;
    }

    const allBallElements = [];

    if (recentOvers && recentOvers.length > 0) {
        recentOvers.forEach((o, oIdx) => {
            if (oIdx > 0) {
                allBallElements.push(`<span class="h-5 w-[2px] bg-slate-300/80 dark:bg-emerald-500/40 rounded-full mx-1 shrink-0 self-center" title="Over End"></span>`);
            }
            (o.balls || []).forEach(b => {
                allBallElements.push(getBallBadge(b.symbol, b.shortText || b.text));
            });
        });
    } else {
        const deliveries = crease.recentDeliveries || [];
        if (deliveries.length > 0) {
            deliveries.forEach(d => {
                if (d === '|') {
                    allBallElements.push(`<span class="h-5 w-[2px] bg-slate-300/80 dark:bg-emerald-500/40 rounded-full mx-1 shrink-0 self-center" title="Over End"></span>`);
                } else {
                    allBallElements.push(getBallBadge(d));
                }
            });
        }
    }

    if (allBallElements.length === 0) {
        return `<span class="text-slate-400 dark:text-emerald-400/60 text-xs font-medium italic">Ball-by-ball entries will appear as play progresses.</span>`;
    }

    return allBallElements.join('');
}

// -------------------------------------------------------------
// MATCH COVERAGE TAB (As in Cricinfo Screenshot)
// -------------------------------------------------------------

function renderMatchCoverageTab(data) {
    const container = document.getElementById('match-coverage-list');
    if (!container) return;

    const news = data.news || [];
    if (news.length === 0) {
        container.innerHTML = `
            <div class="col-span-2 text-center py-8 text-slate-400 text-xs">
                <i data-lucide="newspaper" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
                <p>No news articles published for this match yet.</p>
            </div>
        `;
        safeCreateIcons();
        return;
    }

    container.innerHTML = news.map(item => `
        <div class="flex space-x-3 p-3 rounded-lg border border-slate-200 dark:border-gray-800 bg-white dark:bg-dark-900/60 hover:border-[#059669] transition cursor-pointer" onclick="${item.link ? `window.open('${item.link}', '_blank')` : ''}">
            ${item.image ? `
                <div class="w-24 h-16 rounded overflow-hidden shrink-0 bg-slate-100 dark:bg-dark-800 border border-slate-200 dark:border-gray-700">
                    <img src="${item.image}" class="w-full h-full object-cover" alt="" onerror="this.style.display='none'">
                </div>
            ` : ''}
            <div class="flex-1 space-y-1">
                <h4 class="text-xs font-bold text-slate-900 dark:text-white line-clamp-2 leading-snug hover:text-[#059669] dark:hover:text-emerald-400 transition">
                    ${item.headline}
                </h4>
                <p class="text-[11px] text-slate-500 dark:text-gray-400 line-clamp-2">${item.description || ''}</p>
            </div>
        </div>
    `).join('');
    safeCreateIcons();
}

// -------------------------------------------------------------
// Scorecard Tab
// -------------------------------------------------------------

function renderScorecardTab(data) {
    const inningsData = data.innings || {};
    const innKeys = Object.keys(inningsData);

    const selectorContainer = document.getElementById('innings-selector-container');
    if (!selectorContainer) return;

    if (innKeys.length === 0) {
        selectorContainer.innerHTML = `<span class="text-xs text-gray-500">No innings data recorded yet.</span>`;
        document.getElementById('batting-table-body').innerHTML = `<tr><td colspan="7" class="py-6 text-center text-gray-500">Scorecard will appear once play begins.</td></tr>`;
        document.getElementById('bowling-table-body').innerHTML = `<tr><td colspan="6" class="py-6 text-center text-gray-500">No bowling data.</td></tr>`;
        const ytbC = document.getElementById('yet-to-bat-container');
        if (ytbC) ytbC.innerHTML = '';
        const fowC = document.getElementById('fow-cards-container');
        if (fowC) fowC.innerHTML = '';
        const partC = document.getElementById('partnerships-cards-container');
        if (partC) partC.innerHTML = '';
        return;
    }

    const isMatchLive = Boolean(data.statusDetail && (
        data.statusDetail.toLowerCase().includes('live') || 
        data.statusDetail.toLowerCase().includes('in') || 
        data.statusDetail.toLowerCase().includes('opt') || 
        data.statusDetail.toLowerCase().includes('trail') || 
        data.statusDetail.toLowerCase().includes('lead') || 
        data.statusDetail.toLowerCase().includes('need') ||
        (data.state && (data.state.toLowerCase() === 'in' || data.state.toLowerCase() === 'live'))
    ));
    let liveInnKey = innKeys[innKeys.length - 1];
    if (data.currentInnings) {
        if (typeof data.currentInnings === 'object' && data.currentInnings.inningsNumber) {
            liveInnKey = String(data.currentInnings.inningsNumber);
        } else if (typeof data.currentInnings === 'string' || typeof data.currentInnings === 'number') {
            liveInnKey = String(data.currentInnings);
        }
    }

    if (!appState.activeInningsKey || !inningsData[appState.activeInningsKey]) {
        appState.activeInningsKey = liveInnKey;
    }

    selectorContainer.innerHTML = innKeys.map((k, idx) => {
        const inn = inningsData[k];
        const isActive = (k === appState.activeInningsKey);
        const isLiveInning = (k === liveInnKey && isMatchLive);
        const ordinals = ["1st", "2nd", "3rd", "4th"];
        const kNum = parseInt(k, 10);
        const innOrd = (kNum >= 1 && kNum <= 4) ? ordinals[kNum - 1] : `${k}th`;
        const innTitle = inn.teamName ? `${innOrd} Innings (${inn.teamName})` : `${innOrd} Innings`;

        const matchingComp = data.competitors ? data.competitors.find(c => {
            const cN = c.name.toLowerCase();
            const iN = (inn.teamName || '').toLowerCase();
            return cN.includes(iN.split(' ')[0]) || iN.includes(cN.split(' ')[0]);
        }) : null;
        const compLogo = matchingComp ? matchingComp.logo : '';

        return `
            <button onclick="switchInnings('${k}')" 
                    class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 relative ${
                        isActive 
                            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md ring-2 ring-emerald-400 font-black' 
                            : isLiveInning
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-2 border-emerald-500/60 hover:bg-emerald-500/20'
                                : 'bg-slate-100 dark:bg-dark-900 text-slate-600 dark:text-gray-400 hover:text-[#059669] dark:hover:text-white border border-slate-200 dark:border-gray-800'
                    }">
                ${renderTeamLogo(inn.teamName || 'Team', compLogo, 'w-4 h-4')}
                <span>${innTitle}</span>
                ${isLiveInning ? `
                    <span class="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-mono font-black uppercase ${isActive ? 'bg-rose-600 text-white shadow-xs' : 'bg-rose-500/10 text-rose-500 border border-rose-500/30'}">
                        <span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                        LIVE
                    </span>
                ` : `
                    <span class="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase ${isActive ? 'bg-slate-700/80 text-white' : 'bg-slate-200/80 dark:bg-dark-800 text-slate-500 dark:text-gray-400'}">Done</span>
                `}
            </button>
        `;
    }).join('');

    renderActiveInningsScorecard(inningsData[appState.activeInningsKey], data);
}

function switchInnings(innKey) {
    appState.activeInningsKey = innKey;
    if (appState.currentMatchData && appState.currentMatchData.innings) {
        renderScorecardTab(appState.currentMatchData);
        if (appState.currentMatchData.analytics) {
            renderAnalyticsTab(appState.currentMatchData);
        }
    }
}

function renderActiveInningsScorecard(inn, matchData) {
    if (!inn) return;
    const isMatchLive = Boolean(matchData && matchData.statusDetail && (
        matchData.statusDetail.toLowerCase().includes('live') || 
        matchData.statusDetail.toLowerCase().includes('in') || 
        matchData.statusDetail.toLowerCase().includes('opt') || 
        matchData.statusDetail.toLowerCase().includes('trail') || 
        matchData.statusDetail.toLowerCase().includes('lead') || 
        matchData.statusDetail.toLowerCase().includes('need')
    ));

    const batBody = document.getElementById('batting-table-body');
    if (batBody) {
        if (!inn.batting || inn.batting.length === 0) {
            batBody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-slate-400 text-sm font-medium">No batting records for this innings.</td></tr>`;
        } else {
            batBody.innerHTML = (() => {
                let batWkFound = false;
                return inn.batting.map(b => {
                    const sr = (b.strikeRate && b.strikeRate !== '0.00') ? b.strikeRate : computeStrikeRate(b.runs, b.balls);
                    const dismissalHtml = formatDismissalHTML(b.dismissal, b.isNotOut);
                    const safeName = escapeQuotes(b.name);

                    const isC = Boolean(b.isCaptain || b.captain || /\(c\)/i.test(b.name) || /\(c\s*&/i.test(b.name));
                    let isWk = Boolean(b.isWicketKeeper || b.wicketKeeper || /\(wk\)/i.test(b.name) || /&\s*wk\)/i.test(b.name));
                    if (isWk) {
                        if (!batWkFound) {
                            batWkFound = true;
                        } else {
                            isWk = false;
                        }
                    }
                    const cleanDisplayName = b.name.replace(/\s*\([^\)]*\)/g, '').trim();
                    let roleTag = '';
                    if (isC && isWk) {
                        roleTag = '<span class="text-[9.5px] font-mono font-black px-1 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0 select-none ml-1">(c & wk)</span>';
                    } else if (isC) {
                        roleTag = '<span class="text-[9.5px] font-mono font-black px-1 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0 select-none ml-1">(c)</span>';
                    } else if (isWk) {
                        roleTag = '<span class="text-[9.5px] font-mono font-black px-1 py-0.2 rounded bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 shrink-0 select-none ml-1">(wk)</span>';
                    }

                return `
                    <tr class="hover:bg-slate-50 dark:hover:bg-dark-900/60 transition border-b border-slate-100 dark:border-gray-800/80">
                        <td class="py-2 px-2 text-left align-top" style="width: 44%;">
                            <div class="flex items-start gap-1.5 min-w-0">
                                <div onclick="openPlayerProfile('${b.id || ''}', '${safeName}')" 
                                     class="flex items-start gap-1.5 min-w-0 cursor-pointer hover:opacity-80 transition group/p w-full" title="View Profile & Stats of ${b.name}">
                                    ${renderPlayerAvatar(cleanDisplayName, b.headshot, 'w-4 h-4 sm:w-5 sm:h-5 group-hover/p:ring-2 group-hover/p:ring-[#00ff88] shrink-0 mt-0.5')}
                                    <div class="min-w-0 flex-1">
                                        <div class="flex items-center gap-1 flex-wrap">
                                            <span class="font-bold text-slate-900 dark:text-white group-hover/p:text-[#00ff88] group-hover/p:underline text-xs sm:text-sm truncate">${cleanDisplayName}</span>
                                            ${roleTag}
                                            ${b.isNotOut ? '<span class="text-rose-600 font-black text-xs shrink-0">*</span>' : ''}
                                        </div>
                                        <div class="text-[10px] text-slate-500 dark:text-gray-400 mt-0.5 leading-snug break-words">
                                            ${dismissalHtml}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </td>
                        <td class="py-2 px-1 text-right font-mono font-black text-xs sm:text-sm text-slate-900 dark:text-white align-top" style="width: 11%;">${b.runs}</td>
                        <td class="py-2 px-1 text-right font-mono font-bold text-[11px] sm:text-xs text-slate-700 dark:text-gray-300 align-top" style="width: 11%;">${b.balls}</td>
                        <td class="py-2 px-1 text-right font-mono font-semibold text-[11px] sm:text-xs text-slate-700 dark:text-gray-300 align-top" style="width: 11%;">${b.fours || 0}</td>
                        <td class="py-2 px-1 text-right font-mono font-semibold text-[11px] sm:text-xs text-slate-700 dark:text-gray-300 align-top" style="width: 11%;">${b.sixes || 0}</td>
                        <td class="py-2 px-1 text-right font-mono font-black text-[11px] sm:text-xs text-emerald-600 dark:text-emerald-400 align-top" style="width: 12%;">${sr}</td>
                    </tr>
                `;
            }).join('');
            })();
        }
    }

    const extrasElem = document.getElementById('extras-text');
    const totalElem = document.getElementById('total-text');
    if (extrasElem) {
        let extVal = (inn.extras || '').trim();
        if (!extVal || extVal === '0' || extVal === '-') {
            const totMatch = String(inn.runs || inn.total || '').match(/^(\d+)/);
            const totRuns = totMatch ? parseInt(totMatch[1], 10) : 0;
            const batRuns = (inn.batting || []).reduce((acc, b) => acc + (parseInt(b.runs, 10) || 0), 0);
            if (totRuns > batRuns) {
                extVal = String(totRuns - batRuns);
            } else {
                extVal = '0';
            }
        }
        if (extVal.startsWith('(')) {
            const nums = extVal.match(/\d+/g);
            if (nums) {
                const sumExtras = nums.reduce((acc, n) => acc + parseInt(n, 10), 0);
                extVal = `${sumExtras} ${extVal}`;
            }
        }
        extrasElem.textContent = extVal;
    }
    if (totalElem) totalElem.textContent = formatScorecardTotalWithRR(inn.total, inn.runs);

    // Render Yet to Bat / Did Not Bat (Strictly Playing XI only)
    const yetToBatContainer = document.getElementById('yet-to-bat-container');
    if (yetToBatContainer) {
        let ytbList = (inn && inn.yetToBat) ? inn.yetToBat : [];

        const battedCount = (inn && inn.batting) ? inn.batting.length : 0;
        const maxExpectedYtb = Math.max(0, 11 - battedCount);

        const innTeam = (inn.teamName || '').toLowerCase().replace(/\b(women|men|xi|2nd|u19|u-19|a\b|team)\b/g, '').replace(/[^a-z0-9]/g, '');
        const matchingSquad = (matchData && matchData.squads) ? matchData.squads.find(sq => {
            const sqTeam = (sq.teamName || '').toLowerCase().replace(/\b(women|men|xi|2nd|u19|u-19|a\b|team)\b/g, '').replace(/[^a-z0-9]/g, '');
            return sqTeam && innTeam && (sqTeam === innTeam || sqTeam.includes(innTeam) || innTeam.includes(sqTeam));
        }) : null;

        if (matchingSquad && matchingSquad.playingXI && matchingSquad.playingXI.length > 0) {
            const battedNames = (inn.batting || []).map(b => (b.name || '').toLowerCase().trim());
            ytbList = matchingSquad.playingXI.filter(p => {
                const pName = (p.name || '').toLowerCase().trim();
                return !battedNames.some(b => b === pName || (b.length > 3 && pName.includes(b)) || (pName.length > 3 && b.includes(pName)));
            }).map(p => ({
                id: p.id || '',
                name: p.name || 'Player',
                role: p.role || 'Player',
                captain: p.captain,
                wicketKeeper: p.wicketKeeper,
                isCaptain: p.isCaptain,
                isWicketKeeper: p.isWicketKeeper,
                headshot: p.headshot || ''
            }));
        } else if (ytbList.length > maxExpectedYtb && maxExpectedYtb > 0) {
            ytbList = ytbList.slice(0, maxExpectedYtb);
        }

        if (ytbList && ytbList.length > 0) {
            const isLiveInn = (inn.inningsNumber === String(appState.activeInningsKey) && isMatchLive);
            const sectionTitle = isLiveInn ? 'Yet to Bat' : 'Did Not Bat';
            const badgeColor = isLiveInn ? 'bg-emerald-500/10 text-emerald-600 dark:text-[#00ff88] border-emerald-500/30' : 'bg-slate-100 dark:bg-dark-800 text-slate-600 dark:text-gray-400 border-slate-200 dark:border-gray-700';

            yetToBatContainer.innerHTML = `
                <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-dark-900/80 border border-slate-200/90 dark:border-gray-800 shadow-2xs">
                    <div class="flex items-center justify-between gap-2 mb-2.5">
                        <div class="text-[11px] font-mono uppercase font-black tracking-wider flex items-center gap-1.5 text-slate-700 dark:text-gray-200">
                            <i data-lucide="users" class="w-3.5 h-3.5 text-emerald-500"></i>
                            <span>${sectionTitle}</span>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${badgeColor}">
                                ${ytbList.length} Upcoming Batter${ytbList.length === 1 ? '' : 's'}
                            </span>
                        </div>
                        <span class="text-[10px] text-slate-400 font-mono">Playing 11</span>
                    </div>
                    <div class="flex flex-wrap items-center gap-1.5">
                        ${(() => {
                            let ytbWkFound = false;
                            return ytbList.map(p => {
                                const isC = Boolean(p.isCaptain || p.captain || /\(c\)/i.test(p.name));
                                let isWk = Boolean(p.isWicketKeeper || p.wicketKeeper || /\(wk\)/i.test(p.name));
                                if (isWk) {
                                    if (!ytbWkFound) {
                                        ytbWkFound = true;
                                    } else {
                                        isWk = false;
                                    }
                                }
                                const cleanPName = p.name.replace(/\s*\([^\)]*\)/g, '').trim();
                                let ytbTag = '';
                                if (isC && isWk) {
                                    ytbTag = '<span class="text-[9px] font-mono font-black px-1 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0 select-none">(c & wk)</span>';
                                } else if (isC) {
                                    ytbTag = '<span class="text-[9px] font-mono font-black px-1 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0 select-none">(c)</span>';
                                } else if (isWk) {
                                    ytbTag = '<span class="text-[9px] font-mono font-black px-1 py-0.2 rounded bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 shrink-0 select-none">(wk)</span>';
                                }
                                return `
                                <div onclick="openPlayerProfile('${p.id || ''}', '${cleanPName.replace(/'/g, "\\'")}')" 
                                     class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-dark-800 border border-slate-200/90 dark:border-gray-700/80 hover:border-emerald-500 hover:shadow-xs transition cursor-pointer group/ytb" 
                                     title="View Profile & Stats of ${cleanPName}">
                                    ${renderPlayerAvatar(cleanPName, p.headshot, 'w-5 h-5 rounded-full object-cover object-top border border-emerald-500/30 shrink-0 group-hover/ytb:scale-105 transition')}
                                    <span class="text-xs font-bold text-slate-800 dark:text-gray-200 group-hover/ytb:text-emerald-500 transition">${cleanPName}</span>
                                    ${ytbTag}
                                    ${p.role && p.role !== 'Player' ? `<span class="text-[9px] text-slate-400 font-mono">(${p.role})</span>` : ''}
                                </div>
                            `;
                            }).join('');
                        })()}
                    </div>
                </div>
            `;
            safeCreateIcons();
        } else {
            yetToBatContainer.innerHTML = '';
        }
    }

    const bwlBody = document.getElementById('bowling-table-body');
    if (bwlBody) {
        if (!inn.bowling || inn.bowling.length === 0) {
            bwlBody.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-slate-400 text-xs font-medium">No bowling records for this innings.</td></tr>`;
        } else {
            bwlBody.innerHTML = inn.bowling.map(bw => {
                const econ = (bw.economy && bw.economy !== '0.00' && bw.economy !== '0') ? bw.economy : computeEconomy(bw.overs, bw.runs);
                const isBwC = Boolean(bw.isCaptain || bw.captain || /\(c\)/i.test(bw.name));
                const cleanBwName = bw.name.replace(/\s*\([^\)]*\)/g, '').trim();
                const bwRoleTag = isBwC ? '<span class="text-[9.5px] font-mono font-black px-1 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0 select-none ml-1">(c)</span>' : '';

                return `
                    <tr class="hover:bg-slate-50 dark:hover:bg-dark-900/60 transition border-b border-slate-100 dark:border-gray-800/80">
                        <td class="py-1.5 px-2 text-left truncate font-bold text-xs sm:text-sm text-slate-900 dark:text-white" style="width: 44%;">
                            <div class="flex items-center gap-1.5 min-w-0">
                                <div onclick="openPlayerProfile('${bw.id || ''}', '${bw.name.replace(/'/g, "\\'")}')" 
                                     class="flex items-center gap-1 min-w-0 cursor-pointer hover:opacity-80 transition group/p" title="View Profile & Stats of ${bw.name}">
                                    ${renderPlayerAvatar(cleanBwName, bw.headshot, 'w-4 h-4 sm:w-5 sm:h-5 group-hover/p:ring-2 group-hover/p:ring-amber-400 shrink-0')}
                                    <span class="truncate text-slate-900 dark:text-white group-hover/p:text-[#00ff88] group-hover/p:underline text-[11px] sm:text-xs">${cleanBwName}</span>
                                    ${bwRoleTag}
                                </div>
                            </div>
                        </td>
                        <td class="py-1.5 px-1 text-right font-mono font-semibold text-[11px] sm:text-xs text-slate-800 dark:text-gray-200" style="width: 11%;">${bw.overs}</td>
                        <td class="py-1.5 px-1 text-right font-mono font-semibold text-[11px] sm:text-xs text-slate-700 dark:text-gray-300" style="width: 11%;">${bw.maidens || 0}</td>
                        <td class="py-1.5 px-1 text-right font-mono font-semibold text-[11px] sm:text-xs text-slate-700 dark:text-gray-300" style="width: 11%;">${bw.runs}</td>
                        <td class="py-1.5 px-1 text-right font-mono font-black text-xs sm:text-sm text-rose-600 dark:text-rose-400" style="width: 11%;">${bw.wickets}</td>
                        <td class="py-1.5 px-1 text-right font-mono font-black text-[11px] sm:text-xs text-slate-900 dark:text-white" style="width: 12%;">${econ}</td>
                    </tr>
                `;
            }).join('');
        }
    }

    // Render Fall of Wickets (FoW)
    const fowContainer = document.getElementById('fow-cards-container');
    if (fowContainer) {
        if (!inn.fow || inn.fow.length === 0) {
            fowContainer.innerHTML = `<div class="col-span-full text-center py-3 text-slate-400 text-xs">No wickets fallen yet in this innings.</div>`;
        } else {
            fowContainer.innerHTML = inn.fow.map(f => `
                <div onclick="openPlayerProfile('${f.playerId || ''}', '${f.player.replace(/'/g, "\\'")}')" 
                     class="bg-white dark:bg-dark-900/80 p-2.5 rounded-lg border border-slate-200 dark:border-gray-800 flex items-center justify-between text-xs hover:border-[#00ff88] transition cursor-pointer group/fow" title="View Profile & Stats of ${f.player}">
                    <div class="flex items-center space-x-2">
                        <span class="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-mono font-bold text-[10px] border border-rose-200 dark:border-rose-800">
                            ${f.wicket} Wkt
                        </span>
                        <div>
                            <div class="font-bold text-slate-800 dark:text-gray-200 truncate max-w-[140px] sm:max-w-[180px] group-hover/fow:text-[#00ff88] group-hover/fow:underline">${f.player}</div>
                            <div class="text-[10px] text-slate-500 font-mono">${f.overs ? `${f.overs} ov` : ''}</div>
                        </div>
                    </div>
                    <div class="font-mono font-bold text-slate-900 dark:text-white text-sm">
                        ${f.score || `${f.runs}/${f.wicketNumber}`}
                    </div>
                </div>
            `).join('');
        }
    }

    // Render Partnerships Breakdown
    const partContainer = document.getElementById('partnerships-cards-container');
    if (partContainer) {
        if (!inn.partnerships || inn.partnerships.length === 0) {
            partContainer.innerHTML = `<div class="col-span-full text-center py-3 text-slate-400 text-xs">No partnership data recorded.</div>`;
        } else {
            partContainer.innerHTML = inn.partnerships.map(p => {
                const isCurr = p.isCurrent;
                const borderCls = isCurr ? 'border-[#059669] bg-sky-50/40 dark:bg-sky-950/20' : 'border-slate-200 dark:border-gray-800 bg-white dark:bg-dark-900/70';
                const tagCls = isCurr ? 'bg-sky-100 dark:bg-sky-900/40 text-[#059669] dark:text-emerald-300 border-sky-200 dark:border-sky-800' : 'bg-slate-100 dark:bg-dark-800 text-slate-600 dark:text-gray-400 border-slate-200 dark:border-gray-700';

                let batterTxt = '';
                if (p.player1 && p.player2) {
                    const p1R = p.player1Runs ? ` (${p.player1Runs}${isCurr ? '*' : ''})` : '';
                    const p2R = p.player2Runs ? ` (${p.player2Runs}${isCurr ? '*' : ''})` : '';
                    batterTxt = `${p.player1}${p1R} & ${p.player2}${p2R}`;
                } else if (p.player1) {
                    batterTxt = `${p.player1}${p.player1Runs ? ` (${p.player1Runs})` : ''}`;
                }

                return `
                    <div class="${borderCls} p-3 rounded-lg border flex items-center justify-between text-xs transition">
                        <div class="space-y-1">
                            <div class="flex items-center space-x-2">
                                <span class="px-2 py-0.5 rounded font-mono font-bold text-[10px] uppercase border ${tagCls}">
                                    ${p.wicket} ${isCurr ? '• LIVE' : ''}
                                </span>
                                ${p.overs && p.overs !== 'Current' ? `<span class="text-[10px] text-slate-500 font-mono">(${p.overs} ov)</span>` : ''}
                            </div>
                            <div class="text-[11px] text-slate-700 dark:text-gray-300 font-medium">${batterTxt || p.summary || ''}</div>
                        </div>
                        <div class="text-right">
                            <div class="font-mono text-lg font-extrabold text-slate-900 dark:text-white">${p.runs}${isCurr ? '*' : ''}</div>
                            <div class="text-[9px] text-slate-400 font-mono">RUNS</div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
}

// -------------------------------------------------------------
// Analytics & Charts Tab
// -------------------------------------------------------------

function renderAnalyticsTab(data) {
    const analytics = data.analytics || {};

    const topBatElem = document.getElementById('top-batsmen-list');
    if (topBatElem) {
        const list = analytics.topBatsmen || [];
        if (list.length === 0) {
            topBatElem.innerHTML = `<p class="text-gray-500">No batsman stats available yet.</p>`;
        } else {
            topBatElem.innerHTML = list.slice(0, 5).map((b, idx) => `
                <div class="flex items-center justify-between bg-dark-800/80 p-2.5 rounded-lg border border-gray-800/60">
                    <div class="flex items-center space-x-2">
                        <span class="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-mono font-bold text-[10px]">${idx + 1}</span>
                        <div>
                            <div class="font-bold text-gray-200">${b.name}</div>
                            <div class="text-[10px] text-gray-500">${b.team} • SR: ${b.sr}</div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="font-mono font-bold text-emerald-400 text-sm">${b.runs}</div>
                        <div class="text-[10px] text-gray-400">${b.balls} balls (${b.fours}x4, ${b.sixes}x6)</div>
                    </div>
                </div>
            `).join('');
        }
    }

    const topBwlElem = document.getElementById('top-bowlers-list');
    if (topBwlElem) {
        const list = analytics.topBowlers || [];
        if (list.length === 0) {
            topBwlElem.innerHTML = `<p class="text-gray-500">No bowler stats available yet.</p>`;
        } else {
            topBwlElem.innerHTML = list.slice(0, 5).map((bw, idx) => `
                <div class="flex items-center justify-between bg-dark-800/80 p-2.5 rounded-lg border border-gray-800/60">
                    <div class="flex items-center space-x-2">
                        <span class="w-5 h-5 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center font-mono font-bold text-[10px]">${idx + 1}</span>
                        <div>
                            <div class="font-bold text-gray-200">${bw.name}</div>
                            <div class="text-[10px] text-gray-500">${bw.overs} ov • Econ: ${bw.economy}</div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="font-mono font-bold text-teal-400 text-sm">${bw.wickets} Wkts</div>
                        <div class="text-[10px] text-gray-400">${bw.runs} Runs (${bw.maidens} M)</div>
                    </div>
                </div>
            `).join('');
        }
    }

    renderPartnershipsChart(analytics.partnerships, appState.activeInningsKey);
    renderRunShareChart(analytics.runsDistribution, appState.activeInningsKey);
}

function renderPartnershipsChart(partnershipsData, activeInnKey) {
    const ctx = document.getElementById('partnershipsChart');
    if (!ctx) return;

    if (appState.charts.partnerships) {
        appState.charts.partnerships.destroy();
    }

    const currentInnPartnerships = (partnershipsData || []).find(p => p.innings === activeInnKey);
    const pList = currentInnPartnerships ? currentInnPartnerships.partnerships : [];

    if (pList.length === 0) {
        appState.charts.partnerships = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['No Data'],
                datasets: [{ label: 'Runs', data: [0], backgroundColor: '#1f2937' }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
        return;
    }

    const labels = pList.map(p => `${p.wicket} Wkt`);
    const data = pList.map(p => p.runs);
    const tooltips = pList.map(p => p.pair);

    appState.charts.partnerships = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Partnership Runs',
                data: data,
                backgroundColor: 'rgba(16, 185, 129, 0.75)',
                borderColor: '#10b981',
                borderWidth: 1.5,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        afterLabel: (ctx) => `Pair: ${tooltips[ctx.dataIndex]}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af', font: { size: 10 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#9ca3af', font: { size: 10 } }
                }
            }
        }
    });
}

function renderRunShareChart(runsDistData, activeInnKey) {
    const ctx = document.getElementById('runShareChart');
    if (!ctx) return;

    if (appState.charts.runShare) {
        appState.charts.runShare.destroy();
    }

    const currentDist = (runsDistData || []).find(d => d.innings === activeInnKey);
    const pList = currentDist ? currentDist.data : [];

    if (pList.length === 0) {
        appState.charts.runShare = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['No Data'],
                datasets: [{ data: [1], backgroundColor: ['#1f2937'] }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
        return;
    }

    const labels = pList.map(p => p.player);
    const data = pList.map(p => p.runs);
    const colors = [
        '#10b981', '#06b6d4', '#6366f1', '#f59e0b', 
        '#ec4899', '#8b5cf6', '#14b8a6', '#f97316'
    ];

    appState.charts.runShare = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 2,
                borderColor: '#111827'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#d1d5db', font: { size: 10 }, boxWidth: 10 }
                }
            }
        }
    });
}

// -------------------------------------------------------------
// Commentary & DRS Events Tab
// -------------------------------------------------------------

function renderCommentaryTab(data) {
    const container = document.getElementById('commentary-stream');
    if (!container) return;

    let list = data.commentary || [];

    if (appState.commFilter !== 'all') {
        list = list.filter(item => item.category === appState.commFilter);
    }

    if (list.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-500 text-xs">
                <i data-lucide="message-circle" class="w-6 h-6 mx-auto mb-2 opacity-50"></i>
                <p>No timeline events recorded under this filter.</p>
            </div>
        `;
        safeCreateIcons();
        return;
    }

    container.innerHTML = list.map(item => {
        let badgeColor = 'bg-gray-800 text-gray-300';
        let icon = 'clock';

        if (item.category === 'review') {
            badgeColor = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
            icon = 'alert-triangle';
        } else if (item.category === 'milestone') {
            badgeColor = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
            icon = 'award';
        } else if (item.category === 'break') {
            badgeColor = 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
            icon = 'coffee';
        } else if (item.category === 'toss') {
            badgeColor = 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
            icon = 'help-circle';
        }

        return `
            <div class="bg-white dark:bg-dark-900/80 p-3.5 rounded-lg border border-slate-200 dark:border-gray-800 flex items-start space-x-3 text-xs">
                <div class="p-2 rounded-lg ${badgeColor} shrink-0 mt-0.5">
                    <i data-lucide="${icon}" class="w-4 h-4"></i>
                </div>
                <div class="flex-1">
                    <div class="flex items-center justify-between mb-1">
                        <span class="font-bold uppercase tracking-wider text-[10px] text-slate-500 dark:text-gray-400">${item.type || item.category}</span>
                        ${item.day ? `<span class="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-dark-800 text-slate-600 dark:text-gray-300 font-mono">Day ${item.day}</span>` : ''}
                    </div>
                    <p class="text-slate-800 dark:text-gray-200 leading-relaxed font-sans">${item.text}</p>
                </div>
            </div>
        `;
    }).join('');

    safeCreateIcons();
}

// -------------------------------------------------------------

// -------------------------------------------------------------

// -------------------------------------------------------------
// -------------------------------------------------------------
// CHEERLEADER MOTION CELEBRATION (Boundaries & Sixes)
// Real IPL Cricket Cheerleaders with Golden Pom-Poms
// -------------------------------------------------------------

const REAL_CHEERLEADER_1_B64 = "data:image/webp;base64,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";
const REAL_CHEERLEADER_2_B64 = "data:image/webp;base64,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";

function getRealCheerleaderHtml(isRight = false, type = 'four') {
    const jumpClass = isRight ? 'real-cheer-jump-right' : 'real-cheer-jump-left';
    const primarySrc = isRight ? '/static/images/cheerleader_2.webp' : '/static/images/cheerleader_1.webp';
    const fallbackB64 = isRight ? REAL_CHEERLEADER_2_B64 : REAL_CHEERLEADER_1_B64;

    return `
    <div class="tv-real-cheerleader-wrapper">
        <img 
            src="${primarySrc}" 
            alt="Real IPL Cricket Cheerleader" 
            class="tv-real-cheerleader-img ${jumpClass}" 
            onerror="if(this.src!=='${fallbackB64}'){this.src='${fallbackB64}';}"
        />
        <div class="tv-real-cheer-shadow"></div>
    </div>
    `;
}

function initConfettiParticles(isSix) {
    const canvas = document.getElementById('tv-confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = isSix 
        ? ['#ec4899', '#f43f5e', '#a855f7', '#fbbf24', '#ffffff', '#38bdf8']
        : ['#00ff88', '#10b981', '#fde047', '#38bdf8', '#ffffff', '#f59e0b'];

    const particles = [];
    const particleCount = 100;

    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * (canvas.height * 0.3) - 20,
            w: Math.random() * 10 + 6,
            h: Math.random() * 6 + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            vx: (Math.random() - 0.5) * 4,
            vy: Math.random() * 3 + 2.5,
            rot: Math.random() * 360,
            rotSpeed: (Math.random() - 0.5) * 12,
            opacity: 1
        });
    }

    let startTime = Date.now();
    function renderConfetti() {
        if (!document.getElementById('tv-confetti-canvas')) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const elapsed = Date.now() - startTime;

        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.rot += p.rotSpeed;
            if (elapsed > 3500) {
                p.opacity = Math.max(0, p.opacity - 0.02);
            }

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rot * Math.PI) / 180);
            ctx.globalAlpha = p.opacity;
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        });

        if (elapsed < 4500) {
            requestAnimationFrame(renderConfetti);
        }
    }

    renderConfetti();
}

function playCelebrationFanfare() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const notes = [
            { f: 523.25, t: 0.0, d: 0.15 },
            { f: 659.25, t: 0.15, d: 0.15 },
            { f: 783.99, t: 0.30, d: 0.20 },
            { f: 1046.50, t: 0.50, d: 0.65 }
        ];
        notes.forEach(n => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(n.f, ctx.currentTime + n.t);
            gain.gain.setValueAtTime(0.001, ctx.currentTime + n.t);
            gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + n.t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + n.t + n.d);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + n.t);
            osc.stop(ctx.currentTime + n.t + n.d + 0.05);
        });
    } catch(e) {
        // Audio might be blocked until user gesture, safely ignore
    }
}

window.triggerCheerleaderCelebration = function(type = 'four') {
    let existing = document.getElementById('tv-cheerleader-overlay');
    if (existing) existing.remove();

    const isSix = type === 'six';
    const titleText = isSix ? 'MAXIMUM SIX! 💥' : 'FOUR! ⚡';
    const subText = isSix ? 'MASSIVE MONSTER HIT OUT OF THE PARK!' : 'SUPERB BOUNDARY CRACKED TO THE FENCE!';
    const bannerClass = isSix ? 'banner-six' : 'banner-four';
    const titleColor = isSix ? 'text-amber-300' : 'text-[#00ff88]';

    const overlayHtml = `
        <div id="tv-cheerleader-overlay" class="tv-cheer-overlay active" onclick="this.classList.remove('active'); setTimeout(() => this.remove(), 300);">
            <canvas id="tv-confetti-canvas" class="absolute inset-0 w-full h-full pointer-events-none" style="z-index: 15;"></canvas>
            
            <div class="tv-spotlight tv-spotlight-left"></div>
            <div class="tv-spotlight tv-spotlight-right"></div>

            <div class="tv-cheer-stage" onclick="event.stopPropagation();">
                <!-- Left Cheerleader -->
                ${getRealCheerleaderHtml(false, type)}

                <!-- Center Banner -->
                <div class="tv-cheer-banner ${bannerClass}">
                    <div class="flex items-center justify-center gap-2 mb-2">
                        <span class="text-[10px] sm:text-xs font-mono font-black uppercase tracking-widest text-emerald-300 bg-black/40 px-3 py-1 rounded-full border border-emerald-500/30">
                            🏏 SPORTS DYNASTY CHEER CELEBRATION
                        </span>
                    </div>
                    <h2 class="tv-cheer-title ${titleColor}">${titleText}</h2>
                    <p class="text-xs sm:text-sm font-mono font-bold text-slate-200 mt-2 tracking-wide">${subText}</p>
                    
                    <div class="mt-4 flex items-center justify-center gap-3">
                        <button onclick="document.getElementById('tv-cheerleader-overlay').remove();" class="text-slate-300 hover:text-white text-xs font-mono font-bold px-3 py-1.5 rounded-lg bg-black/60 border border-white/20 transition-all cursor-pointer">
                            ✕ Close
                        </button>
                    </div>
                </div>

                <!-- Right Cheerleader -->
                ${getRealCheerleaderHtml(true, type)}
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', overlayHtml);
    initConfettiParticles(isSix);
    playCelebrationFanfare();

    if (window._cheerTimer) clearTimeout(window._cheerTimer);
    window._cheerTimer = setTimeout(() => {
        const el = document.getElementById('tv-cheerleader-overlay');
        if (el) {
            el.classList.remove('active');
            setTimeout(() => el.remove(), 300);
        }
    }, 4500);
};

// TV STREAM OVERLAY MODE (Broadcast Studio Graphics)
// -------------------------------------------------------------

function toggleTvFullscreen() {
    const el = document.getElementById('tv-stream-mode-container');
    if (!el) return;
    el.classList.toggle('tv-stream-fullscreen');
    const isFs = el.classList.contains('tv-stream-fullscreen');
    if (isFs && el.requestFullscreen && !document.fullscreenElement) {
        el.requestFullscreen().catch(() => {});
    } else if (!isFs && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }
    const btn = document.getElementById('tv-fs-btn-text');
    if (btn) btn.textContent = isFs ? 'Exit Fullscreen' : 'OBS 1080p Mode';
    safeCreateIcons();
}

function getTvBallBadge(raw) {
    if (!raw) return '';
    const b = String(raw).trim();
    if (b === '|') {
        return '<span class="h-6 w-[2px] bg-emerald-500/40 rounded-full mx-1.5 shrink-0 self-center"></span>';
    }
    let cls = 'tv-ball-0';
    const bUpper = b.toUpperCase();
    if (b === '1') cls = 'tv-ball-1';
    else if (b === '2') cls = 'tv-ball-2';
    else if (b === '3') cls = 'tv-ball-3';
    else if (b === '4') cls = 'tv-ball-4';
    else if (b === '6') cls = 'tv-ball-6';
    else if (bUpper === 'W' || (b.toLowerCase().includes('w') && !b.toLowerCase().includes('wd'))) cls = 'tv-ball-w';
    else if (b.toLowerCase().includes('wd') || b.toLowerCase().includes('nb')) cls = 'tv-ball-extra';
    else if (b === '.' || b === '•' || b === '0') cls = 'tv-ball-0';

    return `<span class="tv-ball-pill ${cls}">${b}</span>`;
}

function renderTvStreamTab(data) {
    const container = document.getElementById('tv-stream-mode-container');
    if (!container) return;
    if (!data) {
        container.innerHTML = `
            <div class="text-center py-12 text-slate-400 text-xs">
                <i data-lucide="tv" class="w-10 h-10 mx-auto mb-2 text-rose-500 opacity-60 animate-pulse"></i>
                <p class="font-bold">Select any live match above to activate TV Stream Mode.</p>
            </div>
        `;
        safeCreateIcons();
        return;
    }

    try {
        let competitors = data.competitors;
        if (!competitors || competitors.length === 0) {
            const matchObj = (appState.matches || []).find(m => String(m.id) === String(data.matchId || data.id || appState.selectedEventId));
            if (matchObj && matchObj.competitors && matchObj.competitors.length > 0) {
                competitors = matchObj.competitors;
            }
        }

        const c1 = (competitors && competitors[0]) ? competitors[0] : { name: 'Team 1', score: '' };
        const c2 = (competitors && competitors[1]) ? competitors[1] : { name: 'Team 2', score: '' };
        const c1Name = String(c1.name || 'Team 1');
        const c2Name = String(c2.name || 'Team 2');
        const c1Abbr = String(c1.abbr || 'TM1');
        const c2Abbr = String(c2.abbr || 'TM2');

        let c1Score = String(c1.score || '');
        let c2Score = String(c2.score || '');
        if ((!c1Score || c1Score === '-') && data.innings) {
            c1Score = resolveTeamScoreFromInnings(c1, data.innings) || c1Score;
        }
        if ((!c2Score || c2Score === '-') && data.innings) {
            c2Score = resolveTeamScoreFromInnings(c2, data.innings) || c2Score;
        }

        const isLive = data.state ? (data.state.toLowerCase() === 'in' || data.state.toLowerCase() === 'live') : false;
        const isCompleted = data.state ? (data.state.toLowerCase() === 'post' || data.state.toLowerCase() === 'final' || data.state.toLowerCase() === 'completed') : false;
        const statusDetail = String(data.statusDetail || 'LIVE');

        const c1IsBatting = isTeamCurrentlyBatting(c1, data);
        const c2IsBatting = !c1IsBatting ? isTeamCurrentlyBatting(c2, data) : false;

        const crease = data.liveCrease || {};
        let currentCRR = String(data.crr || (crease ? crease.crr : '') || '');
        if (!currentCRR) {
            currentCRR = computeCRRFromScore(c2Score) || computeCRRFromScore(c1Score) || '0.00';
        }

        // Required Run Rate & Target for Limited Overs Chase
        const chaseTvInfo = extractOrComputeChaseEquation(data, c1Score, c2Score, c1, c2);
        const liveRRR = (chaseTvInfo && chaseTvInfo.rrr !== '-') ? chaseTvInfo.rrr : '';
        const targetVal = chaseTvInfo ? chaseTvInfo.target : 0;
        const runsNeeded = chaseTvInfo ? chaseTvInfo.runsNeeded : 0;
        const ballsLeft = chaseTvInfo ? chaseTvInfo.ballsLeft : 0;
        const isTestMatch = Boolean(
            data.isTestMatch || 
            (data.currentInnings && data.currentInnings.isTestMatch) || 
            (data.description && /test|4-day|5-day/i.test(data.description))
        );

        // Projected Score
        let projectedScore = '-';
        if (!isTestMatch && isLive) {
            const crrNum = parseFloat(currentCRR) || 0;
            if (crrNum > 0) {
                const maxO = (c1Score.includes('/50') || (data.description && /odi|50/i.test(data.description))) ? 50 : 20;
                projectedScore = Math.round(crrNum * maxO);
            }
        }

        // Partnership & Last Wicket
        let fowList = crease.fowList || [];
        if (fowList.length === 0 && data.innings) {
            const innKeys = Object.keys(data.innings);
            if (innKeys.length > 0) {
                const activeInn = data.innings[innKeys[innKeys.length - 1]];
                if (activeInn && Array.isArray(activeInn.fow)) fowList = activeInn.fow;
            }
        }
        const lastWkt = (fowList && fowList.length > 0) ? fowList[fowList.length - 1] : null;
        let lastWktStr = 'None';
        if (lastWkt) {
            const lwName = lastWkt.player || lastWkt.name || 'Batter';
            const lwScore = lastWkt.score || lastWkt.runs || '';
            const lwOv = lastWkt.overs ? ` (${lastWkt.overs} ov)` : '';
            lastWktStr = `${lwName} ${lwScore}${lwOv}`.trim();
        }

        const rawPship = crease.partnership || (crease.currentPartnership ? `${crease.currentPartnership.runs} runs (${crease.currentPartnership.balls || 0}b)` : '');
        const pshipStr = rawPship ? String(rawPship).replace(/\s*-\s*[A-Za-z].*$/, '').trim() : 'Unbroken';

        // Extras breakdown
        let extrasStr = '0';
        if (data.innings) {
            const innKeys = Object.keys(data.innings);
            if (innKeys.length > 0) {
                const activeInn = data.innings[innKeys[innKeys.length - 1]];
                if (activeInn && activeInn.extras) extrasStr = String(activeInn.extras);
            }
        }

        // Win Probability
        let winProbHtml = '';
        const wp = data.winProbability;
        if (wp && (wp.team1 || wp.team2)) {
            const p1 = typeof wp.team1?.probability === 'number' ? wp.team1.probability : (typeof wp.team1?.percentage === 'number' ? wp.team1.percentage : 50);
            const p2 = typeof wp.team2?.probability === 'number' ? wp.team2.probability : (typeof wp.team2?.percentage === 'number' ? wp.team2.percentage : 50);
            const t1Name = wp.team1?.shortName || wp.team1?.name || c1Abbr;
            const t2Name = wp.team2?.shortName || wp.team2?.name || c2Abbr;
            winProbHtml = `
                <div class="flex items-center gap-2 w-full max-w-xs sm:max-w-md">
                    <span class="text-[10px] font-mono font-bold text-slate-300 uppercase">${t1Name} ${p1}%</span>
                    <div class="flex-1 h-2 rounded-full overflow-hidden bg-slate-800 flex border border-emerald-500/30">
                        <div class="bg-gradient-to-r from-emerald-500 to-[#00ff88]" style="width: ${p1}%;"></div>
                        <div class="bg-gradient-to-r from-indigo-500 to-sky-400" style="width: ${p2}%;"></div>
                    </div>
                    <span class="text-[10px] font-mono font-bold text-slate-300 uppercase">${p2}% ${t2Name}</span>
                </div>
            `;
        }

        // Center situation ticker
        let centerSituation = '';
        if (isLive && chaseTvInfo && chaseTvInfo.isChase && chaseTvInfo.runsNeeded > 0) {
            centerSituation = `<span class="text-amber-300 font-mono font-black animate-pulse uppercase">2ND INNINGS • ${escapeQuotes(chaseTvInfo.chasingTeam)} NEED ${chaseTvInfo.runsNeeded} RUNS IN ${chaseTvInfo.ballsLeft} BALLS ${liveRRR ? `(RRR ${liveRRR})` : ''}</span>`;
        } else if (isLive && c1IsBatting) {
            centerSituation = `<span class="text-[#00ff88] font-mono font-black">1ST INNINGS • ${c1Abbr} BATTING (CRR ${currentCRR})</span>`;
        } else if (isLive && c2IsBatting) {
            centerSituation = `<span class="text-[#00ff88] font-mono font-black">2ND INNINGS • ${c2Abbr} BATTING (CRR ${currentCRR})</span>`;
        } else {
            centerSituation = `<span class="text-emerald-300 font-bold">${escapeQuotes(data.statusDetail || data.leadSummary || 'Live Match')}</span>`;
        }

        // Batters on Crease
        const batters = crease.batters || [];
        const bw = crease.activeBowler || crease.bowler || (crease.bowlers && crease.bowlers[0]);
        const matchKey = `${data.leagueId}_${data.matchId}`;
        const strikerIndex = typeof resolveActiveStriker === 'function' ? resolveActiveStriker(matchKey, batters, data) : 0;

        let battersCardsHtml = '';
        if (batters.length === 0) {
            battersCardsHtml = `
                <div class="col-span-1 md:col-span-2 tv-player-card p-4 flex items-center justify-center text-slate-400 text-xs italic">
                    <span>Innings break / Pre-match interval (Batters will appear when play resumes)</span>
                </div>
            `;
        } else {
            battersCardsHtml = batters.slice(0, 2).map((b, idx) => {
                const isFacing = (idx === strikerIndex);
                const sr = (b.strikeRate && b.strikeRate !== '0.00' && b.strikeRate !== 0) ? b.strikeRate : computeStrikeRate(b.runs, b.balls);
                const cleanBName = b.name.replace(/\s*\([^\)]*\)/g, '').trim();
                const photoUrl = b.headshot || 'https://a.espncdn.com/i/headshots/cricket/players/default-player-logo-500.png';

                return `
                    <div class="tv-player-card p-3 sm:p-4 flex flex-col justify-between ${isFacing ? 'strike-active' : ''} relative overflow-hidden group">
                        <div class="flex items-center justify-between gap-2 border-b border-emerald-500/20 pb-2 mb-2">
                            <div class="flex items-center gap-1.5 font-mono">
                                <span class="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${isFacing ? 'bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/50' : 'bg-slate-700/60 text-slate-300'}">BATTER</span>
                                ${isFacing ? `
                                    <span class="flex items-center gap-1 text-[9px] font-black text-[#00ff88] bg-[#00ff88]/20 px-1.5 py-0.5 rounded border border-[#00ff88]/40 animate-pulse">
                                        <i data-lucide="zap" class="w-3 h-3 text-[#00ff88]"></i> STRIKE
                                    </span>
                                ` : ''}
                            </div>
                            <span class="text-[10px] font-mono text-emerald-400 font-bold">SR: ${sr}</span>
                        </div>

                        <div class="flex items-center gap-3">
                            <div class="relative shrink-0">
                                <div class="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden ${isFacing ? 'ring-2 ring-[#00ff88] shadow-[0_0_16px_rgba(0,255,136,0.6)]' : 'ring-1 ring-slate-600'} bg-dark-900 flex items-center justify-center">
                                    <img src="${photoUrl}" alt="${cleanBName}" class="w-full h-full object-cover object-top" onerror="this.src='https://a.espncdn.com/i/headshots/cricket/players/default-player-logo-500.png';">
                                </div>
                                ${isFacing ? '<span class="absolute -bottom-1 -right-1 text-xs">🏏</span>' : ''}
                            </div>
                            <div class="min-w-0 flex-1">
                                <h4 class="font-black text-sm sm:text-base text-white truncate tracking-tight">${cleanBName}</h4>
                                <div class="flex items-baseline gap-1 mt-0.5">
                                    <span class="text-3xl sm:text-4xl font-black font-mono ${isFacing ? 'text-[#00ff88] drop-shadow-[0_0_12px_rgba(0,255,136,0.5)]' : 'text-white'} leading-none">${b.runs}</span>
                                    <span class="text-xs sm:text-sm font-mono text-slate-400 font-bold">(${b.balls}b)</span>
                                </div>
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-emerald-500/20 text-center font-mono">
                            <div class="bg-black/30 rounded-lg py-1 px-2 border border-emerald-500/10">
                                <span class="text-[9px] text-slate-400 uppercase tracking-widest block font-bold">Fours (4s)</span>
                                <span class="text-xs sm:text-sm font-black text-emerald-400">${b.fours || 0}</span>
                            </div>
                            <div class="bg-black/30 rounded-lg py-1 px-2 border border-emerald-500/10">
                                <span class="text-[9px] text-slate-400 uppercase tracking-widest block font-bold">Sixes (6s)</span>
                                <span class="text-xs sm:text-sm font-black text-amber-400">${b.sixes || 0}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Active Bowler Card
        let bowlerCardHtml = '';
        if (!bw) {
            bowlerCardHtml = `
                <div class="tv-player-card p-4 flex items-center justify-center text-slate-400 text-xs italic">
                    <span>No active bowler registered currently.</span>
                </div>
            `;
        } else {
            const cleanBwName = bw.name.replace(/\s*\([^\)]*\)/g, '').trim();
            const bwPhotoUrl = bw.headshot || 'https://a.espncdn.com/i/headshots/cricket/players/default-player-logo-500.png';
            const econ = (bw.economy && bw.economy !== '0.00' && bw.economy !== '0') ? bw.economy : computeEconomy(bw.overs, bw.runs);

            bowlerCardHtml = `
                <div class="tv-player-card bowler-active p-3 sm:p-4 flex flex-col justify-between relative overflow-hidden">
                    <div class="flex items-center justify-between gap-2 border-b border-amber-500/20 pb-2 mb-2">
                        <div class="flex items-center gap-1.5 font-mono">
                            <span class="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/50">BOWLER</span>
                            <span class="flex items-center gap-1 text-[9px] font-black text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-500/40">
                                <i data-lucide="circle-dot" class="w-3 h-3 text-amber-400 animate-spin"></i> ACTIVE
                            </span>
                        </div>
                        <span class="text-[10px] font-mono text-amber-300 font-bold">ECON: ${econ}</span>
                    </div>

                    <div class="flex items-center gap-3">
                        <div class="relative shrink-0">
                            <div class="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden ring-2 ring-amber-400 shadow-[0_0_16px_rgba(245,158,11,0.5)] bg-dark-900 flex items-center justify-center">
                                <img src="${bwPhotoUrl}" alt="${cleanBwName}" class="w-full h-full object-cover object-top" onerror="this.src='https://a.espncdn.com/i/headshots/cricket/players/default-player-logo-500.png';">
                            </div>
                            <span class="absolute -bottom-1 -right-1 text-xs">🔴</span>
                        </div>
                        <div class="min-w-0 flex-1">
                            <h4 class="font-black text-sm sm:text-base text-white truncate tracking-tight">${cleanBwName}</h4>
                            <div class="flex items-baseline gap-1.5 mt-0.5">
                                <span class="text-3xl sm:text-4xl font-black font-mono text-amber-400 drop-shadow-[0_0_12px_rgba(245,158,11,0.5)] leading-none">${bw.wickets}-${bw.runs}</span>
                                <span class="text-xs sm:text-sm font-mono text-amber-200/80 font-bold">(${bw.overs} ov)</span>
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-3 gap-1.5 mt-3 pt-2 border-t border-amber-500/20 text-center font-mono">
                        <div class="bg-black/30 rounded-lg py-1 px-1 border border-amber-500/10">
                            <span class="text-[8px] text-slate-400 uppercase tracking-widest block font-bold">Maidens</span>
                            <span class="text-xs font-black text-slate-200">${bw.maidens || 0}</span>
                        </div>
                        <div class="bg-black/30 rounded-lg py-1 px-1 border border-amber-500/10">
                            <span class="text-[8px] text-slate-400 uppercase tracking-widest block font-bold">Runs</span>
                            <span class="text-xs font-black text-rose-400">${bw.runs}</span>
                        </div>
                        <div class="bg-black/30 rounded-lg py-1 px-1 border border-amber-500/10">
                            <span class="text-[8px] text-slate-400 uppercase tracking-widest block font-bold">Wkts</span>
                            <span class="text-xs font-black text-amber-400">${bw.wickets}</span>
                        </div>
                    </div>
                </div>
            `;
        }

        // Recent Deliveries Timeline
        const recentBallsElements = [];
        const recentOvers = crease.recentOvers || data.recentOvers || [];
        if (recentOvers && recentOvers.length > 0) {
            recentOvers.slice(-4).forEach((o, oIdx) => {
                if (oIdx > 0) {
                    recentBallsElements.push('<span class="h-6 w-[2px] bg-emerald-500/40 rounded-full mx-1.5 shrink-0 self-center"></span>');
                }
                (o.balls || []).forEach(ball => {
                    recentBallsElements.push(getTvBallBadge(ball.symbol || ball.text || ball.shortText));
                });
            });
        } else {
            const recentBalls = crease.recentDeliveries || [];
            if (recentBalls.length > 0) {
                recentBalls.slice(-24).forEach(b => {
                    recentBallsElements.push(getTvBallBadge(b));
                });
            } else if (Array.isArray(data.commentary) && data.commentary.length > 0) {
                data.commentary.slice(0, 12).reverse().forEach(comm => {
                    const text = String(comm.text || comm.event || '').toLowerCase();
                    let sym = '0';
                    if (text.includes('six') || text.includes('6 runs')) sym = '6';
                    else if (text.includes('four') || text.includes('4 runs')) sym = '4';
                    else if (text.includes('out') || text.includes('wicket')) sym = 'W';
                    else if (text.includes('wide')) sym = 'Wd';
                    else if (text.includes('no ball')) sym = 'Nb';
                    else if (text.includes('1 run')) sym = '1';
                    else if (text.includes('2 runs')) sym = '2';
                    else if (text.includes('3 runs')) sym = '3';
                    recentBallsElements.push(getTvBallBadge(sym));
                });
            }
        }

        const recentBallsHtml = recentBallsElements.length > 0 ? recentBallsElements.join('') : '<span class="text-slate-400 text-xs italic">Ball-by-ball updates will appear here as each ball is bowled.</span>';
        const last5OversText = computeLast5Overs(crease.recentDeliveries, crease.last10Overs, currentCRR, fowList, c1Score + ' ' + c2Score);
        const tossText = data.toss ? String(data.toss) : (data.description || '');

        container.innerHTML = `
            <div class="tv-broadcast-wrapper p-3 sm:p-5 text-white flex flex-col space-y-3.5">
                <!-- TOP BROADCAST SCOREBAR -->
                <div class="tv-header-ticker p-3 sm:p-4 rounded-xl flex flex-wrap items-center justify-between gap-3">
                    <!-- Team 1 Box -->
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-slate-900 border border-emerald-500/40 p-1 flex items-center justify-center shrink-0 shadow-md">
                            ${renderTeamLogo(c1Name, c1.logo, 'w-8 h-8 sm:w-10 sm:h-10')}
                        </div>
                        <div>
                            <span class="text-xs sm:text-sm font-black uppercase tracking-wider block text-white">${c1Name}</span>
                            <div class="flex items-baseline gap-1.5">
                                <span class="font-mono font-black text-xl sm:text-2xl md:text-3xl ${c1IsBatting ? 'text-[#00ff88] drop-shadow-[0_0_10px_rgba(0,255,136,0.5)]' : 'text-slate-200'}">${c1Score || 'Yet to bat'}</span>
                            </div>
                            ${c1IsBatting && chaseTvInfo && chaseTvInfo.isChase && chaseTvInfo.runsNeeded > 0 ? `
                                <div class="text-[10px] sm:text-[11px] font-mono font-black text-amber-300 drop-shadow-xs">Need ${chaseTvInfo.runsNeeded} off ${chaseTvInfo.ballsLeft}b</div>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Center Match Emblem & Situation -->
                    <div class="flex flex-col items-center justify-center text-center px-2">
                        <div class="flex items-center gap-2 mb-0.5">
                            <span class="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                            <span class="text-[10px] font-mono font-black text-rose-400 uppercase tracking-widest">LIVE STREAM</span>
                            <span class="text-slate-500">•</span>
                            <span class="text-[10px] font-mono font-bold text-emerald-400 uppercase">SPORTS DYNASTY TV</span>
                        </div>
                        <div class="text-xs sm:text-sm font-mono font-black">${centerSituation}</div>
                    </div>

                    <!-- Team 2 Box -->
                    <div class="flex items-center gap-3 text-right">
                        <div>
                            <span class="text-xs sm:text-sm font-black uppercase tracking-wider block text-white">${c2Name}</span>
                            <div class="flex items-baseline justify-end gap-1.5">
                                <span class="font-mono font-black text-xl sm:text-2xl md:text-3xl ${c2IsBatting ? 'text-[#00ff88] drop-shadow-[0_0_10px_rgba(0,255,136,0.5)]' : 'text-slate-200'}">${c2Score || 'Yet to bat'}</span>
                            </div>
                            ${c2IsBatting && chaseTvInfo && chaseTvInfo.isChase && chaseTvInfo.runsNeeded > 0 ? `
                                <div class="text-[10px] sm:text-[11px] font-mono font-black text-amber-300 drop-shadow-xs">Need ${chaseTvInfo.runsNeeded} off ${chaseTvInfo.ballsLeft}b</div>
                            ` : ''}
                        </div>
                        <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-slate-900 border border-emerald-500/40 p-1 flex items-center justify-center shrink-0 shadow-md">
                            ${renderTeamLogo(c2Name, c2.logo, 'w-8 h-8 sm:w-10 sm:h-10')}
                        </div>
                    </div>
                </div>

                <!-- TELEMETRY INSIGHTS RIBBON 1 -->
                <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <div class="tv-telemetry-badge p-2 text-center">
                        <span class="text-[9px] font-mono text-slate-400 uppercase block font-bold">CRR</span>
                        <span class="font-mono font-black text-sm sm:text-base text-[#00ff88]">${currentCRR}</span>
                    </div>
                    <div class="tv-telemetry-badge p-2 text-center">
                        <span class="text-[9px] font-mono text-slate-400 uppercase block font-bold">P.SHIP</span>
                        <span class="font-mono font-black text-xs sm:text-sm text-sky-400 truncate block">${pshipStr}</span>
                    </div>
                    <div class="tv-telemetry-badge p-2 text-center">
                        <span class="text-[9px] font-mono text-slate-400 uppercase block font-bold">RRR</span>
                        <span class="font-mono font-black text-sm sm:text-base ${liveRRR ? 'text-amber-400' : 'text-slate-500'}">${liveRRR || '-'}</span>
                    </div>
                    <div class="tv-telemetry-badge p-2 text-center">
                        ${chaseTvInfo && chaseTvInfo.isChase ? `
                            <span class="text-[9px] font-mono text-amber-300 uppercase block font-black">TO WIN (REQ)</span>
                            <span class="font-mono font-black text-xs sm:text-sm text-emerald-400 truncate block" title="${escapeQuotes(chaseTvInfo.chasingTeam)} need ${chaseTvInfo.runsNeeded} runs in ${chaseTvInfo.ballsLeft} balls">
                                ${chaseTvInfo.shortEquation || (chaseTvInfo.runsNeeded + ' runs')}
                            </span>
                        ` : `
                            <span class="text-[9px] font-mono text-slate-400 uppercase block font-bold">PR. SCORE</span>
                            <span class="font-mono font-black text-sm sm:text-base text-purple-400">${projectedScore}</span>
                        `}
                    </div>
                    <div class="tv-telemetry-badge p-2 text-center col-span-2 sm:col-span-1">
                        <span class="text-[9px] font-mono text-slate-400 uppercase block font-bold">LAST WICKET</span>
                        <span class="font-mono font-black text-[11px] sm:text-xs text-rose-400 truncate block" title="${escapeQuotes(lastWktStr)}">${lastWktStr}</span>
                    </div>
                </div>

                <!-- TELEMETRY INSIGHTS RIBBON 2 (Win Probability & Extras) -->
                <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-950/60 border border-emerald-500/20 text-xs">
                    <div class="flex items-center gap-2">
                        <span class="font-mono font-black text-amber-400 uppercase text-[10px]">EXTRAS:</span>
                        <span class="font-mono font-bold text-slate-200 text-xs">${extrasStr}</span>
                        ${tossText ? `<span class="text-slate-500 hidden sm:inline">•</span><span class="text-emerald-400/90 font-medium hidden sm:inline truncate max-w-sm">${escapeQuotes(tossText)}</span>` : ''}
                    </div>
                    ${winProbHtml}
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <button onclick="window.triggerCheerleaderCelebration('four')" class="tv-cheer-btn tv-cheer-btn-four px-2.5 py-1 rounded-lg font-mono text-[11px] font-black flex items-center gap-1 transition active:scale-95 cursor-pointer shadow-xs" title="Cheerleader Boundary 4 Celebration">
                            <span>💃</span>
                            <span>4 CHEER</span>
                        </button>
                        <button onclick="window.triggerCheerleaderCelebration('six')" class="tv-cheer-btn tv-cheer-btn-six px-2.5 py-1 rounded-lg font-mono text-[11px] font-black flex items-center gap-1 transition active:scale-95 cursor-pointer shadow-xs" title="Cheerleader Maximum 6 Celebration">
                            <span>💃</span>
                            <span>6 CHEER</span>
                        </button>
                        <button onclick="toggleTvFullscreen()" class="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 border border-emerald-500/40 font-mono text-[11px] font-black flex items-center gap-1 transition active:scale-95 cursor-pointer shadow-xs" title="Toggle 1080p Fullscreen for OBS Stream">
                            <i data-lucide="maximize" class="w-3.5 h-3.5"></i>
                            <span id="tv-fs-btn-text">OBS 1080p Mode</span>
                        </button>
                    </div>
                </div>

                <!-- CENTER STADIUM TURF ATMOSPHERE -->
                <div class="tv-pitch-backdrop rounded-xl border border-emerald-500/30 p-4 sm:p-6 text-center relative overflow-hidden flex flex-col items-center justify-center min-h-[90px]">
                    <div class="relative z-10 flex flex-col items-center">
                        <div class="flex items-center gap-2 text-emerald-400 font-mono font-black tracking-widest text-xs uppercase mb-1">
                            <i data-lucide="award" class="w-4 h-4 text-amber-400"></i>
                            <span>SPORTS DYNASTY BROADCAST ENGINE</span>
                        </div>
                        <div class="text-xs text-slate-300 font-medium max-w-xl truncate">${escapeQuotes(data.description || data.title || '')}</div>
                    </div>
                    <div class="absolute inset-0 bg-gradient-to-t from-dark-950/80 via-transparent to-transparent pointer-events-none"></div>
                </div>

                <!-- BATTERS & BOWLER CARDS ARENA -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                    ${battersCardsHtml}
                    ${bowlerCardHtml}
                </div>

                <!-- BALL-BY-BALL TIMELINE STRIP -->
                <div class="p-3 rounded-xl bg-slate-950/80 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-3">
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] font-mono font-black text-[#00ff88] uppercase tracking-wider flex items-center gap-1">
                            <i data-lucide="activity" class="w-3.5 h-3.5 text-[#00ff88]"></i> RECENT BALLS:
                        </span>
                        <div class="flex items-center gap-1.5 overflow-x-auto py-1 custom-scrollbar">
                            ${recentBallsHtml}
                        </div>
                    </div>
                    <div class="text-[11px] font-mono font-bold text-emerald-300 shrink-0 bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                        ${last5OversText ? `Last 5 Overs: <span class="text-white font-black">${last5OversText}</span>` : 'Live Cricket Telemetry Synced'}
                    </div>
                </div>
            </div>
        `;

        // Auto-Cheerleader celebration check on live score updates
        try {
            const recentOversList = crease.recentOvers || data.recentOvers || [];
            if (recentOversList.length > 0) {
                const latestOver = recentOversList[recentOversList.length - 1];
                const balls = latestOver.balls || [];
                if (balls.length > 0) {
                    const latestBall = balls[balls.length - 1];
                    const ballSym = String(latestBall.symbol || latestBall.text || '').trim();
                    const ballSig = `${data.id || data.eventId || 'match'}_${latestOver.overNumber}_b${latestBall.ballNumber || balls.length}_${ballSym}`;
                    
                    if (window._lastCelebratedBallSig === undefined) {
                        window._lastCelebratedBallSig = ballSig;
                    } else if (window._lastCelebratedBallSig !== ballSig) {
                        window._lastCelebratedBallSig = ballSig;
                        if (ballSym === '4') {
                            window.triggerCheerleaderCelebration('four');
                        } else if (ballSym === '6') {
                            window.triggerCheerleaderCelebration('six');
                        }
                    }
                }
            }
        } catch(ce) {
            console.warn('Cheer auto check error:', ce);
        }

        safeCreateIcons();
    } catch(err) {
        console.error("renderTvStreamTab error:", err);
    }
}


// Squads & Match Info Tabs
// -------------------------------------------------------------

function renderSquadsTab(data) {
    const container = document.getElementById('squads-container');
    if (!container) return;

    const squads = data.squads || [];
    if (squads.length === 0) {
        container.innerHTML = `<div class="col-span-2 text-center py-8 text-slate-400 text-xs">Squad information not available for this match.</div>`;
        return;
    }

    container.innerHTML = squads.map(sq => {
        const playingXI = (sq.playingXI && sq.playingXI.length > 0) ? sq.playingXI : (sq.players || []).slice(0, 11);
        const bench = (sq.bench && sq.bench.length > 0) ? sq.bench : (sq.fullSquad ? sq.fullSquad.slice(11) : (sq.players || []).slice(11));
        const totalCount = sq.fullSquad ? sq.fullSquad.length : (playingXI.length + bench.length);

        return `
            <div class="bg-white dark:bg-dark-900/90 p-4 rounded-xl border border-slate-200 dark:border-gray-800 space-y-4 shadow-xs">
                <!-- Team Header -->
                <div class="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-gray-800">
                    <div class="flex items-center space-x-3">
                        ${sq.teamLogo ? `<img src="${sq.teamLogo}" class="w-8 h-8 object-contain rounded-lg p-0.5 bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-gray-700" onerror="this.style.display='none'">` : ''}
                        <div>
                            <h4 class="font-black text-slate-900 dark:text-white text-sm sm:text-base">${sq.teamName}</h4>
                            <span class="text-[10px] text-slate-500 dark:text-gray-400 font-mono">Squad: ${totalCount} Players</span>
                        </div>
                    </div>
                    <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        Playing 11
                    </span>
                </div>

                <!-- PLAYING XI SECTION -->
                <div class="space-y-2">
                    <div class="flex items-center justify-between">
                        <h5 class="text-xs font-black font-mono uppercase tracking-wider text-emerald-600 dark:text-[#00ff88] flex items-center gap-1.5">
                            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Playing XI (${playingXI.length})
                        </h5>
                        <span class="text-[10px] font-mono text-slate-400">Match XI</span>
                    </div>
                    <div class="space-y-1.5 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar text-xs">
                        ${(() => {
                            let teamWkFound = false;
                            return playingXI.map(p => {
                                const isC = Boolean(p.captain || p.isCaptain || /\(c\)/i.test(p.name) || /\(c\s*&/i.test(p.name));
                                let isWk = Boolean(p.wicketKeeper || p.isWicketKeeper || /\(wk\)/i.test(p.name) || /&\s*wk\)/i.test(p.name));
                                if (isWk) {
                                    if (!teamWkFound) {
                                        teamWkFound = true;
                                    } else {
                                        isWk = false;
                                    }
                                }
                                const cleanPName = p.name.replace(/\s*\([^\)]*\)/g, '').trim();
                                let tag = '';
                                if (isC && isWk) {
                                    tag = '<span class="text-[9.5px] px-1.5 py-0.2 rounded font-black font-mono bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0 select-none">(c & wk)</span>';
                                } else if (isC) {
                                    tag = '<span class="text-[9.5px] px-1.5 py-0.2 rounded font-black font-mono bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0 select-none">(c)</span>';
                                } else if (isWk) {
                                    tag = '<span class="text-[9.5px] px-1.5 py-0.2 rounded font-black font-mono bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 shrink-0 select-none">(wk)</span>';
                                }
                                return `
                                <div onclick="openPlayerProfile('${p.id || ''}', '${cleanPName.replace(/'/g, "\\'")}')" 
                                     class="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-dark-800/70 border border-slate-200/90 dark:border-gray-800 hover:border-emerald-500 dark:hover:border-emerald-500/70 transition cursor-pointer group/sq" title="View Profile & Stats of ${cleanPName}">
                                    <div class="flex items-center space-x-2.5 truncate">
                                        ${renderPlayerAvatar(cleanPName, p.headshot, 'w-6 h-6 rounded-full ring-1 ring-slate-200 dark:ring-gray-700 shrink-0')}
                                        <div class="flex items-center gap-1.5 truncate">
                                            <span class="font-bold text-slate-900 dark:text-white group-hover/sq:text-[#00ff88] group-hover/sq:underline truncate text-xs">${cleanPName}</span>
                                            ${tag}
                                        </div>
                                    </div>
                                    <span class="text-[10px] text-slate-500 dark:text-gray-400 group-hover/sq:text-emerald-400 font-mono font-semibold shrink-0 ml-2">${p.role || 'Player'}</span>
                                </div>
                            `;
                            }).join('');
                        })()}
                    </div>
                </div>

                <!-- BENCH SECTION (Cricbuzz Style) -->
                ${bench.length > 0 ? `
                    <div class="space-y-2 pt-3 border-t border-slate-200 dark:border-gray-800">
                        <div class="flex items-center justify-between">
                            <h5 class="text-xs font-black font-mono uppercase tracking-wider text-slate-600 dark:text-gray-300 flex items-center gap-1.5">
                                <i data-lucide="armchair" class="w-3.5 h-3.5 text-slate-400"></i>
                                On the Bench (${bench.length})
                            </h5>
                            <span class="text-[10px] font-mono text-slate-400">Rest of Squad</span>
                        </div>
                        <div class="space-y-1.5 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar text-xs">
                            ${bench.map(p => {
                                const isC = Boolean(p.captain || p.isCaptain || /\(c\)/i.test(p.name));
                                const isWk = Boolean(p.wicketKeeper || p.isWicketKeeper || /\(wk\)/i.test(p.name));
                                const cleanPName = p.name.replace(/\s*\([^\)]*\)/g, '').trim();
                                let tag = '';
                                if (isC && isWk) {
                                    tag = '<span class="text-[9.5px] px-1.5 py-0.2 rounded font-black font-mono bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0 select-none">(c & wk)</span>';
                                } else if (isC) {
                                    tag = '<span class="text-[9.5px] px-1.5 py-0.2 rounded font-black font-mono bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0 select-none">(c)</span>';
                                } else if (isWk) {
                                    tag = '<span class="text-[9.5px] px-1.5 py-0.2 rounded font-black font-mono bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 shrink-0 select-none">(wk)</span>';
                                }
                                return `
                                    <div onclick="openPlayerProfile('${p.id || ''}', '${cleanPName.replace(/'/g, "\\'")}')" 
                                         class="flex items-center justify-between p-2 rounded-lg bg-slate-50/60 dark:bg-dark-800/40 border border-slate-100 dark:border-gray-800/60 hover:border-slate-300 dark:hover:border-gray-700 transition cursor-pointer group/sq" title="View Profile & Stats of ${cleanPName}">
                                        <div class="flex items-center space-x-2.5 truncate">
                                            ${renderPlayerAvatar(cleanPName, p.headshot, 'w-6 h-6 rounded-full ring-1 ring-slate-200 dark:ring-gray-700 shrink-0 opacity-80')}
                                            <div class="flex items-center gap-1.5 truncate">
                                                <span class="font-semibold text-slate-700 dark:text-gray-300 group-hover/sq:text-emerald-500 truncate text-xs">${cleanPName}</span>
                                                ${tag}
                                            </div>
                                        </div>
                                        <span class="text-[10px] text-slate-400 font-mono shrink-0 ml-2">${p.role || 'Player'}</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    safeCreateIcons();
}

function renderMatchInfoTab(data) {
    const container = document.getElementById('match-info-content');
    if (!container) return;

    const potm = data.playerOfTheMatch;
    const pots = data.playerOfTheSeries;

    container.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            ${potm ? `
                <div class="col-span-1 sm:col-span-2 p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent dark:from-amber-950/40 dark:via-dark-900/80 dark:to-dark-900 border border-amber-500/40 shadow-xs flex items-center justify-between gap-4">
                    <div class="flex items-center gap-3.5 min-w-0">
                        <div class="relative shrink-0">
                            <div class="w-13 h-13 sm:w-14 sm:h-14 rounded-full overflow-hidden border-2 border-amber-400 shadow-md bg-white dark:bg-dark-800 flex items-center justify-center">
                                <img src="${potm.headshot || 'https://a.espncdn.com/i/headshots/cricket/players/default-player-logo-500.png'}" 
                                     alt="${escapeQuotes(potm.name)}" 
                                     class="w-full h-full object-cover object-top" 
                                     onerror="this.src='https://a.espncdn.com/i/headshots/cricket/players/default-player-logo-500.png';">
                            </div>
                            <span class="absolute -bottom-1 -right-1 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] sm:text-xs shadow-sm font-bold">🏆</span>
                        </div>
                        <div class="min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="text-xs font-mono font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1">
                                    <i data-lucide="award" class="w-4 h-4 text-amber-500"></i>
                                    <span>${escapeQuotes(potm.title || 'Player of the Match')}</span>
                                </span>
                                ${potm.teamName ? `<span class="text-xs text-slate-500 dark:text-gray-400 font-medium truncate">• ${escapeQuotes(potm.teamName)}</span>` : ''}
                            </div>
                            <div class="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2.5 mt-0.5 truncate">
                                <span class="truncate">${escapeQuotes(potm.name)}</span>
                                ${potm.performance ? `<span class="text-xs font-mono font-bold px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 shrink-0">${escapeQuotes(potm.performance)}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    ${potm.teamLogo ? `
                        <div class="shrink-0 hidden sm:block">
                            <img src="${potm.teamLogo}" alt="" class="w-11 h-11 sm:w-12 sm:h-12 object-contain rounded-xl p-1 bg-white/80 dark:bg-dark-800 border border-slate-200 dark:border-gray-700 shadow-xs" onerror="this.style.display='none'">
                        </div>
                    ` : ''}
                </div>
            ` : ''}
            ${pots ? `
                <div class="col-span-1 sm:col-span-2 p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-purple-500/15 via-purple-500/5 to-transparent dark:from-purple-950/40 dark:via-dark-900/80 dark:to-dark-900 border border-purple-500/40 shadow-xs flex items-center justify-between gap-4">
                    <div class="flex items-center gap-3.5 min-w-0">
                        <div class="relative shrink-0">
                            <div class="w-13 h-13 sm:w-14 sm:h-14 rounded-full overflow-hidden border-2 border-purple-400 shadow-md bg-white dark:bg-dark-800 flex items-center justify-center">
                                <img src="${pots.headshot || 'https://a.espncdn.com/i/headshots/cricket/players/default-player-logo-500.png'}" 
                                     alt="${escapeQuotes(pots.name)}" 
                                     class="w-full h-full object-cover object-top" 
                                     onerror="this.src='https://a.espncdn.com/i/headshots/cricket/players/default-player-logo-500.png';">
                            </div>
                            <span class="absolute -bottom-1 -right-1 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px] sm:text-xs shadow-sm font-bold">🎖️</span>
                        </div>
                        <div class="min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="text-xs font-mono font-black uppercase tracking-wider text-purple-700 dark:text-purple-400 flex items-center gap-1">
                                    <i data-lucide="award" class="w-4 h-4 text-purple-500"></i>
                                    <span>${escapeQuotes(pots.title || 'Player of the Series')}</span>
                                </span>
                                ${pots.teamName ? `<span class="text-xs text-slate-500 dark:text-gray-400 font-medium truncate">• ${escapeQuotes(pots.teamName)}</span>` : ''}
                            </div>
                            <div class="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2.5 mt-0.5 truncate">
                                <span class="truncate">${escapeQuotes(pots.name)}</span>
                                ${pots.performance ? `<span class="text-xs font-mono font-bold px-2.5 py-0.5 rounded-md bg-purple-500/20 text-purple-800 dark:text-purple-300 border border-purple-500/30 shrink-0">${escapeQuotes(pots.performance)}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    ${pots.teamLogo ? `
                        <div class="shrink-0 hidden sm:block">
                            <img src="${pots.teamLogo}" alt="" class="w-11 h-11 sm:w-12 sm:h-12 object-contain rounded-xl p-1 bg-white/80 dark:bg-dark-800 border border-slate-200 dark:border-gray-700 shadow-xs" onerror="this.style.display='none'">
                        </div>
                    ` : ''}
                </div>
            ` : ''}
            <div class="bg-white dark:bg-dark-800/80 p-3.5 rounded-xl border border-slate-200 dark:border-gray-800">
                <span class="text-slate-500 dark:text-gray-400 font-medium block mb-1">Match Title</span>
                <span class="font-bold text-slate-800 dark:text-gray-200">${data.title}</span>
            </div>
            <div class="bg-white dark:bg-dark-800/80 p-3.5 rounded-xl border border-slate-200 dark:border-gray-800">
                <span class="text-slate-500 dark:text-gray-400 font-medium block mb-1">Venue & Location</span>
                <span class="font-bold text-slate-800 dark:text-gray-200">${data.location || 'Stadium'} ${data.city ? `(${data.city})` : ''}</span>
            </div>
            <div class="bg-white dark:bg-dark-800/80 p-3.5 rounded-xl border border-slate-200 dark:border-gray-800">
                <span class="text-slate-500 dark:text-gray-400 font-medium block mb-1">Match Description</span>
                <span class="text-slate-700 dark:text-gray-300">${data.description}</span>
            </div>
            <div class="bg-white dark:bg-dark-800/80 p-3.5 rounded-xl border border-slate-200 dark:border-gray-800">
                <span class="text-slate-500 dark:text-gray-400 font-medium block mb-1">Current Situation</span>
                <span class="font-bold text-[#059669] dark:text-emerald-400 uppercase font-sans">${data.leadSummary || data.statusDetail}</span>
            </div>
        </div>
    `;
    safeCreateIcons();
}

// -------------------------------------------------------------
// Per-Series Tournament Points Table Engine
// -------------------------------------------------------------


async function renderMatchPointsTableTab(matchData) {
    const container = document.getElementById('match-points-table-content');
    if (!container) return;

    // Guard: Bilateral series do not have tournament points tables
    if (isBilateralSeries(matchData)) {
        container.innerHTML = `
            <div class="hud-glass-panel rounded-2xl p-8 border border-slate-200/80 dark:border-gray-800 text-center space-y-3">
                <div class="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
                    <i data-lucide="trophy" class="w-6 h-6"></i>
                </div>
                <h4 class="font-black text-slate-900 dark:text-white text-base">Points Table Not Applicable</h4>
                <p class="text-xs text-slate-500 dark:text-gray-400 max-w-md mx-auto">
                    This is a bilateral series between two teams. Points tables are only maintained for multi-team tournaments (3 or more teams).
                </p>
            </div>
        `;
        safeCreateIcons();
        return;
    }

    const leagueName = String(matchData.leagueName || matchData.description || matchData.seriesTitle || '').toLowerCase();
    const c1Name = String((matchData.competitors && matchData.competitors[0]?.name) || '').toLowerCase();
    const c2Name = String((matchData.competitors && matchData.competitors[1]?.name) || '').toLowerCase();

    // 1. Direct official tournament standings from matchData (ESPN provided)
    if (matchData.standings && matchData.standings.length > 0) {
        const tournamentTitle = matchData.leagueName || (matchData.description ? matchData.description.split(',')[0].trim() : "Tournament Standings");
        const activeSeries = {
            id: 'match-standings',
            title: tournamentTitle,
            type: 'Tournament Standings',
            status: 'Live Standings',
            dates: matchData.date || '2026',
            groups: matchData.standings,
            standings: matchData.standings[0]?.teams || []
        };
        renderTournamentPointsTableHTML(container, activeSeries, c1Name, c2Name, matchData);
        return;
    }

    // 2. Fetch featured series list if not already cached
    if (!appState.seriesData || appState.seriesData.length === 0) {
        container.innerHTML = `
            <div class="p-8 text-center text-slate-400">
                <i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500"></i>
                <p class="text-xs font-bold">Loading official tournament points table...</p>
            </div>
        `;
        try {
            const resp = await fetch('/api/series');
            if (resp.ok) {
                const json = await resp.json();
                appState.seriesData = json.series || [];
            }
        } catch(e) {
            console.warn("Series fetch error:", e);
        }
    }

    const seriesList = appState.seriesData || [];

    // Match series against title or keywords ONLY (Do NOT match on single team names)
    let matchedSeries = seriesList.find(s => {
        if (!s.standings || s.standings.length === 0) return false;
        const sTitle = (s.title || '').toLowerCase();
        if (leagueName && (leagueName.includes(sTitle) || sTitle.includes(leagueName))) return true;
        const keywords = s.keywords || [sTitle];
        return keywords.some(kw => {
            const lk = kw.toLowerCase();
            return leagueName.includes(lk) || lk.includes(leagueName);
        });
    });

    if (!matchedSeries && c1Name && c2Name) {
        // Fallback: match ONLY if BOTH competitors are present in the same standings table
        matchedSeries = seriesList.find(s => {
            if (!s.standings || s.standings.length === 0) return false;
            const allTeams = (s.standings || []).map(t => String(t.team || '').toLowerCase());
            return allTeams.some(t => t.includes(c1Name) || c1Name.includes(t)) &&
                   allTeams.some(t => t.includes(c2Name) || c2Name.includes(t));
        });
    }

    // STRICT CHECK: If NO series matched, DO NOT SHOW NAMIBIA OR UNRELATED TOURNAMENTS!
    if (!matchedSeries) {
        container.innerHTML = `
            <div class="hud-glass-panel rounded-2xl p-8 border border-slate-200/80 dark:border-gray-800 text-center space-y-3">
                <div class="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
                    <i data-lucide="trophy" class="w-6 h-6"></i>
                </div>
                <h4 class="font-black text-slate-900 dark:text-white text-base">Points Table Not Applicable</h4>
                <p class="text-xs text-slate-500 dark:text-gray-400 max-w-md mx-auto">
                    Points tables are only available for multi-team tournaments (3 or more teams). Bilateral series and single matches do not have tournament standings.
                </p>
            </div>
        `;
        safeCreateIcons();
        return;
    }

    renderTournamentPointsTableHTML(container, matchedSeries, c1Name, c2Name, matchData);
}

function renderTournamentPointsTableHTML(container, activeSeries, c1Name = '', c2Name = '', matchData = null, selectedGroupIndex = -1) {
    if (!container || !activeSeries) return;

    // Support multi-group tournaments (e.g. Group A & Group B in Women's Asia Cup)
    const groups = activeSeries.groups || [];
    let currentTeams = activeSeries.standings || [];
    let activeGroupName = '';

    if (groups.length > 0) {
        if (selectedGroupIndex < 0 || selectedGroupIndex >= groups.length) {
            // Automatically select group containing the current match's teams
            selectedGroupIndex = groups.findIndex(g => {
                const gTeams = (g.teams || []).map(t => String(t.team || '').toLowerCase());
                return gTeams.some(t => (c1Name && t.includes(c1Name)) || (c2Name && t.includes(c2Name)));
            });
            if (selectedGroupIndex < 0) selectedGroupIndex = 0;
        }
        currentTeams = groups[selectedGroupIndex]?.teams || [];
        activeGroupName = groups[selectedGroupIndex]?.group || groups[selectedGroupIndex]?.name || `Group ${selectedGroupIndex + 1}`;
    }

    const hasStandings = currentTeams && currentTeams.length > 0;

    container.innerHTML = `
        <div class="hud-glass-panel rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-emerald-500/30 shadow-lg space-y-4">
            <!-- Header -->
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 dark:border-gray-800 pb-3">
                <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white shadow-[0_0_15px_rgba(245,158,11,0.4)] shrink-0">
                        <i data-lucide="trophy" class="w-5 h-5"></i>
                    </div>
                    <div>
                        <div class="flex items-center gap-2 flex-wrap">
                            <h3 class="text-base sm:text-lg font-black text-slate-900 dark:text-white">${activeSeries.title}</h3>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-700 dark:text-[#00ff88] border border-emerald-500/40">${activeSeries.status || 'Active'}</span>
                        </div>
                        <p class="text-xs text-slate-500 dark:text-gray-400">${activeSeries.dates || ''} • <span class="font-bold text-emerald-600 dark:text-emerald-400">${activeSeries.type || 'Tournament'}</span> ${activeSeries.teams ? `• ${activeSeries.teams}` : ''}</p>
                    </div>
                </div>

                <!-- Group Selector Pills (e.g. Group A & Group B) -->
                ${groups.length > 1 ? `
                    <div class="flex items-center gap-1.5 flex-wrap">
                        ${groups.map((g, gIdx) => {
                            const isCurGroup = (gIdx === selectedGroupIndex);
                            const gTitle = g.group || g.name || `Group ${gIdx + 1}`;
                            return `
                                <button onclick="selectTournamentPointsGroup(${gIdx})" 
                                        class="px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${isCurGroup ? 'bg-[#059669] text-white shadow-xs' : 'bg-slate-100 dark:bg-dark-800 text-slate-600 dark:text-gray-300 hover:text-[#059669] border border-slate-200 dark:border-gray-700'}">
                                    ${gTitle}
                                </button>
                            `;
                        }).join('')}
                    </div>
                ` : ''}
            </div>

            <!-- Active Match Teams Indicator -->
            ${(c1Name || c2Name) ? `
                <div class="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
                    <span class="flex items-center gap-1.5 font-bold">
                        <i data-lucide="info" class="w-3.5 h-3.5 text-emerald-500"></i>
                        <span>Teams playing in this match are highlighted with <span class="text-emerald-600 dark:text-[#00ff88] font-black">emerald badges</span> in the table below.</span>
                    </span>
                    ${activeGroupName ? `<span class="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-emerald-500/20 text-emerald-700 dark:text-[#00ff88]">${activeGroupName}</span>` : ''}
                </div>
            ` : ''}

            <!-- Standings Table -->
            ${hasStandings ? `
                <div class="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-gray-800">
                    <table class="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr class="bg-slate-100/80 dark:bg-dark-900/80 border-b border-slate-200 dark:border-gray-800 text-slate-500 dark:text-gray-400 font-mono text-[11px] uppercase tracking-wider">
                                <th class="py-2.5 px-3">#</th>
                                <th class="py-2.5 px-3 min-w-[150px]">Team</th>
                                <th class="py-2.5 px-2 text-right">P</th>
                                <th class="py-2.5 px-2 text-right">W</th>
                                <th class="py-2.5 px-2 text-right">L</th>
                                ${currentTeams[0]?.d !== undefined ? `<th class="py-2.5 px-2 text-right">D</th>` : ''}
                                ${currentTeams[0]?.nr !== undefined ? `<th class="py-2.5 px-2 text-right">NR</th>` : ''}
                                ${currentTeams[0]?.nrr !== undefined ? `<th class="py-2.5 px-2 text-right">NRR</th>` : ''}
                                <th class="py-2.5 px-3 text-right font-black text-slate-800 dark:text-white">PTS</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 dark:divide-gray-800/60">
                            ${currentTeams.map((st, idx) => {
                                const tNameLower = String(st.team || '').toLowerCase();
                                const isPlayingNow = (c1Name && tNameLower.includes(c1Name)) || (c2Name && tNameLower.includes(c2Name)) || (c1Name && c1Name.includes(tNameLower)) || (c2Name && c2Name.includes(tNameLower));
                                const rowHighlight = isPlayingNow ? 'bg-emerald-500/10 dark:bg-emerald-950/40 ring-1 ring-emerald-500/50' : 'hover:bg-slate-50 dark:hover:bg-dark-800/50';

                                return `
                                    <tr class="${rowHighlight} transition">
                                        <td class="py-2.5 px-3 font-mono font-bold ${idx < 2 ? 'text-amber-500 font-black' : 'text-slate-400'}">${st.rank || st.pos || (idx + 1)}</td>
                                        <td class="py-2.5 px-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                            ${st.logo ? `<img src="${st.logo}" alt="${st.team}" class="w-5 h-5 object-contain shrink-0" onerror="this.src='https://a.espncdn.com/i/teamlogos/cricket/500/6.png'"/>` : ''}
                                            <span class="truncate">${st.team}</span>
                                            ${isPlayingNow ? `<span class="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-600 dark:text-[#00ff88] text-[9px] font-mono font-bold uppercase shrink-0">Playing</span>` : ''}
                                        </td>
                                        <td class="py-2.5 px-2 text-right font-mono text-slate-700 dark:text-gray-300 font-semibold">${st.p}</td>
                                        <td class="py-2.5 px-2 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">${st.w}</td>
                                        <td class="py-2.5 px-2 text-right font-mono text-rose-500 font-bold">${st.l}</td>
                                        ${st.d !== undefined ? `<td class="py-2.5 px-2 text-right font-mono text-slate-500">${st.d}</td>` : ''}
                                        ${st.nr !== undefined ? `<td class="py-2.5 px-2 text-right font-mono text-slate-500">${st.nr}</td>` : ''}
                                        ${st.nrr !== undefined ? `<td class="py-2.5 px-2 text-right font-mono font-bold text-slate-700 dark:text-gray-300">${st.nrr}</td>` : ''}
                                        <td class="py-2.5 px-3 text-right font-mono font-black text-sm text-emerald-700 dark:text-[#00ff88] drop-shadow-xs">${st.pts}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            ` : `
                <div class="p-6 text-center text-slate-400 bg-slate-50 dark:bg-dark-900/40 rounded-xl border border-dashed border-slate-200 dark:border-gray-800">
                    <p class="text-xs">No standings recorded yet for this group.</p>
                </div>
            `}
        </div>
    `;

    safeCreateIcons();
}

function selectTournamentPointsGroup(groupIndex) {
    if (!appState.currentMatchData) return;
    const container = document.getElementById('match-points-table-content');
    const c1Name = String((appState.currentMatchData?.competitors && appState.currentMatchData.competitors[0]?.name) || '').toLowerCase();
    const c2Name = String((appState.currentMatchData?.competitors && appState.currentMatchData.competitors[1]?.name) || '').toLowerCase();
    
    if (appState.currentMatchData.standings && appState.currentMatchData.standings.length > 0) {
        const tournamentTitle = appState.currentMatchData.leagueName || (appState.currentMatchData.description ? appState.currentMatchData.description.split(',')[0].trim() : "Tournament Standings");
        const activeSeries = {
            id: 'match-standings',
            title: tournamentTitle,
            type: 'Tournament Standings',
            status: 'Live Standings',
            dates: appState.currentMatchData.date || '2026',
            groups: appState.currentMatchData.standings,
            standings: appState.currentMatchData.standings[groupIndex]?.teams || []
        };
        renderTournamentPointsTableHTML(container, activeSeries, c1Name, c2Name, appState.currentMatchData, groupIndex);
    } else {
        const seriesList = appState.seriesData || [];
        const leagueName = String(appState.currentMatchData.leagueName || appState.currentMatchData.description || '').toLowerCase();
        let matchedSeries = seriesList.find(s => {
            if (!s.standings || s.standings.length === 0) return false;
            const keywords = s.keywords || [s.title.toLowerCase()];
            return keywords.some(kw => leagueName.includes(kw.toLowerCase()));
        });
        if (matchedSeries) {
            renderTournamentPointsTableHTML(container, matchedSeries, c1Name, c2Name, appState.currentMatchData, groupIndex);
        }
    }
}

function viewMatchPointsTable(leagueId, eventId) {
    selectMatch(leagueId, eventId, false);
    setTimeout(() => {
        switchMatchTab('points-table');
        const ptEl = document.getElementById('match-points-table-content');
        if (ptEl) {
            ptEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 250);
}

// -------------------------------------------------------------
// Interactive UI Handlers (Tabs, Search, Timers)
// -------------------------------------------------------------

function switchMainTab(targetTab) {
    if (!targetTab || ['coverage', 'commentary', 'analytics'].includes(targetTab)) {
        targetTab = 'live';
    }
    const tabButtons = document.querySelectorAll('.cricinfo-tab-btn, .main-tab-btn');
    tabButtons.forEach(b => {
        const tabAttr = b.getAttribute('data-tab');
        if (tabAttr === targetTab) {
            b.classList.add('active', 'border-[#059669]', 'text-[#059669]', 'dark:border-sky-400', 'dark:text-emerald-400');
            b.classList.remove('border-transparent', 'text-slate-500', 'dark:text-gray-400');
        } else {
            b.classList.remove('active', 'border-[#059669]', 'text-[#059669]', 'dark:border-sky-400', 'dark:text-emerald-400');
            b.classList.add('border-transparent', 'text-slate-500', 'dark:text-gray-400');
        }
    });

    appState.activeTab = targetTab;
    try {
        localStorage.setItem('sports_dynasty_active_tab', targetTab);
    } catch(e) {}

    document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
    const activePane = document.getElementById(`tab-${targetTab}`);
    if (activePane) activePane.classList.remove('hidden');

    if (targetTab === 'scorecard' && appState.currentMatchData) {
        renderScorecardTab(appState.currentMatchData);
    } else if (targetTab === 'standings' && appState.currentMatchData) {
        renderMatchPointsTableTab(appState.currentMatchData);
    } else if (targetTab === 'squads' && appState.currentMatchData) {
        renderSquadsTab(appState.currentMatchData);
    } else if (targetTab === 'live' && appState.currentMatchData) {
        renderCricinfoLiveTab(appState.currentMatchData);
    } else if (targetTab === 'tv' && appState.currentMatchData) {
        renderTvStreamTab(appState.currentMatchData);
    }
    safeCreateIcons();
}

function setupTabs() {
    const tabButtons = document.querySelectorAll('.cricinfo-tab-btn, .main-tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            switchMainTab(targetTab);
        });
    });
}

function setupFilters() {
    const categoryButtons = document.querySelectorAll('.match-category-tab');
    categoryButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            categoryButtons.forEach(b => {
                b.classList.remove('bg-[#059669]', 'text-white');
                b.classList.add('text-slate-600', 'dark:text-gray-400');
            });
            btn.classList.add('bg-[#059669]', 'text-white');
            btn.classList.remove('text-slate-600', 'dark:text-gray-400');

            appState.activeCategory = btn.getAttribute('data-cat');
            renderMatchList();
        });
    });

    const commButtons = document.querySelectorAll('.comm-filter-btn');
    commButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            commButtons.forEach(b => {
                b.classList.remove('bg-[#059669]', 'text-white');
                b.classList.add('bg-slate-100', 'dark:bg-dark-900', 'text-slate-600', 'dark:text-gray-400');
            });
            btn.classList.add('bg-[#059669]', 'text-white');
            btn.classList.remove('bg-slate-100', 'dark:bg-dark-900', 'text-slate-600', 'dark:text-gray-400');

            appState.commFilter = btn.getAttribute('data-filter');
            if (appState.currentMatchData) {
                renderCommentaryTab(appState.currentMatchData);
            }
        });
    });
}

function setupSearch() {
    const searchInput = document.getElementById('match-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            appState.searchQuery = e.target.value;
            renderMatchList();
        });
    }
}

function setupRefresh() {
    const refreshBtn = document.getElementById('manual-refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            appState.countdown = 10;
            fetchMatches(false);
        });
    }
}

function startPollingTimer() {
    if (appState.intervalId) clearInterval(appState.intervalId);

    const timerElem = document.getElementById('countdown-timer');

    appState.intervalId = setInterval(() => {
        appState.countdown--;
        if (timerElem) timerElem.textContent = `${appState.countdown}s`;

        if (appState.countdown <= 0) {
            appState.countdown = 10;
            fetchMatches(true);
        }
    }, 1000);
}

// -------------------------------------------------------------
// Worldwide Player Profile & ESPN Cricinfo Redirection Engine
// -------------------------------------------------------------

function openEspnPlayerPage(playerId, playerName = '') {
    const cleanId = String(playerId || '').trim();
    if (cleanId && /^\d+$/.test(cleanId) && cleanId !== '0') {
        window.open(`https://www.espncricinfo.com/ci/content/player/${cleanId}.html`, '_blank', 'noopener,noreferrer');
        return;
    }
    const cleanName = String(playerName || '').trim();
    if (cleanName) {
        fetch(`/api/players/search?q=${encodeURIComponent(cleanName)}`)
            .then(res => res.json())
            .then(data => {
                if (data.players && data.players.length > 0 && data.players[0].id) {
                    window.open(`https://www.espncricinfo.com/ci/content/player/${data.players[0].id}.html`, '_blank', 'noopener,noreferrer');
                } else {
                    window.open(`https://www.espncricinfo.com/ci/content/player/search.html?search=${encodeURIComponent(cleanName)}`, '_blank', 'noopener,noreferrer');
                }
            })
            .catch(() => {
                window.open(`https://www.espncricinfo.com/ci/content/player/search.html?search=${encodeURIComponent(cleanName)}`, '_blank', 'noopener,noreferrer');
            });
    }
}

let globalSearchDebounceTimer = null;

function openPlayerSearchModal() {
    const modal = document.getElementById('player-search-modal');
    const input = document.getElementById('global-player-search-input');
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            const inner = modal.querySelector('.transform');
            if (inner) inner.classList.remove('scale-95');
            if (input) {
                input.focus();
                input.select();
            }
        }, 10);
        safeCreateIcons();
    }
}

function closePlayerSearchModal() {
    const modal = document.getElementById('player-search-modal');
    if (modal) {
        modal.classList.add('opacity-0');
        const inner = modal.querySelector('.transform');
        if (inner) inner.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 250);
    }
}

function handleGlobalPlayerSearch(query) {
    if (globalSearchDebounceTimer) clearTimeout(globalSearchDebounceTimer);
    const resultsContainer = document.getElementById('player-search-results');
    if (!resultsContainer) return;

    const q = String(query || '').trim();
    if (q.length < 2) {
        resultsContainer.innerHTML = `
            <div class="p-6 text-center text-xs text-slate-400 dark:text-gray-500 font-medium">
                Type a player's name above to search through thousands of international and domestic cricketers worldwide on ESPN.
            </div>
        `;
        return;
    }

    resultsContainer.innerHTML = `
        <div class="p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <div class="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <span>Searching ESPN cricketers for "${q}"...</span>
        </div>
    `;

    globalSearchDebounceTimer = setTimeout(async () => {
        try {
            const resp = await fetch(`/api/players/search?q=${encodeURIComponent(q)}`);
            if (!resp.ok) throw new Error("Search failed");
            const data = await resp.json();
            const players = data.players || [];

            if (players.length === 0) {
                resultsContainer.innerHTML = `
                    <div class="p-6 text-center text-xs text-slate-400 dark:text-gray-500">
                        No cricketers found matching "<span class="font-bold text-slate-700 dark:text-gray-300">${q}</span>". Try another name or spelling.
                    </div>
                `;
                return;
            }

            resultsContainer.innerHTML = players.map(p => {
                const safeName = escapeQuotes(p.name);
                return `
                <div onclick="closePlayerSearchModal(); openEspnPlayerPage('${p.id}', '${safeName}')" 
                     class="p-2.5 hover:bg-slate-50 dark:hover:bg-dark-800 flex items-center justify-between cursor-pointer transition group rounded-xl">
                    <div class="flex items-center gap-3 min-w-0">
                        <img src="${p.headshot || 'https://a.espncdn.com/i/headshots/cricket/players/default-player-logo-500.png'}" 
                             alt="${p.name}" class="w-9 h-9 rounded-xl object-cover object-top bg-slate-200 dark:bg-dark-700 border border-slate-200 dark:border-gray-700 shrink-0" 
                             onerror="this.src='https://a.espncdn.com/i/headshots/cricket/players/default-player-logo-500.png'" />
                        <div class="min-w-0">
                            <div class="flex items-center gap-1.5">
                                <h4 class="text-sm font-bold text-slate-900 dark:text-white group-hover:text-[#00ff88] transition truncate">${p.name}</h4>
                                <span class="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-600 dark:text-[#00ff88] text-[9px] font-mono font-bold uppercase">ESPN</span>
                            </div>
                            <p class="text-xs text-slate-500 dark:text-gray-400 truncate">${p.team || p.description || 'Cricket Player'}</p>
                        </div>
                    </div>
                    <div class="text-[11px] font-mono text-emerald-600 dark:text-[#00ff88] font-bold shrink-0 flex items-center gap-1 group-hover:translate-x-0.5 transition">
                        <span>Open ESPN</span>
                        <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                    </div>
                </div>
                `;
            }).join('');
            safeCreateIcons();
        } catch (e) {
            resultsContainer.innerHTML = `<div class="p-4 text-center text-xs text-rose-500">Search error: ${e.message}</div>`;
        }
    }, 280);
}

function openPlayerProfile(playerId, playerName = '') {
    // Directly navigate to official ESPN Cricinfo player profile
    openEspnPlayerPage(playerId, playerName);
}

function closePlayerProfile() {
    const modal = document.getElementById('player-profile-modal');
    if (modal) {
        modal.classList.add('opacity-0');
        const inner = modal.querySelector('.transform');
        if (inner) inner.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 250);
    }
}

// Global modal keyboard event listener
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closePlayerProfile();
        closePlayerSearchModal();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openPlayerSearchModal();
    }
});

// -------------------------------------------------------------
// Multi-Hub Platform Navigation Controller
// -------------------------------------------------------------

function switchPlatformView(viewName) {
    if (viewName === 'rankings') {
        window.open('https://www.espncricinfo.com/rankings/content/page/211271.html', '_blank');
        return;
    }
    appState.activePlatformView = viewName;

    // Toggle platform view containers
    document.querySelectorAll('.platform-view').forEach(v => v.classList.add('hidden'));
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.remove('hidden');

    // Update Desktop Nav Buttons
    document.querySelectorAll('.platform-nav-btn').forEach(btn => {
        const v = btn.getAttribute('data-view');
        if (v === viewName) {
            btn.className = 'platform-nav-btn px-3 py-1.5 rounded transition font-bold text-[#00ff88] bg-white/10 shadow-inner';
        } else {
            btn.className = 'platform-nav-btn px-3 py-1.5 rounded hover:bg-white/10 transition text-white/80';
        }
    });

    // Update Mobile Bottom Nav Buttons
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
        const mv = btn.getAttribute('data-mview');
        if (mv === viewName) {
            btn.className = 'mobile-nav-btn flex flex-col items-center gap-0.5 text-[#00ff88] font-black';
        } else {
            btn.className = 'mobile-nav-btn flex flex-col items-center gap-0.5 text-white/70';
        }
    });

    // Lazy load data for specific views
    if (viewName === 'news') {
        if (!appState.newsArticles || appState.newsArticles.length === 0) fetchNews();
        else renderNewsGrid(appState.currentNewsCategory);
    } else if (viewName === 'series') {
        fetchSeries();
    } else if (viewName === 'teams') {
        if (!appState.teamsList || appState.teamsList.length === 0) fetchTeams();
        else renderTeamsDirectory();
    } else if (viewName === 'rankings') {
        if (!appState.rankingsData) fetchRankings();
        else renderRankingsTable();
    }

    safeCreateIcons();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
        const targetPath = viewName === 'live' ? '/' : `/${viewName}`;
        if (window.location.pathname !== targetPath && !window.location.pathname.startsWith('/match/')) {
            history.pushState({ platformView: viewName }, '', targetPath);
        }
    } catch(e) {}
}

// -------------------------------------------------------------
// Breaking News & Editorial Hub
// -------------------------------------------------------------

async function fetchNews() {
    const container = document.getElementById('news-grid-container');
    if (!container) return;

    try {
        const resp = await fetch('/api/news');
        if (!resp.ok) throw new Error('Could not fetch news');
        const data = await resp.json();
        appState.newsArticles = data.articles || [];
        renderNewsGrid(appState.currentNewsCategory || 'all');
    } catch (e) {
        if (container) container.innerHTML = `<div class="col-span-full text-center py-8 text-rose-500 text-xs">Error loading news: ${e.message}</div>`;
    }
}

function filterNewsCategory(cat) {
    appState.currentNewsCategory = cat;
    document.querySelectorAll('.news-filter-btn').forEach(b => {
        const nc = b.getAttribute('data-ncat');
        if (nc === cat) {
            b.className = 'news-filter-btn px-3 py-1 rounded-lg text-xs font-bold bg-[#059669] text-white shadow-xs';
        } else {
            b.className = 'news-filter-btn px-3 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-dark-800 text-slate-600 dark:text-gray-300 hover:text-[#059669] border border-slate-200 dark:border-gray-700';
        }
    });
    renderNewsGrid(cat);
}

function renderNewsGrid(cat = 'all') {
    const container = document.getElementById('news-grid-container');
    const hero = document.getElementById('featured-news-hero');
    if (!container) return;

    const articles = (appState.newsArticles || []).filter(a => {
        if (cat === 'all') return true;
        return a.category === cat;
    });

    if (articles.length === 0) {
        container.innerHTML = `<div class="col-span-full text-center py-12 text-slate-400 text-xs font-medium">No stories found in "${cat}" category.</div>`;
        if (hero) hero.classList.add('hidden');
        return;
    }

    // Hero Article (first article if all)
    if (hero && articles.length > 0) {
        const top = articles[0];
        hero.innerHTML = `
            <div class="hud-glass-panel rounded-2xl p-5 border border-slate-200/80 dark:border-emerald-500/30 shadow-xl bg-gradient-to-r from-emerald-950/40 via-dark-900 to-transparent flex flex-col md:flex-row items-start justify-between gap-4">
                <div class="flex-1 space-y-2">
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-0.5 rounded bg-rose-500/20 text-rose-500 text-[10px] font-mono font-black uppercase tracking-wider animate-pulse">BREAKING STORY</span>
                        <span class="text-[11px] font-mono text-slate-400">${top.pubDate || 'Just now'}</span>
                        <span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-[#00ff88] text-[10px] font-mono font-bold">${top.category}</span>
                    </div>
                    <h3 class="text-lg sm:text-xl font-black text-slate-900 dark:text-white hover:text-[#00ff88] transition cursor-pointer" onclick="window.open('${top.link}', '_blank')">
                        ${top.title}
                    </h3>
                    <p class="text-xs sm:text-sm text-slate-600 dark:text-gray-300 line-clamp-2">${top.description || ''}</p>
                </div>
                <div class="shrink-0 flex items-center gap-2">
                    <a href="${top.link}" target="_blank" rel="noopener" class="px-4 py-2 rounded-xl bg-gradient-to-r from-[#059669] to-[#047857] hover:brightness-110 text-white font-bold text-xs flex items-center gap-1.5 shadow-[0_0_12px_rgba(5,150,105,0.4)] transition">
                        <span>Read Full Story</span>
                        <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                    </a>
                </div>
            </div>
        `;
        hero.classList.remove('hidden');
    }

    // Grid Articles (remaining)
    const gridStories = (hero ? articles.slice(1) : articles);
    container.innerHTML = gridStories.map(a => `
        <div class="hud-glass-panel rounded-2xl p-4 border border-slate-200/80 dark:border-emerald-500/20 shadow-md hover:border-[#00ff88]/50 hover:shadow-[0_0_15px_rgba(0,255,136,0.15)] transition flex flex-col justify-between group">
            <div class="space-y-2">
                <div class="flex items-center justify-between gap-2">
                    <span class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-[#00ff88] text-[9px] font-mono font-bold uppercase">${a.category}</span>
                    <span class="text-[10px] font-mono text-slate-400 truncate">${a.pubDate ? a.pubDate.split(' ').slice(0, 4).join(' ') : ''}</span>
                </div>
                <h4 class="text-sm font-bold text-slate-900 dark:text-white group-hover:text-[#00ff88] transition line-clamp-2 cursor-pointer" onclick="window.open('${a.link}', '_blank')">
                    ${a.title}
                </h4>
                <p class="text-xs text-slate-500 dark:text-gray-400 line-clamp-3 leading-relaxed">
                    ${a.description || ''}
                </p>
            </div>
            <div class="pt-3 mt-3 border-t border-slate-100 dark:border-gray-800 flex items-center justify-between">
                <span class="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                    <i data-lucide="globe" class="w-3 h-3 text-emerald-500"></i> ESPN Cricinfo
                </span>
                <a href="${a.link}" target="_blank" rel="noopener" class="text-xs font-bold text-emerald-600 dark:text-[#00ff88] hover:underline flex items-center gap-1">
                    <span>Read</span>
                    <i data-lucide="arrow-right" class="w-3 h-3"></i>
                </a>
            </div>
        </div>
    `).join('');

    safeCreateIcons();
}

// -------------------------------------------------------------
// Series & Tournament Hub
// -------------------------------------------------------------

async function fetchSeries() {
    const container = document.getElementById('series-hub-container');
    if (!container) return;

    try {
        const resp = await fetch('/api/series');
        if (!resp.ok) throw new Error('Could not fetch series');
        const data = await resp.json();
        const seriesList = data.series || [];

        container.innerHTML = seriesList.map(s => {
            const hasStandings = s.standings && s.standings.length > 0;
            const keywords = (s.keywords || [s.title.toLowerCase()]).map(k => k.toLowerCase());
            const sTitle = s.title.toLowerCase();

            // Match live matches from active feed
            const allMatches = appState.matches || [];
            const liveMatches = allMatches.filter(m => {
                if (!m.isLive) return false;
                const text = `${m.leagueName || ''} ${m.description || ''} ${m.name || ''} ${m.title || ''}`.toLowerCase();
                return keywords.some(k => text.includes(k)) || text.includes(sTitle);
            });

            // Feed matches that are recent or upcoming
            const feedRecent = allMatches.filter(m => {
                if (m.isLive) return false;
                const isPost = (m.state && ['post', 'final', 'completed'].includes(m.state.toLowerCase())) || m.isCompleted;
                if (!isPost) return false;
                const text = `${m.leagueName || ''} ${m.description || ''} ${m.name || ''} ${m.title || ''}`.toLowerCase();
                return keywords.some(k => text.includes(k)) || text.includes(sTitle);
            }).map(m => {
                const c1 = m.competitors && m.competitors[0] ? m.competitors[0] : {};
                const c2 = m.competitors && m.competitors[1] ? m.competitors[1] : {};
                return {
                    match: m.description || m.location || m.leagueName,
                    team1: c1.name || 'Team 1',
                    score1: c1.score || '',
                    team2: c2.name || 'Team 2',
                    score2: c2.score || '',
                    result: m.statusDetail || m.summary || (c1.isWinner ? `${c1.name} won` : (c2.isWinner ? `${c2.name} won` : 'Completed')),
                    date: m.date ? new Date(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Recent',
                    leagueId: m.leagueId,
                    id: m.id
                };
            });

            const feedUpcoming = allMatches.filter(m => {
                if (m.isLive) return false;
                const isPre = (m.state && ['pre', 'scheduled'].includes(m.state.toLowerCase())) || m.isUpcoming;
                if (!isPre) return false;
                const text = `${m.leagueName || ''} ${m.description || ''} ${m.name || ''} ${m.title || ''}`.toLowerCase();
                return keywords.some(k => text.includes(k)) || text.includes(sTitle);
            }).map(m => {
                const c1 = m.competitors && m.competitors[0] ? m.competitors[0] : {};
                const c2 = m.competitors && m.competitors[1] ? m.competitors[1] : {};
                const istFormatted = m.date ? formatMatchTimeIST(m.date) : (m.statusDetail || 'Upcoming');
                return {
                    match: m.description || m.leagueName || 'Upcoming Match',
                    team1: c1.name || 'Team 1',
                    team2: c2.name || 'Team 2',
                    date: istFormatted,
                    time: istFormatted,
                    venue: m.location || 'Stadium',
                    rawDate: m.date || ''
                };
            });

            // Combine with tournament schedule fixtures
            const staticRecent = (s.fixtures && s.fixtures.recent) ? s.fixtures.recent : [];
            const staticUpcoming = (s.fixtures && s.fixtures.upcoming) ? s.fixtures.upcoming : [];

            const recentMatches = [...feedRecent, ...staticRecent];
            const upcomingMatches = [...feedUpcoming, ...staticUpcoming];

            return `
                <div class="hud-glass-panel rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-emerald-500/30 shadow-lg space-y-4" id="series-card-${s.id}">
                    <!-- Tournament Header -->
                    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 dark:border-gray-800 pb-3">
                        <div class="flex items-center space-x-3">
                            <div class="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-500 font-bold shrink-0 shadow-xs">
                                <i data-lucide="trophy" class="w-5 h-5 text-amber-400"></i>
                            </div>
                            <div>
                                <h3 class="text-base sm:text-lg font-black text-slate-900 dark:text-white">${s.title}</h3>
                                <p class="text-xs text-slate-500 dark:text-gray-400">${s.dates} • <span class="font-bold text-emerald-600 dark:text-[#00ff88]">${s.type}</span> • ${s.teams}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            ${liveMatches.length > 0 ? `
                                <span class="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-rose-500/20 text-rose-500 border border-rose-500/40 animate-pulse flex items-center gap-1">
                                    <span class="w-2 h-2 rounded-full bg-rose-500"></span> ${liveMatches.length} Live
                                </span>
                            ` : ''}
                            <span class="px-2.5 py-1 rounded-full text-xs font-mono font-bold ${s.status === 'Ongoing' ? 'bg-emerald-500/20 text-emerald-600 dark:text-[#00ff88] border border-emerald-500/40' : 'bg-slate-200 dark:bg-dark-800 text-slate-600 dark:text-gray-300'}">${s.status}</span>
                      <!-- Interactive Sub-Tabs -->
                    <div class="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/90 dark:bg-dark-900/90 rounded-xl border border-slate-200 dark:border-gray-800">
                        <button onclick="switchSeriesSubTab('${s.id}', 'all-matches')" id="btn-tab-${s.id}-all-matches" class="series-subtab-btn px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 bg-white dark:bg-dark-800 text-emerald-600 dark:text-[#00ff88] shadow-xs">
                            <i data-lucide="layers" class="w-3.5 h-3.5 text-amber-500"></i>
                            <span>All Fixtures</span>
                        </button>
                        <button onclick="switchSeriesSubTab('${s.id}', 'recent')" id="btn-tab-${s.id}-recent" class="series-subtab-btn px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 text-slate-600 dark:text-gray-300 hover:text-emerald-600">
                            <i data-lucide="check-circle" class="w-3.5 h-3.5 text-emerald-500"></i>
                            <span>Completed (${recentMatches.length})</span>
                        </button>
                        <button onclick="switchSeriesSubTab('${s.id}', 'upcoming')" id="btn-tab-${s.id}-upcoming" class="series-subtab-btn px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 text-slate-600 dark:text-gray-300 hover:text-blue-500">
                            <i data-lucide="calendar" class="w-3.5 h-3.5 text-blue-500"></i>
                            <span>Upcoming (${upcomingMatches.length})</span>
                        </button>
                        ${hasStandings ? `
                            <button onclick="switchSeriesSubTab('${s.id}', 'standings')" id="btn-tab-${s.id}-standings" class="series-subtab-btn px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 text-slate-600 dark:text-gray-300 hover:text-emerald-600">
                                <i data-lucide="award" class="w-3.5 h-3.5"></i>
                                <span>Points Table</span>
                            </button>
                        ` : ''}
                        ${liveMatches.length > 0 ? `
                            <button onclick="switchSeriesSubTab('${s.id}', 'live')" id="btn-tab-${s.id}-live" class="series-subtab-btn px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 text-rose-500 hover:text-rose-600">
                                <span class="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                                <span>Live (${liveMatches.length})</span>
                            </button>
                        ` : ''}
                    </div>

                    <!-- Panel 1: Standings (Points Table) -->
                    ${hasStandings ? `
                        <div id="panel-${s.id}-standings" class="series-subpanel space-y-2 hidden">
                            <div class="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-gray-800">
                                <table class="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr class="bg-slate-100/80 dark:bg-dark-900/80 border-b border-slate-200 dark:border-gray-800 text-slate-500 dark:text-gray-400 font-mono text-[11px] uppercase tracking-wider">
                                            <th class="py-2.5 px-3">#</th>
                                            <th class="py-2.5 px-3 min-w-[150px]">Team</th>
                                            <th class="py-2.5 px-2 text-right">P</th>
                                            <th class="py-2.5 px-2 text-right">W</th>
                                            <th class="py-2.5 px-2 text-right">L</th>
                                            ${s.standings[0]?.d !== undefined ? `<th class="py-2.5 px-2 text-right">D</th>` : ''}
                                            ${s.standings[0]?.nr !== undefined ? `<th class="py-2.5 px-2 text-right">NR</th>` : ''}
                                            ${s.standings[0]?.nrr !== undefined ? `<th class="py-2.5 px-2 text-right">NRR</th>` : ''}
                                            ${s.standings[0]?.pct !== undefined ? `<th class="py-2.5 px-2 text-right">PCT %</th>` : ''}
                                            <th class="py-2.5 px-3 text-right font-black text-slate-800 dark:text-white">PTS</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-slate-100 dark:divide-gray-800/60">
                                        ${s.standings.map((st, idx) => `
                                            <tr class="hover:bg-slate-50 dark:hover:bg-dark-800/60 transition font-medium">
                                                <td class="py-2.5 px-3 font-mono font-bold ${idx < 3 ? 'text-amber-500 font-black' : 'text-slate-400'}">${st.rank || (idx + 1)}</td>
                                                <td class="py-2.5 px-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                                    ${st.logo ? `<img src="${st.logo}" alt="${st.team}" class="w-5 h-5 object-contain shrink-0" onerror="this.src='https://a.espncdn.com/i/teamlogos/cricket/500/6.png'"/>` : ''}
                                                    <span class="truncate">${st.team}</span>
                                                </td>
                                                <td class="py-2.5 px-2 text-right font-mono text-slate-700 dark:text-gray-300 font-semibold">${st.p}</td>
                                                <td class="py-2.5 px-2 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">${st.w}</td>
                                                <td class="py-2.5 px-2 text-right font-mono text-rose-500 font-bold">${st.l}</td>
                                                ${st.d !== undefined ? `<td class="py-2.5 px-2 text-right font-mono text-slate-500">${st.d}</td>` : ''}
                                                ${st.nr !== undefined ? `<td class="py-2.5 px-2 text-right font-mono text-slate-500">${st.nr}</td>` : ''}
                                                ${st.nrr !== undefined ? `<td class="py-2.5 px-2 text-right font-mono font-bold text-slate-700 dark:text-gray-300">${st.nrr}</td>` : ''}
                                                ${st.pct !== undefined ? `<td class="py-2.5 px-2 text-right font-mono font-black text-emerald-600 dark:text-[#00ff88]">${st.pct}%</td>` : ''}
                                                <td class="py-2.5 px-3 text-right font-mono font-black text-sm text-emerald-700 dark:text-[#00ff88] drop-shadow-xs">${st.pts}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ` : ''}

                    <!-- Panel 2: Completed Matches (Results) -->
                    <div id="panel-${s.id}-recent" class="series-subpanel space-y-3 ${hasStandings ? 'hidden' : ''}">
                        <div class="flex items-center justify-between pb-1">
                            <h4 class="text-xs font-mono font-black uppercase text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <i data-lucide="check-circle" class="w-3.5 h-3.5 text-emerald-500"></i>
                                Completed Matches (Results)
                            </h4>
                            <span class="text-[10px] font-mono text-slate-400">${recentMatches.length} Matches</span>
                        </div>
                        ${recentMatches.length > 0 ? `
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                ${recentMatches.map(m => `
                                    <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-dark-900/70 border border-slate-200 dark:border-gray-800 space-y-2 hover:border-emerald-500/50 transition cursor-pointer shadow-xs" ${m.leagueId && m.id ? `onclick="selectMatch('${m.leagueId}', '${m.id}')"` : ''}>
                                        <div class="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                                            <span class="truncate">${m.match || 'Completed Match'}</span>
                                            <span class="shrink-0">${m.date || ''}</span>
                                        </div>
                                        <div class="space-y-1.5 text-xs">
                                            <div class="flex items-center justify-between font-bold text-slate-900 dark:text-white">
                                                <span class="truncate">${m.team1}</span>
                                                <span class="font-mono text-emerald-600 dark:text-[#00ff88] shrink-0 font-black">${m.score1 || '-'}</span>
                                            </div>
                                            <div class="flex items-center justify-between font-bold text-slate-900 dark:text-white">
                                                <span class="truncate">${m.team2}</span>
                                                <span class="font-mono text-slate-600 dark:text-gray-300 shrink-0 font-semibold">${m.score2 || '-'}</span>
                                            </div>
                                        </div>
                                        <div class="pt-2 border-t border-slate-200/70 dark:border-gray-800 flex items-center justify-between text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                                            <span class="truncate flex items-center gap-1">
                                                <i data-lucide="check" class="w-3 h-3 text-emerald-500"></i>
                                                ${m.result}
                                            </span>
                                            ${m.leagueId && m.id ? `<span class="text-[10px] font-mono text-slate-400 hover:text-emerald-500 shrink-0">Scorecard →</span>` : ''}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        ` : `
                            <div class="p-6 text-center text-slate-400 text-xs font-medium bg-slate-50 dark:bg-dark-900/40 rounded-xl">No completed matches recorded yet.</div>
                        `}
                    </div>

                    <!-- Panel 3: Upcoming Fixtures (Schedule) -->
                    <div id="panel-${s.id}-upcoming" class="series-subpanel space-y-3 hidden">
                        <div class="flex items-center justify-between pb-1">
                            <h4 class="text-xs font-mono font-black uppercase text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <i data-lucide="calendar" class="w-3.5 h-3.5 text-blue-500"></i>
                                Upcoming Fixtures (Schedule)
                            </h4>
                            <span class="text-[10px] font-mono text-slate-400">${upcomingMatches.length} Matches</span>
                        </div>
                        ${upcomingMatches.length > 0 ? `
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                ${upcomingMatches.map(m => `
                                    <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-dark-900/70 border border-slate-200 dark:border-gray-800 space-y-2.5 hover:border-blue-500/50 transition shadow-xs">
                                        <div class="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                                            <span class="truncate">${m.match || 'Fixture'}</span>
                                            <span class="px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-[10px] shrink-0">${m.time || 'Upcoming'}</span>
                                        </div>
                                        <div class="flex items-center justify-between py-1 text-xs font-black text-slate-900 dark:text-white">
                                            <span class="truncate flex-1">${m.team1}</span>
                                            <span class="text-[10px] text-slate-400 font-mono px-2 shrink-0">VS</span>
                                            <span class="truncate flex-1 text-right">${m.team2}</span>
                                        </div>
                                        <div class="pt-2 border-t border-slate-200/70 dark:border-gray-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-gray-400">
                                            <span class="truncate flex items-center gap-1">
                                                <i data-lucide="map-pin" class="w-3 h-3 text-slate-400"></i>
                                                ${m.venue || ''}
                                            </span>
                                            ${m.rawDate ? `
                                                <span class="upcoming-countdown-badge px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40 font-black font-mono text-[10px] tracking-tight flex items-center gap-1 shrink-0" data-match-date="${m.rawDate}">
                                                    <svg class="w-3 h-3 text-amber-500 animate-spin-reverse shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                                        <circle cx="12" cy="12" r="10" stroke-dasharray="60" stroke-dashoffset="15"></circle>
                                                        <polyline points="12 6 12 12 8 14"></polyline>
                                                    </svg>
                                                    <span class="countdown-timer-text">${computeAnticlockwiseCountdown(m.rawDate).text}</span>
                                                </span>
                                            ` : `<span class="font-mono text-[10px] font-bold text-slate-700 dark:text-gray-300 shrink-0">${m.date || ''}</span>`}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        ` : `
                            <div class="p-6 text-center text-slate-400 text-xs font-medium bg-slate-50 dark:bg-dark-900/40 rounded-xl">No upcoming fixtures scheduled.</div>
                        `}
                    </div>

                    <!-- Panel 4: Live Matches (if any) -->
                    ${liveMatches.length > 0 ? `
                        <div id="panel-${s.id}-live" class="series-subpanel space-y-3 hidden">
                            <div class="flex items-center justify-between pb-1">
                                <h4 class="text-xs font-mono font-black uppercase text-rose-500 flex items-center gap-1.5">
                                    <span class="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
                                    Ongoing Live Matches
                                </h4>
                                <span class="text-[10px] font-mono text-rose-500 font-bold">${liveMatches.length} Live Now</span>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                ${liveMatches.map(m => `
                                    <div class="p-3.5 rounded-xl bg-rose-500/5 dark:bg-rose-950/20 border border-rose-500/30 space-y-2.5 hover:border-rose-500/60 transition cursor-pointer shadow-xs" onclick="selectMatch('${m.leagueId}', '${m.id}')">
                                        <div class="flex items-center justify-between text-[11px] text-rose-600 dark:text-rose-400 font-mono">
                                            <span class="truncate">${m.description || m.location}</span>
                                            <span class="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[9px] font-black">● LIVE</span>
                                        </div>
                                        <div class="space-y-1.5 text-xs">
                                            ${(m.competitors || []).map(c => `
                                                <div class="flex items-center justify-between font-bold text-slate-900 dark:text-white">
                                                    <span class="truncate">${c.name}</span>
                                                    <span class="font-mono text-emerald-600 dark:text-[#00ff88] font-black">${c.score || ''}</span>
                                                </div>
                                            `).join('')}
                                        </div>
                                        <div class="pt-2 border-t border-rose-200 dark:border-rose-900/50 flex items-center justify-between text-[11px] text-rose-600 dark:text-rose-300 font-bold">
                                            <span class="truncate">${m.statusDetail || 'In Progress'}</span>
                                            <span class="text-xs text-[#059669] dark:text-[#00ff88] font-mono">Watch Live →</span>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <!-- Panel 5: All Matches (Completed + Upcoming Fixtures) -->
                    <div id="panel-${s.id}-all-matches" class="series-subpanel space-y-5 block">
                        ${liveMatches.length > 0 ? `
                            <div class="space-y-2">
                                <h5 class="text-xs font-mono font-black uppercase text-rose-500 flex items-center gap-1.5">
                                    <span class="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span> Live Now
                                </h5>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                    ${liveMatches.map(m => `
                                        <div class="p-3 rounded-xl bg-rose-500/5 border border-rose-500/30 text-xs font-bold cursor-pointer" onclick="selectMatch('${m.leagueId}', '${m.id}')">
                                            <div class="text-[10px] text-rose-600 font-mono">${m.description || 'Live Match'}</div>
                                            <div class="py-1">${(m.competitors || []).map(c => `${c.name}: ${c.score || '-'}`).join(' vs ')}</div>
                                            <div class="text-[10px] text-emerald-600">${m.statusDetail || 'LIVE'} • Watch →</div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}

                        <!-- Completed Matches Section -->
                        <div class="space-y-2">
                            <h5 class="text-xs font-mono font-black uppercase text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                                <i data-lucide="check-circle" class="w-3.5 h-3.5 text-emerald-500"></i> Completed Matches (Results)
                            </h5>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                ${recentMatches.slice(0, 4).map(m => `
                                    <div class="p-3 rounded-xl bg-slate-50 dark:bg-dark-900/60 border border-slate-200 dark:border-gray-800 text-xs space-y-1">
                                        <div class="flex justify-between text-[10px] text-slate-400 font-mono"><span>${m.match || ''}</span><span>${m.date || ''}</span></div>
                                        <div class="flex justify-between font-bold"><span>${m.team1}</span><span class="font-mono text-emerald-600 dark:text-[#00ff88]">${m.score1 || '-'}</span></div>
                                        <div class="flex justify-between font-bold"><span>${m.team2}</span><span>${m.score2 || '-'}</span></div>
                                        <div class="text-[10px] text-emerald-600 font-semibold pt-1 border-t border-slate-100 dark:border-gray-800">${m.result}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <!-- Upcoming Fixtures Section -->
                        <div class="space-y-2">
                            <h5 class="text-xs font-mono font-black uppercase text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                                <i data-lucide="calendar" class="w-3.5 h-3.5 text-blue-500"></i> Upcoming Fixtures (Schedule)
                            </h5>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                ${upcomingMatches.slice(0, 4).map(m => `
                                    <div class="p-3 rounded-xl bg-slate-50 dark:bg-dark-900/60 border border-slate-200 dark:border-gray-800 text-xs space-y-1">
                                        <div class="flex justify-between text-[10px] text-slate-400 font-mono"><span>${m.match || ''}</span><span class="text-blue-500 font-bold">${m.time || ''}</span></div>
                                        <div class="font-black py-0.5">${m.team1} vs ${m.team2}</div>
                                        <div class="text-[10px] text-slate-500">${m.venue || ''} • ${m.date || ''}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        safeCreateIcons();
    } catch (e) {
        if (container) container.innerHTML = `<div class="p-8 text-center text-rose-500 text-xs">Error: ${e.message}</div>`;
    }
}

window.switchSeriesSubTab = function(seriesId, tabName) {
    const card = document.getElementById(`series-card-${seriesId}`);
    if (!card) return;

    // Hide all subpanels in this card
    card.querySelectorAll('.series-subpanel').forEach(p => p.classList.add('hidden'));

    // Show target subpanel
    const targetPanel = document.getElementById(`panel-${seriesId}-${tabName}`);
    if (targetPanel) targetPanel.classList.remove('hidden');

    // Update buttons
    card.querySelectorAll('.series-subtab-btn').forEach(btn => {
        btn.classList.remove('bg-white', 'dark:bg-dark-800', 'text-emerald-600', 'dark:text-[#00ff88]', 'shadow-xs');
        btn.classList.add('text-slate-600', 'dark:text-gray-300');
    });
    const activeBtn = document.getElementById(`btn-tab-${seriesId}-${tabName}`);
    if (activeBtn) {
        activeBtn.classList.remove('text-slate-600', 'dark:text-gray-300');
        activeBtn.classList.add('bg-white', 'dark:bg-dark-800', 'text-emerald-600', 'dark:text-[#00ff88]', 'shadow-xs');
    }

    safeCreateIcons();
};

// -------------------------------------------------------------
// Teams Directory Hub
// -------------------------------------------------------------

async function fetchTeams() {
    const container = document.getElementById('teams-grid-container');
    if (!container) return;

    try {
        const resp = await fetch('/api/teams');
        if (!resp.ok) throw new Error('Could not fetch teams');
        const data = await resp.json();
        appState.teamsList = data.teams || [];
        renderTeamsDirectory();
    } catch (e) {
        if (container) container.innerHTML = `<div class="col-span-full text-center py-8 text-rose-500 text-xs">Error: ${e.message}</div>`;
    }
}

function filterTeamsDirectory(query = '') {
    renderTeamsDirectory(query);
}

function renderTeamsDirectory(query = '') {
    const container = document.getElementById('teams-grid-container');
    if (!container) return;

    const q = String(query || '').toLowerCase().trim();
    const teams = (appState.teamsList || []).filter(t => {
        if (!q) return true;
        return t.name.toLowerCase().includes(q) || t.abbr.toLowerCase().includes(q) || (t.captain && t.captain.toLowerCase().includes(q));
    });

    if (teams.length === 0) {
        container.innerHTML = `<div class="col-span-full text-center py-12 text-slate-400 text-xs font-medium">No teams found matching "${query}".</div>`;
        return;
    }

    container.innerHTML = teams.map(t => `
        <div class="hud-glass-panel rounded-2xl p-4 border border-slate-200/80 dark:border-emerald-500/20 shadow-md hover:border-[#00ff88]/50 hover:shadow-[0_0_15px_rgba(0,255,136,0.2)] transition space-y-3 group">
            <div class="flex items-center space-x-3">
                <img src="${t.logo}" alt="${t.name}" class="w-12 h-12 rounded-xl object-contain bg-white dark:bg-dark-800 p-1 border border-slate-200 dark:border-gray-700 shadow-sm shrink-0" onerror="this.src='https://a.espncdn.com/i/teamlogos/cricket/500/6.png'"/>
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                        <h4 class="text-base font-black text-slate-900 dark:text-white group-hover:text-[#00ff88] transition truncate">${t.name}</h4>
                        <span class="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-700 dark:text-[#00ff88] text-[9px] font-mono font-bold">${t.abbr}</span>
                    </div>
                    <p class="text-[11px] text-slate-500 dark:text-gray-400 truncate">Cap: <span class="font-semibold text-slate-700 dark:text-gray-200">${t.captain || 'N/A'}</span></p>
                </div>
            </div>

            <div class="grid grid-cols-3 gap-1.5 text-center bg-slate-50 dark:bg-dark-800/60 p-2 rounded-xl border border-slate-100 dark:border-gray-800 text-[10px] font-mono">
                <div>
                    <span class="text-slate-400 block text-[9px]">TEST</span>
                    <span class="font-bold text-slate-800 dark:text-white">#${t.testRank || '-'}</span>
                </div>
                <div>
                    <span class="text-slate-400 block text-[9px]">ODI</span>
                    <span class="font-bold text-emerald-600 dark:text-[#00ff88]">#${t.odiRank || '-'}</span>
                </div>
                <div>
                    <span class="text-slate-400 block text-[9px]">T20I</span>
                    <span class="font-bold text-amber-500">#${t.t20Rank || '-'}</span>
                </div>
            </div>

            <div class="pt-2 border-t border-slate-100 dark:border-gray-800 flex items-center justify-between text-xs">
                <span class="text-[10px] text-slate-400 truncate">Coach: ${t.coach || 'N/A'}</span>
                <a href="https://www.espncricinfo.com/team/${t.name.toLowerCase().replace(/ /g, '-')}-${t.id}" target="_blank" rel="noopener" class="text-xs font-bold text-emerald-600 dark:text-[#00ff88] hover:underline flex items-center gap-1">
                    <span>ESPN Page</span>
                    <i data-lucide="external-link" class="w-3 h-3"></i>
                </a>
            </div>
        </div>
    `).join('');

    safeCreateIcons();
}

// -------------------------------------------------------------
// Official ICC Rankings Center
// -------------------------------------------------------------

async function fetchRankings() {
    const container = document.getElementById('rankings-table-container');
    if (!container) return;

    try {
        const resp = await fetch('/api/rankings');
        if (!resp.ok) throw new Error('Could not fetch rankings');
        const data = await resp.json();
        appState.rankingsData = data;
        renderRankingsTable();
    } catch (e) {
        if (container) container.innerHTML = `<div class="p-8 text-center text-rose-500 text-xs">Error: ${e.message}</div>`;
    }
}

function switchRankingFormat(fmt) {
    appState.activeRankFormat = fmt;
    document.querySelectorAll('.rank-fmt-btn').forEach(b => {
        const f = b.getAttribute('data-fmt');
        if (f === fmt) {
            b.className = 'rank-fmt-btn px-3 py-1 rounded-lg text-xs font-bold bg-[#059669] text-white shadow-xs';
        } else {
            b.className = 'rank-fmt-btn px-3 py-1 rounded-lg text-xs font-bold text-slate-600 dark:text-gray-400 hover:text-[#059669]';
        }
    });
    renderRankingsTable();
}

function switchRankingCategory(cat) {
    appState.activeRankCategory = cat;
    document.querySelectorAll('.rank-cat-btn').forEach(b => {
        const c = b.getAttribute('data-rcat');
        if (c === cat) {
            b.className = 'rank-cat-btn px-3 py-1 rounded-lg text-xs font-bold bg-[#059669] text-white shadow-xs';
        } else {
            b.className = 'rank-cat-btn px-3 py-1 rounded-lg text-xs font-bold text-slate-600 dark:text-gray-400 hover:text-[#059669]';
        }
    });
    renderRankingsTable();
}

function renderRankingsTable() {
    const container = document.getElementById('rankings-table-container');
    if (!container || !appState.rankingsData) return;

    const fmt = appState.activeRankFormat || 'test';
    const cat = appState.activeRankCategory || 'teams';
    const dataSection = appState.rankingsData[cat] ? appState.rankingsData[cat][fmt] : null;

    if (!dataSection || dataSection.length === 0) {
        container.innerHTML = `<div class="p-8 text-center text-slate-400 text-xs font-medium">No rankings data available for ${fmt.toUpperCase()} ${cat}.</div>`;
        return;
    }

    if (cat === 'teams') {
        container.innerHTML = `
            <table class="w-full text-left text-xs border-collapse">
                <thead>
                    <tr class="border-b border-slate-200 dark:border-gray-800 text-slate-400 font-mono text-[10px] uppercase">
                        <th class="py-2.5 px-3">Rank</th>
                        <th class="py-2.5 px-3">Team</th>
                        <th class="py-2.5 px-2 text-right">Matches</th>
                        <th class="py-2.5 px-2 text-right">Points</th>
                        <th class="py-2.5 px-3 text-right">Rating</th>
                    </tr>
                </thead>
                <tbody>
                    ${dataSection.map((t, idx) => `
                        <tr class="border-b border-slate-100 dark:border-gray-800/50 hover:bg-slate-50 dark:hover:bg-dark-800/60 transition">
                            <td class="py-2.5 px-3 font-mono font-bold">
                                ${t.rank === 1 ? '<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-400 text-slate-950 text-xs font-black shadow-[0_0_8px_rgba(251,191,36,0.6)]">1</span>' :
                                  t.rank === 2 ? '<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-300 text-slate-950 text-xs font-black">2</span>' :
                                  t.rank === 3 ? '<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700 text-white text-xs font-black">3</span>' :
                                  `<span class="text-slate-500 ml-2 font-mono">#${t.rank}</span>`}
                            </td>
                            <td class="py-2.5 px-3 font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
                                <img src="${t.logo}" alt="${t.team}" class="w-6 h-6 object-contain rounded" onerror="this.src='https://a.espncdn.com/i/teamlogos/cricket/500/6.png'"/>
                                <span>${t.team}</span>
                            </td>
                            <td class="py-2.5 px-2 text-right font-mono text-slate-700 dark:text-gray-300">${t.matches}</td>
                            <td class="py-2.5 px-2 text-right font-mono text-slate-700 dark:text-gray-300">${t.points}</td>
                            <td class="py-2.5 px-3 text-right font-mono font-black text-emerald-600 dark:text-[#00ff88] text-sm">${t.rating}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } else {
        // Batters or Bowlers table
        container.innerHTML = `
            <table class="w-full text-left text-xs border-collapse">
                <thead>
                    <tr class="border-b border-slate-200 dark:border-gray-800 text-slate-400 font-mono text-[10px] uppercase">
                        <th class="py-2.5 px-3">Rank</th>
                        <th class="py-2.5 px-3">Player</th>
                        <th class="py-2.5 px-2 text-left">Team</th>
                        <th class="py-2.5 px-3 text-right">Rating</th>
                        <th class="py-2.5 px-3 text-right">Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${dataSection.map((p, idx) => `
                        <tr class="border-b border-slate-100 dark:border-gray-800/50 hover:bg-slate-50 dark:hover:bg-dark-800/60 transition">
                            <td class="py-2.5 px-3 font-mono font-bold">
                                ${p.rank === 1 ? '<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-400 text-slate-950 text-xs font-black shadow-[0_0_8px_rgba(251,191,36,0.6)]">1</span>' :
                                  p.rank === 2 ? '<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-300 text-slate-950 text-xs font-black">2</span>' :
                                  p.rank === 3 ? '<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700 text-white text-xs font-black">3</span>' :
                                  `<span class="text-slate-500 ml-2 font-mono">#${p.rank}</span>`}
                            </td>
                            <td class="py-2.5 px-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <img src="https://a.espncdn.com/i/headshots/cricket/players/full/${p.id}.png" alt="${p.player}" class="w-6 h-6 rounded-full object-cover object-top bg-slate-200 dark:bg-dark-700 shrink-0" onerror="this.src='https://a.espncdn.com/i/headshots/cricket/players/default-player-logo-500.png'"/>
                                <span class="hover:text-[#00ff88] cursor-pointer" onclick="openEspnPlayerPage('${p.id}', '${p.player}')">${p.player}</span>
                            </td>
                            <td class="py-2.5 px-2 font-mono font-bold text-emerald-700 dark:text-emerald-300">${p.team}</td>
                            <td class="py-2.5 px-3 text-right font-mono font-black text-emerald-600 dark:text-[#00ff88] text-sm">${p.rating}</td>
                            <td class="py-2.5 px-3 text-right">
                                <button onclick="openEspnPlayerPage('${p.id}', '${p.player}')" class="px-2.5 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-[#00ff88] text-[11px] font-bold transition">
                                    ESPN Profile
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    safeCreateIcons();
}

// -------------------------------------------------------------
// PWA Service Worker Registration
// -------------------------------------------------------------

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/static/sw.js')
            .then(reg => console.log('ServiceWorker registered:', reg.scope))
            .catch(err => console.log('ServiceWorker registration skipped:', err));
    });
}

// -------------------------------------------------------------
// REAL-TIME VISITOR TRACKER & HIT ANALYTICS ENGINE
// -------------------------------------------------------------
function getOrCreateVisitorId() {
    let vid = localStorage.getItem('sports_dynasty_vid');
    if (!vid) {
        vid = 'v_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now().toString(36);
        localStorage.setItem('sports_dynasty_vid', vid);
    }
    return vid;
}

async function updateVisitorAnalytics(isHeartbeat = false) {
    try {
        const vid = getOrCreateVisitorId();
        const clientMax = localStorage.getItem('dynasty_max_visits') || '1450';
        
        const res = await fetch('/api/analytics/track', {
            method: 'POST',
            headers: {
                'x-visitor-id': vid,
                'x-client-max': clientMax,
                'x-heartbeat': isHeartbeat ? '1' : '0',
                'Content-Type': 'application/json'
            }
        });
        if (res.ok) {
            const data = await res.json();
            const totalEl = document.getElementById('stat-total-visits');
            const totalFooterEl = document.getElementById('stat-total-visits-footer');
            const onlineEl = document.getElementById('stat-online-now');
            const onlineFooterEl = document.getElementById('stat-online-now-footer');
            
            const totalNum = Number(data.total_visits || 1450);
            localStorage.setItem('dynasty_max_visits', String(totalNum));
            
            const formattedTotal = totalNum.toLocaleString();
            const onlineCount = data.active_online || 1;
            
            if (totalEl) {
                totalEl.textContent = formattedTotal;
            }
            if (totalFooterEl) {
                totalFooterEl.textContent = formattedTotal;
            }
            if (onlineEl) {
                onlineEl.textContent = onlineCount;
            }
            if (onlineFooterEl) {
                onlineFooterEl.textContent = onlineCount;
            }
        }
    } catch (e) {
        console.warn('Analytics tracking error:', e);
    }
}

// -------------------------------------------------------------
// DEVICE VIEWPORT SWITCHER (Auto, Desktop Arena, Mobile Stream)
// -------------------------------------------------------------
function setDeviceLayout(mode) {
    const validModes = ['auto', 'desktop', 'mobile'];
    if (!validModes.includes(mode)) mode = 'auto';
    
    localStorage.setItem('sports_dynasty_device_layout', mode);
    
    const body = document.body;
    body.classList.remove('layout-mode-auto', 'layout-mode-desktop', 'layout-mode-mobile');
    body.classList.add(`layout-mode-${mode}`);
    
    // Update button active states
    ['auto', 'desktop', 'mobile'].forEach(m => {
        const btn = document.getElementById(`btn-view-${m}`);
        if (btn) {
            if (m === mode) {
                btn.className = 'device-layout-btn px-2 py-1 text-[11px] font-bold rounded transition text-black bg-[#00ff88] shadow-sm flex items-center space-x-1';
            } else {
                btn.className = 'device-layout-btn px-2 py-1 text-[11px] font-semibold rounded transition text-white/70 hover:text-white flex items-center space-x-1';
            }
        }
    });
    
    // Adjust meta viewport tag
    const metaViewport = document.querySelector('meta[name="viewport"]');
    if (metaViewport) {
        if (mode === 'desktop') {
            metaViewport.setAttribute('content', 'width=1280, initial-scale=0.3, user-scalable=yes');
        } else {
            metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=5.0');
        }
    }
    
    safeCreateIcons();
}

function initDeviceLayout() {
    const savedMode = localStorage.getItem('sports_dynasty_device_layout') || 'auto';
    setDeviceLayout(savedMode);
}

// -------------------------------------------------------------
// GOOGLE ADSENSE COMPLIANCE & LEGAL MODALS
// -------------------------------------------------------------
const policyContents = {
    privacy: {
        title: "Privacy Policy",
        body: `
            <p><strong>Effective Date:</strong> January 2026</p>
            <p>Welcome to <strong>Sports Dynasty</strong> (accessible at <a href="https://sportsdynasty.in" class="text-emerald-500 underline">sportsdynasty.in</a>). We value your privacy and are committed to protecting personal information.</p>
            <h4 class="font-bold text-slate-800 dark:text-white mt-2">1. Information We Collect</h4>
            <p>Sports Dynasty does not require user registration to view live cricket scorecards, news, or rankings. We may automatically log non-personally identifiable diagnostic data including IP address, browser type, and anonymous interaction metrics for analytics and server optimization.</p>
            <h4 class="font-bold text-slate-800 dark:text-white mt-2">2. Google AdSense & Cookies</h4>
            <p>We use third-party advertising vendors such as Google AdSense to serve ads when you visit our website. Google uses cookies (including the DoubleClick cookie) to serve ads based on prior visits to this website or other sites on the Internet.</p>
            <p>Users may opt out of personalized advertising by visiting <a href="https://www.google.com/settings/ads" target="_blank" class="text-emerald-500 underline">Google Ads Settings</a>.</p>
            <h4 class="font-bold text-slate-800 dark:text-white mt-2">3. Contact Us</h4>
            <p>If you have questions regarding this Privacy Policy, contact us at <strong>support@sportsdynasty.in</strong>.</p>
        `
    },
    terms: {
        title: "Terms of Service",
        body: `
            <p><strong>1. Acceptance of Terms:</strong> By accessing Sports Dynasty (sportsdynasty.in), you agree to comply with all applicable laws and terms.</p>
            <p><strong>2. Fair Use & Cricket Data:</strong> All real-time scorecards, fixtures, and standings are aggregated for fan informational, non-commercial, and sports journalism purposes.</p>
            <p><strong>3. Intellectual Property:</strong> Cricket team names and tournament marks are trademarks of their respective boards (e.g. BCCI, ICC, ECB, CA).</p>
        `
    },
    about: {
        title: "About Sports Dynasty",
        body: `
            <p><strong>Sports Dynasty</strong> is an ultra-fast, real-time cricket intelligence and live score platform designed for cricket enthusiasts across India and globally.</p>
            <p>Our mission is to deliver ball-by-ball scorecards, interactive stadium pitch maps, worm charts, wagon wheels, ICC team rankings, and breaking cricket headlines with zero latency and high visual fidelity.</p>
        `
    },
    contact: {
        title: "Contact & Editorial Support",
        body: `
            <p>Have editorial feedback, partnership inquiries, or advertising questions?</p>
            <div class="p-3 bg-slate-100 dark:bg-dark-800 rounded-lg space-y-1">
                <p>📧 <strong>Email:</strong> support@sportsdynasty.in</p>
                <p>🌐 <strong>Website:</strong> https://sportsdynasty.in</p>
                <p>📍 <strong>Platform:</strong> Sports Dynasty Digital Cricket Network</p>
            </div>
        `
    }
};

function openPolicyModal(type) {
    const data = policyContents[type] || policyContents.privacy;
    const modal = document.getElementById('policy-modal');
    const titleEl = document.getElementById('policy-title-text');
    const bodyEl = document.getElementById('policy-modal-body');
    
    if (titleEl) titleEl.textContent = data.title;
    if (bodyEl) bodyEl.innerHTML = data.body;
    
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);
    }
    safeCreateIcons();
}

function closePolicyModal() {
    const modal = document.getElementById('policy-modal');
    if (modal) {
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
}

// -------------------------------------------------------------
// UNIVERSAL PWA APP INSTALL PROMPT ENGINE (For All Visitors)
// -------------------------------------------------------------
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    // Show header install button
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) installBtn.classList.remove('hidden');
    
    // Show floating banner after 2.5s if not dismissed in this session
    if (!sessionStorage.getItem('sports_dynasty_pwa_dismissed')) {
        setTimeout(() => {
            const banner = document.getElementById('pwa-floating-banner');
            if (banner) {
                banner.classList.remove('translate-y-28', 'opacity-0');
            }
        }, 2500);
    }
});

function triggerPwaInstall() {
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIos) {
        const iosModal = document.getElementById('ios-install-modal');
        if (iosModal) {
            iosModal.classList.remove('hidden');
            setTimeout(() => iosModal.classList.remove('opacity-0'), 10);
            safeCreateIcons();
        }
        return;
    }
    
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User installed the Sports Dynasty PWA app!');
                dismissPwaBanner();
            }
            deferredPrompt = null;
        });
    } else {
        alert("To install Sports Dynasty:\n\n1. Tap your browser menu (3 dots).\n2. Tap 'Install app' or 'Add to Home screen'.");
    }
}

function dismissPwaBanner() {
    sessionStorage.setItem('sports_dynasty_pwa_dismissed', 'true');
    const banner = document.getElementById('pwa-floating-banner');
    if (banner) {
        banner.classList.add('translate-y-28', 'opacity-0');
    }
}

function closeIosInstallModal() {
    const iosModal = document.getElementById('ios-install-modal');
    if (iosModal) {
        iosModal.classList.add('opacity-0');
        setTimeout(() => iosModal.classList.add('hidden'), 300);
    }
}

// Auto-show floating install prompt for mobile visitors after 3 seconds
setTimeout(() => {
    if (!sessionStorage.getItem('sports_dynasty_pwa_dismissed') && window.innerWidth < 768) {
        const banner = document.getElementById('pwa-floating-banner');
        if (banner) {
            banner.classList.remove('translate-y-28', 'opacity-0');
            safeCreateIcons();
        }
    }
}, 3000);

// Initialize analytics and device view on startup
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initDeviceLayout();
        updateVisitorAnalytics(false);
        setInterval(() => updateVisitorAnalytics(true), 15000);
    });
} else {
    initDeviceLayout();
    updateVisitorAnalytics(false);
    setInterval(() => updateVisitorAnalytics(true), 15000);
}
