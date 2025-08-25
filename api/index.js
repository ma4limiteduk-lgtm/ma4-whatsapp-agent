const twilio = require("twilio");
const OpenAI = require("openai");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ASSISTANT_ID = process.env.ASSISTANT_ID;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const incomingMessage = req.body.Body?.trim() || "";
    const fromNumber = req.body.From;

    console.log(`📩 Incoming message from ${fromNumber}: ${incomingMessage}`);
    console.log("⚙️ Using Assistant ID:", ASSISTANT_ID);

    // Step 1: Create a thread
    const thread = await openai.beta.threads.create();
    console.log("🧵 Thread created:", thread);

    if (!thread || !thread.id) {
      throw new Error("❌ Failed to create thread, got undefined ID");
    }

    // Step 2: Add user message
    const userMsg = await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: incomingMessage,
    });
    console.log("✅ User message added:", userMsg);

    // Step 3: Run the assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_ID,
    });
    console.log("🚀 Run started:", run);

    // Step 4: Poll until the run completes
    let runStatus;
    do {
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      console.log("⏳ Run status:", runStatus.status);
      if (runStatus.status !== "completed") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } while (runStatus.status !== "completed");

    // Step 5: Fetch assistant reply
    const messages = await openai.beta.threads.messages.list(thread.id);
    console.log("📜 Messages object:", JSON.stringify(messages, null, 2));

    const assistantReply =
      messages.data[0]?.content[0]?.text?.value || "⚠️ No response from assistant";

    console.log(`🤖 Assistant reply: ${assistantReply}`);

    // Step 6: Send reply back to WhatsApp
    await client.messages.create({
      body: assistantReply,
      from: "whatsapp:+14155238886", // Twilio Sandbox number
      to: fromNumber,
    });

    res.status(200).json({ success: true, reply: assistantReply });
  } catch (error) {
    console.error("❌ Error occurred:", error);
    res.status(500).json({ error: error.message });
  }
};
