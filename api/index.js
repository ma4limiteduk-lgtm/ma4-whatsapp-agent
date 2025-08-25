const twilio = require("twilio");
const OpenAI = require("openai");
const express = require("express");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ASSISTANT_ID = process.env.ASSISTANT_ID;

const app = express();

// ✅ Middleware for Twilio requests
app.use(express.urlencoded({ extended: true })); // Handles x-www-form-urlencoded
app.use(express.json()); // Handles application/json

app.post("/api/index", async (req, res) => {
  try {
    const incomingMessage = req.body.Body?.trim() || "";
    const fromNumber = req.body.From;

    console.log("📩 Raw body:", req.body);
    console.log(`📩 Incoming message from ${fromNumber}: ${incomingMessage}`);

    // Step 1: Create a thread
    const thread = await openai.beta.threads.create();
    console.log("🧵 Thread created:", thread);

    if (!thread?.id) {
      throw new Error("Thread creation failed, no ID returned");
    }

    // Step 2: Add user message to the thread
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: incomingMessage,
    });

    // Step 3: Run the assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_ID,
    });

    // Step 4: Poll until the run is completed
    let runStatus;
    do {
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      console.log("⏳ Run status:", runStatus.status);
      if (runStatus.status !== "completed") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } while (runStatus.status !== "completed");

    // Step 5: Get assistant reply
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantReply =
      messages.data[0]?.content[0]?.text?.value ||
      "⚠️ No response from assistant";

    console.log(`🤖 Assistant reply: ${assistantReply}`);

    // Step 6: Send back to WhatsApp
    await client.messages.create({
      body: assistantReply,
      from: "whatsapp:+14155238886", // Twilio Sandbox number
      to: fromNumber,
    });

    res.status(200).json({ success: true, reply: assistantReply });
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = app;
