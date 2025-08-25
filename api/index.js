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

  let threadId = null;
  let runId = null;

  try {
    console.info("📩 Raw body:", req.body);
    
    const incomingMessage = req.body.Body?.trim() || "";
    const fromNumber = req.body.From;
    
    console.info(`📩 Incoming message from ${fromNumber}: ${incomingMessage}`);

    // Validate required environment variables
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    
    if (!ASSISTANT_ID) {
      throw new Error("ASSISTANT_ID environment variable is required");
    }

    // Step 1: Create a thread
    console.info("🧵 Creating thread...");
    const thread = await openai.beta.threads.create();
    
    if (!thread || !thread.id) {
      throw new Error("Failed to create thread - thread.id is undefined");
    }
    
    threadId = thread.id;
    console.info("🧵 Thread created successfully:", threadId);

    // Step 2: Add user message to the thread
    console.info("📝 Adding message to thread...");
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: incomingMessage,
    });
    console.info("✅ Message added to thread");

    // Step 3: Run the assistant
    console.info("🚀 Starting assistant run...");
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: ASSISTANT_ID,
    });
    
    if (!run || !run.id) {
      throw new Error("Failed to create run - run.id is undefined");
    }
    
    runId = run.id;
    console.info("🚀 Run started - threadId:", threadId, "runId:", runId);

    // Step 4: Poll until the run is completed
    let runStatus;
    let attempts = 0;
    const maxAttempts = 60;
    const pollInterval = 1000;

    do {
      if (attempts >= maxAttempts) {
        throw new Error("Assistant run timeout");
      }

      console.info(`⏳ Polling attempt ${attempts + 1}`);
      console.info(`⏳ Using threadId: "${threadId}"`);
      console.info(`⏳ Using runId: "${runId}"`);
      
      // ✅ CRITICAL FIX: Use the runs object method directly with explicit parameters
      // This should prevent any parameter confusion
      runStatus = await openai.beta.threads.runs.retrieve({
        thread_id: threadId,
        run_id: runId
      });
      
      console.info(`⏳ Run status: ${runStatus.status}`);

      if (runStatus.status === "failed") {
        console.error("Run failed:", runStatus.last_error);
        throw new Error(`Assistant run failed: ${runStatus.last_error?.message || 'Unknown error'}`);
      }

      if (runStatus.status === "cancelled") {
        throw new Error("Assistant run was cancelled");
      }

      if (runStatus.status === "expired") {
        throw new Error("Assistant run expired");
      }

      if (runStatus.status === "requires_action") {
        console.info("🔧 Run requires action - function calling needed");
        // Add function calling logic here if your assistant uses tools
      }

      if (!["completed", "failed", "cancelled", "expired"].includes(runStatus.status)) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        attempts++;
      }

    } while (runStatus.status !== "completed");

    console.info("✅ Run completed successfully");

    // Step 5: Get assistant reply
    console.info("📨 Retrieving messages...");
    const messages = await openai.beta.threads.messages.list(threadId);
    
    // Get the latest assistant message
    const assistantMessage = messages.data.find(msg => msg.role === "assistant");
    const assistantReply = assistantMessage?.content[0]?.text?.value || "⚠️ No response from assistant";

    console.info(`🤖 Assistant reply: ${assistantReply}`);

    // Step 6: Send back to WhatsApp
    console.info("📱 Sending to WhatsApp...");
    await client.messages.create({
      body: assistantReply,
      from: "whatsapp:+14155238886",
      to: fromNumber,
    });

    console.info("✅ Message sent to WhatsApp successfully");

    res.status(200).json({ 
      success: true, 
      reply: assistantReply,
      threadId: threadId,
      runId: runId
    });

  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error("❌ Stack:", error.stack);
    
    // Send error message to WhatsApp user
    if (req.body.From) {
      try {
        await client.messages.create({
          body: "Sorry, I encountered an error processing your message. Please try again later.",
          from: "whatsapp:+14155238886",
          to: req.body.From,
        });
        console.info("✅ Error message sent to WhatsApp");
      } catch (twilioError) {
        console.error("❌ Failed to send error message:", twilioError.message);
      }
    }

    res.status(500).json({ 
      error: error.message,
      type: error.name,
      threadId: threadId,
      runId: runId
    });
  }
};
