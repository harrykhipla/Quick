import { identityForTag, nameError, readHuid } from "./identity.mjs";
import { setupHuidReader } from "./reader.mjs";

const byId = id => document.getElementById(id);

export function setupIdentity() {
  const name = byId("item-name");
  const huid = byId("huid");
  let nameRequired = false;

  function refresh() {
    const error = nameRequired ? nameError(name.value) : "";
    byId("name-error").textContent = error;
    byId("name-field").classList.toggle("invalid", Boolean(error));
    name.setAttribute("aria-invalid", String(Boolean(error)));
    const result = readHuid(huid.value);
    byId("huid-error").textContent = result.error;
    byId("huid-field").classList.toggle("invalid", Boolean(result.error));
    huid.setAttribute("aria-invalid", String(Boolean(result.error)));
    huid.setCustomValidity(result.error);
  }
  name.addEventListener("input", refresh);
  huid.addEventListener("input", refresh);
  huid.addEventListener("blur", () => {
    huid.value = readHuid(huid.value).value;
    refresh();
  });
  setupHuidReader(value => {
    huid.value = value;
    huid.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return {
    forTag() {
      nameRequired = true;
      refresh();
      return identityForTag(name.value, huid.value);
    },
    load(item = {}) {
      name.value = item.name || "";
      huid.value = item.huid || "";
      nameRequired = false;
      refresh();
    }
  };
}
