// Simple stroke icons (24px grid, currentColor), so the shell never depends on emoji rendering.
type P = { size?: number; className?: string }

function Svg({ size = 20, className, children }: P & { children: React.ReactNode }) {
  return (
    <svg className={`ico ${className ?? ''}`} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export const IHome = (p: P) => <Svg {...p}><path d="M4 11.5 12 5l8 6.5" /><path d="M6.5 10v9h11v-9" /><path d="M10 19v-5h4v5" /></Svg>
export const IGrid = (p: P) => <Svg {...p}><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></Svg>
export const IChat = (p: P) => <Svg {...p}><path d="M5 18.5V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8.5z" /><path d="M9 10h6M9 13h3.5" /></Svg>
export const ITrophy = (p: P) => <Svg {...p}><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" /><path d="M12 13v3M9 20h6M10 16h4v4h-4z" /></Svg>
export const IUser = (p: P) => <Svg {...p}><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></Svg>
export const IBook = (p: P) => <Svg {...p}><path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v14H6.5A1.5 1.5 0 0 0 5 19.5z" /><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19" /></Svg>
export const ISpark = (p: P) => <Svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></Svg>
export const IUsers = (p: P) => <Svg {...p}><circle cx="9" cy="9" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M15.5 6.5a3 3 0 0 1 0 5.5M17 14.5a5.5 5.5 0 0 1 3.5 4.5" /></Svg>
export const IWallet = (p: P) => <Svg {...p}><rect x="3.5" y="6" width="17" height="13" rx="2" /><path d="M3.5 10h17M15.5 14.5h2" /></Svg>
export const ICheck = (p: P) => <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>
export const IMenu = (p: P) => <Svg {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Svg>
export const IClose = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>
export const IBolt = (p: P) => <Svg {...p}><path d="M13 3 5.5 13.5H12L11 21l7.5-10.5H12z" /></Svg>
export const IUp = (p: P) => <Svg {...p}><path d="M7 21v-9H4l8-8 8 8h-3v9" /></Svg>
export const IThumbUp = (p: P) => <Svg {...p}><path d="M7.5 10.5V20H5a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1z" /><path d="M7.5 10.5 11 4a2 2 0 0 1 2.5 2.2L13 9.5h5a2 2 0 0 1 2 2.3l-1.1 6.5a2 2 0 0 1-2 1.7H7.5" /></Svg>
export const IThumbDown = (p: P) => <Svg {...p}><path d="M16.5 13.5V4H19a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1z" /><path d="M16.5 13.5 13 20a2 2 0 0 1-2.5-2.2l.5-3.3H6a2 2 0 0 1-2-2.3l1.1-6.5A2 2 0 0 1 7.1 4h9.4" /></Svg>
export const IComment = (p: P) => <Svg {...p}><path d="M20 12a7.5 7.5 0 0 1-11.1 6.6L4 20l1.4-4.6A7.5 7.5 0 1 1 20 12z" /></Svg>
export const IShare = (p: P) => <Svg {...p}><circle cx="17.5" cy="6" r="2.5" /><circle cx="6.5" cy="12" r="2.5" /><circle cx="17.5" cy="18" r="2.5" /><path d="m8.7 10.8 6.6-3.6M8.7 13.2l6.6 3.6" /></Svg>
export const IHeadphones = (p: P) => <Svg {...p}><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3.5" y="14" width="4" height="6" rx="1.5" /><rect x="16.5" y="14" width="4" height="6" rx="1.5" /></Svg>
export const IArrow = (p: P) => <Svg {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></Svg>
export const ILogout = (p: P) => <Svg {...p}><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M10 8 6 12l4 4M6 12h9" /></Svg>
export const IShield = (p: P) => <Svg {...p}><path d="M12 3.5 5 6v5.5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6z" /><path d="m9 12 2 2 4-4" /></Svg>
export const INews = (p: P) => <Svg {...p}><rect x="4" y="4.5" width="16" height="15" rx="2" /><path d="M8 9h8M8 12.5h8M8 16h5" /></Svg>
export const IPlay = (p: P) => <Svg {...p}><rect x="3.5" y="5" width="17" height="14" rx="3" /><path d="m10.5 9.5 4 2.5-4 2.5z" /></Svg>
