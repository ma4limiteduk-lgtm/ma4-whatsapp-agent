const twilio = require('twilio');
const OpenAI = require('openai');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ASSISTANT_ID = 'asst_HeWgvAnXUT4hlBvotq42poTg'; // Your actual Assistant ID

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const incomingMessage = req.body.Body || 'test';
  const fromNumber = req.body.From || 'test';

  console.log(`Message from ${fromNumber}: ${incomingMessage}`);

  try {
    // 🔑 Step 1: Create a new thread (or reuse one if you want memory)
    const thread = await openai.beta.threads.create();

    // 🔑 Step 2: Add user message to the thread
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: incomingMessage,
    });

    // 🔑 Step 3: Run the assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_ID,
    });

    // Poll until run is complete
    let runStatus;
    do {
      await new Promise(r => setTimeout(r, 1000)); // wait 1 sec
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    } while (runStatus.status !== "completed");

    // 🔑 Step 4: Get assistant reply
    const messages = await openai.beta.threads.messages.list(thread.id);
    const reply = messages.data[0].content[0].text.value;

    // 🔑 Step 5: Send reply back on WhatsApp
    await client.messages.create({
      body: reply,
      from: 'whatsapp:+14155238886', // Your Twilio sandbox or approved WhatsApp number
      to: fromNumber,
    });

    res.status(200).json({ success: true, reply });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
};

