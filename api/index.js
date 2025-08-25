const twilio = require("twilio");
const OpenAI = require("openai");
const querystring = require("querystring"); // to parse form data

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
    let body = req.body;

    // If Twilio sent x-www-form-urlencoded, parse it manually
    if (req.headers["content-type"]?.includes("application/x-www-form-urlencoded")) {
      let raw = "";
      await new Promise((resolve) => {
        req.on("data", (chunk) => (raw += chunk.toString()));
        req.on("end", resolve);
      });
      body = querystring.parse(raw);
    }

    const incomingMessage = body.Body?.trim() || "";
    const fromNumber = body.From || "";

    if (!incomingMessage) {
      return res.status(400).json({ error: "Missing message body" });
    }

    console.log(`📩 Incoming message from ${fromNumber}: ${incomingMessage}`);

    // Step 1: Create a thread
    const thread = await openai.beta.threads.create();

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
      if (runStatus.status !== "completed") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } while (runStatus.status !== "completed");

    // Step 5: Get assistant reply
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantReply =
      messages.data[0]?.content[0]?.text?.value || "⚠️ No response from assistant";

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
};
