import {
  CalendarDays,
  Route,
  ClipboardCheck,
  ChartNoAxesCombined,
  MapPin,
  Snowflake,
  LayoutDashboard,
} from "lucide-react";
import type { ReactNode } from "react";
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  const Icon = /plan/i.test(title)
    ? CalendarDays
    : /route/i.test(title)
      ? Route
      : /consult/i.test(title)
        ? ClipboardCheck
        : /dashboard/i.test(title)
          ? ChartNoAxesCombined
          : /mapping/i.test(title)
            ? MapPin
            : /cold/i.test(title)
              ? Snowflake
              : LayoutDashboard;
  return (
    <header className="page-heading">
      <div>
        <p className="page-eyebrow">WORKSPACE</p>
        <h1 className="flex items-center gap-3">
          <span className="page-icon">
            <Icon aria-hidden="true" size={23} />
          </span>
          {title}
        </h1>
        <p className="page-description">{description}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
