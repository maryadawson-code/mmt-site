// CLI entrypoint.
//
//   publish                 DRY-RUN (default): show every due+approved post
//                           with final text + link, no API calls.
//   publish --confirm       Actually publish, respecting every guard.
//   publish --date=YYYY-MM-DD   Override "today" (testing).
//   tokens:status           Print connection/token health + expiry countdown.
//   calendar:validate       Validate data/posts.json and report errors.

import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadCalendar } from './calendar.ts';
import { run } from './publisher.ts';
import type { RunSummary } from './publisher.ts';
import { createProviderFromEnv } from './postpeer.ts';
import { checkConnection } from './tokens.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CALENDAR_PATH = resolve(ROOT, 'data', 'posts.json');
const PUBLISHED_PATH = resolve(ROOT, 'state', 'published.json');

function todayISO(): string {
  // Use America/New_York so "due today" matches the ET posting schedule.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date());
}

function parseFlags(argv: string[]): { confirm: boolean; date: string | null } {
  let confirm = false;
  let date: string | null = null;
  for (const a of argv) {
    if (a === '--confirm') confirm = true;
    else if (a.startsWith('--date=')) date = a.slice('--date='.length);
  }
  return { confirm, date };
}

function printSummary(s: RunSummary): void {
  const bar = '─'.repeat(64);
  console.log(bar);
  console.log(`MMT LinkedIn Publisher — ${s.mode.toUpperCase()}  (today: ${s.today})`);
  console.log(bar);

  if (s.validationErrors.length) {
    console.log('\nCALENDAR VALIDATION ERRORS:');
    for (const e of s.validationErrors) console.log(`  ✗ ${e}`);
  }

  for (const item of s.items) {
    const p = item.post;
    if (item.action === 'would-publish' || item.action === 'published') {
      const tag = item.action === 'published' ? '✅ PUBLISHED' : '📝 WOULD PUBLISH';
      console.log(`\n${tag}  ${p.id}  [${p.format}]  ${p.publish_date} ${p.publish_time} ET`);
      if (item.providerPostId) console.log(`   provider post id: ${item.providerPostId}`);
      console.log(`   link: ${item.attachmentMode}${item.attachment ? ` -> ${item.attachment}` : ''}`);
      console.log('   ┌─ text ' + '─'.repeat(50));
      for (const line of (item.text ?? '').split('\n')) console.log(`   │ ${line}`);
      console.log('   └' + '─'.repeat(56));
    } else if (item.reason === 'not-due') {
      // keep scheduled items quiet unless verbose; show a one-liner
      console.log(`   ·  ${p.id}  [${p.format}]  scheduled ${p.publish_date} (not due)`);
    } else {
      console.log(`   ⏭  ${p.id}  [${p.format}]  SKIP: ${item.reason}${item.detail ? ` — ${item.detail}` : ''}`);
    }
  }

  if (s.warnings.length) {
    console.log('\nWARNINGS:');
    for (const w of s.warnings) console.log(`  ⚠ ${w}`);
  }

  console.log('\n' + bar);
  console.log(
    `Due: ${s.dueCount}  |  ${s.mode === 'live' ? 'Published' : 'Would publish'}: ${
      s.mode === 'live' ? s.publishedCount : s.wouldPublishCount
    }  |  Skipped: ${Object.entries(s.skipped).map(([k, v]) => `${k}=${v}`).join(' ') || 'none'}`,
  );
  if (s.aborted) console.log(`\n🛑 ABORTED: ${s.aborted}`);
  if (s.mode === 'dry-run' && s.wouldPublishCount > 0) {
    console.log('\nThis was a DRY RUN. Re-run with --confirm to publish.');
  }
  console.log(bar);
}

async function cmdPublish(argv: string[]): Promise<number> {
  const { confirm, date } = parseFlags(argv);
  const today = date ?? todayISO();

  let provider;
  let authorAccountId: string | undefined;
  if (confirm) {
    try {
      provider = createProviderFromEnv();
      authorAccountId = process.env.POSTPEER_LINKEDIN_ACCOUNT_ID!;
    } catch (err) {
      console.error(`\n🛑 ${(err as Error).message}`);
      return 1;
    }
  }

  const summary = await run({
    calendarPath: CALENDAR_PATH,
    publishedPath: PUBLISHED_PATH,
    today,
    confirm,
    provider,
    authorAccountId,
  });
  printSummary(summary);
  return summary.aborted ? 1 : 0;
}

async function cmdTokensStatus(): Promise<number> {
  console.log('Checking PostPeer key + LinkedIn personal-profile connection...\n');
  let provider;
  try {
    provider = createProviderFromEnv();
  } catch (err) {
    console.error(`🛑 ${(err as Error).message}`);
    return 1;
  }
  const status = await checkConnection(provider);
  console.log(`provider:       ${status.provider}`);
  console.log(`connection ok:  ${status.ok ? 'YES' : 'NO'}`);
  console.log(`detail:         ${status.detail}`);
  console.log(`days to expiry: ${status.daysUntilExpiry ?? 'n/a (PostPeer-managed)'}`);
  console.log(`needs re-auth:  ${status.needsReauth ? 'YES — re-link your LinkedIn profile on PostPeer' : 'no'}`);
  if (status.daysUntilExpiry !== null && status.daysUntilExpiry <= 7) {
    console.log('\n⚠ Connection/token expires within 7 days. Re-authorize before it lapses.');
  }
  return status.ok ? 0 : 1;
}

function cmdCalendarValidate(): number {
  const cal = loadCalendar(CALENDAR_PATH);
  if (cal.ok) {
    const byFormat: Record<string, number> = {};
    const approved = cal.posts.filter((p) => p.approved).length;
    for (const p of cal.posts) byFormat[p.format] = (byFormat[p.format] ?? 0) + 1;
    console.log(`✓ Calendar OK — ${cal.posts.length} posts.`);
    console.log(`  approved: ${approved}/${cal.posts.length}`);
    console.log(`  by format: ${Object.entries(byFormat).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    return 0;
  }
  console.error(`✗ Calendar INVALID — ${cal.errors.length} error(s):`);
  for (const e of cal.errors) console.error(`  ✗ ${e}`);
  return 1;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  let code = 0;
  switch (cmd) {
    case 'publish':
      code = await cmdPublish(rest);
      break;
    case 'tokens:status':
      code = await cmdTokensStatus();
      break;
    case 'calendar:validate':
      code = cmdCalendarValidate();
      break;
    default:
      console.log('Usage:');
      console.log('  tsx src/cli.ts publish [--confirm] [--date=YYYY-MM-DD]');
      console.log('  tsx src/cli.ts tokens:status');
      console.log('  tsx src/cli.ts calendar:validate');
      code = cmd ? 1 : 0;
  }
  process.exit(code);
}

main().catch((err) => {
  console.error(`\n🛑 Unexpected error: ${err?.stack ?? err}`);
  process.exit(1);
});
