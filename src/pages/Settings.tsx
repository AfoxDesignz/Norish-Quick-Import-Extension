import { Button, Tooltip } from "@heroui/react";
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
      {/* Header Bar */}
      <header className="flex items-center justify-between w-full pb-1 border-b border-border/40">
        <div className="flex items-center gap-2">
          {canGoHome && (
            <Tooltip delay={300}>
              <Tooltip.Trigger aria-label="Back to home">
                <Button
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  className="rounded-full size-8 text-muted hover:text-foreground hover:bg-default-200/60 transition-colors group"
                  onPress={onNavigateHome}
                  aria-label="Back to home"
                >
                  <ArrowLeftIcon className="size-4 text-foreground transition-transform duration-200 ease-out group-hover:-translate-x-0.5" />
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content
                showArrow
                placement="bottom"
                className="bg-surface text-foreground border border-border shadow-md rounded-xl px-2 py-1 text-xs"
              >
                Back
              </Tooltip.Content>
            </Tooltip>
          )}
          <h1 className="font-serif text-lg font-semibold tracking-tight text-foreground">
            Settings
          </h1>
          <VersionChip />
        </div>

        <div className="flex items-center">
          <ThemeSwitch
            themeMode={themeMode}
            onThemeModeChange={onThemeModeChange}
          />
        </div>
      </header>

      {/* Settings Form */}
      <SettingsForm onSaved={onNavigateHome} />
    </div>
  );
}
