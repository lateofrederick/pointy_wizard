'use client';

import { useState } from 'react';
import {
  Button,
  Callout,
  Chip,
  Field,
  SectionHeader,
  ThemeToggle,
  Toggle,
  type ChipTone,
} from '../components/ui';

/**
 * Specimen page — the code-side mirror of Figma page "Design System" (60:5535).
 *
 * Phase 1 of docs/ui-migration.md is done when every primitive here matches its
 * Figma counterpart in both themes. Keep the written contracts alongside the
 * specimens, exactly as the Figma page does: the rule for using a component is
 * part of the component.
 */
export default function DesignSystemPage() {
  return (
    <main className="min-h-screen bg-bg-base px-8 py-10">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-5">
        <Header />
        <ChipSection />
        <ButtonSection />
        <ToggleSection />
        <FieldSection />
        <SectionHeaderSection />
        <CalloutSection />
        <SurfaceSection />
      </div>
    </main>
  );
}

function Section({
  title,
  contract,
  children,
}: {
  title: string;
  contract: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[10px] border border-edge-subtle bg-bg-surface px-[30px] pt-6 pb-7">
      <h2 className="font-sans text-[17px] font-medium text-primary">{title}</h2>
      <div className="mt-2 max-w-[900px] font-sans text-[11.5px] leading-[18px] text-tertiary">
        {contract}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Header() {
  return (
    <header className="rounded-[10px] border border-edge-subtle bg-bg-surface px-[30px] pt-7 pb-7">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="font-sans text-[30px] font-medium text-primary">
            Pointy Wizard — design system
          </h1>
          <p className="mt-3 max-w-[820px] font-sans text-[14px] leading-[22px] text-secondary">
            The primitives the 20 prototype screens are built from. Build from this page,
            not from the screens — the screens show composition and state, this page is the
            contract. Every colour here is a semantic token, so the whole UI swaps theme by
            toggling one class.
          </p>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}

const CHIP_TONES: { tone: ChipTone; label: string }[] = [
  { tone: 'neutral', label: 'DRAFT' },
  { tone: 'green', label: '✓ VALID' },
  { tone: 'amber', label: '⚠ 1 WARNING' },
  { tone: 'red', label: '✕ 2 ERRORS' },
  { tone: 'violet', label: '◇ PUBLISHED' },
  { tone: 'cyan', label: '▶ RUNNING' },
];

function ChipSection() {
  return (
    <Section
      title="Chip"
      contract={
        <>
          <p>tone = neutral · green · amber · red · violet · cyan</p>
          <p>
            Pipeline validity, run outcome, registry source, node badges, list status. The
            tone carries the meaning — never hard-code a colour at the call site.
          </p>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3.5">
        {CHIP_TONES.map((c) => (
          <Chip key={c.tone} tone={c.tone}>
            {c.label}
          </Chip>
        ))}
      </div>
    </Section>
  );
}

function ButtonSection() {
  return (
    <Section
      title="Button"
      contract={
        <>
          <p>kind = primary · secondary · ghost, plus the native disabled state</p>
          <p>
            Height is fixed at 34. The shortcut hint is optional. Primary is the only kind
            that may appear twice on a screen, and only if the second is in a modal footer.
          </p>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3.5">
        <Button kind="primary" shortcut="⌘↵">
          Run pipeline
        </Button>
        <Button kind="secondary">Cancel</Button>
        <Button kind="ghost">＋ add</Button>
        <Button kind="primary" disabled>
          Run pipeline
        </Button>
      </div>
    </Section>
  );
}

function ToggleSection() {
  const [publish, setPublish] = useState(true);
  const [deprecate, setDeprecate] = useState(false);

  return (
    <Section
      title="Toggle"
      contract={
        <>
          <p>state = on · off · locked</p>
          <p>
            locked reads as on but cannot be changed — used for the EventHub read scope,
            which every grant must include. Pair it with the word “required” next to the
            label; a disabled control with no explanation is the thing people file bugs
            about.
          </p>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <ScopeRow
          name="read"
          note="required"
          desc="Resolve hub:: events when the pipeline compiles."
        >
          <Toggle checked locked label="read scope (required)" />
        </ScopeRow>
        <ScopeRow name="publish" desc="Push new event versions to corp/approved-events.">
          <Toggle checked={publish} onChange={setPublish} label="publish scope" />
        </ScopeRow>
        <ScopeRow name="deprecate" desc="Set a sunset date on versions you published.">
          <Toggle checked={deprecate} onChange={setDeprecate} label="deprecate scope" />
        </ScopeRow>
      </div>
    </Section>
  );
}

function ScopeRow({
  name,
  note,
  desc,
  children,
}: {
  name: string;
  note?: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex max-w-[520px] items-center gap-3 rounded-[7px] border border-edge bg-bg-sunken px-3.5 py-3">
      <div className="flex-1">
        <p className="font-mono text-[12px] font-medium text-code">
          {name}
          {note && <span className="ml-3 text-[9px] text-tertiary">{note}</span>}
        </p>
        <p className="mt-1 font-sans text-[9.5px] leading-[15px] text-tertiary">{desc}</p>
      </div>
      {children}
    </div>
  );
}

function FieldSection() {
  const [name, setName] = useState('ClassifyIntent');
  const [retry, setRetry] = useState('0');

  return (
    <Section
      title="Field"
      contract={
        <>
          <p>kind = text · select · stepper &nbsp;×&nbsp; state = default · focused · error</p>
          <p>
            312 wide in the inspector. Values are mono because they are Pointy source, not
            prose; labels are sans. The hint line is the only place a constraint or an error
            reason belongs.
          </p>
        </>
      }
    >
      <div className="grid max-w-[1020px] grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-6">
        <Field
          label="Event name"
          value={name}
          onValueChange={setName}
          hint="Must be a valid Python identifier"
        />
        <Field label="Executor" kind="select" value="THREADPOOL_EXECUTOR" hint="Where the event runs" />
        <Field
          label="Retry attempts"
          kind="stepper"
          value={retry}
          onValueChange={setRetry}
          min={0}
          hint="off · min 2 when set"
        />
        <Field label="Event name" value="ClassifyIntent" state="focused" hint="Must be a valid Python identifier" />
        <Field
          label="Event name"
          value="SlackNotify"
          state="error"
          hint="✕ That name is already used in this pipeline"
        />
      </div>
    </Section>
  );
}

function SectionHeaderSection() {
  return (
    <Section
      title="SectionHeader"
      contract={
        <>
          <p>action = none · add</p>
          <p>
            DM Mono Medium 9.4 / +0.7 tracking at 40% ink — the same treatment for every
            group label in the inspector, the modal and the output panel. Uppercase is typed
            into the string, not applied with text-transform, so the string is what ships.
          </p>
        </>
      }
    >
      <div className="flex max-w-[720px] flex-col gap-4">
        <SectionHeader>DIRECTIVES</SectionHeader>
        <SectionHeader action="＋ add">VARIABLES</SectionHeader>
      </div>
    </Section>
  );
}

function CalloutSection() {
  return (
    <Section
      title="Callout"
      contract={
        <>
          <p>tone = error · warning · info · success</p>
          <p>
            Three lines, in this order: what happened, why, and the one action that fixes it.
            The action is a ghost link, never a button — a callout is not a dialog. Every
            error the canvas can show has to name the Pointy rule it broke; “invalid
            pipeline” on its own is not an acceptable string.
          </p>
        </>
      }
    >
      <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-5">
        <Callout tone="error" title="Unresolved namespace" action="Register source →">
          pypi::NormalizeSchema has no registered source, so the compiler cannot find the
          event.
        </Callout>
        <Callout tone="warning" title="Deprecated directive" action="Remove it →">
          @recursive-depth is kept for backward compatibility only and will be removed.
        </Callout>
        <Callout tone="info" title="Two paths need descriptors" action="Review branches →">
          Dropping a second wire turned this into a branch. 0 is success, 1 is failure.
        </Callout>
        <Callout tone="success" title="Published to EventHub" action="View in registry →">
          hub::ClassifyTone@0.1.0 is available to everyone in volnux-dev.
        </Callout>
      </div>
    </Section>
  );
}

const SURFACES = [
  ['bg-bg-sunken', 'sunken', 'inputs, code cards, chips'],
  ['bg-bg-base', 'base', 'app background'],
  ['bg-bg-canvas', 'canvas', 'the graph surface'],
  ['bg-bg-surface', 'surface', 'panels, modals, rows'],
  ['bg-bg-raised', 'raised', 'node cards, anything floating'],
];

function SurfaceSection() {
  return (
    <Section
      title="Surfaces & ink"
      contract={
        <p>
          Five surfaces, sunken to raised. In dark they get lighter as they rise; in light
          they run out of headroom at white, so “raised” separates by shadow and border
          instead. One ink at four weights — never a second hue for text.
        </p>
      }
    >
      <div className="flex flex-wrap gap-4">
        {SURFACES.map(([cls, name, use]) => (
          <div
            key={name}
            className={`${cls} w-[190px] rounded-[9px] border border-edge p-3.5 shadow-raised`}
          >
            <p className="font-mono text-[11px] font-medium text-code">{name}</p>
            <p className="mt-1 font-sans text-[9.5px] leading-[14px] text-tertiary">{use}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-baseline gap-6">
        <span className="font-sans text-[13px] text-primary">primary</span>
        <span className="font-sans text-[13px] text-secondary">secondary</span>
        <span className="font-sans text-[13px] text-tertiary">tertiary</span>
        <span className="font-sans text-[13px] text-disabled">disabled</span>
        <span className="font-mono text-[13px] text-code">text-code</span>
        <span className="font-mono text-[13px] text-comment"># comment</span>
      </div>

      <div className="mt-6 flex flex-wrap items-baseline gap-6 font-mono text-[13px]">
        <span className="text-seq">-&gt; sequential</span>
        <span className="text-flow">|-&gt; streaming</span>
        <span className="text-flow">|| parallel</span>
        <span className="text-keyword">0 -&gt; branch</span>
        <span className="text-template">&lt;Template&gt;</span>
        <span className="text-retry">* 3 retry</span>
        <span className="text-accent">local::</span>
      </div>
    </Section>
  );
}
