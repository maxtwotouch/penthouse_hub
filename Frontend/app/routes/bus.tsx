import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_BASE || "";

type Departure = { line: string; destination: string; time: string; minutes: number };
type Stop = { id: string | null; name: string; departures: Departure[] };
type Payload = { stops: Stop[] };

function badge(mins: number) {
  if (mins <= 5) return "badge badge-error";
  if (mins <= 10) return "badge badge-warning";
  return "badge badge-success";
}

export default function Bus() {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/bus?stops=Kvamstykket,Seminarbakken`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e: any) {
      setErr(e.message || "Feil ved henting");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Avganger</h1>
        <button className="btn btn-sm" onClick={load} disabled={loading}>Oppdater</button>
      </div>

      {err && <div className="alert alert-error">{err}</div>}
      {loading && <div className="skeleton h-28 w-full" />}

      <div className="grid md:grid-cols-2 gap-4">
        {(data?.stops ?? [{name:"Kvamstykket",id:null,departures:[]},{name:"Seminarbakken",id:null,departures:[]}]).map((s) => (
          <div key={s.name} className="card bg-base-100 border border-base-300">
            <div className="card-body">
              <h2 className="card-title">{s.name}</h2>
              {s.departures.length === 0 ? (
                <div className="opacity-60">Ingen avganger funnet de neste 2 timene.</div>
              ) : (
                <div className="space-y-2">
                  {s.departures.map((d, i) => {
                    const hhmm = new Date(d.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                    return (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <span className="font-medium">{d.line}</span>
                        <span className="truncate">{d.destination}</span>
                        <span className={badge(d.minutes)}>{d.minutes} min</span>
                        <span className="opacity-60 text-sm">{hhmm}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs opacity-60">Fargekoder: ≤5 min rød • 5–10 min gul • &gt;10 min grønn.</p>
    </div>
  );
}
