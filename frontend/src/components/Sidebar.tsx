import { ShieldAlert, Server, LayoutDashboard, FileText } from "lucide-react";
import { NavLink } from "react-router-dom";

export default function Sidebar() {

  const linkStyle =
    "flex items-center gap-3 px-4 py-3 rounded-lg transition hover:bg-slate-800";

  const activeStyle = "bg-slate-800 text-green-400";

  return (
    <aside className="w-64 h-screen bg-slate-950 border-r border-slate-800">

      {/* Logo */}
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold text-green-400">
          Container Guardian
        </h1>
        <p className="text-xs text-gray-400">
          Runtime Security Monitor
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-2 p-4">

        <NavLink
          to="/"
          className={({ isActive }) =>
            `${linkStyle} ${isActive ? activeStyle : ""}`
          }
        >
          <LayoutDashboard size={18} />
          Dashboard
        </NavLink>

        <NavLink
          to="/containers"
          className={({ isActive }) =>
            `${linkStyle} ${isActive ? activeStyle : ""}`
          }
        >
          <Server size={18} />
          Containers
        </NavLink>

        <NavLink
          to="/alerts"
          className={({ isActive }) =>
            `${linkStyle} ${isActive ? activeStyle : ""}`
          }
        >
          <ShieldAlert size={18} />
          Alerts
        </NavLink>

        <NavLink
          to="/reports"
          className={({ isActive }) =>
            `${linkStyle} ${isActive ? activeStyle : ""}`
          }
        >
          <FileText size={18} />
          Reports
        </NavLink>

      </nav>
    </aside>
  );
}