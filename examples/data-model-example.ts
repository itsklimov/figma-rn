/**
 * Пример использования генератора моделей данных
 * Example usage of data model generator
 */

import {
  inferDataModels,
  generateTypeDefinitions,
  generateReactQueryHooks,
  inferAPIEndpoint,
  type DataModel,
} from '../src/data-model-generator.js';

// Пример Figma узла для экрана списка продуктов
// Example Figma node for product list screen
const productListNode = {
  type: 'FRAME',
  name: 'ProductsListScreen',
  children: [
    {
      type: 'FRAME',
      name: 'ProductCard',
      children: [
        { type: 'TEXT', name: 'ProductName', characters: 'Awesome Product' },
        { type: 'TEXT', name: 'Price', characters: '1990 ₽' },
        { type: 'TEXT', name: 'Rating', characters: '4.8' },
        { type: 'TEXT', name: 'Category', characters: 'Electronics' },
      ],
    },
  ],
};

// Пример узла экрана деталей заказа
// Example node for order detail screen
const orderDetailNode = {
  type: 'FRAME',
  name: 'OrderDetailsScreen',
  children: [
    { type: 'TEXT', name: 'OrderNumber', characters: 'ORD-12345' },
    { type: 'TEXT', name: 'Status', characters: 'Доставлен' },
    { type: 'TEXT', name: 'Total', characters: '3500 ₽' },
    { type: 'TEXT', name: 'CreatedAt', characters: '15 ноя 2023' },
  ],
};

// Пример узла формы создания визита
// Example node for visit creation form
const visitFormNode = {
  type: 'FRAME',
  name: 'CreateVisitForm',
  children: [
    { type: 'TEXT', name: 'Date', characters: '20 дек 2023' },
    { type: 'TEXT', name: 'Time', characters: '14:30' },
    { type: 'TEXT', name: 'ServiceId', characters: 'service-123' },
    { type: 'TEXT', name: 'Price', characters: '2500 ₽' },
  ],
};

// Пример узла профиля
// Example node for profile screen
const profileNode = {
  type: 'FRAME',
  name: 'ProfileScreen',
  children: [
    { type: 'TEXT', name: 'Name', characters: 'Иван Иванов' },
    { type: 'TEXT', name: 'Email', characters: 'ivan@example.com' },
    { type: 'TEXT', name: 'Phone', characters: '+7 900 123-45-67' },
  ],
};

console.log('='.repeat(80));
console.log('ПРИМЕР 1: Экран списка продуктов');
console.log('EXAMPLE 1: Product list screen');
console.log('='.repeat(80));
console.log();

const productModels = inferDataModels(productListNode, 'ProductsListScreen');
console.log('Выведенные модели данных / Inferred data models:');
console.log(JSON.stringify(productModels, null, 2));
console.log();

const productTypes = generateTypeDefinitions(productModels);
console.log('Сгенерированные TypeScript интерфейсы / Generated TypeScript interfaces:');
console.log(productTypes);

const productHooks = generateReactQueryHooks(productModels, 'ProductsListScreen');
console.log('Сгенерированные React Query хуки / Generated React Query hooks:');
console.log(productHooks);

console.log('='.repeat(80));
console.log('ПРИМЕР 2: Экран деталей заказа');
console.log('EXAMPLE 2: Order detail screen');
console.log('='.repeat(80));
console.log();

const orderModels = inferDataModels(orderDetailNode, 'OrderDetailsScreen');
console.log('Выведенные модели данных / Inferred data models:');
console.log(JSON.stringify(orderModels, null, 2));
console.log();

const orderTypes = generateTypeDefinitions(orderModels);
console.log('Сгенерированные TypeScript интерфейсы / Generated TypeScript interfaces:');
console.log(orderTypes);

const orderHooks = generateReactQueryHooks(orderModels, 'OrderDetailsScreen');
console.log('Сгенерированные React Query хуки / Generated React Query hooks:');
console.log(orderHooks);

console.log('='.repeat(80));
console.log('ПРИМЕР 3: Форма создания визита');
console.log('EXAMPLE 3: Visit creation form');
console.log('='.repeat(80));
console.log();

const visitModels = inferDataModels(visitFormNode, 'CreateVisitForm');
console.log('Выведенные модели данных / Inferred data models:');
console.log(JSON.stringify(visitModels, null, 2));
console.log();

const visitTypes = generateTypeDefinitions(visitModels);
console.log('Сгенерированные TypeScript интерфейсы / Generated TypeScript interfaces:');
console.log(visitTypes);

const visitHooks = generateReactQueryHooks(visitModels, 'CreateVisitForm');
console.log('Сгенерированные React Query хуки / Generated React Query hooks:');
console.log(visitHooks);

console.log('='.repeat(80));
console.log('ПРИМЕР 4: Профиль пользователя');
console.log('EXAMPLE 4: User profile');
console.log('='.repeat(80));
console.log();

const profileModels = inferDataModels(profileNode, 'ProfileScreen');
console.log('Выведенные модели данных / Inferred data models:');
console.log(JSON.stringify(profileModels, null, 2));
console.log();

const profileTypes = generateTypeDefinitions(profileModels);
console.log('Сгенерированные TypeScript интерфейсы / Generated TypeScript interfaces:');
console.log(profileTypes);

const profileHooks = generateReactQueryHooks(profileModels, 'ProfileScreen');
console.log('Сгенерированные React Query хуки / Generated React Query hooks:');
console.log(profileHooks);

console.log('='.repeat(80));
console.log('ПРИМЕР 5: Вывод API endpoint');
console.log('EXAMPLE 5: API endpoint inference');
console.log('='.repeat(80));
console.log();

console.log('Product List:', inferAPIEndpoint('ProductsListScreen', 'Product'));
console.log('Product Detail:', inferAPIEndpoint('ProductDetailsScreen', 'Product'));
console.log('Order List:', inferAPIEndpoint('OrdersListScreen', 'Order'));
console.log('Visit Form:', inferAPIEndpoint('CreateVisitForm', 'Visit'));
console.log('Profile:', inferAPIEndpoint('ProfileScreen', 'User'));
