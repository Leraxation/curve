import React from 'react'

export type RoleCurve = 'none' | 'N1' | 'N2' | 'N3' | 'N4' | 'N5' | 'N6'

const OPTIONS: { label: string; value: RoleCurve }[] = [
  { label: 'None', value: 'none' },
  { label: 'N1', value: 'N1' },
  { label: 'N2', value: 'N2' },
  { label: 'N3', value: 'N3' },
  { label: 'N4', value: 'N4' },
  { label: 'N5', value: 'N5' },
  { label: 'N6', value: 'N6' }
]

export function RoleCurveSelect({
  value,
  onChange,
  id = 'roleCurve',
  className
}: {
  value: RoleCurve
  onChange: (v: RoleCurve) => void
  id?: string
  className?: string
}) {
  return (
    <select
      id={id}
      aria-label="Role Curve"
      value={value}
      onChange={(e) => onChange(e.target.value as RoleCurve)}
      className={className}
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
