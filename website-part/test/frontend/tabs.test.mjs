import assert from 'node:assert/strict';
import test from 'node:test';

import { TabList, TabPanel, useTabs } from '../../frontend/src/components/Tabs.jsx';
import { click, press, render, setupDom } from '../support/react.mjs';

const ITEMS = [
  { id: 'operator', label: 'Operator Roll' },
  { id: 'map', label: 'Map Roll' },
  { id: 'extra', label: 'Extra' },
  { id: 'stats', label: 'Stats' },
];

function Harness({ initialId = 'operator', disabled = '' }) {
  const tabs = useTabs({
    items: ITEMS.map(item => ({ ...item, disabled: item.id === disabled })),
    initialId,
  });

  return (
    <div className="roller-container tabs" data-tabs="">
      <TabList tabs={tabs} label="Roll type" />
      {ITEMS.map(item => (
        <TabPanel key={item.id} tabs={tabs} id={item.id}>{`panel ${item.id}`}</TabPanel>
      ))}
    </div>
  );
}

function mount(options) {
  const dom = setupDom();
  render(<Harness {...options} />);
  const tabs = [...dom.document.querySelectorAll('[role="tab"]')];
  return {
    dom,
    document: dom.document,
    tabs,
    panelOf: tab => dom.document.getElementById(tab.getAttribute('aria-controls')),
  };
}

test('tabs render complete ARIA wiring with a single focusable tab', () => {
  const { dom, document, tabs, panelOf } = mount();
  const list = document.querySelector('[role="tablist"]');
  const panels = [...document.querySelectorAll('[role="tabpanel"]')];

  assert.equal(list.classList.contains('tab-list'), true);
  assert.equal(list.getAttribute('aria-label'), 'Roll type');
  assert.deepEqual(tabs.map(tab => tab.textContent), ['Operator Roll', 'Map Roll', 'Extra', 'Stats']);
  assert.ok(tabs.every(tab => tab.classList.contains('tab')));
  assert.ok(panels.every(panel => panel.classList.contains('tab-panel')));

  for (const tab of tabs) {
    assert.equal(panelOf(tab).getAttribute('aria-labelledby'), tab.id);
  }

  assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
  assert.equal(tabs[0].tabIndex, 0);
  assert.equal(tabs[1].tabIndex, -1);
  assert.equal(panelOf(tabs[0]).hidden, false);
  assert.equal(panelOf(tabs[1]).hidden, true);
  dom.cleanup();
});

test('clicking a tab moves the active panel and roving tabindex', () => {
  const { tabs, panelOf } = mount();

  click(tabs[1]);

  assert.equal(tabs[1].getAttribute('aria-selected'), 'true');
  assert.equal(tabs[1].tabIndex, 0);
  assert.equal(tabs[0].getAttribute('aria-selected'), 'false');
  assert.equal(tabs[0].tabIndex, -1);
  assert.equal(panelOf(tabs[1]).hidden, false);
  assert.equal(panelOf(tabs[0]).hidden, true);
});

test('arrow, home and end navigation wrap and skip disabled tabs', () => {
  const { document, tabs } = mount({ disabled: 'extra' });

  tabs[0].focus();
  assert.equal(document.activeElement.id, tabs[0].id);

  press(tabs[0], 'ArrowRight');
  assert.equal(document.activeElement.id, tabs[1].id);
  assert.equal(tabs[1].getAttribute('aria-selected'), 'true');

  // "extra" is disabled, so ArrowRight jumps over it.
  press(tabs[1], 'ArrowRight');
  assert.equal(document.activeElement.id, tabs[3].id);
  assert.equal(tabs[2].getAttribute('aria-selected'), 'false');

  press(tabs[3], 'ArrowRight');
  assert.equal(document.activeElement.id, tabs[0].id, 'navigation wraps to the first enabled tab');

  press(tabs[0], 'End');
  assert.equal(document.activeElement.id, tabs[3].id);

  press(tabs[3], 'Home');
  assert.equal(document.activeElement.id, tabs[0].id);
});

test('a disabled tab refuses selection and keeps its panel hidden', () => {
  const { tabs, panelOf } = mount({ disabled: 'extra' });

  click(tabs[2]);

  assert.equal(tabs[2].getAttribute('aria-selected'), 'false');
  assert.equal(panelOf(tabs[2]).hidden, true);
  assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
});

test('the initial tab can come from the URL parameter', () => {
  const { tabs, panelOf } = mount({ initialId: 'map' });

  assert.equal(panelOf(tabs[1]).hidden, false);
  assert.equal(panelOf(tabs[0]).hidden, true);
});
