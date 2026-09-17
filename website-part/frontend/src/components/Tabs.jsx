import { useEffect, useId, useRef, useState } from 'react';

// ARIA tabs: roving tabindex, arrow/home/end navigation and disabled tabs are
// skipped by the keyboard model.
export function useTabs({ items, initialId = null }) {
  const baseId = useId();
  const enabled = items.filter(item => !item.disabled);
  const initial = items.find(item => item.id === initialId && !item.disabled) || enabled[0] || null;
  const [activeId, setActiveId] = useState(initial?.id ?? null);
  const nodeById = useRef(new Map());
  const focusTarget = useRef(null);

  useEffect(() => {
    const id = focusTarget.current;
    focusTarget.current = null;
    if (id) nodeById.current.get(id)?.focus();
  }, [activeId]);

  const select = (id, { focus = false } = {}) => {
    const item = items.find(candidate => candidate.id === id);
    if (!item || item.disabled) return false;
    focusTarget.current = focus ? id : null;
    setActiveId(id);
    return true;
  };

  const onKeyDown = event => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (enabled.length === 0) return;
    if (event.key === 'Home') {
      select(enabled[0].id, { focus: true });
      return;
    }
    if (event.key === 'End') {
      select(enabled[enabled.length - 1].id, { focus: true });
      return;
    }

    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const index = enabled.findIndex(item => item.id === activeId);
    const next = enabled[(index + direction + enabled.length) % enabled.length];
    select(next.id, { focus: true });
  };

  const itemOf = id => items.find(candidate => candidate.id === id);
  const tabId = id => itemOf(id)?.tabId || `${baseId}-${id}-tab`;
  const panelId = id => itemOf(id)?.panelId || `${baseId}-${id}-panel`;

  return {
    items,
    activeId,
    select,
    isActive: id => id === activeId,
    tabProps: id => {
      const item = itemOf(id);
      const selected = id === activeId;
      return {
        id: tabId(id),
        type: 'button',
        role: 'tab',
        className: `tab${selected ? ' active' : ''}`,
        disabled: Boolean(item?.disabled),
        'aria-selected': selected,
        'aria-controls': panelId(id),
        tabIndex: selected ? 0 : -1,
        onClick: () => select(id),
        onKeyDown,
        ref: node => {
          if (node) nodeById.current.set(id, node);
          else nodeById.current.delete(id);
        },
      };
    },
    panelProps: id => ({
      id: panelId(id),
      role: 'tabpanel',
      className: `tab-panel${id === activeId ? ' active' : ''}`,
      'aria-labelledby': tabId(id),
      hidden: id !== activeId,
    }),
  };
}

export function TabList({ tabs, label, className = '' }) {
  return (
    <div
      className={`tab-list${className ? ` ${className}` : ''}`}
      role="tablist"
      aria-label={label}
    >
      {tabs.items.map(item => (
        <button key={item.id} {...tabs.tabProps(item.id)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ tabs, id, className = '', as: Tag = 'div', children, ...rest }) {
  const props = tabs.panelProps(id);
  return (
    <Tag
      {...props}
      {...rest}
      className={`${props.className}${className ? ` ${className}` : ''}`}
    >
      {children}
    </Tag>
  );
}
