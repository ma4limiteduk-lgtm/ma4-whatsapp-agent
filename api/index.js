const twilio = require("twilio");
const OpenAI = require("openai");

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID; // keep ID in .env for safety

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const incomingMessage = req.body.Body;
    const fromNumber = req.body.From;

    console.log(`Incoming WhatsApp: ${fromNumber} -> ${incomingMessage}`);

    // ✅ Step 1: Create a thread
    const thread = await openai.beta.threads.create();

    // ✅ Step 2: Add the user’s message
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: incomingMessage,
    });

    // ✅ Step 3: Run the assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_ID,
    });

    // ✅ Step 4: Poll until complete
    let runStatus;
    do {
      await new Promise((r) => setTimeout(r, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    } while (runStatus.status !== "completed");

    // ✅ Step 5: Get reply
    const messages = await openai.beta.threads.messages.list(thread.id);
    const reply = messages.data[0].content[0].text.value;

    // ✅ Step 6: Send via Twilio WhatsApp
    await client.messages.create({
      body: reply,
      from: "whatsapp:+14155238886", // Twilio sandbox number
      to: fromNumber,
    });

    return res.status(200).json({ success: true, reply });
  } catch (err) {
    console.error("❌ Error in handler:", err);
    return res.status(500).json({ error: err.message });
  }
};
