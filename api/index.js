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
    
    console.info(`📩 Message from ${fromNumber}: ${incomingMessage}`);

    // Create thread
    const thread = await openai.beta.threads.create();
    console.info("🧵 Thread created:", thread.id);

    // Add message
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: incomingMessage,
    });

    // Create run
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_ID,
    });
    console.info("🚀 Run started:", run.id);

    // Poll for completion
    let runStatus;
    do {
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      console.info("⏳ Status:", runStatus.status);
      
      if (runStatus.status !== "completed") {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } while (runStatus.status !== "completed");

    // Get response
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantReply = messages.data[0]?.content[0]?.text?.value || "No response";

    console.info("🤖 Reply:", assistantReply);

    // Send to WhatsApp
    await client.messages.create({
      body: assistantReply,
      from: "whatsapp:+14155238886",
      to: fromNumber,
    });

    res.status(200).json({ success: true, reply: assistantReply });

  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ error: error.message });
  }
};
