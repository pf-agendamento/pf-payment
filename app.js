const PAYMENT_LANDING_VERSION = "0.6.9-cloud-amount-state-pool-checkout";

const DEFAULT_PHONE = "79296029876";
const DEFAULT_PHONE_DISPLAY = "+7 (929) 602-98-76";
const DEFAULT_RECIPIENT_BANK = "МТС-Банк";

const params = new URLSearchParams(window.location.search);
const BRIDGE_URL = "https://pf-payment-bridge.pf-agendamento.workers.dev";
const BRIDGE_REQUEST_TIMEOUT_MS = 12000;
const PAYMENT_WAIT_LIMIT_MS = 5 * 60 * 1000;
const paymentToken = params.get("p") || "";

const DYNAMIC_BANK_CODES = {
  "ВТБ": "vtb",
  "Альфа-Банк": "alfa",
  "Газпромбанк": "gazprom",
  "Совкомбанк": "sovcom",
  "МТС-Банк": "mts"
};

const NON_DYNAMIC_BANK_CODES = {
  "Т-Банк": "tbank",
  "СберБанк": "sber",
  "Другие банки": "other"
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

function formatApproxRub(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return "≈ — ₽";
  return "≈ " + new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0
  }).format(Math.round(value)) + " ₽";
}

const initialAmount = parseAmount(params.get("amount"));

const state = {
  phone: normalizePhone(params.get("account") || params.get("phone") || DEFAULT_PHONE),
  amount: initialAmount,
  displayEstimate: initialAmount,
  amountLock: paymentToken ? "UNKNOWN" : "LEGACY_EXACT",
  amountSource: null,
  poolSlotKey: null,
  qrcId: null,
  cloudPricingActive: false,
  orderId: params.get("order") || params.get("order_id") || "",
  recipientBank: params.get("recipient_bank") || DEFAULT_RECIPIENT_BANK
};

function isExactAmountLocked() {
  return state.amountLock !== "UNLOCKED" && state.amountLock !== "UNKNOWN";
}

function renderAmount() {
  const amountView = document.getElementById("amountView");
  const label =
    document.getElementById("amountLabel") ||
    document.querySelector(".amountLabel");

  if (!amountView) return;

  if (state.amountLock === "UNLOCKED") {
    if (label) label.textContent = "Примерная сумма";
    amountView.textContent = formatApproxRub(state.displayEstimate || state.amount);
    return;
  }

  if (label) label.textContent = "Сумма к оплате";
  amountView.textContent = formatRub(state.amount);
}

function applyCloudOrderState(order) {
  if (!order || typeof order !== "object") return;

  const rawAmount = Number(order.amount_rub);
  const rawEstimate = Number(order.display_estimate_rub);
  const lock = String(order.amount_lock || "").trim().toUpperCase();

  // New Cloud-owned pricing contract is honored only after /payment/open
  // or /payment/select-bank explicitly confirms pool_checkout mode.
  // This preserves the old exact-amount behavior while rollout is staged OFF.
  if (lock && state.cloudPricingActive) {
    state.amountLock = lock;
    state.amountSource = order.amount_source || state.amountSource;
    state.poolSlotKey = order.pool_slot_key || state.poolSlotKey;
    state.qrcId = order.qrc_id || state.qrcId;

    if (Number.isFinite(rawEstimate) && rawEstimate > 0) {
      state.displayEstimate = rawEstimate;
    }

    if (lock === "UNLOCKED") {
      const estimate =
        Number.isFinite(rawEstimate) && rawEstimate > 0
          ? rawEstimate
          : rawAmount;

      if (Number.isFinite(estimate) && estimate > 0) {
        state.displayEstimate = estimate;
        state.amount = estimate;
      }
    } else if (Number.isFinite(rawAmount) && rawAmount > 0) {
      state.amount = rawAmount;
    }

    renderAmount();
    return;
  }

  // Compatibility while pool_checkout_enabled=false:
  // v1.5/v1.6 staged responses contain an already-exact legacy amount
  // and no amount_lock field.
  if (Number.isFinite(rawAmount) && rawAmount > 0) {
    state.amount = rawAmount;
    state.amountLock = "LEGACY_EXACT";
    renderAmount();
  }
}

function applyCloudSelectionState(data) {
  if (!data || typeof data !== "object") return;

  if (data.pool_checkout === true) {
    state.cloudPricingActive = true;
  }

  applyCloudOrderState({
    amount_rub: data.amount_rub,
    display_estimate_rub: data.display_estimate_rub,
    amount_source: data.amount_source,
    amount_lock: data.amount_lock,
    pool_slot_key: data.pool_slot_key,
    qrc_id: data.qrc_id
  });
}

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


function sberLinks() {
  const phone = String(state.phone || "").replace(/\D/g, "");
  return [
    `intent://${phone}#Intent;scheme=tel;package=ru.sberbankmobile;end`,
    `tel:${phone}`
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

function getLocalQrConstructor() {
  if (typeof window.QRCode !== "function") {
    throw new Error("Локальный qrcode.min.js не загрузился: window.QRCode отсутствует.");
  }
  return window.QRCode;
}

async function showPaymentReadyDesktop(bankName, bankUrl) {
  try {
    const QRCodeCtor = getLocalQrConstructor();

    openModal(`
      <div class="modalTitle">Платёж подготовлен ✓</div>
      <p class="modalText">
        Отсканируйте QR-код — он ведёт сразу в <b>${bankName}</b>.
      </p>

      <div class="qrWrap">
        <div
          id="bankSpecificQr"
          aria-label="QR-код для открытия ${bankName}"
          style="display:flex;justify-content:center;align-items:center;min-height:280px"
        ></div>
      </div>

      <div class="note">
        Сумма заказа: <b>${formatRub(state.amount)}</b><br>
        Выбранный банк: <b>${bankName}</b>
      </div>

      <div class="buttonRow" style="margin-top:14px">
        <button class="secondaryBtn" type="button" id="copyBankLinkBtn">
          Скопировать ссылку
        </button>
      </div>
    `);

    const qrHost = document.getElementById("bankSpecificQr");

    if (!qrHost) {
      throw new Error("Не найден контейнер bankSpecificQr.");
    }

    // Используем дефолтный уровень коррекции самой qrcode.js.
    // Никаких внешних CDN и никаких дополнительных параметров.
    new QRCodeCtor(qrHost, {
      text: bankUrl,
      width: 280,
      height: 280
    });

    const hasQr =
      !!qrHost.querySelector("canvas") ||
      !!qrHost.querySelector("img") ||
      qrHost.children.length > 0;

    if (!hasQr) {
      throw new Error("QRCode выполнился, но изображение QR не появилось.");
    }

    const copyBtn = document.getElementById("copyBankLinkBtn");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        copyTextSync(bankUrl);
        showToast("Ссылка скопирована");
      });
    }
  } catch (error) {
    console.error("QR_RENDER_ERROR", error);

    const errorMessage = String(
      error && error.message ? error.message : error || "Неизвестная ошибка QR"
    ).replace(/[<>&"]/g, "");

    openModal(`
      <div class="modalTitle">Платёж готов ✓</div>
      <p class="modalText">
        Персональная ссылка для <b>${bankName}</b> уже готова.
      </p>

      <div class="note">
        QR-код не удалось нарисовать в браузере, но сам платёж готов.
      </div>

      <p class="smallMuted" style="margin-top:12px">
        QR debug: ${errorMessage}
      </p>

      <div class="buttonRow" style="margin-top:14px">
        <button class="primaryBtn" type="button" id="copyBankLinkFallbackBtn">
          Скопировать ссылку
        </button>
      </div>
    `);

    const copyBtn = document.getElementById("copyBankLinkFallbackBtn");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        copyTextSync(bankUrl);
        showToast("Ссылка скопирована");
      });
    }
  }
}

function showDynamicFallback(errorText) {
  const safeError = String(errorText || "").replace(/[<>&"]/g, "");

  openModal(`
    <div class="modalTitle">Не удалось автоматически подготовить платёж</div>

    <p class="modalText">
      Пожалуйста, воспользуйтесь ручным режимом через кнопку <b>«Другие банки»</b>.
    </p>

    <div class="note">
      ${
        isExactAmountLocked()
          ? `Сумма вашего заказа сохранена: <b>${formatRub(state.amount)}</b>`
          : "Точная сумма будет зафиксирована после выбора другого способа оплаты."
      }
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

class BridgeRequestError extends Error {
  constructor(message, retryable = false, status = 0) {
    super(message);
    this.name = "BridgeRequestError";
    this.retryable = retryable;
    this.status = status;
  }
}

async function postBridge(path, payload) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BRIDGE_REQUEST_TIMEOUT_MS);

  let response;

  try {
    response = await fetch(`${BRIDGE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timeoutId);

    const timedOut = error && error.name === "AbortError";
    throw new BridgeRequestError(
      timedOut ? "Сервер отвечает дольше обычного." : "Временная проблема со связью.",
      true,
      0
    );
  }

  clearTimeout(timeoutId);

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    throw new BridgeRequestError(
      data.error || `Bridge error ${response.status}`,
      retryable,
      response.status
    );
  }

  return data;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function postBridgeWithRetry(path, payload, maxAttempts = 4) {
  const delays = [0, 700, 1500, 3000, 5000];
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (delays[attempt] > 0) {
      await wait(delays[attempt]);
    }

    try {
      return await postBridge(path, payload);
    } catch (error) {
      lastError = error;

      if (!error.retryable) {
        throw error;
      }
    }
  }

  throw lastError || new BridgeRequestError("Временная проблема со связью.", true, 0);
}


async function selectNonDynamicBank(bankCode) {
  if (!bankCode) {
    throw new Error("Не выбран способ оплаты.");
  }

  // Local visual-test mode: no Cloud order exists.
  if (!paymentToken) {
    if (!isExactAmountLocked()) {
      state.amountLock = "LEGACY_EXACT";
      renderAmount();
    }
    return {
      ok: true,
      local_test: true,
      amount_rub: state.amount
    };
  }

  const data = await postBridgeWithRetry("/payment/bank-selected", {
    payment_token: paymentToken,
    bank: bankCode
  }, 4);

  applyCloudSelectionState(data);

  if (!isExactAmountLocked() || !Number.isFinite(Number(state.amount)) || Number(state.amount) <= 0) {
    throw new Error("Cloud не вернул точную сумму платежа.");
  }

  return data;
}

function showPreparingExactAmount(bankName) {
  openModal(`
    <div class="modalTitle">Готовим платёж…</div>

    <div class="modalText" style="line-height:1.8">
      Фиксируем точную сумму ✓<br>
      Выбранный способ: ${bankName}
    </div>

    <div class="note" style="margin-top:14px">
      Это займёт несколько секунд
    </div>
  `);
}

async function waitForPaymentArtifacts(bankName) {
  const startedAt = Date.now();
  let transientFailures = 0;

  while (true) {
    try {
      const data = await postBridge("/payment/status", {
        payment_token: paymentToken
      });

      transientFailures = 0;
      const order = data.order || {};
      applyCloudOrderState(order);

      if (order.qrc_status === "READY" && order.qrc_id) {
        return order;
      }

      if (order.qrc_status === "ERROR") {
        throw new BridgeRequestError(
          order.last_error || "Не удалось подготовить СБП-код.",
          false,
          0
        );
      }

      if (order.prepare_status === "ERROR") {
        throw new BridgeRequestError(
          order.last_error || "Не удалось подготовить заказ.",
          false,
          0
        );
      }

      await wait(800);
    } catch (error) {
      if (!error.retryable) {
        throw error;
      }

      transientFailures += 1;

      if (transientFailures >= 2) {
        openModal(`
          <div class="modalTitle">Готовим персональный платёж…</div>

          <div class="modalText" style="line-height:1.8">
            Проверяем данные заказа ✓<br>
            Подготавливаем СБП-код…<br>
            Связь нестабильна — продолжаем ждать…
          </div>

          <div class="note" style="margin-top:14px">
            Не закрывайте эту страницу
          </div>
        `);
      }

      await wait(Math.min(1000 * transientFailures, 5000));
    }

    if (Date.now() - startedAt > PAYMENT_WAIT_LIMIT_MS) {
      throw new BridgeRequestError(
        "Подготовка занимает дольше обычного. Попробуйте ещё раз через несколько минут.",
        false,
        0
      );
    }
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
    // In pool-checkout mode Cloud returns a ready prepared token immediately.
    // In legacy/staged compatibility mode the same endpoint may still return
    // CREATING, so the polling fallback remains for safe rollout.
    const selected = await postBridgeWithRetry("/payment/select-bank", {
      payment_token: paymentToken,
      bank: bankCode
    }, 4);

    applyCloudSelectionState(selected);

    let order;

    if (selected.qrc_status === "READY" && selected.qrc_id) {
      order = {
        ...selected,
        qrc_id: selected.qrc_id
      };
    } else {
      order = await waitForPaymentArtifacts(bank.name);
    }

    applyCloudOrderState(order);

    if (!isExactAmountLocked()) {
      throw new Error("Cloud не зафиксировал точную сумму токена.");
    }

    const bankUrl = dynamicBankUrl(bank.name, order.qrc_id);

    if (!bankUrl) {
      throw new Error("Не удалось построить маршрут выбранного банка.");
    }

    if (isMobileDevice()) {
      showPaymentReadyMobile(bank.name);

      setTimeout(() => {
        window.location.href = bankUrl;
      }, 350);

      return;
    }

    // Desktop/web: encode the exact bank-specific URL used on mobile.
    await showPaymentReadyDesktop(bank.name, bankUrl);

  } catch (error) {
    console.error(error);
    showDynamicFallback(error.message);
  }
}

async function openBank(bank) {
  if (bank.type === "dynamicSbp") {
    await startDynamicPayment(bank);
    return;
  }

  const bankCode = NON_DYNAMIC_BANK_CODES[bank.name];
  if (!bankCode) return;

  showPreparingExactAmount(bank.name);

  try {
    // For T-Bank / Sber / Other, Cloud allocates a unique exact amount
    // slightly below the active MTS-token range. If this order already owns
    // an MTS token, Cloud returns the same final token amount unchanged.
    await selectNonDynamicBank(bankCode);

    if (bank.type === "manualOther") {
      openOtherBanksModal();
      return;
    }

    if (bank.type === "manualSber") {
      // Proven Sber route: tel:<phone> opens the transfer flow with the phone
      // already filled on Android. Copy the authoritative Cloud exact amount
      // immediately before leaving the browser.
      copyTextSync(String(Math.trunc(state.amount)));
      showToast("Сумма скопирована. Открываю Сбер…");
      closeModal();
      await wait(120);
      tryLinksSequentially(sberLinks(), null);
      return;
    }

    if (bank.type === "tbank") {
      copyTextSync(formatPhone(state.phone));
      closeModal();
      await wait(120);
      tryLinksSequentially(tbankLinks(), null);
      return;
    }
  } catch (error) {
    console.error(error);
    openModal(`
      <div class="modalTitle">Не удалось подготовить платёж</div>
      <p class="modalText">
        Не удалось получить точную сумму от сервера. Попробуйте ещё раз.
      </p>
      <p class="smallMuted" style="margin-top:12px">
        ${String(error && error.message ? error.message : error || "").replace(/[<>&"]/g, "")}
      </p>
    `);
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
  renderAmount();

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


function setExactTextVisibility(text, visible) {
  const wanted = String(text || "").trim();

  for (const el of document.querySelectorAll(
    "h1,h2,h3,h4,h5,h6,p,span,div,label"
  )) {
    if ((el.textContent || "").trim() === wanted) {
      el.style.display = visible ? "" : "none";
    }
  }
}

function replaceExactText(fromText, toText) {
  const wanted = String(fromText || "").trim();

  for (const el of document.querySelectorAll(
    "h1,h2,h3,h4,h5,h6,p,span,div,label"
  )) {
    if ((el.textContent || "").trim() === wanted) {
      el.textContent = toText;
    }
  }
}


function hidePaidOnlyDecorations() {
  const hideTexts = [
    "Выберите свой банк",
    "Сумма к оплате",
    "Сумма платежа",
    "Оплата по СБП"
  ];

  for (const el of document.querySelectorAll("h1,h2,h3,h4,h5,h6,p,span,div,label")) {
    const t = (el.textContent || "").trim();
    if (hideTexts.includes(t)) {
      el.style.display = "none";
    }
  }

  // Hide the large amount card when the order is already paid.
  for (const div of document.querySelectorAll("div")) {
    const txt = (div.textContent || "").trim();
    if (txt === "1 274,00 ₽") {
      // keep backward compatibility if amount happens to be rendered as plain text only
      continue;
    }
    const normalized = txt.replace(/\s+/g, " ");
    if (
      normalized.includes("Сумма к оплате") ||
      normalized.includes("Сумма платежа")
    ) {
      div.style.display = "none";
    }
  }
}

function renderPaidState(order) {
  const banksList = document.getElementById("banksList");

  hidePaidOnlyDecorations();

  banksList.innerHTML = `
    <div style="padding:40px 20px;text-align:center;line-height:1.8;max-width:640px;margin:0 auto;">
      <div style="font-size:34px;font-weight:700;">Оплата получена ✓</div>
      <div style="margin-top:14px;font-size:26px;font-weight:500;">
        Повторно оплачивать этот заказ не нужно.
      </div>
    </div>
  `;
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
    const data = await postBridgeWithRetry("/payment/open", {
      payment_token: paymentToken
    }, 4);

    if (!data.order) {
      throw new Error("Payment not found");
    }

    state.cloudPricingActive = data.pool_checkout === true;
    applyCloudOrderState(data.order);

    const visibleAmount =
      state.amountLock === "UNLOCKED"
        ? Number(state.displayEstimate || state.amount)
        : Number(state.amount);

    if (!Number.isFinite(visibleAmount) || visibleAmount <= 0) {
      throw new Error("Invalid payment amount");
    }

    render();

    if (data.order.payment_status === "PAID") {
      renderPaidState(data.order);
    }

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
