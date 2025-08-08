import { useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_BASE || "";

type Assignment = {
  chore: string;
  assignee: string;
  completed: boolean;
  completionId?: string;
};

type Vaskeliste = {
  week: string;
  monday: string;
  assignments: Assignment[];
  pointsByMember: Record<string, number>;
};

async function getVaskeliste(week?: string): Promise<Vaskeliste> {
  const r = await fetch(
    week ? `${API}/api/vaskeliste?week=${encodeURIComponent(week)}` : `${API}/api/vaskeliste`
  );
  if (!r.ok) throw new Error("fetch failed");
  return r.json();
}

async function complete(chore: string, assignee: string, week?: string) {
  const r = await fetch(`${API}/api/vaskeliste/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chore, assignee, week }),
  });
  if (!r.ok) throw new Error("complete failed");
  return r.json();
}

async function undo(completionId: string) {
  const r = await fetch(`${API}/api/vaskeliste/complete/${completionId}`, { method: "DELETE" });
  if (!r.ok) throw new Error("undo failed");
}

async function rollover(week?: string) {
  const url = week
    ? `${API}/api/vaskeliste/rollover?week=${encodeURIComponent(week)}`
    : `${API}/api/vaskeliste/rollover`;
  const r = await fetch(url, { method: "POST" });
  if (!r.ok) throw new Error("rollover failed");
  return r.json();
}

export default function Vaskeliste() {
  const [data, setData] = useState<Vaskeliste | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [week, setWeek] = useState<string | undefined>(undefined);

  const choresOrder = useMemo(
    () => ["Bad", "Glass, Metal & Papp", "Støvsuging"],
    []
  );

  const sorted = useMemo(
    () =>
      data
        ? [...data.assignments].sort(
            (a, b) => choresOrder.indexOf(a.chore) - choresOrder.indexOf(b.chore)
          )
        : [],
    [data, choresOrder]
  );

  useEffect(() => {
    let on = true;
    setLoading(true);
    setErr(null);
    getVaskeliste(week)
      .then((d) => on && setData(d))
      .catch((e) => on && setErr(e.message))
      .finally(() => on && setLoading(false));
    return () => {
      on = false;
    };
  }, [week]);

  async function toggle(a: Assignment) {
    setErr(null);
    if (!data) return;
    if (a.completed && a.completionId) {
      await undo(a.completionId);
    } else {
      await complete(a.chore, a.assignee, data.week);
    }
    const fresh = await getVaskeliste(data.week);
    setData(fresh);
  }

  async function runRollover() {
    setErr(null);
    const res = await rollover();
    if (data) {
      const fresh = await getVaskeliste(data.week);
      setData(fresh);
    }
    return res;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Vaskeliste</h1>
        <div className="flex items-center gap-2">
          <input
            value={week ?? ""}
            onChange={(e) => setWeek(e.target.value || undefined)}
            placeholder="YYYY-Www"
            className="input input-bordered input-sm w-36"
          />
          <button onClick={() => setWeek(undefined)} className="btn btn-sm">
            Denne uken
          </button>
        </div>
      </div>

      {err && <div className="alert alert-error">{err}</div>}
      {loading && <div className="skeleton h-24 w-full" />}

      {data && (
        <>
          <div className="card bg-base-200">
            <div className="card-body py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm opacity-70">
                  Uke {data.week} • Mandag {new Date(data.monday).toLocaleDateString("no-NO", { day: "numeric", month: "long", year: "numeric" })}
                </span>
                <button onClick={runRollover} className="btn btn-outline btn-sm">
                  Gi prikker for forrige uke
                </button>
              </div>
              <div className="flex gap-2">
                {Object.entries(data.pointsByMember).map(([m, pts]) => (
                  <div key={m} className="badge badge-lg">
                    {m}: {pts}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card bg-base-100 border border-base-300">
            <div className="card-body p-0">
              <table className="table">
                <thead>
                  <tr>
                    <th>Oppgave</th>
                    <th>Ansvarlig</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((a) => (
                    <tr key={a.chore}>
                      <td>{a.chore}</td>
                      <td>{a.assignee}</td>
                      <td>
                        <button
                          onClick={() => toggle(a)}
                          className={a.completed ? "btn btn-success btn-sm" : "btn btn-outline btn-sm"}
                        >
                          {a.completed ? "Ferdig" : "Marker ferdig"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
