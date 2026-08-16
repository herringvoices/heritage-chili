"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Flame, Info, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";

export function Card({ children, featured = false, className = "" }: { children: ReactNode; featured?: boolean; className?: string }) {
  return <div className={`glass-card ${featured ? "glass-card--featured" : ""} rounded-[var(--radius-card)] p-6 sm:p-8 ${className}`}>{children}</div>;
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }>(function Button({ className = "", variant = "primary", ...props }, ref) {
  const styles = {
    primary: "border border-amber-bright/45 bg-gradient-to-br from-amber-bright via-amber to-[#d97706] text-[#2b1905] shadow-[var(--glow-action)] enabled:hover:-translate-y-0.5 enabled:hover:border-amber-bright enabled:hover:brightness-110 enabled:hover:shadow-[0_14px_38px_rgb(245_158_11_/_34%)]",
    secondary: "border border-[var(--border-default)] bg-white/5 text-warm-cream enabled:hover:-translate-y-0.5 enabled:hover:border-amber/35 enabled:hover:bg-white/10 enabled:hover:shadow-[0_10px_26px_rgb(0_0_0_/_28%)]",
    danger: "border border-[rgb(243_165_158_/_16%)] bg-[var(--color-brick-red)] text-warm-cream enabled:hover:-translate-y-0.5 enabled:hover:border-[rgb(243_165_158_/_32%)] enabled:hover:bg-[var(--color-autumn-red)] enabled:hover:shadow-[0_10px_28px_rgb(185_56_46_/_24%)]",
  };
  return <button ref={ref} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] px-5 py-3 text-sm font-black transition-[transform,background-color,border-color,box-shadow,filter,opacity] duration-200 disabled:cursor-not-allowed disabled:opacity-55 ${styles[variant]} ${className}`} {...props} />;
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className = "", ...props }, ref) {
  return <input ref={ref} className={`min-h-11 w-full cursor-text rounded-[var(--radius-control)] border-2 border-white/20 bg-[rgb(12_10_9_/_62%)] px-4 py-3 text-warm-cream shadow-[inset_0_2px_5px_rgb(0_0_0_/_35%),0_1px_0_rgb(255_255_255_/_5%)] transition-[background-color,border-color,box-shadow] placeholder:text-[var(--color-muted)] hover:border-white/30 hover:bg-[rgb(12_10_9_/_74%)] focus:border-[var(--color-amber)] focus:bg-[rgb(12_10_9_/_82%)] focus:outline-none focus:shadow-[inset_0_2px_5px_rgb(0_0_0_/_35%),0_0_0_3px_rgb(245_158_11_/_16%)] disabled:cursor-not-allowed disabled:opacity-55 ${className}`} {...props} />;
});

export function Checkbox({ checked, onCheckedChange, label }: { checked: boolean; onCheckedChange: (value: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 font-bold text-warm-cream">
      <CheckboxPrimitive.Root checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} className="grid size-6 place-items-center rounded-lg border border-[var(--border-default)] bg-black/20 data-[state=checked]:border-amber data-[state=checked]:bg-amber">
        <CheckboxPrimitive.Indicator><Check className="size-4 text-[#2b1905]" strokeWidth={4} /></CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {label}
    </label>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "amber" | "red" }) {
  const tones = { neutral: "border-white/10 bg-white/5 text-warm-gray", amber: "border-amber/25 bg-amber/10 text-amber-bright", red: "border-[rgb(185_56_46_/_30%)] bg-[rgb(185_56_46_/_12%)] text-[#f3a59e]" };
  return <span className={`inline-flex min-h-7 items-center rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${tones[tone]}`}>{children}</span>;
}

export function LoadingState({ label = "Warming things up…" }: { label?: string }) {
  return <div role="status" className="flex min-h-44 flex-col items-center justify-center gap-3 text-center text-warm-gray"><LoaderCircle className="size-7 animate-spin text-amber" aria-hidden="true" /><p className="font-bold">{label}</p></div>;
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] p-8 text-center"><Flame className="mx-auto size-7 text-amber" aria-hidden="true" /><h2 className="mt-3 text-xl font-black">{title}</h2><p className="mt-2 text-warm-gray">{message}</p></div>;
}

export function ErrorState({ title = "We hit a snag", message, action }: { title?: string; message: string; action?: ReactNode }) {
  return <div role="alert" className="rounded-[var(--radius-card)] border border-[rgb(185_56_46_/_32%)] bg-[rgb(132_44_37_/_18%)] p-6"><TriangleAlert className="size-7 text-[#f3a59e]" aria-hidden="true" /><h2 className="mt-3 text-xl font-black">{title}</h2><p className="mt-2 max-w-xl text-warm-gray">{message}</p>{action ? <div className="mt-5">{action}</div> : null}</div>;
}

export function InfoDialog() {
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild><Button variant="secondary"><Info className="size-4" /> About the cookoff</Button></DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
        <DialogPrimitive.Content className="glass-card fixed left-1/2 top-1/2 z-50 w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-feature)] p-7 shadow-2xl">
          <DialogPrimitive.Title className="text-2xl font-black">Good chili. Great cause.</DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-3 leading-7 text-warm-gray">This app keeps registration, check-in, pledges, and voting together for one delightfully competitive community fundraiser.</DialogPrimitive.Description>
          <DialogPrimitive.Close asChild><button aria-label="Close" className="absolute right-4 top-4 grid size-11 place-items-center rounded-full text-warm-gray hover:bg-white/10 hover:text-warm-cream"><X className="size-5" /></button></DialogPrimitive.Close>
          <DialogPrimitive.Close asChild><Button className="mt-6 w-full">Sounds delicious</Button></DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Toast({ open, onOpenChange, message }: { open: boolean; onOpenChange: (open: boolean) => void; message: string }) {
  return <ToastPrimitive.Provider swipeDirection="right"><AnimatePresence>{open ? <ToastPrimitive.Root asChild open={open} onOpenChange={onOpenChange} duration={3000}><motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass-card fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-3 rounded-[var(--radius-control)] p-4"><Check className="size-5 text-amber" /><ToastPrimitive.Description className="font-bold">{message}</ToastPrimitive.Description></motion.div></ToastPrimitive.Root> : null}</AnimatePresence><ToastPrimitive.Viewport /></ToastPrimitive.Provider>;
}
