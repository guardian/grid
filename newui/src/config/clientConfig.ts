/**
 * Type-safe access to client configuration from window._clientConfig
 */

export interface ClientConfig {
  rootUri: string;
  sessionId: string;
  feedbackFormLink: string;
  usageRightsHelpLink: string;
  invalidSessionHelpLink: string;
  supportEmail: string;
  staffPhotographerOrganisation: string;
  fieldAliases: unknown[];
  homeLinkHtml: string;
  systemName: string;
  canDownloadCrop: boolean;
  showDenySyndicationWarning: boolean;
  showSendToPhotoSales: boolean;
  domainMetadataSpecs: unknown[];
  recordDownloadAsUsage: boolean;
  metadataTemplates: unknown[];
  additionalNavigationLinks: unknown[];
  costFilterLabel: string;
  costFilterChargeable: boolean;
  maybeOrgOwnedValue: string;
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
  featureSwitches: Array<{ key: string; title: string; value: string }>;
  telemetryUri: string;
  usePermissionsFilter: boolean;
  usageRightsSummary: boolean;
  interimFilterOptions: unknown[];
  permissionsDefault: string;
  defaultShouldBlurGraphicImages: boolean;
  shouldUploadStraightToBucket: boolean;
  maybeUploadLimitInBytes: number;
  announcements: unknown[];
  imageTypes: unknown[];
  agencyPicksIngredients: Record<string, string[]>;
}

declare global {
  interface Window {
    _clientConfig?: ClientConfig;
  }
}

/**
 * Get the client configuration from window._clientConfig
 * @throws {Error} if configuration is not found
 */
function getClientConfig(): ClientConfig {
  if (!window._clientConfig) {
    throw new Error('Client configuration (_clientConfig) not found in window');
  }
  return window._clientConfig;
}

/**
 * Get a specific config value
 */
export function getConfig<K extends keyof ClientConfig>(
  key: K,
): ClientConfig[K] {
  return getClientConfig()[key];
}

/**
 * Get the root URI from config
 */
export function getRootUri(): string {
  return getConfig('rootUri');
}

/**
 * Generate the API base URL from the root URI
 * Constructs: {rootUri}/api
 */
export function getMediaApiBaseUrl(): string {
  const rootUri = new URL(getRootUri());
  rootUri.host = 'api.' + rootUri.host;
  return rootUri.toString();
}

/**
 * Generate a complete API endpoint URL
 * @param path - the path relative to the API base (e.g., 'images' or 'images/123')
 */
export function getMediaApiUrl(path: string): string {
  const baseUrl = getMediaApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return `${baseUrl}${normalizedPath}`;
}
