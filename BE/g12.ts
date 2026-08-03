import { buildSentencesPrompt, closeUnbalancedJson, extractJson, sanitizeJsonText } from "./src/services/llm/prompts.js";
import { SENTENCES_SCHEMA } from "./src/services/llm/ollamaSchemas.js";
const input: any = {
  language:"yoruba", level:"beginner", lessonTitle:"Pricing at the Kiosk",
  conversationGoal:"Ask the price of a single item and say you want to buy it.",
  situations:["You approach a street kiosk vendor selling water."],
  sentenceGoals:["How much is one water?","I want to buy one water.","Give me one water."],
  allowedWords:[{text:"eló",translations:["how much"]},{text:"ni",translations:["is"]},{text:"omi",translations:["water"]},
    {text:"kan",translations:["one"]},{text:"mo",translations:["I"]},{text:"fẹ́",translations:["want"]},
    {text:"rà",translations:["buy"]},{text:"ẹ",translations:["you"]},{text:"fún",translations:["give"]},{text:"mi",translations:["me"]}],
  allowedExpressions:[], maxSentences:3
};
for (let i=0;i<3;i++){
  const r = await fetch("http://localhost:11434/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model:"gemma4:12b",stream:false,format:SENTENCES_SCHEMA,options:{temperature:0.4,num_ctx:16384,num_predict:4096},
      messages:[{role:"system",content:"You are a precise curriculum-generation engine. You always reply with a single valid JSON object that matches the schema described in the user message. Never include markdown, code fences, or commentary."},
                {role:"user",content:buildSentencesPrompt(input)}]})});
  const j:any = await r.json();
  if (j.error) { console.log(`run ${i+1}: OLLAMA ERROR ${j.error}`); continue; }
  const c = (j.message?.content ?? "").trim();
  const tries: Array<[string,string]> = [
    ["raw", c], ["extracted", extractJson(c)], ["sanitized", sanitizeJsonText(extractJson(c))],
    ["balanced", closeUnbalancedJson(c)], ["balanced+sanitized", closeUnbalancedJson(sanitizeJsonText(c))]
  ];
  let won = ""; for (const [name,txt] of tries) { try { JSON.parse(txt); won = name; break; } catch {} }
  console.log(`\nrun ${i+1}: len=${c.length} done=${j.done_reason} eval=${j.eval_count} -> ${won ? `PARSES via ${won}` : "ALL STRATEGIES FAIL"}`);
  if (!won) { console.log(`  head: ${JSON.stringify(c.slice(0,180))}`); console.log(`  tail: ${JSON.stringify(c.slice(-180))}`); }
}
