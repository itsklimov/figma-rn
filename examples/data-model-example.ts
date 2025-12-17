/**
 * Data model generator usage example
 */

import {
  inferDataModels,
  generateTypeDefinitions,
  generateReactQueryHooks,
  inferAPIEndpoint,
  type DataModel,
} from '../src/data-model-generator.js';

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

// Example node for order detail screen
const orderDetailNode = {
  type: 'FRAME',
  name: 'OrderDetailsScreen',
  children: [
    { type: 'TEXT', name: 'OrderNumber', characters: 'ORD-12345' },
    { type: 'TEXT', name: 'Status', characters: 'Delivered' },
    { type: 'TEXT', name: 'Total', characters: '$35.00' },
    { type: 'TEXT', name: 'CreatedAt', characters: 'Nov 15 2023' },
  ],
};

// Example node for visit creation form
const visitFormNode = {
  type: 'FRAME',
  name: 'CreateVisitForm',
  children: [
    { type: 'TEXT', name: 'Date', characters: 'Dec 20 2023' },
    { type: 'TEXT', name: 'Time', characters: '14:30' },
    { type: 'TEXT', name: 'ServiceId', characters: 'service-123' },
    { type: 'TEXT', name: 'Price', characters: '$25.00' },
  ],
};

// Example node for profile screen
const profileNode = {
  type: 'FRAME',
  name: 'ProfileScreen',
  children: [
    { type: 'TEXT', name: 'Name', characters: 'John Smith' },
    { type: 'TEXT', name: 'Email', characters: 'john@example.com' },
    { type: 'TEXT', name: 'Phone', characters: '+1 900 123-4567' },
  ],
};

console.log('='.repeat(80));
console.log('EXAMPLE 1: Product list screen');
console.log('='.repeat(80));
console.log();

const productModels = inferDataModels(productListNode, 'ProductsListScreen');
console.log('Inferred data models:');
console.log(JSON.stringify(productModels, null, 2));
console.log();

const productTypes = generateTypeDefinitions(productModels);
console.log('Generated TypeScript interfaces:');
console.log(productTypes);

const productHooks = generateReactQueryHooks(productModels, 'ProductsListScreen');
console.log('Generated React Query hooks:');
console.log(productHooks);

console.log('='.repeat(80));
console.log('EXAMPLE 2: Order detail screen');
console.log('='.repeat(80));
console.log();

const orderModels = inferDataModels(orderDetailNode, 'OrderDetailsScreen');
console.log('Inferred data models:');
console.log(JSON.stringify(orderModels, null, 2));
console.log();

const orderTypes = generateTypeDefinitions(orderModels);
console.log('Generated TypeScript interfaces:');
console.log(orderTypes);

const orderHooks = generateReactQueryHooks(orderModels, 'OrderDetailsScreen');
console.log('Generated React Query hooks:');
console.log(orderHooks);

console.log('='.repeat(80));
console.log('EXAMPLE 3: Visit creation form');
console.log('='.repeat(80));
console.log();

const visitModels = inferDataModels(visitFormNode, 'CreateVisitForm');
console.log('Inferred data models:');
console.log(JSON.stringify(visitModels, null, 2));
console.log();

const visitTypes = generateTypeDefinitions(visitModels);
console.log('Generated TypeScript interfaces:');
console.log(visitTypes);

const visitHooks = generateReactQueryHooks(visitModels, 'CreateVisitForm');
console.log('Generated React Query hooks:');
console.log(visitHooks);

console.log('='.repeat(80));
console.log('EXAMPLE 4: User profile');
console.log('='.repeat(80));
console.log();

const profileModels = inferDataModels(profileNode, 'ProfileScreen');
console.log('Inferred data models:');
console.log(JSON.stringify(profileModels, null, 2));
console.log();

const profileTypes = generateTypeDefinitions(profileModels);
console.log('Generated TypeScript interfaces:');
console.log(profileTypes);

const profileHooks = generateReactQueryHooks(profileModels, 'ProfileScreen');
console.log('Generated React Query hooks:');
console.log(profileHooks);

console.log('='.repeat(80));
console.log('EXAMPLE 5: API endpoint inference');
console.log('='.repeat(80));
console.log();

console.log('Product List:', inferAPIEndpoint('ProductsListScreen', 'Product'));
console.log('Product Detail:', inferAPIEndpoint('ProductDetailsScreen', 'Product'));
console.log('Order List:', inferAPIEndpoint('OrdersListScreen', 'Order'));
console.log('Visit Form:', inferAPIEndpoint('CreateVisitForm', 'Visit'));
console.log('Profile:', inferAPIEndpoint('ProfileScreen', 'User'));
