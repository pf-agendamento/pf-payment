
const params = new URLSearchParams(location.search);

const rawPhone = params.get("phone") || "";
const amountRaw = params.get("amount") || "";
const recipientBank = params.get("bank") || "Газпромбанк";
const orderId = params.get("order") || "";

function normalizePhone(v){
  const digits = String(v).replace(/\D/g,"");
  if (digits.length === 11 && digits[0] === "8") return "7" + digits.slice(1);
  if (digits.length === 10) return "7" + digits;
  return digits;
}
function displayPhone(v){
  const d = normalizePhone(v);
  if (d.length !== 11) return v || "Не указан";
  return `+${d[0]} (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7,9)}-${d.slice(9,11)}`;
}
function formatAmount(v){
  const n = Number(String(v).replace(",","."));
  if (!Number.isFinite(n)) return v || "—";
  return new Intl.NumberFormat("ru-RU",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n) + " ₽";
}
function amountForClipboard(v){
  const n = Number(String(v).replace(",","."));
  return Number.isFinite(n) ? n.toFixed(2).replace(".",",") : v;
}
function showToast(text){
  const el = document.getElementById("toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>el.classList.remove("show"),2200);
}
async function copyText(text){
  if (!text) return false;
  try{
    await navigator.clipboard.writeText(text);
    return true;
  }catch(e){
    const ta=document.createElement("textarea");
    ta.value=text;
    ta.style.position="fixed";
    ta.style.opacity="0";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    let ok=false;
    try{ ok=document.execCommand("copy"); }catch(_){}
    ta.remove();
    return ok;
  }
}

const phone = normalizePhone(rawPhone);
document.getElementById("phone").textContent = displayPhone(phone);
document.getElementById("amount").textContent = formatAmount(amountRaw);
document.getElementById("amount2").textContent = formatAmount(amountRaw);
document.getElementById("recipientBank").textContent = recipientBank;
document.getElementById("recipientBank2").textContent = recipientBank;
document.getElementById("orderLine").textContent = orderId ? `Заявка #${orderId}` : "Оплата заявки";

/*
  Android: we launch the installed bank app by package name.
  This deliberately does NOT pretend that every bank supports a documented
  direct transfer deeplink. The number is copied first; the user pastes it
  into the bank's normal SBP/phone transfer screen.

  Package IDs below are verified against current RuStore listings for:
  Sber, T-Bank, VTB, Alfa, Gazprombank.
*/
const banks = [
  {name:"СберБанк", package:"ru.sberbankmobile"},
  {name:"Т-Банк", package:"com.idamob.tinkoff.android"},
  {name:"ВТБ", package:"ru.vtb24.mobilebanking.android"},
  {name:"Альфа-Банк", package:"ru.alfabank.mobile.android"},
  {name:"Газпромбанк", package:"ru.gazprombank.android.mobilebank.app"}
];

function isAndroid(){
  return /Android/i.test(navigator.userAgent);
}
function openAndroidPackage(packageName){
  // Opens app main activity when Android/Chrome supports intent://.
  // If the app is absent, the browser remains on the page.
  const fallback = encodeURIComponent(location.href + "#app-not-opened");
  location.href = `intent://open#Intent;package=${packageName};S.browser_fallback_url=${fallback};end`;
}
async function chooseBank(bank){
  const ok = await copyText("+" + phone);
  showToast(ok ? "Номер телефона скопирован" : "Скопируйте номер телефона");
  setTimeout(()=>{
    if (isAndroid()){
      openAndroidPackage(bank.package);
    }else{
      showToast("Номер скопирован. Откройте приложение банка.");
    }
  },220);
}

const holder = document.getElementById("banks");
banks.forEach(bank=>{
  const btn=document.createElement("button");
  btn.className="bankBtn";
  btn.innerHTML=`<span class="dot">${bank.name.slice(0,1)}</span><span>${bank.name}</span>`;
  btn.addEventListener("click",()=>chooseBank(bank));
  holder.appendChild(btn);
});

document.getElementById("copyPhone").addEventListener("click", async ()=>{
  const ok=await copyText("+"+phone);
  showToast(ok ? "Номер телефона скопирован" : "Не удалось скопировать автоматически");
});
document.getElementById("copyAmount").addEventListener("click", async ()=>{
  const ok=await copyText(amountForClipboard(amountRaw));
  showToast(ok ? "Сумма скопирована" : "Не удалось скопировать автоматически");
});
document.getElementById("otherBank").addEventListener("click", async ()=>{
  const ok=await copyText("+"+phone);
  showToast(ok ? "Номер скопирован. Откройте свой банк." : "Откройте свой банк и введите номер.");
});

// Best-effort auto-copy. Some browsers block clipboard without a user gesture,
// so the bank buttons always repeat the copy operation on click.
window.addEventListener("load", async ()=>{
  if (phone){
    const ok=await copyText("+"+phone);
    if(ok) showToast("Номер телефона скопирован");
  }
});
