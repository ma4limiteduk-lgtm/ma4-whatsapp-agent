const twilio = require("twilio");
const OpenAI = require("openai");

// Twilio client
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ASSISTANT_ID = process.env.ASSISTANT_ID;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.info("📩 Raw body:", req.body);

    const incomingMessage = req.body.Body?.trim() || "";
    const fromNumber = req.body.From;

    console.info(`📩 Incoming message from ${fromNumber}: ${incomingMessage}`);

    // Step 1: Create a thread
    const thread = await openai.beta.threads.create();
    console.info("🧵 Thread created:", thread);

    // Step 2: Add user message to the thread
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: incomingMessage,
    });

    // Step 3: Run the assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_ID,
    });
    console.info("🚀 Run started:", run);

    // Step 4: Poll until the run is completed
    let runStatus;
    do {
      runStatus = await openai.beta.threads.runs.retrieve(
        run.thread_id, // ✅ use run.thread_id instead of thread.id
        run.id
      );
      console.info("⏳ Run status:", runStatus.status);
      if (runStatus.status !== "completed") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } while (runStatus.status !== "completed");

    // Step 5: Get assistant reply
    const messages = await openai.beta.threads.messages.list(run.thread_id);
    const assistantReply =
      messages.data[0]?.content[0]?.text?.value ||
      "⚠️ No response from assistant";

    console.info(`🤖 Assistant reply: ${assistantReply}`);

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
};
