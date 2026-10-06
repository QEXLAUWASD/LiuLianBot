import { setLocale, t, useLocale } from '../lib/i18n.mjs';

export function LanguageSelect() {
  const locale = useLocale();
  return (
    <label className="language-select">
      <span aria-hidden="true">文 / A</span>
      <span className="sr-only">{t('Website language')}</span>
      <select value={locale} onChange={event => setLocale(event.target.value)}>
        <option value="en" lang="en">English</option>
        <option value="zh-HK" lang="zh-HK">繁體中文（香港）</option>
        <option value="zh-CN" lang="zh-CN">简体中文</option>
      </select>
    </label>
  );
}
