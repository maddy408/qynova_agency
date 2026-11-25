import React from 'react';
import Svg, { Path, Rect, Circle, Line, Polyline, Polygon } from 'react-native-svg';

export function Icon({ name, size = 20, color = '#000', style }) {
  const s = size;
  const strokeWidth = 2;

  const getIcon = () => {
    switch (name) {
      case 'Menu':
      case 'menu':
      case 'hamburger':
        return (
          <>
            <Line x1="3" y1="6" x2="21" y2="6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
            <Line x1="3" y1="12" x2="21" y2="12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
            <Line x1="3" y1="18" x2="21" y2="18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          </>
        );
      case 'Dashboard':
      case 'dashboard':
        return (
          <>
            <Rect x="3" y="3" width="7" height="9" rx="1" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Rect x="14" y="3" width="7" height="5" rx="1" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Rect x="14" y="12" width="7" height="9" rx="1" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Rect x="3" y="16" width="7" height="5" rx="1" stroke={color} strokeWidth={strokeWidth} fill="none" />
          </>
        );
      case 'Billing':
      case 'billing':
      case 'cart':
      case 'pos':
        return (
          <>
            <Circle cx="9" cy="20" r="1" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Circle cx="20" cy="20" r="1" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" stroke={color} strokeWidth={strokeWidth} fill="none" />
          </>
        );
      case 'Catalog':
      case 'catalog':
      case 'box':
      case 'package':
        return (
          <>
            <Path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Polyline points="3.27 6.96 12 12.01 20.73 6.96" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Line x1="12" y1="22.08" x2="12" y2="12" stroke={color} strokeWidth={strokeWidth} />
          </>
        );
      case 'Parties':
      case 'parties':
      case 'users':
      case 'customers':
        return (
          <>
            <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Circle cx="9" cy="7" r="4" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Path d="M16 3.13a4 4 0 0 1 0 7.75" stroke={color} strokeWidth={strokeWidth} fill="none" />
          </>
        );
      case 'Purchasing':
      case 'purchasing':
      case 'truck':
      case 'supplier':
        return (
          <>
            <Rect x="1" y="3" width="15" height="13" rx="2" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Polygon points="16 8 20 8 23 11 23 16 16 16 16 8" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Circle cx="5.5" cy="18.5" r="2.5" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Circle cx="18.5" cy="18.5" r="2.5" stroke={color} strokeWidth={strokeWidth} fill="none" />
          </>
        );
      case 'Orders':
      case 'orders':
      case 'clipboard':
        return (
          <>
            <Path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Rect x="8" y="2" width="8" height="4" rx="1" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Line x1="9" y1="12" x2="15" y2="12" stroke={color} strokeWidth={strokeWidth} />
            <Line x1="9" y1="16" x2="15" y2="16" stroke={color} strokeWidth={strokeWidth} />
          </>
        );
      case 'Inventory':
      case 'inventory':
      case 'store':
      case 'warehouse':
        return (
          <>
            <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Polyline points="9 22 9 12 15 12 15 22" stroke={color} strokeWidth={strokeWidth} fill="none" />
          </>
        );
      case 'Returns':
      case 'returns':
      case 'undo':
        return (
          <>
            <Polyline points="1 4 1 10 7 10" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" stroke={color} strokeWidth={strokeWidth} fill="none" />
          </>
        );
      case 'Invoices':
      case 'invoices':
      case 'receipt':
        return (
          <>
            <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Polyline points="14 2 14 8 20 8" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Line x1="16" y1="13" x2="8" y2="13" stroke={color} strokeWidth={strokeWidth} />
            <Line x1="16" y1="17" x2="8" y2="17" stroke={color} strokeWidth={strokeWidth} />
            <Line x1="10" y1="9" x2="8" y2="9" stroke={color} strokeWidth={strokeWidth} />
          </>
        );
      case 'Collections':
      case 'collections':
      case 'wallet':
        return (
          <>
            <Rect x="1" y="4" width="22" height="16" rx="2" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Line x1="1" y1="10" x2="23" y2="10" stroke={color} strokeWidth={strokeWidth} />
            <Circle cx="16" cy="15" r="1.5" fill={color} />
          </>
        );
      case 'CashHandover':
      case 'cashHandover':
      case 'cash':
      case 'money':
        return (
          <>
            <Rect x="2" y="6" width="20" height="12" rx="2" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Path d="M6 12h.01M18 12h.01" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          </>
        );
      case 'Expenses':
      case 'expenses':
      case 'calculator':
        return (
          <>
            <Rect x="4" y="2" width="16" height="20" rx="2" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Rect x="7" y="5" width="10" height="4" rx="1" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Circle cx="8" cy="13" r="1" fill={color} />
            <Circle cx="12" cy="13" r="1" fill={color} />
            <Circle cx="16" cy="13" r="1" fill={color} />
            <Circle cx="8" cy="17" r="1" fill={color} />
            <Circle cx="12" cy="17" r="1" fill={color} />
            <Circle cx="16" cy="17" r="1" fill={color} />
          </>
        );
      case 'Reports':
      case 'reports':
      case 'chart':
        return (
          <>
            <Line x1="18" y1="20" x2="18" y2="10" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
            <Line x1="12" y1="20" x2="12" y2="4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
            <Line x1="6" y1="20" x2="6" y2="14" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          </>
        );
      case 'Staff':
      case 'staff':
      case 'shield':
        return (
          <>
            <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke={color} strokeWidth={strokeWidth} fill="none" />
          </>
        );
      case 'Settings':
      case 'settings':
      case 'gear':
        return (
          <>
            <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" stroke={color} strokeWidth={strokeWidth} fill="none" />
          </>
        );
      case 'Search':
      case 'search':
        return (
          <>
            <Circle cx="11" cy="11" r="8" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Line x1="21" y1="21" x2="16.65" y2="16.65" stroke={color} strokeWidth={strokeWidth} />
          </>
        );
      case 'Barcode':
      case 'barcode':
        return (
          <>
            <Line x1="3" y1="5" x2="3" y2="19" stroke={color} strokeWidth={strokeWidth} />
            <Line x1="7" y1="5" x2="7" y2="19" stroke={color} strokeWidth={1} />
            <Line x1="10" y1="5" x2="10" y2="19" stroke={color} strokeWidth={2.5} />
            <Line x1="14" y1="5" x2="14" y2="19" stroke={color} strokeWidth={1} />
            <Line x1="17" y1="5" x2="17" y2="19" stroke={color} strokeWidth={2} />
            <Line x1="21" y1="5" x2="21" y2="19" stroke={color} strokeWidth={1.5} />
          </>
        );
      case 'Camera':
      case 'camera':
        return (
          <>
            <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Circle cx="12" cy="13" r="4" stroke={color} strokeWidth={strokeWidth} fill="none" />
          </>
        );
      case 'Plus':
      case 'plus':
      case 'add':
        return (
          <>
            <Line x1="12" y1="5" x2="12" y2="19" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
            <Line x1="5" y1="12" x2="19" y2="12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          </>
        );
      case 'Edit':
      case 'edit':
      case 'pencil':
        return (
          <>
            <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke={color} strokeWidth={strokeWidth} fill="none" />
          </>
        );
      case 'Delete':
      case 'delete':
      case 'trash':
        return (
          <>
            <Polyline points="3 6 5 6 21 6" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Line x1="10" y1="11" x2="10" y2="17" stroke={color} strokeWidth={strokeWidth} />
            <Line x1="14" y1="11" x2="14" y2="17" stroke={color} strokeWidth={strokeWidth} />
          </>
        );
      case 'View':
      case 'view':
      case 'eye':
        return (
          <>
            <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={strokeWidth} fill="none" />
          </>
        );
      case 'EyeOff':
      case 'eyeOff':
      case 'eye-off':
        return (
          <>
            <Path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.68 19.68 0 0 1 4.22-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a19.76 19.76 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Line x1="1" y1="1" x2="23" y2="23" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          </>
        );
      case 'Close':
      case 'close':
      case 'x':
        return (
          <>
            <Line x1="18" y1="6" x2="6" y2="18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
            <Line x1="6" y1="6" x2="18" y2="18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          </>
        );
      case 'Logout':
      case 'logout':
        return (
          <>
            <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Polyline points="16 17 21 12 16 7" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Line x1="21" y1="12" x2="9" y2="12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
          </>
        );
      case 'Print':
      case 'print':
      case 'printer':
        return (
          <>
            <Polyline points="6 9 6 2 18 2 18 9" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Rect x="6" y="14" width="12" height="8" stroke={color} strokeWidth={strokeWidth} fill="none" />
          </>
        );
      case 'Share':
      case 'share':
        return (
          <>
            <Circle cx="18" cy="5" r="3" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Circle cx="6" cy="12" r="3" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Circle cx="18" cy="19" r="3" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Line x1="8.59" y1="13.51" x2="15.42" y2="17.49" stroke={color} strokeWidth={strokeWidth} />
            <Line x1="15.41" y1="6.51" x2="8.59" y2="10.49" stroke={color} strokeWidth={strokeWidth} />
          </>
        );
      case 'Back':
      case 'back':
      case 'chevronLeft':
        return <Polyline points="15 18 9 12 15 6" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
      case 'ChevronRight':
      case 'chevronRight':
      case 'arrowRight':
        return <Polyline points="9 18 15 12 9 6" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
      case 'Check':
      case 'check':
        return <Polyline points="20 6 9 17 4 12" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
      case 'power':
        return (
          <>
            <Path d="M18.36 6.64a9 9 0 1 1-12.73 0" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" />
            <Line x1="12" y1="2" x2="12" y2="12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          </>
        );
      case 'toggleRight':
        return (
          <>
            <Rect x="1" y="5" width="22" height="14" rx="7" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Circle cx="16" cy="12" r="3" stroke={color} strokeWidth={strokeWidth} fill={color} />
          </>
        );
      case 'toggleLeft':
        return (
          <>
            <Rect x="1" y="5" width="22" height="14" rx="7" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Circle cx="8" cy="12" r="3" stroke={color} strokeWidth={strokeWidth} fill="none" />
          </>
        );
      default:
        return <Circle cx="12" cy="12" r="8" stroke={color} strokeWidth={strokeWidth} fill="none" />;
    }
  };

  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" style={style}>
      {getIcon()}
    </Svg>
  );
}
