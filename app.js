
const params = new URLSearchParams(location.search);

const DEFAULT_PHONE = "79296029876";
const DEFAULT_RECIPIENT_BANK = "Газпромбанк";

const rawPhone = params.get("phone") || DEFAULT_PHONE;
const amountRaw = params.get("amount") || "";
const recipientBank = params.get("bank") || DEFAULT_RECIPIENT_BANK;
const orderId = params.get("order") || "";

function normalizePhone(v){
  const digits = String(v || "").replace(/\D/g,"");
  if (digits.length === 11 && digits[0] === "8") return "7" + digits.slice(1);
  if (digits.length === 10) return "7" + digits;
  return digits;
}
function displayPhone(v){
  const d = normalizePhone(v);
  if (d.length !== 11) return v || "Не указан";
  return `+${d[0]} (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7,9)}-${d.slice(9,11)}`;
}
function parseAmount(v){
  const n = Number(String(v || "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function formatAmount(v){
  const n = parseAmount(v);
  if (n === null) return "—";
  return new Intl.NumberFormat("ru-RU",{
    minimumFractionDigits:2,
    maximumFractionDigits:2
  }).format(n) + " ₽";
}
function amountForLink(v){
  const n = parseAmount(v);
  return n === null ? "" : n.toFixed(2);
}
function amountForClipboard(v){
  const n = parseAmount(v);
  return n === null ? "" : n.toFixed(2).replace(".", ",");
}
function showToast(text){
  const el = document.getElementById("toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>el.classList.remove("show"),2200);
}
function copyTextSync(text){
  if (!text) return false;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  ta.style.top = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, ta.value.length);
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (_) {}
  ta.remove();
  if (!ok && navigator.clipboard && window.isSecureContext) {
    try { navigator.clipboard.writeText(text); ok = true; } catch (_) {}
  }
  return ok;
}

const phone = normalizePhone(rawPhone);
const amountLink = amountForLink(amountRaw);

document.getElementById("phone").textContent = displayPhone(phone);
document.getElementById("amount").textContent = formatAmount(amountRaw);
document.getElementById("amount2").textContent = formatAmount(amountRaw);
document.getElementById("recipientBank").textContent = recipientBank;
document.getElementById("recipientBank2").textContent = recipientBank;
document.getElementById("orderLine").textContent =
  orderId ? `Заявка #${orderId}` : "Оплата заявки";

function tbankLinks(){
  // В v0.4 намеренно НЕ передаём bankMemberId и workflowType.
  // Они вызывали ложное предупреждение "Клиент с таким номером не найден",
  // хотя после закрытия экран перевода заполнялся правильно.
  const q =
    `PayByMobileNumber?numberPhone=%2B${phone}` +
    `&amount=${encodeURIComponent(amountLink)}`;
  return [
    `tbank://Main/${q}`,
    `bank100000000004://Main/${q}`,
    `tinkoffbank://Main/${q}`
  ];
}

function tbankWebFallback(){
  const predefined = encodeURIComponent(JSON.stringify({
    moneyAmount: amountLink,
    phone: `+${phone}`
  }));
  const required = encodeURIComponent('["accountId"]');
  return `https://www.tbank.ru/mybank/payments/persons/phone/?predefined=${predefined}&requiredParams=${required}`;
}

const banks = [
  {
    name:"СберБанк",
    // Возвращаем ровно тот способ запуска, который работал в самой первой версии:
    // открываем приложение по Android package, без deep-link маршрута.
    package:"ru.sberbankmobile"
  },
  {
    name:"Т-Банк",
    links:tbankLinks(),
    fallback:tbankWebFallback()
  },
  {
    name:"ВТБ",
    links:["bank110000000005://"]
  },
  {
    name:"Альфа-Банк",
    links:["alfabank://","bank100000000008://"]
  },
  {
    name:"Газпромбанк",
    links:["bank100000000001://"]
  }
];

function tryLinksSequentially(links, fallback){
  if (!links || !links.length) {
    if (fallback) location.href = fallback;
    return;
  }
  let i = 0;
  const next = () => {
    if (i >= links.length) {
      if (fallback) location.href = fallback;
      return;
    }
    location.href = links[i++];
    setTimeout(() => {
      if (document.visibilityState === "visible") next();
    }, 80);
  };
  next();
}

function openBank(bank){
  copyTextSync("+" + phone);

  // Для Сбера пока возвращён базовый надёжный запуск приложения,
  // как в v0.1: без попытки сразу открыть P2P/СБП.
  if (bank.package) {
    const fallback = encodeURIComponent(location.href + "#app-not-opened");
    setTimeout(() => {
      location.href =
        `intent://open#Intent;package=${bank.package};` +
        `S.browser_fallback_url=${fallback};end`;
    }, 220);
    return;
  }

  tryLinksSequentially(bank.links, bank.fallback);
}

const holder = document.getElementById("banks");
holder.innerHTML = "";
banks.forEach(bank=>{
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "bankBtn";
  btn.innerHTML =
    `<span class="dot">${bank.name.slice(0,1)}</span><span>${bank.name}</span>`;
  btn.addEventListener("click", ()=>openBank(bank));
  holder.appendChild(btn);
});

document.getElementById("copyPhone").addEventListener("click", ()=>{
  const ok = copyTextSync("+" + phone);
  showToast(ok ? "Номер телефона скопирован" : "Не удалось скопировать автоматически");
});
document.getElementById("copyAmount").addEventListener("click", ()=>{
  const ok = copyTextSync(amountForClipboard(amountRaw));
  showToast(ok ? "Сумма скопирована" : "Не удалось скопировать автоматически");
});
document.getElementById("otherBank").addEventListener("click", ()=>{
  const ok = copyTextSync("+" + phone);
  showToast(ok
    ? "Номер скопирован. Откройте приложение своего банка."
    : "Откройте свой банк и введите номер.");
});
