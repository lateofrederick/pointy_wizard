/**
 * Provider marks for the sign-in buttons — Figma screens 01/02 draw a
 * placeholder ● here.
 *
 * Inlined rather than fetched: a logo that arrives over the network can fail to
 * arrive, and these sit on the first screen anyone sees. Both are the official
 * marks, used to identify the provider on a sign-in button, which is what each
 * company's brand guidance permits them for.
 *
 * GitHub's mark is monochrome and inherits `currentColor`, so it follows the
 * theme. Google's is not — its four colours are fixed by the guidelines and
 * must not be recoloured, so it renders the same in light and dark.
 */

export function GitHubMark({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

export function GoogleMark({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M23.52 12.273c0-.851-.076-1.67-.218-2.455H12v4.642h6.458c-.278 1.5-1.122 2.77-2.39 3.622v3.01h3.87c2.265-2.085 3.572-5.155 3.572-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.956-1.075 7.942-2.908l-3.87-3.01c-1.075.72-2.45 1.146-4.072 1.146-3.13 0-5.78-2.114-6.727-4.955H1.27v3.11C3.247 21.31 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.273 14.273A7.21 7.21 0 0 1 4.897 12c0-.79.136-1.554.376-2.273V6.617H1.27A11.986 11.986 0 0 0 0 12c0 1.94.463 3.775 1.27 5.383l4.003-3.11z"
      />
      <path
        fill="#EA4335"
        d="M12 4.773c1.764 0 3.348.606 4.593 1.796l3.446-3.446C17.95 1.19 15.235 0 12 0 7.31 0 3.247 2.69 1.27 6.617l4.003 3.11C6.22 6.887 8.87 4.773 12 4.773z"
      />
    </svg>
  );
}
