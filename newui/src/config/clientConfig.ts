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
  fieldAliases: Array<unknown>;
  homeLinkHtml: string;
  systemName: string;
  canDownloadCrop: boolean;
  showDenySyndicationWarning: boolean;
  showSendToPhotoSales: boolean;
  domainMetadataSpecs: Array<unknown>;
  recordDownloadAsUsage: boolean;
  metadataTemplates: Array<unknown>;
  additionalNavigationLinks: Array<unknown>;
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
  interimFilterOptions: Array<unknown>;
  permissionsDefault: string;
  defaultShouldBlurGraphicImages: boolean;
  shouldUploadStraightToBucket: boolean;
  maybeUploadLimitInBytes: number;
  announcements: Array<unknown>;
  imageTypes: Array<unknown>;
  agencyPicksIngredients: Record<string, Array<string>>;
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
export function getConfig<T extends keyof ClientConfig>(
  key: T,
): ClientConfig[T] {
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

export function getMetadataEditorBaseUrl(): string {
  const rootUri = new URL(getRootUri());
  const hostnameParts = rootUri.host.split('.');
  hostnameParts[0] = hostnameParts[0] + '-metadata';
  rootUri.host = hostnameParts.join('.');
  return rootUri.toString();
}

export function getMetadataEditorUrl(path: string): string {
  const baseUri = getMetadataEditorBaseUrl();
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return `${baseUri}${normalizedPath}`;
}
