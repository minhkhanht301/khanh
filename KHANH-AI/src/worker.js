const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function b64urlToBytes(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

async function verifyGoogleToken(token, clientId) {
  if (!token || !clientId) throw new Error("Thiếu thông tin đăng nhập.");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Token không hợp lệ.");
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
  if (header.alg !== "RS256" || !header.kid) throw new Error("Chữ ký token không hợp lệ.");

  const keysResponse = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!keysResponse.ok) throw new Error("Không xác minh được tài khoản Google.");
  const keys = await keysResponse.json();
  const jwk = keys.keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error("Không tìm thấy khóa xác minh.");

  const key = await crypto.subtle.importKey(
    "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]
  );
  const signed = new TextEncoder().encode(parts[0] + "." + parts[1]);
  const signature = b64urlToBytes(parts[2]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signed);
  const now = Math.floor(Date.now() / 1000);

  if (!valid || payload.aud !== clientId ||
      !["accounts.google.com", "https://accounts.google.com"].includes(payload.iss) ||
      payload.exp < now || payload.email_verified !== true || !payload.sub) {
    throw new Error("Phiên đăng nhập Google không hợp lệ.");
  }
  return payload;
}

async function auth(request, env) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return await verifyGoogleToken(token, env.GOOGLE_CLIENT_ID);
}

function newId() {
  return crypto.randomUUID();
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/health" && request.method === "GET") {
    return json({ ok: true, app: "KHANH AI" });
  }

  let user;
  try {
    user = await auth(request, env);
  } catch (e) {
    return json({ error: e.message || "Cần đăng nhập Google." }, 401);
  }

  await env.DB.prepare(
    `INSERT INTO users (google_sub,email,display_name)
     VALUES (?,?,?)
     ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email,
     display_name=excluded.display_name, updated_at=CURRENT_TIMESTAMP`
  ).bind(user.sub, user.email, user.name || "").run();

  if (url.pathname === "/api/me" && request.method === "GET") {
    const row = await env.DB.prepare(
      "SELECT email, display_name, preferences_json FROM users WHERE google_sub=?"
    ).bind(user.sub).first();
    return json({ user: row });
  }

  if (url.pathname === "/api/preferences" && request.method === "PUT") {
    const body = await request.json();
    const preferences = {
      writingStyle: String(body.writingStyle || "").slice(0, 500),
      learningStyle: String(body.learningStyle || "").slice(0, 500),
      interests: String(body.interests || "").slice(0, 500),
      grade: String(body.grade || "").slice(0, 40)
    };
    await env.DB.prepare(
      "UPDATE users SET preferences_json=?, updated_at=CURRENT_TIMESTAMP WHERE google_sub=?"
    ).bind(JSON.stringify(preferences), user.sub).run();
    return json({ ok: true });
  }

  if (url.pathname === "/api/chats" && request.method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT id,title,created_at FROM chats WHERE google_sub=? ORDER BY created_at DESC LIMIT 50"
    ).bind(user.sub).all();
    return json({ chats: rows.results || [] });
  }

  if (url.pathname === "/api/chat" && request.method === "POST") {
    const body = await request.json();
    const message = String(body.message || "").trim().slice(0, 4000);
    if (!message) return json({ error: "Bạn chưa nhập nội dung." }, 400);

    const today = new Date().toISOString().slice(0, 10);
    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM messages WHERE google_sub=? AND role='user'
       AND created_at >= ?`
    ).bind(user.sub, today).first();
    if ((count?.n || 0) >= 60) return json({ error: "Bạn đã đạt giới hạn 60 tin nhắn/ngày." }, 429);

    let chatId = String(body.chatId || "");
    if (chatId) {
      const owned = await env.DB.prepare(
        "SELECT id FROM chats WHERE id=? AND google_sub=?"
      ).bind(chatId, user.sub).first();
      if (!owned) return json({ error: "Không tìm thấy cuộc trò chuyện." }, 404);
    } else {
      chatId = newId();
      await env.DB.prepare(
        "INSERT INTO chats (id,google_sub,title) VALUES (?,?,?)"
      ).bind(chatId, user.sub, message.slice(0, 60)).run();
    }

    await env.DB.prepare(
      "INSERT INTO messages (chat_id,google_sub,role,content) VALUES (?,?,?,?)"
    ).bind(chatId, user.sub, "user", message).run();

    const prefRow = await env.DB.prepare(
      "SELECT preferences_json FROM users WHERE google_sub=?"
    ).bind(user.sub).first();
    let prefs = {};
    try { prefs = JSON.parse(prefRow?.preferences_json || "{}"); } catch {}

    const recent = await env.DB.prepare(
      "SELECT role,content FROM messages WHERE chat_id=? AND google_sub=? ORDER BY id DESC LIMIT 12"
    ).bind(chatId, user.sub).all();
    const history = (recent.results || []).reverse().map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content
    }));
    const system = `Bạn là KHANH AI, trợ lý học tập và trò chuyện thân thiện, trả lời bằng tiếng Việt khi phù hợp.
Cá nhân hóa theo hồ sơ người dùng nếu có: lớp ${prefs.grade || "chưa cung cấp"}; cách viết ${prefs.writingStyle || "chưa cung cấp"}; cách học ${prefs.learningStyle || "chưa cung cấp"}; sở thích ${prefs.interests || "chưa cung cấp"}.
Giải thích rõ ràng, không bịa thông tin. Nếu không biết, hãy nói rõ.`;
    let answer = "";
    try {
      const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [{ role: "system", content: system }, ...history]
      });
      answer = result.response || result.output_text || "Mình chưa tạo được câu trả lời.";
    } catch (e) {
      return json({ error: "AI đang bận hoặc mô hình chưa được bật. Hãy kiểm tra Workers AI trong Cloudflare." }, 503);
    }

    await env.DB.prepare(
      "INSERT INTO messages (chat_id,google_sub,role,content) VALUES (?,?,?,?)"
    ).bind(chatId, user.sub, "assistant", answer).run();
    return json({ chatId, answer });
  }

  if (url.pathname.startsWith("/api/chats/") && request.method === "GET") {
    const id = url.pathname.split("/").pop();
    const rows = await env.DB.prepare(
      "SELECT role,content,created_at FROM messages WHERE chat_id=? AND google_sub=? ORDER BY id ASC LIMIT 100"
    ).bind(id, user.sub).all();
    return json({ messages: rows.results || [] });
  }

  if (url.pathname === "/api/account" && request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM messages WHERE google_sub=?").bind(user.sub).run();
    await env.DB.prepare("DELETE FROM chats WHERE google_sub=?").bind(user.sub).run();
    await env.DB.prepare("DELETE FROM users WHERE google_sub=?").bind(user.sub).run();
    return json({ ok: true });
  }

  return json({ error: "Không tìm thấy API." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  }
};
