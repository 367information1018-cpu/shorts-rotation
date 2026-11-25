"use strict";

const form = document.querySelector("#preferences");
const enabled = document.querySelector("#enabled");
const keepRotation = document.querySelector("#keep-rotation");
const sizeInputs = form.querySelectorAll('input[type="range"]');
const statusMessage = document.querySelector("#status");
let preferences;

function updateSizeLabel(input) {
  const label = `${input.value}%`;
  input.setAttribute("aria-valuetext", label);
  input.parentElement.querySelector("output").value = label;
}

function render(updated) {
  preferences = updated;
  enabled.checked = updated.enabled;
  enabled.disabled = false;
  keepRotation.checked = updated.keepRotation;
  keepRotation.disabled = !updated.enabled;
  for (const input of sizeInputs) {
    input.value = updated[input.name];
    input.disabled = !updated.enabled;
    updateSizeLabel(input);
  }
}

function showError(message) {
  statusMessage.textContent = message;
  statusMessage.hidden = false;
}

form.addEventListener("input", ({ target }) => {
  if (target.type === "range") updateSizeLabel(target);
});

form.addEventListener("change", async ({ target }) => {
  if (target === enabled) {
    keepRotation.disabled = !enabled.checked;
    for (const input of sizeInputs) input.disabled = !enabled.checked;
  }

  try {
    const value = target.type === "range" ? target.valueAsNumber : target.checked;
    await chrome.storage.local.set({ [target.name]: value });
    statusMessage.hidden = true;
  } catch {
    render(preferences);
    showError("설정을 저장하지 못했습니다. 다시 시도해 주세요.");
  }
});

watchRotationPreferences(render).catch(() => showError("설정을 불러오지 못했습니다. 팝업을 다시 열어 주세요."));
