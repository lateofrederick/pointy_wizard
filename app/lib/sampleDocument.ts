import type { Chain, EventRef, PointyDocument } from '../types/pointy';

/**
 * The pipeline drawn on Figma screen 03 (`3:2`), including its canvas
 * positions, so the app opens on something directly comparable to the design.
 *
 * Temporary: it stands in until pipelines are loaded from storage in phase 5.
 */

const ev = (
  id: string,
  name: string,
  extra: Partial<Omit<EventRef, 'id' | 'name'>> = {},
): EventRef => ({ id, name, namespace: 'local', attributes: [], ...extra });

const e = (ref: EventRef): Chain => ({ kind: 'event', ref });
const str = (value: string) => ({ kind: 'literal' as const, value });
const num = (value: number) => ({ kind: 'literal' as const, value });

const restApi = ev('n1', 'RestApiExtract', {
  namespace: 'hub',
  version: '2.1.0',
  attributes: [{ name: 'timeout', value: num(30) }],
});

const validateProfile = ev('n2', 'ValidateProfile', {
  definitionId: 'validate_profile.py',
  meta: {
    mode: 'MAP',
    template: 'ValidateProfile',
    metaAttributes: [{ name: 'batch_size', value: num(100) }],
  },
});

const classifyIntent = ev('n3', 'ClassifyIntent', {
  namespace: 'hub',
  version: '1.2.0',
  attributes: [
    { name: 'node', value: str('gpu-cluster') },
    { name: 'timeout', value: num(45) },
  ],
});

const routeDecision = ev('n4', 'RouteDecision', {
  version: '1.2.0',
  definitionId: 'route_decision.py',
});

const gpt4 = ev('n5', 'GPT4Transform', {
  namespace: 'hub',
  version: '4.0.1',
  attributes: [{ name: 'executor', value: str('celery') }],
  retry: 3,
});

const slackA = ev('n6', 'SlackNotify', {
  namespace: 'hub',
  version: '1.4.0',
  attributes: [{ name: 'channel', value: str('#ops') }],
});

const slackB = ev('n7', 'SlackNotify', {
  namespace: 'hub',
  version: '1.4.0',
  attributes: [{ name: 'channel', value: str('#ops') }],
});

export const sampleDocument: PointyDocument = {
  name: 'my-etl-pipeline',
  directives: { version: '1.2.0' },
  variables: [],
  sources: [
    { namespace: 'hub', package: 'corp/approved-events', version: '3.0.0' },
    { namespace: 'pypi', package: 'volnux-standard-events', version: '1.5.0' },
    { namespace: 'github', package: 'my-team/volnux-events', version: '2.1.0' },
  ],
  staged: [],
  definitions: {
    'validate_profile.py': {
      filename: 'validate_profile.py',
      source: [
        'from pointy import EventBase',
        'from pointy.exec import ThreadPoolExecutor',
        '',
        '',
        'class ValidateProfile(EventBase):',
        '    """Validate one profile record."""',
        '',
        '    executor = ThreadPoolExecutor',
        '',
        '    async def process(self, *args, **kwargs):',
        '        profile = kwargs["profile"]',
        '        if not profile.get("email"):',
        '            return False, "missing email"',
        '        return True, profile',
      ].join('\n'),
    },
    'route_decision.py': {
      filename: 'route_decision.py',
      source: [
        'from pointy import EventBase',
        '',
        '',
        'class RouteDecision(EventBase):',
        '    """Pick a branch. 0 is success, 1 is failure."""',
        '',
        '    async def process(self, *args, **kwargs):',
        '        score = kwargs["intent"].score',
        '        if score < 0.5:',
        '            return self.goto(1, False, kwargs["intent"])',
        '        return True, kwargs["intent"]',
      ].join('\n'),
    },
  },
  // Matches the Figma canvas so the two can be held side by side.
  layout: {
    n1: { x: 34, y: 80 },
    n2: { x: 288, y: 74 },
    n3: { x: 560, y: 80 },
    n4: { x: 176, y: 300 },
    n5: { x: 488, y: 322 },
    n6: { x: 488, y: 440 },
    n7: { x: 760, y: 440 },
  },
  chain: {
    kind: 'seq',
    left: {
      kind: 'pipe',
      left: { kind: 'seq', left: e(restApi), right: e(validateProfile) },
      right: e(classifyIntent),
    },
    right: {
      kind: 'branch',
      on: routeDecision,
      paths: [
        {
          descriptor: 0,
          label: 'success',
          body: {
            kind: 'seq',
            left: {
              kind: 'group',
              members: [e(gpt4)],
              attributes: [{ name: 'timeout', value: num(60) }],
            },
            right: e(slackA),
          },
        },
        { descriptor: 1, label: 'failure', body: e(slackB) },
      ],
    },
  },
};
