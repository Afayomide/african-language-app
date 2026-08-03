const input: any = {
  language:"yoruba", level:"beginner", lessonTitle:"Pricing at the Kiosk",
  conversationGoal:"Ask the price of a single item and say you want to buy it.",
  situations:["You approach a street kiosk vendor selling water."],
  sentenceGoals:["How much is one water?","How much is this food?","How much is this water?"],
  allowedWords:[{text:"eló",translations:["how much"]},{text:"ni",translations:["is"]},{text:"omi",translations:["water"]},
    {text:"kan",translations:["one"]},{text:"oúnjẹ",translations:["food"]},{text:"yìí",translations:["this"]},
    {text:"fẹ́",translations:["want"]},{text:"rà",translations:["buy"]},{text:"fún",translations:["give"]},{text:"mi",translations:["me"]}],
  allowedExpressions:[], maxSentences:3
};
const strip=(s:string)=>s.normalize("NFD").replace(/[̀-̣]/g,"").normalize("NFC").toLowerCase();
const canon=new Map<string,string>();
for(const w of input.allowedWords) canon.set(strip(w.text), w.text);
const splitW=(v:string)=>String(v||"").trim().split(/\s+/).map(t=>t.replace(/^[.,!?;:"'()]+|[.,!?;:"'()]+$/g,"")).filter(Boolean);

for (const model of ["gemma4:12b","aya-expanse:8b-q8_0","qwen2.5:14b"]) {
  process.env.OLLAMA_MODEL = model;
  const { createOllamaClient } = await import(`./src/services/llm/ollamaClient.js?t=${encodeURIComponent(model)}`);
  const llm = createOllamaClient();
  let matched=0, correct=0; const bad:string[]=[]; const sample:string[]=[];
  for(let i=0;i<3;i++){
    try{
      const sentences = await llm.generateSentences(input);
      for(const s of sentences){
        if(sample.length<3) sample.push(s.text);
        for(const tok of splitW(s.text)){
          const c = canon.get(strip(tok));
          if(!c) continue;                    // not an inventory word, can't judge
          matched++;
          if(tok.toLowerCase()===c.toLowerCase()) correct++;
          else if(bad.length<8) bad.push(`${tok} (should be ${c})`);
        }
      }
    }catch(e:any){ /* counted as no data */ }
  }
  const pct = matched? Math.round(100*correct/matched) : 0;
  console.log(`\n##### ${model}`);
  console.log(`  inventory words written: ${matched}   with correct tone marks: ${correct}  => ${pct}% fidelity`);
  if(bad.length) console.log(`  wrong: ${bad.join(", ")}`);
  for(const s of sample) console.log(`  sample: ${JSON.stringify(s)}`);
}
