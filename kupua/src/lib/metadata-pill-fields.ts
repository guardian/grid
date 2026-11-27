export function containsAllPillValues(observed: readonly string[], requested: readonly string[]): boolean {
  if (requested.length < 3) return requested.every(value => observed.includes(value));
  const values = new Set(observed);
  return requested.every(value => values.has(value));
}

export const SUBJECTS = [
  "arts", "crime", "disaster", "finance", "education", "environment",
  "health", "human", "labour", "lifestyle", "nature", "news", "politics",
  "religion", "science", "social", "sport", "war", "weather",
];

const metadataPills = { subjects: "metadata_subjects", people: "metadata_peopleInImage", keywords: "metadata_keywords" } as const;

export function pillCommandField(field: string) {
  return Object.hasOwn(metadataPills, field) ? metadataPills[field as keyof typeof metadataPills] : field;
}

export function pillDisplayField(field: string) {
  return Object.entries(metadataPills).find(([, command]) => command === field)?.[0] ?? field;
}