console.log("AI Auto Prompter: Content script loaded!");

// Function to dynamically find the text area (input box)
function findInputBox() {
    const selectors = [
        '#prompt-textarea',           // ChatGPT specific
        'div.ProseMirror',            // Common rich text
        'textarea[data-id="root"]',
        'textarea[placeholder*="message" i]', 
        'textarea[placeholder*="ask" i]',
        'div[contenteditable="true"]', // some sites use contenteditable div
        'textarea' // fallback
    ];
    for (let selector of selectors) {
        const els = document.querySelectorAll(selector);
        for (let el of els) {
            // Check if element is reasonably visible
            if (el.clientHeight > 0 || el.offsetParent !== null) return el;
        }
    }
    return null;
}

// Function to dynamically find the send button
function findSendButton() {
    const selectors = [
        'button[data-testid="send-button"]', // ChatGPT
        'button[aria-label*="end message" i]', // Gemini
        'button[aria-label*="Send message" i]', // Gemini alternate
        'button[aria-label*="send" i]',
        'button .icon-send',
        'button[id*="send"]',
        'button[type="submit"]',
        'div[aria-label*="send" i][role="button"]'
    ];
    for (let selector of selectors) {
        const els = document.querySelectorAll(selector);
        for (let el of els) {
            if (el.clientHeight > 0 || el.offsetParent !== null) return el;
        }
    }
    return null;
}

// Optimize the user's prompt by smartly adapting rules based on the input text
function optimizePrompt(originalPrompt) {
    if (!originalPrompt || !originalPrompt.trim()) return originalPrompt;
    if (originalPrompt.includes("STRICT OUTPUT RULES:")) return originalPrompt;

    let lowerPrompt = originalPrompt.toLowerCase();
    let rules = `\n\nSTRICT OUTPUT RULES:\n- Provide a moderately detailed response.`;

    // Dynamically adjust rules based on what the user is asking for
    if (lowerPrompt.includes("code") || lowerPrompt.includes("function") || lowerPrompt.includes("script") || lowerPrompt.includes("html") || lowerPrompt.includes("python")) {
        rules += `\n- Output clean, highly optimized, and well-commented code blocks.`;
        rules += `\n- Briefly explain the logic used in bullet points below the code.`;
    } 
    else if (lowerPrompt.includes("write") || lowerPrompt.includes("email") || lowerPrompt.includes("essay") || lowerPrompt.includes("story") || lowerPrompt.includes("letter")) {
        rules += `\n- Maintain a highly professional, natural, and engaging tone.`;
        rules += `\n- Do NOT use bullet points format; output standard paragraph formatting.`;
        rules += `\n- Pay strict attention to perfect grammar, flow, and vocabulary.`;
    } 
    else if (lowerPrompt.includes("explain") || lowerPrompt.includes("what is") || lowerPrompt.includes("how to") || lowerPrompt.includes("why")) {
        rules += `\n- Break down the explanation step-by-step using structured bullet points.`;
        rules += `\n- Use an easy-to-understand analogy if it helps clarify complex concepts.`;
        rules += `\n- Ensure the explanation is clear and provides sufficient information without being entirely brief.`;
    } 
    else {
        // Fallback for general questions
        rules += `\n- Use structured bullet points.`;
        rules += `\n- Ensure the explanation is clear and provides sufficient information without being entirely brief.`;
    }

    return `${originalPrompt.trim()}${rules}`;
}

// Set text into textarea/contenteditable properly (compatible with React & Prosemirror)
function setInputValue(element, text) {
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(element, text);
        } else {
            element.value = text;
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (element.hasAttribute('contenteditable')) {
        element.focus();
        // Modern approach to replace contenteditable safely in React handlers
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, text);
    }
}

// State tracking
let isExtensionEnabled = true;
let isMonitoringResponse = false;
let responseTimeoutId = null;
let lastInputLength = 0;
let observationActive = false;
let isInterceptorSetup = false;

// Typing indicator state
let typingTimer;
const typingDelay = 6000; // Wait 6 seconds after typing stops
let originalUserText = "";
let currentEnhancedText = "";
let activeInputBox = null;
let isWaitingForDecision = false;
let discardedText = "";
let uiRepositionInterval;

// Sync extension state
chrome.storage.local.get(['enabled'], (result) => {
    if (result.enabled !== false) {
        isExtensionEnabled = true;
    } else {
        isExtensionEnabled = false;
    }
});
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.enabled) {
        isExtensionEnabled = changes.enabled.newValue;
    }
});

// Setup Idle Monitor for Input
function setupTypingMonitor() {
    document.addEventListener('input', (e) => {
        if (!isExtensionEnabled) return;

        const inputBox = findInputBox();
        if (!inputBox) return;

        // Ensure the input came from our observed textbox or inside it
        if (e.target !== inputBox && !inputBox.contains(e.target)) return;

        // If user manually types after enhancement, clear UI decision modal
        if (isWaitingForDecision) {
            removeDecisionUI();
            isWaitingForDecision = false;
        }

        clearTimeout(typingTimer);
        
        let content = inputBox.value !== undefined ? inputBox.value : inputBox.innerText;
        if (!content || content.trim() === '') return;
        if (content.includes("STRICT OUTPUT RULES:")) return; 
        if (content === discardedText) return; // Don't trigger if they just discarded this exact prompt!

        discardedText = ""; // Reset discarded text on new typing
        originalUserText = content;
        activeInputBox = inputBox;
        
        // Start 5 second timer
        typingTimer = setTimeout(triggerEnhancement, typingDelay);
    }, true);
}

// Trigger Enhancement logic
function triggerEnhancement() {
    if (!activeInputBox || !originalUserText || originalUserText.trim() === '') return;
    
    let currentContent = activeInputBox.value !== undefined ? activeInputBox.value : activeInputBox.innerText;
    if (currentContent !== originalUserText) return; // Something changed while waiting
    if (currentContent.includes("STRICT OUTPUT RULES:")) return; 

    currentEnhancedText = optimizePrompt(originalUserText);
    setInputValue(activeInputBox, currentEnhancedText);
    
    isWaitingForDecision = true;
    showDecisionUI(activeInputBox);
}

// Shows Keep/Discard UI Options
function showDecisionUI(inputBox) {
    removeDecisionUI();

    const uiContainer = document.createElement('div');
    uiContainer.id = "ai-prompter-decision-ui";
    uiContainer.style.position = "absolute";
    uiContainer.style.zIndex = "999999";
    uiContainer.style.background = "#fff";
    uiContainer.style.border = "1px solid #ccc";
    uiContainer.style.padding = "6px 12px";
    uiContainer.style.borderRadius = "8px";
    uiContainer.style.boxShadow = "0 4px 10px rgba(0,0,0,0.15)";
    uiContainer.style.display = "flex";
    uiContainer.style.gap = "10px";
    uiContainer.style.fontFamily = "Arial, sans-serif";
    uiContainer.style.fontSize = "13px";
    uiContainer.style.alignItems = "center";

    const label = document.createElement('span');
    label.innerText = "✨ Prompt Enhanced!";
    label.style.fontWeight = "bold";
    label.style.color = "#2196F3";
    uiContainer.appendChild(label);

    const keepBtn = document.createElement('button');
    keepBtn.innerText = "Keep";
    keepBtn.style.cursor = "pointer";
    keepBtn.style.background = "#4CAF50";
    keepBtn.style.color = "white";
    keepBtn.style.border = "none";
    keepBtn.style.padding = "5px 12px";
    keepBtn.style.borderRadius = "6px";
    keepBtn.style.fontWeight = "bold";
    keepBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeDecisionUI();
        isWaitingForDecision = false;
    };
    uiContainer.appendChild(keepBtn);

    const discardBtn = document.createElement('button');
    discardBtn.innerText = "Discard";
    discardBtn.style.cursor = "pointer";
    discardBtn.style.background = "#f44336";
    discardBtn.style.color = "white";
    discardBtn.style.border = "none";
    discardBtn.style.padding = "5px 12px";
    discardBtn.style.borderRadius = "6px";
    discardBtn.style.fontWeight = "bold";
    discardBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        discardedText = originalUserText; // Save it so we don't trigger again for this same string
        setInputValue(activeInputBox, originalUserText);
        
        removeDecisionUI();
        isWaitingForDecision = false;
    };
    uiContainer.appendChild(discardBtn);

    document.body.appendChild(uiContainer);

    // Dynamic repositining loop ensures UI flows with scrolling parent or window size changes
    function updatePos() {
        if (!inputBox || !inputBox.offsetParent || !document.body.contains(inputBox)) {
            removeDecisionUI();
            return;
        }
        const rect = inputBox.getBoundingClientRect();
        uiContainer.style.top = (rect.top + window.scrollY - 45) + "px";
        uiContainer.style.left = (rect.left + window.scrollX) + "px";
    }
    updatePos();
    uiRepositionInterval = setInterval(updatePos, 200);
}

// Remove the UI options
function removeDecisionUI() {
    const uiContainer = document.getElementById('ai-prompter-decision-ui');
    if (uiContainer) uiContainer.remove();
    clearInterval(uiRepositionInterval);
}

// Intercept form submissions or send button clicks simply to notify monitoring
function setupSendInterceptor() {
    if (isInterceptorSetup) return;
    isInterceptorSetup = true;

    // Detect Enter key
    document.addEventListener('keydown', (e) => {
        if (e.isTrusted === false) return; // Ignore programmatic events 
        if (e.key === 'Enter' && !e.shiftKey) {
            const inputBox = findInputBox();
            if (inputBox && (document.activeElement === inputBox || inputBox.contains(document.activeElement))) {
                if (!isExtensionEnabled) return;
                
                if (isWaitingForDecision) {
                    removeDecisionUI();
                    isWaitingForDecision = false;
                }

                clearTimeout(typingTimer); // Stop enhancement timer if user sent the message directly

                startResponseMonitoring();
            }
        }
    }, true);

    // Detect Send Button click
    document.addEventListener('click', (e) => { 
        if (e.isTrusted === false) return; // Ignore programmatic clicks
        let target = e.target.closest('button, div[role="button"]');
        if (!target) return;
        
        const sendBtn = findSendButton();
        if (target === sendBtn || (sendBtn && sendBtn.contains(target))) {
            if (!isExtensionEnabled) return;

            if (isWaitingForDecision) {
                removeDecisionUI();
                isWaitingForDecision = false;
            }

            clearTimeout(typingTimer); // Stop enhancement timer if user sent the message directly

            startResponseMonitoring();
        }
    }, true);
}


function startResponseMonitoring() {
    isMonitoringResponse = true;
    lastInputLength = 0;
    
    if (responseTimeoutId) clearTimeout(responseTimeoutId);

    // 15 seconds without activity = AI is too slow / stopped
    responseTimeoutId = setTimeout(() => {
        if (isMonitoringResponse) {
            console.log("AI Auto Prompter: AI is too slow! Triggering automatic retry...");
            triggerRetry();
        }
    }, 15000); 

    if (!observationActive) {
        observeResponses();
        observationActive = true;
    }
}

function triggerRetry() {
    isMonitoringResponse = false;
    
    // Find regenerate button and click it
    const regenerateBtn = document.querySelector('button[aria-label*="regenerate" i], button[aria-label*="Regenerate" i], .regenerate, button[data-testid="regenerate"]');
    if (regenerateBtn) {
        regenerateBtn.click();
        startResponseMonitoring();
    } else {
        const inputBox = findInputBox();
        const sendBtn = findSendButton();
        if (inputBox && sendBtn) {
            setInputValue(inputBox, "Previous response failed or was too slow. Please retry and remember STRICT OUTPUT RULES.");
            setTimeout(() => sendBtn.click(), 500);
            startResponseMonitoring();
        }
    }
}

// Observe the chat container for new text being generated by AI
function observeResponses() {
    const observer = new MutationObserver((mutations) => {
        if (!isMonitoringResponse) return;

        // Any activity resets the 'slow response' timer
        if (responseTimeoutId) clearTimeout(responseTimeoutId);
        responseTimeoutId = setTimeout(() => {
            if (isMonitoringResponse) {
                console.log("AI Auto Prompter: Response stopped generating unexpectedly! Triggering retry...");
                triggerRetry();
            }
        }, 15000);

        const messages = document.querySelectorAll('.message, [data-message-author-role="assistant"], .model-response-text, .markdown');
        if (messages.length === 0) return;
        
        const latestMessage = messages[messages.length - 1];
        const textContent = latestMessage.innerText || "";
        
        // Check if response is getting too long (e.g. > 1000 characters logic checks)
        if (textContent.length > 2000 && textContent.length > lastInputLength + 200) {
            console.log("AI Auto Prompter: Response too long! Sending correction prompt...");
            isMonitoringResponse = false;
            
            const stopBtn = document.querySelector('button[aria-label*="stop" i], button[data-testid="stop-button"]');
            if (stopBtn) stopBtn.click();
            
            setTimeout(sendCorrectionPrompt, 1500);
        }
        
        lastInputLength = textContent.length;
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

function sendCorrectionPrompt() {
    const inputBox = findInputBox();
    const sendBtn = findSendButton();
    if (inputBox && sendBtn) {
        setInputValue(inputBox, "Your response was slightly too long or off-topic. Please refine it and ensure it is in formatted bullet points.");
        setTimeout(() => sendBtn.click(), 500);
    }
}

// Initialize
setTimeout(() => {
    setupSendInterceptor();
    setupTypingMonitor();
}, 1000);

// Single Page App support
let oldHref = document.location.href;
var bodyObserver = new MutationObserver(function() {
    if (oldHref != document.location.href) {
        oldHref = document.location.href;
        setTimeout(() => {
            setupSendInterceptor();
            setupTypingMonitor();
        }, 1000);
    }
});
bodyObserver.observe(document.body, { childList: true, subtree: true });
