import type { SVGProps } from 'react'

function Svg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  )
}

export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)
export const SidebarIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="M9 4v16" />
  </Svg>
)
export const HomeIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />
  </Svg>
)
export const HelpIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01" />
  </Svg>
)
export const FilterIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 7h16M7 12h10M10 17h4" />
  </Svg>
)
export const SearchIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.5-4.5" />
  </Svg>
)
export const BoardIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p} strokeWidth="0" fill="currentColor">
    <rect x="4" y="5" width="4" height="14" rx="1" />
    <rect x="10" y="5" width="4" height="9" rx="1" />
    <rect x="16" y="5" width="4" height="12" rx="1" />
  </Svg>
)

export const TrashIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Svg>
)
export const GripIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p} strokeWidth="3">
    <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />
  </Svg>
)
export const CalendarIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="4" y="5" width="16" height="15" rx="3" />
    <path d="M4 10h16M8 3v4M16 3v4" />
  </Svg>
)
export const CheckSquareIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M8.5 12.5l2.5 2.5 4.5-5" />
  </Svg>
)
export const CommentIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-5 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
  </Svg>
)

export const TuneIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Svg>
)

export const ListIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
  </Svg>
)
export const OrderedListIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M10 6h10M10 12h10M10 18h10M4 5l1-1v4M3.5 14h2l-2 3h2.5" />
  </Svg>
)
export const TaskListIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 6l1.5 1.5L8 5M4 13l1.5 1.5L8 12M11 7h9M11 14h9M5 19h.01M11 19h9" />
  </Svg>
)
export const LinkIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Svg>
)
export const QuoteIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M5 8h5v5a4 4 0 0 1-4 4M14 8h5v5a4 4 0 0 1-4 4" />
  </Svg>
)
export const RuleIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 12h16" />
  </Svg>
)
export const CodeIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" />
  </Svg>
)

export const ShareIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 19c0-3 2.7-5 6-5s6 2 6 5M16 5.5a3 3 0 0 1 0 5M18 14c2 .6 3 2.2 3 5" />
  </Svg>
)

export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p} strokeWidth="2.5">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
)

export const MoreIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p} strokeWidth="3">
    <path d="M5 12h.01M12 12h.01M19 12h.01" />
  </Svg>
)
export const BellIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16zM10 21h4" />
  </Svg>
)
