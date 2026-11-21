import type { Image } from "@/types/image";
import { format, isSameDay, subDays } from "date-fns";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

export function formatGridDate(iso: string | undefined): string {
  if (!iso) return "[none]";
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "Invalid Date, Invalid Date";
    return dateFormatter.format(date) + ", " + timeFormatter.format(date);
  } catch {
    return iso;
  }
}

export function formatRecentGridDate(timestamp: number, now = new Date()): string {
  const date = new Date(timestamp);
  const day = isSameDay(date, now) ? "today"
    : isSameDay(date, subDays(now, 1)) ? "yesterday"
    : format(date, date.getFullYear() === now.getFullYear() ? "d MMM" : "d MMM yyyy");
  return `${day}, ${timeFormatter.format(date)}`;
}

export function getGridDatePresentation(image: Image, orderBy: string | undefined) {
  const uploaded = formatGridDate(image.uploadTime);
  const taken = formatGridDate(image.metadata?.dateTaken);
  const modified = formatGridDate(image.lastModified);
  const primary = (orderBy ?? "-uploadTime").split(",")[0].replace(/^-/, "");
  let dateLine = `Uploaded: ${uploaded}`;
  if (primary === "taken") dateLine = `Taken: ${taken}`;
  else if (primary === "lastModified") dateLine = `Modified: ${modified}`;
  else if (primary === "dateAddedToCollection") {
    const dates = image.collections?.map(collection => collection.actionData?.date)
      .filter((date): date is string => !!date).sort();
    dateLine = `Added: ${formatGridDate(dates?.at(-1))}`;
  } else if (primary === "usagesDateAdded") {
    const dates = image.usages?.map(usage => usage.dateAdded)
      .filter((date): date is string => !!date).sort();
    dateLine = `Used: ${formatGridDate(dates?.at(-1))}`;
  }
  return { dateLine,
    dateTooltip: `Uploaded: ${uploaded}\n      Taken: ${taken}\n  Modified: ${modified}` };
}