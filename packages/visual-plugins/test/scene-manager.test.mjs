// Purpose: Verify ordered visual scene layer host composition.
import assert from 'node:assert/strict';
import test from 'node:test';

import { DefaultSceneManager } from '../dist-visual-plugins-out/index.js';

function createContainer() {
  const children = [];
  return {
    children,
    clientWidth: 320,
    clientHeight: 240,
    appendChild(node) {
      const current = children.indexOf(node);
      if (current >= 0) children.splice(current, 1);
      children.push(node);
      node.parentNode = this;
    },
    removeChild(node) {
      const index = children.indexOf(node);
      if (index >= 0) children.splice(index, 1);
      node.parentNode = null;
    },
    insertBefore(node, reference) {
      const current = children.indexOf(node);
      if (current >= 0) children.splice(current, 1);
      const nextIndex = reference ? children.indexOf(reference) : -1;
      if (nextIndex >= 0) {
        children.splice(nextIndex, 0, node);
      } else {
        children.push(node);
      }
      node.parentNode = this;
    },
    querySelectorAll(selector) {
      const sceneId = selector.match(/data-shugu-scene-id="([^"]+)"/)?.[1];
      if (!sceneId) return [];
      return children.filter((child) => child.dataset?.shuguSceneId === sceneId);
    },
  };
}

function createScene(id) {
  return {
    id,
    mount(container) {
      this.element = {
        dataset: { shuguSceneId: id },
        classList: { add: () => undefined },
        style: {},
        parentNode: null,
      };
      container.appendChild(this.element);
    },
    unmount() {
      if (this.element?.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
    },
    update() {},
    configure(options) {
      this.options = options;
    },
  };
}

test('DefaultSceneManager stacks ordered scene layers with later layers on top', () => {
  const container = createContainer();
  const manager = new DefaultSceneManager(container);
  manager.registerFactory('box-scene', () => createScene('box-scene'));
  manager.registerFactory('fct-track-scene', () => createScene('fct-track-scene'));

  manager.setLayerScenes([
    { key: '0-box', sceneId: 'box-scene', options: { type: 'box' } },
    { key: '1-fctTrack', sceneId: 'fct-track-scene', options: { type: 'fctTrack' } },
  ]);

  assert.deepEqual(container.children.map((child) => child.dataset.shuguLayerKey), [
    '0-box',
    '1-fctTrack',
  ]);
  assert.equal(container.children[0].style.position, 'absolute');
  assert.equal(container.children[0].style.zIndex, 'calc(var(--layer-scene-base, 0) + 0)');
  assert.equal(container.children[1].style.position, 'absolute');
  assert.equal(container.children[1].style.zIndex, 'calc(var(--layer-scene-base, 0) + 1)');
});
