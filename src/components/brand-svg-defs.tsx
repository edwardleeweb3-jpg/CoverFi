/**
 * Hidden <svg> with reusable symbol defs (#mk, #signa).
 * Rendered once in the root layout so any component can do:
 *   <svg viewBox="0 0 100 100"><use href="#mk" /></svg>
 * Both symbols use currentColor for stroke/fill so they inherit text color.
 */
export function BrandSvgDefs() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute" }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <symbol id="mk" viewBox="0 0 100 100">
          <rect
            x="14"
            y="14"
            width="72"
            height="72"
            rx="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
          />
          <rect x="26" y="26" width="28" height="28" rx="7" fill="currentColor" />
        </symbol>
        <symbol id="signa" viewBox="0 0 100 100">
          <g fill="none" stroke="currentColor" strokeWidth="8.6" strokeLinecap="round">
            <path d="M36.3 87.6 A40 40 0 1 1 84.6 70" />
            <path d="M41.1 74.4 A26 26 0 1 1 72.5 63" />
            <path d="M45.6 62.2 A13 13 0 1 1 61.3 56.5" />
          </g>
          <circle cx="50" cy="50" r="6" fill="currentColor" />
        </symbol>
      </defs>
    </svg>
  );
}
