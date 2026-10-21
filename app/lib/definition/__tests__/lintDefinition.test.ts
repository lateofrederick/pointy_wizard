import { describe, expect, it } from 'vitest';
import { lintDefinitionSource, lintDefinitions } from '../lintDefinition';
import { sampleDocument } from '../../sampleDocument';
import type { Chain, EventRef, PointyDocument } from '../../../types/pointy';

const codes = (source: string, eventName?: string) =>
  lintDefinitionSource(source, { eventName }).map((d) => d.code);

const VALID_CLASS = `from volnux import EventBase


class ValidateProfile(EventBase):
    """Validate one profile record."""

    executor = "thread"

    async def process(self, *args, **kwargs):
        profile = kwargs["profile"]
        if not profile.get("email"):
            return False, "missing email"
        return True, profile
`;

const VALID_FUNCTION = `from volnux import event


@event()
def fetch_data(self):
    return True, [1, 2, 3]
`;

describe('lintDefinitionSource — valid definitions', () => {
  it('accepts a well-formed class-based event', () => {
    expect(lintDefinitionSource(VALID_CLASS)).toEqual([]);
  });

  it('accepts a well-formed function-based event (sync is fine)', () => {
    expect(lintDefinitionSource(VALID_FUNCTION)).toEqual([]);
  });

  it('accepts a class with an async process and a goto branch', () => {
    const source = `from volnux import EventBase


class RouteDecision(EventBase):
    async def process(self, *args, **kwargs):
        if kwargs["score"] < 0.5:
            return self.goto(1, False, kwargs["score"])
        return True, kwargs["score"]
`;
    expect(lintDefinitionSource(source)).toEqual([]);
  });

  it('accepts name= overrides that resolve the identity', () => {
    const cls = `from volnux import EventBase


class Renamed(EventBase):
    name = "ValidateProfile"

    async def process(self, *args, **kwargs):
        return True, kwargs
`;
    expect(lintDefinitionSource(cls, { eventName: 'ValidateProfile' })).toEqual([]);

    const fn = `from volnux import event


@event(name="ValidateProfile")
def fetch(self):
    return True, 1
`;
    expect(lintDefinitionSource(fn, { eventName: 'ValidateProfile' })).toEqual([]);
  });
});

describe('lintDefinitionSource — imports', () => {
  it('flags the legacy pointy package', () => {
    const source = `from pointy import EventBase


class ValidateProfile(EventBase):
    async def process(self, *args, **kwargs):
        return True, kwargs
`;
    expect(codes(source)).toContain('py-legacy-pointy-import');
  });

  it('flags an event with no volnux import at all', () => {
    const source = `class ValidateProfile(EventBase):
    async def process(self, *args, **kwargs):
        return True, kwargs
`;
    expect(codes(source)).toContain('py-missing-volnux-import');
  });
});

describe('lintDefinitionSource — structure', () => {
  it('flags a file with no event in it', () => {
    expect(codes('x = 1\n')).toContain('py-no-event');
  });

  it('flags an EventBase subclass with no process()', () => {
    const source = `from volnux import EventBase


class ValidateProfile(EventBase):
    """No process here."""
`;
    expect(codes(source)).toContain('py-missing-process');
  });

  it('flags a process() without self', () => {
    const source = `from volnux import EventBase


class ValidateProfile(EventBase):
    async def process(payload):
        return True, payload
`;
    expect(codes(source)).toContain('py-process-needs-self');
  });

  it('flags an @event function without self', () => {
    const source = `from volnux import event


@event()
def fetch(data):
    return True, data
`;
    expect(codes(source)).toContain('py-process-needs-self');
  });

  it('warns when a class-based process is not async', () => {
    const source = `from volnux import EventBase


class ValidateProfile(EventBase):
    def process(self, *args, **kwargs):
        return True, kwargs
`;
    const found = lintDefinitionSource(source);
    expect(found.find((d) => d.code === 'py-process-not-async')?.severity).toBe('warning');
  });

  it('flags an __init__ override', () => {
    const source = `from volnux import EventBase


class ValidateProfile(EventBase):
    def __init__(self, threshold):
        self.threshold = threshold

    async def process(self, *args, **kwargs):
        return True, kwargs
`;
    expect(codes(source)).toContain('py-forbidden-init');
  });

  it('warns when more than one event is declared', () => {
    const source = `from volnux import EventBase


class ValidateProfile(EventBase):
    async def process(self, *args, **kwargs):
        return True, kwargs


class RouteDecision(EventBase):
    async def process(self, *args, **kwargs):
        return True, kwargs
`;
    const found = lintDefinitionSource(source);
    expect(found.find((d) => d.code === 'py-multiple-events')?.severity).toBe('warning');
  });
});

describe('lintDefinitionSource — goto', () => {
  it('flags a descriptor outside 0-9', () => {
    const source = `from volnux import EventBase


class RouteDecision(EventBase):
    async def process(self, *args, **kwargs):
        return self.goto(10, False, kwargs)
`;
    expect(codes(source)).toContain('py-goto-descriptor-range');
  });

  it('flags goto without (descriptor, ok, result)', () => {
    const source = `from volnux import EventBase


class RouteDecision(EventBase):
    async def process(self, *args, **kwargs):
        return self.goto(1)
`;
    expect(codes(source)).toContain('py-goto-arity');
  });

  it('accepts descriptors 0 and 9', () => {
    const source = `from volnux import EventBase


class RouteDecision(EventBase):
    async def process(self, *args, **kwargs):
        if kwargs["x"]:
            return self.goto(0, True, kwargs)
        return self.goto(9, False, kwargs)
`;
    expect(codes(source)).toEqual([]);
  });
});

describe('lintDefinitionSource — configuration', () => {
  it('flags an unknown class attribute, with a suggestion when close', () => {
    const source = `from volnux import EventBase


class ValidateProfile(EventBase):
    excutor = "thread"

    async def process(self, *args, **kwargs):
        return True, kwargs
`;
    const found = lintDefinitionSource(source);
    const d = found.find((x) => x.code === 'py-unknown-attribute');
    expect(d?.message).toContain('did you mean `executor`');
  });

  it('flags an unknown retry_policy key', () => {
    const source = `from volnux import EventBase


class ValidateProfile(EventBase):
    retry_policy = {"max_attmpts": 3}

    async def process(self, *args, **kwargs):
        return True, kwargs
`;
    expect(codes(source)).toContain('py-retry-policy-key');
  });

  it('accepts the real RetryPolicy keys', () => {
    const source = `from volnux import EventBase


class ValidateProfile(EventBase):
    retry_policy = {
        "max_attempts": 3,
        "backoff_factor": 2.0,
        "max_backoff": 60.0,
        "retry_on_exceptions": [TimeoutError],
    }

    async def process(self, *args, **kwargs):
        return True, kwargs
`;
    expect(lintDefinitionSource(source)).toEqual([]);
  });

  it('warns on a return annotation that is not Tuple[bool, Any]', () => {
    const source = `from volnux import EventBase


class ValidateProfile(EventBase):
    async def process(self, *args, **kwargs) -> dict:
        return True, kwargs
`;
    const found = lintDefinitionSource(source);
    expect(found.find((d) => d.code === 'py-return-annotation')?.severity).toBe('warning');
  });
});

describe('lintDefinitionSource — identity', () => {
  it('flags a class whose name does not match the pipeline event', () => {
    const source = `from volnux import EventBase


class ValidateRows(EventBase):
    async def process(self, *args, **kwargs):
        return True, kwargs
`;
    expect(codes(source, 'ValidateProfile')).toContain('py-name-mismatch');
  });

  it('flags an @event function whose name does not match', () => {
    const source = `from volnux import event


@event()
def fetch_rows(self):
    return True, 1
`;
    expect(codes(source, 'FetchData')).toContain('py-name-mismatch');
  });

  it('does not run the identity check without an eventName', () => {
    const source = `from volnux import EventBase


class Anything(EventBase):
    async def process(self, *args, **kwargs):
        return True, kwargs
`;
    expect(codes(source)).not.toContain('py-name-mismatch');
  });
});

describe('lintDefinitions — document bridge', () => {
  const ev = (
    id: string,
    name: string,
    extra: Partial<Omit<EventRef, 'id' | 'name'>> = {},
  ): EventRef => ({
    id,
    name,
    namespace: 'local',
    attributes: [],
    definitionId: `${id}.py`,
    ...extra,
  });
  const e = (ref: EventRef): Chain => ({ kind: 'event', ref });
  const doc = (refs: EventRef[], definitions: PointyDocument['definitions']): PointyDocument => ({
    name: 't',
    directives: {},
    variables: [],
    sources: [],
    staged: [],
    definitions,
    layout: {},
    chain: refs.length === 1 ? e(refs[0]) : { kind: 'seq', left: e(refs[0]), right: e(refs[1]) },
  });

  it('attaches Python problems to the event that links the file', () => {
    const bad = `from volnux import EventBase


class ValidateProfile(EventBase):
    def process(self):
        return True, None
`;
    const d = doc([ev('n1', 'ValidateProfile')], {
      'n1.py': { filename: 'n1.py', source: bad },
    });
    const found = lintDefinitions(d);
    expect(found.map((x) => x.code)).toContain('py-process-not-async');
    expect(found.every((x) => x.target.kind === 'event' && x.target.eventId === 'n1')).toBe(true);
  });

  it('skips events whose definition file is missing — structural lint owns that', () => {
    const d = doc([ev('n1', 'ValidateProfile', { definitionId: 'ghost.py' })], {});
    expect(lintDefinitions(d)).toEqual([]);
  });

  it('passes on the shipped sample document', () => {
    const found = lintDefinitions(sampleDocument).filter((x) => x.severity === 'error');
    expect(found).toEqual([]);
  });

  it('passes on the attachDefinition stub shape', () => {
    const stub = `from volnux import EventBase


class Blank(EventBase):
    """Return (ok, result). The second value is the RESULT, not a descriptor.

    For anything beyond success and failure, call
    self.goto(descriptor, ok, result) with an integer 0-9.
    """

    async def process(self, *args, **kwargs):
        return True, kwargs
`;
    expect(lintDefinitionSource(stub, { eventName: 'Blank' })).toEqual([]);
  });
});
