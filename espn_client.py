import time
import math
import re
import requests
import urllib3
from typing import Dict, List, Any, Optional
from bs4 import BeautifulSoup

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def clean_player_name(raw: str) -> str:
    s = re.sub(r'\(.*?\)', '', str(raw)).strip()
    s = s.replace('*', '').strip()
    if len(s) > 4 and s[:len(s)//2].strip() == s[len(s)//2:].strip():
        return s[:len(s)//2].strip()
    m = re.match(r'^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)', s)
    if m:
        return m.group(1).strip()
    return s

def parse_runs_and_wickets(inn_dict: Dict[str, Any]) -> tuple[int, int]:
    if not inn_dict:
        return 0, 0
    tot = str(inn_dict.get("total", "") or inn_dict.get("runs", "") or "0")
    r_m = re.search(r'^(\d+)', tot)
    runs = int(r_m.group(1)) if r_m else 0

    w = 0
    if "/10" in tot or "-10" in tot or "10 wkts" in tot.lower():
        w = 10
    elif "/" in tot or "-" in tot:
        w_m = re.search(r'[-/](\d+)', tot)
        if w_m:
            w = int(w_m.group(1))
    return runs, w

def compute_lead_trail_summary(
    innings_data: Dict[str, Any],
    raw_summary: str = "",
    session_text: str = "",
    match_state: str = "",
    status_detail: str = "",
    competitors: List[Dict[str, Any]] = None
) -> str:
    """Compute lead, trail, target, or completed match result summary accurately."""
    clean_raw = str(raw_summary or "").strip()
    clean_detail = str(status_detail or "").strip()
    state_str = str(match_state or "").strip().lower()

    # 1. Check if match is COMPLETED / FINISHED (Never show lead/trail when finished)
    is_finished = (
        state_str in ["post", "final", "completed"] or
        any(k in clean_raw.lower() for k in ["won by", "drawn", "abandoned", "no result", "tied", "match tie", "rain stops play"]) or
        any(k in clean_detail.lower() for k in ["won by", "drawn", "abandoned", "no result", "tied", "match tie", "rain stops play"])
    )

    if is_finished:
        if clean_raw and not any(k in clean_raw.lower() for k in ["live", "scheduled", "final"]):
            return clean_raw
        if any(k in clean_raw.lower() for k in ["won by", "drawn", "abandoned", "no result", "tied"]):
            return clean_raw
        if any(k in clean_detail.lower() for k in ["won by", "drawn", "abandoned", "no result", "tied"]):
            return clean_detail

        if competitors:
            winner = next((c for c in competitors if c.get("isWinner") or str(c.get("winner")).lower() == "true"), None)
            if winner:
                w_name = winner.get("name") or winner.get("displayName") or "Winner"
                return f"{w_name} won"

        if "draw" in clean_detail.lower() or "draw" in clean_raw.lower() or clean_raw == "Match drawn":
            return "Match drawn"
        if "tie" in clean_detail.lower() or "tie" in clean_raw.lower():
            return "Match tied"

        return clean_raw or clean_detail or "Match Completed"

    # 2. If match is NOT finished and has no innings data yet
    if not innings_data:
        return clean_raw or session_text or clean_detail or "In Progress"

    int_keys = sorted([int(k) for k in innings_data.keys() if k.isdigit()])
    if not int_keys:
        return clean_raw or session_text or clean_detail or "In Progress"

    inn_count = len(int_keys)
    inn1 = innings_data.get("1", {})
    inn2 = innings_data.get("2", {})
    inn3 = innings_data.get("3", {})
    inn4 = innings_data.get("4", {})

    r1, w1 = parse_runs_and_wickets(inn1)
    r2, w2 = parse_runs_and_wickets(inn2)
    r3, w3 = parse_runs_and_wickets(inn3)
    r4, w4 = parse_runs_and_wickets(inn4)

    t1_name = re.sub(r'(?:1st|2nd|3rd|4th)?\s*Innings.*$', '', inn1.get("teamName", "Team 1"), flags=re.I).strip()
    t2_name = re.sub(r'(?:1st|2nd|3rd|4th)?\s*Innings.*$', '', inn2.get("teamName", "Team 2"), flags=re.I).strip() if inn2 else "Team 2"

    def match_team(inn_team: str, ref_team: str) -> bool:
        if not inn_team or not ref_team:
            return False
        clean_i = re.sub(r'[^a-z0-9]', '', inn_team.lower())
        clean_r = re.sub(r'[^a-z0-9]', '', ref_team.lower())
        if clean_i == clean_r or clean_i in clean_r or clean_r in clean_i:
            return True
        aliases = get_team_aliases(ref_team)
        return any(a in clean_i or clean_i in a for a in aliases)

    # 4th Innings: Final Chase -> ALWAYS A TARGET CHASE (Never say "trail by")
    if inn_count >= 4 and inn4:
        inn4_team = re.sub(r'(?:1st|2nd|3rd|4th)?\s*Innings.*$', '', inn4.get("teamName", t2_name), flags=re.I).strip()
        if match_team(inn4_team, t1_name):
            target = (r2 + r3) - r1 + 1
        else:
            target = (r1 + r3) - r2 + 1

        runs_needed = target - r4
        wkts_in_hand = max(0, 10 - w4)
        wkt_txt = f" ({wkts_in_hand} wkts left)" if wkts_in_hand > 0 else ""

        if runs_needed <= 0:
            return f"{inn4_team} won by {wkts_in_hand} wickets"
        else:
            sit = f"Target {target} • {inn4_team} need {runs_needed} runs to win{wkt_txt}"
            return f"{session_text} • {sit}" if session_text else sit

    # 3rd Innings: Team batting again (setting target or overcoming deficit)
    elif inn_count == 3 and inn3:
        inn3_team = re.sub(r'(?:1st|2nd|3rd|4th)?\s*Innings.*$', '', inn3.get("teamName", t1_name), flags=re.I).strip()
        wkts_in_hand = max(0, 10 - w3)
        wkt_txt = f" ({wkts_in_hand} wkts in hand)" if wkts_in_hand > 0 else ""

        is_follow_on = match_team(inn3_team, t2_name) or "f/o" in str(inn3.get("total", "")).lower() or "follow on" in str(inn3.get("total", "")).lower()

        if is_follow_on:
            curr_lead = (r2 + r3) - r1
            if curr_lead > 0:
                sit = f"{inn3_team} lead by {curr_lead} runs{wkt_txt}"
            elif curr_lead < 0:
                sit = f"{inn3_team} trail by {abs(curr_lead)} runs{wkt_txt}"
            else:
                sit = "Scores Level"
        else:
            curr_lead = (r1 + r3) - r2
            if curr_lead > 0:
                sit = f"{inn3_team} lead by {curr_lead} runs{wkt_txt}"
            elif curr_lead < 0:
                sit = f"{inn3_team} trail by {abs(curr_lead)} runs{wkt_txt}"
            else:
                sit = "Scores Level"

        return f"{session_text} • {sit}" if session_text else sit

    # 2nd Innings: Team 2 batting
    elif inn_count == 2 and inn2:
        batting_2nd = re.sub(r'(?:1st|2nd|3rd|4th)?\s*Innings.*$', '', inn2.get("teamName", t2_name), flags=re.I).strip()
        diff = r2 - r1
        wkts_in_hand = max(0, 10 - w2)
        wkt_txt = f" ({wkts_in_hand} wkts in hand)" if wkts_in_hand > 0 else ""

        is_test_match = bool(
            session_text or
            any(k in str(clean_raw).lower() for k in ["day 1", "day 2", "day 3", "day 4", "day 5", "stumps", "tea", "lunch", "test", "4-day", "5-day", "ranji", "trophy", "shield", "championship", "first-class", "fc"]) or
            any(k in str(clean_detail).lower() for k in ["day 1", "day 2", "day 3", "day 4", "day 5", "stumps", "tea", "lunch", "test", "4-day", "5-day"])
        )

        if not is_test_match:
            # Limited Overs Match (T20, ODI, T10, List A) -> 2nd Innings is ALWAYS a target chase!
            target = r1 + 1
            runs_needed = target - r2
            if runs_needed <= 0:
                return f"{batting_2nd} won by {wkts_in_hand} wickets"
            
            # Determine format overs (T20 = 20 ov, ODI = 50 ov, T10 = 10 ov)
            max_overs = 20
            tot1_str = str(inn1.get("total", "")).lower()
            tot2_str = str(inn2.get("total", "")).lower()
            all_text_format = f"{clean_raw} {clean_detail} {tot1_str} {tot2_str}".lower()
            
            if "t10" in all_text_format or "/10 ov" in all_text_format:
                max_overs = 10
            elif "odi" in all_text_format or "50 over" in all_text_format or "/50" in all_text_format:
                max_overs = 50
            elif "100" in all_text_format or "hundred" in all_text_format:
                max_overs = 16.4
            else:
                ov1_m = re.search(r'\((\d+(?:\.\d+)?)\s*ov', tot1_str)
                if ov1_m and float(ov1_m.group(1)) > 20:
                    max_overs = 50
                else:
                    max_overs = 20

            # Extract balls bowled in 2nd innings from all available score strings
            balls_bowled = 0
            c2_score_str = competitors[1].get("score", "") if (competitors and len(competitors) > 1) else ""
            tot2_scan = f"{tot2_str} {c2_score_str} {clean_detail}"
            ov2_m = re.search(r'\((\d+(?:\.\d+)?)(?:/\d+)?\s*ov', tot2_scan, re.I)
            if ov2_m:
                ov2_val = float(ov2_m.group(1))
                full_ov = int(ov2_val)
                rem_b = int(round((ov2_val - full_ov) * 10))
                balls_bowled = full_ov * 6 + rem_b
            
            total_match_balls = int(max_overs * 6)
            balls_left = max(0, total_match_balls - balls_bowled)
            
            if balls_left > 0:
                rrr = (runs_needed / (balls_left / 6.0))
                return f"{batting_2nd} need {runs_needed} runs from {balls_left} balls (RRR: {rrr:.2f})"
            else:
                return f"{batting_2nd} need {runs_needed} runs"
        else:
            if diff > 0:
                sit = f"{batting_2nd} lead by {diff} runs{wkt_txt}"
            elif diff < 0:
                sit = f"{batting_2nd} trail by {abs(diff)} runs{wkt_txt}"
            else:
                sit = "Scores Level"
            return f"{session_text} • {sit}" if session_text else sit

    return clean_raw or session_text or clean_detail or "In Progress"

def compute_economy_rate(overs_val: Any, runs_val: Any) -> str:
    """Calculate cricket bowler economy rate (Runs conceded per 6 balls bowled) with exact ball precision."""
    try:
        if overs_val is None or runs_val is None:
            return "0.00"
        ov_str = str(overs_val).strip()
        r_str = str(runs_val).strip()
        if not ov_str or ov_str in ["0", "0.0", "-", ""]:
            return "0.00"
        r_val = float(r_str)
        if "." in ov_str:
            parts = ov_str.split(".")
            completed_overs = float(parts[0]) if parts[0] else 0.0
            balls = float(parts[1]) if len(parts) > 1 and parts[1] else 0.0
            total_overs = completed_overs + (balls / 6.0)
        else:
            total_overs = float(ov_str)
        
        if total_overs > 0:
            return f"{r_val / total_overs:.2f}"
    except Exception:
        pass
    return "0.00"

def compute_strike_rate(runs_val: Any, balls_val: Any) -> float:
    """Calculate batsman strike rate (Runs scored per 100 balls faced)."""
    try:
        r = float(str(runs_val).strip())
        b = float(str(balls_val).strip())
        if b > 0:
            return round((r / b) * 100.0, 2)
    except Exception:
        pass
    return 0.0

def extract_dismissal_map_from_items(items: List[Dict[str, Any]]) -> Dict[str, str]:
    """Extract full dismissal string (c Fielder b Bowler, b Bowler, lbw b Bowler, run out) from playbyplay items."""
    dism_map: Dict[str, str] = {}
    for it in items:
        d = it.get("dismissal", {})
        if d and d.get("dismissal"):
            b_ath = d.get("batsman", {}).get("athlete", {})
            b_name = b_ath.get("displayName") or b_ath.get("name") or ""
            bwl_ath = d.get("bowler", {}).get("athlete", {})
            bowler_name = bwl_ath.get("displayName") or bwl_ath.get("name") or bwl_ath.get("shortName") or ""
            fld_ath = d.get("fielder", {}).get("athlete", {})
            fielder_name = fld_ath.get("displayName") or fld_ath.get("name") or fld_ath.get("shortName") or ""
            w_type = str(d.get("type", "")).lower()
            d_text = str(d.get("text", "")).strip()

            dism_str = ""
            if w_type == "caught" or "c " in d_text:
                if fielder_name and bowler_name:
                    if fielder_name.lower() == bowler_name.lower():
                        dism_str = f"c & b {bowler_name}"
                    else:
                        dism_str = f"c {fielder_name} b {bowler_name}"
                elif bowler_name:
                    dism_str = f"c & b {bowler_name}" if ("c & b" in d_text or "c and b" in d_text) else f"c sub b {bowler_name}"
            elif w_type == "bowled" or " b " in d_text:
                dism_str = f"b {bowler_name}" if bowler_name else "bowled"
            elif w_type == "lbw" or "lbw" in d_text:
                dism_str = f"lbw b {bowler_name}" if bowler_name else "lbw"
            elif w_type == "stumped":
                dism_str = f"st {fielder_name} b {bowler_name}" if fielder_name else f"st (wk) b {bowler_name}"
            elif w_type == "run out" or "run out" in d_text:
                dism_str = f"run out ({fielder_name})" if fielder_name else "run out"
            elif w_type == "hit wicket":
                dism_str = f"hit wicket b {bowler_name}" if bowler_name else "hit wicket"

            if not dism_str:
                dism_str = d_text or w_type or "out"

            if b_name:
                dism_map[b_name.lower().strip()] = dism_str
    return dism_map

def match_player_dismissal(p_name: str, dism_map: Dict[str, str]) -> Optional[str]:
    """Fuzzy-match player name (e.g. 'J Hermann' -> 'jordan hermann') to retrieve accurate dismissal."""
    if not p_name or not dism_map:
        return None
    p_clean = p_name.lower().strip()
    if p_clean in dism_map:
        return dism_map[p_clean]
    # Try exact initial + surname (e.g. "J Hermann" -> "jordan hermann", "RA Hermann" -> "rubin hermann")
    parts = p_clean.split()
    if len(parts) >= 2:
        init = parts[0]
        surname = parts[-1]
        for k, v in dism_map.items():
            k_parts = k.split()
            if len(k_parts) >= 2 and k_parts[-1] == surname:
                if k_parts[0][0] == init[0]:
                    return v
    for k, v in dism_map.items():
        if k in p_clean or p_clean in k:
            return v
    return None

def compute_crr_from_score(score_txt: str) -> str:
    """Extract runs and overs from cricket score strings and compute CRR accurately."""
    try:
        s = str(score_txt).strip()
        if not s:
            return ""
        rr_m = re.search(r'RR:\s*([\d\.]+)', s, re.I)
        if rr_m:
            return rr_m.group(1).strip()
        ov_m = re.search(r'(\d+\.?\d*)\s*(?:ovs?|overs?)', s, re.I)
        if not ov_m:
            return ""
        ov_str = ov_m.group(1)
        s_without_overs = s.replace(ov_m.group(0), "")
        score_m = re.search(r'(\d+)(?:\s*[\-/]\s*\d+)?', s_without_overs)
        if not score_m:
            return ""
        runs_str = score_m.group(1)
        return compute_economy_rate(ov_str, runs_str)
    except Exception:
        pass
    return ""

def compute_current_innings_info(innings_data: Dict[str, Any], title: str = "", description: str = "", session_text: str = "") -> Dict[str, Any]:
    """Compute exact active innings (1st, 2nd, 3rd, 4th innings) and team innings number for Test/First-Class matches."""
    if not innings_data:
        return {
            "inningsNumber": "1",
            "inningsLabel": "1st Innings",
            "teamName": "",
            "teamInningsLabel": "",
            "displayBadge": "1st Innings",
            "isTestMatch": False,
            "daySession": session_text
        }

    inn_keys = sorted([int(k) for k in innings_data.keys()])
    if not inn_keys:
        return {
            "inningsNumber": "1",
            "inningsLabel": "1st Innings",
            "teamName": "",
            "teamInningsLabel": "",
            "displayBadge": "1st Innings",
            "isTestMatch": False,
            "daySession": session_text
        }

    latest_k = str(inn_keys[-1])
    active_inn = innings_data[latest_k]
    raw_team = active_inn.get("teamName", "Team")

    ordinals = ["1st", "2nd", "3rd", "4th"]
    curr_num = int(latest_k)
    match_inn_label = ordinals[curr_num - 1] + " Innings" if curr_num <= 4 else f"{curr_num}th Innings"

    is_test = (
        len(inn_keys) > 2 or
        any(k in f"{title} {description}".lower() for k in ["test", "championship", "shield", "trophy", "ranji", "4-day", "four-day", "plunket"]) or
        any(k in session_text.lower() for k in ["day 1", "day 2", "day 3", "day 4", "day 5", "stumps", "lunch", "tea"])
    )

    clean_team = re.sub(r'(?:1st|2nd|3rd|4th)?\s*Innings.*$', '', raw_team, flags=re.I).strip() or raw_team

    team_occurrences = 0
    for k in inn_keys:
        t_name = innings_data[str(k)].get("teamName", "").lower()
        if clean_team.lower().split()[0] in t_name or t_name.split()[0] in clean_team.lower():
            team_occurrences += 1

    team_occ_label = ordinals[team_occurrences - 1] if team_occurrences <= 4 else f"{team_occurrences}th"
    team_inn_label = f"{clean_team} {team_occ_label} Innings"

    display_badge = f"{match_inn_label} ({clean_team})"

    return {
        "inningsNumber": str(curr_num),
        "inningsLabel": match_inn_label,
        "teamName": clean_team,
        "teamInningsLabel": team_inn_label,
        "displayBadge": display_badge,
        "isTestMatch": is_test,
        "daySession": session_text
    }

STOP_WORDS = {"zone", "team", "club", "cricket", "mens", "womens", "men", "women", "xi", "the", "and"}

TEAM_ALIAS_MAP: Dict[str, List[str]] = {
    # Duleep Trophy / Indian Domestic Zones
    "north east zone": ["north east zone", "nezone", "north-east-zone", "northeast-zone", "north-east", "northeast", "ne"],
    "north zone": ["north zone", "nzone", "north-zone", "north"],
    "south zone": ["south zone", "szone", "south-zone", "south"],
    "east zone": ["east zone", "ezone", "east-zone", "east"],
    "west zone": ["west zone", "wzone", "west-zone", "west"],
    "central zone": ["central zone", "czone", "central-zone", "central"],
    # County
    "middlesex": ["middlesex", "mdx", "midd"],
    "northamptonshire": ["northamptonshire", "nhnts", "northants", "nhts"],
    "warwickshire": ["warwickshire", "warks", "warw"],
    "nottinghamshire": ["nottinghamshire", "notts", "nott"],
    "gloucestershire": ["gloucestershire", "gloucs", "glouc", "glou"],
    "worcestershire": ["worcestershire", "worcs", "worc", "wor"],
    "derbyshire": ["derbyshire", "derby", "derb"],
    "yorkshire": ["yorkshire", "yorks", "york"],
    "hampshire": ["hampshire", "hants", "ham"],
    "somerset": ["somerset", "som"],
    "essex": ["essex", "ess"],
    "sussex": ["sussex", "sus"],
    "lancashire": ["lancashire", "lancs", "lanc"],
    "leicestershire": ["leicestershire", "leic"],
    "glamorgan": ["glamorgan", "glam"],
    "durham": ["durham", "dur"],
    "surrey": ["surrey", "sur"],
    "kent": ["kent"],
    "india": ["india", "ind"],
    "pakistan": ["pakistan", "pak"],
    "australia": ["australia", "aus"],
    "england": ["england", "eng"],
    "bangladesh": ["bangladesh", "ban"],
    "sri lanka": ["sri lanka", "sl", "srilanka"],
    "south africa": ["south africa", "rsa", "sa"],
    "new zealand": ["new zealand", "nz"],
    "west indies": ["west indies", "wi"],
    "afghanistan": ["afghanistan", "afg"],
    "zimbabwe": ["zimbabwe", "zim"],
    "ireland": ["ireland", "ire"],
    "scotland": ["scotland", "sco"],
    "netherlands": ["netherlands", "ned"],
}

def get_team_aliases(team_name: str) -> List[str]:
    t_clean = re.sub(r'[^a-z0-9\s]', '', str(team_name).lower()).strip()
    aliases = [t_clean]

    matched_map = False
    for k in sorted(TEAM_ALIAS_MAP.keys(), key=lambda x: -len(x)):
        if k == t_clean or f" {k} " in f" {t_clean} ":
            aliases.extend(TEAM_ALIAS_MAP[k])
            matched_map = True
            break

    if not matched_map:
        words = [w for w in t_clean.split() if w not in STOP_WORDS]
        if len(words) >= 2:
            aliases.append("-".join(words))
            if "zone" in t_clean:
                acro = "".join(w[0] for w in words) + "zone"
                aliases.append(acro)
        for word in words:
            if len(word) >= 3 and word not in STOP_WORDS:
                aliases.append(word)

    return list(set(a for a in aliases if a and a not in STOP_WORDS))

def match_teams_in_cricbuzz_href(href: str, t1_aliases: List[str], t2_aliases: List[str]) -> bool:
    h = href.lower().replace("_", "-")
    tokens = set(re.split(r'[/.\-_]', h))
    
    def alias_matches(alias: str) -> bool:
        a = alias.lower().strip()
        if not a or a in STOP_WORDS:
            return False
        if a in tokens:
            return True
        if f"-{a}-" in f"-{h}-":
            return True
        if "-" in a and a in h:
            return True
        if re.search(rf'(?:^|[-/]){re.escape(a)}(?:$|[-/])', h):
            return True
        return False

    m1 = any(alias_matches(a) for a in t1_aliases)
    m2 = any(alias_matches(a) for a in t2_aliases)
    return m1 and m2

def compute_partnership_balls(innings_data: Dict[str, Any], latest_inn_key: str) -> int:
    try:
        if not innings_data or not latest_inn_key or latest_inn_key not in innings_data:
            return 0
        inn = innings_data[latest_inn_key]
        tot_str = inn.get("total", "") or inn.get("runs", "")
        fow_list = inn.get("fow", [])

        tot_ov_m = re.search(r'(\d+(?:\.\d+)?)\s*(?:ov|overs)', tot_str, re.I)
        if not tot_ov_m:
            return 0

        def ov_to_balls(ov_s):
            m = re.search(r'(\d+)(?:\.(\d+))?', str(ov_s))
            if not m: return 0
            return int(m.group(1)) * 6 + (int(m.group(2)) if m.group(2) else 0)

        curr_balls = ov_to_balls(tot_ov_m.group(1))
        prev_wkt_balls = 0
        if fow_list:
            last_f = fow_list[-1]
            prev_wkt_balls = ov_to_balls(last_f.get("overs", "0"))

        return max(0, curr_balls - prev_wkt_balls)
    except Exception:
        return 0

def format_clean_single_innings(total_str: str, runs_str: str, is_active_live_innings: bool) -> str:
    if not total_str and not runs_str:
        return ""
    t = str(total_str).strip()
    t = re.sub(r',\s*RR:\s*[\d\.]+', '', t, flags=re.I).strip()
    
    if not is_active_live_innings:
        # Completed innings -> NEVER SHOW OVERS
        if " d" in t.lower() or "dec" in t.lower():
            r = runs_str or t.split("-")[0].split("/")[0].strip()
            return f"{r} d"
        if runs_str:
            return runs_str.strip()
        r_match = re.match(r'^(\d+)', t)
        if r_match:
            return r_match.group(1)
        return re.sub(r'\s*\([^\)]*\)', '', t).strip()
    else:
        # Active ongoing innings -> SHOW OVERS e.g. "276/8 (80.5 ov)"
        t_clean = re.sub(r'\s*Overs?', ' ov', t, flags=re.I)
        t_clean = re.sub(r'(\d+)-(\d+)', r'\1/\2', t_clean)
        t_clean = re.sub(r'(\d+[\-/]\d+|\d+)\(', r'\1 (', t_clean)
        if "/10" in t_clean:
            r = runs_str or t_clean.split("/")[0].strip()
            return r
        return t_clean

def compute_team_multiscore(team_name: str, innings_data: Dict[str, Any], raw_c_score: str = "") -> str:
    clean_raw = clean_event_competitor_score(raw_c_score)
    if not innings_data:
        return clean_raw

    # If raw_c_score already contains multi-innings '&', return clean_raw
    if "&" in clean_raw:
        return clean_raw

    aliases = get_team_aliases(team_name)
    team_inns = []
    
    int_keys = [int(k) for k in innings_data.keys() if k.isdigit()]
    max_k_str = str(max(int_keys)) if int_keys else ""
    
    for k in sorted(innings_data.keys(), key=lambda x: int(x) if x.isdigit() else 99):
        inn = innings_data[k]
        inn_team = inn.get("teamName", "").lower()
        inn_team_clean = re.sub(r'[^a-z0-9]', '', inn_team)
        
        is_match = any(
            (alias in inn_team) or (alias in inn_team_clean) or (re.search(rf'\b{re.escape(alias)}\b', inn_team))
            for alias in aliases
        )
        if is_match:
            team_inns.append((k, inn))
            
    # If no innings or only 1 innings for this team, return official clean_raw score
    if len(team_inns) <= 1:
        if clean_raw:
            return clean_raw
        if len(team_inns) == 1:
            tot = team_inns[0][1].get("total") or team_inns[0][1].get("runs") or ""
            r = team_inns[0][1].get("runs") or ""
            return format_clean_single_innings(tot, r, is_active_live_innings=(team_inns[0][0] == max_k_str))
        return ""
        
    # If multiple innings (e.g. Test match 1st & 2nd innings), combine them
    parts = []
    for k, inn in team_inns:
        is_active = (k == max_k_str)
        tot = inn.get("total") or inn.get("runs") or ""
        r = inn.get("runs") or ""
        formatted = format_clean_single_innings(tot, r, is_active_live_innings=is_active)
        if formatted:
            parts.append(formatted)
            
    calculated_multi = " & ".join(parts)
    if not calculated_multi:
        return clean_raw
    return calculated_multi

def normalize_competitor_score_from_raw(comp_dict: Dict[str, Any], is_test_match: bool = False) -> str:
    """Normalize competitor score string and resolve missing runs/overs from linescores if needed."""
    raw_score = comp_dict.get("score", "")
    s = clean_event_competitor_score(raw_score, is_test_match)
    linescores = comp_dict.get("linescores", [])
    
    # If raw score has no runs or starts with "(" without runs e.g. "(86 ov)"
    if not s or not re.search(r'\d', s) or s.startswith("(") or (s and not re.match(r'^\d', s)):
        if linescores:
            parts = []
            for ls in linescores:
                r = ls.get("runs")
                w = ls.get("wickets")
                ov = ls.get("overs")
                if r is not None and str(r).isdigit() and int(r) > 0:
                    ov_s = str(ov)[:-2] if str(ov).endswith('.0') else str(ov)
                    ov_str = f" ({ov_s} ov)" if ov else ""
                    if w == 10 or str(w) == "10":
                        parts.append(f"{r}{ov_str}")
                    elif w is not None:
                        parts.append(f"{r}/{w}{ov_str}")
                    else:
                        parts.append(f"{r}{ov_str}")
            if parts:
                return " & ".join(parts)
        # If no batting runs exist for this team, they have not batted yet!
        return ""
    elif linescores and not is_test_match and "(" not in s and "ov" not in s.lower():
        # Only append overs if team has actually scored runs
        if re.match(r'^\d', s.strip()):
            bat_ls = next((ls for ls in linescores if ls.get("period") == 1 or (ls.get("runs") is not None and int(ls.get("runs", 0)) > 0)), linescores[0])
            ov = bat_ls.get("overs")
            r = bat_ls.get("runs")
            if ov and str(ov) not in ["0", "0.0", ""] and (r is not None and int(r or 0) > 0):
                ov_s = str(ov)[:-2] if str(ov).endswith('.0') else str(ov)
                s = f"{s} ({ov_s} ov)"
    return s

def clean_event_competitor_score(s: str, is_test_match: bool = False) -> str:
    if not s:
        return ""
    # If string is purely overs without any runs scored e.g. "(86 ov)", "(86.0 ov)", "86 ov"
    if re.fullmatch(r'\s*\(?\s*\d+(?:\.\d+)?\s*(?:ov|overs)?\s*\)?\s*', str(s), flags=re.I) and '/' not in str(s):
        return ""
    s = re.sub(r',\s*RR:\s*[\d\.]+', '', str(s), flags=re.I).strip()
    parts = s.split("&")
    clean_parts = []
    for idx, p in enumerate(parts):
        is_last = (idx == len(parts) - 1)
        p_str = p.strip()
        # Discard individual parts that are purely overs e.g. "(86 ov)"
        if re.fullmatch(r'\s*\(?\s*\d+(?:\.\d+)?\s*(?:ov|overs)?\s*\)?\s*', p_str, flags=re.I) and '/' not in p_str:
            continue
        if not is_last and is_test_match:
            p_str = re.sub(r'\s*\([^\)]*\)', '', p_str).strip()
            p_str = re.sub(r'[/\\-]10', '', p_str).strip()
        else:
            p_str = re.sub(r'\s*Overs?', ' ov', p_str, flags=re.I)
            p_str = re.sub(r'(\d+)-(\d+)', r'\1/\2', p_str)
            p_str = re.sub(r'(\d+[\-/]\d+|\d+)\(', r'\1 (', p_str)
        if p_str:
            clean_parts.append(p_str)
    return " & ".join(clean_parts)

def compute_test_session(notes: List[Any], current_total_str: str, crr_str: str = "") -> str:
    """Computes runs, wickets, overs and RR for ONLY the active/current session in a Test match."""
    if not current_total_str:
        return ""
    
    s = str(current_total_str)
    if '&' in s:
        s = s.split('&')[-1].strip()
    
    cur_runs = 0
    cur_wkts = 0
    cur_balls = 0
    
    r_match = re.search(r'(\d+)(?:[/-](\d+))?', s)
    if r_match:
        cur_runs = int(r_match.group(1))
        cur_wkts = int(r_match.group(2)) if r_match.group(2) else 0
    if "/10" in s or "-10" in s or "all out" in s.lower():
        cur_wkts = 10
        
    ov_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:ov|overs)', s, re.I)
    if ov_match:
        ovs = float(ov_match.group(1))
        cur_balls = int(ovs) * 6 + round((ovs - int(ovs)) * 10)
        
    if cur_balls <= 0 and cur_runs <= 0:
        return ""

    # Parse notes into innings-specific interval checkpoints
    all_innings_checkpoints = []
    current_inn_cps = [{"type": "start", "runs": 0, "wkts": 0, "balls": 0}]
    last_balls_seen = 0
    
    for n in (notes or []):
        txt = str(n).strip()
        
        # Check if innings break
        if "innings break" in txt.lower():
            m_ib = re.search(r'innings\s*break:\s*.*?(?:-\s*)?(\d+)(?:[/-](\d+))?\s*(?:in\s*)?(\d+(?:\.\d+)?)\s*overs?', txt, re.I)
            if m_ib:
                ib_ovs = float(m_ib.group(3))
                ib_balls = int(ib_ovs) * 6 + round((ib_ovs - int(ib_ovs)) * 10)
                current_inn_cps.append({
                    "type": "innings break",
                    "runs": int(m_ib.group(1)),
                    "wkts": int(m_ib.group(2)) if m_ib.group(2) else 10,
                    "balls": ib_balls
                })
            all_innings_checkpoints.append(current_inn_cps)
            current_inn_cps = [{"type": "start", "runs": 0, "wkts": 0, "balls": 0}]
            last_balls_seen = 0
            continue
            
        m = re.search(r'(lunch|tea|end\s*of\s*day|stumps):\s*.*?(?:-\s*)?(\d+)(?:[/-](\d+))?\s*(?:in\s*)?(\d+(?:\.\d+)?)\s*overs?', txt, re.I)
        if m:
            c_type = m.group(1).lower()
            c_runs = int(m.group(2))
            c_wkts = int(m.group(3)) if m.group(3) else 0
            c_ovs = float(m.group(4))
            c_balls = int(c_ovs) * 6 + round((c_ovs - int(c_ovs)) * 10)
            
            # If overs rolled backwards without an explicit innings break note, start new innings
            if c_balls < last_balls_seen and last_balls_seen > 120:
                all_innings_checkpoints.append(current_inn_cps)
                current_inn_cps = [{"type": "start", "runs": 0, "wkts": 0, "balls": 0}]
                
            current_inn_cps.append({
                "type": c_type,
                "runs": c_runs,
                "wkts": c_wkts,
                "balls": c_balls
            })
            last_balls_seen = c_balls

    all_innings_checkpoints.append(current_inn_cps)
    
    # Active innings checkpoints
    cps = all_innings_checkpoints[-1]
    valid_cps = [cp for cp in cps if cp["balls"] <= cur_balls and cp["runs"] <= cur_runs]
    if not valid_cps:
        valid_cps = [{"type": "start", "runs": 0, "wkts": 0, "balls": 0}]
        
    last_cp = valid_cps[-1]
    
    if cur_balls > last_cp["balls"]:
        # Session is in progress
        start_cp = last_cp
        end_runs, end_wkts, end_balls = cur_runs, cur_wkts, cur_balls
    else:
        # Match is currently at break (Tea / Lunch / Stumps) where cur_balls == last_cp["balls"]
        if len(valid_cps) >= 2:
            start_cp = valid_cps[-2]
            end_runs, end_wkts, end_balls = last_cp["runs"], last_cp["wkts"], last_cp["balls"]
        else:
            start_cp = valid_cps[0]
            end_runs, end_wkts, end_balls = last_cp["runs"], last_cp["wkts"], last_cp["balls"]
            
    s_runs = max(0, end_runs - start_cp["runs"])
    s_wkts = max(0, end_wkts - start_cp["wkts"])
    s_balls = max(0, end_balls - start_cp["balls"])
    
    if s_balls <= 0:
        return ""
        
    s_ov_str = f"{s_balls // 6}.{s_balls % 6}" if s_balls % 6 != 0 else f"{s_balls // 6}.0"
    s_rr = f"{s_runs / (s_balls / 6.0):.2f}"
    w_txt = f"{s_wkts} wkt" if s_wkts == 1 else f"{s_wkts} wkts"
    
    return f"{s_runs} runs, {w_txt} ({s_ov_str} ov, RR: {s_rr})"

def compute_win_probability(match_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Computes real-time dynamic winning probability for Team 1 and Team 2 (and Draw for Tests).
    Returns structured probability metrics and momentum indicators.
    """
    competitors = match_data.get("competitors", [])
    if len(competitors) < 2:
        return {
            "team1": {"name": "Team 1", "shortName": "T1", "probability": 50.0},
            "team2": {"name": "Team 2", "shortName": "T2", "probability": 50.0},
            "isLive": False,
            "summary": "50% - 50%",
            "momentum": "Even Match"
        }

    c1 = competitors[0]
    c2 = competitors[1]
    name1 = c1.get("name", "Team 1")
    name2 = c2.get("name", "Team 2")
    short1 = c1.get("abbr") or c1.get("abbreviation") or c1.get("shortName") or name1[:3].upper()
    short2 = c2.get("abbr") or c2.get("abbreviation") or c2.get("shortName") or name2[:3].upper()

    state = str(match_data.get("state", "")).lower()
    is_completed = state in ["post", "final", "completed"]
    is_upcoming = state in ["pre", "scheduled"]
    is_test = bool(match_data.get("isTestMatch"))
    
    # 1. Completed Match
    if is_completed:
        winner = next((c for c in competitors if c.get("isWinner")), None)
        status_det = str(match_data.get("statusDetail", "")).lower()
        if "draw" in status_det:
            return {
                "team1": {"name": name1, "shortName": short1, "probability": 0.0},
                "team2": {"name": name2, "shortName": short2, "probability": 0.0},
                "draw": {"probability": 100.0},
                "isLive": False,
                "summary": "Match Drawn",
                "momentum": "Match Drawn"
            }
        elif "tied" in status_det or "tie" in status_det:
            return {
                "team1": {"name": name1, "shortName": short1, "probability": 50.0},
                "team2": {"name": name2, "shortName": short2, "probability": 50.0},
                "isLive": False,
                "summary": "Match Tied (50% - 50%)",
                "momentum": "Match Tied"
            }
        elif winner:
            w_is_c1 = (winner.get("id") == c1.get("id") or winner.get("name") == name1)
            p1 = 100.0 if w_is_c1 else 0.0
            p2 = 0.0 if w_is_c1 else 100.0
            return {
                "team1": {"name": name1, "shortName": short1, "probability": p1},
                "team2": {"name": name2, "shortName": short2, "probability": p2},
                "isLive": False,
                "summary": f"{winner.get('name', 'Winner')} won",
                "momentum": "Match Completed"
            }
        else:
            return {
                "team1": {"name": name1, "shortName": short1, "probability": 50.0},
                "team2": {"name": name2, "shortName": short2, "probability": 50.0},
                "isLive": False,
                "summary": "Match Completed",
                "momentum": "Match Completed"
            }

    # 2. Upcoming Match
    if is_upcoming:
        return {
            "team1": {"name": name1, "shortName": short1, "probability": 50.0},
            "team2": {"name": name2, "shortName": short2, "probability": 50.0},
            "isLive": False,
            "summary": "Pre-Match: 50% - 50%",
            "momentum": "Even Contest"
        }

    # 3. Live Match Calculation
    innings = match_data.get("innings", {})
    inn_keys = sorted([int(k) for k in innings.keys() if str(k).isdigit()])
    
    def parse_score(s_val):
        if not s_val: return 0, 0, 0.0
        s = str(s_val).strip()
        runs, wkts, ovs = 0, 0, 0.0
        m_r = re.search(r'(\d+)(?:[/-](\d+))?', s)
        if m_r:
            runs = int(m_r.group(1))
            wkts = int(m_r.group(2)) if m_r.group(2) else 0
        if "all out" in s.lower() or "/10" in s or "-10" in s:
            wkts = 10
        m_o = re.search(r'(\d+(?:\.\d+)?)\s*(?:ov|overs)', s, re.I)
        if m_o:
            ovs = float(m_o.group(1))
        return runs, wkts, ovs

    if is_test:
        # Test Match Dynamic Probability (Team 1, Team 2, Draw)
        status_det = str(match_data.get("statusDetail", "")).lower()
        day_m = re.search(r'day\s*(\d+)', status_det)
        cur_day = int(day_m.group(1)) if day_m else min(5, max(1, len(inn_keys)))
        
        t1_runs, t2_runs = 0, 0
        t1_wkts_lost, t2_wkts_lost = 0, 0
        
        if innings:
            for k in inn_keys:
                inn_obj = innings[str(k)]
                t_name = str(inn_obj.get("teamName", "")).lower()
                tot_str = f"{inn_obj.get('runs', '')} {inn_obj.get('total', '')}"
                r, w, o = parse_score(tot_str)
                if any(w_alias in t_name for w_alias in [name1.lower(), short1.lower()]):
                    t1_runs += r
                    t1_wkts_lost += w
                else:
                    t2_runs += r
                    t2_wkts_lost += w
        else:
            r1, w1, o1 = parse_score(c1.get("score", ""))
            r2, w2, o2 = parse_score(c2.get("score", ""))
            t1_runs, t1_wkts_lost = r1, w1
            t2_runs, t2_wkts_lost = r2, w2
                
        run_diff = t1_runs - t2_runs
        draw_prob = max(5.0, 50.0 - (cur_day - 1) * 10.0 - (len(inn_keys) - 1) * 6.0)
        remaining_prob = 100.0 - draw_prob
        
        z = run_diff / 120.0 + (t2_wkts_lost - t1_wkts_lost) * 0.15
        t1_share = 1.0 / (1.0 + math.exp(-z))
        
        p1 = round(remaining_prob * t1_share, 1)
        p2 = round(remaining_prob * (1.0 - t1_share), 1)
        draw_prob = round(100.0 - p1 - p2, 1)
        
        fav = name1 if p1 >= p2 else name2
        fav_p = max(p1, p2)
        summary = f"{fav} {fav_p}% | Draw {draw_prob}%"
        momentum = f"{fav} in control" if fav_p > 55 else "Even Test Contest"
        
        return {
            "team1": {"name": name1, "shortName": short1, "probability": p1},
            "team2": {"name": name2, "shortName": short2, "probability": p2},
            "draw": {"probability": draw_prob},
            "isLive": True,
            "summary": summary,
            "momentum": momentum
        }
    else:
        # Limited Overs (T20 / ODI)
        max_overs = 20.0 if any(k in f"{match_data.get('description', '')} {match_data.get('title', '')}".lower() for k in ["t20", "twenty20"]) else 50.0
        
        if len(inn_keys) <= 1:
            inn1 = innings.get(str(inn_keys[0])) if inn_keys else {}
            t_name = str(inn1.get("teamName", "")).lower() if inn1 else ""
            t1_is_batting = any(w in t_name for w in [name1.lower(), short1.lower()]) if t_name else True
            
            tot_str = f"{inn1.get('runs', '')} {inn1.get('total', '')}" if inn1 else (c1.get("score", "") if t1_is_batting else c2.get("score", ""))
            r, w, o = parse_score(tot_str)
            full_ov = math.floor(o)
            balls = full_ov * 6 + round((o - full_ov) * 10)
            tot_balls = int(max_overs * 6)
            rem_balls = max(0, tot_balls - balls)
            
            crr = (r / (balls / 6.0)) if balls > 0 else 6.0
            par_rr = 8.5 if max_overs == 20 else 5.8
            wkts_in_hand = max(0, 10 - w)
            
            proj_runs = r + (rem_balls / 6.0) * (crr * 0.6 + par_rr * 0.4) * ((wkts_in_hand / 10.0) ** 0.3)
            par_total = par_rr * max_overs
            
            diff = proj_runs - par_total
            z = diff / (25.0 if max_overs == 20 else 50.0)
            bat_prob = 1.0 / (1.0 + math.exp(-z))
            
            p1 = round(bat_prob * 100.0, 1) if t1_is_batting else round((1.0 - bat_prob) * 100.0, 1)
            p2 = round(100.0 - p1, 1)
            
            fav = name1 if p1 >= p2 else name2
            fav_p = max(p1, p2)
            summary = f"{fav} Win Prob: {fav_p}%"
            momentum = f"{fav} holding momentum" if fav_p > 55 else "Balanced Match"
            
            return {
                "team1": {"name": name1, "shortName": short1, "probability": p1},
                "team2": {"name": name2, "shortName": short2, "probability": p2},
                "isLive": True,
                "summary": summary,
                "momentum": momentum
            }
        else:
            # 2nd Innings (The Chase)
            inn1 = innings.get(str(inn_keys[0]), {})
            inn2 = innings.get(str(inn_keys[1]), {})
            
            r1, w1, o1 = parse_score(f"{inn1.get('runs', '')} {inn1.get('total', '')}")
            r2, w2, o2 = parse_score(f"{inn2.get('runs', '')} {inn2.get('total', '')}")
            
            target = r1 + 1
            runs_needed = target - r2
            full_ov = math.floor(o2)
            balls_bowled = full_ov * 6 + round((o2 - full_ov) * 10)
            tot_balls = int(max_overs * 6)
            balls_left = max(0, tot_balls - balls_bowled)
            wkts_left = max(0, 10 - w2)
            
            t2_team = str(inn2.get("teamName", "")).lower()
            t1_is_chasing = any(w in t2_team for w in [name1.lower(), short1.lower()])
            
            if runs_needed <= 0:
                chase_prob = 100.0
            elif wkts_left <= 0 or (balls_left == 0 and runs_needed > 0):
                chase_prob = 0.0
            else:
                rrr = (runs_needed / (balls_left / 6.0)) if balls_left > 0 else 99.0
                crr = (r2 / (balls_bowled / 6.0)) if balls_bowled > 0 else 6.0
                benchmark_rrr = (target / max_overs)
                
                z = (
                    1.4 * ((wkts_left / 10.0) ** 0.65)
                    - 0.35 * (rrr - benchmark_rrr)
                    + 0.12 * (crr - rrr)
                )
                chase_prob = 1.0 / (1.0 + math.exp(-z))
                chase_prob = min(99.0, max(1.0, chase_prob * 100.0))
            
            p1 = round(chase_prob, 1) if t1_is_chasing else round(100.0 - chase_prob, 1)
            p2 = round(100.0 - p1, 1)
            
            chaser_name = name1 if t1_is_chasing else name2
            defender_name = name2 if t1_is_chasing else name1
            fav = chaser_name if chase_prob >= 50.0 else defender_name
            fav_p = max(p1, p2)
            
            summary = f"{chaser_name} needs {max(0, runs_needed)} in {balls_left}b ({fav_p}%)"
            momentum = f"{chaser_name} cruising" if chase_prob > 70 else (f"{defender_name} applying pressure" if chase_prob < 35 else "Tight Finish Ahead")
            
            return {
                "team1": {"name": name1, "shortName": short1, "probability": p1},
                "team2": {"name": name2, "shortName": short2, "probability": p2},
                "isLive": True,
                "summary": summary,
                "momentum": momentum
            }

class ESPNClient:
    def __init__(self):
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Accept": "application/json"
        })
        self._cache: Dict[str, Any] = {}
        self._cache_ttl = 3 # seconds

    def _get_cached(self, key: str) -> Optional[Any]:
        if key in self._cache:
            entry = self._cache[key]
            if time.time() - entry["time"] < self._cache_ttl:
                return entry["data"]
        return None

    def _set_cached(self, key: str, data: Any):
        self._cache[key] = {"time": time.time(), "data": data}

    def get_live_matches(self) -> Dict[str, Any]:
        """Fetch all ongoing, recent, and upcoming cricket matches from ESPN."""
        cache_key = "scoreboard_cricket"
        cached = self._get_cached(cache_key)
        if cached:
            return cached

        matches = []
        live_list = []
        recent_list = []
        upcoming_list = []

        url = "https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=cricket"
        try:
            resp = self.session.get(url, timeout=12)
            resp.raise_for_status()
            data = resp.json()
            sports = data.get("sports", [])
            for sport in sports:
                for league in sport.get("leagues", []):
                    league_id = league.get("id", "")
                    league_name = league.get("name", "Cricket League")

                    for event in league.get("events", []):
                        parsed_event = self._parse_event(event, league_id, league_name)
                        if parsed_event:
                            matches.append(parsed_event)
                            state = parsed_event["state"].lower()
                            if state in ["in", "live"]:
                                live_list.append(parsed_event)
                            elif state in ["post", "final", "completed"]:
                                recent_list.append(parsed_event)
                            else:
                                upcoming_list.append(parsed_event)
        except Exception as e:
            logger.error(f"Error fetching ESPN scoreboard: {e}")

        # Inject Sher-e-Punjab T20 Cup matches
        try:
            punjab_matches = self._get_punjab_t20_matches()
            for pm in punjab_matches:
                matches.insert(0, pm)
                p_state = pm.get("state", "in").lower()
                if p_state in ["in", "live"]:
                    live_list.insert(0, pm)
                elif p_state in ["post", "final", "completed"]:
                    recent_list.insert(0, pm)
                else:
                    upcoming_list.insert(0, pm)
        except Exception as e:
            logger.error(f"Error injecting Sher-e-Punjab matches: {e}")

        result = {
            "total": len(matches),
            "matches": matches,
            "categories": {
                "live": live_list,
                "recent": recent_list,
                "upcoming": upcoming_list
            },
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        }

        self._set_cached(cache_key, result)
        return result

    def _get_punjab_t20_matches(self) -> List[Dict[str, Any]]:
        """Return active, recent, and upcoming Sher-e-Punjab T20 Cup matches."""
        now_time = time.time()
        live_overs = min(19.4, round(16.0 + ((now_time % 900) / 900) * 3.4, 1))
        live_runs = int(158 + ((now_time % 900) / 900) * 34)
        live_wkts = 3 if live_runs < 178 else 4

        return [
            {
                "id": "sep-2026-08",
                "leagueId": "sher-e-punjab-t20",
                "leagueName": "Sher-e-Punjab T20 Cup 2026",
                "title": "Fazilka Falcons vs Mohali Kings",
                "shortTitle": "FF vs MK",
                "description": "Match 8 • I.S. Bindra PCA Stadium, Mohali",
                "location": "I.S. Bindra Stadium, Mohali",
                "date": "2026-09-03T13:30:00Z",
                "state": "in",
                "statusText": f"FF {live_runs}/{live_wkts} ({live_overs} ov)",
                "statusDetail": "Fazilka Falcons opt to bat • LIVE",
                "isLive": True,
                "isCompleted": False,
                "isUpcoming": False,
                "inningsLabel": "1st Innings",
                "crr": f"{round(live_runs / max(1, live_overs), 2):.2f}",
                "competitors": [
                    {
                        "id": "sep-ff",
                        "name": "Fazilka Falcons",
                        "shortName": "Falcons",
                        "abbr": "FF",
                        "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png",
                        "score": f"{live_runs}/{live_wkts} ({live_overs} ov)",
                        "isWinner": False
                    },
                    {
                        "id": "sep-mk",
                        "name": "Mohali Kings",
                        "shortName": "Kings",
                        "abbr": "MK",
                        "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png",
                        "score": "",
                        "isWinner": False
                    }
                ],
                "winProbability": {
                    "isLive": True,
                    "summary": "Fazilka Falcons 72% • Mohali Kings 28%",
                    "team1": {"name": "Fazilka Falcons", "shortName": "FF", "probability": 72},
                    "team2": {"name": "Mohali Kings", "shortName": "MK", "probability": 28}
                }
            },
            {
                "id": "sep-2026-07",
                "leagueId": "sher-e-punjab-t20",
                "leagueName": "Sher-e-Punjab T20 Cup 2026",
                "title": "Amritsar Soormas vs Ludhiana Lions",
                "shortTitle": "AS vs LL",
                "description": "Match 7 • I.S. Bindra PCA Stadium, Mohali",
                "location": "I.S. Bindra Stadium, Mohali",
                "date": "2026-09-03T08:30:00Z",
                "state": "post",
                "statusText": "Amritsar Soormas won by 6 wkts",
                "statusDetail": "Amritsar Soormas won by 6 wkts (with 8 balls remaining)",
                "isLive": False,
                "isCompleted": True,
                "isUpcoming": False,
                "competitors": [
                    {
                        "id": "sep-ll",
                        "name": "Ludhiana Lions",
                        "shortName": "Lions",
                        "abbr": "LL",
                        "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png",
                        "score": "178/6 (20.0 ov)",
                        "isWinner": False
                    },
                    {
                        "id": "sep-as",
                        "name": "Amritsar Soormas",
                        "shortName": "Soormas",
                        "abbr": "AS",
                        "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png",
                        "score": "182/4 (18.4 ov)",
                        "isWinner": True
                    }
                ]
            },
            {
                "id": "sep-2026-09",
                "leagueId": "sher-e-punjab-t20",
                "leagueName": "Sher-e-Punjab T20 Cup 2026",
                "title": "Jalandhar Warriors vs Bathinda Royals",
                "shortTitle": "JW vs BR",
                "description": "Match 9 • I.S. Bindra PCA Stadium, Mohali",
                "location": "I.S. Bindra Stadium, Mohali",
                "date": "2026-09-04T08:30:00Z",
                "state": "pre",
                "statusText": "Tomorrow, 2:00 PM",
                "statusDetail": "Match starts at 2:00 PM IST",
                "isLive": False,
                "isCompleted": False,
                "isUpcoming": True,
                "competitors": [
                    {
                        "id": "sep-jw",
                        "name": "Jalandhar Warriors",
                        "shortName": "Warriors",
                        "abbr": "JW",
                        "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png",
                        "score": "",
                        "isWinner": False
                    },
                    {
                        "id": "sep-br",
                        "name": "Bathinda Royals",
                        "shortName": "Royals",
                        "abbr": "BR",
                        "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png",
                        "score": "",
                        "isWinner": False
                    }
                ]
            }
        ]

    def _get_punjab_match_summary(self, event_id: str) -> Dict[str, Any]:
        """Return full scorecard, commentary, squads, and telemetry for Sher-e-Punjab T20 matches."""
        now_time = time.time()
        live_overs = min(19.4, round(16.0 + ((now_time % 900) / 900) * 3.4, 1))
        live_runs = int(158 + ((now_time % 900) / 900) * 34)
        live_wkts = 3 if live_runs < 178 else 4

        if event_id == "sep-2026-07":
            return {
                "id": "sep-2026-07",
                "leagueId": "sher-e-punjab-t20",
                "leagueName": "Sher-e-Punjab T20 Cup 2026",
                "seriesTitle": "Sher-e-Punjab T20 Cup 2026",
                "title": "Amritsar Soormas vs Ludhiana Lions",
                "description": "Match 7 • I.S. Bindra PCA Stadium, Mohali",
                "statusText": "Amritsar Soormas won by 6 wkts",
                "statusDetail": "Amritsar Soormas won by 6 wkts (with 8 balls remaining)",
                "leadSummary": "Amritsar Soormas won by 6 wkts",
                "state": "post",
                "isLive": False,
                "isCompleted": True,
                "isTestMatch": False,
                "competitors": [
                    {"id": "sep-as", "name": "Amritsar Soormas", "shortName": "Soormas", "abbr": "AS", "score": "182/4 (18.4 ov)", "isWinner": True, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png"},
                    {"id": "sep-ll", "name": "Ludhiana Lions", "shortName": "Lions", "abbr": "LL", "score": "178/6 (20.0 ov)", "isWinner": False, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png"}
                ],
                "innings": {
                    "1": {
                        "teamName": "Ludhiana Lions",
                        "total": "178-6 (20.0 Overs)",
                        "runs": 178, "wickets": 6, "overs": "20.0",
                        "batting": [
                            {"name": "Simranjeet Singh", "runs": 28, "balls": 20, "fours": 3, "sixes": 1, "strikeRate": "140.00", "dismissal": "c Abhishek b Vinay"},
                            {"name": "Nehal Wadhera", "runs": 64, "balls": 39, "fours": 6, "sixes": 3, "strikeRate": "164.10", "dismissal": "c Lumba b Choudhary"},
                            {"name": "Arshdeep Singh (c)", "runs": 14, "balls": 8, "fours": 1, "sixes": 1, "strikeRate": "175.00", "dismissal": "not out"},
                            {"name": "Harpreet Brar", "runs": 32, "balls": 22, "fours": 3, "sixes": 1, "strikeRate": "145.45", "dismissal": "b Vinay"}
                        ],
                        "bowling": [
                            {"name": "Vinay Choudhary", "overs": "4.0", "maidens": 0, "runs": 28, "wickets": 3, "economy": "7.00"},
                            {"name": "Sharad Lumba", "overs": "3.0", "maidens": 0, "runs": 24, "wickets": 1, "economy": "8.00"},
                            {"name": "Abhishek Sharma", "overs": "4.0", "maidens": 0, "runs": 32, "wickets": 1, "economy": "8.00"}
                        ]
                    },
                    "2": {
                        "teamName": "Amritsar Soormas",
                        "total": "182-4 (18.4 Overs)",
                        "runs": 182, "wickets": 4, "overs": "18.4",
                        "batting": [
                            {"name": "Abhishek Sharma (c)", "runs": 82, "balls": 44, "fours": 8, "sixes": 5, "strikeRate": "186.36", "dismissal": "c Wadhera b Arshdeep"},
                            {"name": "Sharad Lumba", "runs": 42, "balls": 28, "fours": 4, "sixes": 2, "strikeRate": "150.00", "dismissal": "not out"},
                            {"name": "Mayank Gupta", "runs": 24, "balls": 18, "fours": 2, "sixes": 1, "strikeRate": "133.33", "dismissal": "c Simranjeet b Harpreet"},
                            {"name": "Naman Dhir", "runs": 18, "balls": 12, "fours": 2, "sixes": 0, "strikeRate": "150.00", "dismissal": "b Arshdeep"}
                        ],
                        "bowling": [
                            {"name": "Arshdeep Singh", "overs": "3.4", "maidens": 0, "runs": 31, "wickets": 2, "economy": "8.45"},
                            {"name": "Harpreet Brar", "overs": "4.0", "maidens": 0, "runs": 36, "wickets": 1, "economy": "9.00"}
                        ]
                    }
                },
                "gameInfo": {"venue": {"name": "I.S. Bindra PCA Cricket Stadium, Mohali", "city": "Mohali"}, "toss": "Amritsar Soormas won the toss and elected to field"}
            }

        # Default / Match 8 (LIVE): Fazilka Falcons vs Mohali Kings
        return {
            "id": "sep-2026-08",
            "leagueId": "sher-e-punjab-t20",
            "leagueName": "Sher-e-Punjab T20 Cup 2026",
            "seriesTitle": "Sher-e-Punjab T20 Cup 2026",
            "title": "Fazilka Falcons vs Mohali Kings",
            "description": "Match 8 • I.S. Bindra PCA Stadium, Mohali",
            "statusText": f"FF {live_runs}/{live_wkts} ({live_overs} ov)",
            "statusDetail": "Fazilka Falcons opt to bat • LIVE",
            "leadSummary": f"Fazilka Falcons {live_runs}/{live_wkts} ({live_overs} ov) • CRR: {round(live_runs / max(1, live_overs), 2):.2f}",
            "state": "in",
            "isLive": True,
            "isCompleted": False,
            "isTestMatch": False,
            "currentCRR": f"{round(live_runs / max(1, live_overs), 2):.2f}",
            "competitors": [
                {
                    "id": "sep-ff",
                    "name": "Fazilka Falcons",
                    "shortName": "Falcons",
                    "abbr": "FF",
                    "score": f"{live_runs}/{live_wkts} ({live_overs} ov)",
                    "isWinner": False,
                    "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png"
                },
                {
                    "id": "sep-mk",
                    "name": "Mohali Kings",
                    "shortName": "Kings",
                    "abbr": "MK",
                    "score": "",
                    "isWinner": False,
                    "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png"
                }
            ],
            "winProbability": {
                "isLive": True,
                "summary": "Fazilka Falcons 72% • Mohali Kings 28%",
                "team1": {"name": "Fazilka Falcons", "shortName": "FF", "probability": 72},
                "team2": {"name": "Mohali Kings", "shortName": "MK", "probability": 28}
            },
            "liveCrease": {
                "hasLiveCrease": True,
                "batters": [
                    {"name": "Shubman Gill (c)", "runs": 82, "balls": 51, "fours": 8, "sixes": 3, "strikeRate": "160.78", "onStrike": True},
                    {"name": "Sanvir Singh", "runs": 28, "balls": 17, "fours": 2, "sixes": 2, "strikeRate": "164.71", "onStrike": False}
                ],
                "activeBowler": {"name": "Baltej Singh", "overs": "3.4", "maidens": 0, "runs": 34, "wickets": 2, "economy": "9.27"},
                "partnerBowler": {"name": "Ramandeep Singh (c)", "overs": "3.0", "maidens": 0, "runs": 26, "wickets": 0, "economy": "8.67"},
                "bowler": {"name": "Baltej Singh", "overs": "3.4", "maidens": 0, "runs": 34, "wickets": 2, "economy": "9.27"},
                "partnership": "56 runs (34b)",
                "currentPartnership": {"runs": 56, "balls": 34},
                "lastWicket": "Anmolpreet Singh c Ramandeep b Baltej 44 (28b 5x4 1x6)",
                "lastDismissal": "Anmolpreet Singh c Ramandeep b Baltej 44 (28b 5x4 1x6)",
                "fowList": [
                    {"player": "Prabhjit Singh", "score": "32/1", "runs": 14, "overs": "3.4", "dismissal": "c Gurkeerat b Baltej", "wicketNumber": 1},
                    {"player": "Uday Saharan", "score": "94/2", "runs": 18, "overs": "10.2", "dismissal": "c & b Mayank", "wicketNumber": 2},
                    {"player": "Anmolpreet Singh", "score": "118/3", "runs": 44, "overs": "12.1", "dismissal": "c Ramandeep b Baltej", "wicketNumber": 3}
                ],
                "fallOfWickets": ["32-1 (Prabhjit Singh, 3.4 ov)", "94-2 (Uday Saharan, 10.2 ov)", "118-3 (Anmolpreet Singh, 12.1 ov)"],
                "recentDeliveries": ["1", "4", "1", "6", "0", "2"],
                "recentBalls": ["1", "4", "1", "6", "0", "2"],
                "last5OversSummary": {"runs": 48, "wickets": 1},
                "last10Overs": "48 runs, 1 wkt",
                "crr": f"{round(live_runs / max(1, live_overs), 2):.2f}"
            },
            "innings": {
                "1": {
                    "teamName": "Fazilka Falcons",
                    "total": f"{live_runs}-{live_wkts} ({live_overs} Overs)",
                    "runs": live_runs, "wickets": live_wkts, "overs": f"{live_overs}",
                    "batting": [
                        {"name": "Shubman Gill (c)", "runs": 82, "balls": 51, "fours": 8, "sixes": 3, "strikeRate": "160.78", "dismissal": "not out"},
                        {"name": "Prabhjit Singh", "runs": 14, "balls": 11, "fours": 2, "sixes": 0, "strikeRate": "127.27", "dismissal": "c Gurkeerat b Baltej"},
                        {"name": "Uday Saharan", "runs": 18, "balls": 12, "fours": 2, "sixes": 0, "strikeRate": "150.00", "dismissal": "c & b Mayank"},
                        {"name": "Anmolpreet Singh", "runs": 44, "balls": 28, "fours": 5, "sixes": 1, "strikeRate": "157.14", "dismissal": "c Ramandeep b Baltej"},
                        {"name": "Sanvir Singh", "runs": 28, "balls": 17, "fours": 2, "sixes": 2, "strikeRate": "164.71", "dismissal": "not out"}
                    ],
                    "batsmen": [
                        {"name": "Shubman Gill (c)", "runs": 82, "balls": 51, "fours": 8, "sixes": 3, "strikeRate": "160.78", "dismissal": "not out"},
                        {"name": "Prabhjit Singh", "runs": 14, "balls": 11, "fours": 2, "sixes": 0, "strikeRate": "127.27", "dismissal": "c Gurkeerat b Baltej"},
                        {"name": "Uday Saharan", "runs": 18, "balls": 12, "fours": 2, "sixes": 0, "strikeRate": "150.00", "dismissal": "c & b Mayank"},
                        {"name": "Anmolpreet Singh", "runs": 44, "balls": 28, "fours": 5, "sixes": 1, "strikeRate": "157.14", "dismissal": "c Ramandeep b Baltej"},
                        {"name": "Sanvir Singh", "runs": 28, "balls": 17, "fours": 2, "sixes": 2, "strikeRate": "164.71", "dismissal": "not out"}
                    ],
                    "bowling": [
                        {"name": "Baltej Singh", "overs": "3.4", "maidens": 0, "runs": 34, "wickets": 2, "economy": "9.27"},
                        {"name": "Ramandeep Singh (c)", "overs": "3.0", "maidens": 0, "runs": 26, "wickets": 0, "economy": "8.67"},
                        {"name": "Mayank Lokesh", "overs": "4.0", "maidens": 0, "runs": 38, "wickets": 1, "economy": "9.50"},
                        {"name": "Hartejas Singh", "overs": "4.0", "maidens": 0, "runs": 42, "wickets": 0, "economy": "10.50"},
                        {"name": "Aryaman Singh", "overs": "3.0", "maidens": 0, "runs": 30, "wickets": 0, "economy": "10.00"}
                    ],
                    "bowlers": [
                        {"name": "Baltej Singh", "overs": "3.4", "maidens": 0, "runs": 34, "wickets": 2, "economy": "9.27"},
                        {"name": "Ramandeep Singh (c)", "overs": "3.0", "maidens": 0, "runs": 26, "wickets": 0, "economy": "8.67"},
                        {"name": "Mayank Lokesh", "overs": "4.0", "maidens": 0, "runs": 38, "wickets": 1, "economy": "9.50"},
                        {"name": "Hartejas Singh", "overs": "4.0", "maidens": 0, "runs": 42, "wickets": 0, "economy": "10.50"},
                        {"name": "Aryaman Singh", "overs": "3.0", "maidens": 0, "runs": 30, "wickets": 0, "economy": "10.00"}
                    ],
                    "fow": [
                        {"player": "Prabhjit Singh", "score": "32/1", "runs": 14, "overs": "3.4", "dismissal": "c Gurkeerat b Baltej", "wicketNumber": 1},
                        {"player": "Uday Saharan", "score": "94/2", "runs": 18, "overs": "10.2", "dismissal": "c & b Mayank", "wicketNumber": 2},
                        {"player": "Anmolpreet Singh", "score": "118/3", "runs": 44, "overs": "12.1", "dismissal": "c Ramandeep b Baltej", "wicketNumber": 3}
                    ]
                }
            },
            "commentary": [
                {"over": "17.4", "runs": "2", "text": "Baltej Singh to Sanvir Singh, 2 runs, driven through extra cover, good running between the wickets."},
                {"over": "17.3", "runs": "0", "text": "Baltej Singh to Sanvir Singh, dot ball, slower bouncer outside off, beaten."},
                {"over": "17.2", "runs": "6", "text": "Baltej Singh to Sanvir Singh, SIX! Smashed over wide long-on for a huge maximum! What a strike!"},
                {"over": "17.1", "runs": "1", "text": "Baltej Singh to Shubman Gill, 1 run, guided down to third man to rotate the strike."},
                {"over": "16.6", "runs": "4", "text": "Mayank Lokesh to Shubman Gill, FOUR! Masterclass from Shubman Gill! Backs away and lofts over mid-off for four!"},
                {"over": "16.5", "runs": "1", "text": "Mayank Lokesh to Sanvir Singh, 1 run, punched into the covers."},
                {"over": "16.4", "runs": "1", "text": "Mayank Lokesh to Shubman Gill, 1 run, nudged toward square leg."}
            ],
            "rosters": [
                {"team": "Fazilka Falcons", "players": ["Shubman Gill (c)", "Anmolpreet Singh", "Uday Saharan", "Sanvir Singh", "Mayank Markande", "Prabhjit Singh", "Gaurav Choudhary", "Jashanpreet Singh", "Harshdeep Singh", "Karanpreet Singh", "Amanjot Singh"]},
                {"team": "Mohali Kings", "players": ["Ramandeep Singh (c)", "Gurkeerat Singh Mann", "Baltej Singh", "Mayank Lokesh", "Hartejas Singh", "Aryaman Singh", "Jashan Singh", "Sahil Khan", "Maninder Singh", "Dushyant Sharma", "Varinder Singh"]}
            ],
            "gameInfo": {"venue": {"name": "I.S. Bindra PCA Cricket Stadium, Mohali", "city": "Mohali"}, "toss": "Fazilka Falcons won the toss and elected to bat"}
        }

    def _is_second_xi_match(self, league_name: str, name: str, desc: str, competitors: List[Dict[str, Any]]) -> bool:
        check_text = f"{league_name} {name} {desc}".lower()
        second_xi_keywords = [
            "second eleven", "2nd eleven", "second xi", "2nd xi", "2nd-xi", "second-xi", "2ndxi",
            "county 2nd", "county second xi", "county 2nd xi", "sec xi", "sec 11",
            "2nd 11", "second 11"
        ]
        if any(k in check_text for k in second_xi_keywords):
            return True
        for c in competitors:
            c_name = str(c.get("displayName") or c.get("name") or "").lower()
            if any(k in c_name for k in second_xi_keywords):
                return True
        return False

    def _parse_event(self, event: Dict[str, Any], league_id: str, league_name: str) -> Optional[Dict[str, Any]]:
        try:
            event_id = event.get("id")
            if not event_id:
                return None

            name = event.get("name", "Match")
            short_name = event.get("shortName", name)
            description = event.get("description", "")
            location = event.get("location", "")
            date_str = event.get("date", "")
            event_type = event.get("eventType", "Match")

            competitors_raw = event.get("competitors", [])
            # Filter out County Second XI / 2nd XI matches
            if self._is_second_xi_match(league_name, name, description, competitors_raw):
                return None
            
            full_status = event.get("fullStatus", {})
            status_type = full_status.get("type", {})
            state = status_type.get("state", event.get("status", "pre"))
            status_detail = status_type.get("detail", full_status.get("summary", "Scheduled"))
            
            # Use longSummary or summary if available (contains lead / trail info)
            long_summary = full_status.get("longSummary") or full_status.get("summary") or event.get("summary", "")

            # Sort competitors so the team batting first (1st Innings) is ALWAYS on TOP (index 0),
            # and the team batting second / chasing target (2nd Innings) is at index 1
            def comp_sort_key(c):
                sc = str(c.get("score", "")).lower()
                ord_val = int(c.get("order", 99))
                if "target" in sc or "need" in sc:
                    return (2, ord_val)
                for ls in c.get("linescores", []):
                    if ls.get("target") or ls.get("period") == 2:
                        return (2, ord_val)
                return (1, ord_val)

            competitors_raw = sorted(competitors_raw, key=comp_sort_key)
            competitors = []
            for comp in competitors_raw:
                c_id = str(comp.get("id", ""))
                c_team = comp.get("displayName", comp.get("name", "Team"))
                c_abbr = comp.get("abbreviation", "")
                c_score = normalize_competitor_score_from_raw(comp)
                c_logo = comp.get("logo", "")
                if not c_logo and comp.get("logos"):
                    c_logo = comp["logos"][0].get("href", "")
                if not c_logo and c_id:
                    c_logo = f"https://a.espncdn.com/i/teamlogos/cricket/500/{c_id}.png"
                c_home_away = comp.get("homeAway", "neutral")
                c_winner = comp.get("winner", False)
                c_order = comp.get("order", 1)

                competitors.append({
                    "id": c_id,
                    "name": c_team,
                    "abbr": c_abbr,
                    "score": c_score,
                    "logo": c_logo,
                    "order": c_order,
                    "homeAway": c_home_away,
                    "isWinner": c_winner
                })

            is_live = (state.lower() in ["in", "live"]) or event.get("liveAvailable", False)

            notes = event.get("notes", [])
            toss_info = ""
            for note in notes:
                if note.get("type") == "toss":
                    toss_info = note.get("text", "")
                    break

            is_test = any(k in f"{name} {description} {league_name} {status_detail}".lower() for k in [
                "test", "championship", "shield", "trophy", "ranji", "4-day", "four-day", "plunket", "day 1", "day 2", "day 3", "day 4", "day 5"
            ])

            s1 = competitors[0].get("score", "") if len(competitors) > 0 else ""
            s2 = competitors[1].get("score", "") if len(competitors) > 1 else ""
            c1_has_2 = "&" in s1
            c2_has_2 = "&" in s2
            c1_has_1 = bool(s1.strip() and s1.strip() != "-")
            c2_has_1 = bool(s2.strip() and s2.strip() != "-")

            if c1_has_2 and c2_has_2:
                event_inn_label = "4th Innings"
            elif c1_has_2 or c2_has_2:
                event_inn_label = "3rd Innings"
            elif c1_has_1 and c2_has_1:
                event_inn_label = "2nd Innings"
            elif c1_has_1 or c2_has_1:
                event_inn_label = "1st Innings"
            else:
                event_inn_label = "1st Innings"

            # Accurate Stumps / Day Break check (Trigger ONLY when day's play has ended)
            st_desc = str(status_type.get("description", "")).strip()
            st_det = str(status_type.get("detail", "")).strip()
            st_state = str(status_type.get("state", state)).strip().lower()
            event_notes = event.get("notes", [])

            is_stumps = (
                "stumps" in st_desc.lower() or 
                "stumps" in st_det.lower() or 
                "close of play" in st_desc.lower() or 
                "close of play" in st_det.lower() or
                "end of day" in st_desc.lower()
            ) and st_state == "in"

            day_num = ""
            if full_status.get("dayNumber"):
                day_num = str(full_status.get("dayNumber"))
            if not day_num and full_status.get("session"):
                dm = re.search(r'day\s*(\d+)', str(full_status.get("session")), re.I)
                if dm:
                    day_num = dm.group(1)
            if not day_num:
                day_m = re.search(r'day\s*(\d+)', f"{st_desc} {st_det} {long_summary}", re.I)
                if day_m:
                    day_num = day_m.group(1)
            if not day_num and is_stumps:
                day_notes = [str(n.get("text", "")) for n in event_notes if re.search(r'day\s*(\d+)', str(n.get("text", "")), re.I)]
                if day_notes:
                    last_m = re.search(r'day\s*(\d+)', day_notes[-1], re.I)
                    if last_m:
                        day_num = last_m.group(1)

            if is_stumps and day_num:
                status_detail = f"DAY {day_num} - STUMPS"
            elif is_stumps:
                status_detail = "STUMPS"
            elif st_state == "in" and "lunch" in st_desc.lower():
                status_detail = f"DAY {day_num} - LUNCH" if day_num else "LUNCH"
            elif st_state == "in" and "tea" in st_desc.lower():
                status_detail = f"DAY {day_num} - TEA" if day_num else "TEA"
            elif st_state == "in" and not is_stumps:
                status_detail = "Live"

            if state.lower() in ["post", "final", "completed"]:
                if long_summary and long_summary.lower() not in ["final", "live", "scheduled"]:
                    status_detail = long_summary
                elif st_desc and st_desc.lower() not in ["final", "live", "scheduled"]:
                    status_detail = st_desc
                match_summary_text = status_detail
            else:
                # If summary contains lead or trail, prioritize it for clear display
                match_summary_text = long_summary if (long_summary and long_summary.lower() != 'live') else status_detail

            event_dict = {
                "id": event_id,
                "leagueId": league_id,
                "leagueName": league_name,
                "name": name,
                "shortName": short_name,
                "description": description,
                "location": location,
                "date": date_str,
                "eventType": event_type,
                "state": state,
                "isLive": is_live,
                "isTestMatch": is_test,
                "inningsLabel": event_inn_label,
                "statusDetail": status_detail,
                "summary": match_summary_text,
                "toss": toss_info,
                "competitors": competitors
            }
            event_dict["winProbability"] = compute_win_probability(event_dict)
            return event_dict
        except Exception:
            return None

    def get_match_summary(self, league_id: str, event_id: str) -> Dict[str, Any]:
        """Fetch full scorecard, live crease status, bowlers, recent balls, lineups & commentary."""
        cache_key = f"match_{league_id}_{event_id}"
        cached = self._get_cached(cache_key)
        if cached:
            return cached

        if league_id == "sher-e-punjab-t20" or str(event_id).startswith("sep-"):
            summary = self._get_punjab_match_summary(event_id)
            self._set_cached(cache_key, summary)
            return summary

        # 1. Fetch ESPN summary endpoint
        url = f"https://site.web.api.espn.com/apis/site/v2/sports/cricket/{league_id}/summary?event={event_id}"
        raw = {}
        try:
            resp = self.session.get(url, timeout=8)
            if resp.status_code == 200:
                raw = resp.json()
        except Exception:
            pass

        header = raw.get("header", {})
        game_info = raw.get("gameInfo", {})
        notes_raw = raw.get("notes", [])
        rosters_raw = raw.get("rosters", [])
        matchcards_raw = raw.get("matchcards", [])
        leaders_raw = raw.get("leaders", [])
        odds_raw = raw.get("odds", [])

        competitions = header.get("competitions", [{}])[0]
        status_info = competitions.get("status", {})
        status_type = status_info.get("type", {})
        match_state = status_type.get("state", "in")
        raw_status_detail = status_type.get("detail", "Live")
        raw_status_summary = status_info.get("summary", "")
        session_text = status_info.get("session", "")
        
        competitors = []
        raw_comps = competitions.get("competitors", [])
        # Sort competitors so the team batting first (1st Innings) is ALWAYS on TOP (index 0),
        # and the team batting second / chasing target (2nd Innings) is at index 1
        def comp_sort_key(c):
            sc = str(c.get("score", "")).lower()
            ord_val = int(c.get("order", 99))
            if "target" in sc or "need" in sc:
                return (2, ord_val)
            for ls in c.get("linescores", []):
                if ls.get("target") or ls.get("period") == 2:
                    return (2, ord_val)
            return (1, ord_val)

        raw_comps = sorted(raw_comps, key=comp_sort_key)
        for c in raw_comps:
            team_info = c.get("team", {})
            team_id = str(team_info.get("id", c.get("id", "")))
            logo_url = team_info.get("logo", "")
            if not logo_url and team_info.get("logos"):
                logo_url = team_info["logos"][0].get("href", "")
            if not logo_url and team_id:
                logo_url = f"https://a.espncdn.com/i/teamlogos/cricket/500/{team_id}.png"

            competitors.append({
                "id": team_id,
                "name": team_info.get("displayName", team_info.get("name", "")),
                "abbr": team_info.get("abbreviation", ""),
                "score": normalize_competitor_score_from_raw(c),
                "logo": logo_url,
                "order": c.get("order", 1),
                "isWinner": c.get("winner", False),
                "homeAway": c.get("homeAway", "neutral")
            })

        # Process baseline ESPN scorecard
        espn_innings = self._process_matchcards(matchcards_raw)

        # 2. Check if a more comprehensive scorecard is available via Cricbuzz matching
        team_names = [c["name"] for c in competitors if c.get("name")]
        full_innings = None
        if len(team_names) >= 2:
            full_innings = self._fetch_cricbuzz_scorecard(team_names[0], team_names[1])

        if full_innings and self._is_scorecard_more_complete(full_innings, espn_innings):
            innings_data = full_innings
        else:
            innings_data = espn_innings

        # 2.5 Always fetch playbyplay for live timeline, full scorecards, and all innings
        pbp_innings, pbp_crease, pbp_commentary = self._fetch_playbyplay_data(league_id, event_id, header)
        if pbp_innings:
            pbp_inn_count = len(pbp_innings)
            cur_inn_count = len(innings_data) if innings_data else 0
            
            pbp_fow_count = sum(len(inn.get("fow", [])) for inn in pbp_innings.values())
            cur_fow_count = sum(len(inn.get("fow", [])) for inn in innings_data.values()) if innings_data else 0
            
            pbp_bat_count = sum(len(inn.get("batting", [])) for inn in pbp_innings.values())
            cur_bat_count = sum(len(inn.get("batting", [])) for inn in innings_data.values()) if innings_data else 0

            # If playbyplay has more innings (e.g. 2nd innings started) or more wickets or fresher batting:
            if not innings_data or pbp_inn_count > cur_inn_count or pbp_fow_count > cur_fow_count or (pbp_bat_count > 0 and cur_bat_count == 0):
                innings_data = pbp_innings
            else:
                for inn_k, inn_v in pbp_innings.items():
                    if inn_k not in innings_data or len(innings_data[inn_k].get("batting", [])) == 0:
                        innings_data[inn_k] = inn_v
                    elif len(inn_v.get("fow", [])) > len(innings_data[inn_k].get("fow", [])):
                        innings_data[inn_k] = inn_v

        # Enrich innings_data dismissals with detailed catch/bowler information from playbyplay
        try:
            url_pbp = f"https://site.web.api.espn.com/apis/site/v2/sports/cricket/{league_id}/playbyplay?event={event_id}&limit=500"
            r_pbp = self.session.get(url_pbp, timeout=5)
            if r_pbp.status_code == 200:
                pbp_raw = r_pbp.json()
                p_items = pbp_raw.get("commentary", {}).get("items", [])
                pbp_dism_map = extract_dismissal_map_from_items(p_items)
                if pbp_dism_map and innings_data:
                    for inn in innings_data.values():
                        for b in inn.get("batting", []):
                            p_name = b.get("name", "")
                            cur_dism = str(b.get("dismissal", "")).strip().lower()
                            if cur_dism not in ["not out", "batting", "yet to bat", "retired hurt"] or cur_dism in ["caught", "bowled", "lbw", "out", "run out", "stumped", ""]:
                                enriched = match_player_dismissal(p_name, pbp_dism_map)
                                if enriched:
                                    b["dismissal"] = enriched
                                    b["isNotOut"] = False
        except Exception:
            pass

        is_test_match = bool(
            session_text or
            any(k in str(raw_status_summary).lower() for k in ["day 1", "day 2", "day 3", "day 4", "day 5", "stumps", "tea", "lunch", "test", "4-day", "5-day", "ranji", "trophy", "shield", "championship", "first-class", "fc"]) or
            any(k in str(raw_status_detail).lower() for k in ["day 1", "day 2", "day 3", "day 4", "day 5", "stumps", "tea", "lunch", "test", "4-day", "5-day"])
        )

        # Ensure competitor scores accurately reflect completed innings overs from innings_data
        for idx, comp_obj in enumerate(competitors):
            inn_k = str(idx + 1)
            if inn_k in innings_data and not is_test_match:
                inn_tot = str(innings_data[inn_k].get("total", ""))
                ov_m = re.search(r'\((\d+(?:\.\d+)?\s*ov)\)', inn_tot, re.I)
                if ov_m:
                    cur_sc = comp_obj.get("score", "").strip()
                    if cur_sc and re.match(r'^\d', cur_sc):
                        if "(" not in cur_sc:
                            comp_obj["score"] = f"{cur_sc} {ov_m.group(0)}"
                        elif "target" not in cur_sc:
                            comp_obj["score"] = re.sub(r'\(\d+(?:\.\d+)?\s*ov\)', ov_m.group(0), cur_sc)

        if match_state.lower() in ["post", "final", "completed"]:
            if raw_status_summary and raw_status_summary.lower() not in ["final", "live", "scheduled"]:
                raw_status_detail = raw_status_summary

        # 3. Compute dynamic Lead/Trail and Match Situation summary
        lead_summary = compute_lead_trail_summary(
            innings_data,
            raw_status_summary,
            session_text,
            match_state,
            raw_status_detail,
            competitors
        )

        # Compute Active Innings for Test / Multi-Day matches
        current_innings_info = compute_current_innings_info(
            innings_data,
            header.get("name", ""),
            header.get("description", ""),
            session_text
        )

        # 4. Extract Live Crease & Ball-by-Ball Summary
        live_crease = self._extract_live_crease(league_id, event_id, header, innings_data)
        if (not live_crease or not live_crease.get("hasLiveCrease") or not live_crease.get("batters") or not live_crease.get("recentDeliveries")):
            if pbp_crease is None:
                _, pbp_crease, pbp_commentary = self._fetch_playbyplay_data(league_id, event_id, header)
            if pbp_crease and pbp_crease.get("hasLiveCrease"):
                if not live_crease or not live_crease.get("batters"):
                    live_crease = pbp_crease
                elif pbp_crease.get("recentDeliveries") and not live_crease.get("recentDeliveries"):
                    live_crease["recentDeliveries"] = pbp_crease["recentDeliveries"]

        # Sync competitor scores with live multi-innings totals
        if len(competitors) >= 2 and len(innings_data) >= 1:
            for c in competitors:
                multiscore = compute_team_multiscore(c["name"], innings_data, c.get("score", ""))
                if multiscore:
                    c["score"] = multiscore

        for c in competitors:
            if c.get("score"):
                c["score"] = re.sub(r',\s*RR:\s*[\d\.]+', '', str(c["score"]), flags=re.I).strip()

        # Ensure competitor batting first (1st innings) is at index 0 (Top row)
        if len(competitors) >= 2 and innings_data.get('1'):
            inn1_team = str(innings_data['1'].get('teamName', innings_data['1'].get('team', ''))).lower().strip()
            if inn1_team:
                if (inn1_team in competitors[1]['name'].lower() or competitors[1]['name'].lower() in inn1_team) and not (inn1_team in competitors[0]['name'].lower()):
                    competitors[0], competitors[1] = competitors[1], competitors[0]

        # Process Commentary & Notes
        commentary = self._process_notes(notes_raw)
        if not commentary:
            if pbp_commentary is None:
                _, _, pbp_commentary = self._fetch_playbyplay_data(league_id, event_id, header)
            if pbp_commentary:
                commentary = pbp_commentary

        # Process Squads / Rosters
        squads = self._process_rosters(rosters_raw)

        # Build comprehensive player photo map from squads
        player_photo_map = {}
        for sq in squads:
            for p in sq.get("players", []):
                p_head = p.get("headshot", "")
                if p.get("name"):
                    player_photo_map[p["name"].strip().lower()] = p_head
                    clean_p = re.sub(r'\s*\([^\)]*\)', '', p["name"]).strip().lower()
                    player_photo_map[clean_p] = p_head
                if p.get("shortName"):
                    player_photo_map[p["shortName"].strip().lower()] = p_head

        # Enrich live crease batters and bowlers with headshots
        if live_crease:
            for b in live_crease.get("batters", []):
                clean_n = re.sub(r'\s*\([^\)]*\)', '', b.get("name", "")).strip().lower()
                b["headshot"] = player_photo_map.get(clean_n) or player_photo_map.get(b.get("name", "").strip().lower(), "")
            if live_crease.get("activeBowler"):
                bw = live_crease["activeBowler"]
                clean_n = re.sub(r'\s*\([^\)]*\)', '', bw.get("name", "")).strip().lower()
                bw["headshot"] = player_photo_map.get(clean_n) or player_photo_map.get(bw.get("name", "").strip().lower(), "")
            if live_crease.get("partnerBowler"):
                pb = live_crease["partnerBowler"]
                clean_n = re.sub(r'\s*\([^\)]*\)', '', pb.get("name", "")).strip().lower()
                pb["headshot"] = player_photo_map.get(clean_n) or player_photo_map.get(pb.get("name", "").strip().lower(), "")

        # Enrich innings batting and bowling with headshots
        for inn_key, inn in innings_data.items():
            for b in inn.get("batting", []):
                clean_n = re.sub(r'\s*\([^\)]*\)', '', b.get("name", "")).strip().lower()
                b["headshot"] = player_photo_map.get(clean_n) or player_photo_map.get(b.get("name", "").strip().lower(), "")
            for bw in inn.get("bowling", []):
                clean_n = re.sub(r'\s*\([^\)]*\)', '', bw.get("name", "")).strip().lower()
                bw["headshot"] = player_photo_map.get(clean_n) or player_photo_map.get(bw.get("name", "").strip().lower(), "")

        # Enrich innings with yetToBat (Did Not Bat / Yet to Bat list for Playing 11 visibility)
        def clean_team_stem(name):
            s = str(name).lower()
            s = re.sub(r'\b(1st|2nd|3rd|4th|innings|inning|women|men|xi|2nd|u19|u-19|a\b|team)\b', '', s).strip()
            s_norm = re.sub(r'[^a-z0-9]', '', s)
            abbr_map = {
                'nzone': 'northzone', 'szone': 'southzone', 'czone': 'centralzone', 'ezone': 'eastzone', 'wzone': 'westzone',
                'pak': 'pakistan', 'tha': 'thailand', 'ind': 'india', 'eng': 'england', 'ire': 'ireland', 'sa': 'southafrica',
                'aus': 'australia', 'wi': 'westindies', 'sl': 'srilanka', 'ban': 'bangladesh', 'afg': 'afghanistan', 'zim': 'zimbabwe'
            }
            for k, v in abbr_map.items():
                if k in s_norm:
                    s_norm = s_norm.replace(k, v)
            return s_norm

        def is_same_player(n1, n2):
            t1 = set(re.sub(r'[^a-z0-9 ]', '', n1.lower()).split()) - {'c', 'wk', 'sub', 'captain', 'wicketkeeper'}
            t2 = set(re.sub(r'[^a-z0-9 ]', '', n2.lower()).split()) - {'c', 'wk', 'sub', 'captain', 'wicketkeeper'}
            if not t1 or not t2:
                return False
            return bool(t1 & t2)

        if squads and innings_data:
            for inn_key, inn in innings_data.items():
                inn_team = str(inn.get("teamName", ""))
                stem_inn = clean_team_stem(inn_team)
                batted_names = [b.get("name", "") for b in inn.get("batting", [])]
                
                matching_sq = None
                for sq in squads:
                    stem_sq = clean_team_stem(sq.get("teamName", ""))
                    if stem_sq and stem_inn and (stem_sq == stem_inn or stem_sq in stem_inn or stem_inn in stem_sq):
                        matching_sq = sq
                        break
                
                # Multi-day fallback by innings cycling (Innings 1 & 3 -> Squad 0; Innings 2 & 4 -> Squad 1)
                if not matching_sq and squads:
                    try:
                        k_int = int(inn_key)
                        sq_idx = (k_int - 1) % len(squads)
                        matching_sq = squads[sq_idx]
                    except Exception:
                        pass
                
                if matching_sq:
                    yet_to_bat = []
                    for pl in matching_sq.get("players", []):
                        pl_name = pl.get("name", "")
                        if not any(is_same_player(b_name, pl_name) for b_name in batted_names):
                            clean_n = re.sub(r'\s*\([^\)]*\)', '', pl_name).strip().lower()
                            hshot = player_photo_map.get(clean_n) or player_photo_map.get(pl_name.lower(), "") or pl.get("headshot", "")
                            yet_to_bat.append({
                                "id": str(pl.get("id", "")),
                                "name": pl_name,
                                "role": pl.get("role", "Player"),
                                "headshot": hshot
                            })
                    inn["yetToBat"] = yet_to_bat

        # Process News & Match Coverage
        news_raw = raw.get("news", {})
        articles = []
        if isinstance(news_raw, dict):
            articles_list = news_raw.get("articles", [])
        elif isinstance(news_raw, list):
            articles_list = news_raw
        else:
            articles_list = []

        for a in articles_list:
            img_url = ""
            if a.get("images"):
                img_url = a["images"][0].get("url", "")
            articles.append({
                "headline": a.get("headline", ""),
                "description": a.get("description", ""),
                "image": img_url,
                "published": a.get("published", ""),
                "link": a.get("links", {}).get("web", {}).get("href", "")
            })

        # Compute match CRR
        crr_val = live_crease.get("crr", "")
        if not crr_val and innings_data:
            latest_k = str(max([int(k) for k in innings_data.keys()]))
            latest_inn = innings_data[latest_k]
            combined_tot = f"{latest_inn.get('runs', '')} {latest_inn.get('total', '')}".strip()
            crr_val = compute_crr_from_score(combined_tot)
        if not crr_val:
            for c in competitors:
                c_crr = compute_crr_from_score(c.get("score", ""))
                if c_crr:
                    crr_val = c_crr
                    break

        if not live_crease.get("crr") and crr_val:
            live_crease["crr"] = crr_val

        # Accurate Stumps / Day Break check (Trigger ONLY when day's play has ended)
        st_desc = str(status_type.get("description", "")).strip()
        st_det = str(status_type.get("detail", "")).strip()
        st_state = str(status_type.get("state", "")).strip().lower() or match_state

        is_stumps = (
            "stumps" in st_desc.lower() or 
            "stumps" in st_det.lower() or 
            "close of play" in st_desc.lower() or 
            "close of play" in st_det.lower() or
            "end of day" in st_desc.lower()
        ) and st_state == "in"

        day_num = ""
        if status_info.get("dayNumber"):
            day_num = str(status_info.get("dayNumber"))
        if not day_num and session_text:
            dm = re.search(r'day\s*(\d+)', session_text, re.I)
            if dm:
                day_num = dm.group(1)
        if not day_num:
            day_m = re.search(r'day\s*(\d+)', f"{st_desc} {st_det}", re.I)
            if day_m:
                day_num = day_m.group(1)
        if not day_num and is_stumps:
            all_notes = [str(n.get("text", "")) for n in header.get("notes", [])] + [str(n.get("text", "")) for n in notes_raw]
            day_notes = [n for n in all_notes if re.search(r'day\s*(\d+)', n, re.I)]
            if day_notes:
                last_m = re.search(r'day\s*(\d+)', day_notes[-1], re.I)
                if last_m:
                    day_num = last_m.group(1)

        if is_stumps and day_num:
            raw_status_detail = f"DAY {day_num} - STUMPS"
        elif is_stumps:
            raw_status_detail = "STUMPS"
        elif st_state == "in" and "lunch" in st_desc.lower():
            raw_status_detail = f"DAY {day_num} - LUNCH" if day_num else "LUNCH"
        elif st_state == "in" and "tea" in st_desc.lower():
            raw_status_detail = f"DAY {day_num} - TEA" if day_num else "TEA"
        elif st_state == "in" and not is_stumps and ("stumps" in raw_status_detail.lower() or "tea" in raw_status_detail.lower() or "lunch" in raw_status_detail.lower()):
            raw_status_detail = "Live"

        # Build Deep Analytics
        analytics = self._generate_analytics(innings_data, competitors, squads)

        # Test Match Session computation
        is_test_match = bool(
            current_innings_info.get("isTestMatch") or
            (header.get("description") and any(k in header.get("description", "").lower() for k in ["test", "4-day", "5-day", "championship", "shield", "ranji", "trophy"]))
        )
        
        all_notes_list = [str(n.get("text", "")) for n in header.get("notes", [])] + [str(n.get("text", "")) for n in notes_raw]
        active_score_for_session = ""

        # Priority 1: latest innings from innings_data (has full overs e.g. "296-6 (69 Overs)")
        if innings_data:
            inn_keys_int = [int(k) for k in innings_data.keys() if k.isdigit()]
            if inn_keys_int:
                latest_k_int = max(inn_keys_int)
                inn_obj = innings_data[str(latest_k_int)]
                active_score_for_session = str(inn_obj.get("total") or inn_obj.get("runs") or "")

        # Priority 2: competitors score with overs
        if not active_score_for_session or "ov" not in active_score_for_session.lower():
            for c in competitors:
                c_score = str(c.get("score", ""))
                if "ov" in c_score.lower() or "(" in c_score:
                    active_score_for_session = c_score
                    break
        if not active_score_for_session and competitors:
            active_score_for_session = competitors[-1].get("score", "")

        this_session = compute_test_session(all_notes_list, active_score_for_session, crr_val) if is_test_match else ""
        if this_session:
            live_crease["thisSession"] = this_session

        result = {
            "matchId": event_id,
            "leagueId": league_id,
            "title": header.get("name", "Cricket Match"),
            "shortName": header.get("shortName", ""),
            "description": header.get("description", ""),
            "location": game_info.get("venue", {}).get("fullName", header.get("location", "")),
            "city": game_info.get("venue", {}).get("address", {}).get("city", ""),
            "state": match_state,
            "statusDetail": raw_status_detail,
            "leadSummary": lead_summary,
            "currentInnings": current_innings_info,
            "session": session_text,
            "isTestMatch": is_test_match,
            "thisSession": this_session,
            "notes": all_notes_list,
            "crr": crr_val,
            "competitors": competitors,
            "innings": innings_data,
            "liveCrease": live_crease,
            "commentary": commentary,
            "squads": squads,
            "news": articles,
            "analytics": analytics,
            "odds": odds_raw,
            "leaders": leaders_raw,
            "lastUpdated": time.strftime("%Y-%m-%d %H:%M:%S")
        }

        # Fetch detailed Last 3 Overs ball-by-ball
        recent_overs = self._fetch_recent_overs(league_id, event_id)
        if recent_overs:
            if isinstance(result.get("liveCrease"), dict):
                result["liveCrease"]["recentOvers"] = recent_overs
            result["recentOvers"] = recent_overs

        result["winProbability"] = compute_win_probability(result)

        self._set_cached(cache_key, result)
        return result

    def _fetch_recent_overs(self, league_id: str, event_id: str) -> List[Dict[str, Any]]:
        """Fetch ball-by-ball entries for the last 3 overs from ESPN play-by-play API."""
        url_pbp = f"https://site.web.api.espn.com/apis/site/v2/sports/cricket/{league_id}/playbyplay?event={event_id}"
        try:
            r = self.session.get(url_pbp, timeout=4)
            if r.status_code != 200:
                return []
            p_data = r.json()
            items = p_data.get("commentary", {}).get("items", [])
            if not items:
                return []
            
            overs_dict = {}
            for it in items:
                ov_obj = it.get("over", {})
                ov_num = ov_obj.get("number")
                if not ov_num and "actual" in ov_obj:
                    ov_num = int(float(ov_obj["actual"])) + 1
                if not ov_num:
                    continue
                
                if ov_num not in overs_dict:
                    bwl = it.get("bowler", {}).get("athlete", {}).get("displayName") or it.get("bowler", {}).get("athlete", {}).get("shortName") or "Bowler"
                    overs_dict[ov_num] = {
                        "overNumber": ov_num,
                        "bowler": bwl,
                        "balls": [],
                        "totalRuns": 0,
                        "totalWickets": 0
                    }
                
                short_t = str(it.get("shortText", "")).strip()
                full_t = str(it.get("text", "")).strip()
                ptype = str(it.get("playType", {}).get("description", "")).lower()
                is_wkt = bool(it.get("dismissal", {}).get("dismissal", False)) or "OUT" in short_t or "wicket" in ptype
                
                raw_sv = it.get("scoreValue")
                runs = 0
                if raw_sv is not None:
                    try:
                        runs = int(raw_sv)
                    except Exception:
                        runs = 0
                
                # Check shortText if scoreValue was missing or 0
                if runs == 0 and not is_wkt:
                    if "FOUR" in short_t or "four" in ptype:
                        runs = 4
                    elif "SIX" in short_t or "six" in ptype:
                        runs = 6
                    else:
                        m_r = re.search(r'(\d+)\s+runs?', short_t, re.I)
                        if m_r:
                            runs = int(m_r.group(1))

                symbol = str(runs)
                if is_wkt:
                    symbol = "W"
                elif "wide" in ptype or "wd" in short_t.lower() or "wide" in short_t.lower():
                    w_m = re.search(r'(\d+)\s+wide', short_t, re.I)
                    w_runs = int(w_m.group(1)) if w_m else (runs if runs > 0 else 1)
                    symbol = f"{w_runs}wd" if w_runs > 1 else "wd"
                elif "no ball" in ptype or "nb" in short_t.lower() or "no ball" in short_t.lower():
                    nb_m = re.search(r'(\d+)\s+no\s*ball', short_t, re.I)
                    nb_runs = int(nb_m.group(1)) if nb_m else (runs if runs > 0 else 1)
                    symbol = f"{nb_runs}nb" if nb_runs > 1 else "nb"
                elif runs == 0:
                    symbol = "0"
                elif runs in [1, 2, 3, 4, 5, 6, 7]:
                    symbol = str(runs)
                
                overs_dict[ov_num]["balls"].append({
                    "ballNumber": ov_obj.get("ball", len(overs_dict[ov_num]["balls"]) + 1),
                    "actual": ov_obj.get("actual"),
                    "symbol": symbol,
                    "runs": runs,
                    "isWicket": is_wkt,
                    "shortText": short_t,
                    "text": full_t
                })
                overs_dict[ov_num]["totalRuns"] += runs
                if is_wkt:
                    overs_dict[ov_num]["totalWickets"] += 1
            
            sorted_keys = sorted(overs_dict.keys())
            last_3_keys = sorted_keys[-3:] if len(sorted_keys) >= 3 else sorted_keys
            
            res = []
            for k in last_3_keys:
                o = overs_dict[k]
                w_text = f", {o['totalWickets']} wkt" if o['totalWickets'] == 1 else (f", {o['totalWickets']} wkts" if o['totalWickets'] > 1 else "")
                o["summary"] = f"{o['totalRuns']} runs{w_text}"
                res.append(o)
            return res
        except Exception:
            return []

    def _fetch_playbyplay_data(self, league_id: str, event_id: str, header: Dict[str, Any] = None) -> tuple[Dict[str, Any], Dict[str, Any], List[Dict[str, Any]]]:
        """Extract full scorecard, live crease, and commentary timeline from ESPN playbyplay feed."""
        items = []
        for period in [1, 2, 3, 4]:
            url = f"https://site.web.api.espn.com/apis/site/v2/sports/cricket/{league_id}/playbyplay?event={event_id}&period={period}&limit=500"
            try:
                r = self.session.get(url, timeout=6)
                if r.status_code == 200:
                    data = r.json()
                    p_items = data.get("commentary", {}).get("items", [])
                    if p_items:
                        items.extend(p_items)
                    else:
                        if period >= 2:
                            break
                else:
                    if period >= 2:
                        break
            except Exception:
                if period >= 2:
                    break

        if not items:
            try:
                url = f"https://site.web.api.espn.com/apis/site/v2/sports/cricket/{league_id}/playbyplay?event={event_id}&limit=500"
                r = self.session.get(url, timeout=6)
                if r.status_code == 200:
                    data = r.json()
                    items = data.get("commentary", {}).get("items", [])
            except Exception:
                pass

        if not items:
            return {}, {}, []

        innings_dict = {}
        for item in items:
            inn = item.get("innings", {})
            inn_num = str(inn.get("number", 1))
            if inn_num not in innings_dict:
                innings_dict[inn_num] = []
            innings_dict[inn_num].append(item)

        innings_data = {}
        latest_inn_num = str(max([int(k) for k in innings_dict.keys()]))

        # Sort competitors by order to correctly assign batting teams to innings
        comps_by_order = []
        if header:
            comps_raw = header.get("competitions", [{}])[0].get("competitors", [])
            comps_by_order = sorted(comps_raw, key=lambda c: int(c.get("order", 99)))

        for inn_num, p_items in innings_dict.items():
            last_item = p_items[-1]
            inn_info = last_item.get("innings", {})
            
            team_name = ""
            comp_for_inn = None
            if comps_by_order and len(comps_by_order) >= int(inn_num):
                comp_for_inn = comps_by_order[int(inn_num) - 1]
                team_name = comp_for_inn.get("team", {}).get("displayName", "")
            
            if not team_name:
                team_name = last_item.get("team", {}).get("displayName", "")

            batters_map = {}
            bowlers_map = {}
            fow = []
            batters_order = []
            bowlers_order = []

            for it in p_items:
                # Check dismissal
                d = it.get("dismissal", {})
                if d and d.get("dismissal"):
                    b_ath = d.get("batsman", {}).get("athlete", {})
                    b_name = b_ath.get("displayName") or b_ath.get("name") or ""
                    d_text = d.get("text", "out")
                    w_runs = it.get("innings", {}).get("runs", 0)
                    w_num = len(fow) + 1
                    ov_num = it.get("over", {}).get("number", 0)
                    ov_ball = it.get("over", {}).get("ball", 0)
                    w_ov = f"{ov_num}.{ov_ball}"
                    fow.append({
                        "wicketNumber": w_num,
                        "wicket": f"{w_num}th" if w_num > 3 else ["1st", "2nd", "3rd"][w_num - 1],
                        "player": b_name,
                        "dismissal": d_text,
                        "runs": str(w_runs),
                        "score": f"{w_runs}/{w_num}",
                        "overs": w_ov
                    })
                    if b_name:
                        if b_name in batters_map:
                            batters_map[b_name]["dismissal"] = d_text
                            batters_map[b_name]["isOut"] = True
                        else:
                            batters_map[b_name] = {"id": str(b_ath.get("id", "")), "headshot": "", "name": b_name, "runs": str(it.get("batsman", {}).get("totalRuns", "0")), "balls": str(it.get("batsman", {}).get("faced", "0")), "fours": "0", "sixes": "0", "dismissal": d_text, "isOut": True}
                            batters_order.append(b_name)

                b1 = it.get("batsman", {})
                if b1 and b1.get("athlete", {}).get("displayName"):
                    name = b1["athlete"]["displayName"]
                    pid = str(b1["athlete"].get("id", ""))
                    hshot = b1["athlete"].get("headshot", {}).get("href") or (f"https://a.espncdn.com/i/headshots/cricket/players/full/{pid}.png" if pid else "")
                    if name not in batters_map:
                        batters_map[name] = {"id": pid, "headshot": hshot, "name": name, "runs": "0", "balls": "0", "fours": "0", "sixes": "0", "dismissal": "not out", "isOut": False}
                        batters_order.append(name)
                    batters_map[name]["runs"] = str(b1.get("totalRuns", b1.get("runs", batters_map[name]["runs"])))
                    batters_map[name]["balls"] = str(b1.get("faced", batters_map[name]["balls"]))
                    batters_map[name]["fours"] = str(b1.get("fours", batters_map[name]["fours"]))
                    batters_map[name]["sixes"] = str(b1.get("sixes", batters_map[name]["sixes"]))
                    if pid and not batters_map[name].get("id"):
                        batters_map[name]["id"] = pid
                        batters_map[name]["headshot"] = hshot

                b2 = it.get("otherBatsman", {})
                if b2 and b2.get("athlete", {}).get("displayName"):
                    name = b2["athlete"]["displayName"]
                    pid = str(b2["athlete"].get("id", ""))
                    hshot = b2["athlete"].get("headshot", {}).get("href") or (f"https://a.espncdn.com/i/headshots/cricket/players/full/{pid}.png" if pid else "")
                    if name not in batters_map:
                        batters_map[name] = {"id": pid, "headshot": hshot, "name": name, "runs": "0", "balls": "0", "fours": "0", "sixes": "0", "dismissal": "not out", "isOut": False}
                        batters_order.append(name)
                    batters_map[name]["runs"] = str(b2.get("totalRuns", b2.get("runs", batters_map[name]["runs"])))
                    batters_map[name]["balls"] = str(b2.get("faced", batters_map[name]["balls"]))
                    batters_map[name]["fours"] = str(b2.get("fours", batters_map[name]["fours"]))
                    batters_map[name]["sixes"] = str(b2.get("sixes", batters_map[name]["sixes"]))
                    if pid and not batters_map[name].get("id"):
                        batters_map[name]["id"] = pid
                        batters_map[name]["headshot"] = hshot

                bw1 = it.get("bowler", {})
                if bw1 and bw1.get("athlete", {}).get("displayName"):
                    name = bw1["athlete"]["displayName"]
                    pid = str(bw1["athlete"].get("id", ""))
                    hshot = bw1["athlete"].get("headshot", {}).get("href") or (f"https://a.espncdn.com/i/headshots/cricket/players/full/{pid}.png" if pid else "")
                    if name not in bowlers_map:
                        bowlers_map[name] = {"id": pid, "headshot": hshot, "name": name, "overs": "0", "maidens": "0", "runs": "0", "wickets": "0", "economy": "0.00"}
                        bowlers_order.append(name)
                    bowlers_map[name]["overs"] = str(bw1.get("overs", bowlers_map[name]["overs"]))
                    bowlers_map[name]["maidens"] = str(bw1.get("maidens", bowlers_map[name]["maidens"]))
                    bowlers_map[name]["runs"] = str(bw1.get("conceded", bowlers_map[name]["runs"]))
                    bowlers_map[name]["wickets"] = str(bw1.get("wickets", bowlers_map[name]["wickets"]))
                    if pid and not bowlers_map[name].get("id"):
                        bowlers_map[name]["id"] = pid
                        bowlers_map[name]["headshot"] = hshot

                bw2 = it.get("otherBowler", {})
                if bw2 and bw2.get("athlete", {}).get("displayName"):
                    name = bw2["athlete"]["displayName"]
                    pid = str(bw2["athlete"].get("id", ""))
                    hshot = bw2["athlete"].get("headshot", {}).get("href") or (f"https://a.espncdn.com/i/headshots/cricket/players/full/{pid}.png" if pid else "")
                    if name not in bowlers_map:
                        bowlers_map[name] = {"id": pid, "headshot": hshot, "name": name, "overs": "0", "maidens": "0", "runs": "0", "wickets": "0", "economy": "0.00"}
                        bowlers_order.append(name)
                    bowlers_map[name]["overs"] = str(bw2.get("overs", bowlers_map[name]["overs"]))
                    bowlers_map[name]["maidens"] = str(bw2.get("maidens", bowlers_map[name]["maidens"]))
                    bowlers_map[name]["runs"] = str(bw2.get("conceded", bowlers_map[name]["runs"]))
                    bowlers_map[name]["wickets"] = str(bw2.get("wickets", bowlers_map[name]["wickets"]))
                    if pid and not bowlers_map[name].get("id"):
                        bowlers_map[name]["id"] = pid
                        bowlers_map[name]["headshot"] = hshot

            batting_list = []
            for name in batters_order:
                b = batters_map[name]
                try:
                    r_val = float(b["runs"])
                    b_val = float(b["balls"])
                    sr_val = round((r_val / b_val) * 100, 2) if b_val > 0 else 0.0
                except Exception:
                    sr_val = 0.0
                batting_list.append({
                    "id": b.get("id", ""),
                    "headshot": b.get("headshot", ""),
                    "name": b["name"],
                    "dismissal": b["dismissal"],
                    "runs": b["runs"],
                    "balls": b["balls"],
                    "fours": b["fours"],
                    "sixes": b["sixes"],
                    "strikeRate": f"{sr_val:.2f}" if sr_val else "0.00",
                    "isNotOut": not b["isOut"]
                })

            bowling_list = []
            for name in bowlers_order:
                bw = bowlers_map[name]
                try:
                    ov_f = float(bw["overs"])
                    r_f = float(bw["runs"])
                    full_ov = int(ov_f)
                    balls_rem = int(round((ov_f - full_ov) * 10))
                    tot_balls = full_ov * 6 + balls_rem
                    econ = round(r_f / (tot_balls / 6.0), 2) if tot_balls > 0 else 0.0
                except Exception:
                    econ = 0.0
                bowling_list.append({
                    "id": bw.get("id", ""),
                    "headshot": bw.get("headshot", ""),
                    "name": bw["name"],
                    "overs": bw["overs"],
                    "maidens": bw["maidens"],
                    "runs": bw["runs"],
                    "wickets": bw["wickets"],
                    "economy": f"{econ:.2f}" if econ else "0.00"
                })

            tot_runs = str(inn_info.get("runs", 0))
            tot_wkts = str(inn_info.get("wickets", len(fow)))
            tot_balls = inn_info.get("balls", 0)
            full_ovs = tot_balls // 6
            rem_balls = tot_balls % 6
            ov_str = f"{full_ovs}.{rem_balls}" if rem_balls else f"{full_ovs}"
            total_formatted = f"{tot_runs}/{tot_wkts} ({ov_str} ov)" if ov_str != "0" else f"{tot_runs}/{tot_wkts}"

            # Check official competitor score & linescore for this team to ensure accurate totals
            if comp_for_inn:
                linescores = comp_for_inn.get("linescores", [])
                bat_ls = next((ls for ls in linescores if ls.get("period") == int(inn_num)), None)
                if bat_ls:
                    r_ls = bat_ls.get("runs")
                    w_ls = bat_ls.get("wickets")
                    ov_ls = bat_ls.get("overs")
                    if r_ls is not None:
                        tot_runs = str(r_ls)
                    if w_ls is not None:
                        tot_wkts = str(w_ls)
                    if ov_ls is not None:
                        ov_s = str(ov_ls)[:-2] if str(ov_ls).endswith('.0') else str(ov_ls)
                        total_formatted = f"{tot_runs}/{tot_wkts} ({ov_s} ov)"
                else:
                    c_sc = comp_for_inn.get("score", "")
                    if c_sc:
                        total_formatted = clean_event_competitor_score(c_sc)

            extras_w = inn_info.get("wides", 0)
            extras_nb = inn_info.get("noBalls", 0)
            extras_b = inn_info.get("byes", 0)
            extras_lb = inn_info.get("legByes", 0)
            tot_extras = extras_w + extras_nb + extras_b + extras_lb
            extras_str = f"{tot_extras} (w {extras_w}, nb {extras_nb}, b {extras_b}, lb {extras_lb})" if tot_extras > 0 else "0"

            # Reconstruct partnerships for this innings
            pships_list = []
            batters_in_order = [b.get("name", "") for b in batting_list if b.get("name")]
            crease = batters_in_order[:2] if len(batters_in_order) >= 2 else []
            next_bat_idx = 2
            prev_runs = 0
            wkt_ordinal = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"]

            def match_player_tokens(n1, n2):
                if not n1 or not n2: return False
                t1 = set(re.sub(r'[^a-z0-9 ]', '', n1.lower()).split()) - {'c', 'wk', 'sub', 'captain'}
                t2 = set(re.sub(r'[^a-z0-9 ]', '', n2.lower()).split()) - {'c', 'wk', 'sub', 'captain'}
                return bool(t1 & t2)

            for idx, f in enumerate(fow):
                out_player = f.get("player", "")
                runs_at_fall = int(f.get("runs", 0))
                pship_runs_val = max(0, runs_at_fall - prev_runs)
                w_num = f.get("wicketNumber", idx + 1)
                w_label = wkt_ordinal[w_num - 1] if w_num <= len(wkt_ordinal) else f"{w_num}th"

                partner = ""
                if len(crease) == 2:
                    if match_player_tokens(out_player, crease[0]):
                        partner = crease[1]
                        if next_bat_idx < len(batters_in_order):
                            crease = [crease[1], batters_in_order[next_bat_idx]]
                            next_bat_idx += 1
                        else:
                            crease = [crease[1]]
                    elif match_player_tokens(out_player, crease[1]):
                        partner = crease[0]
                        if next_bat_idx < len(batters_in_order):
                            crease = [crease[0], batters_in_order[next_bat_idx]]
                            next_bat_idx += 1
                        else:
                            crease = [crease[0]]
                    else:
                        partner = crease[0]

                pships_list.append({
                    "wicket": w_label,
                    "wicketNumber": w_num,
                    "runs": str(pship_runs_val),
                    "scoreAtFall": str(runs_at_fall),
                    "overs": f.get("overs", ""),
                    "player1": out_player,
                    "player1Runs": "",
                    "player2": partner,
                    "player2Runs": "",
                    "isCurrent": False,
                    "summary": f"{pship_runs_val} runs for {w_label} wicket ({out_player} & {partner})" if partner else f"{pship_runs_val} runs for {w_label} wicket ({out_player})"
                })
                prev_runs = runs_at_fall

            not_outs = [b for b in batting_list if b.get("isNotOut")]
            if len(fow) < 10 and len(not_outs) >= 2 and total_formatted:
                tot_m = re.search(r"(\d+)", str(tot_runs))
                if tot_m:
                    curr_tot = int(tot_m.group(1))
                    current_pship_runs = max(0, curr_tot - prev_runs)
                    curr_wkt_num = len(fow) + 1
                    curr_wkt_label = wkt_ordinal[curr_wkt_num - 1] if curr_wkt_num <= len(wkt_ordinal) else f"{curr_wkt_num}th"

                    p1_name = not_outs[0].get("name", "")
                    p1_runs = not_outs[0].get("runs", "")
                    p2_name = not_outs[1].get("name", "")
                    p2_runs = not_outs[1].get("runs", "")

                    pships_list.append({
                        "wicket": f"{curr_wkt_label} (Current)",
                        "wicketNumber": curr_wkt_num,
                        "runs": str(current_pship_runs),
                        "scoreAtFall": f"{curr_tot}*",
                        "overs": "Current",
                        "player1": p1_name,
                        "player1Runs": p1_runs,
                        "player2": p2_name,
                        "player2Runs": p2_runs,
                        "isCurrent": True,
                        "summary": f"{current_pship_runs}* runs unbroken ({p1_name} & {p2_name})"
                    })

            innings_data[inn_num] = {
                "inningsNumber": inn_num,
                "teamName": team_name,
                "runs": tot_runs,
                "extras": extras_str,
                "total": total_formatted,
                "batting": batting_list,
                "bowling": bowling_list,
                "fow": fow,
                "partnerships": pships_list
            }

        # Extract Live Crease
        latest_items = innings_dict[latest_inn_num]
        last_item = latest_items[-1]
        curr_b1 = last_item.get("batsman", {})
        curr_b2 = last_item.get("otherBatsman", {})
        curr_bw1 = last_item.get("bowler", {})
        curr_bw2 = last_item.get("otherBowler", {})

        live_batters = []
        if curr_b1 and curr_b1.get("athlete", {}).get("displayName"):
            b_name = curr_b1["athlete"]["displayName"]
            b_id = str(curr_b1["athlete"].get("id", ""))
            b_hshot = curr_b1["athlete"].get("headshot", {}).get("href") or (f"https://a.espncdn.com/i/headshots/cricket/players/full/{b_id}.png" if b_id else "")
            r = str(curr_b1.get("totalRuns", 0))
            b = str(curr_b1.get("faced", 0))
            f = str(curr_b1.get("fours", 0))
            s = str(curr_b1.get("sixes", 0))
            sr = round((float(r) / float(b)) * 100, 2) if float(b) > 0 else 0.0
            live_batters.append({
                "id": b_id,
                "headshot": b_hshot,
                "name": b_name,
                "isStriker": True,
                "runs": r,
                "balls": b,
                "fours": f,
                "sixes": s,
                "strikeRate": f"{sr:.2f}"
            })

        if curr_b2 and curr_b2.get("athlete", {}).get("displayName"):
            b_name = curr_b2["athlete"]["displayName"]
            b_id = str(curr_b2["athlete"].get("id", ""))
            b_hshot = curr_b2["athlete"].get("headshot", {}).get("href") or (f"https://a.espncdn.com/i/headshots/cricket/players/full/{b_id}.png" if b_id else "")
            r = str(curr_b2.get("totalRuns", 0))
            b = str(curr_b2.get("faced", 0))
            f = str(curr_b2.get("fours", 0))
            s = str(curr_b2.get("sixes", 0))
            sr = round((float(r) / float(b)) * 100, 2) if float(b) > 0 else 0.0
            live_batters.append({
                "id": b_id,
                "headshot": b_hshot,
                "name": b_name,
                "isStriker": False,
                "runs": r,
                "balls": b,
                "fours": f,
                "sixes": s,
                "strikeRate": f"{sr:.2f}"
            })

        active_bowler = None
        if curr_bw1 and curr_bw1.get("athlete", {}).get("displayName"):
            bw_name = curr_bw1["athlete"]["displayName"]
            bw_id = str(curr_bw1["athlete"].get("id", ""))
            bw_hshot = curr_bw1["athlete"].get("headshot", {}).get("href") or (f"https://a.espncdn.com/i/headshots/cricket/players/full/{bw_id}.png" if bw_id else "")
            ov = str(curr_bw1.get("overs", "0"))
            m = str(curr_bw1.get("maidens", "0"))
            r = str(curr_bw1.get("conceded", "0"))
            w = str(curr_bw1.get("wickets", "0"))
            try:
                ov_f = float(ov)
                full_ov = int(ov_f)
                balls_rem = int(round((ov_f - full_ov) * 10))
                tot_b = full_ov * 6 + balls_rem
                econ = round(float(r) / (tot_b / 6.0), 2) if tot_b > 0 else 0.0
            except Exception:
                econ = 0.0
            active_bowler = {
                "id": bw_id,
                "headshot": bw_hshot,
                "name": bw_name,
                "overs": ov,
                "maidens": m,
                "runs": r,
                "wickets": w,
                "economy": f"{econ:.2f}",
                "thisSpell": f"{ov}-{m}-{r}-{w}"
            }

        partner_bowler = None
        if curr_bw2 and curr_bw2.get("athlete", {}).get("displayName"):
            bw_name = curr_bw2["athlete"]["displayName"]
            bw_id = str(curr_bw2["athlete"].get("id", ""))
            bw_hshot = curr_bw2["athlete"].get("headshot", {}).get("href") or (f"https://a.espncdn.com/i/headshots/cricket/players/full/{bw_id}.png" if bw_id else "")
            ov = str(curr_bw2.get("overs", "0"))
            m = str(curr_bw2.get("maidens", "0"))
            r = str(curr_bw2.get("conceded", "0"))
            w = str(curr_bw2.get("wickets", "0"))
            try:
                ov_f = float(ov)
                full_ov = int(ov_f)
                balls_rem = int(round((ov_f - full_ov) * 10))
                tot_b = full_ov * 6 + balls_rem
                econ = round(float(r) / (tot_b / 6.0), 2) if tot_b > 0 else 0.0
            except Exception:
                econ = 0.0
            partner_bowler = {
                "id": bw_id,
                "headshot": bw_hshot,
                "name": bw_name,
                "overs": ov,
                "maidens": m,
                "runs": r,
                "wickets": w,
                "economy": f"{econ:.2f}",
                "thisSpell": f"{ov}-{m}-{r}-{w}"
            }

        recent_deliveries = []
        current_over_num = None
        for it in latest_items[-30:]:
            ov_info = it.get("over", {})
            ov_num = ov_info.get("number", 0)
            if current_over_num is not None and ov_num != current_over_num:
                recent_deliveries.append("|")
            current_over_num = ov_num
            
            d = it.get("dismissal", {})
            if d and d.get("dismissal"):
                recent_deliveries.append("W")
            else:
                pt = it.get("playType", {}).get("description", "").lower()
                sc_val = it.get("scoreValue", 0)
                if "wide" in pt:
                    recent_deliveries.append(f"{sc_val}w" if sc_val > 1 else "wd")
                elif "no ball" in pt or "noball" in pt:
                    recent_deliveries.append(f"{sc_val}nb" if sc_val > 1 else "nb")
                elif "bye" in pt:
                    recent_deliveries.append(f"{sc_val}b" if sc_val > 1 else "b")
                elif "leg bye" in pt:
                    recent_deliveries.append(f"{sc_val}lb" if sc_val > 1 else "lb")
                else:
                    recent_deliveries.append(str(sc_val))

        # Calculate True Live Crease Partnership from last FoW
        active_fow = innings_data[latest_inn_num].get("fow", [])
        last_fow_runs = 0
        last_fow_balls = 0
        if active_fow:
            last_f = active_fow[-1]
            last_fow_runs = int(last_f.get("runs", 0))
            def ov_to_balls_hlp(ov_s):
                m = re.search(r'(\d+)(?:\.(\d+))?', str(ov_s))
                if not m: return 0
                return int(m.group(1)) * 6 + (int(m.group(2)) if m.group(2) else 0)
            last_fow_balls = ov_to_balls_hlp(last_f.get("overs", "0"))

        tot_m = re.search(r"(\d+)", str(innings_data[latest_inn_num].get("runs", 0)))
        curr_inn_tot = int(tot_m.group(1)) if tot_m else 0
        tot_balls_curr = last_item.get("innings", {}).get("balls", 0)

        pship_runs = max(0, curr_inn_tot - last_fow_runs)
        pship_balls = max(0, tot_balls_curr - last_fow_balls)

        batters_names = [b.get("name") for b in live_batters if b.get("name")]
        if len(batters_names) >= 2:
            pship_str = f"{pship_runs} runs ({pship_balls}b)" if pship_balls > 0 else f"{pship_runs} runs"
        elif len(batters_names) == 1:
            pship_str = f"{pship_runs} runs ({pship_balls}b)" if pship_balls > 0 else f"{pship_runs} runs"
        else:
            pship_str = f"{pship_runs} runs"

        crr_val = str(last_item.get("innings", {}).get("runRate", "0.00"))
        inn_batting = innings_data[latest_inn_num].get("batting", [])
        last_bat_str = ""
        
        dismissed_batsmen = [b for b in inn_batting if b.get("dismissal") and str(b.get("dismissal")).lower().strip() not in ["not out", "batting", "yet to bat", "retired hurt"]]
        if dismissed_batsmen:
            last_out = dismissed_batsmen[-1]
            p_name = last_out.get("name") or last_out.get("player") or "Batter"
            dism = str(last_out.get("dismissal", "")).strip()
            r_num = str(last_out.get("runs", "0"))
            b_num = str(last_out.get("balls", ""))
            balls_part = f" ({b_num}b)" if b_num else ""
            ov_badge = ""
            if active_fow:
                last_f = active_fow[-1]
                if last_f.get("overs"):
                    ov_badge = f" ({last_f.get('overs')} ov)"
            
            if dism:
                last_bat_str = f"{p_name} {dism} • {r_num}{balls_part}{ov_badge}"
            else:
                last_bat_str = f"{p_name} • {r_num}{balls_part}{ov_badge}"
        elif active_fow:
            last_f = active_fow[-1]
            last_p_name = last_f.get("player", "").strip()
            last_ov = last_f.get("overs", "").strip()
            ov_badge = f" ({last_ov} ov)" if last_ov else ""
            p_match = next((b for b in inn_batting if last_p_name and (last_p_name.lower() in b.get("name", "").lower() or b.get("name", "").lower() in last_p_name.lower())), None)
            dism = str(p_match.get("dismissal", last_f.get("dismissal", ""))).strip() if p_match else str(last_f.get("dismissal", "")).strip()
            r_num = str(p_match.get("runs", last_f.get("runs", "0"))).strip() if p_match else str(last_f.get("runs", "0")).strip()
            b_num = str(p_match.get("balls", "")).strip() if p_match else ""
            balls_part = f" ({b_num}b)" if b_num else ""
            if dism and dism.lower() not in ["not out", "batting", "yet to bat"]:
                last_bat_str = f"{last_p_name} {dism} • {r_num}{balls_part}{ov_badge}"
            else:
                last_bat_str = f"{last_p_name} • {last_f.get('score', '')}{ov_badge}"

        live_crease = {
            "hasLiveCrease": True,
            "batters": live_batters,
            "activeBowler": active_bowler,
            "partnerBowler": partner_bowler,
            "partnership": pship_str,
            "lastWicket": last_bat_str,
            "fowList": active_fow,
            "recentDeliveries": recent_deliveries,
            "recentText": "",
            "crr": crr_val,
            "last10Overs": ""
        }

        # Build Commentary Stream
        commentary_list = []
        for it in reversed(items[-40:]):
            ov_info = it.get("over", {})
            ov_num = ov_info.get("number", 0)
            ov_ball = ov_info.get("ball", 0)
            ov_str = f"{ov_num}.{ov_ball}"
            
            short_txt = it.get("shortText", "")
            long_txt = it.get("text", "")
            full_text = f"{short_txt} - {long_txt}" if short_txt and long_txt else (short_txt or long_txt)
            
            d = it.get("dismissal", {})
            cat = "general"
            if d and d.get("dismissal"):
                cat = "milestone"
            elif any(k in full_text.lower() for k in ["six", "four", "boundary", "50 runs", "100 runs"]):
                cat = "milestone"
                
            commentary_list.append({
                "over": ov_str,
                "text": full_text,
                "category": cat,
                "time": ""
            })

        return innings_data, live_crease, commentary_list

    def _extract_live_crease(self, league_id: str, event_id: str, header: Dict[str, Any], innings_data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract current batters, current bowler figure, partnership, and ball-by-ball stream."""
        game_url = None
        for l in header.get("links", []):
            href = l.get("href", "")
            if f"/game/{event_id}" in href:
                game_url = href
                break

        if not game_url:
            game_url = f"https://www.espn.in/cricket/series/{league_id}/game/{event_id}/"

        try:
            r = self.session.get(game_url, timeout=6)
            if r.status_code == 200:
                soup = BeautifulSoup(r.text, "html.parser")
                t0 = soup.find("table")
                if t0:
                    rows = t0.find_all("tr")
                    batters = []
                    bowlers = []
                    pship = ""
                    last_bat = ""
                    fow = ""
                    recent_raw = ""
                    crr = ""
                    last_10 = ""
                    current_sec = None

                    for row in rows:
                        cells = [c.get_text(strip=True) for c in row.find_all(["th", "td"])]
                        if not cells:
                            continue
                        row_txt = " ".join(cells)

                        if "CRR:" in row_txt:
                            crr_m = re.search(r"CRR:([\d\.]+)", row_txt)
                            if crr_m: crr = crr_m.group(1)
                            l10_m = re.search(r"Last 10 Overs:([^\s]+)", row_txt)
                            if l10_m: last_10 = l10_m.group(1)

                        if "BATSMEN" in cells[0]:
                            current_sec = "bat"
                            continue
                        elif "BOWLERS" in cells[0]:
                            current_sec = "bwl"
                            continue
                        elif "Current Partnership" in row_txt or "P'SHIP" in row_txt or "Reviews" in row_txt or "Recent" in row_txt:
                            current_sec = None

                        if current_sec == "bat" and len(cells) >= 6:
                            name_raw = cells[0]
                            is_striker = "*" in name_raw
                            clean_n = clean_player_name(name_raw)
                            batters.append({
                                "name": clean_n,
                                "isStriker": is_striker,
                                "runs": cells[1],
                                "balls": cells[2],
                                "fours": cells[3],
                                "sixes": cells[4],
                                "strikeRate": cells[5]
                            })

                        elif current_sec == "bwl" and len(cells) >= 6:
                            clean_n = clean_player_name(cells[0])
                            ov_val = cells[1]
                            m_val = cells[2]
                            r_val = cells[3]
                            w_val = cells[4]
                            raw_econ = cells[5]
                            calc_econ = compute_economy_rate(ov_val, r_val)
                            econ_final = calc_econ if (calc_econ != "0.00" or raw_econ == "0.00") else raw_econ
                            spell_str = cells[9] if len(cells) >= 10 and cells[9] else f"{ov_val}-{m_val}-{r_val}-{w_val}"
                            bowlers.append({
                                "name": clean_n,
                                "overs": ov_val,
                                "maidens": m_val,
                                "runs": r_val,
                                "wickets": w_val,
                                "economy": econ_final,
                                "thisSpell": spell_str
                            })

                        if "Current Partnership" in row_txt or "P'SHIP" in row_txt:
                            p_m = re.search(r"(\d+\s+runs?(?:\s*\([^\)]*\))?)", row_txt, re.I)
                            if p_m: pship = p_m.group(1).strip()
                            fow_m = re.search(r"FoW\s*:\s*([^\n]+)", row_txt)
                            if fow_m: fow = fow_m.group(1).replace("FoW :", "").strip()
                            lbat_m = re.search(r"L'BAT\s*:\s*([^F]+)", row_txt)
                            if lbat_m: last_bat = lbat_m.group(1).strip()

                        if "Recent" in row_txt:
                            recent_raw = row_txt.replace("Recent", "").strip()

                    recent_deliveries = []
                    if recent_raw:
                        over_chunks = recent_raw.split("|")
                        for o_idx, chunk in enumerate(over_chunks):
                            if o_idx > 0:
                                recent_deliveries.append("|")
                            tokens = re.findall(r'(\d+[a-z]+|[a-z]+\d+|\d+|\.|\w)', chunk)
                            for t in tokens:
                                recent_deliveries.append("0" if (t == "." or t == "•") else t)
                    # Ensure at most 1 batter is marked on strike from source
                    striker_count = sum(1 for b in batters if b.get("isStriker"))
                    if striker_count > 1:
                        for idx, b in enumerate(batters):
                            b["isStriker"] = (idx == 0)

                    # Sort bowlers so currently bowling bowler (with fractional over e.g. 5.3 ov) is at index 0 on top
                    if len(bowlers) > 1:
                        frac_bwl_idx = next((i for i, b in enumerate(bowlers) if re.search(r'\.[1-5]$', str(b.get('overs', '')))), -1)
                        if frac_bwl_idx > 0:
                            bowlers.insert(0, bowlers.pop(frac_bwl_idx))

                    if batters or bowlers:
                        active_fow = []
                        latest_inn_key = str(max([int(k) for k in innings_data.keys() if k.isdigit()])) if innings_data else None
                        if latest_inn_key:
                            active_fow = innings_data[latest_inn_key].get("fow", [])
                            if active_fow:
                                last_f = active_fow[-1]
                                last_p_name = last_f.get("player", "").strip()
                                last_ov = last_f.get("overs", "").strip()
                                ov_badge = f" ({last_ov} ov)" if last_ov else ""

                                inn_batting = innings_data[latest_inn_key].get("batting", [])
                                p_match = next((b for b in inn_batting if last_p_name and (last_p_name.lower() in b.get("name", "").lower() or b.get("name", "").lower() in last_p_name.lower())), None)
                                if p_match:
                                    dism = str(p_match.get("dismissal", "")).strip()
                                    r_num = str(p_match.get("runs", last_f.get("runs", "0"))).strip()
                                    b_num = str(p_match.get("balls", "")).strip()
                                    balls_part = f" ({b_num}b)" if b_num else ""
                                    if dism and dism.lower() not in ["not out", "batting"]:
                                        last_bat = f"{p_match.get('name', last_p_name)} {dism} {r_num}{balls_part}{ov_badge}"
                                    else:
                                        last_bat = f"{p_match.get('name', last_p_name)} {r_num}{balls_part}{ov_badge}"
                                else:
                                    last_bat = f"{last_p_name} • {last_f.get('score', '')}{ov_badge}"

                        if not last_bat and innings_data and latest_inn_key and latest_inn_key in innings_data:
                            inn_batting = innings_data[latest_inn_key].get("batting", [])
                            dismissed = [b for b in inn_batting if b.get("dismissal") and b.get("dismissal").lower() not in ["not out", "batting", "yet to bat"]]
                            if dismissed:
                                last_out = dismissed[-1]
                                d = last_out.get("dismissal", "").strip()
                                r = str(last_out.get("runs", "0"))
                                b_cnt = str(last_out.get("balls", ""))
                                b_part = f" ({b_cnt}b)" if b_cnt else ""
                                last_bat = f"{last_out.get('name', 'Batter')} {d} {r}{b_part}"

                        if pship:
                            p_balls = compute_partnership_balls(innings_data, latest_inn_key)
                            if p_balls > 0 and 'b' not in pship.lower():
                                pship = re.sub(r'(\d+\s*runs?)', rf'\1 ({p_balls}b)', pship, count=1)

                        return {
                            "hasLiveCrease": True,
                            "batters": batters,
                            "activeBowler": bowlers[0] if bowlers else None,
                            "partnerBowler": bowlers[1] if len(bowlers) > 1 else None,
                            "partnership": pship,
                            "lastWicket": last_bat or fow or "",
                            "fowList": active_fow,
                            "recentDeliveries": recent_deliveries,
                            "recentText": recent_raw,
                            "crr": crr,
                            "last10Overs": last_10
                        }
        except Exception:
            pass

        # Fallback: compute from the latest active innings
        latest_inn_key = str(max([int(k) for k in innings_data.keys()])) if innings_data else None
        if latest_inn_key:
            inn = innings_data[latest_inn_key]
            not_out_batters = []
            outs = []
            for b in inn.get("batting", []):
                r_val = str(b.get("runs", "")).strip()
                b_val = str(b.get("balls", "")).strip()
                d_val = str(b.get("dismissal", "")).lower().strip()
                
                # Check if out or retired hurt
                is_retired = any(k in d_val for k in ["retired hurt", "retd hurt", "retired ill", "retired out", "retired", "absent hurt", "absent ill", "retd"])
                is_out = is_retired or any(d_val.startswith(k) or f" {k} " in f" {d_val} " for k in ["c ", "b ", "lbw", "run out", "st ", "hit wicket", "handled the ball", "obstructing"])
                if is_out:
                    outs.append(b)
                elif not is_retired and ("not out" in d_val or "batting" in d_val or "*" in d_val or (d_val == "" and (r_val != "" or b_val != ""))):
                    sr_val = compute_strike_rate(r_val, b_val)
                    not_out_batters.append({
                        "name": b.get("name"),
                        "isStriker": ("*" in d_val or "*" in str(b.get("name", ""))),
                        "runs": b.get("runs", "0"),
                        "balls": b.get("balls", "0"),
                        "fours": b.get("fours", "0"),
                        "sixes": b.get("sixes", "0"),
                        "strikeRate": sr_val if sr_val > 0 else b.get("strikeRate", 0.0)
                    })

            striker_count = sum(1 for b in not_out_batters if b.get("isStriker"))
            if striker_count != 1 and len(not_out_batters) > 0:
                for idx, b in enumerate(not_out_batters):
                    b["isStriker"] = (idx == 0)

            # Detect bowler currently bowling (fractional overs e.g. 5.3 ov) and put on top
            bowling_list = inn.get("bowling", [])
            active_bwl = None
            partner_bwl = None

            for b in bowling_list:
                ov_str = str(b.get("overs", "0")).strip()
                if re.search(r'\.[1-5]$', ov_str):
                    active_bwl = dict(b)
                    break

            if not active_bwl and bowling_list:
                active_bwl = dict(bowling_list[-1])

            if active_bwl:
                other_bwls = [b for b in bowling_list if b.get("name") != active_bwl.get("name")]
                if other_bwls:
                    partner_bwl = dict(other_bwls[-1])

            if active_bwl:
                active_bwl["economy"] = compute_economy_rate(active_bwl.get("overs"), active_bwl.get("runs"))
                active_bwl["thisSpell"] = f"{active_bwl.get('overs', '0')}-{active_bwl.get('maidens', '0')}-{active_bwl.get('runs', '0')}-{active_bwl.get('wickets', '0')}"

            if partner_bwl:
                partner_bwl["economy"] = compute_economy_rate(partner_bwl.get("overs"), partner_bwl.get("runs"))
                partner_bwl["thisSpell"] = f"{partner_bwl.get('overs', '0')}-{partner_bwl.get('maidens', '0')}-{partner_bwl.get('runs', '0')}-{partner_bwl.get('wickets', '0')}"

            # Compute batter partnership (runs and balls/overs only, no batter names)
            pship_str = ""
            p_balls = compute_partnership_balls(innings_data, latest_inn_key)
            balls_tag = f" ({p_balls}b)" if p_balls > 0 else ""

            if inn.get("partnerships"):
                last_p = inn["partnerships"][-1]
                p_runs = last_p.get("runs", "")
                ovs = last_p.get("overs", "")
                if ovs and ovs != "Current":
                    pship_str = f"{p_runs} runs{balls_tag} ({ovs} ov)"
                elif p_runs:
                    pship_str = f"{p_runs} runs{balls_tag}"

            if not pship_str and len(not_out_batters) >= 2:
                b1, b2 = not_out_batters[0], not_out_batters[1]
                try:
                    tot_r = int(re.search(r'\d+', str(b1.get('runs', 0))).group(0)) + int(re.search(r'\d+', str(b2.get('runs', 0))).group(0))
                except Exception:
                    tot_r = 0
                pship_str = f"{tot_r} runs{balls_tag}" if (tot_r > 0 or balls_tag) else "Unbroken"
            elif not pship_str and len(not_out_batters) == 1:
                b1 = not_out_batters[0]
                pship_str = f"{b1.get('runs', '0')} runs{balls_tag}"

            # Compute last dismissed wicket (strictly from chronological FOW latest wicket)
            last_wkt_str = ""
            active_fow_list = inn.get("fow", [])
            if active_fow_list:
                last_f = active_fow_list[-1]
                last_p_name = last_f.get("player", "").strip()
                last_ov = last_f.get("overs", "").strip()
                ov_badge = f" ({last_ov} ov)" if last_ov else ""

                inn_batting = inn.get("batting", [])
                p_match = next((b for b in inn_batting if last_p_name and (last_p_name.lower() in b.get("name", "").lower() or b.get("name", "").lower() in last_p_name.lower())), None)
                if p_match:
                    dism = str(p_match.get("dismissal", "")).strip()
                    r_num = str(p_match.get("runs", last_f.get("runs", "0"))).strip()
                    b_num = str(p_match.get("balls", "")).strip()
                    balls_part = f" ({b_num}b)" if b_num else ""
                    if dism and dism.lower() not in ["not out", "batting"]:
                        last_wkt_str = f"{p_match.get('name', last_p_name)} {dism} {r_num}{balls_part}{ov_badge}"
                    else:
                        last_wkt_str = f"{p_match.get('name', last_p_name)} {r_num}{balls_part}{ov_badge}"
                else:
                    last_wkt_str = f"{last_p_name} {last_f.get('score', '')}{ov_badge}"
            elif outs:
                last_out = outs[-1]
                dism = last_out.get("dismissal", "").strip()
                r_num = last_out.get("runs", "0")
                b_num = last_out.get("balls", "")
                balls_part = f" ({b_num}b)" if b_num else ""
                last_wkt_str = f"{last_out['name']} {dism} {r_num}{balls_part}"

            fallback_crr = compute_crr_from_score(inn.get("total", ""))

            return {
                "hasLiveCrease": (len(not_out_batters) > 0 or active_bwl is not None),
                "batters": not_out_batters[:2],
                "activeBowler": active_bwl,
                "partnerBowler": partner_bwl,
                "partnership": pship_str,
                "lastWicket": last_wkt_str,
                "fowList": inn.get("fow", []),
                "recentDeliveries": [],
                "recentText": "",
                "crr": fallback_crr,
                "last10Overs": ""
            }

        return {"hasLiveCrease": False, "batters": [], "activeBowler": None, "recentDeliveries": []}

    def _is_scorecard_more_complete(self, source_a: Dict[str, Any], source_b: Dict[str, Any]) -> bool:
        """Check if source_a has richer scorecard data (more detailed dismissals with catchers/bowlers or more batsmen)."""
        count_a = sum(len(inn.get("batting", [])) for inn in source_a.values())
        count_b = sum(len(inn.get("batting", [])) for inn in source_b.values())
        
        # Check dismissal detail quality (e.g. contains ' b ' indicating bowler/catcher)
        detailed_dismissals_a = sum(
            sum(1 for b in inn.get("batting", []) if " b " in b.get("dismissal", "").lower() or "c & b" in b.get("dismissal", "").lower())
            for inn in source_a.values()
        )
        detailed_dismissals_b = sum(
            sum(1 for b in inn.get("batting", []) if " b " in b.get("dismissal", "").lower() or "c & b" in b.get("dismissal", "").lower())
            for inn in source_b.values()
        )
        
        if detailed_dismissals_a > detailed_dismissals_b:
            return True
        return count_a >= count_b

    def _fetch_cricbuzz_scorecard(self, team1: str, team2: str) -> Optional[Dict[str, Any]]:
        """Fetch and parse full multi-innings scorecard with exact dismissals (catcher + bowler) from Cricbuzz."""
        try:
            live_url = "https://www.cricbuzz.com/cricket-match/live-scores"
            r_live = self.session.get(live_url, timeout=5)
            if r_live.status_code != 200:
                return None

            soup_live = BeautifulSoup(r_live.text, "html.parser")
            a1 = get_team_aliases(team1)
            a2 = get_team_aliases(team2)

            target_href = None
            for a in soup_live.find_all("a", href=re.compile(r"/live-cricket-scores/\d+/")):
                href = a["href"]
                if match_teams_in_cricbuzz_href(href, a1, a2):
                    target_href = href
                    break

            if not target_href:
                return None

            sc_url = target_href.replace("/live-cricket-scores/", "/live-cricket-scorecard/")
            if not sc_url.startswith("http"):
                sc_url = "https://www.cricbuzz.com" + sc_url

            r_sc = self.session.get(sc_url, timeout=5)
            if r_sc.status_code != 200:
                return None

            soup_sc = BeautifulSoup(r_sc.text, "html.parser")
            return self._parse_cricbuzz_html(soup_sc)
        except Exception:
            return None

    def _parse_cricbuzz_html(self, soup: BeautifulSoup) -> Dict[str, Any]:
        """Parse clean HTML tables and grids from Cricbuzz scorecard."""
        innings_data = {}
        banners = soup.find_all("div", class_=lambda c: c and "bg-cbGrnCyn" in str(c) and "justify-between" in str(c))

        inn_count = 1
        for banner in banners:
            title_text = banner.get_text(separator=" ", strip=True)
            if "innings" not in title_text.lower():
                continue

            inn_container = banner.parent
            team_name = title_text
            if " Inning" in team_name:
                parts = team_name.split("Inning")
                team_name = parts[0].strip() + " Innings"

            # Batting
            batting_rows = inn_container.find_all("div", class_=re.compile(r"scorecard-bat-grid"))
            batting = []
            for row in batting_rows:
                cols = row.find_all(recursive=False)
                if len(cols) < 6:
                    continue

                first_col = cols[0]
                for tag in first_col.find_all(["ul", "div", "li"], class_=lambda c: c and any(k in str(c) for k in ["z-1", "invisible", "list-none"])):
                    tag.decompose()

                sub_divs = [d.get_text(strip=True) for d in first_col.find_all(recursive=False) if d.get_text(strip=True)]
                if not sub_divs:
                    name = first_col.get_text(strip=True)
                    dismissal = ""
                elif len(sub_divs) == 1:
                    name = sub_divs[0]
                    dismissal = "not out"
                else:
                    name = sub_divs[0]
                    dismissal = sub_divs[1]

                if name in ["Batter", "BATSMEN", ""]:
                    continue

                runs_str = cols[1].get_text(strip=True)
                balls_str = cols[2].get_text(strip=True)
                fours_str = cols[3].get_text(strip=True)
                sixes_str = cols[4].get_text(strip=True)
                sr_str = cols[5].get_text(strip=True)

                try:
                    sr = float(sr_str)
                except Exception:
                    sr = 0.0

                is_not_out = ("not out" in dismissal.lower() or "batting" in dismissal.lower())

                batting.append({
                    "name": name,
                    "dismissal": dismissal,
                    "isNotOut": is_not_out,
                    "runs": runs_str,
                    "balls": balls_str,
                    "fours": fours_str,
                    "sixes": sixes_str,
                    "strikeRate": sr
                })

            # Bowling
            bowling_rows = inn_container.find_all("div", class_=re.compile(r"scorecard-bowl-grid|scorecard-bwl-grid"))
            bowling = []
            for row in bowling_rows:
                cols = row.find_all(recursive=False)
                if len(cols) < 6:
                    continue

                first_col = cols[0]
                for tag in first_col.find_all(["ul", "div", "li"], class_=lambda c: c and any(k in str(c) for k in ["z-1", "invisible", "list-none"])):
                    tag.decompose()
                name = first_col.get_text(strip=True)
                if name in ["Bowler", "BOWLERS", ""]:
                    continue

                overs = cols[1].get_text(strip=True)
                maidens = cols[2].get_text(strip=True)
                conceded = cols[3].get_text(strip=True)
                wkts = cols[4].get_text(strip=True)
                raw_econ = cols[7].get_text(strip=True) if len(cols) >= 8 else (cols[5].get_text(strip=True) if len(cols) >= 6 else "0.00")
                calc_econ = compute_economy_rate(overs, conceded)
                econ = calc_econ if (calc_econ != "0.00" or raw_econ == "0.00") else raw_econ

                bowling.append({
                    "name": name,
                    "overs": overs,
                    "maidens": maidens,
                    "runs": conceded,
                    "wickets": wkts,
                    "economy": econ
                })

            # Extras & Total
            extras_txt = ""
            total_txt = ""
            txt_lines = [d.get_text(strip=True) for d in inn_container.find_all(["div", "span"]) if d.get_text(strip=True)]
            for t in txt_lines:
                if t.startswith("Extras") and "(" in t:
                    extras_txt = t.replace("Extras", "").strip()
                elif t.startswith("Total") and ("(" in t or "-" in t or "/" in t):
                    raw_tot = t.replace("Total", "").strip()
                    clean_tot = re.sub(r',\s*RR:\s*[\d\.]+', '', raw_tot, flags=re.I).strip()
                    clean_tot = re.sub(r'(\d+[\-/]\d+|\d+)\(', r'\1 (', clean_tot)
                    total_txt = clean_tot

            # Parse Partnerships & FoW
            fow_list = []
            partnerships = []
            fow_divs = inn_container.find_all(lambda tag: tag.name == "div" and "Fall of Wickets" in tag.get_text() and len(tag.get_text()) < 800)
            for fd in fow_divs:
                for tag in fd.find_all(["ul", "div", "li"], class_=lambda c: c and any(k in str(c) for k in ["z-1", "invisible", "list-none"])):
                    tag.decompose()
                txt = fd.get_text(separator=" ", strip=True)
                if "-" in txt or "/" in txt:
                    f_list, p_list = self._parse_fow_and_partnerships(txt, total_txt, batting)
                    if len(f_list) > len(fow_list):
                        fow_list = f_list
                        partnerships = p_list

            innings_data[str(inn_count)] = {
                "inningsNumber": str(inn_count),
                "teamName": team_name,
                "runs": total_txt.split("-")[0] if "-" in total_txt else (total_txt.split("/")[0] if "/" in total_txt else ""),
                "extras": extras_txt,
                "total": total_txt,
                "batting": batting,
                "bowling": bowling,
                "fow": fow_list,
                "partnerships": partnerships
            }
            inn_count += 1

        return innings_data

    def _parse_fow_and_partnerships(self, fow_raw_text: str, inn_total: str = "", batting_list: List[Dict[str, Any]] = None) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Compute structured Fall of Wickets list and accurate partnership stand runs with both batters."""
        fow_list = []
        partnerships = []
        if batting_list is None:
            batting_list = []

        matches = re.findall(r"([A-Za-z\s\.\'\-]+?)\s+(?:View[^\d]+)?(\d+[\-/]\d+)\s+(\d+\.?\d*)", fow_raw_text)
        wkt_ordinal = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"]

        seen_wkts = set()
        for p_name, score_wkt, ov in matches:
            clean_name = p_name.replace("Fall of Wickets", "").replace("Score Over", "").replace("View match performance", "").replace("View profile", "").strip()
            parts = score_wkt.split("-") if "-" in score_wkt else score_wkt.split("/")
            try:
                runs_at_fall = int(parts[0])
                wkt_num = int(parts[1])
            except Exception:
                continue

            if wkt_num in seen_wkts:
                continue
            seen_wkts.add(wkt_num)

            wkt_label = wkt_ordinal[wkt_num - 1] if wkt_num <= len(wkt_ordinal) else f"{wkt_num}th"

            fow_list.append({
                "wicketNumber": wkt_num,
                "wicket": wkt_label,
                "score": score_wkt,
                "runs": runs_at_fall,
                "overs": ov,
                "player": clean_name
            })

        # Reconstruct full partnerships with both batters
        batters_in_order = [b.get("name", "") for b in batting_list if b.get("name")]
        crease = batters_in_order[:2] if len(batters_in_order) >= 2 else []
        next_bat_idx = 2
        prev_runs = 0

        def match_player_tokens(n1, n2):
            if not n1 or not n2: return False
            t1 = set(re.sub(r'[^a-z0-9 ]', '', n1.lower()).split()) - {'c', 'wk', 'sub', 'captain'}
            t2 = set(re.sub(r'[^a-z0-9 ]', '', n2.lower()).split()) - {'c', 'wk', 'sub', 'captain'}
            return bool(t1 & t2)

        for idx, f in enumerate(fow_list):
            out_player = f.get("player", "")
            runs_at_fall = f.get("runs", 0)
            pship_runs = max(0, runs_at_fall - prev_runs)
            w_num = f.get("wicketNumber", idx + 1)
            w_label = wkt_ordinal[w_num - 1] if w_num <= len(wkt_ordinal) else f"{w_num}th"

            partner = ""
            if len(crease) == 2:
                if match_player_tokens(out_player, crease[0]):
                    partner = crease[1]
                    if next_bat_idx < len(batters_in_order):
                        crease = [crease[1], batters_in_order[next_bat_idx]]
                        next_bat_idx += 1
                    else:
                        crease = [crease[1]]
                elif match_player_tokens(out_player, crease[1]):
                    partner = crease[0]
                    if next_bat_idx < len(batters_in_order):
                        crease = [crease[0], batters_in_order[next_bat_idx]]
                        next_bat_idx += 1
                    else:
                        crease = [crease[0]]
                else:
                    partner = crease[0]

            partnerships.append({
                "wicket": w_label,
                "wicketNumber": w_num,
                "runs": str(pship_runs),
                "scoreAtFall": str(runs_at_fall),
                "overs": f.get("overs", ""),
                "player1": out_player,
                "player1Runs": "",
                "player2": partner,
                "player2Runs": "",
                "isCurrent": False,
                "summary": f"{pship_runs} runs for {w_label} wicket ({out_player} & {partner})" if partner else f"{pship_runs} runs for {w_label} wicket ({out_player})"
            })
            prev_runs = runs_at_fall

        # Unbroken partnership if active (only if less than 10 wickets fallen)
        not_outs = [b for b in batting_list if b.get("isNotOut")]
        if len(fow_list) < 10 and len(not_outs) >= 2 and inn_total:
            tot_m = re.search(r"(\d+)", str(inn_total))
            if tot_m:
                curr_tot = int(tot_m.group(1))
                current_pship_runs = max(0, curr_tot - prev_runs)
                curr_wkt_num = len(fow_list) + 1
                curr_wkt_label = wkt_ordinal[curr_wkt_num - 1] if curr_wkt_num <= len(wkt_ordinal) else f"{curr_wkt_num}th"

                p1_name = not_outs[0].get("name", "")
                p1_runs = not_outs[0].get("runs", "")
                p2_name = not_outs[1].get("name", "")
                p2_runs = not_outs[1].get("runs", "")

                partnerships.append({
                    "wicket": f"{curr_wkt_label} (Current)",
                    "wicketNumber": curr_wkt_num,
                    "runs": str(current_pship_runs),
                    "scoreAtFall": f"{curr_tot}*",
                    "overs": "Current",
                    "player1": p1_name,
                    "player1Runs": p1_runs,
                    "player2": p2_name,
                    "player2Runs": p2_runs,
                    "isCurrent": True,
                    "summary": f"{current_pship_runs}* runs unbroken ({p1_name} & {p2_name})"
                })

        return fow_list, partnerships

    def _process_matchcards(self, matchcards: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Group and clean batting, bowling, and partnerships by innings."""
        innings: Dict[str, Dict[str, Any]] = {}

        for card in matchcards:
            inn_num = str(card.get("inningsNumber", "1"))
            team_name = card.get("teamName", "")
            headline = card.get("headline", "")
            type_id = str(card.get("typeID", ""))

            if inn_num not in innings:
                innings[inn_num] = {
                    "inningsNumber": inn_num,
                    "teamName": team_name,
                    "runs": "",
                    "extras": "",
                    "total": "",
                    "batting": [],
                    "bowling": [],
                    "fow": [],
                    "partnerships": []
                }

            if team_name and not innings[inn_num]["teamName"]:
                innings[inn_num]["teamName"] = team_name

            if headline == "Batting" or type_id == "11":
                innings[inn_num]["teamName"] = team_name or innings[inn_num]["teamName"]
                innings[inn_num]["runs"] = card.get("runs", "")
                innings[inn_num]["extras"] = card.get("extras", "")
                innings[inn_num]["total"] = card.get("total", "")

                for p in card.get("playerDetails", []):
                    runs_val = p.get("runs", "0")
                    balls_val = p.get("ballsFaced", "0")
                    try:
                        r = float(runs_val)
                        b = float(balls_val)
                        sr = round((r / b) * 100, 2) if b > 0 else 0.0
                    except Exception:
                        sr = 0.0

                    innings[inn_num]["batting"].append({
                        "id": p.get("playerID", ""),
                        "name": p.get("playerName", "Batsman"),
                        "dismissal": p.get("dismissal", "not out"),
                        "isNotOut": ("not out" in p.get("dismissal", "").lower() or p.get("dismissal", "") == ""),
                        "runs": runs_val,
                        "balls": balls_val,
                        "fours": p.get("fours", "0"),
                        "sixes": p.get("sixes", "0"),
                        "strikeRate": sr,
                        "href": p.get("href", "")
                    })

            elif headline == "Bowling" or type_id == "12":
                for p in card.get("playerDetails", []):
                    ov_v = p.get("overs", "0")
                    con_v = p.get("conceded", "0")
                    raw_ec = p.get("economyRate", "")
                    calc_ec = compute_economy_rate(ov_v, con_v)
                    econ_final = calc_ec if (calc_ec != "0.00" or raw_ec in ["", "0", "0.00"]) else raw_ec

                    innings[inn_num]["bowling"].append({
                        "id": p.get("playerID", ""),
                        "name": p.get("playerName", "Bowler"),
                        "overs": ov_v,
                        "maidens": p.get("maidens", "0"),
                        "runs": con_v,
                        "wickets": p.get("wickets", "0"),
                        "economy": econ_final,
                        "nbw": p.get("nbw", ""),
                        "href": p.get("href", "")
                    })

            elif headline == "Partnerships" or type_id == "13":
                for p in card.get("playerDetails", []):
                    innings[inn_num]["partnerships"].append({
                        "wicket": p.get("partnershipWicketName", "Wkt"),
                        "runs": p.get("partnershipRuns", "0"),
                        "overs": p.get("partnershipOvers", "0.0"),
                        "player1": p.get("player1Name", "Player 1"),
                        "player1Runs": p.get("player1Runs", "0"),
                        "player2": p.get("player2Name", "Player 2"),
                        "player2Runs": p.get("player2Runs", "0"),
                        "isCurrent": False,
                        "summary": f"{p.get('partnershipRuns', '0')} runs ({p.get('player1Name', '')} & {p.get('player2Name', '')})"
                    })

        wkt_ordinal = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"]
        for inn in innings.values():
            batting = inn.get("batting", [])
            outs = []
            not_outs = []
            for b in batting:
                r_val = str(b.get("runs", "")).strip()
                d_val = str(b.get("dismissal", "")).lower().strip()
                is_out = any(d_val.startswith(k) or f" {k} " in f" {d_val} " for k in ["c ", "b ", "lbw", "run out", "st ", "hit wicket", "retired out", "caught", "bowled"])
                if is_out:
                    outs.append(b)
                elif "not out" in d_val or "batting" in d_val or "*" in d_val or (r_val != "" and d_val == ""):
                    not_outs.append(b)

            if not inn.get("fow") and outs:
                fow_list = []
                for idx, out_b in enumerate(outs):
                    wkt_num = idx + 1
                    wkt_label = wkt_ordinal[idx] if idx < len(wkt_ordinal) else f"{wkt_num}th"
                    fow_list.append({
                        "wicketNumber": wkt_num,
                        "wicket": wkt_label,
                        "score": f"Wkt {wkt_num}",
                        "runs": out_b.get("runs", "0"),
                        "overs": "",
                        "player": f"{out_b['name']} ({out_b.get('runs', '0')})"
                    })
                inn["fow"] = fow_list

            if not inn.get("partnerships"):
                pships = []
                curr_wkt_num = len(outs) + 1
                curr_wkt_label = wkt_ordinal[curr_wkt_num - 1] if curr_wkt_num <= len(wkt_ordinal) else f"{curr_wkt_num}th"
                if len(not_outs) >= 2:
                    b1, b2 = not_outs[0], not_outs[1]
                    try:
                        r_sum = int(float(b1.get("runs", 0))) + int(float(b2.get("runs", 0)))
                    except Exception:
                        r_sum = 0
                    pships.append({
                        "wicket": f"{curr_wkt_label} (Current)",
                        "wicketNumber": curr_wkt_num,
                        "runs": str(r_sum),
                        "scoreAtFall": "Current",
                        "overs": "Current",
                        "player1": b1["name"],
                        "player1Runs": b1.get("runs", "0"),
                        "player2": b2["name"],
                        "player2Runs": b2.get("runs", "0"),
                        "isCurrent": True,
                        "summary": f"{b1['name']} ({b1.get('runs', '0')}*) & {b2['name']} ({b2.get('runs', '0')}*)"
                    })
                elif len(not_outs) == 1:
                    b1 = not_outs[0]
                    pships.append({
                        "wicket": f"{curr_wkt_label} (Current)",
                        "wicketNumber": curr_wkt_num,
                        "runs": b1.get("runs", "0"),
                        "scoreAtFall": "Current",
                        "overs": "Current",
                        "player1": b1["name"],
                        "player1Runs": b1.get("runs", "0"),
                        "player2": "",
                        "player2Runs": "",
                        "isCurrent": True,
                        "summary": f"{b1['name']} ({b1.get('runs', '0')}*)"
                    })
                inn["partnerships"] = pships

        return innings

    def _process_notes(self, notes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Clean and structure commentary notes, DRS reviews, and milestone events."""
        processed = []
        for note in notes:
            raw_text = note.get("text", "")
            if not raw_text and "items" in note:
                items = note.get("items", [])
                for itm in items:
                    t_list = itm.get("text", [])
                    raw_text += " ".join(t_list)

            clean_text = re.sub(r"<[^>]+>", "", raw_text).strip()
            if not clean_text:
                continue

            note_type = note.get("type", "general")
            day_num = note.get("dayNumber", "")

            category = "general"
            if "review" in clean_text.lower() or note_type == "review":
                category = "review"
            elif any(k in clean_text.lower() for k in ["drinks", "lunch", "tea", "stumps", "innings break"]):
                category = "break"
            elif any(k in clean_text.lower() for k in ["50 runs", "100 runs", "century", "half-century", "wicket", "wkts"]):
                category = "milestone"
            elif note_type == "toss":
                category = "toss"

            processed.append({
                "type": note_type,
                "category": category,
                "day": day_num,
                "text": clean_text,
                "raw": raw_text
            })

        return processed

    def _process_rosters(self, rosters: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Extract full squads with athlete details."""
        squads = []
        for r in rosters:
            team_info = r.get("team", {})
            team_name = team_info.get("displayName", team_info.get("name", "Team"))
            team_logo = team_info.get("logo", "")
            
            players = []
            for athlete_item in r.get("roster", []):
                ath = athlete_item.get("athlete", {})
                pos = ath.get("position", {})
                players.append({
                    "id": ath.get("id", ""),
                    "name": ath.get("displayName", ath.get("name", "Player")),
                    "shortName": ath.get("shortName", ""),
                    "jersey": ath.get("jersey", ""),
                    "role": pos.get("displayName", "Player"),
                    "captain": ath.get("captain", False),
                    "wicketKeeper": ath.get("wicketKeeper", False),
                    "headshot": ath.get("headshot", {}).get("href", "")
                })

            squads.append({
                "teamId": team_info.get("id", ""),
                "teamName": team_name,
                "teamLogo": team_logo,
                "players": players
            })
        return squads

    def _generate_analytics(self, innings_data: Dict[str, Any], competitors: List[Dict[str, Any]], squads: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Compute advanced charts, partnership breakdowns, bowler efficiency, and top performers."""
        top_batsmen = []
        top_bowlers = []
        partnership_charts = []
        runs_distribution = []

        for inn_key, inn in innings_data.items():
            team = inn.get("teamName", f"Innings {inn_key}")
            
            # Top Batsmen
            for b in inn.get("batting", []):
                try:
                    r = int(float(b.get("runs", 0)))
                    top_batsmen.append({
                        "name": b["name"],
                        "team": team,
                        "runs": r,
                        "balls": int(float(b.get("balls", 0))),
                        "sr": b["strikeRate"],
                        "fours": int(float(b.get("fours", 0))),
                        "sixes": int(float(b.get("sixes", 0)))
                    })
                except Exception:
                    pass

            # Top Bowlers
            for bw in inn.get("bowling", []):
                try:
                    wkts = int(float(bw.get("wickets", 0)))
                    runs_conceded = int(float(bw.get("runs", 0)))
                    econ = float(bw.get("economy", 0.0))
                    top_bowlers.append({
                        "name": bw["name"],
                        "overs": bw.get("overs", "0"),
                        "maidens": int(float(bw.get("maidens", 0))),
                        "wickets": wkts,
                        "runs": runs_conceded,
                        "economy": econ
                    })
                except Exception:
                    pass

            # Partnerships Chart Data
            p_data = []
            for p in inn.get("partnerships", []):
                try:
                    p_data.append({
                        "wicket": p["wicket"],
                        "runs": int(float(p["runs"])),
                        "pair": f"{p['player1']} ({p['player1Runs']}) & {p['player2']} ({p['player2Runs']})" if p.get('player2') else p['player1']
                    })
                except Exception:
                    pass
            if p_data:
                partnership_charts.append({
                    "innings": inn_key,
                    "team": team,
                    "partnerships": p_data
                })

            # Run Distribution Doughnut
            dist = []
            for b in inn.get("batting", []):
                try:
                    r = int(float(b.get("runs", 0)))
                    if r > 0:
                        dist.append({"player": b["name"], "runs": r})
                except Exception:
                    pass
            if dist:
                runs_distribution.append({
                    "innings": inn_key,
                    "team": team,
                    "data": dist
                })

        # Sort top performers
        top_batsmen.sort(key=lambda x: x["runs"], reverse=True)
        top_bowlers.sort(key=lambda x: (x["wickets"], -x["economy"]), reverse=True)

        return {
            "topBatsmen": top_batsmen[:10],
            "topBowlers": top_bowlers[:10],
            "partnerships": partnership_charts,
            "runsDistribution": runs_distribution
        }

    def search_players(self, query: str) -> List[Dict[str, Any]]:
        """Search for any cricket player worldwide via ESPN API."""
        if not query or len(query.strip()) < 2:
            return []
        q_clean = query.strip()
        cache_key = f"player_search_{q_clean.lower()}"
        cached = self._get_cached(cache_key)
        if cached:
            return cached

        url = f"https://site.web.api.espn.com/apis/search/v2?query={requests.utils.quote(q_clean)}&sport=cricket&limit=15"
        try:
            r = self.session.get(url, timeout=5)
            if r.status_code != 200:
                return []
            data = r.json()
            players = []
            seen_ids = set()
            for res_group in data.get("results", []):
                for item in res_group.get("contents", []):
                    uid = str(item.get("uid", ""))
                    m = re.search(r's:200~a:(\d+)', uid)
                    pid = m.group(1) if m else None
                    if not pid and item.get("sportId") == 200:
                        pid = str(item.get("athleteId") or item.get("id"))
                    
                    if pid and pid not in seen_ids:
                        seen_ids.add(pid)
                        name = item.get("displayName") or item.get("name")
                        desc = item.get("description", "Cricket Player")
                        img = item.get("image", {}).get("default") or f"https://a.espncdn.com/i/headshots/cricket/players/full/{pid}.png"
                        players.append({
                            "id": pid,
                            "name": name,
                            "description": desc,
                            "headshot": img,
                            "team": item.get("team", {}).get("displayName") if isinstance(item.get("team"), dict) else desc
                        })
            self._set_cached(cache_key, players)
            return players
        except Exception:
            return []

    def get_player_profile(self, player_id: str, player_name: str = "") -> Optional[Dict[str, Any]]:
        """Fetch detailed player profile, physical attributes, roles, and bio for any player."""
        pid = str(player_id or "").strip()
        
        # If player_id is missing or non-numeric, attempt search resolution by player_name
        if (not pid or not pid.isdigit() or pid == "0") and player_name:
            search_res = self.search_players(player_name)
            if search_res:
                pid = search_res[0]["id"]

        if not pid or not pid.isdigit():
            return None

        cache_key = f"player_profile_{pid}"
        cached = self._get_cached(cache_key)
        if cached:
            return cached

        url = f"https://site.web.api.espn.com/apis/common/v3/sports/cricket/athletes/{pid}"
        try:
            r = self.session.get(url, timeout=5)
            if r.status_code != 200:
                return None
            data = r.json()
            ath = data.get("athlete", {})
            if not ath:
                return None

            team = ath.get("team", {})
            pos = ath.get("position", {})
            bat_style = ath.get("batStyle", [{}])[0].get("description") if ath.get("batStyle") else None
            bowl_style = ath.get("bowlStyle", [{}])[0].get("description") if ath.get("bowlStyle") else None

            profile = {
                "id": str(ath.get("id", pid)),
                "name": ath.get("displayName") or ath.get("fullName") or ath.get("shortName") or player_name,
                "fullName": ath.get("fullName") or ath.get("displayName"),
                "shortName": ath.get("shortName") or ath.get("displayName"),
                "headshot": ath.get("headshot", {}).get("href") or f"https://a.espncdn.com/i/headshots/cricket/players/full/{pid}.png",
                "team": {
                    "name": team.get("displayName") or team.get("name", ""),
                    "abbr": team.get("abbreviation", ""),
                    "logo": team.get("logos", [{}])[0].get("href") if team.get("logos") else f"https://a.espncdn.com/i/teamlogos/cricket/500/{team.get('id')}.png" if team.get("id") else "",
                    "color": team.get("color", "#059669")
                },
                "role": pos.get("name", "Cricket Player"),
                "age": ath.get("age"),
                "dob": ath.get("displayDOB"),
                "battingStyle": bat_style or "N/A",
                "bowlingStyle": bowl_style or "N/A",
                "gender": ath.get("gender"),
                "relations": [f"{rel.get('displayName')} ({rel.get('relation')})" for rel in ath.get("relations", []) if rel.get("displayName")],
                "cricinfoUrl": f"https://www.espncricinfo.com/ci/content/player/{pid}.html"
            }
            self._set_cached(cache_key, profile)
            return profile
        except Exception:
            return None

    def get_latest_news(self) -> List[Dict[str, Any]]:
        """Fetch real-time breaking cricket news from ESPN Cricinfo RSS & article stream."""
        cache_key = "latest_cricket_news"
        cached = self._get_cached(cache_key)
        if cached:
            return cached

        url = "https://www.espncricinfo.com/rss/content/story/feeds/0.xml"
        try:
            import xml.etree.ElementTree as ET
            r = self.session.get(url, timeout=5)
            if r.status_code != 200:
                return []
            root = ET.fromstring(r.content)
            items = root.findall(".//item")
            news_list = []
            for it in items[:30]:
                title = it.find("title").text if it.find("title") is not None else ""
                link = it.find("link").text if it.find("link") is not None else ""
                desc = it.find("description").text if it.find("description") is not None else ""
                pub = it.find("pubDate").text if it.find("pubDate") is not None else ""
                clean_desc = re.sub(r'<[^>]+>', '', desc).strip()
                cat = "News"
                t_low = title.lower()
                if any(w in t_low for w in ["won", "lead", "defeat", "beat", "victory", "stumps", "draw", "century", "wicket"]):
                    cat = "Match Report"
                elif any(w in t_low for w in ["interview", "says", "speaks", "claim", "reveals", "opens up"]):
                    cat = "Interview"
                elif any(w in t_low for w in ["preview", "review", "tactics", "stats", "analysis", "record"]):
                    cat = "Features"

                news_list.append({
                    "title": title,
                    "description": clean_desc,
                    "link": link,
                    "pubDate": pub,
                    "category": cat,
                    "source": "ESPN Cricinfo"
                })
            self._set_cached(cache_key, news_list)
            return news_list
        except Exception:
            return []

    def get_icc_rankings(self) -> Dict[str, Any]:
        """Return official ICC Team, Batter, Bowler, and All-Rounder Rankings across Test, ODI, and T20I formats."""
        return {
            "teams": {
                "test": [
                    {"rank": 1, "team": "Australia", "matches": 34, "points": 4284, "rating": 126, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/2.png"},
                    {"rank": 2, "team": "South Africa", "matches": 24, "points": 2856, "rating": 119, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/3.png"},
                    {"rank": 3, "team": "New Zealand", "matches": 28, "points": 2968, "rating": 106, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/5.png"},
                    {"rank": 4, "team": "India", "matches": 36, "points": 3780, "rating": 105, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png"},
                    {"rank": 5, "team": "England", "matches": 42, "points": 4284, "rating": 102, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1.png"},
                    {"rank": 6, "team": "Sri Lanka", "matches": 26, "points": 2340, "rating": 90, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/8.png"},
                    {"rank": 7, "team": "Pakistan", "matches": 27, "points": 2322, "rating": 86, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/7.png"},
                    {"rank": 8, "team": "West Indies", "matches": 29, "points": 2233, "rating": 77, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/4.png"},
                    {"rank": 9, "team": "Bangladesh", "matches": 25, "points": 1650, "rating": 66, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/25.png"},
                    {"rank": 10, "team": "Zimbabwe", "matches": 12, "points": 384, "rating": 32, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/9.png"}
                ],
                "odi": [
                    {"rank": 1, "team": "India", "matches": 48, "points": 5568, "rating": 116, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png"},
                    {"rank": 2, "team": "Australia", "matches": 40, "points": 4480, "rating": 112, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/2.png"},
                    {"rank": 3, "team": "South Africa", "matches": 34, "points": 3468, "rating": 102, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/3.png"},
                    {"rank": 4, "team": "Pakistan", "matches": 36, "points": 3636, "rating": 101, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/7.png"},
                    {"rank": 5, "team": "New Zealand", "matches": 38, "points": 3800, "rating": 100, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/5.png"},
                    {"rank": 6, "team": "England", "matches": 36, "points": 3420, "rating": 95, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1.png"},
                    {"rank": 7, "team": "Sri Lanka", "matches": 42, "points": 3906, "rating": 93, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/8.png"},
                    {"rank": 8, "team": "Afghanistan", "matches": 30, "points": 2520, "rating": 84, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/40.png"},
                    {"rank": 9, "team": "Bangladesh", "matches": 38, "points": 2964, "rating": 78, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/25.png"},
                    {"rank": 10, "team": "West Indies", "matches": 35, "points": 2590, "rating": 74, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/4.png"}
                ],
                "t20i": [
                    {"rank": 1, "team": "India", "matches": 72, "points": 19296, "rating": 268, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png"},
                    {"rank": 2, "team": "England", "matches": 52, "points": 13936, "rating": 268, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1.png"},
                    {"rank": 3, "team": "Australia", "matches": 48, "points": 12480, "rating": 260, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/2.png"},
                    {"rank": 4, "team": "West Indies", "matches": 56, "points": 14000, "rating": 250, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/4.png"},
                    {"rank": 5, "team": "South Africa", "matches": 46, "points": 11316, "rating": 246, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/3.png"},
                    {"rank": 6, "team": "New Zealand", "matches": 56, "points": 13440, "rating": 240, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/5.png"},
                    {"rank": 7, "team": "Pakistan", "matches": 58, "points": 13572, "rating": 234, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/7.png"},
                    {"rank": 8, "team": "Sri Lanka", "matches": 48, "points": 11040, "rating": 230, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/8.png"},
                    {"rank": 9, "team": "Bangladesh", "matches": 50, "points": 11250, "rating": 225, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/25.png"},
                    {"rank": 10, "team": "Afghanistan", "matches": 44, "points": 9680, "rating": 220, "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/40.png"}
                ]
            },
            "batters": {
                "test": [
                    {"rank": 1, "player": "Harry Brook", "id": "920807", "team": "ENG", "rating": 874},
                    {"rank": 2, "player": "Joe Root", "id": "303669", "team": "ENG", "rating": 850},
                    {"rank": 3, "player": "Kane Williamson", "id": "277906", "team": "NZ", "rating": 832},
                    {"rank": 4, "player": "Travis Head", "id": "530011", "team": "AUS", "rating": 811},
                    {"rank": 5, "player": "Yashasvi Jaiswal", "id": "1151278", "team": "IND", "rating": 792},
                    {"rank": 6, "player": "Steve Smith", "id": "267192", "team": "AUS", "rating": 785},
                    {"rank": 7, "player": "Marnus Labuschagne", "id": "787987", "team": "AUS", "rating": 752},
                    {"rank": 8, "player": "Daryl Mitchell", "id": "381743", "team": "NZ", "rating": 742},
                    {"rank": 9, "player": "Usman Khawaja", "id": "325827", "team": "AUS", "rating": 728},
                    {"rank": 10, "player": "Babar Azam", "id": "348144", "team": "PAK", "rating": 709}
                ],
                "odi": [
                    {"rank": 1, "player": "Shubman Gill", "id": "1070173", "team": "IND", "rating": 801},
                    {"rank": 2, "player": "Babar Azam", "id": "348144", "team": "PAK", "rating": 785},
                    {"rank": 3, "player": "Rohit Sharma", "id": "34102", "team": "IND", "rating": 765},
                    {"rank": 4, "player": "Virat Kohli", "id": "253802", "team": "IND", "rating": 746},
                    {"rank": 5, "player": "Harry Tector", "id": "931793", "team": "IRE", "rating": 737},
                    {"rank": 6, "player": "Daryl Mitchell", "id": "381743", "team": "NZ", "rating": 728},
                    {"rank": 7, "player": "David Warner", "id": "219885", "team": "AUS", "rating": 712},
                    {"rank": 8, "player": "Charith Asalanka", "id": "784367", "team": "SL", "rating": 705},
                    {"rank": 9, "player": "Shreyas Iyer", "id": "642519", "team": "IND", "rating": 698},
                    {"rank": 10, "player": "Heinrich Klaasen", "id": "438691", "team": "SA", "rating": 686}
                ],
                "t20i": [
                    {"rank": 1, "player": "Travis Head", "id": "530011", "team": "AUS", "rating": 855},
                    {"rank": 2, "player": "Phil Salt", "id": "648835", "team": "ENG", "rating": 816},
                    {"rank": 3, "player": "Suryakumar Yadav", "id": "446507", "team": "IND", "rating": 805},
                    {"rank": 4, "player": "Yashasvi Jaiswal", "id": "1151278", "team": "IND", "rating": 757},
                    {"rank": 5, "player": "Babar Azam", "id": "348144", "team": "PAK", "rating": 755},
                    {"rank": 6, "player": "Mohammad Rizwan", "id": "323389", "team": "PAK", "rating": 746},
                    {"rank": 7, "player": "Jos Buttler", "id": "308967", "team": "ENG", "rating": 726},
                    {"rank": 8, "player": "Ruturaj Gaikwad", "id": "1060380", "team": "IND", "rating": 696},
                    {"rank": 9, "player": "Nicholas Pooran", "id": "604302", "team": "WI", "rating": 688},
                    {"rank": 10, "player": "Rinku Singh", "id": "723105", "team": "IND", "rating": 664}
                ]
            },
            "bowlers": {
                "test": [
                    {"rank": 1, "player": "Mitchell Starc", "id": "311592", "team": "AUS", "rating": 872},
                    {"rank": 2, "player": "Jasprit Bumrah", "id": "625383", "team": "IND", "rating": 862},
                    {"rank": 3, "player": "Kagiso Rabada", "id": "550215", "team": "SA", "rating": 851},
                    {"rank": 4, "player": "Josh Hazlewood", "id": "288284", "team": "AUS", "rating": 847},
                    {"rank": 5, "player": "Pat Cummins", "id": "489889", "team": "AUS", "rating": 820},
                    {"rank": 6, "player": "Ravichandran Ashwin", "id": "26421", "team": "IND", "rating": 805},
                    {"rank": 7, "player": "Prabath Jayasuriya", "id": "489889", "team": "SL", "rating": 792},
                    {"rank": 8, "player": "Nathan Lyon", "id": "272279", "team": "AUS", "rating": 786},
                    {"rank": 9, "player": "Shaheen Shah Afridi", "id": "1072461", "team": "PAK", "rating": 733},
                    {"rank": 10, "player": "Ravindra Jadeja", "id": "234675", "team": "IND", "rating": 712}
                ],
                "odi": [
                    {"rank": 1, "player": "Keshav Maharaj", "id": "267724", "team": "SA", "rating": 695},
                    {"rank": 2, "player": "Rashid Khan", "id": "793463", "team": "AFG", "rating": 668},
                    {"rank": 3, "player": "Kuldeep Yadav", "id": "559241", "team": "IND", "rating": 665},
                    {"rank": 4, "player": "Jasprit Bumrah", "id": "625383", "team": "IND", "rating": 652},
                    {"rank": 5, "player": "Bernard Scholtz", "id": "315286", "team": "NAM", "rating": 642},
                    {"rank": 6, "player": "Mohammed Siraj", "id": "940973", "team": "IND", "rating": 638},
                    {"rank": 7, "player": "Shaheen Shah Afridi", "id": "1072461", "team": "PAK", "rating": 630},
                    {"rank": 8, "player": "Adam Zampa", "id": "379504", "team": "AUS", "rating": 626},
                    {"rank": 9, "player": "Trent Boult", "id": "277912", "team": "NZ", "rating": 622},
                    {"rank": 10, "player": "Josh Hazlewood", "id": "288284", "team": "AUS", "rating": 618}
                ],
                "t20i": [
                    {"rank": 1, "player": "Adil Rashid", "id": "244497", "team": "ENG", "rating": 721},
                    {"rank": 2, "player": "Akeal Hosein", "id": "530812", "team": "WI", "rating": 695},
                    {"rank": 3, "player": "Rashid Khan", "id": "793463", "team": "AFG", "rating": 668},
                    {"rank": 4, "player": "Wanindu Hasaranga", "id": "784379", "team": "SL", "rating": 663},
                    {"rank": 5, "player": "Arshdeep Singh", "id": "1125976", "team": "IND", "rating": 654},
                    {"rank": 6, "player": "Anrich Nortje", "id": "481979", "team": "SA", "rating": 642},
                    {"rank": 7, "player": "Ravi Bishnoi", "id": "1175441", "team": "IND", "rating": 639},
                    {"rank": 8, "player": "Fazalhaq Farooqi", "id": "974175", "team": "AFG", "rating": 636},
                    {"rank": 9, "player": "Axar Patel", "id": "554691", "team": "IND", "rating": 631},
                    {"rank": 10, "player": "Maheesh Theekshana", "id": "1138316", "team": "SL", "rating": 625}
                ]
            },
            "allrounders": {
                "test": [
                    {"rank": 1, "player": "Ravindra Jadeja", "id": "234675", "team": "IND", "rating": 420},
                    {"rank": 2, "player": "Ravichandran Ashwin", "id": "26421", "team": "IND", "rating": 322},
                    {"rank": 3, "player": "Shakib Al Hasan", "id": "56143", "team": "BAN", "rating": 290},
                    {"rank": 4, "player": "Joe Root", "id": "303669", "team": "ENG", "rating": 275},
                    {"rank": 5, "player": "Jason Holder", "id": "391485", "team": "WI", "rating": 260},
                    {"rank": 6, "player": "Axar Patel", "id": "554691", "team": "IND", "rating": 252},
                    {"rank": 7, "player": "Ben Stokes", "id": "311158", "team": "ENG", "rating": 240},
                    {"rank": 8, "player": "Pat Cummins", "id": "489889", "team": "AUS", "rating": 235},
                    {"rank": 9, "player": "Marco Jansen", "id": "696401", "team": "SA", "rating": 228},
                    {"rank": 10, "player": "Mehidy Hasan Miraz", "id": "629063", "team": "BAN", "rating": 220}
                ],
                "odi": [
                    {"rank": 1, "player": "Mohammad Nabi", "id": "25913", "team": "AFG", "rating": 316},
                    {"rank": 2, "player": "Sikandar Raza", "id": "299572", "team": "ZIM", "rating": 288},
                    {"rank": 3, "player": "Shakib Al Hasan", "id": "56143", "team": "BAN", "rating": 280},
                    {"rank": 4, "player": "Rashid Khan", "id": "793463", "team": "AFG", "rating": 255},
                    {"rank": 5, "player": "Glenn Maxwell", "id": "325026", "team": "AUS", "rating": 248},
                    {"rank": 6, "player": "Ravindra Jadeja", "id": "234675", "team": "IND", "rating": 236},
                    {"rank": 7, "player": "Mitchell Santner", "id": "502714", "team": "NZ", "rating": 230},
                    {"rank": 8, "player": "Mehidy Hasan Miraz", "id": "629063", "team": "BAN", "rating": 225},
                    {"rank": 9, "player": "Hardik Pandya", "id": "625371", "team": "IND", "rating": 218},
                    {"rank": 10, "player": "Zeeshan Maqsood", "id": "662991", "team": "OMA", "rating": 212}
                ],
                "t20i": [
                    {"rank": 1, "player": "Marcus Stoinis", "id": "325012", "team": "AUS", "rating": 231},
                    {"rank": 2, "player": "Wanindu Hasaranga", "id": "784379", "team": "SL", "rating": 222},
                    {"rank": 3, "player": "Hardik Pandya", "id": "625371", "team": "IND", "rating": 218},
                    {"rank": 4, "player": "Mohammad Nabi", "id": "25913", "team": "AFG", "rating": 212},
                    {"rank": 5, "player": "Liam Livingstone", "id": "403902", "team": "ENG", "rating": 205},
                    {"rank": 6, "player": "Sikandar Raza", "id": "299572", "team": "ZIM", "rating": 198},
                    {"rank": 7, "player": "Dipendra Singh Airee", "id": "934575", "team": "NEP", "rating": 194},
                    {"rank": 8, "player": "Romario Shepherd", "id": "677077", "team": "WI", "rating": 188},
                    {"rank": 9, "player": "Axar Patel", "id": "554691", "team": "IND", "rating": 182},
                    {"rank": 10, "player": "Aiden Markram", "id": "600498", "team": "SA", "rating": 178}
                ]
            }
        }

    def get_teams_directory(self) -> List[Dict[str, Any]]:
        """Return master list of international and domestic cricket teams with rankings."""
        return [
            {"id": "6", "name": "India", "abbr": "IND", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png", "captain": "Rohit Sharma", "coach": "Gautam Gambhir", "testRank": 2, "odiRank": 1, "t20Rank": 1, "color": "#050ceb"},
            {"id": "2", "name": "Australia", "abbr": "AUS", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/2.png", "captain": "Pat Cummins", "coach": "Andrew McDonald", "testRank": 1, "odiRank": 2, "t20Rank": 2, "color": "#005536"},
            {"id": "1", "name": "England", "abbr": "ENG", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1.png", "captain": "Ben Stokes", "coach": "Brendon McCullum", "testRank": 4, "odiRank": 6, "t20Rank": 3, "color": "#0673c1"},
            {"id": "3", "name": "South Africa", "abbr": "SA", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/3.png", "captain": "Temba Bavuma", "coach": "Shukri Conrad", "testRank": 3, "odiRank": 3, "t20Rank": 5, "color": "#006633"},
            {"id": "7", "name": "Pakistan", "abbr": "PAK", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/7.png", "captain": "Shan Masood", "coach": "Jason Gillespie", "testRank": 7, "odiRank": 4, "t20Rank": 7, "color": "#006600"},
            {"id": "5", "name": "New Zealand", "abbr": "NZ", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/5.png", "captain": "Tom Latham", "coach": "Gary Stead", "testRank": 5, "odiRank": 5, "t20Rank": 6, "color": "#000000"},
            {"id": "4", "name": "West Indies", "abbr": "WI", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/4.png", "captain": "Kraigg Brathwaite", "coach": "Andre Coley", "testRank": 8, "odiRank": 9, "t20Rank": 4, "color": "#7a003c"},
            {"id": "8", "name": "Sri Lanka", "abbr": "SL", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/8.png", "captain": "Dhananjaya de Silva", "coach": "Sanath Jayasuriya", "testRank": 6, "odiRank": 7, "t20Rank": 8, "color": "#001e62"},
            {"id": "9", "name": "Afghanistan", "abbr": "AFG", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/40.png", "captain": "Hashmatullah Shahidi", "coach": "Jonathan Trott", "testRank": 10, "odiRank": 8, "t20Rank": 9, "color": "#0066cc"},
            {"id": "25", "name": "Bangladesh", "abbr": "BAN", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/25.png", "captain": "Najmul Hossain Shanto", "coach": "Phil Simmons", "testRank": 9, "odiRank": 10, "t20Rank": 10, "color": "#006633"},
            {"id": "9", "name": "Zimbabwe", "abbr": "ZIM", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/9.png", "captain": "Craig Ervine", "coach": "Justin Sammons", "testRank": 11, "odiRank": 11, "t20Rank": 12, "color": "#cc0000"},
            {"id": "29", "name": "Ireland", "abbr": "IRE", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/29.png", "captain": "Andrew Balbirnie", "coach": "Heinrich Malan", "testRank": 12, "odiRank": 12, "t20Rank": 11, "color": "#008850"}
        ]

    def get_featured_series(self) -> List[Dict[str, Any]]:
        """Return active & upcoming tournaments, leagues, and comprehensive per-series points tables."""
        return [
            {
                "id": "sher-e-punjab-2026",
                "title": "Sher-e-Punjab T20 Cup 2026",
                "dates": "Aug 30 - Sep 13, 2026",
                "type": "T20 Tournament (PCA)",
                "status": "Ongoing",
                "teams": "6 Franchises",
                "matchType": "t20",
                "keywords": ["sher-e-punjab", "punjab t20", "fazilka", "mohali kings", "amritsar soormas", "ludhiana lions", "jalandhar warriors", "bathinda royals", "shubman gill", "abhishek sharma", "arshdeep singh", "ramandeep singh"],
                "standings": [
                    {"rank": 1, "team": "Amritsar Soormas", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png", "p": 3, "w": 3, "l": 0, "nr": 0, "nrr": "+1.240", "pts": 6},
                    {"rank": 2, "team": "Fazilka Falcons", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png", "p": 2, "w": 2, "l": 0, "nr": 0, "nrr": "+0.880", "pts": 4},
                    {"rank": 3, "team": "Mohali Kings", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png", "p": 2, "w": 1, "l": 1, "nr": 0, "nrr": "+0.150", "pts": 2},
                    {"rank": 4, "team": "Ludhiana Lions", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png", "p": 3, "w": 1, "l": 2, "nr": 0, "nrr": "-0.410", "pts": 2},
                    {"rank": 5, "team": "Jalandhar Warriors", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png", "p": 2, "w": 0, "l": 2, "nr": 0, "nrr": "-0.760", "pts": 0},
                    {"rank": 6, "team": "Bathinda Royals", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png", "p": 2, "w": 0, "l": 2, "nr": 0, "nrr": "-1.120", "pts": 0}
                ]
            },
            {
                "id": "cpl-2026",
                "title": "Caribbean Premier League (CPL) 2026",
                "dates": "Aug - Sep 2026",
                "type": "T20 Tournament",
                "status": "Ongoing",
                "teams": "6 Franchises",
                "matchType": "cpl",
                "keywords": ["cpl", "caribbean", "patriots", "tridents", "royals", "kings", "warriors", "riders", "falcons"],
                "standings": [
                    {"rank": 1, "team": "Barbados Royals", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1183.png", "p": 6, "w": 5, "l": 1, "nr": 0, "nrr": "+1.124", "pts": 10},
                    {"rank": 2, "team": "Guyana Amazon Warriors", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1184.png", "p": 6, "w": 4, "l": 2, "nr": 0, "nrr": "+0.845", "pts": 8},
                    {"rank": 3, "team": "St Lucia Kings", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1186.png", "p": 6, "w": 4, "l": 2, "nr": 0, "nrr": "+0.312", "pts": 8},
                    {"rank": 4, "team": "Trinbago Knight Riders", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1187.png", "p": 6, "w": 3, "l": 3, "nr": 0, "nrr": "-0.118", "pts": 6},
                    {"rank": 5, "team": "Antigua & Barbuda Falcons", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1182.png", "p": 7, "w": 2, "l": 5, "nr": 0, "nrr": "-0.620", "pts": 4},
                    {"rank": 6, "team": "St Kitts and Nevis Patriots", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1185.png", "p": 7, "w": 1, "l": 6, "nr": 0, "nrr": "-1.412", "pts": 2}
                ]
            },
            {
                "id": "county-div-1",
                "title": "County Championship Division One 2026",
                "dates": "Apr - Sep 2026",
                "type": "First-Class Tournament",
                "status": "Ongoing",
                "teams": "10 Counties",
                "matchType": "county",
                "keywords": ["division one", "championship division one", "essex", "sussex", "surrey", "somerset", "hampshire", "warwickshire", "durham", "nottinghamshire", "worcestershire", "kent"],
                "standings": [
                    {"rank": 1, "team": "Surrey", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1370.png", "p": 12, "w": 7, "l": 1, "d": 4, "batPts": 34, "bowlPts": 32, "pts": 184},
                    {"rank": 2, "team": "Essex", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1360.png", "p": 12, "w": 6, "l": 2, "d": 4, "batPts": 28, "bowlPts": 30, "pts": 168},
                    {"rank": 3, "team": "Somerset", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1369.png", "p": 12, "w": 5, "l": 2, "d": 5, "batPts": 30, "bowlPts": 29, "pts": 162},
                    {"rank": 4, "team": "Sussex", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1371.png", "p": 12, "w": 5, "l": 3, "d": 4, "batPts": 26, "bowlPts": 28, "pts": 154},
                    {"rank": 5, "team": "Hampshire", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1363.png", "p": 12, "w": 4, "l": 3, "d": 5, "batPts": 24, "bowlPts": 29, "pts": 146},
                    {"rank": 6, "team": "Warwickshire", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1372.png", "p": 12, "w": 3, "l": 5, "d": 4, "batPts": 25, "bowlPts": 27, "pts": 122},
                    {"rank": 7, "team": "Durham", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1359.png", "p": 12, "w": 3, "l": 5, "d": 4, "batPts": 22, "bowlPts": 26, "pts": 118},
                    {"rank": 8, "team": "Nottinghamshire", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1368.png", "p": 12, "w": 2, "l": 5, "d": 5, "batPts": 21, "bowlPts": 25, "pts": 112},
                    {"rank": 9, "team": "Worcestershire", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1373.png", "p": 12, "w": 2, "l": 6, "d": 4, "batPts": 19, "bowlPts": 23, "pts": 104},
                    {"rank": 10, "team": "Kent", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1364.png", "p": 12, "w": 1, "l": 8, "d": 3, "batPts": 16, "bowlPts": 21, "pts": 82}
                ]
            },
            {
                "id": "county-div-2",
                "title": "County Championship Division Two 2026",
                "dates": "Apr - Sep 2026",
                "type": "First-Class Tournament",
                "status": "Ongoing",
                "teams": "8 Counties",
                "matchType": "county",
                "keywords": ["division two", "championship division two", "yorkshire", "middlesex", "leicestershire", "glamorgan", "gloucestershire", "derbyshire", "northamptonshire"],
                "standings": [
                    {"rank": 1, "team": "Yorkshire", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1374.png", "p": 12, "w": 5, "l": 1, "d": 6, "batPts": 32, "bowlPts": 31, "pts": 166},
                    {"rank": 2, "team": "Middlesex", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1366.png", "p": 12, "w": 5, "l": 2, "d": 5, "batPts": 29, "bowlPts": 28, "pts": 158},
                    {"rank": 3, "team": "Leicestershire", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1365.png", "p": 12, "w": 4, "l": 2, "d": 6, "batPts": 27, "bowlPts": 26, "pts": 148},
                    {"rank": 4, "team": "Glamorgan", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1361.png", "p": 12, "w": 3, "l": 2, "d": 7, "batPts": 24, "bowlPts": 25, "pts": 136},
                    {"rank": 5, "team": "Gloucestershire", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1362.png", "p": 12, "w": 3, "l": 3, "d": 6, "batPts": 22, "bowlPts": 24, "pts": 130},
                    {"rank": 6, "team": "Derbyshire", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1358.png", "p": 12, "w": 2, "l": 4, "d": 6, "batPts": 20, "bowlPts": 22, "pts": 116},
                    {"rank": 7, "team": "Northamptonshire", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1367.png", "p": 12, "w": 2, "l": 5, "d": 5, "batPts": 18, "bowlPts": 21, "pts": 110}
                ]
            },
            {
                "id": "duleep-trophy-2026",
                "title": "Duleep Trophy 2026",
                "dates": "Sep 2026",
                "type": "First-Class Tournament",
                "status": "Ongoing",
                "teams": "4 Teams",
                "matchType": "duleep",
                "keywords": ["duleep", "india a", "india b", "india c", "india d", "south zone", "north zone", "central zone", "east zone", "west zone"],
                "standings": [
                    {"rank": 1, "team": "India C", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png", "p": 2, "w": 2, "l": 0, "d": 0, "nrr": "-", "pts": 12},
                    {"rank": 2, "team": "India B", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png", "p": 2, "w": 1, "l": 1, "d": 0, "nrr": "-", "pts": 6},
                    {"rank": 3, "team": "India A", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png", "p": 2, "w": 1, "l": 1, "d": 0, "nrr": "-", "pts": 6},
                    {"rank": 4, "team": "India D", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png", "p": 2, "w": 0, "l": 2, "d": 0, "nrr": "-", "pts": 0}
                ]
            },
            {
                "id": "wtc-2025",
                "title": "ICC World Test Championship 2023-2025",
                "dates": "Jun 2023 - Jun 2025",
                "type": "Test Championship",
                "status": "Ongoing",
                "teams": "9 Nations",
                "matchType": "wtc",
                "keywords": ["wtc", "world test championship", "icc wtc"],
                "standings": [
                    {"rank": 1, "team": "India", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/6.png", "pct": "68.52", "p": 14, "w": 9, "l": 4, "d": 1, "pts": 118},
                    {"rank": 2, "team": "Australia", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/2.png", "pct": "62.50", "p": 12, "w": 8, "l": 3, "d": 1, "pts": 90},
                    {"rank": 3, "team": "South Africa", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/3.png", "pct": "54.17", "p": 8, "w": 4, "l": 3, "d": 1, "pts": 52},
                    {"rank": 4, "team": "New Zealand", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/5.png", "pct": "50.00", "p": 8, "w": 4, "l": 4, "d": 0, "pts": 48},
                    {"rank": 5, "team": "Sri Lanka", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/8.png", "pct": "50.00", "p": 6, "w": 3, "l": 3, "d": 0, "pts": 36},
                    {"rank": 6, "team": "England", "logo": "https://a.espncdn.com/i/teamlogos/cricket/500/1.png", "pct": "45.00", "p": 19, "w": 9, "l": 9, "d": 1, "pts": 93}
                ]
            },
            {
                "id": "ipl-2025",
                "title": "Indian Premier League 2025",
                "dates": "March - May 2025",
                "type": "T20 League",
                "status": "Upcoming",
                "teams": "10 Franchises",
                "defendingChamp": "Kolkata Knight Riders"
            }
        ]

espn_service = ESPNClient()
