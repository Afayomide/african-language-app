/**
 * Find word translations that no lesson content actually supports.
 *
 * `upsertWordFromSentenceComponent` unions translations on every reuse and never removes
 * any, so a word accumulates whatever each run guessed. `àbúrò` ("younger sibling") now
 * carries "price", "water" and "kiosk"; `ọkùnrin` ("man") carries "news" and "kiosk".
 *
 * Rather than judge Yoruba -- which no model here can do reliably -- this asks the corpus
 * what each word has actually been glossed as in context:
 *
 *   evidence  = the `text` of every meaningSegment that covers EXACTLY this component
 *               (sourceComponentIndexes = [i]) in a live sentence using the word
 *   supported = a stored translation matching some evidence gloss after normalisation
 *   candidate = a stored translation nothing in the corpus supports
 *
 * Words whose components only ever appear inside grouped segments have no single-component
 * evidence; they are reported as UNVERIFIABLE and never proposed for removal.
 *
 * Report only. Writes nothing -- removal needs a Yoruba speaker's approval.
 */
import "dotenv/config";
import { Client } from "pg";

/** Lowercase, drop punctuation, parentheticals and leading articles, so
 *  "The younger sibling" / "younger sibling." / "younger sibling" all agree. */
function norm(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[^\p{L}\p{N}\s/'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|a|an)\s+/, "");
}

/** Generous match: exact, or one side contained in the other as whole words. */
function matches(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const wrap = (s: string) => ` ${s} `;
  return wrap(a).includes(wrap(b)) || wrap(b).includes(wrap(a));
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const words = (await c.query(
    `SELECT id, text, translations, updated_at FROM words
     WHERE is_deleted = false AND array_length(translations, 1) >= 2
     ORDER BY array_length(translations, 1) DESC`
  )).rows as any[];

  // Every live sentence's components + segments, once.
  const sentences = (await c.query(
    `SELECT s.id, s.text, s.translations, s.meaning_segments,
            json_agg(json_build_object('i', sc.order_index, 'ref', sc.ref_id)
                     ORDER BY sc.order_index) AS comps
     FROM sentences s JOIN sentence_components sc ON sc.sentence_id = s.id
     WHERE s.is_deleted = false
     GROUP BY s.id`
  )).rows as any[];

  // ref_id -> [glosses attested for it alone]
  const evidence = new Map<string, string[]>();
  for (const s of sentences) {
    const segs = Array.isArray(s.meaning_segments) ? s.meaning_segments : [];
    const byIndex = new Map<number, string>();
    for (const comp of s.comps || []) byIndex.set(Number(comp.i), comp.ref);
    for (const seg of segs) {
      const idx = Array.isArray(seg?.sourceComponentIndexes) ? seg.sourceComponentIndexes : [];
      if (idx.length !== 1) continue; // grouped segment: not evidence for one word
      const ref = byIndex.get(Number(idx[0]));
      if (!ref) continue;
      const text = String(seg.text || "").trim();
      if (!text) continue;
      if (!evidence.has(ref)) evidence.set(ref, []);
      evidence.get(ref)!.push(text);
    }
  }

  // Which OTHER word does each gloss belong to? Absence of evidence is not evidence of
  // error -- "small" is simply an unused synonym for `kékeré`, and `Wọ́n` really does mean
  // "they" even though the corpus only attests "is expensive". But a gloss that is the
  // attested meaning of a DIFFERENT word has a provenance: it leaked in during a union
  // merge. That is the difference between an unused synonym and contamination.
  const glossOwners = new Map<string, Set<string>>();
  for (const [ref, texts] of evidence) {
    for (const t of texts) {
      const n = norm(t);
      if (!n) continue;
      if (!glossOwners.has(n)) glossOwners.set(n, new Set());
      glossOwners.get(n)!.add(ref);
    }
  }
  const wordById = new Map(words.map((w: any) => [w.id, w.text]));
  // A gloss attested for many words is generic ("is", "you") and cannot be attributed.
  const OWNER_LIMIT = 2;

  let unverifiable = 0;
  const report: any[] = [];

  for (const w of words) {
    const glosses = Array.from(new Set((evidence.get(w.id) || []).map(norm))).filter(Boolean);
    if (!glosses.length) { unverifiable += 1; continue; }

    const supported: string[] = [];
    const leaked: Array<{ tr: string; from: string }> = [];
    const unattested: string[] = [];

    for (const tr of w.translations as string[]) {
      const n = norm(tr);
      if (glosses.some((g) => matches(n, g))) { supported.push(tr); continue; }
      const owners = Array.from(glossOwners.get(n) || []).filter((id) => id !== w.id);
      if (owners.length > 0 && owners.length <= OWNER_LIMIT) {
        leaked.push({ tr, from: owners.map((id) => wordById.get(id) || id).join(", ") });
      } else {
        unattested.push(tr);
      }
    }
    if (!leaked.length && !unattested.length) continue;
    report.push({ w, glosses, supported, leaked, unattested });
  }

  report.sort((a, b) => b.leaked.length - a.leaked.length);

  console.log("### TIER 1 -- contamination: this gloss is another word's attested meaning\n");
  for (const r of report) {
    if (!r.leaked.length) continue;
    console.log(`${r.w.text}   (updated ${r.w.updated_at.toISOString().slice(0, 10)})`);
    console.log(`   means: ${r.glosses.join(" | ")}`);
    for (const l of r.leaked) console.log(`   REMOVE "${l.tr}"   <- actually means "${l.from}"`);
    console.log();
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("### TIER 2 -- unattested but not traceable elsewhere (synonyms, inflections,");
  console.log("### and real senses the corpus underuses). NOT proposed for removal.\n");
  for (const r of report) {
    if (!r.unattested.length) continue;
    console.log(`${r.w.text}: ${JSON.stringify(r.unattested)}`);
  }

  const t1 = report.reduce((n: number, r: any) => n + r.leaked.length, 0);
  const t2 = report.reduce((n: number, r: any) => n + r.unattested.length, 0);
  console.log(`\n${"=".repeat(70)}`);
  console.log(`words examined                  : ${words.length}`);
  console.log(`TIER 1 contamination (removable): ${t1}`);
  console.log(`TIER 2 unattested (leave alone) : ${t2}`);
  console.log(`unverifiable, skipped           : ${unverifiable}`);
  await c.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
