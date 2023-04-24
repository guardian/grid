import { FeatureSwitchData } from "./components/gr-feature-switch-panel/gr-feature-switch-panel";

declare global {
    interface Window {
      _clientConfig: {
        telemetryUri: string;
        featureSwitches: Array<FeatureSwitchData>
        maybeOrgOwnedValue: string | undefined;
      }
    }
  }
