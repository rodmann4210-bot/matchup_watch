// api/matchup.js — batter vs pitcher matchup via Baseball Savant statcast_search
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { batter_id, pitcher_id } = req.query;
  if (!batter_id || !pitcher_id) {
    return res.status(400).json({ ok: false, error: "batter_id and pitcher_id required" });
  }

  try {
    // Fetch pitch-by-pitch data from Savant for this matchup
    const url = `https://baseballsavant.mlb.com/statcast_search/csv?hfPT=&hfAB=&hfGT=R%7C&hfPR=&hfZ=&hfStadium=&hfBBL=&hfNewZones=&hfPull=&hfC=&hfSea=2026%7C2025%7C2024%7C2023%7C2022%7C2021%7C&hfSit=&player_type=batter&hfOuts=&hfOpponent=&pitcher_throws=&batter_stands=&hfSA=&game_date_gt=&game_date_lt=&hfMo=&hfTeam=&home_road=&batters_lookup%5B%5D=${batter_id}&pitchers_lookup%5B%5D=${pitcher_id}&team=&position=&hfRO=&home=&min_pitches=0&min_results=0&group_by=name&sort_col=pitches&player_event_sort=api_p_release_speed&sort_order=desc&min_abs=0&type=details&`;

    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/csv,*/*"
      }
    });

    if (!r.ok) throw new Error(`Savant returned ${r.status}`);
    const csv = await r.text();

    // Parse CSV
    const lines = csv.trim().split("\n");
    if (lines.length < 2) return res.status(200).json({ ok: true, pa: 0, abs: [], summary: null });

    const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
    const rows = lines.slice(1).map(line => {
      const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
      const obj = {};
      headers.forEach((h, i) => obj[h] = vals[i]);
      return obj;
    }).filter(r => r.events && r.events !== "");

    if (rows.length === 0) return res.status(200).json({ ok: true, pa: 0, abs: [], summary: null });

    // Calculate summary stats
    const paEvents = ["single","double","triple","home_run","strikeout","walk","hit_by_pitch","field_out","force_out","grounded_into_double_play","double_play","sac_fly","sac_bunt","field_error","fielders_choice","fielders_choice_out","catcher_interf","other_out"];
    const hitEvents = ["single","double","triple","home_run"];
    const obpEvents = ["single","double","triple","home_run","walk","hit_by_pitch"];

    const paRows = rows.filter(r => paEvents.includes(r.events));
    const pa = paRows.length;
    const abs = paRows.filter(r => !["walk","hit_by_pitch","sac_fly","sac_bunt","catcher_interf"].includes(r.events)).length;
    const hits = paRows.filter(r => hitEvents.includes(r.events)).length;
    const hrs = paRows.filter(r => r.events === "home_run").length;
    const ks = paRows.filter(r => r.events === "strikeout").length;
    const bbs = paRows.filter(r => r.events === "walk").length;
    const obpNumer = paRows.filter(r => obpEvents.includes(r.events)).length;

    const avg = abs > 0 ? (hits / abs).toFixed(3).replace("0.", ".") : ".000";
    const obp = pa > 0 ? (obpNumer / pa).toFixed(3).replace("0.", ".") : ".000";

    // Slugging
    const singles = paRows.filter(r => r.events === "single").length;
    const doubles = paRows.filter(r => r.events === "double").length;
    const triples = paRows.filter(r => r.events === "triple").length;
    const tb = singles + doubles * 2 + triples * 3 + hrs * 4;
    const slg = abs > 0 ? (tb / abs).toFixed(3).replace("0.", ".") : ".000";
    const ops = pa > 0 ? ((obpNumer / pa) + (abs > 0 ? tb / abs : 0)).toFixed(3) : ".000";

    // Statcast
    const evRows = rows.filter(r => r.launch_speed && parseFloat(r.launch_speed) > 0);
    const avgEV = evRows.length > 0 ? (evRows.reduce((s, r) => s + parseFloat(r.launch_speed), 0) / evRows.length).toFixed(1) : null;
    const hardHit = evRows.length > 0 ? ((evRows.filter(r => parseFloat(r.launch_speed) >= 95).length / evRows.length) * 100).toFixed(1) : null;

    const xwobas = rows.filter(r => r.estimated_woba_using_speedangle && parseFloat(r.estimated_woba_using_speedangle) > 0);
    const avgXwoba = xwobas.length > 0 ? (xwobas.reduce((s, r) => s + parseFloat(r.estimated_woba_using_speedangle), 0) / xwobas.length).toFixed(3).replace("0.", ".") : null;

    // Last 5 PA
    const last5 = paRows.slice(-5).reverse().map(r => ({
      date: r.game_date,
      event: r.events,
      desc: r.des ? r.des.substring(0, 60) : r.events
    }));

    return res.status(200).json({
      ok: true,
      pa, abs, hits, hrs, ks, bbs,
      avg, obp, slg, ops,
      avgEV, hardHit, avgXwoba,
      kpct: pa > 0 ? ((ks / pa) * 100).toFixed(1) : "0.0",
      bbpct: pa > 0 ? ((bbs / pa) * 100).toFixed(1) : "0.0",
      last5,
      seasons: [...new Set(rows.map(r => r.game_year))].sort().reverse().join(", ")
    });

  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
