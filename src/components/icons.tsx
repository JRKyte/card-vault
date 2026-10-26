// Inline stroke icons. No trademark imagery.
import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 24, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {children}
    </svg>
  )
}

export const IconSets = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </Icon>
)
export const IconPlus = (p: P) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)
export const IconMinus = (p: P) => (
  <Icon {...p}>
    <path d="M5 12h14" />
  </Icon>
)
export const IconValue = (p: P) => (
  <Icon {...p}>
    <path d="M3 17l5-5 4 4 8-8" />
    <path d="M15 8h5v5" />
  </Icon>
)
export const IconSearch = (p: P) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </Icon>
)
export const IconChevronRight = (p: P) => (
  <Icon {...p}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
)
export const IconChevronLeft = (p: P) => (
  <Icon {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Icon>
)
export const IconStar = (p: P) => (
  <Icon {...p}>
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
  </Icon>
)
export const IconCheck = (p: P) => (
  <Icon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
)
export const IconX = (p: P) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
)
export const IconEdit = (p: P) => (
  <Icon {...p}>
    <path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16z" />
  </Icon>
)
export const IconRefresh = (p: P) => (
  <Icon {...p}>
    <path d="M20 11a8 8 0 00-14.5-4.5L4 8" />
    <path d="M4 4v4h4" />
    <path d="M4 13a8 8 0 0014.5 4.5L20 16" />
    <path d="M20 20v-4h-4" />
  </Icon>
)
export const IconCalendar = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Icon>
)
export const IconEye = (p: P) => (
  <Icon {...p}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)
export const IconEyeOff = (p: P) => (
  <Icon {...p}>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.1A10.6 10.6 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4.1M6.6 6.6A17.4 17.4 0 002 12s3.6 7 10 7a9.8 9.8 0 005.4-1.6" />
    <path d="M9.9 9.9a3 3 0 004.2 4.2" />
  </Icon>
)
export const IconSparkle = (p: P) => (
  <Icon {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />
  </Icon>
)
export const IconDownload = (p: P) => (
  <Icon {...p}>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </Icon>
)
export const IconUpload = (p: P) => (
  <Icon {...p}>
    <path d="M12 20V9M7 14l5-5 5 5M5 4h14" />
  </Icon>
)
export const IconWifiOff = (p: P) => (
  <Icon {...p}>
    <path d="M3 3l18 18M8.5 16.5a5 5 0 017 0M5 12.5a10 10 0 015.2-2.7M19 12.5a10 10 0 00-2.2-1.6M2 8.8a15 15 0 014.4-2.6M22 8.8a15 15 0 00-9.6-3.8" />
    <circle cx="12" cy="20" r="0.8" fill="currentColor" />
  </Icon>
)
export const IconWand = (p: P) => (
  <Icon {...p}>
    <path d="M4 20L15 9M14 4v3M19 9h3M17.5 5.5l2-2M12.5 2.5v0M21.5 12.5v0" />
  </Icon>
)
export const IconHand = (p: P) => (
  <Icon {...p}>
    <rect x="5" y="4" width="10" height="14" rx="2" />
    <path d="M9 21h10a1 1 0 001-1V8" />
  </Icon>
)
