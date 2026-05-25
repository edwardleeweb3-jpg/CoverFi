import { ICON_PATHS, type IconName } from "./icon-paths";

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

/** Stroke/fill use currentColor — set text color on a parent to tint. */
export function Icon({ name, size = 18, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  );
}

/** Brand mark — references the global #mk SVG symbol defined in BrandSvgDefs. */
export function BrandMark({
  size = 25,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <use href="#mk" />
    </svg>
  );
}

/** Signa mark — references the global #signa SVG symbol. */
export function SignaMark({
  size = 30,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <use href="#signa" />
    </svg>
  );
}
