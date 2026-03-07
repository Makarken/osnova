/**
 * Atelier Resale CRM — Google Apps Script API bridge
 *
 * Настройка:
 * 1) Вставьте Spreadsheet ID
 * 2) Создайте листы: Inventory, Purchases, Sales, Statistics, Activity Log
 * 3) Deploy > New deployment > Web app > Anyone
 */

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
    inventory: ['item_id', 'photo_url', 'brand', 'model', 'category', 'purchase_date', 'purchase_price', 'shipping_cost', 'customs_cost', 'repair_cost', 'total_cost', 'listing_price', 'sale_price', 'platform', 'buyer', 'notes', 'platform_fee', 'shipping_to_buyer', 'status', 'gross_profit', 'net_profit', 'markup_percent', 'updated_at'],
    purchases: ['timestamp', 'item_id', 'purchase_date', 'purchase_price', 'shipping_cost', 'customs_cost', 'repair_cost', 'total_cost', 'listing_price', 'notes'],
    sales: ['timestamp', 'item_id', 'sale_price', 'platform', 'buyer', 'platform_fee', 'shipping_to_buyer', 'gross_profit', 'net_profit', 'markup_percent', 'status', 'notes'],
    statistics: ['timestamp', 'active_stock', 'listed', 'in_transit', 'repair', 'hold', 'sold_this_month', 'net_profit_this_month', 'net_profit_all_time', 'capital_tied_in_stock'],
    activity: ['timestamp', 'item_id', 'action', 'field', 'old_value', 'new_value', 'actor']
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
    const action = String((e && e.parameter && e.parameter.action) || '');
    return jsonResponse(routeAction(action, null));
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message });
  }
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || '{}';
    const body = JSON.parse(raw);
    const action = String(body.action || '');
    return jsonResponse(routeAction(action, body.payload || {}));
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
    getItemById: () => ({ ok: true, item: getItemById(payload.item_id) }),
    createPurchase: () => ({ ok: true, item: createPurchase(payload) }),
    recordSale: () => ({ ok: true, item: recordSale(payload) }),
    updateStatus: () => ({ ok: true, item: updateStatus(payload.item_id, payload.status) }),
    editItem: () => ({ ok: true, item: editItem(payload.item_id, payload.updates || {}) })
  };

  if (!handlers[action]) throw new Error('Unknown action: ' + action);
  return handlers[action]();
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function ss() {
  if (!CONFIG.SPREADSHEET_ID || CONFIG.SPREADSHEET_ID === 'PASTE_YOUR_SPREADSHEET_ID_HERE') {
    throw new Error('Заполните CONFIG.SPREADSHEET_ID в Apps Script.');
  }
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

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
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function appendRow(sheetName, headers, obj) {
  const sh = getSheet(sheetName, headers);
  sh.appendRow(headers.map((h) => obj[h] == null ? '' : obj[h]));
}

function updateInventoryRow(itemId, nextObj) {
  const sh = getSheet(CONFIG.SHEETS.inventory, CONFIG.HEADERS.inventory);
  const rows = getRows(CONFIG.SHEETS.inventory, CONFIG.HEADERS.inventory);
  const idx = rows.findIndex((r) => String(r.item_id) === String(itemId));
  if (idx === -1) throw new Error('Товар не найден');
  const rowNum = idx + 2;
  sh.getRange(rowNum, 1, 1, CONFIG.HEADERS.inventory.length).setValues([
    CONFIG.HEADERS.inventory.map((h) => nextObj[h] == null ? '' : nextObj[h])
  ]);
}

function toNum(v) {
  return Number(v || 0);
}

function monthKey(v) {
  return String(v || '').slice(0, 7);
}

function normalizeItem(input, prev) {
  const item = {
    item_id: String((input.item_id != null ? input.item_id : prev.item_id) || '').trim(),
    photo_url: input.photo_url != null ? input.photo_url : prev.photo_url,
    brand: input.brand != null ? input.brand : prev.brand,
    model: input.model != null ? input.model : prev.model,
    category: input.category != null ? input.category : prev.category,
    purchase_date: input.purchase_date != null ? input.purchase_date : prev.purchase_date,
    purchase_price: toNum(input.purchase_price != null ? input.purchase_price : prev.purchase_price),
    shipping_cost: toNum(input.shipping_cost != null ? input.shipping_cost : prev.shipping_cost),
    customs_cost: toNum(input.customs_cost != null ? input.customs_cost : prev.customs_cost),
    repair_cost: toNum(input.repair_cost != null ? input.repair_cost : prev.repair_cost),
    listing_price: toNum(input.listing_price != null ? input.listing_price : prev.listing_price),
    sale_price: toNum(input.sale_price != null ? input.sale_price : prev.sale_price),
    platform: input.platform != null ? input.platform : prev.platform,
    buyer: input.buyer != null ? input.buyer : prev.buyer,
    notes: input.notes != null ? input.notes : prev.notes,
    platform_fee: toNum(input.platform_fee != null ? input.platform_fee : prev.platform_fee),
    shipping_to_buyer: toNum(input.shipping_to_buyer != null ? input.shipping_to_buyer : prev.shipping_to_buyer),
    status: input.status != null ? input.status : prev.status
  };

  const total_cost = item.purchase_price + item.shipping_cost + item.customs_cost + item.repair_cost;
  const basis = item.sale_price || item.listing_price;
  const gross_profit = basis - total_cost;
  const net_profit = item.sale_price ? item.sale_price - total_cost - item.platform_fee - item.shipping_to_buyer : gross_profit;
  const markup_percent = total_cost ? ((basis - total_cost) / total_cost) * 100 : 0;

  item.total_cost = total_cost;
  item.gross_profit = gross_profit;
  item.net_profit = net_profit;
  item.markup_percent = markup_percent;
  item.updated_at = new Date().toISOString();

  return item;
}

function getInventory() {
  return getRows(CONFIG.SHEETS.inventory, CONFIG.HEADERS.inventory);
}

function getItemById(itemId) {
  return getInventory().find((x) => String(x.item_id) === String(itemId)) || null;
}

function addActivity(entry) {
  appendRow(CONFIG.SHEETS.activity, CONFIG.HEADERS.activity, {
    timestamp: new Date().toISOString(),
    item_id: entry.item_id || '',
    action: entry.action || '',
    field: entry.field || '',
    old_value: entry.old_value || '',
    new_value: entry.new_value || '',
    actor: 'web'
  });
}

function createPurchase(payload) {
  if (!String(payload.item_id || '').trim()) throw new Error('Нужен item_id');
  if (!String(payload.brand || '').trim()) throw new Error('Нужен бренд');
  if (!String(payload.model || '').trim()) throw new Error('Нужна модель');

  const items = getInventory();
  if (items.some((i) => String(i.item_id) === String(payload.item_id))) throw new Error('ID уже существует');

  const item = normalizeItem(payload, { status: 'purchased' });
  appendRow(CONFIG.SHEETS.inventory, CONFIG.HEADERS.inventory, item);

  appendRow(CONFIG.SHEETS.purchases, CONFIG.HEADERS.purchases, {
    timestamp: new Date().toISOString(),
    item_id: item.item_id,
    purchase_date: item.purchase_date,
    purchase_price: item.purchase_price,
    shipping_cost: item.shipping_cost,
    customs_cost: item.customs_cost,
    repair_cost: item.repair_cost,
    total_cost: item.total_cost,
    listing_price: item.listing_price,
    notes: item.notes
  });

  addActivity({ item_id: item.item_id, action: 'Добавление закупки', field: 'карточка', old_value: '—', new_value: 'создана' });
  return item;
}

function editItem(itemId, updates) {
  const current = getItemById(itemId);
  if (!current) throw new Error('Товар не найден');

  const next = normalizeItem(updates, current);
  updateInventoryRow(itemId, next);
  addActivity({ item_id: itemId, action: 'Редактирование карточки', field: 'карточка', old_value: 'обновление', new_value: 'сохранено' });
  return next;
}

function updateStatus(itemId, status) {
  const current = getItemById(itemId);
  if (!current) throw new Error('Товар не найден');

  const next = normalizeItem({ status: status }, current);
  updateInventoryRow(itemId, next);
  addActivity({
    item_id: itemId,
    action: 'Изменение статуса',
    field: 'status',
    old_value: CONFIG.STATUS_LABELS[current.status] || current.status,
    new_value: CONFIG.STATUS_LABELS[next.status] || next.status
  });
  return next;
}

function recordSale(payload) {
  if (!String(payload.item_id || '').trim()) throw new Error('Нужен item_id');
  if (toNum(payload.sale_price) <= 0) throw new Error('Некорректная цена продажи');

  const current = getItemById(payload.item_id);
  if (!current) throw new Error('Товар не найден');

  const next = normalizeItem({
    sale_price: payload.sale_price,
    platform: payload.platform,
    buyer: payload.buyer,
    platform_fee: payload.platform_fee,
    shipping_to_buyer: payload.shipping_to_buyer,
    notes: payload.notes != null ? payload.notes : current.notes,
    status: payload.status || 'sold'
  }, current);

  updateInventoryRow(current.item_id, next);

  appendRow(CONFIG.SHEETS.sales, CONFIG.HEADERS.sales, {
    timestamp: new Date().toISOString(),
    item_id: next.item_id,
    sale_price: next.sale_price,
    platform: next.platform,
    buyer: next.buyer,
    platform_fee: next.platform_fee,
    shipping_to_buyer: next.shipping_to_buyer,
    gross_profit: next.gross_profit,
    net_profit: next.net_profit,
    markup_percent: next.markup_percent,
    status: next.status,
    notes: payload.notes || ''
  });

  addActivity({ item_id: next.item_id, action: 'Оформление продажи', field: 'sale_price', old_value: current.sale_price || '—', new_value: String(next.sale_price) });
  return next;
}

function getActivity() {
  return getRows(CONFIG.SHEETS.activity, CONFIG.HEADERS.activity)
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
}

function getDashboard() {
  const items = getInventory();
  const sales = getRows(CONFIG.SHEETS.sales, CONFIG.HEADERS.sales);
  const currentMonth = monthKey(new Date().toISOString());
  const monthSales = sales.filter((s) => monthKey(s.timestamp) === currentMonth);
  const stats = {
    active_stock: items.filter((i) => !['sold', 'shipped', 'delivered'].includes(String(i.status))).length,
    listed: items.filter((i) => String(i.status) === 'listed').length,
    in_transit: items.filter((i) => String(i.status) === 'transit').length,
    repair: items.filter((i) => String(i.status) === 'repair').length,
    hold: items.filter((i) => String(i.status) === 'hold').length,
    sold_this_month: monthSales.length,
    net_profit_this_month: monthSales.reduce((a, x) => a + toNum(x.net_profit), 0),
    net_profit_all_time: sales.reduce((a, x) => a + toNum(x.net_profit), 0),
    capital_tied_in_stock: items.filter((i) => !toNum(i.sale_price)).reduce((a, x) => a + toNum(x.total_cost), 0)
  };

  appendRow(CONFIG.SHEETS.statistics, CONFIG.HEADERS.statistics, { timestamp: new Date().toISOString(), ...stats });
  return stats;
}

function getAnalytics() {
  const items = getInventory();
  const sales = getRows(CONFIG.SHEETS.sales, CONFIG.HEADERS.sales);

  const monthly = {};
  const byPlatform = {};
  const byBrand = {};

  sales.forEach((s) => {
    const m = monthKey(s.timestamp);
    if (!monthly[m]) monthly[m] = { revenue: 0, net: 0 };
    monthly[m].revenue += toNum(s.sale_price);
    monthly[m].net += toNum(s.net_profit);

    const platform = s.platform || 'Не указано';
    byPlatform[platform] = (byPlatform[platform] || 0) + 1;

    const item = items.find((i) => String(i.item_id) === String(s.item_id));
    const brand = (item && item.brand) || 'Неизвестно';
    byBrand[brand] = (byBrand[brand] || 0) + 1;
  });

  const aging = items
    .filter((i) => String(i.status) === 'listed')
    .map((i) => ({ item_id: i.item_id, days: Math.floor((Date.now() - new Date(i.purchase_date).getTime()) / 86400000) }));

  return {
    monthly: monthly,
    byPlatform: byPlatform,
    byBrand: byBrand,
    soldCount: sales.length,
    averageProfit: sales.length ? sales.reduce((a, s) => a + toNum(s.net_profit), 0) / sales.length : 0,
    aging: aging,
    repricingCandidates: aging.filter((x) => x.days > 60)
  };
}

function getQC() {
  return getInventory().filter((i) => {
    const staleListed = String(i.status) === 'listed' && daysSince_(i.purchase_date) > 45;
    return !i.photo_url || !toNum(i.listing_price) || !i.notes || String(i.status) === 'ready' || staleListed;
  });
}

function daysSince_(dateString) {
  return Math.floor((Date.now() - new Date(dateString).getTime()) / 86400000);
}
