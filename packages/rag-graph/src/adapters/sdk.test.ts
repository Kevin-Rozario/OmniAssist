import { describe, expect, it } from 'vitest';
import {
  createSdkJevClassifier,
  createSdkOpenAiGenerator,
  createSdkTavilyWebSearch,
} from './sdk';

// Construction must not touch the network; behaviour is covered by each adapter's own tests.
describe('sdk adapter factories', () => {
  it('builds a classifier with route and grade', () => {
    const classifier = createSdkJevClassifier({ apiKey: 'test-key', model: 'jev-test' });

    expect(classifier.route).toBeTypeOf('function');
    expect(classifier.gradePassage).toBeTypeOf('function');
  });

  it('builds a generator that streams', () => {
    const generator = createSdkOpenAiGenerator({ apiKey: 'test-key', model: 'model-test' });

    expect(generator.stream).toBeTypeOf('function');
  });

  it('builds a web search', () => {
    const webSearch = createSdkTavilyWebSearch({ apiKey: 'tvly-test-key' });

    expect(webSearch.search).toBeTypeOf('function');
  });
});
