# Atelier Resale CRM — финальный запуск (GitHub Pages + Apps Script + Google Sheets)

Готовая бесплатная архитектура:

```text
GitHub Pages (frontend)
      ↓
Google Apps Script Web App (API bridge)
      ↓
Google Sheets (database)
```

## ВАЖНО ДЛЯ ВАС

✅ Spreadsheet ID уже вставлен в `apps-script/Code.gs`:

`1_Se3EckR9GyiF1Qk95Dp7VXwzV1AVfQLZLGAbpw5M4M`

✅ Фронтенд уже подготовлен под GitHub Pages (relative paths).  
✅ Добавлена папка `docs/` для самого простого деплоя на GitHub Pages.  

Остаётся 2 ручных шага:
1. Деплойнуть Apps Script как Web App.
2. Вставить URL Web App в `docs/src/config.js` (и `web/src/config.js`, если хотите держать одинаково в исходниках).

---

## Структура проекта

```bash
.
├─ apps-script/
│  └─ Code.gs
├─ docs/                     # ГОТОВО ДЛЯ GITHUB PAGES
│  ├─ index.html
│  └─ src/
│     ├─ main.js
│     ├─ styles.css
│     ├─ config.js
│     └─ config.example.js
├─ web/                      # рабочие исходники frontend
│  ├─ index.html
│  └─ src/
│     ├─ main.js
│     ├─ styles.css
│     ├─ config.js
│     └─ config.example.js
├─ server/                   # optional local legacy mock
└─ README.md
```

---

## 1) Google Sheets (у вас уже есть ID)

Используется таблица:

`1_Se3EckR9GyiF1Qk95Dp7VXwzV1AVfQLZLGAbpw5M4M`

Убедитесь, что есть листы:

1. `Inventory`
2. `Purchases`
3. `Sales`
4. `Statistics`
5. `Activity Log`

> Если листы пустые — Apps Script сам добавит заголовки.

---

## 2) Apps Script — что сделать

1. Откройте `https://script.google.com`
2. Создайте проект.
3. Вставьте код из `apps-script/Code.gs`.
4. Проверьте, что в `CONFIG.SPREADSHEET_ID` уже стоит ваш ID.
5. Нажмите **Deploy → New deployment**.
6. Тип: **Web app**.
7. Execute as: **Me**.
8. Who has access: **Anyone**.
9. Нажмите **Deploy**.
10. Скопируйте `Web app URL`.

---

## 3) Куда вставить URL Apps Script

Откройте файл:

- `docs/src/config.js`

и вставьте URL:

```js
export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycb.../exec';
```

Рекомендуется также обновить:

- `web/src/config.js`

чтобы исходники и `docs/` были одинаковыми.

---

## 4) Самый простой GitHub Pages деплой

### Шаги

1. Загрузите проект в GitHub.
2. Откройте репозиторий → **Settings** → **Pages**.
3. Source: **Deploy from a branch**.
4. Branch: `main`.
5. Folder: `/docs`.
6. Save.
7. Дождитесь URL сайта от GitHub Pages.

Готово — сайт будет работать как статический frontend и обращаться к Apps Script.

---

## 5) Как протестировать (laptop + iPhone)

### На laptop

1. Откройте GitHub Pages URL.
2. Добавьте закупку.
3. Проверьте, что строка появилась в `Inventory` и `Purchases`.
4. Оформите продажу.
5. Проверьте `Sales`, обновление `Inventory`, запись в `Activity Log`.

### На iPhone

1. Откройте тот же URL.
2. Убедитесь, что те же данные видны сразу.
3. Измените статус товара.
4. Проверьте обновление в таблице.

---

## 6) API contract (кратко)

Frontend вызывает Apps Script по action:

GET:
- `?action=getInventory`
- `?action=getDashboard`
- `?action=getAnalytics`
- `?action=getQC`
- `?action=getActivity`

POST:
- `createPurchase`
- `recordSale`
- `updateStatus`
- `editItem`
- `getItemById`

Ответы:

```json
{ "ok": true, "...": "..." }
```
или
```json
{ "ok": false, "error": "..." }
```

---

## 7) Что уже исправлено для launch

- Spreadsheet ID вставлен в Apps Script.
- Relative paths исправлены для GitHub Pages.
- Добавлен явный placeholder-комментарий для Apps Script URL в config.js.
- Подготовлена папка `docs/` для максимально простого деплоя.

---

## Мини-чеклист (самое короткое)

1. Deploy Apps Script Web App.
2. Вставить URL в `docs/src/config.js`.
3. Включить GitHub Pages из `/docs`.
4. Открыть с laptop и iPhone и проверить добавление/продажу.
