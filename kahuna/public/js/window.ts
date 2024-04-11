import { FeatureSwitchData } from "./components/gr-feature-switch-panel/gr-feature-switch-panel";
import { Notification } from "./components/gr-notifications-banner/gr-notifications-banner";

declare global {
    interface Window {
      _clientConfig: {
        rootUri: string;
        telemetryUri: string;
        featureSwitches: Array<FeatureSwitchData>;
        maybeOrgOwnedValue: string | undefined;
        announcements: Array<Notification>;
        usePermissionsFilter: boolean;
        permissionsOptions?: string | undefined;
        permissionsDefault?: string | undefined;
      }
    }
  }
