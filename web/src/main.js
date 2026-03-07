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

const PAGES = [
  ['dashboard', 'Дашборд', '🏛️'],
  ['inventory', 'Склад', '📦'],
  ['analytics', 'Аналитика', '📈'],
  ['qc', 'Контроль', '🧪'],
  ['activity', 'История', '📑']
];

const money = (v) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(v || 0));
const n = (v) => Number(v || 0);
const dateTime = (v) => (v ? new Date(v).toLocaleString('ru-RU') : '—');
const daysSince = (d) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);

const api = async (action, payload = null) => {
  if (!APPS_SCRIPT_URL) throw new Error('Не задан URL Apps Script. Откройте web/src/config.js и вставьте APPS_SCRIPT_URL.');

  if (!payload) {
    const url = `${APPS_SCRIPT_URL}?action=${encodeURIComponent(action)}`;
    const response = await fetch(url);
    const json = await response.json();
    if (!json.ok) throw new Error(json.error || 'Ошибка Apps Script API');
    return json;
  }

  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload })
  });
  const json = await response.json();
  if (!json.ok) throw new Error(json.error || 'Ошибка Apps Script API');
  return json;
};



const getAttentionReasons = (item) => {
  const reasons = [];
  if (!item.photo_url) reasons.push('🖼 Нет фото товара');
  if (!n(item.listing_price)) reasons.push('🏷 Не указана цена листинга');
  if (!String(item.notes || '').trim()) reasons.push('📝 Нет заметок по состоянию');
  if (item.status === 'ready') reasons.push('⌛ Статус «Готово» без выставления');
  if (item.status === 'listed' && daysSince(item.purchase_date) > 45) reasons.push(`📆 Долгий листинг (${daysSince(item.purchase_date)} дней)`);
  return reasons;
};

const StatusBadge = ({ status }) => {
  const m = STATUS_META[status] || { label: status, icon: '•', cls: 'bg-slate-100 text-slate-700 border-slate-200' };
  return html`<span className=${`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-medium ${m.cls}`}>${m.icon} ${m.label}</span>`;
};

const MetricCard = ({ icon, title, value, featured }) => html`
  <article className=${`premium-card rounded-2xl p-4 transition shadow-soft hover:shadow-luxe ${featured ? 'kpi-featured' : ''}`}>
    <p className="text-xs text-luxe-muted">${icon} ${title}</p>
    <p className=${`mt-1 font-semibold tracking-tight ${featured ? 'text-2xl' : 'text-xl'}`}>${value}</p>
  </article>
`;

const Input = ({ label, helper, error, children }) => html`
  <label className="block text-xs text-luxe-muted">
    ${label}
    <div className="mt-1">${children}</div>
    ${helper ? html`<p className="mt-1 text-[11px] text-luxe-muted">${helper}</p>` : null}
    ${error ? html`<p className="mt-1 text-[11px] text-rose-600">${error}</p>` : null}
  </label>
`;

const TextField = ({ value, onInput, placeholder, type = 'text' }) => html`<input type=${type} value=${value ?? ''} onInput=${onInput} placeholder=${placeholder} className="w-full rounded-xl border border-luxe-border bg-white px-3 py-2.5 text-sm"/>`;
const SelectField = ({ value, onChange, options }) => html`<select value=${value} onChange=${onChange} className="w-full rounded-xl border border-luxe-border bg-white px-3 py-2.5 text-sm">${options.map((o) => html`<option value=${o.value}>${o.label}</option>`)}</select>`;

function App() {
  const [page, setPage] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ text: '', tone: 'neutral' });
  const [items, setItems] = useState([]);
  const [activity, setActivity] = useState([]);
  const [dashboard, setDashboard] = useState({});
  const [analytics, setAnalytics] = useState({ monthly: {}, byPlatform: {}, byBrand: {}, aging: [], repricingCandidates: [], soldCount: 0, averageProfit: 0 });
  const [attention, setAttention] = useState([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [view, setView] = useState('table');
  const [compact, setCompact] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showPurchase, setShowPurchase] = useState(false);
  const [showSale, setShowSale] = useState(false);

  const showToast = (text, tone = 'neutral') => setToast({ text, tone });

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [itemsRes, activityRes, dashboardRes, analyticsRes, qcRes] = await Promise.all([
        api('getInventory'),
        api('getActivity'),
        api('getDashboard'),
        api('getAnalytics'),
        api('getQC')
      ]);
      setItems(itemsRes.items || []);
      setActivity(activityRes.activity || []);
      setDashboard(dashboardRes.stats || {});
      setAnalytics(analyticsRes || {});
      setAttention(qcRes.attention || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    if (!toast.text) return;
    const t = setTimeout(() => setToast({ text: '', tone: 'neutral' }), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const categories = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))], [items]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      const passQuery = !q || [i.item_id, i.brand, i.model].some((v) => String(v || '').toLowerCase().includes(q));
      const passStatus = statusFilter === 'all' || i.status === statusFilter;
      const passCategory = categoryFilter === 'all' || i.category === categoryFilter;
      return passQuery && passStatus && passCategory;
    });
  }, [items, query, statusFilter, categoryFilter]);

  const savePurchase = async (payload) => {
    await api('createPurchase', payload);
    setShowPurchase(false);
    showToast('✅ Закупка сохранена в Google Sheets', 'success');
    loadData();
  };
  const saveSale = async (payload) => {
    await api('recordSale', payload);
    setShowSale(false);
    showToast('✅ Продажа успешно сохранена', 'success');
    loadData();
  };
  const saveItem = async (itemId, payload) => {
    await api('editItem', { item_id: itemId, updates: payload });
    setSelected(null);
    showToast('✅ Карточка товара обновлена', 'success');
    loadData();
  };
  const saveStatus = async (itemId, status) => {
    if (!confirm(`Изменить статус товара ${itemId} на «${STATUS_META[status]?.label || status}»?`)) return;
    await api('updateStatus', { item_id: itemId, status });
    showToast('✅ Статус обновлён', 'success');
    loadData();
  };

  const quickActions = [
    { label: 'Новая закупка', icon: '🧾', onClick: () => setShowPurchase(true) },
    { label: 'Оформить продажу', icon: '💶', onClick: () => setShowSale(true) },
    { label: 'Изменить статус', icon: '🔁', onClick: () => setPage('inventory') },
    { label: 'Открыть склад', icon: '📦', onClick: () => setPage('inventory') }
  ];

  return html`
    <div className="min-h-screen pb-24 md:pb-8 bg-gradient-to-br from-luxe-bg via-luxe-bg to-[#ece6db]">
      <header className="sticky top-0 z-20 border-b border-luxe-border bg-luxe-bg/90 backdrop-blur px-4 md:px-8 py-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-luxe-muted">Atelier Resale</p>
          <h1 className="font-semibold text-lg">Luxury Resale Control Center</h1>
          <p className="text-xs text-luxe-muted mt-0.5">Тихий премиальный режим • EUR • синхронизация через Google Sheets</p>
        </div>
        <div className="flex gap-2">
          <button onClick=${loadData} className="tap-btn rounded-xl border border-luxe-border bg-white px-3 py-2 text-sm">Обновить</button>
          <button onClick=${() => setShowPurchase(true)} className="tap-btn rounded-xl bg-luxe-accent text-white px-4 py-2 text-sm shadow-soft">+ Новая закупка</button>
        </div>
      </header>

      <main className="p-4 md:p-8 max-w-7xl mx-auto space-y-4 fade-in">
        ${error ? html`<div className="rounded-xl bg-rose-100 text-rose-800 p-3">${error}</div>` : null}
        ${loading ? html`<${SkeletonDashboard} />` : null}

        ${!loading && page === 'dashboard' ? html`
          <section className="space-y-4">
            <div className="grid md:grid-cols-3 gap-3">
              <${MetricCard} icon="📦" title="Активный сток" value=${dashboard.active_stock || 0} featured=${true} />
              <${MetricCard} icon="🏷" title="Выставлено" value=${dashboard.listed || 0} />
              <${MetricCard} icon="🚚" title="В пути" value=${dashboard.in_transit || 0} />
              <${MetricCard} icon="🔧" title="На ремонте" value=${dashboard.repair || 0} />
              <${MetricCard} icon="🟡" title="Резерв" value=${dashboard.hold || 0} />
              <${MetricCard} icon="✅" title="Продано за месяц" value=${dashboard.sold_this_month || 0} />
              <${MetricCard} icon="📊" title="Чистая прибыль / месяц" value=${money(dashboard.net_profit_this_month)} featured=${true} />
              <${MetricCard} icon="💼" title="Чистая прибыль / всё время" value=${money(dashboard.net_profit_all_time)} featured=${true} />
              <${MetricCard} icon="🏦" title="Капитал в стоке" value=${money(dashboard.capital_tied_in_stock)} featured=${true} />
            </div>

            <div className="premium-card rounded-2xl p-4">
              <h2 className="font-semibold text-base">Быстрые действия</h2>
              <p className="text-xs text-luxe-muted mt-1">Ключевые действия на каждый день в одно касание.</p>
              <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                ${quickActions.map((a) => html`<button onClick=${a.onClick} className="tap-btn rounded-xl border border-luxe-border bg-white px-4 py-3 text-left text-sm shadow-soft hover:shadow-luxe"><span className="font-medium">${a.icon} ${a.label}</span></button>`) }
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div className="premium-card rounded-2xl p-4">
                <h2 className="font-semibold">📑 Последние действия</h2>
                <ul className="mt-2 space-y-2 text-sm">
                  ${activity.slice(0, 7).map((a) => html`<li className="border-b border-luxe-border/60 pb-1"><span className="text-luxe-muted text-xs">${dateTime(a.timestamp)}</span><br /><b>${a.item_id}</b> — ${a.action}</li>`) }
                </ul>
              </div>
              <div className="premium-card rounded-2xl p-4">
                <h2 className="font-semibold">⚠️ Требует внимания</h2>
                ${attention.length ? html`
                  <div className="mt-2 space-y-2">
                    ${attention.slice(0, 5).map((i) => {
                      const reasons = getAttentionReasons(i);
                      return html`<article className="rounded-xl border border-luxe-border bg-white/70 p-2.5"><div className="flex items-center justify-between"><div><p className="text-sm font-medium">${i.item_id} · ${i.brand}</p><p className="text-xs text-luxe-muted">${i.model}</p></div><${StatusBadge} status=${i.status} /></div><ul className="mt-2 text-xs text-luxe-muted space-y-1">${reasons.slice(0,2).map((r) => html`<li>${r}</li>`)}</ul><button className="tap-btn mt-2 rounded-lg bg-luxe-accent text-white px-3 py-1.5 text-xs" onClick=${() => { setSelected(i); setPage('inventory'); }}>Открыть и исправить</button></article>`;
                    })}
                  </div>
                ` : html`<p className="mt-2 text-sm text-luxe-muted">Сейчас всё в порядке.</p>`}
              </div>
            </div>
          </section>
        ` : null}

        ${!loading && page === 'inventory' ? html`
          <section className="space-y-3">
            <div className="premium-card rounded-2xl p-3 grid md:grid-cols-5 gap-2 items-end">
              <${Input} label="Поиск" helper="По ID, бренду и модели.">${TextField({ value: query, onInput: (e) => setQuery(e.target.value), placeholder: 'LV-24001 / Chanel / Datejust' })}</${Input}>
              <${Input} label="Статус">${SelectField({ value: statusFilter, onChange: (e) => setStatusFilter(e.target.value), options: [{ value: 'all', label: 'Все статусы' }, ...Object.entries(STATUS_META).map(([v, m]) => ({ value: v, label: m.label }))] })}</${Input}>
              <${Input} label="Категория">${SelectField({ value: categoryFilter, onChange: (e) => setCategoryFilter(e.target.value), options: [{ value: 'all', label: 'Все категории' }, ...categories.map((c) => ({ value: c, label: c }))] })}</${Input}>
              <div className="md:col-span-2 flex gap-2">
                <button onClick=${() => setView(view === 'table' ? 'cards' : 'table')} className="tap-btn rounded-xl border border-luxe-border bg-white px-3 py-2 text-sm">${view === 'table' ? 'Режим карточек' : 'Режим таблицы'}</button>
                <button onClick=${() => setCompact(!compact)} className="tap-btn rounded-xl border border-luxe-border bg-white px-3 py-2 text-sm">${compact ? 'Обычная плотность' : 'Компактный режим'}</button>
              </div>
            </div>

            ${!filteredItems.length ? html`<div className="premium-card rounded-2xl p-8 text-center"><p className="font-medium">Пока нет товаров по текущему фильтру</p><p className="text-sm text-luxe-muted">Попробуйте убрать фильтры или добавить новую закупку.</p></div>` : null}

            ${view === 'table' ? html`
              <div className="overflow-auto rounded-2xl border border-luxe-border bg-white shadow-soft">
                <table className="min-w-[1080px] w-full text-sm">
                  <thead><tr className="text-xs text-luxe-muted bg-[#f8f4ee]"><th className="p-3 text-left">ID</th><th>Фото</th><th>Товар</th><th>Статус</th><th>Себестоимость</th><th>Листинг</th><th>Продажа</th><th>Gross</th><th>Net</th><th></th></tr></thead>
                  <tbody>${filteredItems.map((i) => html`<tr className="inventory-row border-t border-luxe-border/60"><td className="p-3 font-semibold">${i.item_id}</td><td><img src=${i.photo_url || 'https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=900'} className="w-11 h-11 rounded-lg object-cover border border-luxe-border" /></td><td><button onClick=${() => setSelected(i)} className="text-left font-medium hover:underline decoration-luxe-accent/40">${i.brand} ${i.model}</button><div className="text-xs text-luxe-muted">${i.category}</div></td><td><${StatusBadge} status=${i.status} /></td><td>${money(i.total_cost)}</td><td>${money(i.listing_price)}</td><td>${n(i.sale_price) ? money(i.sale_price) : '—'}</td><td>${money(i.gross_profit)}</td><td className="font-medium">${money(i.net_profit)}</td><td><button onClick=${() => { setSelected(i); setShowSale(true); }} className="tap-btn rounded-lg bg-luxe-accent text-white px-3 py-1.5 text-xs">Продажа</button></td></tr>`)}</tbody>
                </table>
              </div>
            ` : html`
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                ${filteredItems.map((i) => html`<article className="premium-card rounded-2xl p-3 ${compact ? 'space-y-2' : 'space-y-3'}"><img className=${`rounded-xl object-cover w-full ${compact ? 'h-28' : 'h-44'}`} src=${i.photo_url || 'https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=900'} /><div><p className="text-xs text-luxe-muted">${i.item_id}</p><h3 className="font-semibold">${i.brand} ${i.model}</h3><div className="flex items-center justify-between mt-1"><p className="text-sm">${i.category}</p><${StatusBadge} status=${i.status} /></div></div><p className="text-sm text-luxe-muted">Net: ${money(i.net_profit)}</p><button onClick=${() => setSelected(i)} className="tap-btn rounded-xl border border-luxe-border bg-white py-2.5">Открыть досье товара</button></article>`) }
              </div>
            `}
          </section>
        ` : null}

        ${!loading && page === 'analytics' ? html`<${AnalyticsPage} analytics=${analytics} />` : null}
        ${!loading && page === 'qc' ? html`<${QcPage} attention=${attention} openItem=${(i) => setSelected(i)} />` : null}
        ${!loading && page === 'activity' ? html`<${ActivityPage} activity=${activity} />` : null}
      </main>

      ${selected && html`<${ItemModal} item=${selected} close=${() => setSelected(null)} save=${saveItem} updateStatus=${saveStatus} openSale=${() => setShowSale(true)} activity=${activity} />`}
      ${showPurchase && html`<${PurchaseModal} close=${() => setShowPurchase(false)} save=${savePurchase} />`}
      ${showSale && html`<${SaleModal} close=${() => setShowSale(false)} items=${items} save=${saveSale} />`}

      <nav className="fixed bottom-0 left-0 right-0 md:static bg-white/95 md:bg-transparent backdrop-blur border-t border-luxe-border md:border-0 mx-auto max-w-7xl p-2 grid grid-cols-5 gap-1">
        ${PAGES.map(([id, label, icon]) => html`<button onClick=${() => setPage(id)} className=${`tap-btn rounded-xl text-xs md:text-sm py-2 ${id === page ? 'bg-luxe-accent text-white shadow-soft' : 'text-luxe-muted'}`}>${icon} ${label}</button>`)}
      </nav>

      ${toast.text ? html`<div className=${`fixed bottom-20 right-4 px-4 py-2.5 rounded-xl shadow-luxe text-sm ${toast.tone === 'success' ? 'bg-emerald-700 text-white' : 'bg-luxe-ink text-white'}`}>${toast.text}</div>` : null}
    </div>
  `;
}

function PurchaseModal({ close, save }) {
  const [f, setF] = useState({ item_id: '', photo_url: '', brand: '', model: '', category: '', purchase_date: new Date().toISOString().slice(0, 10), purchase_price: '', shipping_cost: '', customs_cost: '', repair_cost: '', listing_price: '', notes: '', status: 'purchased' });
  const total = n(f.purchase_price) + n(f.shipping_cost) + n(f.customs_cost) + n(f.repair_cost);
  const errors = {
    item_id: !f.item_id.trim() ? 'Введите уникальный ID товара.' : '',
    brand: !f.brand.trim() ? 'Укажите бренд.' : '',
    model: !f.model.trim() ? 'Укажите модель.' : ''
  };
  const hasError = Object.values(errors).some(Boolean);
  const field = (name, label, placeholder, helper, type = 'text') => html`<${Input} label=${label} helper=${helper} error=${errors[name]}>${TextField({ value: f[name], onInput: (e) => setF({ ...f, [name]: e.target.value }), placeholder, type })}</${Input}>`;

  return html`<div className="fixed inset-0 bg-black/45 p-3 md:p-8 z-30 overflow-auto"><form onSubmit=${(e) => { e.preventDefault(); if (!hasError) save(f); }} className="max-w-2xl mx-auto premium-card rounded-2xl p-4 space-y-3"><div className="flex justify-between items-center"><h2 className="font-semibold text-lg">🧾 Новая закупка</h2><button type="button" className="tap-btn" onClick=${close}>✕</button></div><p className="text-sm text-luxe-muted">Заполняйте по шагам. После сохранения данные сразу попадут в Google Sheets.</p><div className="grid md:grid-cols-2 gap-2">${field('item_id', 'ID товара', 'LV-24123', 'Нужен для поиска и статусов.')}${field('photo_url', 'Ссылка на фото', 'https://...jpg', 'Можно добавить позже.')}${field('brand', 'Бренд', 'Louis Vuitton', 'Как на изделии.')}${field('model', 'Модель', 'Speedy 25', 'Точное название.')}${field('category', 'Категория', 'Сумка / Часы / Аксессуар', 'Для фильтров и аналитики.')}${field('purchase_date', 'Дата покупки', '', 'Когда купили товар.', 'date')}${field('purchase_price', 'Цена покупки (EUR)', '0', 'Основной расход.', 'number')}${field('shipping_cost', 'Доставка до вас (EUR)', '0', 'Если не было — 0.', 'number')}${field('customs_cost', 'Таможня (EUR)', '0', 'Если не было — 0.', 'number')}${field('repair_cost', 'Ремонт / химчистка (EUR)', '0', 'Подготовка товара.', 'number')}${field('listing_price', 'Цена листинга (EUR)', '0', 'Цена выставления.', 'number')}</div><${Input} label="Заметки" helper="Состояние, комплект и нюансы.">${html`<textarea value=${f.notes} onInput=${(e) => setF({ ...f, notes: e.target.value })} className="w-full rounded-xl border border-luxe-border bg-white px-3 py-2.5 text-sm" rows="3" placeholder="Например: есть коробка, есть чек"></textarea>`}</${Input}><div className="rounded-xl bg-[#f5efe6] p-3 text-sm"><p>Себестоимость (авто): <b>${money(total)}</b></p><p className="text-luxe-muted">Формула: покупка + доставка + таможня + ремонт.</p></div><button disabled=${hasError} className="tap-btn w-full rounded-xl py-3 bg-luxe-accent text-white disabled:opacity-50">Сохранить закупку</button></form></div>`;
}

function SaleModal({ close, items, save }) {
  const [f, setF] = useState({ item_id: items[0]?.item_id || '', sale_price: '', platform: '', buyer: '', platform_fee: '', shipping_to_buyer: '', notes: '', status: 'sold' });
  const item = items.find((i) => i.item_id === f.item_id) || {};
  const total = n(item.total_cost);
  const gross = n(f.sale_price) - total;
  const net = gross - n(f.platform_fee) - n(f.shipping_to_buyer);
  const markup = total ? ((gross / total) * 100).toFixed(1) : '0';
  const invalid = !f.item_id || n(f.sale_price) <= 0;

  return html`<div className="fixed inset-0 bg-black/45 p-3 md:p-8 z-30 overflow-auto"><form onSubmit=${(e) => { e.preventDefault(); if (!invalid) save(f); }} className="max-w-xl mx-auto premium-card rounded-2xl p-4 space-y-3"><div className="flex items-center justify-between"><h2 className="font-semibold text-lg">💶 Оформление продажи</h2><button type="button" className="tap-btn" onClick=${close}>✕</button></div><${Input} label="Товар">${SelectField({ value: f.item_id, onChange: (e) => setF({ ...f, item_id: e.target.value }), options: items.map((i) => ({ value: i.item_id, label: `${i.item_id} · ${i.brand} ${i.model}` })) })}</${Input}><div className="grid md:grid-cols-2 gap-2"><${Input} label="Цена продажи (EUR)" error=${n(f.sale_price) <= 0 ? 'Введите корректную сумму продажи.' : ''}>${TextField({ value: f.sale_price, onInput: (e) => setF({ ...f, sale_price: e.target.value }), placeholder: '0', type: 'number' })}</${Input}><${Input} label="Платформа" helper="Instagram, Avito, Vestiaire и т.д.">${TextField({ value: f.platform, onInput: (e) => setF({ ...f, platform: e.target.value }), placeholder: 'Instagram' })}</${Input}><${Input} label="Покупатель">${TextField({ value: f.buyer, onInput: (e) => setF({ ...f, buyer: e.target.value }), placeholder: 'Имя или ник' })}</${Input}><${Input} label="Комиссия платформы (EUR)">${TextField({ value: f.platform_fee, onInput: (e) => setF({ ...f, platform_fee: e.target.value }), placeholder: '0', type: 'number' })}</${Input}><${Input} label="Доставка покупателю (EUR)">${TextField({ value: f.shipping_to_buyer, onInput: (e) => setF({ ...f, shipping_to_buyer: e.target.value }), placeholder: '0', type: 'number' })}</${Input}><${Input} label="Финальный статус">${SelectField({ value: f.status, onChange: (e) => setF({ ...f, status: e.target.value }), options: ['sold', 'shipped', 'delivered'].map((s) => ({ value: s, label: STATUS_META[s].label })) })}</${Input}></div><${Input} label="Заметки">${html`<textarea value=${f.notes} onInput=${(e) => setF({ ...f, notes: e.target.value })} rows="3" className="w-full rounded-xl border border-luxe-border bg-white px-3 py-2.5 text-sm"></textarea>`}</${Input}><div className="rounded-xl bg-[#f5efe6] p-3 text-sm space-y-1"><p>Себестоимость: <b>${money(total)}</b></p><p>Gross прибыль: <b>${money(gross)}</b></p><p>Net прибыль: <b>${money(net)}</b></p><p>Наценка: <b>${markup}%</b></p><p className="text-luxe-muted">Формула: Цена продажи − Себестоимость − Комиссия − Доставка.</p></div><button disabled=${invalid} className="tap-btn w-full rounded-xl py-3 bg-luxe-accent text-white disabled:opacity-50">Сохранить продажу</button></form></div>`;
}

function ItemModal({ item, close, save, updateStatus, openSale, activity }) {
  const [form, setForm] = useState(item);
  const total = n(form.purchase_price) + n(form.shipping_cost) + n(form.customs_cost) + n(form.repair_cost);
  const gross = (n(form.sale_price) || n(form.listing_price)) - total;
  const net = n(form.sale_price) ? n(form.sale_price) - total - n(form.platform_fee) - n(form.shipping_to_buyer) : gross;
  const itemActivity = useMemo(() => activity.filter((a) => a.item_id === item.item_id).slice(0, 6), [activity, item.item_id]);
  const itemInput = (k, label, type = 'text') => html`<${Input} label=${label}>${TextField({ value: form[k], onInput: (e) => setForm({ ...form, [k]: e.target.value }), placeholder: '', type })}</${Input}>`;

  return html`<div className="fixed inset-0 bg-black/45 p-3 md:p-8 z-30 overflow-auto"><form onSubmit=${(e) => { e.preventDefault(); if (confirm('Сохранить изменения карточки?')) save(item.item_id, form); }} className="max-w-5xl mx-auto premium-card rounded-2xl p-4 space-y-4"><div className="flex items-center justify-between"><h2 className="font-semibold text-lg">Паспорт товара ${item.item_id}</h2><button type="button" onClick=${close}>✕</button></div><div className="grid md:grid-cols-5 gap-3"><section className="md:col-span-2 space-y-2"><h3 className="font-medium">Фото</h3><img src=${form.photo_url || 'https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=900'} className="w-full h-64 object-cover rounded-xl"/><button type="button" onClick=${openSale} className="tap-btn w-full rounded-xl bg-luxe-accent text-white py-2.5">Оформить продажу</button></section><section className="md:col-span-3 space-y-3"><div className="grid sm:grid-cols-2 gap-2"><div className="premium-sub rounded-xl p-3"><p className="text-xs text-luxe-muted">Основная информация</p>${itemInput('brand','Бренд')}${itemInput('model','Модель')}${itemInput('category','Категория')}<${Input} label="Статус">${SelectField({ value: form.status, onChange: (e) => { const s = e.target.value; setForm({ ...form, status: s }); updateStatus(item.item_id, s); }, options: Object.entries(STATUS_META).map(([v, m]) => ({ value: v, label: `${m.icon} ${m.label}` })) })}</${Input}></div><div className="premium-sub rounded-xl p-3"><p className="text-xs text-luxe-muted">Расходы</p>${itemInput('purchase_price','Цена покупки (EUR)','number')}${itemInput('shipping_cost','Доставка до вас (EUR)','number')}${itemInput('customs_cost','Таможня (EUR)','number')}${itemInput('repair_cost','Ремонт (EUR)','number')}</div><div className="premium-sub rounded-xl p-3"><p className="text-xs text-luxe-muted">Листинг и продажа</p>${itemInput('listing_price','Цена листинга (EUR)','number')}${itemInput('sale_price','Цена продажи (EUR)','number')}${itemInput('platform','Платформа')}${itemInput('buyer','Покупатель')}</div><div className="premium-sub rounded-xl p-3"><p className="text-xs text-luxe-muted">Прибыль</p><p className="text-sm">Себестоимость: <b>${money(total)}</b></p><p className="text-sm">Gross: <b>${money(gross)}</b></p><p className="text-sm">Net: <b>${money(net)}</b></p><${Input} label="Комиссия платформы (EUR)">${TextField({ value: form.platform_fee, onInput: (e) => setForm({ ...form, platform_fee: e.target.value }), type: 'number' })}</${Input}><${Input} label="Доставка покупателю (EUR)">${TextField({ value: form.shipping_to_buyer, onInput: (e) => setForm({ ...form, shipping_to_buyer: e.target.value }), type: 'number' })}</${Input}></div></div></section></div><${Input} label="Заметки">${html`<textarea value=${form.notes || ''} onInput=${(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-xl border border-luxe-border bg-white px-3 py-2.5 text-sm" rows="3"></textarea>`}</${Input}><section className="premium-sub rounded-xl p-3"><h3 className="font-medium">История по товару</h3>${itemActivity.length ? html`<ul className="mt-2 text-sm space-y-1">${itemActivity.map((a) => html`<li className="border-b border-luxe-border/60 pb-1"><span className="text-xs text-luxe-muted">${dateTime(a.timestamp)}</span><br/>${a.action} • <span className="text-luxe-muted">${a.field}</span></li>`)}</ul>` : html`<p className="mt-1 text-sm text-luxe-muted">Для этого товара пока нет действий в журнале.</p>`}</section><button className="tap-btn rounded-xl bg-luxe-ink text-white px-5 py-2.5">Сохранить карточку</button></form></div>`;
}

const AnalyticsPage = ({ analytics }) => {
  const monthly = Object.entries(analytics.monthly || {}).sort(([a], [b]) => a.localeCompare(b));
  const maxRevenue = Math.max(1, ...monthly.map(([, v]) => n(v.revenue)));
  const maxNet = Math.max(1, ...monthly.map(([, v]) => n(v.net)));
  const insight = (analytics.repricingCandidates || []).length > 0 ? 'Есть позиции для переоценки — проверьте блок aging и снизьте цену у старых листингов.' : 'Темп листингов в норме. Фокус: ускорить карточки со статусом «Готово».';

  return html`<section className="space-y-3"><div className="grid md:grid-cols-2 gap-3"><div className="premium-card rounded-2xl p-4"><h3 className="font-semibold">📈 Выручка по месяцам</h3>${monthly.length ? monthly.map(([m, v]) => html`<div className="mt-2"><div className="flex justify-between text-sm"><span>${m}</span><b>${money(v.revenue)}</b></div><div className="h-2 rounded-full bg-luxe-border overflow-hidden"><div className="h-full bg-luxe-accent" style=${{ width: `${(n(v.revenue) / maxRevenue) * 100}%` }}></div></div></div>`) : html`<p className="text-sm text-luxe-muted mt-2">Нет данных о продажах.</p>`}</div><div className="premium-card rounded-2xl p-4"><h3 className="font-semibold">📊 Чистая прибыль по месяцам</h3>${monthly.length ? monthly.map(([m, v]) => html`<div className="mt-2"><div className="flex justify-between text-sm"><span>${m}</span><b>${money(v.net)}</b></div><div className="h-2 rounded-full bg-luxe-border overflow-hidden"><div className="h-full bg-emerald-500" style=${{ width: `${(n(v.net) / maxNet) * 100}%` }}></div></div></div>`) : html`<p className="text-sm text-luxe-muted mt-2">Нет данных о прибыли.</p>`}</div></div><div className="grid md:grid-cols-2 gap-3"><div className="premium-card rounded-2xl p-4"><h3 className="font-semibold">Продажи по платформам</h3><ul className="mt-2 text-sm space-y-1">${Object.entries(analytics.byPlatform || {}).map(([k, v]) => html`<li className="flex justify-between"><span>${k}</span><b>${v}</b></li>`)}</ul></div><div className="premium-card rounded-2xl p-4"><h3 className="font-semibold">Продажи по брендам</h3><ul className="mt-2 text-sm space-y-1">${Object.entries(analytics.byBrand || {}).map(([k, v]) => html`<li className="flex justify-between"><span>${k}</span><b>${v}</b></li>`)}</ul></div></div><div className="grid md:grid-cols-3 gap-3">${[['Проданных товаров', analytics.soldCount], ['Средняя прибыль', money(analytics.averageProfit)], ['Кандидаты на переоценку', (analytics.repricingCandidates || []).length]].map(([k, v]) => html`<${MetricCard} icon="📌" title=${k} value=${v || 0} />`)}</div><div className="premium-card rounded-2xl p-4"><h3 className="font-semibold">Aging выставленных товаров</h3><ul className="mt-2 text-sm space-y-1">${(analytics.aging || []).sort((a, b) => b.days - a.days).slice(0, 12).map((x) => html`<li className="flex justify-between"><span>${x.item_id}</span><span>${x.days} дн.</span></li>`)}</ul></div><div className="premium-card rounded-2xl p-4"><h3 className="font-semibold">Что делать сегодня</h3><p className="text-sm text-luxe-muted mt-2">${insight}</p></div></section>`;
};

const QcPage = ({ attention, openItem }) => html`<section className="space-y-3"><p className="text-sm text-luxe-muted">Приоритет: сначала карточки без фото/цены, затем старые листинги.</p>${attention.length ? html`<div className="grid md:grid-cols-2 gap-3">${attention.map((i) => { const reasons = getAttentionReasons(i); return html`<article className="premium-card rounded-2xl p-3"><div className="flex items-center justify-between"><p className="text-xs text-luxe-muted">${i.item_id}</p><${StatusBadge} status=${i.status} /></div><h3 className="font-semibold mt-1">${i.brand} ${i.model}</h3><ul className="mt-2 text-sm list-disc list-inside space-y-1">${reasons.map((r) => html`<li>${r}</li>`)}</ul><button onClick=${() => openItem(i)} className="tap-btn mt-3 rounded-xl border border-luxe-border bg-white px-3 py-2">Открыть карточку</button></article>`; })}</div>` : html`<div className="premium-card rounded-2xl p-8 text-center">Проблемных карточек сейчас нет.</div>`}</section>`;

const ActivityPage = ({ activity }) => html`<section className="premium-card rounded-2xl p-4 overflow-auto"><table className="min-w-[760px] w-full text-sm"><thead><tr className="text-xs text-luxe-muted"><th className="text-left">Время</th><th>ID</th><th>Действие</th><th>Поле</th><th>Было</th><th>Стало</th></tr></thead><tbody>${activity.map((a) => html`<tr className="border-t border-luxe-border/60"><td className="py-2"><span className="text-xs text-luxe-muted">${dateTime(a.timestamp)}</span></td><td>${a.item_id}</td><td>${a.action}</td><td>${a.field}</td><td>${a.old_value}</td><td>${a.new_value}</td></tr>`)}</tbody></table></section>`;

const SkeletonDashboard = () => html`<div className="grid md:grid-cols-3 gap-3">${Array.from({ length: 9 }).map(() => html`<div className="premium-card rounded-2xl p-4 animate-pulse"><div className="h-3 w-24 bg-luxe-border rounded"></div><div className="h-6 w-36 bg-luxe-border rounded mt-2"></div></div>`)}</div>`;

createRoot(document.getElementById('root')).render(html`<${App} />`);
