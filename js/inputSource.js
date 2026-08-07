// キー入力を「アクション名」（left/right/up/down/punchLight/punchMedium/punchHeavy/
// kickLight/kickMedium/kickHeavy）で扱うための入力ソース。
// ローカルのキーボード操作と、ネットワーク越しに受信したリモート操作を
// 同じインターフェース（isDown/isJustPressed）で扱えるようにすることで、
// Game側の入力処理（handleInput等）をローカル/リモート問わず共通化できる
import { isKeyDown, isKeyJustPressed } from "./input.js";

// keyMap: { left: "KeyA", right: "KeyD", ... } のようなアクション名→キーコードの対応表
export function createLocalInputSource(keyMap) {
  return {
    isDown(action) {
      return isKeyDown(keyMap[action]);
    },
    isJustPressed(action) {
      return isKeyJustPressed(keyMap[action]);
    },
  };
}

// ネットワーク経由で受信したアクション状態（{left: true, right: false, ...}）を保持する。
// applyState()が呼ばれるたびに「1つ前の状態」との差分でisJustPressed相当を判定する
export function createRemoteInputSource() {
  let current = {};
  let previous = {};
  return {
    applyState(state) {
      previous = current;
      current = state || {};
    },
    isDown(action) {
      return !!current[action];
    },
    isJustPressed(action) {
      return !!current[action] && !previous[action];
    },
  };
}

// ローカルの現在のキー状態を、送信用にアクション名のプレーンオブジェクトへスナップショットする
export function captureLocalActionState(keyMap) {
  const state = {};
  for (const action in keyMap) {
    state[action] = isKeyDown(keyMap[action]);
  }
  return state;
}
