// server.js (CommonJS)
const express = require("express");
const Stripe = require("stripe");
const fetch = require("node-fetch");
const fs = require("fs");
const dgram = require("dgram");

const app = express();

// ✅ READ KEYS FROM ENVIRONMENT (Render → Environment variables)
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const ENDPOINT_SECRET   = process.env.ENDPOINT_SECRET;
const DISCORD_WEBHOOK   = process.env.DISCORD_WEBHOOK;

const stripe = new Stripe(STRIPE_SECRET_KEY);

// ✅ STRIPE WEBHOOK — MUST BE FIRST AND RAW
app.post("/stripe-webhook", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, ENDPOINT_SECRET);
  } catch (err) {
    console.log("❌ Invalid Stripe signature:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ✅ Payment success handler
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = session.customer_details?.email;
    const product = session.metadata?.product;
    const steamId = session.metadata?.steamId;

    console.log(`✅ PAYMENT: ${email} bought ${product} (SteamID: ${steamId || "none"})`);

    // ✅ Discord
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

    // ✅ Whitelist
    if (steamId) fs.appendFileSync("whitelist.txt", `${steamId}\n`);
    if (steamId && (product === "vip" || product === "reserved-slot"))
      fs.appendFileSync("reserved.txt", `${steamId}\n`);
  }

  res.sendStatus(200);
});

// ✅ AFTER WEBHOOK — JSON BODY OK
app.use(express.json());

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
      resolve({
        online: true,
        name: data[0],
        map: data[1],
        players: msg[msg.length - 2],
        maxPlayers: msg[msg.length - 1]
      });
    });

    client.send(message, 0, message.length, port, ip);
    setTimeout(() => { if (!responded) resolve({ online: false }); }, 1500);
  });
}

app.get("/api/server-stats", async (req, res) => {
  const stats = await queryDayZServer("193.25.252.44", 27016);
  res.json(stats);
});

// ✅ Health check
app.get("/health", (req, res) => res.send("OK"));

// ✅ Correct port
const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`✅ Webhook running on port ${PORT}`)
);
