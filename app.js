const PAYMENT_LANDING_VERSION = "0.6.0-commit1";

const DEFAULT_PHONE = "79296029876";
const DEFAULT_PHONE_DISPLAY = "+7 (929) 602-98-76";
const DEFAULT_RECIPIENT_BANK = "МТС-Банк";

const params = new URLSearchParams(window.location.search);
const BRIDGE_URL = "https://pf-payment-bridge.pf-agendamento.workers.dev";
const paymentToken = params.get("p") || "";

const DYNAMIC_BANK_CODES = {
  "ВТБ": "vtb",
  "Альфа-Банк": "alfa",
  "Газпромбанк": "gazprom",
  "Совкомбанк": "sovcom",
  "МТС-Банк": "mts"
};

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
    copyTextSync(String(Math.trunc(state.amount)));
    showToast("Сумма скопирована");
  });
}

function tbankLinks() {
  const amountLink = state.amount.toFixed(2);
  const q =
    `PayByMobileNumber?numberPhone=%2B${state.phone}` +
    `&amount=${encodeURIComponent(amountLink)}`;

  return [
    `tbank://Main/${q}`,
    `bank100000000004://Main/${q}`,
    `tinkoffbank://Main/${q}`
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

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
}

function dynamicBankUrl(bankName, qrcId) {
  const q = encodeURIComponent(String(qrcId || "").trim());

  if (!q) return null;

  switch (bankName) {
    case "ВТБ":
      return `https://online.vneshtbank.ru/i/sbp_link/${q}`;

    case "Альфа-Банк":
      return `https://payzonaecom.com/mobile-public/api/v1/goto/c2cqr/${q}`;

    case "Газпромбанк":
      return `https://sbpgpb.ru/c2cpayments/${q}`;

    case "МТС-Банк":
      return `https://mdeng.ru/p/c2cqr/${q}`;

    case "Совкомбанк":
      return `bank100000000013://c2c.cbrpay.ru/${q}`;

    default:
      return null;
  }
}

function showPreparingPayment(bankName) {
  openModal(`
    <div class="modalTitle">Готовим персональный платёж…</div>

    <div class="modalText" style="line-height:1.8">
      Проверяем данные заказа ✓<br>
      Подготавливаем СБП-код…<br>
      Открываем ${bankName}…
    </div>

    <div class="note" style="margin-top:14px">
      Не закрывайте эту страницу
    </div>
  `);
}

function showPaymentReadyMobile(bankName) {
  openModal(`
    <div class="modalTitle">Платёж готов ✓</div>
    <p class="modalText">Открываем ${bankName}…</p>
  `);
}

function showPaymentReadyDesktop(bankName, qrUrl) {
  openModal(`
    <div class="modalTitle">Платёж подготовлен ✓</div>
    <p class="modalText">Отсканируйте QR-код телефоном.</p>

    <div class="qrWrap">
      <img
        src="${qrUrl}"
        alt="QR-код для оплаты"
        style="max-width:280px;width:100%;height:auto"
      />
    </div>

    <div class="note">
      Сумма заказа: <b>${formatRub(state.amount)}</b><br>
      Выбранный банк: <b>${bankName}</b>
    </div>
  `);
}

function showDynamicFallback(errorText) {
  const safeError = String(errorText || "").replace(/[<>&"]/g, "");

  openModal(`
    <div class="modalTitle">Не удалось автоматически подготовить платёж</div>

    <p class="modalText">
      Пожалуйста, воспользуйтесь ручным режимом через кнопку <b>«Другие банки»</b>.
    </p>

    <div class="note">
      Сумма вашего заказа сохранена: <b>${formatRub(state.amount)}</b>
    </div>

    ${safeError ? `<p class="smallMuted" style="margin-top:12px">${safeError}</p>` : ""}

    <div class="buttonRow">
      <button class="primaryBtn" type="button" id="openOtherBanksFallbackBtn">
        Другие банки
      </button>
    </div>
  `);

  const btn = document.getElementById("openOtherBanksFallbackBtn");
  if (btn) {
    btn.addEventListener("click", openOtherBanksModal);
  }
}

async function postBridge(path, payload) {
  const response = await fetch(`${BRIDGE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Bridge error ${response.status}`);
  }

  return data;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForPaymentArtifacts(bankName) {
  const startedAt = Date.now();

  while (true) {
    const data = await postBridge("/payment/status", {
      payment_token: paymentToken
    });

    const order = data.order || {};

    if (order.qrc_status === "READY" && order.qrc_id) {
      return order;
    }

    if (order.qrc_status === "ERROR") {
      throw new Error(order.last_error || "Не удалось подготовить СБП-код.");
    }

    if (order.prepare_status === "ERROR") {
      throw new Error(order.last_error || "Не удалось подготовить заказ.");
    }

    // Не обещаем клиенту конкретное время, но и не крутим вечный цикл.
    // Через 2 минуты предлагаем безопасный ручной fallback.
    if (Date.now() - startedAt > 120000) {
      throw new Error("Подготовка занимает дольше обычного.");
    }

    await wait(800);
  }
}

async function startDynamicPayment(bank) {
  if (!paymentToken) {
    showDynamicFallback("Для персонального СБП-кода нужна ссылка заказа.");
    return;
  }

  const bankCode = DYNAMIC_BANK_CODES[bank.name];
  if (!bankCode) {
    showDynamicFallback("Для выбранного банка нет динамического маршрута.");
    return;
  }

  showPreparingPayment(bank.name);

  try {
    await postBridge("/payment/select-bank", {
      payment_token: paymentToken,
      bank: bankCode
    });

    const order = await waitForPaymentArtifacts(bank.name);

    if (isMobileDevice()) {
      const url = dynamicBankUrl(bank.name, order.qrc_id);

      if (!url) {
        throw new Error("Не удалось построить маршрут выбранного банка.");
      }

      showPaymentReadyMobile(bank.name);

      setTimeout(() => {
        window.location.href = url;
      }, 350);

      return;
    }

    const qrUrl = order.qr_url
      ? `${BRIDGE_URL}${order.qr_url}`
      : `${BRIDGE_URL}/payment/qr?p=${encodeURIComponent(paymentToken)}`;

    showPaymentReadyDesktop(bank.name, qrUrl);

  } catch (error) {
    console.error(error);
    showDynamicFallback(error.message);
  }
}

function openBank(bank) {
  if (bank.type === "manualOther") {
    openOtherBanksModal();
    return;
  }

  if (bank.type === "dynamicSbp") {
    startDynamicPayment(bank);
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
    hint: "Персональный быстрый платёж",
    type: "dynamicSbp",
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
    hint: "Персональный быстрый платёж",
    type: "dynamicSbp",
    iconClass: "icon-alfa",
    iconText: "A"
  },
  {
    name: "Газпромбанк",
    hint: "Персональный быстрый платёж",
    type: "dynamicSbp",
    iconClass: "icon-gpb",
    iconText: "Г"
  },
  {
    name: "Совкомбанк",
    hint: "Персональный быстрый платёж",
    type: "dynamicSbp",
    iconClass: "icon-sov",
    iconText: "C"
  },
  {
    name: "МТС-Банк",
    hint: "Персональный быстрый платёж",
    type: "dynamicSbp",
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

async function init() {
  // Старый режим оставляем только для локальных/визуальных тестов страницы.
  if (!paymentToken) {
    render();
    return;
  }

  const amountView = document.getElementById("amountView");
  const banksList = document.getElementById("banksList");

  amountView.textContent = "Загрузка…";
  banksList.innerHTML = "";

  try {
    const data = await postBridge("/payment/open", {
      payment_token: paymentToken
    });

    if (!data.order) {
      throw new Error("Payment not found");
    }

    state.amount = Number(data.order.amount_rub);

    if (!Number.isFinite(state.amount) || state.amount <= 0) {
      throw new Error("Invalid payment amount");
    }

    render();

  } catch (error) {
    console.error(error);

    amountView.textContent = "Ошибка";
    banksList.innerHTML = `
      <div style="padding:20px;text-align:center">
        Не удалось загрузить данные платежа.<br>
        Проверьте ссылку или попробуйте ещё раз.
      </div>
    `;
  }
}

init();
