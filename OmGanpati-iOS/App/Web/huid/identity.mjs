export function readHuid(raw) {
  const value = raw.trim().replace(/[a-z]/g, letter => letter.toUpperCase());
  if (!value) return { value, state: "empty", error: "" };
  if (!/^[A-Z0-9]{6}$/.test(value)) {
    return { value, state: "invalid", error: "Enter exactly 6 letters or digits (A–Z, 0–9)." };
  }
  return { value, state: "formatted", error: "" };
}

export function nameError(name) {
  if (!name.trim()) return "Enter the item name in the calculator to create a tag.";
  if (name.trim().length > 22 || /[\x00-\x1f\x7f]/.test(name)) return "Use an item name of up to 22 characters.";
  return "";
}

export function identityForTag(name, rawHuid) {
  const error = nameError(name);
  if (error) throw Object.assign(new Error(error), { field: "item-name" });
  const huid = readHuid(rawHuid);
  if (huid.error) throw Object.assign(new Error(huid.error), { field: "huid" });
  return { name: name.trim(), huid: huid.value };
}

// Keep complete candidates and let the user check ambiguous engraved characters.
export function huidCandidates(text) {
  const lines = text.toUpperCase().split(/\r?\n/);
  const candidates = [];
  for (const rawLine of lines) {
    const line = rawLine.replace(/^\s*HUID\s*[:=-]?\s*/, "");
    const words = line.match(/[A-Z0-9]+/g) || [];
    for (const word of words) {
      if (word.length === 6 && !/^\d\dK\d{3}$/.test(word)) candidates.push(word);
    }
    const compact = line.replace(/\s/g, "");
    if (/^[A-Z0-9]{6}$/.test(compact) && !/^\d\dK\d{3}$/.test(compact)) candidates.push(compact);
  }
  return [...new Set(candidates)].slice(0, 8);
}
