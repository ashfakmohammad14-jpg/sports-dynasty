
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

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initApp();
});

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

function initApp() {
    setupTabs();
    setupFilters();
    setupSearch();
    setupRefresh();
    startPollingTimer();
    fetchMatches(false);
}

// -------------------------------------------------------------
// API Data Fetching
// -------------------------------------------------------------

async function fetchMatches(silent = false) {
    const refreshIcon = document.getElementById('refresh-icon');
    if (refreshIcon) refreshIcon.classList.add('animate-spin');

    try {
        const resp = await fetch('/api/matches');
        if (!resp.ok) throw new Error('Network error fetching matches');
        const data = await resp.json();

        appState.matches = data.matches || [];
        appState.categories = data.categories || { live: [], recent: [], upcoming: [] };

        // Update counts
        const liveCountElem = document.getElementById('live-count');
        if (liveCountElem) liveCountElem.textContent = (appState.categories.live || []).length;
        
        const countBadge = document.getElementById('match-count-badge');
        if (countBadge) countBadge.textContent = `${appState.matches.length} Matches`;

        renderMatchList();

        // Auto select first match if none selected or selected not present
        if (appState.matches.length > 0 && !appState.selectedEventId) {
            const firstMatch = appState.categories.live.length > 0 ? appState.categories.live[0] : appState.matches[0];
            selectMatch(firstMatch.leagueId, firstMatch.id);
        } else if (appState.selectedLeagueId && appState.selectedEventId && silent) {
            fetchMatchDetails(appState.selectedLeagueId, appState.selectedEventId, true);
        }
    } catch (err) {
        console.error('Error fetching matches:', err);
    } finally {
        if (refreshIcon) {
            setTimeout(() => refreshIcon.classList.remove('animate-spin'), 400);
        }
    }
}

async function fetchMatchDetails(leagueId, eventId, silent = false, retryCount = 0) {
    if (!silent) {
        const heroContent = document.getElementById('match-hero-content');
        if (heroContent) {
            heroContent.innerHTML = `
                <div class="text-center py-10 text-slate-400">
                    <div class="animate-spin inline-block w-7 h-7 border-2 border-[#059669] border-t-transparent rounded-full mb-2"></div>
                    <p class="text-xs font-medium">Loading live Cricinfo match details & scorecard...</p>
                </div>
            `;
        }
    }

    try {
        const resp = await fetch(`/api/match/${leagueId}/${eventId}`);
        if (!resp.ok) throw new Error('Failed to fetch match details');
        const data = await resp.json();

        appState.currentMatchData = data;
        renderAllMatchDetails(data);
    } catch (err) {
        console.error('Error fetching match details:', err);
        if (retryCount < 2) {
            setTimeout(() => fetchMatchDetails(leagueId, eventId, silent, retryCount + 1), 800);
            return;
        }
        const heroContent = document.getElementById('match-hero-content');
        if (heroContent) {
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

function isTeamCurrentlyBatting(competitor, data) {
    if (!competitor) return false;
    const isLive = data.state && (data.state.toLowerCase() === 'in' || data.state.toLowerCase() === 'live');
    if (!isLive) return false;

    // Check if score string contains current overs e.g. '(34 ov)' or '(36.5 ov)'
    const s = String(competitor.score || '');
    if (s.includes('ov') && !s.toLowerCase().includes('all out')) {
        return true;
    }

    // Check latest innings teamName vs competitor name / abbreviation
    if (data.innings) {
        const intKeys = Object.keys(data.innings).filter(k => /^\d+$/.test(k)).map(Number);
        if (intKeys.length > 0) {
            const latestInn = data.innings[String(Math.max(...intKeys))];
            if (latestInn && latestInn.teamName) {
                const innTeam = latestInn.teamName.toUpperCase();
                const compName = (competitor.name || '').toUpperCase();
                const compAbbr = (competitor.abbr || '').toUpperCase();
                if (compAbbr && innTeam.includes(compAbbr)) return true;
                if (compName && (innTeam.includes(compName.split(' ')[0]) || compName.includes(innTeam.split(' ')[0]))) return true;
            }
        }
    }

    return false;
}

function renderMultiInningsScoreHTML(scoreStr, isTeamBattingNow = false, isLiveMatch = false, crrStr = "") {
    if (!scoreStr) {
        return `
            <div class="bg-slate-100/90 dark:bg-dark-900/90 border border-slate-200 dark:border-emerald-500/30 rounded-lg px-2.5 py-1 shadow-2xs text-right shrink-0">
                <div class="font-mono font-bold text-sm sm:text-base text-slate-400 dark:text-gray-500">-</div>
            </div>
        `;
    }

    const cleanStr = cleanScoreString(scoreStr);
    const crrBadge = (isTeamBattingNow && isLiveMatch && crrStr && crrStr !== '-' && crrStr !== '0.00')
        ? `<span class="inline-block text-[8px] sm:text-[9px] font-mono font-black text-emerald-800 dark:text-[#00ff88] bg-[#00ff88]/20 border border-[#00ff88]/50 px-1.5 py-0.2 rounded ml-1 tracking-normal select-none shadow-[0_0_8px_rgba(0,255,136,0.5)]">CRR ${crrStr}</span>`
        : '';

    if (cleanStr.includes('&')) {
        const parts = cleanStr.split('&');
        const inn1 = parts[0].trim();
        const inn2 = parts[1].trim();

        const inn2IsLive = isTeamBattingNow && isLiveMatch;

        return `
            <div class="flex items-center gap-1 sm:gap-1.5 text-right shrink-0">
                <!-- 1st Innings Glass Pod (Completed) -->
                <div class="bg-slate-100/90 dark:bg-dark-900/90 border border-slate-200/90 dark:border-emerald-500/30 rounded-lg px-2 py-0.5 sm:px-2.5 sm:py-1 shadow-2xs">
                    <div class="text-[8px] sm:text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-gray-400 flex items-center justify-end gap-1">
                        <span class="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0"></span>
                        <span>1st INN</span>
                    </div>
                    <div class="font-mono font-bold text-xs sm:text-sm text-slate-700 dark:text-gray-200 tracking-tight leading-tight">
                        ${inn1}
                    </div>
                </div>

                <!-- Divider Connector -->
                <div class="text-[9px] font-black px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-[#00ff88] border border-emerald-500/30 select-none shadow-2xs">
                    &
                </div>

                <!-- 2nd Innings Pod (Active 3D Neon Pod if Live, Glass Pod if Completed) -->
                ${inn2IsLive ? `
                    <div class="bg-emerald-500/15 dark:bg-emerald-950/80 border-2 border-[#00ff88] rounded-lg px-2 sm:px-2.5 py-0.5 sm:py-1 shadow-[0_0_20px_rgba(0,255,136,0.5),inset_0_0_10px_rgba(0,255,136,0.2)] ring-1 ring-[#00ff88]/50">
                        <div class="text-[8px] sm:text-[9px] font-black uppercase tracking-wider text-emerald-800 dark:text-[#00ff88] flex items-center justify-end gap-1">
                            <span class="w-1.5 h-1.5 rounded-full bg-[#00ff88] shadow-[0_0_8px_#00ff88] animate-ping shrink-0"></span>
                            <span class="font-black">2nd INN</span>
                            ${crrBadge}
                        </div>
                        <div class="digital-score-3d font-mono font-black text-sm sm:text-base md:text-lg text-emerald-800 dark:text-[#00ff88] drop-shadow-[0_0_12px_rgba(0,255,136,0.6)] tracking-tight leading-tight">
                            ${inn2}
                        </div>
                    </div>
                ` : `
                    <div class="bg-slate-100/90 dark:bg-dark-900/90 border border-slate-200/90 dark:border-emerald-500/30 rounded-lg px-2 py-0.5 sm:px-2.5 sm:py-1 shadow-2xs">
                        <div class="text-[8px] sm:text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-gray-400 flex items-center justify-end gap-1">
                            <span class="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0"></span>
                            <span>2nd INN</span>
                        </div>
                        <div class="font-mono font-bold text-xs sm:text-sm text-slate-700 dark:text-gray-200 tracking-tight leading-tight">
                            ${inn2}
                        </div>
                    </div>
                `}
            </div>
        `;
    }

    const inn1IsLive = isTeamBattingNow && isLiveMatch;

    return `
        <div class="${inn1IsLive ? 'bg-emerald-500/15 dark:bg-emerald-950/80 border-2 border-[#00ff88] shadow-[0_0_20px_rgba(0,255,136,0.5),inset_0_0_10px_rgba(0,255,136,0.2)] ring-1 ring-[#00ff88]/50' : 'bg-slate-100/90 dark:bg-dark-900/90 border border-slate-200/90 dark:border-emerald-500/30 shadow-2xs'} rounded-lg px-2.5 sm:px-3 py-1 sm:py-1.5 text-right shrink-0">
            <div class="text-[8px] sm:text-[9px] font-black uppercase tracking-wider ${inn1IsLive ? 'text-emerald-800 dark:text-[#00ff88]' : 'text-slate-400 dark:text-gray-400'} flex items-center justify-end gap-1">
                <span class="w-1.5 h-1.5 rounded-full ${inn1IsLive ? 'bg-[#00ff88] shadow-[0_0_8px_#00ff88] animate-ping' : 'bg-slate-400 dark:bg-slate-500'} shrink-0"></span>
                <span class="${inn1IsLive ? 'font-black' : ''}">1st INN ${inn1IsLive ? '(LIVE)' : ''}</span>
                ${inn1IsLive ? crrBadge : ''}
            </div>
            <div class="${inn1IsLive ? 'digital-score-3d text-emerald-800 dark:text-[#00ff88] drop-shadow-[0_0_12px_rgba(0,255,136,0.6)]' : 'text-slate-800 dark:text-gray-100 font-bold'} font-mono text-base sm:text-lg md:text-xl tracking-tight leading-tight">
                ${cleanStr}
            </div>
        </div>
    `;
}

// -------------------------------------------------------------
// UI Rendering - Matches Sidebar List
// -------------------------------------------------------------

function renderMatchList() {
    const container = document.getElementById('match-list-container');
    if (!container) return;

    let filtered = appState.matches;

    if (appState.activeCategory === 'live') {
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

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-slate-400 text-xs">
                <i data-lucide="inbox" class="w-6 h-6 mx-auto mb-2 opacity-50"></i>
                <p>No matches found.</p>
            </div>
        `;
        safeCreateIcons();
        return;
    }

    container.innerHTML = filtered.map(m => {
        const isActive = (m.id === appState.selectedEventId);
        const isLive = m.isLive;
        const statusText = m.statusDetail || (isLive ? '● LIVE' : 'Scheduled');
        const isStumps = statusText.toLowerCase().includes('stumps') || statusText.toLowerCase().includes('tea') || statusText.toLowerCase().includes('lunch');

        let statusClass = 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40';
        let displayStatus = statusText;

        if (isStumps) {
            statusClass = 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-400/60 dark:border-amber-600/70 shadow-xs font-black';
            displayStatus = statusText;
        } else if (isLive) {
            statusClass = 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60';
            displayStatus = '● LIVE';
        } else if (m.state.toLowerCase().includes('post') || m.state.toLowerCase().includes('final')) {
            statusClass = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-gray-300 border border-slate-200 dark:border-gray-700';
            displayStatus = m.statusDetail || 'Final';
        }

        const c1 = m.competitors && m.competitors[0] ? m.competitors[0] : { name: 'Team 1', score: '' };
        const c2 = m.competitors && m.competitors[1] ? m.competitors[1] : { name: 'Team 2', score: '' };

        const isMatchDone = Boolean(m.state && ['post', 'final', 'completed'].includes(m.state.toLowerCase()));
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

        return `
            <div onclick="selectMatch('${m.leagueId}', '${m.id}')" 
                 class="match-card p-3 rounded-xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-dark-800 cursor-pointer ${isActive ? 'active-match' : ''}">
                <div class="flex items-center justify-between gap-1.5 mb-1.5">
                    <div class="flex items-center gap-1.5 truncate max-w-[170px]">
                        <span class="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider truncate" title="${m.leagueName}">
                            ${m.leagueName}
                        </span>
                        ${m.inningsLabel ? `<span class="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold uppercase bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-emerald-300 border border-sky-200 dark:border-sky-800 shrink-0">${m.inningsLabel}</span>` : ''}
                    </div>
                    <span class="text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase shrink-0 ${statusClass}">
                        ${displayStatus}
                    </span>
                </div>

                <div class="space-y-1 text-xs">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-2 truncate">
                            ${renderTeamLogo(c1.name, c1.logo, 'w-5 h-5')}
                            <span class="font-bold text-slate-800 dark:text-gray-200 truncate ${c1.isWinner ? 'text-[#059669] dark:text-emerald-400' : ''}">${c1.name}</span>
                        </div>
                        <span class="font-mono font-bold text-slate-900 dark:text-white text-right">${cleanScoreString(c1.score)}</span>
                    </div>
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-2 truncate">
                            ${renderTeamLogo(c2.name, c2.logo, 'w-5 h-5')}
                            <span class="font-bold text-slate-800 dark:text-gray-200 truncate ${c2.isWinner ? 'text-[#059669] dark:text-emerald-400' : ''}">${c2.name}</span>
                        </div>
                        <span class="font-mono font-bold text-slate-900 dark:text-white text-right">${cleanScoreString(c2.score)}</span>
                    </div>
                </div>

                ${m.winProbability && (isLive || m.winProbability.isLive) ? `
                    <div class="mt-2 pt-1.5 border-t border-slate-100 dark:border-gray-800/80 flex items-center justify-between text-[10px] font-mono font-bold">
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
                ` : '')}
            </div>
        `;
    }).join('');

    safeCreateIcons();
}

function isMobileLayoutActive() {
    return window.innerWidth < 1024 || document.body.classList.contains('layout-mode-mobile');
}

function selectMatch(leagueId, eventId, autoScroll = false) {
    appState.selectedLeagueId = leagueId;
    appState.selectedEventId = eventId;
    renderMatchList();
    fetchMatchDetails(leagueId, eventId);

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
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
        safeCreateIcons();

        try {
            history.pushState({ matchView: eventId }, '', `#match-${eventId}`);
        } catch(e) {}
    } else {
        // Desktop View: Keep both carousel and details visible
        if (carouselSec) carouselSec.classList.remove('hidden');
        if (detailSec) detailSec.classList.remove('hidden');
        if (backBar) {
            backBar.classList.add('hidden');
            backBar.classList.remove('flex');
        }

        // Center active card in horizontal strip
        setTimeout(() => {
            const activeCard = document.querySelector('.match-card.active-match');
            if (activeCard) {
                activeCard.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
            if (autoScroll) {
                const heroElem = document.getElementById('match-hero-card');
                if (heroElem) {
                    heroElem.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        }, 100);
    }
}

function backToMatchList() {
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
        if (window.location.hash.startsWith('#match-')) {
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
    try { renderScorecardTab(data); } catch(e) { console.error("renderScorecardTab err:", e); }
    try { renderMatchCoverageTab(data); } catch(e) { console.error("renderMatchCoverageTab err:", e); }
    try { renderAnalyticsTab(data); } catch(e) { console.error("renderAnalyticsTab err:", e); }
    try { renderCommentaryTab(data); } catch(e) { console.error("renderCommentaryTab err:", e); }
    try { renderSquadsTab(data); } catch(e) { console.error("renderSquadsTab err:", e); }
    try { renderMatchInfoTab(data); } catch(e) { console.error("renderMatchInfoTab err:", e); }
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

function renderHeroBanner(data) {
    const container = document.getElementById('match-hero-content');
    if (!container) return;
    if (!data) return;

    try {
        const c1 = (data.competitors && data.competitors[0]) ? data.competitors[0] : { name: 'Team 1', score: '' };
        const c2 = (data.competitors && data.competitors[1]) ? data.competitors[1] : { name: 'Team 2', score: '' };

        const c1Name = String(c1.name || 'Team 1');
        const c2Name = String(c2.name || 'Team 2');
        const c1Abbr = String(c1.abbr || 'TM1');
        const c2Abbr = String(c2.abbr || 'TM2');
        const c1Score = String(c1.score || '');
        const c2Score = String(c2.score || '');

        const statusDetail = String(data.statusDetail || 'LIVE');
        const isLive = data.state ? (data.state.toLowerCase() === 'in' || data.state.toLowerCase() === 'live') : false;
        const isStumps = statusDetail.toLowerCase().includes('stumps') || statusDetail.toLowerCase().includes('tea') || statusDetail.toLowerCase().includes('lunch');

        let statusPill = '';
        if (isStumps) {
            statusPill = `<span class="text-[11px] font-black uppercase px-3 py-1 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.4)] flex items-center gap-1.5"><i data-lucide="moon" class="w-3.5 h-3.5"></i> ${statusDetail}</span>`;
        } else if (isLive) {
            statusPill = `<span class="pulse-live-badge text-[11px] font-black uppercase px-3 py-1 rounded-full flex items-center gap-1.5 shadow-[0_0_15px_rgba(239,68,68,0.7)] animate-broadcast-pulse"><span class="w-2 h-2 rounded-full bg-white animate-ping"></span> 3D LIVE ON AIR</span>`;
        } else {
            statusPill = `<span class="text-[11px] font-black uppercase px-3 py-1 rounded-full bg-slate-200 dark:bg-dark-800 text-slate-800 dark:text-emerald-300 border border-slate-300 dark:border-emerald-500/40 shadow-sm">${statusDetail}</span>`;
        }

        const isCompleted = data.state ? (data.state.toLowerCase() === 'post' || data.state.toLowerCase() === 'final' || data.state.toLowerCase() === 'completed') : false;
        let situationBanner = String(data.leadSummary || data.statusDetail || 'In Progress');

        // Sync sticky mobile back bar details
        const backTitle = document.getElementById('mobile-back-match-title');
        const backStatus = document.getElementById('mobile-back-match-status');
        if (backTitle) backTitle.textContent = `${c1Name} vs ${c2Name}`;
        if (backStatus) backStatus.textContent = situationBanner || statusDetail || '⚡ Live Match';

        const c1Winner = String(c1.isWinner) === 'true';
        const c2Winner = String(c2.isWinner) === 'true';

        if (isCompleted || statusDetail.toLowerCase().includes('won by') || statusDetail.toLowerCase().includes('drawn') || statusDetail.toLowerCase().includes('tied') || statusDetail.toLowerCase().includes('abandoned') || statusDetail.toLowerCase().includes('no result') || situationBanner.toLowerCase().includes('won by') || situationBanner.toLowerCase().includes('drawn')) {
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

        // Determine active batting team for dynamic 3D Active Pod highlighting
        const c1IsBatting = isTeamCurrentlyBatting(c1, data);
        const c2IsBatting = !c1IsBatting ? isTeamCurrentlyBatting(c2, data) : false;

        const displayBadge = data.currentInnings && data.currentInnings.displayBadge ? String(data.currentInnings.displayBadge) : '';

        container.innerHTML = `
            <div class="flex flex-col space-y-3">
                <!-- 3D Top Subtitle & Prev/Next Bar -->
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-500/20 pb-2 text-xs text-slate-500 dark:text-gray-400">
                    <div class="flex items-center gap-2.5">
                        ${statusPill}
                        <span class="font-bold truncate max-w-xl text-slate-700 dark:text-emerald-200 text-xs">${seriesText}</span>
                    </div>
                    <div class="flex items-center gap-2 text-slate-600 dark:text-gray-300 font-black text-xs">
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
                        ${renderMultiInningsScoreHTML(c1Score, c1IsBatting, isLive, currentCRR)}
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
                        ${renderMultiInningsScoreHTML(c2Score, c2IsBatting, isLive, currentCRR)}
                    </div>
                </div>

                <!-- Match Situation & 3D Telemetry Lower Third -->
                <div class="pt-2 border-t border-emerald-500/20 flex flex-wrap items-center justify-between gap-2">
                    <div class="text-sm sm:text-base font-black text-[#059669] dark:text-emerald-400 flex items-center gap-2 drop-shadow-xs">
                        <i data-lucide="zap" class="w-4 h-4 text-amber-400 animate-pulse"></i>
                        <span>${situationBanner}</span>
                        ${displayBadge ? `
                            <span class="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md uppercase tracking-wide border border-emerald-400/40">
                                ${displayBadge}
                            </span>
                        ` : ''}
                    </div>
                    <div class="text-[11px] sm:text-xs text-slate-600 dark:text-gray-300 font-bold flex flex-wrap items-center gap-2">
                        ${renderCompactWinProbBadge(data.winProbability, c1, c2, data.isTestMatch)}
                        ${currentCRR ? `<span class="bg-white/80 dark:bg-dark-900/90 px-3 py-1 rounded-lg border border-emerald-500/30 shadow-sm">CRR: <span class="font-mono font-black text-emerald-600 dark:text-emerald-400">${currentCRR}</span></span>` : ''}
                        ${last10 ? `<span class="bg-white/80 dark:bg-dark-900/90 px-3 py-1 rounded-lg border border-emerald-500/30 shadow-sm">Last 10: <span class="font-mono font-bold text-slate-800 dark:text-gray-200">${last10}</span></span>` : ''}
                    </div>
                </div>
            </div>
        `;
    } catch(err) {
        console.error("renderHeroBanner execution error:", err);
    }
}

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

function renderCricinfoLiveTab(data) {
    const container = document.getElementById('cricinfo-live-crease-table-container');
    if (!container) return;

    const crease = data.liveCrease;
    if (!crease) return;

    const batters = crease.batters || [];
    const bw = crease.activeBowler;
    const pb = crease.partnerBowler;

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
                            <div onclick="event.stopPropagation(); openPlayerProfile('${b.id || ''}', '${b.name.replace(/'/g, "\\'")}')" 
                                 class="flex items-center gap-1 min-w-0 cursor-pointer hover:opacity-80 transition group/p" title="View Profile & Stats of ${b.name}">
                                ${renderPlayerAvatar(b.name, b.headshot, 'w-4 h-4 sm:w-5 sm:h-5 group-hover/p:ring-2 group-hover/p:ring-[#00ff88] shrink-0')}
                                <span class="text-[#059669] dark:text-emerald-400 truncate group-hover/p:underline text-[11px] sm:text-xs ${isFacing ? 'font-black text-emerald-700 dark:text-[#00ff88]' : 'font-semibold'}">${b.name}</span>
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
                            <div onclick="event.stopPropagation(); openPlayerProfile('${b.id || ''}', '${b.name.replace(/'/g, "\\'")}')" 
                                 class="flex items-center gap-1 min-w-0 cursor-pointer hover:opacity-80 transition group/p" title="View Profile & Stats of ${b.name}">
                                ${renderPlayerAvatar(b.name, b.headshot, 'w-4 h-4 sm:w-5 sm:h-5 group-hover/p:ring-2 group-hover/p:ring-amber-400 shrink-0')}
                                <span class="text-[#059669] dark:text-emerald-400 truncate group-hover/p:underline text-[11px] sm:text-xs ${isBowlingNow ? 'font-black text-amber-700 dark:text-amber-300' : 'font-semibold'}">${b.name}</span>
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
    const lastWktOver = (lastWkt && lastWkt.overs) ? `Ov ${lastWkt.overs}` : '';
    const formattedPartnership = cleanPartnershipDisplay(crease.partnership);

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
                    <div class="py-1.5 px-2.5 rounded-lg border border-rose-500/30 dark:border-rose-500/40 bg-gradient-to-r from-rose-500/10 via-rose-500/5 to-transparent dark:from-rose-950/40 dark:via-dark-900 flex items-center justify-between gap-2 shadow-[0_0_10px_rgba(255,0,85,0.1)]">
                        <div class="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-rose-700 dark:text-[#ff4d6d] shrink-0 font-mono">
                            <i data-lucide="user-x" class="w-3.5 h-3.5 text-rose-500 drop-shadow-[0_0_6px_rgba(255,0,85,0.8)]"></i>
                            <span>Last Out</span>
                        </div>
                        <div class="font-semibold text-xs text-slate-800 dark:text-gray-200 truncate text-right font-sans" title="${fowList.length > 0 ? (crease.lastWicket || 'Wicket') : 'No wickets fallen in this innings yet'}">
                            ${fowList.length > 0 ? (crease.lastWicket ? crease.lastWicket : (fowList[fowList.length - 1].player + ' (' + (fowList[fowList.length - 1].score || '') + ')')) : 'No wickets fallen in this innings yet'}
                        </div>
                    </div>

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
        const fowC = document.getElementById('fow-cards-container');
        if (fowC) fowC.innerHTML = '';
        const partC = document.getElementById('partnerships-cards-container');
        if (partC) partC.innerHTML = '';
        return;
    }

    if (!inningsData[appState.activeInningsKey]) {
        appState.activeInningsKey = innKeys[innKeys.length - 1];
    }

    selectorContainer.innerHTML = innKeys.map((k, idx) => {
        const inn = inningsData[k];
        const isActive = (k === appState.activeInningsKey);
        const isCurrent = (idx === innKeys.length - 1 && data.state && (data.state.toLowerCase() === 'in' || data.state.toLowerCase() === 'live'));
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
                    class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${isActive ? 'bg-[#059669] text-white shadow-sm ring-1 ring-[#059669]' : 'bg-slate-100 dark:bg-dark-900 text-slate-600 dark:text-gray-400 hover:text-[#059669] dark:hover:text-white border border-slate-200 dark:border-gray-800'}">
                ${renderTeamLogo(inn.teamName || 'Team', compLogo, 'w-4 h-4')}
                <span>${innTitle}</span>
                ${isCurrent ? `<span class="text-[9px] px-1.5 py-0.2 rounded font-mono font-extrabold uppercase ${isActive ? 'bg-rose-600 text-white' : 'bg-rose-100 text-rose-600 border border-rose-200'}">LIVE</span>` : ''}
            </button>
        `;
    }).join('');

    renderActiveInningsScorecard(inningsData[appState.activeInningsKey]);
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

function renderActiveInningsScorecard(inn) {
    if (!inn) return;

    const batBody = document.getElementById('batting-table-body');
    if (batBody) {
        if (!inn.batting || inn.batting.length === 0) {
            batBody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-slate-400 text-sm font-medium">No batting records for this innings.</td></tr>`;
        } else {
            batBody.innerHTML = inn.batting.map(b => {
                const sr = (b.strikeRate && b.strikeRate !== '0.00') ? b.strikeRate : computeStrikeRate(b.runs, b.balls);
                const dismissalHtml = formatDismissalHTML(b.dismissal, b.isNotOut);
                return `
                    <tr class="hover:bg-slate-50 dark:hover:bg-dark-900/60 transition border-b border-slate-100 dark:border-gray-800/80">
                        <td class="py-2 px-2 text-left align-top" style="width: 44%;">
                            <div class="flex items-start gap-1.5 min-w-0">
                                <div onclick="openPlayerProfile('${b.id || ''}', '${b.name.replace(/'/g, "\\'")}')" 
                                     class="flex items-start gap-1.5 min-w-0 cursor-pointer hover:opacity-80 transition group/p w-full" title="View Profile & Stats of ${b.name}">
                                    ${renderPlayerAvatar(b.name, b.headshot, 'w-4 h-4 sm:w-5 sm:h-5 group-hover/p:ring-2 group-hover/p:ring-[#00ff88] shrink-0 mt-0.5')}
                                    <div class="min-w-0 flex-1">
                                        <div class="flex items-center gap-1">
                                            <span class="font-bold text-slate-900 dark:text-white group-hover/p:text-[#00ff88] group-hover/p:underline text-xs sm:text-sm truncate">${b.name}</span>
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
        }
    }

    const extrasElem = document.getElementById('extras-text');
    const totalElem = document.getElementById('total-text');
    if (extrasElem) extrasElem.textContent = inn.extras || '0';
    if (totalElem) totalElem.textContent = formatScorecardTotalWithRR(inn.total, inn.runs);

    const bwlBody = document.getElementById('bowling-table-body');
    if (bwlBody) {
        if (!inn.bowling || inn.bowling.length === 0) {
            bwlBody.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-slate-400 text-xs font-medium">No bowling records for this innings.</td></tr>`;
        } else {
            bwlBody.innerHTML = inn.bowling.map(bw => {
                const econ = (bw.economy && bw.economy !== '0.00' && bw.economy !== '0') ? bw.economy : computeEconomy(bw.overs, bw.runs);
                return `
                    <tr class="hover:bg-slate-50 dark:hover:bg-dark-900/60 transition border-b border-slate-100 dark:border-gray-800/80">
                        <td class="py-1.5 px-2 text-left truncate font-bold text-xs sm:text-sm text-slate-900 dark:text-white" style="width: 44%;">
                            <div class="flex items-center gap-1.5 min-w-0">
                                <div onclick="openPlayerProfile('${bw.id || ''}', '${bw.name.replace(/'/g, "\\'")}')" 
                                     class="flex items-center gap-1 min-w-0 cursor-pointer hover:opacity-80 transition group/p" title="View Profile & Stats of ${bw.name}">
                                    ${renderPlayerAvatar(bw.name, bw.headshot, 'w-4 h-4 sm:w-5 sm:h-5 group-hover/p:ring-2 group-hover/p:ring-amber-400 shrink-0')}
                                    <span class="truncate text-slate-900 dark:text-white group-hover/p:text-[#00ff88] group-hover/p:underline text-[11px] sm:text-xs">${bw.name}</span>
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

    container.innerHTML = squads.map(sq => `
        <div class="bg-white dark:bg-dark-900/80 p-4 rounded-xl border border-slate-200 dark:border-gray-800">
            <div class="flex items-center space-x-3 mb-4 pb-3 border-b border-slate-200 dark:border-gray-800">
                ${sq.teamLogo ? `<img src="${sq.teamLogo}" class="w-7 h-7 object-cover rounded shadow-sm border border-slate-200 dark:border-gray-700" onerror="this.style.display='none'">` : ''}
                <h4 class="font-bold text-slate-900 dark:text-white text-sm">${sq.teamName} Squad</h4>
            </div>
            <div class="space-y-1.5 max-h-80 overflow-y-auto pr-1 custom-scrollbar text-xs">
                ${(sq.players || []).map(p => `
                    <div onclick="openPlayerProfile('${p.id || ''}', '${p.name.replace(/'/g, "\\'")}')" 
                         class="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-dark-800/60 border border-slate-200 dark:border-gray-800/40 hover:border-[#00ff88] dark:hover:border-[#00ff88]/60 transition cursor-pointer group/sq" title="View Profile & Stats of ${p.name}">
                        <div class="flex items-center space-x-2">
                            <span class="font-bold text-slate-800 dark:text-gray-200 group-hover/sq:text-[#00ff88] group-hover/sq:underline">${p.name}</span>
                            ${p.captain ? '<span class="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-bold border border-amber-200 dark:border-amber-800">C</span>' : ''}
                            ${p.wicketKeeper ? '<span class="text-[10px] px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 font-bold border border-indigo-200 dark:border-indigo-800">WK</span>' : ''}
                        </div>
                        <span class="text-[11px] text-slate-500 dark:text-gray-400 group-hover/sq:text-emerald-400 font-mono">${p.role}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function renderMatchInfoTab(data) {
    const container = document.getElementById('match-info-content');
    if (!container) return;

    container.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
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
}

// -------------------------------------------------------------
// Interactive UI Handlers (Tabs, Search, Timers)
// -------------------------------------------------------------

function setupTabs() {
    const tabButtons = document.querySelectorAll('.cricinfo-tab-btn, .main-tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => {
                b.classList.remove('active', 'border-[#059669]', 'text-[#059669]', 'dark:border-sky-400', 'dark:text-emerald-400');
                b.classList.add('border-transparent', 'text-slate-500', 'dark:text-gray-400');
            });
            btn.classList.add('active', 'border-[#059669]', 'text-[#059669]', 'dark:border-sky-400', 'dark:text-emerald-400');
            btn.classList.remove('border-transparent', 'text-slate-500', 'dark:text-gray-400');

            const targetTab = btn.getAttribute('data-tab');
            appState.activeTab = targetTab;

            document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
            const activePane = document.getElementById(`tab-${targetTab}`);
            if (activePane) activePane.classList.remove('hidden');

            if (targetTab === 'analytics' && appState.currentMatchData) {
                renderAnalyticsTab(appState.currentMatchData);
            }
            safeCreateIcons();
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

            resultsContainer.innerHTML = players.map(p => `
                <div onclick="closePlayerSearchModal(); openEspnPlayerPage('${p.id}', '${p.name.replace(/'/g, "\\'")}')" 
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
            `).join('');
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
            return `
                <div class="hud-glass-panel rounded-2xl p-5 border border-slate-200/80 dark:border-emerald-500/30 shadow-lg space-y-4">
                    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 dark:border-gray-800 pb-3">
                        <div class="flex items-center space-x-3">
                            <div class="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-500 font-bold">
                                <i data-lucide="trophy" class="w-4 h-4 text-amber-400"></i>
                            </div>
                            <div>
                                <h3 class="text-base font-black text-slate-900 dark:text-white">${s.title}</h3>
                                <p class="text-xs text-slate-500 dark:text-gray-400">${s.dates} • <span class="font-bold text-emerald-600 dark:text-[#00ff88]">${s.type}</span> • ${s.teams}</p>
                            </div>
                        </div>
                        <span class="px-2.5 py-1 rounded-full text-xs font-mono font-bold ${s.status === 'Ongoing' ? 'bg-emerald-500/20 text-emerald-600 dark:text-[#00ff88] border border-emerald-500/40' : 'bg-slate-200 dark:bg-dark-800 text-slate-600 dark:text-gray-300'}">${s.status}</span>
                    </div>

                    ${hasStandings ? `
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr class="border-b border-slate-200 dark:border-gray-800 text-slate-400 font-mono text-[10px] uppercase">
                                        <th class="py-2 px-3">#</th>
                                        <th class="py-2 px-3">Team</th>
                                        <th class="py-2 px-2 text-right">PCT %</th>
                                        <th class="py-2 px-2 text-right">Played</th>
                                        <th class="py-2 px-2 text-right">Won</th>
                                        <th class="py-2 px-2 text-right">Lost</th>
                                        <th class="py-2 px-3 text-right">Points</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${s.standings.map((st, idx) => `
                                        <tr class="border-b border-slate-100 dark:border-gray-800/50 hover:bg-slate-50 dark:hover:bg-dark-800/60 transition font-medium">
                                            <td class="py-2 px-3 font-mono font-bold ${idx === 0 ? 'text-amber-500' : 'text-slate-500'}">${idx + 1}</td>
                                            <td class="py-2 px-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                                <span>${st.team}</span>
                                            </td>
                                            <td class="py-2 px-2 text-right font-mono font-black text-emerald-600 dark:text-[#00ff88]">${st.pct}%</td>
                                            <td class="py-2 px-2 text-right font-mono text-slate-700 dark:text-gray-300">${st.p}</td>
                                            <td class="py-2 px-2 text-right font-mono text-emerald-600 dark:text-emerald-400">${st.w}</td>
                                            <td class="py-2 px-2 text-right font-mono text-rose-500">${st.l}</td>
                                            <td class="py-2 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">${st.pts || (st.w * 12)}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : ''}

                    ${s.groups ? `
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                            ${s.groups.map(g => `<div class="p-3 rounded-xl bg-slate-50 dark:bg-dark-800/60 border border-slate-200 dark:border-gray-800 text-slate-700 dark:text-gray-300 font-medium">${g}</div>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        safeCreateIcons();
    } catch (e) {
        if (container) container.innerHTML = `<div class="p-8 text-center text-rose-500 text-xs">Error: ${e.message}</div>`;
    }
}

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
document.addEventListener('DOMContentLoaded', () => {
    initDeviceLayout();
    updateVisitorAnalytics(false);
    setInterval(() => updateVisitorAnalytics(true), 15000);
    startOneCardTimedAdEngine();
});

// Immediate execution fallback
setTimeout(() => {
    initDeviceLayout();
    updateVisitorAnalytics(false);
    startOneCardTimedAdEngine();
}, 200);

// -------------------------------------------------------------
// BROADCAST TIMED ONECARD SPONSOR ENGINE (20s Off / 30s On Loop)
// -------------------------------------------------------------
let oneCardEngineStarted = false;

function startOneCardTimedAdEngine() {
    if (oneCardEngineStarted) return;
    const banner = document.getElementById('onecard-timed-banner');
    const progressBar = document.getElementById('onecard-ad-progress');
    const countdownText = document.getElementById('onecard-countdown-text');
    if (!banner) return;
    oneCardEngineStarted = true;
    
    let isShowing = false;
    let countdownInterval = null;
    let remainingSeconds = 30;
    
    function showAd() {
        if (isShowing) return;
        isShowing = true;
        remainingSeconds = 30;
        
        banner.classList.remove('translate-y-48', 'opacity-0', 'pointer-events-none');
        banner.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto');
        
        if (progressBar) {
            progressBar.style.transition = 'none';
            progressBar.style.width = '100%';
            setTimeout(() => {
                progressBar.style.transition = 'width 30s linear';
                progressBar.style.width = '0%';
            }, 50);
        }
        
        if (countdownText) countdownText.textContent = '30s';
        clearInterval(countdownInterval);
        countdownInterval = setInterval(() => {
            remainingSeconds--;
            if (countdownText) countdownText.textContent = `${Math.max(remainingSeconds, 0)}s`;
            if (remainingSeconds <= 0) {
                clearInterval(countdownInterval);
                hideAd();
            }
        }, 1000);
        
        safeCreateIcons();
    }
    
    function hideAd() {
        if (!isShowing) return;
        isShowing = false;
        clearInterval(countdownInterval);
        
        banner.classList.add('translate-y-48', 'opacity-0', 'pointer-events-none');
        banner.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
        
        // Wait 20 seconds cooldown, then show again
        setTimeout(() => {
            showAd();
        }, 20000);
    }
    
    window.dismissOneCardAd = function() {
        hideAd();
    };
    
    // First display starts after 20 seconds of visitor browsing
    setTimeout(() => {
        showAd();
    }, 20000);
}







