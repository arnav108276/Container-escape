import { NavLink } from "react-router-dom";
import { useThemeStore } from "../store/themeStore";
import {
  LayoutDashboard,
  Container,
  AlertCircle,
  FileText,
  Moon,
  Sun,
  Shield,
} from "lucide-react";
import { Button } from "./ui/button";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/containers", label: "Containers", icon: Container },
  { to: "/alerts", label: "Alerts", icon: AlertCircle },
  { to: "/reports", label: "Reports", icon: FileText },
];

export default function Sidebar() {
  const { theme, setTheme, getEffectiveTheme } = useThemeStore();
  const effectiveTheme = getEffectiveTheme();
  const isDark = effectiveTheme === "dark";

  const toggleTheme = () => {
    if (theme === "system") {
      setTheme(isDark ? "light" : "dark");
    } else {
      setTheme(theme === "dark" ? "light" : "dark");
    }
  };

  return (
    <aside className="w-64 h-screen border-r border-white/5 bg-background flex flex-col z-50">
      {/* Header */}
      <div className="p-8">
        <div className="flex items-center gap-3 group cursor-pointer" onClick={() => window.location.href='/'}>
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tighter">GUARDIAN</h1>
            <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest leading-none mt-1">Enterprise</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 space-y-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-4 rounded-xl px-4 py-3.5 text-xs font-black uppercase tracking-widest transition-all ${
                  isActive
                    ? "bg-blue-600/10 text-blue-400 border border-blue-500/20 shadow-lg"
                    : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                }`
              }
            >
              <Icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-6 border-t border-white/5 space-y-4">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="w-full flex items-center justify-center gap-3 rounded-xl border border-white/5 bg-white/5 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:bg-white/10 transition-all"
        >
          {isDark ? (
            <>
              <Sun className="w-4 h-4" />
              <span>Daylight</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4" />
              <span>Midnight</span>
            </>
          )}
        </button>

        {/* Version Info */}
        <div className="text-center px-4 py-3 rounded-xl bg-blue-600/5 border border-blue-500/10 text-[10px] font-black uppercase tracking-widest text-blue-400/60">
          SEC-VER 1.0.0
        </div>
      </div>
    </aside>
  );
}

