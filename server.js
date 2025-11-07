// server.js (CommonJS)
const express = require("express");
const Stripe = require("stripe");
const fetch = require("node-fetch");
const fs = require("fs");
const dgram = require("dgram");

const app = express();

// ✅ Load secrets from Render environment variables
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;  // sk_test_... or sk_live_...
const ENDPOINT_SECRET   = whsec_xjjHESaT4BGVZadqzzuX3x8L8zgB8rRD;    // whsec_...
const DISCORD_WEBHOOK   = process.env.DISCORD_WEBHOOK;    // Discord webhook URL

const stripe = new Stripe(STRIPE_SECRET_KEY);

// ✅ Stripe webhook — MUST use raw body
app.post("/stripe-webhook", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, ENDPOINT_SECRET);
  } catch (err) {
    console.log("❌ Invalid Stripe signature:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email   = session.customer_details?.email;
    const product = session.metadata?.product;
    const steamId = session.metadata?.steamId;

    console.log(`✅ PAYMENT: ${email} bought ${product} (SteamID: ${steamId || "none"})`);

    // ✅ 1. Discord notification
    if (DISCORD_WEBHOOK) {
      fetch(DISCORD_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `✅ **Purchase Received**
Email: ${email}
Product: ${product}
SteamID: ${steamId || "n/a"}`
        })
      }).catch(err => console.log("Discord webhook error:", err.message));
    }

    // ✅ 2. Whitelist append
    if (steamId) {
      fs.appendFile("whitelist.txt", `${steamId}\n`, (err) => {
        if (err) console.log("Whitelist write error:", err.message);
      });
    }

    // ✅ 3. VIP + reserved slot
    if (steamId && (product === "vip" || product === "reserved-slot")) {
      fs.appendFile("reserved.txt", `${steamId}\n`, (err) => {
        if (err) console.log("Reserved write error:", err.message);
      });
    }
  }

  res.sendStatus(200);
});

// ✅ LIVE SERVER STATS
function queryDayZServer(ip, port = 27016) {
  return new Promise((resolve) => {
    const message = Buffer.from([0xff,0xff,0xff,0xff,0x54,0x53,0x6f,0x75,0x72,0x63,0x65,0x20,0x45,0x6e,0x67,0x69,0x6e,0x65,0x20,0x51,0x75,0x65,0x72,0x79,0x00]);
    const client = dgram.createSocket("udp4");
    let responded = false;

    client.on("message", (msg) => {
      responded = true;
      client.close();

      const data = msg.toString("utf8", 6).split("\0");
      const players = msg[msg.length - 2];
      const maxPlayers = msg[msg.length - 1];

      resolve({
        online: true,
        name: data[0],
        map: data[1],
        players,
        maxPlayers
      });
    });

    client.send(message, 0, message.length, port, ip);
    setTimeout(() => { if (!responded) resolve({ online: false }); }, 1500);
  });
}

app.get("/api/server-stats", async (req, res) => {
  const ip = "193.25.252.44";    // ✅ Your server IP
  const queryPort = 27016;       // ✅ Query port = game port + 14 (2302 + 14)

  const stats = await queryDayZServer(ip, queryPort);
  res.json(stats);
});

// ✅ Health check
app.get("/health", (req, res) => res.send("OK"));

// ✅ Use Render PORT or fallback to 8787 locally
const PORT = process.env.PORT || 8787;
app.listen(PORT, () =>
  console.log(`✅ Webhook live on port ${PORT} — /stripe-webhook & /api/server-stats`)
);

