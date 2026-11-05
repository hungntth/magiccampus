// HUD icon of the Túi tạm thời (legacy warnTemporaryBag canvas): blinks with the entry count while items wait; click opens the
// window. Hidden during a battle (CSS .in-battle). Art is CSS until a swfui render exists.

import { stageEl } from '../stage';
import '../tempBag.css';

export class TemporaryNotice {
  private readonly root = document.createElement('div');

  constructor(onOpen: () => void, parent: HTMLElement = stageEl()) {
    this.root.className = 'tmp-notice';
    this.root.style.display = 'none';
    this.root.textContent = 'Túi';
    this.root.title = 'Nhấp chọn để mở túi tạm thời và sử dụng vật phẩm trong túi!\nKhi offline hệ thống sẽ tự hủy các vật phẩm trong túi tạm thời!';
    this.root.onclick = onOpen;
    parent.appendChild(this.root);
  }

  set(count: number): void {
    this.root.style.display = count > 0 ? '' : 'none';
    this.root.replaceChildren(document.createTextNode('Túi'));
    if (count > 0) {
      const cnt = document.createElement('span');
      cnt.className = 'cnt';
      cnt.textContent = String(count);
      this.root.appendChild(cnt);
    }
  }

  destroy(): void {
    this.root.remove();
  }
}
