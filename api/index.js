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

// Direct REST API call for run retrieval
async function retrieveRun(threadId, runId) {
  try {
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
  } catch (error) {
    console.error("Error in retrieveRun:", error);
    throw error;
  }
}

// Function to handle Calendly requests
async function getCalendlyAvailability(userMessage) {
  try {
    console.log("🔍 Getting Calendly info for:", userMessage);
    
    const message = (userMessage || "").toLowerCase();
    
    // Check if user wants specific availability
    const wantsAvailability = message.includes('availability') || 
                             message.includes('available') || 
                             message.includes('slots') || 
                             message.includes('times') || 
                             message.includes('when');

    if (wantsAvailability) {
      console.log("📅 User wants specific availability");
      
      const today = new Date();
      const startDate = today.toISOString().split('T')[0];
      const endDate = new Date(today.getTime() + (7 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];

      const response = await fetch(CALENDLY_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          start_date: startDate,
          end_date: endDate
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log("📊 Calendly slots received:", data.length || 0);
        
        if (data && Array.isArray(data) && data.length > 0) {
          const availableSlots = data.filter(slot => slot.status === "available").slice(0, 5);
          
          if (availableSlots.length > 0) {
            let message = "📅 Available consultation slots:\n\n";
            
            availableSlots.forEach((slot, index) => {
              const startTime = new Date(slot.start_time);
              const dateStr = startTime.toLocaleDateString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric' 
              });
              const timeStr = startTime.toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit',
                hour12: true 
              });
              
              message += `🕐 ${dateStr} at ${timeStr}\n`;
              message += `   Book: ${slot.scheduling_url}\n\n`;
            });
            
            message += "Or browse all times: https://calendly.com/ma4ltd/30min";
            return message;
          }
        }
      }
    }

    // Default response
    return `📅 Book Your Consultation

Quick Booking: https://calendly.com/ma4ltd/30min

Our Hours:
- Monday-Friday: 8:00 AM - 5:00 PM GMT
- Saturday: 9:00 AM - 3:00 PM GMT

Ask for "availability" to see specific time slots!`;

  } catch (error) {
    console.error("Error in getCalendlyAvailability:", error);
    return `📅 Book Your Consultation: https://calendly.com/ma4ltd/30min

Our Hours: Monday-Friday 8AM-5PM GMT, Saturday 9AM-3PM GMT`;
  }
}

// Submit tool outputs
async function submitToolOutputs(threadId, runId, toolOutputs) {
  try {
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
  } catch (error) {
    console.error("Error in submitToolOutputs:", error);
    throw error;
  }
}

// Main handler
module.exports = async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("📩 Received request:", JSON.stringify(req.body, null, 2));
    
    const incomingMessage = req.body.Body?.trim() || "";
    const fromNumber = req.body.From || "test";
    
    console.log(`📩 Message from ${fromNumber}: ${incomingMessage}`);

    // Validate environment variables
    if (!process.env.OPENAI_API_KEY || !ASSISTANT_ID) {
      throw new Error("Missing required environment variables");
    }

    // Step 1: Create thread
    console.log("🧵 Creating thread...");
    const thread = await openai.beta.threads.create();
    console.log("🧵 Thread created:", thread.id);

    // Step 2: Add message
    console.log("📝 Adding message to thread...");
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: incomingMessage,
    });
    console.log("✅ Message added");

    // Step 3: Create run
    console.log("🚀 Creating run...");
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_ID,
    });
    console.log("🚀 Run created:", run.id);

    // Step 4: Poll for completion
    let runStatus;
    let attempts = 0;
    const maxAttempts = 60;

    do {
      if (attempts >= maxAttempts) {
        throw new Error("Run timeout after 60 attempts");
      }

      console.log(`⏳ Polling attempt ${attempts + 1}`);
      runStatus = await retrieveRun(thread.id, run.id);
      console.log("⏳ Status:", runStatus.status);

      // Handle function calling
      if (runStatus.status === "requires_action") {
        console.log("🔧 Function call required");
        
        const toolCalls = runStatus.required_action?.submit_tool_outputs?.tool_calls || [];
        const toolOutputs = [];
        
        for (const toolCall of toolCalls) {
          console.log("🛠️ Processing tool call:", toolCall.function.name);
          
          if (toolCall.function.name === "get_calendly_link") {
            const args = JSON.parse(toolCall.function.arguments || "{}");
            const calendlyResponse = await getCalendlyAvailability(args.message || incomingMessage);
            
            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: calendlyResponse
            });
          }
        }
        
        if (toolOutputs.length > 0) {
          console.log("📤 Submitting tool outputs");
          await submitToolOutputs(thread.id, run.id, toolOutputs);
        }
      }

      if (runStatus.status === "failed") {
        console.error("❌ Run failed:", runStatus.last_error);
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

    console.log("✅ Run completed");

    // Step 5: Get messages
    console.log("📨 Getting messages...");
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMessage = messages.data.find(msg => msg.role === "assistant");
    const assistantReply = assistantMessage?.content[0]?.text?.value || "I apologize, but I couldn't generate a response. Please try again.";

    console.log("🤖 Assistant reply:", assistantReply);

    // Step 6: Send to WhatsApp (skip in test mode)
    if (process.env.NODE_ENV !== 'test' && fromNumber.startsWith('whatsapp:')) {
      try {
        await client.messages.create({
          body: assistantReply,
          from: "whatsapp:+14155238886",
          to: fromNumber,
        });
        console.log("✅ Sent to WhatsApp");
      } catch (twilioError) {
        console.error("⚠️ WhatsApp send failed:", twilioError);
        // Don't fail the whole request if WhatsApp fails
      }
    }

    // Return response
    res.status(200).json({ 
      success: true, 
      reply: assistantReply,
      threadId: thread.id,
      runId: run.id
    });

  } catch (error) {
    console.error("❌ Handler error:", error);
    
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
