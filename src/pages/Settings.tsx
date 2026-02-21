import { Button } from "@heroui/react";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import SettingsForm from "../components/SettingsForm";
import VersionChip from "../components/VersionChip";

interface SettingsProps {
  onNavigateHome: () => void;
  canGoHome: boolean;
}

export default function Settings({ onNavigateHome, canGoHome }: SettingsProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
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
              <ArrowLeftIcon className="size-4 transition-transform duration-300 ease-out group-hover:-translate-x-0.5" />
            </Button>
          )}
          <h1 className="text-xl font-bold">Settings</h1>
        </div>

        <div className="flex items-center">
          <VersionChip />
        </div>
      </div>
      <SettingsForm onSaved={onNavigateHome} />
    </div>
  );
}
