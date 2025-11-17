export type FactAliasMap = Map<string, string>;

const normalizeAliasKey = (key: string): string =>
  key.trim().toLowerCase();

export const resolveAliasKey = (aliases: FactAliasMap, key: string): string => {
  const normalized = normalizeAliasKey(key);
  if (!normalized) {
    return key;
  }
  return aliases.get(normalized) ?? key;
};

export const registerAliasKey = (
  aliases: FactAliasMap,
  aliasKey: string,
  canonicalKey: string
): void => {
  const alias = normalizeAliasKey(aliasKey);
  const canonical = canonicalKey.trim();
  if (!alias || !canonical) {
    return;
  }
  if (alias === normalizeAliasKey(canonical)) {
    return;
  }
  aliases.set(alias, canonical);
};

