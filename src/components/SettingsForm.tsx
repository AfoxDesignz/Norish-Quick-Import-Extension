import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Description,
  FieldError,
  Form,
  InputGroup,
  Label,
  ListBox,
  Select,
  TextField,
} from "@heroui/react";
import {
  CheckCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  SignalIcon,
} from "@heroicons/react/16/solid";
import { useSettings } from "../hooks/useSettings";
import { testConnection, type TestConnectionResult } from "../lib/api";
import {
  DEFAULT_IMPORT_MODE,
  isImportMode,
  type ImportMode,
} from "../types/storage";

const IMPORT_MODE_OPTIONS: {
  id: ImportMode;
  label: string;
  description: string;
}[] = [
  {
    id: "auto",
    label: "Automatic",
    description:
      "Norish imports the link. If that fails, the recipe is read from the open tab and sent to Norish.",
  },
  {
    id: "server",
    label: "Norish only",
    description:
      "Norish imports the link. After a failure you can still retry with browser data manually.",
  },
  {
    id: "local",
    label: "Browser first",
    description:
      "The recipe is read from the open tab and sent to Norish. Links that are not the open tab are imported by Norish.",
  },
];

interface SettingsFormProps {
  onSaved: () => void;
}

export default function SettingsForm({ onSaved }: SettingsFormProps) {
  const { settings, saveSettings } = useSettings();
  const [domain, setDomain] = useState(settings.instanceDomain ?? "");
  const [apiKey, setApiKey] = useState(settings.apiKey ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(
    null,
  );
  const [importMode, setImportMode] = useState<ImportMode>(
    settings.importMode ?? DEFAULT_IMPORT_MODE,
  );
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [didHydrateFromSettings, setDidHydrateFromSettings] = useState(false);

  useEffect(() => {
    if (didHydrateFromSettings) return;
    if (settings.instanceDomain === undefined && settings.apiKey === undefined)
      return;

    setDomain(settings.instanceDomain ?? "");
    setApiKey(settings.apiKey ?? "");
    setImportMode(settings.importMode ?? DEFAULT_IMPORT_MODE);
    setDidHydrateFromSettings(true);
  }, [
    didHydrateFromSettings,
    settings.apiKey,
    settings.importMode,
    settings.instanceDomain,
  ]);

  const handleTestConnection = async () => {
    setError(null);
    setTestResult(null);
    setIsTesting(true);

    try {
      const result = await testConnection(domain, apiKey);
      setTestResult(result);
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : "Connection failed.",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedDomain = domain.trim();
    const trimmedKey = apiKey.trim();

    if (!trimmedDomain || !trimmedKey) {
      setError("Both fields are required.");
      return;
    }

    let normalized = trimmedDomain;
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
    try {
      new URL(normalized);
    } catch {
      setError("Please enter a valid domain.");
      return;
    }

    setIsSaving(true);
    try {
      const domainToSave = trimmedDomain.replace(/^https?:\/\//i, "");
      await saveSettings(domainToSave, trimmedKey, importMode);
      onSaved();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to save settings. Please try again.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="bg-surface border border-border rounded-2xl p-4 shadow-xs">
      <Form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Domain input */}
        <TextField
          fullWidth
          value={domain}
          onChange={(val) => {
            setDomain(val);
            setTestResult(null);
          }}
          isRequired
          name="instanceDomain"
          className="gap-1.5"
        >
          <Label className="text-xs font-semibold text-foreground">
            Instance Domain
          </Label>
          <InputGroup
            fullWidth
            className="rounded-xl border border-border bg-surface"
          >
            <InputGroup.Prefix className="text-muted text-xs font-medium">
              https://
            </InputGroup.Prefix>
            <InputGroup.Input
              className="text-xs"
              placeholder="norish.yourdomain.com"
            />
          </InputGroup>
          <Description className="text-[11px] text-muted">
            The web address of your hosted Norish instance.
          </Description>
          <FieldError className="text-xs text-danger" />
        </TextField>

        {/* API key input */}
        <TextField
          fullWidth
          value={apiKey}
          onChange={(val) => {
            setApiKey(val);
            setTestResult(null);
          }}
          isRequired
          name="apiKey"
          className="gap-1.5"
        >
          <Label className="text-xs font-semibold text-foreground">
            API Key
          </Label>
          <InputGroup
            fullWidth
            className="rounded-xl border border-border bg-surface"
          >
            <InputGroup.Input
              className="text-xs font-mono"
              placeholder="Paste your Norish API key"
              type={isApiKeyVisible ? "text" : "password"}
            />
            <InputGroup.Suffix className="pr-1">
              <Button
                type="button"
                isIconOnly
                size="sm"
                variant="ghost"
                className="rounded-full size-7 text-muted hover:text-foreground hover:bg-default-200/60 transition-colors"
                aria-label={isApiKeyVisible ? "Hide API key" : "Show API key"}
                onPress={() => setIsApiKeyVisible((prev) => !prev)}
              >
                {isApiKeyVisible ? (
                  <EyeSlashIcon className="size-3.5" />
                ) : (
                  <EyeIcon className="size-3.5" />
                )}
              </Button>
            </InputGroup.Suffix>
          </InputGroup>
          <Description className="text-[11px] text-muted">
            Create an API key in Norish under Account Settings.
          </Description>
          <FieldError className="text-xs text-danger" />
        </TextField>

        {/* Import mode */}
        <Select
          fullWidth
          value={importMode}
          onChange={(value) => {
            if (isImportMode(value)) setImportMode(value);
          }}
          name="importMode"
          className="gap-1.5"
        >
          <Label className="text-xs font-semibold text-foreground">
            Import Mode
          </Label>
          <Select.Trigger className="rounded-xl text-xs bg-surface border border-border text-foreground hover:bg-default-100/60 transition-colors">
            <Select.Value className="text-xs text-foreground" />
            <Select.Indicator />
          </Select.Trigger>
          <Description className="text-[11px] text-muted">
            {
              IMPORT_MODE_OPTIONS.find((option) => option.id === importMode)
                ?.description
            }
          </Description>
          <Select.Popover className="rounded-2xl border border-border bg-overlay text-foreground text-xs shadow-lg p-1 z-50">
            <ListBox className="p-0 gap-0.5 outline-none">
              {IMPORT_MODE_OPTIONS.map((option) => (
                <ListBox.Item
                  key={option.id}
                  id={option.id}
                  textValue={option.label}
                  className="rounded-xl px-2.5 py-1.5 text-xs text-foreground cursor-pointer hover:bg-default-100/80 focus:bg-default-100/80 data-[selected=true]:bg-default-200/60 transition-colors"
                >
                  {option.label}
                  <ListBox.ItemIndicator className="text-primary" />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        {/* Test Result Feedback */}
        {testResult && (
          <Alert
            status={testResult.ok ? "success" : "danger"}
            className="rounded-xl py-2 px-3 text-xs"
          >
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title className="text-xs font-semibold">
                {testResult.ok ? "Connection OK" : "Connection Failed"}
              </Alert.Title>
              <Alert.Description className="text-[11px]">
                {testResult.message}
              </Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        {/* Save error */}
        {error && (
          <Alert status="danger" className="rounded-xl py-2 px-3 text-xs">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title className="text-xs font-semibold">Error</Alert.Title>
              <Alert.Description className="text-[11px]">
                {error}
              </Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-1">
          <Button
            type="submit"
            variant="primary"
            size="md"
            className="rounded-full font-medium w-full shadow-xs"
            isPending={isSaving}
          >
            <CheckCircleIcon className="size-4" />
            Save Settings
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="rounded-full font-medium w-full text-xs"
            isPending={isTesting}
            onPress={handleTestConnection}
          >
            <SignalIcon className="size-3.5" />
            Test Connection
          </Button>
        </div>
      </Form>
    </Card>
  );
}
