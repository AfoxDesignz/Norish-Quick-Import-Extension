import { Button, Tooltip } from "@heroui/react";
import { Cog6ToothIcon } from "@heroicons/react/20/solid";
import RecipeImportForm from "../components/RecipeImportForm";
import type { StoredConfig } from "../types/storage";
import VersionChip from "../components/VersionChip";
import ThemeSwitch from "../components/ThemeSwitch";
import type { ThemeMode } from "../hooks/useTheme";

interface HomeProps {
  config: Required<StoredConfig>;
  onNavigateSettings: () => void;
  themeMode: ThemeMode;
  onThemeModeChange: (themeMode: ThemeMode) => Promise<void>;
}

export default function Home({
  config,
  onNavigateSettings,
  themeMode,
  onThemeModeChange,
}: HomeProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Header Bar */}
      <header className="flex items-center justify-between w-full pb-1 border-b border-border/40">
        <div className="flex items-baseline gap-2">
          <h1 className="font-serif text-lg font-semibold tracking-tight text-foreground">
            Norish Quick Import
          </h1>
          <VersionChip />
        </div>

        <div className="flex items-center gap-0.5">
          <ThemeSwitch
            themeMode={themeMode}
            onThemeModeChange={onThemeModeChange}
          />
          <Tooltip delay={300}>
            <Tooltip.Trigger aria-label="Open settings">
              <Button
                variant="ghost"
                size="sm"
                isIconOnly
                className="rounded-full size-8 text-muted hover:text-foreground hover:bg-default-200/60 transition-colors group"
                onPress={onNavigateSettings}
                aria-label="Open settings"
              >
                <Cog6ToothIcon className="size-4 transition-transform duration-300 ease-out group-hover:rotate-45" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content
              showArrow
              placement="bottom"
              className="bg-surface text-foreground border border-border shadow-md rounded-xl px-2 py-1 text-xs"
            >
              Settings
            </Tooltip.Content>
          </Tooltip>
        </div>
      </header>

      {/* Main Recipe Import Form */}
      <RecipeImportForm config={config} />
    </div>
  );
}
