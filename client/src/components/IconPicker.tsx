import { MENU_ICON_OPTIONS } from './MenuIcon';

interface IconPickerProps {
  value?: string;
  onChange?: (value: string) => void;
}

/** 与 Form.Item 配合使用的图标选择器 */
export function IconPicker({ value, onChange }: IconPickerProps) {
  return (
    <div className="icon-picker">
      {MENU_ICON_OPTIONS.map(({ value: key, label, Component }) => (
        <button
          key={key}
          type="button"
          title={label}
          aria-label={label}
          className={`icon-picker-item${value === key ? ' is-active' : ''}`}
          onClick={() => onChange?.(key)}
        >
          <Component />
        </button>
      ))}
    </div>
  );
}
