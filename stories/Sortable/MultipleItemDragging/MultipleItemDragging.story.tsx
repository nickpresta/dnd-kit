import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {
  ActivationConstraint,
  closestRect,
  rectIntersection,
  DndContext,
  DraggableClone,
  getElementCoordinates,
  Modifiers,
  useDroppable,
  UniqueIdentifier,
  CollisionDetection,
} from '@dnd-kit/core';
import {
  SortableContainer,
  useSortableElement,
  arrayMove,
  useSortableSensors,
  clientRectSortingStrategy,
  verticalListSortingStrategy,
  SortingStrategy,
} from '@dnd-kit/sortable';

import {
  Item,
  List,
  GridContainer,
  Button,
  FloatingControls,
  PlayingCard,
  getDeckOfCards,
  shuffle,
} from '../../components';

import {createRange} from '../../utilities';

import styles from './MultipleItemDragging.module.css';

export default {
  title: 'Presets|Sortable/Multiple Item Dragging',
};

function DroppableContainer({
  children,
  id,
  items,
  getStyle = () => ({}),
  Component = List,
}: {
  children: React.ReactNode;
  id: string;
  items: string[];
  getStyle: ({
    isOverContainer,
  }: {
    isOverContainer: boolean;
  }) => React.CSSProperties;
  Component: React.FunctionComponent<any>;
}) {
  const hasItems = React.Children.count(children) > 0;
  const {over, isOver, setNodeRef} = useDroppable({
    id,
    disabled: hasItems,
  });
  const isOverContainer = isOver && over ? items.includes(over.id) : false;

  return (
    <Component ref={setNodeRef} style={getStyle({isOverContainer})}>
      {children}
    </Component>
  );
}

const defaultContainerStyle = ({
  isOverContainer,
}: {
  isOverContainer: boolean;
}) => ({
  backgroundColor: isOverContainer ? '#F4F4F4' : '#FAFAFA',
});

type Items = Record<string, string[]>;

interface Props {
  activationConstraint?: ActivationConstraint;
  adjustScale?: boolean;
  animateItemInsertion?: boolean;
  collisionDetection?: CollisionDetection;
  Container?: any;
  getItemStyles?(args: {
    value: UniqueIdentifier;
    index: number;
    overIndex: number;
    isDragging: boolean;
    containerId: UniqueIdentifier;
    isSorting: boolean;
    isClone: boolean;
  }): React.CSSProperties;
  wrapperStyle?(args: {index: number}): React.CSSProperties;
  getContainerStyle?(args: {isOverContainer: boolean}): React.CSSProperties;
  itemCount?: number;
  items?: Items;
  handle?: boolean;
  renderItem?: any;
  renderTrashDroppable?: boolean;
  strategy?: SortingStrategy;
  translateModifiers?: Modifiers;
}

const TRASH_DROPPABLE_ID = 'trash';

const customCollisionDetectionStrategy: CollisionDetection = (
  clientRects,
  clientRect
) => {
  const trashRect = clientRects.filter(([id]) => id === TRASH_DROPPABLE_ID);

  if (rectIntersection(trashRect, clientRect)) {
    return TRASH_DROPPABLE_ID;
  }

  const otherRects = clientRects.filter(([id]) => id !== TRASH_DROPPABLE_ID);

  return closestRect(otherRects, clientRect);
};

function SelectableSortable({
  activationConstraint,
  adjustScale = false,
  animateItemInsertion = true,
  itemCount = 3,
  collisionDetection = closestRect,
  Container = DroppableContainer,
  handle = false,
  items: parentItems,
  getItemStyles = () => ({}),
  getContainerStyle = defaultContainerStyle,
  wrapperStyle = () => ({}),
  translateModifiers,
  renderItem,
  strategy = verticalListSortingStrategy,
  renderTrashDroppable = false,
}: Props) {
  const [items, setItems] = useState<Items>(
    () =>
      parentItems ?? {
        A: createRange(itemCount, (index) => `A${index}`),
        B: createRange(itemCount, (index) => `B${index}`),
        C: createRange(itemCount, (index) => `C${index}`),
        [TRASH_DROPPABLE_ID]: [],
      }
  );
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [clonedItems, setClonedItems] = useState<Items | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSortableSensors({
    strategy,
    mouse: {
      options: {
        activationConstraint,
      },
    },
  });
  const activeContainerRef: React.MutableRefObject<string | undefined> = useRef(
    undefined
  );
  const findContainer = (id: string) => {
    if (id in items) {
      return id;
    }

    return Object.keys(items).find((key) => items[key].includes(id));
  };

  const getIndex = (id: string) => {
    const container = findContainer(id);

    if (!container) {
      return -1;
    }

    const index = items[container].indexOf(id);

    return index;
  };

  const isItemSelected = (itemId: string): boolean =>
    selectedItems.includes(itemId);

  const onSelectionChanged = (id: string, isShiftSelect: boolean) => {
    if (isShiftSelect) {
      if (isItemSelected(id)) {
        setSelectedItems(selectedItems.filter((itemId) => itemId !== id));
      } else {
        setSelectedItems([...selectedItems, id]);
      }
    } else {
      setSelectedItems([]);
    }
  };

  useEffect(() => {
    const clearSelection = ({target}: any) => {
      if (target.nodeName !== 'LI' && target.parentNode.nodeName !== 'LI') {
        setSelectedItems([]);
      }
    };
    document.addEventListener('click', clearSelection);

    return () => {
      document.removeEventListener('click', clearSelection);
    };
  }, []);

  useEffect(
    () => {
      if (parentItems) {
        setItems(parentItems);
      }
    },
    parentItems ? Object.values(parentItems) : []
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={({active}) => {
        setActiveId(active.id);
        setClonedItems(items);
        if (selectedItems.length && !isItemSelected(active.id)) {
          setSelectedItems((prevIds) => [...prevIds, active.id]);
        }
        const activeContainer = findContainer(active.id);
        activeContainerRef.current = activeContainer;

        if (selectedItems.length > 0) {
          setItems((items) =>
            selectedItems.reduce((ret, selectedItem) => {
              if (selectedItem === active.id) {
                return ret;
              }
              const container = findContainer(selectedItem);
              return !container
                ? ret
                : {
                    ...ret,
                    [container]: ret[container].filter(
                      (item) => item !== selectedItem
                    ),
                  };
            }, items)
          );
        }
      }}
      onDragOver={({over, draggingRect}) => {
        if (!over) {
          return;
        }

        const overContainer = findContainer(over.id);
        const activeContainer = activeContainerRef.current;

        if (!overContainer || !activeContainer || !activeId) {
          return;
        }

        if (activeContainer !== overContainer) {
          activeContainerRef.current = overContainer;

          setItems((items) => {
            const activeItems = items[activeContainer];
            const overItems = items[overContainer];
            const activeIndex = activeItems.indexOf(activeId);
            const overIndex = overItems.indexOf(over.id);
            const isBelowLastItem =
              overIndex === overItems.length - 1 &&
              draggingRect.top >
                over.clientRect.bottom - over.clientRect.height / 2;

            const modifier = isBelowLastItem ? 1 : 0;
            const newIndex =
              overIndex >= 0 ? overIndex + modifier : overItems.length + 1;

            // TO-DO: Determine the new index based on whether the active rect is above / below the new item's rect?

            return {
              ...items,
              [activeContainer]: [
                ...items[activeContainer].filter((item) => item !== activeId),
              ],
              [overContainer]: [
                ...items[overContainer].slice(0, newIndex),
                // ...items[overContainer],
                items[activeContainer][activeIndex],
                ...items[overContainer].slice(
                  newIndex,
                  items[overContainer].length
                ),
              ],
            };
          });
        }
      }}
      onDragEnd={({over}) => {
        if (!activeId) {
          return;
        }

        const activeContainer = activeContainerRef.current;

        if (!over || !activeContainer) {
          setActiveId(null);
          return;
        }

        if (over.id === TRASH_DROPPABLE_ID) {
          setItems((items) => ({
            ...items,
            [TRASH_DROPPABLE_ID]: [],
          }));
          setActiveId(null);
          return;
        }

        const overContainer = findContainer(over.id);

        if (activeContainer && overContainer) {
          const activeIndex = items[activeContainer].indexOf(activeId);
          const overIndex = items[overContainer].indexOf(over.id);

          if (selectedItems.length) {
            setItems((items) => {
              const newItems = {...items};
              newItems[overContainer] = arrayMove(
                newItems[overContainer],
                activeIndex,
                overIndex
              );
              newItems[overContainer].splice(
                overIndex + 1,
                0,
                ...selectedItems.filter((item) => item !== activeId)
              );
              return newItems;
            });
          } else if (activeIndex !== overIndex) {
            setItems((items) => ({
              ...items,
              [overContainer]: arrayMove(
                items[overContainer],
                activeIndex,
                overIndex
              ),
            }));
          }
        }

        setActiveId(null);
      }}
      onDragCancel={() => {
        if (clonedItems) {
          // Reset items to their original state in case items have been
          // Dragged across containrs
          setItems(clonedItems);
        }

        setActiveId(null);
        setClonedItems(null);
      }}
      translateModifiers={translateModifiers}
    >
      {Object.keys(items)
        .filter((key) => key !== TRASH_DROPPABLE_ID)
        .map((containerId) => (
          <SortableContainer
            id={containerId}
            items={items[containerId]}
            key={containerId}
          >
            <Container
              id={containerId}
              items={items[containerId]}
              getStyle={getContainerStyle}
            >
              {items[containerId].map((value, index) => {
                return (
                  <SelectableSortableItem
                    key={value}
                    id={value}
                    isSelected={isItemSelected(value)}
                    onSelect={onSelectionChanged}
                    index={index}
                    handle={handle}
                    strategy={strategy}
                    animate={animateItemInsertion}
                    style={getItemStyles}
                    wrapperStyle={wrapperStyle}
                    renderItem={renderItem}
                    containerId={containerId}
                    getIndex={getIndex}
                  />
                );
              })}
            </Container>
          </SortableContainer>
        ))}
      {createPortal(
        <DraggableClone adjustScale={adjustScale}>
          {activeId ? (
            <>
              <Item
                value={activeId}
                handle={handle}
                selected={selectedItems.length > 0}
                style={getItemStyles({
                  containerId: findContainer(activeId) as string,
                  overIndex: -1,
                  index: getIndex(activeId),
                  value: activeId,
                  isSorting: activeId !== null,
                  isDragging: true,
                  isClone: true,
                })}
                wrapperStyle={wrapperStyle({index: 0})}
                renderItem={renderItem}
                clone
              />
              {selectedItems
                .filter((value) => value !== activeId)
                .map((value, index) => (
                  <div style={{margin: `-20px 0 0 ${(index + 1) * 5}px`}}>
                    <Item
                      value={value}
                      handle={handle}
                      selected={isItemSelected(value)}
                      style={getItemStyles({
                        containerId: findContainer(value) as string,
                        overIndex: -1,
                        index: getIndex(value),
                        value: value,
                        isSorting: value !== null,
                        isDragging: true,
                        isClone: true,
                      })}
                      wrapperStyle={wrapperStyle({index: 0})}
                      renderItem={renderItem}
                      clone
                    />
                  </div>
                ))}
            </>
          ) : null}
        </DraggableClone>,
        document.body
      )}
      {renderTrashDroppable && activeId ? <Trash /> : null}
    </DndContext>
  );
}

function Trash() {
  const {setNodeRef, isOver} = useDroppable({
    id: TRASH_DROPPABLE_ID,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'fixed',
        left: '50%',
        marginLeft: -150,
        bottom: 20,
        width: 300,
        height: 60,
        borderRadius: 5,
        border: '1px solid',
        borderColor: isOver ? 'red' : '#DDD',
      }}
    >
      Drop here to delete
    </div>
  );
}

interface SelectableSortableItemProps {
  isSelected: boolean;
  onSelect: (id: string, isShiftSelect: boolean) => void;
  animate?: boolean;
  containerId: string;
  id: string;
  index: number;
  handle: boolean;
  strategy: any;
  style(args: any): React.CSSProperties;
  getIndex(id: string): number;
  renderItem(): React.ReactElement;
  wrapperStyle({index}: {index: number}): React.CSSProperties;
}

function SelectableSortableItem({
  isSelected,
  onSelect,
  animate,
  id,
  index,
  handle,
  strategy,
  renderItem,
  style,
  containerId,
  getIndex,
  wrapperStyle,
}: SelectableSortableItemProps) {
  const {
    clientRect,
    node,
    setNodeRef,
    listeners,
    isDragging,
    isSorting,
    over,
    overIndex,
    transform,
  } = useSortableElement({
    id,
    strategy,
  });
  const mounted = useMountStatus();
  const prevIndex = useRef(index);
  const mountedWhileDragging = isDragging && !mounted;

  useEffect(() => {
    if (animate && node.current && isSorting && index !== prevIndex.current) {
      const top = clientRect.current?.offsetTop;
      const newTop = getElementCoordinates(node.current).offsetTop;

      if (top != null && top !== newTop) {
        node.current?.animate(
          [
            {
              transform: `translate3d(0, ${top - newTop}px, 0)`,
            },
            {transform: 'translate3d(0, 0, 0)'},
          ],
          {
            easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
            iterations: 1,
            duration: 250,
          }
        );
      }
    }

    if (index !== prevIndex.current) {
      prevIndex.current = index;
    }
  }, [animate, index, isSorting]);

  const newlisteners = {
    ...listeners,
    onClick: (event: any) => {
      onSelect(id, event.shiftKey);
    },
  };

  return (
    <Item
      ref={setNodeRef}
      value={id}
      dragging={isDragging}
      sorting={isSorting}
      selected={isSelected}
      handle={handle}
      index={index}
      transform={transform}
      wrapperStyle={wrapperStyle({index})}
      style={style({
        index,
        value: id,
        isDragging,
        isSorting,
        overIndex: over ? getIndex(over.id) : overIndex,
        containerId,
      })}
      fadeIn={mountedWhileDragging}
      listeners={newlisteners}
      renderItem={renderItem}
    />
  );
}

const InstructionsContainer = ({children}: any) => (
  <div>
    <div>Hold SHIFT and click to select multiple items</div>
    <div
      style={{
        display: 'flex',
      }}
    >
      {children}
    </div>
  </div>
);

export const BasicSetup = () => (
  <InstructionsContainer>
    <SelectableSortable
      activationConstraint={{
        distance: 15,
      }}
    />
  </InstructionsContainer>
);

export const ManyItems = () => (
  <InstructionsContainer>
    <SelectableSortable
      activationConstraint={{
        distance: 15,
      }}
      itemCount={15}
      getContainerStyle={(args) => ({
        ...defaultContainerStyle(args),
        maxHeight: '80vh',
        overflowY: 'auto',
      })}
    />
  </InstructionsContainer>
);

export const TrashableItems = () => (
  <InstructionsContainer>
    <SelectableSortable
      activationConstraint={{
        distance: 15,
      }}
      collisionDetection={customCollisionDetectionStrategy}
      renderTrashDroppable
    />
  </InstructionsContainer>
);

export const Grid = () => (
  <InstructionsContainer>
    <SelectableSortable
      activationConstraint={{
        distance: 15,
      }}
      Container={(props: any) => <GridContainer columns={2} {...props} />}
      strategy={clientRectSortingStrategy}
      wrapperStyle={() => ({
        width: 150,
        height: 150,
      })}
    />
  </InstructionsContainer>
);

function useMountStatus() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setIsMounted(true), 500);

    return () => clearTimeout(timeout);
  }, []);

  return isMounted;
}
