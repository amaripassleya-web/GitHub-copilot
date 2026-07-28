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
    
    // Send Button
    content.button("Ask", () => {
        let question = inputField.text.trim();
        if (question.length == 0) return;

        conversationHistory += "\n\n[accent]You:[] " + question;
        chatLabel.setText(conversationHistory + "\n\n[cyan]GitHub Copilot:[] Thinking...");
        inputField.setText("");

        queryGitHubCopilot(question, (reply) => {
            conversationHistory += "\n\n[cyan]GitHub Copilot:[] " + reply;
            chatLabel.setText(conversationHistory);
        });
    }).width(80);

    // Add Copilot Button to top-right UI
    Vars.ui.hudGroup.fill(cons(table => {
        table.top().right();
        table.button("GitHub Copilot", () => {
            dialog.show();
        }).width(130).height(40).pad(10);
    }));
});

function queryGitHubCopilot(prompt, callback) {
    // GitHub Models / Copilot API Endpoint
    let endpoint = "https://models.inference.ai.azure.com/chat/completions";
    
    // Replace with your GitHub Token (e.g., github_pat_...)
    let githubToken = "YOUR_GITHUB_TOKEN_HERE";

    let payload = JSON.stringify({
        model: "gpt-4o", // Or "gpt-4o-mini"
        messages: [
            { 
                role: "system", 
                content: "You are GitHub Copilot assisting a player inside Mindustry. Give concise and helpful answers about Mindustry logic, schematics, defense strategies, and crafting." 
            },
            { role: "user", content: prompt }
        ]
    });

    Http.post(endpoint, payload)
        .header("Content-Type", "application/json")
        .header("Authorization", "Bearer " + githubToken)
        .error(err => {
            callback("Error linking to GitHub Copilot. Check your GitHub Token or connection.");
        })
        .submit(response => {
            try {
                let json = JSON.parse(response.getResultAsString());
                let answer = json.choices[0].message.content;
                callback(answer);
            } catch(e) {
                callback("Failed to read response from GitHub Copilot API.");
            }
        });
          }
          
