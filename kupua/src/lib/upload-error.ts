import type { UploadAttempt } from "@/stores/upload-jobs-store";

export function redactUploadError(value: string): string {
  return value
    .replace(/\b(?:https?|s3):\/\/[^\s"'<>]+/gi, "[redacted URL]")
    .replace(/\b(?:authorization|cookie|set-cookie)["']?\s*[:=][^\r\n]*/gi, "[redacted credentials]")
    .replace(/\b(?:AWSAccessKeyId|Signature|X-Amz-[\w-]+|token|password|secret)["']?\s*[:=]\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s&,;"']+)/gi, "[redacted credential]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted token]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted email]");
}

export function uploadFailureLabel(attempt: UploadAttempt): string | null {
  if (attempt.phase === "uncertain" || attempt.phase === "interrupted") return attempt.statusId ? null : "Not confirmed";
  if (attempt.serverError) return /\b(?:ImageProcessingException|JpegProcessingException|PngProcessingException|TiffProcessingException)\b/.test(attempt.serverError)
    ? "Image corrupted" : "Processing error";
  switch (attempt.submission?.failureKind) {
    case "server": return "Server error";
    case "session": return "Reload page and try again";
    case "size": {
      const limit = attempt.submission.maxFileBytes;
      if (!limit) return "Filesize too large";
      const unit = limit >= 1_000_000 ? "MB" : limit >= 1_000 ? "KB" : "B";
      const divisor = unit === "MB" ? 1_000_000 : unit === "KB" ? 1_000 : 1;
      return `Filesize exceeds max ${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(limit / divisor)}${unit}`;
    }
  }
  if (["Upload permission is unavailable.", "Loader service is unavailable.", "Upload configuration is unavailable.", "Direct loading is unavailable."].includes(attempt.message ?? "")) return "Server error";
  if (attempt.message?.startsWith("Session expired")) return "Reload page and try again";
  return "Failed";
}