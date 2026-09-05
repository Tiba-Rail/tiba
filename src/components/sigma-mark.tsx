export function SigmaMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M18 3H3l7 9-7 9h15"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}
