export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Accessible name; render a visible label next to it too. */
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition disabled:opacity-50 ${
        checked ? 'border-accent-solid bg-accent-solid' : 'border-line-strong bg-sunken'
      }`}
    >
      <span
        className={`size-4.5 rounded-full bg-white shadow-sm transition ${
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]'
        }`}
      />
    </button>
  )
}
