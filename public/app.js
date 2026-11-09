const CLIENT_ID = "1088685907571-omeself92bfujjfh05s70gemvp20pcsi.apps.googleusercontent.com";
const $ = id => document.getElementById(id);
let credential = null, currentChat = null, selectedImage = null;

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
  $("learn").classList.toggle("hidden", !on);
  $("signOut").classList.toggle("hidden", !on);
}
function addBubble(role, content, imageUrl=null) {
  const empty = document.querySelector(".empty-state");
  if (empty) empty.remove();
  const el = document.createElement("div");
  el.className = "bubble " + role;
  if (imageUrl) { const img=document.createElement("img"); img.src=imageUrl; img.alt="Ảnh bài tập đã gửi"; el.appendChild(img); }
  const text=document.createElement("div"); text.textContent=content; el.appendChild(text);
  if (role === "assistant") {
    const extra=document.createElement("div"); extra.className="answer-extra";
    const label=document.createElement("b"); label.textContent="Thông tin quan trọng cần tìm hiểu thêm";
    const note=document.createElement("span"); note.textContent="Hãy đối chiếu kiến thức với sách giáo khoa hoặc nguồn đáng tin cậy khi cần.";
    extra.append(label,note); el.appendChild(extra);
  }
  $("messages").appendChild(el); $("messages").scrollTop=$("messages").scrollHeight;
}
async function onGoogleCredential(response) {
  credential = response.credential;
  try {
    const r = await api("/api/me");
    if (!r.ok) throw new Error("Đăng nhập chưa thành công. Hãy kiểm tra cấu hình Google và nhật ký Worker.");
    const data = await r.json();
    $("userName").textContent = data.user.display_name || data.user.email || "bạn";
    let prefs = {}; try { prefs = JSON.parse(data.user.preferences_json || "{}"); } catch {}
    $("grade").value = prefs.grade || "";
    $("learningStyle").value = prefs.learningStyle || "";
    $("interests").value = prefs.interests || "";
    showLoggedIn(true); await loadChats();
  } catch (e) { alert(e.message); credential = null; }
}
window.onGoogleCredential = onGoogleCredential;
function initGoogle() {
  if (!window.google?.accounts?.id) return setTimeout(initGoogle,300);
  if (!CLIENT_ID || CLIENT_ID.startsWith("REPLACE_")) {
    $("googleButton").textContent="Cần cấu hình Google OAuth Client ID"; return;
  }
  google.accounts.id.initialize({client_id:CLIENT_ID,callback:onGoogleCredential});
  google.accounts.id.renderButton($("googleButton"),{theme:"outline",size:"large",shape:"pill",text:"continue_with",locale:"vi"});
}
initGoogle();

async function loadChats() {
  const r=await api("/api/chats"); if(!r.ok)return;
  const data=await r.json(); $("chatList").replaceChildren();
  if(!data.chats?.length){const p=document.createElement("p");p.className="side-empty";p.textContent="Chưa có cuộc trò chuyện."; $("chatList").appendChild(p);return;}
  data.chats.forEach(chat=>{const el=document.createElement("button");el.className="chat-item";el.textContent=chat.title;el.onclick=()=>openChat(chat.id);$("chatList").appendChild(el);});
}
async function openChat(id) {
  currentChat=id; $("messages").replaceChildren();
  const r=await api("/api/chats/"+encodeURIComponent(id)); const data=await r.json();
  (data.messages||[]).forEach(m=>addBubble(m.role,m.content));
}
function clearImage(){selectedImage=null;$("imageInput").value="";$("imagePreview").classList.add("hidden");$("previewImage").src="";}
$("newChat").onclick=()=>{currentChat=null;$("messages").innerHTML='<div class="empty-state"><div class="empty-icon">✧</div><h2>Cuộc trò chuyện mới</h2><p>Hãy nhập câu hỏi đầu tiên bên dưới.</p></div>';clearImage();$("sidebar").classList.remove("open");};
$("mobileMenu").onclick=()=>$("sidebar").classList.toggle("open");
$("skipPrefs").onclick=()=>$("profileCard").classList.add("hidden");
$("savePrefs").onclick=async()=>{
  const r=await api("/api/preferences",{method:"PUT",body:JSON.stringify({grade:$("grade").value,learningStyle:$("learningStyle").value,interests:$("interests").value})});
  alert(r.ok?"Đã lưu lựa chọn học tập.":"Chưa thể lưu. Vui lòng thử lại.");
};
$("attachImage").onclick=()=>$("imageInput").click();
$("imageInput").onchange=()=>{
  const file=$("imageInput").files?.[0]; if(!file)return;
  if(!["image/jpeg","image/png","image/webp"].includes(file.type)){alert("Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.");clearImage();return;}
  if(file.size>4*1024*1024){alert("Ảnh vượt quá 4 MB. Hãy chọn ảnh nhỏ hơn.");clearImage();return;}
  selectedImage=file; $("previewImage").src=URL.createObjectURL(file); $("imageName").textContent=file.name; $("imagePreview").classList.remove("hidden");
};
$("removeImage").onclick=clearImage;
function fileToDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});}
$("chatForm").onsubmit=async e=>{
  e.preventDefault(); const message=$("prompt").value.trim(); if((!message&&!selectedImage)||!credential)return;
  const image=selectedImage; const imageUrl=image?URL.createObjectURL(image):null;
  $("prompt").value=""; addBubble("user",message||"Hãy phân tích hình ảnh này.",imageUrl);
  const pending=document.createElement("div");pending.className="bubble assistant";pending.textContent="HN AI đang suy nghĩ...";$("messages").appendChild(pending);
  const submit=$(".send-button");submit.disabled=true;
  try{
    const imageData=image?await fileToDataUrl(image):null;
    const r=await api("/api/chat",{method:"POST",body:JSON.stringify({message,chatId:currentChat,imageData,imageMime:image?.type||null})});
    const data=await r.json();pending.remove();
    if(!r.ok)addBubble("assistant",data.error||"Đã xảy ra lỗi. Vui lòng thử lại.");
    else{currentChat=data.chatId;addBubble("assistant",data.answer);await loadChats();}
  }catch(err){pending.remove();addBubble("assistant","Không thể kết nối máy chủ. Hãy kiểm tra mạng và thử lại.");}
  finally{submit.disabled=false;clearImage();if(imageUrl)URL.revokeObjectURL(imageUrl);}
};
document.querySelectorAll("[data-prompt]").forEach(btn=>btn.onclick=()=>{$("prompt").value=btn.dataset.prompt;$("prompt").focus();window.scrollTo({top:document.body.scrollHeight,behavior:"smooth"});});
$("signOut").onclick=()=>{credential=null;currentChat=null;showLoggedIn(false);$("messages").replaceChildren();};
