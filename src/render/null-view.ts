import type { SceneView } from '../core/scene.ts';

/** The view of the simple mode (`?renderer=none`, N-207): accepts everything, draws nothing. */
export function createNullView(): SceneView {
  return {
    render: () => undefined,
    dispose: () => undefined,
  };
}
