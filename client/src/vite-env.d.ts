/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  /** local：强制使用浏览器本地存储；remote：强制使用服务端接口 */
  readonly VITE_DATA_MODE?: 'local' | 'remote' | '';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
