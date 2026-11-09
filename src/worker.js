const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const TEXT_MODEL = "@cf/zai-org/glm-4.7-flash";
const VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});}
function b64urlToBytes(value){const base64=value.replace(/-/g,"+").replace(/_/g,"/");const padded=base64+"=".repeat((4-base64.length%4)%4);return Uint8Array.from(atob(padded),c=>c.charCodeAt(0));}
async function verifyGoogleToken(token,clientId){
  if(!token||!clientId)throw new Error("Thiếu thông tin đăng nhập.");
  const parts=token.split(".");if(parts.length!==3)throw new Error("Token không hợp lệ.");
  const header=JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));const payload=JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
  if(header.alg!=="RS256"||!header.kid)throw new Error("Chữ ký token không hợp lệ.");
  const keysResponse=await fetch("https://www.googleapis.com/oauth2/v3/certs");if(!keysResponse.ok)throw new Error("Không xác minh được tài khoản Google.");
  const keys=await keysResponse.json();const jwk=keys.keys.find(k=>k.kid===header.kid);if(!jwk)throw new Error("Không tìm thấy khóa xác minh.");
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const valid=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,b64urlToBytes(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1]));
  const now=Math.floor(Date.now()/1000);
  if(!valid||payload.aud!==clientId||!["accounts.google.com","https://accounts.google.com"].includes(payload.iss)||payload.exp<now||payload.email_verified!==true||!payload.sub)throw new Error("Phiên đăng nhập Google không hợp lệ.");
  return payload;
}
async function auth(request,env){const h=request.headers.get("authorization")||"";return verifyGoogleToken(h.startsWith("Bearer ")?h.slice(7):"",env.GOOGLE_CLIENT_ID);}
function newId(){return crypto.randomUUID();}
function cleanText(value,max=4000){return String(value||"").trim().slice(0,max);}
function systemPrompt(prefs){return `Bạn là HN AI, trợ lý học tập tiếng Việt dành cho học sinh lớp 6 đến lớp 9.
Phong cách: thân thiện, rõ ràng, tôn trọng, dùng từ ngữ phù hợp trường học; không dùng lời tục tĩu.
Ưu tiên giải thích dễ hiểu theo từng bước, nêu công thức và ví dụ khi cần. Không bịa dữ kiện, số liệu, trích dẫn hoặc nguồn. Nếu chưa chắc chắn, hãy nói rõ phần chưa chắc và gợi ý cách kiểm tra trong sách giáo khoa/tài liệu chính thức.
Nếu người học cung cấp lớp ${prefs.grade||"chưa chọn"}, điều chỉnh độ khó tương ứng. Cách học mong muốn: ${prefs.learningStyle||"giải thích từng bước"}. Môn quan tâm: ${prefs.interests||"chưa chọn"}.
Khi kết thúc câu trả lời, thêm một mục ngắn có tiêu đề "Thông tin quan trọng cần tìm hiểu thêm" và nêu một ý liên quan để học tiếp. Không giả vờ đã tra cứu Internet nếu chưa dùng công cụ tìm kiếm.`;}
async function handleApi(request,env){
  const url=new URL(request.url);
  if(url.pathname==="/api/health"&&request.method==="GET")return json({ok:true,app:"HN AI",textModel:TEXT_MODEL,visionModel:VISION_MODEL});
  let user;try{user=await auth(request,env);}catch(e){return json({error:e.message||"Cần đăng nhập Google."},401);}
  try{
    await env.DB.prepare(`INSERT INTO users (google_sub,email,display_name) VALUES (?,?,?) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,updated_at=CURRENT_TIMESTAMP`).bind(user.sub,user.email,user.name||"").run();
    if(url.pathname==="/api/me"&&request.method==="GET"){
      const row=await env.DB.prepare("SELECT email,display_name,preferences_json FROM users WHERE google_sub=?").bind(user.sub).first();return json({user:row});
    }
    if(url.pathname==="/api/preferences"&&request.method==="PUT"){
      const body=await request.json();const prefs={learningStyle:cleanText(body.learningStyle,300),interests:cleanText(body.interests,300),grade:cleanText(body.grade,40)};
      await env.DB.prepare("UPDATE users SET preferences_json=?,updated_at=CURRENT_TIMESTAMP WHERE google_sub=?").bind(JSON.stringify(prefs),user.sub).run();return json({ok:true});
    }
    if(url.pathname==="/api/chats"&&request.method==="GET"){
      const rows=await env.DB.prepare("SELECT id,title,created_at FROM chats WHERE google_sub=? ORDER BY created_at DESC LIMIT 50").bind(user.sub).all();return json({chats:rows.results||[]});
    }
    if(url.pathname==="/api/chat"&&request.method==="POST"){
      const body=await request.json();const message=cleanText(body.message,4000);const imageData=typeof body.imageData==="string"?body.imageData:"";
      if(!message&&!imageData)return json({error:"Bạn hãy nhập câu hỏi hoặc đính kèm một hình ảnh."},400);
      if(imageData&&(!/^data:image\/(png|jpeg|webp);base64,/.test(imageData)||imageData.length>5_700_000))return json({error:"Ảnh không hợp lệ hoặc vượt quá giới hạn 4 MB."},400);
      const today=new Date().toISOString().slice(0,10);
      const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE google_sub=? AND role='user' AND created_at >= ?").bind(user.sub,today).first();
      if((count?.n||0)>=60)return json({error:"Bạn đã đạt giới hạn 60 tin nhắn/ngày."},429);
      let chatId=cleanText(body.chatId,80);
      if(chatId){const owned=await env.DB.prepare("SELECT id FROM chats WHERE id=? AND google_sub=?").bind(chatId,user.sub).first();if(!owned)return json({error:"Không tìm thấy cuộc trò chuyện."},404);}
      else{chatId=newId();await env.DB.prepare("INSERT INTO chats (id,google_sub,title) VALUES (?,?,?)").bind(chatId,user.sub,(message||"Phân tích hình ảnh").slice(0,60)).run();}
      const storedMessage=message||(imageData?"[Người dùng gửi hình ảnh]":"");
      await env.DB.prepare("INSERT INTO messages (chat_id,google_sub,role,content) VALUES (?,?,?,?)").bind(chatId,user.sub,"user",storedMessage).run();
      const prefRow=await env.DB.prepare("SELECT preferences_json FROM users WHERE google_sub=?").bind(user.sub).first();let prefs={};try{prefs=JSON.parse(prefRow?.preferences_json||"{}");}catch{}
      const recent=await env.DB.prepare("SELECT role,content FROM messages WHERE chat_id=? AND google_sub=? ORDER BY id DESC LIMIT 12").bind(chatId,user.sub).all();
      const history=(recent.results||[]).reverse().map(m=>({role:m.role==="assistant"?"assistant":"user",content:m.content}));
      let answer="";
      try{
        if(imageData){
          const imagePrompt=message||"Hãy mô tả và phân tích hình ảnh này để hỗ trợ việc học. Nếu là bài tập, hãy đọc lại đề, nêu dữ kiện nhìn thấy và hướng dẫn giải dễ hiểu. Nếu chữ hoặc hình không rõ, hãy nói rõ, không tự đoán.";
          const result=await env.AI.run(VISION_MODEL,{messages:[{role:"system",content:systemPrompt(prefs)},{role:"user",content:imagePrompt}],image:imageData,max_tokens:900,temperature:0.2});
          answer=result.response||result.output_text||"Mình chưa phân tích được ảnh. Bạn thử gửi ảnh rõ hơn nhé.";
        }else{
          const result=await env.AI.run(TEXT_MODEL,{messages:[{role:"system",content:systemPrompt(prefs)},...history],max_tokens:900,temperature:0.25});
          answer=result.response||result.output_text||"Mình chưa tạo được câu trả lời.";
        }
      }catch(e){console.error("Workers AI error",e);return json({error:imageData?"Chưa phân tích được ảnh. Hãy kiểm tra quyền sử dụng mô hình Vision và thử lại.":"AI đang bận hoặc mô hình chưa bật. Hãy kiểm tra Workers AI trong Cloudflare."},503);}
      await env.DB.prepare("INSERT INTO messages (chat_id,google_sub,role,content) VALUES (?,?,?,?)").bind(chatId,user.sub,"assistant",answer).run();
      return json({chatId,answer});
    }
    if(url.pathname.startsWith("/api/chats/")&&request.method==="GET"){
      const id=url.pathname.split("/").pop();const rows=await env.DB.prepare("SELECT role,content,created_at FROM messages WHERE chat_id=? AND google_sub=? ORDER BY id ASC LIMIT 100").bind(id,user.sub).all();return json({messages:rows.results||[]});
    }
    if(url.pathname==="/api/account"&&request.method==="DELETE"){
      await env.DB.prepare("DELETE FROM messages WHERE google_sub=?").bind(user.sub).run();await env.DB.prepare("DELETE FROM chats WHERE google_sub=?").bind(user.sub).run();await env.DB.prepare("DELETE FROM users WHERE google_sub=?").bind(user.sub).run();return json({ok:true});
    }
    return json({error:"Không tìm thấy API."},404);
  }catch(e){console.error("API error",e);return json({error:"Máy chủ chưa sẵn sàng. Hãy kiểm tra cấu hình D1 và nhật ký Worker."},500);}
}
export default{async fetch(request,env){const url=new URL(request.url);if(url.pathname.startsWith("/api/"))return handleApi(request,env);return env.ASSETS.fetch(request);}};
