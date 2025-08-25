require('dotenv').config();
const twilio = require('twilio');
const OpenAI = require('openai');

// Initialize services
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Your OpenAI Assistant ID
const ASSISTANT_ID = 'asst_HeWgvAnXUT4hlBvotq42poTg'; // Keep your actual ID

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const incomingMessage = req.body.Body;
  const fromNumber = req.body.From;
  
  console.log(`Message from ${fromNumber}: ${incomingMessage}`);
  
  try {
    // Create thread and message
    const thread = await openai.beta.threads.create();
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: incomingMessage
    });
    
    // Run assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_ID
    });
    
    // Wait for completion and handle function calls
    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    
    while (runStatus.status === 'in_progress' || runStatus.status === 'queued') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    }
    
    // Handle function calls
    if (runStatus.status === 'requires_action') {
      const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;
      const toolOutputs = [];
      
      for (const toolCall of toolCalls) {
        if (toolCall.function.name === 'get_available_appointments') {
          const args = JSON.parse(toolCall.function.arguments);
          
          // Call your Calendly server
          const response = await fetch('https://ma4-calendly-server-1mxrjzctv-ma4-ltds-projects.vercel.app/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              start_date: args.start_date,
              end_date: args.end_date
            })
          });
          
          const appointments = await response.json();
          
          toolOutputs.push({
            tool_call_id: toolCall.id,
            output: JSON.stringify(appointments)
          });
        }
      }
      
      // Submit tool outputs
      await openai.beta.threads.runs.submitToolOutputs(thread.id, run.id, {
        tool_outputs: toolOutputs
      });
      
      // Wait for final completion
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      while (runStatus.status === 'in_progress') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      }
    }
    
    // Get assistant response
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMessage = messages.data[0].content[0].text.value;
    
    // Send WhatsApp reply
    await client.messages.create({
      body: assistantMessage,
      from: 'whatsapp:+14155238886',
      to: fromNumber
    });
    
    res.status(200).json({ success: true });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
