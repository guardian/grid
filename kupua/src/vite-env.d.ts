/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Vite proxy path prefix for ES requests */
  readonly VITE_ES_BASE?: string;
  /** ES index or alias to query */
  readonly VITE_ES_INDEX?: string;
  /** Whether the ES target is local (enables/disables write protection) */
  readonly VITE_ES_IS_LOCAL?: string;
  /** Whether the S3 thumbnail proxy is available (set in --use-TEST mode) */
  readonly VITE_S3_PROXY_ENABLED?: string;
  /** Whether imgproxy is available for full-size images (set in --use-TEST mode) */
  readonly VITE_IMGPROXY_ENABLED?: string;
  /** S3 bucket name for full-size images (needed for imgproxy URL generation) */
  readonly VITE_IMAGE_BUCKET?: string;
  /** ES max_result_window — from/size pagination limit. Default: 100000. */
  readonly VITE_MAX_RESULT_WINDOW?: string;
  /** Offset above which seek uses deep path (search_after). Default: 10000. */
  readonly VITE_DEEP_SEEK_THRESHOLD?: string;
  /** Bucket size for composite agg in findKeywordSortValue. Default: 10000. */
  readonly VITE_KEYWORD_SEEK_BUCKET_SIZE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

