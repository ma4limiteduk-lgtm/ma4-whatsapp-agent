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

    // Validate required environment variables
    if (!ASSISTANT_ID) {
      throw new Error("ASSISTANT_ID environment variable is required");
    }

    // Step 1: Create a thread
    const thread = await openai.beta.threads.create();
    console.info("🧵 Thread created:", thread.id);

    // Step 2: Add user message to the thread
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: incomingMessage,
    });
    console.info("✅ Message added to thread");

    // Step 3: Run the assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_ID,
    });
    console.info("🚀 Run started:", run.id);

    // Step 4: Poll until the run is completed
    let runStatus;
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds timeout
    const pollInterval = 1000; // 1 second

    do {
      if (attempts >= maxAttempts) {
        throw new Error("Assistant run timeout - exceeded maximum wait time");
      }

      runStatus = await openai.beta.threads.runs.retrieve(
        thread.id, // ✅ Fixed: use thread.id instead of run.thread_id
        run.id
      );
      
      console.info(`⏳ Run status: ${runStatus.status} (attempt ${attempts + 1})`);

      // Handle different run statuses
      if (runStatus.status === "failed") {
        throw new Error(`Assistant run failed: ${runStatus.last_error?.message || 'Unknown error'}`);
      }

      if (runStatus.status === "cancelled") {
        throw new Error("Assistant run was cancelled");
      }

      if (runStatus.status === "expired") {
        throw new Error("Assistant run expired");
      }

      // Handle function calls if your assistant uses tools
      if (runStatus.status === "requires_action") {
        console.info("🔧 Run requires action - function calls needed");
        // You can add function call handling here if needed
      }

      if (!["completed", "failed", "cancelled", "expired"].includes(runStatus.status)) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        attempts++;
      }

    } while (runStatus.status !== "completed");

    console.info("✅ Run completed successfully");

    // Step 5: Get assistant reply
    const messages = await openai.beta.threads.messages.list(thread.id); // ✅ Fixed
    
    // Get the latest assistant message
    const assistantMessage = messages.data.find(msg => msg.role === "assistant");
    const assistantReply = assistantMessage?.content[0]?.text?.value || "⚠️ No response from assistant";

    console.info(`🤖 Assistant reply: ${assistantReply}`);

    // Step 6: Send back to WhatsApp
    await client.messages.create({
      body: assistantReply,
      from: "whatsapp:+14155238886", // Twilio Sandbox number
      to: fromNumber,
    });

    console.info("✅ Message sent to WhatsApp");

    res.status(200).json({ 
      success: true, 
      reply: assistantReply,
      threadId: thread.id,
      runId: run.id
    });

  } catch (error) {
    console.error("❌ Error:", error);
    
    // Send error message to WhatsApp user
    try {
      await client.messages.create({
        body: "Sorry, I encountered an error processing your message. Please try again later.",
        from: "whatsapp:+14155238886",
        to: req.body.From,
      });
    } catch (twilioError) {
      console.error("❌ Failed to send error message to WhatsApp:", twilioError);
    }

    res.status(500).json({ 
      error: error.message,
      type: error.constructor.name
    });
  }
};
