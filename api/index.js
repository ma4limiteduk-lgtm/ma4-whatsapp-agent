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
const CALENDLY_API_URL = "https://ma4-calendly-server-1mxrjzctv-ma4-ltds-projects.vercel.app/api";

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

// Function to get Calendly booking link
async function getCalendlyLink(userMessage) {
  try {
    const response = await fetch(CALENDLY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: userMessage,
        action: 'get_booking_link'
      })
    });

    if (!response.ok) {
      throw new Error(`Calendly API error: ${response.status}`);
    }

    const data = await response.json();
    return data.booking_link || data.link || "Here's your booking link: https://calendly.com/your-link";
  } catch (error) {
    console.error("Error getting Calendly link:", error);
    return "I can help you schedule a meeting! Please visit our booking page or contact us directly.";
  }
}

// Submit tool outputs for function calling
async function submitToolOutputs(threadId, runId, toolOutputs) {
  const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}/submit_tool_outputs`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'OpenAI-Beta': 'assistants=v2',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tool_outputs: toolOutputs
    })
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

    // Step 1: Create thread
    const thread = await openai.beta.threads.create();
    console.info("🧵 Thread created:", thread.id);

    // Step 2: Add message
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: incomingMessage,
    });
    console.info("✅ Message added to thread");

    // Step 3: Create run
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_ID,
    });
    console.info("🚀 Run started:", run.id);

    // Step 4: Poll for completion and handle function calls
    let runStatus;
    let attempts = 0;
    const maxAttempts = 60;

    do {
      if (attempts >= maxAttempts) {
        throw new Error("Run timeout");
      }

      console.info(`⏳ Polling attempt ${attempts + 1}`);
      runStatus = await retrieveRun(thread.id, run.id);
      console.info("⏳ Status:", runStatus.status);

      // Handle function calling
      if (runStatus.status === "requires_action") {
        console.info("🔧 Function call required");
        
        const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;
        const toolOutputs = [];
        
        for (const toolCall of toolCalls) {
          if (toolCall.function.name === "get_calendly_link") {
            console.info("📅 Getting Calendly link...");
            const args = JSON.parse(toolCall.function.arguments);
            const calendlyResponse = await getCalendlyLink(args.message || incomingMessage);
            
            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: calendlyResponse
            });
          }
        }
        
        if (toolOutputs.length > 0) {
          await submitToolOutputs(thread.id, run.id, toolOutputs);
          console.info("✅ Tool outputs submitted");
        }
      }

      if (runStatus.status === "failed") {
        throw new Error(`Run failed: ${runStatus.last_error?.message || 'Unknown error'}`);
      }

      if (runStatus.status === "cancelled" || runStatus.status === "expired") {
        throw new Error(`Run ${runStatus.status}`);
      }

      if (!["completed", "failed", "cancelled", "expired"].includes(runStatus.status)) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }

    } while (runStatus.status !== "completed");

    console.info("✅ Run completed");

    // Step 5: Get messages
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMessage = messages.data.find(msg => msg.role === "assistant");
    const assistantReply = assistantMessage?.content[0]?.text?.value || "No response";

    console.info("🤖 Assistant reply:", assistantReply);

    // Step 6: Send to WhatsApp
    if (process.env.NODE_ENV !== 'test') {
      await client.messages.create({
        body: assistantReply,
        from: "whatsapp:+14155238886",
        to: fromNumber,
      });
      console.info("✅ Sent to WhatsApp");
    }

    res.status(200).json({ 
      success: true, 
      reply: assistantReply,
      threadId: thread.id,
      runId: run.id
    });

  } catch (error) {
    console.error("❌ Error:", error);
    
    if (req.body.From && process.env.NODE_ENV !== 'test') {
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
