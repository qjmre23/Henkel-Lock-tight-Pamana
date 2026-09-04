#!/usr/bin/env node
/**
 * Finds the numeric Telegram chat_id for the visit notifier, and optionally
 * sends a test message.
 *
 * The Bot API cannot message a person by @username -- it needs a numeric id,
 * and you must press Start on the bot first so it is allowed to write to you.
 *
 * Usage:
 *   1) Open Telegram, find your bot, press Start (or send it any message).
 *   2) node scripts/telegram-chat-id.mjs <BOT_TOKEN>
 *   3) Put the printed id into the `metrics_tag` env var in Netlify.
 *   4) Optional test:  node scripts/telegram-chat-id.mjs <BOT_TOKEN> <CHAT_ID>
 */

const token = process.argv[2] || process.env.locktight_dashboard || process.env.TELEGRAM_BOT_TOKEN;
const testChat = process.argv[3];

if (!token) {
  console.error("Usage: node scripts/telegram-chat-id.mjs <BOT_TOKEN> [CHAT_ID]");
  process.exit(1);
}
const api = (m) => `https://api.telegram.org/bot${token}/${m}`;

const me = await fetch(api("getMe")).then((r) => r.json()).catch(() => null);
if (!me?.ok) {
  console.error("Bot token rejected by Telegram:", me?.description || "no response");
  process.exit(1);
}
console.log(`Bot OK: @${me.result.username} (${me.result.first_name})`);

if (testChat) {
  const r = await fetch(api("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: testChat, text: "PAMANA visit notifier: test message. If you can read this, it works." }),
  }).then((x) => x.json());
  console.log(r.ok ? `Test message delivered to ${testChat}` : `FAILED: ${r.description}`);
  process.exit(r.ok ? 0 : 1);
}

const upd = await fetch(api("getUpdates")).then((r) => r.json());
if (!upd.ok) {
  console.error("getUpdates failed:", upd.description);
  process.exit(1);
}
const chats = new Map();
for (const u of upd.result || []) {
  const c = u.message?.chat || u.channel_post?.chat || u.my_chat_member?.chat;
  if (c) chats.set(c.id, c);
}
if (!chats.size) {
  console.log("\nNo chats found yet. Open Telegram, send your bot any message (or press Start), then run this again.");
  console.log("Note: getUpdates returns nothing while a webhook is set -- clear it with deleteWebhook if so.");
  process.exit(0);
}
console.log("\nChats that have messaged this bot:");
for (const [id, c] of chats) {
  const who = c.username ? `@${c.username}` : [c.first_name, c.last_name].filter(Boolean).join(" ") || c.title || "";
  console.log(`  chat_id = ${id}   (${c.type}) ${who}`);
}
console.log("\nPut the chat_id above into the `metrics_tag` environment variable in Netlify.");
