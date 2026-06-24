// api/lookup.js — player name search via MLB Stats API
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { name } = req.query;
  if (!name || name.trim().length < 2) {
    return res.status(400).json({ ok: false, error: "Name too short" });
  }

  try {
    const url = `https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(name.trim())}&sportIds=1`;
    const r = await fetch(url);
    const j = await r.json();
    const people = (j.people || []).map(p => ({
      id: p.id,
      name: p.fullName,
      position: p.primaryPosition?.abbreviation || "?",
      team: p.currentTeam?.name || "—",
      active: p.active
    })).filter(p => p.active);
    return res.status(200).json({ ok: true, people });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
