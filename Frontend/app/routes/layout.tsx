import { Outlet, Link } from "react-router";
import { useEffect, useState } from "react";

export default function Layout() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <div className="h-screen w-screen flex flex-col bg-base-100 text-base-content transition-all duration-500">
      <header className="navbar bg-base-200 border-b border-base-300 px-4">
        <div className="flex-1 text-xl font-bold">🏠 Penthouse Hub</div>
        <div className="flex-none">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setTheme(t => (t === "light" ? "dark" : "light"))}
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 animate-fade">
        <Outlet />
      </main>

      <nav className="dock dock-md bg-base-200 text-base-content border-t border-base-300">
        <Link to="/bus" className="dock-item">
          <span className="text-xl">🚌</span>
          <span className="dock-label text-xs">Bus</span>
            <span className="dock-label text-xs">This is a test</span>
        </Link>
        <Link to="/weather" className="dock-item">
          <span className="text-xl">🌦</span>
          <span className="dock-label text-xs">Vær</span>
        </Link>
        <Link to="/vaskeliste" className="dock-item">
          <span className="text-xl">🧽</span>
          <span className="dock-label text-xs">Vask</span>
        </Link>
      </nav>
    </div>
  );
}
