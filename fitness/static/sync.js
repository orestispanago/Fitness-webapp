// Sync button in the nav; loaded from base.html.

// Disabled while the sync runs, so a second click can't start another
function disableSyncButton(event) {
  event.target.querySelector("button").disabled = true;
}

document.querySelector(".sync-form").addEventListener("submit", disableSyncButton);
