/**
 * База с Катей — Google Apps Script API bridge
 * Архитектура: GitHub Pages -> Apps Script Web App -> Google Sheets
 */

const SHIPPING_STATUS = {
  pending: 'Не отправлено',
  shipped: 'Отправлено',
  delivered: 'Доставлено',
  cancelled: 'Отменено'
};

const CONFIG = {
  SPREADSHEET_ID: '1_Se3EckR9GyiF1Qk95Dp7VXwzV1AVfQLZLGAbpw5M4M',
  SHEETS: {
    inventory: 'Inventory',
    purchases: 'Purchases',
    sales: 'Sales',
    statistics: 'Statistics',
    activity: 'Activity Log'
  },
  HEADERS: {
    inventory: [
      'item_number', 'photo_url', 'model_name', 'category', 'purchase_date', 'total_cost',
      'status', 'listed_vinted', 'listed_vestiaire', 'need_rephoto', 'money_received',
      'sale_id', 'sale_price', 'sale_date', 'platform', 'buyer', 'platform_fee', 'profit',
      'tracking_number', 'shipping_label_url', 'shipping_date', 'shipping_status',
      'notes', 'updated_at'
    ],
    purchases: ['timestamp', 'item_number', 'model_name', 'purchase_date', 'total_cost', 'notes'],
    sales: [
      'sale_id', 'timestamp', 'item_number', 'sale_date', 'sale_price', 'platform', 'buyer',
      'platform_fee', 'total_cost', 'profit', 'money_received', 'status', 'shipping_status',
      'tracking_number', 'shipping_label_url', 'shipping_date', 'pre_sale_status',
      'is_cancelled', 'cancelled_at', 'notes'
    ],
    statistics: ['timestamp', 'active_stock', 'listed_vinted', 'listed_vestiaire', 'need_rephoto', 'sold_this_month', 'profit_this_month', 'purchase_balance'],
    activity: ['timestamp', 'item_number', 'action', 'field', 'old_value', 'new_value', 'actor']
  },
  STATUS_LABELS: {
    purchased: 'Куплено',
    transit: 'В пути',
    repair: 'На ремонте',
    ready: 'Готово',
    listed: 'Выставлено',
    hold: 'Резерв',
    sold: 'Продано',
    shipped: 'Отправлено',
    delivered: 'Доставлено'
  }
};

function doGet(e) {
  try {
    return jsonResponse(routeAction(String((e && e.parameter && e.parameter.action) || ''), e && e.parameter ? e.parameter : {}));
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return jsonResponse(routeAction(String(body.action || ''), body.payload || {}));
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message });
  }
}

function routeAction(action, payload) {
  const handlers = {
    getInventory: () => ({ ok: true, items: getInventory() }),
    getDashboard: () => ({ ok: true, stats: getDashboard() }),
    getAnalytics: () => ({ ok: true, ...getAnalytics() }),
    getQC: () => ({ ok: true, attention: getQC() }),
    getActivity: () => ({ ok: true, activity: getActivity() }),
    getSalesByMonth: () => ({ ok: true, ...getSalesByMonth(payload.month || payload.monthKey || '') }),
    getShippingOverview: () => ({ ok: true, ...getShippingOverview() }),
    getItemByNumber: () => ({ ok: true, item: getItemByNumber(payload.item_number) }),
    createPurchase: () => ({ ok: true, item: createPurchase(payload) }),
    recordSale: () => ({ ok: true, item: recordSale(payload) }),
    updateShipping: () => ({ ok: true, item: updateShipping(payload.item_number, payload.shipping || {}) }),
    cancelSale: () => ({ ok: true, item: cancelSale(payload.item_number, payload.sale_id) }),
    updateStatus: () => ({ ok: true, item: updateStatus(payload.item_number, payload.status) }),
    editItem: () => ({ ok: true, item: editItem(payload.item_number, payload.updates || {}) })
  };

  if (!handlers[action]) throw new Error('Unknown action: ' + action);
  return handlers[action]();
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function ss() { return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID); }

function getSheet(name, headers) {
  const sheet = ss().getSheetByName(name) || ss().insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function getRows(sheetName, headers) {
  const sh = getSheet(sheetName, headers);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  return values.map((row) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function appendRow(sheetName, headers, obj) {
  getSheet(sheetName, headers).appendRow(headers.map((h) => obj[h] == null ? '' : obj[h]));
}

function updateInventoryRow(itemNumber, nextObj) {
  const sh = getSheet(CONFIG.SHEETS.inventory, CONFIG.HEADERS.inventory);
  const rows = getRows(CONFIG.SHEETS.inventory, CONFIG.HEADERS.inventory);
  const idx = rows.findIndex((r) => String(r.item_number) === String(itemNumber));
  if (idx === -1) throw new Error('Товар не найден');
  sh.getRange(idx + 2, 1, 1, CONFIG.HEADERS.inventory.length)
    .setValues([CONFIG.HEADERS.inventory.map((h) => nextObj[h] == null ? '' : nextObj[h])]);
}

function updateSalesRow(saleId, updater) {
  const sh = getSheet(CONFIG.SHEETS.sales, CONFIG.HEADERS.sales);
  const rows = getRows(CONFIG.SHEETS.sales, CONFIG.HEADERS.sales);
  const idx = rows.findIndex((r) => String(r.sale_id) === String(saleId));
  if (idx === -1) throw new Error('Продажа не найдена');
  const next = updater(rows[idx]);
  sh.getRange(idx + 2, 1, 1, CONFIG.HEADERS.sales.length)
    .setValues([CONFIG.HEADERS.sales.map((h) => next[h] == null ? '' : next[h])]);
  return next;
}

function toNum(v) { return Number(v || 0); }
function monthKey(v) { return String(v || '').slice(0, 7); }
function boolText(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return (s === 'true' || s === '1' || s === 'yes' || s === 'да' || s === 'y') ? 'yes' : 'no';
}
function shippingStatus(v) {
  return SHIPPING_STATUS[v] ? v : 'pending';
}
function isCancelledSale(s) {
  return boolText(s.is_cancelled) === 'yes' || String(s.shipping_status) === 'cancelled' || String(s.status) === 'cancelled';
}
function activeSalesOnly(sales) {
  return sales.filter((s) => !isCancelledSale(s));
}


function validSaleRow(sale, itemsByNumber) {
  if (isCancelledSale(sale)) return false;
  if (!String(sale.item_number || '').trim()) return false;
  if (toNum(sale.sale_price) <= 0) return false;
  if (itemsByNumber && !itemsByNumber[String(sale.item_number)]) return false;
  return true;
}

function getValidSales() {
  const items = getInventory();
  const byNumber = {};
  items.forEach((i) => { byNumber[String(i.item_number)] = true; });
  return getRows(CONFIG.SHEETS.sales, CONFIG.HEADERS.sales).filter((s) => validSaleRow(s, byNumber));
}
function createSaleId(itemNumber) {
  return String(itemNumber) + '-' + new Date().getTime();
}

function normalizeItem(input, prev) {
  const p = prev || {};
  const item = {
    item_number: String(input.item_number != null ? input.item_number : p.item_number || '').trim(),
    photo_url: input.photo_url != null ? input.photo_url : (p.photo_url || ''),
    model_name: input.model_name != null ? input.model_name : (p.model_name || ''),
    category: input.category != null ? input.category : (p.category || ''),
    purchase_date: input.purchase_date != null ? input.purchase_date : (p.purchase_date || ''),
    total_cost: toNum(input.total_cost != null ? input.total_cost : p.total_cost),
    status: input.status != null ? input.status : (p.status || 'purchased'),
    listed_vinted: boolText(input.listed_vinted != null ? input.listed_vinted : p.listed_vinted),
    listed_vestiaire: boolText(input.listed_vestiaire != null ? input.listed_vestiaire : p.listed_vestiaire),
    need_rephoto: boolText(input.need_rephoto != null ? input.need_rephoto : p.need_rephoto),
    money_received: boolText(input.money_received != null ? input.money_received : p.money_received),
    sale_id: input.sale_id != null ? input.sale_id : (p.sale_id || ''),
    sale_price: toNum(input.sale_price != null ? input.sale_price : p.sale_price),
    sale_date: input.sale_date != null ? input.sale_date : (p.sale_date || ''),
    platform: input.platform != null ? input.platform : (p.platform || ''),
    buyer: input.buyer != null ? input.buyer : (p.buyer || ''),
    platform_fee: toNum(input.platform_fee != null ? input.platform_fee : p.platform_fee),
    tracking_number: input.tracking_number != null ? input.tracking_number : (p.tracking_number || ''),
    shipping_label_url: input.shipping_label_url != null ? input.shipping_label_url : (p.shipping_label_url || ''),
    shipping_date: input.shipping_date != null ? input.shipping_date : (p.shipping_date || ''),
    shipping_status: shippingStatus(input.shipping_status != null ? input.shipping_status : p.shipping_status),
    notes: input.notes != null ? input.notes : (p.notes || ''),
    updated_at: new Date().toISOString()
  };
  item.profit = item.sale_price ? (item.sale_price - item.total_cost - item.platform_fee) : 0;
  return item;
}

function addActivity(entry) {
  appendRow(CONFIG.SHEETS.activity, CONFIG.HEADERS.activity, {
    timestamp: new Date().toISOString(),
    item_number: entry.item_number || '',
    action: entry.action || '',
    field: entry.field || '',
    old_value: entry.old_value || '',
    new_value: entry.new_value || '',
    actor: 'web'
  });
}

function getInventory() {
  return getRows(CONFIG.SHEETS.inventory, CONFIG.HEADERS.inventory)
    .sort((a, b) => Number(a.item_number) - Number(b.item_number));
}

function getItemByNumber(itemNumber) {
  return getInventory().find((x) => String(x.item_number) === String(itemNumber)) || null;
}

function createPurchase(payload) {
  const itemNumber = String(payload.item_number || '').trim();
  if (!itemNumber) throw new Error('Нужен короткий номер товара');
  if (!String(payload.model_name || '').trim()) throw new Error('Нужна модель');
  const items = getInventory();
  if (items.some((i) => String(i.item_number) === itemNumber)) throw new Error('Такой номер уже существует');

  const item = normalizeItem({ ...payload, status: payload.status || 'purchased' }, {});
  appendRow(CONFIG.SHEETS.inventory, CONFIG.HEADERS.inventory, item);
  appendRow(CONFIG.SHEETS.purchases, CONFIG.HEADERS.purchases, {
    timestamp: new Date().toISOString(),
    item_number: item.item_number,
    model_name: item.model_name,
    purchase_date: item.purchase_date,
    total_cost: item.total_cost,
    notes: item.notes
  });
  addActivity({ item_number: item.item_number, action: 'Добавление покупки', field: 'карточка', old_value: '—', new_value: 'создана' });
  return item;
}

function editItem(itemNumber, updates) {
  const current = getItemByNumber(itemNumber);
  if (!current) throw new Error('Товар не найден');
  const next = normalizeItem(updates, current);
  updateInventoryRow(itemNumber, next);
  addActivity({ item_number: itemNumber, action: 'Редактирование карточки', field: 'карточка', old_value: 'обновление', new_value: 'сохранено' });
  return next;
}

function updateStatus(itemNumber, status) {
  const current = getItemByNumber(itemNumber);
  if (!current) throw new Error('Товар не найден');
  const next = normalizeItem({ status: status }, current);
  updateInventoryRow(itemNumber, next);
  addActivity({ item_number: itemNumber, action: 'Изменение статуса', field: 'status', old_value: CONFIG.STATUS_LABELS[current.status] || current.status, new_value: CONFIG.STATUS_LABELS[next.status] || next.status });
  return next;
}

function recordSale(payload) {
  const current = getItemByNumber(payload.item_number);
  if (!current) throw new Error('Товар не найден');
  if (toNum(payload.sale_price) <= 0) throw new Error('Введите корректную цену продажи');

  const saleId = createSaleId(current.item_number);
  const next = normalizeItem({
    sale_id: saleId,
    sale_price: payload.sale_price,
    sale_date: payload.sale_date || new Date().toISOString().slice(0, 10),
    platform: payload.platform || '',
    buyer: payload.buyer || '',
    platform_fee: payload.platform_fee || 0,
    notes: payload.notes != null ? payload.notes : current.notes,
    money_received: payload.money_received != null ? payload.money_received : current.money_received,
    status: payload.status || 'sold',
    tracking_number: payload.tracking_number || '',
    shipping_label_url: payload.shipping_label_url || '',
    shipping_date: payload.shipping_date || '',
    shipping_status: payload.shipping_status || 'pending'
  }, current);

  updateInventoryRow(current.item_number, next);
  appendRow(CONFIG.SHEETS.sales, CONFIG.HEADERS.sales, {
    sale_id: saleId,
    timestamp: new Date().toISOString(),
    item_number: next.item_number,
    sale_date: next.sale_date,
    sale_price: next.sale_price,
    platform: next.platform,
    buyer: next.buyer,
    platform_fee: next.platform_fee,
    total_cost: next.total_cost,
    profit: next.profit,
    money_received: next.money_received,
    status: next.status,
    shipping_status: next.shipping_status,
    tracking_number: next.tracking_number,
    shipping_label_url: next.shipping_label_url,
    shipping_date: next.shipping_date,
    pre_sale_status: current.status || 'listed',
    is_cancelled: 'no',
    cancelled_at: '',
    notes: next.notes
  });
  addActivity({ item_number: next.item_number, action: 'Оформление продажи', field: 'sale_price', old_value: current.sale_price || '—', new_value: String(next.sale_price) });
  return next;
}

function updateShipping(itemNumber, shipping) {
  const current = getItemByNumber(itemNumber);
  if (!current) throw new Error('Товар не найден');
  if (!current.sale_id) throw new Error('Для товара нет активной продажи');

  const next = normalizeItem({
    tracking_number: shipping.tracking_number,
    shipping_label_url: shipping.shipping_label_url,
    shipping_date: shipping.shipping_date,
    shipping_status: shipping.shipping_status,
    status: shipping.shipping_status === 'delivered' ? 'delivered' : (shipping.shipping_status === 'shipped' ? 'shipped' : current.status)
  }, current);
  updateInventoryRow(itemNumber, next);

  updateSalesRow(current.sale_id, (sale) => ({
    ...sale,
    tracking_number: next.tracking_number,
    shipping_label_url: next.shipping_label_url,
    shipping_date: next.shipping_date,
    shipping_status: next.shipping_status,
    status: next.status,
    notes: next.notes
  }));

  addActivity({
    item_number: itemNumber,
    action: 'Обновление доставки',
    field: 'shipping_status',
    old_value: SHIPPING_STATUS[current.shipping_status] || SHIPPING_STATUS.pending,
    new_value: SHIPPING_STATUS[next.shipping_status] || SHIPPING_STATUS.pending
  });
  return next;
}

function cancelSale(itemNumber, saleId) {
  const current = getItemByNumber(itemNumber);
  if (!current) throw new Error('Товар не найден');
  if (!saleId && !current.sale_id) throw new Error('Не найдена продажа для отмены');
  const targetSaleId = saleId || current.sale_id;

  const sale = updateSalesRow(targetSaleId, (prev) => ({
    ...prev,
    is_cancelled: 'yes',
    cancelled_at: new Date().toISOString(),
    status: 'cancelled',
    shipping_status: 'cancelled',
    money_received: 'no'
  }));

  const restoreStatus = sale.pre_sale_status || 'listed';
  const next = normalizeItem({
    sale_id: '',
    sale_price: 0,
    sale_date: '',
    platform: '',
    buyer: '',
    platform_fee: 0,
    profit: 0,
    money_received: 'no',
    tracking_number: '',
    shipping_label_url: '',
    shipping_date: '',
    shipping_status: 'pending',
    status: restoreStatus
  }, current);

  updateInventoryRow(itemNumber, next);
  addActivity({ item_number: itemNumber, action: 'Отмена продажи', field: 'status', old_value: 'Продано', new_value: CONFIG.STATUS_LABELS[restoreStatus] || restoreStatus });
  return next;
}

function getActivity() {
  return getRows(CONFIG.SHEETS.activity, CONFIG.HEADERS.activity)
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
}

function calcPurchaseBalance(items) {
  return items.reduce((acc, i) => {
    const sold = ['sold', 'shipped', 'delivered'].includes(String(i.status));
    const moneyBack = boolText(i.money_received) === 'yes';
    if (!sold || !moneyBack) return acc + toNum(i.total_cost);
    return acc;
  }, 0);
}

function getDashboard() {
  const items = getInventory();
  const sales = getValidSales();
  const currentMonth = monthKey(new Date().toISOString());
  const monthSales = sales.filter((s) => monthKey(s.sale_date || s.timestamp) === currentMonth);

  const stats = {
    active_stock: items.filter((i) => !['sold', 'shipped', 'delivered'].includes(String(i.status))).length,
    listed_vinted: items.filter((i) => boolText(i.listed_vinted) === 'yes').length,
    listed_vestiaire: items.filter((i) => boolText(i.listed_vestiaire) === 'yes').length,
    need_rephoto: items.filter((i) => boolText(i.need_rephoto) === 'yes').length,
    sold_this_month: monthSales.length,
    profit_this_month: monthSales.reduce((a, s) => a + toNum(s.profit), 0),
    purchase_balance: calcPurchaseBalance(items)
  };

  appendRow(CONFIG.SHEETS.statistics, CONFIG.HEADERS.statistics, { timestamp: new Date().toISOString(), ...stats });
  return stats;
}

function getAnalytics() {
  const sales = getValidSales();
  const monthly = {};
  sales.forEach((s) => {
    const m = monthKey(s.sale_date || s.timestamp);
    if (!monthly[m]) monthly[m] = { sold_count: 0, revenue: 0, profit: 0, items: [] };
    monthly[m].sold_count += 1;
    monthly[m].revenue += toNum(s.sale_price);
    monthly[m].profit += toNum(s.profit);
    monthly[m].items.push({
      sale_id: s.sale_id,
      item_number: s.item_number,
      total_cost: toNum(s.total_cost),
      sale_price: toNum(s.sale_price),
      profit: toNum(s.profit),
      sale_date: s.sale_date,
      platform: s.platform,
      money_received: s.money_received,
      status: s.status,
      tracking_number: s.tracking_number,
      shipping_status: s.shipping_status,
      shipping_label_url: s.shipping_label_url
    });
  });
  return { monthly: monthly };
}

function getSalesByMonth(month) {
  const monthKeyValue = month || monthKey(new Date().toISOString());
  const sales = getValidSales()
    .filter((s) => monthKey(s.sale_date || s.timestamp) === monthKeyValue)
    .sort((a, b) => String(a.sale_date).localeCompare(String(b.sale_date)));

  return {
    month: monthKeyValue,
    items: sales,
    summary: {
      sold_count: sales.length,
      revenue: sales.reduce((a, x) => a + toNum(x.sale_price), 0),
      profit: sales.reduce((a, x) => a + toNum(x.profit), 0)
    }
  };
}

function getShippingOverview() {
  const sales = getValidSales();
  const waiting = sales.filter((s) => shippingStatus(s.shipping_status) === 'pending');
  const shipped = sales.filter((s) => shippingStatus(s.shipping_status) === 'shipped');
  const delivered = sales.filter((s) => shippingStatus(s.shipping_status) === 'delivered');
  return {
    summary: {
      pending: waiting.length,
      shipped: shipped.length,
      delivered: delivered.length
    },
    items: sales
      .filter((s) => ['pending', 'shipped'].includes(shippingStatus(s.shipping_status)))
      .sort((a, b) => String(b.sale_date || b.timestamp).localeCompare(String(a.sale_date || a.timestamp)))
      .slice(0, 20)
  };
}

function getQC() {
  return getInventory().filter((i) => {
    const noListing = boolText(i.listed_vinted) === 'no' && boolText(i.listed_vestiaire) === 'no';
    const soldNoMoney = ['sold', 'shipped', 'delivered'].includes(String(i.status)) && boolText(i.money_received) === 'no';
    return !i.photo_url || boolText(i.need_rephoto) === 'yes' || noListing || soldNoMoney || !String(i.notes || '').trim();
  });
}
