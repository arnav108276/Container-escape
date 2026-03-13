import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: "📊" },
  { to: "/containers", label: "Containers", icon: "📦" },
  { to: "/alerts", label: "Alerts", icon: "🚨" },
  { to: "/reports", label: "Reports", icon: "📝" },
];

export default function Sidebar() {
  const linkStyle = "flex items-center gap-3 rounded-lg px-4 py-3 text-slate-300 transition hover:bg-slate-800 hover:text-white";
  const activeStyle = "bg-cyan-500/15 text-cyan-200 border border-cyan-400/30";

  return (
    <aside className="h-screen w-64 border-r border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="border-b border-slate-800 p-6">
        <h1 className="text-xl font-bold text-cyan-300">Container Guardian</h1>
        <p className="text-xs text-slate-400">Runtime Security Monitor</p>
      </div>

      <nav className="flex flex-col gap-2 p-4">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `${linkStyle} ${isActive ? activeStyle : ""}`}>
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
