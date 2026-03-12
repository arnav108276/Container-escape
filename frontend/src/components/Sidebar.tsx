import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: "📊" },
  { to: "/containers", label: "Containers", icon: "📦" },
  { to: "/alerts", label: "Alerts", icon: "🚨" },
  { to: "/reports", label: "Reports", icon: "📝" },
];

export default function Sidebar() {
  const linkStyle = "flex items-center gap-3 px-4 py-3 rounded-lg transition hover:bg-slate-800";
  const activeStyle = "bg-slate-800 text-green-400";

  return (
    <aside className="h-screen w-64 border-r border-slate-800 bg-slate-950">
      <div className="border-b border-slate-800 p-6">
        <h1 className="text-xl font-bold text-green-400">Container Guardian</h1>
        <p className="text-xs text-gray-400">Runtime Security Monitor</p>
      </div>

      <nav className="flex flex-col gap-2 p-4">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `${linkStyle} ${isActive ? activeStyle : ""}`}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
