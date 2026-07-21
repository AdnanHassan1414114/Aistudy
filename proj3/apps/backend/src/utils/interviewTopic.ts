/**
 * Quick Interview accepts a free-text message ("Take my Redis interview",
 * "Start a React interview", "Quiz me on System Design") instead of a
 * structured topic field. This strips the surrounding conversational
 * phrasing so what's left is the topic to embed/retrieve/search on.
 *
 * Deliberately simple regex stripping rather than an LLM call — an extra
 * AI round trip isn't justified just to remove "take my"/"interview".
 * Falls back to the trimmed original message if nothing matches, so a
 * bare topic like "Redis" still works.
 */
const LEADING_PHRASES =
  /^(let'?s\s+)?(take|start|begin|do|give\s+me|quiz\s+me\s+on|test\s+me\s+on)\s+(my\s+|a\s+|an\s+|the\s+)?/i;
const TRAILING_PHRASES = /\s+(interview|quiz|test|assessment|session)s?$/i;

export function extractTopicFromMessage(message: string): string {
  let topic = message.trim();

  topic = topic.replace(LEADING_PHRASES, "");
  topic = topic.replace(TRAILING_PHRASES, "");
  topic = topic.trim();

  return topic.length > 0 ? topic : message.trim();
}
