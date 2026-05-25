import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "ghost";
type Size = "md" | "sm";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

/**
 * Visual matches prototype `.btn` / `.btn-primary` / `.btn-ghost` / `.btn-sm` / `.btn-block`.
 * Styles live in globals.css as plain CSS to preserve the prototype's exact transitions.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "ghost", size = "md", block, className, children, ...rest },
  ref,
) {
  const classes = ["btn"];
  if (variant === "primary") classes.push("btn-primary");
  else classes.push("btn-ghost");
  if (size === "sm") classes.push("btn-sm");
  if (block) classes.push("btn-block");
  if (className) classes.push(className);

  return (
    <button ref={ref} className={classes.join(" ")} {...rest}>
      {children}
    </button>
  );
});
