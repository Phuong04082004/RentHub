"use client";

import { ReactNode, useState, forwardRef } from "react";
import { cx } from "@/utils/cx";
import { isReactComponent } from "@/utils/is-react-component";
import { Eye, EyeOff } from "lucide-react";

export type InputSize = "sm" | "md" | "lg";
export type InputType = "text" | "email" | "password" | "search" | "tel" | "url" | "number";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  icon?: React.ComponentType<{ className?: string }> | ReactNode;
  hint?: string;
  size?: InputSize;
  type?: InputType;
  isRequired?: boolean;
  isInvalid?: boolean;
  isDisabled?: boolean;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  placeholder,
  icon,
  hint,
  size = "md",
  type = "text",
  isRequired = false,
  isInvalid = false,
  isDisabled = false,
  className = "",
  error,
  ...otherProps
}, ref) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const actualType = isPassword ? (showPassword ? "text" : "password") : type;

  const sizeStyles = {
    sm: "px-3 py-1.5 text-xs rounded-lg min-h-[32px]",
    md: "px-4 py-2.5 text-sm rounded-xl min-h-[40px]",
    lg: "px-4.5 py-3 text-base rounded-xl min-h-[48px]",
  };

  const hasError = isInvalid || !!error;

  const renderIcon = (inputIcon: ReactNode | React.ComponentType<{ className?: string }>) => {
    if (!inputIcon) return null;
    if (isReactComponent(inputIcon)) {
      const IconComponent = inputIcon as React.ComponentType<{ className?: string }>;
      return <IconComponent className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />;
    }
    return <span className="text-zinc-400 dark:text-zinc-500">{inputIcon as ReactNode}</span>;
  };

  return (
    <div className={cx("flex flex-col w-full gap-1.5", className)}>
      {/* Label */}
      {label && (
        <label className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          {label}
          {isRequired && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {/* Input Group Container */}
      <div
        className={cx(
          "relative flex items-center w-full bg-white dark:bg-zinc-900 border transition-all duration-200 focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-500 overflow-hidden",
          hasError
            ? "border-red-500 focus-within:ring-red-500 focus-within:border-red-500"
            : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600",
          sizeStyles[size].includes("rounded-lg") ? "rounded-lg" : "rounded-xl",
          isDisabled && "opacity-60 bg-zinc-50 dark:bg-zinc-950 cursor-not-allowed"
        )}
      >
        {/* Leading Icon */}
        {icon && (
          <div className="pl-3.5 flex items-center justify-center select-none pointer-events-none shrink-0">
            {renderIcon(icon)}
          </div>
        )}

        {/* The actual HTML Input field */}
        <input
          ref={ref}
          placeholder={placeholder}
          type={actualType}
          disabled={isDisabled}
          className={cx(
            "w-full bg-transparent border-none outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:ring-0",
            sizeStyles[size],
            icon && "pl-2"
          )}
          {...otherProps}
        />

        {/* Password Eye Toggle Icon */}
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="pr-3.5 flex items-center justify-center text-zinc-400 hover:text-zinc-600 focus:outline-none select-none cursor-pointer shrink-0"
          >
            {showPassword ? (
              <EyeOff className="w-5 h-5" />
            ) : (
              <Eye className="w-5 h-5" />
            )}
          </button>
        )}
      </div>

      {/* Hint & Error Text */}
      {(error || hint) && (
        <div className="h-4">
          {error ? (
            <p className="text-xs text-red-500 font-medium">
              {error}
            </p>
          ) : (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {hint}
            </p>
          )}
        </div>
      )}
    </div>
  );
});

Input.displayName = "Input";
