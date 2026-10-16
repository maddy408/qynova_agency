import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getSettings, updateSettings, getSequences, updateSequence } from '../api/settings';
import { listPaymentMethods, createPaymentMethod, updatePaymentMethod } from '../api/payments';
import { setAppLanguage } from '../i18n';
import { useSettings } from '../hooks/useSettings';
import Users from './Users';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { reloadSettings } = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'company';

  const [settings, setSettings] = useState(null);
  const [sequences, setSequences] = useState([]);
  const [methods, setMethods] = useState([]);
  const [newMethod, setNewMethod] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then((data) => {
      if (data && data.phone_numbers) {
        try {
          if (typeof data.phone_numbers === 'string' && data.phone_numbers.trim().startsWith('[')) {
            const arr = JSON.parse(data.phone_numbers);
            if (Array.isArray(arr)) {
              data.phone_numbers = arr.join(', ');
            }
          } else if (Array.isArray(data.phone_numbers)) {
            data.phone_numbers = data.phone_numbers.join(', ');
          }
        } catch (e) {}
      }
      setSettings(data);
    });
    getSequences().then(setSequences);
    listPaymentMethods({ active_only: '0' }).then(setMethods);
  }, []);

  function field(key, value) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  async function handleSave() {
    await updateSettings(settings);
    await reloadSettings();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function handleSequenceSave(id, prefix) {
    await updateSequence(id, { prefix });
    getSequences().then(setSequences);
  }

  async function addMethod() {
    if (!newMethod.trim()) return;
    await createPaymentMethod({ name_ta: newMethod, name_en: newMethod });
    setNewMethod('');
    listPaymentMethods({ active_only: '0' }).then(setMethods);
  }

  async function toggleMethod(m) {
    await updatePaymentMethod(m.id, { ...m, active: m.active ? 0 : 1 });
    listPaymentMethods({ active_only: '0' }).then(setMethods);
  }

  const navItems = [
    {
      id: 'company',
      label: t('settings.company_profile'),
      desc: 'Shop details & Invoice header',
      icon: (
        <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
    {
      id: 'preferences',
      label: t('settings.business_defaults'),
      desc: 'Languages & print configurations',
      icon: (
        <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      id: 'payments',
      label: t('nav.payments') + ' & ' + t('settings.bill_series'),
      desc: 'Payment modes & bill series prefixes',
      icon: (
        <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
    },
    {
      id: 'users',
      label: t('nav.users'),
      desc: 'Staff logins, roles & permissions',
      icon: (
        <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
  ];

  if (!settings) return <div className="p-4">{t('common.loading')}</div>;

  return (
    <div className="flex flex-col md:flex-row gap-6 items-start pb-10">
      {/* Side Navigation Bar */}
      <aside className="w-full md:w-64 shrink-0 bg-white rounded-xl shadow-sm border border-gray-200 p-2 md:sticky md:top-4">
        <div className="px-3 py-3 border-b border-gray-100 mb-2">
          <h2 className="font-bold text-gray-800 text-base">{t('nav.settings')}</h2>
          <p className="text-xs text-gray-500 mt-0.5">Control panel & preferences</p>
        </div>
        <nav className="flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-1 md:pb-0">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSearchParams({ tab: item.id })}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left whitespace-nowrap ${
                  active
                    ? 'bg-brand-50 text-brand-700 font-semibold border-l-4 border-brand-600 shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-l-4 border-transparent'
                }`}
              >
                <span className={active ? 'text-brand-600' : 'text-gray-400'}>{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="truncate">{item.label}</div>
                  <div className="text-[11px] text-gray-400 font-normal truncate hidden md:block">{item.desc}</div>
                </div>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <section className="flex-1 min-w-0 w-full space-y-4">
        {/* Tab 1: Company Profile */}
        {activeTab === 'company' && (
          <div className="space-y-4 max-w-3xl">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-900">{t('settings.company_profile')}</h1>
                <p className="text-xs text-gray-500">Configure your trade name, contacts and header notes for invoice printing</p>
              </div>
              <button className="btn-primary" onClick={handleSave}>
                {t('common.save')}
              </button>
            </div>

            <div className="card space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <TextField label="Shop name (Tamil) / கடை பெயர் (தமிழ்)" value={settings.company_name_ta} onChange={(v) => field('company_name_ta', v)} />
                <TextField label="Shop name (English) / கடை பெயர் (English)" value={settings.company_name_en} onChange={(v) => field('company_name_en', v)} />
                <TextField label="Proprietor / உரிமையாளர் பெயர்" value={settings.proprietor_name} onChange={(v) => field('proprietor_name', v)} />
                <TextField label="Tagline / வாசகம்" value={settings.company_tagline} onChange={(v) => field('company_tagline', v)} />
                <TextField label="Shop number 1 / கடை எண் 1" value={settings.shop_number} onChange={(v) => field('shop_number', v)} />
                <TextField label="Shop number 2 / கடை எண் 2" value={settings.shop_number_2} onChange={(v) => field('shop_number_2', v)} />
                <TextField label="Address line 1 / முகவரி 1 (மார்க்கெட்)" value={settings.address_line1} onChange={(v) => field('address_line1', v)} />
                <TextField label="Address line 2 / ஊர் (சுரண்டை)" value={settings.address_line2} onChange={(v) => field('address_line2', v)} />
                <TextField label="Phone numbers / தொடர்புக்கு (e.g. 9659580845, 9488103983)" value={settings.phone_numbers} onChange={(v) => field('phone_numbers', v)} />
                <TextField label="Deity 1 / கடவுள் துணை 1" value={settings.god_name_1} onChange={(v) => field('god_name_1', v)} />
                <TextField label="Deity 2 / கடவுள் துணை 2" value={settings.god_name_2} onChange={(v) => field('god_name_2', v)} />
                <TextField label="Logo / Brand badge (e.g. VTC)" value={settings.logo_brand} onChange={(v) => field('logo_brand', v)} />
                <TextField label="GSTIN" value={settings.gstin} onChange={(v) => field('gstin', v)} />
              </div>
              <label className="flex items-center gap-2 text-sm pt-2">
                <input
                  type="checkbox"
                  checked={settings.show_logo === 'true'}
                  onChange={(e) => field('show_logo', e.target.checked ? 'true' : 'false')}
                />
                Show logo on print
              </label>
              <TextField label="Footer note" value={settings.footer_note} onChange={(v) => field('footer_note', v)} />
            </div>

            <div className="flex items-center gap-3">
              <button className="btn-primary" onClick={handleSave}>
                {t('common.save')}
              </button>
              {saved && <span className="text-brand-700 font-medium">✓ Saved successfully</span>}
            </div>
          </div>
        )}

        {/* Tab 2: Languages & Business Defaults */}
        {activeTab === 'preferences' && (
          <div className="space-y-4 max-w-3xl">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-900">{t('settings.business_defaults')}</h1>
                <p className="text-xs text-gray-500">System language and default invoice parameters</p>
              </div>
              <button className="btn-primary" onClick={handleSave}>
                {t('common.save')}
              </button>
            </div>

            <div className="card space-y-3">
              <h2 className="font-semibold text-gray-800">{t('settings.language')}</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={i18n.language === 'ta' ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => setAppLanguage('ta')}
                >
                  {t('common.tamil')}
                </button>
                <button
                  type="button"
                  className={i18n.language === 'en' ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => setAppLanguage('en')}
                >
                  {t('common.english')}
                </button>
              </div>
              <div className="pt-2">
                <label className="label">Invoice print language</label>
                <select
                  className="input max-w-xs"
                  value={settings.invoice_language}
                  onChange={(e) => field('invoice_language', e.target.value)}
                >
                  <option value="ta">{t('common.tamil')}</option>
                  <option value="en">{t('common.english')}</option>
                </select>
              </div>
            </div>

            <div className="card space-y-3">
              <h2 className="font-semibold text-gray-800">Business Calculation Defaults</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                <TextField
                  label="Default commission %"
                  type="number"
                  value={settings.default_commission_percent}
                  onChange={(v) => field('default_commission_percent', v)}
                />
                <TextField
                  label="Default distant cooli"
                  type="number"
                  value={settings.default_distant_cooli}
                  onChange={(v) => field('default_distant_cooli', v)}
                />
                <TextField
                  label="Default distant vadagai"
                  type="number"
                  value={settings.default_distant_vadagai}
                  onChange={(v) => field('default_distant_vadagai', v)}
                />
                <div>
                  <label className="label">Default print format</label>
                  <select
                    className="input"
                    value={settings.default_print_format}
                    onChange={(e) => field('default_print_format', e.target.value)}
                  >
                    <option value="a4">A4</option>
                    <option value="a5">A5</option>
                    <option value="thermal58">Thermal 58mm</option>
                    <option value="thermal80">Thermal 80mm</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button className="btn-primary" onClick={handleSave}>
                {t('common.save')}
              </button>
              {saved && <span className="text-brand-700 font-medium">✓ Saved successfully</span>}
            </div>
          </div>
        )}

        {/* Tab 3: Payments & Bill Series */}
        {activeTab === 'payments' && (
          <div className="space-y-4 max-w-3xl">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{t('nav.payments')} & {t('settings.bill_series')}</h1>
              <p className="text-xs text-gray-500">Manage billing sequence numbers and payment options</p>
            </div>

            <div className="card space-y-3">
              <h2 className="font-semibold text-gray-800">{t('settings.bill_series')}</h2>
              <div className="space-y-2">
                {sequences.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 border border-gray-100">
                    <span className="w-48 text-sm font-medium">{s.series_key}</span>
                    <input
                      className="input w-24"
                      defaultValue={s.prefix}
                      onBlur={(e) => handleSequenceSave(s.id, e.target.value)}
                    />
                    <span className="text-xs text-gray-400">Next bill #{s.next_number}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card space-y-3">
              <h2 className="font-semibold text-gray-800">{t('nav.payments')} — Methods</h2>
              <div className="space-y-2">
                {methods.map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100">
                    <div>
                      <span className="font-medium">{m.name_ta}</span>
                      <span className="text-gray-500 text-sm ml-2">({m.name_en})</span>
                      {m.is_default ? <span className="ml-2 text-xs bg-brand-100 text-brand-800 px-2 py-0.5 rounded-full font-medium">default</span> : null}
                    </div>
                    <button
                      className={m.active ? 'btn-secondary text-brand-700 font-medium' : 'btn-secondary text-gray-400'}
                      onClick={() => toggleMethod(m)}
                    >
                      {m.active ? t('common.active') : t('common.inactive')}
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <input
                  className="input"
                  placeholder="New payment method name"
                  value={newMethod}
                  onChange={(e) => setNewMethod(e.target.value)}
                />
                <button className="btn-secondary whitespace-nowrap" onClick={addMethod}>
                  + {t('common.add')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Users Management */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <Users embedded />
          </div>
        )}
      </section>
    </div>
  );
}

function TextField({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" type={type} value={value || ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
