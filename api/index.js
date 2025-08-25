const twilio = require('twilio');
const OpenAI = require('openai');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ASSISTANT_ID = 'asst_HeWgvAnXUT4hJBvoTq42PoTg'; // Your actual ID

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const incomingMessage = req.body.Body || 'test';
  const fromNumber = req.body.From || 'test';
  
  console.log(`Message from ${fromNumber}: ${incomingMessage}`);
  
  try {
    // Send a simple reply for testing
    await client.messages.create({
      body: `I received: "${incomingMessage}"`,
      from: 'whatsapp:+14155238886',
      to: fromNumber
    });
    
    res.status(200).json({ success: true });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}
