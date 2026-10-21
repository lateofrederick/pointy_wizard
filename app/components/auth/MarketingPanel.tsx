import { highlight, TOKEN_CLASS } from '../../lib/pointy/highlight';

/**
 * The right half of screens 01 and 02.
 *
 * The code card is highlighted by the same tokeniser the output panel uses, so
 * the promise it makes — "code you can review" — is made in the app's own
 * colours rather than a screenshot that can drift from them.
 *
 * Hidden below `lg`: at that width the form is the whole job.
 */
const SAMPLE = `hub::RestApiExtract[timeout=30]
  -> MAP<ValidateProfile>[batch_size=100]
  |-> ClassifyIntent[node="gpu-cluster"](
       0 -> RouteDecision(
           0 -> { GPT4Transform * 3 } -> SlackNotify,
           1 -> SlackNotify
         ),
       1 -> SlackNotify
     )`;

const FEATURES: { glyph: string; tone: string; text: string }[] = [
  { glyph: '->', tone: 'text-seq', text: 'A structured canvas that always compiles' },
  { glyph: '{}', tone: 'text-keyword', text: 'Python definitions live beside the graph' },
  { glyph: '◇', tone: 'text-flow', text: 'Pull from EventHub, publish your own' },
];

export function MarketingPanel() {
  const lines = highlight(SAMPLE);

  return (
    <section className="hidden flex-1 flex-col justify-center bg-bg-base px-[150px] py-[72px] lg:flex">
      <h2 className="max-w-[660px] font-sans text-[38px] leading-[46px] font-medium text-primary">
        Pipelines you can read.
      </h2>
      <p className="mt-0 max-w-[660px] font-sans text-[15px] leading-[26px] text-secondary">
        A visual editor for the Pointy DSL. Everything you draw compiles to code you can
        review, diff and commit — no hidden graph format.
      </p>

      <div className="mt-[34px] max-w-[660px] overflow-hidden rounded-[10px] border border-edge-subtle bg-bg-canvas shadow-raised">
        <div className="flex h-8 items-center gap-2.5 border-b border-edge-subtle bg-bg-raised px-3.5">
          <span aria-hidden className="text-[9px] text-keyword">
            ●
          </span>
          <span className="font-mono text-[11px] text-secondary">my-etl-pipeline.pointy</span>
          <span className="flex-1" />
          <span className="font-sans text-[10.5px] text-keyword">✓ compiled</span>
        </div>

        <pre className="overflow-x-auto px-[18px] pt-4 pb-[18px] font-mono text-[13px] leading-5">
          <code>
            {lines.map((line) => (
              <div key={line.number}>
                {line.tokens.map((t, i) => (
                  <span key={i} className={TOKEN_CLASS[t.kind]}>
                    {t.value}
                  </span>
                ))}
                {line.tokens.length === 0 && ' '}
              </div>
            ))}
          </code>
        </pre>
      </div>

      <ul className="mt-[34px] flex max-w-[660px] flex-col gap-3.5">
        {FEATURES.map((f) => (
          <li key={f.text} className="flex items-center gap-3.5">
            <span
              aria-hidden
              className={`w-4 shrink-0 font-mono text-[12px] font-medium ${f.tone}`}
            >
              {f.glyph}
            </span>
            <span className="font-sans text-[14px] text-secondary">{f.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
