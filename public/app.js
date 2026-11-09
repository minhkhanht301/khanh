const CLIENT_ID = "1088685907571-omeself92bfujjfh05s70gemvp20pcsi.apps.googleusercontent.com";
const $ = id => document.getElementById(id);
let credential = null, currentChat = null;

function api(path, options={}) {
  return fetch(path, { ...options, headers: {
    "content-type":"application/json",
    ...(credential ? {authorization:"Bearer "+credential} : {}),
    ...(options.headers||{})
  }});
}
function showLoggedIn(on) {
  $("loginPanel").classList.toggle("hidden", on);
  $("appPanel").classList.toggle("hidden", !on);
  $("signOut").classList.toggle("hidden", !on);
}
function addBubble(role, content) {
  const welcome = document.querySelector(".welcome");
  if (welcome) welcome.remove();
  const el = document.createElement("div");
  el.className = "bubble " + role;
  el.textContent = content;
  $("messages").appendChild(el);
  $("messages").scrollTop = $("messages").scrollHeight;
}
async function onGoogleCredential(response) {
  credential = response.credential;
  try {
    const r = await api("/api/me");
    if (!r.ok) throw new Error("Đăng nhập chưa thành công.");
    const data = await r.json();
    $("userName").textContent = data.user.display_name || data.user.email;
    let prefs = {};
    try { prefs = JSON.parse(data.user.preferences_json || "{}"); } catch {}
    $("grade").value = prefs.grade || "";
    $("writingStyle").value = prefs.writingStyle || "";
    $("learningStyle").value = prefs.learningStyle || "";
    $("interests").value = prefs.interests || "";
    showLoggedIn(true);
    await loadChats();
  } catch (e) { alert(e.message); credential = null; }
}
window.onGoogleCredential = onGoogleCredential;

function initGoogle() {
  if (!window.google?.accounts?.id) return setTimeout(initGoogle, 300);
  if (CLIENT_ID.startsWith("REPLACE_")) {
    $("googleButton").innerHTML = '<p class="muted">Cần cấu hình Google OAuth Client ID trong public/app.js và wrangler.toml theo README.</p>';
    return;
  }
  google.accounts.id.initialize({client_id:CLIENT_ID,callback:onGoogleCredential});
  google.accounts.id.renderButton($("googleButton"),{theme:"filled_black",size:"large",shape:"pill",text:"continue_with"});
}
initGoogle();

async function loadChats() {
  const r = await api("/api/chats");
  if (!r.ok) return;
  const data = await r.json();
  $("chatList").replaceChildren();
  data.chats.forEach(chat => {
    const el = document.createElement("div");
    el.className = "chat-item";
    el.textContent = chat.title;
    el.onclick = () => openChat(chat.id);
    $("chatList").appendChild(el);
  });
}
async function openChat(id) {
  currentChat = id;
  $("messages").replaceChildren();
  const r = await api("/api/chats/"+encodeURIComponent(id));
  const data = await r.json();
  (data.messages||[]).forEach(m => addBubble(m.role,m.content));
}
$("newChat").onclick = () => { currentChat=null; $("messages").innerHTML='<div class="welcome">✦<h2>Cuộc trò chuyện mới</h2><p>Hãy nhập câu hỏi đầu tiên bên dưới.</p></div>'; };
$("savePrefs").onclick = async () => {
  const r = await api("/api/preferences",{method:"PUT",body:JSON.stringify({
    grade:$("grade").value,writingStyle:$("writingStyle").value,
    learningStyle:$("learningStyle").value,interests:$("interests").value
  })});
  alert(r.ok ? "Đã lưu hồ sơ cá nhân." : "Không thể lưu hồ sơ.");
};
$("chatForm").onsubmit = async e => {
  e.preventDefault();
  const message = $("prompt").value.trim();
  if (!message || !credential) return;
  $("prompt").value = "";
  addBubble("user",message);
  const pending = document.createElement("div");
  pending.className = "bubble assistant"; pending.textContent = "KHANH AI đang suy nghĩ...";
  $("messages").appendChild(pending);
  const r = await api("/api/chat",{method:"POST",body:JSON.stringify({message,chatId:currentChat})});
  const data = await r.json();
  pending.remove();
  if (!r.ok) addBubble("assistant",data.error || "Đã xảy ra lỗi.");
  else { currentChat=data.chatId; addBubble("assistant",data.answer); await loadChats(); }
};
$("signOut").onclick = () => { credential=null; currentChat=null; showLoggedIn(false); $("messages").replaceChildren(); };
