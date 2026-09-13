"use strict";
(() => {
  // extension/src/options.ts
  var $ = (id) => document.getElementById(id);
  var KEYS = ["githubToken", "openrouterKey", "model", "repos", "capabilities", "paused"];
  async function restore() {
    const s = await chrome.storage.local.get([...KEYS]);
    $("gh").value = s.githubToken ?? "";
    $("or").value = s.openrouterKey ?? "";
    $("model").value = s.model ?? "openai/gpt-4o-mini";
    $("repos").value = (s.repos ?? []).join(", ");
    const caps = s.capabilities ?? [];
    $("cap-comment").checked = caps.includes("comment");
    $("cap-transition").checked = caps.includes("transition");
    $("paused").checked = Boolean(s.paused);
  }
  async function save() {
    const capabilities = [
      ...$("cap-comment").checked ? ["comment"] : [],
      ...$("cap-transition").checked ? ["transition"] : []
    ];
    await chrome.storage.local.set({
      githubToken: $("gh").value.trim(),
      openrouterKey: $("or").value.trim(),
      model: $("model").value.trim() || "openai/gpt-4o-mini",
      repos: $("repos").value.split(",").map((r) => r.trim()).filter(Boolean),
      capabilities,
      paused: $("paused").checked
    });
    const badge = document.getElementById("saved");
    badge.classList.add("on");
    setTimeout(() => badge.classList.remove("on"), 1200);
  }
  document.getElementById("save").addEventListener("click", () => void save());
  void restore();
})();
