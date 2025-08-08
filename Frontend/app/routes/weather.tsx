import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_BASE || "";

type Hour = { time: string; temp: number; wind: number; windDir: number; precip?: number; symbol?: string };
type Payload = { lat: number; lon: number; current: Hour | null; hourly: Hour[] };

const ICONS: Record<string, string> = {
  clearsky_day: "☀️", clearsky_night: "🌙",
  fair_day: "🌤️", fair_night: "🌤️",
  partlycloudy_day: "⛅", partlycloudy_night: "⛅",
  cloudy: "☁️", fog: "🌫️",
  lightrain: "🌦️", rain: "🌧️", heavyrain: "🌧️",
  rainshowers_day: "🌦️", rainshowers_night: "🌦️",
  sleet: "🌨️", lightsnow: "🌨️", snow: "❄️", heavysnow: "❄️",
  thunderstorm: "⛈️", rainsnow: "🌨️",
};
const DESC: Record<string, string> = {
  clearsky_day: "Sol", clearsky_night: "Klarvær",
  fair_day: "Lettskyet", fair_night: "Lettskyet",
  partlycloudy_day: "Delvis skyet", partlycloudy_night: "Delvis skyet",
  cloudy: "Overskyet", fog: "Tåke",
  lightrain: "Lett regn", rain: "Regn", heavyrain: "Kraftig regn",
  rainshowers_day: "Regnbyger", rainshowers_night: "Regnbyger",
  sleet: "Sludd", lightsnow: "Lett snø", snow: "Snø", heavysnow: "Kraftig snø",
  thunderstorm: "Tordenvær", rainsnow: "Sludd",
};
const iconFor = (s?: string) => (s && ICONS[s]) || "🌡️";
const descFor = (s?: string) => (s && DESC[s]) || "Vær";

function dirArrow(deg?: number) {
  if (deg == null) return "—";
  return <span style={{ display: "inline-block", transform: `rotate(${deg}deg)` }}>➤</span>;
}

export default function Weather() {
  const [lat, setLat] = useState("69.6496");
  const [lon, setLon] = useState("18.9560");
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&hours=12`);
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
    const t = setInterval(load, 10 * 60_000);
    return () => clearInterval(t);
  }, []);

  const hours = data?.hourly ?? [];
  const now = data?.current ?? null;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Vær</h1>
        <div className="flex items-center gap-2">
          <input className="input input-bordered input-sm w-28" value={lat} onChange={(e) => setLat(e.target.value)} />
          <input className="input input-bordered input-sm w-28" value={lon} onChange={(e) => setLon(e.target.value)} />
          <button className="btn btn-sm" onClick={load} disabled={loading}>Oppdater</button>
        </div>
      </div>

      {err && <div className="alert alert-error">{err}</div>}
      {loading && <div className="skeleton h-24 w-full" />}

      {now && (
        <div className="card bg-base-200">
          <div className="card-body py-3">
            <div className="flex items-center gap-6">
              <div className="text-4xl">{iconFor(now.symbol)} {Math.round(now.temp)}°</div>
              <div className="flex gap-4 text-sm">
                <div>{descFor(now.symbol)}</div>
                <div>Vind: {Math.round(now.wind)} m/s {dirArrow(now.windDir)}</div>
                <div>Nedbør 1t: {now.precip ?? 0} mm</div>
                <div>Lat/Lon: {data?.lat.toFixed(4)}, {data?.lon.toFixed(4)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card bg-base-100 border border-base-300">
        <div className="card-body p-0">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 p-4">
            {hours.map((h, i) => {
              const dt = new Date(h.time);
              const hm = dt.toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit", hour12: false });
              const badge =
                h.precip && h.precip > 0.0 ? "badge badge-info"
                : h.temp <= -5 ? "badge badge-primary"
                : "badge";
              return (
                <div key={i} className="p-3 rounded-xl border border-base-300">
                  <div className="text-sm opacity-70">{hm}</div>
                  <div className="text-xl font-medium">{iconFor(h.symbol)} {Math.round(h.temp)}°</div>
                  <div className="text-sm">{descFor(h.symbol)}</div>
                  <div className="text-sm">Vind {Math.round(h.wind)} m/s {dirArrow(h.windDir)}</div>
                  <div className={badge}>{(h.precip ?? 0).toFixed(1)} mm</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="text-xs opacity-60">Kilde: api.met.no locationforecast/2.0 (compact).</p>
    </div>
  );
}
