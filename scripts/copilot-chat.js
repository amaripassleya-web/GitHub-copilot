// Mindustry Copilot chat UI — improved version
// NOTE: Do NOT commit real tokens to your repository. This script persists endpoint/token
// to Core.settings on the local machine only. Prefer using a server-side proxy that stores
// API keys safely and exposes a limited endpoint for the client to call.

Events.on(ClientLoadEvent, () => {
    const DEFAULT_MODEL = "gpt-4o";
    const DEFAULT_SYSTEM_PROMPT = "You are an in-game assistant for Mindustry. Be concise and helpful.";

    // UI / state
    let dialog = new BaseDialog("GitHub Copilot");
    let messages = []; // {role: "user"|"assistant"|"system"|"info", text: "..."}
    const MAX_HISTORY_MESSAGES = 80; // keep chat bounded
    let isRequestInFlight = false;

    dialog.addCloseButton();
    let content = dialog.cont;

    // Chat History Display
    let chatLabel = content.add("Connected to GitHub Copilot. Ask a question!").wrap().width(420).get();
    content.row();

    // Input Box
    let inputField = content.field("", text => {}).width(300).get();

    // Load persisted settings (empty by default)
    let assistantEndpoint = (Core.settings && Core.settings.getString) ? Core.settings.getString("copilot.endpoint", "") : "";
    let assistantToken = (Core.settings && Core.settings.getString) ? Core.settings.getString("copilot.token", "") : "";

    // Link toggle and assistant configuration
    let linkEnabled = false;

    // Small helper to show link state
    function updateLinkButtonText(btn) {
        btn.setText(linkEnabled ? "Link: ON" : "Link: OFF");
    }

    function setInfo(message) {
        appendMessage("info", message);
        renderMessages();
    }

    // Manage messages and truncation
    function appendMessage(role, text) {
        messages.push({ role, text });
        if (messages.length > MAX_HISTORY_MESSAGES) {
            messages = messages.slice(messages.length - MAX_HISTORY_MESSAGES);
        }
    }

    function renderMessages() {
        // Compose a colored/short markup used earlier
        let lines = messages.map(m => {
            switch (m.role) {
                case "user": return "[accent]You:[] " + m.text;
                case "assistant": return "[cyan]GitHub Copilot:[] " + m.text;
                case "info": return "[lightgray]" + m.text + "[]";
                default: return m.text;
            }
        });
        chatLabel.setText(lines.join("\n\n"));
    }

    // Basic endpoint validation
    function isLikelyUrl(s) {
        if (!s || s.length === 0) return false;
        // simple check to avoid accidental blanks
        return /^https?:\/\//i.test(s);
    }

    // Link toggle button (safe UI primitive) and endpoint field
    content.table(table => {
        table.defaults().pad(4);
        let linkBtn = table.button("Link: OFF", () => {
            linkEnabled = !linkEnabled;
            updateLinkButtonText(linkBtn);
        }).width(120).get();

        table.add("Endpoint:").left();
        let endpointField = table.field(assistantEndpoint, v => {
            assistantEndpoint = v.trim();
            if (Core.settings && Core.settings.put) Core.settings.put("copilot.endpoint", assistantEndpoint);
        }).width(260).get();
    }).left();

    content.row();

    // Token input + warning (user responsibility)
    content.table(table => {
        table.defaults().pad(4);
        table.add("Token (stored locally):").left();
        let tokenField = table.field(assistantToken, v => {
            assistantToken = v;
            if (Core.settings && Core.settings.put) Core.settings.put("copilot.token", assistantToken);
        }).width(420).get();
    }).left();

    content.row();

    // Buttons: Ask, Test, Clear
    content.table(table => {
        table.defaults().pad(4);

        let askBtn = table.button("Ask", () => {
            if (isRequestInFlight) return;
            let question = inputField.text.trim();
            if (question.length === 0) return;

            if (!isLikelyUrl(assistantEndpoint)) {
                setInfo("No valid endpoint configured. Please set an https:// endpoint.");
                return;
            }

            // Optionally include game context when Link is ON
            let finalPrompt = question;
            if (linkEnabled) {
                finalPrompt = getGameContext() + "\n\nPlayer question: " + question;
            }

            appendMessage("user", question);
            renderMessages();
            inputField.setText("");
            performQuery(finalPrompt);
        }).width(80);

        let testBtn = table.button("Test", () => {
            if (isRequestInFlight) return;
            let prompt = "Ping. Please reply with a short confirmation.";
            appendMessage("info", "Testing endpoint...");
            renderMessages();
            performQuery(prompt, true);
        }).width(80);

        table.button("Clear", () => {
            messages = [];
            renderMessages();
        }).width(80);

    }).left();

    // Quick link buttons for Copilot and Mindustry
    content.row();
    content.table(table => {
        table.defaults().pad(4);
        table.button("Open Copilot", () => {
            try {
                Core.app.openURI("https://github.com/features/copilot");
            } catch (e) {
                appendMessage("info", "https://github.com/features/copilot");
                renderMessages();
            }
        }).width(140);

        table.button("Open Mindustry", () => {
            try {
                Core.app.openURI("https://github.com/Anuken/Mindustry");
            } catch (e) {
                appendMessage("info", "https://github.com/Anuken/Mindustry");
                renderMessages();
            }
        }).width(140);
    }).left();

    // Add Copilot Button to top-right UI
    Vars.ui.hudGroup.fill(cons(table => {
        table.top().right();
        table.button("GitHub Copilot", () => {
            dialog.show();
        }).width(130).height(40).pad(10);
    }));

    // ----- Networking / query helpers -----

    // Wrap the existing callback-style API in a Promise so flow is easier to manage.
    function queryAssistantAsync(prompt, endpoint, token, model = DEFAULT_MODEL, systemPrompt = DEFAULT_SYSTEM_PROMPT) {
        return new Promise((resolve, reject) => {
            if (!endpoint || endpoint.length === 0) {
                reject(new Error("No assistant endpoint configured."));
                return;
            }

            // Build payload similar to common chat-completions APIs
            let payload = JSON.stringify({
                model: model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: prompt }
                ]
            });

            try {
                let req = Http.post(endpoint, payload).header("Content-Type", "application/json");
                if (token && token.length) req.header("Authorization", "Bearer " + token);

                req.error(err => {
                    // The .error callback receives a text error (string) in Mindustry API
                    reject(new Error("Error connecting to assistant endpoint. " + err));
                }).submit(response => {
                    try {
                        let txt = response.getResultAsString();
                        let json = null;
                        try { json = JSON.parse(txt); } catch (e) { json = null; }

                        // OpenAI-style ChatCompletions: { choices: [{ message: { content } }] }
                        if (json && json.choices && json.choices.length > 0) {
                            let c0 = json.choices[0];
                            if (c0.message && c0.message.content) {
                                resolve(c0.message.content);
                                return;
                            }
                            if (typeof c0.text === 'string') {
                                resolve(c0.text);
                                return;
                            }
                        }

                        // Some proxies return { reply: "..." } or { result: "..." }
                        if (json && typeof json.reply === 'string') {
                            resolve(json.reply);
                            return;
                        }
                        if (json && typeof json.result === 'string') {
                            resolve(json.result);
                            return;
                        }

                        // Fallback: raw body
                        resolve(txt || "(empty response)");
                    } catch (e) {
                        reject(new Error("Failed to read response from assistant endpoint."));
                    }
                });
            } catch (e) {
                reject(new Error("Failed to send request to assistant endpoint: " + e));
            }
        });
    }

    function performQuery(prompt, isTest = false) {
        isRequestInFlight = true;
        // small UI feedback
        appendMessage("info", "[...] waiting for assistant...");
        renderMessages();

        queryAssistantAsync(prompt, assistantEndpoint, assistantToken)
            .then(reply => {
                // Remove the last waiting info if present
                if (messages.length && messages[messages.length - 1].role === "info" && messages[messages.length - 1].text.indexOf("waiting for assistant") !== -1) {
                    messages.pop();
                }
                appendMessage("assistant", reply);
                renderMessages();
            })
            .catch(err => {
                if (messages.length && messages[messages.length - 1].role === "info" && messages[messages.length - 1].text.indexOf("waiting for assistant") !== -1) {
                    messages.pop();
                }
                appendMessage("info", "Error: " + (err && err.message ? err.message : String(err)));
                renderMessages();
            })
            .finally(() => {
                isRequestInFlight = false;
            });
    }

    // ----- Game context helper (unchanged behavior but defensive) -----
    function getGameContext() {
        try {
            let parts = [];
            try {
                if (Vars.world && Vars.world.map) {
                    parts.push("Map: " + (Vars.world.map.name || "unknown"));
                }
            } catch (e) { }

            try {
                if (Vars.player) {
                    let px = (Vars.player.x || (Vars.player.unit && Vars.player.unit() && Vars.player.unit().x) || "?");
                    let py = (Vars.player.y || (Vars.player.unit && Vars.player.unit() && Vars.player.unit().y) || "?");
                    parts.push("Player position: " + px + ", " + py);

                    let unit = (Vars.player.unit ? Vars.player.unit() : null);
                    if (unit) {
                        parts.push("Selected unit: " + (unit.type ? (unit.type.name || unit.type.__name || "unit") : "unit"));
                    }
                }
            } catch (e) { }

            try {
                let b = null;
                if (Vars.ui && Vars.ui.hudfrag && Vars.ui.hudfrag.selected) b = Vars.ui.hudfrag.selected;
                if (!b && Vars.player && Vars.player.unit) {
                    let u = Vars.player.unit();
                    if (u && u.build) b = u.build;
                }
                if (b && b.block) {
                    parts.push("Nearby building: " + (b.block.name || b.block.__name || "building"));
                }
            } catch (e) { }

            if (parts.length == 0) return "(No game context available)";
            return "[Mindustry context]\n" + parts.join("\n");
        } catch (e) {
            return "(Failed to collect game context)";
        }
    }
});
