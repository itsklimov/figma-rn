/**
 * Детектор модалов, bottom sheets и action sheets в Figma
 * Анализирует структуру узла для определения типа оверлея и генерации кода
 */

/**
 * Результат определения типа sheet/modal
 */
export interface SheetDetection {
  type: 'bottom-sheet' | 'modal' | 'action-sheet' | 'none';
  confidence: number; // 0-1
  snapPoints: string[]; // например, ['25%', '50%', '90%']
  hasOverlay: boolean;
  hasDragHandle: boolean;
  hasCloseButton: boolean;
  contentNode: any; // Внутренний узел контента
}

/**
 * Действие в action sheet
 */
export interface ActionSheetAction {
  label: string;
  destructive: boolean;
  icon?: string;
}

/**
 * Проверка наличия полупрозрачного оверлея
 */
function hasOverlayBackground(node: any): boolean {
  if (!node.children || node.children.length === 0) {
    return false;
  }

  // Ищем фоновый слой с черным цветом и прозрачностью
  for (const child of node.children) {
    // Проверка на имя (часто overlay, background, backdrop)
    const nameLower = (child.name || '').toLowerCase();
    if (
      nameLower.includes('overlay') ||
      nameLower.includes('backdrop') ||
      nameLower.includes('background') ||
      nameLower.includes('bg')
    ) {
      // Проверка цвета и прозрачности
      if (child.fills && Array.isArray(child.fills)) {
        for (const fill of child.fills) {
          if (fill.type === 'SOLID' && fill.color) {
            const { r, g, b } = fill.color;
            const opacity = fill.opacity ?? 1.0;

            // Темный цвет с прозрачностью (черный/темно-серый + opacity < 0.8)
            if (r <= 0.2 && g <= 0.2 && b <= 0.2 && opacity > 0.1 && opacity < 0.9) {
              return true;
            }
          }
        }
      }

      // Проверка opacity самого узла
      if (child.opacity !== undefined && child.opacity > 0.1 && child.opacity < 0.9) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Проверка наличия drag handle (индикатор перетаскивания)
 */
function hasDragHandleIndicator(node: any): boolean {
  if (!node.children) {
    return false;
  }

  function searchForHandle(n: any, depth: number = 0): boolean {
    // Ограничиваем глубину поиска
    if (depth > 3) {
      return false;
    }

    const nameLower = (n.name || '').toLowerCase();
    if (
      nameLower.includes('handle') ||
      nameLower.includes('drag') ||
      nameLower.includes('indicator') ||
      nameLower.includes('grip')
    ) {
      // Проверяем размеры: маленький горизонтальный элемент
      if (n.absoluteBoundingBox) {
        const { width, height } = n.absoluteBoundingBox;
        // Типичный handle: width 30-60px, height 4-6px
        if (width > 20 && width < 100 && height > 2 && height < 10) {
          return true;
        }
      }
      return true; // Если имя подходит, считаем что это handle
    }

    // Рекурсивный поиск
    if (n.children) {
      for (const child of n.children) {
        if (searchForHandle(child, depth + 1)) {
          return true;
        }
      }
    }

    return false;
  }

  return searchForHandle(node);
}

/**
 * Проверка наличия кнопки закрытия (X icon)
 */
function hasCloseButtonIcon(node: any): boolean {
  if (!node.children) {
    return false;
  }

  function searchForCloseButton(n: any, depth: number = 0): boolean {
    if (depth > 4) {
      return false;
    }

    const nameLower = (n.name || '').toLowerCase();
    if (
      nameLower.includes('close') ||
      nameLower.includes('dismiss') ||
      nameLower.includes('×') ||
      nameLower.includes('x') ||
      nameLower === 'x'
    ) {
      return true;
    }

    // Рекурсивный поиск
    if (n.children) {
      for (const child of n.children) {
        if (searchForCloseButton(child, depth + 1)) {
          return true;
        }
      }
    }

    return false;
  }

  return searchForCloseButton(node);
}

/**
 * Проверка выравнивания контейнера (снизу, по центру)
 */
function detectAlignment(node: any): 'bottom' | 'center' | 'unknown' {
  if (!node.absoluteBoundingBox || !node.parent) {
    return 'unknown';
  }

  const { y, height } = node.absoluteBoundingBox;

  // Если есть родитель, пытаемся определить относительное положение
  let parentHeight = 0;
  if (node.parent && node.parent.absoluteBoundingBox) {
    parentHeight = node.parent.absoluteBoundingBox.height;
  }

  // Если узел находится в нижней части (y + height близко к высоте родителя)
  if (parentHeight > 0) {
    const bottomPosition = y + height;
    const relativePosition = bottomPosition / parentHeight;

    if (relativePosition > 0.7) {
      return 'bottom';
    }

    if (relativePosition > 0.3 && relativePosition < 0.7) {
      return 'center';
    }
  }

  // Проверка auto layout constraints
  if (node.constraints) {
    if (node.constraints.vertical === 'BOTTOM') {
      return 'bottom';
    }
    if (node.constraints.vertical === 'CENTER') {
      return 'center';
    }
  }

  return 'unknown';
}

/**
 * Проверка округлых верхних углов (типично для bottom sheets)
 */
function hasRoundedTopCorners(node: any): boolean {
  if (!node.cornerRadius && !node.rectangleCornerRadii) {
    return false;
  }

  // Проверка отдельных радиусов углов
  if (node.rectangleCornerRadii && Array.isArray(node.rectangleCornerRadii)) {
    const [topLeft, topRight, bottomRight, bottomLeft] = node.rectangleCornerRadii;

    // Верхние углы округлены, нижние нет (или меньше)
    if (topLeft > 8 && topRight > 8 && bottomLeft <= topLeft / 2 && bottomRight <= topRight / 2) {
      return true;
    }
  }

  // Общий cornerRadius больше 8
  if (typeof node.cornerRadius === 'number' && node.cornerRadius > 8) {
    return true;
  }

  return false;
}

/**
 * Поиск узла контента (главный контейнер внутри sheet/modal)
 */
function findContentNode(node: any): any {
  if (!node.children || node.children.length === 0) {
    return node;
  }

  // Пропускаем overlay/backdrop узлы
  for (const child of node.children) {
    const nameLower = (child.name || '').toLowerCase();

    // Пропускаем известные оверлеи
    if (
      nameLower.includes('overlay') ||
      nameLower.includes('backdrop') ||
      nameLower.includes('background')
    ) {
      continue;
    }

    // Ищем контейнер контента
    if (
      nameLower.includes('content') ||
      nameLower.includes('sheet') ||
      nameLower.includes('modal') ||
      nameLower.includes('container') ||
      child.type === 'FRAME' ||
      child.type === 'COMPONENT'
    ) {
      return child;
    }
  }

  // Возвращаем первый не-overlay узел
  return node.children.find((child: any) => {
    const nameLower = (child.name || '').toLowerCase();
    return !nameLower.includes('overlay') && !nameLower.includes('backdrop');
  }) || node.children[0];
}

/**
 * Вычисление snap points на основе высоты и вариантов
 */
function calculateSnapPoints(node: any): string[] {
  const snapPoints: string[] = [];

  // Дефолтные snap points
  if (!node.absoluteBoundingBox) {
    return ['25%', '50%', '90%'];
  }

  const { height } = node.absoluteBoundingBox;

  // Получаем высоту экрана (примерная)
  let screenHeight = 812; // iPhone X height по умолчанию

  if (node.parent && node.parent.absoluteBoundingBox) {
    screenHeight = node.parent.absoluteBoundingBox.height;
  }

  // Вычисляем процент от экрана
  const heightPercent = Math.round((height / screenHeight) * 100);

  // Если есть варианты (variants), они могут указывать на разные состояния
  if (node.componentPropertyDefinitions) {
    const props = Object.keys(node.componentPropertyDefinitions);

    // Ищем варианты высоты (height, state, size)
    const heightVariants = props.filter(
      (p) => p.toLowerCase().includes('height') ||
             p.toLowerCase().includes('state') ||
             p.toLowerCase().includes('size')
    );

    if (heightVariants.length > 0) {
      // Есть варианты, используем их
      snapPoints.push('25%', '50%', `${heightPercent}%`);
    } else {
      // Нет вариантов, используем только текущую высоту
      snapPoints.push(`${heightPercent}%`);
    }
  } else {
    // Для статического узла предлагаем стандартные snap points
    if (heightPercent < 40) {
      snapPoints.push(`${heightPercent}%`);
    } else if (heightPercent < 70) {
      snapPoints.push('25%', `${heightPercent}%`);
    } else {
      snapPoints.push('25%', '50%', `${heightPercent}%`);
    }
  }

  return snapPoints.length > 0 ? snapPoints : ['50%'];
}

/**
 * Основная функция детектирования sheet/modal
 */
export function detectSheetOrModal(node: any): SheetDetection {
  const detection: SheetDetection = {
    type: 'none',
    confidence: 0,
    snapPoints: [],
    hasOverlay: false,
    hasDragHandle: false,
    hasCloseButton: false,
    contentNode: node,
  };

  // Проверяем признаки
  const hasOverlay = hasOverlayBackground(node);
  const hasDragHandle = hasDragHandleIndicator(node);
  const hasCloseButton = hasCloseButtonIcon(node);
  const alignment = detectAlignment(node);
  const hasRoundedTop = hasRoundedTopCorners(node);

  detection.hasOverlay = hasOverlay;
  detection.hasDragHandle = hasDragHandle;
  detection.hasCloseButton = hasCloseButton;

  // Поиск контента
  detection.contentNode = findContentNode(node);

  // Логика определения типа
  let confidencePoints = 0;
  let detectedType: 'bottom-sheet' | 'modal' | 'action-sheet' | 'none' = 'none';

  // Проверка на Bottom Sheet
  if (alignment === 'bottom' || hasRoundedTop) {
    confidencePoints += 30;
    detectedType = 'bottom-sheet';
  }

  if (hasDragHandle) {
    confidencePoints += 40;
    detectedType = 'bottom-sheet';
  }

  // Проверка на Modal (центрированный)
  if (alignment === 'center' && hasOverlay) {
    confidencePoints += 30;
    if (detectedType === 'none') {
      detectedType = 'modal';
    }
  }

  // Проверка на Action Sheet (список действий)
  const actions = extractActionSheetActions(detection.contentNode);
  if (actions.length >= 2) {
    confidencePoints += 30;
    if (detectedType === 'bottom-sheet') {
      detectedType = 'action-sheet';
    }
  }

  // Overlay добавляет уверенности любому типу
  if (hasOverlay) {
    confidencePoints += 10;
  }

  // Close button добавляет уверенности
  if (hasCloseButton) {
    confidencePoints += 10;
  }

  // Проверка имени узла
  const nameLower = (node.name || '').toLowerCase();
  if (nameLower.includes('sheet') || nameLower.includes('bottom')) {
    confidencePoints += 20;
    if (detectedType === 'none') {
      detectedType = 'bottom-sheet';
    }
  }

  if (nameLower.includes('modal') || nameLower.includes('dialog') || nameLower.includes('popup')) {
    confidencePoints += 20;
    if (detectedType === 'none') {
      detectedType = 'modal';
    }
  }

  if (nameLower.includes('action')) {
    confidencePoints += 15;
    if (detectedType === 'bottom-sheet') {
      detectedType = 'action-sheet';
    }
  }

  // Финальная уверенность
  detection.confidence = Math.min(confidencePoints / 100, 1.0);
  detection.type = detection.confidence > 0.3 ? detectedType : 'none';

  // Вычисляем snap points для bottom sheet
  if (detection.type === 'bottom-sheet' || detection.type === 'action-sheet') {
    detection.snapPoints = calculateSnapPoints(detection.contentNode);
  }

  return detection;
}

/**
 * Извлечение действий из action sheet
 */
export function extractActionSheetActions(node: any): ActionSheetAction[] {
  const actions: ActionSheetAction[] = [];

  if (!node.children) {
    return actions;
  }

  function searchForActions(n: any, depth: number = 0): void {
    if (depth > 3) {
      return;
    }

    // Ищем элементы списка (кнопки, items)
    if (n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'INSTANCE') {
      const nameLower = (n.name || '').toLowerCase();

      // Признаки action item
      const isActionItem =
        nameLower.includes('action') ||
        nameLower.includes('button') ||
        nameLower.includes('item') ||
        nameLower.includes('option');

      if (isActionItem) {
        // Извлекаем текст
        let label = '';
        let icon = '';
        let destructive = false;

        function extractText(node: any): void {
          if (node.type === 'TEXT' && node.characters) {
            label = node.characters;

            // Проверка на destructive action
            const textLower = label.toLowerCase();
            if (
              textLower.includes('delete') ||
              textLower.includes('remove') ||
              textLower.includes('cancel') ||
              textLower.includes('удалить') ||
              textLower.includes('отменить')
            ) {
              destructive = true;
            }

            // Проверка цвета текста (красный = destructive)
            if (node.fills && Array.isArray(node.fills)) {
              for (const fill of node.fills) {
                if (fill.type === 'SOLID' && fill.color) {
                  const { r, g, b } = fill.color;
                  // Красный цвет
                  if (r > 0.7 && g < 0.3 && b < 0.3) {
                    destructive = true;
                  }
                }
              }
            }
          }

          // Поиск иконок
          if ((node.name || '').toLowerCase().includes('icon')) {
            icon = node.name;
          }

          if (node.children) {
            node.children.forEach(extractText);
          }
        }

        extractText(n);

        if (label) {
          actions.push({ label, destructive, icon: icon || undefined });
        }
      }
    }

    // Рекурсивный поиск
    if (n.children) {
      n.children.forEach((child: any) => searchForActions(child, depth + 1));
    }
  }

  searchForActions(node);

  return actions;
}

/**
 * Генерация кода для @gorhom/bottom-sheet
 */
export function generateBottomSheetCode(
  detection: SheetDetection,
  contentCode: string,
  name: string
): string {
  const snapPoints = detection.snapPoints.length > 0
    ? detection.snapPoints.map((p) => `'${p}'`).join(', ')
    : "'25%', '50%', '90%'";

  const hasHandle = detection.hasDragHandle ? 'true' : 'false';

  return `import React, { useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import BottomSheet, { BottomSheetBackdrop } from '@gorhom/bottom-sheet';

interface ${name}Props {
  isVisible: boolean;
  onClose: () => void;
}

export const ${name}: React.FC<${name}Props> = ({ isVisible, onClose }) => {
  const bottomSheetRef = useRef<BottomSheet>(null);

  // Snap points для разных состояний sheet
  const snapPoints = useMemo(() => [${snapPoints}], []);

  // Render backdrop component
  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
        onPress={onClose}
      />
    ),
    [onClose]
  );

  React.useEffect(() => {
    if (isVisible) {
      bottomSheetRef.current?.snapToIndex(0);
    } else {
      bottomSheetRef.current?.close();
    }
  }, [isVisible]);

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.handleIndicator}
      backgroundStyle={styles.background}
      onClose={onClose}
    >
      <View style={styles.contentContainer}>
        ${contentCode.split('\n').join('\n        ')}
      </View>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  contentContainer: {
    flex: 1,
    padding: 16,
  },
  handleIndicator: {
    backgroundColor: '#D1D5DB',
    width: 40,
  },
  background: {
    backgroundColor: 'white',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
});
`;
}

/**
 * Генерация кода для react-native-modal
 */
export function generateModalCode(
  detection: SheetDetection,
  contentCode: string,
  name: string
): string {
  const hasClose = detection.hasCloseButton;

  return `import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import Modal from 'react-native-modal';

interface ${name}Props {
  isVisible: boolean;
  onClose: () => void;
}

export const ${name}: React.FC<${name}Props> = ({ isVisible, onClose }) => {
  return (
    <Modal
      isVisible={isVisible}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      backdropOpacity={0.5}
      animationIn="fadeIn"
      animationOut="fadeOut"
      useNativeDriver
    >
      <View style={styles.modalContainer}>
        ${hasClose ? `<TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>` : ''}

        <View style={styles.contentContainer}>
          ${contentCode.split('\n').join('\n          ')}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    maxHeight: '80%',
  },${hasClose ? `
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  closeText: {
    fontSize: 20,
    color: '#6B7280',
  },` : ''}
  contentContainer: {
    flex: 1,
  },
});
`;
}

/**
 * Генерация кода для action sheet
 */
export function generateActionSheetCode(
  actions: ActionSheetAction[],
  name: string
): string {
  const actionItems = actions
    .map((action, index) => {
      const style = action.destructive ? 'destructive' : 'default';
      return `    {
      label: '${action.label}',
      onPress: () => handleAction('${action.label}'),
      ${action.icon ? `icon: '${action.icon}',` : ''}
      style: '${style}',
    }`;
    })
    .join(',\n');

  return `import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import BottomSheet from '@gorhom/bottom-sheet';

interface ${name}Props {
  isVisible: boolean;
  onClose: () => void;
  onAction: (action: string) => void;
}

const actions = [
${actionItems}
];

export const ${name}: React.FC<${name}Props> = ({ isVisible, onClose, onAction }) => {
  const handleAction = (actionLabel: string) => {
    onAction(actionLabel);
    onClose();
  };

  return (
    <BottomSheet
      index={isVisible ? 0 : -1}
      snapPoints={['${actions.length * 60 + 100}px']}
      enablePanDownToClose
      onClose={onClose}
    >
      <View style={styles.container}>
        {actions.map((action, index) => (
          <TouchableOpacity
            key={index}
            style={styles.actionItem}
            onPress={action.onPress}
          >
            <Text
              style={[
                styles.actionText,
                action.style === 'destructive' && styles.destructiveText,
              ]}
            >
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
          <Text style={styles.cancelText}>Отмена</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  actionItem: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  actionText: {
    fontSize: 16,
    color: '#111827',
  },
  destructiveText: {
    color: '#EF4444',
  },
  cancelButton: {
    marginTop: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
});
`;
}
