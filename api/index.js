// 1. Create thread
const thread = await openai.beta.threads.create();

// 2. Add user message
await openai.beta.threads.messages.create(thread.id, {
  role: "user",
  content: incomingMessage,
});

// 3. Run the assistant on that thread
const run = await openai.beta.threads.runs.create(thread.id, {
  assistant_id: asst_HeWgvAnXUT4hlBvotq42poTg,
});

// 4. Poll until run completes
let runStatus;
do {
  await new Promise((r) => setTimeout(r, 1000));
  runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
} while (runStatus.status !== "completed");

// 5. Fetch latest messages
const messages = await openai.beta.threads.messages.list(thread.id);

// 6. Extract AI reply
const reply = messages.data[0].content[0].text.value;
