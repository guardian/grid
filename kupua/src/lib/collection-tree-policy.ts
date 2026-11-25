export function isCollectionTreeWrite(method: string | undefined, path: string | undefined): boolean {
  if (method !== "POST" && method !== "DELETE") return false;
  if (path === "/collections") return method === "POST";
  if (!path?.startsWith("/collections/")) return false;
  return path.slice("/collections/".length).split("/").every(segment => {
    if (!/^(?:[a-zA-Z0-9_.~*+!-]|%[0-9a-fA-F]{2})+$/.test(segment)) return false;
    try {
      const value = decodeURIComponent(segment);
      return value !== "." && value !== ".." && !/[\/\\"\u0000-\u001f\u007f]/.test(value);
    } catch { return false; }
  });
}

export function collectionNameError(input: string, children: readonly { data: { basename: string } }[]): string | undefined {
  const name = input.trim();
  if (!name) return "Enter a collection name.";
  if (name === "." || name === ".." || /[\/\\"\u0000-\u001f\u007f]/.test(name)) return "Choose a name without slashes, quotes or path shortcuts.";
  const sibling = children.find(child => child.data.basename.trim().toLowerCase() === name.toLowerCase())?.data.basename;
  if (sibling === undefined) return;
  const leading = sibling !== sibling.trimStart(), trailing = sibling !== sibling.trimEnd();
  const spaces = leading && trailing ? " with leading and trailing spaces" : leading ? " with a leading space" : trailing ? " with a trailing space" : "";
  return `“${sibling.trim()}” already exists here${spaces}. Choose a different name.`;
}