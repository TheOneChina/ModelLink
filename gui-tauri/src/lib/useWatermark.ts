import { useEffect, type RefObject } from "react";

// ============================================================
// 防篡改水印（平移 v1 ui.html:718-858，保护强度不降 — design.md §10）：
// - 呈现：侧栏底部两行（宿主由 Sidebar 提供）；宿主消失时回退 body 固定条
// - MutationObserver 监视删除/属性篡改 → 恢复
// - 800ms 周期完整性检查（文本 + computed style）
// - Element.prototype.remove / Node.removeChild / Element.setAttribute 拦截
// - document.title 劫持（文案与签名机制不变）
// ============================================================

const _W = "Winhao学AI";
const _D = "抖音搜索同名";
const _F = "免费软件 · 不可商业化";
const LINE1 = `${_W} · ${_D}`;
const LINE2 = _F;
const TEXT = LINE1 + LINE2; // textContent 拼接后的期望值

// 签名与原型拦截安装一次（模块级），组件重挂载不重复包装
const _SIG = "wm_" + Date.now().toString(36);

function isWm(el: unknown): boolean {
  return (
    el instanceof Element && el.getAttribute && el.getAttribute("data-wm") === _SIG
  );
}

(function installGuards() {
  try {
    const origRemove = Element.prototype.remove;
    Element.prototype.remove = function (this: Element) {
      if (isWm(this)) return;
      return origRemove.call(this);
    };
    const origRemoveChild = Node.prototype.removeChild;
    Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
      if (isWm(child)) return child;
      return origRemoveChild.call(this, child) as T;
    };
  } catch {
    /* ignore */
  }

  try {
    const origSetAttr = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (this: Element, name: string, value: string) {
      if (isWm(this) && (name === "style" || name === "class" || name === "hidden")) {
        return;
      }
      return origSetAttr.call(this, name, value);
    };
  } catch {
    /* ignore */
  }

  try {
    let origTitle = document.title;
    Object.defineProperty(document, "title", {
      get: () => origTitle + " - " + _W,
      set: (v: string) => {
        origTitle = v;
      },
    });
    document.title = "ModelLink";
  } catch {
    /* ignore */
  }

  try {
    const warn = console.warn;
    Object.defineProperty(window, "__wm_remove", {
      get() {
        warn.call(console, "⚠️ " + _F + " — " + _W);
        return undefined;
      },
      configurable: false,
    });
  } catch {
    /* ignore */
  }
})();

function createBlock(fixed: boolean): HTMLDivElement {
  const b = document.createElement("div");
  b.className = fixed ? "ml-wm ml-wm-fixed" : "ml-wm";
  b.setAttribute("data-wm", _SIG);
  const l1 = document.createElement("div");
  l1.textContent = LINE1;
  const l2 = document.createElement("div");
  l2.textContent = LINE2;
  b.append(l1, l2);
  return b;
}

/**
 * 在 host（侧栏底部占位）内维护水印块。host 不可用时回退 body 固定条。
 */
export function useWatermark(hostRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const ensure = () => {
      const host = hostRef.current;
      const existing = document.querySelector<HTMLElement>(`.ml-wm[data-wm="${_SIG}"]`);

      if (host && host.isConnected) {
        let block = existing;
        if (!block || !host.contains(block)) {
          block?.parentElement?.removeChild.call(block.parentElement, block); // 被拦截也无妨，重建为准
          block = createBlock(false);
          host.appendChild(block);
        }
        verify(block);
      } else {
        // 宿主没了（异常篡改）：退回 v1 式 body 固定条
        let block = existing;
        if (!block || !block.isConnected) {
          block = createBlock(true);
          document.body.appendChild(block);
        }
        verify(block);
      }
    };

    const verify = (b: HTMLElement) => {
      if (b.textContent !== TEXT) {
        b.textContent = "";
        const l1 = document.createElement("div");
        l1.textContent = LINE1;
        const l2 = document.createElement("div");
        l2.textContent = LINE2;
        b.append(l1, l2);
      }
      const cs = window.getComputedStyle(b);
      if (
        cs.display === "none" ||
        cs.visibility === "hidden" ||
        parseFloat(cs.opacity) < 0.3 ||
        parseInt(cs.height) < 5 ||
        parseInt(cs.fontSize) < 5 ||
        cs.clipPath !== "none"
      ) {
        // 样式被改：重建（class 由 CSS !important 锚定）
        b.parentElement && origDetach(b);
        ensure();
      }
    };

    // 直接用底层 API 摘除坏节点（我们自己的重建路径，绕过拦截保护）
    const origDetach = (el: Element) => {
      try {
        el.removeAttribute("data-wm");
        el.remove();
      } catch {
        /* ignore */
      }
    };

    ensure();
    const timer = window.setInterval(ensure, 800);

    const mo = new MutationObserver((mutations) => {
      let needCheck = false;
      for (const m of mutations) {
        if (m.removedNodes.length) {
          for (const n of Array.from(m.removedNodes)) {
            if (n.nodeType === 1 && isWm(n)) {
              needCheck = true;
              break;
            }
          }
        }
        if (m.type === "attributes" && isWm(m.target)) needCheck = true;
        if (needCheck) break;
      }
      if (needCheck) window.setTimeout(ensure, 50);
    });
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class", "hidden"],
    });

    return () => {
      window.clearInterval(timer);
      mo.disconnect();
    };
  }, [hostRef]);
}
