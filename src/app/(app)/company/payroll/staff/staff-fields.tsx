"use client";

import { useState } from "react";
import { Field } from "@/components/action-form";

type Staff = {
  name: string;
  jobTitle: string | null;
  payType: "SALARY" | "COMMISSION";
  monthlySalary: string;
  commissionRate: string;
  commissionClientId: number | null;
  commissionStoreIds: number[];
  startDate: string | null;
  active: boolean;
  notes: string | null;
};

export function StaffFields({ defaults, clients, stores }: { defaults: Staff; clients: { id: number; name: string }[]; stores: { id: number; clientId: number; name: string; platform: string }[] }) {
  const [payType, setPayType] = useState(defaults.payType);
  const [clientId, setClientId] = useState(defaults.commissionClientId);
  const chosen = new Set(defaults.commissionStoreIds);
  return (
    <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Name" name="name">
        <input id="name" name="name" defaultValue={defaults.name} className="input" required />
      </Field>
      <Field label="Job title" name="jobTitle">
        <input id="jobTitle" name="jobTitle" defaultValue={defaults.jobTitle ?? ""} className="input" />
      </Field>
      <Field label="Paid by" name="payType">
        <select id="payType" name="payType" value={payType} onChange={(e) => setPayType(e.target.value as Staff["payType"])} className="input">
          <option value="SALARY">Fixed monthly salary</option>
          <option value="COMMISSION">Commission on a client&apos;s net sales</option>
        </select>
      </Field>
      <Field label="Start date" name="startDate">
        <input id="startDate" name="startDate" type="date" defaultValue={defaults.startDate ?? ""} className="input" />
      </Field>
      {payType === "SALARY" ? (
        <Field label="Monthly salary (PKR)" name="monthlySalary">
          <input id="monthlySalary" name="monthlySalary" defaultValue={defaults.monthlySalary} inputMode="decimal" className="input" />
        </Field>
      ) : (
        <>
          <Field label="Commission %" name="commissionRate" hint="Of net sales after all expenses of the stores below.">
            <input id="commissionRate" name="commissionRate" defaultValue={defaults.commissionRate} inputMode="decimal" className="input" />
          </Field>
          <Field label="Client" name="commissionClientId">
            <select
              id="commissionClientId"
              name="commissionClientId"
              value={clientId ?? ""}
              onChange={(e) => setClientId(Number(e.target.value) || null)}
              className="input"
            >
              <option value="">Select…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium text-gray-700">Stores the commission is based on</legend>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {stores
                .filter((s) => s.clientId === clientId)
                .map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="commissionStoreIds" value={s.id} defaultChecked={chosen.has(s.id)} /> {s.name}{" "}
                    <span className="text-gray-500">({s.platform})</span>
                  </label>
                ))}
            </div>
          </fieldset>
        </>
      )}
      <div className="sm:col-span-2">
        <Field label="Notes" name="notes">
          <textarea id="notes" name="notes" rows={2} defaultValue={defaults.notes ?? ""} className="input" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={defaults.active} /> Active (included in payroll)
      </label>
    </div>
  );
}
