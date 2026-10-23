import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { focusRing } from "@/components/admin/marks";

export const BUTTON_VARIANTS = ["primary", "solid", "outline", "ghost", "danger"] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];
export type ButtonSize = "md" | "sm" | "icon";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "gradient-brand text-white shadow-[0_8px_28px_rgba(236,38,143,0.28)] hover:brightness-105",
  solid: "bg-black text-white hover:bg-black/85",
  outline: "border border-black/15 bg-white text-black hover:border-black/40 hover:bg-cream",
  ghost: "bg-transparent text-black hover:bg-black/5",
  danger: "bg-magenta text-white hover:brightness-105",
};

const SIZE: Record<ButtonSize, string> = {
  md: "h-12 gap-2 px-5",
  sm: "h-9 gap-1.5 px-3 text-xs",
  icon: "size-12 p-0",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className = ""): string {
  return `inline-flex shrink-0 items-center justify-center rounded-full text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100 ${VARIANT[variant]} ${SIZE[size]} ${focusRing} ${className}`.trim();
}

type Common = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
};

type ButtonProps = Common & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & { href?: undefined };
type LinkProps = Common & {
  href: string;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
  "aria-keyshortcuts"?: string;
  "aria-current"?: "page" | undefined;
};

export function Button(props: ButtonProps | LinkProps) {
  const variant = props.variant ?? "primary";
  const size = props.size ?? "md";
  const className = buttonClass(variant, size, props.className);
  if ("href" in props && props.href) {
    if (props.disabled) {
      return (
        <button type="button" className={className} disabled aria-disabled="true" data-variant={variant} title={props.title} aria-label={props["aria-label"]}>
          {props.children}
        </button>
      );
    }
    return (
      <Link
        href={props.href}
        className={className}
        data-variant={variant}
        title={props.title}
        aria-label={props["aria-label"]}
        aria-keyshortcuts={props["aria-keyshortcuts"]}
        aria-current={props["aria-current"]}
      >
        {props.children}
      </Link>
    );
  }
  const button = props as ButtonProps;
  return (
    <button type={button.type ?? "button"} {...domProps(button)} className={className} data-variant={variant}>
      {button.children}
    </button>
  );
}

function domProps(props: ButtonProps): ButtonHTMLAttributes<HTMLButtonElement> {
  const copy = { ...props } as Record<string, unknown>;
  delete copy.variant;
  delete copy.size;
  delete copy.className;
  delete copy.children;
  return copy as ButtonHTMLAttributes<HTMLButtonElement>;
}
