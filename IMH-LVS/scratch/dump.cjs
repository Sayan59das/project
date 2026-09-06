const fs = require('fs');

const lines = fs.readFileSync('C:/Users/sayan/.gemini/antigravity-ide/brain/5f353e5c-3207-4151-b84a-e04c1c6106d5/.system_generated/logs/transcript.jsonl', 'utf8').split('\n').filter(Boolean);

let history = [];
for (const line of lines) {
  try {
    const data = JSON.parse(line);
    if (data.type === 'USER_INPUT' || data.type === 'PLANNER_RESPONSE') {
      if (data.content) {
        history.push({ step: data.step_index, source: data.source, content: data.content });
      }
    }
  } catch (e) {}
}

const text = history.map(h => `${h.source} [${h.step}]: ${h.content.substring(0, 500)}`).join('\n\n');
fs.writeFileSync('scratch/history_dump.txt', text);
console.log('done');
