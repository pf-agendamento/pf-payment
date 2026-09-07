PF SBP Payment Landing v0.5.2 — DIRECT BANK LINKS

Основа: v0.5.1_TBANK_HOTFIX.

Подтверждённые прямые маршруты CBRPay по токену:
AS1I002M8BBPH42G94VB923PSPPVVKF9

Прямые кнопки:
- Т-Банк: существующий рабочий deeplink.
- ВТБ:
  https://online.vneshtbank.ru/i/sbp_link/AS1I002M8BBPH42G94VB923PSPPVVKF9
- Альфа-Банк:
  https://payzonaecom.com/mobile-public/api/v1/goto/c2cqr/AS1I002M8BBPH42G94VB923PSPPVVKF9
- Газпромбанк:
  https://sbpgpb.ru/c2cpayments/AS1I002M8BBPH42G94VB923PSPPVVKF9
- МТС-Банк:
  https://mdeng.ru/p/c2cqr/AS1I002M8BBPH42G94VB923PSPPVVKF9

Пока без прямого маршрута:
- СберБанк: ручной fallback по номеру телефона.
- Совкомбанк: временно универсальный QR/CBRPay flow.

Сумма Т-Банка остаётся исправленной:
1510.12 -> 1 510,12 ₽.

Удалённая ранее проверка ФИО не возвращалась.

Cache busting:
- app.js?v=0.5.2
- styles.css?v=0.5.2
