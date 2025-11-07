// server.js (CommonJS, no "type": "module" needed)
const express = require("express");
const Stripe = require("stripe");
const fetch = require("node-fetch"); // v2 is fine
const fs = require("fs");

const app = express();

/* 🔐 FILL THESE BEFORE STARTING THE SERVER (DO NOT SHARE) */
const STRIPE_SECRET_KEY = "";           // From Stripe Dashboard (Secret key)
const ENDPOINT_SECRET   = "stripe listen";        // From `stripe listen` output (NOT dashboard unless you use ngrok)
const DISCORD_WEBHOOK   = "https://discord.com/api/webhooks/xxx/yyy";

const stripe = new Stripe(STRIPE_SECRET_KEY);

// ⚠️ IMPORTANT: raw body ONLY on the webhook route (required for signature verification)
app.post("/stripe-webhook", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, ENDPOINT_SECRET);
  } catch (err) {
    console.log("❌ Invalid signature:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle successful payment
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email   = session.customer_details?.email;
    const product = session.metadata?.product;
    const steamId = session.metadata?.steamId;

    console.log(`✅ PAYMENT: ${email} bought ${product} (steamId: ${steamId || "none"})`);

    // 1) Discord log
    fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `✅ **Purchase**\nEmail: ${email}\nProduct: ${product}\nSteamID: ${steamId || "n/a"}`
      })
    }).catch(e => console.log("Discord webhook error:", e.message));

    // 2) Whitelist
    if (steamId) {
      fs.appendFile("whitelist.txt", `${steamId}\n`, err => {
        if (err) console.log("whitelist write error:", err.message);
      });
    }

    // 3) Reserved slot list for vip / reserved-slot
    if (steamId && (product === "vip" || product === "reserved-slot")) {
      fs.appendFile("reserved.txt", `${steamId}\n`, err => {
        if (err) console.log("reserved write error:", err.message);
      });
    }
  }

  res.sendStatus(200);
});

// Simple health check (optional)
app.get("/health", (_req, res) => res.send("OK"));

const PORT = 8787;
app.listen(PORT, () => console.log(`✅ Webhook listening on http://localhost:${PORT}/stripe-webhook`));

