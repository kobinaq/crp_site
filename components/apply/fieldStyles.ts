// Shared "More about you" field styling: white pill, hairline border.
export const FIELD =
  "flex h-12 items-center rounded-[40px] border border-black/12 bg-white";
export const LABEL =
  "text-[14px] font-semibold uppercase tracking-[0.56px] text-black/48 mix-blend-hard-light";
export const PLACEHOLDER =
  "placeholder:text-[14px] placeholder:font-semibold placeholder:uppercase placeholder:tracking-[0.56px] placeholder:text-black/48";

// "lg" field for More about you. Desktop Figma 2308:2967: 64px pill, 48px radius.
// Mobile Figma 2308:10638: 61px pill, 48px radius, 12px placeholder labels.
export const FIELD_LG = "max-desk:h-[61px] max-desk:rounded-[48px] desk:h-16 desk:rounded-[48px]";
export const LABEL_LG = `${LABEL} max-desk:text-[12px] max-desk:leading-[0.9] max-desk:tracking-[0.48px]`;
export const PLACEHOLDER_LG = `${PLACEHOLDER} max-desk:placeholder:text-[12px] max-desk:placeholder:tracking-[0.48px]`;
// Small floating label shown above a filled value (10px on both breakpoints).
export const MINI_LABEL =
  "text-[10px] font-semibold uppercase leading-[0.9] tracking-[0.4px] text-black/48 mix-blend-hard-light";
export const VALUE_LG = "text-[16px] leading-[1.2] tracking-[-0.64px] text-black desk:text-[20px] desk:tracking-[-0.8px]";
