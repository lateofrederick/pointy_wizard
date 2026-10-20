'use client';

import { Editor, type Monaco } from '@monaco-editor/react';
import { useTheme } from '../../lib/theme';

/**
 * The Definition tab — Figma screen 04.
 *
 * Python lives in the right-hand pane and is never authored on the canvas; the
 * canvas is for pipeline structure only. That separation is a settled design
 * decision, not a layout convenience.
 *
 * Monaco needs literal hex, so the theme is defined twice rather than read from
 * CSS variables. Keep these in step with app/globals.css.
 */
const THEMES = {
  dark: {
    base: 'vs-dark' as const,
    bg: '#070910',
    fg: '#C8D6E8',
    keyword: '#FD9FCA',
    type: '#FFB830',
    string: '#FFB830',
    number: '#00FF94',
    comment: '#6E6C68',
    self: '#7B61FF',
    line: '#F5F2EC',
  },
  light: {
    base: 'vs' as const,
    bg: '#F2F2F4',
    fg: '#2A3442',
    keyword: '#C2417E',
    type: '#B87400',
    string: '#B87400',
    number: '#00875A',
    comment: '#737780',
    self: '#5B3FE0',
    line: '#14161B',
  },
};

function defineThemes(monaco: Monaco) {
  for (const [name, t] of Object.entries(THEMES)) {
    monaco.editor.defineTheme(`pointy-${name}`, {
      base: t.base,
      inherit: true,
      rules: [
        { token: 'keyword', foreground: t.keyword.slice(1) },
        { token: 'type', foreground: t.type.slice(1) },
        { token: 'string', foreground: t.string.slice(1) },
        { token: 'number', foreground: t.number.slice(1) },
        { token: 'comment', foreground: t.comment.slice(1), fontStyle: 'italic' },
        { token: 'variable.predefined', foreground: t.self.slice(1) },
      ],
      colors: {
        'editor.background': t.bg,
        'editor.foreground': t.fg,
        'editorLineNumber.foreground': `${t.comment}`,
        'editorLineNumber.activeForeground': t.line,
        'editor.lineHighlightBackground': '#00000000',
        'editorIndentGuide.background1': `${t.comment}40`,
      },
    });
  }
}

export function DefinitionEditor({
  filename,
  source,
  onChange,
}: {
  filename: string;
  source: string;
  onChange: (next: string) => void;
}) {
  const { theme } = useTheme();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-[14px] py-2">
        <span className="inline-flex items-center rounded-[3px] bg-keyword-tint px-[5px] py-[2px] font-mono text-[8.6px] font-medium text-keyword">
          {'{}'}
        </span>
        <span className="font-mono text-[10px] text-secondary">{filename}</span>
        <span className="flex-1" />
        <span className="font-mono text-[9.4px] text-tertiary">
          {source.split('\n').length} lines
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-[6px] border border-edge-subtle">
        <Editor
          height="100%"
          language="python"
          value={source}
          onChange={(v) => onChange(v ?? '')}
          beforeMount={defineThemes}
          theme={`pointy-${theme}`}
          options={{
            minimap: { enabled: false },
            fontSize: 11,
            fontFamily: 'var(--font-dm-mono), ui-monospace, monospace',
            lineHeight: 17,
            tabSize: 4,
            scrollBeyondLastLine: false,
            renderLineHighlight: 'none',
            overviewRulerLanes: 0,
            folding: false,
            padding: { top: 10, bottom: 10 },
          }}
        />
      </div>
    </div>
  );
}
