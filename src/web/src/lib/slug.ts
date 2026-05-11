export function deriveSlug(name: string): string {
  const normalised = name
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip combining marks (transliterate accents)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalised.length === 0 ? "org" : normalised;
}
