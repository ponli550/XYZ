"use strict";
(() => {
  // extension/src/options.ts
  var $ = (id) => document.getElementById(id);
  var KEYS = [
    "githubToken",
    "openrouterKey",
    "exaKey",
    "model",
    "repos",
    "capabilities",
    "paused"
  ];
  async function restore() {
    const s = await chrome.storage.local.get([...KEYS]);
    $("gh").value = s.githubToken ?? "";
    $("or").value = s.openrouterKey ?? "";
    $("exa").value = s.exaKey ?? "";
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
      exaKey: $("exa").value.trim(),
      model: $("model").value.trim() || "openai/gpt-4o-mini",
      repos: $("repos").value.split(",").map((r) => r.trim()).filter(Boolean),
      capabilities,
      paused: $("paused").checked
    });
    const badge = document.getElementById("saved");
    badge.classList.add("on");
    setTimeout(() => badge.classList.remove("on"), 1200);
  }
  async function reset() {
    await chrome.storage.local.remove(
      ["escalations", "notified", "auditLog", "counter", "heartbeat", "degraded", "budget", "viewing"]
    );
    const badge = document.getElementById("saved");
    badge.textContent = "reset";
    badge.classList.add("on");
    setTimeout(() => {
      badge.classList.remove("on");
      badge.textContent = "saved";
    }, 1400);
  }
  document.getElementById("save").addEventListener("click", () => void save());
  document.getElementById("reset").addEventListener("click", () => void reset());
  void restore();
})();
