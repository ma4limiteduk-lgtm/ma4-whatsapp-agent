const { Configuration, OpenAIApi } = require('openai');
const twilio = require('twilio');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const ASSISTANT_ID = 'asst_HeWgvAnXUT4hlBvotq42poTg'; // Keep your actual ID

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const incomingMessage = req.body.Body;
  const fromNumber = req.body.From;
  
  console.log(`Message from ${fromNumber}: ${incomingMessage}`);
  
  try {
    // Send a simple reply for now to test the connection
    await client.messages.create({
      body: `I received your message: "${incomingMessage}". I'm working on processing appointments!`,
      from: 'whatsapp:+14155238886',
      to: fromNumber
    });
    
    res.status(200).json({ success: true });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}
