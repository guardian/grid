import type { Image } from "@/types/image";

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