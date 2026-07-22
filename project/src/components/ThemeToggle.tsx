import { useTheme } from "next-themes";
import { Sun, Moon, Laptop } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        variant="outline"
        size="icon"
        className={`nb-border nb-shadow-sm h-9 w-9 p-0 bg-card ${className}`}
        aria-label="Toggle theme"
      >
        <div className="w-4 h-4" />
      </Button>
    );
  }

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={cycleTheme}
      className={`nb-border nb-shadow-sm nb-hover-shadow h-9 w-9 p-0 bg-card hover:bg-muted transition-colors ${className}`}
      title={`Current theme: ${theme}. Click to switch.`}
      aria-label="Toggle theme"
    >
      {theme === "light" && <Sun className="w-4 h-4 text-amber-500" />}
      {theme === "dark" && <Moon className="w-4 h-4 text-indigo-400" />}
      {theme === "system" && <Laptop className="w-4 h-4 text-muted-foreground" />}
    </Button>
  );
}
