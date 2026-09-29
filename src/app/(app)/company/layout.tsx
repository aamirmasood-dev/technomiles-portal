import { requireAdmin } from "@/lib/auth";
import { CompanyTabs } from "@/components/company-tabs";

export default async function CompanyLayout({ children }: LayoutProps<"/company">) {
  await requireAdmin();
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Technomiles company accounts</h1>
        <p className="mt-1 text-sm text-gray-500">Books in PKR · visible to administrators only</p>
      </div>
      <CompanyTabs />
      {children}
    </div>
  );
}
