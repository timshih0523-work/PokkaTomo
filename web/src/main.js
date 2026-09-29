import { createApp } from 'vue';
import App from './App.vue';
import { installClientErrorReporting } from './clientLog.js';
import { installApiFetch } from './api.js';
import './styles.css';

// 所有 /api 請求自動帶上密碼 token 與目前角色（見 api.js）。要在任何元件發請求之前裝好。
installApiFetch();

const app = createApp(App);
installClientErrorReporting(app);
app.mount('#app');
