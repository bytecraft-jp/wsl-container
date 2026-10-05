import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import App from './App.vue';
import './styles.css';
import '@xterm/xterm/css/xterm.css';

import Dashboard from './views/Dashboard.vue';
import Containers from './views/Containers.vue';
import Images from './views/Images.vue';
import Volumes from './views/Volumes.vue';
import Networks from './views/Networks.vue';
import Hub from './views/Hub.vue';
import Compose from './views/Compose.vue';
import GuiApps from './views/GuiApps.vue';
import TerminalPage from './views/TerminalPage.vue';
import Settings from './views/Settings.vue';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: Dashboard },
    { path: '/containers', component: Containers },
    { path: '/images', component: Images },
    { path: '/volumes', component: Volumes },
    { path: '/networks', component: Networks },
    { path: '/hub', component: Hub },
    { path: '/compose', component: Compose },
    { path: '/gui', component: GuiApps },
    { path: '/terminal', component: TerminalPage },
    { path: '/settings', component: Settings },
  ],
});

createApp(App).use(router).mount('#app');
