// Background service worker
chrome.runtime.onInstalled.addListener(() => {
    console.log("AI Auto Prompter Extension Installed.");
    // Set default state to enabled
    chrome.storage.local.set({ enabled: true });
});
