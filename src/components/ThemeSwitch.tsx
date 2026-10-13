import { Button, Tooltip } from "@heroui/react";
import { MoonIcon, SunIcon } from "@heroicons/react/20/solid";
import type { ThemeMode } from "../hooks/useTheme";

interface ThemeSwitchProps {
  themeMode: ThemeMode;
  onThemeModeChange: (themeMode: ThemeMode) => Promise<void>;
  className?: string;
}

export default function ThemeSwitch({
  themeMode,
  onThemeModeChange,
  className = "",
}: ThemeSwitchProps) {
  const isDark = themeMode === "dark";

  return (
    <Tooltip delay={300}>
      <Tooltip.Trigger aria-label="Toggle theme">
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          className={`rounded-full size-8 text-muted hover:text-foreground hover:bg-default-200/60 transition-colors ${className}`}
          onPress={() => {
            void onThemeModeChange(isDark ? "light" : "dark");
          }}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? (
            <SunIcon className="size-4 text-warning transition-transform duration-200 rotate-0 hover:rotate-45" />
          ) : (
            <MoonIcon className="size-4 text-muted hover:text-foreground transition-transform duration-200 -rotate-12 hover:rotate-0" />
          )}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content
        showArrow
        placement="bottom"
        className="bg-surface text-foreground border border-border shadow-md rounded-xl px-2 py-1 text-xs"
      >
        {isDark ? "Light mode" : "Dark mode"}
      </Tooltip.Content>
    </Tooltip>
  );
}
