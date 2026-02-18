import fs from 'node:fs';
import path from 'node:path';

export function estimateTokenCount(input: string): number {
  const text = String(input || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return 0;
  }

  // Lightweight heuristic: GPT-style tokens are often ~4 chars/token in English.
  // We blend char-based and word-based estimates to reduce extreme bias.
  const byChars = Math.ceil(text.length / 4);
  const byWords = Math.ceil(text.split(' ').filter(Boolean).length * 1.25);
  return Math.max(1, Math.max(byChars, byWords));
}

function parseArgs(argv: string[]): { file?: string; text?: string; jsonFile?: string } {
  const out: { file?: string; text?: string; jsonFile?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--') {
      continue;
    }
    if (token === '--file') {
      out.file = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--text') {
      out.text = argv[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (token === '--json-file') {
      out.jsonFile = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.file && !args.text && !args.jsonFile) {
    process.stdout.write(
      'Usage: tsx scripts/eval/token_count.ts --text "..." | --file <path> | --json-file <path>\n'
    );
    process.exit(1);
  }

  let payload = '';
  if (args.text !== undefined) {
    payload = args.text;
  } else if (args.file) {
    const resolved = path.resolve(args.file);
    payload = fs.readFileSync(resolved, 'utf8');
  } else if (args.jsonFile) {
    const resolved = path.resolve(args.jsonFile);
    const raw = fs.readFileSync(resolved, 'utf8');
    payload = JSON.stringify(JSON.parse(raw));
  }

  const estimate = estimateTokenCount(payload);
  process.stdout.write(`${estimate}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`[eval/token_count] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
