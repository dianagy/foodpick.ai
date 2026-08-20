// Supabase Edge Function: chat-craving
//
// Proxies conversational requests to the Anthropic API so the API key never
// reaches the browser. Set the key as a secret with:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// The client posts to this function's public URL directly with fetch() — no
// Supabase JS SDK in the browser. Deploy it without JWT verification so the
// page can call it anonymously:
//   supabase functions deploy chat-craving --no-verify-jwt
// then paste the printed URL into CHAT_ENDPOINT in foodpick-ai.html
// (and foodpick-ai-no-image.html).
//
// Note: --no-verify-jwt means anyone with the URL can spend your API budget.
// Add rate limiting before sharing it publicly.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-haiku-4-5-20251001"; // cheap + fast, plenty capable for this task

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Kept intentionally small and specific: the model must always reply with a
// single JSON object matching one of these two shapes. This keeps the client
// simple (no free-text parsing) and keeps the guardrails from the project's
// handoff doc (Section 9) enforced at the prompt level.
const SYSTEM_PROMPT = `You are foodpick.ai's food-craving and takeout decision agent. Help people who don't know what they want to eat. Ask concise, friendly questions when you need more signal — mood, cravings, budget, dietary restrictions, how hungry they are, how long they can wait. Don't ask more than one or two questions before making a call; people want a decisive answer, not an interrogation.

Once you have enough signal, recommend ONE specific dish. Never invent claims about specific real restaurants, live menus, prices, or availability — you are suggesting a type of dish, not verifying what's actually on a menu nearby. The app will handle showing the person real nearby places to search for it.

Respond ONLY with a single JSON object, no other text, no markdown fences, matching exactly one of these shapes:

Still gathering info or just chatting:
{"type":"message","reply":"<your conversational response, ask at most one focused question>"}

Ready to recommend:
{"type":"recommendation","reply":"<1-2 sentence explanation tied to what they told you>","dish":{"name":"<dish name>","cuisine":"<cuisine or style>","emoji":"<single relevant emoji>","desc":"<one short punchy sentence matching the voice below>","query":"<dish name> delivery near me"}}

Voice: direct and warm, no slang or forced enthusiasm. Keep every reply short — this is a quick chat on a phone screen, not an essay.

If someone describes symptoms suggesting they may be unwell beyond just hungry (not just "hungover" or "tired"), don't diagnose — gently suggest they consider whether food is really what they need right now, and keep any food suggestion gentle and simple (plain, easy-to-digest options) rather than heavy or spicy.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ type: "message", reply: "Chat backend is missing its API key. Set ANTHROPIC_API_KEY as a Supabase secret." }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, status: 200 }
    );
  }

  try {
    const { messages } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ type: "message", reply: "Tell me what you're craving to get started." }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const anthropicMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: anthropicMessages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      return new Response(
        JSON.stringify({ type: "message", reply: "The kitchen's having a moment — try again in a second." }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const textBlock = data.content?.find((b: { type: string }) => b.type === "text");
    const rawText = textBlock?.text || "";

    let parsed;
    try {
      // Strip markdown fences defensively in case the model adds them despite instructions.
      const cleaned = rawText.replace(/^```json\s*|\s*```$/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("Failed to parse model output as JSON:", rawText);
      parsed = { type: "message", reply: "Sorry, I got a bit tongue-tied there — could you say that again?" };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("chat-craving function error:", e);
    return new Response(
      JSON.stringify({ type: "message", reply: "Something went wrong on my end. Try again?" }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, status: 200 }
    );
  }
});
