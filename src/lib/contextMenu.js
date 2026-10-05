// 右クリックメニューの状態
import { reactive } from 'vue';

export const menu = reactive({ visible: false, x: 0, y: 0, items: [], title: '' });

/**
 * items: { label, icon, action, danger, disabled, hint, children, divider, header }
 */
export function showMenu(event, items, title = '') {
  event.preventDefault();
  event.stopPropagation();
  menu.items = items.filter(Boolean);
  menu.title = title;
  menu.x = event.clientX;
  menu.y = event.clientY;
  menu.visible = true;
}

export function hideMenu() {
  menu.visible = false;
}
