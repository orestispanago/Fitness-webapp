// Sync button in the nav; loaded from base.html.

// Disabled while the sync runs, so a second click can't start another
function disableSyncButton(event) {
  const button = event.target.querySelector("button");
  button.disabled = true;
  button.textContent = "Syncing…";
}

document.querySelector(".sync-form").addEventListener("submit", disableSyncButton);
