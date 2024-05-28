import { FeatureSwitchData } from "./components/gr-feature-switch-panel/gr-feature-switch-panel";
import { PermissionOption } from "./components/gr-permissions-filter/gr-permissions-filter-config";
import { Notification } from "./components/gr-notifications-banner/gr-notifications-banner";

declare global {
    interface Window {
      _clientConfig: {
        rootUri: string;
        telemetryUri: string;
        featureSwitches: Array<FeatureSwitchData>;
        interimFilterOptions: Array<PermissionOption>;
        maybeOrgOwnedValue: string | undefined;
        announcements: Array<Notification>;
        usePermissionsFilter: boolean;
        permissionsDefault?: string | undefined;
      }
    }
  }
