import { NavLink } from "react-router-dom";
import { useThemeStore } from "../store/themeStore";
import {
  LayoutDashboard,
  Container,
  AlertCircle,
  FileText,
  Moon,
  Sun,
  Monitor,
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
    <aside className="w-64 h-screen border-r border-border bg-card flex flex-col">
      {/* Header */}
      <div className="border-b border-border p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <Monitor className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Guardian</h1>
            <p className="text-xs text-muted-foreground">Security Monitor</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-lg"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
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
      <div className="border-t border-border p-4 space-y-3">
        {/* Theme Toggle */}
        <Button
          onClick={toggleTheme}
          variant="outline"
          className="w-full justify-start gap-2"
          size="sm"
        >
          {isDark ? (
            <>
              <Sun className="w-4 h-4" />
              <span>Light Mode</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4" />
              <span>Dark Mode</span>
            </>
          )}
        </Button>

        {/* Version Info */}
        <div className="text-center px-2 py-2 rounded-lg bg-accent/30 text-xs text-muted-foreground">
          <div className="font-semibold">v1.0.0</div>
          <div>Enterprise Edition</div>
        </div>
      </div>
    </aside>
  );
}

