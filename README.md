# AI Auto Prompter Extension

AI Auto Prompter is a smart, beginner-friendly Chrome extension designed to automatically enhance your prompts on AI conversational platforms like ChatGPT and Google Gemini. 

It silently works alongside your typing and effortlessly gives your prompts professional formatting to get the best out of any AI.

## 🌟 Features

- **Delay-Based Auto Enhancement**: Stop typing for 6 seconds, and the extension will analyze your prompt and attach STRICT OUTPUT RULES perfectly tailored to what you're asking.
- **Easy Review UI**: When your prompt is enhanced, a lightweight pop-up ("Keep" or "Discard") appears giving you full control over whether to use the AI-generated rules or stick to your original text.
- **Context-Aware Rules**: 
  - Asking for code? It enforces well-commented blocks and bullet-point logic explanations.
  - Writing an essay? It enforces a natural tone and paragraph formats.
  - General queries? It ensures structured, easy-to-read bullet points.
- **Time-out Detection / Retry Monitor**: Ensures your AI isn't slacking! If an AI stops generating or hangs for more than 15 seconds without activity, it automatically forces a retry for you.
- **Manual Bypass**: Hit send immediately before the 6-second timer without waiting, and the extension will not interfere at all.

## 🛠️ Installation

Because this is a bespoke local extension, you can easily load it into Chrome in developer mode:

1. Download or clone this repository to your computer.
2. Open Google Chrome and type `chrome://extensions/` in the URL bar.
3. Toggle the **Developer mode** switch in the top-right corner.
4. Click on the **Load unpacked** button in the top-left corner.
5. Select the folder containing `manifest.json` (this repository).
6. The extension is now installed! You can visit ChatGPT, Gemini, or other AI chats to use it.

## ⚙️ How it Works

The extension mainly operates inside `content.js`, attaching a listener to your input interactions. It uses a dynamic rule injector. A fully autonomous background script (`background.js`) keeps the extension active.

### Tech Stack
- HTML, CSS (Vanilla)
- Vanilla JS
- Manifest V3

## 🤝 Contributing
Feel free to fork this project, open a pull request, or submit issues if you find any bugs or have feature requests!
