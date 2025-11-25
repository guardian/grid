import { FeatureSwitchData } from "./components/gr-feature-switch-panel/gr-feature-switch-panel";
import { PermissionOption } from "./components/gr-permissions-filter/gr-permissions-filter-config";
import { Notification } from "./components/gr-notifications-banner/gr-notifications-banner";
import { FieldAlias } from "./search/structured-query/query-suggestions";

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
      sessionId: string;
      feedbackFormLink: string;
      fieldAliases: FieldAlias[];
      homeLinkHtml: string;
      canDownloadCrop: boolean;
      showDenySyndicationWarning: boolean;
      showSendToPhotoSales: boolean;
      domainMetadataSpecs: string[];
      recordDownloadAsUsage: boolean;
      metadataTemplates: string[];
      additionalNavigationLinks: string[];
      costFilterLabel: string;
      costFilterChargeable: boolean;
      restrictDownload: boolean;
      warningTextHeader: string;
      warningTextHeaderNoRights: string;
      unusableTextHeader: string;
      denySyndicationTextHeader: string;
      enableWarningFlags: boolean;
      imagePreviewFlagAlertCopy: string;
      imagePreviewFlagWarningCopy: string;
      imagePreviewFlagLeaseAttachedCopy: string;
      useReaper: boolean;
      usageRightsSummary: true;
      defaultShouldBlurGraphicImages: true;
      shouldUploadStraightToBucket: true;
      maybeUploadLimitInBytes: number;
      imageTypes: string[];
      staffPhotographerOrganisation: string;
      agencyPicksIngredients: {
        [field: string]: string[];
      }
    };
  }
}
