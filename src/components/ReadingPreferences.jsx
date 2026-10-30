import { useId, useRef, useState } from "react";
import {
  DEFAULT_READING_PREFERENCES,
  READER_FONT_SCALES,
  getReaderAppearance,
  normalizeReadingPreferences,
} from "../reading-preferences.js";
import "../reading-preferences.css";

const THEMES = [
  { value: "light", label: "浅色" }, { value: "warm", label: "暖色" },
  { value: "green", label: "青绿" }, { value: "night", label: "夜间" },
  { value: "oled", label: "纯黑" }, { value: "system", label: "自动" },
];
const SIZE_PRESETS = [
  { value: 0.875, label: "小" }, { value: 1, label: "标准" },
  { value: 1.25, label: "大" }, { value: 1.5, label: "特大" },
];

function OptionGroup({ legend, name, options, value, onChange, className = "" }) {
  return <fieldset className="reading-preferences-fieldset">
    <legend>{legend}</legend>
    <div className={`reading-option-grid ${className}`} style={{ "--option-count": options.length }}>
      {options.map((option) => <label className="reading-preference-option" key={String(option.value)}>
        <input type="radio" name={name} value={String(option.value)} checked={value === option.value}
          onChange={() => onChange(option.value)} />
        <span>{option.label}</span>
      </label>)}
    </div>
  </fieldset>;
}

/** Form content only: the parent owns the dialog, focus trap and dismissal. */
export default function ReadingPreferences({ value, onChange, storageWarning }) {
  const settings = normalizeReadingPreferences(value);
  const id = useId();
  const inputRef = useRef("pointer");
  const [inputMethod, setInputMethod] = useState("pointer");
  const markInput = (method) => { inputRef.current = method; setInputMethod(method); };
  const change = (patch) => onChange(patch, { inputMethod: inputRef.current });
  const sizeIndex = READER_FONT_SCALES.indexOf(settings.fontScale);
  const isDefault = Object.keys(DEFAULT_READING_PREFERENCES).every((key) => settings[key] === DEFAULT_READING_PREFERENCES[key]);
  const options = (key, legend, values, className) => <OptionGroup key={key} legend={legend} name={`${id}-${key}`}
    value={settings[key]} options={values} className={className} onChange={(next) => change({ [key]: next })} />;

  return <div className="reading-preferences" data-preferences-input={inputMethod}
    onPointerDownCapture={() => markInput("pointer")}
    onKeyDownCapture={() => markInput("keyboard")}
    onClickCapture={(event) => { if (event.detail === 0) markInput("keyboard"); }}>
    <p className="reading-preferences-intro">你的书页，你的阅读节奏。</p>

    {/* DEVICE-FIX4 (REQ-45): the mode switch leads the sheet. On the
        00046 build it sat below five other groups (~200px under the
        fold at 852px tall) and a reader on the wrong mode never found
        it; the primary reading choice is the first thing listed now. */}
    {options("readingMode", "阅读方式", [{ value: "page", label: "逐屏阅读" }, { value: "scroll", label: "上下滚动" }])}
    {settings.readingMode === "page" && <p className="reading-preference-hint reading-font-note">点页面左／右两侧逐屏翻页，保留少量内容重叠，也可以直接上下滚动。</p>}
    {/* READER-FIX3 (REQ-47): the turn animation is chosen right
        under the mode it belongs to — simulated curl by default,
        the smooth slide as the alternative. */}
    {settings.readingMode === "page" && options("turnStyle", "翻页动画", [{ value: "curl", label: "仿真翻页" }, { value: "slide", label: "平滑滑动" }])}

    <fieldset className="reading-preferences-fieldset">
      <legend>文字大小</legend>
      <div className="reading-font-stepper">
        <button type="button" className="reading-font-step" aria-label="缩小字号" disabled={sizeIndex === 0}
          onClick={() => change({ fontScale: READER_FONT_SCALES[sizeIndex - 1] })}><span aria-hidden="true">A−</span></button>
        <output className="reading-font-value" aria-live="polite" aria-atomic="true">{Math.round(settings.fontScale * 100)}<span>%</span></output>
        <button type="button" className="reading-font-step reading-font-step-large" aria-label="放大字号"
          disabled={sizeIndex === READER_FONT_SCALES.length - 1}
          onClick={() => change({ fontScale: READER_FONT_SCALES[sizeIndex + 1] })}><span aria-hidden="true">A+</span></button>
      </div>
      <div className="reading-font-options" role="group" aria-label="选择字号">
        {SIZE_PRESETS.map(({ value: size, label }) => <label className="reading-preference-option" key={size}>
          <input type="radio" name={`${id}-font-size`} value={size} checked={settings.fontScale === size}
            onChange={() => change({ fontScale: size })} /><span>{label}</span>
        </label>)}
      </div>
      <p className="reading-preference-hint">字号随屏幕宽度自动适配，档位是相对基准的倍率。</p>
    </fieldset>

    <fieldset className="reading-preferences-fieldset">
      <legend>阅读背景</legend>
      <div className="reading-theme-options">
        {THEMES.map((option) => <label className="reading-preference-option reading-theme-option" key={option.value}>
          <input type="radio" name={`${id}-theme`} value={option.value} checked={settings.theme === option.value}
            onChange={() => change({ theme: option.value })} />
          <span><i className="reading-theme-swatch" data-theme={option.value} aria-hidden="true" />{option.label}
            <svg className="reading-theme-check" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="m3 8 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        </label>)}
      </div>
      {settings.theme === "system" && <p className="reading-preference-hint">自动跟随设备的浅色／深色外观。</p>}
    </fieldset>

    {options("fontFamily", "字体", [{ value: "system", label: "系统黑体" }, { value: "serif", label: "宋体" }])}
    {settings.fontFamily === "serif" && <p className="reading-preference-hint reading-font-note">使用设备已有宋体；未安装时使用浏览器衬线字体，不下载额外字体。</p>}

    <section className="reading-preferences-preview" aria-label="阅读效果预览" {...getReaderAppearance(settings, { inputMethod })}>
      <span className="reading-preview-label">阅读预览</span>
      <p>晚风翻过书页，远处的灯一盏盏亮起。故事还长，我们慢慢读。</p>
      <p>你停下脚步，听见了另一个世界的回声。</p>
    </section>

    {options("lineHeight", "行间距", [{ value: 1.6, label: "密集" }, { value: 1.8, label: "紧凑" }, { value: 1.9, label: "舒适" }, { value: 2.05, label: "宽松" }, { value: 2.3, label: "疏朗" }])}
    <label className="reading-toggle-row">
      <span><strong>阅读时保持亮屏</strong><small>仅在此页阅读时生效，设备允许时启用。</small></span>
      <input type="checkbox" role="switch" checked={settings.keepAwake} onChange={(event) => change({ keepAwake: event.target.checked })} />
      <i className="reading-switch" aria-hidden="true" />
    </label>
    <p className="reading-preference-hint">屏幕亮度请在设备控制中心调节。</p>

    <details className="reading-advanced">
      <summary>更多排版<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></summary>
      <div className="reading-advanced-content">
        {options("margin", "页边距", [{ value: "narrow", label: "窄" }, { value: "standard", label: "标准" }, { value: "wide", label: "宽" }])}
        {options("paragraphSpacing", "段间距", [{ value: 0.6, label: "紧凑" }, { value: 1, label: "标准" }, { value: 1.4, label: "宽松" }])}
        {options("paragraphIndent", "首行缩进", [{ value: true, label: "空两格" }, { value: false, label: "不缩进" }])}
        {options("textAlign", "文字对齐", [{ value: "left", label: "左对齐" }, { value: "justify", label: "两端对齐" }])}
        {options("letterSpacing", "字间距", [{ value: 0, label: "标准" }, { value: 0.03, label: "稍宽" }, { value: 0.06, label: "宽松" }])}
      </div>
    </details>

    <div className="reading-preferences-footer">
      <p role="status">{storageWarning || "仅保存在这台设备，不影响故事和进度。"}</p>
      <button type="button" className="reading-preferences-reset" disabled={isDefault && !storageWarning}
        onClick={() => change(DEFAULT_READING_PREFERENCES)}>恢复默认</button>
    </div>
  </div>;
}
