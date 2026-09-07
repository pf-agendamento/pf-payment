
const PAYMENT_LANDING_VERSION = "0.5.0";

const DEFAULT_PHONE = "79296029876";
const DEFAULT_PHONE_DISPLAY = "+7 (929) 602-98-76";
const DEFAULT_RECIPIENT_BANK = "Газпромбанк";
const UNIVERSAL_SBP_PAYLOAD = null;

const params = new URLSearchParams(window.location.search);

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return DEFAULT_PHONE;
  if (digits.length === 11 && digits.startsWith("8")) return "7" + digits.slice(1);
  if (digits.length === 10) return "7" + digits;
  return digits;
}

function formatPhone(digits) {
  const d = String(digits || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("7")) {
    return `+7 (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7,9)}-${d.slice(9,11)}`;
  }
  return "+" + d;
}

function parseAmount(raw) {
  if (raw == null || raw === "") return 0;
  const cleaned = String(raw).replace(",", ".").replace(/[^0-9.]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function formatRub(amount) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount) + " ₽";
}

const state = {
  phone: normalizePhone(params.get("account") || params.get("phone") || DEFAULT_PHONE),
  amount: parseAmount(params.get("amount")),
  orderId: params.get("order") || params.get("order_id") || "",
  recipientBank: params.get("recipient_bank") || DEFAULT_RECIPIENT_BANK
};

function copyTextSync(text) {
  const value = String(text || "");
  if (!value) return false;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(value).catch(()=>{});
    return true;
  }
  const ta = document.createElement("textarea");
  ta.value = value;
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  } catch(e) {
    document.body.removeChild(ta);
    return false;
  }
}

let toastTimer = null;
function showToast(text) {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.classList.remove("hidden");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>el.classList.add("hidden"), 2500);
}

function openModal(html) {
  document.getElementById("modalBody").innerHTML = html;
  const overlay = document.getElementById("modalOverlay");
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden","false");
}

function closeModal() {
  const overlay = document.getElementById("modalOverlay");
  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden","true");
}

function makeUnifiedBankModal(bankName) {
  const canDeepOpen = !!UNIVERSAL_SBP_PAYLOAD && /^https?:\/\//i.test(UNIVERSAL_SBP_PAYLOAD);
  const buttonHtml = canDeepOpen
    ? `<button class="primaryBtn" type="button" id="openUniversalSbpBtn">Открыть быстрый платёж</button>`
    : `<button class="primaryBtn" type="button" id="copyQrNoteBtn">Показать QR и оплатить</button>`;

  return `
    <div class="modalTitle">${bankName}</div>
    <p class="modalText">Для этого банка используем единый быстрый СБП-маршрут.</p>

    <div class="qrWrap">
      <img src="qr_universal_sbp.png" alt="Универсальный QR-код СБП" />
    </div>

    <ol class="steps">
      <li>Нажмите «Открыть быстрый платёж» или используйте QR-код.</li>
      <li>Выберите <b>${bankName}</b>.</li>
      <li>На следующем экране проверьте сумму <b>${formatRub(state.amount)}</b>.</li>
      <li>Подтвердите платёж в приложении банка.</li>
    </ol>

    <div class="note">Этот единый маршрут рассчитан на: Альфа-Банк, ВТБ, Газпромбанк, Совкомбанк и МТС-Банк.</div>

    <div class="buttonRow">
      ${buttonHtml}
    </div>
    <p class="smallMuted" style="margin-top:12px">Если банк не открылся, можно использовать этот QR в другом устройстве или перейти в «Другие банки».</p>
  `;
}

function bindUnifiedBankModal(bankName) {
  const openBtn = document.getElementById("openUniversalSbpBtn");
  if (openBtn) {
    openBtn.addEventListener("click", () => {
      if (UNIVERSAL_SBP_PAYLOAD && /^https?:\/\//i.test(UNIVERSAL_SBP_PAYLOAD)) {
        window.location.href = UNIVERSAL_SBP_PAYLOAD;
      } else {
        showToast("QR показан. Используйте его для оплаты.");
      }
    });
  }
  const copyBtn = document.getElementById("copyQrNoteBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      showToast("Используйте показанный QR для оплаты.");
    });
  }
}

function openOtherBanksModal() {
  openModal(`
    <div class="modalTitle">Другие банки</div>
    <p class="modalText">Если вашего банка нет в основном списке, оплатите вручную через СБП по номеру телефона.</p>

    <div class="note">Номер можно сразу скопировать, затем открыть свой банк и выбрать перевод по СБП / по номеру телефона.</div>

    <ol class="steps">
      <li>Откройте свой банк.</li>
      <li>Выберите перевод по СБП / по номеру телефона.</li>
      <li>Вставьте номер получателя.</li>
      <li>Выберите банк получателя: <b>${state.recipientBank}</b>.</li>
      <li>Введите сумму точно: <b>${formatRub(state.amount)}</b>.</li>
      <li>Перед подтверждением проверьте имя получателя в приложении банка.</li>
    </ol>

    <div class="buttonRow">
      <button class="primaryBtn" type="button" id="copyPhoneBtn">Скопировать номер</button>
      <button class="secondaryBtn" type="button" id="copyAmountBtn">Скопировать сумму</button>
    </div>
  `);

  document.getElementById("copyPhoneBtn").addEventListener("click", () => {
    copyTextSync(formatPhone(state.phone));
    showToast("Номер скопирован");
  });
  document.getElementById("copyAmountBtn").addEventListener("click", () => {
    copyTextSync(state.amount.toFixed(2));
    showToast("Сумма скопирована");
  });
}

function tbankLinks() {
  const plusPhone = "+" + state.phone;
  const amountKopecks = Math.round(state.amount * 100);
  return [
    `tbank://Main/PayByMobileNumber?numberPhone=${encodeURIComponent(plusPhone)}&bank=${encodeURIComponent(state.recipientBank)}&amount=${amountKopecks}`,
    `https://www.tbank.ru/payments/transfer/card2card/?phone=${encodeURIComponent(plusPhone)}&amount=${encodeURIComponent(state.amount.toFixed(2))}`
  ];
}

function tryLinksSequentially(links, fallback) {
  if (!Array.isArray(links) || !links.length) {
    if (fallback) window.location.href = fallback;
    return;
  }
  let index = 0;
  const tryNext = () => {
    if (index >= links.length) {
      if (fallback) window.location.href = fallback;
      return;
    }
    const link = links[index++];
    window.location.href = link;
    if (index < links.length || fallback) {
      setTimeout(tryNext, 900);
    }
  };
  tryNext();
}

function openBank(bank) {
  if (bank.type === "manualOther") {
    openOtherBanksModal();
    return;
  }

  if (bank.type === "universal") {
    openModal(makeUnifiedBankModal(bank.name));
    bindUnifiedBankModal(bank.name);
    return;
  }

  if (bank.type === "manualSber") {
    copyTextSync(formatPhone(state.phone));
    showToast("Номер скопирован. Откройте Сбер и выберите перевод по номеру телефона.");
    return;
  }

  if (bank.type === "tbank") {
    copyTextSync(formatPhone(state.phone));
    tryLinksSequentially(tbankLinks(), null);
    return;
  }
}

const banks = [
  {
    name: "Т-Банк",
    hint: "Сразу откроет платёж",
    type: "tbank",
    iconClass: "icon-t",
    iconText: "T"
  },
  {
    name: "ВТБ",
    hint: "Единый быстрый СБП-код",
    type: "universal",
    iconClass: "icon-vtb",
    iconText: "В"
  },
  {
    name: "СберБанк",
    hint: "Пока вручную по номеру телефона",
    type: "manualSber",
    iconClass: "icon-sber",
    iconText: "C"
  },
  {
    name: "Альфа-Банк",
    hint: "Единый быстрый СБП-код",
    type: "universal",
    iconClass: "icon-alfa",
    iconText: "A"
  },
  {
    name: "Газпромбанк",
    hint: "Единый быстрый СБП-код",
    type: "universal",
    iconClass: "icon-gpb",
    iconText: "Г"
  },
  {
    name: "Совкомбанк",
    hint: "Единый быстрый СБП-код",
    type: "universal",
    iconClass: "icon-sov",
    iconText: "C"
  },
  {
    name: "МТС-Банк",
    hint: "Единый быстрый СБП-код",
    type: "universal",
    iconClass: "icon-mts",
    iconText: "M"
  },
  {
    name: "Другие банки",
    hint: "Инструкция по оплате через СБП",
    type: "manualOther",
    iconClass: "icon-other",
    iconText: "…"
  }
];

function render() {
  document.getElementById("amountView").textContent = formatRub(state.amount);

  const list = document.getElementById("banksList");
  list.innerHTML = "";

  banks.forEach(bank => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bankBtn";
    btn.innerHTML = `
      <span class="bankLeft">
        <span class="bankIcon ${bank.iconClass}">${bank.iconText}</span>
        <span class="bankText">
          <span class="bankName">${bank.name}</span>
          <span class="bankHint">${bank.hint}</span>
        </span>
      </span>
      <span class="bankArrow">›</span>
    `;
    btn.addEventListener("click", () => openBank(bank));
    list.appendChild(btn);
  });

  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("modalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "modalOverlay") closeModal();
  });
}

render();
