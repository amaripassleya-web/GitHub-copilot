// Mindustry Copilot chat UI
// NOTE: Do NOT commit real tokens to your repository. This script persists endpoint/token
// to Core.settings on the local machine only.

Events.on(ClientLoadEvent, () => {
    // Create the Copilot Dialog Window
    let dialog = new BaseDialog("GitHub Copilot");
    let conversationHistory = "";

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

    // Link toggle button (safe UI primitive)
    content.table(table => {
        table.defaults().pad(4);
        let linkBtn = table.button("Link: OFF", () => {
            linkEnabled = !linkEnabled;
            updateLinkButtonText(linkBtn);
        }).width(120).get();

        // Endpoint field (compact)
        table.add("Endpoint:").left();
        let endpointField = table.field(assistantEndpoint, v => { 
            assistantEndpoint = v.trim();
            if (Core.settings && Core.settings.put) Core.settings.put("copilot.endpoint", assistantEndpoint);
        }).width(260).get();
    }).left();

    content.row();

    // Token input (configurable so users can point to any assistant/proxy)
    content.table(table => {
        table.defaults().pad(4);
        table.add("Token:").left();
        let tokenField = table.field(assistantToken, v => { 
            assistantToken = v;
            if (Core.settings && Core.settings.put) Core.settings.put("copilot.token", assistantToken);
        }).width(420).get();
    }).left();

    content.row();

    // Send and Test Buttons
    content.table(table => {
        table.defaults().pad(4);

        table.button("Ask", () => {
            let question = inputField.text.trim();
            if (question.length == 0) return;

            // Optionally include game context when Link is ON
            let finalPrompt = question;
            if (linkEnabled) {
                finalPrompt = getGameContext() + "\n\nPlayer question: " + question;
            }

            conversationHistory += "\n\n[accent]You:[] " + question;
            chatLabel.setText(conversationHistory + "\n\n[cyan]GitHub Copilot:[] Thinking...");
            inputField.setText("");

            queryAssistant(finalPrompt, assistantEndpoint, assistantToken, (reply) => {
                conversationHistory += "\n\n[cyan]GitHub Copilot:[] " + reply;
                chatLabel.setText(conversationHistory);
            });
        }).width(80);

        table.button("Test", () => {
            // Quick connectivity test -- small friendly prompt
            let prompt = "Ping. Please reply with a short confirmation.";
            chatLabel.setText(conversationHistory + "\n\n[cyan]GitHub Copilot:[] Testing endpoint...");
            queryAssistant(prompt, assistantEndpoint, assistantToken, (reply) => {
                conversationHistory += "\n\n[cyan]GitHub Copilot:[] Test result: " + reply;
                chatLabel.setText(conversationHistory);
            });
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
                // Fallback: show link in chat
                conversationHistory += "\n\n[accent]Link:[] https://github.com/features/copilot";
                chatLabel.setText(conversationHistory);
            }
        }).width(140);

        table.button("Open Mindustry", () => {
            try {
                Core.app.openURI("https://github.com/Anuken/Mindustry");
            } catch (e) {
                // Fallback: show link in chat
                conversationHistory += "\n\n[accent]Link:[] https://github.com/Anuken/Mindustry";
                chatLabel.setText(conversationHistory);
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
});

function getGameContext() {
    // Best-effort gather of game context (safe: don't throw if properties missing)
    try {
        let parts = [];
        // Map / sector
        try {
            if (Vars.world && Vars.world.map) {
                parts.push("Map: " + (Vars.world.map.name || "unknown"));
            }
        } catch (e) {}

        // Player position / unit
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
        } catch (e) {}

        // Selected building (if any) from UI selection (safe checks)
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
        } catch (e) {}

        if (parts.length == 0) return "(No game context available)";
        return "[Mindustry context]\n" + parts.join("\n");
    } catch (e) {
        return "(Failed to collect game context)";
    }
}

function queryAssistant(prompt, endpoint, token, callback) {
    // Supports sending to any HTTP assistant-compatible endpoint that accepts a Chat Completions style payload.
    // This keeps the integration flexible: you can point endpoint to a small proxy that forwards to ChatGPT/OpenAI, Copilot, or another service.

    if (!endpoint || endpoint.length == 0) {
        callback("No assistant endpoint configured.");
        return;
    }

    // Build payload similar to common chat-completions APIs
    let payload = JSON.stringify({
        model: "gpt-4o",
        messages: [
            { role: "system", content: "You are an in-game assistant for Mindustry. Be concise and helpful." },
            { role: "user", content: prompt }
        ]
    });

    // Use Mindustry's Http helper
    try {
        let req = Http.post(endpoint, payload).header("Content-Type", "application/json");
        if (token && token.length) req.header("Authorization", "Bearer " + token);

        req.error(err => {
            callback("Error connecting to assistant endpoint. Check endpoint URL and token.\n" + err);
        }).submit(response => {
            try {
                let txt = response.getResultAsString();
                let json = null;
                try { json = JSON.parse(txt); } catch (e) { json = null; }

                // OpenAI-style ChatCompletions
                if (json && json.choices && json.choices.length > 0) {
                    let c0 = json.choices[0];
                    if (c0.message && c0.message.content) {
                        callback(c0.message.content);
                        return;
                    }
                    if (typeof c0.text === 'string') {
                        callback(c0.text);
                        return;
                    }
                }

                // Some proxies return { reply: "..." }
                if (json && typeof json.reply === 'string') {
                    callback(json.reply);
                    return;
                }

                // Fallback: raw body
                callback(txt || "(empty response)");
            } catch(e) {
                callback("Failed to read response from assistant endpoint.");
            }
        });
    } catch(e) {
        callback("Failed to send request to assistant endpoint: " + e);
    }
        }                
