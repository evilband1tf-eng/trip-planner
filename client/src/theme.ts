import type { ThemeConfig } from 'antd';

export const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: '#2f6bff',
    borderRadius: 10,
    colorTextBase: '#1f2430',
    colorBgLayout: '#f5f6fa',
    fontSize: 14,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
  },
  components: {
    Card: { borderRadiusLG: 16 },
    Menu: { itemHeight: 48, itemBorderRadius: 10, itemMarginInline: 0 },
    Button: { controlHeightLG: 44, fontWeight: 500 },
    Modal: { borderRadiusLG: 16 },
    Tag: { borderRadiusSM: 6 },
  },
};
