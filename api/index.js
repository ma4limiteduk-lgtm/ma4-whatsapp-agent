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

// Direct REST API call for run retrieval (bypassing broken SDK)
async function retrieveRun(threadId, runId) {
  const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'OpenAI-Beta': 'assistants=v2',
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return await response.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const incomingMessage = req.body.Body?.trim() || "";
    const fromNumber = req.body.From;
    
    console.info(`📩 Message from ${fromNumber}: ${incomingMessage}`);

    // Step 1: Create thread (SDK works fine for this)
    const thread = await openai.beta.threads.create();
    console.info("🧵 Thread created:", thread.id);

    // Step 2: Add message (SDK works fine for this)
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: incomingMessage,
    });
    console.info("✅ Message added to thread");

    // Step 3: Create run (SDK works fine for this)
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_ID,
    });
    console.info("🚀 Run started:", run.id);

    // Step 4: Poll for completion using direct REST API (bypassing broken SDK)
    let runStatus;
    let attempts = 0;
    const maxAttempts = 60;

    do {
      if (attempts >= maxAttempts) {
        throw new Error("Run timeout");
      }

      console.info(`⏳ Polling attempt ${attempts + 1}`);
      
      // ✅ USE DIRECT REST API INSTEAD OF BROKEN SDK
      runStatus = await retrieveRun(thread.id, run.id);
      
      console.info("⏳ Status:", runStatus.status);

      if (runStatus.status === "failed") {
        throw new Error(`Run failed: ${runStatus.last_error?.message || 'Unknown error'}`);
      }

      if (runStatus.status === "cancelled" || runStatus.status === "expired") {
        throw new Error(`Run ${runStatus.status}`);
      }

      if (runStatus.status !== "completed") {
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }

    } while (runStatus.status !== "completed");

    console.info("✅ Run completed");

    // Step 5: Get messages (SDK works fine for this)
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMessage = messages.data.find(msg => msg.role === "assistant");
    const assistantReply = assistantMessage?.content[0]?.text?.value || "No response";

    console.info("🤖 Assistant reply:", assistantReply);

    // Step 6: Send to WhatsApp (SDK works fine for this)
    await client.messages.create({
      body: assistantReply,
      from: "whatsapp:+14155238886",
      to: fromNumber,
    });

    console.info("✅ Sent to WhatsApp");

    res.status(200).json({ 
      success: true, 
      reply: assistantReply,
      threadId: thread.id,
      runId: run.id
    });

  } catch (error) {
    console.error("❌ Error:", error);
    
    // Send error to user
    if (req.body.From) {
      try {
        await client.messages.create({
          body: "Sorry, I encountered an error. Please try again.",
          from: "whatsapp:+14155238886",
          to: req.body.From,
        });
      } catch (twilioError) {
        console.error("❌ Twilio error:", twilioError);
      }
    }

    res.status(500).json({ error: error.message });
  }
};
