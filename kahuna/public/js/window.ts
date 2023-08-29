import { FeatureSwitchData } from "./components/gr-feature-switch-panel/gr-feature-switch-panel";

declare global {
    interface Window {
      _clientConfig: {
        telemetryUri: string;
        featureSwitches: Array<FeatureSwitchData>;
        maybeOrgOwnedValue: string | undefined;
        usePermissionsFilter: boolean;
        permissionsOptions?: string| undefined;
        permissionsLabels?: string | undefined;
        permissionsMappings?: string | undefined;
        permissionsDefault?: string | undefined;
        permissionsQueries?: string | undefined;
      }
    }
  }
