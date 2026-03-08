import React, { useEffect, useMemo, useState } from 'https://esm.sh/react@18.3.1';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client';
import htm from 'https://esm.sh/htm@3.1.1';
import { APPS_SCRIPT_URL } from './config.js';

const html = htm.bind(React.createElement);

const STATUS_META = {
  purchased: { label: 'Куплено', icon: '🛍️', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  transit: { label: 'В пути', icon: '🚚', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  repair: { label: 'На ремонте', icon: '🔧', cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  ready: { label: 'Готово', icon: '✨', cls: 'bg-stone-100 text-stone-700 border-stone-200' },
  listed: { label: 'Выставлено', icon: '🏷️', cls: 'bg-violet-100 text-violet-700 border-violet-200' },
  hold: { label: 'Резерв', icon: '⏳', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  sold: { label: 'Продано', icon: '💸', cls: 'bg-green-100 text-green-700 border-green-200' },
  shipped: { label: 'Отправлено', icon: '📦', cls: 'bg-teal-100 text-teal-700 border-teal-200' },
  delivered: { label: 'Доставлено', icon: '✅', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' }
};

const SHIPPING_META = {
  pending: { label: 'Не отправлено', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  shipped: { label: 'Отправлено', cls: 'bg-teal-100 text-teal-700 border-teal-200' },
  delivered: { label: 'Доставлено', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  cancelled: { label: 'Отменено', cls: 'bg-rose-100 text-rose-700 border-rose-200' }
};

const BOTTOM_PAGES = [
  ['dashboard', 'Дашборд', '🏠'],
  ['inventory', 'Склад', '📦'],
  ['sales', 'Продажи', '💶']
];

const MENU_PAGES = [
  ['analytics', 'Аналитика', '📈'],
  ['qc', 'Контроль', '⚠️'],
  ['activity', 'История', '📑'],
  ['rephoto', 'Перефото', '📸'],
  ['settings', 'Настройки', '⚙️']
];

const PLATFORM_OPTIONS = ['Vinted', 'Vestiaire'];
const CATEGORY_OPTIONS = ['Сумка', 'Часы', 'Аксессуар', 'Обувь'];

const money = (v) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(v || 0));
const n = (v) => Number(v || 0);
const boolText = (v) => ['true', '1', 'yes', 'да', 'y'].includes(String(v || '').toLowerCase()) ? 'yes' : 'no';
const shippingLabel = (status) => (SHIPPING_META[status] || SHIPPING_META.pending).label;


const normalizePurchasePayload = (payload) => ({
  ...payload,
  item_id: String(payload.item_number || '').trim(),
  model: payload.model_name || '',
  brand: payload.brand || '—',
  purchase_price: Number(payload.total_cost || 0)
});

const normalizeSalePayload = (payload) => ({
  ...payload,
  item_id: String(payload.item_number || '').trim()
});

const api = async (action, payload = null) => {
  if (!APPS_SCRIPT_URL) throw new Error('Вставьте URL Apps Script в src/config.js');
  if (!payload) {
    const response = await fetch(`${APPS_SCRIPT_URL}?action=${encodeURIComponent(action)}`);
    const json = await response.json();
    if (!json.ok) throw new Error(json.error || 'Ошибка API');
    return json;
  }
  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload })
  });
  const json = await response.json();
  if (!json.ok) throw new Error(json.error || 'Ошибка API');
  return json;
};

const StatusBadge = ({ status }) => {
  const m = STATUS_META[status] || { label: status, icon: '•', cls: 'bg-slate-100 text-slate-700 border-slate-200' };
  return html`<span className=${`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs ${m.cls}`}>${m.icon} ${m.label}</span>`;
};

const ShippingBadge = ({ status }) => {
  const m = SHIPPING_META[status] || SHIPPING_META.pending;
  return html`<span className=${`inline-flex items-center px-2 py-1 rounded-full border text-xs ${m.cls}`}>${m.label}</span>`;
};

function App() {
  const [page, setPage] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [items, setItems] = useState([]);
  const [dashboard, setDashboard] = useState({});
  const [activity, setActivity] = useState([]);
  const [analytics, setAnalytics] = useState({ monthly: {} });
  const [attention, setAttention] = useState([]);
  const [shippingOverview, setShippingOverview] = useState({ summary: {}, items: [] });
  const [monthSales, setMonthSales] = useState({ month: '', items: [], summary: {} });
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [showPurchase, setShowPurchase] = useState(false);
  const [showSale, setShowSale] = useState(false);
  const [salesMonth, setSalesMonth] = useState(new Date().toISOString().slice(0, 7));
  const [showMenu, setShowMenu] = useState(false);
  const [showFabMenu, setShowFabMenu] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [i, d, a, an, qc] = await Promise.all([
        api('getInventory'),
        api('getDashboard'),
        api('getActivity'),
        api('getAnalytics'),
        api('getQC')
      ]);
      setItems(i.items || []);
      setDashboard(d.stats || {});
      setActivity(a.activity || []);
      setAnalytics(an || { monthly: {} });
      setAttention(qc.attention || []);

      let sm = { month: salesMonth, items: [], summary: {} };
      try {
        sm = await api('getSalesByMonth', { month: salesMonth });
      } catch (salesErr) {
        if (!String(salesErr.message || '').includes('Unknown action: getSalesByMonth')) throw salesErr;
        const fromItems = (i.items || [])
          .filter((x) => String(x.sale_date || '').slice(0, 7) === salesMonth && Number(x.sale_price || 0) > 0)
          .map((x) => ({
            sale_id: x.sale_id || '',
            item_number: x.item_number,
            sale_date: x.sale_date,
            sale_price: Number(x.sale_price || 0),
            platform: x.platform || '',
            total_cost: Number(x.total_cost || 0),
            profit: Number(x.profit || 0),
            money_received: x.money_received || 'no',
            status: x.status || 'sold',
            shipping_status: x.shipping_status || 'pending',
            shipping_label_url: x.shipping_label_url || ''
          }))
          .sort((a, b) => String(a.sale_date || '').localeCompare(String(b.sale_date || '')));
        sm = {
          month: salesMonth,
          items: fromItems,
          summary: {
            sold_count: fromItems.length,
            revenue: fromItems.reduce((acc, x) => acc + Number(x.sale_price || 0), 0),
            profit: fromItems.reduce((acc, x) => acc + Number(x.profit || 0), 0)
          }
        };
      }

      setMonthSales(sm || { month: salesMonth, items: [], summary: {} });

      const shippingItems = (sm?.items || []).filter((x) => ['pending', 'shipped'].includes(String(x.shipping_status || 'pending')));
      setShippingOverview({
        summary: {
          pending: (sm?.items || []).filter((x) => String(x.shipping_status || 'pending') === 'pending').length,
          shipped: (sm?.items || []).filter((x) => String(x.shipping_status || '') === 'shipped').length,
          delivered: (sm?.items || []).filter((x) => String(x.shipping_status || '') === 'delivered').length
        },
        items: shippingItems
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [salesMonth]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2400); return () => clearTimeout(t); }, [toast]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      const passQ = !q || String(i.item_number).includes(q) || String(i.model_name || '').toLowerCase().includes(q);
      return passQ && (statusFilter === 'all' || i.status === statusFilter);
    });
  }, [items, query, statusFilter]);

  const rephotoItems = useMemo(() => items.filter((i) => boolText(i.need_rephoto) === 'yes'), [items]);

  const humanError = (err, fallback) => {
    const msg = String(err?.message || '').trim();
    if (!msg) return fallback;
    if (msg.includes('Unknown action')) return 'Бэкенд Apps Script не обновлён. Опубликуйте новую версию Web App.';
    if (msg.includes('Failed to fetch')) return 'Нет связи с Apps Script. Проверьте URL и доступ к интернету.';
    return msg;
  };

  const savePurchase = async (payload) => {
    try {
      setError('');
      const requestPayload = normalizePurchasePayload(payload);
      const r = await api('createPurchase', requestPayload);
      console.info('[createPurchase] request payload:', requestPayload);
      console.info('[createPurchase] response:', r);

      if (!r?.ok || !r?.item) {
        throw new Error(`Некорректный ответ createPurchase: ${JSON.stringify(r)}`);
      }

      const createdItemNumber = String(r.item.item_number || r.item.item_id || '').trim();
      if (!createdItemNumber) {
        throw new Error(`createPurchase вернул item без item_number/item_id: ${JSON.stringify(r.item)}`);
      }

      const inv = await api('getInventory');
      const persisted = (inv.items || []).some((x) => String(x.item_number || x.item_id || '') === createdItemNumber);
      if (!persisted) throw new Error('Покупка не найдена в таблице после сохранения');
      setShowPurchase(false);
      setShowFabMenu(false);
      setToast('Покупка сохранена');
      loadAll();
    } catch (e) {
      setError('Ошибка сохранения покупки: ' + humanError(e, 'Не удалось сохранить покупку'));
    }
  };

  const saveSale = async (payload) => {
    try {
      setError('');
      const r = await api('recordSale', normalizeSalePayload(payload));
      if (!r?.item?.item_number) throw new Error('Продажа не сохранилась в ответе API');
      const sm = await api('getSalesByMonth', { month: (payload.sale_date || new Date().toISOString().slice(0, 10)).slice(0, 7) });
      const persisted = (sm.items || []).some((x) => String(x.item_number) === String(payload.item_number) && Number(x.sale_price || 0) === Number(payload.sale_price || 0));
      if (!persisted) throw new Error('Продажа не найдена в таблице после сохранения');
      setShowSale(false);
      setShowFabMenu(false);
      setToast('Продажа сохранена');
      loadAll();
    } catch (e) {
      setError('Ошибка сохранения продажи: ' + humanError(e, 'Не удалось сохранить продажу'));
    }
  };

  const saveItem = async (itemNumber, updates) => { await api('editItem', { item_number: itemNumber, updates }); setSelected(null); setToast('Карточка обновлена'); loadAll(); };
  const updateStatus = async (itemNumber, status) => { await api('updateStatus', { item_number: itemNumber, status }); setToast('Статус обновлён'); loadAll(); };
  const updateShipping = async (itemNumber, shipping) => { await api('updateShipping', { item_number: itemNumber, shipping }); setToast('Доставка обновлена'); loadAll(); };
  const cancelSale = async (itemNumber, saleId) => {
    if (!window.confirm(`Отменить продажу товара №${itemNumber}?`)) return;
    await api('cancelSale', { item_number: itemNumber, sale_id: saleId });
    setToast('Продажа отменена');
    loadAll();
  };

  const openFromMenu = (nextPage) => {
    setPage(nextPage);
    setShowMenu(false);
  };

  return html`<div className="min-h-screen pb-24 bg-gradient-to-br from-luxe-bg via-luxe-bg to-[#ece6db]">
    <header className="sticky top-0 z-20 border-b border-luxe-border bg-luxe-bg/95 backdrop-blur px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <button className="tap-btn rounded-xl border border-luxe-border bg-white px-3 py-2 text-sm" onClick=${() => setShowMenu(true)}>☰</button>
        <h1 className="text-lg font-semibold">База с Катей</h1>
      </div>
      <button className="tap-btn rounded-xl border border-luxe-border bg-white px-3 py-2 text-sm" onClick=${loadAll}>Обновить</button>
    </header>

    ${showMenu && html`<div className="fixed inset-0 z-40"><div className="absolute inset-0 bg-black/40" onClick=${() => setShowMenu(false)}></div><aside className="absolute left-0 top-0 h-full w-72 bg-white shadow-xl p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">Меню</h2><button className="tap-btn" onClick=${() => setShowMenu(false)}>✕</button></div><div className="mt-4 space-y-2">${MENU_PAGES.map(([id, label, icon]) => html`<button className=${`w-full text-left rounded-xl px-3 py-2 ${page === id ? 'bg-luxe-accent text-white' : 'bg-[#f7f4ef]'}`} onClick=${() => openFromMenu(id)}>${icon} ${label}</button>`)}</div></aside></div>`}

    <main className="p-4 max-w-7xl mx-auto space-y-3 fade-in">
      ${error && html`<div className="rounded-xl bg-rose-100 text-rose-700 p-3">${error}</div>`}
      ${loading && html`<div className="premium-card rounded-2xl p-5">Загрузка данных...</div>`}

      ${!loading && page === 'dashboard' && html`<section className="space-y-3"><div className="grid grid-cols-2 gap-3">${[
        ['📦', 'Активный склад', dashboard.active_stock || 0], ['✅', 'Продано в этом месяце', dashboard.sold_this_month || 0],
        ['💶', 'Прибыль за месяц', money(dashboard.profit_this_month)], ['🏦', 'Остаток закупа', money(dashboard.purchase_balance)],
        ['📭', 'Не отправлено', shippingOverview.summary?.pending || 0], ['📦', 'В пути', shippingOverview.summary?.shipped || 0]
      ].map(([i, t, v]) => html`<div className="premium-card rounded-2xl p-4"><p className="text-xs text-luxe-muted">${i} ${t}</p><p className="text-lg font-semibold mt-1">${v}</p></div>`)}</div>
      <div className="premium-card rounded-2xl p-4"><h2 className="font-semibold">Ожидают отправки / доставки</h2><ul className="mt-2 text-sm space-y-2">${(shippingOverview.items || []).slice(0, 7).map((s) => html`<li className="border-b border-luxe-border/60 pb-2">№${s.item_number} · ${s.platform || '—'} · ${s.sale_date || '—'} · <${ShippingBadge} status=${s.shipping_status}/></li>`)}</ul></div></section>`}

      ${!loading && page === 'inventory' && html`<section className="space-y-3"><div className="premium-card rounded-2xl p-3 grid grid-cols-1 gap-2 items-end"><div><label className="text-xs text-luxe-muted">Поиск</label><input className="w-full rounded-xl border border-luxe-border p-2 bg-white" value=${query} onInput=${(e) => setQuery(e.target.value)} placeholder="Номер или модель"/></div><div><label className="text-xs text-luxe-muted">Статус</label><select className="w-full rounded-xl border border-luxe-border p-2 bg-white" value=${statusFilter} onChange=${(e) => setStatusFilter(e.target.value)}><option value="all">Все</option>${Object.entries(STATUS_META).map(([k, v]) => html`<option value=${k}>${v.label}</option>`)}</select></div></div>
      ${!filteredItems.length ? html`<div className="premium-card rounded-2xl p-6 text-center text-luxe-muted">Нет товаров. Добавьте покупку через +</div>` : null}<div className="space-y-2">${filteredItems.map((i) => html`<article className="premium-card rounded-2xl p-3"><div className="flex justify-between items-start gap-2"><div><p className="font-semibold">№${i.item_number} · ${i.model_name || '—'}</p><p className="text-sm text-luxe-muted">${i.platform || '—'} · ${i.sale_date || '—'}</p><p className="text-sm">Категория: ${i.category || '—'}</p></div><div className="flex flex-col gap-1 items-end"><${StatusBadge} status=${i.status}/><${ShippingBadge} status=${i.shipping_status}/></div></div><button className="tap-btn mt-2 rounded-lg bg-luxe-accent text-white px-3 py-1.5 text-xs" onClick=${() => setSelected(i)}>Открыть</button></article>`)}</div></section>`}

      ${!loading && page === 'sales' && html`<section className="space-y-3"><div className="premium-card rounded-2xl p-4 flex flex-wrap items-end gap-3"><div><label className="text-xs text-luxe-muted">Месяц</label><input type="month" className="rounded-xl border border-luxe-border p-2 bg-white" value=${salesMonth} onInput=${(e) => setSalesMonth(e.target.value)}/></div></div>
      <div className="grid grid-cols-3 gap-3">${[['Продано', monthSales.summary?.sold_count || 0], ['Выручка', money(monthSales.summary?.revenue)], ['Прибыль', money(monthSales.summary?.profit)]].map(([t, v]) => html`<div className="premium-card rounded-2xl p-3"><p className="text-xs text-luxe-muted">${t}</p><p className="text-lg font-semibold">${v}</p></div>`)}</div>
      ${!(monthSales.items || []).length ? html`<div className="premium-card rounded-2xl p-6 text-center text-luxe-muted">За выбранный месяц продаж нет.</div>` : null}<div className="space-y-2">${(monthSales.items || []).map((s) => html`<article className="premium-card rounded-2xl p-3"><div className="flex justify-between gap-2"><div><p className="font-semibold">№${s.item_number} · ${s.platform || '—'}</p><p className="text-sm text-luxe-muted">${s.sale_date || '—'} · ${money(s.sale_price)}</p></div><div className="flex flex-col gap-1 items-end"><${ShippingBadge} status=${s.shipping_status}/>${s.shipping_label_url ? html`<a className="text-blue-700 underline text-xs" href=${s.shipping_label_url} target="_blank">Лейбл</a>` : null}</div></div><button className="tap-btn mt-2 rounded-lg border border-rose-300 text-rose-700 px-2 py-1 text-xs" onClick=${() => cancelSale(s.item_number, s.sale_id)}>Отменить продажу</button></article>`)}</div></section>`}

      ${!loading && page === 'analytics' && html`<section className="space-y-3"><div className="premium-card rounded-2xl p-4"><h2 className="font-semibold">Продажи по месяцам</h2><ul className="mt-2 text-sm space-y-2">${Object.entries(analytics.monthly || {}).sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => html`<li className="border-b border-luxe-border/60 pb-2"><div className="flex justify-between"><b>${m}</b><span>${v.sold_count} шт.</span></div><div className="text-luxe-muted">Выручка: ${money(v.revenue)} · Прибыль: ${money(v.profit)}</div></li>`)}</ul></div></section>`}
      ${!loading && page === 'qc' && html`<section className="premium-card rounded-2xl p-4"><h2 className="font-semibold">Контроль</h2><ul className="mt-2 text-sm list-disc list-inside">${attention.map((i) => html`<li>№ ${i.item_number} · ${i.model_name || '—'}</li>`)}</ul></section>`}
      ${!loading && page === 'activity' && html`<section className="premium-card rounded-2xl p-4 overflow-auto"><table className="min-w-[760px] w-full text-sm"><thead><tr className="text-xs text-luxe-muted"><th className="text-left">Время</th><th>Номер</th><th>Действие</th></tr></thead><tbody>${activity.map((a) => html`<tr className="border-t border-luxe-border/60"><td className="py-2">${new Date(a.timestamp).toLocaleString('ru-RU')}</td><td>${a.item_number}</td><td>${a.action}</td></tr>`)}</tbody></table></section>`}
      ${!loading && page === 'rephoto' && html`<section className="space-y-3"><div className="premium-card rounded-2xl p-4"><h2 className="font-semibold">Товары на перефото</h2><p className="text-sm text-luxe-muted mt-1">Всего: ${rephotoItems.length}</p></div>${rephotoItems.map((i) => html`<article className="premium-card rounded-2xl p-3"><p className="font-semibold">№${i.item_number} · ${i.model_name || '—'}</p><p className="text-sm text-luxe-muted">${i.category || '—'}</p><button className="tap-btn mt-2 rounded-lg bg-luxe-accent text-white px-3 py-1.5 text-xs" onClick=${() => setSelected(i)}>Открыть</button></article>`)}</section>`}
      ${!loading && page === 'settings' && html`<section className="premium-card rounded-2xl p-4"><h2 className="font-semibold">Настройки</h2><p className="mt-2 text-sm text-luxe-muted">API подключен через Apps Script URL из <code>src/config.js</code>.</p><button className="tap-btn mt-3 rounded-lg border border-luxe-border px-3 py-2 text-sm" onClick=${loadAll}>Обновить данные</button></section>`}
    </main>

    ${showFabMenu && html`<div className="fixed inset-0 z-30" onClick=${() => setShowFabMenu(false)}></div>`}
    <div className="fixed right-4 bottom-24 z-40 flex flex-col items-end gap-2">
      ${showFabMenu && html`<div className="premium-card rounded-2xl p-2 flex flex-col gap-2"><button className="tap-btn rounded-xl bg-white border border-luxe-border px-3 py-2 text-sm" onClick=${() => { setShowPurchase(true); setShowFabMenu(false); }}>+ Покупка</button><button className="tap-btn rounded-xl bg-white border border-luxe-border px-3 py-2 text-sm" onClick=${() => { setShowSale(true); setShowFabMenu(false); }}>+ Продажа</button></div>`}
      <button className="tap-btn h-14 w-14 rounded-full bg-luxe-accent text-white text-3xl leading-none shadow-lg" onClick=${() => setShowFabMenu(!showFabMenu)}>+</button>
    </div>

    ${selected && html`<${ItemModal} item=${selected} close=${() => setSelected(null)} save=${saveItem} updateStatus=${updateStatus} updateShipping=${updateShipping} openSale=${() => setShowSale(true)} />`}
    ${showPurchase && html`<${PurchaseModal} close=${() => setShowPurchase(false)} save=${savePurchase} />`}
    ${showSale && html`<${SaleModal} close=${() => setShowSale(false)} items=${items} save=${saveSale} />`}

    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 border-t border-luxe-border mx-auto max-w-7xl p-2 grid grid-cols-3 gap-1 z-30">
      ${BOTTOM_PAGES.map(([id, label, icon]) => html`<button onClick=${() => setPage(id)} className=${`tap-btn rounded-xl text-xs py-2 ${id === page ? 'bg-luxe-accent text-white' : 'text-luxe-muted'}`}>${icon}<br/>${label}</button>`)}
    </nav>

    ${toast && html`<div className="fixed bottom-20 right-4 bg-emerald-700 text-white px-4 py-2 rounded-xl z-50">${toast}</div>`}
  </div>`;
}

function PurchaseModal({ close, save }) {
  const [f, setF] = useState({
    item_number: '',
    photo_url: '',
    model_name: '',
    category: 'Сумка',
    purchase_date: new Date().toISOString().slice(0, 10),
    total_cost: '',
    status: 'purchased',
    listed_vinted: 'no',
    listed_vestiaire: 'no',
    need_rephoto: 'no',
    money_received: 'no',
    notes: ''
  });
  const [preview, setPreview] = useState('');
  const invalid = !String(f.item_number).trim() || !String(f.model_name).trim() || n(f.total_cost) <= 0;

  const onPickPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result || '');
      setPreview(data);
      setF({ ...f, photo_url: data });
    };
    reader.readAsDataURL(file);
  };

  return html`<div className="fixed inset-0 bg-black/45 p-3 md:p-8 z-30 overflow-auto"><form onSubmit=${(e) => { e.preventDefault(); if (!invalid) save(f); }} className="max-w-2xl mx-auto premium-card rounded-2xl p-4 space-y-3"><div className="flex justify-between"><h2 className="font-semibold text-lg">Покупка</h2><button type="button" onClick=${close}>✕</button></div>
    <div className="grid md:grid-cols-2 gap-2">
      <label className="text-xs">Номер товара<input className="w-full mt-1 rounded-xl border p-2" value=${f.item_number} onInput=${(e) => setF({ ...f, item_number: e.target.value })} placeholder="108"/></label>
      <label className="text-xs">Модель<input className="w-full mt-1 rounded-xl border p-2" value=${f.model_name} onInput=${(e) => setF({ ...f, model_name: e.target.value })}/></label>
      <label className="text-xs">Категория<select className="w-full mt-1 rounded-xl border p-2" value=${f.category} onChange=${(e) => setF({ ...f, category: e.target.value })}>${CATEGORY_OPTIONS.map((c) => html`<option value=${c}>${c}</option>`)}</select></label>
      <label className="text-xs">Дата покупки<input type="date" className="w-full mt-1 rounded-xl border p-2" value=${f.purchase_date} onInput=${(e) => setF({ ...f, purchase_date: e.target.value })}/></label>
      <label className="text-xs">Себестоимость<input type="number" className="w-full mt-1 rounded-xl border p-2" value=${f.total_cost} onInput=${(e) => setF({ ...f, total_cost: e.target.value })}/></label>
      <label className="text-xs">Статус<select className="w-full mt-1 rounded-xl border p-2" value=${f.status} onChange=${(e) => setF({ ...f, status: e.target.value })}>${Object.entries(STATUS_META).map(([k, v]) => html`<option value=${k}>${v.label}</option>`)}</select></label>
    </div>
    <div className="rounded-xl border border-luxe-border p-3 bg-white"><p className="text-sm font-medium">Фото товара</p><input type="file" accept="image/*" onChange=${onPickPhoto} className="mt-2 text-sm"/><p className="text-xs text-luxe-muted mt-1">Выберите фото с телефона/компьютера. Ссылка — только как запасной вариант.</p><input className="w-full mt-2 rounded-xl border p-2 text-sm" value=${f.photo_url} onInput=${(e) => setF({ ...f, photo_url: e.target.value })} placeholder="(опционально) или вставьте ссылку"/>${(preview || f.photo_url) ? html`<img src=${preview || f.photo_url} className="mt-2 h-28 rounded-lg object-cover"/>` : null}</div>
    <label className="text-xs block">Заметки<textarea className="w-full mt-1 rounded-xl border p-2" rows="2" value=${f.notes} onInput=${(e) => setF({ ...f, notes: e.target.value })}></textarea></label>
    <button disabled=${invalid} className="tap-btn w-full rounded-xl bg-luxe-accent text-white py-3 disabled:opacity-50">Сохранить покупку</button></form></div>`;
}

function SaleModal({ close, items, save }) {
  const sellable = items.filter((x) => !x.sale_id);
  const [itemNumber, setItemNumber] = useState('');
  const [showShipBlock, setShowShipBlock] = useState(false);
  const [f, setF] = useState({ sale_price: '', platform: 'Vinted', money_received: 'no', status: 'sold', notes: '', shipping_label_url: '', shipping_status: 'pending', shipping_date: '', tracking_number: '' });
  const [labelData, setLabelData] = useState('');

  const suggestions = useMemo(() => {
    const q = itemNumber.trim();
    if (!q) return sellable.slice(0, 8);
    return sellable.filter((i) => String(i.item_number).includes(q)).slice(0, 8);
  }, [itemNumber, sellable]);
  const selectedItem = sellable.find((x) => String(x.item_number) === String(itemNumber.trim()));
  const invalid = !selectedItem || n(f.sale_price) <= 0;

  const onPickLabel = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result || '');
      setLabelData(data);
      setF({ ...f, shipping_label_url: data });
    };
    reader.readAsDataURL(file);
  };

  return html`<div className="fixed inset-0 bg-black/45 p-3 md:p-8 z-30 overflow-auto"><form onSubmit=${(e) => { e.preventDefault(); if (!invalid) save({ ...f, item_number: selectedItem.item_number, sale_date: new Date().toISOString().slice(0, 10) }); }} className="max-w-xl mx-auto premium-card rounded-2xl p-4 space-y-3"><div className="flex justify-between"><h2 className="font-semibold text-lg">Продажа</h2><button type="button" onClick=${close}>✕</button></div>
    <label className="text-xs block">Номер товара<input className="w-full mt-1 rounded-xl border p-2" value=${itemNumber} onInput=${(e) => setItemNumber(e.target.value)} placeholder="Например 108"/></label>
    ${itemNumber && !selectedItem && suggestions.length > 0 ? html`<div className="rounded-xl border border-luxe-border bg-white p-2 text-sm"><p className="text-xs text-luxe-muted mb-1">Подсказки:</p><div className="flex flex-wrap gap-2">${suggestions.map((s) => html`<button type="button" className="tap-btn rounded-lg border border-luxe-border px-2 py-1" onClick=${() => setItemNumber(String(s.item_number))}>№${s.item_number} · ${s.model_name || '—'}</button>`)}</div></div>` : null}
    ${selectedItem ? html`<div className="rounded-xl bg-[#f5efe6] p-3 text-sm">Товар: <b>№${selectedItem.item_number} · ${selectedItem.model_name || '—'}</b><br/>Себестоимость: <b>${money(selectedItem.total_cost)}</b> · Статус: <b>${STATUS_META[selectedItem.status]?.label || selectedItem.status}</b><br/>Листинг: Vinted ${boolText(selectedItem.listed_vinted) === 'yes' ? 'Да' : 'Нет'} · Vestiaire ${boolText(selectedItem.listed_vestiaire) === 'yes' ? 'Да' : 'Нет'}</div>` : html`<div className="rounded-xl bg-amber-50 text-amber-800 p-3 text-sm">Введите номер товара, чтобы выбрать позицию.</div>`}

    <div className="grid md:grid-cols-2 gap-2">
      <label className="text-xs">Цена продажи<input type="number" className="w-full mt-1 rounded-xl border p-2" value=${f.sale_price} onInput=${(e) => setF({ ...f, sale_price: e.target.value })}/></label>
      <label className="text-xs">Платформа<select className="w-full mt-1 rounded-xl border p-2" value=${f.platform} onChange=${(e) => setF({ ...f, platform: e.target.value })}>${PLATFORM_OPTIONS.map((p) => html`<option>${p}</option>`)}</select></label>
      <label className="text-xs">Деньги зашли<select className="w-full mt-1 rounded-xl border p-2" value=${f.money_received} onChange=${(e) => setF({ ...f, money_received: e.target.value })}><option value="no">Нет</option><option value="yes">Да</option></select></label>
      <label className="text-xs">Статус продажи / доставки<select className="w-full mt-1 rounded-xl border p-2" value=${f.status} onChange=${(e) => setF({ ...f, status: e.target.value })}>${['sold', 'shipped', 'delivered'].map((s) => html`<option value=${s}>${STATUS_META[s].label}</option>`)}</select></label>
    </div>

    <label className="text-xs block">Заметки (опционально)<textarea className="w-full mt-1 rounded-xl border p-2" rows="2" value=${f.notes} onInput=${(e) => setF({ ...f, notes: e.target.value })}></textarea></label>

    <div className="rounded-xl border border-luxe-border p-3 bg-white">
      <button type="button" className="tap-btn text-sm underline" onClick=${() => setShowShipBlock(!showShipBlock)}>${showShipBlock ? 'Скрыть' : 'Показать'} блок доставки (опционально)</button>
      ${showShipBlock ? html`<div className="mt-2 space-y-2"><label className="text-xs block">Статус доставки<select className="w-full mt-1 rounded-xl border p-2" value=${f.shipping_status} onChange=${(e) => setF({ ...f, shipping_status: e.target.value })}>${Object.keys(SHIPPING_META).filter((x) => x !== 'cancelled').map((s) => html`<option value=${s}>${shippingLabel(s)}</option>`)}</select></label><label className="text-xs block">Дата отправки<input type="date" className="w-full mt-1 rounded-xl border p-2" value=${f.shipping_date} onInput=${(e) => setF({ ...f, shipping_date: e.target.value })}/></label><label className="text-xs block">TTN (опционально)<input className="w-full mt-1 rounded-xl border p-2" value=${f.tracking_number} onInput=${(e) => setF({ ...f, tracking_number: e.target.value })}/></label><p className="text-sm font-medium">Лейбл доставки</p><input type="file" accept="application/pdf,image/*" onChange=${onPickLabel} className="text-sm"/><input className="w-full rounded-xl border p-2 text-sm" value=${f.shipping_label_url} onInput=${(e) => setF({ ...f, shipping_label_url: e.target.value })} placeholder="или вставьте ссылку"/>${(labelData || f.shipping_label_url) && html`<a className="text-blue-700 underline block" href=${labelData || f.shipping_label_url} target="_blank">Открыть лейбл</a>`}</div>` : null}
    </div>

    <button disabled=${invalid} className="tap-btn w-full rounded-xl bg-luxe-accent text-white py-3 disabled:opacity-50">Сохранить продажу</button></form></div>`;
}

function ItemModal({ item, close, save, updateStatus, updateShipping, openSale }) {
  const [f, setF] = useState(item);
  return html`<div className="fixed inset-0 bg-black/45 p-3 md:p-8 z-30 overflow-auto"><form onSubmit=${(e) => { e.preventDefault(); save(item.item_number, f); }} className="max-w-3xl mx-auto premium-card rounded-2xl p-4 space-y-3"><div className="flex justify-between"><h2 className="font-semibold text-lg">Карточка № ${item.item_number}</h2><button type="button" onClick=${close}>✕</button></div>
  <div className="grid md:grid-cols-2 gap-3"><img src=${f.photo_url || 'https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=900'} className="w-full h-56 rounded-xl object-cover"/><div className="space-y-2"><p className="text-sm">Модель: <b>${f.model_name || '—'}</b></p><p className="text-sm">Категория: <b>${f.category || '—'}</b></p><p className="text-sm">Платформа: <b>${f.platform || '—'}</b></p><p className="text-sm">Дата продажи: <b>${f.sale_date || '—'}</b></p><p className="text-sm">Доставка: <${ShippingBadge} status=${f.shipping_status}/></p>${f.shipping_label_url ? html`<a className="text-blue-700 underline text-sm" href=${f.shipping_label_url} target="_blank">Открыть лейбл</a>` : html`<p className="text-sm text-luxe-muted">Лейбл не прикреплен</p>`}<button type="button" className="tap-btn w-full rounded-xl bg-luxe-accent text-white py-2" onClick=${openSale}>Оформить продажу</button></div></div>
  <div className="grid md:grid-cols-2 gap-2">
    <label className="text-xs">Статус<select className="w-full mt-1 rounded-xl border p-2" value=${f.status} onChange=${(e) => { setF({ ...f, status: e.target.value }); updateStatus(item.item_number, e.target.value); }}>${Object.entries(STATUS_META).map(([k, v]) => html`<option value=${k}>${v.label}</option>`)}</select></label>
    <label className="text-xs">Статус доставки<select className="w-full mt-1 rounded-xl border p-2" value=${f.shipping_status || 'pending'} onChange=${(e) => setF({ ...f, shipping_status: e.target.value })}>${Object.keys(SHIPPING_META).map((s) => html`<option value=${s}>${shippingLabel(s)}</option>`)}</select></label>
    <label className="text-xs">Дата отправки<input type="date" className="w-full mt-1 rounded-xl border p-2" value=${f.shipping_date || ''} onInput=${(e) => setF({ ...f, shipping_date: e.target.value })}/></label>
    <label className="text-xs">TTN<input className="w-full mt-1 rounded-xl border p-2" value=${f.tracking_number || ''} onInput=${(e) => setF({ ...f, tracking_number: e.target.value })}/></label>
    <label className="text-xs md:col-span-2">Лейбл<input className="w-full mt-1 rounded-xl border p-2" value=${f.shipping_label_url || ''} onInput=${(e) => setF({ ...f, shipping_label_url: e.target.value })}/></label>
  </div>
  <div className="flex gap-2"><button type="button" className="tap-btn rounded-xl border border-luxe-border px-4 py-2" onClick=${() => updateShipping(item.item_number, { tracking_number: f.tracking_number, shipping_label_url: f.shipping_label_url, shipping_date: f.shipping_date, shipping_status: f.shipping_status })}>Обновить доставку</button><button className="tap-btn rounded-xl bg-luxe-ink text-white px-4 py-2">Сохранить карточку</button></div>
  </form></div>`;
}

createRoot(document.getElementById('root')).render(html`<${App} />`);
