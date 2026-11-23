import type { GraphicKind } from '../content/schema.ts';
import { el } from './dom.ts';
import { T } from './texts.ts';

function figure(kind: GraphicKind, caption: string, body: HTMLElement): HTMLElement {
  return el('figure', { class: `graphic graphic-${kind}` }, [
    body,
    el('figcaption', { text: caption }),
  ]);
}

function processGraphic(): HTMLElement {
  const g = T.graphics.prozess;
  return figure(
    'prozess',
    g.caption,
    el(
      'ol',
      { class: 'process' },
      g.steps.map((step) => el('li', { text: step })),
    ),
  );
}

function matrixGraphic(): HTMLElement {
  const g = T.graphics.risikomatrix;
  // Rows from high impact (top) to low; a cell is more important the further up and right it is.
  const rows = [2, 1, 0].map((impact) =>
    el('tr', {}, [
      el('th', { text: g.levels[impact], attrs: { scope: 'row' } }),
      ...[0, 1, 2].map((probability) => {
        const weight = impact + probability;
        const label = weight >= 3 ? g.levels[2] : weight === 2 ? g.levels[1] : g.levels[0];
        return el('td', { class: `matrix-cell weight-${weight}`, text: label });
      }),
    ]),
  );
  const table = el('table', { class: 'matrix' }, [
    el('thead', {}, [
      el('tr', {}, [
        el('th', { text: `${g.impact} ↓ / ${g.probability} →`, attrs: { scope: 'col' } }),
        ...g.levels.map((level) => el('th', { text: level, attrs: { scope: 'col' } })),
      ]),
    ]),
    el('tbody', {}, rows),
  ]);
  return figure('risikomatrix', g.caption, table);
}

function strategiesGraphic(): HTMLElement {
  const g = T.graphics.strategien;
  return figure(
    'strategien',
    g.caption,
    el(
      'ul',
      { class: 'strategies' },
      g.items.map(([name, hint]) =>
        el('li', {}, [el('strong', { text: name }), el('span', { text: hint })]),
      ),
    ),
  );
}

function registerGraphic(): HTMLElement {
  const g = T.graphics.register;
  return figure(
    'register',
    g.caption,
    el('table', { class: 'register' }, [
      el(
        'tbody',
        {},
        g.rows.map(([field, question]) =>
          el('tr', {}, [
            el('th', { text: field, attrs: { scope: 'row' } }),
            el('td', { text: question }),
          ]),
        ),
      ),
    ]),
  );
}

/** F-502: the simple built-in graphics a theory card may refer to. */
export function theoryGraphic(kind: GraphicKind): HTMLElement {
  switch (kind) {
    case 'prozess':
      return processGraphic();
    case 'risikomatrix':
      return matrixGraphic();
    case 'strategien':
      return strategiesGraphic();
    case 'register':
      return registerGraphic();
  }
}
