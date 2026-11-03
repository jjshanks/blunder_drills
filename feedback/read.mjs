// Read the feedback: the last 50 messages, and the thumbs score for each target and motif. Run it with
// `npm run feedback` at the repository root. It needs `wrangler login`. Never commit what it prints: the data is not public.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// What a vote judged: 'advice' (the tactic note) or 'solution' (a solution with no note). Rows from before the
// target field are all advice.
const TARGET = `COALESCE(json_extract(puzzle, '$.target'), 'advice')`;

export const RECENT = `
SELECT id, at, kind, vote, text, ${TARGET} AS target,
       json_extract(puzzle, '$.fen') AS fen, json_extract(puzzle, '$.note') AS note
FROM feedback ORDER BY id DESC LIMIT 50`;

// One vote for each page load, puzzle and note: the last row wins (SQLite takes the bare columns from the
// MAX(id) row). Then the score for each target and pair of motifs: what the game move allowed, and the idea of
// the better line.
export const MOTIFS = `
SELECT ${TARGET} AS target, json_extract(puzzle, '$.allowed') AS allowed, json_extract(puzzle, '$.idea') AS idea,
       SUM(vote = 1) AS up, SUM(vote = -1) AS down
FROM (SELECT MAX(id), vote, puzzle FROM feedback WHERE kind = 'vote'
      GROUP BY page, json_extract(puzzle, '$.fen'), json_extract(puzzle, '$.note'))
GROUP BY target, allowed, idea ORDER BY down DESC, up DESC`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const sql of [RECENT, MOTIFS]) {
    const r = spawnSync('wrangler', ['d1', 'execute', 'blunder-feedback', '--remote', '--command', sql.trim()], { stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}
