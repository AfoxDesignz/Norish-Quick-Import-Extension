import { Button } from "@heroui/react";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import SettingsForm from "../components/SettingsForm";
import VersionChip from "../components/VersionChip";
import ThemeSwitch from "../components/ThemeSwitch";
import type { ThemeMode } from "../hooks/useTheme";

interface SettingsProps {
  onNavigateHome: () => void;
  canGoHome: boolean;
  themeMode: ThemeMode;
  onThemeModeChange: (themeMode: ThemeMode) => Promise<void>;
}

export default function Settings({
  onNavigateHome,
  canGoHome,
  themeMode,
  onThemeModeChange,
}: SettingsProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          {canGoHome && (
            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              className="group hover:!bg-default-300/50"
              onPress={() => {
                onNavigateHome();
              }}
              aria-label="Back to home"
            >
              <ArrowLeftIcon className="size-4 text-foreground transition-transform duration-300 ease-out group-hover:-translate-x-0.5" />
            </Button>
          )}
          <h1 className="text-xl font-bold">Settings</h1>
          <VersionChip />
        </div>

        <div className="flex items-center">
          <ThemeSwitch
            themeMode={themeMode}
            onThemeModeChange={onThemeModeChange}
          />
        </div>
      </div>
      <SettingsForm onSaved={onNavigateHome} />
    </div>
  );
}
