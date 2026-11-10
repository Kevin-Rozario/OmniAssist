import antfu from '@antfu/eslint-config';

const nextSpecialFiles = [
  'page',
  'layout',
  'loading',
  'error',
  'not-found',
  'route',
  'proxy',
  'template',
  'default',
  'global-error',
  'opengraph-image',
  'icon',
];

export default antfu(
  {
    react: true,
    nextjs: true,
    stylistic: { semi: true },
    ignores: ['openspec/**', '**/migrations/**', '**/next-env.d.ts'],
  },
  {
    rules: {
      'unicorn/filename-case': [
        'error',
        {
          case: 'kebabCase',
          ignore: ['^README\\.md$', '^AGENTS\\.md$'],
        },
      ],
      'import/no-default-export': 'error',
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  {
    files: [
      `**/app/**/{${nextSpecialFiles.join(',')}}.{ts,tsx}`,
      '**/src/proxy.ts',
      '**/*.config.*',
    ],
    rules: {
      'import/no-default-export': 'off',
      'react-refresh/only-export-components': [
        'error',
        {
          allowExportNames: [
            'metadata',
            'viewport',
            'generateMetadata',
            'generateViewport',
          ],
        },
      ],
    },
  },
  {
    files: ['packages/ui/src/components/**'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
);
