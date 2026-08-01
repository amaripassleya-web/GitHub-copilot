(function() {
  var assistantName = "Mindustry Copilot";
  var quickTips = [
    "Start by mining copper and lead, then expand once you have steady power.",
    "Use conveyors early and automate production before you scale up.",
    "Defend your core with turrets and walls as soon as enemy pressure appears.",
    "Late game is about scaling production and protecting your economy."
  ];

  function notify(message) {
    if (typeof Vars !== "undefined" && Vars && Vars.ui && typeof Vars.ui.showInfoToast === "function") {
      Vars.ui.showInfoToast(message);
    } else if (typeof print !== "undefined") {
      print(message);
    }
  }

  function respondTo(question) {
    var q = (question || "").toLowerCase().trim();

    if (!q) {
      return "Ask me about starting a base, power, defenses, automation, or late-game strategy.";
    }

    if (q.indexOf("start") !== -1 || q.indexOf("starter") !== -1 || q.indexOf("begin") !== -1) {
      return "Begin by mining copper and lead, building a small drill line, and setting up basic power. Expand only after your production can support it.";
    }

    if (q.indexOf("power") !== -1 || q.indexOf("energy") !== -1) {
      return "Use simple generators first, then upgrade to more stable power as your base grows. Stable power keeps drills, factories, and defenses running.";
    }

    if (q.indexOf("defense") !== -1 || q.indexOf("turret") !== -1 || q.indexOf("enemy") !== -1) {
      return "Place turrets around the core, add walls when pressure rises, and always keep backup production in case defenses fail.";
    }

    if (q.indexOf("automation") !== -1 || q.indexOf("conveyor") !== -1 || q.indexOf("router") !== -1) {
      return "Automate by chaining drills into conveyors, then add routers and sorters so items flow efficiently without constant attention.";
    }

    if (q.indexOf("late") !== -1 || q.indexOf("endgame") !== -1) {
      return "Late-game success comes from scaling production, protecting your economy, and using strong defenses or units to hold key areas.";
    }

    if (q.indexOf("tip") !== -1 || q.indexOf("help") !== -1) {
      return "Try asking: 'How do I start?', 'How do I make power?', or 'How do I defend my base?'";
    }

    return "I can help with starter setups, power, defenses, automation, and late-game planning. Try a short question like 'How do I start?' or 'Best defense strategy?'";
  }

  function makeDialog() {
    if (typeof BaseDialog === "undefined" || typeof TextField === "undefined") {
      throw new Error("This build of Mindustry does not expose the expected UI classes.");
    }

    var dialog = new BaseDialog(assistantName);
    dialog.cont.defaults().pad(4).left();

    dialog.cont.labelWrap("Ask for help with Mindustry basics or strategy.").width(360).padBottom(6).row();

    var input = new TextField();
    input.setMessageText("Ask a question...");
    dialog.cont.add(input).width(280).padBottom(6).row();

    dialog.cont.table(function(t) {
      t.button("Ask", function() {
        var text = input.getText();
        dialog.cont.labelWrap(respondTo(text)).width(360).padTop(8).row();
      }).size(80, 40).padRight(4);

      t.button("Tip", function() {
        var tip = quickTips[Math.floor(Math.random() * quickTips.length)];
        dialog.cont.labelWrap(tip).width(360).padTop(8).row();
      }).size(80, 40).padRight(4);

      t.button("Close", function() {
        dialog.hide();
      }).size(80, 40);
    }).padTop(4);

    dialog.cont.row();
    dialog.cont.labelWrap("Examples: start, power, defense, automation, late game.").width(360).padTop(8);

    return dialog;
  }

  function openAssistant() {
    try {
      var dialog = makeDialog();
      dialog.show();
    } catch (error) {
      notify("Mindustry Copilot loaded. Check the script for custom responses.");
      if (typeof print !== "undefined") {
        print(error);
      }
    }
  }

  if (typeof Events !== "undefined" && typeof EventType !== "undefined") {
    Events.on(EventType.ClientLoadEvent, function() {
      openAssistant();
    });
  } else if (typeof print !== "undefined") {
    print("Mindustry Copilot is ready to load inside a Mindustry client.");
  }
})();
