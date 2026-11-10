import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { describe, expect, it } from 'vitest';

describe('@langchain/langgraph', () => {
  it('runs a minimal graph and streams custom events', async () => {
    const State = Annotation.Root({
      value: Annotation<string>(),
    });

    const graph = new StateGraph(State)
      .addNode('echo', (state, config) => {
        config.writer?.({ type: 'status', stage: 'writing' });
        return { value: `${state.value}!` };
      })
      .addEdge(START, 'echo')
      .addEdge('echo', END)
      .compile();

    const events: unknown[] = [];
    for await (const event of await graph.stream({ value: 'hi' }, { streamMode: 'custom' }))
      events.push(event);

    expect(events).toEqual([
      { type: 'status', stage: 'writing' },
    ]);
    expect((await graph.invoke({ value: 'hi' })).value).toBe('hi!');
  });
});
