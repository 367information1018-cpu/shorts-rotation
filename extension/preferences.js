"use strict";

function watchRotationPreferences(apply) {
  const defaults = { enabled: true, keepRotation: false, videoSize: 100, toolbarSize: 100 };
  const values = {};
  let loaded = false;

  chrome.storage.local.onChanged.addListener((changes) => {
    for (const key of Object.keys(defaults)) {
      if (key in changes) values[key] = changes[key].newValue ?? defaults[key];
    }
    if (loaded) apply({ ...values });
  });

  return chrome.storage.local.get(defaults).then((stored) => {
    // A change can arrive while the initial read is pending.
    Object.assign(values, { ...stored, ...values });
    loaded = true;
    apply({ ...values });
  });
}
