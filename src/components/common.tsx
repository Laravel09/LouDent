import { ReactNode, useEffect, useId, useRef, useState } from "react"
import { AppointmentStatus } from "../types"

// ─── Logo ─────────────────────────────────────────────────────────────────────

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const textSize =
    size === "sm" ? "text-base" : size === "md" ? "text-xl" : "text-2xl"
  const svgSize = size === "sm" ? 22 : size === "md" ? 28 : 34
  return (
    <div className="flex items-center gap-2 select-none">
      <svg width={svgSize} height={svgSize} viewBox="0 0 32 32" fill="none">
        <path
          d="M16 3C11.5 3 7.5 6.5 7.5 11.5c0 2.2.7 4.2 1.6 6.2L11 24c.5 1.8 1.2 3 2.8 3h4.4c1.6 0 2.3-1.2 2.8-3l1.9-6.3c.9-2 1.6-4 1.6-6.2C24.5 6.5 20.5 3 16 3z"
          fill="#2563EB"
          opacity="0.18"
        />
        <path
          d="M16 3C11.5 3 7.5 6.5 7.5 11.5c0 2.2.7 4.2 1.6 6.2L11 24c.5 1.8 1.2 3 2.8 3h4.4c1.6 0 2.3-1.2 2.8-3l1.9-6.3c.9-2 1.6-4 1.6-6.2C24.5 6.5 20.5 3 16 3z"
          stroke="#2563EB"
          strokeWidth="1.5"
        />
        <path
          d="M12 11.5c1.3-.8 2.7-1 4-1s2.7.2 4 1"
          stroke="#2563EB"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <span className={`font-bold tracking-tight text-navy ${textSize}`}>
        Lou<span className="text-blue">Dent</span>
      </span>
    </div>
  )
}

export function DentalServiceIcon({
  serviceId = "",
  className = "h-7 w-7",
}: {
  serviceId?: string
  className?: string
}) {
  const orthodontic =
    serviceId.toLowerCase().includes("orthodont") ||
    ["braces-combo", "braces-install", "retainer"].includes(serviceId)
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M12 3.5c-3.7-2.2-8 .6-7.2 5.1.35 2 1.4 3.1 2.1 5.1l1.3 4.1c.35 1.15.9 2 2 2 1.15 0 1.35-1.1 1.8-2.7.45 1.6.65 2.7 1.8 2.7 1.1 0 1.65-.85 2-2l1.3-4.1c.7-2 1.75-3.1 2.1-5.1.8-4.5-3.5-7.3-7.2-5.1z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {orthodontic ? (
        <>
          <path
            d="M8 10.5h8"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <rect
            x="9"
            y="9.2"
            width="2"
            height="2.6"
            rx=".4"
            stroke="currentColor"
            strokeWidth="1.1"
          />
          <rect
            x="13"
            y="9.2"
            width="2"
            height="2.6"
            rx=".4"
            stroke="currentColor"
            strokeWidth="1.1"
          />
        </>
      ) : (
        <path
          d="M8.5 8.5c1.1.7 2.25 1 3.5 1s2.4-.3 3.5-1"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}

// ─── Buttons ──────────────────────────────────────────────────────────────────

interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: "primary" | "secondary" | "ghost" | "destructive"
  size?: "sm" | "md" | "lg"
  className?: string
  type?: "button" | "submit"
  fullWidth?: boolean
}

export function Button({
  children,
  onClick,
  disabled = false,
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  fullWidth = false,
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-150 cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-offset-2"
  const sizes = {
    sm: "px-3 py-1.5 text-sm gap-1.5",
    md: "px-4 py-2.5 text-sm gap-2",
    lg: "px-6 py-3 text-base gap-2",
  }
  const variants = {
    primary:
      "bg-blue text-white hover:bg-blue-dark focus:ring-blue disabled:opacity-50 disabled:cursor-not-allowed",
    secondary:
      "bg-white text-navy border border-border hover:bg-surface-2 focus:ring-blue disabled:opacity-50 disabled:cursor-not-allowed",
    ghost:
      "bg-transparent text-navy hover:bg-surface-2 focus:ring-blue disabled:opacity-50 disabled:cursor-not-allowed",
    destructive:
      "bg-danger text-white hover:bg-red-700 focus:ring-danger disabled:opacity-50 disabled:cursor-not-allowed",
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${
        fullWidth ? "w-full" : ""
      } ${className}`}
    >
      {children}
    </button>
  )
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const styles: Record<AppointmentStatus, string> = {
    Pending: "bg-amber-100 text-amber-800",
    Confirmed: "bg-blue-tint text-blue",
    Completed: "bg-green-100 text-success",
    Cancelled: "bg-red-100 text-danger",
    Declined: "bg-red-100 text-danger",
  }
  const dots: Record<AppointmentStatus, string> = {
    Pending: "bg-warning",
    Confirmed: "bg-blue",
    Completed: "bg-success",
    Cancelled: "bg-danger",
    Declined: "bg-danger",
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${styles[status]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dots[status]}`} />
      {status}
    </span>
  )
}

// ─── Input ────────────────────────────────────────────────────────────────────

interface InputProps {
  label: string
  type?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  error?: string
  required?: boolean
}

export function Input({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  required,
}: InputProps) {
  const id = useId()
  const [passwordVisible, setPasswordVisible] = useState(false)
  const isPassword = type === "password"
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-navy">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && passwordVisible ? "text" : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full px-3 py-2.5 ${
            isPassword ? "pr-16" : ""
          } rounded-lg border text-sm text-navy placeholder-muted bg-white focus:outline-none focus:ring-2 focus:ring-blue focus:border-blue transition-colors ${
            error
              ? "border-danger bg-red-50"
              : "border-border hover:border-gray-300"
          }`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setPasswordVisible((visible) => !visible)}
            className="absolute inset-y-0 right-0 px-3 text-xs font-semibold text-blue"
            aria-label={passwordVisible ? "Hide password" : "Show password"}
          >
            {passwordVisible ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}

interface ProfilePhotoControlProps {
  photo?: string
  initials: string
  onChange: (photo?: string) => void
  disabled?: boolean
  onProcessingChange?: (processing: boolean) => void
}

export function ProfileAvatar({
  photo,
  initials,
  className = "h-10 w-10",
}: {
  photo?: string
  initials: string
  className?: string
}) {
  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => setImageFailed(false), [photo])
  return photo && !imageFailed ? (
    <img
      src={photo}
      alt=""
      onError={() => setImageFailed(true)}
      className={`${className} rounded-full object-cover`}
    />
  ) : (
    <span
      className={`${className} flex items-center justify-center rounded-full bg-blue-tint font-bold text-blue`}
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}

function resizeAvatar(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () =>
      reject(new Error("The selected image could not be read."))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () =>
        reject(new Error("The selected file is not a valid image."))
      image.onload = () => {
        const canvas = document.createElement("canvas")
        const size = 256
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext("2d")
        if (!context) {
          reject(new Error("Image processing is unavailable in this browser."))
          return
        }
        const sourceSize = Math.min(image.naturalWidth, image.naturalHeight)
        const sourceX = (image.naturalWidth - sourceSize) / 2
        const sourceY = (image.naturalHeight - sourceSize) / 2
        context.drawImage(
          image,
          sourceX,
          sourceY,
          sourceSize,
          sourceSize,
          0,
          0,
          size,
          size,
        )
        try {
          resolve(canvas.toDataURL("image/jpeg", 0.82))
        } catch {
          reject(new Error("The selected image could not be processed."))
        }
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

export function ProfilePhotoControl({
  photo,
  initials,
  onChange,
  disabled = false,
  onProcessingChange,
}: ProfilePhotoControlProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => setImageFailed(false), [photo])

  const handleFile = async (file?: File) => {
    if (!file) return
    setError(null)
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPEG, PNG, or WebP image.")
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("The image must be 2 MB or smaller.")
      return
    }
    setProcessing(true)
    onProcessingChange?.(true)
    try {
      onChange(await resizeAvatar(file))
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The selected image could not be processed.",
      )
    } finally {
      setProcessing(false)
      onProcessingChange?.(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        aria-label="Choose profile photo"
        disabled={disabled || processing}
        onClick={() => inputRef.current?.click()}
        className="group relative h-24 w-24 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {photo && !imageFailed ? (
          <img
            src={photo}
            alt="Profile preview"
            onError={() => setImageFailed(true)}
            className="h-24 w-24 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-blue-tint text-2xl font-bold text-blue">
            {initials}
          </span>
        )}
        <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-blue text-white">
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              d="M4 8.5h3l1.5-2h7l1.5 2h3v9H4v-9z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
            <circle
              cx="12"
              cy="13"
              r="3"
              stroke="currentColor"
              strokeWidth="1.7"
            />
          </svg>
        </span>
      </button>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled || processing}
        onChange={(event) => handleFile(event.target.files?.[0])}
        className="sr-only"
      />
      <div className="mt-3 flex items-center gap-3">
        <label
          htmlFor={inputId}
          className={`text-sm font-semibold text-blue ${
            disabled || processing
              ? "cursor-not-allowed opacity-50"
              : "cursor-pointer hover:underline"
          }`}
        >
          {processing ? "Processing…" : "Change Photo"}
        </label>
        {photo && (
          <button
            type="button"
            disabled={disabled || processing}
            onClick={() => {
              setError(null)
              onChange(undefined)
            }}
            className="text-sm text-danger hover:underline disabled:opacity-50"
          >
            Remove Photo
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-center text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  children: ReactNode
  onClose?: () => void
}

export function Modal({ children, onClose }: ModalProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.()
    }
    document.addEventListener("keydown", closeOnEscape)
    return () => document.removeEventListener("keydown", closeOnEscape)
  }, [onClose])
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-navy/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 z-10">
        {children}
      </div>
    </div>
  )
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

interface StepIndicatorProps {
  steps: string[]
  current: number
}

export function StepIndicator({ steps, current }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  done
                    ? "bg-blue text-white"
                    : active
                      ? "bg-blue text-white ring-4 ring-blue-tint"
                      : "bg-surface-2 text-muted"
                }`}
              >
                {done ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16">
                    <path
                      d="M3 8l3.5 3.5L13 5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-xs font-medium whitespace-nowrap hidden sm:block ${
                  active ? "text-blue" : done ? "text-navy" : "text-muted"
                }`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`w-12 h-0.5 mx-1 mb-4 ${
                  done ? "bg-blue" : "bg-border"
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: string
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-5xl mb-4">{icon}</div>
      <p className="font-semibold text-navy text-base mb-1">{title}</p>
      <p className="text-sm text-muted max-w-xs">{description}</p>
    </div>
  )
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

export function Avatar({
  src,
  name,
  size = "md",
}: {
  src?: string
  name: string
  size?: "sm" | "md" | "lg" | "xl"
}) {
  const sizes = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-16 h-16 text-xl",
    xl: "w-24 h-24 text-3xl",
  }
  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => setImageFailed(false), [src])
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
  return (
    <div
      className={`${sizes[size]} rounded-full overflow-hidden bg-blue-tint flex items-center justify-center font-bold text-blue flex-shrink-0`}
    >
      {src && !imageFailed ? (
        <img
          src={src}
          alt={name}
          onError={() => setImageFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  )
}

// ─── Section Card ─────────────────────────────────────────────────────────────

export function Card({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`bg-white border border-border rounded-xl p-5 ${className}`}
    >
      {children}
    </div>
  )
}

// ─── Inline Success Toast ─────────────────────────────────────────────────────

export function SuccessToast({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-success rounded-lg px-4 py-3 text-sm font-medium">
      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 16 16">
        <path
          d="M3 8l3.5 3.5L13 5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {message}
    </div>
  )
}

// ─── Page header (inside content) ─────────────────────────────────────────────

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">{title}</h1>
        {description && (
          <p className="text-sm text-muted mt-1">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}

// ─── Checkbox ─────────────────────────────────────────────────────────────────

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
}) {
  return (
    <label className="group flex items-start gap-2 cursor-pointer">
      {/* Real (visually hidden) checkbox: keyboard and screen-reader accessible */}
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <div
        aria-hidden="true"
        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-blue ${
          checked
            ? "bg-blue border-blue"
            : "bg-white border-border hover:border-gray-400"
        }`}
      >
        {checked && (
          <svg
            className="w-2.5 h-2.5 text-white"
            fill="none"
            viewBox="0 0 10 10"
          >
            <path
              d="M2 5l2.5 2.5L8 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <span className="text-sm text-navy">{label}</span>
    </label>
  )
}

// ─── Selectable Card ──────────────────────────────────────────────────────────

export function SelectableCard({
  selected,
  onClick,
  children,
  className = "",
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onClick()
        }
      }}
      className={`relative border rounded-xl p-4 cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue ${
        selected
          ? "border-blue bg-blue-tint ring-2 ring-blue/20"
          : "border-border bg-white hover:border-blue/40 hover:bg-surface"
      } ${className}`}
    >
      {selected && (
        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-blue flex items-center justify-center">
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
            <path
              d="M2.5 6l2.5 2.5L9.5 3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
      {children}
    </div>
  )
}

// ─── Confirmation Dialog (inline) ─────────────────────────────────────────────

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  dangerous?: boolean
  /** Request in flight: both buttons are disabled so the action cannot be sent twice. */
  busy?: boolean
  /** Error from the last attempt (shown inside the dialog). */
  error?: string | null
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  dangerous = false,
  busy = false,
  error = null,
}: ConfirmDialogProps) {
  return (
    <Modal onClose={onCancel}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center ${
              dangerous ? "bg-red-100" : "bg-blue-tint"
            }`}
          >
            <svg
              className={`w-5 h-5 ${dangerous ? "text-danger" : "text-blue"}`}
              fill="none"
              viewBox="0 0 20 20"
            >
              <path
                d="M10 3a7 7 0 100 14A7 7 0 0010 3zm0 4v4m0 2h.01"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-navy">{title}</h2>
        </div>
        <p className="text-sm text-muted">{message}</p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={dangerous ? "destructive" : "primary"}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Log Out Dialog ───────────────────────────────────────────────────────────

export function LogoutDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <ConfirmDialog
      title="Log Out"
      message="Are you sure you want to log out of your LouDent account?"
      confirmLabel="Log Out"
      cancelLabel="Stay"
      onConfirm={onConfirm}
      onCancel={onCancel}
      dangerous={false}
    />
  )
}

// ─── Nav icons ────────────────────────────────────────────────────────────────

export const icons = {
  home: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 20 20">
      <path
        d="M3 10.5L10 4l7 6.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1v-6.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  ),
  services: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 20 20">
      <path
        d="M10 3v14M3 10h14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect
        x="3"
        y="3"
        width="14"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  ),
  dentists: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 20 20">
      <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M4 17c0-3.31 2.686-6 6-6s6 2.69 6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  appointments: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 20 20">
      <rect
        x="3"
        y="4"
        width="14"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M7 2v4M13 2v4M3 9h14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  profile: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 20 20">
      <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M4 17c0-3.31 2.686-6 6-6s6 2.69 6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  dashboard: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 20 20">
      <rect
        x="3"
        y="3"
        width="6"
        height="6"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="11"
        y="3"
        width="6"
        height="6"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="3"
        y="11"
        width="6"
        height="6"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="11"
        y="11"
        width="6"
        height="6"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  ),
  availability: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 6v4l2.5 2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.45 4.45l1.42 1.42M14.13 14.13l1.42 1.42M15.55 4.45l-1.42 1.42M5.87 14.13l-1.42 1.42"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  logout: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 20 20">
      <path
        d="M7 3H4a1 1 0 00-1 1v12a1 1 0 001 1h3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M13 14l3-4-3-4M16 10H8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  bell: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 20 20">
      <path
        d="M10 2a6 6 0 00-6 6v3l-1.5 2.5h15L16 11V8a6 6 0 00-6-6zM8 16a2 2 0 004 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  chevronRight: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  check: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 20 20">
      <path
        d="M4 10l4.5 4.5L16 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  edit: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
      <path
        d="M10.5 2.5l3 3L5 14H2v-3L10.5 2.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  arrowLeft: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
      <path
        d="M10 4L6 8l4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  search: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
      <circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 10l3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  tooth: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 20 20">
      <path
        d="M10 2C7 2 4.5 4.2 4.5 7.5c0 1.5.5 3 1.2 4.5L7 17c.3 1 .8 1.5 1.7 1.5h2.6c.9 0 1.4-.5 1.7-1.5l1.3-5c.7-1.5 1.2-3 1.2-4.5C15.5 4.2 13 2 10 2z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  ),
}

// ─── Date display ─────────────────────────────────────────────────────────────

/** "2026-11-09" -> "Nov 9, 2026". Falls back to the raw value if it cannot be parsed. */
export function formatAppointmentDate(date: string) {
  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(parsed)
}
