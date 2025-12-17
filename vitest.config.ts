import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Тесты используют реальный Figma API, поэтому нужен большой таймаут
    testTimeout: 60000,
    hookTimeout: 30000,

    // Паттерны поиска тестов
    include: ['tests/**/*.test.ts'],

    // Глобальные переменные для тестов
    globals: true,

    // Изоляция тестов
    isolate: true,

    // Последовательное выполнение (API rate limiting)
    sequence: {
      concurrent: false,
    },

    // Coverage настройки
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts', // Entry point
        'dist/**',
        'tests/**',
      ],
    },

    // Переменные окружения
    env: {
      NODE_ENV: 'test',
    },
  },
});
