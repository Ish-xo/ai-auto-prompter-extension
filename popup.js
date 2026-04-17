document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('toggle');
    const statusText = document.getElementById('status');

    // Load saved state
    chrome.storage.local.get(['enabled'], (result) => {
        const isEnabled = result.enabled !== false; // Default to true
        toggle.checked = isEnabled;
        updateStatus(isEnabled);
    });

    // Listen for toggle changes
    toggle.addEventListener('change', () => {
        const isEnabled = toggle.checked;
        chrome.storage.local.set({ enabled: isEnabled });
        updateStatus(isEnabled);
    });

    // Update text and color
    function updateStatus(isEnabled) {
        statusText.textContent = isEnabled ? 'Enabled' : 'Disabled';
        statusText.style.color = isEnabled ? '#2196F3' : '#777';
    }
});
