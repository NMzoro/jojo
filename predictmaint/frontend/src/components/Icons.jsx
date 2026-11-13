import React from "react";

function Svg({ children, size = 18, className = "", strokeWidth = 1.8, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconGrid = (props) => (
  <Svg {...props}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </Svg>
);

export const IconCpu = (props) => (
  <Svg {...props}>
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
    <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
    <rect x="9.5" y="9.5" width="5" height="5" rx="0.5" />
  </Svg>
);

export const IconActivity = (props) => (
  <Svg {...props}>
    <path d="M3 12h3l2.5-7 4 14 2.5-7H21" />
  </Svg>
);

export const IconChart = (props) => (
  <Svg {...props}>
    <path d="M3 3v18h18" />
    <path d="M7 15v3M12 9v9M17 5v13" />
  </Svg>
);

export const IconBell = (props) => (
  <Svg {...props}>
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
    <path d="M10.3 21a2 2 0 0 0 3.4 0" />
  </Svg>
);

export const IconFile = (props) => (
  <Svg {...props}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" />
  </Svg>
);

export const IconSettings = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.14.36.46.63.85.76H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
  </Svg>
);

export const IconTerminal = (props) => (
  <Svg {...props}>
    <rect x="2" y="3" width="20" height="18" rx="2" />
    <path d="m7 8 4 4-4 4M13 16h4" />
  </Svg>
);

export const IconPlay = (props) => (
  <Svg {...props}>
    <path d="m6 3 14 9-14 9z" />
  </Svg>
);

export const IconPause = (props) => (
  <Svg {...props}>
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </Svg>
);

export const IconZap = (props) => (
  <Svg {...props}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
  </Svg>
);

export const IconDownload = (props) => (
  <Svg {...props}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </Svg>
);

export const IconRefresh = (props) => (
  <Svg {...props}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
  </Svg>
);

export const IconSearch = (props) => (
  <Svg {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
  </Svg>
);

export const IconClose = (props) => (
  <Svg {...props}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);

export const IconChevron = (props) => (
  <Svg {...props}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
);

export const IconAlert = (props) => (
  <Svg {...props}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </Svg>
);

export const IconThermometer = (props) => (
  <Svg {...props}>
    <path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z" />
  </Svg>
);

export const IconGauge = (props) => (
  <Svg {...props}>
    <path d="M12 15l4-5" />
    <path d="M4 18a9 9 0 1 1 16 0" />
    <circle cx="12" cy="15" r="1.5" />
  </Svg>
);

export const IconWrench = (props) => (
  <Svg {...props}>
    <path d="M14.7 6.3a4.5 4.5 0 0 0-6 6L3 18l3 3 5.7-5.7a4.5 4.5 0 0 0 6-6l-3 3-2.5-.5-.5-2.5z" />
  </Svg>
);

export const IconClock = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

export const IconHistory = (props) => (
  <Svg {...props}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5M12 7v5l3 2" />
  </Svg>
);

export const IconUser = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Svg>
);

export const IconWifi = (props) => (
  <Svg {...props}>
    <path d="M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" />
    <path d="M12 20h.01" />
  </Svg>
);

export const IconWifiOff = (props) => (
  <Svg {...props}>
    <path d="M2 8.8a15 15 0 0 1 6-3.5M14.5 5.4A15 15 0 0 1 22 8.8M5 12.5a10 10 0 0 1 3-2M16 10.6a10 10 0 0 1 3 1.9M8.5 16a5 5 0 0 1 7 0" />
    <path d="M12 20h.01M2 2l20 20" />
  </Svg>
);

export const IconCheck = (props) => (
  <Svg {...props}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);

export const IconFilter = (props) => (
  <Svg {...props}>
    <path d="M22 3H2l8 9.5V19l4 2v-8.5z" />
  </Svg>
);

export const IconArrowUp = (props) => (
  <Svg {...props}>
    <path d="M7 17 17 7M7 7h10v10" />
  </Svg>
);

export const IconLayers = (props) => (
  <Svg {...props}>
    <path d="m12 2 10 5-10 5L2 7z" />
    <path d="m2 12 10 5 10-5M2 17l10 5 10-5" />
  </Svg>
);

export const IconDatabase = (props) => (
  <Svg {...props}>
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12c0 1.7 4 3 9 3s9-1.3 9-3" />
  </Svg>
);

export const IconShield = (props) => (
  <Svg {...props}>
    <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </Svg>
);

export const IconTrash = (props) => (
  <Svg {...props}>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" />
  </Svg>
);
