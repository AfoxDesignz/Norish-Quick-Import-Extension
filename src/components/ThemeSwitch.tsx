import { Switch } from "@heroui/react";
import { MoonIcon, SunIcon } from "@heroicons/react/20/solid";
import type { ThemeMode } from "../hooks/useTheme";

interface ThemeSwitchProps {
  themeMode: ThemeMode;
  onThemeModeChange: (themeMode: ThemeMode) => Promise<void>;
}

export default function ThemeSwitch({
  themeMode,
  onThemeModeChange,
}: ThemeSwitchProps) {
  return (
    <Switch
      size="md"
      aria-label="Toggle dark mode"
      isSelected={themeMode === "dark"}
      onChange={(isSelected) => {
        void onThemeModeChange(isSelected ? "dark" : "light");
      }}
    >
      {({ isSelected }) => (
        <Switch.Control
          className={`transition-colors duration-200 ${
            isSelected ? "bg-primary-700" : "bg-default-300"
          }`}
        >
          <Switch.Thumb
            className={isSelected ? "bg-content1 shadow-sm" : "shadow-sm"}
          >
            <Switch.Icon>
              {isSelected ? (
                <MoonIcon className="size-4 text-content1-foreground" />
              ) : (
                <SunIcon className="size-4 text-warning-600" />
              )}
            </Switch.Icon>
          </Switch.Thumb>
        </Switch.Control>
      )}
    </Switch>
  );
}
